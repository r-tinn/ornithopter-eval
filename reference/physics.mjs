// Newly written calibration fixture. Never included in evaluated model inputs.
export const parameters = Object.freeze({
  span_m: 7.4 * 0.3048, wing_area_m2: 6.61 * 0.3048 ** 2,
  wrist_span_m: 3.7 * 0.3048, shoulder_span_m: 4 * 0.0254,
  body_width_m: 8 * 0.0254, overall_length_m: 55 * 0.0254,
  aspect_ratio: 7.4 ** 2 / 6.61,
});
const mass = 6, g = 9.80665;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const unit = a => { const n = Math.hypot(...a); return n > 1e-10 ? a.map(x => x/n) : [1,0,0]; };

export function forces(state, controls, environment) {
  const air = state.velocity.map((v,i) => v - environment.wind[i]);
  const airspeed = Math.hypot(...air), forward = airspeed > 1e-10 ? unit(air) : [1,0,0];
  const alpha = state.pitch - Math.atan2(air[1], Math.hypot(air[0], air[2]));
  const cl = clamp(0.6 + 3*alpha, -0.2, 1.4);
  const q = 0.5 * environment.rho * airspeed ** 2;
  const lift = q * parameters.wing_area_m2 * cl;
  const drag = q * parameters.wing_area_m2 * (0.035 + cl ** 2 / (Math.PI*0.8*parameters.aspect_ratio));
  const power = 400 * clamp(controls.throttle,0,1), thrust = 0.65*power / Math.max(airspeed,5);
  let up = [0,1,0].map((x,i) => x - forward[i]*forward[1]);
  if (Math.hypot(...up) < 1e-9) up = [0,0,1];
  up = unit(up);
  const right = cross(forward,up);
  const liftDirection = up.map((x,i) => x*Math.cos(state.roll) + right[i]*Math.sin(state.roll));
  const force = forward.map((x,i) => x*(thrust-drag) + liftDirection[i]*lift - (i === 1 ? mass*g : 0));
  return {lift,drag,thrust,power,airspeed,cl,force};
}

export function step(state, controls, environment, dt) {
  if (!Number.isFinite(dt) || dt<=0 || dt>0.05) throw new RangeError('dt must be in (0,0.05]');
  const s = {...state, position:[...state.position], velocity:[...state.velocity]};
  if (s.status === 'crashed') return {...s,time:s.time+dt};
  const f = [...forces(state,controls,environment).force];
  const grounded = state.position[1] <= 0.200001 && state.status !== 'flying';
  const horizontal = Math.hypot(state.velocity[0],state.velocity[2]);
  if (grounded) {
    f[1] = Math.max(0,f[1]);
    if (horizontal>1e-10) {
      const brake = Math.min(18*clamp(controls.brake,0,1), horizontal*mass/dt);
      f[0] -= brake*state.velocity[0]/horizontal;
      f[2] -= brake*state.velocity[2]/horizontal;
    }
  }
  s.velocity = state.velocity.map((v,i) => v + f[i]/mass*dt);
  s.position = state.position.map((p,i) => p + s.velocity[i]*dt);
  s.pitch = clamp(state.pitch + 0.5*clamp(controls.pitch,-1,1)*dt,-0.35,0.45);
  s.roll = state.roll + clamp(0.6*clamp(controls.bank,-1,1)-state.roll,-2*dt,2*dt);
  s.phase = (state.phase + (controls.throttle>0 ? 4*Math.PI*dt : 0)) % (2*Math.PI);
  s.time = state.time+dt;
  if (s.position[1] > 0.200001) s.status = 'flying';
  if (s.position[1] <= 0.2) {
    s.position[1] = 0.2;
    if (state.status === 'flying') {
      s.status = s.velocity[1]>=-3 && Math.hypot(s.velocity[0],s.velocity[2])<=14 && Math.abs(s.roll)<=0.35 ? 'landed' : 'crashed';
    }
    s.velocity[1] = Math.max(0,s.velocity[1]);
    if (s.status === 'crashed') s.velocity = [0,0,0];
  }
  return s;
}
