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
  /** Username whose Change-email form is open in Manage profiles (or ''). */
  let emailEditFor = '';
  /** Target of a pending DevDeleteUser (wait for Users / err). */
  let pendingDevDelete = '';
  let tables = [];
  let online = [];
  let optsOpen = '';
  let myPrefs = { robots: 'random', replay: false, friends: [], talk_read: {} };
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

  const social = A45sLobbySocial.mount(document.querySelector('.lobby-side'), {
    mode: 'page',
    wsSend: (msg) => A.send(ws, msg),
    getMe: () => me,
    getIsDev: () => isDev,
    getAuthenticated: () => authenticated,
    getPrefs: () => myPrefs,
    patchPrefs: (partial) => {
      if (partial.friends) myPrefs.friends = partial.friends;
      if (partial.talk_read) myPrefs.talk_read = normalizeTalkRead(partial.talk_read);
    },
    getOnline: () => online,
    getMinePriv: () => minePriv(),
    getTable: (id) => tables.find((t) => t.id === id) || null,
    onDevDeleteUser: (n) => requestDevDeleteUser(n),
    onBanner: (text, kind) => setBanner(text, kind),
    onInviteUiChange: () => renderTables(),
    canInviteAfterStart: true,
  });
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
      emailEditFor = '';
      ul.innerHTML = '<li class="hint">No saved profiles on this browser.</li>';
      return;
    }
    const canEdit = isSignedIn() && !!me;
    ul.replaceChildren(...list.map((p) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'mp-name';
      name.textContent = p.username;
      const em = document.createElement('span');
      em.className = 'mp-email';
      em.textContent = p.email || '—';
      const actions = document.createElement('div');
      actions.className = 'mp-actions';

      const isMe = canEdit && sameName(p.username, me);
      if (isMe) {
        const change = document.createElement('button');
        change.type = 'button';
        change.className = 'mp-email-btn';
        change.textContent =
          emailEditFor && sameName(emailEditFor, p.username) ? 'Cancel' : 'Change email';
        change.addEventListener('click', () => {
          emailEditFor =
            emailEditFor && sameName(emailEditFor, p.username) ? '' : p.username;
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
        const wasMe = me && sameName(p.username, me);
        if (emailEditFor && sameName(emailEditFor, p.username)) emailEditFor = '';
        A.forgetProfile(p.username);
        if (wasMe && isSignedIn()) { doSignOut(); return; }
        renderManageList();
        renderAuth();
      });
      actions.appendChild(forget);
      li.append(name, em, actions);

      if (isMe && emailEditFor && sameName(emailEditFor, p.username)) {
        li.appendChild(buildEmailEditForm(p));
      }
      return li;
    }));
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
      const currentEmail = locked ? (currentInput?.value || '').trim() : '';
      if (locked && !currentEmail) {
        err.textContent = 'Enter the current email that locked this name.';
        err.hidden = false;
        return;
      }
      if (!A.send(ws, {
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
  function applyEmailChanged(newEmail) {
    const em = String(newEmail || '').trim();
    email = em;
    const sess = A.getSession() || {};
    A.setSession({
      uuid: sess.uuid,
      username: me || sess.username,
      email: em,
    });
    if (me) A.upsertProfile(me, em);
    emailEditFor = '';
    renderManageList();
    renderAuth();
    setBanner('Email updated', 'ok');
  }

  /** Confirm + optional email proof, then DeleteUser (I2). */
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
    let em = '';
    if (locked) {
      const entered = window.prompt(
        `Enter the email that locked “${name}” to confirm delete:`,
        '',
      );
      if (entered == null) return;
      em = String(entered).trim();
      if (!em) {
        setBanner('Email required to delete a locked username.', 'err');
        return;
      }
    }
    if (!A.send(ws, { action: 'deleteuser', email: em })) {
      setBanner('Not connected — try again when online.', 'err');
    }
  }

  /**
   * Server deleted this username. Forget profile, clear session, show Continue/create gate.
   */
  function handleUserDeleted() {
    const uname = me;
    emailEditFor = '';
    pendingDevDelete = '';
    intentionalClose = true;
    takenOver = false;
    authRejected = false;
    authenticated = false;
    if (uname) A.forgetProfile(uname);
    A.setSession(null);
    A.setSignOutGate(true);
    me = '';
    email = '';
    isDev = false;
    tables = [];
    online = [];
    if (ws) {
      try { ws.close(); } catch (_) {}
      ws = null;
    }
    intentionalClose = false;
    authPanel = A.loadProfiles().length ? 'gate' : 'first';
    setStatus('sign in');
    renderTables();
    social.renderPlayers();
    renderAuth();
    setBanner('Username deleted on the server.', 'ok');
  }

  /** Dev moderation: delete another username (I3). */
  function requestDevDeleteUser(name) {
    const target = String(name || '').trim();
    if (!target || !isDev) return;
    if (me && sameName(target, me)) {
      setBanner('Use Manage profiles → Delete username to remove your own name.', 'err');
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
    if (!A.send(ws, { action: 'devdeleteuser', username: target })) {
      pendingDevDelete = '';
      setBanner('Not connected — try again when online.', 'err');
    }
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
    social.syncAuthControls();
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
    myPrefs = normalizePrefs(null);
    social.reset();
    authPanel = A.loadProfiles().length ? 'gate' : 'first';
    setStatus('sign in');
    renderTables();
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
    document.querySelectorAll('.opts-popover[data-portal]').forEach((el) => el.remove());
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
    social.remountInvitePopover();
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
      social.closeInvite();
      optsOpen = optsOpen === t.id ? '' : t.id;
      renderTables();
    });
    wrap.appendChild(gear);
    return wrap;
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
      const extras = social.renderInviteRow(t, { closeOpts });
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
      social.renderPlayers();
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
    social.renderPlayers();
    syncBanner();
    requestAnimationFrame(mountOpenPopovers);
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
      social.recomputeAllUnread();
      renderTables();
      return;
    }
    if (social.handleMsg(j)) return;
    if (j.action === 'users') {
      online = Array.isArray(j.people) ? j.people : [];
      if (pendingDevDelete) {
        const still = online.some((p) => sameName(p.name, pendingDevDelete));
        if (!still) {
          setBanner(`Deleted “${pendingDevDelete}” on the server.`, 'ok');
          pendingDevDelete = '';
        }
      }
      social.renderPlayers();
      if (social.getInviteOpen()) requestAnimationFrame(mountOpenPopovers);
      return;
    }
    if (j.action === 'started') {
      if (sessionStorage.getItem('a45s.justLeft')) return;
      persistSeat();
      goTable(j.table, j.seat);
      return;
    }
    if (j.action === 'emailchanged') {
      applyEmailChanged(j.email);
      return;
    }
    if (j.action === 'err') {
      if (j.err === 'user_deleted') {
        handleUserDeleted();
        return;
      }
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
      if (j.err === 'reserved_username') {
        authRejected = true;
        authenticated = false;
        setStatus('sign-in failed', 'err');
        setBanner('Names starting with B. are reserved for robots.', 'err');
        authPanel = A.loadProfiles().length ? 'create' : 'first';
        renderAuth();
        $('in-user').focus();
        return;
      }
      if (j.err === 'email_mismatch') {
        setBanner('Current email does not match. Re-enter the email that locked this name.', 'err');
        return;
      }
      if (j.err === 'bad_email') {
        setBanner('Enter a non-empty email address.', 'err');
        return;
      }
      if (j.err === 'in_game') {
        const msg = pendingDevDelete
          ? 'That player must leave their table seat first.'
          : 'Leave the table first, then delete the username.';
        pendingDevDelete = '';
        setBanner(msg, 'err');
        return;
      }
      if (j.err === 'forbidden') {
        pendingDevDelete = '';
        setBanner('Not allowed.', 'err');
        return;
      }
      if (j.err === 'missing') {
        pendingDevDelete = '';
        setBanner('User not found.', 'err');
        return;
      }
      if (pendingDevDelete && !j.err) pendingDevDelete = '';
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
  $('btn-login').addEventListener('click', () => {
    const name = $('in-user').value.trim();
    if (!name) { setBanner('name required', 'err'); return; }
    // Mirror server `is_bot_name` (robot namespace); server still authoritative.
    if (name.length >= 2 && name.slice(0, 2).toLowerCase() === 'b.') {
      setBanner('Names starting with B. are reserved for robots.', 'err');
      $('in-user').focus();
      return;
    }
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
      if (social.getInviteOpen()) social.closeInvite();
    }
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
