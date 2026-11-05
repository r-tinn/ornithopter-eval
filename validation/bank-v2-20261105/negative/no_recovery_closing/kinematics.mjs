// Withheld handwritten calibration fixture; never a model result.
import {E} from './environment/engineering.mjs';
export function wingPose(s){
  const w=E.wing,phi=s.gliding?0:s.phase,b=s.timing_bias??w.timing_bias_low_speed,theta=phi-b*Math.sin(phi),c=Math.cos(theta),v=Math.sin(theta),pose={};
  const exposure=1-(1-w.recovery_exposure)*(.5-.5*Math.tanh(4*c)/Math.tanh(4));
  for(const side of ['left','right']){
    pose[side+'Inner']={stroke:w.dihedral_rad-w.inner_amplitude_rad*v,twist:w.incidence_rad+-w.inner_twist_amplitude_rad*c,sweep:-w.sweep_amplitude_m*.5*v*(s.sweep_scale??1),exposure:1,camber:w.camber_inner_base+w.camber_inner_amplitude*c};
    pose[side+'Outer']={stroke:-w.outer_amplitude_rad*v,twist:w.incidence_rad+-w.outer_twist_amplitude_rad*c,sweep:-w.sweep_amplitude_m*v*(s.sweep_scale??1),exposure,camber:w.camber_outer_base+w.camber_outer_amplitude*c};
  }
  if(s.gliding)for(const name of Object.keys(pose)){pose[name]={...pose[name],stroke:name.endsWith('Inner')?w.dihedral_rad:0,twist:w.incidence_rad,sweep:0,exposure:1,camber:name.endsWith('Inner')?w.camber_inner_base:w.camber_outer_base};}
  for(const n of ['leftOuter','rightOuter'])pose[n].exposure=1;return pose;
}
