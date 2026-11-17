import {E} from './environment/engineering.mjs';

function sidePose(side,state){
  const w=E.wing;
  if(state?.gliding){
    const inner={stroke:w.dihedral_rad,twist:w.incidence_rad,sweep:0,exposure:1,camber:w.camber_inner_base};
    const outer={stroke:0,twist:w.incidence_rad,sweep:0,exposure:1,camber:w.camber_outer_base};
    return side==='left'?{leftInner:inner,leftOuter:outer}:{rightInner:inner,rightOuter:outer};
  }
  const phi=Number.isFinite(state?.phase)?state.phase:0;
  const b=Number.isFinite(state?.timing_bias)?state.timing_bias:w.timing_bias_low_speed;
  const theta=phi-b*Math.sin(phi);
  const sn=Math.sin(theta),cs=Math.cos(theta);
  const sweepScale=Number.isFinite(state?.sweep_scale)?state.sweep_scale:1;
  const denom=Math.tanh(4);
  const exposure=1-(1-w.recovery_exposure)*(.5-.5*Math.tanh(4*cs)/denom);
  const inner={
    stroke:w.dihedral_rad-w.inner_amplitude_rad*sn,
    twist:w.incidence_rad-w.inner_twist_amplitude_rad*cs,
    sweep:-.5*w.sweep_amplitude_m*sn*sweepScale,
    exposure:1,
    camber:w.camber_inner_base+w.camber_inner_amplitude*cs
  };
  const outer={
    stroke:-w.outer_amplitude_rad*sn,
    twist:w.incidence_rad-w.outer_twist_amplitude_rad*cs,
    sweep:-w.sweep_amplitude_m*sn*sweepScale,
    exposure,
    camber:w.camber_outer_base+w.camber_outer_amplitude*cs
  };
  return side==='left'?{leftInner:inner,leftOuter:outer}:{rightInner:inner,rightOuter:outer};
}

export function wingPose(state){
  return {...sidePose('left',state),...sidePose('right',state)};
}
