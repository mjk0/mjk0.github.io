// Current-trick parse + seat-offset stack rendering (center table).
import { cardEl, cardPx } from './cards.js';
import { displayPlayTokens } from './config.js';
import { parseHistoryString, displayFace } from './historySuits.js';

/**
 * Group history entries into plays (consecutive same-seat runs).
 * @param {ReturnType<typeof parseHistoryString>} entries
 * @param {string[]} faces histSuits.faces parallel to entries
 * @returns {{ seat: number, faces: string[], orderIndex: number, histStart: number }[]}
 */
export function playsFromHistory(entries, faces) {
  const plays = [];
  let i = 0;
  let order = 0;
  while (i < entries.length) {
    const seat = entries[i].seat;
    const start = i;
    const pf = [];
    while (i < entries.length && entries[i].seat === seat) {
      // Same continuous unit: also break on * starter after first card of a new trick handled by caller slice
      if (i > start && entries[i].starter) break;
      pf.push(faces[i] || null);
      i++;
    }
    plays.push({
      seat,
      faces: pf.filter(Boolean),
      orderIndex: order++,
      histStart: start,
    });
  }
  return plays;
}

// Slice entries/faces to current trick (from last * starter).
export function currentTrickSlice(entries, faces) {
  if (!entries.length) return { entries: [], faces: [], start: 0 };
  let start = 0;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].starter) start = i;
  }
  return {
    entries: entries.slice(start),
    faces: faces.slice(start),
    start,
  };
}

/**
 * Latest play per seat in the current trick (CONT multi-raise keeps only last).
 * @returns {{ seat: number, faces: string[], orderIndex: number }[]}
 */
export function latestPlaysBySeat(entries, faces) {
  const { entries: te, faces: tf } = currentTrickSlice(entries, faces);
  const plays = playsFromHistory(te, tf);
  // Keep last play per seat; orderIndex = chronological among kept plays
  const bySeat = new Map();
  for (const p of plays) {
    bySeat.set(p.seat, p);
  }
  const latest = [...bySeat.values()].sort((a, b) => a.orderIndex - b.orderIndex);
  // Re-index z-order by appearance order among latest
  latest.forEach((p, i) => {
    p.orderIndex = i;
  });
  return latest;
}

// Angle for visual seat index (0 = you/bottom, clockwise). Matches play.js seatPositions.
export function seatArcAngle(visualIndex, n) {
  return Math.PI / 2 + (visualIndex * 2 * Math.PI) / n;
}

// Point on seat ray at radius factor k (0=center, 1≈seat token). Stack uses k≈0.32.
export function seatArcOffset(visualIndex, n, k = 0.32) {
  const a = seatArcAngle(visualIndex, n);
  return {
    x: 50 + 38 * k * Math.cos(a),
    y: 48 + 36 * k * Math.sin(a),
    a,
  };
}

// Play-stack offset (toward seat from center).
export function seatStackOffset(visualIndex, n) {
  return seatArcOffset(visualIndex, n, 0.32);
}

// Overlap step as fraction of card width (tighter for larger sets).
function stackStep(count) {
  if (count <= 1) return 0;
  if (count === 2) return 0.42;
  if (count <= 4) return 0.38;
  return 0.32; // seq5
}

// Position a felt object on a seat ray. Default k=0.32 (stack); higher = seat-ward.
function placeAtSeat(el, seat, layout, z, k = 0.32) {
  const { n, youSeat, visualIndex } = layout;
  const vi = visualIndex(seat, n, youSeat);
  const off = seatArcOffset(vi, n, k);
  el.style.left = `${off.x}%`;
  el.style.top = `${off.y}%`;
  el.style.zIndex = String(z);
  el.dataset.seat = String(seat);
}

// Finish place 1..n from finish_order (seat list), or 0 if still in / unknown.
function placeFromOrder(finishOrder, seat) {
  const order = finishOrder || [];
  const i = order.findIndex((s) => +s === +seat);
  return i >= 0 ? i + 1 : 0;
}

// Place for OUT FX; sole empty seat → 1st if order lags (rare).
function resolveOutPlace(finishOrder, seat, remaining, n) {
  const p = placeFromOrder(finishOrder, seat);
  if (p > 0) return p;
  let empties = 0;
  for (let i = 0; i < n; i++) {
    if ((remaining[i] ?? -1) === 0) empties++;
  }
  if (empties === 1) return 1;
  return 0;
}

// OUT pill centered on seat stack ray (outlined type on-stack vs solid free slot).
const OUT_K = 0.32;

// Oval PASS pill (not a button).
function makePassPill(seat) {
  const el = document.createElement('div');
  el.className = 'felt-pill pass-pill';
  el.textContent = 'PASS';
  el.setAttribute('aria-label', `Seat ${seat} passed`);
  return el;
}

// Hand over: sole remaining hand — 😢 hold through park/summary (no X swap).
function makeLoserPill(seat) {
  const el = document.createElement('div');
  el.className = 'felt-pill loser-pill';
  el.setAttribute('aria-label', `Seat ${seat}: finished last (cards remaining)`);
  el.setAttribute('title', 'Finished last');
  const face = document.createElement('span');
  face.className = 'loser-face';
  face.setAttribute('aria-hidden', 'true');
  face.textContent = '😢';
  el.append(face);
  return el;
}

// One-shot OUT burst per seat this hand.
// FX live on a durable sibling of #trick-layer (.trick-out-fx). Re-parenting
// after replaceChildren restarts CSS animations — 1st (longest) looked random.
const outBurstShown = new Set();
/** @type {Map<number, HTMLElement>} */
const outFxBySeat = new Map();

function clearOutFireworks() {
  for (const fx of outFxBySeat.values()) fx.remove();
  outFxBySeat.clear();
}

// Sibling host over the felt; never wiped by trick-layer replaceChildren.
function ensureOutFxHost(layerEl) {
  const area = layerEl?.parentElement;
  if (!area) return layerEl;
  let host = area.querySelector(':scope > .trick-out-fx');
  if (!host) {
    host = document.createElement('div');
    host.className = 'trick-out-fx';
    host.setAttribute('aria-hidden', 'true');
    layerEl.after(host);
  }
  return host;
}

// OUT FX tier: 1st gold boom > 2nd cool full > 3rd+ quieter. Unknown place → 2nd.
function outFxTier(place) {
  if (place === 1) return 'first';
  if (place >= 3) return 'third';
  return 'second'; // 2nd or place 0 (order not yet known)
}

// Spark waves for one OUT: 1st=3 waves, 2nd=2, 3rd+=1.
function buildOutFirework(place) {
  const tier = outFxTier(place);
  const fx = document.createElement('span');
  fx.className =
    'out-firework' + (tier === 'first' ? ' first' : tier === 'third' ? ' third' : '');
  fx.setAttribute('aria-hidden', 'true');
  const waves =
    tier === 'first'
      ? [
          { n: 36, d0: 110, dSpread: 55, delay0: 0, dur: 2.1 },
          { n: 24, d0: 85, dSpread: 48, delay0: 380, dur: 1.9 },
          { n: 18, d0: 65, dSpread: 42, delay0: 780, dur: 1.7 },
        ]
      : tier === 'second'
        ? [
            { n: 26, d0: 85, dSpread: 40, delay0: 0, dur: 1.7 },
            { n: 16, d0: 55, dSpread: 35, delay0: 380, dur: 1.5 },
          ]
        : [
            // Single quieter boom
            { n: 18, d0: 68, dSpread: 30, delay0: 0, dur: 1.35 },
          ];
  for (const w of waves) {
    for (let i = 0; i < w.n; i++) {
      const s = document.createElement('span');
      s.className =
        'out-spark' +
        (tier === 'first' && i % 5 === 0 ? ' out-spark-lg' : '');
      const a = (i * 360) / w.n + (i % 2 ? 12 : -8) + (w.delay0 ? 7 : 0);
      s.style.setProperty('--a', `${a}deg`);
      s.style.setProperty('--d', `${w.d0 + (i % 5) * (w.dSpread / 4)}px`);
      s.style.setProperty('--delay', `${w.delay0 + (i % 6) * 22}ms`);
      s.style.setProperty('--dur', `${w.dur}s`);
      // 1st gold-heavy; 2nd cool + gold flecks; 3rd cooler / fewer golds
      let hue;
      if (tier === 'first') {
        hue = i % 4 === 0 ? 205 : i % 4 === 1 ? 42 : i % 4 === 2 ? 28 : 48;
      } else if (tier === 'second') {
        hue = i % 3 === 1 ? 42 : i % 3 === 2 ? 175 : 205;
      } else {
        hue = i % 4 === 1 ? 48 : i % 4 === 2 ? 185 : 210;
      }
      s.style.setProperty('--hue', String(hue));
      fx.appendChild(s);
    }
  }
  return fx;
}

// First-time OUT for seat: pill pop + layered sparks at (x%, y%) on durable host.
function markOutBurst(pillEl, seat, { place = 0, host, x, y } = {}) {
  if (!pillEl || seat < 1 || outBurstShown.has(seat)) return;
  outBurstShown.add(seat);
  const tier = outFxTier(place);
  pillEl.classList.add('out-burst');
  if (tier === 'first') pillEl.classList.add('out-burst-first');
  else if (tier === 'third') pillEl.classList.add('out-burst-third');
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  if (!host) return;
  const fx = buildOutFirework(place);
  fx.style.left = x != null ? x : pillEl.style.left;
  fx.style.top = y != null ? y : pillEl.style.top;
  fx.dataset.seat = String(seat);
  host.appendChild(fx);
  outFxBySeat.set(seat, fx);
  // Cover last wave: 1st ~0.78s+1.7s, 2nd ~0.38s+1.5s, 3rd ~1.35s
  const ttl = tier === 'first' ? 3200 : tier === 'second' ? 2100 : 1500;
  setTimeout(() => {
    if (outFxBySeat.get(seat) === fx) outFxBySeat.delete(seat);
    fx.remove();
  }, ttl);
}

// OUT pill (place ranking lives on seat place-pill). on-stack = no plate.
function makeOutPill(seat) {
  const el = document.createElement('div');
  el.className = 'felt-pill out-pill';
  el.textContent = 'OUT';
  el.setAttribute('aria-label', `Seat ${seat}: Out of cards`);
  return el;
}

// Mid-radius cue: upright label + arrow under it. opts: mine, exchange, active, aria.
// Empty label → arrow only (a11y via aria / title). rotDeg: arrow local-up → seat ray.
function makeTurnCue(seat, label, rotDeg, opts = {}) {
  const el = document.createElement('div');
  const text = label || '';
  const aria = opts.aria || text || '…';
  el.className =
    'turn-cue' +
    (opts.mine ? ' mine' : '') +
    (opts.exchange ? ' exchange' : '') +
    (opts.active ? ' active' : '') +
    (!text ? ' arrow-only' : '');
  el.setAttribute('role', 'status');
  el.setAttribute('aria-label', aria);
  el.title = aria;
  el.dataset.seat = String(seat);

  // Only the arrow rotates — label stays screen-upright (avoids L/R paint overlap)
  const arrowHost = document.createElement('div');
  arrowHost.className = 'turn-arrow-host';
  arrowHost.style.transform = `rotate(${rotDeg}deg)`;
  arrowHost.setAttribute('aria-hidden', 'true');

  const arrow = document.createElement('div');
  arrow.className = 'turn-arrow';
  const head = document.createElement('div');
  head.className = 'turn-arrow-head';
  const stem = document.createElement('div');
  stem.className = 'turn-arrow-stem';
  arrow.appendChild(head);
  arrow.appendChild(stem);
  arrowHost.appendChild(arrow);

  // Text on top (if any), arrow below pointing toward seat
  if (text) {
    const lab = document.createElement('div');
    lab.className = 'turn-cue-label';
    lab.textContent = text;
    el.appendChild(lab);
  }
  el.appendChild(arrowHost);
  return el;
}

/**
 * Render offset stacks + felt markers (PASS / OUT / turn cues) into #trick.
 * Piles go in .trick-piles (parkable); turn cues stay siblings (unscaled).
 * @param {HTMLElement} layerEl
 * @param {{ seat: number, faces: string[], orderIndex: number }[]} plays
 * @param {{ n: number, youSeat: number, visualIndex: (seat,n,you)=>number }} layout
 * @param {{
 *   passedMask?: number,
 *   remaining?: number[],
 *   trickStart?: number,
 *   cont?: boolean,
 *   midTrick?: boolean,
 *   gameOver?: boolean,
 *   finishOrder?: number[],
 *   turnCues?: { seat: number, label: string, mine?: boolean, exchange?: boolean, active?: boolean }[],
 * }} [felt]
 */
export function renderPlayStacks(layerEl, plays, layout, felt = {}) {
  if (!layerEl) return;
  const { n, youSeat, visualIndex } = layout;
  const passedMask = felt.passedMask | 0;
  const remaining = felt.remaining || [];
  const trickStart = felt.trickStart | 0;
  const cont = !!felt.cont;
  const midTrick = !!felt.midTrick;
  const gameOver = !!felt.gameOver;
  const finishOrder = felt.finishOrder || [];
  const turnCues = felt.turnCues || [];

  const cw = cardPx(48);
  const ch = cardPx(64);
  const piles = document.createElement('div');
  piles.className = 'trick-piles';
  const played = new Set();

  // Lead ring+chip only !CONT, mid-trick (not while waiting for a new lead)
  const markLead = midTrick && !cont && trickStart > 0;

  for (const p of plays) {
    played.add(p.seat);
    const stack = document.createElement('div');
    stack.className = 'play-stack';
    placeAtSeat(stack, p.seat, layout, 10 + p.orderIndex * 10);

    if (markLead && p.seat === trickStart) {
      stack.classList.add('lead');
      const chip = document.createElement('span');
      chip.className = 'lead-chip';
      chip.textContent = 'LEAD';
      chip.setAttribute('aria-label', 'Trick lead');
      stack.appendChild(chip);
    }

    // Card-sort pref: High→Low / Low→High (same as hand)
    const cards = displayPlayTokens(p.faces);
    const step = stackStep(cards.length);
    const totalW = cw + (cards.length - 1) * cw * step;
    stack.style.width = `${totalW}px`;
    stack.style.height = `${ch}px`;

    cards.forEach((f, i) => {
      const d = displayFace(f);
      let el;
      if (!d) {
        el = cardEl(null, { w: cw, h: ch });
      } else if (typeof d === 'string') {
        el = cardEl(d, { w: cw, h: ch });
      } else {
        el = cardEl(d.wire, { w: cw, h: ch, title: d.title });
        if (d.error) el.classList.add('suit-error');
      }
      el.classList.add('stack-card');
      el.style.left = `${i * cw * step}px`;
      el.style.zIndex = String(i + 1);
      stack.appendChild(el);
    });

    // Emptied on this play: keep set fully readable; OUT glass centers on stack
    if ((remaining[p.seat - 1] ?? -1) === 0) {
      stack.classList.add('out');
    }

    piles.appendChild(stack);
  }

  let anyOut = false;
  for (let seat = 1; seat <= n; seat++) {
    if ((remaining[seat - 1] ?? -1) === 0) anyOut = true;
  }
  if (!anyOut) {
    outBurstShown.clear();
    clearOutFireworks();
  }

  // OUT for every empty seat (with or without live stack). PASS/LOSER only free slots.
  // Hand over: sole remaining hand → LOSER, not false PASS.
  // PASS: live mask mid-trick; completed-trick shelf infers non-players (mask cleared on LEAD).
  const inferCompletedPasses = !midTrick && !gameOver && plays.length > 0;
  // Durable host: not under replaceChildren (keeps CSS animations continuous).
  const fxHost = ensureOutFxHost(layerEl);
  for (let seat = 1; seat <= n; seat++) {
    const rem = remaining[seat - 1] ?? -1;
    if (rem === 0) {
      // Center on stack ray; outlined type when a card is under the pill, solid when free slot
      const pill = makeOutPill(seat);
      if (played.has(seat)) pill.classList.add('on-stack');
      placeAtSeat(pill, seat, layout, 35, OUT_K);
      markOutBurst(pill, seat, {
        place: resolveOutPlace(finishOrder, seat, remaining, n),
        host: fxHost,
        x: pill.style.left,
        y: pill.style.top,
      });
      piles.appendChild(pill);
      continue;
    }
    if (played.has(seat)) continue;
    if (rem > 0 && gameOver) {
      const pill = makeLoserPill(seat);
      placeAtSeat(pill, seat, layout, 5);
      piles.appendChild(pill);
    } else if (
      rem > 0 &&
      ((passedMask & (1 << (seat - 1))) !== 0 || inferCompletedPasses)
    ) {
      const pill = makePassPill(seat);
      placeAtSeat(pill, seat, layout, 5);
      piles.appendChild(pill);
    }
  }

  const frag = document.createDocumentFragment();
  frag.appendChild(piles);

  // Mid-radius cues (play turn or Prez/Yoyo exchange) — outside piles so park scale skips them
  for (const tc of turnCues) {
    const seat = tc.seat | 0;
    if (seat < 1 || seat > n) continue;
    const vi = visualIndex(seat, n, youSeat);
    const off = seatArcOffset(vi, n, 0.58);
    // Arrow local "up" (-Y); rotate so it points outward along seat ray
    const rotDeg = ((off.a + Math.PI / 2) * 180) / Math.PI;
    const cue = makeTurnCue(seat, tc.label || '', rotDeg, {
      mine: !!tc.mine,
      exchange: !!tc.exchange,
      active: !!tc.active,
      aria: tc.aria || tc.label || undefined,
    });
    cue.style.left = `${off.x}%`;
    cue.style.top = `${off.y}%`;
    cue.style.zIndex = '100';
    frag.appendChild(cue);
  }

  layerEl.replaceChildren(frag);
}

// Full pipeline: history → stacks + felt markers.
export function renderCurrentTrick(layerEl, historyStr, faces, layout, felt) {
  const entries = parseHistoryString(historyStr || '');
  const plays = latestPlaysBySeat(entries, faces || []);
  renderPlayStacks(layerEl, plays, layout, felt);
}

// Entry indices of each trick lead (* starter).
function trickStartIndices(entries) {
  const starts = [];
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].starter) starts.push(i);
  }
  return starts;
}

// [start,end) of last *completed* trick. Mid-trick (step=PLAY) → previous; else last slice.
// step: 2=LEAD, 3=PLAY, 4+=SUMMARY/END. Returns null if none.
export function lastCompletedTrickRange(entries, step) {
  const ranges = completedTrickRanges(entries, step);
  if (!ranges.length) return null;
  return ranges[ranges.length - 1];
}

/**
 * All completed tricks as [start,end) ranges (0-based index in returned array = trick 1..k).
 * Mid-trick (step=PLAY): omits the open current * slice.
 */
export function completedTrickRanges(entries, step) {
  const starts = trickStartIndices(entries);
  if (!starts.length) return [];
  const mid = step === 3; // PLAY — current * slice still open
  const count = mid ? starts.length - 1 : starts.length;
  if (count <= 0) return [];
  /** @type {{ start: number, end: number }[]} */
  const ranges = [];
  for (let ti = 0; ti < count; ti++) {
    const start = starts[ti];
    const end = ti + 1 < starts.length ? starts[ti + 1] : entries.length;
    ranges.push({ start, end });
  }
  return ranges;
}

/** Number of completed tricks in history for this step. */
export function completedTrickCount(historyStr, step) {
  const entries = parseHistoryString(historyStr || '');
  return completedTrickRanges(entries, step).length;
}

function nextSeat(seat, n) {
  return seat >= n ? 1 : seat + 1;
}

// Replay remaining counts through history[0..upTo) (one card per entry).
function remainingAfter(entries, n, hl, upTo) {
  const rem = Array(n).fill(hl);
  for (let i = 0; i < upTo && i < entries.length; i++) {
    const seat = entries[i].seat;
    if (seat >= 1 && seat <= n) rem[seat - 1] = Math.max(0, rem[seat - 1] - 1);
  }
  return rem;
}

// Lead size for a trick slice: same-rank set (jokers wild), else seq5, else 1.
// Splits CONT multi-raises (*1:9,1:10) that raw same-seat grouping would merge.
function detectLeadSize(entries) {
  if (!entries.length) return 1;
  const seat = entries[0].seat;
  let main = null;
  let nSet = 0;
  for (let i = 0; i < entries.length && entries[i].seat === seat; i++) {
    if (entries[i].joker) {
      nSet++;
      continue;
    }
    if (main == null) {
      main = entries[i].rank;
      nSet++;
    } else if (entries[i].rank === main) {
      nSet++;
    } else {
      break;
    }
  }
  if (nSet >= 2) return nSet;
  // Possible seq5: five same-seat cards that aren't a pure set
  if (
    entries.length >= 5 &&
    entries[0].seat === seat &&
    entries[1].seat === seat &&
    entries[2].seat === seat &&
    entries[3].seat === seat &&
    entries[4].seat === seat
  ) {
    const ranks = [];
    let jokers = 0;
    for (let i = 0; i < 5; i++) {
      if (entries[i].joker) jokers++;
      else ranks.push(entries[i].rank);
    }
    ranks.sort((a, b) => a - b);
    let ok = ranks.length + jokers === 5;
    for (let i = 1; ok && i < ranks.length; i++) {
      if (ranks[i] === ranks[i - 1]) ok = false; // duplicate non-joker
      else if (ranks[i] > ranks[i - 1] + 1) {
        // gap only OK if jokers can fill
        const gap = ranks[i] - ranks[i - 1] - 1;
        if (gap > jokers) ok = false;
        else jokers -= gap;
      }
    }
    if (ok) return 5;
  }
  return 1;
}

// Fixed-size plays for one trick (CONT multi-raise = multiple plays, size = lead size).
function playsInTrick(entries, faces) {
  const size = detectLeadSize(entries);
  const plays = [];
  let i = 0;
  let order = 0;
  while (i < entries.length) {
    const seat = entries[i].seat;
    const pf = [];
    for (let k = 0; k < size && i < entries.length; k++, i++) {
      pf.push(faces[i] || null);
    }
    plays.push({ seat, faces: pf.filter(Boolean), orderIndex: order++ });
  }
  return plays;
}

/**
 * Build ordered rows (plays + inferred passes) for one completed trick range.
 * @returns {{ rows: {kind:'play'|'pass', seat:number, faces?:string[], lead?:boolean}[], winner: number } | null}
 */
function buildTrickFromRange(entries, faces, range, n, hl) {
  if (!range || !n || !hl) return null;
  const rem = remainingAfter(entries, n, hl, range.start);
  const slice = entries.slice(range.start, range.end);
  const sliceFaces = (faces || []).slice(range.start, range.end);
  const plays = playsInTrick(slice, sliceFaces);
  if (!plays.length) return null;

  const passed = new Set();
  const rows = [];
  let prevSeat = null;

  for (let pi = 0; pi < plays.length; pi++) {
    const p = plays[pi];
    if (prevSeat != null) {
      // Gap seats between consecutive plays → pass (skip out / already passed)
      let s = nextSeat(prevSeat, n);
      let guard = 0;
      while (s !== p.seat && guard++ < n) {
        if (rem[s - 1] > 0 && !passed.has(s)) {
          rows.push({ kind: 'pass', seat: s });
          passed.add(s); // CONT: at most one pass per seat per trick
        }
        s = nextSeat(s, n);
      }
    }
    rows.push({
      kind: 'play',
      seat: p.seat,
      faces: p.faces,
      lead: pi === 0,
    });
    rem[p.seat - 1] = Math.max(0, rem[p.seat - 1] - p.faces.length);
    prevSeat = p.seat;
  }

  // Stop at last play (no trailing passes after the winning set)
  return { rows, winner: prevSeat };
}

/**
 * Completed trick by 0-based index among completed tricks.
 * @returns {{ rows: ..., winner: number, trickIndex: number, trickCount: number } | null}
 */
export function buildTrickByIndex(historyStr, faces, { n, hl, step, trickIndex }) {
  const entries = parseHistoryString(historyStr || '');
  if (!n || !hl) return null;
  const ranges = completedTrickRanges(entries, step);
  if (!ranges.length) return null;
  const ti =
    trickIndex == null || trickIndex < 0
      ? ranges.length - 1
      : Math.min(trickIndex, ranges.length - 1);
  if (ti < 0 || ti >= ranges.length) return null;
  const built = buildTrickFromRange(entries, faces, ranges[ti], n, hl);
  if (!built) return null;
  return { ...built, trickIndex: ti, trickCount: ranges.length };
}

/**
 * Last completed trick as ordered rows (plays + inferred passes).
 * @returns {{ rows: ..., winner: number, trickIndex?: number, trickCount?: number } | null}
 */
export function buildLastTrick(historyStr, faces, opts) {
  return buildTrickByIndex(historyStr, faces, { ...opts, trickIndex: -1 });
}

// Mini horizontal stack for last-trick popover (cw/ch card size).
export function miniPlayStack(faces, { cw = 28, ch = 38 } = {}) {
  const stack = document.createElement('div');
  stack.className = 'lt-stack';
  const cards = displayPlayTokens(faces || []);
  const step = stackStep(cards.length);
  stack.style.width = `${cw + Math.max(0, cards.length - 1) * cw * step}px`;
  stack.style.height = `${ch}px`;
  cards.forEach((f, i) => {
    const d = displayFace(f);
    let el;
    if (!d) el = cardEl(null, { w: cw, h: ch });
    else if (typeof d === 'string') el = cardEl(d, { w: cw, h: ch });
    else {
      el = cardEl(d.wire, { w: cw, h: ch, title: d.title });
      if (d.error) el.classList.add('suit-error');
    }
    el.classList.add('lt-card');
    el.style.left = `${i * cw * step}px`;
    el.style.zIndex = String(i + 1);
    stack.appendChild(el);
  });
  return stack;
}
