const TILE = 32, MAP_W = 30, MAP_H = 17;
let GEM_COUNT = 5;
const W = 960, H = 540;

const COLORS      = ['#4af', '#f84', '#4d9', '#b47eff', '#ff4fa0', '#ffe040'];
const COLOR_NAMES = ['Blue', 'Orange', 'Green', 'Purple', 'Pink', 'Yellow'];

const HATS      = ['None', 'Helmet', 'Crown'];
const HAT_ICONS = ['—', '⛑', '♛'];

// ── Granular setting levels (index 1..5) ────────────────────────────────────
// Every match's physics is built from these by applySettings() in main.js, so
// the level generator and AI (which both call buildJumpModel) always agree with
// what the player is actually running. Level 3 = the classic "medium" feel.
const SPEED_LEVELS  = [null, 2.5, 3.2, 4.0, 4.7, 5.5];   // player horizontal speed
// Jump strength + matched gravity. Every level must clear ≥ 2 tiles (the tier
// spacing the generator builds on) or elevated layouts become unsolvable — see
// the harness JUMP MODEL check. Level 2 is the classic "medium" feel and the
// default; the slider only goes UP from there because a weaker jump can't reach
// the 2-tile tiers reliably.
const JUMP_LEVELS   = [null,
  { gravity: 0.56, jump:  -9.3 },   // 1 · low
  { gravity: 0.55, jump:  -9.4 },   // 2 · normal (default / classic medium)
  { gravity: 0.55, jump: -10.0 },   // 3 · high
  { gravity: 0.54, jump: -10.5 },   // 4 · higher
  { gravity: 0.53, jump: -11.0 },   // 5 · super jump
];
const MOVING_SPEED_LEVELS = [null, 0.4, 0.9, 1.4, 1.9, 2.5];   // moving-platform AND moving-spike speed
const PLAT_DENSITY_LEVELS = [null, 0.6, 0.8, 1.0, 1.25, 1.5];  // platform-count multiplier

// ── Moving spikes ─────────────────────────────────────────────────────────────
// Air-gap patrollers: a lethal spiked block that slides horizontally through the
// empty lanes between platforms (reusing the moving-platform speed). Up to this many
// are attempted per level; each is kept only if the level stays solvable with every
// spike-threatened AI edge removed (so the AI always has a spike-free fallback route —
// see buildMovingSpikes in levelgen.js). They share MOVING_SPEED_LEVELS for speed.
const MOVING_SPIKE_COUNT = 2;

// ── Spike density ───────────────────────────────────────────────────────────
// How many spike hazards the level generator (levelgen.js placeSpikes) tries to
// add, keyed by the "Spikes" setting. `plat` = single spikes resting on the tops
// of wide platforms (the AI hops straight up and over them); the ground floor is
// never spiked. It's an upper bound — placeSpikes only keeps a spike if the level
// stays fully solvable (every gem + the flag still reachable on the spike-aware AI
// graph), so the actual count on any given layout may be lower.
const SPIKE_LEVELS = {
  none:   { plat: 0 },
  normal: { plat: 2 },
  heavy:  { plat: 6 },
};

// ── Difficulty presets ──────────────────────────────────────────────────────
// Clicking a preset in the Settings menu pre-fills the granular sliders below.
// `custom` carries no level values — it's only the badge label once the player
// hand-tweaks a slider. label/color drive the in-game difficulty badge.
const PRESETS = {
  easy:   { label: 'Easy',   color: '#4d9',
            speedLevel: 2, jumpLevel: 1, platforms: 2, gems: 5, spikes: 'none',   movingBlocks: true, movingSpeedLevel: 2, movingSpikes: false },
  medium: { label: 'Medium', color: '#fa4',
            speedLevel: 3, jumpLevel: 2, platforms: 3, gems: 5, spikes: 'normal', movingBlocks: true, movingSpeedLevel: 3, movingSpikes: false },
  hard:   { label: 'Hard',   color: '#f54',
            speedLevel: 4, jumpLevel: 4, platforms: 4, gems: 7, spikes: 'heavy',  movingBlocks: true, movingSpeedLevel: 4, movingSpikes: true },
  custom: { label: 'Custom', color: '#c9f' },
};

// Keys that copy from a preset into `settings` (everything but label/color).
const SETTING_KEYS = ['speedLevel', 'jumpLevel', 'platforms', 'gems', 'spikes', 'movingBlocks', 'movingSpeedLevel', 'movingSpikes'];
