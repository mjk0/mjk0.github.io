// Rank title packs (display only). Server stores pack id; maps live here.

export const DEFAULT_RANK_PACK = 'corp';

/** @type {Record<string, { label: string, roles: string[] }>} */
export const RANK_PACKS = {
  // Order = lobby Titles segment order (corp default first).
  corp: {
    label: 'Corporate',
    roles: ['CEO', 'VP', 'Yesman', 'Grunt', 'Asst', 'Yoyo'],
  },
  classic: {
    label: 'Classic',
    roles: ['Prez', 'VP', 'Toady', 'Lackey', 'Intern', 'Yoyo'],
  },
  // Lobby label Asshole; in-play bottom office short form Ass.
  asshole: {
    label: 'Asshole',
    roles: ['Prez', 'VP', 'Gov', 'Clerk', 'Citizen', 'Ass'],
  },
};

// Ladder indices for seats 1..n (ends fixed; middle slots drop as n shrinks).
const SEAT_IDX = {
  3: [0, 1, 5],
  4: [0, 1, 4, 5],
  5: [0, 1, 2, 4, 5],
  6: [0, 1, 2, 3, 4, 5],
};

// Known pack id or product default.
export function normalizeRankPack(id) {
  const k = String(id || '')
    .trim()
    .toLowerCase();
  return RANK_PACKS[k] ? k : DEFAULT_RANK_PACK;
}

// Six-role ladder for pack.
export function packRoles(pack) {
  return RANK_PACKS[normalizeRankPack(pack)].roles;
}

// Short office title for absolute seat 1..n.
export function placeLabel(n, absSeat, pack) {
  const roles = packRoles(pack);
  const idx = SEAT_IDX[n]?.[absSeat - 1];
  return idx != null ? roles[idx] : `Seat ${absSeat}`;
}
