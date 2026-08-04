// Client helpers for compact State.legal + hand unit selection.
import { parseWireCard } from './historySuits.js';
import { parseHand } from './cards.js';
import { OPT, hasOpt } from './opts.js';
import { handSort } from './config.js';

// President offer: 1 or 2 from legal kind "offer" cards "*" / "*,*".
export function offerCount(legal) {
  const o = (legal || []).find((l) => l.kind === 'offer');
  if (!o) return 0;
  if (o.cards === '*,*' || o.size === 2) return 2;
  return 1;
}

// Group hand wire tokens by rank (desc rank order).
export function handByRank(handTokens) {
  /** @type {Map<number, string[]>} */
  const m = new Map();
  for (const t of handTokens || []) {
    const c = parseWireCard(t);
    if (!c || c.joker) continue;
    if (!m.has(c.rank)) m.set(c.rank, []);
    m.get(c.rank).push(t);
  }
  return m;
}

export function jokersInHand(handTokens) {
  return (handTokens || []).filter((t) => {
    const c = parseWireCard(t);
    return c && c.joker;
  });
}

// Lead sizes that can be formed from hand / legal (1–5).
export function availableLeadSizes(legal, handTokens) {
  const sizes = new Set();
  const hand = handTokens || [];
  if (!hand.length) return sizes;
  sizes.add(1); // "*" singles
  const byR = handByRank(hand);
  for (const toks of byR.values()) {
    for (let s = 2; s <= Math.min(4, toks.length); s++) sizes.add(s);
  }
  if (jokersInHand(hand).length) sizes.add(1);
  // seq5 from legal enumerations or hand scan
  for (const l of legal || []) {
    if (l.kind === 'seq' || l.size === 5) sizes.add(5);
  }
  if (!sizes.has(5) && hand.length >= 5) {
    // optimistic: allow chip if 5+ cards (server validates)
    const ranks = [...byR.keys()].sort((a, b) => b - a);
    for (const hi of ranks) {
      if (hi < 5) continue;
      let ok = true;
      for (let r = hi; r > hi - 5; r--) {
        if (!byR.has(r) || !byR.get(r).length) {
          ok = false;
          break;
        }
      }
      if (ok) {
        sizes.add(5);
        break;
      }
    }
  }
  return sizes;
}

// Highest set of exact size (wire tokens), or null.
export function highestSet(handTokens, size) {
  if (size < 1 || size > 4) return null;
  const byR = handByRank(handTokens);
  const ranks = [...byR.keys()].sort((a, b) => b - a);
  for (const r of ranks) {
    const toks = byR.get(r);
    if (toks && toks.length >= size) {
      // Prefer end of block (matches server rightmost convention)
      return toks.slice(toks.length - size);
    }
  }
  return null;
}

// First seq5 from legal list (enumerated cards), else best from hand.
export function pickSeq5(legal, handTokens) {
  for (const l of legal || []) {
    if (l.kind === 'seq' && l.cards) {
      const parts = parseHand(l.cards);
      if (parts.length === 5) return parts;
    }
  }
  // Build from hand: smallest high that forms 5 consecutive ranks
  const byR = handByRank(handTokens);
  const highs = [...byR.keys()].filter((r) => r >= 5).sort((a, b) => a - b);
  for (const hi of highs) {
    const picked = [];
    let ok = true;
    for (let r = hi; r > hi - 5; r--) {
      const toks = byR.get(r);
      if (!toks || !toks.length) {
        ok = false;
        break;
      }
      picked.push(toks[toks.length - 1]);
    }
    if (ok) return picked;
  }
  return null;
}

// Auto-select unit for lead size chip.
export function autoSelectForSize(handTokens, size, legal) {
  if (size === 5) return pickSeq5(legal, handTokens);
  if (size === 1) {
    // Prefer highest non-joker single; joker via explicit click
    const set = highestSet(handTokens, 1);
    return set;
  }
  return highestSet(handTokens, size);
}

// Response: locked size from lead history or compact legal (wire has no size field).
export function responseLockedSize(legal, leadSizeFromHist) {
  if (leadSizeFromHist > 0) return leadSizeFromHist;
  for (const l of legal || []) {
    if (l.kind === 'pass' || l.kind === 'joker' || l.kind === 'offer') continue;
    if (l.kind === 'seq') return 5;
    if (l.kind === 'set') {
      const c = l.cards || '';
      if (c === '*' || c.startsWith('>=')) return 1;
      const n = parseHand(c).length;
      if (n >= 1 && n <= 5) return n;
    }
    if (l.size >= 1 && l.size <= 5) return l.size;
  }
  return 0;
}

// Hand-order anchor among `tokens`; optional preferRank; fromEnd = rightmost.
function anchorInHand(handTokens, tokens, preferRank = null, fromEnd = false) {
  let best = null;
  let bestIdx = fromEnd ? -1 : Infinity;
  for (const t of tokens) {
    if (preferRank != null) {
      const c = parseWireCard(t);
      if (!c || c.joker || c.rank !== preferRank) continue;
    }
    const idx = handTokens.indexOf(t);
    if (idx < 0) continue;
    if (fromEnd ? idx > bestIdx : idx < bestIdx) {
      bestIdx = idx;
      best = t;
    }
  }
  if (best) return best;
  return tokens[fromEnd ? tokens.length - 1 : 0] || '';
}

// Hand-order tokens with reserved (e.g. parked seq) last — surplus sets avoid parks.
function orderPreferFree(toks, reserved) {
  if (!reserved?.size) return toks || [];
  const free = [];
  const res = [];
  for (const t of toks || []) {
    if (reserved.has(t)) res.push(t);
    else free.push(t);
  }
  return free.concat(res);
}

/**
 * Lead multi-card units: pairs/triples/quads + seq5 (if opts allow).
 * No jokers. Sets: only free (non-reserved) faces of a rank.
 * Seq5: free-only path, or fully reserved (park bay); never mix free+parked.
 * Set chips cascade across the free rank block (largest on primary end);
 * tokens always the primary-end faces. Seq5 anchor → high.
 * @param {Iterable<string>|null} [reservedTokens] parked/reserved wire tokens
 * @returns {{ id: string, size: number, rank: number, tokens: string[], anchorToken: string, kind?: string }[]}
 */
export function enumerateLeadSetUnits(handTokens, opts = 0, reservedTokens = null) {
  const hand = handTokens || [];
  const reserved =
    reservedTokens instanceof Set
      ? reservedTokens
      : new Set(reservedTokens || []);
  const byR = handByRank(hand);
  const rankOrder = [];
  const seen = new Set();
  for (const t of hand) {
    const c = parseWireCard(t);
    if (!c || c.joker) continue;
    if (!seen.has(c.rank)) {
      seen.add(c.rank);
      rankOrder.push(c.rank);
    }
  }
  // L→H: primary on right of rank block; H→L: primary on left
  const setFromEnd = handSort() === 'asc';
  const units = [];
  for (const rank of rankOrder) {
    const toks = byR.get(rank) || [];
    // Sets only from free surplus — parked faces stay committed to seq bays
    const free = toks.filter((t) => !reserved.has(t));
    const n = free.length;
    if (n < 2) continue;
    const maxSet = Math.min(4, n);
    const primaryIdx = setFromEnd ? n - 1 : 0;
    const step = setFromEnd ? -1 : 1;
    for (let size = 2; size <= maxSet; size++) {
      // Play selection: always the size faces at the primary end
      const tokens = setFromEnd ? free.slice(n - size) : free.slice(0, size);
      // Chip sits on the rank runway: largest on primary, smaller on next cards
      const chipIdx = primaryIdx + (maxSet - size) * step;
      units.push({
        id: `${rank}-${size}`,
        size,
        rank,
        kind: 'set',
        tokens,
        anchorToken: free[chipIdx],
      });
    }
  }
  // Seq5: free-only path, or fully reserved (park bay). Never mix — borrowing
  // parked faces for a free-row 5-chip would break the bay (same rule as sets).
  if (hasOpt(opts, OPT.SEQ5)) {
    const highs = [...byR.keys()].filter((r) => r >= 5).sort((a, b) => b - a);
    for (const hi of highs) {
      const freePicked = [];
      let freeOk = true;
      for (let r = hi; r > hi - 5; r--) {
        const toks = byR.get(r) || [];
        const freeT = toks.find((t) => !reserved.has(t));
        if (!freeT) {
          freeOk = false;
          break;
        }
        freePicked.push(freeT);
      }
      if (freeOk) {
        units.push({
          id: `seq5-${hi}`,
          size: 5,
          rank: hi,
          kind: 'seq',
          tokens: freePicked,
          anchorToken: freePicked[0], // high end
        });
        continue;
      }
      // Park-aligned: every rank has a reserved face (whole path in bays)
      const resPicked = [];
      let resOk = true;
      for (let r = hi; r > hi - 5; r--) {
        const toks = byR.get(r) || [];
        const resT = toks.find((t) => reserved.has(t));
        if (!resT) {
          resOk = false;
          break;
        }
        resPicked.push(resT);
      }
      if (!resOk) continue;
      units.push({
        id: `seq5-${hi}`,
        size: 5,
        rank: hi,
        kind: 'seq',
        tokens: resPicked,
        anchorToken: resPicked[0],
      });
    }
  }
  return units;
}

// Remap a same-rank set onto free faces when surplus allows (keep parks intact).
function remapSetPreferFree(handTokens, toks, reserved) {
  if (!reserved?.size || !toks?.length) return toks;
  const parsed = toks.map((t) => parseWireCard(t));
  if (parsed.some((c) => !c || c.joker)) return toks;
  const rank = parsed[0].rank;
  if (parsed.some((c) => c.rank !== rank)) return toks; // not a pure set
  const free = [];
  for (const t of handTokens || []) {
    if (reserved.has(t)) continue;
    const c = parseWireCard(t);
    if (c && !c.joker && c.rank === rank) free.push(t);
  }
  if (free.length >= toks.length) return free.slice(0, toks.length);
  // Not enough free — free first, then reserved of that rank
  const ordered = orderPreferFree(
    (handTokens || []).filter((t) => {
      const c = parseWireCard(t);
      return c && !c.joker && c.rank === rank;
    }),
    reserved,
  );
  return ordered.slice(0, toks.length);
}

/**
 * Response multi-card units from State.legal (enumerated sets/seqs only).
 * Skips pass, joker, and compact singles ("*" / ">=N"). Exact wire tokens.
 * Sets remap onto free faces when reservedTokens (park) leaves enough surplus.
 */
export function enumerateResponseSetUnits(handTokens, legal, reservedTokens = null) {
  const hand = handTokens || [];
  const handSet = new Set(hand);
  const reserved =
    reservedTokens instanceof Set
      ? reservedTokens
      : new Set(reservedTokens || []);
  const setFromEnd = handSort() === 'asc';
  const units = [];
  const seen = new Set();
  for (const l of legal || []) {
    if (l.kind === 'pass' || l.kind === 'joker' || l.kind === 'offer' || l.kind === 'ack') {
      continue;
    }
    const cards = l.cards || '';
    if (!cards || cards === '*' || cards.startsWith('>=') || cards.includes('*')) continue;
    let toks = parseHand(cards);
    if (toks.length < 2) continue;
    if (!toks.every((t) => handSet.has(t))) continue;
    const isSeq = l.kind === 'seq' || toks.length === 5;
    if (!isSeq && reserved.size) toks = remapSetPreferFree(hand, toks, reserved);
    const key = [...toks].sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    let hiRank = 0;
    for (const t of toks) {
      const c = parseWireCard(t);
      if (c && !c.joker && c.rank > hiRank) hiRank = c.rank;
    }
    units.push({
      id: `r-${key}`,
      size: toks.length,
      rank: hiRank,
      kind: isSeq ? 'seq' : 'set',
      tokens: toks,
      // Seq: high rank (left in H→L, right in L→H). Sets: sort-aware end of unit.
      anchorToken: isSeq
        ? anchorInHand(hand, toks, hiRank, false)
        : anchorInHand(hand, toks, null, setFromEnd),
    });
  }
  return units;
}

// Lead or response multi-card set chips (step 2=LEAD, 3=PLAY).
export function enumerateSetUnits(
  handTokens,
  { step, opts = 0, legal = [], reservedTokens = null } = {},
) {
  if (step === 2) return enumerateLeadSetUnits(handTokens, opts, reservedTokens);
  if (step === 3) return enumerateResponseSetUnits(handTokens, legal, reservedTokens);
  return [];
}

/**
 * Expand compact State.legal against the viewer's hand for a response turn.
 *
 * Wire forms (Phase D / TASK Q3):
 *   - singles: `{ kind: "set", cards: ">=N" }` (threshold; not enumerated)
 *   - pairs+: enumerated faces (one fixed subset per rank)
 *   - seq5: enumerated faces
 *   - joker / pass as separate kinds
 *
 * Live cards = may appear in some legal response unit. For multi-card sets,
 * every hand card of a playable rank is live (not only the server's fixed
 * subset), so surplus cards of that rank stay selectable.
 *
 * @returns {{ passOnly: boolean, live: Set<string> }}
 */
export function responseEligibility(handTokens, legal) {
  const hand = handTokens || [];
  const list = legal || [];
  /** @type {Set<number>} ranks usable in some multi-card response */
  const liveRanks = new Set();
  let minSingle = null; // from ">=N"
  let jokerLive = false;
  let hasPass = false;

  for (const l of list) {
    if (l.kind === 'pass') {
      hasPass = true;
      continue;
    }
    if (l.kind === 'ack' || l.kind === 'offer') continue;
    if (l.kind === 'joker') {
      jokerLive = true;
      continue;
    }
    const cards = l.cards || '';
    if (cards.startsWith('>=')) {
      const n = parseInt(cards.slice(2), 10);
      if (!Number.isNaN(n)) minSingle = n;
      continue;
    }
    if (!cards || cards === '*' || cards.includes('*')) continue;
    const toks = parseHand(cards);
    if (!toks.length) continue;
    for (const t of toks) {
      const c = parseWireCard(t);
      if (c && !c.joker) liveRanks.add(c.rank);
    }
  }

  /** @type {Set<string>} */
  const live = new Set();
  for (const t of hand) {
    const c = parseWireCard(t);
    if (!c) continue;
    if (c.joker) {
      if (jokerLive) live.add(t);
      continue;
    }
    if (minSingle != null && c.rank >= minSingle) {
      live.add(t);
      continue;
    }
    if (liveRanks.has(c.rank)) live.add(t);
  }

  // passOnly when nothing in hand can form a response (even if legal still
  // lists optimistic ">=N" with no matching cards).
  const passOnly = live.size === 0 && (hasPass || list.length > 0);
  return { passOnly, live };
}
