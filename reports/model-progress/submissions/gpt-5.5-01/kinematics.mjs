import {E} from './environment/engineering.mjs';

function one(region,theta,scale,gliding=false){
  const w=E.wing;
  if(gliding){
    const outer=region==='outer';
    return {
      stroke:outer?0:w.dihedral_rad,
      twist:w.incidence_rad,
      sweep:0,
      exposure:1,
      camber:outer?w.camber_outer_base:w.camber_inner_base
    };
  }
  const outer=region==='outer';
  const stroke=outer?-w.outer_amplitude_rad*Math.sin(theta):w.dihedral_rad-w.inner_amplitude_rad*Math.sin(theta);
  const amp=outer?w.outer_twist_amplitude_rad:w.inner_twist_amplitude_rad;
  return {
    stroke,
    twist:w.incidence_rad-amp*Math.cos(theta),
    sweep:(outer?-w.sweep_amplitude_m:-0.5*w.sweep_amplitude_m)*Math.sin(theta)*scale,
    exposure:outer?1-(1-w.recovery_exposure)*(0.5-0.5*Math.tanh(4*Math.cos(theta))/Math.tanh(4)):1,
    camber:(outer?w.camber_outer_base:w.camber_inner_base)+(outer?w.camber_outer_amplitude:w.camber_inner_amplitude)*Math.cos(theta)
  };
}

export function wingPose(state){
  const b=state.timing_bias??E.wing.timing_bias_low_speed;
  const phi=state.gliding?0:(state.phase??0);
  const theta=phi-b*Math.sin(phi);
  const scale=state.sweep_scale??1;
  const inner=one('inner',theta,scale,!!state.gliding);
  const outer=one('outer',theta,scale,!!state.gliding);
  return {
    leftInner:{...inner},
    rightInner:{...inner},
    leftOuter:{...outer},
    rightOuter:{...outer}
  };
}
