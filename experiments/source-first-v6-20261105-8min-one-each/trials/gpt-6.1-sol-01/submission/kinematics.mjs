import {E} from './environment/engineering.mjs';

// A quick-return linkage completion of the written wing-action argument.
// Phase is a dynamical coordinate, never a clock or an imposed wingbeat rate.
export function wingPose(s){
  const w=E.wing,phi=s.gliding?0:s.phase;
  const b=s.timing_bias??w.timing_bias_low_speed;
  const theta=phi-b*Math.sin(phi),sn=Math.sin(theta),cs=Math.cos(theta);
  const sweep=s.sweep_scale??1;
  const inner={
    stroke:w.dihedral_rad-w.inner_amplitude_rad*sn,
    twist:w.incidence_rad-w.inner_twist_amplitude_rad*cs,
    sweep:-.5*w.sweep_amplitude_m*sn*sweep,
    exposure:1,camber:w.camber_inner_base+w.camber_inner_amplitude*cs
  };
  const outer={
    stroke:-w.outer_amplitude_rad*sn,
    twist:w.incidence_rad-w.outer_twist_amplitude_rad*cs,
    sweep:-w.sweep_amplitude_m*sn*sweep,
    exposure:1-(1-w.recovery_exposure)*(.5-.5*Math.tanh(4*cs)/Math.tanh(4)),
    camber:w.camber_outer_base+w.camber_outer_amplitude*cs
  };
  if(s.gliding){
    Object.assign(inner,{stroke:w.dihedral_rad,twist:w.incidence_rad,sweep:0,camber:w.camber_inner_base});
    Object.assign(outer,{stroke:0,twist:w.incidence_rad,sweep:0,exposure:1,camber:w.camber_outer_base});
  }
  return {leftInner:{...inner},leftOuter:{...outer},rightInner:{...inner},rightOuter:{...outer}};
}
