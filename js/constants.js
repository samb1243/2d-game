const TILE = 32, MAP_W = 30, MAP_H = 17;
let GEM_COUNT = 5;
const W = 960, H = 540;

const COLORS      = ['#4af', '#f84', '#4d9', '#b47eff', '#ff4fa0', '#ffe040'];
const COLOR_NAMES = ['Blue', 'Orange', 'Green', 'Purple', 'Pink', 'Yellow'];

const HATS      = ['None', 'Helmet', 'Crown'];
const HAT_ICONS = ['—', '⛑', '♛'];

const CUSTOM_SPEED_LEVELS = [null, 2.5, 3.2, 4.0, 4.7, 5.5];
const CUSTOM_PLAT_SPEEDS  = [null, 0.4, 0.9, 1.4, 1.9, 2.5];

const DIFF = {
  easy:   { gravity: 0.38, jump:  -7.8, speed: 4.0, label: 'Easy',   color: '#4d9', desc: 'Floaty jumps · slow platforms · no edge spikes' },
  medium: { gravity: 0.55, jump:  -9.4, speed: 4.0, label: 'Medium', color: '#fa4', desc: 'Standard speed and hazards' },
  hard:   { gravity: 0.68, jump: -10.4, speed: 4.0, label: 'Hard',   color: '#f54', desc: 'Heavy gravity · fast platforms · edge spikes' },
  custom: { gravity: 0.55, jump:  -9.4, speed: 4.0, label: 'Custom', color: '#c9f', desc: 'Your settings' },
};
