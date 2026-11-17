import {E} from './environment/engineering.mjs';

function sidePose(side,state){
  const w=E.wing;
  if(state.gliding){
    return {
      Inner:{stroke:w.dihedral_rad,twist:w.incidence_rad,sweep:0,exposure:1,camber:w.camber_inner_base},
      Outer:{stroke:0,twist:w.incidence_rad,sweep:0,exposure:1,camber:w.camber_outer_base}
    };
  }
  const phi=state.phase??0;
  const b=Number.isFinite(state.timing_bias)?state.timing_bias:w.timing_bias_low_speed;
  const theta=phi-b*Math.sin(phi);
  const sweepScale=Number.isFinite(state.sweep_scale)?state.sweep_scale:1;
  const s=Math.sin(theta),c=Math.cos(theta),tanh4=Math.tanh(4);
  return {
    Inner:{
      stroke:w.dihedral_rad-w.inner_amplitude_rad*s,
      twist:w.incidence_rad-w.inner_twist_amplitude_rad*c,
      sweep:-0.5*w.sweep_amplitude_m*s*sweepScale,
      exposure:1,
      camber:w.camber_inner_base+w.camber_inner_amplitude*c
    },
    Outer:{
      stroke:-w.outer_amplitude_rad*s,
      twist:w.incidence_rad-w.outer_twist_amplitude_rad*c,
      sweep:-w.sweep_amplitude_m*s*sweepScale,
      exposure:1-(1-w.recovery_exposure)*(0.5-0.5*Math.tanh(4*c)/tanh4),
      camber:w.camber_outer_base+w.camber_outer_amplitude*c
    }
  };
}

export function wingPose(state){
  const left=sidePose(-1,state),right=sidePose(1,state);
  return {
    leftInner:left.Inner,
    leftOuter:left.Outer,
    rightInner:right.Inner,
    rightOuter:right.Outer
  };
}
