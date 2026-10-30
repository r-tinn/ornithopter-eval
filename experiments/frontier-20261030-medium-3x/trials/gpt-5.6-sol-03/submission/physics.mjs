// Cycle-averaged educational benchmark model. All quantities are SI.
export const parameters = Object.freeze({
  span_m: 2.25552,                 // rounded source value: 7.4 ft
  wing_area_m2: 0.6140890944,      // paragraph value: 6.61 ft^2
  wrist_span_m: 1.12776,           // rounded source value: 3.7 ft
  shoulder_span_m: 0.1016,         // rounded source value: 4 in
  body_width_m: 0.2032,            // rounded source value: 8 in
  overall_length_m: 1.397,         // rounded source value: 55 in
  aspect_ratio: 8.284417032         // span^2 / area (source cross-check: 8.29)
});

const MASS = 6;
const G = 9.80665;
const GROUND = 0.2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const add = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
const scale = (a, s) => [a[0]*s, a[1]*s, a[2]*s];
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const norm = a => Math.hypot(a[0], a[1], a[2]);

function unitLift(forward, roll) {
  const d = forward[1];
  let u = [-forward[0]*d, 1-d*d, -forward[2]*d];
  let n = norm(u);
  // World-up has no projection for exactly vertical flow. This horizontal
  // direction is finite, deterministic, and perpendicular to the flow.
  if (n < 1e-9) {
    u = Math.abs(forward[0]) < 0.9
      ? [1-forward[0]*forward[0], -forward[0]*forward[1], -forward[0]*forward[2]]
      : [-forward[1]*forward[0], 1-forward[1]*forward[1], -forward[1]*forward[2]];
    n = norm(u) || 1;
  }
  u = scale(u, 1/n);
  // Rodrigues rotation about the relative-flow/forward vector.
  const c = Math.cos(roll), s = Math.sin(roll);
  const cross = [
    forward[1]*u[2]-forward[2]*u[1],
    forward[2]*u[0]-forward[0]*u[2],
    forward[0]*u[1]-forward[1]*u[0]
  ];
  return add(add(scale(u, c), scale(cross, s)), scale(forward, dot(forward,u)*(1-c)));
}

export function forces(state, controls, environment) {
  const wind = environment.wind || [0,0,0];
  const rho = Number.isFinite(environment.rho) ? environment.rho : 1.225;
  const air = [
    state.velocity[0]-wind[0],
    state.velocity[1]-wind[1],
    state.velocity[2]-wind[2]
  ];
  const speed = norm(air);
  const forward = speed > 1e-12 ? scale(air, 1/speed) : [1,0,0];
  const alpha = state.pitch - Math.atan2(air[1], Math.hypot(air[0],air[2]));
  const cl = clamp(0.6 + 3*alpha, -0.2, 1.4);
  const cd = 0.035 + cl*cl/(Math.PI*0.8*parameters.aspect_ratio);
  const qS = 0.5*rho*speed*speed*parameters.wing_area_m2;
  const lift = scale(unitLift(forward, state.roll), qS*cl);
  const drag = scale(forward, -qS*cd);
  const throttle = clamp(Number(controls.throttle)||0, 0, 1);
  const power = 400*throttle;
  const thrustMagnitude = 0.65*power/Math.max(speed,5);
  const thrust = scale(forward, thrustMagnitude);
  let force = add(add(add(lift,drag),thrust), [0,-MASS*G,0]);

  const onGround = state.position[1] <= GROUND + 1e-9 &&
                   state.status !== 'flying';
  if (onGround && force[1] < 0) force = [force[0],0,force[2]];

  if (onGround && controls.brake) {
    const vx=state.velocity[0], vz=state.velocity[2], hs=Math.hypot(vx,vz);
    if (hs > 1e-12) {
      const brake = 18*clamp(Number(controls.brake)||0,0,1);
      force[0] -= brake*vx/hs;
      force[2] -= brake*vz/hs;
    }
  }
  return {lift, drag, thrust, power, airspeed:speed, cl, force};
}

export function step(state, controls, environment, dt) {
  if (!Number.isFinite(dt) || dt <= 0 || dt > 0.05)
    throw new RangeError('dt must be finite and in (0, 0.05]');

  const f = forces(state, controls, environment);
  const oldV = [...state.velocity];
  const velocity = [
    oldV[0] + f.force[0]/MASS*dt,
    oldV[1] + f.force[1]/MASS*dt,
    oldV[2] + f.force[2]/MASS*dt
  ];

  // A ground brake may stop horizontal motion but never reverse it.
  if (state.position[1] <= GROUND+1e-9 && controls.brake &&
      oldV[0]*velocity[0] + oldV[2]*velocity[2] < 0) {
    velocity[0]=0; velocity[2]=0;
  }
  const position = [
    state.position[0] + velocity[0]*dt,
    state.position[1] + velocity[1]*dt,
    state.position[2] + velocity[2]*dt
  ];
  const pitch = clamp(state.pitch + 0.5*clamp(Number(controls.pitch)||0,-1,1)*dt,
                      -0.35, 0.45);
  const targetRoll = 0.6*clamp(Number(controls.bank)||0,-1,1);
  const rollDelta = clamp(targetRoll-state.roll, -2*dt, 2*dt);
  const roll = state.roll + rollDelta;
  const powered = clamp(Number(controls.throttle)||0,0,1) > 0;
  const phase = state.phase + (powered ? 4*Math.PI*dt : 0);
  let status = state.status;

  if (position[1] <= GROUND) {
    const touchdown = state.status === 'flying' && velocity[1] <= 0;
    position[1] = GROUND;
    if (touchdown) {
      const hs = Math.hypot(velocity[0],velocity[2]);
      status = (-velocity[1] <= 3 && hs <= 14 && Math.abs(roll) <= 0.35)
        ? 'landed' : 'crashed';
    } else if (status !== 'crashed' && status !== 'landed') {
      status = 'grounded';
    }
    if (velocity[1] < 0 || status === 'landed' || status === 'crashed') velocity[1]=0;
  } else if (status === 'grounded' || status === 'landed') {
    status = 'flying';
  }

  return {
    position, velocity, pitch, roll, phase,
    time: state.time + dt, status
  };
}
