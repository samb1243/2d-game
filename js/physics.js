function tileAt(c, r) {
  // Endless mode reads the infinite procedural world (no bounds, no walls).
  if (gameMode === 'endless') return endlessWorld ? endlessWorld.tileAt(c, r) : 0;
  if (c < 0 || c >= MAP_W || r < 0 || r >= MAP_H) return 1;
  return tiles[r][c];
}

// Push the player out of any solid tiles on the X axis only.
// Uses minimum penetration depth so the direction is always correct,
// even when vx is zero (e.g. carried by a moving platform).
function resolveX(p) {
  const L = Math.floor(p.x / TILE),       R = Math.floor((p.x + p.w - 1) / TILE);
  const T = Math.floor(p.y / TILE),       B = Math.floor((p.y + p.h - 1) / TILE);
  for (let r = T; r <= B; r++) {
    for (let c = L; c <= R; c++) {
      if (tileAt(c, r) !== 1) continue;
      const tx = c * TILE;
      const penR = (p.x + p.w) - tx;       // penetration entering from the left
      const penL = (tx + TILE) - p.x;      // penetration entering from the right
      if (penR < penL) p.x = tx - p.w;
      else              p.x = tx + TILE;
      p.vx = 0;
      return;
    }
  }
}

// Push the player out of any solid tiles on the Y axis only.
function resolveY(p) {
  // Endless has no solid floor and no bottom — there is always a tier below, so a
  // fall just lands you lower; never a death.
  if (gameMode !== 'endless' && p.y > H + 60) { killPlayer(p); return; }
  const L = Math.floor(p.x / TILE),       R = Math.floor((p.x + p.w - 1) / TILE);
  const T = Math.floor(p.y / TILE),       B = Math.floor((p.y + p.h - 1) / TILE);
  for (let r = T; r <= B; r++) {
    for (let c = L; c <= R; c++) {
      if (tileAt(c, r) !== 1) continue;
      const ty = r * TILE;
      const penD = (p.y + p.h) - ty;       // penetration entering from above
      const penU = (ty + TILE) - p.y;      // penetration entering from below
      if (penD < penU) { p.y = ty - p.h; p.vy = 0; p.onGround = true; }
      else              { p.y = ty + TILE; p.vy = 0; }
      return;
    }
  }
}

// Spike contact is checked after both axes are resolved so solid-tile
// pushes happen first (player can brush a spike corner without dying).
// Spikes only fill the lower part of their tile (see drawTiles), so the lethal
// region starts ~a third of the way down — a body whose lowest point is still
// above the spike tips is just grazing the empty air above them and survives.
// This is what lets a jumper clear a spike sitting on a floor/platform surface:
// while airborne over it the feet are above the tips, so no contact.
const SPIKE_TIP = TILE * 0.34;   // lethal band top, measured from the cell's top

function checkSpikes(p) {
  if (p.dead) return;
  const feet = p.y + p.h;
  const L = Math.floor(p.x / TILE),       R = Math.floor((p.x + p.w - 1) / TILE);
  const T = Math.floor(p.y / TILE),       B = Math.floor((p.y + p.h - 1) / TILE);
  for (let r = T; r <= B; r++)
    for (let c = L; c <= R; c++)
      if (tileAt(c, r) === 2 && feet > r * TILE + SPIKE_TIP) { killPlayer(p); return; }
}

function resolvePlatforms(p) {
  p.onPlatform = null;
  for (const pl of platforms) {
    const overlapX = p.x + p.w > pl.x && p.x < pl.x + pl.w;
    const feet     = p.y + p.h;
    if (overlapX && feet >= pl.y && feet <= pl.y + pl.h + 8 && p.vy >= 0 && feet - p.vy <= pl.y + 3) {
      p.y = pl.y - p.h; p.vy = 0; p.onGround = true; p.onPlatform = pl;
    }
  }
}

function killPlayer(p)    { p.dead = true; p.deathTimer = 72; p.vx = p.vy = 0; }
function respawnPlayer(p) { p.x = p.respawnX; p.y = p.respawnY; p.vx = p.vy = 0; p.dead = false; p.onGround = false; }

// Endless pickup: scan the gems materialised near the players (main.js) and credit
// any the player is touching. Each gem tracks per-player collected flags so both
// racers can grab the same gem.
function collectEndlessGems(p) {
  const pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;
  for (const g of endlessGems.values()) {
    if (g.collected[p.id]) continue;
    if (Math.abs(pcx - g.x) < 22 && Math.abs(pcy - g.y) < 22) {
      g.collected[p.id] = true;
      p.gemsCollected++;
      refreshHUD();
    }
  }
}

// Endless goal: touching the flag finishes the player (locks in their gem score).
// updatePlayer skips finished players, so they stop and wait out the timer.
function checkEndlessFlag(p) {
  if (p.finished) return;
  const fx = endlessFlag.col * TILE + TILE / 2, fy = endlessFlag.row * TILE + TILE / 2;
  if (Math.abs(p.x + p.w / 2 - fx) < 34 && Math.abs(p.y + p.h / 2 - fy) < 42) {
    p.finished = true;
    refreshHUD();
  }
}

function updatePlayer(p) {
  if (p.finished) return;
  if (p.dead) { if (--p.deathTimer <= 0) respawnPlayer(p); return; }

  const cfg = activeCfg;

  if (p.isAI) {
    applyAIInput(p, cfg);
  } else {
    if      (keysDown[p.keys.left])  p.vx = -cfg.speed;
    else if (keysDown[p.keys.right]) p.vx =  cfg.speed;
    else p.vx *= 0.8;
    if (keysDown[p.keys.up] && p.onGround) { p.vy = cfg.jump; p.onGround = false; }
  }

  p.vy += cfg.gravity;
  p.onGround = false;

  if (p.onPlatform) p.x += p.onPlatform.dx;

  p.x += p.vx; resolveX(p);
  p.y += p.vy; resolveY(p);
  checkSpikes(p);
  resolvePlatforms(p);

  // Endless: no edge clamp (infinite). Grab nearby gems and check the goal flag.
  if (gameMode === 'endless') { collectEndlessGems(p); checkEndlessFlag(p); return; }

  p.x = Math.max(0, Math.min(p.x, MAP_W * TILE - p.w));

  for (const g of gems) {
    if (!g.collected[p.id]) {
      const dx = p.x + p.w / 2 - g.x, dy = p.y + p.h / 2 - g.y;
      if (Math.abs(dx) < 22 && Math.abs(dy) < 22) {
        g.collected[p.id] = true;
        p.gemsCollected++;
        refreshHUD();
      }
    }
  }

  if (p.gemsCollected >= GEM_COUNT && !winner) {
    const fx = flagPos.col * TILE + TILE / 2, fy = flagPos.row * TILE + TILE / 2;
    if (Math.abs(p.x + p.w / 2 - fx) < 34 && Math.abs(p.y + p.h / 2 - fy) < 42) {
      p.finished = true; winner = p; endGame();
    }
  }
}

function platformHitsSolid(pl) {
  const r1 = Math.floor(pl.y / TILE);
  const r2 = Math.floor((pl.y + pl.h - 1) / TILE);
  const c1 = Math.floor(pl.x / TILE);
  const c2 = Math.floor((pl.x + pl.w - 1) / TILE);
  for (let r = r1; r <= r2; r++)
    for (let c = c1; c <= c2; c++)
      if (tileAt(c, r) === 1) return true;
  return false;
}

function updatePlatforms() {
  for (const pl of platforms) {
    const prevX = pl.x;
    pl.x += pl.dx;
    if (pl.x <= pl.minX || pl.x + pl.w >= pl.maxX || platformHitsSolid(pl)) {
      pl.x = prevX;
      pl.dx *= -1;
    }
  }
}
