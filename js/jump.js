// ── Physics-derived jump model ──────────────────────────────────────────────
// The single source of truth for "can the character clear this jump?".
//
// Both the AI navigation graph (ai.js) and the level generator (levelgen.js)
// ask this model the same questions, so every level we build is guaranteed to
// be completable with the exact movement settings the character is running —
// no magic numbers that drift out of sync with the physics.
//
// We integrate the SAME discrete step updatePlayer() uses each frame:
//   on the jump frame  → vy = cfg.jump
//   every frame after  → vy += cfg.gravity;  y += vy
// Horizontal travel assumes a running start (vx already at cfg.speed) and folds
// a safety margin in to cover acceleration lag and an imperfect take-off spot.

function buildJumpModel(cfg, tile) {
  tile = tile || (typeof TILE !== 'undefined' ? TILE : 32);
  const g = cfg.gravity, v0 = cfg.jump, speed = cfg.speed;

  // Jump arc: heightUp[k] = pixels above take-off after k physics frames.
  // Simulated until the body has fallen well below take-off, so the same arc
  // also answers "how far can I travel while falling onto something lower?".
  const heightUp = [0];
  let vy = v0, dy = 0, peak = 0;
  for (let k = 1; k <= 600; k++) {
    vy += g; dy += vy;
    const h = -dy;
    heightUp.push(h);
    if (h > peak) peak = h;
    if (h < -tile * 12) break;
  }

  // Walk-off fall arc (no jump, vy starts at 0): fallDepth[k] = px below edge.
  const fallDepth = [0];
  let fvy = 0, fdy = 0;
  for (let k = 1; k <= 600; k++) {
    fvy += g; fdy += fvy;
    fallDepth.push(fdy);
    if (fdy > tile * 14) break;
  }

  const RISE_CLEAR = 0.20 * tile;  // headroom needed above a platform top to land
  const GAP_SAFETY = 0.90 * tile;  // horizontal slack for take-off / air-control lag
  const EPS        = 1e-6;

  // Latest frame whose height is still ≥ hpx (the descent crossing — the point
  // at which the most horizontal distance has been covered while still high
  // enough to drop onto the target).
  const lastFrameAtHeight = (hpx) => {
    for (let k = heightUp.length - 1; k >= 0; k--)
      if (heightUp[k] >= hpx) return k;
    return -1;
  };
  // Frames to fall dpx by walking off an edge (no jump).
  const framesToFall = (dpx) => {
    for (let k = 1; k < fallDepth.length; k++)
      if (fallDepth[k] >= dpx) return k;
    return fallDepth.length - 1;
  };

  // Highest platform, in whole tiles, the character can actually land on.
  let maxRiseTiles = 0;
  while ((maxRiseTiles + 1) * tile <= peak - RISE_CLEAR) maxRiseTiles++;

  const LEDGE_BODY = 0.85 * tile;  // extra reach to land the BODY onto a higher ledge

  // Can a jump rise `dRowUp` tiles and clear `hGapTiles` empty columns between
  // the take-off edge and the landing edge?
  //
  // For an UP jump there's an extra constraint the raw descent-reach misses: to
  // land you must get the whole body PAST the ledge's near face while the feet
  // are still above its top (otherwise you clip the face and fall). That happens
  // around the apex, not the late descent, so an up jump needs ~a body width of
  // additional horizontal slack beyond a same-level hop.
  function canJumpUp(dRowUp, hGapTiles) {
    if (dRowUp < 0) return false;
    const upPx = dRowUp * tile;
    if (upPx > peak - RISE_CLEAR + EPS) return false;     // can't get high enough
    const k = lastFrameAtHeight(upPx);
    if (k < 1) return false;
    const extra = dRowUp > 0 ? LEDGE_BODY : 0;
    return hGapTiles * tile <= speed * k - GAP_SAFETY - extra + EPS;
  }

  // Same-level gap — a jump with no net rise.
  function canCross(hGapTiles) { return canJumpUp(0, hGapTiles); }

  // Drop `dRowDown` tiles across `hGapTiles` empty columns by walking off the
  // edge and falling. The character may also jump to extend a drop, so treating
  // it as a plain walk-off fall is deliberately conservative.
  function canDrop(dRowDown, hGapTiles) {
    if (dRowDown <= 0) return canCross(hGapTiles);
    const k = framesToFall(dRowDown * tile);
    return hGapTiles * tile <= speed * k - GAP_SAFETY + EPS;
  }

  // Max horizontal gap (in tiles) reachable for a given rise — handy for the
  // level generator when it places stepping stones within jump range.
  function maxGapTilesForRise(dRowUp) {
    const upPx = dRowUp * tile;
    if (upPx > peak - RISE_CLEAR + EPS) return -1;
    const k = lastFrameAtHeight(upPx);
    if (k < 1) return -1;
    const extra = dRowUp > 0 ? LEDGE_BODY : 0;
    return Math.floor((speed * k - GAP_SAFETY - extra) / tile + EPS);
  }

  return {
    peak, maxRiseTiles, speed,
    canJumpUp, canCross, canDrop, maxGapTilesForRise,
  };
}

// Node export (the browser just uses the global function).
if (typeof module !== 'undefined' && module.exports) module.exports = { buildJumpModel };
