// Live websites the world watches, one island each. The page can only see whether a site answers: the sites do not send
// the headers that would let another page read their content or their status code, so an error page counts as an answer.
// Pure apart from the injected fetch and clock, so all of it is tested without a browser.
export const siteStatus = probe => (!probe ? 'idle' : probe.ok ? 'running' : 'fail');   // working while it answers, failing when it does not, asleep until checked

// Asks for the page without reading it and times the answer. Never throws: no answer inside `timeoutMs` is "down".
export async function probeSite(url, { fetchFn = fetch, timeoutMs = 8000, now = Date.now } = {}) {
  const t0 = now(), ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeoutMs);
  const result = ok => ({ ok, ms: Math.round(now() - t0), at: new Date(t0).toISOString() });
  try { await fetchFn(url, { mode: 'no-cors', cache: 'no-store', redirect: 'follow', signal: ctl.signal }); return result(true); }
  catch { return result(false); }
  finally { clearTimeout(timer); }
}

// Every site at once; the answers are keyed by address.
export async function probeAll(sites, opts) {
  return Object.fromEntries(await Promise.all(sites.map(async s => [s.url, await probeSite(s.url, opts)])));
}

// What an agent's card shows of a check (null before the first one).
export const siteLatest = probe => (probe ? { date: probe.at, ms: probe.ms, result: probe.ok ? 'answers' : 'no answer' } : null);

// Up or down for every site, as one string: the world is only rebuilt when this changes (the answer time moves every check).
export const siteSignature = probes => Object.entries(probes || {}).map(([url, p]) => url + (p?.ok ? '=up' : '=down')).sort().join(' ');
