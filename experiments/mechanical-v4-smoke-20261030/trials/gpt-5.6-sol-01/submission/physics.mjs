const PI = Math.PI;
const G = 9.80665;
const MASS = 6;
const SPAN = 3;
const ASPECT_RATIO = 7.4 * 7.4 / 6.61;
const WING_AREA = SPAN * SPAN / ASPECT_RATIO;
const WHEEL_RADIUS = 0.16;
const FIXED_STEP = 1 / 120;
const GEAR = Object.freeze([
  Object.freeze([0.6, -0.66, 0]),
  Object.freeze([-0.45, -0.66, -0.32]),
  Object.freeze([-0.45, -0.66, 0.32])
]);

export const parameters = Object.freeze({
  aspect_ratio: ASPECT_RATIO,
  wrist_span_fraction: 3.7 / 7.4,
  wing_area_m2: WING_AREA,
  span_m: SPAN,
  body_length_m: 2,
  mass_kg: MASS,
  wheel_radius_m: WHEEL_RADIUS,
  gear_centres: GEAR
});

function finite(v, fallback = 0) {
  return Number.isFinite(v) ? v : fallback;
}
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, finite(v)));
}
function cleanState(s) {
  const p = s && Array.isArray(s.position) ? s.position : [0, 0.82, 0];
  const v = s && Array.isArray(s.velocity) ? s.velocity : [0, 0, 0];
  return {
    position: [finite(p[0]), finite(p[1], 0.82), finite(p[2])],
    velocity: [finite(v[0]), finite(v[1]), finite(v[2])],
    pitch: clamp(s && s.pitch, -0.35, 0.45),
    roll: finite(s && s.roll),
    heading: finite(s && s.heading),
    phase: finite(s && s.phase),
    time: finite(s && s.time),
    status: s && typeof s.status === "string" ? s.status : "grounded"
  };
}
function cleanControls(c) {
  return {
    throttle: clamp(c && c.throttle, 0, 1),
    pitch: clamp(c && c.pitch, -1, 1),
    bank: clamp(c && c.bank, -1, 1),
    rudder: clamp(c && c.rudder, -1, 1),
    brake: clamp(c && c.brake, 0, 1)
  };
}

// Same semantic rotations as Euler(roll,-heading,pitch,'YZX') on the host.
function rotateLocal(p, roll, pitch, heading) {
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const ch = Math.cos(heading), sh = Math.sin(heading);
  const x1 = p[0];
  const y1 = cr * p[1] - sr * p[2];
  const z1 = sr * p[1] + cr * p[2];
  const x2 = cp * x1 - sp * y1;
  const y2 = sp * x1 + cp * y1;
  return [ch * x2 - sh * z1, y2, sh * x2 + ch * z1];
}
function surface(environment, x, z) {
  if (!environment || typeof environment.surfaceHeight !== "function") return 0;
  return finite(environment.surfaceHeight(x, z), 0);
}
function contacts(s, environment) {
  let minimum = Infinity;
  let correction = 0;
  for (const gear of GEAR) {
    const q = rotateLocal(gear, s.roll, s.pitch, s.heading);
    const x = s.position[0] + q[0];
    const y = s.position[1] + q[1];
    const z = s.position[2] + q[2];
    const clearance = y - WHEEL_RADIUS - surface(environment, x, z);
    minimum = Math.min(minimum, clearance);
    correction = Math.max(correction, -clearance);
  }
  return { touching: minimum <= 1e-4, minimum, correction };
}
function rotateAxis(v, a, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const dot = v[0] * a[0] + v[1] * a[1] + v[2] * a[2];
  const cross = [
    a[1] * v[2] - a[2] * v[1],
    a[2] * v[0] - a[0] * v[2],
    a[0] * v[1] - a[1] * v[0]
  ];
  return [
    v[0] * c + cross[0] * s + a[0] * dot * (1 - c),
    v[1] * c + cross[1] * s + a[1] * dot * (1 - c),
    v[2] * c + cross[2] * s + a[2] * dot * (1 - c)
  ];
}

export function forces(stateInput, controlsInput, environment) {
  const state = cleanState(stateInput);
  const controls = cleanControls(controlsInput);
  const wind = environment && Array.isArray(environment.wind) ?
    environment.wind : [0, 0, 0];
  const ax = state.velocity[0] - finite(wind[0]);
  const ay = state.velocity[1] - finite(wind[1]);
  const az = state.velocity[2] - finite(wind[2]);
  const speed2 = ax * ax + ay * ay + az * az;
  const airspeed = Math.sqrt(Math.max(0, speed2));
  const horizontalAir = Math.hypot(ax, az);
  const alpha = state.pitch - Math.atan2(ay, horizontalAir);
  const cl = clamp(0.6 + 3 * alpha, -0.2, 1.4);
  const rho = Math.max(0, finite(environment && environment.rho, 1.225));
  const q = 0.5 * rho * speed2;
  const cd = 0.035 + cl * cl / (PI * 0.8 * ASPECT_RATIO);
  const lift = q * WING_AREA * cl;
  const drag = Math.max(0, q * WING_AREA * cd);
  const power = 400 * controls.throttle;
  const thrust = Math.max(0, 0.65 * power / Math.max(airspeed, 5));

  const flow = airspeed > 1e-8 ?
    [ax / airspeed, ay / airspeed, az / airspeed] :
    [Math.cos(state.heading), 0, Math.sin(state.heading)];
  const upDot = flow[1];
  let liftDirection = [-flow[0] * upDot, 1 - upDot * upDot, -flow[2] * upDot];
  let length = Math.hypot(...liftDirection);
  if (length < 1e-8) {
    const forward = [Math.cos(state.heading), 0, Math.sin(state.heading)];
    const d = forward[0] * flow[0] + forward[2] * flow[2];
    liftDirection = [
      forward[0] - d * flow[0], -d * flow[1], forward[2] - d * flow[2]
    ];
    length = Math.hypot(...liftDirection);
  }
  if (length < 1e-8) {
    liftDirection = [0, 0, 1];
    length = 1;
  }
  liftDirection = liftDirection.map(v => v / length);
  liftDirection = rotateAxis(liftDirection, flow, state.roll);

  let fx = (thrust - drag) * flow[0] + lift * liftDirection[0];
  let fy = (thrust - drag) * flow[1] + lift * liftDirection[1] - MASS * G;
  let fz = (thrust - drag) * flow[2] + lift * liftDirection[2];

  const side = q * WING_AREA * 0.15 * controls.rudder;
  if (horizontalAir > 1e-8) {
    fx += side * -az / horizontalAir;
    fz += side * ax / horizontalAir;
  } else {
    fx += side * -Math.sin(state.heading);
    fz += side * Math.cos(state.heading);
  }

  const contact = contacts(state, environment);
  if (contact.touching && fy < 0) fy = 0;
  const groundSpeed = Math.hypot(state.velocity[0], state.velocity[2]);
  if (contact.touching && controls.brake > 0 && groundSpeed > 1e-8) {
    const brake = 18 * controls.brake;
    fx -= brake * state.velocity[0] / groundSpeed;
    fz -= brake * state.velocity[2] / groundSpeed;
  }
  return {
    lift: finite(lift),
    drag: finite(drag),
    thrust: finite(thrust),
    power: finite(power),
    airspeed: finite(airspeed),
    cl: finite(cl),
    force: [finite(fx), finite(fy), finite(fz)]
  };
}

function approach(value, target, limit) {
  return value < target ? Math.min(value + limit, target) :
    Math.max(value - limit, target);
}
function integrate(stateInput, controls, environment, dt) {
  const state = cleanState(stateInput);
  const oldContact = contacts(state, environment);
  const result = forces(state, controls, environment); // before attitude changes
  const oldVx = state.velocity[0], oldVz = state.velocity[2];
  const oldSpeed = Math.hypot(oldVx, oldVz);
  const velocity = [
    oldVx + result.force[0] * dt / MASS,
    state.velocity[1] + result.force[1] * dt / MASS,
    oldVz + result.force[2] * dt / MASS
  ];
  if (oldContact.touching && controls.brake > 0 && oldSpeed > 1e-8) {
    const along = velocity[0] * oldVx / oldSpeed +
      velocity[2] * oldVz / oldSpeed;
    if (along < 0) {
      velocity[0] -= along * oldVx / oldSpeed;
      velocity[2] -= along * oldVz / oldSpeed;
    }
  }
  const position = [
    state.position[0] + velocity[0] * dt,
    state.position[1] + velocity[1] * dt,
    state.position[2] + velocity[2] * dt
  ];
  const pitch = clamp(state.pitch + 0.5 * controls.pitch * dt, -0.35, 0.45);
  const roll = approach(state.roll, 0.6 * controls.bank, 2 * dt);
  const horizontalSpeed = Math.hypot(velocity[0], velocity[2]);
  const heading = horizontalSpeed > 0.1 ?
    Math.atan2(velocity[2], velocity[0]) : state.heading;
  let phase = state.phase;
  if (controls.throttle > 0) {
    phase = (phase + 4 * PI * dt) % (2 * PI);
    if (phase < 0) phase += 2 * PI;
  }
  const next = {
    position, velocity, pitch, roll, heading, phase,
    time: state.time + dt,
    status: state.status
  };
  const newContact = contacts(next, environment);
  if (newContact.correction > 0) {
    const sink = Math.max(0, -velocity[1]);
    next.position[1] += newContact.correction;
    if (next.velocity[1] < 0) next.velocity[1] = 0;
    if (state.status === "flying") {
      next.status = sink <= 3 && horizontalSpeed <= 14 && Math.abs(roll) <= 0.35 ?
        "landed" : "crashed";
    } else if (state.status !== "crashed" && state.status !== "landed") {
      next.status = "grounded";
    }
  } else if (newContact.minimum > 1e-4 &&
    (state.status === "grounded" || state.status === "landed")) {
    next.status = "flying";
  }
  return next;
}

export function step(stateInput, controlsInput, environment, dt) {
  if (!Number.isFinite(dt) || dt <= 0 || dt > 0.05) {
    throw new RangeError("dt must be finite and in (0, 0.05]");
  }
  const controls = cleanControls(controlsInput);
  let state = cleanState(stateInput);
  const count = Math.max(1, Math.ceil(dt / FIXED_STEP));
  const h = dt / count;
  for (let i = 0; i < count; i++) state = integrate(state, controls, environment, h);
  return state;
}
