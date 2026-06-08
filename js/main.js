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
    aiStuckTimer: 0, aiLastX: spawnX, aiWaypoint: null,
    aiPath: [], aiTarget: null, aiMoveType: 'walk',
    aiPlanSeg: -1, aiPlanTarget: null, aiWaypointDeadline: 0,
  };
}

function initGame() {
  GEM_COUNT = diff === 'custom' ? customSettings.gems : 5;
  if (diff === 'custom') DIFF.custom.speed = CUSTOM_SPEED_LEVELS[customSettings.speedLevel];

  const level = generateLevel(diff);

  tiles   = level.rows.map(r => r.split('').map(Number));
  flagPos = level.flagPos;
  buildAIGraph();

  platforms = movingBlocks ? level.platDefs.map(d => ({
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

function loop() {
  if (!gameRunning) return;
  animTick++;
  updatePlatforms();
  players.forEach(updatePlayer);

  document.getElementById('timer-display').textContent =
    ((performance.now() - startTime) / 1000).toFixed(1) + 's';

  ctx.clearRect(0, 0, W, H);
  drawBG();
  drawTiles();
  drawPlatforms();
  drawFlag();
  drawGems();
  players.forEach(drawPlayer);
  players.forEach(drawAIDebug);
  players.forEach(drawDeathNotice);

  rafId = requestAnimationFrame(loop);
}

// Boot — build event listeners then sync the visual state
buildSetupUI();
syncSetupUI();
