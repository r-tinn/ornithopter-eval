import {E} from './environment/engineering.mjs';
import {wingPose} from './kinematics.mjs';
import {add,sub,mul,dot,cross,unit,mechanics,bodyToWorld,worldToBody} from './environment/source-mechanism.mjs';

const ASPECT_RATIO=8.29;
const WRIST_SPAN_FRACTION=0.5;
const WING_AREA_M2=E.span_m*E.span_m/ASPECT_RATIO;
const BODY_AREA_TOTAL=Object.values(E.aero.body_flat_plate_areas_m2).reduce((a,b)=>a+b,0);

export const parameters={
  ...E,
  aspect_ratio:ASPECT_RATIO,
  wrist_span_fraction:WRIST_SPAN_FRACTION,
  wing_area_m2:WING_AREA_M2,
  dry_mass_kg:E.dry_mass_including_pilot_kg,
  mass_kg:E.dry_mass_including_pilot_kg+E.fuel.initial_kg,
  gear_centres:E.gear_centres_m,
  wheel_radius_m:E.wheel_radius_m,
};

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const norm=v=>Math.hypot(...v);
const ZERO3=[0,0,0];

function poseFunction(poseOverride){
  if(!poseOverride)return wingPose;
  return typeof poseOverride==='function'?poseOverride:()=>poseOverride;
}

function airDensity(environment){return environment?.rho??E.rho_kg_m3;}
function gravity(environment){return environment?.gravity??E.gravity_m_s2;}
function dampingScale(environment){return environment?.damping_scale??1;}
function wind(environment){return environment?.wind??ZERO3;}

function interpolate(xs,ys,x){
  if(x<=xs[0])return ys[0];
  const last=xs.length-1;
  if(x>=xs[last])return ys[last];
  for(let i=0;i<last;i++)if(x<=xs[i+1]){
    const t=(x-xs[i])/(xs[i+1]-xs[i]);
    return ys[i]+(ys[i+1]-ys[i])*t;
  }
  return ys[last];
}

function shaftTorque(state,controls,environment){
  const throttle=clamp(controls?.throttle??0,0,1);
  if(!(state.fuel_kg>0)||!(throttle>0)||state.omega<0||environment?.motor_enabled===false||state.gliding)return 0;
  const target=2*Math.PI*E.engine.maximum_wingbeat_hz*throttle;
  const raw=E.engine.governor_torque_gain_Nm_s*(target-state.omega);
  const cap=Math.min(E.engine.starting_torque_Nm,E.engine.continuous_shaft_limit_W*throttle/Math.max(.5,Math.abs(state.omega)));
  return clamp(raw,0,cap);
}

function dampingTorques(state,controls,environment){
  const scale=dampingScale(environment);
  return {
    phase:scale*E.coupled.phase_damping_Nm_s*state.omega,
    pitch:scale*E.coupled.pitch_damping_Nm_s*state.pitch_rate,
    control:E.coupled.pitch_control_torque_Nm*clamp(controls?.pitch??0,-1,1),
  };
}

export function polar(region,alpha,camber){
  const table=E.sections[region];
  const clBase=interpolate(E.sections.alpha_rad,table.cl_base,alpha);
  const cdBase=interpolate(E.sections.alpha_rad,table.cd_base,alpha);
  const CL=clBase+table.camber_lift_gain*(camber-table.camber_reference)*Math.cos(alpha);
  const CD=cdBase+CL*CL/(Math.PI*E.aero.span_efficiency*parameters.aspect_ratio);
  return {CL,CD};
}

function localVelocity(relAir,jphi,jtheta,state){
  return add(relAir,add(mul(jphi,state.omega),mul(jtheta,state.pitch_rate)));
}

function evaluateAerodynamics(state,controls,environment,poseOverride){
  const poseFn=poseFunction(poseOverride);
  const mech=mechanics(parameters,state,poseFn);
  const rho=airDensity(environment);
  const relAir=worldToBody(sub(wind(environment),state.velocity),state);

  let wingForceBody=[0,0,0];
  let totalBodyForce=[0,0,0];
  let Qphi=0;
  let Qpitch=0;
  let wingDissipation=0;

  for(const sample of mech.samples){
    if(!(sample.area>0))continue;
    let u=add(relAir,sample.velocity);
    u=sub(u,mul(sample.span,dot(u,sample.span)));
    const speed=norm(u);
    if(!(speed>1e-9))continue;
    const d=mul(u,1/speed);
    const alpha=Math.atan2(-dot(d,sample.normal),dot(d,sample.chord));
    const {CL,CD}=polar(sample.region,alpha,sample.camber);
    const q=.5*rho*speed*speed*sample.area;
    const drag=q*CD;
    const force=add(mul(unit(cross(sample.span,d)),q*CL),mul(d,-drag));
    wingForceBody=add(wingForceBody,force);
    totalBodyForce=add(totalBodyForce,force);
    Qphi+=dot(force,sample.jphi);
    Qpitch+=dot(force,sample.jtheta);
    wingDissipation+=drag*speed;
  }

  const r0=mul(mech.cg,-1);
  const j0=mul(mech.dc,-1);
  const jtheta0=[-r0[1],r0[0],0];
  let bodyDragMagnitude=0;
  let aeroDissipation=wingDissipation;
  {
    const u=localVelocity(relAir,j0,jtheta0,state);
    const speed=norm(u);
    if(speed>1e-9&&rho>0&&BODY_AREA_TOTAL>0){
      const d=mul(u,1/speed);
      bodyDragMagnitude=.5*rho*speed*speed*BODY_AREA_TOTAL;
      const force=mul(d,-bodyDragMagnitude);
      totalBodyForce=add(totalBodyForce,force);
      Qphi+=dot(force,j0);
      Qpitch+=dot(force,jtheta0);
      aeroDissipation+=bodyDragMagnitude*speed;
    }
  }

  const tailPoint=sub([-E.coupled.tail_arm_m,0,0],mech.cg);
  const jphiTail=mul(mech.dc,-1);
  const jthetaTail=[-tailPoint[1],tailPoint[0],0];
  {
    const u0=localVelocity(relAir,jphiTail,jthetaTail,state);
    const u=[u0[0],u0[1],0];
    const speed=norm(u);
    if(speed>1e-9&&rho>0){
      const d=mul(u,1/speed);
      const alpha=Math.atan2(-d[1],d[0]);
      const alphaEff=alpha+E.coupled.tail_incidence_rad;
      const CL=E.coupled.tail_lift_slope*clamp(alphaEff,-.35,.35);
      const CD=E.coupled.tail_drag_coefficient+.08*alphaEff*alphaEff;
      const q=.5*rho*speed*speed*E.coupled.tail_area_m2;
      const drag=q*CD;
      const force=add(mul(unit(cross([0,0,1],d)),q*CL),mul(d,-drag));
      totalBodyForce=add(totalBodyForce,force);
      Qphi+=dot(force,jphiTail);
      Qpitch+=dot(force,jthetaTail);
      aeroDissipation+=drag*speed;
    }
  }
  {
    const u0=localVelocity(relAir,jphiTail,jthetaTail,state);
    const u=[u0[0],0,u0[2]];
    const speed=norm(u);
    const rudder=clamp(controls?.rudder??0,-1,1);
    if(speed>1e-9&&rho>0&&rudder!==0){
      const d=mul(u,1/speed);
      const side=unit(cross([0,1,0],d));
      const q=.5*rho*speed*speed*E.coupled.tail_area_m2;
      const force=mul(side,q*E.controls.rudder_coefficient*rudder);
      totalBodyForce=add(totalBodyForce,force);
      Qphi+=dot(force,jphiTail);
      Qpitch+=dot(force,jthetaTail);
    }
  }

  const mass=mech.mass;
  const totalWorldForce=add(bodyToWorld(totalBodyForce,state),[0,-mass*gravity(environment),0]);
  return {
    mech,
    mass,
    relAir,
    wingForceBody,
    totalBodyForce,
    force:totalWorldForce,
    Qphi,
    Qpitch,
    bodyDragMagnitude,
    aeroDissipation,
  };
}

function evaluateDynamics(state,controls,environment,poseOverride){
  const aero=evaluateAerodynamics(state,controls,environment,poseOverride);
  const shaftTorqueNm=shaftTorque(state,controls,environment);
  const shaftPower=shaftTorqueNm*Math.max(0,state.omega);
  const driveTorque=shaftTorqueNm*E.engine.transmission_efficiency;
  const damp=dampingTorques(state,controls,environment);
  const {mech}=aero;

  let phase_accel=0;
  let pitch_accel=0;
  const R1=driveTorque+aero.Qphi-mech.Up-damp.phase-.5*mech.Ap*state.omega*state.omega+.5*mech.Cp*state.pitch_rate*state.pitch_rate;
  const R2=aero.Qpitch+damp.control-damp.pitch-mech.Bp*state.omega*state.omega-mech.Cp*state.omega*state.pitch_rate;
  if(environment?.pitch_locked){
    phase_accel=R1/mech.A;
    pitch_accel=0;
  }else{
    const det=mech.A*mech.C-mech.B*mech.B;
    phase_accel=(R1*mech.C-R2*mech.B)/det;
    pitch_accel=(mech.A*R2-mech.B*R1)/det;
  }

  return {
    ...aero,
    phase_accel,
    pitch_accel,
    power:shaftPower,
    shaft_torque_Nm:shaftTorqueNm,
    motor_torque_Nm:driveTorque,
    control_torque_Nm:damp.control,
    phase_damping_Nm:damp.phase,
    pitch_damping_Nm:damp.pitch,
  };
}

export function forces(state,controls,environment,poseOverride){
  const out=evaluateDynamics(state,controls,environment,poseOverride);
  const wingForceWorld=bodyToWorld(out.wingForceBody,state);
  return {
    lift:wingForceWorld[1],
    thrust:out.wingForceBody[0],
    drag:out.bodyDragMagnitude,
    power:out.power,
    airspeed:norm(sub(state.velocity,wind(environment))),
    aero_power_W:-out.Qphi*state.omega,
    wing_dissipation_W:out.aeroDissipation,
    mass_kg:out.mass,
    Qphi:out.Qphi,
    Qpitch:out.Qpitch,
    motor_torque_Nm:out.motor_torque_Nm,
    control_torque_Nm:out.control_torque_Nm,
    phase_damping_Nm:out.phase_damping_Nm,
    pitch_damping_Nm:out.pitch_damping_Nm,
    force:out.force,
    wing_force_body_N:out.wingForceBody,
  };
}

export function accelerations(state,controls,environment){
  const out=evaluateDynamics(state,controls,environment);
  return {
    phase_accel:out.phase_accel,
    pitch_accel:out.pitch_accel,
    force:out.force,
    mass_kg:out.mass,
    Qphi:out.Qphi,
    Qpitch:out.Qpitch,
    motor_torque_Nm:out.motor_torque_Nm,
    control_torque_Nm:out.control_torque_Nm,
    phase_damping_Nm:out.phase_damping_Nm,
    pitch_damping_Nm:out.pitch_damping_Nm,
  };
}

function wheelContactHeight(state,environment){
  const mech=mechanics(parameters,state,wingPose);
  let y=-Infinity;
  for(const gear of parameters.gear_centres){
    const offset=bodyToWorld(sub(gear,mech.cg),state);
    const gx=state.position[0]+offset[0];
    const gz=state.position[2]+offset[2];
    y=Math.max(y,environment.surfaceHeight(gx,gz)+parameters.wheel_radius_m-offset[1]);
  }
  return y;
}

export function contactHeight(state,environment){
  return wheelContactHeight(state,environment);
}

function baseDerivative(state,controls,environment){
  const out=evaluateDynamics(state,controls,environment);
  const accel=mul(out.force,1/out.mass);
  return {
    out,
    dx:state.velocity,
    dv:accel,
    dphase:state.omega,
    domega:out.phase_accel,
    dpitch:state.pitch_rate,
    dpitch_rate:out.pitch_accel,
    droll:state.roll_rate,
    droll_rate:clamp(controls?.bank??0,-1,1)*E.controls.roll_accel_rad_s2-E.controls.roll_damping_per_s*state.roll_rate,
    dheading:clamp(controls?.rudder??0,-1,1)*E.controls.rudder_coefficient,
  };
}

function integrateMidpoint(state,controls,environment,dt){
  const k1=baseDerivative(state,controls,environment);
  const mid={
    ...state,
    position:add(state.position,mul(k1.dx,dt*.5)),
    velocity:add(state.velocity,mul(k1.dv,dt*.5)),
    phase:state.phase+k1.dphase*dt*.5,
    omega:state.omega+k1.domega*dt*.5,
    pitch:state.pitch+k1.dpitch*dt*.5,
    pitch_rate:state.pitch_rate+k1.dpitch_rate*dt*.5,
    roll:state.roll+k1.droll*dt*.5,
    roll_rate:state.roll_rate+k1.droll_rate*dt*.5,
    heading:state.heading+k1.dheading*dt*.5,
  };
  const k2=baseDerivative(mid,controls,environment);
  const next={
    ...state,
    position:add(state.position,mul(k2.dx,dt)),
    velocity:add(state.velocity,mul(k2.dv,dt)),
    phase:state.phase+k2.dphase*dt,
    omega:state.omega+k2.domega*dt,
    pitch:state.pitch+k2.dpitch*dt,
    pitch_rate:state.pitch_rate+k2.dpitch_rate*dt,
    roll:clamp(state.roll+k2.droll*dt,-E.controls.bank_limit_rad,E.controls.bank_limit_rad),
    roll_rate:state.roll_rate+k2.droll_rate*dt,
    heading:state.heading+k2.dheading*dt,
    time:state.time+dt,
  };
  const commanded=(environment?.motor_enabled!==false)&&!state.gliding&&(controls?.throttle??0)>0&&state.fuel_kg>0;
  const fuelBurn=commanded?(k2.out.power*E.fuel.bsfc_kg_kWh/3600000+E.fuel.idle_kg_s)*dt:0;
  const driveHeat=(k2.out.power-k2.out.motor_torque_Nm*Math.max(0,mid.omega)+Math.max(0,k2.out.phase_damping_Nm*mid.omega)+Math.max(0,k2.out.pitch_damping_Nm*mid.pitch_rate))*dt;
  const controlWork=Math.max(0,k2.out.control_torque_Nm*mid.pitch_rate)*dt;
  next.fuel_kg=Math.max(0,state.fuel_kg-fuelBurn);
  next.shaft_work_J=(state.shaft_work_J??0)+k2.out.power*dt;
  next.aero_work_J=(state.aero_work_J??0)+k2.out.aeroDissipation*dt;
  next.drive_heat_J=(state.drive_heat_J??0)+Math.max(0,driveHeat);
  next.control_work_J=(state.control_work_J??0)+controlWork;
  next.status='flying';
  return next;
}

function handleTouchdown(state,environment){
  const mech=mechanics(parameters,state,wingPose);
  const sink=-(state.velocity[1]-mech.dc[1]*state.omega);
  const speed=norm(state.velocity);
  if(
    sink>E.controls.safe_touchdown_sink_m_s||
    speed>E.controls.safe_touchdown_speed_m_s||
    Math.abs(state.roll)>E.controls.safe_touchdown_bank_rad
  ){
    return {
      ...state,
      position:[state.position[0],contactHeight({...state,pitch:0,roll:0},environment),state.position[2]],
      velocity:[0,0,0],
      pitch:0,
      pitch_rate:0,
      roll:0,
      roll_rate:0,
      status:'crashed',
    };
  }
  return null;
}

function groundedStep(state,controls,environment,dt){
  const current={...state,pitch:0,pitch_rate:0,roll:0,roll_rate:0};
  const eval0=evaluateDynamics(current,controls,environment);
  const dcy0=eval0.mech.dc[1];
  const ddcy0=eval0.mech.ddc[1];
  const Ag0=eval0.mech.A+eval0.mass*dcy0*dcy0;
  const Agp0=eval0.mech.Ap+2*eval0.mass*dcy0*ddcy0;
  const phaseAccel0=(eval0.motor_torque_Nm+eval0.Qphi-eval0.mech.Up-eval0.phase_damping_Nm-.5*Agp0*current.omega*current.omega+eval0.force[1]*dcy0)/Ag0;
  const normal0=eval0.mass*(ddcy0*current.omega*current.omega+dcy0*phaseAccel0)-eval0.force[1];
  if(normal0<0)return null;

  const midGuess={...current,phase:current.phase+current.omega*dt*.5,omega:current.omega+phaseAccel0*dt*.5};
  const midEval=evaluateDynamics(midGuess,controls,environment);
  const dcy=midEval.mech.dc[1];
  const ddcy=midEval.mech.ddc[1];
  const Ag=midEval.mech.A+midEval.mass*dcy*dcy;
  const Agp=midEval.mech.Ap+2*midEval.mass*dcy*ddcy;
  const phaseAccel=(midEval.motor_torque_Nm+midEval.Qphi-midEval.mech.Up-midEval.phase_damping_Nm-.5*Agp*midGuess.omega*midGuess.omega+midEval.force[1]*dcy)/Ag;
  const normal=midEval.mass*(ddcy*midGuess.omega*midGuess.omega+dcy*phaseAccel)-midEval.force[1];
  if(normal<0)return null;

  const horizV=[current.velocity[0],0,current.velocity[2]];
  const horizSpeed=norm(horizV);
  const basis=horizSpeed>1e-6?mul(horizV,1/horizSpeed):unit([Math.cos(current.heading),0,Math.sin(current.heading)]);
  const resist=(normal*E.controls.rolling_friction_coefficient+E.controls.brake_force_N*clamp(controls?.brake??0,0,1));
  const friction=mul(basis,-resist);
  const groundForce=[midEval.force[0]+friction[0],0,midEval.force[2]+friction[2]];
  const accel=mul(groundForce,1/midEval.mass);

  const next={
    ...state,
    position:[
      state.position[0]+(state.velocity[0]+accel[0]*dt*.5)*dt,
      0,
      state.position[2]+(state.velocity[2]+accel[2]*dt*.5)*dt,
    ],
    velocity:[
      state.velocity[0]+accel[0]*dt,
      0,
      state.velocity[2]+accel[2]*dt,
    ],
    phase:state.phase+midGuess.omega*dt,
    omega:state.omega+phaseAccel*dt,
    pitch:0,
    pitch_rate:0,
    roll:0,
    roll_rate:0,
    heading:state.heading,
    time:state.time+dt,
    status:'grounded',
  };
  const commanded=(environment?.motor_enabled!==false)&&!state.gliding&&(controls?.throttle??0)>0&&state.fuel_kg>0;
  const fuelBurn=commanded?(midEval.power*E.fuel.bsfc_kg_kWh/3600000+E.fuel.idle_kg_s)*dt:0;
  next.fuel_kg=Math.max(0,state.fuel_kg-fuelBurn);
  next.shaft_work_J=(state.shaft_work_J??0)+midEval.power*dt;
  next.aero_work_J=(state.aero_work_J??0)+midEval.aeroDissipation*dt;
  next.drive_heat_J=(state.drive_heat_J??0)+Math.max(0,(midEval.power-midEval.motor_torque_Nm*Math.max(0,midGuess.omega)+Math.max(0,midEval.phase_damping_Nm*midGuess.omega))*dt);
  next.control_work_J=(state.control_work_J??0);
  const touchState={...next,pitch:0,roll:0};
  next.position[1]=contactHeight(touchState,environment);
  const finalMech=mechanics(parameters,touchState,wingPose);
  next.velocity[1]=finalMech.dc[1]*next.omega;
  const distance=Math.hypot(next.position[0]-state.position[0],next.position[2]-state.position[2]);
  next.wheel_angle=(state.wheel_angle??0)+distance/parameters.wheel_radius_m;
  return next;
}

export function step(state,controls,environment,dt){
  let next={...state,position:[...state.position],velocity:[...state.velocity]};
  let remaining=dt;
  const maxDt=E.coupled.integration_dt_max;
  while(remaining>1e-12){
    const h=Math.min(remaining,maxDt);
    remaining-=h;
    const groundY=contactHeight({...next,pitch:0,roll:0},environment);
    const grounded=next.status==='grounded'||next.position[1]<=groundY+1e-5;
    if(grounded){
      const g=groundedStep(next,controls,environment,h);
      if(g){next=g;continue;}
    }
    next=integrateMidpoint(next,controls,environment,h);
    const yContact=contactHeight(next,environment);
    if(next.position[1]<=yContact){
      const crashed=handleTouchdown(next,environment);
      if(crashed){next=crashed;break;}
      next={...next,pitch:0,pitch_rate:0,roll:0,roll_rate:0,status:'grounded'};
      next.position[1]=contactHeight(next,environment);
      const mech=mechanics(parameters,next,wingPose);
      next.velocity[1]=mech.dc[1]*next.omega;
      next.wheel_angle=next.wheel_angle??state.wheel_angle??0;
    }
  }
  if(next.status!=='crashed'&&next.position[1]>contactHeight(next,environment)+1e-3)next.status='flying';
  return next;
}
