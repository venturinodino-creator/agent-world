// Animation that is a pure function of the agent and the clock: the same agent at the same time always
// has the same pose, so the world looks the same on every machine and can be tested without a browser.
export const DAY = 864e5;

// A number in [0, 1) that is stable for a given id, so agents get different rhythms.
export function hash(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

const STILL = { dx: 0, dy: 0, typing: false, asleep: false, alarm: false, walking: false, facing: 1, frame: 0 };

// How an agent looks at time t (seconds): offset from its desk in world pixels, plus what it is doing.
export function pose(agent, t) {
  const phase = hash(agent.id) * 100;
  switch (agent.status) {
    case 'running':
      return { ...STILL, typing: true, frame: Math.floor(t * 6) % 2 };
    case 'fail':   // not working, so asleep like the rest, with its alarm flashing
      return { ...STILL, asleep: true, alarm: Math.floor((t + phase) * 3) % 2 === 0, frame: Math.floor(t * 0.8) % 3 };
    default:   // asleep, ok, idle: only two states, working or asleep, so anything that is not working is asleep at its desk
      return { ...STILL, asleep: true, frame: Math.floor(t * 0.8) % 3 };
  }
}

// An errand is what an agent's robot does when something happens to that agent: it walks to the island's
// headquarters carrying a crate, drops it off, and walks back with empty hands. u runs 0 (at its building) to
// 1 (at the headquarters). Returns null before it starts and after it ends. Times are in seconds.
export const ERRAND_SECONDS = 3.6;
export function errand(elapsed) {
  if (elapsed < 0 || elapsed > ERRAND_SECONDS) return null;
  const k = elapsed / ERRAND_SECONDS;
  if (k < 0.4) return { u: k / 0.4, carrying: true, depositing: false };
  if (k < 0.6) return { u: 1, carrying: false, depositing: true };
  return { u: 1 - (k - 0.6) / 0.4, carrying: false, depositing: false };
}

// What a working agent's astronaut does all the time it is running: picks something up at its building, carries it to the
// base in the middle of the hexagon, drops it off and walks back for the next one. `dist` is how far the walk is; u runs
// 0 (at the building) to 1 (at the base). The walk takes longer the further away the base is, within limits.
const PICK = 1.2, DEPOSIT = 0.8, WALK_SPEED = 4.5;
export const workLeg = dist => Math.min(4, Math.max(1.2, dist / WALK_SPEED));
export const workPeriod = dist => PICK + 2 * workLeg(dist) + DEPOSIT;
export function workCycle(t, dist) {
  const leg = workLeg(dist), period = workPeriod(dist), e = ((t % period) + period) % period;
  if (e < PICK) return { u: 0, picking: true, carrying: e > PICK * 0.65, depositing: false };
  const w = e - PICK;
  if (w < leg) return { u: w / leg, picking: false, carrying: true, depositing: false };
  if (w < leg + DEPOSIT) return { u: 1, picking: false, carrying: false, depositing: true };
  return { u: 1 - (w - leg - DEPOSIT) / leg, picking: false, carrying: false, depositing: false };
}

// The replay sweeps the last 24 hours of real time in loopMs of wall time, then starts again.
export function replayClock(elapsedMs, now, loopMs) {
  return now - DAY + ((elapsedMs % loopMs) / loopMs) * DAY;
}

// Events the replay clock has passed since the last frame, in order. A step backwards (the loop wrapping) fires nothing.
export function due(events, fromMs, toMs) {
  if (toMs <= fromMs) return [];
  return events.filter(e => { const t = Date.parse(e.time); return t > fromMs && t <= toMs; });
}
