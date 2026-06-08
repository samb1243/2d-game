const STARS = [[55,28],[130,55],[210,18],[360,42],[520,12],[660,48],[790,32],[910,22],[75,115],[310,108],[610,88],[860,125]];

function drawBG() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#06060f');
  g.addColorStop(1, '#0e0e24');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  STARS.forEach(([x, y]) => ctx.fillRect(x, y, 2, 2));
}

function drawTiles() {
  for (let r = 0; r < MAP_H; r++) {
    for (let c = 0; c < MAP_W; c++) {
      const t = tiles[r][c], x = c * TILE, y = r * TILE;
      if (t === 1) {
        ctx.fillStyle = '#243024'; ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = '#3a5a3a'; ctx.fillRect(x, y, TILE, 5);
        ctx.strokeStyle = '#182518'; ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
      } else if (t === 2) {
        ctx.fillStyle = '#180808'; ctx.fillRect(x, y + TILE * 0.38, TILE, TILE * 0.62);
        ctx.fillStyle = '#cc2222';
        const sw = TILE / 4;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(x + i * sw,          y + TILE);
          ctx.lineTo(x + i * sw + sw / 2, y + TILE * 0.38);
          ctx.lineTo(x + i * sw + sw,     y + TILE);
          ctx.fill();
        }
      }
    }
  }
}

function drawPlatforms() {
  for (const pl of platforms) {
    ctx.fillStyle = '#6a4418'; ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
    ctx.fillStyle = '#9a7038'; ctx.fillRect(pl.x, pl.y, pl.w, 4);
  }
}

function drawFlag() {
  const fx = flagPos.col * TILE, fy = flagPos.row * TILE;

  ctx.fillStyle = '#999'; ctx.fillRect(fx + 12, fy - 51, 3, 52);
  ctx.fillStyle = '#22cc22';
  ctx.beginPath();
  ctx.moveTo(fx + 15, fy - 51); ctx.lineTo(fx + 35, fy - 39); ctx.lineTo(fx + 15, fy - 27);
  ctx.fill();
  ctx.fillStyle = '#777'; ctx.fillRect(fx + 5, fy, 24, 5);

  const grd = ctx.createRadialGradient(fx + 16, fy - 39, 2, fx + 16, fy - 39, 18);
  grd.addColorStop(0, 'rgba(0,255,0,0.18)'); grd.addColorStop(1, 'rgba(0,255,0,0)');
  ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(fx + 16, fy - 39, 18, 0, Math.PI * 2); ctx.fill();
}

function drawGems() {
  for (const g of gems) {
    if (g.collected[0] && g.collected[1]) continue;
    const bob = Math.sin(animTick * 0.055 + g.bobOffset) * 4;
    ctx.globalAlpha = (g.collected[0] || g.collected[1]) ? 0.35 : 1;

    const grd = ctx.createRadialGradient(g.x, g.y + bob, 2, g.x, g.y + bob, 15);
    grd.addColorStop(0, 'rgba(255,255,80,0.55)'); grd.addColorStop(1, 'rgba(255,200,0,0)');
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(g.x, g.y + bob, 15, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#ffe038'; ctx.strokeStyle = '#e09000'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(g.x,     g.y - 10 + bob);
    ctx.lineTo(g.x + 8, g.y + bob);
    ctx.lineTo(g.x,     g.y + 10 + bob);
    ctx.lineTo(g.x - 8, g.y + bob);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    ctx.globalAlpha = 1;
    if (g.collected[0]) { ctx.fillStyle = players[0].color; ctx.beginPath(); ctx.arc(g.x - 5, g.y - 14 + bob, 3, 0, Math.PI * 2); ctx.fill(); }
    if (g.collected[1]) { ctx.fillStyle = players[1].color; ctx.beginPath(); ctx.arc(g.x + 5, g.y - 14 + bob, 3, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
}

function drawPlayer(p) {
  if (p.dead && Math.floor(p.deathTimer / 5) % 2 === 0) return;
  const { color, hatIdx, name, gemsCollected, finished } = p;
  // If the player has separate draw dimensions (AI smaller hitbox), centre the
  // visual body over the hitbox horizontally and align the feet at the bottom.
  const w = p.drawW !== undefined ? p.drawW : p.w;
  const h = p.drawH !== undefined ? p.drawH : p.h;
  const x = p.x - (w - p.w) / 2;
  const y = p.y + p.h - h;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(x + w / 2, y + h + 2, w / 2 - 2, 4, 0, 0, Math.PI * 2); ctx.fill();

  // Body + belt + legs
  ctx.fillStyle = color; ctx.fillRect(x + 3, y + 11, w - 6, h - 11);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + 3, y + h - 12, w - 6, 3);
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(x + 5,      y + h - 9, 7, 9);
  ctx.fillRect(x + w - 12, y + h - 9, 7, 9);

  // Head + eyes
  ctx.fillStyle = '#d4aa7a'; ctx.fillRect(x + 4, y + 2, w - 8, 12);
  ctx.fillStyle = '#111';
  ctx.fillRect(x + 7,      y + 5, 3, 3);
  ctx.fillRect(x + w - 10, y + 5, 3, 3);

  // Hat
  if (hatIdx === 1) {
    ctx.fillStyle = color; ctx.fillRect(x + 2, y - 8, w - 4, 11);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 2, y + 1, w - 4, 3);
    ctx.fillStyle = 'rgba(80,200,255,0.45)'; ctx.fillRect(x + 6, y - 5, w - 12, 6);
    ctx.strokeStyle = 'rgba(120,220,255,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(x + 6, y - 5, w - 12, 6);
  } else if (hatIdx === 2) {
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.moveTo(x + 3,     y + 2);  ctx.lineTo(x + 3,     y - 9);
    ctx.lineTo(x + w / 2, y - 4);  ctx.lineTo(x + w / 2, y - 14);
    ctx.lineTo(x + w - 3, y - 4);  ctx.lineTo(x + w - 3, y + 2);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#f44'; ctx.beginPath(); ctx.arc(x + w / 2, y - 14, 2.5, 0, Math.PI * 2); ctx.fill();
  }

  // Name tag
  const tagTop = y - (hatIdx === 1 ? 18 : hatIdx === 2 ? 24 : 8);
  ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillText(name, x + w / 2 + 1, tagTop + 1);
  ctx.fillStyle = color;              ctx.fillText(name, x + w / 2,     tagTop);

  if (gemsCollected > 0) {
    ctx.fillStyle = '#ffe040'; ctx.font = 'bold 9px sans-serif';
    ctx.fillText(`♦${gemsCollected}`, x + w / 2, tagTop - 10);
  }
  if (finished) {
    ctx.fillStyle = '#ff0'; ctx.font = 'bold 12px sans-serif';
    ctx.fillText('WIN!', x + w / 2, tagTop - 22);
  }
}

function drawAIDebug(p) {
  if (!showAIDebug || !p.isAI) return;

  const preset = AI_PRESETS[aiPresetIdx];
  const pSeg   = getPlayerSegIdx(p);

  // ── Segment underlines: cyan = current, yellow = in path, faint blue = other ─
  for (let i = 0; i < aiSegs.length; i++) {
    const s      = aiSegs[i];
    const inPath = p.aiPath && p.aiPath.includes(i);
    ctx.lineWidth   = i === pSeg ? 4 : 2;
    ctx.strokeStyle = i === pSeg ? 'rgba(0,230,255,0.95)'
                    : inPath     ? 'rgba(255,220,0,0.85)'
                    :              'rgba(80,140,255,0.28)';
    ctx.beginPath();
    ctx.moveTo(s.minCol * TILE,       s.row * TILE);
    ctx.lineTo((s.maxCol + 1) * TILE, s.row * TILE);
    ctx.stroke();
  }

  // ── Adjacency edges from current segment (one hop) ─────────────────────────
  // White = walk, lime = jump, orange = drop — shows what the graph considers reachable.
  if (pSeg >= 0) {
    const a  = aiSegs[pSeg];
    const ax = (a.minCol + a.maxCol + 1) / 2 * TILE, ay = a.row * TILE - 2;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 4]);
    for (const edge of aiAdj[pSeg]) {
      const b  = aiSegs[edge.idx];
      const bx = (b.minCol + b.maxCol + 1) / 2 * TILE, by = b.row * TILE - 2;
      ctx.strokeStyle = edge.moveType === 'walk' ? 'rgba(200,200,200,0.35)'
                      : edge.moveType === 'jump' ? 'rgba(60,255,100,0.5)'
                      :                            'rgba(255,140,50,0.55)';
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // ── Planned path dashes + per-step move-type label (W / J / D) ────────────
  if (p.aiPath && p.aiPath.length > 1) {
    ctx.strokeStyle = 'rgba(255,220,0,0.6)';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    for (let i = 0; i < p.aiPath.length; i++) {
      const s  = aiSegs[p.aiPath[i]];
      const cx = (s.minCol + s.maxCol + 1) / 2 * TILE, cy = s.row * TILE;
      i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    const steps = Math.min(p.aiPath.length - 1, 6);
    for (let i = 0; i < steps; i++) {
      const sa = aiSegs[p.aiPath[i]], sb = aiSegs[p.aiPath[i + 1]];
      const acx = (sa.minCol + sa.maxCol + 1) / 2 * TILE;
      const bcx = (sb.minCol + sb.maxCol + 1) / 2 * TILE;
      const mx  = (acx + bcx) / 2, my = (sa.row + sb.row) / 2 * TILE - 8;
      const e   = aiAdj[p.aiPath[i]].find(ed => ed.idx === p.aiPath[i + 1]);
      const lbl = e ? e.moveType[0].toUpperCase() : '?';
      const clr = e && e.moveType === 'drop' ? '#ff9944'
                : e && e.moveType === 'jump' ? '#44ff88' : '#dddddd';
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(lbl, mx + 1, my + 1);
      ctx.fillStyle = clr;               ctx.fillText(lbl, mx,     my);
    }
  }

  // ── Waypoint: dashed line from AI centre + cyan dot ────────────────────────
  if (p.aiWaypoint) {
    const wx = p.aiWaypoint.x, wy = p.aiWaypoint.y + p.h;
    ctx.strokeStyle = 'rgba(0,210,255,0.4)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(p.x + p.w / 2, p.y + p.h / 2);
    ctx.lineTo(wx, wy);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(0,230,255,0.9)';
    ctx.beginPath(); ctx.arc(wx, wy, 5, 0, Math.PI * 2); ctx.fill();

    // Downward triangle when in drop mode — shows the AI intends to fall here
    if (p.aiMoveType === 'drop') {
      ctx.fillStyle = 'rgba(255,140,40,0.9)';
      ctx.beginPath();
      ctx.moveTo(wx,     wy + 8);
      ctx.lineTo(wx - 5, wy + 1);
      ctx.lineTo(wx + 5, wy + 1);
      ctx.closePath(); ctx.fill();
    }
  }

  // ── Target: orange dot ─────────────────────────────────────────────────────
  if (p.aiTarget) {
    ctx.fillStyle = 'rgba(255,120,0,0.85)';
    ctx.beginPath(); ctx.arc(p.aiTarget.x, p.aiTarget.y, 7, 0, Math.PI * 2); ctx.fill();
  }

  // ── Status panel (top-left) ────────────────────────────────────────────────
  const moveClr  = p.aiMoveType === 'drop' ? '#ff9944'
                 : p.aiMoveType === 'jump' ? '#44ff88' : '#efefef';
  const pathLen  = p.aiPath ? p.aiPath.length : 0;
  const stuckPct = p.aiStuckTimer || 0;
  const ttl      = p.aiWaypointDeadline > 0 ? Math.max(0, p.aiWaypointDeadline - animTick) : '—';
  const rows = [
    { text: `preset: ${preset.name}  [P to cycle]`,                                   color: '#ffe040' },
    { text: `move: ${(p.aiMoveType||'—').padEnd(4).toUpperCase()}  stuck:${stuckPct}/${preset.stuckAt}`, color: moveClr  },
    { text: `gnd:${p.onGround?'Y':'N'}  seg:${pSeg>=0?pSeg:'—'}  path:${pathLen>0?pathLen+' segs':'none'}  ttl:${ttl}`, color: '#ffe040' },
  ];
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'left';
  rows.forEach(({ text, color }, i) => {
    const ty = 20 + i * 16;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(text, 9, ty + 1);
    ctx.fillStyle = color;              ctx.fillText(text, 8, ty);
  });

  // Reset canvas state
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.textAlign = 'left';
}

function drawDeathNotice(p) {
  if (!p.dead) return;
  const txt = `${p.name} respawning...`;
  const px  = p.id === 0 ? 12 : W - 12;
  ctx.font = 'bold 12px sans-serif'; ctx.textAlign = p.id === 0 ? 'left' : 'right';
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillText(txt, px + 1, H - 6);
  ctx.fillStyle = p.color;             ctx.fillText(txt, px,     H - 7);
}
