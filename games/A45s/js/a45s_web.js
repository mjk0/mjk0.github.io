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

  // Same tables as Node A45s.js `A45s.suitOrder` / `comparator`.
  const SUIT_ORDER = {
    none: ['het', 'clt', 'dit', 'spt'],
    cl: ['clt', 'din', 'spn', 'hen'],
    di: ['dit', 'cln', 'hen', 'spn'],
    he: ['het', 'cln', 'din', 'spn'],
    sp: ['spt', 'din', 'cln', 'hen'],
    clt: ['5_cl', 'j_cl', 'a_he', 'a_cl', 'k_cl', 'q_cl', '2_cl', '3_cl', '4_cl', '6_cl', '7_cl', '8_cl', '9_cl', 't_cl'],
    cln: ['k_cl', 'q_cl', 'j_cl', 'a_cl', '2_cl', '3_cl', '4_cl', '5_cl', '6_cl', '7_cl', '8_cl', '9_cl', 't_cl'],
    dit: ['5_di', 'j_di', 'a_he', 'a_di', 'k_di', 'q_di', 't_di', '9_di', '8_di', '7_di', '6_di', '4_di', '3_di', '2_di'],
    din: ['k_di', 'q_di', 'j_di', 't_di', '9_di', '8_di', '7_di', '6_di', '5_di', '4_di', '3_di', '2_di', 'a_di'],
    spt: ['5_sp', 'j_sp', 'a_he', 'a_sp', 'k_sp', 'q_sp', '2_sp', '3_sp', '4_sp', '6_sp', '7_sp', '8_sp', '9_sp', 't_sp'],
    spn: ['k_sp', 'q_sp', 'j_sp', 'a_sp', '2_sp', '3_sp', '4_sp', '5_sp', '6_sp', '7_sp', '8_sp', '9_sp', 't_sp'],
    het: ['5_he', 'j_he', 'a_he', 'k_he', 'q_he', 't_he', '9_he', '8_he', '7_he', '6_he', '4_he', '3_he', '2_he'],
    hen: ['k_he', 'q_he', 'j_he', 't_he', '9_he', '8_he', '7_he', '6_he', '5_he', '4_he', '3_he', '2_he'],
  };
  const SORT_ORDER = {};
  ['none', 'cl', 'di', 'he', 'sp'].forEach((trumpSuit) => {
    const so = {};
    let ord = 52;
    SUIT_ORDER[trumpSuit].forEach((suit) => {
      SUIT_ORDER[suit].forEach((c) => {
        // Pre-trump: Ace of hearts lives with hearts only, not every suit-as-trump list.
        if (c !== 'a_he' || trumpSuit !== 'none' || suit === 'het') so[c] = ord--;
      });
    });
    so.cback = ord;
    so.cbcatsil = ord;
    SORT_ORDER[trumpSuit] = so;
  });

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
    if (id.indexOf('fan') >= 0) vb = '0 0 200 96';
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

  // Node `A45s.comparator(trumpSuit)`: null = each suit as trump, H/C/D/S.
  function sortCards(cards, trumpSuit) {
    const so = SORT_ORDER[trumpSuit || 'none'];
    return cards.slice().sort((a, b) => (so[tokenToSvg(b)] || 0) - (so[tokenToSvg(a)] || 0));
  }

  function isTrumpCard(token, trumpSuit) {
    if (!trumpSuit) return false;
    const id = tokenToSvg(token);
    return id === 'a_he' || id.endsWith('_' + trumpSuit);
  }

  // Wire token `H5` or svg id `5_he`.
  function asId(card) {
    if (!card) return '';
    return /^[CDHS]/.test(card) ? tokenToSvg(card) : card;
  }

  function suitOf(card) {
    const id = asId(card);
    const i = id.lastIndexOf('_');
    return i >= 0 ? id.slice(i + 1) : '';
  }

  function rankList(suitKey, asTrump) {
    const list = SUIT_ORDER[(suitKey || '') + (asTrump ? 't' : 'n')];
    return list ? list.slice() : [];
  }

  // 0 = best. Missing card → 99 (does not beat).
  function rankPos(card, suitKey, asTrump) {
    const list = SUIT_ORDER[(suitKey || '') + (asTrump ? 't' : 'n')];
    if (!list) return 99;
    const i = list.indexOf(asId(card));
    return i < 0 ? 99 : i;
  }

  function isTrumpId(id, trumpKey) {
    return !!trumpKey && (id === 'a_he' || id.endsWith('_' + trumpKey));
  }

  // True if `a` currently beats `b` (trump always beats off; else lead-suit only).
  function cardBeats(a, b, trumpKey, leadToken) {
    const aId = asId(a), bId = asId(b);
    const aTr = isTrumpId(aId, trumpKey), bTr = isTrumpId(bId, trumpKey);
    if (aTr !== bTr) return aTr;
    if (aTr) return rankPos(aId, trumpKey, true) < rankPos(bId, trumpKey, true);
    const leadSuit = suitOf(leadToken);
    if (!leadSuit) return false;
    const aOff = suitOf(aId) === leadSuit, bOff = suitOf(bId) === leadSuit;
    if (aOff !== bOff) return aOff;
    if (!aOff) return false;
    return rankPos(aId, leadSuit, false) < rankPos(bId, leadSuit, false);
  }

  function trickWinner(cards, trumpKey) {
    if (!cards || !cards.length) return null;
    const lead = cards[0].card;
    let best = cards[0];
    for (let i = 1; i < cards.length; i++) {
      if (cardBeats(cards[i].card, best.card, trumpKey, lead)) best = cards[i];
    }
    return best;
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
    sortCards,
    isTrumpCard,
    suitOf,
    rankList,
    cardBeats,
    trickWinner,
  };
})(window);
