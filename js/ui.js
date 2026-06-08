// ── Setup screen ─────────────────────────────────
function buildSetupUI() {
  for (let pid = 0; pid < 2; pid++) {
    const colorCont = document.getElementById(`p${pid + 1}-colors`);
    colorCont.innerHTML = '';
    COLORS.forEach((c, i) => {
      const el = document.createElement('div');
      el.className = 'swatch' + (setup[pid].colorIdx === i ? ' selected' : '');
      el.style.background = c;
      el.title = COLOR_NAMES[i];
      el.addEventListener('click', () => {
        setup[pid].colorIdx = i;
        colorCont.querySelectorAll('.swatch').forEach((s, j) => s.classList.toggle('selected', j === i));
      });
      colorCont.appendChild(el);
    });

    const hatCont = document.getElementById(`p${pid + 1}-hats`);
    hatCont.innerHTML = '';
    HATS.forEach((h, i) => {
      const btn = document.createElement('button');
      btn.className = 'hat-btn' + (setup[pid].hatIdx === i ? ' selected' : '');
      btn.innerHTML = `${HAT_ICONS[i]}<br><span style="opacity:0.7">${h}</span>`;
      btn.addEventListener('click', () => {
        setup[pid].hatIdx = i;
        hatCont.querySelectorAll('.hat-btn').forEach((b, j) => b.classList.toggle('selected', j === i));
      });
      hatCont.appendChild(btn);
    });
  }

  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      diff = btn.dataset.d;
      document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      document.getElementById('diff-desc').textContent = DIFF[diff].desc;
      document.getElementById('custom-panel').classList.toggle('hidden', diff !== 'custom');
    });
  });

  document.getElementById('c-speed').addEventListener('input', e => {
    customSettings.speedLevel = Number(e.target.value);
    document.getElementById('c-speed-val').textContent = e.target.value;
  });

  document.getElementById('c-gems-dec').addEventListener('click', () => {
    if (customSettings.gems > 1) {
      customSettings.gems--;
      document.getElementById('c-gems-val').textContent = customSettings.gems;
    }
  });
  document.getElementById('c-gems-inc').addEventListener('click', () => {
    if (customSettings.gems < 10) {
      customSettings.gems++;
      document.getElementById('c-gems-val').textContent = customSettings.gems;
    }
  });

  document.querySelectorAll('.obs-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      customSettings.obstacles = btn.dataset.o;
      document.querySelectorAll('.obs-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  document.getElementById('moving-toggle').addEventListener('change', e => {
    movingBlocks = e.target.checked;
  });

  document.getElementById('ai-toggle').addEventListener('change', e => {
    aiOpponent = e.target.checked;
    document.getElementById('p2-sub').textContent = aiOpponent ? '· CPU' : '· Arrow Keys';
  });
}

// ── HUD ──────────────────────────────────────────
function refreshHUD() {
  if (!players.length) return;
  const cfg     = DIFF[diff];
  const [p1, p2] = players;

  document.getElementById('h1-name').textContent  = p1.name;
  document.getElementById('h1-name').style.color  = p1.color;
  document.getElementById('h1-gems').textContent  = `${p1.gemsCollected} / ${GEM_COUNT} gems`;
  document.getElementById('h1-wins').textContent  = `${wins[0]} wins`;

  document.getElementById('h2-name').textContent  = p2.name;
  document.getElementById('h2-name').style.color  = p2.color;
  document.getElementById('h2-gems').textContent  = `${p2.gemsCollected} / ${GEM_COUNT} gems`;
  document.getElementById('h2-wins').textContent  = `${wins[1]} wins`;

  document.getElementById('diff-badge').textContent  = cfg.label;
  document.getElementById('diff-badge').style.color  = cfg.color;
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

  document.getElementById('win-overlay').classList.remove('hidden');
}

// ── In-game control bar ──────────────────────────
const gameControls = document.getElementById('game-controls');
function showGameControls() { gameControls.classList.remove('hidden'); }
function hideGameControls() { gameControls.classList.add('hidden'); }

// Rebuilds the setup screen's visual state from the setup[] / diff source of truth.
// Called every time the setup screen opens so it always reflects current settings.
function syncSetupUI() {
  for (let pid = 0; pid < 2; pid++) {
    document.getElementById(`p${pid + 1}-name`).value = setup[pid].name;
    document.getElementById(`p${pid + 1}-colors`).querySelectorAll('.swatch')
      .forEach((s, i) => s.classList.toggle('selected', i === setup[pid].colorIdx));
    document.getElementById(`p${pid + 1}-hats`).querySelectorAll('.hat-btn')
      .forEach((b, i) => b.classList.toggle('selected', i === setup[pid].hatIdx));
  }
  document.querySelectorAll('.diff-btn')
    .forEach(b => b.classList.toggle('selected', b.dataset.d === diff));
  document.getElementById('diff-desc').textContent = DIFF[diff].desc;
  document.getElementById('custom-panel').classList.toggle('hidden', diff !== 'custom');
  document.getElementById('c-speed').value = customSettings.speedLevel;
  document.getElementById('c-speed-val').textContent = customSettings.speedLevel;
  document.getElementById('c-gems-val').textContent = customSettings.gems;
  document.querySelectorAll('.obs-btn')
    .forEach(b => b.classList.toggle('selected', b.dataset.o === customSettings.obstacles));
  document.getElementById('moving-toggle').checked = movingBlocks;
  document.getElementById('ai-toggle').checked = aiOpponent;
  document.getElementById('p2-sub').textContent = aiOpponent ? '· CPU' : '· Arrow Keys';
}

function goToMenu() {
  gameRunning = false;
  hideGameControls();
  syncSetupUI();
  document.getElementById('setup-overlay').classList.remove('hidden');
}

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

document.getElementById('start-btn').addEventListener('click', () => {
  setup[0].name = document.getElementById('p1-name').value.trim() || 'Player 1';
  setup[1].name = document.getElementById('p2-name').value.trim() || 'Player 2';
  document.getElementById('setup-overlay').classList.add('hidden');
  showGameControls();
  initGame();
  rafId = requestAnimationFrame(loop);
});

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
