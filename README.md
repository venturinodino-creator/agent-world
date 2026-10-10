# Agent World

A 3D world where the agents behind my GitHub repos live and work, inspired by a video of a glossy, cartoon "world of
agents". Each active repo is a hexagon island with its own base in the middle and a floor pattern of its own. Every
agent (a GitHub Actions workflow, Claude, the auto-commit bot, me, a Cowork task) has a building and one astronaut. A
tall rocket stands on the hub in the middle.

It is an experiment. It only reads the public `data.json` that the `agent-hq` dashboard publishes (read-only), so it
shows exactly the repos that dashboard shows and never changes it.

- Live: https://venturinodino-creator.github.io/agent-world/
- Data: https://venturinodino-creator.github.io/agent-hq/data.json (reloaded while the page is open)

## Using it

- **Overview panel** (right, wide windows): the totals (working, asleep, failing), a one-line verdict, the agents that need
  attention and every repo with a small bar of its mix, the ones to look at first on top. Click a repo or an agent to fly there.
- **Drag** to orbit, **right-drag** to pan, **wheel** to zoom, **fit** to frame the whole world again.
- **Click** a building or astronaut: the camera glides to it and a card shows what it is, its latest result, recent runs
  and an **Open** button to GitHub.
- **fx** switches the render effects (ambient occlusion, bloom, depth blur). They start on and turn themselves off if the
  machine cannot keep up; the button remembers your choice. `?fx=1` or `?fx=0` forces them for one visit.
- **dormant** shows quiet repos (30+ days) as small, dark, closed islands.

## What it shows

There are two states, and nothing in between. A **working** agent (a run is going on right now) keeps picking something
up at its building, carrying it to the base in the middle of its island and walking back, with sparks and a working
bubble over it. Every other agent, whatever it is waiting for, lies asleep with a big zzz; one whose last run failed also
keeps a flashing red "!". The astronaut's suit shows the kind of agent: orange for workflows, pink for Claude, red for
the bot, violet for Cowork, blue for me.

The last 24 hours of commits and workflow runs replay on a four-minute loop: a speech bubble pops up over the agent
involved, its astronaut wakes, carries a crate to the base (which lights up) and lies back down, a page flies to the
hub, and the activity feed lists it. Browsers pause animation in background tabs; it resumes when you switch back.

Plumbing workflows (Pages deploys, smoke checks, CI) are not agents and are left out: see `skipWorkflows` in
`src/config.mjs`. A crowded island is drawn with smaller, flatter, low-profile buildings (down to half size), keeps its free tiles bare, and its astronauts stand right in front of their building, so the agents stay in view.

## Websites

Live websites are watched too, one island each, listed under `sites` in `src/config.mjs` (today the four Research CRM
addresses on `els-crm.dinov.workers.dev`: NL at `/`, DK at `/dk/`, BE at `/be/` and the landing page). Every refresh the page
asks each site for a page. A site that answers is **working** (a teal astronaut carries items to the island's base, the card
says Live and shows the answer time); one that does not answer within eight seconds is **failing** (it sleeps with a red "!"
and appears in the overview's attention list). The page can only see whether a site answers, never what it says: the sites send
no cross-origin headers, so an error page counts as an answer. These islands need no GitHub data, so they stay even when the
repos behind them are private.

## Cowork / local agents

GitHub cannot see agents that run elsewhere, so they are listed by hand in `src/config.mjs`. They are shown asleep and
marked as not tracked live. Give an agent a `startUrl` there to point its **Open in Cowork** button (Admin only) at the
right place.

## Activate (Admin only)

Sign in once at `/agent-world/#admin` (the same login as the agent-hq admin page; the Work button on a card opens it for you).
Every card of an agent that is not working has a **Work** button. Without signing in it asks you to sign in; Claude, the bot
and the owner cannot be started from here, so theirs is disabled with a note. While signed in, the button of a workflow
replaces the GitHub link, reads **Work** (or **Work again** after a failure), asks to confirm, then starts the real GitHub workflow, shows the agent as working ("Run requested"), and follows the
run until GitHub says it finished. Nobody else sees any of this.

It works through a Supabase Edge Function (`supabase/functions/activate-agent`, see `docs/adr/0001`) that holds a
fine-grained GitHub token as the secret `GITHUB_DISPATCH_TOKEN`. Create one with **Actions: read and write** on
african-earth-energy-crm, belgium-crm, denmark-crm and netherlands-crm only, and add it under Edge Functions, Secrets in
the Energy Lead Dashboard Supabase project. Until it exists, Activate answers "the GitHub token is missing". The server
also enforces a two-minute cooldown per workflow and only starts workflows that declare a manual start, in repos that
are switched ON in the admin list.

## How it is built

Plain HTML, CSS and ES modules, no build step, hosted on GitHub Pages (a push to `main` deploys). 3D uses
[three.js](https://threejs.org) loaded from a pinned version on the jsDelivr CDN, so the page needs an internet
connection and a browser with WebGL. Every model and texture is drawn in code; there are no image or model files.

| Area | Files |
| --- | --- |
| Pure logic, tested without a browser | `world.mjs` (islands, agents, events, designs), `sites.mjs` (website checks), `anim.mjs` (poses, the work cycle, the replay clock), `overview.mjs` (manager totals), `activation.mjs`, `data.mjs`, `feed.mjs` |
| Page | `main.mjs` (wires everything), `list.mjs` (overview panel), `panel.mjs` (agent card), `admin.mjs`, `requests.mjs`, `config.mjs`, `index.html`, `style.css` |
| 3D | `scene.mjs`, `post.mjs` (effects), `space.mjs` (sky, planet, ground), `kit.mjs` (materials and merging), `buildings.mjs`, `bases.mjs`, `decor.mjs`, `models.mjs` (astronauts, symbols), `textures.mjs`, `grounding.mjs` |

## Develop

```bash
node --test            # the pure logic: world model, animation, overview, activation, data loader
python -m http.server  # then open http://localhost:8000
```

Add `?debug` to the page address to get `window.__stats()` (draw calls and triangles), `window.__root()` and
`window.__edges()` (where the island edges land on screen) in the browser console. The terms used here are defined in
`GLOSSARY.md`.
