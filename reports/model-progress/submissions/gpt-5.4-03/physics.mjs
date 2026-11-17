import {E} from './environment/engineering.mjs';
import {wingPose} from './kinematics.mjs';
import {mechanics,bodyToWorld,worldToBody,add,sub,mul,dot,cross,unit,centre} from './environment/source-mechanism.mjs';

const ZERO=[0,0,0];
const ASPECT_RATIO=8.29;
const WRIST_SPAN_FRACTION=0.5;
const WING_AREA_M2=E.span_m*E.span_m/ASPECT_RATIO;

export const parameters={
  aspect_ratio:ASPECT_RATIO,
  wrist_span_fraction:WRIST_SPAN_FRACTION,
  span_m:E.span_m,
  wing_area_m2:WING_AREA_M2,
  body_length_m:E.body_length_m,
  pilot_mass_kg:E.pilot_mass_kg,
  dry_mass_kg:E.dry_mass_including_pilot_kg,
  mass_kg:E.dry_mass_including_pilot_kg+E.fuel.initial_kg,
  mass_budget:E.mass_budget,
  wheel_radius_m:E.wheel_radius_m,
  gear_centres:E.gear_centres_m
};

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const mix=(a,b,t)=>a+(b-a)*t;
const norm=v=>Math.hypot(...v);
const yawRateScale=Math.max(12,parameters.span_m*2.2);

function envValue(environment,key,fallback){
  const value=environment?.[key];
  return Number.isFinite(value)?value:fallback;
}

function envVector(environment,key){
  const value=environment?.[key];
  return Array.isArray(value)&&value.length===3?value:ZERO;
}

function totalBodyArea(){
  const areas=E.aero.body_flat_plate_areas_m2;
  return areas.pilot_and_cockpit+areas.fuselage_tail+areas.gear+areas.bracing_installation;
}

function poseFunction(override){
  if(!override)return wingPose;
  return typeof override==='function'?override:()=>override;
}

function interpolateTable(x,xs,ys){
  if(x<=xs[0])return ys[0];
  if(x>=xs[xs.length-1])return ys[ys.length-1];
  for(let i=0;i<xs.length-1;i++){
    if(x<=xs[i+1]){
      const t=(x-xs[i])/(xs[i+1]-xs[i]);
      return mix(ys[i],ys[i+1],t);
    }
  }
  return ys[ys.length-1];
}

export function polar(region,alpha,camber){
  const section=E.sections[region];
  const a=clamp(alpha,E.sections.alpha_rad[0],E.sections.alpha_rad[E.sections.alpha_rad.length-1]);
  const baseCL=interpolateTable(a,E.sections.alpha_rad,section.cl_base);
  const CL=baseCL+section.camber_lift_gain*(camber-section.camber_reference)*Math.cos(alpha);
  const baseCD=interpolateTable(a,E.sections.alpha_rad,section.cd_base);
  const CD=baseCD+CL*CL/(Math.PI*E.aero.span_efficiency*parameters.aspect_ratio);
  return {CL,CD};
}

function motorModel(state,controls,environment){
  const throttle=clamp(controls?.throttle??0,0,1);
  const enabled=(environment?.motor_enabled??true)!==false;
  if(!(enabled&&throttle>0&&state.fuel_kg>0&&state.omega>=0&&!state.gliding)){
    return {shaftTorque:0,driveTorque:0,shaftPower:0,fuelRate:0,transmissionLoss:0};
  }
  const target=2*Math.PI*E.engine.maximum_wingbeat_hz*throttle;
  const cap=Math.min(E.engine.starting_torque_Nm,E.engine.continuous_shaft_limit_W*throttle/Math.max(.5,Math.abs(state.omega)));
  const shaftTorque=clamp(E.engine.governor_torque_gain_Nm_s*(target-state.omega),0,cap);
  const shaftPower=shaftTorque*state.omega;
  const driveTorque=shaftTorque*E.engine.transmission_efficiency;
  const fuelRate=Math.max(0,shaftPower*E.fuel.bsfc_kg_kWh/3600000+E.fuel.idle_kg_s);
  return {
    shaftTorque,
    driveTorque,
    shaftPower,
    fuelRate,
    transmissionLoss:Math.max(0,shaftPower-driveTorque*state.omega)
  };
}

function aerodynamicLoads(state,controls,environment,override){
  const rho=envValue(environment,'rho',E.rho_kg_m3);
  const gravity=envValue(environment,'gravity',E.gravity_m_s2);
  const mech=mechanics(parameters,state,poseFunction(override));
  const mass=mech.mass;
  const wind=envVector(environment,'wind');
  const aircraftAir=worldToBody(sub(state.velocity,wind),state);

  let wingForceBody=[0,0,0];
  let totalBodyForce=[0,0,0];
  let Qphi=0;
  let Qpitch=0;
  let wingDissipation=0;
  let bodyDragMagnitude=0;
  let tailDragMagnitude=0;

  for(const sample of mech.samples){
    if(!(sample.area>0))continue;
    const u=add(aircraftAir,sample.velocity);
    const up=sub(u,mul(sample.span,dot(u,sample.span)));
    const speed=norm(up);
    if(!(speed>1e-9))continue;
    const d=mul(up,1/speed);
    const alpha=Math.atan2(-dot(d,sample.normal),dot(d,sample.chord));
    const coeff=polar(sample.region,alpha,sample.camber);
    const liftDir=unit(cross(sample.span,d));
    const q=.5*rho*speed*speed*sample.area;
    const F=add(mul(liftDir,q*coeff.CL),mul(d,-q*coeff.CD));
    wingForceBody=add(wingForceBody,F);
    totalBodyForce=add(totalBodyForce,F);
    Qphi+=dot(F,sample.jphi);
    Qpitch+=dot(F,sample.jtheta);
    wingDissipation+=q*coeff.CD*speed;
  }

  const r0=mul(mech.cg,-1);
  const jphi0=mul(mech.dc,-1);
  const jtheta0=[-r0[1],r0[0],0];
  const v0=add(add(aircraftAir,mul(jphi0,state.omega)),mul(jtheta0,state.pitch_rate));
  const speed0=norm(v0);
  if(speed0>1e-9){
    const d0=mul(v0,1/speed0);
    bodyDragMagnitude=.5*rho*speed0*speed0*totalBodyArea();
    const F0=mul(d0,-bodyDragMagnitude);
    totalBodyForce=add(totalBodyForce,F0);
    Qphi+=dot(F0,jphi0);
    Qpitch+=dot(F0,jtheta0);
    wingDissipation+=bodyDragMagnitude*speed0;
  }

  const rTail=sub([-E.coupled.tail_arm_m,0,0],mech.cg);
  const jphiTail=mul(mech.dc,-1);
  const jthetaTail=[-rTail[1],rTail[0],0];
  const vTail=add(add(aircraftAir,mul(jphiTail,state.omega)),mul(jthetaTail,state.pitch_rate));
  const vTailXY=[vTail[0],vTail[1],0];
  const tailSpeed=norm(vTailXY);
  if(tailSpeed>1e-9){
    const d=mul(vTailXY,1/tailSpeed);
    const alpha=Math.atan2(-vTailXY[1],vTailXY[0]);
    const CL=E.coupled.tail_lift_slope*clamp(alpha+E.coupled.tail_incidence_rad,-.35,.35);
    const CD=E.coupled.tail_drag_coefficient+.08*alpha*alpha;
    const q=.5*rho*tailSpeed*tailSpeed*E.coupled.tail_area_m2;
    const liftDir=unit(cross([0,0,1],d));
    const Ft=add(mul(liftDir,q*CL),mul(d,-q*CD));
    totalBodyForce=add(totalBodyForce,Ft);
    Qphi+=dot(Ft,jphiTail);
    Qpitch+=dot(Ft,jthetaTail);
    tailDragMagnitude=q*CD;
    wingDissipation+=tailDragMagnitude*tailSpeed;
  }

  const vRudderXZ=[vTail[0],0,vTail[2]];
  const rudderSpeed=norm(vRudderXZ);
  if(rudderSpeed>1e-9&&Math.abs(controls?.rudder??0)>1e-9){
    const d=mul(vRudderXZ,1/rudderSpeed);
    const side=unit(cross([0,1,0],d));
    const q=.5*rho*rudderSpeed*rudderSpeed*E.coupled.tail_area_m2;
    const Fr=mul(side,q*E.controls.rudder_coefficient*clamp(controls.rudder,-1,1));
    totalBodyForce=add(totalBodyForce,Fr);
    Qphi+=dot(Fr,jphiTail);
    Qpitch+=dot(Fr,jthetaTail);
  }

  const totalWorldForce=add(bodyToWorld(totalBodyForce,state),[0,-mass*gravity,0]);
  const motor=motorModel(state,controls,environment);
  const dampingScale=envValue(environment,'damping_scale',1);
  const phaseDamping=(E.coupled.phase_damping_Nm_s+E.engine.drive_friction_Nm_s)*dampingScale*state.omega;
  const pitchDamping=E.coupled.pitch_damping_Nm_s*dampingScale*state.pitch_rate;
  const controlTorque=E.coupled.pitch_control_torque_Nm*clamp(controls?.pitch??0,-1,1);

  return {
    rho,
    gravity,
    mech,
    mass,
    aircraftAir,
    wingForceBody,
    totalBodyForce,
    totalWorldForce,
    Qphi,
    Qpitch,
    wingDissipation,
    bodyDragMagnitude,
    tailDragMagnitude,
    motor,
    phaseDamping,
    pitchDamping,
    controlTorque
  };
}

function solveAirborne(state,controls,environment,override){
  const model=aerodynamicLoads(state,controls,environment,override);
  const {mech,motor,phaseDamping,pitchDamping,controlTorque,Qphi,Qpitch}=model;
  const R1=motor.driveTorque+Qphi-mech.Up-phaseDamping-.5*mech.Ap*state.omega*state.omega+.5*mech.Cp*state.pitch_rate*state.pitch_rate;
  if(environment?.pitch_locked){
    return {...model,phase_accel:R1/mech.A,pitch_accel:0};
  }
  const R2=Qpitch+controlTorque-pitchDamping-mech.Bp*state.omega*state.omega-mech.Cp*state.omega*state.pitch_rate;
  const det=mech.A*mech.C-mech.B*mech.B;
  const phase_accel=(R1*mech.C-R2*mech.B)/det;
  const pitch_accel=(mech.A*R2-mech.B*R1)/det;
  return {...model,phase_accel,pitch_accel};
}

function groundConstraintState(state){
  return {...state,pitch:0,pitch_rate:0};
}

function rollingForce(normalLoad,state,controls){
  const horizontal=[state.velocity[0],0,state.velocity[2]];
  const speed=norm(horizontal);
  const magnitude=Math.max(0,normalLoad)*(E.controls.rolling_friction_coefficient)+E.controls.brake_force_N*clamp(controls?.brake??0,0,1);
  if(!(magnitude>0))return ZERO;
  if(speed>1e-6)return mul(horizontal,-magnitude/speed);
  const forward=bodyToWorld([1,0,0],state);
  return mul([forward[0],0,forward[2]],-magnitude/Math.max(1e-9,Math.hypot(forward[0],forward[2])));
}

function solveGround(state,controls,environment){
  const s=groundConstraintState(state);
  const model=aerodynamicLoads(s,controls,environment);
  const {mech,motor,phaseDamping,Qphi}=model;
  const dcY=mech.dc[1];
  const ddcY=mech.ddc[1];
  const Ag=mech.A+model.mass*dcY*dcY;
  const Agp=mech.Ap+2*model.mass*dcY*ddcY;
  const phase_accel=(motor.driveTorque+Qphi-mech.Up-phaseDamping-.5*Agp*state.omega*state.omega+model.totalWorldForce[1]*dcY)/Ag;
  const normalLoad=model.mass*(ddcY*state.omega*state.omega+dcY*phase_accel)-model.totalWorldForce[1];
  if(normalLoad<0)return {constrained:false};
  const groundFriction=rollingForce(normalLoad,s,controls);
  const force=add(model.totalWorldForce,groundFriction);
  return {
    constrained:true,
    ...model,
    phase_accel,
    pitch_accel:0,
    normalLoad,
    force
  };
}

export function forces(state,controls,environment,poseOverride){
  const model=aerodynamicLoads(state,controls,environment,poseOverride);
  return {
    lift:bodyToWorld(model.wingForceBody,state)[1],
    thrust:model.wingForceBody[0],
    drag:model.bodyDragMagnitude+model.tailDragMagnitude,
    power:model.motor.shaftPower,
    airspeed:norm(model.aircraftAir),
    aero_power_W:-model.Qphi*state.omega,
    wing_dissipation_W:model.wingDissipation,
    mass_kg:model.mass,
    Qphi:model.Qphi,
    Qpitch:model.Qpitch,
    motor_torque_Nm:model.motor.driveTorque,
    control_torque_Nm:model.controlTorque,
    phase_damping_Nm:model.phaseDamping,
    pitch_damping_Nm:model.pitchDamping,
    force:model.totalWorldForce,
    wing_force_body_N:model.wingForceBody
  };
}

export function accelerations(state,controls,environment){
  const model=solveAirborne(state,controls,environment);
  return {
    phase_accel:model.phase_accel,
    pitch_accel:model.pitch_accel,
    force:model.totalWorldForce,
    Qphi:model.Qphi,
    Qpitch:model.Qpitch
  };
}

function contactDepthForGear(state,environment,offset,cg){
  const axle=bodyToWorld([0,0,1],state);
  const wheelReach=parameters.wheel_radius_m*Math.sqrt(Math.max(0,1-axle[1]*axle[1]));
  const worldOffset=bodyToWorld(sub(offset,cg),state);
  const x=state.position[0]+worldOffset[0];
  const z=state.position[2]+worldOffset[2];
  const surface=environment.surfaceHeight(x,z);
  return surface+wheelReach-worldOffset[1];
}

export function contactHeight(state,environment){
  const cg=centre(parameters,state,wingPose);
  let y=-Infinity;
  for(const gear of parameters.gear_centres)y=Math.max(y,contactDepthForGear(state,environment,gear,cg));
  return y;
}

function headingRate(state,controls){
  const speed=Math.hypot(state.velocity[0],state.velocity[2]);
  return speed*Math.tan(state.roll)/yawRateScale+.25*E.controls.rudder_coefficient*clamp(controls?.rudder??0,-1,1);
}

function airborneDerivative(state,controls,environment){
  const model=solveAirborne(state,controls,environment);
  const rollAccel=E.controls.roll_accel_rad_s2*clamp(controls?.bank??0,-1,1)-E.controls.roll_damping_per_s*state.roll_rate;
  const fuelRate=Math.min(state.fuel_kg,model.motor.fuelRate);
  return {
    position:[state.velocity[0],state.velocity[1],state.velocity[2]],
    velocity:mul(model.totalWorldForce,1/model.mass),
    pitch:state.pitch_rate,
    roll:state.roll_rate,
    heading:headingRate(state,controls),
    pitch_rate:model.phase_accel===Infinity?0:model.pitch_accel,
    roll_rate:rollAccel,
    phase:state.omega,
    omega:model.phase_accel,
    wheel_angle:Math.hypot(state.velocity[0],state.velocity[2])/parameters.wheel_radius_m,
    fuel_kg:-fuelRate,
    shaft_work_J:model.motor.shaftPower,
    aero_work_J:model.wingDissipation,
    drive_heat_J:model.motor.transmissionLoss+model.phaseDamping*state.omega+model.pitchDamping*state.pitch_rate,
    control_work_J:model.controlTorque*state.pitch_rate
  };
}

function groundedDerivative(state,controls,environment){
  const ground=solveGround(state,controls,environment);
  if(!ground.constrained)return null;
  const dcY=ground.mech.dc[1];
  const ddcY=ground.mech.ddc[1];
  const rollAccel=-3*state.roll-4*state.roll_rate;
  const fuelRate=Math.min(state.fuel_kg,ground.motor.fuelRate);
  return {
    position:[state.velocity[0],dcY*state.omega,state.velocity[2]],
    velocity:[ground.force[0]/ground.mass,ddcY*state.omega*state.omega+dcY*ground.phase_accel,ground.force[2]/ground.mass],
    pitch:0,
    roll:state.roll_rate,
    heading:0,
    pitch_rate:0,
    roll_rate:rollAccel,
    phase:state.omega,
    omega:ground.phase_accel,
    wheel_angle:Math.hypot(state.velocity[0],state.velocity[2])/parameters.wheel_radius_m,
    fuel_kg:-fuelRate,
    shaft_work_J:ground.motor.shaftPower,
    aero_work_J:ground.wingDissipation,
    drive_heat_J:ground.motor.transmissionLoss+ground.phaseDamping*state.omega,
    control_work_J:0
  };
}

function integrateState(state,derivative,dt){
  return {
    ...state,
    position:state.position.map((x,i)=>x+derivative.position[i]*dt),
    velocity:state.velocity.map((x,i)=>x+derivative.velocity[i]*dt),
    pitch:state.pitch+derivative.pitch*dt,
    roll:state.roll+derivative.roll*dt,
    heading:state.heading+derivative.heading*dt,
    pitch_rate:state.pitch_rate+derivative.pitch_rate*dt,
    roll_rate:state.roll_rate+derivative.roll_rate*dt,
    phase:state.phase+derivative.phase*dt,
    omega:state.omega+derivative.omega*dt,
    wheel_angle:state.wheel_angle+derivative.wheel_angle*dt,
    fuel_kg:Math.max(0,state.fuel_kg+derivative.fuel_kg*dt),
    shaft_work_J:(state.shaft_work_J??0)+derivative.shaft_work_J*dt,
    aero_work_J:(state.aero_work_J??0)+derivative.aero_work_J*dt,
    drive_heat_J:(state.drive_heat_J??0)+derivative.drive_heat_J*dt,
    control_work_J:(state.control_work_J??0)+derivative.control_work_J*dt,
    time:(state.time??0)+dt
  };
}

function clampAttitude(state){
  return {
    ...state,
    pitch:clamp(state.pitch,E.controls.pitch_limits_rad[0],E.controls.pitch_limits_rad[1]),
    roll:clamp(state.roll,-E.controls.bank_limit_rad,E.controls.bank_limit_rad)
  };
}

function rk2Airborne(state,controls,environment,dt){
  const k1=airborneDerivative(state,controls,environment);
  const mid=integrateState(state,k1,dt*.5);
  const k2=airborneDerivative(mid,controls,environment);
  return clampAttitude(integrateState(state,k2,dt));
}

function rk2Ground(state,controls,environment,dt){
  const grounded=groundConstraintState(state);
  grounded.position=[...state.position];
  grounded.velocity=[state.velocity[0],state.velocity[1],state.velocity[2]];
  grounded.position[1]=contactHeight(grounded,environment);
  const mech0=mechanics(parameters,grounded,wingPose);
  grounded.velocity[1]=mech0.dc[1]*grounded.omega;
  const k1=groundedDerivative(grounded,controls,environment);
  if(!k1)return null;
  const mid=groundConstraintState(integrateState(grounded,k1,dt*.5));
  mid.position=[mid.position[0],contactHeight(mid,environment),mid.position[2]];
  const mechMid=mechanics(parameters,mid,wingPose);
  mid.velocity=[mid.velocity[0],mechMid.dc[1]*mid.omega,mid.velocity[2]];
  const k2=groundedDerivative(mid,controls,environment);
  if(!k2)return null;
  let next=groundConstraintState(integrateState(grounded,k2,dt));
  next=clampAttitude(next);
  next.pitch=0;
  next.pitch_rate=0;
  next.roll*=0.9;
  next.roll_rate*=0.8;
  next.position=[next.position[0],contactHeight(next,environment),next.position[2]];
  const mechNext=mechanics(parameters,next,wingPose);
  next.velocity=[next.velocity[0],mechNext.dc[1]*next.omega,next.velocity[2]];
  next.status='grounded';
  return next;
}

function touchdownOutcome(previous,next,environment){
  const contact=contactHeight(next,environment);
  if(next.position[1]>contact)return next;
  const mech=mechanics(parameters,next,wingPose);
  const sink=next.velocity[1]-mech.dc[1]*next.omega;
  const speed=norm(next.velocity);
  if(-sink>E.controls.safe_touchdown_sink_m_s||speed>E.controls.safe_touchdown_speed_m_s||Math.abs(next.roll)>E.controls.safe_touchdown_bank_rad){
    return {...next,status:'crashed',position:[next.position[0],contact,next.position[2]],velocity:[0,0,0],omega:0,pitch_rate:0,roll_rate:0};
  }
  const grounded=groundConstraintState(next);
  grounded.position=[next.position[0],contactHeight(grounded,environment),next.position[2]];
  const mechGround=mechanics(parameters,grounded,wingPose);
  grounded.velocity=[next.velocity[0],mechGround.dc[1]*grounded.omega,next.velocity[2]];
  grounded.status='grounded';
  return grounded;
}

export function step(state,controls,environment,dt){
  const env={
    wind:envVector(environment,'wind'),
    rho:envValue(environment,'rho',E.rho_kg_m3),
    gravity:envValue(environment,'gravity',E.gravity_m_s2),
    motor_enabled:environment?.motor_enabled,
    pitch_locked:environment?.pitch_locked,
    damping_scale:envValue(environment,'damping_scale',1),
    surfaceHeight:environment.surfaceHeight
  };
  if(state.status==='crashed')return {...state,time:(state.time??0)+dt};

  const subdt=Math.min(E.coupled.integration_dt_max,dt);
  const steps=Math.max(1,Math.ceil(dt/subdt));
  const h=dt/steps;
  let current={...state,position:[...state.position],velocity:[...state.velocity]};

  for(let i=0;i<steps;i++){
    const onGround=current.status==='grounded'||current.position[1]<=contactHeight(groundConstraintState(current),env)+1e-4;
    const groundedNext=onGround?rk2Ground(current,controls,env,h):null;
    if(groundedNext){
      const release=solveGround(groundedNext,controls,env);
      current=release.constrained===false?touchdownOutcome(current,rk2Airborne(groundedNext,controls,env,h),env):groundedNext;
    }else{
      current=touchdownOutcome(current,rk2Airborne(current,controls,env,h),env);
      if(current.status!=='crashed'&&current.position[1]>contactHeight(current,env)+.02)current.status='flying';
    }
    if(current.status==='grounded'&&current.position[1]>contactHeight(current,env)+.02)current.status='flying';
    if(current.fuel_kg<=0)current.fuel_kg=0;
  }
  return current;
}
