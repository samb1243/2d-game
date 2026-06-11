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

  // Moving platforms — scan the painted grid for empty horizontal runs.
  const platDefs = buildMovingPlats(grid, ri);

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

// Places `count` platforms at `row`, each with random width (2–4) and column
// position within [minCol, maxCol]. Uses platOverlap to enforce all spacing rules.
function buildTier(allPlats, row, count, minCol, maxCol, ri) {
  for (let i = 0; i < count; i++) {
    for (let t = 0; t < 100; t++) {
      const w   = ri(2, 4);
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

function pickGems(candidatePlats, flagPlat, count, grid, ri) {
  const eligible = candidatePlats.filter(p =>
    !(p.col <= flagPlat.col && flagPlat.col < p.col + p.w && p.row === flagPlat.row)
  );
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = ri(0, i);
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }
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

// ── Moving platforms ───────────────────────────────────────────────────────

// Scans the painted grid for empty horizontal runs on each even platform row.
// A moving platform is placed in the longest qualifying run (≥ 5 clear tiles on
// each side of the 2-tile-wide platform's full travel range), one per row.
function buildMovingPlats(grid, ri) {
  const speed   = MOVING_SPEED_LEVELS[settings.movingSpeedLevel];
  const plats    = [];
  const tw       = 2;
  const margin   = 5;   // clear tiles required on each side of the travel range
  const minSpan  = tw + 2 * margin;
  const usedRows = new Set();

  for (let row = 6; row <= 12; row += 2) {
    if (usedRows.has(row)) continue;

    // Find the longest empty run in this row.
    let bestRun = null;
    let runStart = -1;
    for (let col = 0; col <= MAP_W; col++) {
      const solid = col < MAP_W && grid[row][col] !== 0;
      if (!solid && runStart < 0) runStart = col;
      if ((solid || col === MAP_W) && runStart >= 0) {
        const len = col - runStart;
        if (len >= minSpan && (!bestRun || len > bestRun.len))
          bestRun = { start: runStart, len };
        runStart = -1;
      }
    }
    if (!bestRun) continue;

    const minTx = bestRun.start + margin;
    const maxTx = bestRun.start + bestRun.len - margin - tw;
    if (maxTx < minTx) continue;

    const mid = minTx + Math.floor((maxTx - minTx) / 2);
    plats.push({
      tx: mid, ty: row, tw,
      dx: (Math.random() < 0.5 ? 1 : -1) * speed,
      minTx, maxTx,
    });
    usedRows.add(row);
  }

  return plats;
}
