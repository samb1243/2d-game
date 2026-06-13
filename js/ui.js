// ── In-game UI ───────────────────────────────────────────────────────────────
// HUD, win/end screen and the in-game control bar. The main menu and the
// settings screen live in menu.js — this file only touches things that are
// visible while a match is running or just after it ends.

// ── HUD ──────────────────────────────────────────
function refreshHUD() {
  if (!players.length) return;
  const [p1, p2] = players;

  // Endless: gem score per player, no win count / difficulty badge.
  if (gameMode === 'endless') {
    document.getElementById('h1-name').textContent = p1.name;
    document.getElementById('h1-name').style.color = p1.color;
    document.getElementById('h1-gems').textContent = `${p1.gemsCollected} gems`;
    document.getElementById('h1-wins').textContent = p1.finished ? '✓ flag reached' : '';
    document.getElementById('h2-name').textContent = p2.name;
    document.getElementById('h2-name').style.color = p2.color;
    document.getElementById('h2-gems').textContent = `${p2.gemsCollected} gems`;
    document.getElementById('h2-wins').textContent = p2.finished ? '✓ flag reached' : '';
    document.getElementById('diff-badge').textContent = 'ENDLESS';
    document.getElementById('diff-badge').style.color = '#c9f';
    return;
  }

  const badge = PRESETS[presetName] || PRESETS.custom;

  document.getElementById('h1-name').textContent  = p1.name;
  document.getElementById('h1-name').style.color  = p1.color;
  document.getElementById('h1-gems').textContent  = `${p1.gemsCollected} / ${GEM_COUNT} gems`;
  document.getElementById('h1-wins').textContent  = `${wins[0]} wins`;

  document.getElementById('h2-name').textContent  = p2.name;
  document.getElementById('h2-name').style.color  = p2.color;
  document.getElementById('h2-gems').textContent  = `${p2.gemsCollected} / ${GEM_COUNT} gems`;
  document.getElementById('h2-wins').textContent  = `${wins[1]} wins`;

  document.getElementById('diff-badge').textContent  = badge.label;
  document.getElementById('diff-badge').style.color  = badge.color;
}

// ── Win / end screen ─────────────────────────────
function endGame() {
  gameRunning = false;
  wins[winner.id]++;
  const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

  document.getElementById('win-title').textContent   = `${winner.name} Wins!`;
  document.getElementById('win-title').style.color   = winner.color;
  document.getElementById('win-time').textContent    = `Time: ${elapsed}s`;

  document.getElementById('sb1-name').textContent    = players[0].name;
  document.getElementById('sb1-name').style.color    = players[0].color;
  document.getElementById('sb1-wins').textContent    = wins[0];
  document.getElementById('sb1-wins').style.color    = players[0].color;

  document.getElementById('sb2-name').textContent    = players[1].name;
  document.getElementById('sb2-name').style.color    = players[1].color;
  document.getElementById('sb2-wins').textContent    = wins[1];
  document.getElementById('sb2-wins').style.color    = players[1].color;

  document.querySelectorAll('.sb-label').forEach(e => e.textContent = 'WINS');
  document.getElementById('win-overlay').classList.remove('hidden');
}

// Endless run over. Gems only count if that player reached the flag in time;
// otherwise their score is 0 and they lose. Winner is the most gems among finishers.
function endEndless() {
  gameRunning = false;
  const [p1, p2] = players;
  const s1 = p1.finished ? p1.gemsCollected : -1;   // -1 → any finisher outranks them
  const s2 = p2.finished ? p2.gemsCollected : -1;
  const win = s1 === s2 ? null : (s1 > s2 ? p1 : p2);

  document.getElementById('win-title').textContent =
    win ? `${win.name} Wins!`
        : (p1.finished || p2.finished) ? "It's a Tie!" : 'Nobody reached the flag!';
  document.getElementById('win-title').style.color = win ? win.color : '#fff';
  document.getElementById('win-time').textContent =
    (p1.finished && p2.finished) ? 'Both reached the flag!' : "Time's up!";

  fillEndlessScore('sb1', p1);
  fillEndlessScore('sb2', p2);
  document.querySelectorAll('.sb-label').forEach(e => e.textContent = 'GEMS');
  document.getElementById('win-overlay').classList.remove('hidden');
}

// One scoreboard row for endless: gem count if the flag was reached, else "✗".
function fillEndlessScore(id, p) {
  document.getElementById(id + '-name').textContent = p.name;
  document.getElementById(id + '-name').style.color = p.color;
  const wEl = document.getElementById(id + '-wins');
  wEl.textContent  = p.finished ? p.gemsCollected : '✗';
  wEl.style.color  = p.finished ? p.color : 'rgba(255,255,255,0.45)';
}

// ── In-game control bar ──────────────────────────
const gameControls = document.getElementById('game-controls');
function showGameControls() { gameControls.classList.remove('hidden'); }
function hideGameControls() { gameControls.classList.add('hidden'); }

// ── Button wiring ────────────────────────────────
document.getElementById('debug-btn').addEventListener('click', () => {
  showAIDebug = !showAIDebug;
  document.getElementById('debug-btn').style.opacity = showAIDebug ? '1' : '0.5';
});

document.getElementById('restart-btn').addEventListener('click', () => {
  cancelAnimationFrame(rafId);
  initGame();
  rafId = requestAnimationFrame(loop);
});

document.getElementById('menu-btn').addEventListener('click', goToMenu);

document.getElementById('again-btn').addEventListener('click', () => {
  document.getElementById('win-overlay').classList.add('hidden');
  showGameControls();
  cancelAnimationFrame(rafId);
  initGame();
  rafId = requestAnimationFrame(loop);
});

document.getElementById('settings-btn').addEventListener('click', () => {
  document.getElementById('win-overlay').classList.add('hidden');
  goToMenu();
});
