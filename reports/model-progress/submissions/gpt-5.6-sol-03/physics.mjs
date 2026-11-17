import {E} from './environment/engineering.mjs';
import {wingPose} from './kinematics.mjs';
import {
  mechanics,bodyToWorld,worldToBody,add,sub,mul,dot,cross,unit
} from './environment/source-mechanism.mjs';

const AR=7.4*7.4/6.61;
export const parameters={
  aspect_ratio:AR,wrist_span_fraction:3.7/7.4,
  span_m:E.span_m,wing_area_m2:E.span_m*E.span_m/AR,
  body_length_m:E.body_length_m,pilot_mass_kg:E.pilot_mass_kg,
  dry_mass_kg:E.dry_mass_including_pilot_kg,
  mass_kg:E.dry_mass_including_pilot_kg+E.fuel.initial_kg,
  mass_budget:E.mass_budget,wheel_radius_m:E.wheel_radius_m,
  gear_centres:E.gear_centres_m
};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const finite=x=>Number.isFinite(x)?x:0;

export function polar(region,alpha,camber){
  const xs=E.sections.alpha_rad,t=E.sections[region==='outer'?'outer':'inner'];
  alpha=finite(alpha);
  camber=Number.isFinite(camber)?camber:t.camber_reference;
  const a=clamp(alpha,xs[0],xs[xs.length-1]);
  let i=xs.length-2;
  for(let k=0;k<xs.length-1;k++)if(a<=xs[k+1]){i=k;break;}
  const f=(a-xs[i])/(xs[i+1]-xs[i]);
  const lerp=v=>v[i]+(v[i+1]-v[i])*f;
  const CL=lerp(t.cl_base)+t.camber_lift_gain*(camber-t.camber_reference)*Math.cos(alpha);
  return {CL,CD:lerp(t.cd_base)+CL*CL/(Math.PI*E.aero.span_efficiency*parameters.aspect_ratio)};
}

function motor(s,c,e){
  const throttle=clamp(finite(c.throttle),0,1);
  if(e.motor_enabled===false||s.gliding||!(s.fuel_kg>0)||!(throttle>0)||s.omega<0)
    return {shaft:0,drive:0,power:0};
  const target=2*Math.PI*E.engine.maximum_wingbeat_hz*throttle;
  const gain=E.engine.governor_torque_gain_Nm_s??E.engine.governor_gain_W_per_rad_s;
  const cap=Math.min(E.engine.starting_torque_Nm,
    E.engine.continuous_shaft_limit_W*throttle/Math.max(.5,Math.abs(s.omega)));
  const shaft=clamp(gain*(target-s.omega),0,cap);
  return {shaft,drive:shaft*E.engine.transmission_efficiency,power:shaft*s.omega};
}

function aerodynamic(s,c,e,poseOverride){
  const fixedPose=poseOverride?(typeof poseOverride==='function'?poseOverride(s):poseOverride):null;
  const poseFn=poseOverride?(()=>fixedPose):wingPose;
  const m=mechanics(parameters,s,poseFn);
  const rho=Math.max(0,Number.isFinite(e.rho)?e.rho:E.rho_kg_m3);
  const air=worldToBody(sub(s.velocity,e.wind??[0,0,0]),s);
  let wing=[0,0,0],all=[0,0,0],Qphi=0,Qpitch=0,diss=0;
  const apply=(F,r,jphi,jtheta,isWing=false)=>{
    all=add(all,F);if(isWing)wing=add(wing,F);
    Qphi+=dot(F,jphi);Qpitch+=dot(F,jtheta);
  };
  for(const x of m.samples){
    const u=add(air,x.velocity),plane=sub(u,mul(x.span,dot(u,x.span)));
    const speed=Math.hypot(...plane);
    if(speed<1e-9||rho===0||x.area<=0)continue;
    const d=mul(plane,1/speed),alpha=Math.atan2(-dot(d,x.normal),dot(d,x.chord));
    const p=polar(x.region,alpha,x.camber),q=.5*rho*speed*speed*x.area;
    const lift=mul(unit(cross(x.span,d)),q*p.CL),drag=mul(d,-q*p.CD);
    apply(add(lift,drag),x.r,x.jphi,x.jtheta,true);
    diss+=q*p.CD*speed;
  }
  // Fuselage drag acts at the moving body mass point.
  const r0=mul(m.cg,-1),j0=mul(m.dc,-1),jt0=[-r0[1],r0[0],0];
  const ub=add(air,add(mul(j0,s.omega),mul(jt0,s.pitch_rate)));
  const vb=Math.hypot(...ub),bodyArea=Object.values(E.aero.body_flat_plate_areas_m2).reduce((a,b)=>a+b,0);
  let bodyDrag=0;
  if(vb>1e-9&&rho>0){
    bodyDrag=.5*rho*vb*vb*bodyArea;
    const F=mul(ub,-bodyDrag/vb);apply(F,r0,j0,jt0);diss+=bodyDrag*vb;
  }
  // Conventional horizontal tail, attached to the translating body.
  const rt=sub([-E.coupled.tail_arm_m,0,0],m.cg),jtp=mul(m.dc,-1),jtt=[-rt[1],rt[0],0];
  const ut=add(air,add(mul(jtp,s.omega),mul(jtt,s.pitch_rate)));
  const hs=Math.hypot(ut[0],ut[1]);
  if(hs>1e-9&&rho>0){
    const d=[ut[0]/hs,ut[1]/hs,0];
    const alpha=Math.atan2(-ut[1],ut[0]);
    const CL=E.coupled.tail_lift_slope*clamp(alpha+E.coupled.tail_incidence_rad,-.35,.35);
    const CD=E.coupled.tail_drag_coefficient+.08*alpha*alpha;
    const q=.5*rho*hs*hs*E.coupled.tail_area_m2;
    const F=add(mul(unit(cross([0,0,1],d)),q*CL),mul(d,-q*CD));
    apply(F,rt,jtp,jtt);diss+=q*CD*hs;
  }
  // Rudder is a finite tail side force; it does no hidden longitudinal work.
  const vh=Math.hypot(ut[0],ut[2]);
  if(vh>1e-9&&rho>0&&c.rudder){
    const d=[ut[0]/vh,0,ut[2]/vh],side=unit(cross([0,1,0],d));
    const mag=.5*rho*vh*vh*E.coupled.tail_area_m2*E.controls.rudder_coefficient*clamp(c.rudder,-1,1);
    const F=mul(side,mag);apply(F,rt,jtp,jtt);diss+=Math.abs(dot(F,ut));
  }
  return {m,all,wing,Qphi,Qpitch,diss,bodyDrag,air};
}

export function forces(s,c,e,poseOverride){
  const a=aerodynamic(s,c,e,poseOverride),mot=motor(s,c,e);
  const dampingScale=Number.isFinite(e.damping_scale)?e.damping_scale:1;
  const phaseDamping=E.coupled.phase_damping_Nm_s*s.omega*dampingScale;
  const pitchDamping=E.coupled.pitch_damping_Nm_s*s.pitch_rate*dampingScale;
  const pilot=E.coupled.pitch_control_torque_Nm*clamp(finite(c.pitch),-1,1);
  const world=bodyToWorld(a.all,s),g=e.gravity===undefined?E.gravity_m_s2:e.gravity;
  world[1]-=a.m.mass*g;
  const wingWorld=bodyToWorld(a.wing,s);
  return {
    lift:wingWorld[1],thrust:a.wing[0],drag:a.bodyDrag,power:mot.power,
    airspeed:Math.hypot(...a.air),aero_power_W:-a.Qphi*s.omega,
    wing_dissipation_W:a.diss,mass_kg:a.m.mass,Qphi:a.Qphi,Qpitch:a.Qpitch,
    motor_torque_Nm:mot.drive,shaft_torque_Nm:mot.shaft,
    control_torque_Nm:pilot,phase_damping_Nm:phaseDamping,
    pitch_damping_Nm:pitchDamping,force:world,wing_force_body_N:a.wing,
    mechanics:a.m,drive_torque_Nm:mot.drive
  };
}

function airborneAcceleration(s,c,e,f){
  const m=f.mechanics,A=m.A,B=m.B,C=m.C;
  const R1=f.drive_torque_Nm+f.Qphi-m.Up-f.phase_damping_Nm-
    .5*m.Ap*s.omega*s.omega+.5*m.Cp*s.pitch_rate*s.pitch_rate;
  const R2=f.Qpitch+f.control_torque_Nm-f.pitch_damping_Nm-
    m.Bp*s.omega*s.omega-m.Cp*s.omega*s.pitch_rate;
  if(e.pitch_locked){
    return {phase_accel:R1/A,pitch_accel:0};
  }
  const det=Math.max(1e-9,A*C-B*B);
  return {phase_accel:(R1*C-R2*B)/det,pitch_accel:(R2*A-R1*B)/det};
}

function groundCandidate(s,e){
  const h=contactHeight(s,e);
  return s.status==='grounded'||(s.position[1]<=h+.015&&s.velocity[1]<=1);
}

export function accelerations(s,c,e){
  const f=forces(s,c,e),m=f.mechanics;
  let coupled=airborneAcceleration(s,c,e,f),grounded=false,normal_load_N=0;
  let force=f.force.slice();
  if(groundCandidate(s,e)){
    const Ag=m.A+m.mass*m.dc[1]*m.dc[1];
    const Agp=m.Ap+2*m.mass*m.dc[1]*m.ddc[1];
    const numer=f.drive_torque_Nm+f.Qphi-m.Up-f.phase_damping_Nm-
      .5*Agp*s.omega*s.omega+force[1]*m.dc[1];
    const pa=numer/Ag;
    const normal=m.mass*(m.ddc[1]*s.omega*s.omega+m.dc[1]*pa)-force[1];
    if(normal>=0){
      grounded=true;normal_load_N=normal;coupled={phase_accel:pa,pitch_accel:0};
      const horizontal=Math.hypot(s.velocity[0],s.velocity[2]);
      if(horizontal>1e-6){
        const loss=E.controls.rolling_friction_coefficient*normal+
          E.controls.brake_force_N*clamp(finite(c.brake),0,1);
        force[0]-=loss*s.velocity[0]/horizontal;
        force[2]-=loss*s.velocity[2]/horizontal;
      }
      force[1]=m.mass*(m.ddc[1]*s.omega*s.omega+m.dc[1]*pa);
    }
  }
  return {...coupled,force,linear_accel:mul(force,1/m.mass),grounded,normal_load_N,
    diagnostics:f,vertical_velocity:grounded?m.dc[1]*s.omega:s.velocity[1]};
}

export function contactHeight(s,e){
  const m=mechanics(parameters,s,wingPose);
  let required=-Infinity;
  for(const gear of E.gear_centres_m){
    const rel=bodyToWorld(sub(gear,m.cg),s);
    const terrain=(e.surfaceHeight??(()=>0))(s.position[0]+rel[0],s.position[2]+rel[2]);
    required=Math.max(required,terrain+E.wheel_radius_m-rel[1]);
  }
  return required;
}

function advanceOne(s,c,e,h){
  const a1=accelerations(s,c,e);
  const mid={...s,position:s.position.map((x,i)=>x+s.velocity[i]*h/2),
    velocity:s.velocity.map((x,i)=>x+a1.linear_accel[i]*h/2),
    phase:s.phase+s.omega*h/2,omega:s.omega+a1.phase_accel*h/2,
    pitch:s.pitch+s.pitch_rate*h/2,pitch_rate:s.pitch_rate+a1.pitch_accel*h/2};
  const a2=accelerations(mid,c,e),f=a2.diagnostics;
  const n={...s,
    position:s.position.map((x,i)=>x+mid.velocity[i]*h),
    velocity:s.velocity.map((x,i)=>x+a2.linear_accel[i]*h),
    phase:s.phase+mid.omega*h,omega:s.omega+a2.phase_accel*h,
    pitch:s.pitch+mid.pitch_rate*h,pitch_rate:s.pitch_rate+a2.pitch_accel*h,
    time:s.time+h
  };
  // Simple finite roll dynamics; no artificial bank-lift or pitch trim.
  const rollAcc=E.controls.roll_accel_rad_s2*clamp(finite(c.bank),-1,1)-
    E.controls.roll_damping_per_s*s.roll_rate;
  n.roll_rate=s.roll_rate+rollAcc*h;
  n.roll=clamp(s.roll+(s.roll_rate+rollAcc*h/2)*h,-E.controls.bank_limit_rad,E.controls.bank_limit_rad);
  if(Math.abs(n.roll)>=E.controls.bank_limit_rad)n.roll_rate=0;
  const speed=Math.hypot(n.velocity[0],n.velocity[2]);
  n.heading=s.heading+E.controls.rudder_coefficient*clamp(finite(c.rudder),-1,1)*
    speed/Math.max(8,E.body_length_m)*h;
  const shaftWork=Math.max(0,f.power)*h;
  const fuel=shaftWork*E.fuel.bsfc_kg_kWh/3600000+
    ((c.throttle>0&&s.fuel_kg>0&&e.motor_enabled!==false&&!s.gliding)?E.fuel.idle_kg_s*h:0);
  n.fuel_kg=Math.max(0,s.fuel_kg-fuel);
  n.shaft_work_J=(s.shaft_work_J??0)+Math.min(shaftWork,
    s.fuel_kg*3600000/E.fuel.bsfc_kg_kWh);
  n.aero_work_J=(s.aero_work_J??0)+Math.max(0,f.wing_dissipation_W)*h;
  const trans=f.power*(1-E.engine.transmission_efficiency)+
    Math.abs(f.phase_damping_Nm*mid.omega)+Math.abs(f.pitch_damping_Nm*mid.pitch_rate);
  n.drive_heat_J=(s.drive_heat_J??0)+Math.max(0,trans)*h;
  n.control_work_J=(s.control_work_J??0)+f.control_torque_Nm*mid.pitch_rate*h;
  if(a2.grounded){
    n.pitch=0;n.pitch_rate=0;n.roll=0;n.roll_rate=0;
    n.position[1]=contactHeight(n,e);
    const mm=mechanics(parameters,n,wingPose);
    n.velocity[1]=mm.dc[1]*n.omega;
    n.status='grounded';
    const forward=Math.hypot(n.velocity[0],n.velocity[2]);
    n.wheel_angle=(s.wheel_angle??0)+forward/E.wheel_radius_m*h;
  }else{
    const floor=contactHeight(n,e);
    if(n.position[1]<floor){
      const mm=mechanics(parameters,n,wingPose);
      const sink=n.velocity[1]-bodyToWorld(mul(mm.dc,n.omega),n)[1];
      const speed3=Math.hypot(...n.velocity);
      if(-sink>E.controls.safe_touchdown_sink_m_s||speed3>E.controls.safe_touchdown_speed_m_s||
         Math.abs(n.roll)>E.controls.safe_touchdown_bank_rad)n.status='crashed';
      else {
        n.position[1]=floor;n.pitch=0;n.pitch_rate=0;n.roll=0;n.roll_rate=0;
        n.velocity[1]=mm.dc[1]*n.omega;n.status='grounded';
      }
    }else n.status='flying';
  }
  return n;
}

export function step(s,c,e,dt){
  let n={...s,position:s.position.slice(),velocity:s.velocity.slice()};
  const count=Math.max(1,Math.ceil(dt/E.coupled.integration_dt_max)),h=dt/count;
  for(let i=0;i<count;i++)n=advanceOne(n,c,e,h);
  return n;
}
