// Game opts bitmask ↔ lobby Options tokens (mirror server OPT_*).
export const OPT = {
  SEQ5: 0x01,
  CONT: 0x02,
  JOKERS: 0x04,
  EXCH2: 0x08,
  TWO_HIGH: 0x10,
};

// Build opts string for ClientLobbyCmd Options (empty = server defaults).
export function optsToTokens(opts) {
  const o = opts | 0;
  const t = [];
  if (o & OPT.SEQ5) t.push('SEQ5');
  else t.push('NO_SEQ5');
  if (!(o & OPT.JOKERS)) t.push('NO_JOKERS');
  if (o & OPT.EXCH2) t.push('EXCH2');
  if (o & OPT.CONT) t.push('CONT');
  if (o & OPT.TWO_HIGH) t.push('TWO_HIGH');
  return t.join(',');
}

export function hasOpt(opts, bit) {
  return ((opts | 0) & bit) !== 0;
}

/** @deprecated use optsPills — kept for any leftover string callers */
export function optsSummary(opts) {
  return optsPills(opts, null).map((p) => p.text).join(' · ');
}

/** Mirror server `default_hand_length(n, jokers)`. */
export function defaultHandLength(n, jokersOn) {
  const deck = jokersOn ? 54 : 52;
  return Math.min(12, Math.floor(deck / Math.max(1, n | 0)));
}

/**
 * Summary chips for table header.
 * @param {number} opts
 * @param {number|null} hl hand size; 0 / null = Auto → omit cards pill
 * @returns {{ text: string, kind?: string }[]}
 */
export function optsPills(opts, hl = null) {
  const o = opts | 0;
  const pills = [];
  const high = o & OPT.TWO_HIGH ? '2↑' : 'A↑';
  pills.push({
    text: o & OPT.JOKERS ? `JK·${high}` : high,
    kind: 'rank',
  });
  if (o & OPT.SEQ5) pills.push({ text: 'Seq-5', kind: 'seq' });
  if (o & OPT.EXCH2) pills.push({ text: '2+1', kind: 'exch' });
  if (o & OPT.CONT) pills.push({ text: 'CONT', kind: 'cont' });
  if (hl != null && hl > 0) pills.push({ text: `${hl} cards`, kind: 'hl' });
  return pills;
}
