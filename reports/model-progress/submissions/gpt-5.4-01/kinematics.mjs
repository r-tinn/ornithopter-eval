import {E} from './environment/engineering.mjs';

const tanh4=Math.tanh(4);

function regionPose(region,state,theta){
  const sweepScale=state.sweep_scale ?? 1;
  if(region==='inner'){
    return {
      stroke:E.wing.dihedral_rad-E.wing.inner_amplitude_rad*Math.sin(theta),
      twist:E.wing.incidence_rad-E.wing.inner_twist_amplitude_rad*Math.cos(theta),
      sweep:-0.5*E.wing.sweep_amplitude_m*Math.sin(theta)*sweepScale,
      exposure:1,
      camber:E.wing.camber_inner_base+E.wing.camber_inner_amplitude*Math.cos(theta),
    };
  }
  return {
    stroke:-E.wing.outer_amplitude_rad*Math.sin(theta),
    twist:E.wing.incidence_rad-E.wing.outer_twist_amplitude_rad*Math.cos(theta),
    sweep:-E.wing.sweep_amplitude_m*Math.sin(theta)*sweepScale,
    exposure:1-(1-E.wing.recovery_exposure)*(0.5-0.5*Math.tanh(4*Math.cos(theta))/tanh4),
    camber:E.wing.camber_outer_base+E.wing.camber_outer_amplitude*Math.cos(theta),
  };
}

export function wingPose(state){
  if(state.gliding){
    const inner={
      stroke:E.wing.dihedral_rad,
      twist:E.wing.incidence_rad,
      sweep:0,
      exposure:1,
      camber:E.wing.camber_inner_base,
    };
    const outer={
      stroke:0,
      twist:E.wing.incidence_rad,
      sweep:0,
      exposure:1,
      camber:E.wing.camber_outer_base,
    };
    return {leftInner:inner,leftOuter:outer,rightInner:inner,rightOuter:outer};
  }
  const phi=state.phase;
  const b=state.timing_bias ?? E.wing.timing_bias_low_speed;
  const theta=phi-b*Math.sin(phi);
  const inner=regionPose('inner',state,theta);
  const outer=regionPose('outer',state,theta);
  return {leftInner:inner,leftOuter:outer,rightInner:inner,rightOuter:outer};
}
