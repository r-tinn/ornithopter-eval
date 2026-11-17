import {E} from './environment/engineering.mjs';

// The crank coordinate is a dynamical variable. The timing cam changes
// the mapping from crank angle to stroke, not the speed of the crank.
export function wingPose(s){
  const w=E.wing, phi=s.gliding?0:s.phase;
  const theta=phi-(s.timing_bias??w.timing_bias_low_speed)*Math.sin(phi);
  const h=Math.sin(theta), v=s.gliding?0:Math.cos(theta);
  const reach=-w.sweep_amplitude_m*(s.sweep_scale??1)*h;
  const inner={
    stroke:w.dihedral_rad-w.inner_amplitude_rad*h,
    twist:w.incidence_rad-w.inner_twist_amplitude_rad*v,
    sweep:reach*.5,exposure:1,
    camber:w.camber_inner_base+w.camber_inner_amplitude*v
  };
  const outer={
    stroke:-w.outer_amplitude_rad*h,
    twist:w.incidence_rad-w.outer_twist_amplitude_rad*v,sweep:reach,
    exposure:s.gliding?1:1-(1-w.recovery_exposure)*(.5-.5*Math.tanh(4*v)/Math.tanh(4)),
    camber:w.camber_outer_base+w.camber_outer_amplitude*v
  };
  return {leftInner:inner,rightInner:{...inner},leftOuter:outer,rightOuter:{...outer}};
}
