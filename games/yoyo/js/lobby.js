// E1 + E7: lobby WebSocket — profiles/sign-in UX, tables, Sit/Join, options, chat, Start.
import {
  LOBBY_WS,
  loadIdentity,
  saveIdentity,
  beginLogin,
  clearSession,
  isSignOutGate,
  clearSignOutGate,
  listProfiles,
  lastUsedProfile,
  forgetProfile,
  migrateLegacyProfiles,
  cachePrefs,
  applyHandSortLocal,
  handSort,
  loadPrefsCache,
  displayTableName,
  SS,
} from './config.js';
import { OPT, hasOpt, optsPills, optsToTokens, defaultHandLength } from './opts.js';
import { RANK_PACKS, normalizeRankPack, packRoles } from './ranks.js';

const $ = (id) => document.getElementById(id);
const STATUS_WAITING = 0;
const STATUS_PLAYING = 1;

/** @type {WebSocket|null} */
let ws = null;
let intentionalClose = false;
/** True after server `duplicate_login` — do not auto-reconnect (stops takeover fight). */
let takenOver = false;
let reconnectTimer = null;
let authenticated = false;
/** @type {string} preferred name from server / session */
let me = '';
/** @type {Map<string, object>} table id → L1G */
const tables = new Map();
/** @type {Map<string, string>} name → last_seen */
const online = new Map();
/** gear popover open per table id */
const optsOpen = new Set();
/** invite panel open per private table id */
const inviteOpen = new Set();
/** debounce timers for live Options */
const optsDebounce = new Map();

/** 'hidden' | 'first' | 'create' | 'gate' | 'manage' | 'display' */
let authPanel = 'hidden';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function ukey(n) {
  return String(n || '').trim().toLowerCase();
}

function setStatus(text, kind = '') {
  const el = $('conn-status');
  if (!el) return;
  el.textContent = text;
  el.className = 'conn-status' + (kind ? ` ${kind}` : '');
}

function setBanner(text, kind = 'info') {
  const el = $('demo-banner');
  if (!el) return;
  if (!text) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.textContent = text;
  el.className = 'demo-banner' + (kind === 'err' ? ' err' : kind === 'ok' ? ' ok' : '');
}

// Drop pending auto-reconnect.
function clearReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

// Server booted this tab for the same username (other device/tab won).
function handleTakenOver() {
  takenOver = true;
  clearReconnect();
  authenticated = false;
  setStatus('signed in elsewhere', 'err');
  setBanner(
    'Signed in on another device. This tab was disconnected. Choose Continue as… to play here.',
    'err',
  );
  tables.clear();
  online.clear();
  renderTables();
  renderOnline();
  // Soft gate: keep session/profiles so Continue chip reclaims last-wins.
  if (listProfiles().length) {
    authPanel = 'gate';
  } else {
    authPanel = 'first';
    const id = loadIdentity();
    const u = $('in-user');
    const e = $('in-email');
    if (u) u.value = id.username || me || '';
    if (e) e.value = id.email || '';
  }
  renderHeader();
}

function send(obj) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify(obj));
  return true;
}

// CONNECTING or OPEN — avoid double connect / reconnect storm.
function isLiveWs() {
  return (
    !!ws &&
    (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)
  );
}

function isSignedInUi() {
  return authenticated || (!!me && isLiveWs());
}

function goPlay(tableId, seat, { draw = false } = {}) {
  sessionStorage.setItem(SS.table, tableId);
  sessionStorage.setItem(SS.seat, String(seat));
  const q = new URLSearchParams({ table: tableId, seat: String(seat) });
  if (draw) q.set('draw', '1');
  const wsQ = new URLSearchParams(location.search).get('ws');
  if (wsQ) q.set('ws', wsQ);
  location.href = `play.html?${q}`;
}

// ——— Auth panels & profile menu ———

function closeProfileMenu() {
  const menu = $('profile-menu');
  const btn = $('btn-profile');
  if (menu) menu.hidden = true;
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function toggleProfileMenu() {
  if (!isSignedInUi()) return;
  const menu = $('profile-menu');
  if (!menu) return;
  const open = menu.hidden;
  if (open) {
    buildProfileMenu();
    menu.hidden = false;
    $('btn-profile')?.setAttribute('aria-expanded', 'true');
  } else {
    closeProfileMenu();
  }
}

function buildProfileMenu() {
  const menu = $('profile-menu');
  if (!menu) return;
  menu.replaceChildren();

  const cur = document.createElement('div');
  cur.className = 'menu-current';
  cur.innerHTML = `Signed in as <b>${escapeHtml(me)}</b>`;
  menu.appendChild(cur);

  const profiles = listProfiles().filter((p) => ukey(p.username) !== ukey(me));
  if (profiles.length) {
    const lab = document.createElement('div');
    lab.className = 'menu-label';
    lab.textContent = 'Switch to';
    menu.appendChild(lab);
    for (const p of profiles) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'menu-item';
      b.setAttribute('role', 'menuitem');
      b.textContent = p.email ? `${p.username} · ${p.email}` : p.username;
      b.addEventListener('click', () => {
        closeProfileMenu();
        loginAs(p.username, p.email);
      });
      menu.appendChild(b);
    }
  }

  const sep1 = document.createElement('div');
  sep1.className = 'menu-sep';
  menu.appendChild(sep1);

  const create = document.createElement('button');
  create.type = 'button';
  create.className = 'menu-item';
  create.setAttribute('role', 'menuitem');
  create.textContent = 'Create new profile…';
  create.addEventListener('click', () => {
    closeProfileMenu();
    openCreateForm();
  });
  menu.appendChild(create);

  const manage = document.createElement('button');
  manage.type = 'button';
  manage.className = 'menu-item';
  manage.setAttribute('role', 'menuitem');
  manage.textContent = 'Manage profiles…';
  manage.addEventListener('click', () => {
    closeProfileMenu();
    openManagePanel();
  });
  menu.appendChild(manage);

  const display = document.createElement('button');
  display.type = 'button';
  display.className = 'menu-item';
  display.setAttribute('role', 'menuitem');
  display.textContent = 'Display…';
  display.addEventListener('click', () => {
    closeProfileMenu();
    openDisplayPanel();
  });
  menu.appendChild(display);

  const sep2 = document.createElement('div');
  sep2.className = 'menu-sep';
  menu.appendChild(sep2);

  const out = document.createElement('button');
  out.type = 'button';
  out.className = 'menu-item danger';
  out.setAttribute('role', 'menuitem');
  out.textContent = 'Sign out';
  out.addEventListener('click', () => {
    closeProfileMenu();
    doSignOut();
  });
  menu.appendChild(out);
}

function openCreateForm() {
  authPanel = 'create';
  $('in-user').value = '';
  $('in-email').value = '';
  renderAuthUi();
  $('in-user').focus();
}

function openFirstVisitForm() {
  authPanel = 'first';
  renderAuthUi();
  $('in-user').focus();
}

function openGate() {
  authPanel = 'gate';
  renderAuthUi();
}

function openManagePanel() {
  authPanel = 'manage';
  renderManageList();
  renderAuthUi();
}

function closeManagePanel() {
  if (authPanel === 'manage' || authPanel === 'display') {
    if (isSignedInUi()) authPanel = 'hidden';
    else if (listProfiles().length) authPanel = 'gate';
    else authPanel = 'first';
  }
  renderAuthUi();
}

function openDisplayPanel() {
  authPanel = 'display';
  syncDisplayPanel();
  renderAuthUi();
}

function syncDisplayPanel() {
  const sort = handSort();
  const desc = $('pref-hand-desc');
  const asc = $('pref-hand-asc');
  if (desc) desc.checked = sort === 'desc';
  if (asc) asc.checked = sort === 'asc';
}

function setHandSortFromUi(sort) {
  if (!applyHandSortLocal(sort)) {
    syncDisplayPanel();
    return;
  }
  syncDisplayPanel();
  // Only send when changed (applyHandSortLocal already checked).
  send({ action: 'setprefs', prefs: { hand_sort: sort === 'asc' ? 'asc' : 'desc' } });
}

function renderManageList() {
  const ul = $('manage-list');
  if (!ul) return;
  const list = listProfiles();
  if (!list.length) {
    ul.innerHTML = '<li class="hint">No saved profiles on this browser.</li>';
    return;
  }
  ul.replaceChildren(
    ...list.map((p) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'mp-name';
      name.textContent = p.username;
      const email = document.createElement('span');
      email.className = 'mp-email';
      email.textContent = p.email || '—';
      const forget = document.createElement('button');
      forget.type = 'button';
      forget.className = 'mp-forget danger';
      forget.textContent = 'Forget';
      forget.addEventListener('click', () => {
        if (!confirm(`Remove “${p.username}” from this browser?`)) return;
        const wasMe = me && ukey(p.username) === ukey(me);
        forgetProfile(p.username);
        if (wasMe && isSignedInUi()) {
          doSignOut();
          return;
        }
        renderManageList();
        renderContinueChips();
        renderAuthUi();
      });
      li.append(name, email, forget);
      return li;
    }),
  );
}

function renderContinueChips() {
  const root = $('continue-chips');
  if (!root) return;
  const list = listProfiles().slice().sort((a, b) => b.lastUsed - a.lastUsed);
  if (!list.length) {
    root.innerHTML = '';
    return;
  }
  root.replaceChildren(
    ...list.map((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip-profile';
      b.innerHTML = `<span class="chip-name">${escapeHtml(p.username)}</span>${
        p.email ? `<span class="chip-email">${escapeHtml(p.email)}</span>` : ''
      }`;
      b.addEventListener('click', () => loginAs(p.username, p.email));
      return b;
    }),
  );
}

/**
 * Decide which auth panel to show and refresh header chrome.
 */
function renderAuthUi() {
  const live = isSignedInUi();
  const profiles = listProfiles();
  const loginBar = $('login-bar');
  const gate = $('continue-gate');
  const manage = $('manage-panel');
  const title = $('login-title');
  const hint = $('login-hint');
  const btnLogin = $('btn-login');
  const btnCancel = $('btn-login-cancel');
  const hdr = $('hdr-you');
  const caret = $('profile-caret');
  const btnProfile = $('btn-profile');

  // While signed in / connecting, only manage / create / display overlays may show.
  if (live && authPanel !== 'create' && authPanel !== 'manage' && authPanel !== 'display') {
    authPanel = 'hidden';
  }
  // No profiles and not signed in → first visit form.
  if (!live && !profiles.length && authPanel !== 'create') {
    authPanel = 'first';
  }
  // Sign-out gate with profiles.
  if (!live && isSignOutGate() && profiles.length && authPanel === 'hidden') {
    authPanel = 'gate';
  }

  const showLogin = authPanel === 'first' || authPanel === 'create';
  const showGate = authPanel === 'gate';
  const showManage = authPanel === 'manage';
  const showDisplay = authPanel === 'display';
  const display = $('display-panel');

  if (loginBar) loginBar.hidden = !showLogin;
  if (gate) gate.hidden = !showGate;
  if (manage) manage.hidden = !showManage;
  if (display) display.hidden = !showDisplay;
  if (showDisplay) syncDisplayPanel();

  if (showLogin) {
    const isCreate = authPanel === 'create' || (profiles.length > 0 && authPanel !== 'first');
    if (title) {
      title.textContent = isCreate && profiles.length ? 'Create new profile' : 'Join the lobby';
    }
    if (hint) {
      hint.textContent = isCreate && profiles.length
        ? 'Add another display name on this browser.'
        : 'Choose a display name. Optional email locks the name to you.';
    }
    if (btnLogin) {
      btnLogin.textContent = isCreate && profiles.length ? 'Create & enter' : 'Enter lobby';
      btnLogin.disabled = live && authPanel !== 'create';
    }
    if (btnCancel) {
      // Cancel when leaving create overlay (signed in or back to gate).
      btnCancel.hidden = authPanel === 'first' && !profiles.length;
      if (authPanel === 'create' || (showLogin && profiles.length)) {
        btnCancel.hidden = false;
      }
      if (authPanel === 'first' && !profiles.length) btnCancel.hidden = true;
    }
  }

  if (showGate) {
    const gateLabel = document.querySelector('.continue-label');
    if (gateLabel) {
      gateLabel.textContent = takenOver
        ? 'Signed in elsewhere — continue as'
        : 'Continue as';
    }
    renderContinueChips();
  }

  if (hdr) {
    if (me) {
      hdr.innerHTML = `<b>${escapeHtml(me)}</b>`;
    } else {
      hdr.textContent = 'not signed in';
    }
  }
  if (caret) caret.hidden = !live;
  if (btnProfile) {
    btnProfile.disabled = !live;
    btnProfile.title = live ? 'Profile menu' : 'Sign in to manage profile';
    if (!live) closeProfileMenu();
  }

  if (!showLogin && !showGate && !showManage && !live) {
    // Idle unsigned (e.g. connecting failed without gate) — leave banner alone
  }

  $('btn-create').disabled = !authenticated;
  const chatOn = authenticated;
  $('chat-text').disabled = !chatOn;
  $('chat-form').querySelector('button').disabled = !chatOn;
}

function renderHeader() {
  renderAuthUi();
}

// ——— render tables / online ———

function mySeatAt(tableId) {
  const t = tables.get(tableId);
  if (!t || !me) return 0;
  const i = (t.seats || []).findIndex((s) => s && ukey(s) === ukey(me));
  return i >= 0 ? i + 1 : 0;
}

/** Private tables use owner username as id; open tables are OpenN (wire). */
function isPrivateTable(tableId) {
  return !/^Open/i.test(String(tableId || ''));
}

/** Session robots are labeled B.Name (server bot_names). */
function isBotSeatName(name) {
  return /^B\./.test(String(name || ''));
}

function isPrivateOwner(tableId) {
  return !!(me && isPrivateTable(tableId) && ukey(tableId) === ukey(me));
}

function seatSlot(tableId, t, i) {
  const name = t.seats?.[i] ?? null;
  const last = t.last?.[i] ?? null;
  const waiting = t.status === STATUS_WAITING;
  const slot = document.createElement('div');
  slot.className = 'seat-slot' + (name ? ' filled' : '');
  if (name) {
    if (isBotSeatName(name)) slot.classList.add('bot');
    else slot.classList.add('human');
  }
  if (name && me && ukey(name) === ukey(me)) slot.classList.add('mine');

  const n = document.createElement('span');
  n.className = 'seat-n';
  n.textContent = `Seat ${i + 1}`;
  slot.appendChild(n);

  if (name) {
    const nm = document.createElement('span');
    nm.className = 'name';
    nm.textContent = name;
    if (!isBotSeatName(name)) nm.title = 'Human player';
    slot.appendChild(nm);
    if (waiting && me && ukey(name) === ukey(me)) {
      const leave = document.createElement('button');
      leave.type = 'button';
      leave.textContent = 'Leave';
      leave.addEventListener('click', () => send({ action: 'leave' }));
      slot.appendChild(leave);
    }
  } else {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.disabled = !authenticated;
    if (waiting) {
      btn.textContent = 'Sit';
      btn.title = 'Sit at this seat';
      btn.addEventListener('click', () => {
        if (!authenticated) return;
        send({ action: 'sitat', table: tableId, seat: i + 1 });
      });
    } else {
      btn.textContent = 'Join';
      btn.title = 'Join in-progress seat (play page)';
      btn.addEventListener('click', () => {
        if (!authenticated) return;
        goPlay(tableId, i + 1);
      });
    }
    slot.appendChild(btn);
    if (!waiting && last) {
      const ln = document.createElement('span');
      ln.className = 'last-name';
      ln.textContent = last;
      ln.title = 'Last human at this seat';
      if (me && ukey(last) === ukey(me)) ln.classList.add('yours');
      slot.appendChild(ln);
    }
  }
  return slot;
}

function readOptsFromPopover(pop) {
  const n = +pop.querySelector('[data-f="n"]').value || 4;
  const auto = !!pop.querySelector('[data-f="hl-auto"]')?.checked;
  let hl = 0;
  if (!auto) {
    hl = +pop.querySelector('[data-f="hl"]').value || 12;
    hl = Math.max(8, Math.min(18, hl));
  }
  let bits = 0;
  if (pop.querySelector('[data-f="seq5"]').checked) bits |= OPT.SEQ5;
  if (pop.querySelector('[data-f="jokers"]').checked) bits |= OPT.JOKERS;
  if (pop.querySelector('[data-f="exch2"]').checked) bits |= OPT.EXCH2;
  if (pop.querySelector('[data-f="cont"]').checked) bits |= OPT.CONT;
  if (pop.querySelector('[data-f="high"]:checked')?.value === '2') bits |= OPT.TWO_HIGH;
  if ((bits & OPT.EXCH2) && n < 5) bits &= ~OPT.EXCH2;
  const rank_pack = normalizeRankPack(pop.querySelector('[data-f="rank_pack"]:checked')?.value);
  return { n, hl, bits, rank_pack };
}

function sendTableOptions(tableId, pop) {
  const { n, hl, bits, rank_pack } = readOptsFromPopover(pop);
  send({
    action: 'options',
    table: tableId,
    n,
    hl,
    opts: optsToTokens(bits),
    rank_pack,
  });
}

function scheduleOptions(tableId, pop) {
  const prev = optsDebounce.get(tableId);
  if (prev) clearTimeout(prev);
  optsDebounce.set(
    tableId,
    setTimeout(() => {
      optsDebounce.delete(tableId);
      sendTableOptions(tableId, pop);
    }, 180),
  );
}

function syncExch2Enabled(pop) {
  const n = +pop.querySelector('[data-f="n"]').value || 4;
  const exch = pop.querySelector('[data-f="exch2"]');
  if (!exch) return;
  exch.disabled = n < 5;
  if (n < 5) exch.checked = false;
}

function updateHlUi(pop) {
  const auto = !!pop.querySelector('[data-f="hl-auto"]')?.checked;
  const manual = pop.querySelector('[data-hl-manual]');
  const hint = pop.querySelector('[data-hl-hint]');
  const n = +pop.querySelector('[data-f="n"]').value || 4;
  const jokers = !!pop.querySelector('[data-f="jokers"]')?.checked;
  if (manual) manual.hidden = auto;
  if (hint) {
    if (auto) {
      const resolved = defaultHandLength(n, jokers);
      hint.textContent = `Uses ${resolved} cards for ${n} players`;
      hint.hidden = false;
    } else {
      hint.hidden = true;
    }
  }
}

// Escape CSS attr values for querySelector (table ids are usually simple).
function cssAttr(s) {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : String(s).replace(/"/g, '\\"');
}

// Drop body-ported table popovers (before re-render or close).
function clearBodyTablePopovers() {
  document
    .querySelectorAll('.opts-popover[data-portal], .invite-panel[data-portal]')
    .forEach((el) => el.remove());
}

// Fixed to viewport; pop must live under body (not under backdrop-filter panels).
function placeFixedPopover(anchor, pop, pad = 4) {
  if (!anchor || !pop) return;
  pop.style.position = 'fixed';
  pop.style.right = 'auto';
  pop.style.bottom = 'auto';
  pop.style.left = '0px';
  pop.style.top = '0px';
  const ar = anchor.getBoundingClientRect();
  const pr = pop.getBoundingClientRect();
  let top = ar.bottom + pad;
  if (top + pr.height > window.innerHeight - 8) {
    top = Math.max(8, ar.top - pr.height - pad);
  }
  let left = ar.left;
  if (left + pr.width > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - pr.width - 8);
  }
  if (left < 8) left = 8;
  pop.style.top = `${Math.round(top)}px`;
  pop.style.left = `${Math.round(left)}px`;
}

// Reposition already-mounted body popovers (scroll / resize).
function placeOpenTablePopovers() {
  document.querySelectorAll('.opts-popover[data-portal]').forEach((pop) => {
    const id = pop.dataset.table;
    const anchor = document.querySelector(
      `.table-gear[data-table="${cssAttr(id)}"] .gear-btn`,
    );
    placeFixedPopover(anchor, pop);
  });
  document.querySelectorAll('.invite-panel[data-portal]').forEach((pop) => {
    const id = pop.dataset.table;
    const row = document.querySelector(`.invite-row[data-table="${cssAttr(id)}"]`);
    const anchor = row?.querySelector('.invite-summary-btn') || row;
    placeFixedPopover(anchor, pop);
  });
}

// Build open popovers on document.body so they are not clipped / mis-fixed.
function mountOpenTablePopovers() {
  clearBodyTablePopovers();
  for (const tableId of optsOpen) {
    const t = tables.get(tableId);
    if (!t) continue;
    const anchor = document.querySelector(
      `.table-gear[data-table="${cssAttr(tableId)}"] .gear-btn`,
    );
    if (!anchor) continue;
    const pop = renderOptsPopover(tableId, t);
    pop.dataset.portal = '1';
    pop.dataset.table = tableId;
    document.body.appendChild(pop);
    placeFixedPopover(anchor, pop);
  }
  for (const tableId of inviteOpen) {
    const t = tables.get(tableId);
    if (!t) continue;
    const row = document.querySelector(`.invite-row[data-table="${cssAttr(tableId)}"]`);
    const anchor = row?.querySelector('.invite-summary-btn') || row;
    if (!anchor) continue;
    const pop = renderInvitePanel(tableId, t);
    pop.dataset.portal = '1';
    pop.dataset.table = tableId;
    document.body.appendChild(pop);
    placeFixedPopover(anchor, pop);
  }
}

function renderOptsPopover(tableId, t) {
  const wrap = document.createElement('div');
  wrap.className = 'opts-popover';
  wrap.dataset.table = tableId;
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-label', 'Table options');

  const n = t.n || 4;
  const auto = !(t.hl > 0);
  const hlManual = t.hl > 0 ? t.hl : defaultHandLength(n, hasOpt(t.opts | 0, OPT.JOKERS));
  const o = t.opts | 0;
  const twoHigh = hasOpt(o, OPT.TWO_HIGH);
  const pack = normalizeRankPack(t.rank_pack);
  const tid = escapeHtml(tableId);
  const packSeg = Object.entries(RANK_PACKS)
    .map(
      ([id, meta]) =>
        `<label class="seg-opt"><input data-f="rank_pack" type="radio" name="rp-${tid}" value="${id}"${
          pack === id ? ' checked' : ''
        }/> ${escapeHtml(meta.label)}</label>`,
    )
    .join('');
  const packPreview = packRoles(pack).join(' · ');

  wrap.innerHTML = `
    <div class="opts-row">
      <span class="opts-label">Players</span>
      <div class="stepper" data-step="n">
        <button type="button" data-dec aria-label="Fewer players">−</button>
        <input data-f="n" type="hidden" value="${n}" />
        <span class="stepper-val" data-n-val>${n}</span>
        <button type="button" data-inc aria-label="More players">+</button>
      </div>
    </div>
    <div class="opts-row">
      <span class="opts-label">Hand size</span>
      <label class="chk hl-auto-chk"><input data-f="hl-auto" type="checkbox"${auto ? ' checked' : ''}/> Auto</label>
    </div>
    <div class="opts-row" data-hl-manual${auto ? ' hidden' : ''}>
      <label class="opts-label" for="hl-${tid}">Cards</label>
      <input id="hl-${tid}" data-f="hl" type="number" min="8" max="18" value="${hlManual}" />
    </div>
    <p class="opts-hint" data-hl-hint></p>
    <label class="chk"><input data-f="seq5" type="checkbox"${hasOpt(o, OPT.SEQ5) ? ' checked' : ''}/> Straight of 5</label>
    <label class="chk"><input data-f="jokers" type="checkbox"${hasOpt(o, OPT.JOKERS) ? ' checked' : ''}/> Jokers</label>
    <label class="chk"><input data-f="exch2" type="checkbox"${hasOpt(o, OPT.EXCH2) ? ' checked' : ''}${n < 5 ? ' disabled' : ''}/> Exchange 2+1</label>
    <label class="chk"><input data-f="cont" type="checkbox"${hasOpt(o, OPT.CONT) ? ' checked' : ''}/> Continue until pass</label>
    <div class="opts-row opts-high">
      <span class="opts-label">High card</span>
      <div class="seg" role="group" aria-label="High card">
        <label class="seg-opt"><input data-f="high" type="radio" name="high-${tid}" value="A"${!twoHigh ? ' checked' : ''}/> Ace ↑</label>
        <label class="seg-opt"><input data-f="high" type="radio" name="high-${tid}" value="2"${twoHigh ? ' checked' : ''}/> 2 ↑</label>
      </div>
    </div>
    <div class="opts-row opts-rank-pack">
      <span class="opts-label">Titles</span>
      <div class="seg" role="group" aria-label="Rank titles">${packSeg}</div>
    </div>
    <p class="opts-hint" data-rank-preview>${escapeHtml(packPreview)}</p>
  `;

  const nInput = wrap.querySelector('[data-f="n"]');
  const nVal = wrap.querySelector('[data-n-val]');
  const setN = (nn) => {
    const v = Math.max(3, Math.min(6, nn));
    nInput.value = String(v);
    nVal.textContent = String(v);
    syncExch2Enabled(wrap);
    updateHlUi(wrap);
    scheduleOptions(tableId, wrap);
  };
  wrap.querySelector('[data-dec]').addEventListener('click', () => setN(+nInput.value - 1));
  wrap.querySelector('[data-inc]').addEventListener('click', () => setN(+nInput.value + 1));

  const hlAuto = wrap.querySelector('[data-f="hl-auto"]');
  hlAuto.addEventListener('change', () => {
    if (!hlAuto.checked) {
      const nn = +nInput.value || 4;
      const jokers = !!wrap.querySelector('[data-f="jokers"]')?.checked;
      const inp = wrap.querySelector('[data-f="hl"]');
      if (inp && !(+inp.value > 0)) inp.value = String(defaultHandLength(nn, jokers));
    }
    updateHlUi(wrap);
    scheduleOptions(tableId, wrap);
  });

  wrap.querySelector('[data-f="hl"]').addEventListener('change', () => scheduleOptions(tableId, wrap));
  wrap.querySelector('[data-f="hl"]').addEventListener('input', () => scheduleOptions(tableId, wrap));

  for (const sel of wrap.querySelectorAll('input[type="checkbox"], input[type="radio"]')) {
    if (sel === hlAuto) continue;
    sel.addEventListener('change', () => {
      syncExch2Enabled(wrap);
      updateHlUi(wrap);
      const rp = wrap.querySelector('[data-f="rank_pack"]:checked')?.value;
      const prev = wrap.querySelector('[data-rank-preview]');
      if (prev && rp) prev.textContent = packRoles(rp).join(' · ');
      scheduleOptions(tableId, wrap);
    });
  }

  updateHlUi(wrap);
  wrap.addEventListener('click', (e) => e.stopPropagation());
  return wrap;
}

function renderOptPills(t) {
  const el = document.createElement('span');
  el.className = 'opt-pills';
  // Auto (hl 0) → no cards pill
  const hl = t.hl > 0 ? t.hl : null;
  for (const p of optsPills(t.opts | 0, hl)) {
    const chip = document.createElement('span');
    chip.className = 'opt-pill' + (p.kind ? ` opt-pill-${p.kind}` : '');
    chip.textContent = p.text;
    el.appendChild(chip);
  }
  return el;
}

function tableHasSeatedHumans(t) {
  return (t.seats || []).some((s) => !!s);
}

/** Private owner trash: confirm only if a live session still has humans seated. */
function privateDeleteBtn(tableId, t, waiting) {
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'icon-btn danger trash-btn';
  del.textContent = '🗑';
  const occupied = tableHasSeatedHumans(t);
  del.title = waiting
    ? 'Delete private table'
    : occupied
      ? 'Delete private game (players return to lobby)'
      : 'Delete empty private game';
  del.setAttribute('aria-label', del.title);
  del.addEventListener('click', () => {
    // Confirm only when Playing with someone still seated (would kick them).
    // Empty paused / all bots left / waiting → no confirm.
    if (!waiting && occupied) {
      if (!confirm('Delete this game? Players will be sent to the lobby.')) return;
    }
    send({ action: 'gkill', table: tableId });
  });
  return del;
}

function renderStatusCluster(tableId, t, waiting, mine, privateTable, privateOwner) {
  const cluster = document.createElement('div');
  cluster.className = 'status-cluster';

  const status = document.createElement('span');
  status.className = 'status' + (waiting ? '' : ' live');

  if (!waiting) {
    // Empty in-progress (everyone left) is still status Playing until idle kill / Stop.
    status.textContent = tableHasSeatedHumans(t) ? 'Playing…' : 'Paused…';
    cluster.appendChild(status);
    if (privateOwner) {
      const stop = document.createElement('button');
      stop.type = 'button';
      stop.className = 'primary stop-btn';
      stop.textContent = '■ Stop';
      stop.title = 'End game and open a fresh table (same options & invites)';
      stop.setAttribute('aria-label', stop.title);
      stop.addEventListener('click', () => {
        send({ action: 'stop', table: tableId });
      });
      cluster.appendChild(stop);
      cluster.appendChild(privateDeleteBtn(tableId, t, waiting));
    }
    return cluster;
  }

  // Waiting
  if (privateTable && !privateOwner) {
    const ownerName = tableId;
    const short =
      ownerName.length > 14 ? `${ownerName.slice(0, 12)}…` : ownerName;
    status.textContent = `Waiting for ${short}…`;
    status.title = `Waiting for ${ownerName} to start`;
    cluster.appendChild(status);
    return cluster;
  }

  // Open (any seated) or private owner
  const canStartRole = !privateTable || privateOwner;
  if (canStartRole) {
    status.textContent = 'Waiting';
    cluster.appendChild(status);

    const start = document.createElement('button');
    start.type = 'button';
    start.className = 'primary start-btn';
    if (!authenticated) {
      start.textContent = '▶ Start';
      start.disabled = true;
      start.classList.add('start-idle');
      start.title = 'Sign in to start';
    } else if (!mine) {
      start.textContent = 'Sit to start';
      start.disabled = true;
      start.classList.add('start-idle');
      start.title = 'Sit at a seat first';
    } else {
      start.textContent = '▶ Start';
      start.disabled = false;
      start.classList.add('start-ready');
      start.title = 'Start session';
      start.addEventListener('click', () => send({ action: 'start' }));
    }
    cluster.appendChild(start);

    if (privateOwner) cluster.appendChild(privateDeleteBtn(tableId, t, waiting));
  } else {
    status.textContent = 'Waiting';
    cluster.appendChild(status);
  }
  return cluster;
}

// ——— private invites (E7b.4) ———

function invitedList(t) {
  return Array.isArray(t?.invited) ? t.invited.filter((n) => String(n || '').trim()) : [];
}

function formatInviteNames(names, maxLen = 48) {
  if (!names.length) return '';
  const full = names.join(', ');
  if (full.length <= maxLen) return full;
  let s = '';
  for (const n of names) {
    const next = s ? `${s}, ${n}` : n;
    if (next.length > maxLen - 1) {
      return `${s || n.slice(0, Math.max(1, maxLen - 1))}…`;
    }
    s = next;
  }
  return s;
}

function nameInList(list, name) {
  const k = ukey(name);
  return (list || []).some((n) => ukey(n) === k);
}

function sendInviteList(list) {
  send({ action: 'invite', list: [...list] });
}

/** Ensure friends are on the invited ACL (owner open panel / soft sync). */
function mergeFriendsIntoInvited(t) {
  const friends = loadPrefsCache().friends || [];
  if (!friends.length) return;
  const inv = [...invitedList(t)];
  let changed = false;
  for (const f of friends) {
    if (me && ukey(f) === ukey(me)) continue;
    if (!nameInList(inv, f)) {
      inv.push(f);
      changed = true;
    }
  }
  if (changed) sendInviteList(inv);
}

function addToInvited(t, name, asFriend) {
  const n = String(name || '').trim();
  if (!n || (me && ukey(n) === ukey(me))) return;
  const inv = [...invitedList(t)];
  if (!nameInList(inv, n)) inv.push(n);
  sendInviteList(inv);
  if (asFriend) {
    const friends = [...(loadPrefsCache().friends || [])];
    if (!nameInList(friends, n)) {
      friends.push(n);
      send({ action: 'setprefs', prefs: { friends } });
      // Optimistic local cache until Prefs echo
      cachePrefs({ ...loadPrefsCache(), friends }, me);
    }
  }
}

function removeFromInvited(t, name) {
  const inv = invitedList(t).filter((n) => ukey(n) !== ukey(name));
  sendInviteList(inv);
}

function forgetRecent(name) {
  const recent = (loadPrefsCache().recent_invitees || []).filter((n) => ukey(n) !== ukey(name));
  send({ action: 'setprefs', prefs: { recent_invitees: recent } });
  cachePrefs({ ...loadPrefsCache(), recent_invitees: recent }, me);
}

function removeFriend(name) {
  const friends = (loadPrefsCache().friends || []).filter((n) => ukey(n) !== ukey(name));
  send({ action: 'setprefs', prefs: { friends } });
  cachePrefs({ ...loadPrefsCache(), friends }, me);
}

function renderInvitePanel(tableId, t) {
  const wrap = document.createElement('div');
  wrap.className = 'invite-panel';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-label', 'Invite players');
  wrap.addEventListener('click', (e) => e.stopPropagation());

  const inv = invitedList(t);
  const prefs = loadPrefsCache();
  const friends = prefs.friends || [];
  const recent = prefs.recent_invitees || [];
  const seated = new Set(
    (t.seats || []).filter(Boolean).map((s) => ukey(s)),
  );

  const section = (title, child) => {
    const sec = document.createElement('div');
    sec.className = 'invite-section';
    const lab = document.createElement('div');
    lab.className = 'invite-sec-label';
    lab.textContent = title;
    sec.appendChild(lab);
    sec.appendChild(child);
    return sec;
  };

  // Current invited
  const cur = document.createElement('div');
  cur.className = 'invite-chips';
  if (!inv.length) {
    const empty = document.createElement('span');
    empty.className = 'invite-empty';
    empty.textContent = 'No one invited yet';
    cur.appendChild(empty);
  } else {
    for (const name of inv) {
      const chip = document.createElement('span');
      chip.className = 'invite-chip';
      const isFriend = nameInList(friends, name);
      chip.innerHTML = `${escapeHtml(name)}${isFriend ? ' ★' : ''}`;
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'invite-x';
      x.textContent = '×';
      x.title = 'Remove invite';
      x.addEventListener('click', () => removeFromInvited(t, name));
      chip.appendChild(x);
      cur.appendChild(chip);
    }
  }
  wrap.appendChild(section(`Invited (${inv.length})`, cur));

  // Online
  const onlineHost = document.createElement('div');
  onlineHost.className = 'invite-chips';
  const onlineNames = [...online.keys()]
    .filter((n) => ukey(n) !== ukey(me))
    .filter((n) => !nameInList(inv, n))
    .sort((a, b) => a.localeCompare(b));
  if (!onlineNames.length) {
    const empty = document.createElement('span');
    empty.className = 'invite-empty';
    empty.textContent = 'No other players online';
    onlineHost.appendChild(empty);
  } else {
    for (const name of onlineNames) {
      const row = document.createElement('span');
      row.className = 'invite-add-row';
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'chip';
      add.textContent = `+ ${name}`;
      add.title = seated.has(ukey(name)) ? 'Already seated — invite for rejoin ACL' : 'Invite';
      add.addEventListener('click', () => addToInvited(t, name, false));
      const star = document.createElement('button');
      star.type = 'button';
      star.className = 'icon-btn invite-star';
      star.textContent = '★';
      star.title = 'Invite and make friend (always invited)';
      star.addEventListener('click', () => addToInvited(t, name, true));
      row.appendChild(add);
      row.appendChild(star);
      onlineHost.appendChild(row);
    }
  }
  wrap.appendChild(section('Online', onlineHost));

  // Friends
  const frHost = document.createElement('div');
  frHost.className = 'invite-chips';
  if (!friends.length) {
    const empty = document.createElement('span');
    empty.className = 'invite-empty';
    empty.textContent = 'No friends yet — use ★ when inviting';
    frHost.appendChild(empty);
  } else {
    for (const name of friends) {
      const chip = document.createElement('span');
      chip.className = 'invite-chip friend';
      chip.appendChild(document.createTextNode(name));
      if (!nameInList(inv, name)) {
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'invite-mini';
        add.textContent = '+';
        add.title = 'Invite now';
        add.addEventListener('click', () => addToInvited(t, name, false));
        chip.appendChild(add);
      }
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'invite-x';
      x.textContent = '×';
      x.title = 'Unfriend';
      x.addEventListener('click', () => removeFriend(name));
      chip.appendChild(x);
      frHost.appendChild(chip);
    }
  }
  wrap.appendChild(section('Friends (auto-invited)', frHost));

  // Recent
  const recentHost = document.createElement('div');
  recentHost.className = 'invite-chips';
  const recentShow = recent.filter(
    (n) => !nameInList(inv, n) && ukey(n) !== ukey(me),
  );
  if (!recentShow.length) {
    const empty = document.createElement('span');
    empty.className = 'invite-empty';
    empty.textContent = recent.length ? 'All recents already invited' : 'No recent invitees';
    recentHost.appendChild(empty);
  } else {
    for (const name of recentShow) {
      const row = document.createElement('span');
      row.className = 'invite-add-row';
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'chip';
      add.textContent = `+ ${name}`;
      add.addEventListener('click', () => addToInvited(t, name, false));
      const star = document.createElement('button');
      star.type = 'button';
      star.className = 'icon-btn invite-star';
      star.textContent = '★';
      star.title = 'Invite and make friend';
      star.addEventListener('click', () => addToInvited(t, name, true));
      const forget = document.createElement('button');
      forget.type = 'button';
      forget.className = 'invite-x';
      forget.textContent = '×';
      forget.title = 'Forget from recents';
      forget.addEventListener('click', () => {
        forgetRecent(name);
        renderTables();
      });
      row.appendChild(add);
      row.appendChild(star);
      row.appendChild(forget);
      recentHost.appendChild(row);
    }
  }
  wrap.appendChild(section('Recent', recentHost));

  return wrap;
}

function renderInviteRow(tableId, t, privateOwner) {
  const inv = invitedList(t);
  const row = document.createElement('div');
  row.className = 'invite-row';

  row.dataset.table = tableId;
  if (privateOwner && authenticated) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'invite-summary-btn';
    btn.setAttribute('aria-expanded', inviteOpen.has(tableId) ? 'true' : 'false');
    btn.textContent = inv.length ? `👤 Invited: ${inv.length}` : '👤 Invite';
    btn.title = inv.length ? inv.join(', ') : 'Invite players';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (inviteOpen.has(tableId)) {
        inviteOpen.delete(tableId);
      } else {
        optsOpen.clear();
        inviteOpen.clear();
        inviteOpen.add(tableId);
        mergeFriendsIntoInvited(t);
      }
      renderTables();
    });
    row.appendChild(btn);

    if (inv.length) {
      const names = document.createElement('span');
      names.className = 'invite-names';
      names.textContent = formatInviteNames(inv);
      names.title = inv.join(', ');
      row.appendChild(names);
    }
    // Invite panel mounts on document.body (see mountOpenTablePopovers).
  } else {
    const lab = document.createElement('span');
    lab.className = 'invite-readonly';
    if (inv.length) {
      lab.textContent = `Invited: ${formatInviteNames(inv)}`;
      lab.title = inv.join(', ');
    } else {
      lab.textContent = 'Invited: —';
    }
    row.appendChild(lab);
  }
  return row;
}

function renderTable(tableId, t) {
  const waiting = t.status === STATUS_WAITING;
  const privateTable = isPrivateTable(tableId);
  const card = document.createElement('article');
  card.className =
    'table-card' +
    (waiting ? '' : ' playing') +
    (privateTable ? ' private' : ' open');
  card.dataset.table = tableId;

  const mine = mySeatAt(tableId);
  const privateOwner = isPrivateOwner(tableId);
  // Open: anyone signed in may edit options while waiting. Private: owner only.
  const canEditOpts = authenticated && waiting && (!privateTable || privateOwner);

  const hdr = document.createElement('header');
  hdr.className = 'table-head';

  const title = document.createElement('span');
  title.className = 'table-name';
  title.textContent = displayTableName(tableId);
  title.title = privateTable ? `Private table (${tableId})` : tableId;
  hdr.appendChild(title);
  if (privateTable) {
    const badge = document.createElement('span');
    badge.className = 'table-kind-badge';
    badge.textContent = 'Private';
    badge.title = 'Invite-only private table';
    hdr.appendChild(badge);
  }
  hdr.appendChild(renderOptPills(t));

  if (canEditOpts) {
    const gearWrap = document.createElement('div');
    gearWrap.className = 'gear-wrap table-gear';
    gearWrap.dataset.table = tableId;
    const gear = document.createElement('button');
    gear.type = 'button';
    gear.className = 'icon-btn gear-btn';
    gear.textContent = '⚙';
    gear.title = 'Table options';
    gear.setAttribute('aria-label', 'Table options');
    gear.setAttribute('aria-expanded', optsOpen.has(tableId) ? 'true' : 'false');
    gear.addEventListener('click', (e) => {
      e.stopPropagation();
      if (optsOpen.has(tableId)) optsOpen.delete(tableId);
      else {
        inviteOpen.clear();
        optsOpen.clear();
        optsOpen.add(tableId);
      }
      renderTables();
    });
    gearWrap.appendChild(gear);
    // Options popover mounts on document.body (see mountOpenTablePopovers).
    hdr.appendChild(gearWrap);
  }

  hdr.appendChild(renderStatusCluster(tableId, t, waiting, mine, privateTable, privateOwner));
  card.appendChild(hdr);

  const row = document.createElement('div');
  row.className = 'seat-row';
  for (let i = 0; i < (t.n || 0); i++) {
    row.appendChild(seatSlot(tableId, t, i));
  }
  card.appendChild(row);

  if (privateTable) {
    card.appendChild(renderInviteRow(tableId, t, privateOwner));
  }
  return card;
}

function renderTables() {
  clearBodyTablePopovers();
  const root = $('tables-root');
  const ids = [...tables.keys()].sort((a, b) => {
    const ao = a.startsWith('Open') ? 0 : 1;
    const bo = b.startsWith('Open') ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return a.localeCompare(b, undefined, { numeric: true });
  });
  if (!ids.length) {
    root.innerHTML = authenticated
      ? '<p class="hint">No tables — create a private table or wait for opens.</p>'
      : '<p class="hint">Sign in to see live tables.</p>';
    return;
  }
  const openIds = ids.filter((id) => !isPrivateTable(id));
  const privIds = ids.filter((id) => isPrivateTable(id));
  const frag = document.createDocumentFragment();
  if (openIds.length) {
    if (privIds.length) {
      const lab = document.createElement('p');
      lab.className = 'tables-section-label';
      lab.textContent = 'Open tables';
      frag.appendChild(lab);
    }
    for (const id of openIds) frag.appendChild(renderTable(id, tables.get(id)));
  }
  if (privIds.length) {
    const lab = document.createElement('p');
    lab.className = 'tables-section-label private';
    lab.textContent = 'Private tables';
    frag.appendChild(lab);
    for (const id of privIds) frag.appendChild(renderTable(id, tables.get(id)));
  }
  root.replaceChildren(frag);
  // Portals escape .panel.tables (overflow + backdrop-filter containing block).
  requestAnimationFrame(mountOpenTablePopovers);
}

function renderOnline() {
  const ul = $('online-list');
  const names = [...online.keys()].sort((a, b) => a.localeCompare(b));
  if (!names.length) {
    ul.innerHTML = '<li class="hint">—</li>';
    return;
  }
  ul.replaceChildren(
    ...names.map((n) => {
      const li = document.createElement('li');
      li.textContent = n;
      if (me && ukey(n) === ukey(me)) li.classList.add('me');
      return li;
    }),
  );
}

function appendChat(from, text) {
  const ul = $('chat-log');
  const li = document.createElement('li');
  li.innerHTML = `<b>${escapeHtml(from)}</b>: ${escapeHtml(text)}`;
  ul.appendChild(li);
  ul.scrollTop = ul.scrollHeight;
}

// ——— events ———

function applyUsers(u, t) {
  if (t === 'full') {
    online.clear();
    for (const [name, seen] of Object.entries(u || {})) {
      online.set(name, seen);
    }
  } else if (t === 'add' || t === 'change') {
    for (const [name, seen] of Object.entries(u || {})) {
      online.set(name, seen);
    }
  } else if (t === 'sub') {
    for (const name of Object.keys(u || {})) {
      online.delete(name);
    }
  }
  renderOnline();
}

function applyTables(g, t) {
  const prevPlaying = new Map();
  for (const [id, tb] of tables) {
    prevPlaying.set(id, tb.status);
  }

  if (t === 'full') {
    tables.clear();
    for (const [id, lg] of Object.entries(g || {})) {
      tables.set(id, lg);
    }
  } else if (t === 'change' || t === 'add') {
    for (const [id, lg] of Object.entries(g || {})) {
      tables.set(id, lg);
    }
  } else if (t === 'sub') {
    for (const id of Object.keys(g || {})) {
      tables.delete(id);
      optsOpen.delete(id);
      inviteOpen.delete(id);
    }
  }

  if (me) {
    for (const [id, tb] of tables) {
      if (tb.status !== STATUS_PLAYING) continue;
      const was = prevPlaying.get(id);
      if (was === STATUS_PLAYING) continue;
      const seat = mySeatAt(id);
      if (seat) {
        goPlay(id, seat, { draw: true });
        return;
      }
    }
  }
  renderTables();
}

function onServerEvent(ev) {
  const a = ev.action;
  if (a === 'err') {
    if (ev.err === 'duplicate_login') {
      handleTakenOver();
      return;
    }
    setBanner(ev.err || 'error', 'err');
    if (ev.err === 'username_taken') {
      setStatus('name/email mismatch', 'err');
      // Stay on form if they were creating; clear bad session name only if not connected.
      if (!authenticated) {
        intentionalClose = true;
        if (ws) {
          ws.close();
          ws = null;
        }
        intentionalClose = false;
        me = '';
        // Keep gate/form state so they can fix name.
        if (listProfiles().length && isSignOutGate()) authPanel = 'gate';
        else if (listProfiles().length) authPanel = 'create';
        else authPanel = 'first';
        renderHeader();
      }
    }
    return;
  }
  if (a === 'welcome') {
    authenticated = true;
    takenOver = false;
    const id = loadIdentity();
    const uname = me || id.username;
    saveIdentity({
      uuid: ev.uuid,
      username: uname,
      email: id.email,
      upsert: true,
    });
    if (ev.prefs) cachePrefs(ev.prefs, uname);
    me = uname;
    authPanel = 'hidden';
    setStatus('connected', 'ok');
    setBanner('');
    renderHeader();
    renderTables();
    return;
  }
  if (a === 'prefs') {
    if (ev.prefs) cachePrefs(ev.prefs, me);
    if (authPanel === 'display') syncDisplayPanel();
    return;
  }
  if (a === 'users') {
    applyUsers(ev.u, ev.t);
    return;
  }
  if (a === 'tables') {
    applyTables(ev.g, ev.t);
    return;
  }
  if (a === 'chat') {
    appendChat(ev.from, ev.text);
  }
}

// ——— connection ———

/**
 * Connect as username/email. Tears down existing socket if switching.
 */
function loginAs(username, email = '') {
  const name = String(username || '').trim();
  if (!name) return;
  takenOver = false;
  // Tear down any live connection before switching accounts.
  if (isLiveWs() || authenticated) {
    intentionalClose = true;
    authenticated = false;
    if (ws) {
      ws.close();
      ws = null;
    }
    intentionalClose = false;
    tables.clear();
    online.clear();
    renderTables();
    renderOnline();
  }
  beginLogin({ username: name, email: email || '' });
  me = name;
  authPanel = 'hidden';
  connect();
}

function connect() {
  if (isLiveWs()) {
    renderHeader();
    return;
  }
  intentionalClose = false;
  takenOver = false;
  clearReconnect();
  const id = loadIdentity();
  if (!id.username) {
    setStatus('enter name', '');
    pickUnsignedPanel();
    renderHeader();
    return;
  }
  me = id.username;
  setStatus('connecting…', '');
  // Connection progress lives in conn-status only (not the banner).
  renderHeader();

  try {
    ws = new WebSocket(LOBBY_WS);
  } catch (e) {
    setStatus('ws failed', 'err');
    setBanner(String(e), 'err');
    scheduleReconnect();
    return;
  }
  renderHeader();

  ws.onopen = () => {
    setStatus('authenticating…', '');
    const cur = loadIdentity();
    // Lobby Login is username+email only; server returns uuid on Welcome.
    send({
      action: 'login',
      username: cur.username,
      email: cur.email || '',
    });
  };

  ws.onmessage = (e) => {
    let ev;
    try {
      ev = JSON.parse(e.data);
    } catch {
      return;
    }
    onServerEvent(ev);
  };

  ws.onclose = () => {
    authenticated = false;
    ws = null;
    renderHeader();
    if (intentionalClose) {
      setStatus('signed out', '');
      return;
    }
    // Booted by another login — stay idle until user reclaims (Continue as…).
    if (takenOver) {
      setStatus('signed in elsewhere', 'err');
      if (!listProfiles().length) authPanel = 'first';
      else authPanel = 'gate';
      renderHeader();
      return;
    }
    // Only auto-reconnect if we still have a session user and are not on the gate.
    if (!loadIdentity().username || isSignOutGate()) {
      setStatus('disconnected', '');
      pickUnsignedPanel();
      renderHeader();
      return;
    }
    setStatus('reconnecting…', 'err');
    setBanner(''); // reconnect attempts: status line only
    scheduleReconnect();
  };

  ws.onerror = () => {
    /* onclose follows */
  };
}

function scheduleReconnect() {
  if (reconnectTimer || takenOver || isSignOutGate()) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!takenOver && loadIdentity().username && !isSignOutGate()) connect();
  }, 1500);
}

function doSignOut() {
  clearReconnect();
  intentionalClose = true;
  takenOver = false;
  authenticated = false;
  me = '';
  tables.clear();
  online.clear();
  if (ws) {
    ws.close();
    ws = null;
  }
  clearSession();
  authPanel = listProfiles().length ? 'gate' : 'first';
  setStatus('signed out', '');
  setBanner(listProfiles().length ? 'Choose a profile to rejoin.' : 'Create a profile to join tables.');
  renderTables();
  renderOnline();
  renderHeader();
}

function pickUnsignedPanel() {
  if (isSignedInUi()) {
    authPanel = 'hidden';
    return;
  }
  if (isSignOutGate() && listProfiles().length) {
    authPanel = 'gate';
  } else if (!listProfiles().length) {
    authPanel = 'first';
  } else if (!loadIdentity().username) {
    // Profiles exist but no session and no gate → treat as cold return target handled in main
    authPanel = 'gate';
  }
}

function submitLoginForm() {
  if (authenticated && authPanel !== 'create') return;
  const username = $('in-user').value.trim();
  if (!username) {
    $('in-user').focus();
    return;
  }
  const email = $('in-email').value.trim();
  loginAs(username, email);
}

function cancelLoginForm() {
  if (isSignedInUi()) {
    authPanel = 'hidden';
  } else if (listProfiles().length) {
    // Prefer gate so they can Continue as without typing.
    authPanel = 'gate';
    // If they never signed out (cancelled create after failed attempt), set soft gate? 
    // Without gate flag, cold path would re-auto-login on reload — OK.
    if (!isSignOutGate()) {
      // Stay on gate-like UI without blocking future cold return.
      authPanel = 'gate';
    }
  } else {
    authPanel = 'first';
  }
  renderHeader();
}

function wireUi() {
  $('btn-login').addEventListener('click', () => submitLoginForm());
  $('btn-login-cancel').addEventListener('click', () => cancelLoginForm());
  $('btn-another-name').addEventListener('click', () => openCreateForm());
  $('btn-gate-manage')?.addEventListener('click', () => openManagePanel());
  $('btn-manage-close').addEventListener('click', () => closeManagePanel());
  $('btn-display-close')?.addEventListener('click', () => closeManagePanel());
  $('pref-hand-desc')?.addEventListener('change', () => {
    if ($('pref-hand-desc').checked) setHandSortFromUi('desc');
  });
  $('pref-hand-asc')?.addEventListener('change', () => {
    if ($('pref-hand-asc').checked) setHandSortFromUi('asc');
  });

  $('btn-profile').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleProfileMenu();
  });
  document.addEventListener('click', (e) => {
    const wrap = $('profile-wrap');
    if (wrap && !wrap.contains(e.target)) closeProfileMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeProfileMenu();
      if (authPanel === 'manage' || authPanel === 'display') closeManagePanel();
      else if (authPanel === 'create' && (isSignedInUi() || listProfiles().length)) {
        cancelLoginForm();
      }
    }
  });

  $('btn-create').addEventListener('click', () => {
    send({ action: 'create' });
  });

  $('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('chat-text');
    const text = input.value.trim();
    if (!text) return;
    send({ action: 'chat', text });
    input.value = '';
  });

  $('in-user').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitLoginForm();
  });
  $('in-email').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitLoginForm();
  });

  document.addEventListener('click', (e) => {
    if (!optsOpen.size && !inviteOpen.size) return;
    if (e.target.closest?.('.table-gear') || e.target.closest?.('.invite-row')) return;
    // Body-ported popovers are not under .table-gear / .invite-row.
    if (e.target.closest?.('.opts-popover') || e.target.closest?.('.invite-panel')) return;
    let dirty = false;
    if (optsOpen.size) {
      optsOpen.clear();
      dirty = true;
    }
    if (inviteOpen.size) {
      inviteOpen.clear();
      dirty = true;
    }
    if (dirty) renderTables();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!optsOpen.size && !inviteOpen.size) return;
    optsOpen.clear();
    inviteOpen.clear();
    renderTables();
  });
  // Keep body-ported popovers glued to anchors while tables panel scrolls.
  const tablesPanel = document.querySelector('.panel.tables');
  tablesPanel?.addEventListener('scroll', () => placeOpenTablePopovers(), { passive: true });
  window.addEventListener('resize', () => placeOpenTablePopovers(), { passive: true });
}

function main() {
  migrateLegacyProfiles();
  wireUi();
  renderTables();
  renderOnline();

  const id = loadIdentity();
  const profiles = listProfiles();
  const last = lastUsedProfile();

  // 1) Live tab session → reconnect as that user.
  if (id.username) {
    clearSignOutGate();
    me = id.username;
    authPanel = 'hidden';
    renderHeader();
    connect();
    return;
  }

  // 2) Explicit sign-out gate this tab → Continue as… (no silent auto-login).
  if (isSignOutGate() && profiles.length) {
    me = '';
    authPanel = 'gate';
    setStatus('signed out', '');
    setBanner('Choose a profile to rejoin.');
    renderHeader();
    return;
  }

  // 3) Cold return: profiles exist → silent auto-login as last used.
  if (last) {
    me = last.username;
    authPanel = 'hidden';
    renderHeader();
    loginAs(last.username, last.email);
    return;
  }

  // 4) First visit.
  me = '';
  authPanel = 'first';
  setStatus('enter name', '');
  setBanner('Create a profile to join tables.');
  renderHeader();
}

main();
