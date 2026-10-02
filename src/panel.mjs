// The side panel that describes one agent. Built with DOM calls and textContent, never innerHTML,
// because commit messages and workflow names are text from outside this page.
export const ago = (iso, now = Date.now()) => {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
};

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const link = (text, url) => { const a = el('a', '', text); a.href = url; a.target = '_blank'; a.rel = 'noopener'; return a; };
const safeUrl = u => (typeof u === 'string' && /^https:\/\//.test(u) ? u : null);

const KIND_LABEL = { workflow: 'GitHub Action', builder: 'Coding agent', human: 'Human', local: 'Cowork · local agent' };
const STATUS_LABEL = { running: 'running now', ok: 'healthy', fail: 'failing', idle: 'idle', asleep: 'asleep' };

export function renderPanel(root, agent, onClose, now = Date.now()) {
  root.replaceChildren();
  root.hidden = !agent;
  if (!agent) return;
  const head = el('div', 'ph');
  const state = el('span'); state.append(el('span', `dot ${agent.status}`), ' ', STATUS_LABEL[agent.status] || agent.status);
  const x = el('button', 'x', '×'); x.setAttribute('aria-label', 'Close'); x.onclick = onClose;
  head.append(state, x);

  const body = el('div', 'body');
  body.append(el('h2', '', agent.name));
  const sub = el('p', 'sub');
  sub.append(el('span', 'tag', KIND_LABEL[agent.kind] || agent.kind));
  if (agent.repo) sub.append('  in ', el('b', '', agent.repo));
  body.append(sub);

  const d = agent.details || {};
  if (agent.kind === 'local') {
    if (d.role) body.append(el('p', 'role', d.role));
    const grid = el('div', 'stats');
    grid.append(stat(d.schedule || '—', 'schedule'));
    body.append(grid, el('p', 'note', d.note));
  } else if (d.latest) {
    const grid = el('div', 'stats');
    if (agent.kind === 'workflow') {
      grid.append(stat(d.latest.result, 'latest run'), stat(ago(d.latest.date, now), 'when'), stat((d.latest.event || '—').replace(/_/g, ' '), 'triggered by'));
    } else {
      grid.append(stat(ago(d.latest.date, now), 'last commit'), stat(String(d.count ?? d.recent.length), 'commits · 8w'));
    }
    body.append(grid);
    body.append(el('div', 'sec', agent.kind === 'workflow' ? 'Recent runs' : 'Recent commits'));
    const list = el('ul', 'runs');
    for (const it of d.recent) {
      const li = el('li'), line = el('span', 'm'), url = safeUrl(it.url);
      const label = it.result || it.text;
      line.append(url ? link(label, url) : label, ' ', el('span', 't', ago(it.date, now) + (it.event ? ' · ' + it.event.replace(/_/g, ' ') : '')));
      li.append(el('span', `dot ${it.result === 'failed' ? 'fail' : it.result === 'running' ? 'running' : 'ok'}`), line);
      list.append(li);
    }
    body.append(list);
  }
  const links = el('div', 'links'), repoUrl = safeUrl(agent.url);
  if (repoUrl) links.append(link(agent.kind === 'workflow' ? 'Open latest run' : 'Open repo', repoUrl));
  if (links.childNodes.length) body.append(links);
  root.append(head, body);
}

function stat(value, label) {
  const s = el('div', 'stat');
  s.append(el('b', '', value), el('span', '', label));
  return s;
}
