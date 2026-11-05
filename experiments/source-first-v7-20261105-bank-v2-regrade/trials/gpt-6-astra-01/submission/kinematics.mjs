import {E} from './environment/engineering.mjs';
// Mechanical linkage law. Phase is integrated, never read from a clock.
export function wingPose(s) {
  const w=E.wing,phi=s.gliding?0:s.phase,b=s.timing_bias??w.timing_bias_low_speed;
  const theta=phi-b*Math.sin(phi),sn=Math.sin(theta),cs=Math.cos(theta),scale=s.sweep_scale??1;
  const inner={stroke:w.dihedral_rad-(s.gliding?0:w.inner_amplitude_rad*sn),
    twist:w.incidence_rad-(s.gliding?0:w.inner_twist_amplitude_rad*cs),
    sweep:s.gliding?0:-.5*w.sweep_amplitude_m*sn*scale,exposure:1,
    camber:w.camber_inner_base+(s.gliding?0:w.camber_inner_amplitude*cs)};
  const outer={stroke:s.gliding?0:-w.outer_amplitude_rad*sn,
    twist:w.incidence_rad-(s.gliding?0:w.outer_twist_amplitude_rad*cs),
    sweep:s.gliding?0:-w.sweep_amplitude_m*sn*scale,
    exposure:s.gliding?1:1-(1-w.recovery_exposure)*(.5-.5*Math.tanh(4*cs)/Math.tanh(4)),
    camber:w.camber_outer_base+(s.gliding?0:w.camber_outer_amplitude*cs)};
  return {leftInner:{...inner},rightInner:{...inner},leftOuter:{...outer},rightOuter:{...outer}};
}
