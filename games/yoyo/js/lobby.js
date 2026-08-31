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
  applyWarnSubsetLeadLocal,
  handSort,
  warnSubsetLead,
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
/**
 * True after login rejected (e.g. username_taken / email mismatch).
 * Stops reconnect storm until the user re-submits a login.
 */
let authRejected = false;
let reconnectTimer = null;
let authenticated = false;
/** @type {string} preferred name from server / session */
let me = '';
/** Self is YOYO_DEVS (Welcome.is_dev); UX only */
let meIsDev = false;
/** @type {Map<string, object>} table id → L1G */
const tables = new Map();
/** @type {Map<string, string>} name → last_seen */
const online = new Map();
/** @type {Map<string, object>} news id → item (active only) */
const newsById = new Map();
/** @type {Map<string, object>} feedback id → item */
const feedbackById = new Map();
/** Expanded feedback thread id, or '' */
let feedbackExpanded = '';
/** @type {{ rows: object[], you: object|null }} */
let ranksState = { rows: [], you: null };
/** Unread counts for Talk tabs (E8g + server talk_read watermarks). */
const unread = { news: 0, feedback: 0, chat: 0 };
/** @type {{ from: string, text: string, at: string, is_dev: boolean }[]} */
let chatMessages = [];
/** gear popover open per table id */
const optsOpen = new Set();
/** invite panel open per private table id */
const inviteOpen = new Set();
/** debounce timers for live Options */
const optsDebounce = new Map();

/** 'hidden' | 'first' | 'create' | 'gate' | 'manage' | 'display' */
let authPanel = 'hidden';
/** Username whose Change-email form is open in Manage profiles (or ''). */
let emailEditFor = '';

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

/** Sticky err/ok until cleared; prompts are state-driven via syncActionBanner. */
let actionBannerSticky = false;

// Set action banner; kind: prompt | err | ok. opts.html / opts.sticky.
function setActionBanner(text, kind = 'prompt', opts = {}) {
  const el = $('action-banner');
  if (!el) return;
  if (!text) {
    el.hidden = true;
    el.replaceChildren();
    el.className = 'action-banner';
    actionBannerSticky = false;
    return;
  }
  el.hidden = false;
  if (opts.html) el.innerHTML = text;
  else el.textContent = text;
  const mod = kind === 'err' ? ' err' : kind === 'ok' ? ' ok' : ' prompt';
  el.className = 'action-banner' + mod;
  actionBannerSticky = opts.sticky ?? (kind === 'err' || kind === 'ok');
}

// Next-action prompt from auth + seat state (skips sticky err/ok).
function syncActionBanner() {
  if (actionBannerSticky || takenOver || authRejected) return;

  // Connecting / reconnecting — conn-status only.
  if (
    !authenticated &&
    authPanel === 'hidden' &&
    loadIdentity().username &&
    !isSignOutGate()
  ) {
    setActionBanner('');
    return;
  }

  if (!authenticated) {
    if (authPanel === 'gate' || (isSignOutGate() && listProfiles().length)) {
      setActionBanner('Choose a profile to rejoin.', 'prompt', { sticky: false });
    } else {
      setActionBanner('Create a profile to join tables.', 'prompt', { sticky: false });
    }
    return;
  }

  for (const [id, t] of tables) {
    if (!mySeatAt(id)) continue;
    if (t.status === STATUS_PLAYING) {
      setActionBanner('');
      return;
    }
    const privateTable = isPrivateTable(id);
    const privateOwner = privateTable && ukey(id) === ukey(me);
    if (!privateTable || privateOwner) {
      setActionBanner(
        'Press <strong>Start</strong> when all intended players are ready.',
        'prompt',
        { html: true, sticky: false },
      );
    } else {
      setActionBanner('Waiting for the host to start the game.', 'prompt', { sticky: false });
    }
    return;
  }

  setActionBanner(
    'Choose a table and <strong>Sit</strong> at an open seat—or <i>Create private</i>',
    'prompt',
    { html: true, sticky: false },
  );
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
  authRejected = false;
  clearReconnect();
  authenticated = false;
  setStatus('signed in elsewhere', 'err');
  setActionBanner(
    'Signed in on another device. This tab was disconnected. Choose Continue as… to play here.',
    'err',
  );
  tables.clear();
  online.clear();
  newsById.clear();
  feedbackById.clear();
  feedbackExpanded = '';
  ranksState = { rows: [], you: null };
  clearAllUnread();
  meIsDev = false;
  clearChatLog();
  renderNews();
  renderFeedback();
  renderRanks();
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

// Login failed before Welcome (name locked / email mismatch). No reconnect until user fixes form.
function handleAuthRejected(errCode) {
  authRejected = true;
  takenOver = false;
  clearReconnect();
  intentionalClose = true; // stay true until next connect()/loginAs — avoids onclose race
  authenticated = false;
  const locked = errCode === 'username_taken';
  setStatus('sign-in failed', 'err');
  setActionBanner(
    locked
      ? 'That name is locked on this server. Enter the email used to claim it, then try again.'
      : 'Sign-in failed. Check name and email, then try again.',
    'err',
  );
  if (ws) {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
    ws = null;
  }
  const id = loadIdentity();
  const u = $('in-user');
  const e = $('in-email');
  if (u) u.value = id.username || me || '';
  if (e) e.value = id.email || '';
  // Show name/email form (not silent gate chips) so user can add email.
  authPanel = listProfiles().length ? 'create' : 'first';
  me = '';
  renderHeader();
  // Focus email — usual fix for locked-name without email in the profile.
  requestAnimationFrame(() => {
    $('in-email')?.focus();
  });
}

// Outbound send failed: socket not OPEN (or send threw) — stay and reconnect.
function forceReconnect(msg) {
  if (intentionalClose || takenOver || authRejected || isSignOutGate()) return;
  if (!loadIdentity().username) return;
  setStatus(msg || 'reconnecting', 'err');
  setActionBanner('');
  authenticated = false;
  if (ws) {
    intentionalClose = true; // suppress onclose's parallel schedule
    const old = ws;
    ws = null;
    try {
      old.close();
    } catch (_) {
      /* ignore */
    }
    intentionalClose = false;
  }
  renderHeader();
  scheduleReconnect();
}

function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(obj));
      return true;
    } catch (_) {
      /* fall through — treat as dead socket */
    }
  }
  if (!intentionalClose && !takenOver && !authRejected && !isSignOutGate()) {
    forceReconnect('Connection lost — reconnecting');
  }
  return false;
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
  emailEditFor = '';
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
  const warn = $('pref-warn-subset');
  if (warn) warn.checked = warnSubsetLead();
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

function setWarnSubsetFromUi(on) {
  if (!applyWarnSubsetLeadLocal(on)) {
    syncDisplayPanel();
    return;
  }
  syncDisplayPanel();
  send({ action: 'setprefs', prefs: { warn_subset_lead: !!on } });
}

function renderManageList() {
  const ul = $('manage-list');
  if (!ul) return;
  const list = listProfiles();
  if (!list.length) {
    emailEditFor = '';
    ul.innerHTML = '<li class="hint">No saved profiles on this browser.</li>';
    return;
  }
  const canEditEmail = isSignedInUi() && !!me;
  ul.replaceChildren(
    ...list.map((p) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'mp-name';
      name.textContent = p.username;
      const email = document.createElement('span');
      email.className = 'mp-email';
      email.textContent = p.email || '—';
      const actions = document.createElement('div');
      actions.className = 'mp-actions';

      const isMe = canEditEmail && ukey(p.username) === ukey(me);
      if (isMe) {
        const change = document.createElement('button');
        change.type = 'button';
        change.className = 'mp-email-btn';
        change.textContent =
          emailEditFor && ukey(emailEditFor) === ukey(p.username)
            ? 'Cancel'
            : 'Change email';
        change.addEventListener('click', () => {
          emailEditFor =
            emailEditFor && ukey(emailEditFor) === ukey(p.username)
              ? ''
              : p.username;
          renderManageList();
        });
        actions.appendChild(change);

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'mp-delete danger';
        del.textContent = 'Delete username…';
        del.title = 'Remove this name on the server (not just this browser)';
        del.addEventListener('click', () => requestDeleteUsername(p));
        actions.appendChild(del);
      }

      const forget = document.createElement('button');
      forget.type = 'button';
      forget.className = 'mp-forget danger';
      forget.textContent = 'Forget';
      forget.addEventListener('click', () => {
        if (!confirm(`Remove “${p.username}” from this browser?`)) return;
        const wasMe = me && ukey(p.username) === ukey(me);
        if (emailEditFor && ukey(emailEditFor) === ukey(p.username)) {
          emailEditFor = '';
        }
        forgetProfile(p.username);
        if (wasMe && isSignedInUi()) {
          doSignOut();
          return;
        }
        renderManageList();
        renderContinueChips();
        renderAuthUi();
      });
      actions.appendChild(forget);
      li.append(name, email, actions);

      if (isMe && emailEditFor && ukey(emailEditFor) === ukey(p.username)) {
        li.appendChild(buildEmailEditForm(p));
      }
      return li;
    }),
  );
}

/** Inline Change-email form for the signed-in profile row. */
function buildEmailEditForm(p) {
  const form = document.createElement('form');
  form.className = 'mp-email-form';
  form.autocomplete = 'off';

  const locked = !!(p.email && String(p.email).trim());
  let currentInput = null;
  if (locked) {
    const curLab = document.createElement('label');
    curLab.textContent = 'Current email';
    currentInput = document.createElement('input');
    currentInput.type = 'email';
    currentInput.name = 'current_email';
    currentInput.required = true;
    currentInput.placeholder = p.email;
    currentInput.autocomplete = 'username';
    curLab.appendChild(currentInput);
    form.appendChild(curLab);
  }

  const newLab = document.createElement('label');
  newLab.textContent = locked ? 'New email' : 'Email';
  const newInput = document.createElement('input');
  newInput.type = 'email';
  newInput.name = 'new_email';
  newInput.required = true;
  newInput.placeholder = 'you@example.com';
  newInput.autocomplete = 'email';
  newLab.appendChild(newInput);
  form.appendChild(newLab);

  const save = document.createElement('button');
  save.type = 'submit';
  save.textContent = 'Save';
  form.appendChild(save);

  const err = document.createElement('p');
  err.className = 'mp-email-err';
  err.hidden = true;
  form.appendChild(err);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    err.hidden = true;
    const newEmail = newInput.value.trim();
    if (!newEmail) {
      err.textContent = 'Enter a non-empty email.';
      err.hidden = false;
      return;
    }
    const currentEmail = locked
      ? (currentInput?.value || '').trim()
      : '';
    if (locked && !currentEmail) {
      err.textContent = 'Enter the current email that locked this name.';
      err.hidden = false;
      return;
    }
    if (!send({
      action: 'setemail',
      current_email: currentEmail,
      new_email: newEmail,
    })) {
      err.textContent = 'Not connected — try again when online.';
      err.hidden = false;
    }
  });

  setTimeout(() => (currentInput || newInput)?.focus(), 0);
  return form;
}

/** Apply server EmailChanged to session + local profile. */
function applyEmailChanged(email) {
  const em = String(email || '').trim();
  const id = loadIdentity();
  const uname = me || id.username;
  if (!uname) return;
  saveIdentity({
    uuid: id.uuid || undefined,
    username: uname,
    email: em,
    upsert: true,
  });
  emailEditFor = '';
  setActionBanner('Email updated', 'ok');
  renderManageList();
  renderContinueChips();
  renderHeader();
}

/** Target of a pending DevDeleteUser (wait for Users Sub / err). */
let pendingDevDelete = '';

/** Dev moderation: delete another username (E9c). */
function requestDevDeleteUser(name) {
  const target = String(name || '').trim();
  if (!target || !meIsDev) return;
  if (me && ukey(target) === ukey(me)) {
    setActionBanner('Use Manage profiles → Delete username to remove your own name.', 'err');
    return;
  }
  if (
    !confirm(
      `Dev: delete “${target}” on the server?\n\n` +
        `Removes stats/prefs and disconnects them. They must not be seated at a table.\n` +
        `This cannot be undone.`,
    )
  ) {
    return;
  }
  pendingDevDelete = target;
  if (!send({ action: 'devdeleteuser', username: target })) {
    pendingDevDelete = '';
    setActionBanner('Not connected — try again when online.', 'err');
  }
}

/** Confirm + optional email proof, then DeleteUser (E9b). */
function requestDeleteUsername(p) {
  const name = String(p.username || '').trim();
  if (!name) return;
  const locked = !!(p.email && String(p.email).trim());
  const ok = confirm(
    `Delete “${name}” on the server?\n\n` +
      `This removes stats and prefs for that name and cannot be undone.\n` +
      `Leave any table seat first.\n\n` +
      `(Forget only removes the shortcut on this browser.)`,
  );
  if (!ok) return;
  let email = '';
  if (locked) {
    const entered = window.prompt(
      `Enter the email that locked “${name}” to confirm delete:`,
      '',
    );
    if (entered == null) return; // cancelled
    email = String(entered).trim();
    if (!email) {
      setActionBanner('Email required to delete a locked username.', 'err');
      return;
    }
  }
  if (!send({ action: 'deleteuser', email })) {
    setActionBanner('Not connected — try again when online.', 'err');
  }
}

/**
 * Server deleted this username (or we finished local cleanup after user_deleted).
 * Forget profile, clear session, show Continue/create gate — no reconnect.
 */
function handleUserDeleted() {
  const id = loadIdentity();
  const uname = me || id.username;
  emailEditFor = '';
  clearReconnect();
  intentionalClose = true;
  takenOver = false;
  authRejected = false;
  authenticated = false;
  if (uname) forgetProfile(uname);
  me = '';
  meIsDev = false;
  tables.clear();
  online.clear();
  if (ws) {
    ws.close();
    ws = null;
  }
  clearSession();
  authPanel = listProfiles().length ? 'gate' : 'first';
  setStatus('sign in', '');
  setActionBanner(
    'Username deleted on the server. Create a new profile or continue as another saved name.',
    'ok',
  );
  renderTables();
  renderOnline();
  renderContinueChips();
  renderHeader();
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
      title.textContent = authRejected
        ? 'Sign-in failed'
        : isCreate && profiles.length
          ? 'Create new profile'
          : 'Join the lobby';
    }
    if (hint) {
      hint.textContent = authRejected
        ? 'Name may be locked on this server — enter the matching email, or pick another name.'
        : isCreate && profiles.length
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
  syncNewsCompose();
  syncFeedbackChrome();
  syncActionBanner();
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

// True if me is on the private invite ACL.
function isInvitedTo(tableId, t) {
  if (!me || !isPrivateTable(tableId)) return false;
  return invitedList(t || tables.get(tableId)).some((n) => ukey(n) === ukey(me));
}

// Within private: mine (seat/owned) → invited → other.
function privateSortKey(tableId) {
  if (mySeatAt(tableId) || isPrivateOwner(tableId)) return 0;
  if (isInvitedTo(tableId)) return 1;
  return 2;
}

// Compare private tables by relevance, then name.
function comparePrivateIds(a, b) {
  const ka = privateSortKey(a);
  const kb = privateSortKey(b);
  if (ka !== kb) return ka - kb;
  return a.localeCompare(b, undefined, { numeric: true });
}

// Open tables: ascending id (Open1, Open2, …); gaps OK if server pruned higher numbers.
function compareOpenIds(a, b) {
  return a.localeCompare(b, undefined, { numeric: true });
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

// Any live session (Playing) — includes empty/paused until Stop or idle kill.
// Drives in-progress card chrome (chip, darker card, seat contrast).
function tableIsInProgress(t) {
  return t.status === STATUS_PLAYING;
}

// Playing but no humans seated (bots may still be present; idle kill if empty long enough).
function tableIsPaused(t) {
  return t.status === STATUS_PLAYING && !tableHasSeatedHumans(t);
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
    // In-progress uses header chip + stripes; only empty sessions show status text.
    if (tableIsPaused(t)) {
      status.textContent = 'Paused…';
      status.title = 'Game session open but no one is seated';
      cluster.appendChild(status);
    }
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
  const onlineNames = [...online.entries()]
    .filter(([n, p]) => ukey(n) !== ukey(me) && isPresenceOnline(normalizePresence(p)))
    .map(([n]) => n)
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
  const inProgress = tableIsInProgress(t);
  const paused = tableIsPaused(t);
  const card = document.createElement('article');
  card.className =
    'table-card' +
    (waiting ? '' : ' playing') +
    (inProgress ? ' in-progress' : '') +
    (paused ? ' paused' : '') +
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

  // After option chips: attention chip for any live session (incl. paused/empty).
  if (inProgress) {
    const live = document.createElement('span');
    live.className = 'table-live-badge';
    live.textContent = 'In progress';
    live.title = paused
      ? 'Session open with no one seated — join before idle timeout ends the game'
      : 'Game already started — use Join on an open seat';
    hdr.appendChild(live);
  }

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
  const ids = [...tables.keys()];
  if (!ids.length) {
    root.innerHTML = authenticated
      ? '<p class="hint">No tables — create a private table or wait for opens.</p>'
      : '<p class="hint">Sign in to see live tables.</p>';
    syncActionBanner();
    return;
  }
  // Private first (yours → invited → other), then open ascending (Open1, Open2, …).
  const privIds = ids.filter((id) => isPrivateTable(id)).sort(comparePrivateIds);
  const openIds = ids.filter((id) => !isPrivateTable(id)).sort(compareOpenIds);
  const frag = document.createDocumentFragment();
  if (privIds.length) {
    if (openIds.length) {
      const lab = document.createElement('p');
      lab.className = 'tables-section-label private';
      lab.textContent = 'Private tables';
      frag.appendChild(lab);
    }
    for (const id of privIds) frag.appendChild(renderTable(id, tables.get(id)));
  }
  if (openIds.length) {
    if (privIds.length) {
      const lab = document.createElement('p');
      lab.className = 'tables-section-label';
      lab.textContent = 'Open tables';
      frag.appendChild(lab);
    }
    for (const id of openIds) frag.appendChild(renderTable(id, tables.get(id)));
  }
  root.replaceChildren(frag);
  // Portals escape .panel.tables (overflow + backdrop-filter containing block).
  requestAnimationFrame(mountOpenTablePopovers);
  syncActionBanner();
}

// Normalize presence value (object or legacy string last_seen).
function normalizePresence(raw) {
  if (raw == null) return { last_seen: '', where: 'offline', table: null, is_dev: false };
  if (typeof raw === 'string') {
    const online = raw === 'now';
    return {
      last_seen: raw,
      where: online ? 'lobby' : 'offline',
      table: null,
      is_dev: false,
    };
  }
  const w = String(raw.where || raw.where_ || 'offline').toLowerCase();
  return {
    last_seen: raw.last_seen || raw.lastSeen || '',
    where: w,
    table: raw.table || null,
    is_dev: !!(raw.is_dev || raw.isDev),
  };
}

function isPresenceOnline(p) {
  const w = (p && p.where) || '';
  return w === 'lobby' || w === 'table' || w === 'playing';
}

// Client status text from presence (E8c).
// Own private table id == player name → omit redundant table label.
function formatPresenceStatus(p, playerName) {
  if (!p) return '';
  if (p.where === 'lobby') return 'lobby';
  const ownPriv = !!(p.table && playerName && ukey(p.table) === ukey(playerName));
  if (p.where === 'table') {
    if (ownPriv) return 'table';
    return p.table ? displayTableName(p.table) : 'table';
  }
  if (p.where === 'playing') {
    if (ownPriv) return 'playing';
    const t = p.table ? displayTableName(p.table) : 'table';
    return `${t} · playing`;
  }
  return formatOfflineSeen(p.last_seen);
}

// Coarse offline buckets (no exact disconnect time).
function formatOfflineSeen(iso) {
  if (!iso || iso === 'now') return 'offline';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'offline';
  const now = new Date();
  const then = new Date(t);
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startThen = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
  const dayDiff = Math.round((startToday - startThen) / 86400000);
  if (dayDiff <= 0) return 'earlier today';
  if (dayDiff === 1) return 'yesterday';
  if (dayDiff < 14) return `${dayDiff} days ago`;
  return 'a while ago';
}

// Sort band: lobby → table → playing → offline (by last_seen desc within offline).
function presenceBand(p) {
  switch (p?.where) {
    case 'lobby': return 0;
    case 'table': return 1;
    case 'playing': return 2;
    default: return 3;
  }
}

// Build a presence list row.
function playerRow(
  name,
  status,
  { meRow = false, offline = false, dev = false, showDevDelete = false } = {},
) {
  const li = document.createElement('li');
  li.className = 'player-row' + (offline ? ' offline' : '') + (meRow ? ' me' : '');
  const nm = document.createElement('span');
  nm.className = 'player-name';
  nm.textContent = name;
  if (dev) {
    const badge = document.createElement('span');
    badge.className = 'badge-dev';
    badge.textContent = 'Dev';
    nm.append(' ', badge);
  }
  const st = document.createElement('span');
  st.className = 'player-status';
  st.textContent = status;
  li.append(nm, st);
  // E9c: Dev may delete another username (not self — use Manage for that).
  if (showDevDelete && !meRow) {
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'icon-btn danger trash-btn player-dev-delete';
    del.textContent = '🗑';
    del.title = 'Dev: delete this username on the server';
    del.setAttribute('aria-label', del.title);
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      requestDevDeleteUser(name);
    });
    li.appendChild(del);
  }
  return li;
}

// Presence list: bands + offline dim; empty when none.
function renderOnline() {
  const ul = $('online-list');
  if (!ul) return;
  const rows = [...online.entries()].map(([name, raw]) => ({
    name,
    p: normalizePresence(raw),
  }));
  rows.sort((a, b) => {
    const ba = presenceBand(a.p);
    const bb = presenceBand(b.p);
    if (ba !== bb) return ba - bb;
    if (ba === 3) {
      // offline: newer last_seen first
      return String(b.p.last_seen || '').localeCompare(String(a.p.last_seen || ''));
    }
    return a.name.localeCompare(b.name);
  });
  // Cap offline rows client-side (server already caps; belt + suspenders).
  let offlineN = 0;
  const OFFLINE_CAP = 15;
  const kept = [];
  for (const r of rows) {
    if (!isPresenceOnline(r.p)) {
      offlineN += 1;
      if (offlineN > OFFLINE_CAP) continue;
    }
    kept.push(r);
  }
  if (!kept.length) {
    ul.replaceChildren();
    return;
  }
  const showDevDelete = !!(authenticated && meIsDev);
  ul.replaceChildren(
    ...kept.map(({ name, p }) =>
      playerRow(name, formatPresenceStatus(p, name), {
        meRow: !!(me && ukey(name) === ukey(me)),
        offline: !isPresenceOnline(p),
        dev: !!p.is_dev,
        showDevDelete,
      }),
    ),
  );
}

// Apply Ranks event (leaderboard + sticky you).
function applyRanks(ev) {
  ranksState = {
    rows: Array.isArray(ev?.rows) ? ev.rows : [],
    you: ev?.you || null,
  };
  renderRanks();
}

// Display avg as 0–100 integer.
function formatAvg100(row) {
  if (row == null) return '—';
  if (row.avg100 != null && row.avg100 !== '') return String(row.avg100);
  const a = Number(row.avg);
  if (Number.isNaN(a)) return '—';
  return String(Math.round(a * 100));
}

// Render lifetime ranks table (0–100 avg).
function renderRanks() {
  const body = $('ranks-body');
  const empty = $('ranks-empty');
  const youMeta = $('ranks-you-meta');
  if (!body) return;
  const rows = ranksState.rows || [];
  if (empty) empty.hidden = rows.length > 0;
  const frag = document.createDocumentFragment();
  for (const r of rows) {
    const tr = document.createElement('tr');
    if (me && ukey(r.name) === ukey(me)) tr.classList.add('me');
    const tdRk = document.createElement('td');
    tdRk.className = 'rk';
    tdRk.textContent = r.rank != null ? String(r.rank) : '—';
    const tdNm = document.createElement('td');
    tdNm.className = 'nm';
    tdNm.textContent = r.name || '?';
    const tdAvg = document.createElement('td');
    tdAvg.className = 'avg';
    tdAvg.textContent = formatAvg100(r);
    const tdN = document.createElement('td');
    tdN.className = 'n';
    tdN.textContent = r.games != null ? String(r.games) : '—';
    tr.append(tdRk, tdNm, tdAvg, tdN);
    frag.appendChild(tr);
  }
  body.replaceChildren(frag);

  if (youMeta) {
    if (!authenticated || !me) {
      youMeta.textContent = 'Sign in to see your rank';
    } else if (ranksState.you) {
      const y = ranksState.you;
      const g = y.games || 0;
      if (y.rank != null) {
        youMeta.textContent = `#${y.rank} · avg ${formatAvg100(y)} · ${g} games`;
      } else if (g < 10) {
        const left = Math.max(0, 10 - g);
        youMeta.textContent =
          g === 0
            ? 'play 10 games to rank'
            : `${g}/10 games · ${left} more to rank`;
      } else {
        youMeta.textContent = `avg ${formatAvg100(y)} · ${g} games`;
      }
    } else {
      youMeta.textContent = 'play 10 games to rank';
    }
  }
}

// True if a side pane is currently visible.
function isPaneVisible(paneId) {
  const pane = $(paneId);
  return !!(pane && !pane.hidden);
}

function isSelfAuthor(name) {
  return !!(me && name && ukey(name) === ukey(me));
}

// Server talk_read watermarks from prefs cache.
function talkRead() {
  const tr = loadPrefsCache(me).talk_read || {};
  return {
    news_at: tr.news_at || null,
    feedback_at: tr.feedback_at || null,
    chat_at: tr.chat_at || null,
  };
}

// itemIso is strictly after watermark (missing watermark → all count).
function isoAfter(watermark, itemIso) {
  if (!itemIso) return false;
  if (!watermark) return true;
  const a = Date.parse(watermark);
  const b = Date.parse(itemIso);
  if (Number.isNaN(b)) return false;
  if (Number.isNaN(a)) return true;
  return b > a;
}

// +1 per news post after news_at (not self).
function countNewsUnread() {
  const wm = talkRead().news_at;
  let n = 0;
  for (const it of newsById.values()) {
    if (isSelfAuthor(it.author)) continue;
    if (isoAfter(wm, it.created_at)) n += 1;
  }
  return n;
}

// +1 per new topic + +1 per reply after feedback_at (not self).
function countFeedbackUnread() {
  const wm = talkRead().feedback_at;
  let n = 0;
  for (const it of feedbackById.values()) {
    if (!isSelfAuthor(it.author) && isoAfter(wm, it.created_at)) n += 1;
    for (const r of it.replies || []) {
      if (!isSelfAuthor(r.author) && isoAfter(wm, r.created_at)) n += 1;
    }
  }
  return n;
}

// +1 per chat line after chat_at (not self).
function countChatUnread() {
  const wm = talkRead().chat_at;
  let n = 0;
  for (const m of chatMessages) {
    if (isSelfAuthor(m.from)) continue;
    if (isoAfter(wm, m.at)) n += 1;
  }
  return n;
}

// Show/hide Talk tab badge count.
function setTabBadge(badgeId, n) {
  const el = $(badgeId);
  if (!el) return;
  const v = Math.max(0, n | 0);
  if (v > 0) {
    el.hidden = false;
    el.textContent = v > 99 ? '99+' : String(v);
  } else {
    el.hidden = true;
    el.textContent = '0';
  }
}

function setUnreadCount(kind, n) {
  if (!(kind in unread)) return;
  unread[kind] = Math.min(99, Math.max(0, n | 0));
  setTabBadge(`badge-${kind}`, unread[kind]);
}

function clearAllUnread() {
  setUnreadCount('news', 0);
  setUnreadCount('feedback', 0);
  setUnreadCount('chat', 0);
}

// Recompute badge from data + talk_read (skip if pane open — treat as reading).
function recomputeUnread(kind) {
  const paneId =
    kind === 'news' ? 'pane-news' : kind === 'feedback' ? 'pane-feedback' : 'pane-chat';
  if (isPaneVisible(paneId)) {
    setUnreadCount(kind, 0);
    return;
  }
  let n = 0;
  if (kind === 'news') n = countNewsUnread();
  else if (kind === 'feedback') n = countFeedbackUnread();
  else if (kind === 'chat') n = countChatUnread();
  setUnreadCount(kind, n);
}

// Persist talk_read watermark (now) to server prefs; clear local badge.
function markTalkRead(kind) {
  if (!authenticated || !me) {
    setUnreadCount(kind, 0);
    return;
  }
  const field =
    kind === 'news' ? 'news_at' : kind === 'feedback' ? 'feedback_at' : 'chat_at';
  const now = new Date().toISOString();
  const cur = loadPrefsCache(me);
  const tr = { ...(cur.talk_read || {}), [field]: now };
  cachePrefs({ ...cur, talk_read: tr }, me);
  setUnreadCount(kind, 0);
  send({ action: 'setprefs', prefs: { talk_read: { [field]: now } } });
}

// Side-panel tab strips (People + Talk).
function wireSideTabs() {
  document.querySelectorAll('.side-panel').forEach((panel) => {
    const tabs = [...panel.querySelectorAll(':scope > .side-tabs [role="tab"]')];
    if (!tabs.length) return;
    const select = (tab) => {
      const id = tab.getAttribute('aria-controls');
      for (const t of tabs) {
        const on = t === tab;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      }
      for (const pane of panel.querySelectorAll(':scope > .side-pane')) {
        pane.hidden = pane.id !== id;
      }
      // Mark read with now + clear badge (server prefs for multi-device).
      if (id === 'pane-news') markTalkRead('news');
      else if (id === 'pane-feedback') markTalkRead('feedback');
      else if (id === 'pane-chat') markTalkRead('chat');
    };
    for (const tab of tabs) {
      tab.addEventListener('click', () => select(tab));
    }
  });
}

// Empty #chat-log (reconnect / account switch).
function clearChatLog() {
  const ul = $('chat-log');
  if (ul) ul.replaceChildren();
  chatMessages = [];
}

// Coarse relative time for news (client-local).
function formatNewsWhen(iso) {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}d ago`;
  try {
    return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

// Dev compose chrome: visible only when Welcome.is_dev.
function syncNewsCompose() {
  const form = $('news-compose');
  const ta = $('news-body');
  const btn = form?.querySelector('button[type="submit"]');
  if (!form || !ta || !btn) return;
  const on = authenticated && meIsDev;
  form.hidden = !on;
  ta.disabled = !on;
  btn.disabled = !on;
}

// Apply News event (full / add / change / sub).
function applyNews(items, t) {
  const list = items || [];
  const kind = String(t || 'full').toLowerCase();
  if (kind === 'full') {
    newsById.clear();
    for (const it of list) {
      if (it?.id && !it.archived) newsById.set(it.id, it);
    }
  } else if (kind === 'add' || kind === 'change') {
    for (const it of list) {
      if (!it?.id) continue;
      if (it.archived) newsById.delete(it.id);
      else newsById.set(it.id, it);
    }
  } else if (kind === 'sub') {
    for (const it of list) {
      if (it?.id) newsById.delete(it.id);
    }
  }
  renderNews();
  // Default Talk tab is News: on full snapshot (join), auto-mark read with now.
  if (kind === 'full' && isPaneVisible('pane-news')) {
    markTalkRead('news');
  } else if (isPaneVisible('pane-news')) {
    setUnreadCount('news', 0); // live while reading: no badge, watermark on tab open / full
  } else {
    recomputeUnread('news');
  }
}

// Render active news newest-first; Dev archive control.
function renderNews() {
  const ul = $('news-list');
  const empty = $('news-empty');
  if (!ul) return;
  const items = [...newsById.values()].sort((a, b) => {
    const ta = Date.parse(a.created_at || '') || 0;
    const tb = Date.parse(b.created_at || '') || 0;
    return tb - ta;
  });
  if (empty) empty.hidden = items.length > 0;
  const frag = document.createDocumentFragment();
  for (const it of items) {
    const li = document.createElement('li');
    li.className = 'news-item';
    li.dataset.id = it.id;

    const head = document.createElement('div');
    head.className = 'news-head';

    const from = document.createElement('span');
    from.className = 'news-from';
    const author = document.createElement('span');
    author.textContent = it.author || 'Dev';
    from.appendChild(author);
    const badge = document.createElement('span');
    badge.className = 'badge-dev';
    badge.textContent = 'Dev';
    from.appendChild(badge);

    const meta = document.createElement('span');
    meta.className = 'news-meta';
    const when = document.createElement('time');
    when.className = 'news-when';
    when.dateTime = it.created_at || '';
    when.textContent = formatNewsWhen(it.created_at);
    meta.appendChild(when);
    if (meIsDev && it.id) {
      const arch = document.createElement('button');
      arch.type = 'button';
      arch.className = 'news-archive';
      arch.textContent = 'Archive';
      arch.title = 'Archive this post';
      arch.addEventListener('click', () => {
        send({ action: 'newsarchive', id: it.id });
      });
      meta.appendChild(arch);
    }
    head.append(from, meta);

    const body = document.createElement('p');
    body.className = 'news-body';
    body.textContent = it.body || '';

    li.append(head, body);
    frag.appendChild(li);
  }
  ul.replaceChildren(frag);
  syncNewsCompose();
}

const FB_STATUSES = ['open', 'planned', 'done', 'wontfix'];

// New… button + form enable when authenticated.
function syncFeedbackChrome() {
  const btn = $('btn-feedback-new');
  if (btn) btn.disabled = !authenticated;
  const form = $('fb-new-form');
  if (form && !authenticated) form.hidden = true;
}

// Apply Feedback event (full / add / change / sub).
function applyFeedback(items, t) {
  const list = items || [];
  const kind = String(t || 'full').toLowerCase();
  if (kind === 'full') {
    feedbackById.clear();
    for (const it of list) {
      if (it?.id) feedbackById.set(it.id, it);
    }
  } else if (kind === 'add' || kind === 'change') {
    for (const it of list) {
      if (it?.id) feedbackById.set(it.id, it);
    }
  } else if (kind === 'sub') {
    for (const it of list) {
      if (it?.id) {
        feedbackById.delete(it.id);
        if (feedbackExpanded === it.id) feedbackExpanded = '';
      }
    }
  }
  renderFeedback();
  if (isPaneVisible('pane-feedback')) {
    setUnreadCount('feedback', 0);
  } else {
    recomputeUnread('feedback');
  }
}

// Build author label with optional Dev badge.
function appendAuthor(el, name, isDev) {
  const b = document.createElement('b');
  b.appendChild(document.createTextNode(name || '?'));
  if (isDev) {
    b.appendChild(document.createTextNode(' '));
    const badge = document.createElement('span');
    badge.className = 'badge-dev';
    badge.textContent = 'Dev';
    b.appendChild(badge);
  }
  el.appendChild(b);
}

// Render feedback list; expand one thread at a time.
function renderFeedback() {
  const ul = $('feedback-list');
  const empty = $('feedback-empty');
  if (!ul) return;
  const items = [...feedbackById.values()].sort((a, b) => {
    const ta = Date.parse(a.updated_at || a.created_at || '') || 0;
    const tb = Date.parse(b.updated_at || b.created_at || '') || 0;
    return tb - ta;
  });
  if (empty) empty.hidden = items.length > 0;
  const frag = document.createDocumentFragment();
  for (const it of items) {
    const status = String(it.status || 'open').toLowerCase();
    const kind = String(it.kind || 'other').toLowerCase();
    const expanded = feedbackExpanded === it.id;
    const li = document.createElement('li');
    li.className = `fb-item ${status}${kind === 'idea' ? ' idea' : ''}${expanded ? ' expanded' : ''}`;
    li.dataset.id = it.id;

    const summary = document.createElement('div');
    summary.className = 'fb-summary';
    summary.addEventListener('click', () => {
      feedbackExpanded = expanded ? '' : it.id;
      renderFeedback();
    });

    const head = document.createElement('div');
    head.className = 'fb-head';
    const st = document.createElement('span');
    st.className = 'fb-status';
    st.textContent = status;
    const ty = document.createElement('span');
    ty.className = 'fb-type';
    ty.textContent = kind;
    const when = document.createElement('time');
    when.className = 'fb-when';
    when.dateTime = it.updated_at || it.created_at || '';
    when.textContent = formatNewsWhen(it.updated_at || it.created_at);
    head.append(st, ty, when);

    const title = document.createElement('p');
    title.className = 'fb-title';
    title.textContent = it.title || (it.body || '').slice(0, 80) || '(no title)';

    const replies = Array.isArray(it.replies) ? it.replies : [];
    const devReplied = replies.some((r) => r && r.dev);
    const meta = document.createElement('p');
    meta.className = 'fb-meta';
    let metaText = `${it.author || '?'} · ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`;
    if (devReplied) metaText += ' · ';
    meta.appendChild(document.createTextNode(metaText));
    if (devReplied) {
      const badge = document.createElement('span');
      badge.className = 'badge-dev';
      badge.textContent = 'Dev';
      meta.appendChild(badge);
      meta.appendChild(document.createTextNode(' replied'));
    }

    summary.append(head, title, meta);
    li.appendChild(summary);

    if (expanded) {
      const thread = document.createElement('div');
      thread.className = 'fb-thread';
      thread.addEventListener('click', (e) => e.stopPropagation());

      const original = document.createElement('div');
      original.className = 'fb-post';
      appendAuthor(original, it.author, false);
      const body = document.createElement('p');
      body.className = 'fb-body';
      body.textContent = it.body || '';
      original.appendChild(body);
      thread.appendChild(original);

      for (const r of replies) {
        const post = document.createElement('div');
        post.className = 'fb-post' + (r.dev ? ' dev' : '');
        appendAuthor(post, r.author, !!r.dev);
        const p = document.createElement('p');
        p.textContent = r.body || '';
        post.appendChild(p);
        thread.appendChild(post);
      }

      if (authenticated) {
        const replyForm = document.createElement('form');
        replyForm.className = 'fb-reply-form';
        const ta = document.createElement('textarea');
        ta.maxLength = 1000;
        ta.rows = 2;
        ta.placeholder = 'Reply…';
        const submit = document.createElement('button');
        submit.type = 'submit';
        submit.textContent = 'Reply';
        replyForm.append(ta, submit);
        replyForm.addEventListener('submit', (e) => {
          e.preventDefault();
          const text = ta.value.trim();
          if (!text) return;
          send({ action: 'feedbackreply', id: it.id, body: text });
          ta.value = '';
        });
        thread.appendChild(replyForm);
      }

      if (meIsDev) {
        const row = document.createElement('div');
        row.className = 'fb-dev-row';
        const lab = document.createElement('span');
        lab.textContent = 'Status';
        const sel = document.createElement('select');
        sel.className = 'fb-status-select';
        for (const s of FB_STATUSES) {
          const opt = document.createElement('option');
          opt.value = s;
          opt.textContent = s;
          if (s === status) opt.selected = true;
          sel.appendChild(opt);
        }
        sel.addEventListener('change', () => {
          send({ action: 'feedbacksetstatus', id: it.id, status: sel.value });
        });
        row.append(lab, sel);
        thread.appendChild(row);
      }

      li.appendChild(thread);
    }

    frag.appendChild(li);
  }
  ul.replaceChildren(frag);
  syncFeedbackChrome();
}

// Dev badge for chat line: wire is_dev, else self if Welcome said is_dev.
function chatSenderIsDev(from, isDev) {
  if (isDev) return true;
  return !!(meIsDev && me && ukey(from) === ukey(me));
}

// Append one lobby chat line; Dev badge when is_dev (E8b).
function appendChat(from, text, isDev = false) {
  const ul = $('chat-log');
  if (!ul) return;
  const li = document.createElement('li');
  const name = document.createElement('b');
  name.textContent = from;
  li.appendChild(name);
  if (chatSenderIsDev(from, isDev)) {
    li.appendChild(document.createTextNode(' '));
    const badge = document.createElement('span');
    badge.className = 'badge-dev';
    badge.textContent = 'Dev';
    badge.title = 'Developer';
    li.appendChild(badge);
  }
  li.appendChild(document.createTextNode(`: ${text}`));
  ul.appendChild(li);
  ul.scrollTop = ul.scrollHeight;
}

// Replace chat log with server history (ChatHistory on auth — E8g).
function applyChatHistory(messages) {
  chatMessages = [];
  clearChatLog();
  for (const m of messages || []) {
    if (m && m.from != null && m.text != null) {
      chatMessages.push({
        from: m.from,
        text: m.text,
        at: m.at || '',
        is_dev: !!(m.is_dev || m.isDev),
      });
      appendChat(m.from, m.text, !!(m.is_dev || m.isDev));
    }
  }
  if (isPaneVisible('pane-chat')) {
    setUnreadCount('chat', 0);
  } else {
    recomputeUnread('chat');
  }
}

// Live chat: keep buffer + recompute vs chat_at.
function onLiveChat(from, text, isDev) {
  chatMessages.push({
    from,
    text,
    at: new Date().toISOString(),
    is_dev: !!isDev,
  });
  appendChat(from, text, isDev);
  if (isPaneVisible('pane-chat')) {
    setUnreadCount('chat', 0);
  } else {
    recomputeUnread('chat');
  }
}

// ——— events ———

function applyUsers(u, t) {
  if (t === 'full') {
    online.clear();
    for (const [name, raw] of Object.entries(u || {})) {
      online.set(name, normalizePresence(raw));
    }
  } else if (t === 'add' || t === 'change') {
    for (const [name, raw] of Object.entries(u || {})) {
      online.set(name, normalizePresence(raw));
    }
  } else if (t === 'sub') {
    for (const name of Object.keys(u || {})) {
      online.delete(name);
      if (pendingDevDelete && ukey(name) === ukey(pendingDevDelete)) {
        setActionBanner(`Deleted username “${pendingDevDelete}”.`, 'ok');
        pendingDevDelete = '';
      }
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
    if (ev.err === 'user_deleted') {
      handleUserDeleted();
      return;
    }
    // Pre-Welcome auth failure: stop reconnect and show the login form.
    if (!authenticated && (ev.err === 'username_taken' || ev.err === 'authenticate')) {
      handleAuthRejected(ev.err);
      return;
    }
    if (
      authenticated &&
      (ev.err === 'email_mismatch' ||
        ev.err === 'bad_email' ||
        ev.err === 'missing' ||
        ev.err === 'in_game' ||
        ev.err === 'forbidden')
    ) {
      const wasDevDelete = !!pendingDevDelete;
      if (wasDevDelete) pendingDevDelete = '';
      const formErr = document.querySelector('.mp-email-form .mp-email-err');
      const msg =
        ev.err === 'email_mismatch'
          ? 'Current email does not match. Try again.'
          : ev.err === 'bad_email'
            ? 'New email cannot be empty.'
            : ev.err === 'in_game'
              ? wasDevDelete
                ? 'That player must leave their table seat first.'
                : 'Leave the table first, then delete the username.'
              : ev.err === 'forbidden'
                ? 'Not allowed.'
                : wasDevDelete
                  ? 'Could not delete that username.'
                  : 'Could not update account.';
      if (formErr && ev.err !== 'in_game' && ev.err !== 'forbidden' && !wasDevDelete) {
        formErr.textContent = msg;
        formErr.hidden = false;
      }
      setActionBanner(msg, 'err');
      return;
    }
    setActionBanner(ev.err || 'error', 'err');
    return;
  }
  if (a === 'welcome') {
    authenticated = true;
    takenOver = false;
    authRejected = false;
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
    meIsDev = !!(ev.is_dev || ev.isDev);
    authPanel = 'hidden';
    setStatus('online', 'ok');
    setActionBanner(''); // clear sticky err; sync from renderTables / renderHeader
    renderHeader();
    renderTables();
    renderNews();
    renderFeedback();
    renderRanks();
    return;
  }
  if (a === 'prefs') {
    if (ev.prefs) cachePrefs(ev.prefs, me);
    if (authPanel === 'display') syncDisplayPanel();
    return;
  }
  if (a === 'emailchanged') {
    applyEmailChanged(ev.email);
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
  if (a === 'chathistory') {
    applyChatHistory(ev.messages);
    return;
  }
  if (a === 'chat') {
    onLiveChat(ev.from, ev.text, !!(ev.is_dev || ev.isDev));
    return;
  }
  if (a === 'news') {
    applyNews(ev.items, ev.t);
    return;
  }
  if (a === 'feedback') {
    applyFeedback(ev.items, ev.t);
    return;
  }
  if (a === 'ranks') {
    applyRanks(ev);
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
  authRejected = false;
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
    newsById.clear();
    feedbackById.clear();
    feedbackExpanded = '';
    ranksState = { rows: [], you: null };
    clearAllUnread();
    meIsDev = false;
    clearChatLog();
    renderNews();
    renderFeedback();
    renderRanks();
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
  // Auth failure: wait for user to fix name/email (loginAs clears the flag).
  if (authRejected) {
    setStatus('sign-in failed', 'err');
    renderHeader();
    return;
  }
  intentionalClose = false;
  takenOver = false;
  clearReconnect();
  const id = loadIdentity();
  if (!id.username) {
    setStatus('sign in', '');
    pickUnsignedPanel();
    renderHeader();
    return;
  }
  me = id.username;
  setStatus('connecting', '');
  // Connection progress lives in conn-status only (not the banner).
  renderHeader();

  try {
    ws = new WebSocket(LOBBY_WS);
  } catch (e) {
    setStatus('reconnecting', 'err');
    setActionBanner(String(e), 'err');
    scheduleReconnect();
    return;
  }
  renderHeader();

  ws.onopen = () => {
    setStatus('connecting', '');
    clearChatLog(); // ChatHistory on join will refill (E8g)
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
    if (intentionalClose || authRejected) {
      if (authRejected) setStatus('sign-in failed', 'err');
      else setStatus('sign in', '');
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
      setStatus('sign in', '');
      pickUnsignedPanel();
      renderHeader();
      return;
    }
    setStatus('reconnecting', 'err');
    setActionBanner(''); // reconnect attempts: status line only
    scheduleReconnect();
  };

  ws.onerror = () => {
    /* onclose follows */
  };
}

function scheduleReconnect() {
  if (reconnectTimer || takenOver || authRejected || isSignOutGate()) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (
      !takenOver &&
      !authRejected &&
      loadIdentity().username &&
      !isSignOutGate()
    ) {
      connect();
    }
  }, 1500);
}

function doSignOut() {
  clearReconnect();
  intentionalClose = true;
  takenOver = false;
  authRejected = false;
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
  setStatus('sign in', '');
  setActionBanner('');
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
  wireSideTabs();

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
  $('pref-warn-subset')?.addEventListener('change', () => {
    setWarnSubsetFromUi(!!$('pref-warn-subset').checked);
  });

  const howto = $('howto-panel');
  $('btn-howto')?.addEventListener('click', () => {
    if (howto) howto.hidden = false;
  });
  $('btn-howto-close')?.addEventListener('click', () => {
    if (howto) howto.hidden = true;
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
      if (howto && !howto.hidden) {
        howto.hidden = true;
        return;
      }
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

  const newsForm = $('news-compose');
  if (newsForm) {
    newsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!meIsDev) return;
      const ta = $('news-body');
      const body = (ta?.value || '').trim();
      if (!body) return;
      send({ action: 'newspost', body });
      if (ta) ta.value = '';
    });
  }

  const btnFbNew = $('btn-feedback-new');
  const fbNewForm = $('fb-new-form');
  if (btnFbNew && fbNewForm) {
    btnFbNew.addEventListener('click', () => {
      if (!authenticated) return;
      fbNewForm.hidden = false;
      $('fb-new-body')?.focus();
    });
  }
  const fbCancel = $('fb-new-cancel');
  if (fbCancel && fbNewForm) {
    fbCancel.addEventListener('click', () => {
      fbNewForm.hidden = true;
      const title = $('fb-new-title');
      const body = $('fb-new-body');
      if (title) title.value = '';
      if (body) body.value = '';
    });
  }
  if (fbNewForm) {
    fbNewForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!authenticated) return;
      const kind = ($('fb-new-kind')?.value || 'idea').trim();
      const title = ($('fb-new-title')?.value || '').trim();
      const body = ($('fb-new-body')?.value || '').trim();
      if (!body) return;
      send({
        action: 'feedbacknew',
        kind,
        title: title || null,
        body,
      });
      fbNewForm.hidden = true;
      if ($('fb-new-title')) $('fb-new-title').value = '';
      if ($('fb-new-body')) $('fb-new-body').value = '';
    });
  }

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
    setStatus('sign in', '');
    setActionBanner('');
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
  setStatus('sign in', '');
  setActionBanner('');
  renderHeader();
}

main();
