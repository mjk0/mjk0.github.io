// Reconstruct last-place remaining ranks from deal multiset − history (client-only).
// Suits invented via historySuits (same as all opponent faces). No server hand field.

import { OPT, hasOpt } from './opts.js';
import { parseHistoryString, inventRemainingFaces } from './historySuits.js';

// Mirror server deal_cards: jokers first, then rank 13→1 × up to 4 suits.
export function buildDealRankMultiset(n, hl, jokersOn) {
  let rem = (n | 0) * (hl | 0);
  const counts = new Array(14).fill(0); // index by rank 1..13
  let jokers = 0;
  if (jokersOn && rem > 0) {
    jokers = Math.min(2, rem);
    rem -= jokers;
  }
  for (let r = 13; r >= 1 && rem > 0; r--) {
    for (let s = 0; s < 4 && rem > 0; s++) {
      counts[r]++;
      rem--;
    }
  }
  return { counts, jokers, size: (n | 0) * (hl | 0) };
}

// Count ranks played in history string.
export function countPlayedRanks(historyStr) {
  const counts = new Array(14).fill(0);
  let jokers = 0;
  let entries = 0;
  for (const e of parseHistoryString(historyStr)) {
    entries++;
    if (e.joker) jokers++;
    else if (e.rank >= 1 && e.rank <= 13) counts[e.rank]++;
  }
  return { counts, jokers, entries };
}

// deal − played; null if underflow (bug).
export function remainingFromDeal(deal, played) {
  const counts = new Array(14).fill(0);
  for (let r = 1; r <= 13; r++) {
    const c = deal.counts[r] - played.counts[r];
    if (c < 0) {
      console.error('[loserHand] rank underflow', r, {
        deal: deal.counts[r],
        played: played.counts[r],
      });
      return null;
    }
    counts[r] = c;
  }
  const jokers = deal.jokers - played.jokers;
  if (jokers < 0) {
    console.error('[loserHand] joker underflow', {
      deal: deal.jokers,
      played: played.jokers,
    });
    return null;
  }
  let sum = jokers;
  for (let r = 1; r <= 13; r++) sum += counts[r];
  return { counts, jokers, sum };
}

/**
 * @param {object} state last State (n, hl, opts, history, remaining, finish_order)
 * @param {import('./historySuits.js').HistorySuits} histSuits
 * @param {string[]} [handTokens] viewer hand (usually empty at hand end)
 * @returns {{ seat: number, faces: string[] }|null}
 */
export function reconstructLoserHand(state, histSuits, handTokens = []) {
  if (!state || !histSuits) return null;
  const order = state.finish_order || [];
  if (!order.length) return null;
  const loserSeat = +order[order.length - 1];
  if (!(loserSeat >= 1)) return null;

  const remArr = state.remaining || [];
  const expected = remArr[loserSeat - 1] | 0;
  if (expected <= 0) return null;

  const n = state.n | 0;
  const hl = state.hl | 0;
  if (n < 1 || hl < 1) {
    console.error('[loserHand] bad n/hl', { n, hl });
    return null;
  }

  const deal = buildDealRankMultiset(n, hl, hasOpt(state.opts, OPT.JOKERS));
  const played = countPlayedRanks(state.history || '');
  const rem = remainingFromDeal(deal, played);
  if (!rem) return null;

  if (rem.sum !== expected) {
    console.error('[loserHand] remaining sum ≠ server count', {
      sum: rem.sum,
      expected,
      dealSize: deal.size,
      histEntries: played.entries,
      loserSeat,
    });
    return null;
  }
  if (deal.size - played.entries !== expected) {
    console.error('[loserHand] n*hl − history ≠ remaining', {
      dealSize: deal.size,
      histEntries: played.entries,
      expected,
    });
    return null;
  }

  const faces = inventRemainingFaces(histSuits, rem.counts, rem.jokers, handTokens);
  if (faces.length !== expected) {
    console.error('[loserHand] face count mismatch', {
      faces: faces.length,
      expected,
      facesList: faces,
    });
  }
  return { seat: loserSeat, faces };
}
