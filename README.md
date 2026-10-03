# Agent World

A 3D world where the agents behind my GitHub repos live and work, inspired by a video of a glossy,
cartoon "world of agents". Each active repo is a hexagon island whose outline shows its health. Every GitHub
Actions workflow is a glossy tower with a little robot beside it; Claude, the auto-commit bot, me and each
Cowork/local agent have their own building and character. A tall hub tower sits in the middle.

It is an experiment. It only reads the public `data.json` that the `agent-hq` dashboard publishes (read-only),
so it shows exactly the repos that dashboard shows and never changes it.

- Live: https://venturinodino-creator.github.io/agent-world/
- Data: https://venturinodino-creator.github.io/agent-hq/data.json (refreshed every few minutes while the page is open)

## Using it

- **Drag** to orbit, **right-drag** to pan, **wheel** to zoom, **fit** to frame the whole world again.
- **fx** switches the render effects (ambient occlusion, bloom, depth blur) on or off. They start on and turn themselves
  off if the machine cannot keep up; the button remembers your choice. `?fx=1` or `?fx=0` forces them for one visit.
- **Click** a tower or robot (or an entry in the list on the right): the camera glides to it and a card shows
  what it is, its latest result, recent runs and an **Open** button to GitHub.
- **dormant** shows quiet repos (30+ days) as small, dark, closed islands.

## What moves

Behaviour comes from real status: running agents bounce, hammer away and throw sparks under a big working bubble, failing ones
flash red and pace, and every agent that is not working sleeps, slumped with a big zzz. Plumbing workflows (Pages deploys, smoke
checks, CI) are left out, see `skipWorkflows` in `src/config.mjs`. A crowded island keeps only low things on its free tiles. Islands are packed like a honeycomb around the hub rocket. Every
agent is one astronaut at its own building, and nobody else walks around. The last 24 hours of commits and workflow
runs replay on a four-minute loop: a speech bubble pops up over the agent involved, its astronaut carries a crate to
the headquarters (which lights up) and walks back, a page flies to the hub, and the activity feed lists it.
(Browsers pause animation in background tabs; it resumes when you switch back.)

## Cowork / local agents

GitHub cannot see agents that run elsewhere, so they are listed by hand in `src/config.mjs`. They are shown
asleep and marked as not tracked live. Give an agent a `startUrl` there to point its **Open in Cowork** button
(Admin only) at the right place.

## Activate (Admin only)

Sign in once at `/agent-world/#admin` (the same login as the agent-hq admin page; nothing on the page links to it).
While signed in, the card of any agent that is not working replaces the GitHub link with **Run now** or **Run again**.
It asks to confirm, then starts the real GitHub workflow, shows the agent as working ("Run requested"), and follows the
run until GitHub says it finished. Nobody else sees any of this.

It works through a Supabase Edge Function (`supabase/functions/activate-agent`, see `docs/adr/0001`) that holds a
fine-grained GitHub token as the secret `GITHUB_DISPATCH_TOKEN`. Create one with **Actions: read and write** on
african-earth-energy-crm, belgium-crm, denmark-crm and netherlands-crm only, and add it under Edge Functions, Secrets in
the Energy Lead Dashboard Supabase project. Until it exists, Activate answers "the GitHub token is missing". The server
also enforces a two-minute cooldown per workflow and only starts workflows that declare a manual start, in repos that
are switched ON in the admin list.

## How it is built

Plain HTML, CSS and ES modules, no build step. 3D uses [three.js](https://threejs.org) loaded from a pinned
version on the jsDelivr CDN, so the page needs an internet connection and a browser with WebGL. All models are
built from simple shapes in code; there are no image or model files.

`src/world.mjs` (islands, agents and events) and `src/anim.mjs` (poses and the replay clock) are pure and tested.
`src/models.mjs` and `src/scene.mjs` are the 3D look; `src/main.mjs` wires the page together.

## Develop

```bash
node --test            # tests for the world model, animation clock and data loader
python -m http.server  # then open http://localhost:8000
```
