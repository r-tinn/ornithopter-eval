import {E} from './environment/engineering.mjs';

function basePose(){
  return {
    stroke: E.wing.dihedral_rad,
    twist: E.wing.incidence_rad,
    sweep: 0,
    exposure: 1,
    camber: E.wing.camber_inner_base
  };
}

export function wingPose(state){
  const sweepScale=state?.sweep_scale??1;
  if(state?.gliding){
    const inner=basePose();
    const outer={
      stroke: 0,
      twist: E.wing.incidence_rad,
      sweep: 0,
      exposure: 1,
      camber: E.wing.camber_outer_base
    };
    return {
      leftInner:{...inner},
      rightInner:{...inner},
      leftOuter:{...outer},
      rightOuter:{...outer}
    };
  }

  const phi=state?.phase??0;
  const b=state?.timing_bias??E.wing.timing_bias_low_speed;
  const theta=phi-b*Math.sin(phi);
  const s=Math.sin(theta);
  const c=Math.cos(theta);
  const exposure=1-(1-E.wing.recovery_exposure)*(.5-.5*Math.tanh(4*c)/Math.tanh(4));

  const inner={
    stroke: E.wing.dihedral_rad-E.wing.inner_amplitude_rad*s,
    twist: E.wing.incidence_rad-E.wing.inner_twist_amplitude_rad*c,
    sweep: -.5*E.wing.sweep_amplitude_m*s*sweepScale,
    exposure: 1,
    camber: E.wing.camber_inner_base+E.wing.camber_inner_amplitude*c
  };
  const outer={
    stroke: -E.wing.outer_amplitude_rad*s,
    twist: E.wing.incidence_rad-E.wing.outer_twist_amplitude_rad*c,
    sweep: -E.wing.sweep_amplitude_m*s*sweepScale,
    exposure,
    camber: E.wing.camber_outer_base+E.wing.camber_outer_amplitude*c
  };

  return {
    leftInner:{...inner},
    rightInner:{...inner},
    leftOuter:{...outer},
    rightOuter:{...outer}
  };
}
