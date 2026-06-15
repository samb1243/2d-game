// ── Endless world generator ──────────────────────────────────────────────────
// A pure, deterministic procedural field for the infinite (both-axes) score-attack
// mode. The whole world is a function of (seed, col, row): there is no chunk-local
// state and no dependence on generation order, so the two split-screen cameras (and
// any revisit) always agree and there are never seam artifacts.
//
// Platforms live only on EVEN rows — tiers 2 rows apart, with the odd row above each
// tier left clear for headroom (the classic map's rule, extended infinitely up and
// down; there is no solid floor in this mode).
//
// Connectivity is guaranteed BY CONSTRUCTION rather than by searching an (infinite)
// graph. A "backbone" platform sits in every lattice cell:
//   • same-tier neighbours are spaced so their edge gap ≤ M.maxGapTilesForRise(0)
//   • consecutive tiers are phase-shifted by DPHASE columns (a diagonal staircase) so
//     each tier-T platform has a tier-(T±1) platform within M.maxGapTilesForRise(2),
//     offset sideways so there is a clear column to take off from (never a ceiling).
// Because buildJumpModel guarantees maxRise ≥ 2 (one tier) for every difficulty, this
// lattice is a single connected component for any settings. Gems are placed only on
// backbone platforms, so every gem is reachable — no global validation needed.
//
// Mirrors jump.js: a browser global plus a Node export for the headless harness.

// 32-bit integer hash of (seed, a, b) → uint32. Every per-cell random choice is
// derived from this, so the field is reproducible and order-independent.
function eHash(seed, a, b) {
  let h = (seed | 0) >>> 0;
  h = Math.imul(h ^ (a | 0), 0x27d4eb2d) >>> 0;
  h = Math.imul(h ^ (b | 0), 0x165667b1) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}
const eRand    = (seed, a, b) => eHash(seed, a, b) / 4294967296;       // [0,1)
const eRandInt = (seed, a, b, lo, hi) => lo + (eHash(seed, a, b) % (hi - lo + 1));

// Salts so width / jitter / gem draws are independent streams off the same seed.
const SALT_W = 0x9e3779b1, SALT_GEM = 0x85ebca77;

// Turn the active jump model into lattice spacing. WMIN..WMAX is the platform width
// range, sized from the reach-tight pitch so a 1-col gap always remains.
//
// The slot pitch GX is then spread a little WIDER than that reach-tight pitch to make
// the field feel more open (fewer platforms per tier). This is safe: connectivity rides
// the vertical staircase, not same-tier hops — DPHASE/upGap (the climb) are unchanged,
// and adjacent column-bands still merge into continuous ground at every phase-extreme
// tier, so the lattice stays a single connected component for any pitch.
function endlessParams(M) {
  const sameGap = Math.max(1, M.maxGapTilesForRise(0));   // same-tier reach (cols)
  const upGap   = Math.max(0, M.maxGapTilesForRise(2));   // one-tier-up reach (cols)
  const WMIN = 2;
  const coreGX = WMIN + sameGap;                          // reach-tight pitch (width cap)
  const WMAX = Math.min(5, coreGX - 1);                   // keep at least a 1-col gap
  const GX   = coreGX + Math.max(1, Math.round(sameGap * 0.34)); // wider, more open pitch
  const DPHASE = GX >= 3 ? 2 : 1;                         // per-tier sideways stagger
  return { sameGap, upGap, WMIN, WMAX, GX, DPHASE };
}

// Triangle-wave horizontal phase for a tier (in columns). Consecutive tiers differ by
// exactly DPHASE and the phase stays within [0, GX), so the staircase zig-zags up and
// down without ever jumping by more than one climbable step between tiers.
function tierPhase(P, T) {
  const steps  = Math.max(1, Math.floor((P.GX - 1) / P.DPHASE));
  const period = 2 * steps;
  const m = ((T % period) + period) % period;
  const k = m <= steps ? m : period - m;                 // triangle in [0, steps]
  return k * P.DPHASE;
}

// Build a handle to one endless world. opts.gemChance scales gem density (0..1).
function buildEndlessWorld(seed, M, opts) {
  const P         = endlessParams(M);
  const gemChance = (opts && opts.gemChance != null) ? opts.gemChance : 0.5;
  seed = seed | 0;

  // The backbone platform for lattice cell (tier T, slot k).
  function plat(T, k) {
    const col = k * P.GX + tierPhase(P, T);
    const w   = eRandInt(seed ^ SALT_W, T, k, P.WMIN, P.WMAX);
    return { col, row: 2 * T, w };
  }

  // 1 if (col,row) is solid platform, else 0. Pure, O(1): only the slots whose
  // platform could reach this column are checked.
  function tileAt(col, row) {
    if ((row & 1) !== 0) return 0;                        // platforms on even rows only
    const T    = row >> 1;
    const base = Math.floor((col - tierPhase(P, T)) / P.GX);
    for (let k = base - 1; k <= base + 1; k++) {
      const pl = plat(T, k);
      if (col >= pl.col && col < pl.col + pl.w) return 1;
    }
    return 0;
  }

  // The gem (if any) resting on backbone platform (T,k): a single gem floating one
  // row above the platform's middle column.
  function gemOnPlat(T, k) {
    if (eRand(seed ^ SALT_GEM, T, k) >= gemChance) return null;
    const pl = plat(T, k);
    return { col: pl.col + (pl.w >> 1), row: pl.row - 1 };
  }

  // Every gem whose cell falls inside [c0,c1]×[r0,r1] (inclusive). Lets each camera
  // query only its visible region.
  function gemsInRect(c0, r0, c1, r1) {
    const out = [];
    const tLo = Math.floor((r0 - 1) / 2), tHi = Math.floor((r1 + 1) / 2);
    for (let T = tLo; T <= tHi; T++) {
      const phase = tierPhase(P, T);
      const kLo = Math.floor((c0 - phase) / P.GX) - 1;
      const kHi = Math.floor((c1 - phase) / P.GX) + 1;
      for (let k = kLo; k <= kHi; k++) {
        const g = gemOnPlat(T, k);
        if (g && g.col >= c0 && g.col <= c1 && g.row >= r0 && g.row <= r1) out.push(g);
      }
    }
    return out;
  }

  // The backbone platform nearest a target (col,row) — used to anchor the end flag
  // on guaranteed-reachable ground.
  function platNear(col, row) {
    const T = Math.round(row / 2);
    const k = Math.round((col - tierPhase(P, T)) / P.GX);
    return plat(T, k);
  }

  return { tileAt, gemsInRect, plat, platNear, params: P };
}

// Node export (browser uses the globals).
if (typeof module !== 'undefined' && module.exports)
  module.exports = { buildEndlessWorld, endlessParams, tierPhase, eHash };
