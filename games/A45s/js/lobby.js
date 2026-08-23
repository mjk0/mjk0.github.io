/* Lobby chrome: Yoyo room, A45s identity. Protocol stays in a45s_web.js. */
(function () {
  const $ = (id) => document.getElementById(id);
  const A = A45sWeb;
  const TEAM = ['white', 'red'];
  const TEAM_LABEL = ['White', 'Red'];

  let ws = null;
  let me = '';
  let email = '';
  let isDev = false;
  let authenticated = false;
  let intentionalClose = false;
  let takenOver = false;
  let authRejected = false;
  let authPanel = 'hidden'; // hidden | first | create | gate | manage | howto
  let tables = [];
  let online = [];
  let news = [];
  let feedback = [];
  let chatMessages = []; // { from, text, at } for durable unread recompute
  let fbExpanded = '';
  let unread = { news: 0, chat: 0, feedback: 0 };
  let talkBootstrapped = false; // first News snapshot while News open → mark read
  let optsOpen = '';
  let inviteOpen = '';
  let myPrefs = { robots: 'random', replay: false, friends: [], talk_read: {} };
  let ranksState = { rows: [], you: null };
  // Same path as table.html rank-gear — crisp at small size vs Unicode ⚙.
  const GEAR_SVG = '<svg class="gear-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.07 7.07 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 1h-3.8a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 7.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.82 14.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.43.34.68.22l2.39-.96c.5.39 1.04.7 1.63.94l.36 2.54c.05.24.26.42.5.42h3.8c.24 0 .45-.18.5-.42l.36-2.54c.59-.24 1.13-.55 1.63-.94l2.39.96c.25.1.54 0 .68-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"/></svg>';

  function normalizeTalkRead(tr) {
    const t = tr && typeof tr === 'object' ? tr : {};
    return {
      news_at: t.news_at || null,
      feedback_at: t.feedback_at || null,
      chat_at: t.chat_at || null,
    };
  }
  function normalizePrefs(p) {
    const pack = p && (p.robots === 'classic' || p.robots === 'clown') ? 'classic' : 'random';
    return {
      robots: pack,
      replay: !!(p && p.replay),
      friends: Array.isArray(p && p.friends) ? p.friends.filter((n) => String(n || '').trim()) : [],
      talk_read: normalizeTalkRead(p && p.talk_read),
    };
  }

  function replayChipSvg() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>';
  }

  const ROBOT_PACKS = [
    {
      v: 'random',
      title: 'Random',
      names: 'B.Curly, B.Moe, B.Homer, B.Meow, B.Neo, B.Spock, B.Fry, B.Groot, B.Yoda, B.Chewie, B.Data, B.Hal, B.Gizmo, B.Fozzie, B.Scooby, B.Bugs, B.Elmo, B.Kermit, B.Loki, B.Piglet, B.Goofy, B.R2D2, B.C3PO, B.Porky',
    },
    {
      v: 'classic',
      title: 'Clown',
      names: 'B.Ratfink, B.Homer, B.Turd, B.Donut',
    },
  ];

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function sameName(a, b) {
    return String(a || '').toLowerCase() === String(b || '').toLowerCase();
  }
  function displayTableName(id) {
    const m = /^Open(\d+)$/i.exec(String(id || ''));
    return m ? 'Table #' + m[1] : String(id || '');
  }
  function isOpenTable(id) {
    return /^Open\d+$/i.test(String(id || ''));
  }
  function formatPresenceStatus(p) {
    const w = p && p.where;
    if (w === 'table') {
      return isOpenTable(p.table) ? displayTableName(p.table) : 'waiting';
    }
    if (w === 'playing') {
      return isOpenTable(p.table) ? displayTableName(p.table) + ' · playing' : 'playing';
    }
    return 'lobby';
  }
  function sortPeople(list) {
    const rank = (w) => (w === 'playing' ? 2 : w === 'table' ? 1 : 0);
    return (list || []).slice().sort((a, b) => {
      const d = rank(a.where) - rank(b.where);
      if (d) return d;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }
  function isBot(n) { return /^B\./.test(String(n || '')); }
  function ghostTitle(t, i) {
    const g = t.last && t.last[i];
    return g ? `Sit in for ${g}` : 'Take this seat';
  }
  function teamOf(i) { return TEAM[i & 1]; }
  function teamLabel(i) { return TEAM_LABEL[i & 1]; }

  function setStatus(text, kind) {
    const el = $('conn-status');
    el.textContent = text || '';
    el.className = 'conn-status' + (kind ? ' ' + kind : '');
  }
  function setBanner(text, kind, opts) {
    const el = $('action-banner');
    if (!text) { el.hidden = true; el.textContent = ''; el.className = 'action-banner'; return; }
    el.hidden = false;
    el.className = 'action-banner' + (kind ? ' ' + kind : '');
    if (opts && opts.html) el.innerHTML = text;
    else el.textContent = text;
  }

  function mySeat() {
    for (const t of tables) {
      const seat = (t.seats || []).findIndex((n) => n && sameName(n, me));
      if (seat >= 0) return { table: t, seat };
    }
    return null;
  }
  function minePriv() {
    return tables.find((t) => t.private && sameName(t.id, me));
  }
  function persistSeat() {
    const sess = A.getSession() || {};
    const mine = mySeat();
    A.setSession({
      username: sess.username || me,
      uuid: sess.uuid,
      email: email || sess.email || '',
      table: mine ? mine.table.id : sess.table,
      seat: mine ? mine.seat : sess.seat,
    });
  }
  function goTable(tableId, seat) {
    persistSeat();
    const sess = A.getSession() || {};
    sess.table = tableId;
    sess.seat = seat;
    A.setSession(sess);
    location.href = 'table.html';
  }

  function isLiveWs() {
    return !!ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN);
  }
  function isSignedIn() { return authenticated || (!!me && isLiveWs()); }

  // ——— Auth panels / profile ———
  function closeMenu() {
    $('profile-menu').hidden = true;
    $('btn-profile').setAttribute('aria-expanded', 'false');
  }
  function buildMenu() {
    const menu = $('profile-menu');
    menu.replaceChildren();
    const cur = document.createElement('div');
    cur.className = 'menu-current';
    cur.innerHTML = `Signed in as <b>${esc(me)}</b>`;
    menu.appendChild(cur);
    const others = A.loadProfiles().filter((p) => !sameName(p.username, me));
    if (others.length) {
      const lab = document.createElement('div');
      lab.className = 'menu-label';
      lab.textContent = 'Switch to';
      menu.appendChild(lab);
      others.forEach((p) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'menu-item';
        b.textContent = p.email ? `${p.username} · ${p.email}` : p.username;
        b.addEventListener('click', () => { closeMenu(); loginAs(p.username, p.email || ''); });
        menu.appendChild(b);
      });
    }
    menu.appendChild(Object.assign(document.createElement('div'), { className: 'menu-sep' }));
    const add = (label, cls, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'menu-item' + (cls ? ' ' + cls : '');
      b.textContent = label;
      b.addEventListener('click', () => { closeMenu(); fn(); });
      menu.appendChild(b);
    };
    add('Create new profile…', '', openCreate);
    add('Manage profiles…', '', openManage);
    menu.appendChild(Object.assign(document.createElement('div'), { className: 'menu-sep' }));
    add('Sign out', 'danger', doSignOut);
  }

  function renderContinueChips() {
    const root = $('continue-chips');
    root.replaceChildren(
      ...A.loadProfiles().map((p) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip-profile';
        b.innerHTML = `<span class="chip-name">${esc(p.username)}</span>${
          p.email ? `<span class="chip-email">${esc(p.email)}</span>` : ''
        }`;
        b.addEventListener('click', () => loginAs(p.username, p.email || ''));
        return b;
      }),
    );
  }

  function renderManageList() {
    const ul = $('manage-list');
    const list = A.loadProfiles();
    if (!list.length) {
      ul.innerHTML = '<li class="hint">No saved profiles on this browser.</li>';
      return;
    }
    ul.replaceChildren(...list.map((p) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="mp-name">${esc(p.username)}</span><span class="mp-email">${esc(p.email || '—')}</span>`;
      const forget = document.createElement('button');
      forget.type = 'button';
      forget.className = 'danger';
      forget.textContent = 'Forget';
      forget.addEventListener('click', () => {
        if (!confirm(`Remove “${p.username}” from this browser?`)) return;
        const wasMe = me && sameName(p.username, me);
        A.forgetProfile(p.username);
        if (wasMe && isSignedIn()) { doSignOut(); return; }
        renderManageList();
        renderAuth();
      });
      li.appendChild(forget);
      return li;
    }));
  }

  function renderAuth() {
    const live = isSignedIn();
    const profiles = A.loadProfiles();
    if (live && authPanel !== 'create' && authPanel !== 'manage' && authPanel !== 'howto') {
      authPanel = 'hidden';
    }
    if (!live && !profiles.length && authPanel !== 'create') authPanel = 'first';
    if (!live && A.isSignOutGate() && profiles.length && authPanel === 'hidden') authPanel = 'gate';

    const showLogin = authPanel === 'first' || authPanel === 'create';
    const showGate = authPanel === 'gate';
    $('login-bar').hidden = !showLogin;
    $('continue-gate').hidden = !showGate;
    $('manage-panel').hidden = authPanel !== 'manage';
    $('howto-panel').hidden = authPanel !== 'howto';

    if (showLogin) {
      const isCreate = authPanel === 'create' || (profiles.length && authPanel !== 'first');
      $('login-title').textContent = authRejected
        ? 'Sign-in failed'
        : isCreate && profiles.length ? 'Create new profile' : 'Join the lobby';
      $('login-hint').textContent = authRejected
        ? 'Name may be locked — enter the matching email, or pick another name.'
        : isCreate && profiles.length
          ? 'Add another display name on this browser.'
          : 'Choose a display name. Optional email locks the name to you.';
      $('btn-login').textContent = isCreate && profiles.length ? 'Create & enter' : 'Enter lobby';
      $('btn-login-cancel').hidden = authPanel === 'first' && !profiles.length;
    }
    if (showGate) {
      $('continue-label').textContent = takenOver
        ? 'Signed in elsewhere — continue as'
        : 'Continue as';
      renderContinueChips();
    }
    if (authPanel === 'manage') renderManageList();

    $('hdr-you').innerHTML = me ? `<b>${esc(me)}</b>` : 'not signed in';
    $('profile-caret').hidden = !live;
    $('btn-profile').disabled = !live;
    if (!live) closeMenu();
    $('btn-create').disabled = !authenticated;
    const chatOn = authenticated;
    $('chat-text').disabled = !chatOn;
    $('chat-form').querySelector('button').disabled = !chatOn;
    $('btn-feedback-new').disabled = !authenticated;
    $('news-compose').hidden = !isDev;
    syncBanner();
  }

  function openCreate() {
    authPanel = 'create';
    $('in-user').value = '';
    $('in-email').value = '';
    renderAuth();
    $('in-user').focus();
  }
  function openManage() { authPanel = 'manage'; renderAuth(); }
  function openHowto() { authPanel = 'howto'; renderAuth(); }
  function closeOverlay() {
    if (isSignedIn()) authPanel = 'hidden';
    else if (A.loadProfiles().length) authPanel = 'gate';
    else authPanel = 'first';
    renderAuth();
  }
  function doSignOut() {
    A.setSignOutGate(true);
    A.setSession(null);
    intentionalClose = true;
    authenticated = false;
    me = '';
    email = '';
    if (ws) { try { ws.close(); } catch (_) {} ws = null; }
    tables = [];
    online = [];
    news = [];
    feedback = [];
    chatMessages = [];
    talkBootstrapped = false;
    myPrefs = normalizePrefs(null);
    ranksState = { rows: [], you: null };
    clearAllUnread();
    authPanel = A.loadProfiles().length ? 'gate' : 'first';
    setStatus('sign in');
    renderTables();
    renderOnline();
    renderRanks();
    renderAuth();
  }

  function loginAs(username, em) {
    $('in-user').value = username;
    $('in-email').value = em || '';
    startLogin(username, em || '');
  }
  function startLogin(username, em) {
    authRejected = false;
    takenOver = false;
    email = em || '';
    setStatus('connecting…');
    if (ws) { intentionalClose = true; try { ws.close(); } catch (_) {} }
    intentionalClose = false;
    ws = A.connect('lobby', onMsg, onClose);
    ws.onopen = () => A.send(ws, { action: 'login', username, email: em || '' });
  }

  // ——— Tables / people ———
  function syncBanner() {
    if (takenOver || authRejected) return;
    if (!authenticated) {
      if (authPanel === 'gate') setBanner('Choose a profile to rejoin.', 'prompt');
      else if (!A.loadProfiles().length && authPanel === 'first') {
        setBanner('Create a profile to join tables.', 'prompt');
      } else setBanner('Sign in to see live tables.', 'prompt');
      return;
    }
    const mine = mySeat();
    if (mine && !mine.table.started) {
      const host = mine.table.private && !sameName(mine.table.id, me);
      setBanner(
        host
          ? 'Waiting for the host to start the game.'
          : 'Press <strong>Start</strong> when all intended players are ready.',
        'prompt',
        { html: !host },
      );
      return;
    }
    if (mine && mine.table.started) { setBanner(''); return; }
    setBanner(
      'Choose a table and <strong>Sit</strong> at an open seat — or <i>Create private</i>',
      'prompt',
      { html: true },
    );
  }

  function invitedList(t) {
    return (t && t.invited || []).filter((n) => String(n || '').trim());
  }
  function nameInList(list, name) {
    return (list || []).some((n) => sameName(n, name));
  }
  function sendInviteList(list) {
    A.send(ws, { action: 'invite', list: list.slice() });
  }
  function inviteAdd(name, asFriend) {
    const t = minePriv();
    if (!t || sameName(name, me)) return;
    const n = String(name || '').trim();
    if (!n) return;
    const list = invitedList(t);
    if (!nameInList(list, n)) list.push(n);
    sendInviteList(list);
    if (asFriend && !nameInList(myPrefs.friends, n)) {
      const friends = myPrefs.friends.concat([n]);
      myPrefs.friends = friends;
      A.send(ws, { action: 'setprefs', friends });
    }
  }
  function inviteRemove(name) {
    const t = minePriv();
    if (!t) return;
    sendInviteList(invitedList(t).filter((n) => !sameName(n, name)));
  }
  function unfriend(name) {
    const friends = myPrefs.friends.filter((n) => !sameName(n, name));
    myPrefs.friends = friends;
    A.send(ws, { action: 'setprefs', friends });
  }
  function mergeFriendsIntoInvited(t) {
    if (!t || !myPrefs.friends.length) return;
    const list = invitedList(t);
    let changed = false;
    myPrefs.friends.forEach((f) => {
      if (sameName(f, me) || nameInList(list, f)) return;
      list.push(f);
      changed = true;
    });
    if (changed) sendInviteList(list);
  }

  function renderOnline() {
    const ul = $('online-list');
    ul.innerHTML = '';
    const canInvite = !!(minePriv() && !minePriv().started);
    const people = sortPeople(online);
    if (!people.length) {
      ul.innerHTML = '<li class="empty-state">No one signed in.</li>';
      return;
    }
    people.forEach((p) => {
      const n = p.name;
      const li = document.createElement('li');
      if (sameName(n, me)) li.classList.add('me');
      if (canInvite && !sameName(n, me)) {
        li.classList.add('inviteable');
        li.title = 'Invite to your private table';
        li.addEventListener('click', () => inviteAdd(n));
      }
      li.innerHTML = `<span class="player-name">${esc(n)}</span><span class="player-status">${esc(formatPresenceStatus(p))}</span>`;
      ul.appendChild(li);
    });
  }

  function seatSlot(t, i) {
    const who = t.seats[i];
    const slot = document.createElement('div');
    slot.className = 'seat-slot ' + teamOf(i);
    if (who) slot.classList.add('filled', isBot(who) ? 'bot' : 'human');
    if (who && sameName(who, me)) slot.classList.add('mine');
    if (who) {
      const nm = document.createElement('span');
      nm.className = 'name' + (isBot(who) ? ' bot' : '');
      nm.textContent = who;
      nm.title = teamLabel(i) + ': ' + who;
      slot.appendChild(nm);
      if (!t.started && sameName(who, me)) {
        const leave = document.createElement('button');
        leave.type = 'button';
        leave.textContent = 'Leave';
        leave.setAttribute('aria-label', 'Leave ' + teamLabel(i));
        leave.addEventListener('click', () => A.send(ws, { action: 'leave' }));
        slot.appendChild(leave);
      }
    } else if (!t.started) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Sit';
      b.disabled = !authenticated;
      b.setAttribute('aria-label', 'Sit ' + teamLabel(i));
      b.addEventListener('click', () => A.send(ws, { action: 'sitat', table: t.id, seat: i }));
      slot.appendChild(b);
    } else {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Join';
      b.disabled = !authenticated;
      b.title = ghostTitle(t, i);
      b.setAttribute('aria-label', (ghostTitle(t, i) || 'Join') + ' · ' + teamLabel(i));
      if (authenticated) {
        b.addEventListener('click', () => goTable(t.id, i));
      }
      slot.appendChild(b);
      const ghost = t.last && t.last[i];
      if (ghost) {
        const ln = document.createElement('span');
        ln.className = 'last-name' + (sameName(ghost, me) ? ' yours' : '');
        ln.textContent = ghost;
        slot.appendChild(ln);
      }
    }
    return slot;
  }

  function seatPairs(t) {
    const wrap = document.createElement('div');
    wrap.className = 'seat-pairs';
    [
      { team: 'white', label: 'White', seats: [0, 2] },
      { team: 'red', label: 'Red', seats: [1, 3] },
    ].forEach((p) => {
      const pair = document.createElement('div');
      pair.className = 'seat-pair ' + p.team;
      pair.setAttribute('role', 'group');
      pair.setAttribute('aria-label', p.label + ' team');
      const lab = document.createElement('span');
      lab.className = 'pair-label';
      lab.textContent = p.label;
      pair.appendChild(lab);
      p.seats.forEach((i) => pair.appendChild(seatSlot(t, i)));
      wrap.appendChild(pair);
    });
    return wrap;
  }

  function closeOpts() {
    optsOpen = '';
    document.querySelectorAll('.opts-popover[data-portal]').forEach((el) => el.remove());
  }
  function closeInvite() {
    inviteOpen = '';
    document.querySelectorAll('.invite-panel[data-portal]').forEach((el) => el.remove());
  }

  function placePopover(anchor, pop) {
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth || 208;
    const h = pop.offsetHeight || 120;
    let left = r.right - w;
    if (left < 8) left = 8;
    if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
    let top = r.bottom + 4;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }

  function renderOptsPopover(t) {
    const pop = document.createElement('div');
    pop.className = 'opts-popover';
    pop.dataset.portal = '1';
    pop.dataset.table = t.id;
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Table options');
    pop.addEventListener('click', (e) => e.stopPropagation());
    const lab = document.createElement('div');
    lab.className = 'opts-label';
    lab.textContent = 'Robot names';
    pop.appendChild(lab);
    const curPack = (t.robots === 'classic' || t.robots === 'clown') ? 'classic' : 'random';
    const packRow = document.createElement('div');
    packRow.className = 'opts-pack-row';
    packRow.setAttribute('role', 'group');
    packRow.setAttribute('aria-label', 'Robot names');
    const names = document.createElement('div');
    names.className = 'opts-names';
    const setPackUi = (pack) => {
      const opt = ROBOT_PACKS.find((p) => p.v === pack) || ROBOT_PACKS[0];
      packRow.querySelectorAll('.opts-pack-btn').forEach((b) => {
        const on = b.dataset.pack === opt.v;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      names.textContent = opt.names;
      names.title = opt.names;
    };
    ROBOT_PACKS.forEach((opt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'opts-pack-btn';
      btn.dataset.pack = opt.v;
      btn.textContent = opt.title;
      btn.addEventListener('click', () => {
        if (btn.getAttribute('aria-pressed') === 'true') return;
        A.send(ws, { action: 'setrobots', table: t.id, pack: opt.v });
        setPackUi(opt.v);
      });
      packRow.appendChild(btn);
    });
    pop.appendChild(packRow);
    pop.appendChild(names);
    setPackUi(curPack);
    const lab2 = document.createElement('div');
    lab2.className = 'opts-label opts-label-gap';
    lab2.textContent = 'Deal';
    pop.appendChild(lab2);
    const row = document.createElement('label');
    row.className = 'opts-check';
    const inp = document.createElement('input');
    inp.type = 'checkbox';
    inp.checked = !!t.replay;
    inp.addEventListener('change', () => {
      A.send(ws, { action: 'setreplay', table: t.id, on: inp.checked });
    });
    const txt = document.createElement('span');
    txt.innerHTML = `Allow <span class="opts-replay-mark">${replayChipSvg()} Replay</span>`;
    const hint = document.createElement('span');
    hint.className = 'hint';
    hint.textContent = 'Same cards, bidding starts over';
    txt.appendChild(hint);
    row.appendChild(inp);
    row.appendChild(txt);
    pop.appendChild(row);
    return pop;
  }

  function mountOpenPopovers() {
    document.querySelectorAll('.opts-popover[data-portal], .invite-panel[data-portal]').forEach((el) => el.remove());
    if (optsOpen) {
      const t = tables.find((x) => x.id === optsOpen);
      const btn = document.querySelector(`.gear-btn[data-table="${CSS.escape(optsOpen)}"]`);
      if (!t || !btn) optsOpen = '';
      else {
        const pop = renderOptsPopover(t);
        document.body.appendChild(pop);
        placePopover(btn, pop);
      }
    }
    if (inviteOpen) {
      const t = tables.find((x) => x.id === inviteOpen);
      const btn = document.querySelector(`.invite-summary-btn[data-table="${CSS.escape(inviteOpen)}"]`);
      if (!t || !btn) inviteOpen = '';
      else {
        const pop = renderInvitePanel(t);
        document.body.appendChild(pop);
        placePopover(btn, pop);
      }
    }
  }

  function gearBtn(t) {
    const wrap = document.createElement('div');
    wrap.className = 'table-gear';
    const gear = document.createElement('button');
    gear.type = 'button';
    gear.className = 'icon-btn gear-btn';
    gear.dataset.table = t.id;
    gear.innerHTML = GEAR_SVG;
    gear.title = 'Table options';
    gear.setAttribute('aria-label', 'Table options');
    gear.setAttribute('aria-expanded', optsOpen === t.id ? 'true' : 'false');
    gear.addEventListener('click', (e) => {
      e.stopPropagation();
      closeInvite();
      optsOpen = optsOpen === t.id ? '' : t.id;
      renderTables();
    });
    wrap.appendChild(gear);
    return wrap;
  }

  function renderInvitePanel(t) {
    const pop = document.createElement('div');
    pop.className = 'invite-panel';
    pop.dataset.portal = '1';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Invite players');
    pop.addEventListener('click', (e) => e.stopPropagation());
    const inv = invitedList(t);
    const friends = myPrefs.friends;
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

    const cur = document.createElement('div');
    cur.className = 'invite-chips';
    if (!inv.length) {
      const empty = document.createElement('span');
      empty.className = 'invite-empty';
      empty.textContent = 'No one invited yet';
      cur.appendChild(empty);
    } else {
      inv.forEach((name) => {
        const chip = document.createElement('span');
        chip.className = 'invite-chip' + (nameInList(friends, name) ? ' friend' : '');
        chip.appendChild(document.createTextNode(name + (nameInList(friends, name) ? ' ★' : '')));
        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'invite-x';
        x.textContent = '×';
        x.title = 'Remove invite';
        x.addEventListener('click', () => inviteRemove(name));
        chip.appendChild(x);
        cur.appendChild(chip);
      });
    }
    pop.appendChild(section('Invited (' + inv.length + ')', cur));

    const others = sortPeople(
      online.filter((p) => !sameName(p.name, me) && !nameInList(inv, p.name)),
    );
    const inLobby = others.filter((p) => p.where !== 'playing');
    const inGame = others.filter((p) => p.where === 'playing');
    const addRow = (name, playing) => {
      const row = document.createElement('span');
      row.className = 'invite-add-row' + (playing ? ' in-game' : '');
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'invite-plus';
      add.textContent = '+ ' + name;
      add.title = playing
        ? "In a game — they'll see this table when they return."
        : 'Invite';
      add.addEventListener('click', () => inviteAdd(name, false));
      const star = document.createElement('button');
      star.type = 'button';
      star.className = 'icon-btn invite-star';
      star.textContent = '★';
      star.title = 'Invite and mark as friend (always invited)';
      star.addEventListener('click', () => inviteAdd(name, true));
      row.appendChild(add);
      row.appendChild(star);
      return row;
    };

    const lobbyHost = document.createElement('div');
    lobbyHost.className = 'invite-chips';
    if (!inLobby.length) {
      if (!inGame.length) {
        const empty = document.createElement('span');
        empty.className = 'invite-empty';
        empty.textContent = 'No other players online';
        lobbyHost.appendChild(empty);
        pop.appendChild(section('In lobby', lobbyHost));
      }
    } else {
      inLobby.forEach((p) => lobbyHost.appendChild(addRow(p.name, false)));
      pop.appendChild(section('In lobby', lobbyHost));
    }
    if (inGame.length) {
      const gameHost = document.createElement('div');
      gameHost.className = 'invite-chips';
      inGame.forEach((p) => gameHost.appendChild(addRow(p.name, true)));
      pop.appendChild(section('In a game', gameHost));
    }

    const frHost = document.createElement('div');
    frHost.className = 'invite-chips';
    if (!friends.length) {
      const empty = document.createElement('span');
      empty.className = 'invite-empty';
      empty.textContent = 'No friends yet — use ★ when inviting';
      frHost.appendChild(empty);
    } else {
      friends.forEach((name) => {
        const chip = document.createElement('span');
        chip.className = 'invite-chip friend';
        chip.appendChild(document.createTextNode(name));
        if (!nameInList(inv, name)) {
          const add = document.createElement('button');
          add.type = 'button';
          add.className = 'invite-mini';
          add.textContent = '+';
          add.title = 'Invite now';
          add.addEventListener('click', () => inviteAdd(name, false));
          chip.appendChild(add);
        }
        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'invite-x';
        x.textContent = '×';
        x.title = 'Unfriend';
        x.addEventListener('click', () => unfriend(name));
        chip.appendChild(x);
        frHost.appendChild(chip);
      });
    }
    pop.appendChild(section('Friends (auto-invited)', frHost));

    const type = document.createElement('form');
    type.className = 'invite-type';
    type.innerHTML = '<input type="text" maxlength="32" placeholder="Invite by name…">';
    type.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const inp = type.querySelector('input');
      const n = inp.value.trim();
      if (n) { inviteAdd(n, false); inp.value = ''; }
    });
    pop.appendChild(type);
    return pop;
  }

  function renderInviteRow(t) {
    const row = document.createElement('div');
    row.className = 'invite-row';
    const inv = invitedList(t);
    const owner = t.private && sameName(t.id, me);
    if (owner) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'invite-summary-btn';
      btn.dataset.table = t.id;
      btn.setAttribute('aria-expanded', inviteOpen === t.id ? 'true' : 'false');
      btn.textContent = inv.length ? '👤 Invited: ' + inv.length : '👤 Invite';
      btn.title = inv.length ? inv.join(', ') : 'Invite players';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeOpts();
        if (inviteOpen === t.id) {
          inviteOpen = '';
        } else {
          inviteOpen = t.id;
          mergeFriendsIntoInvited(t);
        }
        renderTables();
      });
      row.appendChild(btn);
    }
    if (inv.length) {
      const names = document.createElement('span');
      names.className = 'invite-names';
      names.textContent = (owner ? '' : 'Invited: ') + inv.join(', ');
      names.title = inv.join(', ');
      row.appendChild(names);
    } else if (!owner) {
      return null;
    }
    return row;
  }

  function renderTable(t) {
    const seatedHere = (t.seats || []).some((n) => n && sameName(n, me));
    const card = document.createElement('article');
    card.className = 'table-card'
      + (t.private ? ' private' : ' open')
      + (t.started ? ' playing in-progress' : '');
    const hdr = document.createElement('header');
    hdr.className = 'table-head';
    const title = document.createElement('span');
    title.className = 'table-name';
    title.textContent = t.private ? t.id : t.id.replace(/^Open(\d+)$/i, 'Table #$1');
    const nameWrap = document.createElement('span');
    nameWrap.className = 'table-name-wrap';
    nameWrap.appendChild(title);
    const owner = t.private && sameName(t.id, me);
    // Waiting options: open if seated; private owner even if not sitting.
    if (!t.started && (owner || seatedHere)) {
      nameWrap.appendChild(gearBtn(t));
    }
    hdr.appendChild(nameWrap);
    if (t.private) {
      const badge = document.createElement('span');
      badge.className = 'table-kind-badge';
      badge.textContent = 'Private';
      hdr.appendChild(badge);
    }
    if (t.started) {
      const live = document.createElement('span');
      live.className = 'table-live-badge';
      live.textContent = 'In progress';
      live.title = 'Game already started';
      hdr.appendChild(live);
    }
    if (t.robots === 'classic') {
      const chip = document.createElement('span');
      chip.className = 'table-opt-chip';
      chip.textContent = '🤡';
      chip.title = 'Clown names (B.Ratfink…)';
      chip.setAttribute('aria-label', 'Clown names');
      hdr.appendChild(chip);
    }
    if (t.replay) {
      const chip = document.createElement('span');
      chip.className = 'table-opt-chip';
      chip.innerHTML = replayChipSvg();
      chip.title = 'Replay this deal';
      chip.setAttribute('aria-label', 'Replay this deal');
      hdr.appendChild(chip);
    }
    const cluster = document.createElement('div');
    cluster.className = 'status-cluster';
    if (!t.started) {
      const st = document.createElement('span');
      st.className = 'status';
      st.textContent = 'Waiting';
      cluster.appendChild(st);
      if (seatedHere) {
        const start = document.createElement('button');
        start.type = 'button';
        start.className = 'start-btn start-ready';
        start.textContent = '▶ Start';
        start.addEventListener('click', () => A.send(ws, { action: 'start', table: t.id }));
        cluster.appendChild(start);
      } else if (authenticated) {
        const idle = document.createElement('button');
        idle.type = 'button';
        idle.className = 'start-btn start-idle';
        idle.disabled = true;
        idle.textContent = 'Sit to start';
        cluster.appendChild(idle);
      }
    }
    if (owner && t.started) {
      const stop = document.createElement('button');
      stop.type = 'button';
      stop.className = 'stop-btn';
      stop.textContent = '■ Stop';
      stop.title = 'End game and open a fresh table (same options & invites)';
      stop.setAttribute('aria-label', stop.title);
      stop.addEventListener('click', () => {
        A.send(ws, { action: 'stop', table: t.id });
      });
      cluster.appendChild(stop);
    }
    if (owner) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn trash-btn';
      del.textContent = '🗑';
      const occupied = t.started && t.seats.some((n) => n && !sameName(n, me));
      del.title = t.started ? 'Delete this game' : 'Delete private table';
      del.setAttribute('aria-label', del.title);
      del.addEventListener('click', () => {
        if (occupied && !confirm('Delete this game? Players will be sent to the lobby.')) return;
        A.send(ws, { action: 'gkill', table: t.id });
      });
      cluster.appendChild(del);
    }
    hdr.appendChild(cluster);
    card.appendChild(hdr);

    card.appendChild(seatPairs(t));

    if (t.private) {
      const extras = renderInviteRow(t);
      if (extras) card.appendChild(extras);
    }
    return card;
  }

  function renderTables() {
    const root = $('tables-root');
    if (!tables.length) {
      root.innerHTML = authenticated
        ? '<p class="hint">No tables — create a private table or wait for opens.</p>'
        : '<p class="hint">Sign in to see live tables.</p>';
      renderOnline();
      syncBanner();
      mountOpenPopovers();
      return;
    }
    const priv = tables.filter((t) => t.private);
    const open = tables.filter((t) => !t.private);
    const frag = document.createDocumentFragment();
    const lab = (text, cls) => {
      const p = document.createElement('p');
      p.className = 'tables-section-label' + (cls ? ' ' + cls : '');
      p.textContent = text;
      return p;
    };
    if (priv.length) {
      if (open.length) frag.appendChild(lab('Private tables', 'private'));
      priv.forEach((t) => frag.appendChild(renderTable(t)));
    }
    if (open.length) {
      if (priv.length) frag.appendChild(lab('Open tables'));
      open.forEach((t) => frag.appendChild(renderTable(t)));
    }
    root.replaceChildren(frag);
    renderOnline();
    syncBanner();
    requestAnimationFrame(mountOpenPopovers);
  }

  // ——— Ranks (lifetime team-score avg from UserStore) ———
  function formatRankAvg(r) {
    const a = Number(r && r.avg);
    if (!Number.isFinite(a)) return '—';
    return String(Math.round(a));
  }
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
      if (me && sameName(r.name, me)) tr.classList.add('me');
      const tdRk = document.createElement('td');
      tdRk.className = 'rk';
      tdRk.textContent = r.rank != null ? String(r.rank) : '—';
      const tdNm = document.createElement('td');
      tdNm.className = 'nm';
      tdNm.textContent = r.name || '?';
      const tdAvg = document.createElement('td');
      tdAvg.className = 'avg';
      tdAvg.textContent = formatRankAvg(r);
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
          youMeta.textContent = `#${y.rank} · avg ${formatRankAvg(y)} · ${g} series`;
        } else if (g < 10) {
          const left = Math.max(0, 10 - g);
          youMeta.textContent =
            g === 0
              ? 'play 10 series to rank'
              : `${g}/10 series · ${left} more to rank`;
        } else {
          youMeta.textContent = `avg ${formatRankAvg(y)} · ${g} series`;
        }
      } else {
        youMeta.textContent = 'play 10 series to rank';
      }
    }
  }

  // ——— Talk (durable unread via prefs.talk_read watermarks) ———
  function isPaneVisible(paneId) {
    const pane = $(paneId);
    return !!(pane && !pane.hidden);
  }
  function talkRead() {
    return normalizeTalkRead(myPrefs && myPrefs.talk_read);
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
  function countNewsUnread() {
    const wm = talkRead().news_at;
    let n = 0;
    for (const it of news) {
      if (sameName(it.author, me)) continue;
      if (isoAfter(wm, it.created_at)) n += 1;
    }
    return n;
  }
  // +1 per new topic + +1 per reply after feedback_at (not self).
  function countFeedbackUnread() {
    const wm = talkRead().feedback_at;
    let n = 0;
    for (const it of feedback) {
      if (!sameName(it.author, me) && isoAfter(wm, it.created_at)) n += 1;
      for (const r of it.replies || []) {
        if (!sameName(r.author, me) && isoAfter(wm, r.created_at)) n += 1;
      }
    }
    return n;
  }
  function countChatUnread() {
    const wm = talkRead().chat_at;
    let n = 0;
    for (const m of chatMessages) {
      if (sameName(m.from, me)) continue;
      if (isoAfter(wm, m.at)) n += 1;
    }
    return n;
  }
  function setUnreadCount(kind, n) {
    if (!(kind in unread)) return;
    unread[kind] = Math.min(99, Math.max(0, n | 0));
    const el = $(`badge-${kind}`);
    if (!el) return;
    if (unread[kind] > 0) {
      el.hidden = false;
      el.textContent = unread[kind] > 99 ? '99+' : String(unread[kind]);
    } else {
      el.hidden = true;
      el.textContent = '0';
    }
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
  function recomputeAllUnread() {
    recomputeUnread('news');
    recomputeUnread('feedback');
    recomputeUnread('chat');
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
    myPrefs.talk_read = { ...talkRead(), [field]: now };
    setUnreadCount(kind, 0);
    A.send(ws, { action: 'setprefs', talk_read: { [field]: now } });
  }
  function bindTabs(panel) {
    const tabs = [...panel.querySelectorAll(':scope > .side-tabs [role="tab"]')];
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => {
          const on = t === tab;
          t.classList.toggle('active', on);
          t.setAttribute('aria-selected', on ? 'true' : 'false');
          const pane = $(t.getAttribute('aria-controls'));
          if (pane) pane.hidden = !on;
        });
        const id = tab.id.replace('tab-', '');
        if (id === 'news' || id === 'feedback' || id === 'chat') markTalkRead(id);
      });
    });
  }

  function addChat(from, text, at) {
    const when = at || new Date().toISOString();
    chatMessages.push({ from, text, at: when });
    const ul = $('chat-log');
    const li = document.createElement('li');
    li.innerHTML = `<b>${esc(from)}</b> ${esc(text)}`;
    ul.appendChild(li);
    ul.scrollTop = ul.scrollHeight;
  }

  function whenShort(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function renderNews() {
    const ul = $('news-list');
    ul.innerHTML = '';
    $('news-empty').hidden = news.length > 0;
    news.forEach((n) => {
      const li = document.createElement('li');
      li.className = 'news-item';
      li.innerHTML = `<div class="news-head"><span>${esc(n.author)}</span><span class="fb-when">${esc(whenShort(n.created_at))}</span></div>
        <p class="news-body">${esc(n.body)}</p>`;
      if (isDev) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'news-archive';
        b.textContent = 'archive';
        b.addEventListener('click', () => A.send(ws, { action: 'newsarchive', id: n.id }));
        li.appendChild(b);
      }
      ul.appendChild(li);
    });
  }

  function renderFeedback() {
    const ul = $('feedback-list');
    ul.innerHTML = '';
    $('feedback-empty').hidden = feedback.length > 0;
    feedback.forEach((f) => {
      const li = document.createElement('li');
      li.className = 'fb-item ' + (f.status || 'open') + ' ' + (f.kind || '');
      const open = fbExpanded === f.id;
      li.innerHTML = `<div class="fb-summary">
        <div class="fb-head">
          <span class="fb-status">${esc(f.status || 'open')}</span>
          <span class="fb-type">${esc(f.kind || '')}</span>
          <span class="fb-when">${esc(whenShort(f.created_at))}</span>
        </div>
        <p class="fb-title">${esc(f.title || f.body)}</p>
        <p class="fb-meta">${esc(f.author)}</p>
      </div>`;
      li.querySelector('.fb-summary').addEventListener('click', () => {
        fbExpanded = open ? '' : f.id;
        renderFeedback();
      });
      if (open) {
        const th = document.createElement('div');
        th.className = 'fb-thread';
        const body = document.createElement('p');
        body.textContent = f.body;
        th.appendChild(body);
        (f.replies || []).forEach((r) => {
          const p = document.createElement('p');
          p.innerHTML = `<b>${esc(r.author)}</b> ${esc(r.body)}`;
          th.appendChild(p);
        });
        const reply = document.createElement('form');
        reply.className = 'fb-reply-form';
        reply.innerHTML = '<textarea rows="2" maxlength="2000" placeholder="Reply"></textarea><button type="submit">Reply</button>';
        reply.addEventListener('submit', (ev) => {
          ev.preventDefault();
          const text = reply.querySelector('textarea').value.trim();
          if (text) A.send(ws, { action: 'feedbackreply', id: f.id, body: text });
        });
        th.appendChild(reply);
        if (isDev) {
          const row = document.createElement('div');
          row.className = 'fb-dev-row';
          ['open', 'planned', 'done', 'wontfix'].forEach((st) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = st;
            b.addEventListener('click', () => A.send(ws, { action: 'feedbacksetstatus', id: f.id, status: st }));
            row.appendChild(b);
          });
          th.appendChild(row);
        }
        li.appendChild(th);
      }
      ul.appendChild(li);
    });
  }

  // ——— Wire ———
  function onMsg(j) {
    if (j.action === 'welcome') {
      isDev = !!j.is_dev;
      me = j.username;
      authenticated = true;
      A.setSignOutGate(false);
      A.setSession({ username: j.username, uuid: j.uuid, email });
      A.upsertProfile(j.username, email);
      myPrefs = normalizePrefs(j.prefs);
      authPanel = 'hidden';
      setStatus('online', 'ok');
      renderAuth();
      renderTables();
      return;
    }
    if (j.action === 'tables') {
      tables = j.tables || [];
      persistSeat();
      renderTables();
      if (sessionStorage.getItem('a45s.justLeft')) {
        // Keep the flag until this seat is no longer in a live table.
        const still = mySeat();
        if (still && still.table.started) return;
        sessionStorage.removeItem('a45s.justLeft');
        return;
      }
      const mine = mySeat();
      if (mine && mine.table.started) goTable(mine.table.id, mine.seat);
      return;
    }
    if (j.action === 'prefs') {
      myPrefs = normalizePrefs(j.prefs);
      recomputeAllUnread();
      renderTables();
      return;
    }
    if (j.action === 'ranks') {
      ranksState = { rows: j.rows || [], you: j.you || null };
      renderRanks();
      return;
    }
    if (j.action === 'users') {
      online = Array.isArray(j.people) ? j.people : [];
      renderOnline();
      if (inviteOpen) requestAnimationFrame(mountOpenPopovers);
      return;
    }
    if (j.action === 'started') {
      if (sessionStorage.getItem('a45s.justLeft')) return;
      persistSeat();
      goTable(j.table, j.seat);
      return;
    }
    if (j.action === 'chathistory') {
      $('chat-log').innerHTML = '';
      chatMessages = [];
      (j.messages || []).forEach((m) => addChat(m.from, m.text, m.at));
      if (isPaneVisible('pane-chat')) setUnreadCount('chat', 0);
      else recomputeUnread('chat');
      return;
    }
    if (j.action === 'chat') {
      // Live Chat has no `at` on the wire — synthesize so watermark recompute works.
      addChat(j.from, j.text, new Date().toISOString());
      if (isPaneVisible('pane-chat')) setUnreadCount('chat', 0);
      else recomputeUnread('chat');
      return;
    }
    if (j.action === 'news') {
      news = j.items || [];
      renderNews();
      // Default Talk tab is News: first snapshot while open advances watermark (join).
      if (isPaneVisible('pane-news')) {
        if (!talkBootstrapped) markTalkRead('news');
        else setUnreadCount('news', 0);
      } else {
        recomputeUnread('news');
      }
      talkBootstrapped = true;
      return;
    }
    if (j.action === 'feedback') {
      feedback = j.items || [];
      renderFeedback();
      if (isPaneVisible('pane-feedback')) setUnreadCount('feedback', 0);
      else recomputeUnread('feedback');
      return;
    }
    if (j.action === 'err') {
      if (j.err === 'duplicate_login') {
        takenOver = true;
        authenticated = false;
        A.setSignOutGate(true);
        A.setSession(null);
        setStatus('signed in elsewhere', 'err');
        authPanel = A.loadProfiles().length ? 'gate' : 'first';
        renderAuth();
        return;
      }
      if (j.err === 'username_taken') {
        authRejected = true;
        authenticated = false;
        setStatus('sign-in failed', 'err');
        setBanner('That name is locked. Enter the matching email.', 'err');
        authPanel = A.loadProfiles().length ? 'create' : 'first';
        renderAuth();
        $('in-email').focus();
        return;
      }
      setBanner(j.err || 'error', 'err');
      setStatus(j.err || 'error', 'err');
    }
  }

  function onClose() {
    authenticated = false;
    if (intentionalClose) { intentionalClose = false; return; }
    if (takenOver) { renderAuth(); return; }
    if (me && !A.isSignOutGate()) {
      setStatus('reconnecting…', 'err');
      setTimeout(() => { if (!isLiveWs()) startLogin(me, email); }, 900);
      return;
    }
    authPanel = A.loadProfiles().length ? 'gate' : 'first';
    setStatus('sign in');
    renderAuth();
  }

  // ——— Bind ———
  bindTabs(document.querySelector('.people-panel'));
  bindTabs(document.querySelector('.talk-panel'));

  $('btn-login').addEventListener('click', () => {
    const name = $('in-user').value.trim();
    if (!name) { setBanner('name required', 'err'); return; }
    startLogin(name, $('in-email').value.trim());
  });
  $('in-user').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') $('btn-login').click(); });
  $('in-email').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') $('btn-login').click(); });
  $('btn-login-cancel').addEventListener('click', closeOverlay);
  $('btn-another-name').addEventListener('click', openCreate);
  $('btn-gate-manage').addEventListener('click', openManage);
  $('btn-manage-close').addEventListener('click', closeOverlay);
  $('btn-howto').addEventListener('click', openHowto);
  $('btn-howto-close').addEventListener('click', closeOverlay);
  $('btn-create').addEventListener('click', () => A.send(ws, { action: 'create' }));
  $('btn-profile').addEventListener('click', (e) => {
    e.stopPropagation();
    if (!isSignedIn()) return;
    const menu = $('profile-menu');
    if (menu.hidden) { buildMenu(); menu.hidden = false; $('btn-profile').setAttribute('aria-expanded', 'true'); }
    else closeMenu();
  });
  document.addEventListener('click', (e) => {
    if (!$('profile-wrap').contains(e.target)) closeMenu();
    if (!e.target.closest?.('.table-gear') && !e.target.closest?.('.opts-popover')) {
      if (optsOpen) closeOpts();
    }
    if (!e.target.closest?.('.invite-row') && !e.target.closest?.('.invite-panel')) {
      if (inviteOpen) closeInvite();
    }
  });
  $('chat-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const text = $('chat-text').value.trim();
    if (!text) return;
    A.send(ws, { action: 'chat', text });
    $('chat-text').value = '';
  });
  $('news-compose').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const body = $('news-body').value.trim();
    if (!body) return;
    A.send(ws, { action: 'newspost', body });
    $('news-body').value = '';
  });
  $('btn-feedback-new').addEventListener('click', () => {
    $('fb-new-form').hidden = !$('fb-new-form').hidden;
  });
  $('fb-new-cancel').addEventListener('click', () => { $('fb-new-form').hidden = true; });
  $('fb-new-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const body = $('fb-new-body').value.trim();
    if (!body) { setBanner('feedback needs a description', 'err'); return; }
    A.send(ws, {
      action: 'feedbacknew',
      kind: $('fb-new-kind').value,
      title: $('fb-new-title').value.trim() || null,
      body,
    });
    $('fb-new-body').value = '';
    $('fb-new-title').value = '';
    $('fb-new-form').hidden = true;
  });

  const sess = A.getSession();
  if (A.isSignOutGate()) {
    authPanel = A.loadProfiles().length ? 'gate' : 'first';
    renderAuth();
  } else if (sess && sess.username) {
    loginAs(sess.username, sess.email || '');
    renderAuth();
  } else {
    const last = A.lastProfile();
    if (last) { loginAs(last.username, last.email || ''); }
    else { authPanel = 'first'; }
    renderAuth();
  }
})();
