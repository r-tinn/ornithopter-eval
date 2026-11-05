import {E} from './environment/engineering.mjs';
import {wingPose as productionWingPose} from './kinematics.mjs';
import {mechanics,centre,bodyToWorld,worldToBody,add,sub,mul,dot,cross,unit} from './environment/source-mechanism.mjs';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const norm=v=>Math.hypot(v[0],v[1],v[2]);
const bodyAreaM2=Object.values(E.aero.body_flat_plate_areas_m2).reduce((s,x)=>s+x,0);
const aspect_ratio=8.29;
const wrist_span_fraction=0.5;
const wing_area_m2=E.span_m*E.span_m/aspect_ratio;

export const parameters={
  aspect_ratio,
  wrist_span_fraction,
  span_m:E.span_m,
  wing_area_m2,
  body_length_m:E.body_length_m,
  pilot_mass_kg:E.pilot_mass_kg,
  dry_mass_kg:E.dry_mass_including_pilot_kg,
  mass_kg:E.dry_mass_including_pilot_kg+E.fuel.initial_kg,
  mass_budget:E.mass_budget,
  wheel_radius_m:E.wheel_radius_m,
  gear_centres:E.gear_centres_m,
};

function interpolate(xs,ys,x){
  if(x<=xs[0])return ys[0];
  const last=xs.length-1;
  if(x>=xs[last])return ys[last];
  for(let i=0;i<last;i++){
    if(x<=xs[i+1]){
      const t=(x-xs[i])/(xs[i+1]-xs[i]);
      return ys[i]*(1-t)+ys[i+1]*t;
    }
  }
  return ys[last];
}

function poseFunction(poseOverride){
  if(!poseOverride)return productionWingPose;
  return typeof poseOverride==='function'?poseOverride:()=>poseOverride;
}

function envValue(environment,key,fallback){
  return environment&&environment[key]!==undefined?environment[key]:fallback;
}

function motorModel(state,controls,environment){
  const enabled=(environment?.motor_enabled ?? true)&&!state.gliding&&state.fuel_kg>0&&controls.throttle>0&&state.omega>=0;
  if(!enabled){
    return {shaftTorque:0,driveTorque:0,shaftPower:0,transmissionLossW:0};
  }
  const target=2*Math.PI*E.engine.maximum_wingbeat_hz*controls.throttle;
  const maxTorque=Math.min(E.engine.starting_torque_Nm,E.engine.continuous_shaft_limit_W*controls.throttle/Math.max(0.5,Math.abs(state.omega)));
  const shaftTorque=clamp(E.engine.governor_torque_gain_Nm_s*(target-state.omega),0,maxTorque);
  const driveTorque=shaftTorque*E.engine.transmission_efficiency;
  const shaftPower=shaftTorque*state.omega;
  return {
    shaftTorque,
    driveTorque,
    shaftPower,
    transmissionLossW:Math.max(0,shaftPower-driveTorque*state.omega),
  };
}

export function polar(region,alpha,camber){
  const section=E.sections[region];
  const baseCL=interpolate(E.sections.alpha_rad,section.cl_base,alpha);
  const baseCD=interpolate(E.sections.alpha_rad,section.cd_base,alpha);
  const CL=baseCL+section.camber_lift_gain*(camber-section.camber_reference)*Math.cos(alpha);
  const CD=baseCD+CL*CL/(Math.PI*E.aero.span_efficiency*parameters.aspect_ratio);
  return {CL,CD};
}

function aerodynamicModel(state,controls,environment,mech){
  const rho=envValue(environment,'rho',E.rho_kg_m3);
  const mass=mech.mass;
  const wind=environment?.wind ?? [0,0,0];
  const airspeedBody=worldToBody(sub(wind,state.velocity),state);
  let wingForceBody=[0,0,0];
  let aeroForceBody=[0,0,0];
  let Qphi=0;
  let Qpitch=0;
  let dissipationW=0;

  for(const sample of mech.samples){
    if(!(sample.area>0))continue;
    let u=add(airspeedBody,sample.velocity);
    u=sub(u,mul(sample.span,dot(u,sample.span)));
    const speed=norm(u);
    if(speed<1e-9)continue;
    const d=mul(u,1/speed);
    const alpha=Math.atan2(-dot(d,sample.normal),dot(d,sample.chord));
    const {CL,CD}=polar(sample.region,alpha,sample.camber);
    const liftDir=unit(cross(sample.span,d));
    const q=0.5*rho*speed*speed*sample.area;
    const dragForce=mul(d,-CD*q);
    const liftForce=mul(liftDir,CL*q);
    const F=add(liftForce,dragForce);
    wingForceBody=add(wingForceBody,F);
    aeroForceBody=add(aeroForceBody,F);
    Qphi+=dot(F,sample.jphi);
    Qpitch+=dot(F,sample.jtheta);
    dissipationW+=CD*q*speed;
  }

  const r0=mul(mech.cg,-1);
  const jphi0=mul(mech.dc,-1);
  const jtheta0=[-r0[1],r0[0],0];
  const bodyLocal=add(airspeedBody,add(mul(jphi0,state.omega),mul(jtheta0,state.pitch_rate)));
  const bodySpeed=norm(bodyLocal);
  let bodyDragBody=[0,0,0];
  if(bodySpeed>1e-9){
    const d=mul(bodyLocal,1/bodySpeed);
    const q=0.5*rho*bodySpeed*bodySpeed*bodyAreaM2;
    bodyDragBody=mul(d,-q);
    aeroForceBody=add(aeroForceBody,bodyDragBody);
    Qphi+=dot(bodyDragBody,jphi0);
    Qpitch+=dot(bodyDragBody,jtheta0);
    dissipationW+=q*bodySpeed;
  }

  const tailR=sub([-E.coupled.tail_arm_m,0,0],mech.cg);
  const tailJphi=mul(mech.dc,-1);
  const tailJtheta=[-tailR[1],tailR[0],0];
  const tailLocal=add(airspeedBody,add(mul(tailJphi,state.omega),mul(tailJtheta,state.pitch_rate)));
  let tailForceBody=[0,0,0];
  const tailPlanar=[tailLocal[0],tailLocal[1],0];
  const tailSpeed=norm(tailPlanar);
  if(tailSpeed>1e-9){
    const d=mul(tailPlanar,1/tailSpeed);
    const alpha=Math.atan2(-tailLocal[1],tailLocal[0]);
    const effectiveAlpha=alpha+E.coupled.tail_incidence_rad;
    const CL=E.coupled.tail_lift_slope*clamp(effectiveAlpha,-0.35,0.35);
    const CD=E.coupled.tail_drag_coefficient+0.08*alpha*alpha;
    const liftDir=unit(cross([0,0,1],d));
    const q=0.5*rho*tailSpeed*tailSpeed*E.coupled.tail_area_m2;
    tailForceBody=add(mul(liftDir,CL*q),mul(d,-CD*q));
    aeroForceBody=add(aeroForceBody,tailForceBody);
    Qphi+=dot(tailForceBody,tailJphi);
    Qpitch+=dot(tailForceBody,tailJtheta);
    dissipationW+=CD*q*tailSpeed;
  }

  const rudderFlow=[tailLocal[0],0,tailLocal[2]];
  const rudderSpeed=norm(rudderFlow);
  let rudderForceBody=[0,0,0];
  if(rudderSpeed>1e-9&&controls.rudder!==0){
    const d=mul(rudderFlow,1/rudderSpeed);
    const sideDir=unit(cross([0,1,0],d));
    const q=0.5*rho*rudderSpeed*rudderSpeed*E.coupled.tail_area_m2;
    rudderForceBody=mul(sideDir,q*E.controls.rudder_coefficient*controls.rudder);
    aeroForceBody=add(aeroForceBody,rudderForceBody);
    Qphi+=dot(rudderForceBody,tailJphi);
    Qpitch+=dot(rudderForceBody,tailJtheta);
  }

  const gravity=envValue(environment,'gravity',E.gravity_m_s2);
  const aeroForceWorld=bodyToWorld(aeroForceBody,state);
  const totalForceWorld=add(aeroForceWorld,[0,-mass*gravity,0]);

  return {
    mass,
    airspeed:norm(sub(state.velocity,wind)),
    wingForceBody,
    aeroForceBody,
    bodyDragBody,
    tailForceBody,
    rudderForceBody,
    aeroForceWorld,
    totalForceWorld,
    Qphi,
    Qpitch,
    dissipationW,
    lift:bodyToWorld(wingForceBody,state)[1],
    thrust:wingForceBody[0],
    dragMagnitude:norm(bodyDragBody),
  };
}

function flightDynamics(state,controls,environment,poseOverride){
  const poseFn=poseFunction(poseOverride);
  const dampingScale=environment?.damping_scale ?? 1;
  const pitchLocked=environment?.pitch_locked ?? false;
  const motor=motorModel(state,controls,environment);
  const phaseDampingNm=(E.coupled.phase_damping_Nm_s+E.engine.drive_friction_Nm_s)*dampingScale*state.omega;
  const pitchDampingNm=E.coupled.pitch_damping_Nm_s*dampingScale*state.pitch_rate;
  const controlTorqueNm=E.coupled.pitch_control_torque_Nm*controls.pitch;
  const airborneMech=mechanics(parameters,state,poseFn);
  const airborneAero=aerodynamicModel(state,controls,environment,airborneMech);
  const airborneR1=motor.driveTorque+airborneAero.Qphi-airborneMech.Up-phaseDampingNm-0.5*airborneMech.Ap*state.omega*state.omega+0.5*airborneMech.Cp*state.pitch_rate*state.pitch_rate;
  const airborneR2=airborneAero.Qpitch+controlTorqueNm-pitchDampingNm-airborneMech.Bp*state.omega*state.omega-airborneMech.Cp*state.omega*state.pitch_rate;

  let phase_accel;
  let pitch_accel;
  if(pitchLocked){
    phase_accel=airborneR1/airborneMech.A;
    pitch_accel=0;
  }else{
    const det=airborneMech.A*airborneMech.C-airborneMech.B*airborneMech.B;
    phase_accel=(airborneR1*airborneMech.C-airborneR2*airborneMech.B)/det;
    pitch_accel=(airborneR2*airborneMech.A-airborneR1*airborneMech.B)/det;
  }

  const airborne={
    constrained:false,
    phase_accel,
    pitch_accel,
    force:airborneAero.totalForceWorld,
    mass:airborneMech.mass,
    mech:airborneMech,
    aero:airborneAero,
    motor,
    controlTorqueNm,
    phaseDampingNm,
    pitchDampingNm,
    shaftPower:motor.shaftPower,
    wingDissipationW:airborneAero.dissipationW,
    transmissionLossW:motor.transmissionLossW,
    controlPower:controlTorqueNm*state.pitch_rate,
    dampingHeatW:Math.max(0,phaseDampingNm*state.omega)+Math.max(0,pitchDampingNm*state.pitch_rate),
  };

  const contactY=contactHeight({...state,pitch:0,pitch_rate:0},environment);
  if(pitchLocked||state.position[1]>contactY+1e-3||state.status==='crashed')return airborne;

  const groundState={...state,pitch:0,pitch_rate:0};
  const groundMech=mechanics(parameters,groundState,poseFn);
  const groundAero=aerodynamicModel(groundState,controls,environment,groundMech);
  const groundMotor=motorModel(groundState,controls,environment);
  const groundPhaseDampingNm=(E.coupled.phase_damping_Nm_s+E.engine.drive_friction_Nm_s)*dampingScale*groundState.omega;
  const forceY=groundAero.totalForceWorld[1];
  const dcy=groundMech.dc[1];
  const ddcy=groundMech.ddc[1];
  const Ag=groundMech.A+groundMech.mass*dcy*dcy;
  const Agp=groundMech.Ap+2*groundMech.mass*dcy*ddcy;
  const groundPhaseAccel=(groundMotor.driveTorque+groundAero.Qphi-groundMech.Up-groundPhaseDampingNm-0.5*Agp*groundState.omega*groundState.omega+forceY*dcy)/Ag;
  const normalLoad=groundMech.mass*(ddcy*groundState.omega*groundState.omega+dcy*groundPhaseAccel)-forceY;
  if(!(normalLoad>=0))return airborne;

  const groundSpeed=Math.hypot(state.velocity[0],state.velocity[2]);
  let groundForce=[0,0,0];
  if(groundSpeed>1e-9){
    const friction=E.controls.rolling_friction_coefficient*normalLoad+E.controls.brake_force_N*controls.brake;
    groundForce=[-state.velocity[0]/groundSpeed*friction,0,-state.velocity[2]/groundSpeed*friction];
  }
  const yVelocity=dcy*groundState.omega;
  const yAccel=ddcy*groundState.omega*groundState.omega+dcy*groundPhaseAccel;
  const netWorld=[groundAero.totalForceWorld[0]+groundForce[0],groundMech.mass*yAccel,groundAero.totalForceWorld[2]+groundForce[2]];
  return {
    constrained:true,
    phase_accel:groundPhaseAccel,
    pitch_accel:0,
    yVelocity,
    yAccel,
    normalLoad,
    contactY,
    force:netWorld,
    groundForce,
    mass:groundMech.mass,
    mech:groundMech,
    aero:groundAero,
    motor:groundMotor,
    controlTorqueNm,
    phaseDampingNm:groundPhaseDampingNm,
    pitchDampingNm:0,
    shaftPower:groundMotor.shaftPower,
    wingDissipationW:groundAero.dissipationW,
    transmissionLossW:groundMotor.transmissionLossW,
    controlPower:0,
    dampingHeatW:Math.max(0,groundPhaseDampingNm*groundState.omega),
  };
}

function derivative(state,controls,environment,poseOverride){
  const dyn=flightDynamics(state,controls,environment,poseOverride);
  const speedBody=worldToBody(state.velocity,state);
  const beta=Math.atan2(speedBody[2],Math.max(1e-6,Math.abs(speedBody[0])));
  const speedXZ=Math.hypot(speedBody[0],speedBody[2]);
  const roll_accel=controls.bank*E.controls.roll_accel_rad_s2-E.controls.roll_damping_per_s*state.roll_rate;
  const heading_rate=0.4*beta+0.08*state.roll*speedXZ/E.span_m+0.18*controls.rudder;
  return {
    dyn,
    pos_dot:dyn.constrained?[state.velocity[0],dyn.yVelocity,state.velocity[2]]:state.velocity.slice(),
    vel_dot:mul(dyn.force,1/dyn.mass),
    phase_dot:state.omega,
    omega_dot:dyn.phase_accel,
    pitch_dot:dyn.constrained?0:state.pitch_rate,
    pitch_rate_dot:dyn.pitch_accel,
    roll_dot:state.roll_rate,
    roll_rate_dot:roll_accel,
    heading_dot:heading_rate,
  };
}

function advanceState(state,deriv,dt){
  return {
    ...state,
    position:add(state.position,mul(deriv.pos_dot,dt)),
    velocity:add(state.velocity,mul(deriv.vel_dot,dt)),
    pitch:state.pitch+deriv.pitch_dot*dt,
    roll:state.roll+deriv.roll_dot*dt,
    heading:state.heading+deriv.heading_dot*dt,
    pitch_rate:state.pitch_rate+deriv.pitch_rate_dot*dt,
    roll_rate:state.roll_rate+deriv.roll_rate_dot*dt,
    phase:state.phase+deriv.phase_dot*dt,
    omega:state.omega+deriv.omega_dot*dt,
  };
}

function clampAttitude(next){
  const pitchMin=E.controls.pitch_limits_rad[0];
  const pitchMax=E.controls.pitch_limits_rad[1];
  if(next.pitch<pitchMin){
    next.pitch=pitchMin;
    if(next.pitch_rate<0)next.pitch_rate=0;
  }else if(next.pitch>pitchMax){
    next.pitch=pitchMax;
    if(next.pitch_rate>0)next.pitch_rate=0;
  }
  next.roll=clamp(next.roll,-E.controls.bank_limit_rad,E.controls.bank_limit_rad);
  return next;
}

function fuelBurnRate(state,controls,environment,shaftPower){
  const commanded=(environment?.motor_enabled ?? true)&&!state.gliding&&controls.throttle>0&&state.fuel_kg>0;
  if(!commanded)return 0;
  return shaftPower*E.fuel.bsfc_kg_kWh/3600000+E.fuel.idle_kg_s;
}

function finalizeStep(current,next,midDyn,controls,environment){
  next=clampAttitude(next);
  next.time=current.time+midDyn.dt;
  next.shaft_work_J=(current.shaft_work_J??0)+midDyn.shaftPower*midDyn.dt;
  next.aero_work_J=(current.aero_work_J??0)+midDyn.wingDissipationW*midDyn.dt;
  next.drive_heat_J=(current.drive_heat_J??0)+(midDyn.transmissionLossW+midDyn.dampingHeatW)*midDyn.dt;
  next.control_work_J=(current.control_work_J??0)+midDyn.controlPower*midDyn.dt;
  next.fuel_kg=Math.max(0,current.fuel_kg-fuelBurnRate(current,controls,environment,midDyn.shaftPower)*midDyn.dt);

  const forwardSpeed=worldToBody(next.velocity,next)[0];
  next.wheel_angle=(current.wheel_angle??0)+forwardSpeed/parameters.wheel_radius_m*midDyn.dt;

  if(midDyn.constrained){
    const grounded={...next,pitch:0,pitch_rate:0};
    const mech=mechanics(parameters,grounded,productionWingPose);
    grounded.position=[grounded.position[0],contactHeight(grounded,environment),grounded.position[2]];
    grounded.velocity=[grounded.velocity[0],mech.dc[1]*grounded.omega,grounded.velocity[2]];
    grounded.status='grounded';
    return grounded;
  }

  const floor=contactHeight(next,environment);
  if(next.position[1]<=floor){
    const mech=mechanics(parameters,next,productionWingPose);
    const sink=next.velocity[1]-mech.dc[1]*next.omega;
    const groundSpeed=Math.hypot(next.velocity[0],next.velocity[2]);
    if(Math.abs(sink)>E.controls.safe_touchdown_sink_m_s||groundSpeed>E.controls.safe_touchdown_speed_m_s||Math.abs(next.roll)>E.controls.safe_touchdown_bank_rad){
      return {
        ...next,
        position:[next.position[0],floor,next.position[2]],
        velocity:[0,0,0],
        pitch_rate:0,
        roll_rate:0,
        status:'crashed',
      };
    }
    const grounded={...next,pitch:0,pitch_rate:0,status:'grounded'};
    const groundMech=mechanics(parameters,grounded,productionWingPose);
    grounded.position=[grounded.position[0],contactHeight(grounded,environment),grounded.position[2]];
    grounded.velocity=[grounded.velocity[0],groundMech.dc[1]*grounded.omega,grounded.velocity[2]];
    return grounded;
  }

  next.status='flying';
  return next;
}

export function forces(state,controls,environment,poseOverride){
  const dyn=flightDynamics(state,controls,environment,poseOverride);
  return {
    lift:dyn.aero.lift,
    thrust:dyn.aero.thrust,
    drag:dyn.aero.dragMagnitude,
    power:dyn.shaftPower,
    airspeed:dyn.aero.airspeed,
    aero_power_W:-dyn.aero.Qphi*state.omega,
    wing_dissipation_W:dyn.wingDissipationW,
    mass_kg:dyn.mass,
    Qphi:dyn.aero.Qphi,
    Qpitch:dyn.aero.Qpitch,
    motor_torque_Nm:dyn.motor.driveTorque,
    control_torque_Nm:dyn.controlTorqueNm,
    phase_damping_Nm:dyn.phaseDampingNm,
    pitch_damping_Nm:dyn.pitchDampingNm,
    force:dyn.force.slice(),
    wing_force_body_N:dyn.aero.wingForceBody.slice(),
  };
}

export function accelerations(state,controls,environment){
  const dyn=flightDynamics(state,controls,environment);
  return {
    phase_accel:dyn.phase_accel,
    pitch_accel:dyn.pitch_accel,
    force:dyn.force.slice(),
    Qphi:dyn.aero.Qphi,
    Qpitch:dyn.aero.Qpitch,
    mass_kg:dyn.mass,
    constrained:dyn.constrained,
    normal_load_N:dyn.normalLoad,
  };
}

export function step(state,controls,environment,dt){
  const maxDt=E.coupled.integration_dt_max;
  const steps=Math.max(1,Math.ceil(dt/maxDt));
  const h=dt/steps;
  let next={...state,position:state.position.slice(),velocity:state.velocity.slice()};
  for(let i=0;i<steps;i++){
    if(next.status==='crashed'){
      next.time+=h;
      continue;
    }
    const k1=derivative(next,controls,environment);
    const mid=advanceState(next,k1,h*0.5);
    const k2=derivative(mid,controls,environment);
    let candidate=advanceState(next,k2,h);
    candidate=finalizeStep(next,candidate,{...k2.dyn,dt:h},controls,environment);
    next=candidate;
  }
  return next;
}

export function contactHeight(state,environment){
  const surfaceHeight=environment?.surfaceHeight ?? (()=>0);
  const cg=centre(parameters,state,productionWingPose);
  let required=-Infinity;
  for(const gear of parameters.gear_centres){
    const rel=bodyToWorld(sub(gear,cg),state);
    const x=state.position[0]+rel[0];
    const z=state.position[2]+rel[2];
    const y=surfaceHeight(x,z)-rel[1]+parameters.wheel_radius_m;
    if(y>required)required=y;
  }
  return required;
}
