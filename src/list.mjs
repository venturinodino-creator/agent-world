// The floating dark panel on the right, built for a manager: the totals first (working, asleep, failing), a verdict in
// one line, the agents that need attention, then every repo with a small bar of its mix, the ones to look at first on
// top. Click a repo to open its agents. Names come from outside, so everything is set with textContent.
import { overview } from './overview.mjs';
import { ago } from './panel.mjs';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const KIND = { workflow: 'action', builder: 'coding agent', human: 'you', local: 'cowork', site: 'website' };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function verdictText(o) {
  if (o.verdict === 'attention') return plural(o.attention.length, 'agent needs attention', 'agents need attention');
  return o.verdict === 'busy' ? `All healthy, ${o.totals.working} working now` : 'All healthy, nothing running';
}

function tile(kind, n, label, onClick) {
  const t = el(onClick ? 'button' : 'div', `tile ${kind}${n ? '' : ' none'}`);
  if (onClick) { t.type = 'button'; t.onclick = onClick; }
  t.append(el('b', '', String(n)), el('span', '', label));
  return t;
}

// a thin bar showing the mix of an island's agents: working, asleep, failing
function mix(r) {
  const bar = el('span', 'mix');
  bar.title = r.dormant ? 'closed' : `${r.working} working, ${r.asleep} asleep, ${r.failing} failing`;
  for (const k of ['failing', 'working', 'asleep']) if (r[k]) { const s = el('i', k); s.style.flexGrow = String(r[k]); bar.append(s); }
  return bar;
}

export function renderList(root, world, state, on, now = Date.now()) {
  const o = overview(world), live = world.islands.filter(i => !i.dormant).length;
  const head = el('div', 'sidehead'); head.append(el('span', '', 'OVERVIEW'), el('span', 'cnt', `${live} repos · ${world.agents.length} agents`));
  const first = o.attention[0];
  const tiles = el('div', 'tiles');
  tiles.append(tile('working', o.totals.working, 'working'), tile('asleep', o.totals.asleep, 'asleep'), tile('failing', o.totals.failing, 'failing', first ? () => on.agent(first.id) : null));
  const verdict = el('p', `verdict ${o.verdict}`, verdictText(o));
  root.replaceChildren(head, tiles, verdict);

  if (o.attention.length) {
    root.append(el('div', 'threads', 'NEEDS ATTENTION'));
    const att = el('ul', 'attn');
    for (const a of o.attention) {
      const row = el('li', `thread attn${state.selectedAgent === a.id ? ' on' : ''}`);
      row.append(el('span', 'dot fail'), el('span', 'n', a.name), el('span', 'k', `${a.island}${a.date ? ' · ' + ago(a.date, now) : ''}`));
      row.title = `${a.name} · ${a.island}`;
      row.onclick = () => on.agent(a.id);
      att.append(row);
    }
    root.append(att);
  }

  root.append(el('div', 'threads', 'REPOS'));
  const list = el('ul');
  for (const r of o.repos) {
    const open = state.expanded.has(r.name) || state.selectedIsland === r.name;
    const row = el('li', `repo${state.selectedIsland === r.name && !state.selectedAgent ? ' on' : ''}`);
    row.append(el('span', `dot ${r.health}`), el('span', 'n', r.name), mix(r), el('span', 'c', r.dormant ? 'closed' : String(r.total)));
    row.onclick = () => on.island(r.name);
    list.append(row);
    if (!open) continue;
    if (r.total) list.append(el('li', 'threads', `${r.total} THREADS`));
    for (const a of world.agents.filter(x => x.island === r.name)) {
      const t = el('li', `thread${state.selectedAgent === a.id ? ' on' : ''}`);
      t.append(el('span', `dot ${a.status}`), el('span', 'n', a.name), el('span', 'k', KIND[a.kind] || a.kind));
      t.onclick = () => on.agent(a.id);
      list.append(t);
    }
  }
  root.append(list);
}
