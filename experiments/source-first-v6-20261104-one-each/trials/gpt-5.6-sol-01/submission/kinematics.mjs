import {E} from './environment/engineering.mjs';

// This is a linkage completion of the motions described in the notes, rather
// than a claim that the following curves were measured from a bird.
export function wingPose(s){
  const phi=s.gliding?0:s.phase;
  const b=s.timing_bias===undefined?E.wing.timing_bias_low_speed:s.timing_bias;
  const theta=phi-b*Math.sin(phi), q=Math.cos(theta), v=Math.sin(theta);
  const scale=s.sweep_scale===undefined?1:s.sweep_scale;
  const exposure=s.gliding?1:1-(1-E.wing.recovery_exposure)*
    (.5-.5*Math.tanh(4*q)/Math.tanh(4));
  const inner={
    stroke:s.gliding?E.wing.dihedral_rad:E.wing.dihedral_rad-E.wing.inner_amplitude_rad*v,
    twist:s.gliding?E.wing.incidence_rad:E.wing.incidence_rad-E.wing.inner_twist_amplitude_rad*q,
    sweep:s.gliding?0:-.5*E.wing.sweep_amplitude_m*v*scale,
    exposure:1,
    camber:E.wing.camber_inner_base+(s.gliding?0:E.wing.camber_inner_amplitude*q)
  };
  const outer={
    stroke:s.gliding?0:-E.wing.outer_amplitude_rad*v,
    twist:s.gliding?E.wing.incidence_rad:E.wing.incidence_rad-E.wing.outer_twist_amplitude_rad*q,
    sweep:s.gliding?0:-E.wing.sweep_amplitude_m*v*scale,
    exposure,
    camber:E.wing.camber_outer_base+(s.gliding?0:E.wing.camber_outer_amplitude*q)
  };
  return {
    leftInner:{...inner},rightInner:{...inner},
    leftOuter:{...outer},rightOuter:{...outer}
  };
}
