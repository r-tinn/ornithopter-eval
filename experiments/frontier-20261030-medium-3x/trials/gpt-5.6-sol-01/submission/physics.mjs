// Cycle-averaged educational benchmark used by both the page and numeric API.
// SI units; world axes are x forward, y up, z lateral.
export const parameters = Object.freeze({
  span_m: 2.25552,                 // 7.4 ft
  wing_area_m2: 0.6140890944,      // 6.61 ft^2
  wrist_span_m: 1.12776,           // 3.7 ft
  shoulder_span_m: 0.1016,         // 4 in
  body_width_m: 0.2032,            // 8 in
  overall_length_m: 1.397,         // 55 in
  aspect_ratio: (2.25552 * 2.25552) / 0.6140890944
});

const MASS = 6;
const G = 9.80665;
const GROUND = 0.2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mag = v => Math.hypot(v[0], v[1], v[2]);
const scale = (v, s) => [v[0] * s, v[1] * s, v[2] * s];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];

function finiteVector(v, fallback) {
  return Array.isArray(v) && v.length === 3 && v.every(Number.isFinite)
    ? [v[0], v[1], v[2]] : fallback.slice();
}

export function forces(state, controls = {}, environment = {}) {
  const velocity = finiteVector(state.velocity, [0, 0, 0]);
  const wind = finiteVector(environment.wind, [0, 0, 0]);
  const air = velocity.map((v, i) => v - wind[i]);
  const speed = mag(air);
  const forward = speed > 1e-12 ? scale(air, 1 / speed) : [1, 0, 0];
  const pitch = Number.isFinite(state.pitch) ? state.pitch : 0;
  const roll = Number.isFinite(state.roll) ? state.roll : 0;
  const alpha = pitch - Math.atan2(air[1], Math.hypot(air[0], air[2]));
  const cl = clamp(0.6 + 3 * alpha, -0.2, 1.4);
  const cd = 0.035 + cl * cl / (Math.PI * 0.8 * parameters.aspect_ratio);
  const rho = Number.isFinite(environment.rho) ? environment.rho : 1.225;
  const qS = 0.5 * rho * speed * speed * parameters.wing_area_m2;
  const liftN = qS * cl;
  const dragN = qS * cd;

  // Project world-up into the plane normal to flight. For a vertical flow,
  // use a finite horizontal reference. Rodrigues then banks it about forward.
  let lift0 = [-forward[1] * forward[0],
               1 - forward[1] * forward[1],
              -forward[1] * forward[2]];
  let lm = mag(lift0);
  if (lm < 1e-9) {
    lift0 = Math.abs(forward[2]) < 0.9
      ? [-forward[2], 0, forward[0]]
      : [0, -forward[2], forward[1]];
    lm = mag(lift0);
  }
  lift0 = scale(lift0, 1 / lm);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const fxl = cross(forward, lift0);
  const liftDir = [
    lift0[0] * cr + fxl[0] * sr,
    lift0[1] * cr + fxl[1] * sr,
    lift0[2] * cr + fxl[2] * sr
  ];
  const lift = scale(liftDir, liftN);
  const drag = scale(forward, -dragN);

  const throttle = clamp(Number(controls.throttle) || 0, 0, 1);
  const power = 400 * throttle;
  // max(speed,5) also guarantees T*speed <= efficiency*mechanical power.
  const thrustN = 0.65 * power / Math.max(speed, 5);
  const thrust = scale(forward, thrustN);
  const force = [
    lift[0] + drag[0] + thrust[0],
    lift[1] + drag[1] + thrust[1] - MASS * G,
    lift[2] + drag[2] + thrust[2]
  ];

  const onGround = state.position && state.position[1] <= GROUND + 1e-9 &&
                   state.status !== 'flying';
  if (onGround && force[1] < 0) force[1] = 0;

  const brake = clamp(Number(controls.brake) || 0, 0, 1);
  const hs = Math.hypot(velocity[0], velocity[2]);
  if (onGround && brake > 0 && hs > 1e-12) {
    force[0] -= 18 * brake * velocity[0] / hs;
    force[2] -= 18 * brake * velocity[2] / hs;
  }
  return { lift, drag, thrust, power, airspeed: speed, cl, force };
}

export function step(state, controls = {}, environment = {}, dt) {
  if (!Number.isFinite(dt) || dt <= 0 || dt > 0.05)
    throw new RangeError('dt must be finite and in (0, 0.05]');

  const s = {
    position: finiteVector(state.position, [0, GROUND, 0]),
    velocity: finiteVector(state.velocity, [0, 0, 0]),
    pitch: Number.isFinite(state.pitch) ? state.pitch : 0,
    roll: Number.isFinite(state.roll) ? state.roll : 0,
    phase: Number.isFinite(state.phase) ? state.phase : 0,
    time: Number.isFinite(state.time) ? state.time : 0,
    status: typeof state.status === 'string' ? state.status : 'grounded'
  };
  const c = {
    throttle: clamp(Number(controls.throttle) || 0, 0, 1),
    pitch: clamp(Number(controls.pitch) || 0, -1, 1),
    bank: clamp(Number(controls.bank) || 0, -1, 1),
    brake: clamp(Number(controls.brake) || 0, 0, 1)
  };
  const f = forces(s, c, environment);
  let velocity = s.velocity.map((v, i) => v + f.force[i] * dt / MASS);

  // A brake impulse may stop horizontal motion, but cannot reverse it.
  if (c.brake > 0 && s.status !== 'flying' &&
      s.position[1] <= GROUND + 1e-9) {
    if (s.velocity[0] && velocity[0] * s.velocity[0] < 0) velocity[0] = 0;
    if (s.velocity[2] && velocity[2] * s.velocity[2] < 0) velocity[2] = 0;
  }
  let position = s.position.map((p, i) => p + velocity[i] * dt);
  let status = s.status;

  if ((status === 'grounded' || status === 'landed') && position[1] > GROUND + 1e-8) {
    status = 'flying';
  }
  if (position[1] <= GROUND) {
    if (status === 'flying') {
      const horizontal = Math.hypot(velocity[0], velocity[2]);
      status = (-velocity[1] <= 3 && horizontal <= 14 && Math.abs(s.roll) <= 0.35)
        ? 'landed' : 'crashed';
    }
    position[1] = GROUND;
    if (velocity[1] < 0) velocity[1] = 0;
  }

  const pitch = clamp(s.pitch + 0.5 * c.pitch * dt, -0.35, 0.45);
  const targetRoll = 0.6 * c.bank;
  const rollDelta = clamp(targetRoll - s.roll, -2 * dt, 2 * dt);
  const roll = s.roll + rollDelta;
  const phase = c.throttle > 0
    ? (s.phase + 4 * Math.PI * dt) % (2 * Math.PI)
    : s.phase;
  return {
    position, velocity, pitch, roll, phase,
    time: s.time + dt, status
  };
}
