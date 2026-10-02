// Procedural pixel art: everything is drawn with filled rectangles, no image files.
// Coordinates are world pixels (one tile = 16 px); the camera scales the whole canvas.
export const TILE = 16;

export const COL = {
  bg: '#05080b', line: '#1d3644', floorA: '#0f1c25', floorB: '#0c1820', wall: '#2f5368', head: '#142631',
  text: '#cfe0ea', dim: '#6b8497', desk: '#6b4a2f', deskTop: '#82603f', screen: '#050a0e',
  ok: '#41e08a', fail: '#ff5d6c', running: '#3fd7e8', idle: '#f2b84b', asleep: '#5c6f80',
};
export const KIND = { workflow: '#7fb3c8', builder: '#a98bff', human: '#ff8a7a', local: '#f2a13b' };
const SKIN = '#f1c8a0';

const r = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };

export function drawRoom(ctx, room) {
  const x = room.x * TILE, y = room.y * TILE, w = room.w * TILE, h = room.h * TILE;
  for (let i = 0; i < room.w; i++) for (let j = 0; j < room.h; j++) r(ctx, x + i * TILE, y + j * TILE, TILE, TILE, (i + j) % 2 ? COL.floorA : COL.floorB);
  r(ctx, x, y, w, TILE * 2, COL.head);
  ctx.strokeStyle = room.dormant ? '#1c2a35' : COL.wall; ctx.lineWidth = 2;
  if (room.dormant) ctx.setLineDash([6, 4]);
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2); ctx.setLineDash([]);
  ctx.font = 'bold 9px monospace'; ctx.textBaseline = 'middle';
  ctx.fillStyle = room.dormant ? COL.dim : COL.text; ctx.textAlign = 'left';
  const room_chars = Math.max(6, Math.floor((w - (room.dormant ? 118 : 70)) / 5.6));   // keep the name inside its room
  const name = room.name.length > room_chars ? room.name.slice(0, room_chars - 1) + '…' : room.name;
  ctx.fillText(name.toUpperCase(), x + 8, y + TILE);
  ctx.fillStyle = COL.dim; ctx.font = '7px monospace'; ctx.textAlign = 'right';
  ctx.fillText(room.dormant ? 'CLOSED · QUIET 30D+' : `${room.agentCount} AGENT${room.agentCount === 1 ? '' : 'S'}`, x + w - 8, y + TILE);
  if (room.dormant) { ctx.textAlign = 'center'; ctx.font = 'bold 14px monospace'; ctx.fillStyle = '#243746'; ctx.fillText('z z z', x + w / 2, y + h / 2 + 8); }
  ctx.textAlign = 'left';
}

export function drawHub(ctx, hub) {
  const x = hub.x * TILE, y = hub.y * TILE, w = hub.w * TILE, h = hub.h * TILE, cx = x + w / 2, cy = y + h / 2;
  r(ctx, x, y, w, h, '#0a141b');
  ctx.strokeStyle = COL.running; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  for (let i = 0; i < 3; i++) { r(ctx, cx - 22, cy - 26 + i * 16, 44, 10, '#12242e'); r(ctx, cx + 14, cy - 23 + i * 16, 4, 4, COL.running); r(ctx, cx - 18, cy - 23 + i * 16, 4, 4, COL.ok); }
  ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = COL.running;
  ctx.fillText('GITHUB HUB', cx, y + h - 12); ctx.textAlign = 'left';
}

export function drawCorridor(ctx, from, to) {
  ctx.strokeStyle = '#0b161d'; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
  ctx.strokeStyle = '#16303d'; ctx.lineWidth = 1; ctx.setLineDash([4, 6]); ctx.stroke(); ctx.setLineDash([]);
}

// A desk with a monitor whose screen glows in the agent's status colour.
export function drawDesk(ctx, x, y, status) {
  r(ctx, x - 9, y - 7, 18, 8, COL.desk); r(ctx, x - 9, y - 7, 18, 2, COL.deskTop);
  r(ctx, x - 5, y - 16, 10, 8, '#1a2a35'); r(ctx, x - 4, y - 15, 8, 6, COL.screen); r(ctx, x - 3, y - 14, 6, 4, COL[status] || COL.asleep);
  r(ctx, x - 1, y - 8, 2, 1, '#1a2a35');
}

// A little person standing in front of the desk. (x, y) is the desk position; the feet sit below it.
export function drawPerson(ctx, x, y, kind, status) {
  const body = KIND[kind] || KIND.workflow, fy = y + 10;
  r(ctx, x - 5, fy - 1, 10, 2, 'rgba(0,0,0,.35)');
  r(ctx, x - 3, fy - 4, 2, 4, '#1b2733'); r(ctx, x + 1, fy - 4, 2, 4, '#1b2733');
  r(ctx, x - 4, fy - 10, 8, 7, body);
  r(ctx, x - 3, fy - 16, 6, 6, SKIN); r(ctx, x - 3, fy - 16, 6, 2, shade(body));
  if (status === 'asleep') { r(ctx, x - 2, fy - 12, 2, 1, '#2a2a2a'); r(ctx, x + 1, fy - 12, 2, 1, '#2a2a2a'); }
  else { r(ctx, x - 2, fy - 13, 1, 2, '#161616'); r(ctx, x + 1, fy - 13, 1, 2, '#161616'); }
  r(ctx, x - 1, fy - 21, 3, 3, COL[status] || COL.asleep);
}

export function drawSelection(ctx, x, y) {
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 2]);
  ctx.strokeRect(Math.round(x) - 12, Math.round(y) - 19, 24, 36); ctx.setLineDash([]);
}

function shade(hex) {
  const n = parseInt(hex.slice(1), 16), f = v => Math.max(0, Math.round(v * 0.55));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
