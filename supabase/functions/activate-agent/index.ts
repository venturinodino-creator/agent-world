// Starts a GitHub workflow for the Agent World admin, and reports on the run afterwards. See docs/adr/0001.
// Deployed to the Energy Lead Dashboard Supabase project. Needs the secret GITHUB_DISPATCH_TOKEN (a fine-grained
// token with only "Actions: read and write" on the four CRM repos). The token never leaves this function.
//
// POST { action: 'start', repo, workflow }          -> { ok: true, workflowId, startedAt }
// POST { action: 'status', repo, workflowId }       -> { ok: true, run: { status, conclusion, createdAt, url } | null }
// Every refusal is { ok: false, code, retryAfter? } with a matching HTTP status.
import { createClient } from 'npm:@supabase/supabase-js@2';

const OWNER = 'venturinodino-creator';
const OWNER_UID = '5e6044c3-18e8-4875-ac16-0841cf51ecab';   // same user the repo-visibility policy is pinned to
const REPOS = ['african-earth-energy-crm', 'belgium-crm', 'denmark-crm', 'netherlands-crm'];
const ORIGINS = ['https://venturinodino-creator.github.io', 'http://127.0.0.1:4180'];   // the site, and the local preview
const COOLDOWN_MS = 120_000;
const GH = 'https://api.github.com';

const corsFor = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && ORIGINS.includes(origin) ? origin : ORIGINS[0],
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
});
const reply = (origin: string | null, status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsFor(origin), 'Content-Type': 'application/json' } });
const refuse = (origin: string | null, status: number, code: string, extra: Record<string, unknown> = {}) => reply(origin, status, { ok: false, code, ...extra });

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsFor(origin) });
  if (req.method !== 'POST') return refuse(origin, 405, 'unknown');

  // 1. who is calling: must be the signed-in owner
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return refuse(origin, 401, 'not_signed_in');
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: who, error: authError } = await db.auth.getUser(jwt);
  if (authError || !who?.user) return refuse(origin, 401, 'not_signed_in');
  if (who.user.id !== OWNER_UID) return refuse(origin, 403, 'not_owner');

  // 2. what they ask for: one of the four repos, and one that is switched ON in the admin list
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return refuse(origin, 400, 'unknown'); }
  const repo = String(body.repo ?? ''), action = body.action === 'status' ? 'status' : 'start';
  if (!REPOS.includes(repo)) return refuse(origin, 403, 'repo_not_allowed');
  const { data: row } = await db.from('agent_hq_repo_visibility').select('visible').eq('name', repo).maybeSingle();
  if (row?.visible !== true) return refuse(origin, 403, 'repo_hidden');

  // 3. the GitHub token, held only here
  const token = Deno.env.get('GITHUB_DISPATCH_TOKEN');
  if (!token) return refuse(origin, 503, 'not_configured');
  const gh = (path: string, init: RequestInit = {}, accept = 'application/vnd.github+json') =>
    fetch(GH + path, { ...init, headers: { Authorization: `Bearer ${token}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'agent-world-activate', ...(init.headers || {}) } });
  const rejected = (r: Response) => r.status === 401 || r.status === 403;

  try {
    if (action === 'status') {
      const id = Number(body.workflowId);
      if (!Number.isInteger(id) || id <= 0) return refuse(origin, 400, 'unknown');
      const r = await gh(`/repos/${OWNER}/${repo}/actions/workflows/${id}/runs?per_page=1`);
      if (rejected(r)) return refuse(origin, 502, 'token_rejected');
      if (!r.ok) return refuse(origin, 502, 'unknown');
      const run = (await r.json()).workflow_runs?.[0];
      return reply(origin, 200, { ok: true, run: run ? { status: run.status, conclusion: run.conclusion, createdAt: run.created_at, url: run.html_url } : null });
    }

    // start: find the workflow by its exact name
    const name = String(body.workflow ?? '');
    if (!name || name.length > 200) return refuse(origin, 400, 'unknown');
    const list = await gh(`/repos/${OWNER}/${repo}/actions/workflows?per_page=100`);
    if (rejected(list)) return refuse(origin, 502, 'token_rejected');
    if (!list.ok) return refuse(origin, 502, 'unknown');
    const matches = ((await list.json()).workflows || []).filter((w: { name: string; path: string }) => w.name === name && w.path.startsWith('.github/workflows/'));
    if (!matches.length) return refuse(origin, 404, 'workflow_not_found');
    if (matches.length > 1) return refuse(origin, 409, 'workflow_ambiguous');
    const wf = matches[0];

    // it must declare a manual start
    const file = await gh(`/repos/${OWNER}/${repo}/contents/${wf.path}`, {}, 'application/vnd.github.raw');
    if (rejected(file)) return refuse(origin, 502, 'token_rejected');
    if (!file.ok || !(await file.text()).includes('workflow_dispatch')) return refuse(origin, 422, 'not_startable');

    // cooldown per workflow: reserve the slot before starting, so two quick requests cannot both go through
    const { data: last } = await db.from('agent_world_activations').select('started_at').eq('repo', repo).eq('workflow', name).maybeSingle();
    const waited = last ? Date.now() - Date.parse(last.started_at) : Infinity;
    if (waited < COOLDOWN_MS) return refuse(origin, 429, 'cooldown', { retryAfter: Math.ceil((COOLDOWN_MS - waited) / 1000) });
    const startedAt = new Date().toISOString();
    await db.from('agent_world_activations').upsert({ repo, workflow: name, started_at: startedAt });

    const info = await gh(`/repos/${OWNER}/${repo}`);
    const ref = info.ok ? (await info.json()).default_branch || 'main' : 'main';
    const go = await gh(`/repos/${OWNER}/${repo}/actions/workflows/${wf.id}/dispatches`, { method: 'POST', body: JSON.stringify({ ref }) });
    if (go.status !== 204) {
      await db.from('agent_world_activations').delete().eq('repo', repo).eq('workflow', name);   // it did not start, so do not make them wait
      if (rejected(go)) return refuse(origin, 502, 'token_rejected');
      return go.status === 404 ? refuse(origin, 404, 'workflow_not_found') : go.status === 422 ? refuse(origin, 422, 'not_startable') : refuse(origin, 502, 'unknown');
    }
    return reply(origin, 200, { ok: true, workflowId: wf.id, startedAt });
  } catch {
    return refuse(origin, 502, 'unknown');
  }
});
