import {E} from './environment/engineering.mjs';

/*
 * A single crank coordinate drives all four regions.  These curves are an
 * engineering completion of the actions described in the notes, rather than
 * measurements taken from the photographs.
 */
export function wingPose(s){
  const phi=s.gliding?0:s.phase;
  const bias=Number.isFinite(s.timing_bias)?s.timing_bias:E.wing.timing_bias_low_speed;
  const theta=phi-bias*Math.sin(phi);
  const q=Math.cos(theta),w=Math.sin(theta);
  const sweepScale=Number.isFinite(s.sweep_scale)?s.sweep_scale:1;
  const recovery=1-(1-E.wing.recovery_exposure)*
    (.5-.5*Math.tanh(4*q)/Math.tanh(4));

  const region=(side,outer)=>{
    if(s.gliding)return {
      stroke:outer?0:E.wing.dihedral_rad,
      twist:E.wing.incidence_rad,
      sweep:0,exposure:1,
      camber:outer?E.wing.camber_outer_base:E.wing.camber_inner_base
    };
    return {
      stroke:outer?-E.wing.outer_amplitude_rad*w:
        E.wing.dihedral_rad-E.wing.inner_amplitude_rad*w,
      twist:E.wing.incidence_rad-
        (outer?E.wing.outer_twist_amplitude_rad:E.wing.inner_twist_amplitude_rad)*q,
      sweep:-(outer?1:.5)*E.wing.sweep_amplitude_m*w*sweepScale,
      exposure:outer?recovery:1,
      camber:(outer?E.wing.camber_outer_base:E.wing.camber_inner_base)+
        (outer?E.wing.camber_outer_amplitude:E.wing.camber_inner_amplitude)*q
    };
  };
  return {
    leftInner:region(-1,false),leftOuter:region(-1,true),
    rightInner:region(1,false),rightOuter:region(1,true)
  };
}
