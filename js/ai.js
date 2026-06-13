// ── State ──────────────────────────────────────────────────────────────────
let aiSegs = [];  // walkable surface segments { row, minCol, maxCol }
let aiAdj  = [];  // adjacency list — aiAdj[i]: segment indices reachable from i
let aiJumpModel = null;  // physics-derived jump reachability for the active difficulty

// ── Graph building ─────────────────────────────────────────────────────────

function buildAIGraph() {
  // Physics-derived reachability — every edge below is gated by what the
  // character can actually do with the current movement settings, so the AI
  // never plans a jump it can't make (see jump.js).
  const M = buildJumpModel(activeCfg);
  aiJumpModel = M;
  const g = buildSegGraph(tiles, M);
  aiSegs = g.segs;
  aiAdj  = g.adj;
}

// Pure walkable-surface graph for a tile grid + jump model — the single source
// of truth for "where can the character stand and which hops connect those
// surfaces?". buildAIGraph() runs it on the live `tiles`; the level generator
// (levelgen.js) runs it on a candidate grid to prove every gem + the flag stays
// reachable after spikes are added. Returns { segs, adj }.
function buildSegGraph(grid, M) {
  // Dimensions come from the grid itself, not the global MAP_W/MAP_H, so this works
  // on the classic fixed map (grid is MAP_H×MAP_W) AND on an arbitrary window cut out
  // of the endless field (endlessgen.js) for headless reachability validation.
  const H = grid.length, W = grid[0].length;
  const at = (c, r) =>
    (c < 0 || c >= W || r < 0 || r >= H) ? 1 : grid[r][c];

  // A column whose surface tile (at `row`) is solid but carries a spike resting on
  // top (at row-1). The floor/platform runs unbroken underneath, so this is NOT a
  // ledge: you can't drop off it, and a jump/drop that takes off toward it drives
  // the body into the tips. Only the same-row straight-up hop (overSpike) is allowed
  // to launch toward one — every other take-off direction beside a bridge is blocked.
  const spikeBridge = (c, row) => at(c, row) === 1 && at(c, row - 1) === 2;

  const segs = [];

  // A surface tile is solid with open space directly above AND no spike on it —
  // a spike (tile 2) at head height kills, so the AI must never stand there. This
  // splits a floor/platform into separate segments around any spike, so routes go
  // over the spike via a same-row jump edge instead of walking into it.
  for (let row = 1; row < H; row++) {
    let start = -1;
    for (let col = 0; col <= W; col++) {
      const surf = col < W && at(col, row) === 1 &&
                   at(col, row - 1) !== 1 && at(col, row - 1) !== 2;
      if (surf && start < 0)   start = col;
      if (!surf && start >= 0) { segs.push({ row, minCol: start, maxCol: col - 1 }); start = -1; }
    }
  }

  const n = segs.length;
  const adj = Array.from({ length: n }, () => []);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const a = segs[i], b = segs[j];
      const dRow = a.row - b.row;  // positive → b is higher on screen
      const hGap = Math.max(0, b.minCol - a.maxCol - 1, a.minCol - b.maxCol - 1);

      if (dRow === 0 && (hGap === 0 || M.canCross(hGap))) {
        // Same level: connect if the corridor between them is clear. A flat cross
        // is a full-height hop whose arc rises ~2 tiles, peaking near the take-off
        // and landing edges (especially at low speed, where the arc is steep), so
        // require clear sky at head height (row-1) AND two rows up (row-2) across
        // the gap PLUS one column into each segment — otherwise the hop lands ON an
        // overhead platform instead of crossing, stranding the body off its edge.
        // This also keeps placeSpikes from carving a floor notch under a platform.
        const lo = Math.min(a.maxCol, b.maxCol);       // take-off edge col
        const hi = Math.max(a.minCol, b.minCol);       // landing edge col
        let ok = true;
        for (let c = lo; c <= hi && ok; c++)
          if (at(c, a.row - 1) === 1 || at(c, a.row - 2) === 1) ok = false;
        if (ok) {
          // Spike bridge: the gap columns are solid surface (a.row) with a spike
          // resting on top (a.row-1). The floor/platform runs unbroken underneath,
          // so a running jump would drive the body into the tips on the way up —
          // the executor must hop straight up from the adjacent tile instead (see
          // aiDriveHop). A real (empty) gap has overSpike=false and arcs across.
          let overSpike = hGap > 0;
          for (let c = lo + 1; c <= hi - 1 && overSpike; c++)
            if (!(at(c, a.row) === 1 && at(c, a.row - 1) === 2)) overSpike = false;
          adj[i].push({ idx: j, moveType: hGap === 0 ? 'walk' : 'jump', overSpike });
        }

      } else if (dRow > 0 && M.canJumpUp(dRow, hGap)) {
        // Jump up: reject if a 2-tile wall blocks the face of the jump, or if the
        // face is a spike bridge (solid ground beside A with a spike on top — taking
        // off toward it clips the tips; there is no ledge to launch from).
        const dir     = b.minCol > a.maxCol ? 1 : b.maxCol < a.minCol ? -1 : 0;
        const faceCol = dir > 0 ? a.maxCol + 1 : dir < 0 ? a.minCol - 1 : -1;
        const faceBlocked = faceCol >= 0 &&
          ((at(faceCol, a.row - 1) === 1 && at(faceCol, a.row - 2) === 1) ||
           spikeBridge(faceCol, a.row));
        // A near-vertical hop (B within a tile of A's edge) launches straight up from
        // A's edge column, so that column's headroom must be clear. A spike-bridge
        // platform sitting directly above the edge (common once spikes rest on tops)
        // blocks the rise there — reject so the AI routes in from a clear take-off.
        const edgeCol = dir > 0 ? a.maxCol : dir < 0 ? a.minCol : -1;
        const headBlocked = edgeCol >= 0 && hGap <= 1 &&
          (at(edgeCol, a.row - 1) === 1 || at(edgeCol, a.row - 2) === 1);
        if (faceCol < 0 || (!faceBlocked && !headBlocked))
          adj[i].push({ idx: j, moveType: 'jump' });

      } else if (dRow < 0 && M.canDrop(-dRow, hGap)) {
        // Drop down. Reject if the edge we'd walk off is a spike bridge — the ground
        // continues solid there (no ledge) and stepping onto it dies on the spike.
        const dir = b.minCol > a.maxCol ? 1 : b.maxCol < a.minCol ? -1 : 0;
        if (dir !== 0) {
          // Non-overlapping: standard face-wall guard.
          const faceCol = dir > 0 ? a.maxCol + 1 : a.minCol - 1;
          if (!(at(faceCol, a.row - 1) === 1 && at(faceCol, a.row - 2) === 1) &&
              !spikeBridge(faceCol, a.row))
            adj[i].push({ idx: j, moveType: 'drop', dropDir: dir });
        } else {
          // Overlapping: a valid drop only exists if B extends beyond A on one side.
          // If B is fully inside A's column range, walking off either edge lands
          // outside B — the AI falls past it and can never reach it directly.
          const extendsRight = b.maxCol > a.maxCol;
          const extendsLeft  = b.minCol < a.minCol;
          if (extendsRight && !(at(a.maxCol + 1, a.row - 1) === 1 && at(a.maxCol + 1, a.row - 2) === 1) && !spikeBridge(a.maxCol + 1, a.row))
            adj[i].push({ idx: j, moveType: 'drop', dropDir: 1 });
          else if (extendsLeft && !(at(a.minCol - 1, a.row - 1) === 1 && at(a.minCol - 1, a.row - 2) === 1) && !spikeBridge(a.minCol - 1, a.row))
            adj[i].push({ idx: j, moveType: 'drop', dropDir: -1 });
          // B fully contained within A: no reachable drop — skip.
        }
      }
    }
  }

  return { segs, adj };
}

// ── Graph queries ──────────────────────────────────────────────────────────

function getPlayerSegIdx(p) {
  const col      = Math.floor((p.x + p.w / 2) / TILE);
  const floorRow = Math.floor((p.y + p.h) / TILE);
  for (let i = 0; i < aiSegs.length; i++) {
    const s = aiSegs[i];
    if (s.row === floorRow && col >= s.minCol && col <= s.maxCol) return i;
  }
  return -1;
}

function getTargetSegIdx(tx, ty) {
  const col  = Math.floor(tx / TILE);
  const base = Math.floor(ty / TILE) + 1;
  for (let dr = 0; dr <= 1; dr++)
    for (let i = 0; i < aiSegs.length; i++) {
      const s = aiSegs[i];
      if (s.row === base + dr && col >= s.minCol && col <= s.maxCol) return i;
    }
  return -1;
}

// Standard BFS — returns the full segment-index path, or null if unreachable.
// `banned` (optional) maps "u>v" edge keys to an expiry tick; an edge is skipped
// while animTick has not yet passed that expiry, letting the AI route around a
// hop it has repeatedly failed to execute.
function bfsPath(startIdx, endIdx, banned) {
  if (startIdx < 0 || endIdx < 0) return null;
  if (startIdx === endIdx) return [startIdx];
  const parent = new Int32Array(aiSegs.length).fill(-1);
  const seen   = new Uint8Array(aiSegs.length);
  seen[startIdx] = 1;
  const q = [startIdx];
  let qi = 0;
  while (qi < q.length) {
    const u = q[qi++];
    if (u === endIdx) break;
    for (const { idx: v } of aiAdj[u]) {
      if (seen[v]) continue;
      if (banned && banned[u + '>' + v] > animTick) continue;
      seen[v] = 1; parent[v] = u; q.push(v);
    }
  }
  if (!seen[endIdx]) return null;
  const path = [];
  for (let c = endIdx; c >= 0; c = parent[c]) path.unshift(c);
  return path;
}

// ── AI locomotion ────────────────────────────────────────────────────────────
// The graph above decides which hops are physically possible; this section
// executes them reliably. Core ideas:
//   • follow a BFS path one hop at a time;
//   • take off from a platform edge WITH a running start (matches the jump
//     model in jump.js — that's the speed it assumed was reachable);
//   • while rising toward a higher platform, hold at its near face until the
//     feet clear its top, then slip on — so the AI lands instead of bonking
//     the side or the underside;
//   • if a hop can't be completed in time, ban that edge briefly and reroute,
//     so a single awkward jump can never wedge the AI forever.

const AI_HOP_BAN     = 240;   // ticks an un-executable hop edge stays banned
const AI_GEM_SKIP    = 260;   // ticks stuck on one gem → shelve it, grab another
const AI_STALL_RESET = 600;   // ticks of zero progress → clear all bans & retarget

function aiInit(p) {
  if (p.aiBanned) return;
  p.aiBanned = {};
  p.aiGemSkip = {};
  p.aiGemIdx = -1;
  p.aiHopFrom = -1;
  p.aiHopTo = null;
  p.aiHopDeadline = 0;
  p.aiLastProgressTick = 0;
  p.aiLastGems = 0;
  p.aiLandX = null; p.aiFaceX = null; p.aiJumpDir = 0; p.aiTargetTopY = null;
}

function aiCeilingBlocked(p) {
  return !aiCeilingClearAt(p, p.x);
}

// Is the 2-tile headroom above clear for a body whose left edge is at `px`?
function aiCeilingClearAt(p, px) {
  const c0 = Math.floor(px / TILE), c1 = Math.floor((px + p.w - 1) / TILE);
  const r0 = Math.floor(p.y / TILE);
  return !(tileAt(c0, r0 - 1) === 1 || tileAt(c1, r0 - 1) === 1 ||
           tileAt(c0, r0 - 2) === 1 || tileAt(c1, r0 - 2) === 1);
}

// Is there a solid surface (tile or moving platform) right under the feet?
// A player resting on flat ground sits exactly on a tile boundary, so the
// engine flickers p.onGround on/off every frame; this lets the AI treat itself
// as grounded on the "off" frames too, instead of stuttering into air-steering.
function aiGroundBelow(p) {
  if (p.onPlatform) return true;
  const feet = p.y + p.h;
  const c0   = Math.floor(p.x / TILE), c1 = Math.floor((p.x + p.w - 1) / TILE);
  const r    = Math.floor((feet + 3) / TILE);
  if (feet < r * TILE - 5 || feet > r * TILE + 4) return false;
  return tileAt(c0, r) === 1 || tileAt(c1, r) === 1;
}

// Pick the segment + world point the AI should head for: the nearest reachable
// uncollected gem (sticky — it keeps the current gem while it stays reachable),
// or the flag once every gem is in hand.
function aiChooseGoal(p, curSeg) {
  if (p.gemsCollected >= GEM_COUNT) {
    const fx = flagPos.col * TILE + TILE / 2, fy = (flagPos.row - 1) * TILE;
    return { seg: getTargetSegIdx(fx, fy), x: fx, y: fy };
  }

  // Keep the current gem target while it is still uncollected and reachable.
  if (p.aiGemIdx >= 0 && !(p.aiGemSkip[p.aiGemIdx] > animTick)) {
    const g = gems[p.aiGemIdx];
    if (g && !g.collected[p.id]) {
      const s = getTargetSegIdx(g.x, g.y);
      if (bfsPath(curSeg, s, p.aiBanned)) return { seg: s, x: g.x, y: g.y };
    }
  }

  // Otherwise choose the reachable gem with the fewest hops (then nearest),
  // skipping any gem we've recently failed to collect (so we grab others first).
  let bestSeg = -1, bestX = 0, bestY = 0, bestHops = 1e9, bestD = 1e9, bestIdx = -1;
  for (let i = 0; i < gems.length; i++) {
    const g = gems[i];
    if (g.collected[p.id] || p.aiGemSkip[i] > animTick) continue;
    const s = getTargetSegIdx(g.x, g.y);
    const path = bfsPath(curSeg, s, p.aiBanned);
    if (!path) continue;
    const d = Math.abs(g.x - (p.x + p.w / 2)) + Math.abs(g.y - (p.y + p.h / 2));
    if (path.length < bestHops || (path.length === bestHops && d < bestD)) {
      bestHops = path.length; bestD = d; bestSeg = s; bestX = g.x; bestY = g.y; bestIdx = i;
    }
  }
  if (bestSeg >= 0) { p.aiGemIdx = bestIdx; return { seg: bestSeg, x: bestX, y: bestY }; }

  // Nothing reachable — drop bans, then skips, and try once more.
  if (Object.keys(p.aiBanned).length) { p.aiBanned = {}; return aiChooseGoal(p, curSeg); }
  if (Object.keys(p.aiGemSkip).length) { p.aiGemSkip = {}; return aiChooseGoal(p, curSeg); }

  // Truly nothing reachable (should not happen on a generated level): aim at the
  // nearest gem regardless, and let the drive/jump fallback do its best.
  let nx = p.x + p.w / 2, ny = p.y, nd = 1e9, ns = -1;
  for (let i = 0; i < gems.length; i++) {
    const g = gems[i]; if (g.collected[p.id]) continue;
    const d = Math.abs(g.x - (p.x + p.w / 2)) + Math.abs(g.y - (p.y + p.h / 2));
    if (d < nd) { nd = d; nx = g.x; ny = g.y; ns = getTargetSegIdx(g.x, g.y); }
  }
  return { seg: ns, x: nx, y: ny };
}

// Horizontal drive toward a target column, with an optional opportunistic jump
// when the target sits above and we're roughly under it (used on the goal
// segment and as a fallback when off the graph).
function aiDriveToward(p, cfg, tx, ty, allowJump) {
  p.aiWaypoint = { x: tx, y: ty };
  const cx = p.x + p.w / 2, dx = tx - cx;
  const vxt = Math.abs(dx) < 4 ? 0 : Math.sign(dx) * cfg.speed;
  p.vx += (vxt - p.vx) * 0.6;
  if (allowJump && ty != null && ty < p.y - TILE * 0.5 &&
      Math.abs(dx) < TILE && !aiCeilingBlocked(p)) {
    p.vy = cfg.jump; p.onGround = false;
  }
}

// Execute one grounded hop from segment A to segment B.
function aiDriveHop(p, cfg, A, B, moveType, edge) {
  const cx  = p.x + p.w / 2;
  const bCx = (B.minCol + B.maxCol + 1) / 2 * TILE;
  p.aiWaypoint = { x: bCx, y: (B.row - 1) * TILE };
  p.aiLandX = Math.max((B.minCol + 0.4) * TILE, Math.min((B.maxCol + 0.6) * TILE, bCx));

  if (moveType === 'walk') {
    p.aiFaceX = null; p.aiTargetTopY = null; p.aiJumpDir = 0;
    const dx = bCx - cx;
    p.vx += ((Math.abs(dx) < 4 ? 0 : Math.sign(dx) * cfg.speed) - p.vx) * 0.6;
    return;
  }

  if (moveType === 'drop') {
    const dir = B.minCol > A.maxCol ? 1 : B.maxCol < A.minCol ? -1
              : (edge && edge.dropDir) ? edge.dropDir : (bCx >= cx ? 1 : -1);
    // Land on the part of B nearest the edge we drop off — NOT B's centre, which
    // can sit back over A and make the air-steer haul us back onto A.
    const nearCol = dir > 0 ? A.maxCol + 1 : A.minCol - 1;
    const landCol = Math.max(B.minCol, Math.min(B.maxCol, nearCol));
    p.aiLandX = (landCol + 0.5) * TILE;
    p.aiFaceX = null; p.aiTargetTopY = null; p.aiJumpDir = dir;
    // Commit: run at full speed in the drop direction until we walk clean off
    // the edge. (Aiming at a fixed edge column parks the body half-on the
    // platform — one foot still supported — and it never actually falls.)
    p.vx += (dir * cfg.speed - p.vx) * 0.6;
    return;
  }

  // Same-row hop over an on-top spike. The surface is solid beneath the spike, so a
  // running gap-jump would drive the body into the tips on the way up. Instead stand
  // fully clear of the spike column on the adjacent tile, hop straight up, and let
  // aiDriveAir hold us off the column (aiFaceX) until the feet rise above the spike's
  // cell (aiTargetTopY) before sliding across to land on B.
  if (moveType === 'jump' && edge && edge.overSpike) {
    const dir      = B.minCol > A.maxCol ? 1 : -1;
    const spikeCol = dir > 0 ? A.maxCol + 1 : A.minCol - 1;   // first spike column
    const toCol    = dir > 0 ? A.maxCol : A.minCol;           // solid take-off tile beside it
    const standXpx = dir > 0 ? (toCol + 1) * TILE - p.w : toCol * TILE;  // body fully clear of spikeCol
    const landCol  = dir > 0 ? B.minCol : B.maxCol;
    p.aiFaceX      = dir > 0 ? spikeCol * TILE : (spikeCol + 1) * TILE;
    p.aiTargetTopY = (A.row - 1) * TILE;        // feet must clear the spike's cell before crossing
    p.aiJumpDir    = dir;
    p.aiLandX      = (landCol + 0.5) * TILE;
    const near = Math.abs(p.x - standXpx) <= cfg.speed + 1;
    if (near && aiCeilingClearAt(p, standXpx)) {
      p.x = standXpx;                           // snap exactly clear of the spike
      p.vy = cfg.jump; p.onGround = false; p.vx = 0;
    } else {
      const dx = (standXpx + p.w / 2) - cx;
      p.vx += (Math.sign(dx) * cfg.speed - p.vx) * 0.6;
    }
    return;
  }

  // moveType === 'jump' (up or across). Take off from the column of A just
  // outside B on the chosen side.
  let dir;
  if (B.minCol > A.maxCol) dir = 1;
  else if (B.maxCol < A.minCol) dir = -1;
  else {
    // B overlaps A's columns: hop straight up from a tile just beside B. Prefer a
    // take-off column whose headroom is clear — a spike-bridge platform (or any
    // overhang) directly above one side blocks the rise there, so launch from the
    // other side instead of stalling under the obstacle.
    const headClear = (col) => !(tileAt(col, A.row - 1) === 1 || tileAt(col, A.row - 2) === 1);
    const canLeft   = A.minCol <= B.minCol - 1;   // room to stand left of B
    const canRight  = A.maxCol >= B.maxCol + 1;   // room to stand right of B
    const leftOk    = canLeft  && headClear(B.minCol - 1);
    const rightOk   = canRight && headClear(B.maxCol + 1);
    dir = (leftOk && rightOk) ? (bCx >= cx ? 1 : -1)
        : leftOk  ? 1
        : rightOk ? -1
        : (canLeft ? 1 : -1);                      // neither clear: best effort
  }
  const toCol    = dir > 0 ? Math.min(A.maxCol, B.minCol - 1)
                           : Math.max(A.minCol, B.maxCol + 1);
  const adjacent = dir > 0 ? toCol === B.minCol - 1 : toCol === B.maxCol + 1;
  p.aiFaceX      = dir > 0 ? B.minCol * TILE : (B.maxCol + 1) * TILE;
  p.aiTargetTopY = B.row * TILE;
  p.aiJumpDir    = dir;

  if (adjacent) {
    // B is right beside (or above) the take-off column: stand fully clear of B
    // and hop straight up, then air-steer slides us on once the feet clear B's
    // top. Standing clear is essential — over the platform's column the ceiling
    // check would (correctly) forbid the jump, so we drive to the clear column
    // and launch the instant we arrive (no deceleration that could strand the
    // body half-under B).
    const standXpx = dir > 0 ? (toCol + 1) * TILE - p.w : toCol * TILE;  // target left-edge x
    // Snap to the clear take-off column once we're within a step of it — the
    // clear window can be ~1px wide, too narrow for the per-frame motion to land
    // on exactly, so accepting a nearby frame and snapping is what makes it fire.
    const near = Math.abs(p.x - standXpx) <= cfg.speed + 1;
    if (near && aiCeilingClearAt(p, standXpx)) {
      p.x = standXpx;                         // snap exactly clear of B
      p.vy = cfg.jump; p.onGround = false; p.vx = 0;
    } else {
      const dx = (standXpx + p.w / 2) - cx;
      p.vx += (Math.sign(dx) * cfg.speed - p.vx) * 0.6;
    }
  } else {
    // Gap jump: leave A's edge with a full running start and arc across.
    const boundary    = dir > 0 ? (toCol + 1) * TILE : toCol * TILE;
    const leadingEdge = dir > 0 ? p.x + p.w : p.x;
    const atEdge      = dir > 0 ? leadingEdge >= boundary - 1 : leadingEdge <= boundary + 1;
    if (atEdge && !aiCeilingBlocked(p)) {
      p.vy = cfg.jump; p.onGround = false; p.vx = dir * cfg.speed;
    } else {
      const aimX = dir > 0 ? boundary - p.w / 2 - 1 : boundary + p.w / 2 + 1;
      const dx   = aimX - cx;
      const vxt  = Math.abs(dx) < 3 ? dir * cfg.speed : Math.sign(dx) * cfg.speed;
      p.vx += (vxt - p.vx) * 0.6;              // keep speed into the edge
    }
  }
}

// Airborne steering toward the current hop's landing point, holding at a higher
// platform's near face until the feet clear its top.
function aiDriveAir(p, cfg) {
  const cx = p.x + p.w / 2;
  const landX = p.aiLandX != null ? p.aiLandX : (p.aiWaypoint ? p.aiWaypoint.x : cx);
  let vxt = Math.abs(landX - cx) < 4 ? 0 : Math.sign(landX - cx) * cfg.speed;

  if (p.aiFaceX != null && p.aiTargetTopY != null && p.y + p.h > p.aiTargetTopY + 2) {
    // Still below the target platform's top: don't drive into its side.
    if (p.aiJumpDir > 0 && p.x + p.w >= p.aiFaceX) vxt = Math.min(vxt, 0);
    if (p.aiJumpDir < 0 && p.x <= p.aiFaceX)        vxt = Math.max(vxt, 0);
  }
  p.vx += (vxt - p.vx) * 0.5;
}

// Frames allowed to complete a hop before it's treated as un-executable.
function aiHopBudget(p, curSeg, Bn, cfg) {
  if (Bn < 0) return 120;
  const A = aiSegs[curSeg], B = aiSegs[Bn];
  const bCx  = (B.minCol + B.maxCol + 1) / 2 * TILE;
  const dist = Math.abs(bCx - (p.x + p.w / 2)) + Math.abs(A.row - B.row) * TILE + TILE;
  return 70 + Math.ceil(dist / cfg.speed) * 3;
}

// Plan a fresh hop from the segment we just landed on: choose the goal, BFS a
// route (avoiding banned edges), and commit to the first hop.
function planFromSeg(p, cfg, curSeg) {
  const goal = aiChooseGoal(p, curSeg);
  p.aiTarget = { x: goal.x, y: goal.y };

  let path = bfsPath(curSeg, goal.seg, p.aiBanned);
  if (!path && Object.keys(p.aiBanned).length) { p.aiBanned = {}; path = bfsPath(curSeg, goal.seg); }
  p.aiPath = path || [curSeg];

  p.aiHopFrom = curSeg;
  p.aiHopTo   = p.aiPath.length > 1 ? p.aiPath[1] : -1;
  p.aiMoveType = p.aiHopTo >= 0
    ? ((aiAdj[curSeg].find(e => e.idx === p.aiHopTo) || {}).moveType || 'walk')
    : 'walk';
  p.aiHopDeadline = animTick + aiHopBudget(p, curSeg, p.aiHopTo, cfg);
}

// ── Main AI input ───────────────────────────────────────────────────────────
//
// One hop is committed at a time and held until we land on a NEW segment. This
// matters because while a foot is off a platform edge mid-manoeuvre the player's
// centre column leaves every segment (getPlayerSegIdx → -1); re-planning then
// would abandon the jump/drop and haul us back. Committing rides it out.

function applyAIInput(p, cfg) {
  aiInit(p);
  if (!aiJumpModel) aiJumpModel = buildJumpModel(activeCfg);

  // Progress / stall tracking → escape hatches if something wedges us.
  if (p.gemsCollected !== p.aiLastGems) { p.aiLastGems = p.gemsCollected; p.aiLastProgressTick = animTick; }
  const stalled = animTick - p.aiLastProgressTick;
  if (stalled > AI_GEM_SKIP && p.gemsCollected < GEM_COUNT && p.aiGemIdx >= 0) {
    // Can't get this gem — shelve it briefly and fetch a different one.
    p.aiGemSkip[p.aiGemIdx] = animTick + AI_GEM_SKIP * 2;
    p.aiGemIdx = -1; p.aiHopFrom = -1; p.aiHopTo = null; p.aiLastProgressTick = animTick;
  }
  if (stalled > AI_STALL_RESET) {
    p.aiBanned = {}; p.aiGemSkip = {}; p.aiGemIdx = -1; p.aiHopFrom = -1; p.aiHopTo = null; p.aiLastProgressTick = animTick;
  }

  // Grounded for control purposes when truly on the ground, or resting a hair
  // above a surface during the engine's 1px boundary flicker (see aiGroundBelow).
  const grounded = p.onGround || (p.vy >= 0 && p.vy <= cfg.gravity * 2 + 0.1 && aiGroundBelow(p));
  if (!grounded) { aiDriveAir(p, cfg); return; }

  const curSeg = getPlayerSegIdx(p);

  // Landed on a real, different segment (or never planned): commit a new hop.
  if (curSeg >= 0 && (curSeg !== p.aiHopFrom || p.aiHopTo == null)) {
    // If a hop dropped us somewhere OTHER than its intended target, that edge is
    // unreliable (e.g. a same-row jump that arcs up onto a platform above the
    // target). Ban it so we approach from a different segment instead.
    if (p.aiHopTo != null && p.aiHopTo >= 0 && curSeg !== p.aiHopTo && curSeg !== p.aiHopFrom)
      p.aiBanned[p.aiHopFrom + '>' + p.aiHopTo] = animTick + AI_HOP_BAN;
    planFromSeg(p, cfg, curSeg);
  } else if (p.aiHopTo != null && p.aiHopTo >= 0 && animTick > p.aiHopDeadline) {
    // Hop ran over its time budget — ban that edge and route around it.
    p.aiBanned[p.aiHopFrom + '>' + p.aiHopTo] = animTick + AI_HOP_BAN;
    if (curSeg >= 0) planFromSeg(p, cfg, curSeg);
    else { p.aiHopFrom = -1; p.aiHopTo = null; }
  }

  // Off-graph with no committed hop (e.g. just landed on a moving platform):
  // steer toward the goal and hop up if it sits above.
  if (p.aiHopTo == null) {
    const goal = aiChooseGoal(p, curSeg >= 0 ? curSeg : 0);
    p.aiTarget = { x: goal.x, y: goal.y };
    aiDriveToward(p, cfg, goal.x, goal.y, true);
    return;
  }

  // On the goal segment: walk to the exact target (jump only if it's above).
  if (p.aiHopTo < 0) {
    const goal = aiChooseGoal(p, p.aiHopFrom);
    p.aiTarget = { x: goal.x, y: goal.y };
    p.aiMoveType = 'walk';
    aiDriveToward(p, cfg, goal.x, goal.y, goal.y < p.y - TILE * 0.5);
    return;
  }

  // Execute the committed hop.
  const A = aiSegs[p.aiHopFrom], B = aiSegs[p.aiHopTo];
  const edge = aiAdj[p.aiHopFrom].find(e => e.idx === p.aiHopTo);
  aiDriveHop(p, cfg, A, B, p.aiMoveType, edge);
}
