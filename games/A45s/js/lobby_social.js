/* Shared lobby social + invite UI (page side column; later felt drawer).
 * Mount once; lobby.js stays the page shell (auth, tables, sit/start). */
(function (global) {
  const SIDE_MARKUP = `
      <section class="panel side-panel people-panel" aria-label="Players">
        <div class="side-tabs" role="tablist" aria-label="People">
          <button type="button" class="side-tab active" role="tab" data-tab="players"
            aria-selected="true" aria-controls="pane-players">Players</button>
          <button type="button" class="side-tab" role="tab" data-tab="ranks"
            aria-selected="false" aria-controls="pane-ranks">Ranks</button>
        </div>
        <div class="side-pane" role="tabpanel" id="pane-players" data-pane="players">
          <ul class="player-list" data-el="online-list"></ul>
        </div>
        <div class="side-pane" role="tabpanel" id="pane-ranks" data-pane="ranks" hidden>
          <p class="pane-note">Team-score avg · 10+ series</p>
          <div class="ranks-scroll">
            <table class="ranks-table">
              <thead>
                <tr><th class="rk">#</th><th class="nm">Player</th><th class="avg">Avg</th><th class="n">G</th></tr>
              </thead>
              <tbody data-el="ranks-body"></tbody>
            </table>
            <p class="empty-state" data-el="ranks-empty">No ranked players yet (need 10+ series).</p>
          </div>
          <div class="ranks-you" data-el="ranks-you">
            <span class="ranks-you-label">You</span>
            <span class="ranks-you-meta" data-el="ranks-you-meta">Sign in to see your rank</span>
          </div>
        </div>
      </section>

      <section class="panel side-panel talk-panel" aria-label="Talk">
        <div class="side-tabs" role="tablist" aria-label="Talk">
          <button type="button" class="side-tab active" role="tab" data-tab="news"
            aria-selected="true" aria-controls="pane-news">
            News <span class="tab-badge" data-badge="news" hidden>0</span>
          </button>
          <button type="button" class="side-tab" role="tab" data-tab="chat"
            aria-selected="false" aria-controls="pane-chat">
            Chat <span class="tab-badge" data-badge="chat" hidden>0</span>
          </button>
          <button type="button" class="side-tab" role="tab" data-tab="feedback"
            aria-selected="false" aria-controls="pane-feedback">
            Feedback <span class="tab-badge" data-badge="feedback" hidden>0</span>
          </button>
        </div>

        <div class="side-pane talk-pane" role="tabpanel" id="pane-news" data-pane="news">
          <ul class="news-list" data-el="news-list"></ul>
          <p class="empty-state" data-el="news-empty">No announcements yet.</p>
          <form class="news-compose" data-el="news-compose" hidden>
            <textarea data-el="news-body" maxlength="2000" rows="2" placeholder="Post announcement…"></textarea>
            <button type="submit">Post</button>
          </form>
        </div>

        <div class="side-pane talk-pane" role="tabpanel" id="pane-chat" data-pane="chat" hidden>
          <ul class="chat-log" data-el="chat-log"></ul>
          <form class="chat-form" data-el="chat-form">
            <input data-el="chat-text" type="text" maxlength="240" placeholder="lobby chat…" disabled>
            <button type="submit" disabled>Send</button>
          </form>
        </div>

        <div class="side-pane talk-pane" role="tabpanel" id="pane-feedback" data-pane="feedback" hidden>
          <div class="feedback-toolbar">
            <button type="button" class="feedback-new" data-el="btn-feedback-new" disabled>New…</button>
            <span class="pane-note">Public · Dev can reply in-thread</span>
          </div>
          <form class="fb-new-form" data-el="fb-new-form" hidden>
            <div class="fb-new-row">
              <label>
                <span>Type</span>
                <select data-el="fb-new-kind">
                  <option value="bug">bug</option>
                  <option value="idea" selected>idea</option>
                  <option value="other">other</option>
                </select>
              </label>
              <label class="fb-new-title-wrap">
                <span>Title <span class="opt-label">(optional)</span></span>
                <input data-el="fb-new-title" type="text" maxlength="120" placeholder="Short summary">
              </label>
            </div>
            <label>
              <span>Details</span>
              <textarea data-el="fb-new-body" maxlength="2000" rows="3" placeholder="What should we know?"></textarea>
            </label>
            <div class="fb-new-actions">
              <button type="button" data-el="fb-new-cancel">Cancel</button>
              <button type="submit">Post</button>
            </div>
          </form>
          <ul class="feedback-list" data-el="feedback-list"></ul>
          <p class="empty-state" data-el="feedback-empty">No feedback yet. Be the first.</p>
        </div>
      </section>`;

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
  function isPresenceOnline(p) {
    const w = (p && p.where) || '';
    return w === 'lobby' || w === 'table' || w === 'playing';
  }
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
    if (dayDiff < 14) return dayDiff + ' days ago';
    return 'a while ago';
  }
  function formatPresenceStatus(p) {
    const w = p && p.where;
    if (w === 'table') {
      return isOpenTable(p.table) ? displayTableName(p.table) : 'waiting';
    }
    if (w === 'playing') {
      return isOpenTable(p.table) ? displayTableName(p.table) + ' · playing' : 'playing';
    }
    if (w === 'offline') return formatOfflineSeen(p.last_seen);
    return 'lobby';
  }
  function presenceBand(p) {
    switch (p && p.where) {
      case 'lobby': return 0;
      case 'table': return 1;
      case 'playing': return 2;
      default: return 3;
    }
  }
  function sortPeople(list) {
    return (list || []).slice().sort((a, b) => {
      const ba = presenceBand(a);
      const bb = presenceBand(b);
      if (ba !== bb) return ba - bb;
      if (ba === 3) {
        return String(b.last_seen || '').localeCompare(String(a.last_seen || ''));
      }
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }
  function normalizeTalkRead(tr) {
    const t = tr && typeof tr === 'object' ? tr : {};
    return {
      news_at: t.news_at || null,
      feedback_at: t.feedback_at || null,
      chat_at: t.chat_at || null,
    };
  }
  function nameInList(list, name) {
    return (list || []).some((n) => sameName(n, name));
  }
  function invitedList(t) {
    return (t && t.invited || []).filter((n) => String(n || '').trim());
  }
  function whenShort(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function formatRankAvg(r) {
    const a = Number(r && r.avg);
    if (!Number.isFinite(a)) return '—';
    return String(Math.round(a));
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

  /**
   * @param {HTMLElement} rootEl host for people + talk panels (`.lobby-side` or drawer)
   * @param {object} opts
   * @param {'page'|'drawer'} [opts.mode='page']
   * @param {(msg: object) => *} opts.wsSend
   * @param {() => string} opts.getMe
   * @param {() => boolean} opts.getIsDev
   * @param {() => boolean} opts.getAuthenticated
   * @param {() => object} opts.getPrefs  { friends, talk_read, … }
   * @param {(partial: object) => void} opts.patchPrefs  merge into page-local prefs
   * @param {() => array} opts.getOnline
   * @param {() => object|null} opts.getMinePriv
   * @param {(id: string) => object|null} [opts.getTable]
   * @param {(name: string) => void} [opts.onDevDeleteUser]
   * @param {(text: string, kind?: string) => void} [opts.onBanner]
   * @param {() => void} [opts.onInviteUiChange] re-render tables after invite toggle
   * @param {boolean} [opts.canInviteAfterStart=false] allow owner invite clicks after Start
   */
  function mount(rootEl, opts) {
    if (!rootEl) throw new Error('A45sLobbySocial.mount: root required');
    const mode = opts.mode === 'drawer' ? 'drawer' : 'page';
    const wsSend = opts.wsSend;
    const getMe = opts.getMe || (() => '');
    const getIsDev = opts.getIsDev || (() => false);
    const getAuthenticated = opts.getAuthenticated || (() => false);
    const getPrefs = opts.getPrefs || (() => ({ friends: [], talk_read: {} }));
    const patchPrefs = opts.patchPrefs || (() => {});
    const getOnline = opts.getOnline || (() => []);
    const getMinePriv = opts.getMinePriv || (() => null);
    const getTable = opts.getTable || (() => null);
    const onDevDeleteUser = opts.onDevDeleteUser || null;
    const onBanner = opts.onBanner || (() => {});
    const onInviteUiChange = opts.onInviteUiChange || (() => {});
    const canInviteAfterStart = !!opts.canInviteAfterStart;

    // Page mode reuses lobby.html markup (id=…); drawer injects data-el markup.
    if (!rootEl.querySelector('.people-panel')) {
      rootEl.innerHTML = SIDE_MARKUP;
    }
    rootEl.dataset.lobbySocialMode = mode;

    const $el = (key) =>
      rootEl.querySelector(`[data-el="${key}"]`) ||
      document.getElementById(key);
    const $badge = (kind) =>
      rootEl.querySelector(`[data-badge="${kind}"]`) ||
      document.getElementById(`badge-${kind}`);
    const $pane = (name) =>
      rootEl.querySelector(`[data-pane="${name}"]`) ||
      document.getElementById(`pane-${name}`);

    // Ensure stable ids for aria-controls when markup used ids (page) or data-pane (drawer).
    rootEl.querySelectorAll('[data-pane]').forEach((pane) => {
      if (!pane.id) pane.id = 'pane-' + pane.getAttribute('data-pane');
    });
    rootEl.querySelectorAll('.side-tab[data-tab]').forEach((tab) => {
      const name = tab.getAttribute('data-tab');
      if (!tab.id) tab.id = 'tab-' + name;
      tab.setAttribute('aria-controls', 'pane-' + name);
      const pane = $pane(name);
      if (pane && !pane.getAttribute('aria-labelledby')) {
        pane.setAttribute('aria-labelledby', tab.id);
      }
    });
    // Page markup uses id="tab-*" without data-tab — normalize.
    rootEl.querySelectorAll('.side-tab[id^="tab-"]').forEach((tab) => {
      if (!tab.getAttribute('data-tab')) {
        tab.setAttribute('data-tab', tab.id.replace(/^tab-/, ''));
      }
    });

    let inviteOpen = '';
    let news = [];
    let feedback = [];
    let chatMessages = [];
    let fbExpanded = '';
    let unread = { news: 0, chat: 0, feedback: 0 };
    let talkBootstrapped = false;
    let ranksState = { rows: [], you: null };

    function talkRead() {
      return normalizeTalkRead(getPrefs() && getPrefs().talk_read);
    }
    function isoAfter(watermark, itemIso) {
      if (!itemIso) return false;
      if (!watermark) return true;
      const a = Date.parse(watermark);
      const b = Date.parse(itemIso);
      if (Number.isNaN(b)) return false;
      if (Number.isNaN(a)) return true;
      return b > a;
    }
    function isPaneVisible(name) {
      const pane = $pane(name);
      return !!(pane && !pane.hidden);
    }
    function countNewsUnread() {
      const wm = talkRead().news_at;
      let n = 0;
      for (const it of news) {
        if (sameName(it.author, getMe())) continue;
        if (isoAfter(wm, it.created_at)) n += 1;
      }
      return n;
    }
    function countFeedbackUnread() {
      const wm = talkRead().feedback_at;
      let n = 0;
      for (const it of feedback) {
        if (!sameName(it.author, getMe()) && isoAfter(wm, it.created_at)) n += 1;
        for (const r of it.replies || []) {
          if (!sameName(r.author, getMe()) && isoAfter(wm, r.created_at)) n += 1;
        }
      }
      return n;
    }
    function countChatUnread() {
      const wm = talkRead().chat_at;
      let n = 0;
      for (const m of chatMessages) {
        if (sameName(m.from, getMe())) continue;
        if (isoAfter(wm, m.at)) n += 1;
      }
      return n;
    }
    function setUnreadCount(kind, n) {
      if (!(kind in unread)) return;
      unread[kind] = Math.min(99, Math.max(0, n | 0));
      const el = $badge(kind);
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
    function recomputeUnread(kind) {
      if (isPaneVisible(kind)) {
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
    function markTalkRead(kind) {
      if (!getAuthenticated() || !getMe()) {
        setUnreadCount(kind, 0);
        return;
      }
      const field =
        kind === 'news' ? 'news_at' : kind === 'feedback' ? 'feedback_at' : 'chat_at';
      const now = new Date().toISOString();
      patchPrefs({ talk_read: { ...talkRead(), [field]: now } });
      setUnreadCount(kind, 0);
      wsSend({ action: 'setprefs', talk_read: { [field]: now } });
    }

    function bindTabs(panel) {
      if (!panel) return;
      const tabs = [...panel.querySelectorAll(':scope > .side-tabs [role="tab"]')];
      tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
          tabs.forEach((t) => {
            const on = t === tab;
            t.classList.toggle('active', on);
            t.setAttribute('aria-selected', on ? 'true' : 'false');
            const paneId = t.getAttribute('aria-controls');
            const pane =
              (paneId && rootEl.querySelector('#' + CSS.escape(paneId))) ||
              $pane(t.getAttribute('data-tab') || '');
            if (pane) pane.hidden = !on;
          });
          const id = (tab.getAttribute('data-tab') || tab.id.replace(/^tab-/, ''));
          if (id === 'news' || id === 'feedback' || id === 'chat') markTalkRead(id);
        });
      });
    }

    function sendInviteList(list) {
      wsSend({ action: 'invite', list: list.slice() });
    }
    function inviteAdd(name, asFriend) {
      const t = getMinePriv();
      const me = getMe();
      if (!t || sameName(name, me)) return;
      const n = String(name || '').trim();
      if (!n) return;
      const list = invitedList(t);
      if (!nameInList(list, n)) list.push(n);
      sendInviteList(list);
      const friends = (getPrefs().friends || []).slice();
      if (asFriend && !nameInList(friends, n)) {
        friends.push(n);
        patchPrefs({ friends });
        wsSend({ action: 'setprefs', friends });
      }
    }
    function inviteRemove(name) {
      const t = getMinePriv();
      if (!t) return;
      sendInviteList(invitedList(t).filter((n) => !sameName(n, name)));
    }
    function unfriend(name) {
      const friends = (getPrefs().friends || []).filter((n) => !sameName(n, name));
      patchPrefs({ friends });
      wsSend({ action: 'setprefs', friends });
    }
    function mergeFriendsIntoInvited(t) {
      const friends = getPrefs().friends || [];
      if (!t || !friends.length) return;
      const list = invitedList(t);
      let changed = false;
      const me = getMe();
      friends.forEach((f) => {
        if (sameName(f, me) || nameInList(list, f)) return;
        list.push(f);
        changed = true;
      });
      if (changed) sendInviteList(list);
    }

    function closeInvite() {
      inviteOpen = '';
      document.querySelectorAll('.invite-panel[data-portal]').forEach((el) => el.remove());
    }

    function renderInvitePanel(t) {
      const pop = document.createElement('div');
      pop.className = 'invite-panel';
      pop.dataset.portal = '1';
      pop.setAttribute('role', 'dialog');
      pop.setAttribute('aria-label', 'Invite players');
      pop.addEventListener('click', (e) => e.stopPropagation());
      const inv = invitedList(t);
      const friends = getPrefs().friends || [];
      const me = getMe();
      const online = getOnline();
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
        online.filter(
          (p) => isPresenceOnline(p) && !sameName(p.name, me) && !nameInList(inv, p.name),
        ),
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

    /** Table-card invite summary row (page mode). Returns null if nothing to show. */
    function renderInviteRow(t, hooks) {
      const closeOpts = (hooks && hooks.closeOpts) || (() => {});
      const row = document.createElement('div');
      row.className = 'invite-row';
      const inv = invitedList(t);
      const me = getMe();
      const owner = t.private && sameName(t.id, me);
      if (owner) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'invite-summary-btn';
        btn.dataset.table = t.id;
        btn.setAttribute('aria-expanded', inviteOpen === t.id ? 'true' : 'false');
        btn.textContent = inv.length ? '👤 Invited: ' + inv.length : '👤 Invite';
        btn.title = inviteOpen === t.id
          ? 'Close invite panel'
          : (inv.length ? inv.join(', ') : 'Invite players');
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          closeOpts();
          if (inviteOpen === t.id) {
            inviteOpen = '';
          } else {
            inviteOpen = t.id;
            mergeFriendsIntoInvited(t);
          }
          onInviteUiChange();
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

    function remountInvitePopover() {
      document.querySelectorAll('.invite-panel[data-portal]').forEach((el) => el.remove());
      if (!inviteOpen) return;
      const t = getTable(inviteOpen);
      const btn = document.querySelector(
        `.invite-summary-btn[data-table="${CSS.escape(inviteOpen)}"]`,
      );
      if (!t || !btn) {
        inviteOpen = '';
        return;
      }
      const pop = renderInvitePanel(t);
      document.body.appendChild(pop);
      placePopover(btn, pop);
    }

    function renderPlayers() {
      const ul = $el('online-list');
      if (!ul) return;
      ul.innerHTML = '';
      const mine = getMinePriv();
      const canInvite = !!(mine && (canInviteAfterStart || !mine.started));
      const me = getMe();
      const isDev = getIsDev();
      const OFFLINE_CAP = 15;
      let offlineN = 0;
      const people = [];
      for (const p of sortPeople(getOnline())) {
        if (!isPresenceOnline(p)) {
          offlineN += 1;
          if (offlineN > OFFLINE_CAP) continue;
        }
        people.push(p);
      }
      if (!people.length) {
        ul.innerHTML = '<li class="empty-state">No one signed in.</li>';
        return;
      }
      people.forEach((p) => {
        const n = p.name;
        const offline = !isPresenceOnline(p);
        const li = document.createElement('li');
        li.className = 'player-row' + (offline ? ' offline' : '') + (sameName(n, me) ? ' me' : '');
        if (canInvite && !offline && !sameName(n, me)) {
          li.classList.add('inviteable');
          li.title = 'Invite to your private table';
          li.addEventListener('click', () => inviteAdd(n));
        }
        const nameEl = document.createElement('span');
        nameEl.className = 'player-name';
        nameEl.textContent = n;
        if (p.is_dev) {
          const badge = document.createElement('span');
          badge.className = 'badge-dev';
          badge.textContent = 'Dev';
          nameEl.append(' ', badge);
        }
        const st = document.createElement('span');
        st.className = 'player-status';
        st.textContent = formatPresenceStatus(p);
        li.append(nameEl, st);
        if (onDevDeleteUser && isDev && me && !sameName(n, me)) {
          const del = document.createElement('button');
          del.type = 'button';
          del.className = 'icon-btn danger trash-btn player-dev-delete';
          del.textContent = '🗑';
          del.title = 'Dev: delete this username on the server';
          del.setAttribute('aria-label', del.title);
          del.addEventListener('click', (ev) => {
            ev.stopPropagation();
            onDevDeleteUser(n);
          });
          li.appendChild(del);
        }
        ul.appendChild(li);
      });
    }

    function renderRanks() {
      const body = $el('ranks-body');
      const empty = $el('ranks-empty');
      const youMeta = $el('ranks-you-meta');
      if (!body) return;
      const rows = ranksState.rows || [];
      if (empty) empty.hidden = rows.length > 0;
      const me = getMe();
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
        if (!getAuthenticated() || !me) {
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

    function addChat(from, text, at) {
      const when = at || new Date().toISOString();
      chatMessages.push({ from, text, at: when });
      const ul = $el('chat-log');
      if (!ul) return;
      const li = document.createElement('li');
      li.innerHTML = `<b>${esc(from)}</b> ${esc(text)}`;
      ul.appendChild(li);
      ul.scrollTop = ul.scrollHeight;
    }

    function renderNews() {
      const ul = $el('news-list');
      if (!ul) return;
      ul.innerHTML = '';
      const empty = $el('news-empty');
      if (empty) empty.hidden = news.length > 0;
      const isDev = getIsDev();
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
          b.addEventListener('click', () => wsSend({ action: 'newsarchive', id: n.id }));
          li.appendChild(b);
        }
        ul.appendChild(li);
      });
    }

    function renderFeedback() {
      const ul = $el('feedback-list');
      if (!ul) return;
      ul.innerHTML = '';
      const empty = $el('feedback-empty');
      if (empty) empty.hidden = feedback.length > 0;
      const isDev = getIsDev();
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
            if (text) wsSend({ action: 'feedbackreply', id: f.id, body: text });
          });
          th.appendChild(reply);
          if (isDev) {
            const row = document.createElement('div');
            row.className = 'fb-dev-row';
            ['open', 'planned', 'done', 'wontfix'].forEach((st) => {
              const b = document.createElement('button');
              b.type = 'button';
              b.textContent = st;
              b.addEventListener('click', () =>
                wsSend({ action: 'feedbacksetstatus', id: f.id, status: st }));
              row.appendChild(b);
            });
            th.appendChild(row);
          }
          li.appendChild(th);
        }
        ul.appendChild(li);
      });
    }

    function syncAuthControls() {
      const chatOn = getAuthenticated();
      const chatText = $el('chat-text');
      const chatForm = $el('chat-form');
      const fbNew = $el('btn-feedback-new');
      const newsCompose = $el('news-compose');
      if (chatText) chatText.disabled = !chatOn;
      if (chatForm) {
        const btn = chatForm.querySelector('button[type="submit"]') || chatForm.querySelector('button');
        if (btn) btn.disabled = !chatOn;
      }
      if (fbNew) fbNew.disabled = !getAuthenticated();
      if (newsCompose) newsCompose.hidden = !getIsDev();
      renderRanks();
    }

    function reset() {
      news = [];
      feedback = [];
      chatMessages = [];
      talkBootstrapped = false;
      ranksState = { rows: [], you: null };
      fbExpanded = '';
      closeInvite();
      clearAllUnread();
      const chatLog = $el('chat-log');
      if (chatLog) chatLog.innerHTML = '';
      renderPlayers();
      renderRanks();
      renderNews();
      renderFeedback();
      syncAuthControls();
    }

    /** Handle talk / ranks / prefs-unread messages. Returns true if consumed. */
    function handleMsg(j) {
      if (!j || !j.action) return false;
      if (j.action === 'ranks') {
        ranksState = { rows: j.rows || [], you: j.you || null };
        renderRanks();
        return true;
      }
      if (j.action === 'chathistory') {
        const chatLog = $el('chat-log');
        if (chatLog) chatLog.innerHTML = '';
        chatMessages = [];
        (j.messages || []).forEach((m) => addChat(m.from, m.text, m.at));
        if (isPaneVisible('chat')) setUnreadCount('chat', 0);
        else recomputeUnread('chat');
        return true;
      }
      if (j.action === 'chat') {
        addChat(j.from, j.text, new Date().toISOString());
        if (isPaneVisible('chat')) setUnreadCount('chat', 0);
        else recomputeUnread('chat');
        return true;
      }
      if (j.action === 'news') {
        news = j.items || [];
        renderNews();
        if (isPaneVisible('news')) {
          if (!talkBootstrapped) markTalkRead('news');
          else setUnreadCount('news', 0);
        } else {
          recomputeUnread('news');
        }
        talkBootstrapped = true;
        return true;
      }
      if (j.action === 'feedback') {
        feedback = j.items || [];
        renderFeedback();
        if (isPaneVisible('feedback')) setUnreadCount('feedback', 0);
        else recomputeUnread('feedback');
        return true;
      }
      return false;
    }

    // ——— Bind forms / tabs ———
    bindTabs(rootEl.querySelector('.people-panel'));
    bindTabs(rootEl.querySelector('.talk-panel'));

    const chatForm = $el('chat-form');
    if (chatForm) {
      chatForm.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const inp = $el('chat-text');
        const text = (inp && inp.value || '').trim();
        if (!text) return;
        wsSend({ action: 'chat', text });
        if (inp) inp.value = '';
      });
    }
    const newsCompose = $el('news-compose');
    if (newsCompose) {
      newsCompose.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const bodyEl = $el('news-body');
        const body = (bodyEl && bodyEl.value || '').trim();
        if (!body) return;
        wsSend({ action: 'newspost', body });
        if (bodyEl) bodyEl.value = '';
      });
    }
    const btnFbNew = $el('btn-feedback-new');
    const fbNewForm = $el('fb-new-form');
    if (btnFbNew && fbNewForm) {
      btnFbNew.addEventListener('click', () => {
        fbNewForm.hidden = !fbNewForm.hidden;
      });
    }
    const fbCancel = $el('fb-new-cancel');
    if (fbCancel && fbNewForm) {
      fbCancel.addEventListener('click', () => { fbNewForm.hidden = true; });
    }
    if (fbNewForm) {
      fbNewForm.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const bodyEl = $el('fb-new-body');
        const titleEl = $el('fb-new-title');
        const kindEl = $el('fb-new-kind');
        const body = (bodyEl && bodyEl.value || '').trim();
        if (!body) { onBanner('feedback needs a description', 'err'); return; }
        wsSend({
          action: 'feedbacknew',
          kind: (kindEl && kindEl.value) || 'idea',
          title: (titleEl && titleEl.value.trim()) || null,
          body,
        });
        if (bodyEl) bodyEl.value = '';
        if (titleEl) titleEl.value = '';
        fbNewForm.hidden = true;
      });
    }

    syncAuthControls();

    return {
      mode,
      handleMsg,
      renderPlayers,
      renderRanks,
      syncAuthControls,
      recomputeAllUnread,
      reset,
      closeInvite,
      getInviteOpen: () => inviteOpen,
      renderInviteRow,
      remountInvitePopover,
      inviteAdd,
      placePopover,
    };
  }

  global.A45sLobbySocial = {
    mount,
    sameName,
    sortPeople,
    isPresenceOnline,
    formatPresenceStatus,
    invitedList,
    placePopover,
  };
})(typeof window !== 'undefined' ? window : globalThis);
