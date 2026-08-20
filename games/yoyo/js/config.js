// Shared paths and storage keys for lobby + play pages.
// §8: session (tab) vs profiles (local) — hand-sort prefs later.

export const BASE = '/games/yoyo/';
export const CARDS_SVG = '/games/A45s/cards0.svg';

/** Prod game edge: router → tv (yoyo_web TLS). Overridable via ?ws= */
export const PROD_WS_ORIGIN = 'wss://www.pizzamonster.org:3040';

// ?ws= first; https → prod WSS; else same-host ws (local/LAN http).
export function wsOrigin() {
  const q = new URLSearchParams(location.search).get('ws');
  if (q) return q.replace(/\/$/, '');
  if (location.protocol === 'https:') return PROD_WS_ORIGIN;
  return `ws://${location.host}`;
}

const _ws = wsOrigin();
export const LOBBY_WS = `${_ws}/games/yoyo/lobby/ws`;
export const GAME_WS = `${_ws}/games/yoyo/game/ws`;

/** sessionStorage keys — tab-local live identity + navigation */
export const SS = {
  uuid: 'yoyo.uuid',
  username: 'yoyo.username',
  email: 'yoyo.email',
  table: 'yoyo.table',
  seat: 'yoyo.seat',
  /** '1' after explicit Sign out this tab — suppress silent auto-login until Continue/Create */
  gate: 'yoyo.gate',
  /** JSON UserPrefs cache (server wins on Welcome/Prefs) */
  prefs: 'yoyo.prefsCache',
};

/** localStorage keys — cross-tab profiles */
export const LS = {
  profiles: 'yoyo.profiles',
  /** last-known prefs per username (cache; server is source of truth) */
  prefsPrefix: 'yoyo.prefs.',
  /** legacy flat keys (pre-E7) */
  legacyUser: 'yoyo.username',
  legacyEmail: 'yoyo.email',
};

export const MAX_PROFILES = 12;

// OpenN wire id → "Table #N"; private tables keep owner name.
export function displayTableName(tableId) {
  const m = /^Open(\d+)$/i.exec(String(tableId || ''));
  return m ? `Table #${m[1]}` : String(tableId || '');
}

function ukey(n) {
  return String(n || '').trim().toLowerCase();
}

// ——— Session (active login, this tab) ———

/**
 * Active identity for lobby reconnect + play WS Login.
 * Username/email come from session only (not localStorage fallback).
 */
export function loadIdentity() {
  migrateLegacyProfiles();
  return {
    uuid: sessionStorage.getItem(SS.uuid) || '',
    username: sessionStorage.getItem(SS.username) || '',
    email: sessionStorage.getItem(SS.email) || '',
  };
}

/**
 * Write tab session. On successful auth, pass username to upsert profile.
 * Does not write flat localStorage name (use profiles list).
 */
export function saveIdentity({ uuid, username, email, upsert = true } = {}) {
  if (uuid) sessionStorage.setItem(SS.uuid, uuid);
  if (username) sessionStorage.setItem(SS.username, username);
  if (email != null) sessionStorage.setItem(SS.email, email);
  clearSignOutGate();
  if (upsert && username) {
    const em =
      email != null ? email : sessionStorage.getItem(SS.email) || '';
    upsertProfile({ username, email: em });
  }
}

/** Prepare session for a Login attempt (optionally clear uuid when switching users). */
export function beginLogin({ username, email = '' }) {
  const name = String(username || '').trim();
  if (!name) return false;
  const prev = sessionStorage.getItem(SS.username) || '';
  if (prev && ukey(prev) !== ukey(name)) {
    sessionStorage.removeItem(SS.uuid);
  }
  sessionStorage.setItem(SS.username, name);
  sessionStorage.setItem(SS.email, String(email || '').trim());
  clearSignOutGate();
  return true;
}

/** Explicit Sign out — clear live identity; keep profiles; set gate. */
export function clearSession({ keepTable = false } = {}) {
  sessionStorage.removeItem(SS.uuid);
  sessionStorage.removeItem(SS.username);
  sessionStorage.removeItem(SS.email);
  sessionStorage.removeItem(SS.prefs);
  if (!keepTable) {
    sessionStorage.removeItem(SS.table);
    sessionStorage.removeItem(SS.seat);
  }
  sessionStorage.setItem(SS.gate, '1');
}

export function isSignOutGate() {
  return sessionStorage.getItem(SS.gate) === '1';
}

export function clearSignOutGate() {
  sessionStorage.removeItem(SS.gate);
}

// ——— Profiles (remembered logins) ———

/**
 * @typedef {{ username: string, email: string, lastUsed: number }} Profile
 */

/** @returns {Profile[]} */
export function listProfiles() {
  migrateLegacyProfiles();
  try {
    const raw = localStorage.getItem(LS.profiles);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((p) => p && typeof p.username === 'string' && p.username.trim())
      .map((p) => ({
        username: String(p.username).trim(),
        email: String(p.email || '').trim(),
        lastUsed: Number(p.lastUsed) || 0,
      }));
  } catch {
    return [];
  }
}

function writeProfiles(list) {
  localStorage.setItem(LS.profiles, JSON.stringify(list));
}

/** Most recently used profile, or null. */
export function lastUsedProfile() {
  const list = listProfiles();
  if (!list.length) return null;
  return list.slice().sort((a, b) => b.lastUsed - a.lastUsed)[0];
}

export function getProfile(username) {
  const k = ukey(username);
  return listProfiles().find((p) => ukey(p.username) === k) || null;
}

/** Upsert by case-insensitive username; bump lastUsed; cap list. */
export function upsertProfile({ username, email }) {
  const name = String(username || '').trim();
  if (!name) return;
  const em = String(email || '').trim();
  const now = Date.now();
  const k = ukey(name);
  let list = listProfiles().filter((p) => ukey(p.username) !== k);
  list.push({ username: name, email: em, lastUsed: now });
  list.sort((a, b) => b.lastUsed - a.lastUsed);
  if (list.length > MAX_PROFILES) list = list.slice(0, MAX_PROFILES);
  writeProfiles(list);
  // Drop legacy flat keys once we own profiles.
  try {
    localStorage.removeItem(LS.legacyUser);
    localStorage.removeItem(LS.legacyEmail);
  } catch {
    /* ignore */
  }
}

/** Remove one profile (and its local prefs cache). */
export function forgetProfile(username) {
  const k = ukey(username);
  const next = listProfiles().filter((p) => ukey(p.username) !== k);
  writeProfiles(next);
  try {
    localStorage.removeItem(LS.prefsPrefix + String(username || '').trim());
  } catch {
    /* ignore */
  }
}

// ——— User prefs cache (server UserData.prefs is source of truth) ———

/**
 * @typedef {{
 *   news_at?: string|null,
 *   feedback_at?: string|null,
 *   chat_at?: string|null,
 * }} TalkRead
 * @typedef {{
 *   hand_sort: 'desc'|'asc',
 *   warn_subset_lead: boolean,
 *   game: { n?: number, hl?: number, opts?: number, rank_pack?: string },
 *   recent_invitees: string[],
 *   friends: string[],
 *   talk_read: TalkRead,
 * }} UserPrefs
 */

/** @returns {UserPrefs} */
export function defaultPrefs() {
  return {
    hand_sort: 'desc',
    warn_subset_lead: true,
    game: {},
    recent_invitees: [],
    friends: [],
    talk_read: {},
  };
}

function normalizeNameList(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const x of raw) {
    const s = String(x || '').trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

/** Normalize server/client prefs object. */
export function normalizePrefs(raw) {
  const d = defaultPrefs();
  if (!raw || typeof raw !== 'object') return d;
  const hs = raw.hand_sort === 'asc' ? 'asc' : 'desc';
  const g = raw.game && typeof raw.game === 'object' ? raw.game : {};
  const game = {};
  if (g.n != null && Number.isFinite(+g.n)) game.n = +g.n;
  if (g.hl != null && Number.isFinite(+g.hl)) game.hl = +g.hl;
  if (g.opts != null && Number.isFinite(+g.opts)) game.opts = +g.opts;
  if (g.rank_pack != null && String(g.rank_pack).trim()) {
    game.rank_pack = String(g.rank_pack).trim().toLowerCase();
  }
  const trIn = raw.talk_read && typeof raw.talk_read === 'object' ? raw.talk_read : {};
  const talk_read = {};
  if (trIn.news_at) talk_read.news_at = String(trIn.news_at);
  if (trIn.feedback_at) talk_read.feedback_at = String(trIn.feedback_at);
  if (trIn.chat_at) talk_read.chat_at = String(trIn.chat_at);
  return {
    hand_sort: hs,
    warn_subset_lead: raw.warn_subset_lead !== false,
    game,
    recent_invitees: normalizeNameList(raw.recent_invitees),
    friends: normalizeNameList(raw.friends),
    talk_read,
  };
}

/** Load cached prefs (session first, then local for current username). */
export function loadPrefsCache(username) {
  try {
    const ss = sessionStorage.getItem(SS.prefs);
    if (ss) return normalizePrefs(JSON.parse(ss));
  } catch {
    /* ignore */
  }
  const u = username || sessionStorage.getItem(SS.username) || '';
  if (u) {
    try {
      const raw = localStorage.getItem(LS.prefsPrefix + u);
      if (raw) return normalizePrefs(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }
  return defaultPrefs();
}

/** Cache prefs after Welcome / Prefs (session + per-username local). */
export function cachePrefs(prefs, username) {
  const p = normalizePrefs(prefs);
  try {
    sessionStorage.setItem(SS.prefs, JSON.stringify(p));
  } catch {
    /* ignore */
  }
  const u = username || sessionStorage.getItem(SS.username) || '';
  if (u) {
    try {
      localStorage.setItem(LS.prefsPrefix + u, JSON.stringify(p));
    } catch {
      /* ignore */
    }
  }
  return p;
}

export function handSort() {
  return loadPrefsCache().hand_sort === 'asc' ? 'asc' : 'desc';
}

// Rank for display sort (JK high; "!N" suit-error faces; wire C13 / plain 13).
function tokenRank(t) {
  if (!t) return 0;
  const s = String(t).trim().toUpperCase().replace(/#\d+$/, '');
  if (s === 'JK' || s === 'JOKER') return 14;
  if (s.startsWith('!')) {
    const n = parseInt(s.slice(1), 10);
    return Number.isFinite(n) ? n : 0;
  }
  const m = s.match(/^[CDHS](\d{1,2})$/);
  if (m) return +m[1];
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Display order of hand wire tokens (server is always high→low). */
export function displayHandTokens(tokens) {
  const list = tokens || [];
  return handSort() === 'asc' ? [...list].reverse() : list;
}

/**
 * Multi-card play / drag order for card-sort pref.
 * Sort high→low by rank, then reverse when Low→High (asc).
 * Use for drag ghosts, table play stacks, history mini stacks.
 */
export function displayPlayTokens(tokens) {
  const list = [...(tokens || [])];
  list.sort((a, b) => tokenRank(b) - tokenRank(a));
  return handSort() === 'asc' ? list.reverse() : list;
}

/**
 * Apply hand_sort locally and return whether it differs from cache
 * (caller should SetPrefs only when true).
 */
export function applyHandSortLocal(sort) {
  const next = sort === 'asc' ? 'asc' : 'desc';
  const cur = loadPrefsCache();
  if (cur.hand_sort === next) return false;
  cachePrefs({ ...cur, hand_sort: next });
  return true;
}

export function warnSubsetLead() {
  return loadPrefsCache().warn_subset_lead !== false;
}

/** Apply warn_subset_lead locally; true if the cache actually changed. */
export function applyWarnSubsetLeadLocal(on) {
  const next = !!on;
  const cur = loadPrefsCache();
  if (cur.warn_subset_lead === next) return false;
  cachePrefs({ ...cur, warn_subset_lead: next });
  return true;
}

/**
 * Seed profiles from pre-E7 yoyo.username / yoyo.email if needed.
 * Safe to call repeatedly.
 */
export function migrateLegacyProfiles() {
  try {
    if (localStorage.getItem(LS.profiles)) return;
    const u = localStorage.getItem(LS.legacyUser);
    if (!u || !u.trim()) {
      localStorage.setItem(LS.profiles, '[]');
      return;
    }
    const email = localStorage.getItem(LS.legacyEmail) || '';
    writeProfiles([
      {
        username: u.trim(),
        email: String(email).trim(),
        lastUsed: Date.now(),
      },
    ]);
  } catch {
    /* private mode etc. */
  }
}
