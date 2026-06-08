// Mutable game state — written by main.js/physics.js, read by everyone
let tiles = [], gems = [], platforms = [], players = [];
let gameRunning = false, startTime = 0, winner = null, animTick = 0, rafId = null;
let showAIDebug = false;
let diff    = 'medium';
let movingBlocks = true;
let aiOpponent   = false;
let customSettings = { speedLevel: 3, gems: 5, obstacles: 'normal' };
let wins    = [0, 0];
let flagPos = { col: 28, row: 13 }; // overwritten by generateLevel each game
let setup = [
  { name: 'Player 1', colorIdx: 0, hatIdx: 0 },
  { name: 'Player 2', colorIdx: 1, hatIdx: 0 },
];

const canvas = document.getElementById('game');
const ctx    = canvas.getContext('2d');

const keysDown = {};
document.addEventListener('keydown', e => {
  keysDown[e.key] = true;
  if (['a', 'd', 'w', 'ArrowLeft', 'ArrowRight', 'ArrowUp'].includes(e.key)) e.preventDefault();
  if (e.key === 'p' || e.key === 'P') aiPresetIdx = (aiPresetIdx + 1) % AI_PRESETS.length;
});
document.addEventListener('keyup', e => { keysDown[e.key] = false; });
