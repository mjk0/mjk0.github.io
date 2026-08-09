// Card face mapping: wire C13/S1/JK → SVG symbol in cards0.svg.
// Core ranks are always 1 (low) … 13 (high) + 14 joker; only faces change.
import { CARDS_SVG } from './config.js';

// Ace high (Yoyo default): 2 low … A high.
const RANK_FACE_ACE_HIGH = {
  1: '2', 2: '3', 3: '4', 4: '5', 5: '6', 6: '7', 7: '8', 8: '9',
  9: 't', 10: 'j', 11: 'q', 12: 'k', 13: 'a',
};
// Two high (Asshole-style): 3 low … 2 high.
const RANK_FACE_TWO_HIGH = {
  1: '3', 2: '4', 3: '5', 4: '6', 5: '7', 6: '8', 7: '9', 8: 't',
  9: 'j', 10: 'q', 11: 'k', 12: 'a', 13: '2',
};

const SUIT_ID = { C: 'cl', D: 'di', H: 'he', S: 'sp' };

export const CARD_W = 60;
export const CARD_H = 80;
export const BACK_ID = 'cbcatsil';
export const JOKER_ID = 'jk5';

// 'ace_high' | 'two_high' — from table/State OPT_TWO_HIGH; default ace high (Yoyo).
let faceMode = 'ace_high';

export function getFaceMode() {
  return faceMode;
}

// Apply face mode from table/State opts. Unknown → ace_high.
export function setFaceMode(mode) {
  faceMode = mode === 'two_high' || mode === '2_high' ? 'two_high' : 'ace_high';
}

// OPT_TWO_HIGH (0x10) set → two_high faces; clear → ace_high. Keep in sync with server.
export function setFaceModeFromOpts(opts) {
  const TWO_HIGH = 0x10;
  setFaceMode((opts & TWO_HIGH) !== 0 ? 'two_high' : 'ace_high');
}

function rankFace(rank) {
  const map = faceMode === 'two_high' ? RANK_FACE_TWO_HIGH : RANK_FACE_ACE_HIGH;
  return map[rank];
}

// Wire token ("H13","c1","JK") → SVG fragment id, or null.
export function wireToSymbol(token) {
  if (!token) return null;
  const t = String(token).trim().toUpperCase();
  if (t === 'JK' || t === 'JOKER') return JOKER_ID;
  const m = t.match(/^([CDHS])(\d{1,2})$/);
  if (!m) return null;
  const suit = SUIT_ID[m[1]];
  const rank = +m[2];
  const face = rankFace(rank);
  if (!suit || !face) return null;
  return `${face}_${suit}`;
}

// History rank (1..14 or "JK") + invented suit → symbol.
export function historyToSymbol(rank, suitLetter = 'S') {
  if (rank === 14 || rank === 'JK' || rank === 'jk') return JOKER_ID;
  return wireToSymbol(`${suitLetter}${rank}`);
}

// <svg><use href="…#id"></svg> for a face/back.
export function cardSvg(symbolId, { w = CARD_W, h = CARD_H, cls = '' } = {}) {
  const id = symbolId || BACK_ID;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 60 80');
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));
  svg.setAttribute('class', cls ? `card-svg ${cls}` : 'card-svg');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  // href preferred; xlink for older WebKit
  use.setAttribute('href', `${CARDS_SVG}#${id}`);
  use.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', `${CARDS_SVG}#${id}`);
  svg.appendChild(use);
  return svg;
}

// Build a .card element from wire token (or back if null/empty).
export function cardEl(token, opts = {}) {
  const el = document.createElement('div');
  el.className = 'card' + (opts.selected ? ' selected' : '') + (opts.cls ? ` ${opts.cls}` : '');
  const sym = token ? wireToSymbol(token) : BACK_ID;
  if (token) el.dataset.wire = token;
  if (sym) el.dataset.sym = sym;
  el.appendChild(cardSvg(sym || BACK_ID, opts));
  if (opts.title) el.title = opts.title;
  else if (token) el.title = token;
  return el;
}

// Parse "H13,S12,JK" → tokens.
export function parseHand(s) {
  if (!s) return [];
  return String(s).split(',').map((t) => t.trim()).filter(Boolean);
}

// Overlap step so a face-fan row stays within maxW as columns grow.
function fanStep(cols, cardW, maxW, stepCap) {
  if (cols <= 1) return 0;
  return Math.max(3, Math.min(stepCap, Math.floor((maxW - cardW) / (cols - 1))));
}

// Total rotation span (deg), hard-capped at 160°. Card body makes silhouette look wider.
function arcSpanDeg(n) {
  if (n <= 1) return 0;
  // ~7°/step: n=12 → 95°, n=18 → 137°; never above 160
  return Math.min(160, 18 + (n - 1) * 7);
}

// Opponent backs: hand arc (card mass). Pivot at bottom center.
function arcBackFan(count, { w = 22, h = 30 } = {}) {
  const n = Math.max(0, count | 0);
  const wrap = document.createElement('div');
  wrap.className = 'card-fan arc-fan';
  const label = n === 1 ? '1 card remaining' : `${n} cards remaining`;
  wrap.title = label;
  wrap.setAttribute('aria-label', label);
  if (!n) {
    wrap.classList.add('empty');
    return wrap;
  }

  const span = arcSpanDeg(n);
  wrap.style.setProperty('--fan-w', `${w}px`);
  wrap.style.setProperty('--fan-h', `${h}px`);

  for (let i = 0; i < n; i++) {
    const rot = n === 1 ? 0 : -span / 2 + (i * span) / (n - 1);
    const c = cardEl(null, { w, h, cls: 'fan-card' });
    c.style.setProperty('--rot', `${rot}deg`);
    c.style.zIndex = String(i);
    wrap.appendChild(c);
  }
  return wrap;
}

// Face-up linear fan: 1–8 one row, 9+ two rows (readable ranks at end of hand).
function linearFaceFan(list, { w = 28, h = 38 } = {}) {
  const n = list.length;
  const wrap = document.createElement('div');
  wrap.className = 'card-fan adaptive-fan face-fan';
  const label = n === 1 ? '1 card remaining' : `${n} cards remaining`;
  wrap.title = label;
  wrap.setAttribute('aria-label', label);
  if (!n) {
    wrap.classList.add('empty');
    return wrap;
  }

  const mid = n <= 8 ? n : Math.ceil(n / 2);
  const rows = n <= 8 ? [list] : [list.slice(0, mid), list.slice(mid)];
  const cols = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const step = fanStep(cols, w, 110, 12);
  wrap.style.setProperty('--fan-w', `${w}px`);
  wrap.style.setProperty('--fan-h', `${h}px`);
  wrap.style.setProperty('--fan-step', `${step}px`);

  for (const row of rows) {
    const rowEl = document.createElement('div');
    rowEl.className = 'fan-row';
    row.forEach((tok, i) => {
      const c = cardEl(tok, { w, h, cls: 'fan-card' });
      c.style.setProperty('--i', String(i));
      c.style.zIndex = String(i);
      rowEl.appendChild(c);
    });
    wrap.appendChild(rowEl);
  }
  return wrap;
}

// Opponent remaining backs as arc fan. Zero → "0 cards" cue.
export function backFan(count, { w = 22, h = 30 } = {}) {
  const n = Math.max(0, count | 0);
  if (n === 0) {
    const el = document.createElement('div');
    el.className = 'fan-empty';
    el.textContent = '0 cards';
    el.title = '0 cards remaining';
    el.setAttribute('aria-label', '0 cards remaining');
    return el;
  }
  return arcBackFan(n, { w, h });
}

// End-of-hand loser reveal: linear face-up fan (not arc).
export function faceFan(tokens, { w = 28, h = 38 } = {}) {
  return linearFaceFan(tokens || [], { w, h });
}
