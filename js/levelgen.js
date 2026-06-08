function generateLevel(diffKey) {
  const ri = (lo, hi) => Math.floor(Math.random() * (hi - lo + 1)) + lo;

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
  const allPlats = [];
  buildTier(allPlats, 12, ri(5, 7), 4, MAP_W - 5, ri);
  buildTier(allPlats, 10, ri(4, 6), 1, MAP_W - 4, ri);
  buildTier(allPlats,  8, ri(3, 5), 1, MAP_W - 4, ri);
  buildTier(allPlats,  6, ri(2, 4), 1, MAP_W - 4, ri);

  // Add stepping stones so every platform is reachable from the floor.
  ensureReachability(allPlats, ri);

  // Paint platforms onto the grid.
  for (const p of allPlats)
    for (let c = p.col; c < p.col + p.w && c < MAP_W; c++)
      if (p.row >= 3 && p.row < 13) grid[p.row][c] = 1;

  // Flag — pick any elevated platform (row ≤ 10, i.e. T2 or above).
  const elevated  = allPlats.filter(p => p.row <= 10);
  const flagCands = elevated.length > 0 ? elevated : allPlats;
  const flagPlat  = flagCands[ri(0, flagCands.length - 1)];
  const flagPos   = { col: flagPlat.col + Math.floor(flagPlat.w / 2), row: flagPlat.row };

  // Gems
  const gemPos = pickGems(allPlats, flagPlat, GEM_COUNT, grid, ri);

  // Moving platforms — scan the painted grid for empty horizontal runs.
  const platDefs = buildMovingPlats(grid, diffKey, ri);

  return { rows: grid.map(r => r.join('')), gemPos, flagPos, platDefs };
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
// floor (row 14) via jumps. Seed: row 12 platforms are one jump from the floor.
// Propagation: A is reachable if a reachable B sits 1–3 rows below it with
// horizontal gap ≤ 5 − dRow (matches the AI jump-graph rule).
function computeReachable(allPlats) {
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
        const b    = allPlats[j];
        const dr   = b.row - a.row;
        if (dr < 1 || dr > 3) continue;
        const hGap = Math.max(0, a.col - b.col - b.w, b.col - a.col - a.w);
        if (hGap <= 5 - dr) { reach[i] = 1; changed = true; break; }
      }
    }
  }
  return reach;
}

// Inserts stepping stones so that every platform has a jump path to the floor.
// Works bottom-up (worst = closest unreachable to floor) so each stone can
// immediately serve as a bridge for platforms above it.
function ensureReachability(allPlats, ri) {
  for (let pass = 0; pass < 80; pass++) {
    const reach = computeReachable(allPlats);

    let worstIdx = -1, worstRow = -1;
    for (let i = 0; i < allPlats.length; i++)
      if (!reach[i] && allPlats[i].row > worstRow)
        { worstRow = allPlats[i].row; worstIdx = i; }
    if (worstIdx === -1) break;

    const p = allPlats[worstIdx];
    for (let attempt = 0; attempt < 60; attempt++) {
      const dr   = 2;
      const sRow = p.row + dr;
      if (sRow > 12) continue;

      const maxH = 5 - dr - 1;
      const side = Math.random() < 0.5 ? 1 : -1;
      const hOff = ri(0, maxH) * side;
      const sW   = ri(2, 3);
      const sCol = Math.max(1, Math.min(MAP_W - sW - 1,
        p.col + Math.floor(p.w / 2) - Math.floor(sW / 2) + hOff));

      if (!platOverlap(allPlats, sCol, sRow, sW)) {
        allPlats.push({ col: sCol, row: sRow, w: sW, main: false });
        break;
      }
    }
  }
}

// ── Gem placement ──────────────────────────────────────────────────────────

function pickGems(allPlats, flagPlat, count, grid, ri) {
  const eligible = allPlats.filter(p =>
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
function buildMovingPlats(grid, diffKey, ri) {
  const speed   = diffKey === 'custom'
    ? CUSTOM_PLAT_SPEEDS[customSettings.speedLevel]
    : ({ easy: 0.8, medium: 1.4, hard: 2.0 })[diffKey] || 1.4;
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
