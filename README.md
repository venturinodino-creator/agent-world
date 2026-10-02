# Agent World

A pixel-art world where the agents behind my GitHub repos live and work. Each active repo is a room; every
GitHub Actions workflow, Claude as builder, me, and each Cowork/local agent is a little character at a desk.
Click a character to see what it last did.

What you see comes from real data: running agents type, healthy ones idle and wander, failing ones pace under
a flashing alarm, scheduled Cowork agents sleep. The last 24 hours of commits and workflow runs replay on a
four-minute loop: a speech bubble pops up over the agent involved, a page flies to the hub, and the activity
feed lists it.

It is an experiment. It only reads the public `data.json` that the `agent-hq` dashboard publishes (read-only),
so it shows exactly the repos that dashboard shows and never changes it.

- Live: https://venturinodino-creator.github.io/agent-world/
- Data: https://venturinodino-creator.github.io/agent-hq/data.json (refreshed every few minutes while the page is open)
- Plain HTML, CSS and ES modules, no build step. Drag to pan, wheel to zoom, **fit** to reset the view.

## Cowork / local agents

GitHub cannot see agents that run elsewhere, so they are listed by hand in `src/config.mjs`. They are shown
asleep and marked as not tracked live.

## Develop

```bash
node --test            # tests for the world model and the data loader
python -m http.server  # then open http://localhost:8000
```
