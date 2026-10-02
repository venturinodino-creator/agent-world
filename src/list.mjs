// The floating dark panel on the right: every repo with its agents underneath, like the thread list in the
// reference. Names come from outside, so everything is set with textContent.
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const KIND = { workflow: 'action', builder: 'coding agent', human: 'you', local: 'cowork' };

export function renderList(root, world, state, on) {
  const live = world.agents.length;
  const head = el('div', 'sidehead'); head.append(el('span', '', 'ALL REPOS'), el('span', 'cnt', `${world.islands.filter(i => !i.dormant).length} repos · ${live} agents`));
  root.replaceChildren(head);
  const list = el('ul');
  for (const isl of world.islands) {
    const open = state.expanded.has(isl.name) || state.selectedIsland === isl.name;
    const row = el('li', `repo${state.selectedIsland === isl.name && !state.selectedAgent ? ' on' : ''}`);
    row.append(el('span', `dot ${isl.health}`), el('span', 'n', isl.name), el('span', 'c', isl.dormant ? 'closed' : String(isl.agentCount)));
    row.onclick = () => on.island(isl.name);
    list.append(row);
    if (!open) continue;
    if (isl.agentCount) list.append(el('li', 'threads', `${isl.agentCount} THREADS`));
    for (const a of world.agents.filter(x => x.island === isl.name)) {
      const t = el('li', `thread${state.selectedAgent === a.id ? ' on' : ''}`);
      t.append(el('span', `dot ${a.status}`), el('span', 'n', a.name), el('span', 'k', KIND[a.kind] || a.kind));
      t.onclick = () => on.agent(a.id);
      list.append(t);
    }
  }
  root.append(list);
}
