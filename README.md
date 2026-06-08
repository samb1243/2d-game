# Gem Rush

A 2-player HTML5 platformer race. Collect all the gems, reach the flag, beat your opponent.

## How to Play

Open `index.html` in a browser — no server or build step required.

| Player 1 | Player 2 |
|----------|----------|
| `W` — Jump | `↑` — Jump |
| `A` — Left | `←` — Left |
| `D` — Right | `→` — Right |

## Features

- 2-player local co-op on the same keyboard
- AI opponent option for solo play
- Procedurally generated levels
- 4 difficulty settings: Easy, Medium, Hard, Custom
- Custom mode: tune speed, gem count, and spike density
- Moving platforms toggle
- Player name, color, and hat customization
- Win tracker with scoreboard

## Structure

```
index.html
css/
  style.css
js/
  constants.js   — shared config and tile definitions
  state.js       — game state and setup data
  levelgen.js    — procedural level generation
  ai.js          — pathfinding and AI logic
  physics.js     — movement, collision, gem/flag logic
  draw.js        — canvas rendering
  ui.js          — setup screen and overlay handling
  main.js        — game loop and initialization
```
