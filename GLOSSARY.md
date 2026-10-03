# Agent World

A 3D pixel-toy world where the agents behind the owner's GitHub repos live and work. It only reads published run data and shows what each agent is doing.

## Language

**Agent**:
Anything that does work for a repo and has a building and a little character in the world: a GitHub Actions workflow, Claude, the auto-commit bot, the owner, or a Cowork task.
_Avoid_: Bot, job, thread (the side panel says "threads", but they are agents)

**Working**:
An agent that is running a task right now.
_Avoid_: Active, busy, live

**Waiting**:
An agent whose last run finished successfully and which is idle until its next scheduled run. Shown asleep.
_Avoid_: Idle, done

**Asleep**:
How the world shows every agent that is not working and not failing: slumped at its building with a big "zzz". That covers waiting agents and agents that only run on a schedule or on demand outside GitHub (a Cowork task), whose runs the world cannot see.
_Avoid_: Inactive, disabled

**Plumbing**:
A workflow that builds or checks a repo (a Pages deploy, a smoke check, CI) and does no job of its own. Listed in `skipWorkflows` in `src/config.mjs`; it gets no building and no astronaut.
_Avoid_: Agent

**Failing**:
An agent whose last run failed.
_Avoid_: Broken, errored

**Activate**:
To get an agent that is not working to start a run now. For a GitHub workflow it starts the run; for an agent outside GitHub it only points the owner to where they can start it.
_Avoid_: Wake, trigger, run now (the button's wording differs, the concept is Activate)

**Admin**:
The owner while signed in. Only the Admin sees Activate buttons.
_Avoid_: User, viewer (a viewer is anyone who is not the Admin)
