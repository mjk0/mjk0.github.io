/* New a45s_web client (does not replace cards3.js). */
(function (global) {
  const PROFILE_KEY = 'a45s.profiles';
  const SESSION_KEY = 'a45s.session';
  const SIGNOUT_KEY = 'a45s.signout';
  const PROFILE_CAP = 10;

  function wsUrl(kind) {
    const q = new URLSearchParams(location.search).get('ws');
    if (q) return q;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}/games/A45s/${kind}/ws`;
  }

  function loadProfiles() {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveProfiles(list) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(list.slice(0, PROFILE_CAP)));
  }

  function upsertProfile(username, email) {
    const list = loadProfiles().filter(
      (p) => p.username.toLowerCase() !== username.toLowerCase()
    );
    list.unshift({ username, email: email || '', lastUsed: Date.now() });
    saveProfiles(list);
  }

  function forgetProfile(username) {
    saveProfiles(
      loadProfiles().filter((p) => p.username.toLowerCase() !== username.toLowerCase())
    );
  }

  function lastProfile() {
    const list = loadProfiles();
    return list[0] || null;
  }

  function getSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function setSession(s) {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
  }

  // Explicit Sign out (and duplicate-login kick) must not silent-auto-return.
  function setSignOutGate(on) {
    if (on) sessionStorage.setItem(SIGNOUT_KEY, '1');
    else sessionStorage.removeItem(SIGNOUT_KEY);
  }
  function isSignOutGate() {
    return sessionStorage.getItem(SIGNOUT_KEY) === '1';
  }

  function connect(kind, onMsg, onClose) {
    const url = wsUrl(kind);
    const ws = new WebSocket(url);
    ws.onmessage = (ev) => {
      try {
        onMsg(JSON.parse(ev.data));
      } catch (e) {
        console.error(e);
      }
    };
    ws.onclose = () => onClose && onClose();
    ws.onerror = () => {};
    return ws;
  }

  function send(ws, obj) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  }

  const SUIT_ID = { C: 'cl', D: 'di', H: 'he', S: 'sp' };

  /** Wire token `H5` / `CA` → cards0.svg id `5_he` / `a_cl`. */
  function tokenToSvg(token) {
    if (!token) return 'cblank';
    const suit = SUIT_ID[token[0]];
    const rank = String(token.slice(1) || '').toLowerCase();
    return suit && rank ? rank + '_' + suit : 'cblank';
  }

  function cardSvg(tokenOrId, className) {
    const raw = tokenOrId || 'cblank';
    const id = /^[CDHS]/.test(raw) ? tokenToSvg(raw) : raw;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    let vb = '0 0 60 80';
    if (id.indexOf('fan') >= 0) vb = '0 4 200 90';
    else if (id === 'cshoriz' || id === 'csvert') vb = '0 0 86 86';
    else if (id === 'crown') vb = '0 0 64 64';
    svg.setAttribute('viewBox', vb);
    svg.setAttribute('class', className || 'card');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', 'cards0.svg#' + id);
    svg.appendChild(use);
    return svg;
  }

  function suitSvg(suitIdx, className) {
    const ids = ['cl', 'di', 'he', 'sp'];
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', className || 'suit');
    svg.setAttribute('viewBox', '0 0 80 80');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', 'cards0.svg#' + (ids[suitIdx] || 'cbcatsil'));
    svg.appendChild(use);
    return svg;
  }

  global.A45sWeb = {
    wsUrl,
    loadProfiles,
    upsertProfile,
    forgetProfile,
    lastProfile,
    getSession,
    setSession,
    setSignOutGate,
    isSignOutGate,
    connect,
    send,
    tokenToSvg,
    cardSvg,
    suitSvg,
  };
})(window);
