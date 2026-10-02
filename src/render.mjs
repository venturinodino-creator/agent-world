// Draws the world on a canvas and handles the camera. What exists comes from the world model and how it
// moves comes from anim.mjs; this file only decides how it looks.
import { TILE, COL, drawRoom, drawHub, drawCorridor, drawDesk, drawPerson, drawSelection, drawHighlight, drawBubble, drawPaper } from './sprites.mjs';
import { pose } from './anim.mjs';

export const createView = () => ({ x: 0, y: 0, zoom: 1 });

export function fitView(view, bounds, cw, ch) {
  const pad = 24, wpx = bounds.w * TILE, hpx = bounds.h * TILE;
  view.zoom = Math.max(0.05, Math.min((cw - pad * 2) / wpx, (ch - pad * 2) / hpx));
  view.x = (cw - wpx * view.zoom) / 2;
  view.y = (ch - hpx * view.zoom) / 2;
}

// Zoom keeping the world point under (sx, sy) where it is on screen.
export function zoomAt(view, sx, sy, factor) {
  const next = Math.max(0.05, Math.min(6, view.zoom * factor)), k = next / view.zoom;
  view.x = sx - (sx - view.x) * k; view.y = sy - (sy - view.y) * k; view.zoom = next;
}

export const toWorld = (view, sx, sy) => ({ x: (sx - view.x) / view.zoom, y: (sy - view.y) / view.zoom });

// Where an agent stands right now, in world pixels (its desk plus the pose offset).
export const agentPos = (a, t) => ({ x: a.desk.x * TILE + pose(a, t).dx, y: a.desk.y * TILE });
export const hubPos = world => ({ x: (world.hub.x + world.hub.w / 2) * TILE, y: (world.hub.y + world.hub.h / 2) * TILE });

export function agentAt(world, wx, wy, t) {
  for (let i = world.agents.length - 1; i >= 0; i--) {
    const p = agentPos(world.agents[i], t);
    if (wx >= p.x - 10 && wx <= p.x + 10 && wy >= p.y - 17 && wy <= p.y + 12) return world.agents[i];
  }
  return null;
}

const RESULT_COLOR = { ok: COL.ok, fail: COL.fail, running: COL.running };

// ui: { selectedId, hoverId, t (seconds), bubbles: Map(agentId -> {text, result, from, until}), papers: [{agentId, result, start, dur}], hubGlow }
export function draw(ctx, world, view, cw, ch, dpr, ui) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, cw, ch);
  if (!world) return;
  const { t } = ui, byId = new Map(world.agents.map(a => [a.id, a]));
  ctx.save();
  ctx.translate(view.x, view.y); ctx.scale(view.zoom, view.zoom);
  ctx.imageSmoothingEnabled = false;
  const hub = hubPos(world);
  for (const room of world.rooms) drawCorridor(ctx, hub, { x: (room.x + room.w / 2) * TILE, y: (room.y + room.h / 2) * TILE });
  for (const room of world.rooms) drawRoom(ctx, room);
  drawHub(ctx, world.hub, ui.hubGlow || 0);
  for (const a of world.agents) {
    const p = pose(a, t), x = a.desk.x * TILE, y = a.desk.y * TILE;
    drawDesk(ctx, x, y, a.status, p);
    drawPerson(ctx, x, y, a.kind, a.status, p, t);
    if (a.id === ui.hoverId) drawHighlight(ctx, x + p.dx, y);
    if (a.id === ui.selectedId) drawSelection(ctx, x + p.dx, y);
  }
  for (const pg of ui.papers) {      // pages flying from a desk to the hub, in an arc
    const a = byId.get(pg.agentId); if (!a) continue;
    const k = (t - pg.start) / pg.dur; if (k < 0 || k > 1) continue;
    const from = agentPos(a, pg.start), e = k * k * (3 - 2 * k);
    drawPaper(ctx, from.x + (hub.x - from.x) * e, from.y - 8 + (hub.y - from.y + 8) * e - Math.sin(k * Math.PI) * 22, RESULT_COLOR[pg.result] || COL.running);
  }
  const showName = (a, text, color, alpha) => { const p = agentPos(a, t); drawBubble(ctx, p.x, p.y, text, color, alpha); };
  for (const [id, b] of ui.bubbles) {
    const a = byId.get(id); if (!a || t > b.until) continue;
    const fade = Math.min(1, (t - b.from) * 6, (b.until - t) * 3);
    showName(a, b.text, RESULT_COLOR[b.result] || COL.running, Math.max(0, fade));
  }
  const hovered = ui.hoverId && byId.get(ui.hoverId);
  if (hovered && !(ui.bubbles.get(ui.hoverId)?.until > t)) showName(hovered, hovered.name, COL.dim, 1);
  ctx.restore();
}
