import {E} from './environment/engineering.mjs';
// Smooth mechanical completion of the source argument, not measured samples.
export function wingPose(s){
  const w=E.wing,phi=s.gliding?0:s.phase,b=s.timing_bias??w.timing_bias_low_speed;
  const theta=phi-b*Math.sin(phi),sn=Math.sin(theta),cs=Math.cos(theta),pose={};
  for(const side of ['left','right'])for(const region of ['Inner','Outer']){
    const outer=region==='Outer',r=outer?'outer':'inner';
    pose[side+region]=s.gliding?{
      stroke:outer?0:w.dihedral_rad,twist:w.incidence_rad,sweep:0,exposure:1,
      camber:w['camber_'+r+'_base']
    }:{
      stroke:(outer?0:w.dihedral_rad)-w[r+'_amplitude_rad']*sn,
      twist:w.incidence_rad-w[r+'_twist_amplitude_rad']*cs,
      sweep:-(outer?1:.5)*w.sweep_amplitude_m*sn*(s.sweep_scale??1),
      exposure:outer?1-(1-w.recovery_exposure)*(.5-.5*Math.tanh(4*cs)/Math.tanh(4)):1,
      camber:w['camber_'+r+'_base']+w['camber_'+r+'_amplitude']*cs
    };
  }
  return pose;
}
