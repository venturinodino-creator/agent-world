// Draws the world on a canvas and handles the camera. Everything about what exists comes from the
// world model; this file only decides how it looks.
import { TILE, COL, drawRoom, drawHub, drawCorridor, drawDesk, drawPerson, drawSelection } from './sprites.mjs';

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

export function agentAt(world, wx, wy) {
  for (let i = world.agents.length - 1; i >= 0; i--) {
    const a = world.agents[i], x = a.desk.x * TILE, y = a.desk.y * TILE;
    if (wx >= x - 10 && wx <= x + 10 && wy >= y - 17 && wy <= y + 12) return a;
  }
  return null;
}

export function draw(ctx, world, view, cw, ch, dpr, selectedId) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, cw, ch);
  if (!world) return;
  ctx.save();
  ctx.translate(view.x, view.y); ctx.scale(view.zoom, view.zoom);
  ctx.imageSmoothingEnabled = false;
  const hub = { x: (world.hub.x + world.hub.w / 2) * TILE, y: (world.hub.y + world.hub.h / 2) * TILE };
  for (const room of world.rooms) drawCorridor(ctx, hub, { x: (room.x + room.w / 2) * TILE, y: (room.y + room.h / 2) * TILE });
  for (const room of world.rooms) drawRoom(ctx, room);
  drawHub(ctx, world.hub);
  for (const a of world.agents) {
    const x = a.desk.x * TILE, y = a.desk.y * TILE;
    drawDesk(ctx, x, y, a.status);
    drawPerson(ctx, x, y, a.kind, a.status);
    if (a.id === selectedId) drawSelection(ctx, x, y);
  }
  ctx.restore();
}
