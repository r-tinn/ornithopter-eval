import {E} from './environment/engineering.mjs';

// A quick-return linkage indexed by the slow crank, not by elapsed time.
export function wingPose(s) {
  const w=E.wing, phi=s.gliding?0:s.phase;
  const t=phi-(s.timing_bias??w.timing_bias_low_speed)*Math.sin(phi);
  const a=Math.sin(t), b=s.gliding?0:Math.cos(t);
  const travel=-w.sweep_amplitude_m*(s.sweep_scale??1)*a;
  const inner={
    stroke:w.dihedral_rad-w.inner_amplitude_rad*a,
    sweep:travel/2, twist:w.incidence_rad-w.inner_twist_amplitude_rad*b,
    exposure:1, camber:w.camber_inner_base+w.camber_inner_amplitude*b
  };
  const outer={
    stroke:-w.outer_amplitude_rad*a,
    sweep:travel, twist:w.incidence_rad-w.outer_twist_amplitude_rad*b,
    exposure:s.gliding?1:1-(1-w.recovery_exposure)*(.5-.5*Math.tanh(4*b)/Math.tanh(4)),
    camber:w.camber_outer_base+w.camber_outer_amplitude*b
  };
  return {leftInner:inner,leftOuter:outer,rightInner:{...inner},rightOuter:{...outer}};
}
