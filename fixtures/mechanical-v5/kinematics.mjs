// Withheld handwritten integration fixture; never supplied to an evaluated model.
import {E} from './environment/engineering.mjs';
export function wingPose(state){
  const w=E.wing,phase=state.phase,omega=state.omega;
  const pose={};
  for(const side of ['left','right']){
    pose[side+'Inner']={stroke:w.dihedral_rad+w.inner_amplitude_rad*Math.sin(phase),
      rate:w.inner_amplitude_rad*omega*Math.cos(phase),
      twist:w.incidence_rad+w.inner_twist_amplitude_rad*Math.cos(phase),
      twistRate:-w.inner_twist_amplitude_rad*omega*Math.sin(phase)};
    const p=phase-w.outer_phase_lag_rad;
    pose[side+'Outer']={stroke:w.outer_amplitude_rad*Math.sin(p),
      rate:w.outer_amplitude_rad*omega*Math.cos(p),
      twist:w.incidence_rad+w.outer_twist_amplitude_rad*Math.cos(p),
      twistRate:-w.outer_twist_amplitude_rad*omega*Math.sin(p)};
  }
  return pose;
}
