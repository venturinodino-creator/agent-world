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

Behaviour comes from real status: running agents bounce, type and throw sparks, healthy ones wander, failing ones
flash red and pace, scheduled Cowork agents sleep. Islands are packed like a honeycomb around the hub tower, and
little workers shuttle crates between the buildings and each island's headquarters all day. The last 24 hours of
commits and workflow runs replay on a four-minute loop: a speech bubble pops up over the agent involved, its robot
carries a crate to the headquarters (which lights up) and walks back, a page flies to the hub, and the activity
feed lists it.
(Browsers pause animation in background tabs; it resumes when you switch back.)

## Cowork / local agents

GitHub cannot see agents that run elsewhere, so they are listed by hand in `src/config.mjs`. They are shown
asleep and marked as not tracked live.

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
