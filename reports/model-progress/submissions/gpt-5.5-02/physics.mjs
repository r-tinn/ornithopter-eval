import {E} from './environment/engineering.mjs';
import {wingPose} from './kinematics.mjs';
import {mechanics,bodyToWorld,worldToBody,add,sub,mul,dot,cross,unit} from './environment/source-mechanism.mjs';

const AR=(7.4*7.4)/6.61;
const wrist=3.7/7.4;
export const parameters={
  aspect_ratio:AR,
  wrist_span_fraction:wrist,
  span_m:E.span_m,
  wing_area_m2:E.span_m*E.span_m/AR,
  body_length_m:E.body_length_m,
  pilot_height_m:E.pilot_height_m,
  pilot_mass_kg:E.pilot_mass_kg,
  dry_mass_kg:E.dry_mass_including_pilot_kg,
  mass_kg:E.dry_mass_including_pilot_kg+E.fuel.initial_kg,
  mass_budget:E.mass_budget,
  wheel_radius_m:E.wheel_radius_m,
  gear_centres:E.gear_centres_m
};

const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const finite=x=>Number.isFinite(x)?x:0;
function vadd(a,b){return [a[0]+b[0],a[1]+b[1],a[2]+b[2]]}
function vsub(a,b){return [a[0]-b[0],a[1]-b[1],a[2]-b[2]]}
function vmul(a,k){return [a[0]*k,a[1]*k,a[2]*k]}
function z3(){return [0,0,0]}
function interp(xs,ys,x){
  if(x<=xs[0])return ys[0];
  for(let i=1;i<xs.length;i++)if(x<=xs[i]){
    const t=(x-xs[i-1])/(xs[i]-xs[i-1]);return ys[i-1]+(ys[i]-ys[i-1])*t;
  }
  return ys[ys.length-1];
}

export function polar(region,alpha,camber){
  const sec=E.sections[region==='outer'?'outer':'inner'],xs=E.sections.alpha_rad;
  const a=clamp(alpha,xs[0],xs[xs.length-1]);
  const cl0=interp(xs,sec.cl_base,a);
  const cd0=interp(xs,sec.cd_base,a);
  const CL=cl0+sec.camber_lift_gain*(camber-sec.camber_reference)*Math.cos(alpha);
  const CD=cd0+CL*CL/(Math.PI*E.aero.span_efficiency*parameters.aspect_ratio);
  return {CL,CD};
}

function poseFunction(override){
  if(!override)return wingPose;
  if(typeof override==='function')return override;
  return ()=>override;
}

function motorTorque(s,c,e){
  const th=clamp(finite(c?.throttle),0,1);
  if(!(th>0)||!(s.fuel_kg>0)||s.omega<0||e?.motor_enabled===false||s.gliding)return {shaft:0,drive:0};
  const target=2*Math.PI*E.engine.maximum_wingbeat_hz*th;
  const raw=E.engine.governor_torque_gain_Nm_s*(target-s.omega);
  const limit=Math.min(E.engine.starting_torque_Nm,E.engine.continuous_shaft_limit_W*th/Math.max(.5,Math.abs(s.omega)));
  const shaft=clamp(raw,0,limit);
  return {shaft,drive:shaft*E.engine.transmission_efficiency};
}

function aeroModel(s,c,e,poseOverride){
  const rho=Number.isFinite(e?.rho)?e.rho:E.rho_kg_m3;
  const poseFn=poseFunction(poseOverride);
  const m=mechanics(parameters,s,poseFn);
  const wind=e?.wind??[0,0,0];
  const vBody=worldToBody(vsub(s.velocity??z3(),wind),s);
  let F=z3(),Qphi=0,Qpitch=0,diss=0,dragMag=0,wingF=z3();
  for(const sample of m.samples){
    if(!(sample.area>0))continue;
    let u=vadd(vBody,sample.velocity);
    u=vsub(u,vmul(sample.span,dot(u,sample.span)));
    const speed=Math.hypot(...u);
    if(speed<=1e-9)continue;
    const d=vmul(u,1/speed);
    const alpha=Math.atan2(-dot(d,sample.normal),dot(d,sample.chord));
    const po=polar(sample.region,alpha,sample.camber);
    const liftDir=unit(cross(sample.span,d));
    const f=vmul(vsub(vmul(liftDir,po.CL),vmul(d,po.CD)),.5*rho*speed*speed*sample.area);
    F=vadd(F,f);wingF=vadd(wingF,f);
    Qphi+=dot(f,sample.jphi);Qpitch+=dot(f,sample.jtheta);
    diss+=.5*rho*speed*speed*sample.area*po.CD*speed;
  }
  const area=Object.values(E.aero.body_flat_plate_areas_m2).reduce((a,b)=>a+b,0);
  const r0=vmul(m.cg,-1),j0=vmul(m.dc,-1),jt0=[-r0[1],r0[0],0];
  const u0=vadd(vBody,vadd(vmul(j0,s.omega),vmul(jt0,s.pitch_rate)));
  const sp0=Math.hypot(...u0);
  if(sp0>1e-9){
    const d=vmul(u0,1/sp0),f=vmul(d,-.5*rho*sp0*sp0*area);
    F=vadd(F,f);Qphi+=dot(f,j0);Qpitch+=dot(f,jt0);diss+=.5*rho*sp0*sp0*area*sp0;dragMag+=.5*rho*sp0*sp0*area;
  }
  const rt=vsub([-E.coupled.tail_arm_m,0,0],m.cg),jt=vmul(m.dc,-1),jtt=[-rt[1],rt[0],0];
  const ut=vadd(vBody,vadd(vmul(jt,s.omega),vmul(jtt,s.pitch_rate)));
  const tailSpeed=Math.hypot(ut[0],ut[1]);
  if(tailSpeed>1e-9){
    const d=[ut[0]/tailSpeed,ut[1]/tailSpeed,0];
    const alpha=Math.atan2(-ut[1],ut[0]);
    const CL=E.coupled.tail_lift_slope*clamp(alpha+E.coupled.tail_incidence_rad,-.35,.35);
    const CD=E.coupled.tail_drag_coefficient+.08*alpha*alpha;
    const lift=unit(cross([0,0,1],d));
    const f=vmul(vsub(vmul(lift,CL),vmul(d,CD)),.5*rho*tailSpeed*tailSpeed*E.coupled.tail_area_m2);
    F=vadd(F,f);Qphi+=dot(f,jt);Qpitch+=dot(f,jtt);diss+=.5*rho*tailSpeed*tailSpeed*E.coupled.tail_area_m2*CD*tailSpeed;dragMag+=.5*rho*tailSpeed*tailSpeed*E.coupled.tail_area_m2*CD;
  }
  const hspeed=Math.hypot(vBody[0],vBody[2]);
  if(hspeed>1e-9&&Math.abs(c?.rudder)>0){
    const side=[-vBody[2]/hspeed,0,vBody[0]/hspeed];
    const f=vmul(side,.5*rho*hspeed*hspeed*E.coupled.tail_area_m2*E.controls.rudder_coefficient*clamp(c.rudder,-1,1));
    F=vadd(F,f);
  }
  const worldAero=bodyToWorld(F,s);
  const g=Number.isFinite(e?.gravity)?e.gravity:E.gravity_m_s2;
  const totalWorld=vadd(worldAero,[0,-m.mass*g,0]);
  const mt=motorTorque(s,c,e);
  const phaseD=E.coupled.phase_damping_Nm_s*s.omega*(Number.isFinite(e?.damping_scale)?e.damping_scale:1)+E.engine.drive_friction_Nm_s*s.omega;
  const pitchD=E.coupled.pitch_damping_Nm_s*s.pitch_rate*(Number.isFinite(e?.damping_scale)?e.damping_scale:1);
  const ctrl=E.coupled.pitch_control_torque_Nm*clamp(finite(c?.pitch),-1,1);
  return {m,F,totalWorld,wingF,Qphi,Qpitch,diss,dragMag,mt,phaseD,pitchD,ctrl,rho,airspeed:Math.hypot(...vBody)};
}

export function forces(state,controls={},environment={},poseOverride){
  const a=aeroModel(state,controls,environment,poseOverride);
  return {
    lift:a.wingF[1],thrust:a.wingF[0],drag:a.dragMag,power:a.mt.shaft*Math.max(0,state.omega),
    airspeed:a.airspeed,aero_power_W:-a.Qphi*state.omega,wing_dissipation_W:a.diss,mass_kg:a.m.mass,
    Qphi:a.Qphi,Qpitch:a.Qpitch,motor_torque_Nm:a.mt.drive,control_torque_Nm:a.ctrl,
    phase_damping_Nm:a.phaseD,pitch_damping_Nm:a.pitchD,force:a.totalWorld,wing_force_body_N:a.wingF,
    cg:a.m.cg,A:a.m.A,B:a.m.B,C:a.m.C,U:a.m.U,Up:a.m.Up
  };
}

function accelAt(s,c,e,ground=false){
  const a=aeroModel(s,c,e);
  const m=a.m,det=m.A*m.C-m.B*m.B;
  const R1=a.mt.drive+a.Qphi-m.Up-a.phaseD-.5*m.Ap*s.omega*s.omega+.5*m.Cp*s.pitch_rate*s.pitch_rate;
  const R2=a.Qpitch+a.ctrl-a.pitchD-m.Bp*s.omega*s.omega-m.Cp*s.omega*s.pitch_rate;
  let phase_accel=0,pitch_accel=0,normal=-1,constrained=false;
  if(e?.pitch_locked){phase_accel=R1/m.A;pitch_accel=0;}
  else if(ground){
    const Ag=m.A+m.mass*m.dc[1]*m.dc[1],Agp=m.Ap+2*m.mass*m.dc[1]*m.ddc[1];
    phase_accel=(a.mt.drive+a.Qphi-m.Up-a.phaseD-.5*Agp*s.omega*s.omega+a.F[1]*m.dc[1])/Ag;
    normal=m.mass*(m.ddc[1]*s.omega*s.omega+m.dc[1]*phase_accel)-a.F[1];
    constrained=normal>=0;pitch_accel=0;
    if(!constrained)return accelAt(s,c,e,false);
  }else if(Math.abs(det)>1e-9){
    phase_accel=(R1*m.C-R2*m.B)/det;
    pitch_accel=(m.A*R2-m.B*R1)/det;
  }
  return {phase_accel,pitch_accel,force:a.totalWorld,model:a,normal,constrained};
}

export function accelerations(state,controls={},environment={}){
  const onGround=state.position?.[1]<=contactHeight(state,environment)+.02 && state.velocity?.[1]<=1;
  const r=accelAt(state,controls,environment,onGround);
  return {phase_accel:r.phase_accel,pitch_accel:r.pitch_accel,force:r.force};
}

function deriv(s,c,e){
  const onGround=s.position[1]<=contactHeight(s,e)+.015 && s.velocity[1]<=1 && Math.abs(s.pitch)<.25;
  const r=accelAt(s,c,e,onGround);
  const acc=vmul(r.force,1/r.model.m.mass);
  return {acc,phase_accel:r.phase_accel,pitch_accel:r.pitch_accel,model:r.model,constrained:r.constrained};
}

function advanceEuler(s,d,dt,c,e){
  const n={...s,position:s.position.slice(),velocity:s.velocity.slice()};
  n.position=vadd(s.position,vmul(s.velocity,dt));
  n.velocity=vadd(s.velocity,vmul(d.acc,dt));
  n.phase=s.phase+s.omega*dt;
  n.omega=Math.max(-20,s.omega+d.phase_accel*dt);
  n.pitch=s.pitch+s.pitch_rate*dt;
  n.pitch_rate=s.pitch_rate+d.pitch_accel*dt;
  n.roll_rate=(s.roll_rate??0)+(E.controls.roll_accel_rad_s2*clamp(finite(c?.bank),-1,1)-E.controls.roll_damping_per_s*(s.roll_rate??0))*dt;
  n.roll=clamp((s.roll??0)+n.roll_rate*dt,-E.controls.bank_limit_rad,E.controls.bank_limit_rad);
  n.heading=(s.heading??0)+clamp(finite(c?.rudder),-1,1)*.25*dt+(Math.sin(n.roll)*Math.max(0,Math.hypot(...s.velocity))/80)*dt;
  return n;
}

export function step(state,controls={},environment={},dt=1/120){
  let s={...state,position:state.position.slice(),velocity:state.velocity.slice()};
  const maxdt=E.coupled.integration_dt_max,n=Math.max(1,Math.ceil(dt/maxdt)),h=dt/n;
  for(let i=0;i<n;i++){
    const d1=deriv(s,controls,environment);
    const mid=advanceEuler(s,d1,h/2,controls,environment);
    const d2=deriv(mid,controls,environment);
    const old=s;
    s=advanceEuler(s,d2,h,controls,environment);
    const mass=d2.model.m.mass;
    const shaftPower=d2.model.mt.shaft*Math.max(0,old.omega);
    const shaftWork=shaftPower*h;
    const commanded=(controls.throttle>0&&old.fuel_kg>0&&environment?.motor_enabled!==false&&!old.gliding);
    const fuel=commanded?shaftWork*E.fuel.bsfc_kg_kWh/3600000+E.fuel.idle_kg_s*h:0;
    s.fuel_kg=Math.max(0,old.fuel_kg-fuel);
    s.shaft_work_J=(old.shaft_work_J??0)+Math.max(0,shaftWork);
    s.aero_work_J=(old.aero_work_J??0)+d2.model.diss*h;
    s.drive_heat_J=(old.drive_heat_J??0)+Math.max(0,(d2.model.mt.shaft-d2.model.mt.drive)*Math.max(0,old.omega)*h+d2.model.phaseD*old.omega*h+d2.model.pitchD*old.pitch_rate*h);
    s.control_work_J=(old.control_work_J??0)+d2.model.ctrl*old.pitch_rate*h;
    s.time=(old.time??0)+h;
    s.pitch=clamp(s.pitch,E.controls.pitch_limits_rad[0],E.controls.pitch_limits_rad[1]);
    const ch=contactHeight(s,environment);
    if(s.position[1]<=ch){
      const sink=s.velocity[1];
      s.position[1]=ch;
      const cg=mechanics(parameters,s,wingPose).cg;
      s.velocity[1]=mechanics(parameters,s,wingPose).dc[1]*s.omega;
      s.pitch=0;s.pitch_rate=0;
      const fwd=bodyToWorld([1,0,0],s),speed=dot(s.velocity,fwd);
      const loss=(E.controls.rolling_friction_coefficient*mass*(environment?.gravity??E.gravity_m_s2)+E.controls.brake_force_N*clamp(finite(controls.brake),0,1))*h/mass;
      s.velocity=vsub(s.velocity,vmul(fwd,Math.sign(speed)*Math.min(Math.abs(speed),loss)));
      s.wheel_angle=(old.wheel_angle??0)+speed*h/E.wheel_radius_m;
      s.status=(old.status==='crashed'||(sink<-E.controls.safe_touchdown_sink_m_s&&Math.hypot(...s.velocity)>E.controls.safe_touchdown_speed_m_s))?'crashed':'grounded';
    }else{
      s.status=old.status==='crashed'?'crashed':'flying';
      const fwd=bodyToWorld([1,0,0],s);
      s.wheel_angle=(old.wheel_angle??0)+dot(s.velocity,fwd)*h/E.wheel_radius_m;
    }
  }
  return s;
}

export function contactHeight(state,environment={}){
  const cg=mechanics(parameters,state,wingPose).cg;
  let h=-Infinity;
  for(const g of E.gear_centres_m){
    const rel=bodyToWorld(vsub(g,cg),state);
    const y=(environment.surfaceHeight?environment.surfaceHeight(state.position[0]+rel[0],state.position[2]+rel[2]):0)+E.wheel_radius_m-rel[1];
    h=Math.max(h,y);
  }
  return h;
}
