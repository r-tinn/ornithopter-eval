// SI units. Source 02: the rounded Say column and the ORIGINAL area paragraph.
const AR = 7.4 * 7.4 / 6.61;
const TAU = 2 * Math.PI;
const G = 9.80665;
export const parameters = {
  aspect_ratio: AR,
  wrist_span_fraction: 3.7 / 7.4,
  wing_area_m2: 9 / AR,
  span_m: 3,
  body_length_m: 2,
  mass_kg: 6,
  wheel_radius_m: 0.16,
  gear_centres: [[0.6, -0.66, 0], [-0.45, -0.66, -0.32], [-0.45, -0.66, 0.32]],
  maximum_mechanical_power_w: 400,
  propulsive_efficiency: 0.65,
  powered_wingbeat_hz: 2,
  gravity_m_s2: G
};

const finite = (x, fallback = 0) => Number.isFinite(x) ? x : fallback;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
function input(c = {}) {
  return {
    throttle: clamp(finite(c.throttle), 0, 1),
    pitch: clamp(finite(c.pitch), -1, 1),
    bank: clamp(finite(c.bank), -1, 1),
    rudder: clamp(finite(c.rudder), -1, 1),
    brake: clamp(finite(c.brake), 0, 1)
  };
}

export function forces(state, controls = {}, environment = {}) {
  const c = input(controls);
  const velocity = state.velocity || [0, 0, 0];
  const wind = environment.wind || [0, 0, 0];
  const vx = finite(velocity[0]) - finite(wind[0]);
  const vy = finite(velocity[1]) - finite(wind[1]);
  const vz = finite(velocity[2]) - finite(wind[2]);
  const horizontal = Math.hypot(vx, vz);
  const V = Math.hypot(vx, vy, vz);
  const heading = finite(state.heading);
  const pitch = finite(state.pitch);
  const roll = finite(state.roll);
  const alpha = pitch - Math.atan2(vy, horizontal);
  const cl = clamp(0.6 + 3 * alpha, -0.2, 1.4);
  const cd = 0.035 + cl * cl / (Math.PI * 0.8 * AR);
  const rho = Math.max(0, finite(environment.rho, 1.225));
  const qS = 0.5 * rho * V * V * parameters.wing_area_m2;
  const lift = qS * cl;
  const drag = qS * cd;
  const power = 400 * c.throttle;
  const thrust = 0.65 * power / Math.max(V, 5);

  // Flow direction, with a heading-aligned launch direction at zero airspeed.
  let ux = Math.cos(heading), uy = 0, uz = Math.sin(heading);
  if (V > 1e-10) { ux = vx / V; uy = vy / V; uz = vz / V; }
  const h = Math.hypot(ux, uz);
  let lx, ly, lz;
  if (h > 1e-10) {
    // Normalized projection of world up onto the plane normal to flow.
    lx = -uy * ux / h; ly = h; lz = -uy * uz / h;
  } else {
    // At exactly vertical flow the up projection is indeterminate.
    lx = Math.cos(heading); ly = 0; lz = Math.sin(heading);
  }
  const cr = Math.cos(roll), sr = Math.sin(roll);
  // Rodrigues rotation about airflow; positive bank produces a rightward lift.
  const bx = lx * cr + (uy * lz - uz * ly) * sr;
  const by = ly * cr + (uz * lx - ux * lz) * sr;
  const bz = lz * cr + (ux * ly - uy * lx) * sr;
  const hx = horizontal > 1e-10 ? vx / horizontal : Math.cos(heading);
  const hz = horizontal > 1e-10 ? vz / horizontal : Math.sin(heading);
  const side = qS * 0.15 * c.rudder;
  return {
    lift, drag, thrust, power, airspeed: V, cl,
    force: [
      (thrust - drag) * ux + lift * bx - side * hz,
      (thrust - drag) * uy + lift * by - parameters.mass_kg * G,
      (thrust - drag) * uz + lift * bz + side * hx
    ]
  };
}

// Same YZX transform as the host's Euler(roll,-heading,pitch,'YZX').
// The highest of the three required vertical corrections enforces all contacts.
function groundCorrection(s, env) {
  const ca = Math.cos(s.roll), sa = Math.sin(s.roll);
  const cp = Math.cos(s.pitch), sp = Math.sin(s.pitch);
  const ch = Math.cos(s.heading), sh = Math.sin(s.heading);
  let correction = -Infinity;
  for (const w of parameters.gear_centres) {
    const y1 = ca * w[1] - sa * w[2];
    const z1 = sa * w[1] + ca * w[2];
    const x2 = cp * w[0] - sp * y1;
    const y2 = sp * w[0] + cp * y1;
    const x = s.position[0] + ch * x2 - sh * z1;
    const z = s.position[2] + sh * x2 + ch * z1;
    const surface = typeof env.surfaceHeight === 'function'
      ? finite(env.surfaceHeight(x, z)) : 0;
    correction = Math.max(correction,
      surface + parameters.wheel_radius_m - (s.position[1] + y2));
  }
  return correction;
}

function substep(s, c, env, dt) {
  if (s.status === 'crashed') {
    s.time += dt;
    s.velocity = [0, 0, 0];
    const correction = groundCorrection(s, env);
    if (correction > 0) s.position[1] += correction;
    return;
  }
  // Evaluate before any commanded attitude changes.
  const f = forces(s, c, env).force;
  const contactBefore = groundCorrection(s, env) >= -1e-6;
  const supported = contactBefore && s.velocity[1] <= 0 && f[1] <= 0;
  if (supported) {
    f[1] = 0; // Reaction is only compressive; positive net lift remains untouched.
    s.velocity[1] = 0;
  }
  const oldStatus = s.status;
  for (let i = 0; i < 3; i++) s.velocity[i] += f[i] / parameters.mass_kg * dt;
  if (contactBefore && c.brake > 0) {
    const speed = Math.hypot(s.velocity[0], s.velocity[2]);
    if (speed > 0) {
      const scale = Math.max(0, 1 - 18 * c.brake * dt / (parameters.mass_kg * speed));
      s.velocity[0] *= scale;
      s.velocity[2] *= scale;
    }
  }
  s.pitch = clamp(s.pitch + 0.5 * c.pitch * dt, -0.35, 0.45);
  s.roll += clamp(0.6 * c.bank - s.roll, -2 * dt, 2 * dt);
  if (Math.hypot(s.velocity[0], s.velocity[2]) > 0.1)
    s.heading = Math.atan2(s.velocity[2], s.velocity[0]);
  if (c.throttle > 0) s.phase = (s.phase + TAU * 2 * dt) % TAU;
  for (let i = 0; i < 3; i++) s.position[i] += s.velocity[i] * dt;

  const correction = groundCorrection(s, env);
  if (correction >= -1e-7) {
    if (correction > 0) s.position[1] += correction;
    if (oldStatus === 'flying') {
      const sink = Math.max(0, -s.velocity[1]);
      const horizontal = Math.hypot(s.velocity[0], s.velocity[2]);
      s.status = sink <= 3 && horizontal <= 14 && Math.abs(s.roll) <= 0.35
        ? 'landed' : 'crashed';
      if (s.status === 'crashed') s.velocity = [0, 0, 0];
    } else {
      s.status = oldStatus === 'landed' ? 'landed' : 'grounded';
    }
    if (s.velocity[1] < 0) s.velocity[1] = 0;
  } else {
    s.status = 'flying';
  }
  s.time += dt;
}

export function step(state, controls = {}, environment = {}, dt) {
  if (!Number.isFinite(dt) || dt <= 0 || dt > 0.05)
    throw new RangeError('dt must be finite and in (0, 0.05].');
  const s = {
    position: [0, 1, 2].map(i => finite(state.position?.[i])),
    velocity: [0, 1, 2].map(i => finite(state.velocity?.[i])),
    pitch: finite(state.pitch), roll: finite(state.roll),
    heading: finite(state.heading), phase: finite(state.phase),
    time: finite(state.time),
    status: ['grounded', 'flying', 'landed', 'crashed'].includes(state.status)
      ? state.status : 'grounded'
  };
  const c = input(controls);
  // The production scheduler calls with 1/120 s; larger legal calls are subdivided.
  let remaining = dt;
  while (remaining > 1e-12) {
    const h = Math.min(1 / 120, remaining);
    substep(s, c, environment, h);
    remaining -= h;
  }
  return s;
}
