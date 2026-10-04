// The card that pops up over a clicked agent, like the one in the reference: avatar, title, a status chip
// and progress bar, an Open button, then the details. Built with DOM calls and textContent, never
// innerHTML, because commit messages and workflow names are text from outside this page.
export const ago = (iso, now = Date.now()) => {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
};

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const link = (text, url, cls) => { const a = el('a', cls, text); a.href = url; a.target = '_blank'; a.rel = 'noopener'; return a; };
const safeUrl = u => (typeof u === 'string' && /^https:\/\//.test(u) ? u : null);

const KIND_LABEL = { workflow: 'GitHub Action', builder: 'Coding agent', human: 'Human', local: 'Cowork · local agent' };
const STATUS_WORD = { running: 'Working', ok: 'Healthy', fail: 'Failed', idle: 'Idle', asleep: 'Scheduled' };
const BAR = { running: 55, ok: 100, fail: 100, idle: 60, asleep: 0 };

// actions: { focus } handlers for the buttons.
export function renderPanel(root, agent, onClose, now = Date.now(), actions = {}) {
  root.replaceChildren();
  root.hidden = !agent;
  if (!agent) return;
  const d = agent.details || {};
  const when = agent.kind === 'local' ? 'not tracked live' : d.latest?.date ? ago(d.latest.date, now) : '';

  const top = el('div', 'cardtop');
  const face = el('div', 'avatar'); face.append(el('i'), el('i'));
  const titles = el('div', 'titles');
  titles.append(el('h2', '', agent.name));
  const chips = el('div', 'chips'), chip = el('span', `chip ${agent.status}`);
  chip.append(el('span', `dot ${agent.status}`), STATUS_WORD[agent.status] || agent.status);
  chips.append(chip, el('span', 'when', when));
  titles.append(chips);
  const x = el('button', 'x', '×'); x.setAttribute('aria-label', 'Close'); x.onclick = onClose;
  top.append(face, titles, x);

  const bar = el('div', `bar ${agent.status}`); bar.append(el('i')); bar.firstChild.style.width = `${BAR[agent.status] ?? 0}%`;

  // For the signed-in Admin, an agent that is not working gets an Activate button in place of the GitHub link
  // (see activation.mjs); everyone else keeps the plain Open link.
  const act = actions.activation, offer = act?.offer;
  const buttons = el('div', 'buttons'), url = safeUrl(agent.kind === 'workflow' ? d.latest?.url || agent.url : agent.url);
  if (offer?.kind === 'activate') {
    const run = el('button', 'open run', act.busy ? 'Starting…' : `▶ ${offer.label}`); run.type = 'button'; run.disabled = !!(act.busy || act.confirming);
    run.onclick = () => act.onAsk?.(); buttons.append(run);
  } else if (offer?.kind === 'pending') {
    const wait = el('button', 'open run pending', offer.label); wait.type = 'button'; wait.disabled = true; buttons.append(wait);
  } else if (offer?.kind === 'cowork') {
    buttons.append(link('↗ ' + offer.label, offer.url, 'open'));
  } else if (offer?.kind === 'signin') {
    const work = el('button', 'open run', '▶ ' + offer.label); work.type = 'button'; work.onclick = () => act.onSignIn?.(); buttons.append(work);
    if (url) buttons.append(link('↗ Open', url, 'open alt'));
  } else if (offer?.kind === 'manual') {
    const work = el('button', 'open run', '▶ ' + offer.label); work.type = 'button'; work.disabled = true; buttons.append(work);
    if (url) buttons.append(link('↗ Open', url, 'open alt'));
  } else if (url) buttons.append(link('↗ Open', url, 'open'));
  const focus = el('button', 'ghost', '⌖ Focus'); focus.type = 'button'; focus.onclick = () => actions.focus?.();
  buttons.append(focus);
  const extras = [];
  if (offer?.kind === 'activate' && act.confirming) {
    const box = el('div', 'confirm'), yes = el('button', 'open', 'Yes, start'), no = el('button', 'ghost', 'Cancel');
    yes.type = no.type = 'button'; yes.onclick = () => act.onStart?.(); no.onclick = () => act.onCancel?.();
    const row = el('div', 'row'); row.append(yes, no); box.append(el('p', '', offer.confirm), row); extras.push(box);
  }
  if (offer?.note) extras.push(el('p', 'hint', offer.note));
  if (act?.error) extras.push(el('p', 'activateerr', act.error));
  if (act?.runUrl && safeUrl(act.runUrl)) { const p = el('p', 'runlink'); p.append(link('View this run on GitHub ↗', act.runUrl)); extras.push(p); }

  const body = el('div', 'body');
  const sub = el('p', 'sub');
  sub.append(el('span', 'tag', KIND_LABEL[agent.kind] || agent.kind));
  if (agent.repo) sub.append('  in ', el('b', '', agent.repo));
  body.append(sub);

  if (agent.kind === 'local') {
    if (d.role) body.append(el('p', 'role', d.role));
    const grid = el('div', 'stats'); grid.append(stat(d.schedule || '—', 'schedule'));
    body.append(grid, el('p', 'note', d.note));
  } else if (d.latest) {
    const grid = el('div', 'stats');
    if (agent.kind === 'workflow') grid.append(stat(d.latest.result, 'latest run'), stat((d.latest.event || '—').replace(/_/g, ' '), 'triggered by'));
    else grid.append(stat(ago(d.latest.date, now), 'last commit'), stat(String(d.count ?? d.recent.length), 'commits · 8w'));
    body.append(grid, el('div', 'sec', agent.kind === 'workflow' ? 'Recent runs' : 'Recent commits'));
    const list = el('ul', 'runs');
    for (const it of d.recent) {
      const li = el('li'), line = el('span', 'm'), u = safeUrl(it.url), label = it.result || it.text;
      line.append(u ? link(label, u) : label, ' ', el('span', 't', ago(it.date, now) + (it.event ? ' · ' + it.event.replace(/_/g, ' ') : '')));
      li.append(el('span', `dot ${it.result === 'failed' ? 'fail' : it.result === 'running' ? 'running' : 'ok'}`), line);
      list.append(li);
    }
    body.append(list);
  }
  root.append(top, bar, buttons, ...extras, body);
}

function stat(value, label) {
  const s = el('div', 'stat');
  s.append(el('b', '', value), el('span', '', label));
  return s;
}
