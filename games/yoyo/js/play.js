// Play page: deal/exchange, set chips (E4b), drag-to-table.
// LeaveGame only. History suits client-side (historySuits.js).
import {
  GAME_WS,
  loadIdentity,
  SS,
  cachePrefs,
  loadPrefsCache,
  applyHandSortLocal,
  handSort,
  displayHandTokens,
  displayPlayTokens,
  displayTableName,
} from './config.js';
import { cardEl, parseHand, backFan, faceFan, setFaceModeFromOpts } from './cards.js';
import {
  createHistorySuits,
  clearHistorySuits,
  seedFromHand,
  claimPlay,
  syncHistory,
  parseHistoryString,
  parseWireCard,
  hasSuitErrors,
  takeSuitErrors,
  dumpUsed,
  clearPending,
} from './historySuits.js';
import { reconstructLoserHand } from './loserHand.js';
import {
  renderCurrentTrick,
  buildTrickByIndex,
  completedTrickCount,
  miniPlayStack,
  seatArcAngle,
} from './trick.js';
import {
  offerCount,
  responseLockedSize,
  enumerateSetUnits,
  responseEligibility,
} from './legal.js';
import { OPT, hasOpt, optsPills } from './opts.js';
import { placeLabel, normalizeRankPack, DEFAULT_RANK_PACK } from './ranks.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

/** Table rank-title pack (`classic` | `corp`); from Joined / State. */
let tableRankPack = DEFAULT_RANK_PACK;

const STEP = {
  EXCHANGE: 0,
  YOYO_SELECT: 1,
  LEAD: 2,
  PLAY: 3,
  SUMMARY: 4,
  END: 5,
};

/** @type {WebSocket|null} */
let ws = null;
let intentionalClose = false;
/** True after server `duplicate_login` — do not auto-reconnect (stops takeover fight). */
let takenOver = false;
let reconnectTimer = null;
let joined = false;
let mySeat = 0;
let tableId = params.get('table') || sessionStorage.getItem(SS.table) || '';
let wantSeat = +(params.get('seat') || sessionStorage.getItem(SS.seat) || 1);

/**
 * TEMP join/rejoin debug — set false (or remove block) when done reproducing.
 * - Logs leavegame / joinseat / joined / seat_mismatch with seat+storage context
 * - On seat_mismatch: does NOT auto-redirect to lobby (stay put to copy console)
 * Enable Preserve log in DevTools Console settings across page hops.
 */
const DEBUG_JOIN = false;

/** @type {string[]} */
let playerNames = [];
/** Disconnect-paused seats: seat number → username (until Resumed / handoff / leave). */
let pausedSeats = /** @type {Map<number, string>} */ (new Map());
/** @type {object|null} last State */
let lastState = null;
/** @type {object|null} last Summary series */
let seriesStats = null;
/** @type {{ finish_order: number[], pts: Record<string, number>, series?: object }|null} */
let lastSummary = null;
/** Last play-again vote map (merged into finish board). */
let playAgainStatus = /** @type {{ ready: Record<string, boolean>, waiting: string[] }} */ ({
  ready: {},
  waiting: [],
});
/** End-of-hand loser face reveal (client reconstruct). @type {{ seat: number, faces: string[] }|null} */
let lastLoserReveal = null;
/** After summary: next Players event triggers seat-shift (E4.4). */
let seatShiftPending = false;
/** Local last-trick hold before Game summary panel. */
let gameOverHoldActive = false;
/** Rejoin / catch-up: skip hold, open summary immediately. */
let gameOverSkipHold = false;
/** True once Game summary (play-again) panel is shown this hand. */
let gameOverSummaryOpen = false;
let gameOverHoldGen = 0;
/** @type {ReturnType<typeof setInterval>|null} */
let gameOverHoldTick = null;
// Full last-trick beat before slide-to-dock + summary (shorter: dock stays visible).
const GAME_OVER_HOLD_MS = 2500;
const GAME_OVER_HOLD_MS_REDUCED = 1000;
// Park slide duration before summary panel opens (match CSS transform).
const GAME_OVER_PARK_MS = 480;
const GAME_OVER_PARK_MS_REDUCED = 0;
/**
 * After trick ends (LEAD + history): park piles on next render with animation.
 * Cleared on new lead play / summary / empty history. Rejoin snaps parked.
 */
let pendingTrickParkAnim = false;
let trickParkGen = 0;
/** Snapshot of names/seat before rotation for seat-shift animation. */
let preShiftNames = /** @type {string[]} */ ([]);
let preShiftMySeat = 1;
/** History popover: 0-based completed trick index. */
let histViewIndex = -1;
/** When true, chrome follows the newest completed trick as the hand progresses. */
let histPinnedToLast = true;
/** @type {Set<string>} selected wire cards */
const selected = new Set();
/** @type {object|null} seat-draw status */
let drawStatus = null;
let drawDone = false;
/** E2b seat theater running (spin/fanfare/token settle). */
let seatCeremonyActive = false;
let seatCeremonyGen = 0;
let animating = false;
let reducedMotion = false;
/** @type {import('./historySuits.js').HistorySuits} */
const histSuits = createHistorySuits();
/** previous history entry count (detect new hand) */
let prevHistLen = -1;
/** last Play/Offer cards csv (for err debug) */
let lastSentPlay = null;
/** deal-in animation once per distinct dealt hand (not per State/step) */
let lastAnimatedDealKey = '';
/** pointer drag state */
let drag = null;
/**
 * E4d: parked seq5 bays (client layout only).
 * @type {{ tokens: string[], side: 'left'|'right' }[]}
 */
let parkedSeqs = [];
/** @type {object|null} last ExchangePhase event */
let exchPhase = null;
/** Optimistic hide of Prez offer cards until ExchangePhase / State catch up */
let localOfferCards = /** @type {string[]} */ ([]);
/** Yoyo pick from surplus offer pile (wire tokens ⊆ president_offer) */
let yoyoPick = /** @type {string[]} */ ([]);
/** Last seen server offer csv — detect new arrivals for pop-in */
let prevOfferCsv = '';
/** Wires that just joined the offer pile (CSS ex-arrive) */
let exchArriveWires = /** @type {Set<string>} */ (new Set());
/**
 * Snapshot for Ex3d settle anim when exchange → lead.
 * @type {null | { pile: string[], need: number, rects: Record<string, DOMRect>, yGive: string[] }}
 */
let exchSettleSnap = null;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function ukey(n) {
  return String(n || '').trim().toLowerCase();
}

// Session robot seat labels (server: B.{Name}).
function isBotName(name) {
  return /^B\./.test(name || '');
}

// True when same multiset of names, different seat order (next-hand rotate).
// Leave/handoff botify changes the multiset — not a rotation.
function isNamePermutation(a, b) {
  if (!a?.length || a.length !== b?.length) return false;
  const sa = a.map(ukey).slice().sort().join('\0');
  const sb = b.map(ukey).slice().sort().join('\0');
  if (sa !== sb) return false;
  return a.some((n, i) => ukey(n) !== ukey(b[i]));
}

// Wire series avg 0..1 → display 0..100.
function score100(x) {
  if (x == null || Number.isNaN(+x)) return '—';
  return String(Math.round(+x * 100));
}

// Place points 0..1 (mirror server rank_points).
function rankPoints(n, place) {
  if (n == null || n <= 1 || place == null || place < 1) return 0;
  return (n - place) / (n - 1);
}

// Δ series avg (0–100). games≥2: true Δavg; first hand / no series: vs start-seat baseline.
function deltaAvg100(handPts, st, n, startSeat) {
  if (handPts == null || Number.isNaN(+handPts)) return null;
  const hp = +handPts;
  // No prior series sample: virtual prior = value of randomly assigned start seat.
  if (st == null || st.games == null || st.games < 2) {
    if (n == null || startSeat == null || startSeat < 1) return null;
    return (hp - rankPoints(n, startSeat)) * 100;
  }
  const prevAvg = (st.pts - hp) / (st.games - 1);
  return (st.avg - prevAvg) * 100;
}

// Format Δavg (0–100 scale): rounded integer; bots arrow-only (no magnitude).
function formatDeltaAvg(d, { arrowOnly = false } = {}) {
  if (d == null || Number.isNaN(d)) {
    return { cls: 'na', text: arrowOnly ? '' : '—' };
  }
  const r = Math.round(d);
  if (r === 0) {
    return { cls: 'zero', text: arrowOnly ? '' : '0' };
  }
  if (r > 0) {
    return { cls: 'up', text: arrowOnly ? '↑' : `↑ ${r}` };
  }
  return { cls: 'down', text: arrowOnly ? '↓' : `↓ ${Math.abs(r)}` };
}

// Case-insensitive lookup in a name→value map.
function mapLookup(map, name) {
  if (!map || !name) return undefined;
  if (name in map) return map[name];
  const k = ukey(name);
  for (const [n, v] of Object.entries(map)) {
    if (ukey(n) === k) return v;
  }
  return undefined;
}

// Short table roles from table pack (corp default: CEO · VP · … · Yoyo).
function placeLabels(n, absSeat) {
  return placeLabel(n, absSeat, tableRankPack);
}

// Remember pack from Joined / State for seat-draw reels before deal State.
function setTableRankPack(raw) {
  tableRankPack = normalizeRankPack(raw);
}

// Ordinal for finish place 1..n (place pill / board).
function placeOrdinal(place) {
  const s = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'];
  return s[place] || `${place}th`;
}

// Finish place for seat from partial/full finish_order (0 = still in).
function finishPlaceForSeat(seat) {
  const order = lastSummary?.finish_order || lastState?.finish_order || [];
  const i = order.findIndex((s) => +s === +seat);
  return i >= 0 ? i + 1 : 0;
}

// End-of-hand boards: full finish present (summary / rejoin).
function boardsUseNextOffices() {
  if (gameOverSummaryOpen || lastSummary) return true;
  if ((lastState?.step ?? 0) >= STEP.SUMMARY) return true;
  return false;
}

// Place-pill side: inboard toward center; you lateral; opposite right + top (+ up under summary).
function placePillLayout(vi, n, summaryOpen) {
  const isYou = vi === 0;
  const isOpp = n >= 2 && n % 2 === 0 && vi === n / 2;
  if (isYou) return { side: 'end', opposite: false, nudge: false };
  if (isOpp) return { side: 'end', opposite: true, nudge: !!summaryOpen };
  const pos = seatPositions(n)[vi];
  // Left of felt → pill right (center); right → pill left
  if (pos.x < 50) return { side: 'end', opposite: false, nudge: false };
  return { side: 'start', opposite: false, nudge: false };
}

// Max series.games across players (session hands completed).
function sessionGamesCompleted() {
  if (!seriesStats) return 0;
  let max = 0;
  for (const st of Object.values(seriesStats)) {
    const g = st?.games | 0;
    if (g > max) max = g;
  }
  return max;
}

// Role cell: single title if held; "Prez → VP" when office changes.
function roleTransitionHtml(n, oldRank, nextRank) {
  const oldL = placeLabels(n, oldRank);
  const newL = placeLabels(n, nextRank);
  if (oldL === newL) return escapeHtml(newL);
  return (
    `${escapeHtml(oldL)}` +
    `<span class="fin-role-arrow" aria-hidden="true">→</span>` +
    `${escapeHtml(newL)}`
  );
}

// Screen-reader live region only (center caption removed; felt owns turn/pass/out).
function setStatus(msg) {
  const el = $('status-line');
  if (el) el.textContent = msg || '';
}

/** @type {ReturnType<typeof setTimeout> | null} */
let illegalToastTimer = null;

// Retriggerable felt toast for illegal play/offer (fade in/out).
function flashIllegalToast(msg) {
  const el = $('illegal-toast');
  if (!el) return;
  el.textContent = msg || 'Illegal play';
  el.hidden = false;
  el.classList.remove('show');
  void el.offsetWidth; // restart CSS animation
  el.classList.add('show');
  if (illegalToastTimer) clearTimeout(illegalToastTimer);
  illegalToastTimer = setTimeout(() => {
    el.classList.remove('show');
    el.hidden = true;
    illegalToastTimer = null;
  }, 3300); // match illegal-toast-fade (~3.2s)
}

// Reject play/offer: SR status + toast + clear bad selection.
function rejectPlay(reason) {
  const text = String(reason || 'bad play');
  const msg = /^(Illegal|Error):/i.test(text) ? text : `Illegal: ${text}`;
  setStatus(msg);
  flashIllegalToast(msg);
  clearSelection();
}

// Non-blocking debug banner when suit allocation fails (dev).
function showSuitDebug(msgs) {
  let el = $('suit-debug');
  if (!el) {
    el = document.createElement('div');
    el.id = 'suit-debug';
    el.className = 'suit-debug';
    el.setAttribute('role', 'status');
    const strip = document.querySelector('.play-strip');
    if (strip) strip.insertAdjacentElement('afterend', el);
    else document.body.prepend(el);
  }
  if (!msgs || !msgs.length) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = `⚠ history suits: ${msgs.join(' · ')}`;
}

function flushSuitErrors() {
  if (!hasSuitErrors(histSuits)) return;
  const errs = takeSuitErrors(histSuits);
  showSuitDebug(errs);
  console.error('[suits] used map:', dumpUsed(histSuits), 'faces:', histSuits.faces.join(','));
}

// New hand or first deal: reset faces + masks, seed from hand.
function resetSuitsForHand(handStr) {
  clearHistorySuits(histSuits);
  seedFromHand(histSuits, parseHand(handStr));
  prevHistLen = 0;
  // Allow deal animation again for this hand's cards.
  lastAnimatedDealKey = '';
  clearParkedSeqs();
  showSuitDebug(null);
}

// ——— Seq5 park bays (E4d.1–E4d.2) ———

// Active hand wires excluding exchange transit.
function activeHandWires() {
  if (!lastState?.hand) return [];
  const transit = exchangeTransitSet();
  const wire = parseHand(lastState.hand);
  return transit.size ? wire.filter((t) => !transit.has(t)) : wire;
}

// True if two token lists are the same multiset.
function sameTokenUnit(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return false;
  return a.every((t) => b.includes(t)) && b.every((t) => a.includes(t));
}

// Drop incomplete parks (card left hand / play broke seq) — survivors → free.
function pruneParkedSeqs(activeWire) {
  const set = new Set(activeWire || []);
  parkedSeqs = parkedSeqs.filter((bay) => {
    const still = (bay.tokens || []).filter((t) => set.has(t));
    // Any missing token → dissolve whole bay (auto-unpark on break/play)
    return still.length === 5;
  });
}

// Clear all seq parks (new deal / no hand).
function clearParkedSeqs() {
  parkedSeqs = [];
}

// Tokens currently in any bay.
function parkedTokenSet() {
  const s = new Set();
  for (const bay of parkedSeqs) for (const t of bay.tokens) s.add(t);
  return s;
}

// True if tokens exactly match some parked bay.
function isParkedUnit(tokens) {
  return parkedSeqs.some((bay) => sameTokenUnit(bay.tokens, tokens));
}

// Highest natural rank token (seq chip anchors on high end of bay).
function highAnchorToken(tokens) {
  let best = tokens?.[0] || '';
  let bestR = -1;
  for (const t of tokens || []) {
    const c = parseWireCard(t);
    if (c && !c.joker && c.rank > bestR) {
      bestR = c.rank;
      best = t;
    }
  }
  return best;
}

// Lowest natural rank token (bay × anchors on low end, opposite the 5-chip).
function lowAnchorToken(tokens) {
  let best = tokens?.[0] || '';
  let bestR = 99;
  for (const t of tokens || []) {
    const c = parseWireCard(t);
    if (c && !c.joker && c.rank < bestR) {
      bestR = c.rank;
      best = t;
    }
  }
  return best;
}

// Clear set chips from hosts but keep bay × controls.
function clearChipHosts(wrap) {
  wrap.querySelectorAll('.set-chip-host').forEach((h) => {
    const unpark = h.querySelector('.bay-unpark');
    h.replaceChildren();
    if (unpark) h.appendChild(unpark);
  });
}

// Same multiset of ranks (suits may differ) — match formable seq to a park.
function sameRankMultiset(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return false;
  const ra = a
    .map((t) => parseWireCard(t)?.rank ?? -1)
    .sort((x, y) => x - y);
  const rb = b
    .map((t) => parseWireCard(t)?.rank ?? -1)
    .sort((x, y) => x - y);
  return ra.every((r, i) => r === rb[i]);
}

/**
 * E4d.3: bind set chips to free vs bay clusters.
 * - Parked seq units use bay tokens + high anchor on bay
 * - Free set units keep cascade anchors (do not collapse to one face)
 * - Ensure every park still has a `5` chip
 */
function alignUnitsWithParks(units, { seqInteractive } = {}) {
  if (!parkedSeqs.length) {
    // Still prefer free anchors for sets if reserved empty — no-op
    return units || [];
  }
  const reserved = parkedTokenSet();
  const claimed = new Set();

  function claimPark(uTokens) {
    for (let i = 0; i < parkedSeqs.length; i++) {
      if (claimed.has(i)) continue;
      const p = parkedSeqs[i];
      if (
        sameTokenUnit(p.tokens, uTokens) ||
        sameRankMultiset(p.tokens, uTokens)
      ) {
        claimed.add(i);
        return p;
      }
    }
    return null;
  }

  const out = [];
  for (const u of units || []) {
    const isSeq = u.kind === 'seq' || u.size === 5;
    if (isSeq) {
      const park = claimPark(u.tokens);
      if (park) {
        out.push({
          ...u,
          tokens: park.tokens.slice(),
          anchorToken: highAnchorToken(park.tokens),
        });
        continue;
      }
      // Non-parked seq: free faces only — drop if any rank needs a parked card
      const ranks = new Map(); // rank → free tokens
      for (const t of activeHandWires()) {
        if (reserved.has(t)) continue;
        const c = parseWireCard(t);
        if (!c || c.joker) continue;
        if (!ranks.has(c.rank)) ranks.set(c.rank, []);
        ranks.get(c.rank).push(t);
      }
      let ok = true;
      const remapped = [];
      for (const t of u.tokens || []) {
        const c = parseWireCard(t);
        if (!c || c.joker) {
          ok = false;
          break;
        }
        const pool = ranks.get(c.rank);
        if (pool?.length) remapped.push(pool.shift());
        else {
          ok = false;
          break;
        }
      }
      if (ok && remapped.length === (u.tokens || []).length) {
        out.push({
          ...u,
          tokens: remapped,
          anchorToken: highAnchorToken(remapped),
        });
      }
      // else: omit chip (would break a park)
      continue;
    }
    // Pair/trip/quad: drop if tokens still touch reserved; keep cascade anchor
    if ((u.tokens || []).some((t) => reserved.has(t))) continue;
    out.push({
      ...u,
      anchorToken: u.anchorToken || highAnchorToken(u.tokens),
    });
  }

  // Inject chip for any park not claimed by formable enumeration
  for (let i = 0; i < parkedSeqs.length; i++) {
    if (claimed.has(i)) continue;
    const p = parkedSeqs[i];
    const hi = (() => {
      let r = 0;
      for (const t of p.tokens) {
        const c = parseWireCard(t);
        if (c && !c.joker && c.rank > r) r = c.rank;
      }
      return r;
    })();
    const interactive =
      typeof seqInteractive === 'function'
        ? !!seqInteractive(p.tokens)
        : false;
    out.push({
      id: `park-bay-${i}-${hi}`,
      size: 5,
      rank: hi,
      kind: 'seq',
      tokens: p.tokens.slice(),
      anchorToken: highAnchorToken(p.tokens),
      interactive,
    });
  }
  return out;
}

// Show L/R park zones when SEQ5 is on.
function updateParkZones() {
  const on = !!(lastState?.hand && hasOpt(lastState.opts || 0, OPT.SEQ5));
  for (const id of ['park-zone-left', 'park-zone-right']) {
    const el = $(id);
    if (!el) continue;
    el.hidden = !on;
  }
  $('hand-main')?.classList.toggle('has-parks', parkedSeqs.length > 0);
}

// Park zone under pointer, or null.
function hitParkZone(clientX, clientY) {
  for (const id of ['park-zone-left', 'park-zone-right']) {
    const el = $(id);
    if (!el || el.hidden) continue;
    const r = el.getBoundingClientRect();
    if (
      clientX >= r.left &&
      clientX <= r.right &&
      clientY >= r.top &&
      clientY <= r.bottom
    ) {
      return el.dataset.park === 'left' ? 'left' : 'right';
    }
  }
  return null;
}

// Point inside any parked bay element?
function hitAnyBay(clientX, clientY) {
  for (const bay of document.querySelectorAll('.hand-bay')) {
    const r = bay.getBoundingClientRect();
    if (
      clientX >= r.left &&
      clientX <= r.right &&
      clientY >= r.top &&
      clientY <= r.bottom
    ) {
      return true;
    }
  }
  return false;
}

// Unpark drop: free row, or hand-main outside any bay.
function hitFreeHand(clientX, clientY) {
  const free = $('hand');
  if (free && !free.hidden) {
    const r = free.getBoundingClientRect();
    if (
      clientX >= r.left &&
      clientX <= r.right &&
      clientY >= r.top &&
      clientY <= r.bottom
    ) {
      return true;
    }
  }
  const main = $('hand-main');
  if (!main) return false;
  const mr = main.getBoundingClientRect();
  if (
    clientX < mr.left ||
    clientX > mr.right ||
    clientY < mr.top ||
    clientY > mr.bottom
  ) {
    return false;
  }
  return !hitAnyBay(clientX, clientY);
}

// Park seq on left/right; multi-bay; reject overlap with toast.
function tryParkSeq(tokens, side) {
  const list = [...(tokens || [])];
  if (list.length !== 5) return false;
  const active = activeHandWires();
  if (!list.every((t) => active.includes(t))) return false;
  const sideNorm = side === 'left' ? 'left' : 'right';

  // Already parked → move to this side
  const existing = parkedSeqs.find((b) => sameTokenUnit(b.tokens, list));
  if (existing) {
    existing.side = sideNorm;
    selected.clear();
    renderHand();
    return true;
  }

  // Overlap with another bay
  const reserved = parkedTokenSet();
  if (list.some((t) => reserved.has(t))) {
    rejectPlay('shares cards with a parked seq');
    return false;
  }

  parkedSeqs.push({ tokens: list, side: sideNorm });
  selected.clear();
  renderHand();
  return true;
}

// Unpark one bay (by tokens) or all if tokens omitted.
function unparkSeq(tokens) {
  if (!parkedSeqs.length) return;
  if (tokens?.length) {
    const before = parkedSeqs.length;
    parkedSeqs = parkedSeqs.filter((b) => !sameTokenUnit(b.tokens, tokens));
    if (parkedSeqs.length === before) return;
  } else {
    parkedSeqs = [];
  }
  selected.clear();
  renderHand();
}

// Build one bay cluster DOM (five card slots; × in low-end chip host).
function buildBayCluster(bay, { elig, canAct, dealAnim, animIndex }) {
  const el = document.createElement('div');
  el.className = 'hand hand-bay';
  el.setAttribute('aria-label', 'Parked sequence');
  el.dataset.bayTokens = bay.tokens.join(',');
  if (handSort() === 'asc') el.classList.add('hand-asc');

  let i = animIndex;
  const slots = displayHandTokens(bay.tokens).map((t) =>
    buildHandCardEl(t, { elig, canAct, dealAnim, animIndex: i++ }),
  );
  el.replaceChildren(...slots);

  // × above low card (opposite 5-chip on high); same chip gutter as set chips
  const lowTok = lowAnchorToken(bay.tokens);
  const bayTokens = bay.tokens.slice();
  for (const slot of slots) {
    const card = slot.querySelector('.card');
    if (card?.dataset.wire !== lowTok) continue;
    const host = slot.querySelector('.set-chip-host');
    if (!host) break;
    const unpark = document.createElement('button');
    unpark.type = 'button';
    unpark.className = 'bay-unpark';
    unpark.title = 'Unpark sequence';
    unpark.setAttribute('aria-label', 'Unpark sequence');
    unpark.textContent = '×';
    unpark.addEventListener('click', (e) => {
      e.stopPropagation();
      unparkSeq(bayTokens);
    });
    host.appendChild(unpark);
    break;
  }
  return { el, nextAnim: i };
}

// Build one hand card in a slot (chip host + face) so chips wrap with multi-row hands.
function buildHandCardEl(t, { elig, canAct, dealAnim, animIndex }) {
  const card = cardEl(t);
  card.dataset.wire = t;
  if (selected.has(t)) card.classList.add('selected');
  if (elig && !elig.live.has(t)) card.classList.add('dead');
  if (dealAnim) {
    card.classList.add('deal-in');
    card.style.animationDelay = `${Math.min(animIndex, 12) * 35}ms`;
  }
  card.addEventListener('click', () => {
    if (card._dragMoved) {
      card._dragMoved = false;
      return;
    }
    if (!canAct) return;
    toggleCardSelection(t);
  });
  card.addEventListener('pointerdown', (ev) => onCardPointerDown(ev, card, t));

  const host = document.createElement('div');
  host.className = 'set-chip-host';
  host.dataset.chipFor = t;

  const slot = document.createElement('div');
  slot.className = 'hand-slot';
  slot.append(host, card);
  return slot;
}

// Apply server history + hand to suit map.
// syncHistory rebuilds used from faces+pending+current hand (exchange drops given-away suits).
function applyHistorySuits(state) {
  const hand = parseHand(state.hand);
  const n = parseHistoryString(state.history || '').length;
  if (prevHistLen < 0) {
    clearHistorySuits(histSuits);
    syncHistory(histSuits, state.history || '', hand);
  } else if (n === 0 && prevHistLen > 0) {
    resetSuitsForHand(state.hand);
  } else if (n === 0) {
    seedFromHand(histSuits, hand);
  } else {
    syncHistory(histSuits, state.history || '', hand);
  }
  prevHistLen = n;
  flushSuitErrors();
}

function send(obj) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify(obj));
  return true;
}

function goLobby() {
  intentionalClose = true;
  takenOver = false;
  if (ws) ws.close();
  const wsQ = new URLSearchParams(location.search).get('ws');
  location.href = wsQ ? `index.html?ws=${encodeURIComponent(wsQ)}` : 'index.html';
}

// Drop pending auto-reconnect.
function clearReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

// Show sticky takeover bar: reclaim seat or leave to lobby.
function showTakenOverBanner() {
  let el = $('taken-over-banner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'taken-over-banner';
    el.className = 'taken-over-banner';
    el.setAttribute('role', 'status');
    const area = $('table-area') || document.body;
    area.prepend(el);
  }
  el.hidden = false;
  el.innerHTML =
    `<span>Signed in on another device — this tab was disconnected.</span>` +
    `<span class="taken-over-actions">` +
    `<button type="button" class="primary" id="btn-reclaim-seat">Continue here</button>` +
    `<button type="button" id="btn-taken-lobby">Lobby</button>` +
    `</span>`;
  $('btn-reclaim-seat')?.addEventListener('click', () => {
    takenOver = false;
    el.hidden = true;
    connect();
  });
  $('btn-taken-lobby')?.addEventListener('click', () => goLobby());
}

// Server booted this game tab for the same username (other device/tab won).
function handleTakenOver() {
  takenOver = true;
  clearReconnect();
  joined = false;
  setStatus('Signed in on another device');
  flashIllegalToast('Signed in on another device — this tab disconnected');
  showTakenOverBanner();
}

// Hide takeover bar after successful rejoin.
function hideTakenOverBanner() {
  const el = $('taken-over-banner');
  if (el) el.hidden = true;
}

// Relative arc: visual index 0 = you (bottom); clockwise.
function seatPositions(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = Math.PI / 2 + (i * 2 * Math.PI) / n;
    out.push({ x: 50 + 38 * Math.cos(a), y: 48 + 36 * Math.sin(a) });
  }
  return out;
}

// Absolute seat (1-based) → visual index with you at bottom.
function visualIndex(absSeat, n, youSeat) {
  if (!youSeat) return (absSeat - 1 + n) % n;
  return (absSeat - youSeat + n) % n;
}

// Brand label + option pills; refresh open standings if needed.
function renderStrip() {
  const lab = $('table-label');
  if (lab) {
    const shown = tableId ? displayTableName(tableId) : '?';
    lab.textContent = ` / ${shown}:`;
    lab.title = tableId || '';
  }
  const host = $('opt-pills');
  if (host) {
    host.replaceChildren();
    if (lastState) {
      const hl = lastState.hl > 0 ? lastState.hl : null;
      for (const p of optsPills(lastState.opts | 0, hl)) {
        const chip = document.createElement('span');
        chip.className = 'opt-pill' + (p.kind ? ` opt-pill-${p.kind}` : '');
        chip.textContent = p.text;
        host.appendChild(chip);
      }
    }
  }
  if (!$('standings-pop')?.hidden) renderStandingsBoard();
}

// Open/close Score standings popover (mutually exclusive with History).
function setStandingsOpen(open) {
  const pop = $('standings-pop');
  if (!pop) return;
  if (open) setHistoryOpen(false);
  pop.hidden = !open;
  $('btn-scores')?.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) renderStandingsBoard();
}

// Live standings: mid-hand = seat office; end-of-hand = next office + old→new (no vote).
function renderStandingsBoard() {
  const board = $('standings-board');
  if (!board) return;
  // Footer sibling under the list
  let foot = $('standings-footer');
  if (!foot) {
    foot = document.createElement('p');
    foot.id = 'standings-footer';
    foot.className = 'standings-footer';
    board.after(foot);
  }
  const setFooter = () => {
    const g = sessionGamesCompleted();
    if (g > 0) {
      foot.hidden = false;
      foot.textContent = `Completed ${g} game${g === 1 ? '' : 's'}`;
    } else {
      foot.hidden = true;
      foot.textContent = '';
    }
  };
  const me = ukey(loadIdentity().username);
  const order = lastSummary?.finish_order || lastState?.finish_order || [];
  const useNext = boardsUseNextOffices() && order.length;
  const n = useNext
    ? order.length
    : playerNames.length || lastState?.n || 0;
  if (!n || (!useNext && !playerNames.length)) {
    const empty = document.createElement('li');
    empty.className = 'fin-empty';
    empty.textContent = 'No players yet';
    board.replaceChildren(empty);
    setFooter();
    return;
  }
  // Header: only Score (no empty rank chip / "Player")
  const head = document.createElement('li');
  head.className = 'fin-head';
  head.setAttribute('aria-hidden', 'true');
  head.innerHTML =
    '<span class="fin-rank"></span>' +
    '<span class="fin-name"></span>' +
    '<span class="fin-avg" title="Session average (0–100)">Score</span>';
  const rows = useNext
    ? order.map((seat, i) => {
        const nextRank = i + 1;
        const oldRank = +seat;
        const name = playerNames[seat - 1] || `Seat ${seat}`;
        return { nextRank, oldRank, name };
      })
    : playerNames.map((name, i) => ({
        nextRank: i + 1,
        oldRank: i + 1,
        name,
      }));
  board.replaceChildren(
    head,
    ...rows.map((row) => {
      const { nextRank, oldRank, name } = row;
      const isYou = !!(me && ukey(name) === me);
      const li = document.createElement('li');
      const cls = [];
      if (nextRank === 1) cls.push('fin-prez');
      else if (nextRank === 2) cls.push('fin-vp');
      if (isYou) cls.push('fin-you');
      if (cls.length) li.className = cls.join(' ');
      if (isYou) li.setAttribute('aria-current', 'true');
      const st = seriesStats && (seriesStats[name] || seriesStatsLookup(name));
      const avgStr = st ? score100(st.avg) : '—';
      const youChip = isYou
        ? '<span class="fin-you-chip" title="You"><span class="fin-you-caret" aria-hidden="true"></span>you</span>'
        : '';
      const roleHtml = useNext
        ? roleTransitionHtml(n, oldRank, nextRank)
        : escapeHtml(placeLabels(n, nextRank));
      li.innerHTML =
        `<span class="fin-rank">${nextRank}</span>` +
        `<span class="fin-name"><span class="fin-name-line">${escapeHtml(name)}${youChip}</span>` +
        `<span class="fin-role">${roleHtml}</span></span>` +
        `<span class="fin-avg">${avgStr}</span>`;
      return li;
    }),
  );
  setFooter();
}

// Case-insensitive series stats lookup.
function seriesStatsLookup(name) {
  if (!seriesStats || !name) return null;
  const k = ukey(name);
  for (const [n, st] of Object.entries(seriesStats)) {
    if (ukey(n) === k) return st;
  }
  return null;
}

// Ready vote for name from last PlayAgainStatus (bots always ready).
function isPlayAgainReady(name) {
  if (isBotName(name)) return true;
  const ready = playAgainStatus.ready || {};
  if (ready[name]) return true;
  const k = ukey(name);
  for (const [n, v] of Object.entries(ready)) {
    if (ukey(n) === k && v) return true;
  }
  return false;
}

/**
 * @param {string} name
 * @param {number} absSeat current arc seat 1..n
 * @param {number} n
 * @param {number} rem
 * @param {{
 *   next?: boolean, myTurn?: boolean, passed?: boolean, paused?: boolean,
 *   handoff?: boolean, noRank?: boolean,
 *   faceTokens?: string[]|null, place?: number,
 *   placeSide?: 'start'|'end', placeOpposite?: boolean, placeNudge?: boolean
 * }} [opts]
 *   Office chrome always follows absSeat (this-hand title). place = finish 1..n pill.
 *   noRank = hide chip/wash (seat-draw lobby slots).
 *   faceTokens = end-of-hand face-up fan (opponent loser).
 *   handoff = show “Robot take over?” (other humans only).
 */
function buildSeatToken(name, absSeat, n, rem, opts = {}) {
  const el = document.createElement('div');
  el.className = 'seat-token';
  el.dataset.seat = String(absSeat);
  el.dataset.name = name;
  if (mySeat === absSeat) el.classList.add('you');
  if (opts.next) el.classList.add('next');
  if (opts.myTurn) el.classList.add('my-turn');
  if (opts.passed) el.classList.add('passed');
  if (opts.paused) el.classList.add('paused');

  // Office = current seat (never next-hand override)
  const rank = opts.noRank ? null : absSeat;
  if (rank === 1) el.classList.add('rank-prez');
  else if (rank === 2) el.classList.add('rank-vp');
  if (rank != null) el.dataset.rank = String(rank);

  const place = opts.place > 0 ? opts.place : 0;
  if (place) {
    el.classList.add(opts.placeSide === 'start' ? 'pp-start' : 'pp-end');
    if (opts.placeOpposite) el.classList.add('pp-opposite');
    if (opts.placeNudge) el.classList.add('pp-nudge');
  }

  const nm = document.createElement('div');
  nm.className = 'sname';
  nm.textContent = name;
  el.appendChild(nm);

  // Rank chip + role (this-hand office)
  const meta = document.createElement('div');
  meta.className = 'smeta srole';
  if (rank != null) {
    const chip = document.createElement('span');
    chip.className = 'rank-chip';
    if (rank === 1) chip.classList.add('gold');
    else if (rank === 2) chip.classList.add('silver');
    chip.textContent = String(rank);
    chip.title = `Office ${rank}`;
    meta.appendChild(chip);
  }
  const role = document.createElement('span');
  role.className = 'role-name';
  role.textContent = rank != null ? placeLabels(n, rank) : placeLabels(n, absSeat);
  meta.appendChild(role);
  el.appendChild(meta);

  if (mySeat !== absSeat) {
    const mass = document.createElement('div');
    mass.className = 'seat-mass';
    const faces = opts.faceTokens;
    if (faces && faces.length) {
      mass.appendChild(faceFan(faces, { w: 28, h: 38 }));
    } else {
      mass.appendChild(backFan(rem ?? 0, { w: 22, h: 30 }));
    }
    el.appendChild(mass);
  }
  if (opts.paused) {
    const b = document.createElement('span');
    b.className = 'badge pause';
    b.textContent = 'PAUSED';
    el.appendChild(b);
  }
  if (opts.paused && opts.handoff) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-handoff';
    btn.textContent = 'Robot take over?';
    btn.title = `Let a robot play for ${name}`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      send({ action: 'handoffrobot', seat: absSeat });
      setStatus(`Requesting robot for ${name}…`);
    });
    el.appendChild(btn);
  }
  // Finish place beside token (as soon as OUT; stays through summary)
  if (place) {
    const pill = document.createElement('span');
    pill.className = 'place-pill';
    if (place === 1) pill.classList.add('gold');
    else if (place === 2) pill.classList.add('silver');
    pill.textContent = placeOrdinal(place);
    pill.title = `Finished ${placeOrdinal(place)}`;
    el.appendChild(pill);
  }
  return el;
}

// Drop one paused seat; re-render seats if active.
function clearPausedSeat(seat) {
  if (!pausedSeats.delete(+seat)) return;
  if (!animating) renderSeatsFromState();
}

// Clear all disconnect pauses (new hand / leave / full reset).
function clearAllPaused() {
  if (!pausedSeats.size) return;
  pausedSeats.clear();
  if (!animating) renderSeatsFromState();
}

// Drop pauses that no longer match human names (handoff → bot, leave, rotate).
function syncPausedWithNames(names) {
  let dirty = false;
  for (const seat of [...pausedSeats.keys()]) {
    const nm = names[seat - 1];
    const expect = pausedSeats.get(seat);
    if (!nm || isBotName(nm) || (expect && ukey(nm) !== ukey(expect))) {
      pausedSeats.delete(seat);
      dirty = true;
    }
  }
  return dirty;
}

// Face tokens for opponent loser seat (not for local seat).
function faceTokensForSeat(seat) {
  if (!lastLoserReveal || lastLoserReveal.seat !== seat) return null;
  if (mySeat && seat === mySeat) return null;
  return lastLoserReveal.faces;
}

// Build + cache loser reveal from last State + suit map.
function ensureLoserReveal() {
  if (lastLoserReveal) return lastLoserReveal;
  if (!lastState || !histSuits) return null;
  const order = lastState.finish_order || [];
  const loserSeat = order.length ? +order[order.length - 1] : 0;
  // Local loser: real hand already shown; invent would clash with hand suits.
  if (mySeat && loserSeat === mySeat) {
    lastLoserReveal = {
      seat: loserSeat,
      faces: parseHand(lastState.hand || ''),
    };
    return lastLoserReveal;
  }
  lastLoserReveal = reconstructLoserHand(lastState, histSuits, []);
  return lastLoserReveal;
}

function renderSeatsFromState() {
  if (animating) return;
  const layer = $('seats-layer');
  const n = lastState?.n || playerNames.length || 0;
  if (!n) {
    layer.replaceChildren();
    return;
  }
  const you = mySeat || 1;
  const pos = seatPositions(n);
  const rem = lastState?.remaining || [];
  const next = lastState?.next || 0;
  const passed = lastState?.passed_mask || 0;
  const step = lastState?.step ?? -1;
  const myTurn =
    !!mySeat && next === mySeat && (step === STEP.LEAD || step === STEP.PLAY);
  const atSummary = step >= STEP.SUMMARY;
  const summaryOpen = gameOverSummaryOpen;
  if (atSummary) ensureLoserReveal();
  const tokens = [];
  for (let seat = 1; seat <= n; seat++) {
    const name = playerNames[seat - 1] || `Seat ${seat}`;
    const vi = visualIndex(seat, n, you);
    const isPaused = pausedSeats.has(seat);
    const handoff =
      isPaused && joined && seat !== mySeat && !isBotName(name);
    const place = finishPlaceForSeat(seat);
    const pl = place ? placePillLayout(vi, n, summaryOpen) : null;
    const el = buildSeatToken(name, seat, n, rem[seat - 1] ?? 0, {
      next: !atSummary && next === seat,
      myTurn: !atSummary && myTurn && seat === mySeat,
      passed: !atSummary && !!(passed & (1 << (seat - 1))),
      paused: isPaused,
      handoff,
      faceTokens: atSummary ? faceTokensForSeat(seat) : null,
      place,
      placeSide: pl?.side,
      placeOpposite: pl?.opposite,
      placeNudge: pl?.nudge,
    });
    el.style.left = `${pos[vi].x}%`;
    el.style.top = `${pos[vi].y}%`;
    tokens.push(el);
  }
  layer.replaceChildren(...tokens);
  requestAnimationFrame(layoutPlayActions);
}

// Pre-draw: show lobby-order names on arc (no table-rank chrome).
function renderSeatsLobbyOrder(names) {
  const layer = $('seats-layer');
  const n = names.length;
  if (!n) return;
  const youName = loadIdentity().username;
  const youIdx = names.findIndex((nm) => ukey(nm) === ukey(youName));
  const youSeat = youIdx >= 0 ? youIdx + 1 : 1;
  const pos = seatPositions(n);
  const tokens = [];
  for (let seat = 1; seat <= n; seat++) {
    const name = names[seat - 1] || `?${seat}`;
    const vi = visualIndex(seat, n, youSeat);
    const el = buildSeatToken(name, seat, n, 0, { noRank: true });
    const meta = el.querySelector('.smeta');
    if (meta) meta.textContent = `slot ${seat}`;
    el.style.left = `${pos[vi].x}%`;
    el.style.top = `${pos[vi].y}%`;
    tokens.push(el);
  }
  layer.replaceChildren(...tokens);
}

// Generic delay for seat-draw / seat-shift animations.
function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Last seat that played in the current history trick slice (winner when step=LEAD).
function lastTrickPlaySeat(historyStr) {
  const entries = parseHistoryString(historyStr || '');
  if (!entries.length) return 0;
  let start = 0;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].starter) start = i;
  }
  return entries[entries.length - 1]?.seat || 0;
}

// Must match .trick-piles.parked scale in yoyo0.css (.summary-dock uses 0.5)
const TRICK_PARK_SCALE = 0.58;

// Bounding box of parkable children, in piles-local px (no park transform).
function trickPilesContentBox(piles) {
  const pr = piles.getBoundingClientRect();
  let minL = Infinity;
  let minT = Infinity;
  let maxR = -Infinity;
  let maxB = -Infinity;
  for (const el of piles.querySelectorAll('.play-stack, .felt-pill')) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 && r.height < 1) continue;
    minL = Math.min(minL, r.left);
    minT = Math.min(minT, r.top);
    maxR = Math.max(maxR, r.right);
    maxB = Math.max(maxB, r.bottom);
  }
  if (!Number.isFinite(minL)) return null;
  return {
    left: minL - pr.left,
    top: minT - pr.top,
    width: maxR - minL,
    height: maxB - minT,
    cx: (minL + maxR) / 2 - pr.left,
    cy: (minT + maxB) / 2 - pr.top,
  };
}

/**
 * Mid-hand park: put last-trick cluster under the winner seat token.
 * Uses measured content bbox (after converge) + CSS scale math so the
 * *top* of the scaled piles sits just below the token bottom (not overlapping).
 */
function applyWinnerParkOffset(piles, winSeat, youSeat, n, scale = TRICK_PARK_SCALE) {
  const fallback = () => {
    piles.style.setProperty('--park-x', '0%');
    piles.style.setProperty('--park-y', '-8%');
  };
  if (!piles || winSeat < 1) {
    fallback();
    return;
  }
  // Measure unscaled layout — clear parked transform if present
  const wasParked = piles.classList.contains('parked');
  if (wasParked) piles.classList.remove('parked');
  const pr = piles.getBoundingClientRect();
  const token = document.querySelector(
    `#seats-layer .seat-token[data-seat="${winSeat}"]`,
  );
  const bb = trickPilesContentBox(piles);
  if (wasParked) piles.classList.add('parked');
  if (!token || !bb || pr.width < 8 || pr.height < 8) {
    fallback();
    return;
  }

  const tr = token.getBoundingClientRect();
  // Token edges in piles-local px
  const tokenCX = tr.left + tr.width * 0.5 - pr.left;
  const tokenTop = tr.top - pr.top;
  const tokenBottom = tr.bottom - pr.top;
  const vi = visualIndex(winSeat, n, youSeat || 1);
  const gap = 10;

  // Where the TOP-CENTER of the *scaled* content should land
  let targetTopX = tokenCX;
  let targetTopY;
  if (vi === 0) {
    // You: hang park above your token (toward felt)
    const scaledH = bb.height * scale;
    targetTopX = tokenCX + 8;
    targetTopY = tokenTop - gap - scaledH;
  } else {
    // Everyone else: top of park just under token bottom
    targetTopX = tokenCX;
    targetTopY = tokenBottom + gap;
  }

  // CSS: transform-origin 50% 40%; transform: translate(T) scale(s)
  // final = s*p + (1-s)*O + T
  const ox = 0.5 * pr.width;
  const oy = 0.4 * pr.height;
  const cTopX = bb.cx;
  const cTopY = bb.top;
  const tx = targetTopX - (scale * cTopX + (1 - scale) * ox);
  const ty = targetTopY - (scale * cTopY + (1 - scale) * oy);

  piles.style.setProperty('--park-x', `${((tx / pr.width) * 100).toFixed(1)}%`);
  piles.style.setProperty('--park-y', `${((ty / pr.height) * 100).toFixed(1)}%`);
}

// Temporarily layout summary panel (invisible) so dock can measure it before open.
function withSummaryPanelMeasure(fn) {
  const panel = $('panel-play-again');
  if (!panel) return fn(null);
  const wasVisible = panel.classList.contains('visible');
  const wasMeasure = panel.classList.contains('dock-measure');
  if (!wasVisible) {
    panel.classList.add('visible', 'dock-measure');
  }
  try {
    return fn(panel);
  } finally {
    if (!wasVisible) {
      panel.classList.remove('visible');
      if (!wasMeasure) panel.classList.remove('dock-measure');
    }
  }
}

/**
 * Summary last-trick dock: left of Game summary (not winner seat).
 * Uses a stable footprint estimate (no unpark/remeasure thrash) + simple
 * % translate vs felt center — matches the pre-scale-math placement that
 * looked correct on first paint. Y drops below upper seat tokens when needed.
 */
function applySummaryDockOffset(piles) {
  const layer = piles.parentElement;
  const panel = $('panel-play-again');
  if (!layer || !piles || !panel) return;

  const place = (panelEl) => {
    const pr = panelEl.getBoundingClientRect();
    const lr = layer.getBoundingClientRect();
    if (lr.width < 8 || lr.height < 8 || pr.width < 8) return false;

    // Fixed docked footprint (scaled last-trick ≈ this size) — do not unpark to measure
    const halfW = 72;
    const halfH = 52;
    const gapPanel = 18;
    const gapSeat = 12;

    // Horizontal: keep entire dock left of panel
    let targetCX = pr.left - lr.left - gapPanel - halfW;
    const maxRight = pr.left - lr.left - gapPanel;
    if (targetCX + halfW > maxRight) targetCX = maxRight - halfW;
    if (targetCX < halfW + 4) targetCX = halfW + 4;

    // Vertical: fin-head row, else upper third of panel
    const head = panelEl.querySelector('.fin-head');
    const hr = head?.getBoundingClientRect();
    let targetCY =
      hr && hr.height > 0
        ? hr.top - lr.top + hr.height * 0.5
        : pr.top - lr.top + Math.min(80, pr.height * 0.22);

    // Drop below any upper seat token that intersects the dock column
    const dockLeft = targetCX - halfW - 10;
    const dockRight = targetCX + halfW + 10;
    let seatClearY = 0;
    for (const seat of document.querySelectorAll('#seats-layer .seat-token')) {
      const tr = seat.getBoundingClientRect();
      const sl = tr.left - lr.left;
      const sr = tr.right - lr.left;
      const st = tr.top - lr.top;
      if (sr < dockLeft || sl > dockRight) continue;
      if (st > lr.height * 0.58) continue;
      seatClearY = Math.max(seatClearY, tr.bottom - lr.top);
    }
    if (seatClearY > 0) {
      targetCY = Math.max(targetCY, seatClearY + gapSeat + halfH);
    }

    // Simple translate vs felt center (same model as original dock; stable with scale)
    const xPct = ((targetCX - lr.width * 0.5) / lr.width) * 100;
    const yPct = ((targetCY - lr.height * 0.48) / lr.height) * 100;
    piles.style.setProperty('--park-x', `${xPct.toFixed(1)}%`);
    piles.style.setProperty('--park-y', `${yPct.toFixed(1)}%`);
    piles.classList.add('summary-dock', 'parked');
    return true;
  };

  // Prefer real visible panel; ghost only for pre-reveal slide
  if (panel.classList.contains('visible') && !panel.classList.contains('dock-measure')) {
    place(panel);
    return;
  }
  withSummaryPanelMeasure((p) => {
    if (p) place(p);
  });
}

// Park offset: mid-hand winner shelf, or summary left dock.
// Call *after* converge so content bbox is correct.
function applyTrickParkOffset(piles, winSeat, youSeat, n, { summaryDock = false } = {}) {
  if (!piles) return;
  piles.classList.toggle('summary-dock', !!summaryDock);
  if (summaryDock) applySummaryDockOffset(piles);
  else {
    applyWinnerParkOffset(
      piles,
      winSeat,
      youSeat,
      n,
      TRICK_PARK_SCALE,
    );
  }
}

// Pull stacks + PASS/OUT pills toward felt center (live spacing × factor).
const PARK_STACK_CONVERGE = 0.62;
const PARK_SUMMARY_CONVERGE = 0.55; // tighter for side dock
function applyTrickParkConverge(piles, factor = PARK_STACK_CONVERGE) {
  if (!piles) return;
  const cx = 50;
  const cy = 48; // matches seatArcOffset center
  for (const el of piles.querySelectorAll('.play-stack, .felt-pill')) {
    const L = parseFloat(el.style.left);
    const T = parseFloat(el.style.top);
    if (!Number.isFinite(L) || !Number.isFinite(T)) continue;
    el.style.left = `${(cx + (L - cx) * factor).toFixed(2)}%`;
    el.style.top = `${(cy + (T - cy) * factor).toFixed(2)}%`;
  }
}

// Clear park shelf vars (mid-trick / unparked).
function clearTrickParkOffset(piles) {
  if (!piles) return;
  piles.classList.remove('summary-dock');
  piles.style.removeProperty('--park-x');
  piles.style.removeProperty('--park-y');
}

// Re-measure left dock against the *visible* summary panel only.
function refreshSummaryDockIfNeeded() {
  if (!gameOverSummaryOpen) return;
  const panel = $('panel-play-again');
  // Skip ghost / hidden — those measures put the dock under the real panel later
  if (!panel?.classList.contains('visible') || panel.classList.contains('dock-measure')) {
    return;
  }
  const piles =
    $('trick-layer')?.querySelector('.trick-piles.summary-dock') ||
    $('trick-layer')?.querySelector('.trick-piles');
  if (!piles) return;
  piles.classList.add('summary-dock');
  applySummaryDockOffset(piles);
}

// One debounced re-dock after panel + seats have painted (no multi-hit thrash).
let summaryDockRefreshTimer = null;
function scheduleSummaryDockRefresh() {
  if (!gameOverSummaryOpen) return;
  if (summaryDockRefreshTimer != null) {
    clearTimeout(summaryDockRefreshTimer);
  }
  // Wait for reveal paint + board/votes; single final measure against visible panel
  summaryDockRefreshTimer = setTimeout(() => {
    summaryDockRefreshTimer = null;
    if (!gameOverSummaryOpen) return;
    refreshSummaryDockIfNeeded();
  }, 120);
}

// Shorten long names for "Waiting for …" turn cue.
function shortTurnName(name, max = 12) {
  const s = String(name || '').trim() || '?';
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

// Prez + Yoyo mid-radius exchange cues (cool style; stage labels).
function buildExchangeCues() {
  const n = lastState?.n || playerNames.length || 0;
  if (n < 2) return [];
  const stage =
    exchPhase?.stage ||
    (lastState?.step === STEP.YOYO_SELECT ? 'await_yoyo_ack' : 'await_president');
  const awaitYoyo = stage === 'await_yoyo_ack';
  const surplus = awaitYoyo && offerServerPile().length > offerNeed();
  // Dual-human: Prez may still append while Yoyo is choosing
  const prezCanStillAdd = !!(awaitYoyo && exchPhase?.can_add && exchPhase?.allow_surplus);
  const prez = 1;
  const yoyo = n;
  return [
    {
      seat: prez,
      exchange: true,
      active: !awaitYoyo || prezCanStillAdd,
      mine: mySeat === prez,
      label: !awaitYoyo
        ? 'Selecting offer…'
        : prezCanStillAdd
          ? 'May offer more…'
          : 'Card exchange',
    },
    {
      seat: yoyo,
      exchange: true,
      active: awaitYoyo,
      mine: mySeat === yoyo,
      label: awaitYoyo
        ? surplus
          ? 'Choosing…'
          : 'Acknowledge…'
        : 'Card exchange',
    },
  ];
}

// Mid-radius play-turn cue for state.next, or null (not during exchange).
function buildPlayTurnCue() {
  const st = lastState;
  if (!st) return null;
  if (exchangeActive()) return null;
  const step = st.step ?? -1;
  if (step !== STEP.LEAD && step !== STEP.PLAY) return null;
  const seat = st.next | 0;
  if (seat < 1) return null;
  if (mySeat && seat === mySeat && isMyAction()) {
    return {
      seat,
      mine: true,
      active: true,
      label: step === STEP.LEAD ? 'Your Lead' : 'Play or Pass',
    };
  }
  const name = playerNames[seat - 1] || `Seat ${seat}`;
  return {
    seat,
    mine: false,
    active: true,
    label: `Waiting for ${shortTurnName(name)}…`,
  };
}

// Play turn cue(s) or Prez/Yoyo exchange pair.
function buildTurnCues() {
  const st = lastState;
  if (!st) return [];
  const step = st.step ?? -1;
  if (
    exchangeActive() ||
    step === STEP.EXCHANGE ||
    step === STEP.YOYO_SELECT
  ) {
    return buildExchangeCues();
  }
  const one = buildPlayTurnCue();
  return one ? [one] : [];
}

// Apply park shelf + converge to current .trick-piles (stacks + PASS/OUT).
// Converge first, then measure seat token + content box for --park-x/y.
function applyParkToPiles(piles, winSeat, you, n, { animate, summaryDock } = {}) {
  if (!piles) return;
  const dock = !!summaryDock;
  const conv = dock ? PARK_SUMMARY_CONVERGE : PARK_STACK_CONVERGE;
  if (animate && !reducedMotion) {
    pendingTrickParkAnim = false;
    const gen = ++trickParkGen;
    piles.classList.remove('parked', 'win-flash', 'park-motion', 'summary-dock');
    clearTrickParkOffset(piles);
    // Double rAF: full seat spacing → converge → measure → park scale
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (gen !== trickParkGen || !piles.isConnected) return;
        piles.classList.add('park-motion');
        applyTrickParkConverge(piles, conv);
        // Layout after converge before measuring for seat-token anchor
        void piles.offsetWidth;
        applyTrickParkOffset(piles, winSeat, you, n, { summaryDock: dock });
        piles.classList.add('win-flash', 'parked');
        if (dock) {
          // Ghost estimate now; final place when panel is visible (scheduleSummaryDockRefresh)
          if ($('panel-play-again')?.classList.contains('visible')) {
            scheduleSummaryDockRefresh();
          }
        } else {
          requestAnimationFrame(() => {
            if (gen !== trickParkGen || !piles.isConnected) return;
            applyWinnerParkOffset(piles, winSeat, you, n, TRICK_PARK_SCALE);
          });
        }
      });
    });
  } else {
    pendingTrickParkAnim = false;
    piles.classList.remove('win-flash', 'park-motion');
    applyTrickParkConverge(piles, conv);
    void piles.offsetWidth;
    applyTrickParkOffset(piles, winSeat, you, n, { summaryDock: dock });
    piles.classList.add('parked');
    if (dock) {
      if ($('panel-play-again')?.classList.contains('visible')) {
        scheduleSummaryDockRefresh();
      }
    } else {
      requestAnimationFrame(() => {
        if (!piles.isConnected) return;
        applyWinnerParkOffset(piles, winSeat, you, n, TRICK_PARK_SCALE);
      });
    }
  }
}

// Center: stacks + PASS/OUT + mid-radius turn/exchange cues.
// Between tricks: dim + park shelf. Hold: full-size last trick. Summary: park + dim.
function renderTrick() {
  const layer = $('trick-layer');
  if (!layer) return;
  if (!lastState) {
    layer.classList.remove('prev-trick');
    layer.replaceChildren();
    return;
  }
  const n = lastState.n || playerNames.length || 4;
  const you = mySeat || 1;
  const step = lastState.step ?? STEP.LEAD;
  const atEnd = step >= STEP.SUMMARY;
  const hist = lastState.history || '';
  if (atEnd && !hist.length) {
    layer.classList.remove('prev-trick');
    layer.replaceChildren();
    return;
  }
  // Mid-trick only while PLAY; LEAD / SUMMARY / END show completed last trick
  const midTrick = !atEnd && step === STEP.PLAY;
  // Park: wait for next lead, or last trick under Game summary (not hold)
  const wantPark =
    !!hist.length &&
    ((!atEnd && step === STEP.LEAD) || (atEnd && gameOverSummaryOpen));
  const animatePark = wantPark && pendingTrickParkAnim && !reducedMotion;
  renderCurrentTrick(
    layer,
    hist,
    histSuits.faces,
    { n, youSeat: you, visualIndex },
    {
      // Keep mask when present; completed-trick PASS also inferred in trick.js
      passedMask: lastState.passed_mask || 0,
      remaining: lastState.remaining || [],
      trickStart: lastState.trick_start || 0,
      cont: hasOpt(lastState.opts, OPT.CONT),
      midTrick,
      // Hand over: sole remaining hand → LOSER pill (not false PASS)
      gameOver: atEnd,
      // Tier OUT fireworks (1st bigger); partial mid-hand order is fine
      finishOrder: lastState.finish_order || lastSummary?.finish_order || [],
      turnCues: atEnd ? [] : buildTurnCues(),
    },
  );
  // Dim between leads, or under summary panel (hold keeps piles bright)
  const showPrev =
    (step === STEP.LEAD && !atEnd && !!hist.length) ||
    (atEnd && gameOverSummaryOpen);
  layer.classList.toggle('prev-trick', showPrev);
  const winSeat = lastTrickPlaySeat(hist);
  if (showPrev || atEnd) {
    const stack = winSeat
      ? layer.querySelector(`.play-stack[data-seat="${winSeat}"]`)
      : null;
    if (stack) stack.classList.add('winner');
  }
  const piles = layer.querySelector('.trick-piles');
  if (!piles) return;
  if (!wantPark) {
    piles.classList.remove('parked', 'win-flash', 'park-motion', 'summary-dock');
    clearTrickParkOffset(piles);
    return;
  }
  applyParkToPiles(piles, winSeat, you, n, {
    animate: animatePark,
    summaryDock: atEnd && gameOverSummaryOpen,
  });
}

// Hold duration (local only).
function gameOverHoldMs() {
  return reducedMotion ? GAME_OVER_HOLD_MS_REDUCED : GAME_OVER_HOLD_MS;
}

function gameOverParkMs() {
  return reducedMotion ? GAME_OVER_PARK_MS_REDUCED : GAME_OVER_PARK_MS;
}

function clearGameOverHoldTimers() {
  if (gameOverHoldTick != null) {
    clearInterval(gameOverHoldTick);
    gameOverHoldTick = null;
  }
}

// Drop hold UI without opening summary (new hand / leave).
function cancelGameOverHold() {
  gameOverHoldGen += 1;
  clearGameOverHoldTimers();
  gameOverHoldActive = false;
  const el = $('game-over-hold');
  if (el) el.hidden = true;
}

// Button label with whole-second countdown.
function setGameSummaryBtnLabel(sec) {
  const btn = $('btn-game-summary');
  if (!btn) return;
  const n = Math.max(0, sec | 0);
  btn.textContent = n > 0 ? `Game summary · ${n}` : 'Game summary';
}

// Show summary panel after last trick has docked left (or immediately if snap).
function revealGameSummaryPanel() {
  showPlayAgainPanel(true);
  renderHandOverBoard();
  // Seats first (place pills change token size) so dock clear-Y is correct
  if (!animating) renderSeatsFromState();
  updatePlayButtons();
  updateHistoryChrome();
  // Re-measure after visible panel + seats paint (ghost measure often wrong X)
  scheduleSummaryDockRefresh();
}

/**
 * End of hand reveal:
 * 1) hold already showed full last trick
 * 2) slide last trick to left dock
 * 3) open Game summary over center (progression: trick → summary → Play again)
 */
function openGameSummary() {
  gameOverHoldGen += 1;
  const gen = gameOverHoldGen;
  clearGameOverHoldTimers();
  gameOverHoldActive = false;
  const hold = $('game-over-hold');
  if (hold) hold.hidden = true;
  setStandingsOpen(false);
  setHistoryOpen(false);
  setStatus('Game over');

  // Fill board while panel still hidden (ghost measure uses layout)
  showPlayAgainPanel(false);
  renderHandOverBoard();

  gameOverSummaryOpen = true;
  if (!animating) renderSeatsFromState();

  const snap = reducedMotion || gameOverSkipHold;
  if (snap) {
    pendingTrickParkAnim = false;
    renderTrick();
    revealGameSummaryPanel();
    return;
  }

  // Slide to left dock first (panel measured invisibly)
  pendingTrickParkAnim = true;
  renderTrick();
  updatePlayButtons();
  updateHistoryChrome();

  const parkMs = gameOverParkMs();
  setTimeout(() => {
    if (gen !== gameOverHoldGen || !gameOverSummaryOpen) return;
    revealGameSummaryPanel();
  }, parkMs);
}

// Local last-trick beat; then openGameSummary parks + reveals panel.
function startGameOverHoldIfNeeded() {
  if (gameOverSummaryOpen) return;
  if (gameOverSkipHold) {
    openGameSummary();
    return;
  }
  if (gameOverHoldActive) return;

  gameOverHoldActive = true;
  showPlayAgainPanel(false);
  setStatus('Game over');
  renderTrick();
  updatePlayButtons();

  const hold = $('game-over-hold');
  if (hold) hold.hidden = false;

  const gen = (gameOverHoldGen += 1);
  const ms = gameOverHoldMs();
  const endAt = performance.now() + ms;
  setGameSummaryBtnLabel(Math.ceil(ms / 1000));
  clearGameOverHoldTimers();
  gameOverHoldTick = setInterval(() => {
    if (gen !== gameOverHoldGen) return;
    const left = Math.ceil((endAt - performance.now()) / 1000);
    setGameSummaryBtnLabel(left);
    if (left <= 0) openGameSummary();
  }, 200);
}

// —— History popover (E4.3): stepper over completed tricks this hand ——

function historyMeta() {
  const st = lastState;
  if (!st) return { n: 0, hl: 0, step: STEP.LEAD, count: 0 };
  const n = st.n || playerNames.length || 0;
  const hl = st.hl || 0;
  const step = st.step ?? STEP.LEAD;
  const count = completedTrickCount(st.history || '', step);
  return { n, hl, step, count };
}

function historySnapshot(trickIndex) {
  const st = lastState;
  if (!st) return null;
  const { n, hl, step, count } = historyMeta();
  if (!count || !n || !hl) return null;
  let ti = trickIndex;
  if (ti == null || ti < 0) ti = count - 1;
  ti = Math.max(0, Math.min(ti, count - 1));
  return buildTrickByIndex(st.history || '', histSuits.faces, {
    n,
    hl,
    step,
    trickIndex: ti,
  });
}

function setHistoryOpen(open) {
  const pop = $('history-pop');
  if (!pop) return;
  if (open) setStandingsOpen(false);
  pop.hidden = !open;
  $('btn-history')?.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function updateHistoryChrome() {
  const btn = $('btn-history');
  if (!btn) return;
  const { count } = historyMeta();
  btn.disabled = count < 1;
  if (count < 1) {
    histViewIndex = -1;
    histPinnedToLast = true;
    setHistoryOpen(false);
    return;
  }
  if (histPinnedToLast || histViewIndex < 0 || histViewIndex >= count) {
    histViewIndex = count - 1;
  }
  const pop = $('history-pop');
  if (pop && !pop.hidden) renderHistoryPopover();
}

function historyTitleText(data) {
  if (!data) return 'History';
  const k = data.trickCount;
  const i = data.trickIndex + 1;
  if (i >= k) return k <= 1 ? 'Last trick' : `Last trick · ${i} of ${k}`;
  return `Trick ${i} of ${k}`;
}

// Fill popover: role · LEAD | stack / — pass —
function renderHistoryPopover() {
  const body = $('history-body');
  const title = $('history-title');
  const prev = $('btn-hist-prev');
  const next = $('btn-hist-next');
  if (!body) return;

  const { count } = historyMeta();
  if (count < 1) {
    body.replaceChildren();
    const p = document.createElement('p');
    p.className = 'last-trick-empty';
    p.textContent = 'No completed trick yet';
    body.appendChild(p);
    if (title) title.textContent = 'History';
    if (prev) prev.disabled = true;
    if (next) next.disabled = true;
    return;
  }

  if (histViewIndex < 0 || histViewIndex >= count) histViewIndex = count - 1;
  const data = historySnapshot(histViewIndex);
  if (title) title.textContent = historyTitleText(data);
  if (prev) prev.disabled = !data || data.trickIndex <= 0;
  if (next) next.disabled = !data || data.trickIndex >= data.trickCount - 1;

  if (!data) {
    body.replaceChildren();
    return;
  }

  const n = lastState?.n || playerNames.length || 4;
  // Names at hand seats for this history (pre-rotate); use current playerNames mid-hand
  const names = playerNames;
  const frag = document.createDocumentFragment();
  for (const row of data.rows) {
    const el = document.createElement('div');
    el.className = 'last-trick-row';
    if (row.kind === 'play' && row.seat === data.winner) el.classList.add('winner');

    const who = document.createElement('div');
    who.className = 'last-trick-who';
    const role = document.createElement('span');
    role.className = 'lt-role';
    role.textContent = placeLabels(n, row.seat);
    who.appendChild(role);
    if (row.lead) {
      const lead = document.createElement('span');
      lead.className = 'lt-lead';
      lead.textContent = 'LEAD';
      who.appendChild(lead);
    }
    const nm = names[row.seat - 1];
    if (nm) {
      const name = document.createElement('span');
      name.className = 'lt-name';
      name.textContent = nm;
      who.appendChild(name);
    }
    el.appendChild(who);

    const play = document.createElement('div');
    play.className = 'last-trick-play';
    if (row.kind === 'pass') {
      const pass = document.createElement('span');
      pass.className = 'lt-pass';
      pass.textContent = '— pass —';
      play.appendChild(pass);
    } else {
      play.appendChild(miniPlayStack(row.faces));
    }
    el.appendChild(play);
    frag.appendChild(el);
  }
  body.replaceChildren(frag);
}

function stepHistory(delta) {
  const { count } = historyMeta();
  if (count < 1) return;
  if (histViewIndex < 0) histViewIndex = count - 1;
  histViewIndex = Math.max(0, Math.min(count - 1, histViewIndex + delta));
  histPinnedToLast = histViewIndex >= count - 1;
  renderHistoryPopover();
}

// Apply a State event to the table UI.
function applyState(ev) {
  // Terminal State after Summary is already shown: ignore (avoids "Waiting on BotX")
  if (lastState?.step >= STEP.SUMMARY && ev.step >= STEP.SUMMARY) {
    return;
  }
  // Before overwrite: live PLAY/LEAD → SUMMARY means show last-trick hold
  const wasLivePlay = !!(lastState && lastState.step < STEP.SUMMARY);
  const prevStep = lastState?.step;
  const prevHistLen = (lastState?.history || '').length;
  lastState = ev;
  lastSentPlay = null; // accepted or superseded
  if (ev.rank_pack != null) setTableRankPack(ev.rank_pack);
  setFaceModeFromOpts(ev.opts || 0);
  if (ev.seat) mySeat = ev.seat;
  drawDone = true;
  // During seat theater keep overlay; still apply model under the curtain
  if (!seatCeremonyActive) showSeatDrawPanel(false);

  // Trick-end park: LEAD with completed history; game end keeps last trick for hold/summary
  const histLen = (ev.history || '').length;
  if (!histLen) {
    pendingTrickParkAnim = false;
    trickParkGen += 1;
  } else if (ev.step >= STEP.SUMMARY) {
    // Hold shows full-size; openGameSummary will set pending + park
    pendingTrickParkAnim = false;
    trickParkGen += 1;
  } else if (ev.step === STEP.LEAD) {
    // PLAY→LEAD, or LEAD→LEAD with more history (e.g. joker ends trick)
    const fromPlay = prevStep === STEP.PLAY;
    const leadAgainGrew =
      prevStep === STEP.LEAD && histLen > prevHistLen;
    if (fromPlay || leadAgainGrew) {
      pendingTrickParkAnim = true;
      trickParkGen += 1;
    }
  } else if (ev.step === STEP.PLAY) {
    // New lead / mid-trick — clear shelf (new piles)
    pendingTrickParkAnim = false;
    trickParkGen += 1;
  }

  // New hand / mid-hand: drop summary chrome (place pills follow finish_order)
  if (ev.step < STEP.SUMMARY) {
    cancelGameOverHold();
    gameOverSkipHold = false;
    gameOverSummaryOpen = false;
    lastSummary = null;
    lastLoserReveal = null;
    playAgainStatus = { ready: {}, waiting: [] };
    // Drop if identity rotate never fired E4.4 (same seat order)
    seatShiftPending = false;
    showPlayAgainPanel(false);
    const board = $('finish-board');
    if (board) board.replaceChildren();
    if (ev.step >= STEP.LEAD) {
      localOfferCards = [];
    }
    // Fresh deal (empty history): server cleared pauses with the new hand
    if (!histLen) {
      histViewIndex = -1;
      setHistoryOpen(false);
      pausedSeats.clear();
    }
  }
  applyHistorySuits(ev);
  if (ev.step >= STEP.SUMMARY) {
    lastLoserReveal = null;
    ensureLoserReveal();
  }
  // Ex3d: capture offer rects before trays clear on lead
  let settleSnap = null;
  let settleChosen = null;
  if (ev.step >= STEP.LEAD && (exchPhase || exchSettleSnap)) {
    updateExchSettleSnap();
    settleSnap = exchSettleSnap;
    if (yoyoPick.length && yoyoPick.length === (settleSnap?.need || 0)) {
      settleChosen = yoyoPick.slice();
    }
  }
  if (ev.step >= STEP.LEAD) {
    exchPhase = null;
    localOfferCards = [];
    yoyoPick = [];
    prevOfferCsv = '';
    exchArriveWires = new Set();
    exchSettleSnap = null;
  }
  renderStrip();
  if (!animating && !seatCeremonyActive) renderSeatsFromState();
  if (!seatCeremonyActive) {
    // Fly taken/returned before trays unmount (still in DOM until overlay render)
    if (ev.step >= STEP.LEAD && settleSnap?.pile?.length) {
      playExchangeSettleAnim(settleSnap, ev, settleChosen);
    }
    renderTrick();
    renderExchangeOverlays(); // high/low seat floats + hand filter inputs
    renderHand();
    layoutPlayActions();
    requestAnimationFrame(layoutExchangeFloats);
  }
  updateHistoryChrome();
  if (seatCeremonyActive) {
    // Ceremony owns status line; model still updated
    updatePlayButtons();
    return;
  }
  if (ev.step >= STEP.SUMMARY) {
    // Never stale next ("Waiting on Bot…"); hold/summary own the beat
    setStatus('Game over');
    if (wasLivePlay) startGameOverHoldIfNeeded();
    else gameOverSkipHold = true; // rejoin: Summary / PlayAgainStatus opens panel
  } else if (exchangeActive() && exchPhase) {
    setStatus(exchangeStatusText(exchPhase));
  } else if (ev.step === STEP.LEAD && ev.next === mySeat) {
    setStatus('Your lead — set chips or cards · drag to table or Play');
  } else if (ev.step === STEP.PLAY && ev.next === mySeat) {
    setStatus('Your turn — legal set chips · Pass, Play, or drag');
  } else if (ev.step === STEP.EXCHANGE || ev.step === STEP.YOYO_SELECT) {
    setStatus('Card exchange in progress…');
  } else if (ev.next) {
    const nm = playerNames[ev.next - 1] || `seat ${ev.next}`;
    setStatus(`Waiting on ${nm}`);
  } else {
    setStatus('');
  }
  updatePlayButtons();
}

function isMyAction() {
  const st = lastState;
  if (!st || !mySeat) return false;
  // President may append while exchange open and under offer cap (Ex3 multi-drop)
  if (canPresidentOffer()) return true;
  if ((st.step === STEP.LEAD || st.step === STEP.PLAY) && st.next === mySeat) return true;
  return false;
}

// True while staged P↔Y ceremony is active (before lead).
function exchangeActive() {
  if (!exchPhase || exchPhase.stage === 'done') return false;
  if (lastState?.step >= STEP.LEAD) return false;
  return true;
}

function offerNeed() {
  return Number(exchPhase?.need) || offerCount(lastState?.legal) || 1;
}

function offerMax() {
  return Number(exchPhase?.max_offer) || 3;
}

// Server pile + optimistic local adds not yet echoed.
function offerPileTokens() {
  const server = parseHand(exchPhase?.president_offer || '');
  const seen = new Set(server);
  const out = server.slice();
  for (const t of localOfferCards) {
    if (!seen.has(t)) {
      out.push(t);
      seen.add(t);
    }
  }
  return out;
}

// Remaining slots in offer pile (dual-human ⇒ max_offer; else need).
function offerRoom() {
  const pile = offerPileTokens().length;
  const need = offerNeed();
  const maxO = offerMax();
  if (exchPhase && typeof exchPhase.can_add === 'boolean') {
    if (!exchPhase.can_add) return 0;
    const cap = exchPhase.allow_surplus ? maxO : need;
    return Math.max(0, cap - pile);
  }
  // Phase lag: still on offer step with empty local pile
  if (lastState?.step === STEP.EXCHANGE && mySeat === 1 && pile < need) {
    return need - pile;
  }
  return 0;
}

function canPresidentOffer() {
  if (mySeat !== 1) return false;
  if (exchPhase?.role && exchPhase.role !== 'president') return false;
  const step = lastState?.step;
  if (
    step !== STEP.EXCHANGE &&
    step !== STEP.YOYO_SELECT &&
    !exchangeActive()
  ) {
    return false;
  }
  return offerRoom() > 0;
}

// Prez may pull cards off the offer pile until Yoyo finalizes.
function canPresidentWithdraw() {
  if (mySeat !== 1) return false;
  if (exchPhase?.role && exchPhase.role !== 'president') return false;
  if (typeof exchPhase?.can_withdraw === 'boolean') return !!exchPhase.can_withdraw;
  return exchangeActive() && offerPileTokens().length > 0;
}

function sendWithdrawExchange(wires) {
  const list = (wires || []).filter(Boolean);
  if (!list.length || !canPresidentWithdraw()) return false;
  const cards = list.join(',');
  lastSentPlay = cards;
  dbgPlay('send withdraw', { sent: cards });
  send({ action: 'withdrawexchange', cards });
  // Optimistic: drop from local offer hide list; server pile updates via ExchangePhase
  const rm = new Set(list);
  localOfferCards = localOfferCards.filter((t) => !rm.has(t));
  return true;
}

// Server offer faces only (no Prez optimistic locals).
function offerServerPile() {
  return parseHand(exchPhase?.president_offer || '');
}

function yoyoCanResolve() {
  return !!exchPhase?.can_ack && exchPhase?.role === 'yoyo';
}

function offerHasSurplus() {
  return offerServerPile().length > offerNeed();
}

// Drop picks that left the pile (Prez withdraw / phase refresh).
function pruneYoyoPick() {
  const pile = new Set(offerServerPile());
  yoyoPick = yoyoPick.filter((t) => pile.has(t));
}

function yoyoPickReady() {
  pruneYoyoPick();
  return yoyoCanResolve() && yoyoPick.length === offerNeed();
}

// Ack when exact need; SelectExchange when surplus pick complete.
function yoyoAckEnabled() {
  if (!yoyoCanResolve()) return false;
  if (!offerHasSurplus()) return true;
  return yoyoPickReady();
}

function toggleYoyoPick(wire) {
  if (!yoyoCanResolve()) return;
  const pile = offerServerPile();
  if (!pile.includes(wire)) return;
  const i = yoyoPick.indexOf(wire);
  if (i >= 0) yoyoPick.splice(i, 1);
  else {
    const need = offerNeed();
    if (yoyoPick.length >= need) {
      // Replace oldest when already full (need=1 common)
      if (need === 1) yoyoPick = [wire];
      else return;
    } else yoyoPick.push(wire);
  }
  renderExchangeOverlays();
  if (exchangeActive() && exchPhase) setStatus(exchangeStatusText(exchPhase));
}

// Finalize yoyo take: exact pile → ExchangeAck; else SelectExchange(chosen).
function sendYoyoResolve(chosen) {
  if (!yoyoCanResolve()) return false;
  const need = offerNeed();
  const pile = offerServerPile();
  let cards = chosen || yoyoPick.slice();
  if (pile.length === need && (!cards.length || cards.length === need)) {
    // Exact offer — Ack (ignore selection)
    lastSentPlay = pile.join(',');
    send({ action: 'exchangeack' });
  } else {
    if (cards.length !== need) return false;
    if (!cards.every((t) => pile.includes(t))) return false;
    // Prefer chosen order when drag supplied it
    if (chosen?.length) yoyoPick = chosen.slice();
    lastSentPlay = cards.join(',');
    dbgPlay('send selectexchange', { sent: lastSentPlay });
    send({ action: 'selectexchange', cards: cards.join(',') });
  }
  const ack = $('btn-exchange-ack');
  if (ack) ack.disabled = true;
  return true;
}

// Shared table status for all seats + optional actor hint.
function exchangeStatusText(ev) {
  const need = ev.need || 1;
  const maxO = ev.max_offer || 3;
  const n = lastState?.n || playerNames.length || 0;
  const pName = playerNames[0] || placeLabels(n || 4, 1);
  const yName = (n > 0 && playerNames[n - 1]) || placeLabels(n || 4, n || 4);
  const pile = offerPileTokens().length;
  const surplus = pile > need;
  let base =
    ev.stage === 'await_yoyo_ack'
      ? surplus
        ? `Card exchange — ${yName} choosing from ${pile} offered`
        : `Card exchange — waiting for ${yName} to acknowledge`
      : `Card exchange — ${pName} selecting offer`;
  if (ev.role === 'president' && canPresidentOffer()) {
    if (ev.allow_surplus && pile >= need) {
      base += ` · You may still add (pile ${pile}/${maxO})`;
    } else if (ev.allow_surplus) {
      base += ` · Drop one at a time (need ${need}, up to ${maxO})`;
    } else {
      base += ` · Offer ${need} card${need > 1 ? 's' : ''} beside seat`;
    }
  } else if (ev.role === 'president' && ev.stage === 'await_yoyo_ack') {
    base += surplus
      ? ' · Waiting on pick · extras return to you'
      : ' · Waiting on acknowledge';
  } else if (ev.role === 'yoyo' && ev.can_ack) {
    if (surplus) {
      base += ` · Pick ${need} of ${pile} · Take or drag to hand`;
    } else {
      base += ' · Review offer · Acknowledge';
    }
  }
  return base;
}

// ——— Ex3d: offer pop-in + finalize fly (taken → Yoyo, returned → Prez) ———

function seatTokenRect(seat) {
  const el = document.querySelector(
    `#seats-layer .seat-token[data-seat="${seat}"]`,
  );
  return el?.getBoundingClientRect?.() || null;
}

function captureOfferCardRects() {
  /** @type {Record<string, DOMRect>} */
  const rects = {};
  $('ex-right-cards')?.querySelectorAll('.card[data-wire]')?.forEach((el) => {
    const w = el.dataset.wire;
    if (w) rects[w] = el.getBoundingClientRect();
  });
  return rects;
}

// Keep settle snapshot fresh while trays are painted (rects for fly-from).
// Call while exchPhase still set (even if State already advanced to LEAD).
function updateExchSettleSnap() {
  if (!exchPhase) return;
  const pile = offerServerPile();
  if (!pile.length) return;
  exchSettleSnap = {
    pile: pile.slice(),
    need: offerNeed(),
    rects: captureOfferCardRects(),
    yGive: parseHand(exchPhase.yoyo_give || ''),
  };
}

// Fixed-position card flies from → to; resolves when removed.
function flyExCard(token, fromRect, toRect, kind, ms = 480) {
  if (reducedMotion || !fromRect || !toRect) return Promise.resolve();
  const el = cardEl(token, {
    w: Math.max(28, Math.round(fromRect.width) || 40),
    h: Math.max(38, Math.round(fromRect.height) || 54),
    cls: `ex-fly ex-fly-${kind}`,
  });
  el.style.position = 'fixed';
  el.style.left = `${fromRect.left}px`;
  el.style.top = `${fromRect.top}px`;
  el.style.width = `${fromRect.width || 40}px`;
  el.style.height = `${fromRect.height || 54}px`;
  el.style.zIndex = '220';
  el.style.pointerEvents = 'none';
  el.style.margin = '0';
  el.style.transition = `transform ${ms}ms cubic-bezier(0.2, 0.75, 0.25, 1), opacity ${ms}ms ease`;
  document.body.appendChild(el);
  const dx =
    toRect.left +
    toRect.width / 2 -
    (fromRect.left + (fromRect.width || 40) / 2);
  const dy =
    toRect.top +
    toRect.height / 2 -
    (fromRect.top + (fromRect.height || 54) / 2);
  const scale = kind === 'return' ? 0.72 : 0.9;
  requestAnimationFrame(() => {
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    el.style.opacity = kind === 'return' ? '0.25' : '0.4';
  });
  return new Promise((resolve) => {
    setTimeout(() => {
      el.remove();
      resolve();
    }, ms + 20);
  });
}

/**
 * After exchange finalizes: taken → Yoyo hand/seat, returned → Prez hand/seat.
 * @param {{ pile: string[], need: number, rects: Record<string, DOMRect> }} snap
 * @param {{ hand: string, n?: number }} st new State
 * @param {string[]} [chosen] yoyo pick when known
 */
function playExchangeSettleAnim(snap, st, chosen) {
  if (reducedMotion || !snap?.pile?.length) return;
  const n = st.n || lastState?.n || playerNames.length || 0;
  const hand = parseHand(st.hand || '');
  const pile = snap.pile;
  let taken;
  let returned;
  if (chosen?.length === snap.need) {
    taken = chosen.slice();
    const takeSet = new Set(taken);
    returned = pile.filter((t) => !takeSet.has(t));
  } else if (mySeat === 1) {
    returned = pile.filter((t) => hand.includes(t));
    taken = pile.filter((t) => !hand.includes(t));
  } else if (mySeat === n) {
    taken = pile.filter((t) => hand.includes(t));
    returned = pile.filter((t) => !hand.includes(t));
  } else {
    // Spectator: no private hands — skip split anim
    return;
  }
  if (!taken.length && !returned.length) return;

  const handRect = $('hand')?.getBoundingClientRect?.();
  const prezTarget =
    mySeat === 1 && handRect?.width
      ? handRect
      : seatTokenRect(1) || handRect;
  const yoyoTarget =
    mySeat === n && handRect?.width
      ? handRect
      : seatTokenRect(n) || handRect;
  if (!prezTarget && !yoyoTarget) return;

  // Fallback from-rect: center of low tray
  const tray = $('ex-right-cards')?.getBoundingClientRect?.() ||
    $('ex-right')?.getBoundingClientRect?.();
  const fallbackFrom = tray || prezTarget || yoyoTarget;

  const jobs = [];
  for (const t of returned) {
    const from = snap.rects[t] || fallbackFrom;
    if (prezTarget) jobs.push(flyExCard(t, from, prezTarget, 'return'));
  }
  for (const t of taken) {
    const from = snap.rects[t] || fallbackFrom;
    if (yoyoTarget) jobs.push(flyExCard(t, from, yoyoTarget, 'take'));
  }
  if (returned.length && mySeat === 1) {
    setStatus(
      returned.length === 1
        ? 'Exchange done · 1 card returned to you'
        : `Exchange done · ${returned.length} cards returned to you`,
    );
  } else if (taken.length && mySeat === n) {
    setStatus(
      taken.length === 1
        ? 'Exchange done · you took 1 card'
        : `Exchange done · you took ${taken.length} cards`,
    );
  }
  void Promise.all(jobs);
}

// Wire tokens currently in exchange transit (still often present in State.hand).
function exchangeTransitSet() {
  const s = new Set(localOfferCards);
  if (!exchangeActive() || !exchPhase) return s;
  for (const t of parseHand(exchPhase.yoyo_give || '')) s.add(t);
  for (const t of parseHand(exchPhase.president_offer || '')) s.add(t);
  return s;
}

// Gaps left/right of local seat within a container rect (local coords).
function youSeatGaps(containerRect) {
  let youL = containerRect.width * 0.5 - 44;
  let youR = containerRect.width * 0.5 + 44;
  const you = document.querySelector('.seat-token.you');
  if (you) {
    const yr = you.getBoundingClientRect();
    youL = yr.left - containerRect.left;
    youR = yr.right - containerRect.left;
  }
  return { youL, youR };
}

// Anchor float to seat edge: side 'right' ⇒ left edge at youR+gap; 'left' ⇒ right edge at youL−gap.
function positionSeatFloat(el, side, areaW, youL, youR, gap = 8) {
  if (!el || el.hidden) return;
  const w = el.offsetWidth || 168;
  if (side === 'right') {
    const left = Math.min(areaW - w - 4, Math.max(4, youR + gap));
    el.style.left = `${left}px`;
    el.style.right = 'auto';
  } else {
    const right = Math.max(4, areaW - (youL - gap));
    el.style.left = 'auto';
    el.style.right = `${right}px`;
  }
}

// High/low floats on opposite sides of you-seat (H→L: high left, low right).
function layoutExchangeFloats() {
  const high = $('ex-high-transit');
  const low = $('ex-low-rail');
  const area = $('table-area');
  if (!area) return;
  const r = area.getBoundingClientRect();
  const g = youSeatGaps(r);
  // High→Low: high left of seat, low right; Low→High: swapped
  const highOnLeft = handSort() !== 'asc';
  if (high && !high.hidden) {
    positionSeatFloat(high, highOnLeft ? 'left' : 'right', r.width, g.youL, g.youR);
  }
  if (low && !low.hidden) {
    positionSeatFloat(low, highOnLeft ? 'right' : 'left', r.width, g.youL, g.youR);
  }
}

// Pass left / Play right of .seat-token.you; during Prez offer, Offer sits atop low drop target.
function layoutPlayActions() {
  const root = $('play-actions');
  const pass = $('btn-pass');
  const play = $('btn-play');
  const area = $('table-area');
  if (!root || !pass || !play || !area) return;
  const r = area.getBoundingClientRect();
  const offering = canPresidentOffer();
  const lowRail = $('ex-low-rail');

  play.style.zIndex = '';
  if (offering && lowRail && !lowRail.hidden) {
    layoutExchangeFloats();
    const railR = lowRail.getBoundingClientRect();
    const cx = railR.left - r.left + railR.width / 2;
    const bottom = Math.max(0, r.bottom - railR.top + 6);
    play.style.left = `${cx}px`;
    play.style.bottom = `${bottom}px`;
    play.style.zIndex = '8';
    return;
  }

  play.style.bottom = '0';
  const g = youSeatGaps(r);
  const passX = Math.max(36, g.youL - 28);
  const playX = Math.min(r.width - 36, g.youR + 28);
  pass.style.left = `${passX}px`;
  play.style.left = `${playX}px`;
}

// Pending transit card element (outlined via CSS).
function exTransitCard(
  t,
  { pickable = false, withdrawable = false, picked = false, arrive = false } = {},
) {
  let cls = 'ex-pending';
  if (pickable || withdrawable) cls += ' ex-pickable';
  if (withdrawable) cls += ' ex-withdrawable';
  if (picked) cls += ' selected';
  if (arrive && !reducedMotion) cls += ' ex-arrive';
  const el = cardEl(t, { w: 40, h: 54, cls });
  // SVG child can steal hits on some Chromium builds — faces stay the target
  el.querySelector('svg')?.style.setProperty('pointer-events', 'none');
  if (pickable) {
    // Select via click (hand-like); drag separate — RDP/Chromebook mice often
    // emit micro-moves that used to mark wasMoved and skip pointerup-toggle.
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (el._dragMoved) {
        el._dragMoved = false;
        return;
      }
      if (!yoyoCanResolve()) return;
      toggleYoyoPick(t);
    });
    el.addEventListener('pointerdown', (ev) => onYoyoOfferPointerDown(ev, el, t));
  } else if (withdrawable) {
    el.addEventListener('pointerdown', (ev) => onPrezOfferPointerDown(ev, el, t));
  }
  return el;
}

// Shared offer-pile drag → hand. Select is click-owned for Yoyo (not pointerup).
// opts.getPayload: after threshold → wire[] or null (null = no drag, keep click).
// opts.onDrop(payload): hand hit after drag.
function beginOfferCardDrag(ev, el, { canStart, getPayload, onDrop, onNoPayload }) {
  if (!canStart()) return;
  if (ev.button != null && ev.button !== 0) return;
  // Do not preventDefault on down — preserves click for pick (Chrome Remote / OS).
  ev.stopPropagation();

  const pointerId = ev.pointerId;
  const startX = ev.clientX;
  const startY = ev.clientY;
  let dragging = false; // true only once a ghost is out
  let warnedNoPayload = false;
  let ghost = null;
  let finished = false;
  el._dragMoved = false;
  try {
    el.setPointerCapture?.(pointerId);
  } catch {
    /* ok */
  }

  const handHot = (on) => {
    $('hand-wrap')?.classList.toggle('ex-take-hot', on);
    $('hand')?.classList.toggle('ex-take-hot', on);
  };

  const detach = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onEnd);
    window.removeEventListener('pointercancel', onEnd);
    window.removeEventListener('blur', onAbort);
    window.removeEventListener('contextmenu', onContextMenu);
    el.removeEventListener('lostpointercapture', onLostCapture);
  };

  const scrub = () => {
    try {
      el.releasePointerCapture?.(pointerId);
    } catch {
      /* ok */
    }
    ghost?.remove();
    ghost = null;
    handHot(false);
  };

  const finish = (e, { cancel = false } = {}) => {
    if (finished) return;
    if (e?.pointerId != null && e.pointerId !== pointerId) return;
    finished = true;
    const payload = ghost?._offerPayload;
    const cx = e?.clientX;
    const cy = e?.clientY;
    const wasDrag = dragging;
    detach();
    scrub();
    if (cancel || !wasDrag || !payload?.length) return;
    if (
      cx != null &&
      cy != null &&
      (hitFreeHand(cx, cy) || hitHandWrap(cx, cy))
    ) {
      onDrop(payload);
    }
  };

  const onAbort = () => finish(null, { cancel: true });
  const onLostCapture = () => finish(null, { cancel: true });
  const onContextMenu = (e) => {
    e.preventDefault();
    finish(e, { cancel: true });
  };
  const onEnd = (e) => finish(e, { cancel: e.type === 'pointercancel' });

  const onMove = (e) => {
    if (e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!dragging && dx * dx + dy * dy > 36) {
      const payload = getPayload();
      if (!payload?.length) {
        // Incomplete multi-pick etc.: do not set _dragMoved so click still selects
        if (!warnedNoPayload) {
          warnedNoPayload = true;
          onNoPayload?.();
        }
        return;
      }
      dragging = true;
      el._dragMoved = true;
      e.preventDefault();
      ghost = buildDragGhost(payload);
      ghost._offerPayload = payload;
      document.body.appendChild(ghost);
      handHot(true);
    }
    if (ghost) {
      ghost.style.left = `${e.clientX}px`;
      ghost.style.top = `${e.clientY}px`;
      const over =
        hitFreeHand(e.clientX, e.clientY) || hitHandWrap(e.clientX, e.clientY);
      $('hand-wrap')?.classList.toggle('ex-take-hot', over);
      $('hand')?.classList.toggle('ex-take-hot', over);
    }
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onEnd);
  window.addEventListener('pointercancel', onEnd);
  window.addEventListener('blur', onAbort);
  window.addEventListener('contextmenu', onContextMenu);
  el.addEventListener('lostpointercapture', onLostCapture);
}

// Prez: drag offer card to hand → WithdrawExchange (one at a time).
function onPrezOfferPointerDown(ev, el, wire) {
  beginOfferCardDrag(ev, el, {
    canStart: () => canPresidentWithdraw(),
    getPayload: () => [wire],
    onDrop: (payload) => {
      sendWithdrawExchange(payload);
      renderExchangeOverlays();
      renderHand();
      updatePlayButtons();
    },
  });
}

// Yoyo: click toggles pick; drag to hand takes (need=1 card, or full selection).
function onYoyoOfferPointerDown(ev, el, wire) {
  beginOfferCardDrag(ev, el, {
    canStart: () => yoyoCanResolve(),
    getPayload: () => {
      // need=1: drag this face; multi: only if selection complete and includes wire
      const need = offerNeed();
      if (need === 1) return [wire];
      if (yoyoPick.includes(wire) && yoyoPick.length === need) {
        return yoyoPick.slice();
      }
      return null;
    },
    onNoPayload: () => {
      setStatus(`Select ${offerNeed()} cards, then drag to hand or Take`);
    },
    onDrop: (payload) => {
      sendYoyoResolve(payload);
    },
  });
}

// Hand bar (wrap) hit for yoyo take-drop.
function hitHandWrap(clientX, clientY) {
  const wrap = $('hand-wrap') || $('hand-bar') || $('hand-main');
  if (!wrap || wrap.hidden) return false;
  const r = wrap.getBoundingClientRect();
  return (
    clientX >= r.left &&
    clientX <= r.right &&
    clientY >= r.top &&
    clientY <= r.bottom
  );
}

// High/low seat floats; P/Y only. Spectators: status only.
function renderExchangeOverlays() {
  const lowRail = $('ex-low-rail');
  const high = $('ex-high-transit');
  const ack = $('btn-exchange-ack');
  if (!lowRail || !high) return;

  const hideAll = () => {
    lowRail.hidden = true;
    high.hidden = true;
    if (ack) {
      ack.hidden = true;
      ack.disabled = true;
      ack.textContent = 'Acknowledge';
    }
    $('ex-high-cards')?.replaceChildren();
    $('ex-right-cards')?.replaceChildren();
    $('ex-right')?.classList.remove('hot', 'ex-yoyo-pick');
    yoyoPick = [];
  };

  if (seatCeremonyActive || !exchangeActive()) {
    hideAll();
    if (!exchangeActive()) {
      localOfferCards = [];
      yoyoPick = [];
      if (exchPhase?.stage === 'done' || lastState?.step >= STEP.LEAD) {
        exchPhase = null;
      }
    }
    return;
  }

  const role = exchPhase.role || 'spectator';
  if (role === 'spectator') {
    hideAll();
    return;
  }

  pruneYoyoPick();
  const yGive = displayPlayTokens(parseHand(exchPhase.yoyo_give || ''));
  // Full pile: server faces + optimistic locals not yet echoed
  const pOffer = displayPlayTokens(offerPileTokens());
  // Drop locals that server has accepted
  if (exchPhase.president_offer) {
    const srv = new Set(parseHand(exchPhase.president_offer));
    localOfferCards = localOfferCards.filter((t) => !srv.has(t));
  }

  // New offer faces → brief pop-in (Ex3d)
  const offerCsv = exchPhase.president_offer || '';
  if (offerCsv !== prevOfferCsv) {
    const prev = new Set(parseHand(prevOfferCsv));
    exchArriveWires = new Set(pOffer.filter((t) => !prev.has(t)));
    prevOfferCsv = offerCsv;
  } else {
    exchArriveWires = new Set();
  }

  high.hidden = yGive.length === 0;
  const nEx = lastState?.n || playerNames.length || 4;
  const yTitle = placeLabels(nEx, nEx);
  const pTitle = placeLabels(nEx, 1);
  $('ex-high-label').textContent =
    role === 'yoyo' ? 'You give (high)' : `From ${yTitle} (high)`;
  $('ex-high-cards')?.replaceChildren(...yGive.map((t) => exTransitCard(t)));

  const prezCanAdd = role === 'president' && canPresidentOffer();
  const prezCanWithdraw = role === 'president' && canPresidentWithdraw();
  const yoyoPickMode = role === 'yoyo' && yoyoCanResolve();
  const surplus = offerHasSurplus();
  const pileN = pOffer.length;
  const need = offerNeed();
  const maxO = offerMax();
  lowRail.hidden = false;
  if (role === 'president') {
    if (prezCanAdd && pileN === 0) {
      $('ex-right-label').textContent = exchPhase.allow_surplus
        ? `Your offer — drop 1 (up to ${maxO})`
        : `Your offer — drop ${need}`;
    } else if (prezCanAdd || prezCanWithdraw) {
      $('ex-right-label').textContent = exchPhase.allow_surplus
        ? `Offer ${pileN}/${maxO} · drag back to hand to undo`
        : `Your offer (${pileN}/${need}) · drag back to undo`;
    } else if (surplus) {
      $('ex-right-label').textContent = `Offered ${pileN} · extras return`;
    } else {
      $('ex-right-label').textContent = 'Your offer (low)';
    }
  } else if (yoyoPickMode && surplus) {
    $('ex-right-label').textContent = `Pick ${need} of ${pileN} · rest returns`;
  } else if (yoyoPickMode) {
    $('ex-right-label').textContent = `From ${pTitle} · Acknowledge`;
  } else {
    $('ex-right-label').textContent = `From ${pTitle} (low)`;
  }
  const pickSet = new Set(yoyoPick);
  $('ex-right-cards')?.replaceChildren(
    ...pOffer.map((t) =>
      exTransitCard(t, {
        pickable: yoyoPickMode,
        withdrawable: prezCanWithdraw,
        picked: pickSet.has(t),
        arrive: exchArriveWires.has(t),
      }),
    ),
  );
  const exRight = $('ex-right');
  exRight?.classList.toggle('hot', prezCanAdd);
  exRight?.classList.toggle('ex-yoyo-pick', yoyoPickMode && surplus);

  if (ack) {
    const showAck = yoyoPickMode;
    ack.hidden = !showAck;
    ack.disabled = !yoyoAckEnabled();
    if (surplus) {
      ack.textContent = yoyoPickReady()
        ? 'Take selected'
        : `Pick ${need}`;
    } else {
      ack.textContent = 'Acknowledge';
    }
  }
  requestAnimationFrame(() => {
    layoutExchangeFloats();
    layoutPlayActions();
    updateExchSettleSnap();
  });
}

function renderHand() {
  const hand = $('hand');
  const leftHost = $('hand-bays-left');
  const rightHost = $('hand-bays-right');
  if (!hand) return;
  if (!lastState || !lastState.hand) {
    hand.replaceChildren();
    leftHost?.replaceChildren();
    rightHost?.replaceChildren();
    clearParkedSeqs();
    clearSetChips();
    updateParkZones();
    return;
  }
  // Hide cards already in exchange transit (still often on wire until finalize)
  const activeWire = activeHandWires();
  pruneParkedSeqs(activeWire);
  const parked = parkedTokenSet();
  const freeWire = activeWire.filter((t) => !parked.has(t));
  // Display order may reverse (hand_sort asc); selection / legal still use wire tokens.
  const freeTokens = displayHandTokens(freeWire);
  // Animate only on a new deal: empty history + hand content we have not animated yet.
  // Do NOT key on step/seat — exchange→lead and Joined remap re-send State with same cards.
  // Parks clear in resetSuitsForHand (new deal), not here (hand string changes mid-hand).
  const histEmpty = !lastState.history;
  const dealKey = lastState.hand;
  const dealAnim =
    !reducedMotion &&
    activeWire.length > 0 &&
    histEmpty &&
    dealKey !== lastAnimatedDealKey;
  if (dealAnim) {
    lastAnimatedDealKey = dealKey;
  }
  // Preserve selection that still exists in active hand
  for (const t of [...selected]) {
    if (!activeWire.includes(t)) selected.delete(t);
  }
  const canAct = isMyAction();
  const elig = currentResponseEligibility(activeWire);
  // Drop selection that is dead on this response (e.g. after state refresh).
  if (elig) {
    for (const t of [...selected]) {
      if (!elig.live.has(t)) selected.delete(t);
    }
  }
  const asc = handSort() === 'asc';
  hand.classList.toggle('hand-asc', asc);

  let animI = 0;
  const freeEls = freeTokens.map((t) =>
    buildHandCardEl(t, { elig, canAct, dealAnim, animIndex: animI++ }),
  );
  hand.replaceChildren(...freeEls);

  // Multi-bay: stack left parks | free | right parks
  const leftBays = parkedSeqs.filter((b) => b.side === 'left');
  const rightBays = parkedSeqs.filter((b) => b.side === 'right');
  if (leftHost) {
    const nodes = leftBays.map((bay) => {
      const { el, nextAnim } = buildBayCluster(bay, {
        elig,
        canAct,
        dealAnim,
        animIndex: animI,
      });
      animI = nextAnim;
      return el;
    });
    leftHost.replaceChildren(...nodes);
  }
  if (rightHost) {
    const nodes = rightBays.map((bay) => {
      const { el, nextAnim } = buildBayCluster(bay, {
        elig,
        canAct,
        dealAnim,
        animIndex: animI,
      });
      animI = nextAnim;
      return el;
    });
    rightHost.replaceChildren(...nodes);
  }

  updateParkZones();
  updatePlayButtons();
  updateHandDim();
  requestAnimationFrame(() => {
    renderSetChips();
    layoutExchangeFloats();
  });
}

/** Response-turn eligibility, or null when not your response. */
function currentResponseEligibility(handTokens) {
  const st = lastState;
  if (!st || st.step !== STEP.PLAY || st.next !== mySeat) return null;
  const hand = handTokens || (st.hand ? parseHand(st.hand) : []);
  return responseEligibility(hand, st.legal || []);
}

// Empty set chips (keep bay ×) and collapse gutters.
function clearSetChips() {
  const wrap = $('hand-wrap');
  if (wrap) {
    wrap.classList.remove('has-set-chips');
    clearChipHosts(wrap);
  }
  clearHandPreview();
}

// Sync .selected classes + play chrome to `selected`.
function refreshSelectionUi() {
  $('hand-wrap')?.querySelectorAll('.card').forEach((c) => {
    c.classList.toggle('selected', selected.has(c.dataset.wire));
  });
  updatePlayButtons();
  updateHandDim();
  syncSetChipActive();
}

// Clear all card selection.
function clearSelection() {
  if (!selected.size) return;
  selected.clear();
  refreshSelectionUi();
}

// True when selection is exactly this unit's tokens.
function selectionMatchesTokens(tokens) {
  if (!tokens?.length || selected.size !== tokens.length) return false;
  return tokens.every((t) => selected.has(t));
}

// Toggle one card on click; respects response/exchange caps.
function toggleCardSelection(wire) {
  const elig = currentResponseEligibility();
  if (elig && !elig.live.has(wire)) return;
  if (selected.has(wire)) {
    selected.delete(wire);
  } else {
    if (lastState?.step === STEP.PLAY) {
      const lock = responseLockedSize(lastState.legal, currentLeadSize());
      if (lock === 1) selected.clear();
      else if (lock > 1 && selected.size >= lock) return;
    }
    if (canPresidentOffer() || lastState?.step === STEP.EXCHANGE || lastState?.step === STEP.YOYO_SELECT) {
      // Surplus multi: 1 at a time; else up to room (EXCH2 exact need)
      const room = offerRoom() || offerNeed();
      const cap = exchPhase?.allow_surplus ? 1 : room;
      if (selected.size >= cap) return;
    }
    selected.add(wire);
  }
  refreshSelectionUi();
}

// On drag threshold from an unselected card: include it (option B).
function ensureCardSelectedForDrag(wire) {
  if (selected.has(wire)) return;
  const elig = currentResponseEligibility();
  if (elig && !elig.live.has(wire)) return;
  if (lastState?.step === STEP.PLAY) {
    const lock = responseLockedSize(lastState.legal, currentLeadSize());
    if (lock === 1) selected.clear();
    else if (lock > 1 && selected.size >= lock) selected.clear(); // grab replaces full multi
  }
  if (canPresidentOffer() || lastState?.step === STEP.EXCHANGE || lastState?.step === STEP.YOYO_SELECT) {
    const room = offerRoom() || 1;
    const cap = exchPhase?.allow_surplus ? 1 : room;
    if (selected.size >= cap) selected.clear();
  }
  selected.add(wire);
  refreshSelectionUi();
}

// Apply card selection from a set unit (replace prior selection).
function selectUnitTokens(tokens) {
  selected.clear();
  for (const t of tokens || []) selected.add(t);
  refreshSelectionUi();
}

function clearHandPreview() {
  $('hand-wrap')?.querySelectorAll('.card.preview').forEach((c) => c.classList.remove('preview'));
}

// Hover preview: highlight unit cards without changing selection.
function setHandPreview(tokens) {
  const set = new Set(tokens || []);
  $('hand-wrap')?.querySelectorAll('.card').forEach((el) => {
    el.classList.toggle('preview', set.has(el.dataset.wire));
  });
}

// Mark interactive set-chip.active when selection exactly matches that unit.
function syncSetChipActive() {
  const wrap = $('hand-wrap');
  if (!wrap) return;
  const sel = [...selected].sort().join(',');
  wrap.querySelectorAll('.set-chip').forEach((btn) => {
    if (btn.dataset.previewOnly === '1') {
      btn.classList.remove('active');
      return;
    }
    const toks = (btn.dataset.tokens || '').split(',').filter(Boolean);
    const key = [...toks].sort().join(',');
    btn.classList.toggle('active', sel.length > 0 && sel === key);
  });
}

// Cover key so legal response unit supersedes formable inventory of same size/rank.
function setUnitCoverKey(u) {
  if (u.kind === 'seq' || u.size === 5) return `seq-${u.rank}-${u.size}`;
  return `set-${u.rank}-${u.size}`;
}

/**
 * Set chips for hand multi-card units (E4b + planning).
 * - Your lead: all formable, interactive
 * - Your response: legal interactive + other formable preview-only
 * - Not your turn (trick) / Prez offer exchange: all formable preview-only
 * - Summary / no hand: hidden
 */
function renderSetChips() {
  const hand = $('hand');
  const wrap = $('hand-wrap');
  if (!hand || !wrap) return;

  const st = lastState;
  if (!st?.hand) {
    clearSetChips();
    return;
  }
  const step = st.step;
  const inTrick = step === STEP.LEAD || step === STEP.PLAY;
  // Exchange (Prez offer / waiting): structure hints only — offer is card select, not sets
  const inExchange = step === STEP.EXCHANGE || step === STEP.YOYO_SELECT;
  if (!inTrick && !inExchange) {
    clearSetChips();
    return;
  }

  const myTurn = isMyAction() && st.next === mySeat;
  const myLead = myTurn && step === STEP.LEAD;
  const myResp = myTurn && step === STEP.PLAY;

  // Display order on active hand only (exclude exchange transit)
  const transit = exchangeTransitSet();
  const active = parseHand(st.hand).filter((t) => !transit.has(t));
  const tokens = displayHandTokens(active);
  const opts = st.opts || 0;
  // Parked seq faces are reserved — free-row sets ignore them entirely
  const reserved = parkedTokenSet();
  const formable = enumerateSetUnits(tokens, {
    step: STEP.LEAD,
    opts,
    legal: [],
    reservedTokens: reserved,
  });

  /** @type {{ id: string, size: number, rank: number, tokens: string[], anchorToken: string, kind?: string, interactive: boolean }[]} */
  let units = [];
  /** @type {ReturnType<typeof enumerateSetUnits>} */
  let legalUnits = [];
  if (myLead) {
    units = formable.map((u) => ({ ...u, interactive: true }));
  } else if (myResp) {
    legalUnits = enumerateSetUnits(tokens, {
      step: STEP.PLAY,
      opts,
      legal: st.legal || [],
      reservedTokens: reserved,
    });
    const legalCover = new Set(legalUnits.map(setUnitCoverKey));
    units = [
      ...legalUnits.map((u) => ({ ...u, interactive: true })),
      ...formable
        .filter((u) => !legalCover.has(setUnitCoverKey(u)))
        .map((u) => ({ ...u, interactive: false })),
    ];
  } else {
    // Off-turn trick inventory, or exchange (Prez offer) — hover only
    units = formable.map((u) => ({ ...u, interactive: false }));
  }

  // E4d.3: park/free cluster anchors; inject missing park chips; muted seq still parkable
  const legalRankKeys = new Set(
    legalUnits
      .filter((u) => u.kind === 'seq' || u.size === 5)
      .map((u) =>
        (u.tokens || [])
          .map((t) => parseWireCard(t)?.rank ?? 0)
          .sort((a, b) => a - b)
          .join(','),
      ),
  );
  units = alignUnitsWithParks(units, {
    seqInteractive: (parkToks) => {
      if (myLead) return true;
      if (!myResp) return false;
      const key = parkToks
        .map((t) => parseWireCard(t)?.rank ?? 0)
        .sort((a, b) => a - b)
        .join(',');
      return legalRankKeys.has(key);
    },
  });

  // Reset set chips (keep bay ×); reopen gutters only when something mounts
  clearChipHosts(wrap);
  wrap.classList.remove('has-set-chips');

  if (!units.length) {
    clearHandPreview();
    return;
  }

  /** @type {Map<string, HTMLElement>} */
  const hostByWire = new Map();
  wrap.querySelectorAll('.set-chip-host').forEach((el) => {
    const w = el.dataset.chipFor;
    if (w) hostByWire.set(w, el);
  });

  // Dual chips on one face: set (2–4) first, seq (5) second — host flex order
  const ordered = [...units].sort((a, b) => {
    if (a.anchorToken !== b.anchorToken) return 0;
    const aSeq = a.kind === 'seq' || a.size === 5 ? 1 : 0;
    const bSeq = b.kind === 'seq' || b.size === 5 ? 1 : 0;
    return aSeq - bSeq;
  });

  let mounted = 0;
  for (const u of ordered) {
    const host = hostByWire.get(u.anchorToken || '');
    if (!host) continue;
    const isSeq = u.kind === 'seq' || u.size === 5;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'set-chip' + (u.interactive ? '' : ' preview-only');
    btn.textContent = String(u.size);
    btn.dataset.unitId = u.id;
    btn.dataset.size = String(u.size);
    btn.dataset.tokens = u.tokens.join(',');
    btn.dataset.previewOnly = u.interactive ? '0' : '1';
    const fromPark = isSeq && isParkedUnit(u.tokens);
    if (isSeq) btn.classList.add('seq-parkable');
    if (u.interactive) {
      btn.title = isSeq
        ? fromPark
          ? 'Select seq · drag to table to play · drop on free or × to unpark'
          : 'Select seq · drag to table to play · drop on empty side to park'
        : `Select ${u.size}-of-a-kind (or drag to table)`;
    } else {
      btn.title = isSeq
        ? fromPark
          ? 'Parked seq · drag to free or × to unpark'
          : 'Sequence of 5 · drag to empty side to park (planning)'
        : `${u.size}-of-a-kind (preview — not playable now)`;
      if (!isSeq) btn.tabIndex = -1;
    }

    btn.addEventListener('pointerenter', () => setHandPreview(u.tokens));
    btn.addEventListener('pointerleave', () => clearHandPreview());
    if (u.interactive) {
      btn.addEventListener('click', (ev) => {
        if (btn._dragMoved) {
          btn._dragMoved = false;
          return;
        }
        ev.preventDefault();
        // Re-click active chip clears; other chip replaces
        if (selectionMatchesTokens(u.tokens)) clearSelection();
        else selectUnitTokens(u.tokens);
      });
    }
    if (u.interactive || isSeq) {
      // Seq chips always parkable (incl. muted); play only when interactive
      btn.addEventListener('pointerdown', (ev) =>
        onSetChipPointerDown(ev, btn, u.tokens, {
          canPlay: !!u.interactive,
          parkable: isSeq,
          fromPark,
        }),
      );
    }
    host.appendChild(btn);
    mounted++;
  }
  if (mounted) wrap.classList.add('has-set-chips');
  else clearHandPreview();
  syncSetChipActive();
}

function updateHandDim() {
  const wrap = $('hand-wrap');
  if (!wrap) return;
  // Dim non-dragged; hide source cards while ghost is out
  const dragging = !!drag?.moved;
  const hide = drag?.hideTokens;
  const elig = currentResponseEligibility();
  wrap.querySelectorAll('.card').forEach((el) => {
    const w = el.dataset.wire;
    const dead = !!(elig && w && !elig.live.has(w));
    const source = !!(hide && w && hide.has(w));
    el.classList.toggle('dead', dead);
    el.classList.toggle('drag-source', source);
    el.classList.toggle('dim', dragging && !source && !!hide?.size);
  });
}

function updateExchangeChrome() {
  renderExchangeOverlays();
}

function updatePlayButtons() {
  const st = lastState;
  const atGameEnd =
    !!(st && st.step >= STEP.SUMMARY) ||
    gameOverHoldActive ||
    gameOverSummaryOpen;
  const myTurn = isMyAction();
  const offering = canPresidentOffer();
  const lead = st && st.step === STEP.LEAD && st.next === mySeat;
  const resp = st && st.step === STEP.PLAY && st.next === mySeat;
  const elig = resp ? currentResponseEligibility() : null;
  const passOnly = !!(elig && elig.passOnly);

  const btnPlay = $('btn-play');
  const btnPass = $('btn-pass');
  // Seat theater: no hand controls until fanfare ends
  if (seatCeremonyActive) {
    if (btnPlay) {
      btnPlay.hidden = true;
      btnPlay.disabled = true;
    }
    if (btnPass) {
      btnPass.hidden = true;
      btnPass.disabled = true;
    }
    const hint = $('hand-hint');
    if (hint) hint.textContent = 'Drawing seats…';
    return;
  }
  if (atGameEnd) {
    // Hold / summary: no Pass or Play (clear the strip under Game summary)
    btnPlay.hidden = true;
    btnPlay.disabled = true;
    btnPlay.classList.remove('no-play');
    if (btnPass) {
      btnPass.hidden = true;
      btnPass.disabled = true;
    }
  } else if (offering) {
    // Prez offer: multi-drop (Ex3) — button atop low drop target
    const room = offerRoom();
    const lim = exchPhase?.allow_surplus ? 1 : room;
    const nSel = selected.size;
    btnPlay.textContent = offerPileTokens().length ? 'Add' : 'Offer';
    btnPlay.disabled = !myTurn || nSel < 1 || nSel > lim;
    btnPlay.hidden = false;
    btnPlay.classList.remove('no-play');
    if (btnPass) {
      btnPass.disabled = true;
      btnPass.hidden = true;
    }
  } else if (exchangeActive()) {
    // Ceremony: no greyed Play/Pass — Yoyo uses Ack on low float only
    btnPlay.hidden = true;
    btnPlay.disabled = true;
    btnPlay.classList.remove('no-play');
    if (btnPass) {
      btnPass.hidden = true;
      btnPass.disabled = true;
    }
  } else if (!myTurn) {
    // Not our lead/respond turn — hide Pass/Play entirely
    btnPlay.hidden = true;
    btnPlay.disabled = true;
    btnPlay.classList.remove('no-play');
    if (btnPass) {
      btnPass.hidden = true;
      btnPass.disabled = true;
    }
  } else {
    // Our turn: Play always; Pass only when responding (not lead)
    btnPlay.textContent = 'Play';
    btnPlay.disabled = selected.size === 0 || passOnly;
    btnPlay.hidden = false;
    btnPlay.classList.toggle('no-play', passOnly);
    if (btnPass) {
      btnPass.hidden = !resp;
      btnPass.disabled = !resp;
    }
  }

  updateExchangeChrome();
  updateHandDim();
  requestAnimationFrame(layoutPlayActions);

  const hint = $('hand-hint');
  if (hint) {
    if (atGameEnd) {
      hint.textContent = gameOverHoldActive
        ? 'Game over · last trick on the table'
        : 'Game over · Play again when ready';
    } else if (offering) {
      const room = offerRoom();
      const pile = offerPileTokens().length;
      const maxO = offerMax();
      hint.textContent = exchPhase?.allow_surplus
        ? pile
          ? `Drop 1 more card onto offer pile (${pile}/${maxO}) · or Add`
          : `Drop cards one at a time onto offer pile (need ${offerNeed()}, up to ${maxO})`
        : room > 1
          ? `Select ${room} cards · drag to pile or Offer`
          : 'Click a card · drag to pile beside seat (or Offer)';
    } else if (lead) {
      hint.textContent = hasOpt(st.opts || 0, OPT.SEQ5)
        ? 'Click cards · chips · drag 5-chip to empty side to park · table or Play'
        : 'Click cards · set chips (2–5) · drag to table or Play · empty click clears';
    } else if (passOnly) {
      hint.textContent =
        'No legal play — Pass only · muted chips = sets still in hand (hover)';
    } else if (resp) {
      hint.textContent = hasOpt(st.opts || 0, OPT.SEQ5)
        ? 'Live cards · chips · drag 5-chip to empty side to park · muted = structure'
        : 'Click live cards · bright chips playable · drag or Play · muted = structure only';
    } else if (exchangeActive() && exchPhase?.role === 'yoyo' && exchPhase.can_ack) {
      hint.textContent = offerHasSurplus()
        ? `Select ${offerNeed()} from offer · Take or drag to hand · extras return to ${placeLabels(st?.n || 4, 1)}`
        : 'Review offer · Acknowledge';
    } else if (exchangeActive() && (canPresidentOffer() || canPresidentWithdraw())) {
      const pile = offerPileTokens().length;
      if (pile && canPresidentWithdraw()) {
        hint.textContent = canPresidentOffer()
          ? `Add to offer (${pile}/${offerMax()}) · or drag a pile card back to hand to undo`
          : 'Drag offer card back to hand to undo · waiting on Yoyo';
      } else if (exchPhase?.allow_surplus) {
        hint.textContent = `Drop cards one at a time (need ${offerNeed()}, up to ${offerMax()})`;
      } else {
        hint.textContent = 'Select offer cards · drag to pile or Offer';
      }
    } else if (exchangeActive()) {
      hint.textContent = offerHasSurplus()
        ? 'Exchange · Yoyo choosing · extras return to President'
        : 'Exchange… · high/low piles flank your seat';
    } else if (
      st &&
      (st.step === STEP.LEAD || st.step === STEP.PLAY) &&
      st.hand
    ) {
      hint.textContent = 'Sets in hand (hover to preview) · waiting for turn…';
    } else hint.textContent = 'Waiting for your turn…';
  }
}

// Submit current selection (Play button or drop onto table / exchange zone).
function trySubmitPlay(dropTarget = 'table') {
  if (!selected.size) return false;
  const list = [...selected];
  const offering = canPresidentOffer();

  if (offering || dropTarget === 'ex-right') {
    if (!offering) {
      rejectPlay('not your offer turn');
      return false;
    }
    const room = offerRoom();
    // Dual-human multi-offer: one card per drop (product intent)
    const maxBatch = exchPhase?.allow_surplus ? 1 : room;
    const lim = Math.min(room, maxBatch);
    if (list.length < 1 || list.length > lim) {
      rejectPlay(
        lim <= 1
          ? 'select 1 card to offer'
          : `select 1–${lim} card(s) to offer`,
      );
      return false;
    }
    const cards = list.join(',');
    lastSentPlay = cards;
    dbgPlay('send offer', { sent: cards, selected: list, pile: offerPileTokens().length });
    send({ action: 'offerexchange', cards });
    // Optimistic hide until ExchangePhase echoes pile
    for (const t of list) {
      if (!localOfferCards.includes(t)) localOfferCards.push(t);
    }
    selected.clear();
    renderExchangeOverlays();
    renderHand();
    updatePlayButtons();
    return true;
  }

  const bad = clientValidatePlay(list);
  if (bad) {
    dbgPlay('client reject', { err: bad, selected: list });
    rejectPlay(bad);
    return false;
  }
  const cards = list.join(',');
  lastSentPlay = cards;
  dbgPlay('send', { sent: cards, selected: list });
  claimPlay(histSuits, list);
  send({ action: 'play', cards });
  selected.clear();
  renderHand();
  return true;
}

// ——— Pointer drag-to-table / park ———
// Shared drag; onDragStart after threshold. opts: parkTokens, fromPark, canPlay.
function beginPlayDrag(ev, el, onDragStart, opts = {}) {
  if (ev.button != null && ev.button !== 0) return;
  const canPlay = opts.canPlay !== false;
  // Play drag needs our turn; park-only seq drag does not
  if (canPlay && !isMyAction() && !opts.parkTokens) return;
  if (!canPlay && !opts.parkTokens) return;

  drag = {
    pointerId: ev.pointerId,
    startX: ev.clientX,
    startY: ev.clientY,
    moved: false,
    ghost: null,
    hideTokens: null,
    parkTokens: opts.parkTokens || null,
    fromPark: !!opts.fromPark,
    canPlay,
  };
  el.setPointerCapture?.(ev.pointerId);
  el._dragMoved = false;
  let finished = false;

  const setParkHot = (on) => {
    $('hand-clusters')?.classList.toggle('park-drag', on);
    if (!on) {
      for (const id of ['park-zone-left', 'park-zone-right']) {
        $(id)?.classList.remove('hot');
      }
    }
  };

  // Strip listeners + ghost/chrome; leaves drop payload on caller.
  const detach = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onPointerEnd);
    window.removeEventListener('pointercancel', onPointerEnd);
    window.removeEventListener('blur', onAbort);
    window.removeEventListener('contextmenu', onContextMenu);
    el.removeEventListener('lostpointercapture', onLostCapture);
  };

  // Always remove ghost; null drag; restore hand. Returns snapshot for drop.
  const scrubDrag = () => {
    const snap = drag
      ? {
          moved: drag.moved,
          parkTokens: drag.parkTokens,
          fromPark: drag.fromPark,
          canPlay: drag.canPlay,
        }
      : null;
    if (drag?.ghost) drag.ghost.remove();
    drag = null;
    $('table-area')?.classList.remove('drop-hot');
    setParkHot(false);
    updateHandDim();
    clearHandPreview();
    return snap;
  };

  // cancel: no drop (right-click, blur, lost capture, pointercancel).
  const endDrag = (e, { cancel = false } = {}) => {
    if (finished || !drag) return;
    if (e?.pointerId != null && e.pointerId !== drag.pointerId) return;
    finished = true;
    try {
      el.releasePointerCapture?.(drag.pointerId);
    } catch {
      /* already released */
    }
    detach();
    const clientX = e?.clientX;
    const clientY = e?.clientY;
    const snap = scrubDrag();
    if (cancel || !snap?.moved) return;

    // Seq chip: park / unpark zones before table play
    if (snap.parkTokens?.length === 5) {
      const zone = hitParkZone(clientX, clientY);
      if (zone) {
        tryParkSeq(snap.parkTokens, zone);
        return;
      }
      if (snap.fromPark && hitFreeHand(clientX, clientY)) {
        unparkSeq(snap.parkTokens); // only that bay
        return;
      }
    }

    if (!snap.canPlay) return;
    const exRight = $('ex-right');
    const er = exRight?.getBoundingClientRect();
    if (
      er &&
      clientX >= er.left &&
      clientX <= er.right &&
      clientY >= er.top &&
      clientY <= er.bottom
    ) {
      trySubmitPlay('ex-right');
    } else {
      const area = $('table-area');
      const r = area?.getBoundingClientRect();
      if (
        r &&
        clientX >= r.left &&
        clientX <= r.right &&
        clientY >= r.top &&
        clientY <= r.bottom
      ) {
        trySubmitPlay('table');
      }
    }
  };

  const onPointerEnd = (e) => endDrag(e, { cancel: e.type === 'pointercancel' });
  const onAbort = () => endDrag(null, { cancel: true });
  const onContextMenu = (e) => {
    if (!drag) return;
    e.preventDefault();
    endDrag(e, { cancel: true });
  };
  const onLostCapture = () => endDrag(null, { cancel: true });

  const onMove = (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && dx * dx + dy * dy > 36) {
      drag.moved = true;
      el._dragMoved = true;
      onDragStart?.(); // option B / chip unit — after threshold, before ghost
      const ghostSrc = drag.parkTokens?.length ? drag.parkTokens : [...selected];
      drag.hideTokens = new Set(ghostSrc);
      drag.ghost = buildDragGhost(ghostSrc);
      document.body.appendChild(drag.ghost);
      if (drag.canPlay && selected.size) $('table-area')?.classList.add('drop-hot');
      if (drag.parkTokens?.length === 5) setParkHot(true);
      updateHandDim();
    }
    if (drag.ghost) {
      drag.ghost.style.left = `${e.clientX}px`;
      drag.ghost.style.top = `${e.clientY}px`;
    }
    // Highlight park zone under pointer while dragging a seq chip
    if (drag.moved && drag.parkTokens?.length === 5) {
      const z = hitParkZone(e.clientX, e.clientY);
      for (const id of ['park-zone-left', 'park-zone-right']) {
        const zone = $(id);
        if (!zone) continue;
        zone.classList.toggle('hot', !!z && zone.dataset.park === z);
      }
    }
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onPointerEnd);
  window.addEventListener('pointercancel', onPointerEnd);
  window.addEventListener('blur', onAbort);
  window.addEventListener('contextmenu', onContextMenu);
  el.addEventListener('lostpointercapture', onLostCapture);
}

// Card press: no select yet — click toggles; drag threshold adds card (B).
function onCardPointerDown(ev, el, wire) {
  if (!isMyAction()) return;
  if (ev.button != null && ev.button !== 0) return;
  const elig = currentResponseEligibility();
  if (elig && !elig.live.has(wire)) return;
  beginPlayDrag(ev, el, () => ensureCardSelectedForDrag(wire), { canPlay: true });
}

// Set-chip press: select unit when playable; seq chips also park/unpark on drop.
function onSetChipPointerDown(ev, el, tokens, { canPlay = true, parkable = false, fromPark = false } = {}) {
  if (ev.button != null && ev.button !== 0) return;
  if (canPlay && !isMyAction()) return;
  if (!canPlay && !parkable) return;
  ev.preventDefault();
  clearHandPreview();
  setHandPreview(tokens);
  beginPlayDrag(
    ev,
    el,
    () => {
      if (canPlay && isMyAction()) {
        selectUnitTokens(tokens);
        setHandPreview(tokens);
      }
    },
    {
      canPlay: canPlay && isMyAction(),
      parkTokens: parkable ? tokens : null,
      fromPark,
    },
  );
}

// Targets that own selection / actions — empty-space clear skips these.
function isSelectionUiTarget(el) {
  return !!el?.closest?.(
    '.card, .set-chip, .play-actions, .park-zone, .hand-bay, button, a, input, select, label, .overlay-panel, #gear-wrap, .ex-seat-float, .game-over-hold, .seat-token, .drag-ghost',
  );
}

// Click felt / hand chrome (not cards/chips/buttons) clears selection.
function onEmptySelectionClick(e) {
  if (!selected.size) return;
  if (isSelectionUiTarget(e.target)) return;
  clearSelection();
}

function buildDragGhost(tokenList) {
  const g = document.createElement('div');
  g.className = 'drag-ghost';
  // Same High→Low / Low→High order as hand (not Set insertion order)
  const list = displayPlayTokens(tokenList?.length ? tokenList : [...selected]);
  for (const t of list.slice(0, 6)) {
    g.appendChild(cardEl(t, { w: 44, h: 58 }));
  }
  if (list.length > 6) {
    const more = document.createElement('span');
    more.textContent = `+${list.length - 6}`;
    more.style.color = '#fff';
    more.style.marginLeft = '4px';
    g.appendChild(more);
  }
  return g;
}

// Last play rank in current trick (for response beat check). Null if lead.
function lastTrickTailRank() {
  const entries = parseHistoryString(lastState?.history || '');
  if (!entries.length) return null;
  let start = 0;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].starter) start = i;
  }
  const last = entries[entries.length - 1];
  if (!last || last.joker) return null;
  return last.rank;
}

// Current trick lead size from first play of the trick.
function currentLeadSize() {
  const entries = parseHistoryString(lastState?.history || '');
  if (!entries.length) return 0;
  let start = 0;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].starter) start = i;
  }
  let i = start;
  const seat = entries[i].seat;
  let n = 0;
  while (i < entries.length && entries[i].seat === seat && (i === start || !entries[i].starter)) {
    n++;
    i++;
  }
  return n;
}

// Client-side guard before send; returns error string or null if ok.
function clientValidatePlay(wireList) {
  const st = lastState;
  if (!st || !mySeat) return 'not ready';
  if (st.step === STEP.EXCHANGE || st.step === STEP.YOYO_SELECT) {
    if (mySeat !== 1) return 'not president';
    if (!canPresidentOffer()) return 'offer locked';
    const room = offerRoom();
    if (wireList.length < 1 || wireList.length > room) {
      return room <= 1 ? 'select 1 card to offer' : `select 1–${room} card(s)`;
    }
    return null;
  }
  if (st.next !== mySeat) return 'not your turn';
  if (!wireList.length) return 'no cards selected';

  const parsed = wireList.map(parseWireCard);
  if (parsed.some((c) => !c)) return 'bad card selection';

  const jokers = parsed.filter((c) => c.joker);
  if (jokers.length && jokers.length !== parsed.length) {
    return 'joker must be played alone';
  }
  if (jokers.length === 1) return null; // joker alone always legal on turn

  if (st.step === STEP.LEAD) {
    if (parsed.length === 5) return null; // seq checked server-side
    if (parsed.length < 1 || parsed.length > 4) return 'lead size 1–4 or seq5';
    const r = parsed[0].rank;
    if (parsed.some((c) => c.rank !== r)) return 'set must be same rank';
    return null;
  }

  if (st.step === STEP.PLAY) {
    const lead = currentLeadSize();
    if (lead && parsed.length !== lead && !(parsed.length === 1 && parsed[0].joker)) {
      return `must play ${lead} card(s) (or joker)`;
    }
    if (parsed.length !== 5) {
      const r = parsed[0].rank;
      if (parsed.some((c) => c.rank !== r)) return 'set must be same rank';
      const prev = lastTrickTailRank();
      if (prev != null && r <= prev) {
        return `must beat rank ${prev} (selected ${r})`;
      }
    }
    return null;
  }
  return 'cannot play now';
}

function showSeatDrawPanel(show) {
  const panel = $('panel-seat-draw');
  if (!panel) return;
  panel.classList.toggle('visible', !!show);
  if (!show) {
    panel.classList.remove('spinning', 'fanfare-only');
    const ff = $('seat-fanfare');
    if (ff) ff.hidden = true;
  }
}

function showPlayAgainPanel(show) {
  $('panel-play-again').classList.toggle('visible', !!show);
}

// Idle reels: role headers + "?" cells for n seats.
function buildSeatReelsIdle(n) {
  const host = $('seat-reels');
  if (!host) return;
  const frag = document.createDocumentFragment();
  for (let seat = 1; seat <= n; seat++) {
    const col = document.createElement('div');
    col.className = 'seat-reel';
    if (seat === 1) col.classList.add('rank-prez');
    else if (seat === 2) col.classList.add('rank-vp');
    col.dataset.seat = String(seat);

    const role = document.createElement('div');
    role.className = 'seat-reel-role';
    role.textContent = placeLabels(n, seat);

    const win = document.createElement('div');
    win.className = 'seat-reel-window';
    const strip = document.createElement('div');
    strip.className = 'seat-reel-strip';
    const cell = document.createElement('div');
    cell.className = 'seat-reel-cell placeholder';
    cell.textContent = '···';
    strip.appendChild(cell);
    win.appendChild(strip);
    col.append(role, win);
    frag.appendChild(col);
  }
  host.replaceChildren(frag);
  host.setAttribute('aria-hidden', 'false');
}

// Waiting names for Spin button subtitle.
function seatDrawWaitingNames(ready, list) {
  return list.filter((name) => {
    if (ready[name]) return false;
    for (const [k, v] of Object.entries(ready)) {
      if (ukey(k) === ukey(name) && v) return false;
    }
    return true;
  });
}

function renderSeatDrawTally(status) {
  drawStatus = status;
  if (seatCeremonyActive) return;
  const ul = $('seat-draw-tally');
  const ready = status.ready || {};
  const names = Object.keys(ready).sort((a, b) => a.localeCompare(b));
  // Prefer series order if we have players
  const order = playerNames.length
    ? playerNames.filter((n) => Object.keys(ready).some((k) => ukey(k) === ukey(n)) || n in ready)
    : names;
  // Match ready keys case-insensitively to playerNames
  const list = (order.length ? order : names).length
    ? (order.length ? order : names)
    : names;
  const displayList = list.length
    ? list
    : Object.keys(ready);

  ul.replaceChildren(
    ...displayList.map((name) => {
      const li = document.createElement('li');
      const left = document.createElement('span');
      left.textContent = name;
      const right = document.createElement('span');
      let isReady = !!ready[name];
      if (!isReady) {
        for (const [k, v] of Object.entries(ready)) {
          if (ukey(k) === ukey(name) && v) isReady = true;
        }
      }
      if (isReady) {
        right.className = 'ready';
        right.textContent = '✓';
      } else {
        right.className = 'wait';
        right.textContent = '…';
      }
      li.append(left, right);
      return li;
    }),
  );
  const me = loadIdentity().username;
  let amReady = false;
  if (me) {
    for (const [k, v] of Object.entries(ready)) {
      if (ukey(k) === ukey(me) && v) amReady = true;
    }
  }
  const btn = $('btn-seat-ready');
  const waiting = seatDrawWaitingNames(ready, displayList);
  if (btn) {
    if (amReady) {
      btn.disabled = true;
      btn.textContent =
        waiting.length > 0
          ? `Waiting for ${waiting.slice(0, 2).join(', ')}${waiting.length > 2 ? '…' : ''}`
          : 'Spinning…';
    } else {
      btn.disabled = false;
      btn.textContent = 'Spin';
    }
  }
  const hint = $('seat-draw-hint');
  if (hint) {
    hint.textContent = amReady
      ? 'You’re in — waiting for everyone to spin.'
      : 'Offices drawn at random. Click Spin when ready.';
  }
  const n = Math.max(playerNames.length || 0, displayList.length, 3);
  buildSeatReelsIdle(playerNames.length || n);
  showSeatDrawPanel(true);
  if (playerNames.length) renderSeatsLobbyOrder(playerNames);
  setStatus(
    amReady
      ? 'Waiting for others to spin for seats…'
      : 'Ready to spin for seats…',
  );
}

/**
 * E4.4: animate seat tokens from pre-rotation layout to new seats (you at bottom).
 * @param {string[]} oldNames names by old seat 1..n
 * @param {number} oldMySeat
 * @param {string[]} newNames names by new seat 1..n
 */
async function animateSeatRotate(oldNames, oldMySeat, newNames) {
  const n = newNames.length;
  const me = loadIdentity().username;
  const newMy =
    newNames.findIndex((nm) => ukey(nm) === ukey(me)) + 1 || oldMySeat || 1;

  lastSummary = null;
  // Drop place pills; seats now carry next-hand offices
  if (lastState) lastState.finish_order = [];
  showPlayAgainPanel(false);
  cancelGameOverHold();
  gameOverSkipHold = false;
  gameOverSummaryOpen = false;
  setHistoryOpen(false);
  setStandingsOpen(false);
  histViewIndex = -1;

  if (reducedMotion || n < 2) {
    playerNames = newNames.slice();
    mySeat = newMy;
    sessionStorage.setItem(SS.seat, String(mySeat));
    animating = false;
    renderStrip();
    if (lastState && lastState.step < STEP.SUMMARY) {
      renderSeatsFromState();
      renderHand();
      renderTrick();
      updatePlayButtons();
      updateHistoryChrome();
    } else {
      // State may follow immediately; leave names ready
      renderSeatsFromState();
    }
    return;
  }

  animating = true;
  setStatus('Seats rotating…');

  const posFrom = seatPositions(n);
  const posTo = seatPositions(n);
  const layer = $('seats-layer');
  if (!layer) {
    playerNames = newNames.slice();
    mySeat = newMy;
    animating = false;
    return;
  }

  // One token per name; start at old you-relative position, end at new offices.
  const els = newNames.map((name, i) => {
    const newSeat = i + 1;
    let oldSeat = oldNames.findIndex((nm) => ukey(nm) === ukey(name)) + 1;
    if (oldSeat < 1) oldSeat = newSeat;
    const oldVi = visualIndex(oldSeat, n, oldMySeat || 1);
    const el = buildSeatToken(name, newSeat, n, 0, {});
    el.style.left = `${posFrom[oldVi].x}%`;
    el.style.top = `${posFrom[oldVi].y}%`;
    el.style.transition = 'none';
    return { el, newSeat };
  });
  layer.replaceChildren(...els.map((x) => x.el));

  // Force layout, then transition to new arc
  void layer.offsetWidth;
  for (const { el, newSeat } of els) {
    const newVi = visualIndex(newSeat, n, newMy);
    el.style.transition = 'left 0.65s ease, top 0.65s ease';
    el.style.left = `${posTo[newVi].x}%`;
    el.style.top = `${posTo[newVi].y}%`;
  }

  await new Promise((r) => setTimeout(r, 700));
  for (const { el } of els) el.style.transition = '';

  playerNames = newNames.slice();
  mySeat = newMy;
  sessionStorage.setItem(SS.seat, String(mySeat));
  animating = false;
  renderStrip();
  if (lastState && lastState.step < STEP.SUMMARY) {
    renderSeatsFromState();
    renderHand();
    renderTrick();
    renderExchangeOverlays();
    updatePlayButtons();
    updateHistoryChrome();
    layoutPlayActions();
  } else {
    renderSeatsFromState();
  }
}

// Build scrolling name strip. Returns strip + landIndex (winner last) + cellHPx.
// startOffset: rotate cycle so columns don't share the same first visible name.
function buildReelStrip(names, winner, cycles = 6, startOffset = 0) {
  const strip = document.createElement('div');
  strip.className = 'seat-reel-strip';
  const n = names.length || 1;
  const seq = [];
  const off = ((startOffset % n) + n) % n;
  for (let c = 0; c < cycles; c++) {
    for (let i = 0; i < n; i++) seq.push(names[(off + i) % n]);
  }
  // Winner last so translateY lands on final assignment
  seq.push(winner);
  const cellHPx = 38; // match .seat-reel-window
  seq.forEach((nm) => {
    const cell = document.createElement('div');
    cell.className = 'seat-reel-cell';
    cell.textContent = nm;
    cell.style.height = `${cellHPx}px`;
    strip.appendChild(cell);
  });
  return { strip, landIndex: seq.length - 1, cellHPx };
}

// Scroll each reel through names (ease-out), staggered stop Prez → Yoyo.
async function runReelRoll(strips, stillMine) {
  if (!strips.length) return;
  const baseMs = 1250; // first reel (Prez)
  const staggerMs = 180; // each later reel runs longer → lands later
  // Paint at y=0 first, then animate to winner
  for (const { strip } of strips) {
    strip.style.transition = 'none';
    strip.style.transform = 'translateY(0)';
    strip.classList.remove('settled');
  }
  void strips[0].strip.offsetHeight;
  for (let i = 0; i < strips.length; i++) {
    const { strip, landIndex, cellHPx } = strips[i];
    const dur = baseMs + i * staggerMs;
    strip.classList.add('rolling');
    // ease: fast scroll early, slow crawl into final name
    strip.style.transition = `transform ${dur}ms cubic-bezier(0.08, 0.72, 0.12, 1)`;
    strip.style.transform = `translateY(-${landIndex * cellHPx}px)`;
  }
  // As each reel finishes, mark landed (stagger matches durations)
  for (let i = 0; i < strips.length; i++) {
    if (!stillMine()) return;
    const wait =
      i === 0 ? baseMs : staggerMs;
    await sleepMs(wait);
    if (!stillMine()) return;
    const { col, strip } = strips[i];
    strip.classList.remove('rolling');
    strip.classList.add('settled');
    col.classList.add('landed');
  }
  // Small beat after last reel settles
  if (stillMine()) await sleepMs(120);
}

// After ceremony: paint live table from latest State (no event queue).
function finishSeatCeremonyUi() {
  seatCeremonyActive = false;
  animating = false;
  showSeatDrawPanel(false);
  playerNames = playerNames.slice();
  drawDone = true;
  if (lastState) {
    renderSeatsFromState();
    renderHand();
    renderTrick();
    renderExchangeOverlays();
    layoutPlayActions();
    requestAnimationFrame(layoutExchangeFloats);
    updatePlayButtons();
    if (exchangeActive() && exchPhase) {
      setStatus(exchangeStatusText(exchPhase));
    } else if (lastState.step === STEP.LEAD && lastState.next === mySeat) {
      setStatus('Your lead — set chips or cards · drag to table or Play');
    } else if (lastState.step === STEP.PLAY && lastState.next === mySeat) {
      setStatus('Your turn — legal set chips · Pass, Play, or drag');
    } else if (
      lastState.step === STEP.EXCHANGE ||
      lastState.step === STEP.YOYO_SELECT
    ) {
      setStatus('Card exchange in progress…');
    } else if (lastState.next) {
      const nm = playerNames[lastState.next - 1] || `seat ${lastState.next}`;
      setStatus(`Waiting on ${nm}`);
    } else {
      setStatus('');
    }
  } else {
    renderSeatsFromState();
    setStatus('Dealing…');
  }
}

// E2b: reels spin → stagger land → local fanfare → tokens to you-bottom arc.
async function animateSeatDraw(finalSeats) {
  const gen = ++seatCeremonyGen;
  seatCeremonyActive = true;
  animating = true;
  playerNames = finalSeats.slice();
  drawDone = true;
  const n = finalSeats.length;
  const me = loadIdentity().username;
  const myFinal = finalSeats.findIndex((nm) => ukey(nm) === ukey(me)) + 1 || 1;
  mySeat = myFinal;
  const role = placeLabels(n, myFinal);

  const panel = $('panel-seat-draw');
  const fanfare = $('seat-fanfare');
  const roleEl = $('seat-fanfare-role');
  const btn = $('btn-seat-ready');
  const hint = $('seat-draw-hint');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Spinning…';
  }
  if (hint) hint.textContent = 'Drawing offices…';
  if (fanfare) fanfare.hidden = true;
  showSeatDrawPanel(true);
  panel?.classList.add('spinning');
  panel?.classList.remove('fanfare-only');
  setStatus('Spinning for seats…');

  // Always complete UI if this gen still owns the ceremony (deal State must not cancel delays)
  const stillMine = () => gen === seatCeremonyGen;

  try {
    // Reduced motion: snap reels + short fanfare
    if (reducedMotion) {
      buildSeatReelsIdle(n);
      const host = $('seat-reels');
      if (host) {
        host.querySelectorAll('.seat-reel').forEach((col, i) => {
          const strip = col.querySelector('.seat-reel-strip');
          if (!strip) return;
          strip.replaceChildren();
          const cell = document.createElement('div');
          cell.className = 'seat-reel-cell';
          cell.textContent = finalSeats[i] || '—';
          strip.appendChild(cell);
          col.classList.add('landed');
        });
      }
      panel?.classList.remove('spinning');
      panel?.classList.add('fanfare-only');
      if (roleEl) {
        roleEl.textContent = role;
        roleEl.className = 'seat-fanfare-role';
        if (myFinal === 1) roleEl.classList.add('rank-prez');
        else if (myFinal === 2) roleEl.classList.add('rank-vp');
      }
      if (fanfare) fanfare.hidden = false;
      setStatus(`You are ${role}`);
      await sleepMs(400);
      if (!stillMine()) return;
      await settleSeatTokens(finalSeats, myFinal, gen);
      if (!stillMine()) return;
      finishSeatCeremonyUi();
      return;
    }

    // Build strips and scroll names (real roll, not blur flicker)
    const host = $('seat-reels');
    if (host) {
      const frag = document.createDocumentFragment();
      const strips = [];
      for (let seat = 1; seat <= n; seat++) {
        const col = document.createElement('div');
        col.className = 'seat-reel';
        if (seat === 1) col.classList.add('rank-prez');
        else if (seat === 2) col.classList.add('rank-vp');

        const roleLab = document.createElement('div');
        roleLab.className = 'seat-reel-role';
        roleLab.textContent = placeLabels(n, seat);

        const win = document.createElement('div');
        win.className = 'seat-reel-window';
        // Longer strip + column offset so each slot rolls through different order
        const { strip, landIndex, cellHPx } = buildReelStrip(
          finalSeats,
          finalSeats[seat - 1],
          5 + (seat % 3), // 5–7 full cycles before winner
          seat - 1,
        );
        win.appendChild(strip);
        col.append(roleLab, win);
        frag.appendChild(col);
        strips.push({ col, strip, landIndex, cellHPx });
      }
      host.replaceChildren(frag);
      await runReelRoll(strips, stillMine);
    } else {
      await sleepMs(800);
    }
    if (!stillMine()) return;

    // Local fanfare
    panel?.classList.remove('spinning');
    panel?.classList.add('fanfare-only');
    if (roleEl) {
      roleEl.textContent = role;
      roleEl.className = 'seat-fanfare-role';
      if (myFinal === 1) roleEl.classList.add('rank-prez');
      else if (myFinal === 2) roleEl.classList.add('rank-vp');
    }
    if (fanfare) fanfare.hidden = false;
    setStatus(`You are ${role}`);
    await sleepMs(myFinal === 1 ? 1600 : 1400);
    if (!stillMine()) return;

    await settleSeatTokens(finalSeats, myFinal, gen);
    if (!stillMine()) return;
    finishSeatCeremonyUi();
  } catch (e) {
    console.error('[seat-draw] ceremony failed', e);
    if (stillMine()) finishSeatCeremonyUi();
  }
}

// Absolute arc → you-relative seats (shared by full + reduced-motion paths).
async function settleSeatTokens(finalSeats, myFinal, gen) {
  const n = finalSeats.length;
  const layer = $('seats-layer');
  if (!layer) return;
  showSeatDrawPanel(false);
  const absPos = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; // seat1 at top
    absPos.push({ x: 50 + 38 * Math.cos(a), y: 48 + 36 * Math.sin(a) });
  }
  const posTo = seatPositions(n);
  const els = finalSeats.map((name, i) => {
    const seat = i + 1;
    const el = buildSeatToken(name, seat, n, 0, {});
    el.style.left = `${absPos[i].x}%`;
    el.style.top = `${absPos[i].y}%`;
    el.style.transition = reducedMotion ? 'none' : 'left 0.55s ease, top 0.55s ease';
    return el;
  });
  layer.replaceChildren(...els);
  if (reducedMotion) {
    for (let i = 0; i < n; i++) {
      const vi = visualIndex(i + 1, n, myFinal);
      els[i].style.left = `${posTo[vi].x}%`;
      els[i].style.top = `${posTo[vi].y}%`;
    }
    return;
  }
  await sleepMs(80);
  if (gen !== seatCeremonyGen) return;
  for (let i = 0; i < n; i++) {
    const vi = visualIndex(i + 1, n, myFinal);
    els[i].style.left = `${posTo[vi].x}%`;
    els[i].style.top = `${posTo[vi].y}%`;
  }
  await sleepMs(600);
  if (gen !== seatCeremonyGen) return;
  for (const el of els) el.style.transition = '';
}

// Compact play/err debug (seq5, illegal response, etc.) — check DevTools console after Ctrl-F5.
function dbgPlay(tag, extra = {}) {
  const st = lastState;
  const ranks = (list) =>
    (list || [])
      .map((t) => {
        const c = parseWireCard(t);
        if (!c) return t;
        return c.joker ? 'JK' : c.rank;
      })
      .join(',');
  console.warn('[play]', tag, {
    err: extra.err,
    sent: extra.sent,
    selected: extra.selected,
    selectedRanks: ranks(extra.selected || extra.sent?.split?.(',') || []),
    step: st?.step,
    next: st?.next,
    mySeat,
    hand: st?.hand,
    handRanks: ranks(parseHand(st?.hand || '')),
    legal: st?.legal,
    history: st?.history,
    n: st?.n,
    opts: st?.opts,
    ...extra,
  });
}

/** Join/rejoin context for TEMP DEBUG_JOIN traces. */
function joinDebugContext(extra = {}) {
  const id = loadIdentity();
  return {
    t: new Date().toISOString(),
    username: id.username,
    uuid: id.uuid ? `${id.uuid.slice(0, 8)}…` : '',
    tableId,
    wantSeat,
    mySeat,
    joined,
    href: location.href,
    search: location.search,
    ssTable: sessionStorage.getItem(SS.table),
    ssSeat: sessionStorage.getItem(SS.seat),
    playerNames: playerNames.slice(),
    lastStep: lastState?.step,
    lastNext: lastState?.next,
    lastViewerSeat: lastState?.seat,
    ...extra,
  };
}

function dbgJoin(tag, extra = {}) {
  if (!DEBUG_JOIN) return;
  const payload = joinDebugContext(extra);
  console.warn(`[join-debug] ${tag}`, payload);
  // Also dump a one-line copy-friendly summary
  console.warn(
    `[join-debug] ${tag} :: table=${payload.tableId} wantSeat=${payload.wantSeat} mySeat=${payload.mySeat} joined=${payload.joined} user=${payload.username}`,
  );
}

function onServerEvent(ev) {
  const a = ev.action;
  if (DEBUG_JOIN && (a === 'err' || a === 'joined' || a === 'players' || a === 'state')) {
    dbgJoin(`← server ${a}`, {
      evAction: a,
      evErr: ev.err,
      evSeat: ev.seat,
      evTable: ev.table,
      evSeats: ev.seats,
      evStep: ev.step,
      evNext: ev.next,
    });
  }
  if (a === 'err') {
    if (ev.err === 'duplicate_login') {
      handleTakenOver();
      return;
    }
    const playReject = !!lastSentPlay; // play or offer we just sent
    dbgPlay('server err', {
      err: ev.err,
      sent: lastSentPlay || undefined,
      selected: lastSentPlay ? lastSentPlay.split(',') : undefined,
    });
    // Rejected play: drop pending history→face map only (hand suits never re-claimed).
    clearPending(histSuits);
    lastSentPlay = null;
    // Failed Prez offer / yoyo select: restore chrome
    if (localOfferCards.length || yoyoPick.length || exchPhase) {
      if (localOfferCards.length) localOfferCards = [];
      // Keep yoyoPick on reject so they can retry; re-enable Ack via render
      renderExchangeOverlays();
    }
    if (playReject) {
      rejectPlay(ev.err || 'rejected');
    } else {
      setStatus(`Error: ${ev.err}`);
    }
    renderHand();
    updatePlayButtons();
    if (
      DEBUG_JOIN &&
      (ev.err === 'seat_mismatch' ||
        ev.err === 'seat_taken' ||
        ev.err === 'not_invited' ||
        ev.err === 'not_started' ||
        ev.err === 'no_table' ||
        ev.err === 'bad_seat')
    ) {
      // TEMP: stay on play page so console + status remain copyable
      dbgJoin(`JOIN FAIL ${ev.err} (no auto-lobby redirect)`, {
        serverErr: ev.err,
        fullEvent: ev,
      });
      console.error(
        `[join-debug] JOIN FAIL ${ev.err} — not redirecting (DEBUG_JOIN).`,
        joinDebugContext({ fullEvent: ev }),
      );
      setStatus(
        `Error: ${ev.err} (DEBUG: staying — table=${tableId} wantSeat=${wantSeat} mySeat=${mySeat})`,
      );
      return;
    }
    if (
      ev.err === 'authenticate' ||
      ev.err === 'seat_mismatch' ||
      ev.err === 'seat_taken' ||
      ev.err === 'not_invited' ||
      ev.err === 'not_started' ||
      ev.err === 'no_table' ||
      ev.err === 'bad_seat'
    ) {
      // Session gone / bad seat memory — drop so lobby won't re-open a dead game.
      if (
        ev.err === 'not_started' ||
        ev.err === 'no_table' ||
        ev.err === 'seat_taken' ||
        ev.err === 'seat_mismatch' ||
        ev.err === 'bad_seat'
      ) {
        sessionStorage.removeItem(SS.table);
        sessionStorage.removeItem(SS.seat);
      }
      setTimeout(() => {
        if (!joined) goLobby();
      }, 2000);
    }
    return;
  }
  if (a === 'joined') {
    joined = true;
    takenOver = false;
    hideTakenOverBanner();
    mySeat = ev.seat;
    tableId = ev.table || tableId;
    if (ev.rank_pack != null) setTableRankPack(ev.rank_pack);
    sessionStorage.setItem(SS.table, tableId);
    sessionStorage.setItem(SS.seat, String(mySeat));
    dbgJoin('joined OK', { assignedSeat: mySeat, wantSeatWas: wantSeat });
    renderStrip();
    // During E4.4 seat-shift, status is "Seats rotating…"; avoid clobber mid-anim
    if (!animating) setStatus(`Joined seat ${mySeat}`);
    return;
  }
  if (a === 'players') {
    const newNames = ev.seats || [];
    // E4.4: only real finish→seat rotation (same names, new order). Leave/handoff
    // botify also broadcasts Players with same length — must not wipe summary.
    if (
      seatShiftPending &&
      drawDone &&
      preShiftNames.length &&
      !animating &&
      isNamePermutation(preShiftNames, newNames)
    ) {
      seatShiftPending = false;
      pausedSeats.clear(); // server clears pauses on next-hand rotate
      animateSeatRotate(preShiftNames, preShiftMySeat, newNames);
      return;
    }
    // Mid-summary leave/handoff: keep seatShiftPending for the real next-hand rotate;
    // refresh frozen baseline so later animation maps from current (botified) roster.
    if (seatShiftPending) {
      preShiftNames = newNames.slice();
    }
    playerNames = newNames;
    // Handoff / LeaveGame → bot name; drop matching pauses
    syncPausedWithNames(playerNames);
    renderStrip();
    if (!drawDone && !lastState) renderSeatsLobbyOrder(playerNames);
    else if (drawDone && !animating) renderSeatsFromState();
    // Summary board rows key off playerNames — re-paint bot label + votes
    if (
      gameOverSummaryOpen ||
      lastSummary ||
      (lastState && lastState.step >= STEP.SUMMARY)
    ) {
      renderHandOverBoard();
    }
    return;
  }
  if (a === 'seatdrawstatus') {
    renderSeatDrawTally(ev);
    return;
  }
  if (a === 'seatdrawresult') {
    const seats = ev.seats || [];
    playerNames = seats.slice();
    const me = loadIdentity().username;
    const idx = seats.findIndex((nm) => ukey(nm) === ukey(me));
    if (idx >= 0) mySeat = idx + 1;
    animateSeatDraw(seats);
    return;
  }
  if (a === 'exchangephase') {
    exchPhase = ev;
    // Clear optimistic locals that server now lists in the pile
    if (ev.president_offer) {
      const srv = new Set(parseHand(ev.president_offer));
      localOfferCards = localOfferCards.filter((t) => !srv.has(t));
    }
    if (ev.stage === 'await_president' && !parseHand(ev.president_offer || '').length) {
      localOfferCards = [];
      yoyoPick = [];
    }
    pruneYoyoPick();
    // Model only during seat theater; paint after ceremony
    if (seatCeremonyActive) {
      updatePlayButtons();
      return;
    }
    renderExchangeOverlays();
    renderHand(); // filter tribute / offer out of active hand
    renderTrick(); // Prez/Yoyo mid-radius exchange cues
    updatePlayButtons();
    setStatus(exchangeStatusText(ev));
    return;
  }
  if (a === 'prefs') {
    if (ev.prefs) cachePrefs(ev.prefs, loadIdentity().username);
    syncGearUi();
    renderHand();
    renderExchangeOverlays();
    return;
  }
  if (a === 'state') {
    applyState(ev);
    return;
  }
  if (a === 'waiton') {
    // Ignore wait-on once hand is over (stale next seat)
    if (lastState?.step >= STEP.SUMMARY) return;
    const who = (ev.who || []).map((s) => {
      const nm = playerNames[s - 1] || pausedSeats.get(+s) || `seat ${s}`;
      return nm;
    }).join(', ');
    if (ev.why === 'paused') {
      setStatus(`Waiting on ${who} (disconnected — robot take over?)`);
    } else {
      setStatus(`Waiting: ${who}${ev.why ? ` (${ev.why})` : ''}`);
    }
    return;
  }
  if (a === 'paused') {
    const seat = +ev.seat;
    if (seat >= 1) {
      pausedSeats.set(seat, ev.username || playerNames[seat - 1] || `seat ${seat}`);
      if (!animating) renderSeatsFromState();
    }
    setStatus(
      `${ev.username || 'Player'} disconnected (seat ${ev.seat}) — robot take over?`,
    );
    return;
  }
  if (a === 'resumed') {
    clearPausedSeat(+ev.seat);
    setStatus(`${ev.username || 'Player'} reconnected (seat ${ev.seat})`);
    return;
  }
  if (a === 'series') {
    // Post-join / catch-up session avgs (same shape as Summary.series)
    seriesStats = ev.series || {};
    renderStrip();
    if ($('panel-play-again')?.classList.contains('visible')) {
      renderHandOverBoard();
    }
    return;
  }
  if (a === 'summary') {
    const hadLive = !!(lastState && lastState.step < STEP.SUMMARY);
    lastState = lastState || {};
    lastState.step = STEP.SUMMARY;
    lastState.finish_order = ev.finish_order || [];
    lastSummary = {
      finish_order: ev.finish_order || [],
      pts: ev.pts || {},
      series: ev.series,
    };
    seriesStats = ev.series || seriesStats;
    // Freeze seating for E4.4 seat-shift after next-hand Players
    seatShiftPending = true;
    preShiftNames = playerNames.slice();
    preShiftMySeat = mySeat || 1;
    histViewIndex = -1; // default Last on next History open
    lastLoserReveal = null;
    ensureLoserReveal();
    renderStrip();
    setStatus('Game over');
    // Seed votes: humans waiting, bots auto-ready
    const seedReady = {};
    const seedWait = [];
    for (const n of playerNames) {
      if (!n) continue;
      if (isBotName(n)) seedReady[n] = true;
      else seedWait.push(n);
    }
    playAgainStatus = { ready: seedReady, waiting: seedWait };
    renderHandOverBoard();
    updateHistoryChrome(); // final trick still in lastState.history
    if (!animating) renderSeatsFromState();
    renderTrick();
    // Live end already started hold from State; rejoin skips hold
    if (!hadLive && !gameOverHoldActive) gameOverSkipHold = true;
    startGameOverHoldIfNeeded();
    if (gameOverSummaryOpen) renderHandOverBoard();
    return;
  }
  if (a === 'playagainstatus') {
    playAgainStatus = {
      ready: ev.ready || {},
      waiting: ev.waiting || [],
    };
    renderHandOverBoard();
    // During hold: board only; after skip/rejoin open summary if needed
    if (gameOverSummaryOpen) {
      showPlayAgainPanel(true);
      // Board height can change with votes — one re-dock against visible panel
      scheduleSummaryDockRefresh();
    } else if (gameOverSkipHold || !gameOverHoldActive) {
      startGameOverHoldIfNeeded();
    }
    return;
  }
  if (a === 'chat') {
    // optional: could log
    return;
  }
  if (a === 'shutdown') {
    // Dead session — do not rejoin this table/seat on next play page load.
    sessionStorage.removeItem(SS.table);
    sessionStorage.removeItem(SS.seat);
    setStatus('Session ended');
    setTimeout(goLobby, 1200);
  }
}

/** Play again / Leave vs waiting line after local yes vote. */
function updatePlayAgainFooter() {
  const me = loadIdentity().username;
  const amReady = !!(me && isPlayAgainReady(me));
  const actions = $('play-again-actions');
  const wait = $('play-again-waiting');
  if (actions) actions.hidden = amReady;
  if (wait) wait.hidden = !amReady;
}

// Muted "N games" on Game summary title (session hands completed; max across players).
function updateSummaryGamesLabel() {
  const el = $('summary-games');
  if (!el) return;
  const g = sessionGamesCompleted();
  if (g > 0) {
    el.hidden = false;
    el.textContent = `${g} game${g === 1 ? '' : 's'}`;
    el.title = 'Hands completed this session (players who joined mid-session may differ)';
  } else {
    el.hidden = true;
    el.textContent = '';
    el.removeAttribute('title');
  }
}

/** Hand-over board: next office order · old→new role · avg · Δ · vote. */
function renderHandOverBoard() {
  const board = $('finish-board');
  if (!board) return;
  updateSummaryGamesLabel();
  const order = lastSummary?.finish_order || lastState?.finish_order || [];
  const n = order.length || lastState?.n || playerNames.length || 0;
  const handPtsMap = lastSummary?.pts || {};
  const me = ukey(loadIdentity().username);
  // Header labels only on metric cols (tester: drop blank rank + "Player")
  const head = document.createElement('li');
  head.className = 'fin-head';
  head.setAttribute('aria-hidden', 'true');
  head.innerHTML =
    '<span class="fin-rank"></span>' +
    '<span class="fin-name"></span>' +
    '<span class="fin-avg" title="Session average (0–100)">Score</span>' +
    '<span class="fin-delta" title="Change in session average this hand">Δ</span>' +
    '<span class="fin-vote">Ready</span>';
  board.replaceChildren(
    head,
    ...order.map((seat, i) => {
      const nextRank = i + 1;
      const oldRank = +seat; // pre-rotate seat = this-hand office
      const name = playerNames[seat - 1] || `Seat ${seat}`;
      const isYou = !!(me && ukey(name) === me);
      const li = document.createElement('li');
      const cls = [];
      if (nextRank === 1) cls.push('fin-prez');
      else if (nextRank === 2) cls.push('fin-vp');
      if (isYou) cls.push('fin-you');
      if (cls.length) li.className = cls.join(' ');
      if (isYou) li.setAttribute('aria-current', 'true');
      const st = seriesStats && (seriesStats[name] || seriesStatsLookup(name));
      const avgStr = st ? score100(st.avg) : '—';
      const handPts = mapLookup(handPtsMap, name);
      // Delta baseline uses old seat office (start of hand).
      const delta = formatDeltaAvg(deltaAvg100(handPts, st, n, oldRank), {
        arrowOnly: isBotName(name),
      });
      const ok = isPlayAgainReady(name);
      const voteCls = ok ? 'ready' : 'wait';
      const voteTxt = ok ? '✓ ready' : 'waiting…';
      const youChip = isYou
        ? '<span class="fin-you-chip" title="You"><span class="fin-you-caret" aria-hidden="true"></span>you</span>'
        : '';
      li.innerHTML =
        `<span class="fin-rank">${nextRank}</span>` +
        `<span class="fin-name"><span class="fin-name-line">${escapeHtml(name)}${youChip}</span>` +
        `<span class="fin-role">${roleTransitionHtml(n, oldRank, nextRank)}</span></span>` +
        `<span class="fin-avg">${avgStr}</span>` +
        `<span class="fin-delta ${delta.cls}">${delta.text}</span>` +
        `<span class="fin-vote ${voteCls}">${voteTxt}</span>`;
      return li;
    }),
  );
  updatePlayAgainFooter();
}

function connect() {
  const id = loadIdentity();
  dbgJoin('connect()', { hasUser: !!id.username, hasUuid: !!id.uuid });
  if (!id.username || !id.uuid) {
    setStatus('Not signed in — return to lobby');
    setTimeout(goLobby, 1500);
    return;
  }
  if (!tableId) {
    setStatus('No table — return to lobby');
    setTimeout(goLobby, 1500);
    return;
  }
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    dbgJoin('connect() skipped — socket already open/connecting');
    return;
  }
  intentionalClose = false;
  takenOver = false;
  clearReconnect();
  setStatus('Connecting to game…');
  try {
    ws = new WebSocket(GAME_WS);
  } catch (e) {
    setStatus(String(e));
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    setStatus('Logging in…');
    dbgJoin('ws open → login', { gameWs: GAME_WS });
    send({
      action: 'login',
      username: id.username,
      email: id.email || '',
      uuid: id.uuid,
    });
    // Join immediately after login (server expects sequential; login is first message then join)
    // Small delay so login is processed first
    setTimeout(() => {
      const joinMsg = { action: 'joinseat', table: tableId, seat: wantSeat };
      dbgJoin('→ sending joinseat', { joinMsg });
      console.warn('[join-debug] OUTBOUND', JSON.stringify(joinMsg));
      send(joinMsg);
      setStatus(`Joining seat ${wantSeat}…`);
    }, 50);
  };

  ws.onmessage = (e) => {
    let ev;
    try {
      ev = JSON.parse(e.data);
    } catch {
      return;
    }
    if (DEBUG_JOIN) {
      const act = ev?.action;
      if (act === 'err' || act === 'joined' || act === 'players') {
        console.warn('[join-debug] INBOUND raw', e.data);
      }
    }
    onServerEvent(ev);
  };

  ws.onclose = () => {
    dbgJoin('ws close', { intentionalClose, takenOver, wasJoined: joined });
    ws = null;
    joined = false;
    if (intentionalClose) return;
    if (takenOver) {
      setStatus('Signed in on another device');
      showTakenOverBanner();
      return;
    }
    setStatus('Disconnected — reconnecting…');
    scheduleReconnect();
  };
}

function scheduleReconnect() {
  if (reconnectTimer || takenOver) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!takenOver) connect();
  }, 1500);
}

function syncGearUi() {
  const sort = handSort();
  const desc = $('gear-hand-desc');
  const asc = $('gear-hand-asc');
  if (desc) desc.checked = sort === 'desc';
  if (asc) asc.checked = sort === 'asc';
}

// Hand sort toggle: keep park membership; re-order faces inside free + each bay.
function setHandSortFromGear(sort) {
  if (!applyHandSortLocal(sort)) {
    syncGearUi();
    return;
  }
  syncGearUi();
  send({ action: 'setprefs', prefs: { hand_sort: sort === 'asc' ? 'asc' : 'desc' } });
  // parkedSeqs tokens unchanged — renderHand only reorders display within clusters
  renderExchangeOverlays(); // hand-row high-end order
  renderHand();
  renderTrick();
  if (!$('history-pop')?.hidden) renderHistoryPopover();
}

function wireControls() {
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.addEventListener('resize', () => {
    layoutExchangeFloats();
    layoutPlayActions();
    renderSetChips();
    refreshSummaryDockIfNeeded();
  });
  // Clear any residual selection so it can't steal the first drag gesture
  const clearPageSel = () => {
    const s = window.getSelection?.();
    if (s && !s.isCollapsed) s.removeAllRanges();
  };
  $('hand-wrap')?.addEventListener('pointerdown', clearPageSel, { capture: true });
  $('table-area')?.addEventListener('pointerdown', clearPageSel, { capture: true });
  // Empty click on felt or hand bar clears selection
  $('table-area')?.addEventListener('click', onEmptySelectionClick);
  $('hand-bar')?.addEventListener('click', onEmptySelectionClick);

  const gearBtn = $('btn-gear');
  const gearMenu = $('gear-menu');
  gearBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!gearMenu) return;
    const open = gearMenu.hidden;
    if (open) {
      setStandingsOpen(false);
      setHistoryOpen(false);
      syncGearUi();
      gearMenu.hidden = false;
      gearBtn.setAttribute('aria-expanded', 'true');
    } else {
      gearMenu.hidden = true;
      gearBtn.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('click', (e) => {
    const wrap = $('gear-wrap');
    if (wrap && !wrap.contains(e.target) && gearMenu) {
      gearMenu.hidden = true;
      gearBtn?.setAttribute('aria-expanded', 'false');
    }
  });
  $('gear-hand-desc')?.addEventListener('change', () => {
    if ($('gear-hand-desc').checked) setHandSortFromGear('desc'); // High → Low
  });
  $('gear-hand-asc')?.addEventListener('change', () => {
    if ($('gear-hand-asc').checked) setHandSortFromGear('asc'); // Low → High
  });

  $('btn-play').addEventListener('click', () => {
    trySubmitPlay(canPresidentOffer() ? 'ex-right' : 'table');
  });

  $('btn-exchange-ack')?.addEventListener('click', () => {
    if (!yoyoAckEnabled()) return;
    sendYoyoResolve();
  });

  $('btn-pass').addEventListener('click', () => {
    if (!lastState || lastState.step !== STEP.PLAY || lastState.next !== mySeat) {
      setStatus('Illegal: pass only when responding');
      return;
    }
    send({ action: 'pass' });
    selected.clear();
    renderHand();
  });

  $('btn-seat-ready').addEventListener('click', () => {
    send({ action: 'seatdrawready' });
    const btn = $('btn-seat-ready');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Waiting…';
    }
  });

  $('btn-game-summary')?.addEventListener('click', () => {
    openGameSummary();
  });

  $('btn-play-again').addEventListener('click', () => {
    send({ action: 'playagain', yes: true });
    // Optimistic: swap buttons for waiting line before PlayAgainStatus
    const me = loadIdentity().username;
    if (me) {
      playAgainStatus = {
        ready: { ...(playAgainStatus.ready || {}), [me]: true },
        waiting: (playAgainStatus.waiting || []).filter((n) => ukey(n) !== ukey(me)),
      };
    }
    renderHandOverBoard();
  });

  const leave = () => {
    intentionalClose = true;
    seatCeremonyGen += 1;
    seatCeremonyActive = false;
    cancelGameOverHold();
    gameOverSkipHold = false;
    gameOverSummaryOpen = false;
    lastSummary = null;
    seatShiftPending = false;
    pausedSeats.clear();
    setHistoryOpen(false);
    setStandingsOpen(false);
    dbgJoin('→ leavegame (intentional)', {
      note: 'After lobby Join on a bot seat, watch for SEAT_MISMATCH on play page',
    });
    console.warn('[join-debug] OUTBOUND', JSON.stringify({ action: 'leavegame' }));
    send({ action: 'leavegame' });
    setTimeout(goLobby, 150);
  };
  $('btn-leave').addEventListener('click', leave);
  $('btn-leave-end').addEventListener('click', leave);

  $('btn-scores')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const pop = $('standings-pop');
    if (!pop) return;
    if (!pop.hidden) {
      setStandingsOpen(false);
      return;
    }
    // Close gear if open
    const gearMenu = $('gear-menu');
    if (gearMenu) {
      gearMenu.hidden = true;
      $('btn-gear')?.setAttribute('aria-expanded', 'false');
    }
    setStandingsOpen(true);
  });
  $('btn-scores-close')?.addEventListener('click', (e) => {
    e.stopPropagation();
    setStandingsOpen(false);
  });

  $('btn-history')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const pop = $('history-pop');
    const btn = $('btn-history');
    if (!pop || !btn || btn.disabled) return;
    if (!pop.hidden) {
      setHistoryOpen(false);
      return;
    }
    const { count } = historyMeta();
    histViewIndex = count > 0 ? count - 1 : -1;
    histPinnedToLast = true;
    renderHistoryPopover();
    setHistoryOpen(true);
  });
  $('btn-history-close')?.addEventListener('click', (e) => {
    e.stopPropagation();
    setHistoryOpen(false);
  });
  $('btn-hist-prev')?.addEventListener('click', (e) => {
    e.stopPropagation();
    stepHistory(-1);
  });
  $('btn-hist-next')?.addEventListener('click', (e) => {
    e.stopPropagation();
    stepHistory(1);
  });
  document.addEventListener('click', (e) => {
    const histWrap = document.querySelector('.history-wrap') || document.querySelector('.last-trick-wrap');
    const histPop = $('history-pop');
    if (histPop && !histPop.hidden && histWrap && !histWrap.contains(e.target)) {
      setHistoryOpen(false);
    }
    const stWrap = document.querySelector('.standings-wrap');
    const stPop = $('standings-pop');
    if (stPop && !stPop.hidden && stWrap && !stWrap.contains(e.target)) {
      setStandingsOpen(false);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      setHistoryOpen(false);
      setStandingsOpen(false);
    }
    const pop = $('history-pop');
    if (!pop || pop.hidden) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      stepHistory(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      stepHistory(1);
    }
  });
}

function main() {
  if (DEBUG_JOIN) {
    console.warn(
      '%c[join-debug] ENABLED — seat_mismatch will NOT redirect. Preserve log recommended.',
      'color:#c9a227;font-weight:bold',
    );
    dbgJoin('page load / main()');
  }
  renderStrip();
  setStatus('Starting…');
  showSeatDrawPanel(false);
  showPlayAgainPanel(false);
  cancelGameOverHold();
  wireControls();
  connect();
}

main();
