// Loads the public data.json that the agent-hq dashboard publishes. Read-only: nothing here ever writes
// to agent-hq. Both copies are read and the newer one wins, because the raw GitHub copy updates
// a minute or two before the Pages copy.
export const SOURCES = [
  'https://venturinodino-creator.github.io/agent-hq/data.json',
  'https://raw.githubusercontent.com/venturinodino-creator/agent-hq/main/data.json',
];

const usable = d => d && Array.isArray(d.repos) && d.generatedAt && !Number.isNaN(Date.parse(d.generatedAt));

export async function loadData(sources = SOURCES, fetchFn = fetch) {
  const got = await Promise.all(sources.map(async url => {
    try {
      const r = await fetchFn(`${url}?t=${Math.floor(Date.now() / 6e4)}`, { cache: 'no-store' });
      if (!r.ok) return null;
      const d = await r.json();
      return usable(d) ? d : null;
    } catch { return null; }
  }));
  return got.filter(Boolean).sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt))[0] || null;
}
