import {E} from './environment/engineering.mjs';

// One linkage law is shared by the geometry, mass bookkeeping and airflow model.
// The timing bias is a fixed cam/link setting, rather than a flight controller.
export function wingPose(s){
  const names=['leftInner','rightInner','leftOuter','rightOuter'];
  if(s.gliding){
    const out={};
    for(const name of names){
      const inner=name.endsWith('Inner');
      out[name]={stroke:inner?E.wing.dihedral_rad:0,
        twist:E.wing.incidence_rad,sweep:0,exposure:1,
        camber:inner?E.wing.camber_inner_base:E.wing.camber_outer_base};
    }
    return out;
  }
  const phi=s.phase;
  const b=Number.isFinite(s.timing_bias)?s.timing_bias:E.wing.timing_bias_low_speed;
  const theta=phi-b*Math.sin(phi),sn=Math.sin(theta),cs=Math.cos(theta);
  const scale=Number.isFinite(s.sweep_scale)?s.sweep_scale:1;
  const exposure=1-(1-E.wing.recovery_exposure)*
    (.5-.5*Math.tanh(4*cs)/Math.tanh(4));
  const inner={stroke:E.wing.dihedral_rad-E.wing.inner_amplitude_rad*sn,
    twist:E.wing.incidence_rad-E.wing.inner_twist_amplitude_rad*cs,
    sweep:-.5*E.wing.sweep_amplitude_m*sn*scale,exposure:1,
    camber:E.wing.camber_inner_base+E.wing.camber_inner_amplitude*cs};
  const outer={stroke:-E.wing.outer_amplitude_rad*sn,
    twist:E.wing.incidence_rad-E.wing.outer_twist_amplitude_rad*cs,
    sweep:-E.wing.sweep_amplitude_m*sn*scale,exposure,
    camber:E.wing.camber_outer_base+E.wing.camber_outer_amplitude*cs};
  return {
    leftInner:{...inner},rightInner:{...inner},
    leftOuter:{...outer},rightOuter:{...outer}
  };
}
