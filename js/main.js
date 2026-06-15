function makePlayer(id) {
  const s      = setup[id];
  const spawnX = id === 0 ? 2 * TILE : (MAP_W - 3) * TILE;
  const spawnY = 13 * TILE;
  const isAI   = id === 1 && aiOpponent;
  return {
    // AI has a smaller physics hitbox (22×26) than its drawn body (26×30).
    // drawW/drawH drive the visual; w/h drive all collision and AI logic.
    id, w: isAI ? 22 : 26, h: isAI ? 26 : 30,
    ...(isAI && { drawW: 26, drawH: 30 }),
    vx: 0, vy: 0, onGround: false,
    x: spawnX, y: spawnY,
    color:  COLORS[s.colorIdx],
    hatIdx: s.hatIdx,
    name:   s.name,
    keys: id === 0
      ? { left: 'a', right: 'd', up: 'w' }
      : { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp' },
    gemsCollected: 0, finished: false,
    dead: false, deathTimer: 0, onPlatform: null,
    respawnX: spawnX, respawnY: spawnY,
    isAI,
    // Draw-facing AI defaults so the debug overlay never reads undefined before
    // the first AI frame; the working AI state set is initialised in aiInit().
    aiWaypoint: null, aiPath: [], aiTarget: null, aiMoveType: 'walk',
  };
}

// Turn the menu's `settings` levels into the physics `activeCfg` that the level
// generator, AI graph and player movement all read. Called before every level
// build so a mid-session settings change takes effect on the next round.
function applySettings() {
  const j = JUMP_LEVELS[settings.jumpLevel];
  activeCfg.gravity = j.gravity;
  activeCfg.jump    = j.jump;
  activeCfg.speed   = SPEED_LEVELS[settings.speedLevel];
}

function initGame() {
  if (gameMode === 'endless') { initEndless(); return; }

  applySettings();
  GEM_COUNT = settings.gems;

  const level = generateLevel();

  tiles   = level.rows.map(r => r.split('').map(Number));
  flagPos = level.flagPos;

  // Build the live moving-spike entities BEFORE the AI graph, so tagSpikedEdges marks
  // the hops they threaten. tx/minTx/maxTx → pixels exactly as the generator validated.
  movingSpikes = (level.spikeDefs || []).map(d => ({
    x:    d.tx * TILE,
    y:    d.ty * TILE,
    w:    d.tw * TILE,
    h:    TILE,
    dx:   d.dx,
    minX: d.minTx * TILE,
    maxX: d.maxTx * TILE,
  }));

  buildAIGraph();

  platforms = settings.movingBlocks ? level.platDefs.map(d => ({
    x:    d.tx * TILE,
    y:    d.ty * TILE,
    w:    d.tw * TILE,
    h:    TILE / 2,
    dx:   d.dx,
    minX: d.minTx * TILE,
    maxX: d.maxTx * TILE,
  })) : [];

  gems = level.gemPos.map((g, i) => ({
    x:         g.col * TILE + TILE / 2,
    y:         g.row * TILE + TILE / 2,
    collected: [false, false],
    bobOffset: i * 1.2,
  }));

  players     = [makePlayer(0), makePlayer(1)];
  winner      = null;
  gameRunning = true;
  startTime   = performance.now();
  animTick    = 0;
  refreshHUD();
}

// ── Endless mode ──────────────────────────────────────────────────────────────
// An endless player is always human (no AI), spawned at a world point on a backbone
// platform; w/h match a normal player (no AI hitbox shrink).
function makeEndlessPlayer(id, sx, sy) {
  const s = setup[id];
  return {
    id, w: 26, h: 30,
    vx: 0, vy: 0, onGround: false,
    x: sx, y: sy,
    color: COLORS[s.colorIdx], hatIdx: s.hatIdx, name: s.name,
    keys: id === 0
      ? { left: 'a', right: 'd', up: 'w' }
      : { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp' },
    gemsCollected: 0, finished: false,
    dead: false, deathTimer: 0, onPlatform: null,
    respawnX: sx, respawnY: sy, isAI: false,
  };
}

function initEndless() {
  applySettings();
  const M = buildJumpModel(activeCfg);
  endlessSeed  = (Math.random() * 2147483647) | 0;     // fresh world each run
  endlessWorld = buildEndlessWorld(endlessSeed, M, { gemChance: 0.5 });
  endlessGems  = new Map();
  platforms    = [];     // clear any moving platforms left over from a classic game

  // Spawn both players standing on backbone platforms at the origin tier (a couple
  // of slots apart), feet resting on the platform surface.
  const p0 = endlessWorld.plat(0, 0), p1 = endlessWorld.plat(0, 2);
  const sx0 = (p0.col + (p0.w >> 1)) * TILE, sy0 = p0.row * TILE - 30;
  const sx1 = (p1.col + (p1.w >> 1)) * TILE, sy1 = p1.row * TILE - 30;
  players = [makeEndlessPlayer(0, sx0, sy0), makeEndlessPlayer(1, sx1, sy1)];

  cameras = [{ x: sx0 + 13, y: sy0 + 15 }, { x: sx1 + 13, y: sy1 + 15 }];

  // End flag: a shared goal a mostly-horizontal journey away (direction + small
  // vertical offset chosen from the seed). Snapped onto a backbone platform so it is
  // always reachable, and placed far enough that reaching it in time is the real
  // race. Distance scales with the time limit; tune via DIST_BASE/DIST_PER_SEC.
  const DIST_BASE = 24, DIST_PER_SEC = 0.45;
  const dist = Math.round(DIST_BASE + timeLimit * DIST_PER_SEC);
  const sign = (endlessSeed & 1) ? 1 : -1;
  const vOff = ((endlessSeed >> 1) % 17) - 8;          // ±8 tiers of vertical offset
  const fp   = endlessWorld.platNear(p0.col + sign * dist, vOff * 2);
  endlessFlag = { col: fp.col + (fp.w >> 1), row: fp.row };

  winner      = null;
  gameRunning = true;
  startTime   = performance.now();
  animTick    = 0;
  refreshHUD();
}

// Stream the deterministic gems near a player into the persistent collected-state
// map (so a gem's collected flags survive while it stays in range).
function materializeGemsAround(p) {
  const cc = Math.floor((p.x + p.w / 2) / TILE), cr = Math.floor((p.y + p.h / 2) / TILE);
  const R  = 16;
  for (const g of endlessWorld.gemsInRect(cc - R, cr - R, cc + R, cr + R)) {
    const key = g.col + ',' + g.row;
    if (!endlessGems.has(key))
      endlessGems.set(key, {
        col: g.col, row: g.row,
        x: g.col * TILE + TILE / 2, y: g.row * TILE + TILE / 2,
        collected: [false, false],
      });
  }
}

function updateEndless() {
  players.forEach(materializeGemsAround);
  players.forEach(updatePlayer);

  for (let i = 0; i < 2; i++) {                 // cameras ease toward their player
    const p = players[i], cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    cameras[i].x += (cx - cameras[i].x) * 0.12;
    cameras[i].y += (cy - cameras[i].y) * 0.12;
  }

  // Run ends when both players have reached the flag, or the timer expires.
  if (players.every(p => p.finished)) { endEndless(); return; }

  const remaining = timeLimit - (performance.now() - startTime) / 1000;
  document.getElementById('timer-display').textContent = Math.max(0, remaining).toFixed(1) + 's';
  if (remaining <= 0) endEndless();
}

function loop() {
  if (!gameRunning) return;
  animTick++;

  if (gameMode === 'endless') {
    updateEndless();
    drawEndless();
    rafId = requestAnimationFrame(loop);
    return;
  }

  updatePlatforms();
  updateMovingSpikes();
  players.forEach(updatePlayer);

  document.getElementById('timer-display').textContent =
    ((performance.now() - startTime) / 1000).toFixed(1) + 's';

  ctx.clearRect(0, 0, W, H);
  drawBG();
  drawTiles();
  drawPlatforms();
  drawMovingSpikes();
  drawFlag();
  drawGems();
  players.forEach(drawPlayer);
  players.forEach(drawAIDebug);
  players.forEach(drawDeathNotice);

  rafId = requestAnimationFrame(loop);
}

// Boot — build the menu/settings screens and reflect current settings
initMenu();
