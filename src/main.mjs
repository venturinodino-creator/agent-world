// Wires the page together: load data, build the world, draw it, handle the camera and clicks.
import { buildWorld } from './world.mjs';
import { loadData } from './data.mjs';
import { CONFIG } from './config.mjs';
import { createView, fitView, zoomAt, toWorld, agentAt, draw } from './render.mjs';
import { renderPanel, ago } from './panel.mjs';

const $ = s => document.querySelector(s);
const canvas = $('#world'), ctx = canvas.getContext('2d'), panel = $('#panel');
const view = createView();
const state = { data: null, world: null, selected: null, showDormant: false, size: { w: 0, h: 0, dpr: 1 }, needsFit: true };

function resize() {
  const dpr = window.devicePixelRatio || 1, box = canvas.getBoundingClientRect();
  state.size = { w: box.width, h: box.height, dpr };
  canvas.width = Math.round(box.width * dpr); canvas.height = Math.round(box.height * dpr);
  if (state.world) fitView(view, state.world.bounds, box.width, box.height);
}

function rebuild() {
  if (!state.data) return;
  state.world = buildWorld(state.data, CONFIG, Date.now(), { showDormant: state.showDormant });
  if (state.selected && !state.world.agents.some(a => a.id === state.selected)) state.selected = null;
  if (state.needsFit) { fitView(view, state.world.bounds, state.size.w, state.size.h); state.needsFit = false; }
  $('#btnDormant').textContent = 'dormant: ' + (state.showDormant ? 'shown' : 'hidden');
  $('#meta').textContent = `${state.world.rooms.filter(r => !r.dormant).length} repos · ${state.world.agents.length} agents`;
  showPanel();
}

function showPanel() {
  const agent = state.world?.agents.find(a => a.id === state.selected) || null;
  renderPanel(panel, agent, () => { state.selected = null; showPanel(); });
}

function message(text) { const b = $('#banner'); b.hidden = !text; b.textContent = text || ''; }

async function refresh() {
  const data = await loadData();
  if (!data) {
    message(state.data ? 'Could not refresh the data, showing the last copy.' : 'Could not load the data, so the world is empty. Check your connection and reload.');
    return;
  }
  message('');
  state.data = data;
  rebuild();
}

function tick() {
  draw(ctx, state.world, view, state.size.w, state.size.h, state.size.dpr, state.selected);
  if (state.data) $('#sync').textContent = 'data · ' + ago(state.data.generatedAt);
  requestAnimationFrame(tick);
}

// ----- pointer: drag to pan, wheel to zoom, click a character to select it
let drag = null;
canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
  if (drag.moved) { view.x = drag.vx + dx; view.y = drag.vy + dy; }
});
canvas.addEventListener('pointerup', e => {
  const d = drag; drag = null;
  if (!d || d.moved || !state.world) return;
  const box = canvas.getBoundingClientRect(), p = toWorld(view, e.clientX - box.left, e.clientY - box.top);
  state.selected = agentAt(state.world, p.x, p.y)?.id || null;
  showPanel();
});
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const box = canvas.getBoundingClientRect();
  zoomAt(view, e.clientX - box.left, e.clientY - box.top, Math.exp(-e.deltaY * 0.0015));
}, { passive: false });

$('#btnFit').onclick = () => state.world && fitView(view, state.world.bounds, state.size.w, state.size.h);
$('#btnDormant').onclick = () => { state.showDormant = !state.showDormant; state.needsFit = true; rebuild(); };
addEventListener('resize', resize);

resize();
refresh();
setInterval(refresh, 5 * 60e3);
requestAnimationFrame(tick);
