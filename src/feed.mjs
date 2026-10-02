// The live activity feed: newest event first. Text comes from outside (commit messages, workflow
// names), so it is only ever set with textContent, and links are limited to https URLs.
import { ago } from './panel.mjs';

const MAX = 14;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

export function createFeed(root) {
  const list = root.querySelector('ul'), empty = root.querySelector('.empty');
  return {
    // Shown when the world has no events at all in the last 24 hours.
    setQuiet(quiet) { empty.hidden = !quiet; },
    add(event, agentName, now = Date.now()) {
      empty.hidden = true;
      const li = el('li');
      const who = el('span', 'who', agentName), text = /^https:\/\//.test(event.url || '') ? Object.assign(el('a', '', event.detail ?? event.text), { href: event.url, target: '_blank', rel: 'noopener' }) : el('span', '', event.detail ?? event.text);
      const meta = el('span', 't', ago(event.time, now) + ' · ' + event.island);
      li.append(el('span', `dot ${event.result}`), who, text, meta);
      list.prepend(li);
      while (list.children.length > MAX) list.lastChild.remove();
    },
    clear() { list.replaceChildren(); },
  };
}
