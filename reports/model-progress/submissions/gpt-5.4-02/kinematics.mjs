import {E} from './environment/engineering.mjs';

function sidePose(region,state){
  const w=E.wing;
  if(state.gliding){
    const innerStroke=w.dihedral_rad;
    return region==='inner'
      ? {stroke:innerStroke,twist:w.incidence_rad,sweep:0,exposure:1,camber:w.camber_inner_base}
      : {stroke:0,twist:w.incidence_rad,sweep:0,exposure:1,camber:w.camber_outer_base};
  }
  const phi=state.phase;
  const bias=state.timing_bias??w.timing_bias_low_speed;
  const theta=phi-bias*Math.sin(phi);
  const sweepScale=state.sweep_scale??1;
  const exposure=1-(1-w.recovery_exposure)*(.5-.5*Math.tanh(4*Math.cos(theta))/Math.tanh(4));
  if(region==='inner')return {
    stroke:w.dihedral_rad-w.inner_amplitude_rad*Math.sin(theta),
    twist:w.incidence_rad-w.inner_twist_amplitude_rad*Math.cos(theta),
    sweep:-0.5*w.sweep_amplitude_m*Math.sin(theta)*sweepScale,
    exposure:1,
    camber:w.camber_inner_base+w.camber_inner_amplitude*Math.cos(theta),
  };
  return {
    stroke:-w.outer_amplitude_rad*Math.sin(theta),
    twist:w.incidence_rad-w.outer_twist_amplitude_rad*Math.cos(theta),
    sweep:-w.sweep_amplitude_m*Math.sin(theta)*sweepScale,
    exposure,
    camber:w.camber_outer_base+w.camber_outer_amplitude*Math.cos(theta),
  };
}

export function wingPose(state){
  const inner=sidePose('inner',state);
  const outer=sidePose('outer',state);
  return {
    leftInner:{...inner},
    rightInner:{...inner},
    leftOuter:{...outer},
    rightOuter:{...outer},
  };
}
