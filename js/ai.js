// ── Tuning presets — cycle with P key, shown in AI debug overlay ───────────
// aboveDx : tiles of horizontal range before waypointAbove triggers a jump
// stuckAt : frames without progress before forcing a fresh replan
const AI_PRESETS = [
  { name: 'Loose  dx=6', aboveDx: 6, stuckAt: 45 },
  { name: 'Snug   dx=4', aboveDx: 4, stuckAt: 36 },
  { name: 'Tight  dx=3', aboveDx: 3, stuckAt: 28 },
  { name: 'Eager  dx=2', aboveDx: 2, stuckAt: 22 },
];
let aiPresetIdx = 0;

// ── State ──────────────────────────────────────────────────────────────────
let aiSegs = [];  // walkable surface segments { row, minCol, maxCol }
let aiAdj  = [];  // adjacency list — aiAdj[i]: segment indices reachable from i

// ── Graph building ─────────────────────────────────────────────────────────

function buildAIGraph() {
  aiSegs = [];

  // A surface tile is solid with open space directly above.
  for (let row = 1; row < MAP_H; row++) {
    let start = -1;
    for (let col = 0; col <= MAP_W; col++) {
      const surf = col < MAP_W && tiles[row][col] === 1 && tiles[row - 1][col] !== 1;
      if (surf && start < 0)   start = col;
      if (!surf && start >= 0) { aiSegs.push({ row, minCol: start, maxCol: col - 1 }); start = -1; }
    }
  }

  const n = aiSegs.length;
  aiAdj = Array.from({ length: n }, () => []);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const a = aiSegs[i], b = aiSegs[j];
      const dRow = a.row - b.row;  // positive → b is higher on screen
      const hGap = Math.max(0, b.minCol - a.maxCol - 1, a.minCol - b.maxCol - 1);

      if (dRow === 0 && hGap <= 5) {
        // Same level: connect if the body-height corridor between them is clear.
        const lo = Math.min(a.maxCol, b.maxCol) + 1;
        const hi = Math.max(a.minCol, b.minCol) - 1;
        let ok = true;
        for (let c = lo; c <= hi && ok; c++)
          if (tileAt(c, a.row - 1) === 1) ok = false;
        if (ok) aiAdj[i].push({ idx: j, moveType: hGap === 0 ? 'walk' : 'jump' });

      } else if (dRow > 0 && dRow <= 2 && hGap <= 5 - dRow) {
        // Jump up: reject if a 2-tile wall blocks the face of the jump.
        const dir     = b.minCol > a.maxCol ? 1 : b.maxCol < a.minCol ? -1 : 0;
        const faceCol = dir > 0 ? a.maxCol + 1 : dir < 0 ? a.minCol - 1 : -1;
        if (faceCol < 0 || !(tileAt(faceCol, a.row - 1) === 1 && tileAt(faceCol, a.row - 2) === 1))
          aiAdj[i].push({ idx: j, moveType: 'jump' });

      } else if (dRow < 0 && hGap <= 5) {
        // Drop down.
        const dir = b.minCol > a.maxCol ? 1 : b.maxCol < a.minCol ? -1 : 0;
        if (dir !== 0) {
          // Non-overlapping: standard face-wall guard.
          const faceCol = dir > 0 ? a.maxCol + 1 : a.minCol - 1;
          if (!(tileAt(faceCol, a.row - 1) === 1 && tileAt(faceCol, a.row - 2) === 1))
            aiAdj[i].push({ idx: j, moveType: 'drop', dropDir: dir });
        } else {
          // Overlapping: a valid drop only exists if B extends beyond A on one side.
          // If B is fully inside A's column range, walking off either edge lands
          // outside B — the AI falls past it and can never reach it directly.
          const extendsRight = b.maxCol > a.maxCol;
          const extendsLeft  = b.minCol < a.minCol;
          if (extendsRight && !(tileAt(a.maxCol + 1, a.row - 1) === 1 && tileAt(a.maxCol + 1, a.row - 2) === 1))
            aiAdj[i].push({ idx: j, moveType: 'drop', dropDir: 1 });
          else if (extendsLeft && !(tileAt(a.minCol - 1, a.row - 1) === 1 && tileAt(a.minCol - 1, a.row - 2) === 1))
            aiAdj[i].push({ idx: j, moveType: 'drop', dropDir: -1 });
          // B fully contained within A: no reachable drop — skip.
        }
      }
    }
  }
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
function bfsPath(startIdx, endIdx) {
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
      seen[v] = 1; parent[v] = u; q.push(v);
    }
  }
  if (!seen[endIdx]) return null;
  const path = [];
  for (let c = endIdx; c >= 0; c = parent[c]) path.unshift(c);
  return path;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function hasFloorAt(col, row) {
  return tileAt(col, row) === 1;
}

// Waypoint at the centre of a segment at standing height.
function segWaypoint(s) {
  return { x: (s.minCol + s.maxCol + 1) / 2 * TILE, y: (s.row - 1) * TILE };
}

// Neighbour of pSeg with the most columns that have ≥2 clear rows above —
// used to steer toward jump-able space when a ceiling blocks a jump.
function bestOpenNeighbour(pSeg) {
  let bestNi = -1, bestOpen = -1;
  for (const { idx: ni } of aiAdj[pSeg]) {
    const s = aiSegs[ni];
    let open = 0;
    for (let c = s.minCol; c <= s.maxCol; c++)
      if (tileAt(c, s.row - 2) !== 1 && tileAt(c, s.row - 3) !== 1) open++;
    if (open > bestOpen) { bestOpen = open; bestNi = ni; }
  }
  return bestNi;
}

// ── Target selection ────────────────────────────────────────────────────────

function pickAITarget(p) {
  if (p.gemsCollected < GEM_COUNT) {
    const cy = p.y + p.h / 2;
    let best = null, bestCost = Infinity;
    for (const g of gems) {
      if (g.collected[p.id]) continue;
      const hdist = Math.abs(g.x - (p.x + p.w / 2));
      const vdist = Math.abs(g.y - cy);
      const cost  = hdist + vdist * (g.y < cy ? 2.2 : 1.0);
      if (cost < bestCost) { bestCost = cost; best = { x: g.x, y: g.y }; }
    }
    return best;
  }
  return { x: flagPos.col * TILE + TILE / 2, y: (flagPos.row - 1) * TILE };
}

// ── Waypoint planning ───────────────────────────────────────────────────────

// Three clean cases:
//   1. BFS finds a path  → commit to the first hop
//   2. No graph path     → walk off the nearest valid edge to reach the floor
//   3. Already on target → walk straight to it
function planWaypoint(p, target) {
  const pSeg = getPlayerSegIdx(p);
  if (pSeg < 0) return -1;  // momentarily off a segment — keep current plan

  const tSeg = getTargetSegIdx(target.x, target.y);

  if (tSeg >= 0 && pSeg !== tSeg) {
    const path = bfsPath(pSeg, tSeg);
    if (path && path.length > 1) {
      const edge  = aiAdj[pSeg].find(e => e.idx === path[1]);
      p.aiPath     = path;
      p.aiMoveType = edge ? edge.moveType : 'walk';
      const ns    = aiSegs[path[1]];
      const seg   = aiSegs[pSeg];
      const nsCx  = (ns.minCol + ns.maxCol + 1) / 2 * TILE;
      const segCx = (seg.minCol + seg.maxCol + 1) / 2 * TILE;

      if (p.aiMoveType === 'drop') {
        const dropDir = (edge && edge.dropDir != null) ? edge.dropDir : (nsCx >= segCx ? 1 : -1);
        p.aiWaypoint  = {
          x: dropDir > 0
            ? Math.min(Math.max(nsCx, (seg.maxCol + 0.5) * TILE), (MAP_W - 1) * TILE)
            : Math.max(Math.min(nsCx, (seg.minCol - 0.5) * TILE), 0),
          y: (ns.row - 1) * TILE,
        };
      } else {
        p.aiWaypoint = segWaypoint(ns);
      }
    } else {
      // Platform is unreachable via the graph (isolated). Walk off whichever
      // edge avoids the map boundary so the AI drops to the floor and replans.
      p.aiPath     = [];
      p.aiMoveType = 'drop';
      const seg = aiSegs[pSeg];
      let dir   = target.x >= p.x + p.w / 2 ? 1 : -1;
      if (dir < 0 && (seg.minCol - 1.5) * TILE < 0)             dir = 1;
      else if (dir > 0 && (seg.maxCol + 1.5) * TILE > MAP_W * TILE) dir = -1;
      p.aiWaypoint = {
        x: dir > 0
          ? Math.min((seg.maxCol + 1.5) * TILE, (MAP_W - 1) * TILE)
          : Math.max((seg.minCol - 1.5) * TILE, 0),
        y: target.y,
      };
    }
  } else {
    // Already on the target segment, or the target has no segment — walk straight to it.
    p.aiPath     = [];
    p.aiMoveType = 'walk';
    p.aiWaypoint = target;
  }

  return pSeg;
}

// Steer toward a spot with ≥2 clear rows of headroom so a jump can succeed.
function seekOpenSpace(p, pSeg) {
  if (pSeg < 0) pSeg = getPlayerSegIdx(p);
  if (pSeg < 0) return;
  const seg = aiSegs[pSeg];

  for (let c = seg.minCol; c <= seg.maxCol; c++) {
    if (tileAt(c, seg.row - 2) !== 1 && tileAt(c, seg.row - 3) !== 1) {
      p.aiWaypoint = { x: (c + 0.5) * TILE, y: (seg.row - 1) * TILE };
      return;
    }
  }

  const ni = bestOpenNeighbour(pSeg);
  if (ni >= 0) p.aiWaypoint = segWaypoint(aiSegs[ni]);
}

// ── Main AI input ───────────────────────────────────────────────────────────

function applyAIInput(p, cfg) {
  const target = pickAITarget(p);
  if (!target) return;
  p.aiTarget = target;

  // ── Plan management ────────────────────────────────────────────────────────
  // Replan whenever: the target moves, the AI lands on a new segment, there is
  // no waypoint yet, or the per-hop deadline expires.
  let pSeg = -1;
  if (p.onGround) {
    const curSeg      = getPlayerSegIdx(p);
    const targetMoved = !p.aiPlanTarget
      || Math.abs(p.aiPlanTarget.x - target.x) > 2
      || Math.abs(p.aiPlanTarget.y - target.y) > 2;
    const segArrived  = curSeg >= 0 && curSeg !== p.aiPlanSeg;
    const planExpired = p.aiWaypointDeadline > 0 && animTick > p.aiWaypointDeadline;

    if (targetMoved || segArrived || !p.aiWaypoint || planExpired) {
      pSeg = planWaypoint(p, target);
      if (pSeg >= 0) {
        p.aiPlanSeg    = pSeg;
        p.aiPlanTarget = { x: target.x, y: target.y };
        const wpt  = p.aiWaypoint;
        const dist = wpt ? Math.hypot(wpt.x - (p.x + p.w / 2), wpt.y - p.y) : TILE * 6;
        p.aiWaypointDeadline = animTick + Math.max(150, Math.ceil(dist / cfg.speed) * 3 + 60);
      }
    } else {
      pSeg = curSeg;
    }
  }

  const waypoint = p.aiWaypoint || target;
  const cx  = p.x + p.w / 2;
  const dx  = waypoint.x - cx;
  const dir = dx > 0 ? 1 : -1;

  // ── Stuck detection (no movement while waypoint is distant, or wall-pressed) ─
  const dxMotion  = p.x - p.aiLastX;
  const wallStuck = (p.x <= 0 && dir < 0) || (p.x >= MAP_W * TILE - p.w && dir > 0);
  if ((Math.abs(dxMotion) < 0.5 && Math.abs(dx) > TILE) || wallStuck)
    p.aiStuckTimer++;
  else
    p.aiStuckTimer = Math.max(0, p.aiStuckTimer - 2);
  p.aiLastX = p.x;

  // ── Mid-air: smooth steering toward waypoint ──────────────────────────────
  if (!p.onGround) {
    const c0    = Math.floor(p.x / TILE);
    const c1    = Math.floor((p.x + p.w - 1) / TILE);
    const r0    = Math.floor(p.y / TILE);
    const r1    = Math.floor((p.y + p.h - 1) / TILE);
    const front = dir > 0 ? c1 + 1 : c0 - 1;
    if (!(tileAt(front, r0) === 1 || tileAt(front, r1) === 1)) {
      const tgtAir = Math.abs(dx) > 8 ? dir * cfg.speed : 0;
      p.vx += (tgtAir - p.vx) * 0.35;
    }
    return;
  }

  // ── On ground: drive velocity toward waypoint ─────────────────────────────
  // Drop mode always runs full speed so the AI doesn't stall at platform edges.
  const tgtVx = p.aiMoveType === 'drop'
    ? dir * cfg.speed
    : Math.abs(dx) < 6 ? 0
    : dir * cfg.speed * Math.min(1, Math.abs(dx) / TILE);
  p.vx += (tgtVx - p.vx) * 0.6;

  // ── Environment sensors ───────────────────────────────────────────────────
  const col0     = Math.floor(p.x / TILE);
  const col1     = Math.floor((p.x + p.w - 1) / TILE);
  const row0     = Math.floor(p.y / TILE);
  const row1     = Math.floor((p.y + p.h - 1) / TILE);
  const floorRow = row1 + 1;
  const frontCol = dir > 0 ? col1 + 1 : col0 - 1;

  const wallAhead    = tileAt(frontCol, row0) === 1 || tileAt(frontCol, row1) === 1;
  const ceilingAbove = tileAt(col0, row0 - 1) === 1 || tileAt(col0, row0 - 2) === 1 ||
                       tileAt(col1, row0 - 1) === 1 || tileAt(col1, row0 - 2) === 1;

  // Gap sensor: only look one tile ahead so the AI doesn't jump prematurely.
  let gapAhead = false, canDrop = false;
  if (!p.onPlatform && (p.aiMoveType === 'drop' || Math.abs(dx) > TILE * 0.5)) {
    const c = dir > 0 ? col1 + 1 : col0 - 1;
    if (!hasFloorAt(c, floorRow)) {
      gapAhead = true;
      canDrop  = waypoint.y > p.y + TILE;
    }
  }

  const preset        = AI_PRESETS[aiPresetIdx];
  const waypointAbove = waypoint.y < p.y - TILE && Math.abs(dx) < TILE * preset.aboveDx;

  // Jump alignment depends on whether the target segment is to the side or above.
  //
  // Offset jump (new tier-based map): the target segment has no column overlap
  // with the current segment. The AI must be near the platform EDGE facing the
  // target before jumping — checking against the target segment's column range
  // would require walking off the edge first (since target columns start where
  // the current platform ends).
  //
  // Vertical/overlapping jump (e.g. floor → platform directly above): use the
  // standard proximity check against the target segment's columns.
  let jumpAligned = true;
  if (p.aiMoveType === 'jump' && p.aiPath && p.aiPath.length > 1) {
    const ns = aiSegs[p.aiPath[1]];
    if (ns) {
      if (pSeg >= 0) {
        const seg = aiSegs[pSeg];
        if (ns.minCol > seg.maxCol) {
          // Target is entirely to the right — be within 1 tile of the right edge.
          jumpAligned = col0 >= seg.maxCol - 1;
        } else if (ns.maxCol < seg.minCol) {
          // Target is entirely to the left — be within 1 tile of the left edge.
          jumpAligned = col1 <= seg.minCol + 1;
        } else {
          // Target overlaps horizontally (e.g. floor → platform above) —
          // standard check: be within 1 tile of target's column range.
          jumpAligned = col1 >= ns.minCol - 1 && col0 <= ns.maxCol + 1;
        }
      } else {
        jumpAligned = col1 >= ns.minCol - 1 && col0 <= ns.maxCol + 1;
      }
    }
  }

  const needsJump = !canDrop && jumpAligned && (wallAhead || gapAhead || waypointAbove);
  const canJump   = p.aiMoveType === 'jump';

  // ── Stuck recovery: invalidate the plan so the next grounded frame replans ─
  if (p.aiStuckTimer >= preset.stuckAt) {
    p.aiStuckTimer = 0;
    p.aiPlanSeg    = -1;
    if (!ceilingAbove) { p.vy = cfg.jump; p.onGround = false; }
  } else if (needsJump && canJump) {
    if (!ceilingAbove) {
      p.vy       = cfg.jump;
      p.onGround = false;
    } else {
      seekOpenSpace(p, pSeg);
    }
  }
}
