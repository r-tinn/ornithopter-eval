import {E} from './environment/engineering.mjs';

// One linkage law is shared by the geometry, mass bookkeeping and strip model.
export function wingPose(s){
  const phi=s.gliding?0:s.phase;
  const b=s.timing_bias??E.wing.timing_bias_low_speed;
  const theta=phi-b*Math.sin(phi);
  const scale=s.sweep_scale??1;
  const ct=Math.cos(theta),st=Math.sin(theta);
  const exposure=1-(1-E.wing.recovery_exposure)*
    (.5-.5*Math.tanh(4*ct)/Math.tanh(4));
  const region=(outer)=>{
    if(s.gliding)return {
      stroke:outer?0:E.wing.dihedral_rad,
      twist:E.wing.incidence_rad,sweep:0,exposure:1,
      camber:outer?E.wing.camber_outer_base:E.wing.camber_inner_base
    };
    return {
      stroke:outer?-E.wing.outer_amplitude_rad*st:
        E.wing.dihedral_rad-E.wing.inner_amplitude_rad*st,
      twist:E.wing.incidence_rad-(outer?E.wing.outer_twist_amplitude_rad:
        E.wing.inner_twist_amplitude_rad)*ct,
      sweep:-(outer?1:.5)*E.wing.sweep_amplitude_m*st*scale,
      exposure:outer?exposure:1,
      camber:(outer?E.wing.camber_outer_base:E.wing.camber_inner_base)+
        (outer?E.wing.camber_outer_amplitude:E.wing.camber_inner_amplitude)*ct
    };
  };
  return {leftInner:region(false),rightInner:region(false),
    leftOuter:region(true),rightOuter:region(true)};
}
