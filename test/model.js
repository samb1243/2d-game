// Quick sanity print of the jump model for every difficulty / custom speed.
const TILE = 32;
const { buildJumpModel } = require('../js/jump.js');

const DIFF = {
  easy:   { gravity: 0.38, jump:  -7.8, speed: 4.0 },
  medium: { gravity: 0.55, jump:  -9.4, speed: 4.0 },
  hard:   { gravity: 0.68, jump: -10.4, speed: 4.0 },
};
const CUSTOM_SPEED_LEVELS = [null, 2.5, 3.2, 4.0, 4.7, 5.5];

function report(name, cfg) {
  const m = buildJumpModel(cfg, TILE);
  const gaps = [];
  for (let r = 0; r <= m.maxRiseTiles + 1; r++) gaps.push(`rise${r}:gap≤${m.maxGapTilesForRise(r)}`);
  console.log(
    `${name.padEnd(14)} peak=${m.peak.toFixed(1)}px (${(m.peak / TILE).toFixed(2)}t)  ` +
    `maxRise=${m.maxRiseTiles}t  ${gaps.join('  ')}`
  );
}

console.log('=== difficulty presets ===');
for (const k of ['easy', 'medium', 'hard']) report(k, DIFF[k]);

console.log('\n=== custom (gravity/jump = medium, varying speed) ===');
for (let lvl = 1; lvl <= 5; lvl++)
  report(`custom spd ${lvl}`, { gravity: 0.55, jump: -9.4, speed: CUSTOM_SPEED_LEVELS[lvl] });
