/* Felt drawer: lobby WS + social + owner Invite.
 * Command allowlist only — no Sit/Create/Start/Leave/Stop/GKill/goTable.
 * duplicate_login must not clear the felt session. */
(function (global) {
  const CLOSE_GRACE_MS = 500;
  /** Lobby cmds the felt drawer may send (lowercase). */
  const DRAWER_ALLOWED = new Set([
    'login',
    'invite',
    'chat',
    'setprefs',
    'newspost',
    'newsarchive',
    'feedbacknew',
    'feedbackreply',
    'feedbacksetstatus',
  ]);

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
  function sameName(a, b) {
    return String(a || '').toLowerCase() === String(b || '').toLowerCase();
  }

  /**
   * @param {object} opts
   * @param {HTMLElement} opts.rootEl  #lobby-drawer-social
   * @param {HTMLElement} [opts.connEl] lobby title-bar connection status
   * @param {HTMLElement} [opts.noteEl] drawer note / error line
   * @param {HTMLElement} [opts.inviteEl] #lobby-drawer invite strip (owner private only)
   * @param {typeof A45sWeb} opts.A
   * @param {() => object|null} opts.getSession
   * @param {(text: string, kind?: string) => void} [opts.onFeltToast]
   */
  function create(opts) {
    const rootEl = opts.rootEl;
    const A = opts.A;
    const getSession = opts.getSession || (() => A.getSession());
    const onFeltToast = opts.onFeltToast || (() => {});
    const inviteEl = opts.inviteEl || null;
    const connEl = opts.connEl || null;
    const noteEl = opts.noteEl || null;
    const Social = global.A45sLobbySocial;

    if (!rootEl) throw new Error('A45sTableLobby.create: rootEl required');
    if (!Social || typeof Social.mount !== 'function') {
      throw new Error('A45sTableLobby.create: load lobby_social.js first');
    }

    let ws = null;
    let intentionalClose = false;
    let takenOver = false;
    let wantOpen = false;
    let closeTimer = null;
    let me = '';
    let email = '';
    let isDev = false;
    let authenticated = false;
    let online = [];
    /** @type {array} kept for Phase 4 invite; never drive navigation */
    let tables = [];
    let myPrefs = normalizePrefs(null);

    function isLiveWs() {
      return !!ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN);
    }
    function wsSend(msg) {
      const action = msg && msg.action != null ? String(msg.action).toLowerCase() : '';
      if (!DRAWER_ALLOWED.has(action)) {
        console.warn('A45sTableLobby: blocked lobby cmd', action || msg);
        return false;
      }
      return A.send(ws, msg);
    }
    function minePriv() {
      return tables.find((t) => t.private && sameName(t.id, me)) || null;
    }
    /** Owner Invite only for the private table this felt session is on. */
    function inviteTable() {
      const t = minePriv();
      if (!t || !authenticated) return null;
      const sess = getSession();
      if (sess && sess.table && sameName(sess.table, t.id)) return t;
      const seat = (t.seats || []).findIndex((n) => n && sameName(n, me));
      return seat >= 0 ? t : null;
    }

    function syncInviteStrip() {
      if (!inviteEl) {
        // Still tear down a portaled panel if strip is gone.
        requestAnimationFrame(() => social.remountInvitePopover());
        return;
      }
      const t = inviteTable();
      if (!t) {
        inviteEl.hidden = true;
        inviteEl.replaceChildren();
        social.closeInvite();
        return;
      }
      inviteEl.hidden = false;
      const row = social.renderInviteRow(t, {});
      inviteEl.replaceChildren();
      if (row) inviteEl.appendChild(row);
      // Always remount: open → place panel; closed (toggle) → remove leftover portal.
      requestAnimationFrame(() => social.remountInvitePopover());
    }

    function closeInviteIfOpen() {
      if (!social.getInviteOpen()) return false;
      social.closeInvite();
      syncInviteStrip();
      return true;
    }

    rootEl.classList.add('lobby-side');
    const social = Social.mount(rootEl, {
      mode: 'drawer',
      wsSend,
      getMe: () => me,
      getIsDev: () => isDev,
      getAuthenticated: () => authenticated,
      getPrefs: () => myPrefs,
      patchPrefs: (partial) => {
        if (partial.friends) myPrefs.friends = partial.friends;
        if (partial.talk_read) myPrefs.talk_read = normalizeTalkRead({
          ...myPrefs.talk_read,
          ...partial.talk_read,
        });
      },
      getOnline: () => online,
      getMinePriv: () => inviteTable(),
      getTable: (id) => tables.find((t) => t.id === id) || null,
      onDevDeleteUser: null, // Dev delete stays on the full lobby page for now
      onBanner: (text, kind) => {
        setNote(text, kind || 'err');
        if (text) onFeltToast(text, kind || 'err');
      },
      onInviteUiChange: () => syncInviteStrip(),
      // Same as lobby page: owner may invite after Start (drawer is the mid-hand path).
      canInviteAfterStart: true,
    });

    // Outside click closes. Invite button toggles itself (stopPropagation); leave it alone.
    function onDocClick(ev) {
      if (!social.getInviteOpen()) return;
      const t = ev.target;
      if (t && t.closest) {
        if (t.closest('.invite-panel')) return;
        if (t.closest('.invite-summary-btn')) return;
      }
      closeInviteIfOpen();
    }
    document.addEventListener('click', onDocClick);

    function setConn(text, kind) {
      if (!connEl) return;
      connEl.textContent = text || '';
      connEl.className = 'lobby-drawer-conn' + (kind ? ' ' + kind : '');
    }
    function setNote(text, kind) {
      if (!noteEl) return;
      if (!text) {
        noteEl.hidden = true;
        noteEl.textContent = '';
        noteEl.className = 'lobby-drawer-note';
        return;
      }
      noteEl.hidden = false;
      noteEl.textContent = text;
      noteEl.className = 'lobby-drawer-note' + (kind ? ' ' + kind : '');
    }

    function persistWelcome(j) {
      const cur = getSession() || {};
      A.setSession({
        username: j.username || cur.username,
        uuid: j.uuid || cur.uuid,
        email: email || cur.email || '',
        table: cur.table,
        seat: cur.seat,
      });
      if (j.username) A.upsertProfile(j.username, email || cur.email || '');
    }

    function onMsg(j) {
      if (!j || !j.action) return;

      if (j.action === 'welcome') {
        me = j.username || me;
        isDev = !!j.is_dev;
        authenticated = true;
        takenOver = false;
        myPrefs = normalizePrefs(j.prefs);
        persistWelcome(j);
        setConn('online', 'ok');
        setNote('');
        social.syncAuthControls();
        social.renderPlayers();
        syncInviteStrip();
        return;
      }

      if (j.action === 'users') {
        online = Array.isArray(j.people) ? j.people : [];
        social.renderPlayers();
        if (social.getInviteOpen()) {
          requestAnimationFrame(() => social.remountInvitePopover());
        }
        return;
      }

      if (j.action === 'tables') {
        // Store only — never goTable / Sit / Start from the felt drawer.
        tables = j.tables || [];
        syncInviteStrip();
        social.renderPlayers();
        return;
      }

      if (j.action === 'prefs') {
        myPrefs = normalizePrefs(j.prefs);
        social.recomputeAllUnread();
        social.syncAuthControls();
        return;
      }

      if (social.handleMsg(j)) return;

      // Never navigate / sit from the drawer.
      if (j.action === 'started' || j.action === 'emailchanged') return;

      if (j.action === 'err') {
        if (j.err === 'duplicate_login') {
          takenOver = true;
          authenticated = false;
          social.syncAuthControls();
          setConn('signed in elsewhere', 'err');
          setNote('Lobby connected in another tab. Close and reopen Lobby here to reclaim.', 'err');
          onFeltToast('Lobby panel signed in elsewhere', 'err');
          return;
        }
        if (j.err === 'username_taken' || j.err === 'authenticate') {
          authenticated = false;
          social.syncAuthControls();
          setConn('sign-in failed', 'err');
          setNote(j.err === 'username_taken'
            ? 'That name needs the matching email.'
            : 'Could not sign the lobby panel in.', 'err');
          return;
        }
        if (j.err) setNote(j.err, 'err');
      }
    }

    function onClose() {
      authenticated = false;
      social.syncAuthControls();
      if (intentionalClose) {
        intentionalClose = false;
        return;
      }
      if (takenOver) {
        setConn('signed in elsewhere', 'err');
        return;
      }
      if (!wantOpen) {
        setConn('closed');
        return;
      }
      setConn('reconnecting…', 'err');
      setTimeout(() => {
        if (wantOpen && !takenOver && !isLiveWs()) connectNow();
      }, 900);
    }

    function connectNow() {
      const sess = getSession();
      if (!sess || !sess.username) {
        setConn('no session', 'err');
        setNote('Open the lobby page to sign in first.', 'err');
        social.reset();
        return;
      }
      me = sess.username;
      email = sess.email || '';
      takenOver = false;
      setConn('connecting…');
      setNote('');
      if (ws) {
        intentionalClose = true;
        try { ws.close(); } catch (_) {}
      }
      intentionalClose = false;
      social.reset();
      ws = A.connect('lobby', onMsg, onClose);
      ws.onopen = () => {
        A.send(ws, {
          action: 'login',
          username: sess.username,
          email: sess.email || '',
        });
      };
    }

    function clearCloseTimer() {
      if (closeTimer != null) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
    }

    function detachNow() {
      clearCloseTimer();
      wantOpen = false;
      authenticated = false;
      online = [];
      tables = [];
      if (ws) {
        intentionalClose = true;
        try { ws.close(); } catch (_) {}
        ws = null;
      }
      social.closeInvite();
      social.reset();
      social.syncAuthControls();
      if (inviteEl) {
        inviteEl.hidden = true;
        inviteEl.replaceChildren();
      }
      setConn('closed');
      setNote('');
    }

    function attach() {
      clearCloseTimer();
      wantOpen = true;
      if (takenOver) takenOver = false;
      if (isLiveWs() && authenticated) {
        setConn('online', 'ok');
        social.syncAuthControls();
        social.renderPlayers();
        syncInviteStrip();
        return;
      }
      connectNow();
    }

    function detach() {
      wantOpen = false;
      clearCloseTimer();
      closeTimer = setTimeout(() => {
        closeTimer = null;
        if (!wantOpen) detachNow();
      }, CLOSE_GRACE_MS);
    }

    setConn('closed');

    return {
      attach,
      detach,
      detachNow,
      closeInviteIfOpen,
      isAttached: () => wantOpen || isLiveWs(),
      getTables: () => tables,
      getOnline: () => online,
      getMe: () => me,
      getSocial: () => social,
    };
  }

  global.A45sTableLobby = { create };
})(window);
