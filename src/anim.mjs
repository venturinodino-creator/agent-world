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
const WANDER_EVERY = 16, WANDER_FOR = 5, WANDER_REACH = 14, PACE_REACH = 12;

// How an agent looks at time t (seconds): offset from its desk in world pixels, plus what it is doing.
export function pose(agent, t) {
  const phase = hash(agent.id) * 100;
  switch (agent.status) {
    case 'running':
      return { ...STILL, typing: true, frame: Math.floor(t * 6) % 2 };
    case 'asleep':
      return { ...STILL, asleep: true, frame: Math.floor(t * 0.8) % 3 };
    case 'fail': {
      const a = (t + phase) * 1.4;
      return { ...STILL, dx: Math.sin(a) * PACE_REACH, walking: true, facing: Math.cos(a) >= 0 ? 1 : -1,
        alarm: Math.floor((t + phase) * 3) % 2 === 0, frame: Math.floor(t * 6) % 2 };
    }
    default: {   // ok, idle: stand about, now and then stroll a few steps away and back
      const u = (t + phase) % WANDER_EVERY, start = WANDER_EVERY - WANDER_FOR;
      if (u < start) return { ...STILL, frame: Math.floor(t * 0.5) % 2 };
      const s = (u - start) / WANDER_FOR;
      return { ...STILL, dx: Math.sin(s * Math.PI) * WANDER_REACH, walking: true, facing: s < 0.5 ? 1 : -1, frame: Math.floor(t * 6) % 2 };
    }
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

// The little workers that shuttle between buildings and the headquarters all day: out with a crate, back
// empty, forever. `route.sp` is legs per second, `route.ph` how far through the round trip (0..2) it starts.
export function routeBot(route, t) {
  const x = (((t * route.sp + route.ph) % 2) + 2) % 2;
  return x < 1 ? { u: x, carrying: true, forward: true } : { u: 2 - x, carrying: false, forward: false };
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
