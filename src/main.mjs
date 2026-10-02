// Wires the page together: load data, build the world, show it in 3D, handle clicks and the side panel,
// and replay the last day's activity on a loop so something is always happening.
import { buildWorld } from './world.mjs';
import { loadData } from './data.mjs';
import { CONFIG } from './config.mjs';
import { renderPanel, ago } from './panel.mjs';
import { renderList } from './list.mjs';
import { replayClock, due } from './anim.mjs';
import { createFeed } from './feed.mjs';

const $ = s => document.querySelector(s);
const feed = createFeed($('#feed'));
const labels = $('#labels'), card = $('#card'), side = $('#side');
const state = { data: null, world: null, selectedAgent: null, selectedIsland: null, hoverAgent: null, showDormant: false, expanded: new Set(), needsFit: true };
const ui = { papers: [], hubGlow: 0 };
const bubbles = new Map();       // agent id -> { el, from, until }
const islandLabels = new Map();  // island name -> element

const LOOP_MS = 240e3;           // the last 24 hours replay in four minutes, then start over
const MAX_PER_FRAME = 6;         // after a pause in the tab, don't flood the screen
const BUBBLE_S = 4.5, FLIGHT_S = 1.8;
const t0 = performance.now(), seconds = () => (performance.now() - t0) / 1000;

function message(text) { const b = $('#banner'); b.hidden = !text; b.textContent = text || ''; }

let scene = null;
try { scene = (await import('./scene.mjs')).createScene($('#stage')); }
catch { message('Could not load the 3D engine. It needs a connection to cdn.jsdelivr.net, so check your network and reload.'); }
if (!scene && !$('#banner').textContent) message('This browser could not start WebGL, which the 3D world needs. Try a current Chrome, Edge, Firefox or Safari.');

const el = (tag, cls, text) => { const e = document.createElement(tag); e.className = cls; if (text != null) e.textContent = text; return e; };

// ----- building and refreshing the world
function rebuild() {
  if (!state.data) return;
  state.world = buildWorld(state.data, CONFIG, Date.now(), { showDormant: state.showDormant });
  const w = state.world;
  if (state.selectedAgent && !w.agents.some(a => a.id === state.selectedAgent)) state.selectedAgent = null;
  if (state.selectedIsland && !w.islands.some(i => i.name === state.selectedIsland)) state.selectedIsland = null;
  scene?.setWorld(w, { refit: state.needsFit }); state.needsFit = false;
  islandLabels.forEach(e => e.remove()); islandLabels.clear();
  for (const isl of w.islands) {
    const e = el('div', `islandlabel ${isl.health}`, isl.name); e.append(el('small', '', isl.dormant ? 'closed' : `${isl.agentCount}`));
    labels.append(e); islandLabels.set(isl.name, e);
  }
  $('#btnDormant').textContent = 'dormant: ' + (state.showDormant ? 'shown' : 'hidden');
  $('#meta').textContent = `${w.islands.filter(i => !i.dormant).length} repos · ${w.agents.length} agents`;
  feed.setQuiet(w.events.length === 0 && !$('#feed ul').children.length);
  refreshUi();
}

function refreshUi() {
  if (state.world) renderList(side, state.world, state, { island: selectIsland, agent: selectAgent });
  const agent = state.world?.agents.find(a => a.id === state.selectedAgent) || null;
  renderPanel(card, agent, clearSelection);
  if (agent) placeCard();
}

// ----- selection
function selectAgent(id) {
  const a = state.world?.agents.find(x => x.id === id); if (!a) return;
  state.selectedAgent = id; state.selectedIsland = a.island; state.expanded.add(a.island);
  scene?.focusAgent(id); refreshUi();
}
function selectIsland(name) {
  const open = state.expanded.has(name) && state.selectedIsland === name && !state.selectedAgent;
  state.selectedAgent = null; state.selectedIsland = name;
  open ? state.expanded.delete(name) : state.expanded.add(name);
  scene?.focusIsland(name); refreshUi();
}
function clearSelection() { state.selectedAgent = null; refreshUi(); }

async function refresh() {
  const data = await loadData();
  if (!data) {
    message(state.data ? 'Could not refresh the data, showing the last copy.' : 'Could not load the data, so the world is empty. Check your connection and reload.');
    return;
  }
  message(''); state.data = data; rebuild();     // the replay clock keeps running; only the events it draws from are swapped
}

// ----- overlays that follow things in the 3D view
function place(elm, p, dy = 0) {
  elm.style.display = p && p.visible ? '' : 'none';
  if (p) { elm.style.left = `${p.x}px`; elm.style.top = `${p.y + dy}px`; }
}
function placeCard() {
  const p = scene?.agentHead(state.selectedAgent), box = $('#stage').getBoundingClientRect();
  if (!p || !p.visible) { card.style.visibility = 'hidden'; return; }
  card.style.visibility = '';
  const w = card.offsetWidth, h = card.offsetHeight;
  const left = Math.min(Math.max(8, p.x - w / 2), box.width - w - 8);
  let top = p.y - h - 28;
  if (top < 8) top = Math.min(p.y + 40, box.height - h - 8);
  card.style.left = `${left}px`; card.style.top = `${Math.max(8, top)}px`;
}

// ----- replay: events the clock passes get a bubble, a page flying to the hub and a feed line
let lastClock = null;
function replay(t) {
  if (!state.world) return;
  const clock = replayClock(performance.now(), Date.now(), LOOP_MS);
  if (lastClock !== null && scene) {
    const fired = due(state.world.events, lastClock, clock).slice(-MAX_PER_FRAME);
    for (const e of fired) {
      const agent = state.world.agents.find(a => a.id === e.agentId); if (!agent) continue;
      let b = bubbles.get(e.agentId);
      if (!b) { b = { el: el('div', 'bubble') }; labels.append(b.el); bubbles.set(e.agentId, b); }
      b.el.textContent = e.text; b.el.className = `bubble ${e.result}`; b.from = t; b.until = t + BUBBLE_S;
      ui.papers.push({ agentId: e.agentId, result: e.result, start: t, dur: FLIGHT_S });
      feed.add(e, agent.name);
    }
  }
  lastClock = clock;
  ui.papers = ui.papers.filter(p => t - p.start < p.dur + 0.1);
  ui.hubGlow = ui.papers.some(p => { const k = (t - p.start) / p.dur; return k > 0.85 && k <= 1; }) ? 1 : Math.max(0, ui.hubGlow - 0.05);
}

const hoverName = el('div', 'hovername'); hoverName.style.display = 'none'; labels.append(hoverName);
let pointer = null;

function tick() {
  const t = seconds();
  replay(t);
  if (pointer && scene && state.world) {                   // hover: what is under the mouse
    const hit = scene.pick(pointer.x, pointer.y);
    state.hoverAgent = hit?.agentId || null;
    scene.element.style.cursor = hit ? 'pointer' : 'grab'; pointer = null;
  }
  scene?.update(t, { ...ui, t, selectedId: state.selectedAgent, hoverId: state.hoverAgent });
  if (scene && state.world) {
    for (const isl of state.world.islands) { const e = islandLabels.get(isl.name); if (e) place(e, scene.islandLabel(isl)); }
    for (const [id, b] of bubbles) {
      if (t > b.until || !scene.hasAgent(id)) { b.el.remove(); bubbles.delete(id); continue; }
      place(b.el, scene.agentHead(id), -16); b.el.style.opacity = String(Math.max(0, Math.min(1, (t - b.from) * 5, (b.until - t) * 2.5)));
    }
    const h = state.hoverAgent && !bubbles.has(state.hoverAgent) ? state.world.agents.find(a => a.id === state.hoverAgent) : null;
    if (h) { hoverName.textContent = h.name; place(hoverName, scene.agentHead(h.id), -12); } else hoverName.style.display = 'none';
    if (state.selectedAgent) placeCard();
  }
  if (state.data) $('#sync').textContent = 'data · ' + ago(state.data.generatedAt);
  requestAnimationFrame(tick);
}

// ----- pointer: the scene's controls handle orbit, pan and zoom; a click without movement selects
if (scene) {
  let down = null;
  scene.element.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, at: performance.now() }; });
  scene.element.addEventListener('pointermove', e => { pointer = { x: e.clientX, y: e.clientY }; });
  scene.element.addEventListener('pointerleave', () => { state.hoverAgent = null; });
  scene.element.addEventListener('pointerup', e => {
    const d = down; down = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5 || performance.now() - d.at > 600 || !state.world) return;
    const hit = scene.pick(e.clientX, e.clientY);
    if (hit?.agentId) selectAgent(hit.agentId);
    else if (hit?.island) selectIsland(hit.island);
    else if (state.selectedAgent) clearSelection();
  });
}

$('#btnFit').onclick = () => scene?.fit();
$('#btnDormant').onclick = () => { state.showDormant = !state.showDormant; state.needsFit = true; rebuild(); };

refresh();
setInterval(refresh, 5 * 60e3);
requestAnimationFrame(tick);
