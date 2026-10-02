// Wires the page together: load data, build the world, draw and animate it, handle the camera and
// clicks, and replay the last day's activity on a loop so something is always happening.
import { buildWorld } from './world.mjs';
import { loadData } from './data.mjs';
import { CONFIG } from './config.mjs';
import { createView, fitView, zoomAt, toWorld, agentAt, agentPos, hubPos, draw } from './render.mjs';
import { renderPanel, ago } from './panel.mjs';
import { replayClock, due } from './anim.mjs';
import { createFeed } from './feed.mjs';

const $ = s => document.querySelector(s);
const canvas = $('#world'), ctx = canvas.getContext('2d'), panel = $('#panel');
const feed = createFeed($('#feed'));
const view = createView();
const state = { data: null, world: null, selected: null, hover: null, showDormant: false, size: { w: 0, h: 0, dpr: 1 }, needsFit: true };
const ui = { bubbles: new Map(), papers: [], hubGlow: 0 };

const LOOP_MS = 240e3;          // the last 24 hours replay in four minutes, then start over
const MAX_PER_FRAME = 6;        // after a pause in the tab, don't flood the screen
const BUBBLE_S = 4, FLIGHT_S = 1.6;
const t0 = performance.now(), seconds = () => (performance.now() - t0) / 1000;

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
  feed.setQuiet(state.world.events.length === 0 && !$('#feed ul').children.length);
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
  rebuild();      // the replay clock keeps running; only the events it draws from are swapped
}

// ----- replay: events the clock passes get a bubble, a page to the hub and a feed line
let lastClock = null;
function replay(t) {
  if (!state.world) return;
  const clock = replayClock(performance.now(), Date.now(), LOOP_MS);
  if (lastClock !== null) {
    const fired = due(state.world.events, lastClock, clock).slice(-MAX_PER_FRAME), byId = new Map(state.world.agents.map(a => [a.id, a]));
    for (const e of fired) {
      const agent = byId.get(e.agentId); if (!agent) continue;
      ui.bubbles.set(e.agentId, { text: e.text, result: e.result, from: t, until: t + BUBBLE_S });
      ui.papers.push({ agentId: e.agentId, result: e.result, start: t, dur: FLIGHT_S });
      feed.add(e, agent.name);
    }
  }
  lastClock = clock;
  ui.papers = ui.papers.filter(p => t - p.start < p.dur + 0.1);
  for (const [id, b] of ui.bubbles) if (t > b.until) ui.bubbles.delete(id);
  const arriving = ui.papers.some(p => { const k = (t - p.start) / p.dur; return k > 0.85 && k <= 1; });
  ui.hubGlow = arriving ? 1 : Math.max(0, ui.hubGlow - 0.05);
}

function tick() {
  const t = seconds();
  replay(t);
  draw(ctx, state.world, view, state.size.w, state.size.h, state.size.dpr, { ...ui, t, selectedId: state.selected, hoverId: state.hover });
  if (state.data) $('#sync').textContent = 'data · ' + ago(state.data.generatedAt);
  requestAnimationFrame(tick);
}

// ----- pointer: drag to pan, wheel to zoom, hover to see a name, click a character to select it
let drag = null;
const pointer = e => { const box = canvas.getBoundingClientRect(); return toWorld(view, e.clientX - box.left, e.clientY - box.top); };
canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => {
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (drag.moved) { view.x = drag.vx + dx; view.y = drag.vy + dy; }
    return;
  }
  if (!state.world) return;
  const p = pointer(e), hit = agentAt(state.world, p.x, p.y, seconds());
  state.hover = hit?.id || null;
  canvas.style.cursor = hit ? 'pointer' : 'grab';
});
canvas.addEventListener('pointerleave', () => { state.hover = null; });
canvas.addEventListener('pointerup', e => {
  const d = drag; drag = null;
  if (!d || d.moved || !state.world) return;
  const p = pointer(e);
  state.selected = agentAt(state.world, p.x, p.y, seconds())?.id || null;
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
