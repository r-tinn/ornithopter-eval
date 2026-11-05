import {E} from './environment/engineering.mjs';

/*
 * A compact description of the fixed crank/linkage.  It is deliberately a
 * pure function: the mass model, strip aerodynamics and renderer all call this
 * same function.
 */
export function wingPose(s){
  const w=E.wing;
  if(s.gliding){
    const inner={stroke:w.dihedral_rad,twist:w.incidence_rad,sweep:0,exposure:1,camber:w.camber_inner_base};
    const outer={stroke:0,twist:w.incidence_rad,sweep:0,exposure:1,camber:w.camber_outer_base};
    return {leftInner:{...inner},rightInner:{...inner},leftOuter:{...outer},rightOuter:{...outer}};
  }
  const phi=s.phase, b=Number.isFinite(s.timing_bias)?s.timing_bias:w.timing_bias_low_speed;
  const theta=phi-b*Math.sin(phi), sn=Math.sin(theta), cs=Math.cos(theta);
  const sweepScale=Number.isFinite(s.sweep_scale)?s.sweep_scale:1;
  const exposure=1-(1-w.recovery_exposure)*(.5-.5*Math.tanh(4*cs)/Math.tanh(4));
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
  return {leftInner:{...inner},rightInner:{...inner},leftOuter:{...outer},rightOuter:{...outer}};
}
