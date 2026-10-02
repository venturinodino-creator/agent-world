## Agent skills

### Issue tracker

Issues, specs and tickets live in this repo's GitHub Issues (`venturinodino-creator/agent-world`), via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root, created lazily. See `docs/agents/domain.md`.

## Project

A pixel-art world where the agents behind my GitHub repos live and work. Plain HTML, CSS and ES modules, no build step, hosted on GitHub Pages. It only reads the public `data.json` published by the `agent-hq` dashboard (read-only, never changes agent-hq). Logic that can be tested without a browser lives in `.mjs` files under `src/` with tests in `tests/` (`node --test`).
