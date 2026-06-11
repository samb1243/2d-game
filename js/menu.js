// ── Menu & settings screens ───────────────────────────────────────────────────
// Everything the player sees before a match: the main menu (names / colours /
// hats / AI opponent) and a dedicated, readable Settings screen. This module is
// deliberately independent of the running game — it only writes to the shared
// `settings`, `setup`, `aiOpponent` and `presetName` state, so menu input can no
// longer leak into gameplay (and gameplay keys no longer eat menu typing).

// Human-readable words for each 1..5 slider level (UI only).
const SPEED_WORDS  = [null, 'Very Slow', 'Slow',   'Normal', 'Fast',   'Very Fast'];
const JUMP_WORDS   = [null, 'Low',       'Normal', 'High',   'Higher', 'Super Jump'];
const PLAT_WORDS   = [null, 'Sparse',    'Light',  'Normal', 'Busy',   'Packed'];
const MOVE_WORDS   = [null, 'Crawl',     'Slow',   'Normal', 'Fast',   'Zoom'];

// ── Element shortcuts ────────────────────────────
const $ = (id) => document.getElementById(id);

// ── Main menu: player colour & hat pickers ───────
function buildPlayerCards() {
  for (let pid = 0; pid < 2; pid++) {
    const colorCont = $(`p${pid + 1}-colors`);
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

    const hatCont = $(`p${pid + 1}-hats`);
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
}

// ── Settings screen wiring ───────────────────────

// Apply a preset's level values into `settings`, mark it active, reflect the UI.
function applyPreset(name) {
  const p = PRESETS[name];
  if (!p) return;
  SETTING_KEYS.forEach(k => { settings[k] = p[k]; });
  presetName = name;
  syncSettingsUI();
}

// Any hand-edit drops us out of a named preset and onto "Custom".
function markCustom() {
  presetName = 'custom';
  highlightPreset();
}

function highlightPreset() {
  document.querySelectorAll('.preset-btn')
    .forEach(b => b.classList.toggle('selected', b.dataset.p === presetName));
}

function wireSettings() {
  // Difficulty presets
  document.querySelectorAll('.preset-btn').forEach(btn =>
    btn.addEventListener('click', () => applyPreset(btn.dataset.p)));

  // Level sliders (speed / jump / platforms / moving-platform speed)
  const slider = (id, key, words, valId) => {
    $(id).addEventListener('input', e => {
      settings[key] = Number(e.target.value);
      $(valId).textContent = words[settings[key]];
      markCustom();
    });
  };
  slider('set-speed',        'speedLevel',       SPEED_WORDS, 'set-speed-val');
  slider('set-jump',         'jumpLevel',        JUMP_WORDS,  'set-jump-val');
  slider('set-plat',         'platforms',        PLAT_WORDS,  'set-plat-val');
  slider('set-moving-speed', 'movingSpeedLevel', MOVE_WORDS,  'set-moving-speed-val');

  // Gems stepper (1..10)
  $('set-gems-dec').addEventListener('click', () => {
    if (settings.gems > 1)  { settings.gems--; $('set-gems-val').textContent = settings.gems; markCustom(); }
  });
  $('set-gems-inc').addEventListener('click', () => {
    if (settings.gems < 10) { settings.gems++; $('set-gems-val').textContent = settings.gems; markCustom(); }
  });

  // Spikes segmented control
  document.querySelectorAll('.spike-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      settings.spikes = btn.dataset.s;
      document.querySelectorAll('.spike-btn').forEach(b => b.classList.toggle('selected', b === btn));
      markCustom();
    }));

  // Moving platforms toggle (greys out the moving-speed slider when off)
  $('set-moving').addEventListener('change', e => {
    settings.movingBlocks = e.target.checked;
    $('set-moving-speed').disabled = !settings.movingBlocks;
    $('moving-speed-row').classList.toggle('disabled', !settings.movingBlocks);
    markCustom();
  });

  // Navigation
  $('open-settings-btn').addEventListener('click', openSettings);
  $('settings-done').addEventListener('click', closeSettings);
}

// Push current `settings` into every settings-screen control.
function syncSettingsUI() {
  $('set-speed').value = settings.speedLevel;
  $('set-speed-val').textContent = SPEED_WORDS[settings.speedLevel];
  $('set-jump').value = settings.jumpLevel;
  $('set-jump-val').textContent = JUMP_WORDS[settings.jumpLevel];
  $('set-plat').value = settings.platforms;
  $('set-plat-val').textContent = PLAT_WORDS[settings.platforms];
  $('set-gems-val').textContent = settings.gems;
  document.querySelectorAll('.spike-btn')
    .forEach(b => b.classList.toggle('selected', b.dataset.s === settings.spikes));
  $('set-moving').checked = settings.movingBlocks;
  $('set-moving-speed').value = settings.movingSpeedLevel;
  $('set-moving-speed-val').textContent = MOVE_WORDS[settings.movingSpeedLevel];
  $('set-moving-speed').disabled = !settings.movingBlocks;
  $('moving-speed-row').classList.toggle('disabled', !settings.movingBlocks);
  highlightPreset();
}

// Reflect player names / AI toggle on the main menu.
function syncMenuUI() {
  for (let pid = 0; pid < 2; pid++) {
    $(`p${pid + 1}-name`).value = setup[pid].name;
    $(`p${pid + 1}-colors`).querySelectorAll('.swatch')
      .forEach((s, i) => s.classList.toggle('selected', i === setup[pid].colorIdx));
    $(`p${pid + 1}-hats`).querySelectorAll('.hat-btn')
      .forEach((b, i) => b.classList.toggle('selected', i === setup[pid].hatIdx));
  }
  $('ai-toggle').checked = aiOpponent;
  $('p2-sub').textContent = aiOpponent ? '· CPU' : '· Arrow Keys';
}

// ── Screen navigation ────────────────────────────
function openSettings() {
  syncSettingsUI();
  $('menu-overlay').classList.add('hidden');
  $('settings-overlay').classList.remove('hidden');
}

function closeSettings() {
  $('settings-overlay').classList.add('hidden');
  $('menu-overlay').classList.remove('hidden');
}

// Return to the main menu from anywhere (in-game bar, win screen, settings).
function goToMenu() {
  gameRunning = false;
  hideGameControls();
  $('settings-overlay').classList.add('hidden');
  $('win-overlay').classList.add('hidden');
  syncMenuUI();
  $('menu-overlay').classList.remove('hidden');
}

function startGame() {
  setup[0].name = $('p1-name').value.trim() || 'Player 1';
  setup[1].name = $('p2-name').value.trim() || 'Player 2';
  $('menu-overlay').classList.add('hidden');
  showGameControls();
  initGame();
  rafId = requestAnimationFrame(loop);
}

// ── Boot ─────────────────────────────────────────
// Called once from main.js: build the dynamic pickers, wire every control, and
// reflect the initial settings into both screens.
function initMenu() {
  buildPlayerCards();
  wireSettings();

  $('ai-toggle').addEventListener('change', e => {
    aiOpponent = e.target.checked;
    $('p2-sub').textContent = aiOpponent ? '· CPU' : '· Arrow Keys';
  });
  $('start-btn').addEventListener('click', startGame);

  syncMenuUI();
  syncSettingsUI();
}
