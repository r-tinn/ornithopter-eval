// Source dimensions: page 02, rounded "Say" column, except the paragraph's area.
// All aerodynamic, power, mass, control and contact rules below are NEW assumptions.
const FT = 0.3048, IN = 0.0254;
export const parameters = Object.freeze({
  span_m: 7.4 * FT,
  wing_area_m2: 6.61 * FT * FT,
  wrist_span_m: 3.7 * FT,
  shoulder_span_m: 4 * IN,
  body_width_m: 8 * IN,
  overall_length_m: 55 * IN,
  aspect_ratio: (7.4 * FT) ** 2 / (6.61 * FT * FT)
});
export const constants = Object.freeze({mass: 6, g: 9.80665, rho: 1.225, ground: 0.2});
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const normalized = a => { const n = Math.hypot(...a); return a.map(x => x/n); };
const copy = s => ({...s, position: [...s.position], velocity: [...s.velocity]});

/** Cycle-averaged forces in world SI axes: x forward, y up, z lateral.
 *  Scalars lift/drag/thrust are N; power is mechanical W. force includes contact.
 *  This function and step never mutate their arguments.
 */
export function forces(state, controls, environment = {}) {
  const wind = environment.wind || [0, 0, 0];
  const rho = environment.rho ?? constants.rho;
  const air = state.velocity.map((v, i) => v - wind[i]);
  const speed = Math.hypot(...air);
  const forward = speed > 1e-12 ? air.map(v => v / speed) : [1, 0, 0];
  const alpha = state.pitch - Math.atan2(air[1], Math.hypot(air[0], air[2]));
  const cl = clamp(0.6 + 3 * alpha, -0.2, 1.4);
  const cd = 0.035 + cl * cl / (Math.PI * 0.8 * parameters.aspect_ratio);
  const qS = 0.5 * rho * speed * speed * parameters.wing_area_m2;
  const lift = qS * cl, drag = qS * cd;
  const power = 400 * clamp(controls.throttle ?? 0, 0, 1);
  const thrust = 0.65 * power / Math.max(speed, 5);
  // Projection of world-up onto the plane normal to forward.
  let up = [-forward[0]*forward[1], 1-forward[1]*forward[1], -forward[2]*forward[1]];
  if (Math.hypot(...up) < 1e-8) {
    // Project world-x instead, for a finite vertical-flow fallback.
    up = [1-forward[0]*forward[0], -forward[0]*forward[1], -forward[0]*forward[2]];
  }
  up = normalized(up);
  const side = cross(forward, up);
  const c = Math.cos(state.roll), s = Math.sin(state.roll);
  const liftDirection = up.map((u, i) => u*c + side[i]*s);
  const force = forward.map((f, i) => f*(thrust-drag) + liftDirection[i]*lift);
  force[1] -= constants.mass * constants.g;
  if (state.position[1] <= constants.ground + 1e-10 && state.velocity[1] <= 0) {
    force[1] = Math.max(0, force[1]);
    const horizontal = Math.hypot(state.velocity[0], state.velocity[2]);
    if (horizontal > 1e-12) {
      const braking = 18 * clamp(controls.brake ?? 0, 0, 1);
      force[0] -= braking * state.velocity[0] / horizontal;
      force[2] -= braking * state.velocity[2] / horizontal;
    }
  }
  return {lift, drag, thrust, power, airspeed: speed, cl, force};
}

/** Semi-implicit Euler, with current-state forces and unilateral ground contact. */
export function step(state, controls, environment = {}, dt) {
  if (!Number.isFinite(dt) || dt <= 0 || dt > 0.05) {
    throw new RangeError('dt must be finite and in (0, 0.05] seconds');
  }
  const next = copy(state);
  if (state.status === 'crashed') return next;
  const onGround = state.position[1] <= constants.ground + 1e-10 && state.velocity[1] <= 0;
  // Apply a bounded braking impulse after the other forces. This is equivalent
  // to the force above away from zero speed, but cannot reverse motion at rest.
  const brake = clamp(controls.brake ?? 0, 0, 1);
  const f = forces(state, onGround && brake ? {...controls, brake: 0} : controls, environment);
  next.velocity = state.velocity.map((v, i) => v + dt * f.force[i] / constants.mass);
  if (onGround && brake) {
    const speed = Math.hypot(next.velocity[0], next.velocity[2]);
    const factor = speed > 0 ? Math.max(0, 1 - 18*brake*dt / (constants.mass*speed)) : 0;
    next.velocity[0] *= factor;
    next.velocity[2] *= factor;
  }
  next.position = state.position.map((p, i) => p + dt * next.velocity[i]);
  next.pitch = clamp(state.pitch + 0.5 * clamp(controls.pitch ?? 0, -1, 1) * dt, -0.35, 0.45);
  const targetRoll = 0.6 * clamp(controls.bank ?? 0, -1, 1);
  next.roll = state.roll + clamp(targetRoll - state.roll, -2*dt, 2*dt);
  next.phase = (state.phase + ((controls.throttle ?? 0) > 0 ? 4*Math.PI*dt : 0)) % (2*Math.PI);
  next.time = state.time + dt;
  if (next.position[1] <= constants.ground) {
    const touchdown = state.status === 'flying' || state.position[1] > constants.ground + 1e-10;
    if (touchdown) {
      const safe = -next.velocity[1] <= 3 &&
        Math.hypot(next.velocity[0], next.velocity[2]) <= 14 && Math.abs(next.roll) <= 0.35;
      next.status = safe ? 'landed' : 'crashed';
    }
    next.position[1] = constants.ground;
    next.velocity[1] = 0;
  } else {
    next.status = 'flying';
  }
  return next;
}
