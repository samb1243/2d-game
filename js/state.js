// Mutable game state — written by main.js/physics.js, read by everyone
let tiles = [], gems = [], platforms = [], players = [];
let gameRunning = false, startTime = 0, winner = null, animTick = 0, rafId = null;
let showAIDebug = false;

// ── Match settings (single source of truth for the menu + engine) ────────────
// The Settings menu edits `settings`; applySettings() (main.js) turns it into the
// physics `activeCfg` that the level generator, AI and player movement all read.
// `presetName` is just the difficulty badge label — it flips to 'custom' the
// moment a slider is hand-tweaked away from the last preset.
// Defaults mirror the 'medium' preset so the difficulty badge starts honest.
let settings = {
  speedLevel:       3,        // 1..5  → SPEED_LEVELS
  jumpLevel:        2,        // 1..5  → JUMP_LEVELS (2 = classic medium)
  platforms:        3,        // 1..5  → PLAT_DENSITY_LEVELS
  gems:             5,        // 1..10 collectibles per level
  spikes:           'normal', // 'none' | 'normal' | 'heavy'  (stored; level gen wiring is TODO)
  movingBlocks:     true,     // moving-platform hazard on/off
  movingSpeedLevel: 3,        // 1..5  → MOVING_SPEED_LEVELS
};
let activeCfg  = { gravity: 0.55, jump: -9.4, speed: 4.0 }; // rebuilt by applySettings()
let presetName = 'medium';    // 'easy' | 'medium' | 'hard' | 'custom' — drives the HUD badge
let aiOpponent = false;
let wins    = [0, 0];
let flagPos = { col: 28, row: 13 }; // overwritten by generateLevel each game
let setup = [
  { name: 'Player 1', colorIdx: 0, hatIdx: 0 },
  { name: 'Player 2', colorIdx: 1, hatIdx: 0 },
];

const canvas = document.getElementById('game');
const ctx    = canvas.getContext('2d');

const keysDown = {};
const GAME_KEYS = ['a', 'd', 'w', 'ArrowLeft', 'ArrowRight', 'ArrowUp'];

// True while focus is in a text field — so the menu's name inputs accept every
// character (including a/w/d) instead of having those keys swallowed for movement.
function typingInField() {
  const el = document.activeElement;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

document.addEventListener('keydown', e => {
  if (typingInField()) return;            // let the form field handle the keystroke
  keysDown[e.key] = true;
  if (GAME_KEYS.includes(e.key)) e.preventDefault();
  if (e.key === 'p' || e.key === 'P') aiPresetIdx = (aiPresetIdx + 1) % AI_PRESETS.length;
});
document.addEventListener('keyup', e => {
  if (typingInField()) return;
  keysDown[e.key] = false;
});
