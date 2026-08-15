// Client-only invented suits for history ranks (server sends rank, not suit).
// used[1..13] = 4-bit masks: bit0=C, bit1=D, bit2=H, bit3=S.
// faces[i] parallel to history entries: "H9" / "JK" (stable for the hand).
//
// used[] is rebuilt from faces + pending + current hand before each allocation.
// Never keep permanent OR-marks from cards that left the hand (exchange/play)
// without appearing in faces — that caused false "no free suit" after exchange.

const SUITS = ['C', 'D', 'H', 'S']; // allocation order
const SUIT_BIT = { C: 1, D: 2, H: 4, S: 8 };

/** @typedef {{ used: Uint8Array, faces: string[], pending: string[], errors: string[], handGen: number }} HistorySuits */

function maskStr(m) {
  return SUITS.filter((s) => m & SUIT_BIT[s]).join('') || '-';
}

// New empty tracker for one hand.
export function createHistorySuits() {
  return {
    used: new Uint8Array(14), // index by rank 1..13
    faces: [],
    pending: [], // faces for outbound plays not yet in server history
    errors: [],
    handGen: 0,
  };
}

export function clearHistorySuits(hs) {
  hs.used.fill(0);
  hs.faces.length = 0;
  hs.pending.length = 0;
  hs.errors.length = 0;
  hs.handGen += 1;
}

function markSuit(hs, rank, suit) {
  if (rank < 1 || rank > 13) return;
  const bit = SUIT_BIT[suit];
  if (!bit) return;
  hs.used[rank] |= bit;
}

function markFaceToken(hs, face) {
  if (!face || face === 'JK' || face.startsWith('!')) return;
  const c = parseWireCard(face);
  if (c && !c.joker) markSuit(hs, c.rank, c.suit);
}

function isUsed(hs, rank, suit) {
  const bit = SUIT_BIT[suit];
  return !!(hs.used[rank] & bit);
}

// Parse wire token → { rank, suit } | { joker: true } | null.
export function parseWireCard(token) {
  if (!token) return null;
  const t = String(token).trim().toUpperCase().replace(/#\d+$/, '');
  if (t === 'JK' || t === 'JOKER') return { joker: true };
  const m = t.match(/^([CDHS])(\d{1,2})$/);
  if (!m) return null;
  const rank = +m[2];
  if (rank < 1 || rank > 13) return null;
  return { suit: m[1], rank };
}

// History entry: "*2:9" → { starter, seat, rank|joker }.
export function parseHistoryEntry(part) {
  const raw = String(part).trim();
  if (!raw) return null;
  const starter = raw.startsWith('*');
  const body = starter ? raw.slice(1) : raw;
  const m = body.match(/^(\d+):(.+)$/);
  if (!m) return null;
  const seat = +m[1];
  const card = m[2].toUpperCase();
  if (card === 'JK' || card === 'JOKER') {
    return { starter, seat, joker: true, rank: 14 };
  }
  const rank = +card;
  if (!(rank >= 1 && rank <= 13)) return null;
  return { starter, seat, joker: false, rank };
}

export function parseHistoryString(hist) {
  if (!hist) return [];
  return String(hist)
    .split(',')
    .map((p) => parseHistoryEntry(p))
    .filter(Boolean);
}

// Rebuild used[] from committed faces + pending + live hand only.
// Drops phantom marks for cards given away in exchange or played without face commit.
export function rebuildUsed(hs, handTokens) {
  hs.used.fill(0);
  for (const f of hs.faces) markFaceToken(hs, f);
  for (const f of hs.pending) markFaceToken(hs, f);
  for (const t of handTokens || []) {
    const c = parseWireCard(t);
    if (!c || c.joker) continue;
    markSuit(hs, c.rank, c.suit);
  }
}

// Seed helper kept for API; prefers rebuildUsed with current hand.
export function seedFromHand(hs, handTokens) {
  rebuildUsed(hs, handTokens);
}

// Allocate a free suit for rank; on exhaustion = bug → console.error + '!r' fallback.
function allocateFace(hs, rank, why = 'hist') {
  if (rank === 14 || rank === 'JK') return 'JK';
  const r = rank | 0;
  for (const s of SUITS) {
    if (!isUsed(hs, r, s)) {
      markSuit(hs, r, s);
      return `${s}${r}`;
    }
  }
  const facesOfRank = hs.faces.filter((f) => {
    if (f === 'JK' || f.startsWith('!')) return false;
    const pc = parseWireCard(f);
    return pc && !pc.joker && pc.rank === r;
  });
  const msg = `no free suit r${r} used=${maskStr(hs.used[r])} faces=[${facesOfRank.join(',')}] pending=[${hs.pending.join(',')}] why=${why}`;
  hs.errors.push(msg);
  console.error('[suits] exhaustion (bug)', msg);
  return `!${r}`;
}

// Invent faces for remaining ranks (high→low); does not append to hs.faces.
// Restores used[] from history faces + handTokens after alloc.
export function inventRemainingFaces(hs, remCounts, jokers, handTokens = []) {
  rebuildUsed(hs, handTokens);
  const out = [];
  const jk = jokers | 0;
  for (let i = 0; i < jk; i++) {
    out.push(allocateFace(hs, 14, 'loser-rem'));
  }
  for (let r = 13; r >= 1; r--) {
    const n = (remCounts && remCounts[r]) | 0;
    for (let k = 0; k < n; k++) {
      out.push(allocateFace(hs, r, 'loser-rem'));
    }
  }
  rebuildUsed(hs, handTokens); // drop temporary remaining marks
  return out;
}

// Queue exact wire faces for an outbound play from the local hand (call before send).
// Only pending map — suits already covered by rebuild(hand) while cards still held.
export function claimPlay(hs, wireCards) {
  const claimed = [];
  for (const t of wireCards || []) {
    const c = parseWireCard(t);
    if (!c) continue;
    if (c.joker) {
      claimed.push('JK');
      hs.pending.push('JK');
      continue;
    }
    const face = `${c.suit}${c.rank}`;
    claimed.push(face);
    hs.pending.push(face);
  }
  return claimed;
}

// Sync faces[] to server history. handTokens required so used[] can drop exchanged cards.
export function syncHistory(hs, historyString, handTokens = []) {
  const entries = parseHistoryString(historyString);
  if (entries.length === 0) {
    if (hs.faces.length || hs.pending.length) {
      hs.faces.length = 0;
      hs.pending.length = 0;
    }
    rebuildUsed(hs, handTokens);
    return hs.faces;
  }

  if (entries.length < hs.faces.length) {
    hs.faces.length = entries.length;
  }

  while (hs.faces.length < entries.length) {
    // Drop marks for cards no longer in hand and not yet in faces (e.g. exchanged away).
    rebuildUsed(hs, handTokens);

    const i = hs.faces.length;
    const e = entries[i];
    if (e.joker) {
      const pi = hs.pending.findIndex((f) => f === 'JK');
      if (pi >= 0) {
        hs.faces.push(hs.pending.splice(pi, 1)[0]);
      } else {
        hs.faces.push('JK');
      }
      continue;
    }
    const pi = hs.pending.findIndex((f) => {
      if (f === 'JK' || f.startsWith('!')) return false;
      const pc = parseWireCard(f);
      return pc && !pc.joker && pc.rank === e.rank;
    });
    if (pi >= 0) {
      hs.faces.push(hs.pending.splice(pi, 1)[0]);
      continue;
    }
    hs.faces.push(allocateFace(hs, e.rank, `hist@${i} seat${e.seat}`));
  }
  rebuildUsed(hs, handTokens);
  return hs.faces;
}

export function hasSuitErrors(hs) {
  return hs.errors.length > 0;
}

export function takeSuitErrors(hs) {
  const e = hs.errors.slice();
  hs.errors.length = 0;
  return e;
}

export function displayFace(face) {
  if (!face) return null;
  if (face === 'JK') return 'JK';
  if (face.startsWith('!')) {
    return { wire: `S${face.slice(1)}`, error: true, title: `SUIT BUG rank ${face.slice(1)}` };
  }
  return { wire: face, error: false, title: face };
}

// Snapshot masks for error dump (compact).
export function dumpUsed(hs) {
  const parts = [];
  for (let r = 1; r <= 13; r++) {
    if (hs.used[r]) parts.push(`${r}:${maskStr(hs.used[r])}`);
  }
  return parts.join(' ') || '(empty)';
}

// After a rejected local play: drop pending history map only.
export function clearPending(hs) {
  if (!hs.pending.length) return;
  hs.pending.length = 0;
}
