/* New a45s_web client (does not replace cards3.js). */
(function (global) {
  const PROFILE_KEY = 'a45s.profiles';
  const SESSION_KEY = 'a45s.session';
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

  global.A45sWeb = {
    wsUrl,
    loadProfiles,
    upsertProfile,
    forgetProfile,
    lastProfile,
    getSession,
    setSession,
    connect,
    send,
  };
})(window);
