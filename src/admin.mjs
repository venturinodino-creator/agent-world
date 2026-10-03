// The browser side of Activate: the Admin's sign-in, and the two calls to the server (start a run, ask how it is
// going). It talks to Supabase with plain fetch and no libraries, so no third-party script runs on a page that
// handles a password. The session sits in sessionStorage under the same key as the agent-hq admin page, so signing in
// on either page signs you in on both (in the same tab), and closing the tab signs you out.
// Nothing here shows unless the Admin is signed in; the sign-in form only appears at the address ending #admin.
const KEY = 'hq.admin.session';
let cfg = null, session = null;
const listeners = new Set();

const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY)); } catch { return null; } };
const write = s => { try { s ? sessionStorage.setItem(KEY, JSON.stringify(s)) : sessionStorage.removeItem(KEY); } catch { /* storage blocked: the session just will not survive a reload */ } };
const changed = () => listeners.forEach(f => f(isAdmin()));

// The same shape the agent-hq admin page stores, built from a Supabase sign-in or refresh answer.
function sessionFrom(res, now = Date.now()) {
  if (!res || typeof res.access_token !== 'string' || typeof res.refresh_token !== 'string') return null;
  return { accessToken: res.access_token, refreshToken: res.refresh_token, expiresAt: now + (res.expires_in || 3600) * 1000, email: res.user?.email || '' };
}

export const isAdmin = () => !!session;
export const onAdminChange = f => listeners.add(f);

export async function initAdmin() {
  try { cfg = await (await fetch('supabase.json')).json(); } catch { cfg = null; }
  session = cfg ? read() : null;   // without the settings file there is simply no admin
  changed();
  return isAdmin();
}

const authCall = async (path, body) => {
  const r = await fetch(`${cfg.url}/auth/v1/${path}`, { method: 'POST', body: JSON.stringify(body), headers: { apikey: cfg.publishableKey, 'Content-Type': 'application/json' } });
  return r.json().catch(() => null);
};

async function freshToken() {
  if (session.expiresAt - Date.now() > 60e3) return session.accessToken;
  const s = sessionFrom(await authCall('token?grant_type=refresh_token', { refresh_token: session.refreshToken }));
  if (!s) { signOut(); return null; }
  session = { ...s, email: s.email || session.email }; write(session);
  return session.accessToken;
}

export async function signIn(email, password) {
  if (!cfg) return 'The settings file could not be loaded.';
  const res = await authCall('token?grant_type=password', { email, password });
  const s = sessionFrom(res);
  if (!s) return res?.error_description || res?.msg || 'Sign-in failed.';
  session = s; write(s); changed();
  return null;
}

export function signOut() { session = null; write(null); changed(); }

// One call to the server. Returns { ok: true, ... } or { ok: false, code, retryAfter } and never throws.
async function server(payload) {
  if (!session) return { ok: false, code: 'not_signed_in' };
  try {
    const token = await freshToken();
    if (!token) return { ok: false, code: 'not_signed_in' };
    const r = await fetch(`${cfg.url}/functions/v1/activate-agent`, { method: 'POST', body: JSON.stringify(payload),
      headers: { apikey: cfg.publishableKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    const body = await r.json().catch(() => null);
    if (body && typeof body.ok === 'boolean') return body;
    return { ok: false, code: r.status === 401 ? 'not_signed_in' : 'unknown' };
  } catch { return { ok: false, code: 'network' }; }
}

export const startRun = (repo, workflow) => server({ action: 'start', repo, workflow });

// GitHub's latest run of a workflow: { status, conclusion, createdAt, url }, null if it has none, undefined if unknown.
export async function latestRun(repo, workflowId) {
  const r = await server({ action: 'status', repo, workflowId });
  return r.ok ? r.run : undefined;
}

// ----- the hidden sign-in form, shown only at the address ending #admin
export function mountSignIn(container) {
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const form = el('form', 'adminform'), title = el('h2', '', 'Admin sign-in');
  const email = el('input'), pass = el('input'), err = el('p', 'err'), go = el('button', 'btn', 'Sign in'), close = el('button', 'btn', 'Cancel');
  email.type = 'email'; email.placeholder = 'Email'; email.autocomplete = 'username'; email.required = true;
  pass.type = 'password'; pass.placeholder = 'Password'; pass.autocomplete = 'current-password'; pass.required = true;
  go.type = 'submit'; close.type = 'button';
  const row = el('div', 'row'); row.append(go, close);
  form.append(title, email, pass, err, row); form.hidden = true; container.append(form);
  const hide = () => { form.hidden = true; pass.value = ''; if (location.hash === '#admin') history.replaceState(null, '', location.pathname + location.search); };
  const sync = () => { if (location.hash === '#admin' && !isAdmin()) { form.hidden = false; email.focus(); } else if (isAdmin()) hide(); };
  form.addEventListener('submit', async e => {
    e.preventDefault(); err.textContent = ''; go.disabled = true;
    const problem = await signIn(email.value.trim(), pass.value);
    go.disabled = false; pass.value = '';
    if (problem) err.textContent = problem; else hide();
  });
  close.addEventListener('click', hide);
  addEventListener('hashchange', sync); onAdminChange(sync); sync();
}
