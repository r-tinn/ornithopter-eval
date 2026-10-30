// Swan Flight Lab's complete, shared point-mass model.  Source dimensions are
// rounded values from page 02; all dynamics below are the benchmark assumptions.
export const parameters = Object.freeze({
  span_m: 2.25552,                 // 7.4 ft
  wing_area_m2: 0.6140890944,      // 6.61 ft^2
  wrist_span_m: 1.12776,           // 3.7 ft
  shoulder_span_m: 0.1016,         // 4 in
  body_width_m: 0.2032,            // 8 in
  overall_length_m: 1.397,         // 55 in
  aspect_ratio: 8.284417
});

const MASS = 6;
const G = 9.80665;
const GROUND = 0.2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const mag = v => Math.hypot(v[0], v[1], v[2]);
const scale = (v, s) => [v[0] * s, v[1] * s, v[2] * s];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const unit = (v, fallback = [1, 0, 0]) => {
  const m = mag(v);
  return m > 1e-12 ? scale(v, 1/m) : fallback.slice();
};

export function forces(state, controls, environment) {
  const wind = environment?.wind || [0, 0, 0];
  const rho = Number.isFinite(environment?.rho) ? environment.rho : 1.225;
  const throttle = clamp(Number(controls?.throttle) || 0, 0, 1);
  const brake = clamp(Number(controls?.brake) || 0, 0, 1);
  const air = [
    state.velocity[0] - wind[0],
    state.velocity[1] - wind[1],
    state.velocity[2] - wind[2]
  ];
  const speed = mag(air);
  const forward = unit(air, [1, 0, 0]);
  const alpha = state.pitch - Math.atan2(air[1], Math.hypot(air[0], air[2]));
  const cl = clamp(0.6 + 3 * alpha, -0.2, 1.4);
  const cd = 0.035 + cl*cl / (Math.PI * 0.8 * parameters.aspect_ratio);
  const qS = 0.5 * rho * speed * speed * parameters.wing_area_m2;
  const liftN = qS * cl;
  const dragN = qS * cd;

  // Project world-up into the plane normal to the flow.  For exactly vertical
  // flow, use a finite horizontal reference.
  let lift0 = [0, 1, 0];
  lift0 = add(lift0, scale(forward, -dot(lift0, forward)));
  if (mag(lift0) < 1e-9) {
    const ref = Math.abs(forward[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    lift0 = add(ref, scale(forward, -dot(ref, forward)));
  }
  lift0 = unit(lift0, [0, 0, 1]);
  const r = Number(state.roll) || 0;
  // Rodrigues rotation around forward.
  const liftDir = add(
    add(scale(lift0, Math.cos(r)), scale(cross(forward, lift0), Math.sin(r))),
    scale(forward, dot(forward, lift0) * (1 - Math.cos(r)))
  );
  const lift = scale(liftDir, liftN);
  const drag = scale(forward, -dragN);
  const power = 400 * throttle;
  let thrustN = 0.65 * power / Math.max(speed, 5);
  if (speed > 0) thrustN = Math.min(thrustN, 0.65 * power / speed);
  const thrust = scale(forward, thrustN);
  let total = add(add(lift, drag), thrust);
  total[1] -= MASS * G;

  const onGround = state.position[1] <= GROUND + 1e-9 && state.status !== "flying";
  if (onGround && total[1] < 0) total[1] = 0; // normal support
  if (onGround && brake > 0) {
    const hv = Math.hypot(state.velocity[0], state.velocity[2]);
    if (hv > 1e-10) {
      total[0] -= 18 * brake * state.velocity[0] / hv;
      total[2] -= 18 * brake * state.velocity[2] / hv;
    }
  }
  return {
    lift, drag, thrust, power, airspeed: speed, cl,
    force: [total[0], total[1], total[2]]
  };
}

export function step(state, controls, environment, dt) {
  if (!Number.isFinite(dt) || dt <= 0 || dt > 0.05)
    throw new RangeError("dt must be finite and in (0, 0.05]");
  const s = {
    position: state.position.slice(),
    velocity: state.velocity.slice(),
    pitch: Number(state.pitch) || 0,
    roll: Number(state.roll) || 0,
    phase: Number(state.phase) || 0,
    time: Number(state.time) || 0,
    status: state.status
  };
  const f = forces(s, controls, environment);
  const oldVX = s.velocity[0], oldVZ = s.velocity[2];
  for (let i = 0; i < 3; i++) s.velocity[i] += f.force[i] / MASS * dt;

  const onGround = s.position[1] <= GROUND + 1e-9 && s.status !== "flying";
  if (onGround && (Number(controls?.brake) || 0) > 0) {
    // A Coulomb brake is not allowed to numerically reverse ground motion.
    if (oldVX !== 0 && oldVX * s.velocity[0] < 0) s.velocity[0] = 0;
    if (oldVZ !== 0 && oldVZ * s.velocity[2] < 0) s.velocity[2] = 0;
  }
  for (let i = 0; i < 3; i++) s.position[i] += s.velocity[i] * dt;

  // Attitude is deliberately manual: no hidden stability or flight-path lock.
  s.pitch = clamp(s.pitch + 0.5 * clamp(Number(controls?.pitch)||0, -1, 1) * dt,
                  -0.35, 0.45);
  const targetRoll = 0.6 * clamp(Number(controls?.bank)||0, -1, 1);
  s.roll += clamp(targetRoll - s.roll, -2*dt, 2*dt);
  if ((Number(controls?.throttle)||0) > 0)
    s.phase += 4 * Math.PI * dt; // radians, exactly 2 cycles/s
  s.time += dt;

  if (s.status === "grounded" && s.position[1] > GROUND + 1e-7)
    s.status = "flying";
  if (state.status === "flying" && s.position[1] <= GROUND) {
    const horizontal = Math.hypot(s.velocity[0], s.velocity[2]);
    const safe = Math.abs(s.velocity[1]) <= 3 && horizontal <= 14 &&
                 Math.abs(s.roll) <= 0.35;
    s.status = safe ? "landed" : "crashed";
    s.position[1] = GROUND;
    s.velocity[1] = 0;
  } else if (s.position[1] < GROUND) {
    s.position[1] = GROUND;
    if (s.velocity[1] < 0) s.velocity[1] = 0;
  }
  return s;
}
