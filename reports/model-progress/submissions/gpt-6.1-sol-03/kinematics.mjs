import {E} from './environment/engineering.mjs';

// A fixed quick-return linkage, not a prescribed crank speed.
export function wingPose(s){
  const w=E.wing,phi=s.gliding?0:s.phase;
  const theta=phi-(s.timing_bias??w.timing_bias_low_speed)*Math.sin(phi);
  const sn=s.gliding?0:Math.sin(theta),cs=s.gliding?0:Math.cos(theta);
  const scale=s.sweep_scale??1;
  const inner={
    stroke:w.dihedral_rad-w.inner_amplitude_rad*sn,
    twist:w.incidence_rad-w.inner_twist_amplitude_rad*cs,
    sweep:-.5*w.sweep_amplitude_m*sn*scale,
    exposure:1,
    camber:w.camber_inner_base+w.camber_inner_amplitude*cs
  };
  const outer={
    stroke:-w.outer_amplitude_rad*sn,
    twist:w.incidence_rad-w.outer_twist_amplitude_rad*cs,
    sweep:-w.sweep_amplitude_m*sn*scale,
    exposure:s.gliding?1:1-(1-w.recovery_exposure)*(.5-.5*Math.tanh(4*cs)/Math.tanh(4)),
    camber:w.camber_outer_base+w.camber_outer_amplitude*cs
  };
  return {leftInner:{...inner},rightInner:{...inner},leftOuter:{...outer},rightOuter:{...outer}};
}
