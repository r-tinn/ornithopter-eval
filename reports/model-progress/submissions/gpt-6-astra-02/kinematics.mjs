import {E} from './environment/engineering.mjs';

// A fixed quick-return linkage, not a clock or a wing-speed controller.
// The crank coordinate is integrated by physics.mjs.
export function wingPose(s){
  const w=E.wing, phi=s.gliding?0:s.phase;
  const b=s.timing_bias??w.timing_bias_low_speed;
  const theta=phi-b*Math.sin(phi), sn=Math.sin(theta), cs=Math.cos(theta);
  const sweep=s.sweep_scale??1, result={};
  for(const side of ['left','right']){
    result[side+'Inner']={
      stroke:s.gliding?w.dihedral_rad:w.dihedral_rad-w.inner_amplitude_rad*sn,
      twist:s.gliding?w.incidence_rad:w.incidence_rad-w.inner_twist_amplitude_rad*cs,
      sweep:s.gliding?0:-.5*w.sweep_amplitude_m*sn*sweep,
      exposure:1,
      camber:w.camber_inner_base+(s.gliding?0:w.camber_inner_amplitude*cs)
    };
    result[side+'Outer']={
      stroke:s.gliding?0:-w.outer_amplitude_rad*sn,
      twist:s.gliding?w.incidence_rad:w.incidence_rad-w.outer_twist_amplitude_rad*cs,
      sweep:s.gliding?0:-w.sweep_amplitude_m*sn*sweep,
      exposure:s.gliding?1:1-(1-w.recovery_exposure)*(.5-.5*Math.tanh(4*cs)/Math.tanh(4)),
      camber:w.camber_outer_base+(s.gliding?0:w.camber_outer_amplitude*cs)
    };
  }
  return result;
}
