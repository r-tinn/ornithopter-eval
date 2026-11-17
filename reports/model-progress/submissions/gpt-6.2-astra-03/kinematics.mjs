import {E} from './environment/engineering.mjs';

// Material configuration, not a time law: the shaft can even rock backwards.
export function wingPose(s) {
  const w=E.wing, phi=s.gliding?0:s.phase;
  const theta=phi-(s.timing_bias??w.timing_bias_low_speed)*Math.sin(phi);
  const a=Math.sin(theta), b=s.gliding?0:Math.cos(theta);
  const sweep=-w.sweep_amplitude_m*(s.sweep_scale??1)*a;
  const inner={
    stroke:w.dihedral_rad-w.inner_amplitude_rad*a,
    twist:w.incidence_rad-w.inner_twist_amplitude_rad*b,
    sweep:sweep*.5,exposure:1,
    camber:w.camber_inner_base+w.camber_inner_amplitude*b
  };
  const outer={
    stroke:-w.outer_amplitude_rad*a,
    twist:w.incidence_rad-w.outer_twist_amplitude_rad*b,
    sweep,exposure:s.gliding?1:1-(1-w.recovery_exposure)*(.5-.5*Math.tanh(4*b)/Math.tanh(4)),
    camber:w.camber_outer_base+w.camber_outer_amplitude*b
  };
  return {leftInner:inner,leftOuter:outer,rightInner:{...inner},rightOuter:{...outer}};
}
