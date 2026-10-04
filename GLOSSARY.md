# Agent World

A 3D pixel-toy world where the agents behind the owner's GitHub repos live and work. It only reads published run data and shows what each agent is doing.

## Language

**Agent**:
Anything that does work for a repo and has a building and a little character in the world: a GitHub Actions workflow, Claude, the auto-commit bot, the owner, or a Cowork task.
_Avoid_: Bot, job, thread (the side panel says "threads", but they are agents)

**Working**:
An agent that is running a task right now. Its astronaut is seen at work: picking something up at its building, carrying it to the base in the middle of its hexagon, dropping it off and walking back, over and over.
_Avoid_: Active, busy, live

**Asleep**:
How the world shows every agent that is not working, whatever it is waiting for (its next scheduled run, a request, nothing at all), and also one whose last run failed, which keeps a flashing "!" as well. Lying down at its building with a big "zzz" above its head. There is nothing in between: an astronaut is either at work or asleep, and never wanders about.
_Avoid_: Inactive, disabled, idle, waiting

**Plumbing**:
A workflow that builds or checks a repo (a Pages deploy, a smoke check, CI) and does no job of its own. Listed in `skipWorkflows` in `src/config.mjs`; it gets no building and no astronaut.
_Avoid_: Agent

**Failing**:
An agent whose last run failed. Shown like an asleep one, with a flashing red "!" over it.
_Avoid_: Broken, errored

**Overview**:
The panel on the right for someone who wants the picture at a glance: the totals (working, asleep, failing), a one-line verdict, the failing agents, and every repo with a bar of its mix, the ones to look at first on top.
_Avoid_: Dashboard, thread list

**Design**:
Which of the seven looks an island has (its base and its floor pattern). Each island takes the next one, so neighbouring islands never match.
_Avoid_: Theme, skin

**Activate**:
To get an agent that is not working to start a run now, with the **Work** button on its card. For a GitHub workflow it starts the run; for an agent outside GitHub it only points the owner to where they can start it. Everyone sees the button; for a viewer who is not signed in it asks them to sign in, and for Claude, the bot and the owner it is disabled with a note, because they cannot be started from here.
_Avoid_: Wake, trigger, run now (the button says Work, the concept is Activate)

**Admin**:
The owner while signed in. Only the Admin can use the Work button for real; everyone else is asked to sign in.
_Avoid_: User, viewer (a viewer is anyone who is not the Admin)
