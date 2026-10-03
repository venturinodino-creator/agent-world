// Wires the page together: load data, build the world, show it in 3D, handle clicks and the side panel,
// and replay the last day's activity on a loop so something is always happening.
import { buildWorld } from './world.mjs';
import { loadData } from './data.mjs';
import { CONFIG } from './config.mjs';
import { renderPanel, ago } from './panel.mjs';
import { renderList } from './list.mjs';
import { replayClock, due, ERRAND_SECONDS } from './anim.mjs';
import { createFeed } from './feed.mjs';
import { initAdmin, isAdmin, onAdminChange, mountSignIn, signOut } from './admin.mjs';
import { offerFor } from './activation.mjs';
import { createRequests } from './requests.mjs';

const $ = s => document.querySelector(s);
const feed = createFeed($('#feed'));
// The feed starts collapsed so it does not cover the world; a badge counts what arrived while it was closed.
const feedBox = $('#feed'), badge = $('#feedBadge'), toggle = $('#feedToggle');
let unseen = 0;
function setFeedOpen(open) {
  feedBox.classList.toggle('collapsed', !open); toggle.setAttribute('aria-expanded', String(open));
  if (open) { unseen = 0; badge.hidden = true; }
  try { localStorage.setItem('world.feedOpen', open ? '1' : '0'); } catch { /* storage blocked: the choice just is not remembered */ }
}
toggle.onclick = () => setFeedOpen(feedBox.classList.contains('collapsed'));
try { if (localStorage.getItem('world.feedOpen') === '1') setFeedOpen(true); } catch { /* collapsed by default */ }
const labels = $('#labels'), card = $('#card'), side = $('#side');
const state = { builtAt: 0, data: null, world: null, selectedAgent: null, selectedIsland: null, hoverAgent: null, showDormant: false, expanded: new Set(), needsFit: true };
const ui = { papers: [], errands: [], hubGlow: 0 };
const bubbles = new Map();       // agent id -> { el, from, until }
const islandLabels = new Map();  // island name -> element
const nameTags = new Map();      // agent id -> name tag shown when zoomed in
const NEAR_DISTANCE = 26;        // camera distance under which name tags appear
const MAX_TAGS = 5;              // name tags shown at once

const LOOP_MS = 240e3;           // the last 24 hours replay in four minutes, then start over
const MAX_PER_FRAME = 6;         // after a pause in the tab, don't flood the screen
const MAX_BUBBLES = 5;           // speech bubbles on screen at once; the robots still run every errand
const BUBBLE_S = 4.5, FLIGHT_S = 1.8;
const t0 = performance.now(), seconds = () => (performance.now() - t0) / 1000;

function message(text) { const b = $('#banner'); b.hidden = !text; b.textContent = text || ''; }

// The render effects (ambient occlusion, bloom, tilt-shift) are on by default and drop out by themselves on a slow
// machine. ?fx=1 or ?fx=0 forces them for a visit; the header button remembers the choice.
const fxParam = new URLSearchParams(location.search).get('fx');
let fxSaved = null;
try { fxSaved = localStorage.getItem('world.fx'); } catch { /* storage blocked: automatic */ }
const fxForce = fxParam === '1' ? true : fxParam === '0' ? false : fxSaved === 'on' ? true : fxSaved === 'off' ? false : null;
if (new URLSearchParams(location.search).has('debug')) {   // for measuring: ?debug
  window.__stats = () => scene?.stats(); window.__root = () => scene?.debugRoot();
  window.__edges = () => state.world.islands.flatMap(i => [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dx, dz]) => ({ island: i.name || i.id, ...scene.project(i.x + dx * i.radius, 0, i.z + dz * i.radius) })));
}
const showFx = () => { $('#btnFx').textContent = 'fx: ' + (scene?.fxOn() ? 'on' : 'off'); };
let scene = null;
try { scene = (await import('./scene.mjs')).createScene($('#stage'), { fx: fxForce, onFxAuto: showFx }); }
catch { message('Could not load the 3D engine. It needs a connection to cdn.jsdelivr.net, so check your network and reload.'); }
if (!scene && !$('#banner').textContent) message('This browser could not start WebGL, which the 3D world needs. Try a current Chrome, Edge, Firefox or Safari.');

const el = (tag, cls, text) => { const e = document.createElement(tag); e.className = cls; if (text != null) e.textContent = text; return e; };

// ----- Activate: only the signed-in Admin sees any of it (see activation.mjs and admin.mjs)
const act = { confirming: null, busy: null, error: null };   // the card's confirm step, the request in flight, the last refusal
await initAdmin();
const reqs = createRequests({ onChange: () => rebuild() });
mountSignIn($('#stage'));
const showAdmin = () => { $('#btnAdmin').hidden = !isAdmin(); };
showAdmin();
$('#btnAdmin').onclick = () => signOut();
onAdminChange(() => { showAdmin(); act.confirming = act.busy = act.error = null; reqs.resume(); if (state.data) rebuild(); });

// ----- building and refreshing the world
function rebuild() {
  if (!state.data) return;
  const base = buildWorld(state.data, CONFIG, Date.now(), { showDormant: state.showDormant });
  reqs.reconcileWith(base.agents);   // a run the hourly data has caught up with no longer needs its own overlay
  const overrides = reqs.overrides();
  state.world = Object.keys(overrides).length ? buildWorld(state.data, CONFIG, Date.now(), { showDormant: state.showDormant, statusOverrides: overrides }) : base;
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
  renderPanel(card, agent, clearSelection, Date.now(), { focus: () => scene?.focusAgent(state.selectedAgent), activation: agent && activationFor(agent) });
  if (agent) placeCard();
}

// What the card offers this agent right now, and what its buttons do (null when there is nothing to offer).
function activationFor(agent) {
  const request = reqs.requestFor(agent.id), ph = request ? reqs.phaseOf(request) : null;
  const offer = offerFor(agent, { admin: isAdmin(), request, phase: ph?.phase });
  if (!offer) return null;
  return {
    offer, confirming: act.confirming === agent.id, busy: act.busy === agent.id, runUrl: ph?.runUrl || null,
    error: act.error?.id === agent.id ? act.error.message : '',
    onAsk: () => { act.confirming = agent.id; act.error = null; refreshUi(); },
    onCancel: () => { act.confirming = null; refreshUi(); },
    onStart: async () => {
      act.confirming = null; act.busy = agent.id; act.error = null; refreshUi();
      const res = await reqs.start(agent);
      act.busy = null; act.error = res.ok ? null : { id: agent.id, message: res.message };
      refreshUi();
    },
  };
}

// ----- selection
function selectAgent(id) {
  const a = state.world?.agents.find(x => x.id === id); if (!a) return;
  if (act.confirming !== id) act.confirming = null;
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
  // The data only changes about once an hour, so most five-minute refreshes find the same snapshot. Rebuilding the
  // whole 3D world for nothing costs a visible hitch, so it is only redone for new data or when the clock-based
  // statuses (a committer counts as working for 30 minutes) may have moved on.
  const same = state.data && data.generatedAt && data.generatedAt === state.data.generatedAt && Date.now() - state.builtAt < 15 * 60e3;
  message(''); state.data = data;
  if (!same) { rebuild(); state.builtAt = Date.now(); }     // the replay clock keeps running; only the events it draws from are swapped
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
  // beside the agent, as in the reference: to its right when there is room, otherwise to its left,
  // and never under the repo panel on the right or the tool strip on the left
  const w = card.offsetWidth, h = card.offsetHeight, minX = 52, maxX = box.width - (side.offsetWidth ? side.offsetWidth + 24 : 8) - w;
  let left = p.x + 34;
  if (left > maxX) left = p.x - w - 34;
  left = Math.min(Math.max(minX, left), Math.max(minX, maxX));
  const top = Math.min(Math.max(8, p.y - 70), box.height - h - 8);
  card.style.left = `${left}px`; card.style.top = `${top}px`;
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
      if (!b && bubbles.size < MAX_BUBBLES) { b = { el: el('div', 'bubble') }; labels.append(b.el); bubbles.set(e.agentId, b); }
      if (b) { b.el.textContent = e.text; b.el.className = `bubble ${e.result}`; b.from = t; b.until = t + BUBBLE_S; }
      ui.papers.push({ agentId: e.agentId, result: e.result, start: t, dur: FLIGHT_S });
      ui.errands.push({ agentId: e.agentId, result: e.result, start: t });     // its robot walks the crate to the headquarters
      feed.add(e, agent.name);
      if (feedBox.classList.contains('collapsed')) { unseen++; badge.textContent = String(unseen); badge.hidden = false; }
    }
  }
  lastClock = clock;
  ui.papers = ui.papers.filter(p => t - p.start < p.dur + 0.1);
  ui.errands = ui.errands.filter(e => t - e.start < ERRAND_SECONDS + 0.2);
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
    // zoomed in: a name tag over the agents nearest the middle of the view, so you can see who is doing what
    // only a handful, working agents first, so busy islands stay readable
    const working = id => (state.world.agents.find(x => x.id === id)?.status === 'running' ? 1 : 0);
    const near = scene.cameraDistance() < NEAR_DISTANCE
      ? new Set(scene.nearAgents(11, 16).sort((a, b) => working(b) - working(a)).slice(0, MAX_TAGS)) : new Set();
    for (const [id, tag] of nameTags) if (!near.has(id) || id === state.selectedAgent) { tag.remove(); nameTags.delete(id); }
    for (const id of near) {
      if (id === state.selectedAgent) continue;
      const a = state.world.agents.find(x => x.id === id); if (!a) continue;
      let tag = nameTags.get(id);
      if (!tag) { tag = el('div', 'worklabel'); tag.append(el('span', `dot ${a.status}`), el('span', 'wn', a.name)); labels.append(tag); nameTags.set(id, tag); }
      tag.classList.toggle('working', a.status === 'running');
      place(tag, scene.agentHead(id), -4);
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
  // keep the world centred in the space left of the side panel
  const inset = () => scene.setInset(side.offsetWidth && getComputedStyle(side).display !== 'none' ? side.offsetWidth + 24 : 0);
  inset(); addEventListener('resize', inset);
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

const toggleDormant = () => { state.showDormant = !state.showDormant; state.needsFit = true; rebuild(); };
$('#btnFit').onclick = $('#tbFit').onclick = () => scene?.fit();
showFx();
$('#btnFx').onclick = () => {
  if (!scene) return;
  const on = !scene.fxOn(); scene.setFx(on); showFx();
  try { localStorage.setItem('world.fx', on ? 'on' : 'off'); } catch { /* storage blocked: the choice just is not remembered */ }
};
$('#btnDormant').onclick = $('#tbDormant').onclick = toggleDormant;
$('#tbIn').onclick = () => scene?.zoom(0.7);
$('#tbOut').onclick = () => scene?.zoom(1.4);

refresh();
setInterval(refresh, 5 * 60e3);
requestAnimationFrame(tick);
