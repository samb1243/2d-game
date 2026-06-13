function generateLevel() {
  const ri = (lo, hi) => Math.floor(Math.random() * (hi - lo + 1)) + lo;

  // Physics-derived reachability for the active settings — the level generator
  // and the AI (ai.js) consult the SAME model, so anything we mark "reachable"
  // is genuinely jumpable by the character (see jump.js).
  const M = buildJumpModel(activeCfg);

  // Build until we get a layout where the flag and every gem sit on a platform
  // that is provably reachable from the floor. ensureReachability almost always
  // succeeds on the first try; the retry loop is a guarantee, not a hot path.
  for (let attempt = 0; attempt < 80; attempt++) {
    const level = buildLevel(M, ri);
    if (level) return level;
  }
  // Last resort: a trivially solvable fallback (all gems + flag on the floor).
  return buildFallbackLevel(ri);
}

function buildLevel(M, ri) {
  // Empty grid
  const grid = Array.from({ length: MAP_H }, () => new Array(MAP_W).fill(0));

  // Solid floor — rows 14–16. Row 13 stays empty (no spikes).
  for (let r = 14; r < MAP_H; r++)
    for (let c = 0; c < MAP_W; c++)
      grid[r][c] = 1;

  // Platforms are built in tiers, 2 rows apart (1 empty row between each tier).
  //   Row 12 = T1, closest to the floor.
  //   Row 10 = T2, row 8 = T3, row 6 = T4.
  //
  // T2–T4: may not share any column with the tier directly below.
  // This forces players to move sideways between levels.
  // Cols 0–3 and 26–29 are kept clear on row 12 so both spawns (at each end of
  // the floor) drop cleanly to the ground without landing on a platform.
  // Platform-count multiplier from the "Platforms" setting (level 3 = ×1.0, the
  // classic counts). nCount keeps at least 1 platform per tier so the higher
  // tiers never vanish entirely at the sparse end of the slider.
  const dens = PLAT_DENSITY_LEVELS[settings.platforms];
  const nCount = (lo, hi) => ri(Math.max(1, Math.round(lo * dens)), Math.max(1, Math.round(hi * dens)));

  const allPlats = [];
  buildTier(allPlats, 12, nCount(5, 7), 4, MAP_W - 5, ri);
  buildTier(allPlats, 10, nCount(4, 6), 1, MAP_W - 4, ri);
  buildTier(allPlats,  8, nCount(3, 5), 1, MAP_W - 4, ri);
  buildTier(allPlats,  6, nCount(2, 4), 1, MAP_W - 4, ri);

  // Add stepping stones so every platform is reachable from the floor.
  ensureReachability(allPlats, ri, M);

  // Which platforms are reachable from the floor with the current physics?
  const reach = computeReachable(allPlats, M);
  const reachable = allPlats.filter((_, i) => reach[i]);

  // Flag — pick a reachable elevated platform (row ≤ 10, i.e. T2 or above).
  const elevated = reachable.filter(p => p.row <= 10);
  if (elevated.length === 0) return null;      // nowhere worthwhile to plant it — retry
  const flagPlat = elevated[ri(0, elevated.length - 1)];
  const flagPos  = { col: flagPlat.col + Math.floor(flagPlat.w / 2), row: flagPlat.row };

  // Paint platforms onto the grid.
  for (const p of allPlats)
    for (let c = p.col; c < p.col + p.w && c < MAP_W; c++)
      if (p.row >= 3 && p.row < 13) grid[p.row][c] = 1;

  // Gems — only on reachable platforms, so collecting them is always possible.
  const gemPos = pickGems(reachable, flagPlat, GEM_COUNT, grid, ri);
  if (gemPos.length < GEM_COUNT) return null;  // not enough reachable perches — retry

  // Spikes — lethal tiles on the floor and platform tops. Each one is kept only
  // if the level stays fully solvable afterwards (gems + flag still reachable on
  // the spike-aware AI graph), so this never makes a layout impossible.
  placeSpikes(grid, gemPos, flagPos, allPlats, flagPlat, M, ri);

  // Moving platforms — scan the painted grid for empty horizontal runs (spike
  // tiles read as non-empty, so platforms never travel over one).
  const platDefs = buildMovingPlats(grid, flagPos, ri);

  return { rows: grid.map(r => r.join('')), gemPos, flagPos, platDefs };
}

// Guaranteed-solvable fallback used only if 80 random attempts all fail: a
// single low platform plus floor-level gems and flag. Effectively never hit.
function buildFallbackLevel(ri) {
  const grid = Array.from({ length: MAP_H }, () => new Array(MAP_W).fill(0));
  for (let r = 14; r < MAP_H; r++)
    for (let c = 0; c < MAP_W; c++) grid[r][c] = 1;
  for (let c = 13; c <= 16; c++) grid[12][c] = 1;          // one reachable perch

  const flagPos = { col: 14, row: 12 };
  const gemPos  = [];
  const cols    = [6, 10, 19, 23, 14];
  for (let i = 0; i < GEM_COUNT; i++) {
    const c = cols[i % cols.length];
    gemPos.push({ col: c, row: i % cols.length === 4 ? 11 : 13 });
  }
  return { rows: grid.map(r => r.join('')), gemPos, flagPos, platDefs: [] };
}

// ── Tier builder ───────────────────────────────────────────────────────────

// Places `count` platforms at `row`, each with random width (2–5) and column
// position within [minCol, maxCol]. Uses platOverlap to enforce all spacing rules.
// The wider end (5) gives spike-heavy levels room to rest two spaced spikes on a
// single platform (see placeSpikes) instead of being capped at one per platform.
function buildTier(allPlats, row, count, minCol, maxCol, ri) {
  for (let i = 0; i < count; i++) {
    for (let t = 0; t < 100; t++) {
      const w   = ri(2, 5);
      const col = ri(minCol, Math.max(minCol, maxCol - w));
      if (!platOverlap(allPlats, col, row, w)) {
        allPlats.push({ col, row, w, main: false });
        break;
      }
    }
  }
}

// ── Overlap check ──────────────────────────────────────────────────────────

function platOverlap(list, col, row, w) {
  for (const p of list) {
    // Adjacent rows always blocked (globally — prevents 1-empty-row violations).
    if (Math.abs(p.row - row) === 1) return true;
    // Same row: block if column ranges are within 1 tile of each other.
    if (p.row === row && col < p.col + p.w + 1 && col + w > p.col - 1) return true;
    // Two rows below AND column ranges overlap: blocked for T2+.
    // Row 12 is exempt — it sits above the floor which has no platforms.
    if (row !== 12 && p.row === row + 2 && col < p.col + p.w && col + w > p.col) return true;
  }
  return false;
}

// ── Reachability ───────────────────────────────────────────────────────────

// Returns a Uint8Array marking which platforms are reachable from the ground
// floor (row 14) via jumps the character can actually make. Seed: row-12
// platforms sit one 2-tile jump above the full-width floor. Propagation: A is
// reachable if a reachable B sits below it within physics jump range.
function computeReachable(allPlats, M) {
  const n     = allPlats.length;
  const reach = new Uint8Array(n);
  for (let i = 0; i < n; i++)
    if (allPlats[i].row >= 12 || allPlats[i].main) reach[i] = 1;

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < n; i++) {
      if (reach[i]) continue;
      const a = allPlats[i];
      for (let j = 0; j < n; j++) {
        if (!reach[j]) continue;
        const b  = allPlats[j];
        const dr = b.row - a.row;           // b below a → jump up from b to a
        if (dr < 1) continue;
        const hGap = Math.max(0, a.col - b.col - b.w, b.col - a.col - a.w);
        if (M.canJumpUp(dr, hGap)) { reach[i] = 1; changed = true; break; }
      }
    }
  }
  return reach;
}

// Inserts stepping stones so that every platform has a jump path to the floor.
// Works top-down by worst case (the unreachable platform closest to the floor)
// so each stone can immediately serve as a bridge for platforms above it. Each
// stone is placed within verified jump range of the platform it supports.
function ensureReachability(allPlats, ri, M) {
  const dr        = 2;                            // tiers are 2 rows apart
  const maxGap    = Math.max(0, M.maxGapTilesForRise(dr));

  for (let pass = 0; pass < 80; pass++) {
    const reach = computeReachable(allPlats, M);

    let worstIdx = -1, worstRow = -1;
    for (let i = 0; i < allPlats.length; i++)
      if (!reach[i] && allPlats[i].row > worstRow)
        { worstRow = allPlats[i].row; worstIdx = i; }
    if (worstIdx === -1) break;

    const p    = allPlats[worstIdx];
    const sRow = p.row + dr;
    if (sRow > 12) continue;                      // can't drop a stone onto the floor band

    for (let attempt = 0; attempt < 80; attempt++) {
      const sW   = ri(2, 3);
      // Search a window wide enough to cover the model's reach plus both widths,
      // then accept only placements whose actual edge-gap is jumpable.
      const span = maxGap + Math.max(p.w, sW) + 1;
      const sCol = Math.max(1, Math.min(MAP_W - sW - 1, p.col + ri(-span, span)));

      if (platOverlap(allPlats, sCol, sRow, sW)) continue;
      const edgeGap = Math.max(0, p.col - (sCol + sW - 1) - 1, sCol - (p.col + p.w - 1) - 1);
      if (!M.canJumpUp(dr, edgeGap)) continue;

      allPlats.push({ col: sCol, row: sRow, w: sW, main: false });
      break;
    }
  }
}

// ── Gem placement ──────────────────────────────────────────────────────────

// Fisher–Yates in-place shuffle driven by the generator's seeded `ri`, so the
// RNG call order is identical to the inline loops it replaces (reproducible seeds).
function shuffleInPlace(arr, ri) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = ri(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickGems(candidatePlats, flagPlat, count, grid, ri) {
  const eligible = candidatePlats.filter(p =>
    !(p.col <= flagPlat.col && flagPlat.col < p.col + p.w && p.row === flagPlat.row)
  );
  shuffleInPlace(eligible, ri);
  const gems = [];
  for (const p of eligible) {
    if (gems.length >= count) break;
    const gemRow = p.row - 1;
    if (gemRow < 1) continue;
    const mid    = p.col + Math.floor(p.w / 2);
    // Skip if the cell above is a solid tile (shouldn't happen with our layout,
    // but guards against edge cases from ensureReachability).
    const gemCol = grid[gemRow][mid] === 0 ? mid : -1;
    if (gemCol === -1) continue;
    gems.push({ col: gemCol, row: gemRow });
  }
  return gems;
}

// ── Spikes ───────────────────────────────────────────────────────────────────

// Sprinkles lethal spike tiles (value 2) onto platform tops, mutating `grid` in
// place. Density comes from the "Spikes" setting (SPIKE_LEVELS). Spikes rest ON
// TOP of a platform (the empty cell above an interior surface tile); the platform
// tile stays solid, so the platform is never cut into pieces — it just gains a
// hazard the AI hops straight up and over. The ground floor is never spiked.
// Spikes never touch the player spawns, the flag cell or a gem cell, and — the key
// guarantee — each candidate is committed only if the level remains fully solvable
// afterwards, judged with the SAME spike-aware segment graph the AI navigates
// (buildSegGraph in ai.js). So adding spikes can never strand a gem or the flag.
function placeSpikes(grid, gemPos, flagPos, allPlats, flagPlat, M, ri) {
  const dens = SPIKE_LEVELS[settings.spikes] || SPIKE_LEVELS.none;
  if (!dens.plat) return;

  const spawnCols = [2, MAP_W - 3];   // both players drop onto the floor here; the
                                      // solvability check must reach the goals from each
  // A spike resting on a platform must be hopped STRAIGHT up and over (the tile is
  // solid beneath it, so you can't run across — see aiDriveHop's overSpike branch).
  // That hop only lands safely when the character has enough horizontal reach to
  // clear the spike column before falling back onto the tips; at the slowest speeds
  // the body descends onto the spike mid-crossing. Gate platform spikes on that
  // reach (a flat hop clearing ≥2 tiles) so we never plant one the AI can't pass.
  const platCount = M.maxGapTilesForRise(0) >= 2 ? dens.plat : 0;

  const isGem  = (col, row) => gemPos.some(g => g.col === col && g.row === row);
  const isFlag = (col, row) => flagPos.col === col && flagPos.row === row;

  // Reachability on the freshly-built segment graph: every gem + the flag must
  // stay reachable from BOTH spawns' floor segments.
  const segIndexAt = (segs, col, base) => {
    for (let dr = 0; dr <= 1; dr++)
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        if (s.row === base + dr && col >= s.minCol && col <= s.maxCol) return i;
      }
    return -1;
  };
  const floorSegAt = (segs, col) => {        // lowest surface under a column = the floor piece
    let best = -1, bestRow = -1;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (col >= s.minCol && col <= s.maxCol && s.row > bestRow) { bestRow = s.row; best = i; }
    }
    return best;
  };
  const reachAll = (segs, adj, start, targets) => {
    if (start < 0) return false;
    const seen = new Uint8Array(segs.length);
    seen[start] = 1;
    const q = [start];
    for (let qi = 0; qi < q.length; qi++)
      for (const { idx } of adj[q[qi]]) if (!seen[idx]) { seen[idx] = 1; q.push(idx); }
    return targets.every(t => t >= 0 && seen[t]);
  };
  const stillSolvable = () => {
    const { segs, adj } = buildSegGraph(grid, M);
    const targets = [segIndexAt(segs, flagPos.col, flagPos.row)];
    for (const g of gemPos) targets.push(segIndexAt(segs, g.col, g.row + 1));
    return spawnCols.every(c => reachAll(segs, adj, floorSegAt(segs, c), targets));
  };

  // Commit a candidate spike set only if the level survives it; otherwise restore
  // each cell to its ORIGINAL tile (solid floor/platform = 1) — reverting to 0
  // would punch a permanent hole in the surface.
  const tryCommit = (cells) => {
    const prev = cells.map(([c, r]) => grid[r][c]);
    for (const [c, r] of cells) grid[r][c] = 2;
    if (stillSolvable()) return true;
    cells.forEach(([c, r], i) => { grid[r][c] = prev[i]; });
    return false;
  };

  // ── Platform tops: a single spike resting ON a wide platform, never the flag one ──
  // The spike sits in the empty cell ABOVE an INTERIOR surface tile (row-1); the
  // platform tile under it stays solid. The walkable surface is split into two pieces
  // around the spike (the AI hops straight up and over between them), but the platform
  // itself is never holed. Kept off the edges (≥1 solid tile each side) so a jump
  // lands on solid surface beside it, and off the gem column. validation drops any
  // that would strand a gem or the flag.
  // One spike per platform: it lands in an interior column (≥1 solid tile each side)
  // so the AI always has a solid surface to stand on beside it and hop straight up
  // and over. Widening platforms (buildTier) makes more platforms eligible, which —
  // not stacking spikes onto a single platform — is what lets denser settings place
  // more spikes while every hop stays the reliable single-spike hop. Each candidate
  // is committed only if the level stays solvable.
  const wide = shuffleInPlace(
    allPlats.filter(p => p.w >= 4 && p !== flagPlat && p.row >= 3 && p.row < 13), ri);
  let placedPlat = 0;
  for (const p of wide) {
    if (placedPlat >= platCount) break;
    const row    = p.row;                            // platform surface (stays solid)
    const top    = row - 1;                          // empty cell above — the spike sits here
    const gemCol = p.col + Math.floor(p.w / 2);      // a gem, if any, floats above here
    const cands  = [];                                // interior cols, ≥1 solid tile each side
    for (let c = p.col + 1; c <= p.col + p.w - 2; c++)
      if (c !== gemCol && grid[row][c] === 1 && grid[top][c] === 0 &&
          !isGem(c, top) && !isFlag(c, row)) cands.push(c);
    if (!cands.length) continue;
    const col = cands[ri(0, cands.length - 1)];
    if (tryCommit([[col, top]])) placedPlat++;
  }
}

// ── Moving platforms ───────────────────────────────────────────────────────

// Scans the painted grid for empty horizontal runs on each even platform row.
// A moving platform is placed in the longest qualifying run (≥ 4 clear tiles on
// each side of the 2-tile-wide platform's full travel range), one per row. The
// flag-pole cells (above the flag platform) are treated as occupied so a platform
// never slides through the pole.
function buildMovingPlats(grid, flagPos, ri) {
  const speed   = MOVING_SPEED_LEVELS[settings.movingSpeedLevel];
  const plats     = [];
  const tw        = 2;
  const margin    = 3;   // clear tiles kept beyond each end of the travel range
  const minTravel = 4;   // the platform must be able to slide at least this far
  const minSpan   = tw + 2 * margin + minTravel;
  const usedRows  = new Set();

  // The drawn flag pole rises ~1.6 tiles above its platform — block those cells.
  const poleBlocked = (row, col) =>
    col === flagPos.col && (row === flagPos.row - 1 || row === flagPos.row - 2);

  for (let row = 6; row <= 12; row += 2) {
    if (usedRows.has(row)) continue;

    // Find the longest empty run in this row.
    let bestRun = null;
    let runStart = -1;
    for (let col = 0; col <= MAP_W; col++) {
      const solid = col < MAP_W && (grid[row][col] !== 0 || poleBlocked(row, col));
      if (!solid && runStart < 0) runStart = col;
      if ((solid || col === MAP_W) && runStart >= 0) {
        const len = col - runStart;
        if (len >= minSpan && (!bestRun || len > bestRun.len))
          bestRun = { start: runStart, len };
        runStart = -1;
      }
    }
    if (!bestRun) continue;

    // minTx = leftmost left-edge, maxTx = rightmost RIGHT-edge (the travel bounds
    // initGame turns into minX/maxX, against which physics reverses the platform).
    // The left edge slides over [minTx, maxTx - tw]; minSpan guarantees that span
    // is ≥ minTravel tiles, so the platform always has real room to move.
    const minTx = bestRun.start + margin;
    const maxTx = bestRun.start + bestRun.len - margin;

    const mid = minTx + Math.floor((maxTx - tw - minTx) / 2);
    plats.push({
      tx: mid, ty: row, tw,
      dx: (Math.random() < 0.5 ? 1 : -1) * speed,
      minTx, maxTx,
    });
    usedRows.add(row);
  }

  return plats;
}
