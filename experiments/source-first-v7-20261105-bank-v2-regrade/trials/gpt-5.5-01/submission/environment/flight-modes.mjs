import {E} from './engineering.mjs';
import {mechanics} from './source-mechanism.mjs';

// A user-operated clutch release from the stationary glide configuration.
// Keep CG position/velocity, fuel, attitude and elapsed time. Preserve pitch
// angular momentum; any reduction in represented mechanical energy becomes heat.
// The engine must spin the wings up from rest through the normal finite torque.
export function releaseGlideForPower(state,throttle,parameters,wingPose){
  if(!state.gliding||!(throttle>0)||!(state.fuel_kg>0)||state.status==='crashed')return state;
  const before=mechanics(parameters,state,wingPose);
  const next={...state,gliding:false,phase:E.wing.parked_phase_rad,omega:0};
  const after=mechanics(parameters,next,wingPose);
  const angularMomentum=before.C*state.pitch_rate;
  next.pitch_rate=angularMomentum/after.C;
  const oldEnergy=.5*before.C*state.pitch_rate**2+before.U;
  const newEnergy=.5*after.C*next.pitch_rate**2+after.U;
  const heat=oldEnergy-newEnergy;
  if(!Number.isFinite(heat)||heat < -1e-7)throw Error('Glide release would create mechanical energy');
  next.drive_heat_J=(state.drive_heat_J??0)+Math.max(0,heat);
  next.mode_transition={kind:'pilot-requested glide clutch release',time:state.time,
    pitch_momentum_before:angularMomentum,pitch_momentum_after:after.C*next.pitch_rate,
    mechanical_energy_before_J:oldEnergy,mechanical_energy_after_J:newEnergy,
    heat_J:Math.max(0,heat)};
  return next;
}
