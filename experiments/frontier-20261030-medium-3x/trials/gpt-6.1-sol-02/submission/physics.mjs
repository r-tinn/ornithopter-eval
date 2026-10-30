// Source dimensions: page 02, rounded "Say" column; area from its paragraph.
// Everything below the dimensions is the task's NEW educational benchmark.
const ft = 0.3048, inch = 0.0254;
export const parameters = Object.freeze({
  span_m: 7.4 * ft,
  wing_area_m2: 6.61 * ft * ft,
  wrist_span_m: 3.7 * ft,
  shoulder_span_m: 4 * inch,
  body_width_m: 8 * inch,
  overall_length_m: 55 * inch,
  aspect_ratio: (7.4 * 7.4) / 6.61
});
export const mass = 6;
export const gravity = 9.80665;
export const ground = 0.2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const norm = v => Math.hypot(...v);
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const scale = (v, s) => v.map(x => x*s);
const add = (a, b) => a.map((x, i) => x+b[i]);
const input = c => ({
  throttle: clamp(c.throttle ?? 0, 0, 1),
  pitch: clamp(c.pitch ?? 0, -1, 1),
  bank: clamp(c.bank ?? 0, -1, 1),
  brake: clamp(c.brake ?? 0, 0, 1)
});

export function forces(state, controls = {}, environment = {}) {
  const c = input(controls);
  const wind = environment.wind ?? [0, 0, 0];
  const rho = environment.rho ?? 1.225;
  const air = state.velocity.map((v, i) => v-wind[i]);
  const airspeed = norm(air);
  const forward = airspeed > 1e-12 ? scale(air, 1/airspeed) : [1, 0, 0];
  const alpha = state.pitch - Math.atan2(air[1], Math.hypot(air[0], air[2]));
  const cl = clamp(0.6 + 3*alpha, -0.2, 1.4);
  const cd = 0.035 + cl*cl / (Math.PI*0.8*parameters.aspect_ratio);
  const qS = 0.5*rho*airspeed*airspeed*parameters.wing_area_m2;
  const lift = qS*cl, drag = qS*cd;
  const power = 400*c.throttle;
  const thrust = 0.65*power / Math.max(airspeed, 5);
  // Project up into the flow-normal plane. Near vertical use projected +z.
  let up = add([0, 1, 0], scale(forward, -forward[1]));
  if (norm(up) < 1e-9) up = add([0, 0, 1], scale(forward, -forward[2]));
  up = scale(up, 1/norm(up));
  // Rodrigues rotation around the relative-flow direction.
  const liftDirection = add(scale(up, Math.cos(state.roll)),
    scale(cross(forward, up), Math.sin(state.roll)));
  let force = add(add(scale(liftDirection, lift), scale(forward, thrust-drag)), [0, -mass*gravity, 0]);
  if (state.position[1] <= ground && state.velocity[1] <= 0) {
    force[1] = Math.max(0, force[1]);
    const h = Math.hypot(state.velocity[0], state.velocity[2]);
    if (h > 0) {
      force[0] -= 18*c.brake*state.velocity[0]/h;
      force[2] -= 18*c.brake*state.velocity[2]/h;
    }
  }
  return {lift, drag, thrust, power, airspeed, cl, force};
}

export function step(state, controls = {}, environment = {}, dt) {
  if (!Number.isFinite(dt) || dt <= 0 || dt > 0.05)
    throw new RangeError('dt must be finite and in (0, 0.05] seconds');
  const c = input(controls);
  const next = {...state, position: [...state.position], velocity: [...state.velocity]};
  if (state.status === 'crashed') return next;
  const f = forces(state, c, environment).force;
  next.velocity = state.velocity.map((v, i) => v + f[i]*dt/mass);
  // Limit the ground-brake impulse, not the aerodynamic acceleration.
  if (state.position[1] <= ground && state.velocity[1] <= 0 && c.brake > 0) {
    const h = Math.hypot(state.velocity[0], state.velocity[2]);
    if (h > 0) {
      const direction = [state.velocity[0]/h, 0, state.velocity[2]/h];
      const impulse = 18*c.brake*dt/mass;
      const unbraked = add(next.velocity, scale(direction, impulse));
      const available = Math.max(0, dot(unbraked, direction));
      next.velocity = add(unbraked, scale(direction, -Math.min(impulse, available)));
    }
  }
  next.position = state.position.map((p, i) => p + next.velocity[i]*dt);
  next.pitch = clamp(state.pitch + 0.5*c.pitch*dt, -0.35, 0.45);
  const rollError = 0.6*c.bank-state.roll;
  next.roll = state.roll + clamp(rollError, -2*dt, 2*dt);
  next.phase = c.throttle > 0 ? (state.phase + 4*Math.PI*dt) % (2*Math.PI) : state.phase;
  next.time = state.time + dt;
  if (next.position[1] <= ground) {
    next.position[1] = ground;
    if (state.status === 'flying' || state.position[1] > ground) {
      const safe = Math.max(0, -next.velocity[1]) <= 3 &&
        Math.hypot(next.velocity[0], next.velocity[2]) <= 14 && Math.abs(next.roll) <= 0.35;
      next.status = safe ? 'landed' : 'crashed';
      if (!safe) next.velocity = [0, 0, 0];
    }
    next.velocity[1] = Math.max(0, next.velocity[1]);
  } else {
    next.status = 'flying';
  }
  return next;
}
