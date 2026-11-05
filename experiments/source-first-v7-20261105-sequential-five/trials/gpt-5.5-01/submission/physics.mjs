import {E} from './environment/engineering.mjs';
import {wingPose} from './kinematics.mjs';
import {mechanics,centre,bodyToWorld,worldToBody,add,sub,mul,dot,cross,unit} from './environment/source-mechanism.mjs';

const AR=8.29, wrist=0.5, span=E.span_m;
export const parameters={
  aspect_ratio:AR,
  wrist_span_fraction:wrist,
  span_m:span,
  wing_area_m2:span*span/AR,
  body_length_m:E.body_length_m,
  pilot_mass_kg:E.pilot_mass_kg,
  dry_mass_kg:E.dry_mass_including_pilot_kg,
  mass_kg:E.dry_mass_including_pilot_kg+E.fuel.initial_kg,
  mass_budget:E.mass_budget,
  wheel_radius_m:E.wheel_radius_m,
  gear_centres:E.gear_centres_m,
  source:'photo 02: Say span 7.4 ft and area 6.61 ft^2 give AR 8.29; wrist span 3.7 ft gives 0.5'
};

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const len=v=>Math.hypot(...v);
const safe=x=>Number.isFinite(x)?x:0;
const flatArea=Object.values(E.aero.body_flat_plate_areas_m2).reduce((a,b)=>a+b,0);

function interp(xs,ys,x){
  if(x<=xs[0])return ys[0];
  for(let i=1;i<xs.length;i++)if(x<=xs[i]){
    const t=(x-xs[i-1])/(xs[i]-xs[i-1]);
    return ys[i-1]+(ys[i]-ys[i-1])*t;
  }
  return ys[ys.length-1];
}

export function polar(region,alpha,camber){
  const r=region==='outer'?E.sections.outer:E.sections.inner, xs=E.sections.alpha_rad;
  const cl0=interp(xs,r.cl_base,alpha);
  const cd0=interp(xs,r.cd_base,alpha);
  const CL=cl0+r.camber_lift_gain*(camber-r.camber_reference)*Math.cos(alpha);
  const CD=cd0+CL*CL/(Math.PI*E.aero.span_efficiency*parameters.aspect_ratio);
  return {CL,CD,cl:CL,cd:CD};
}

function motor(s,c,e){
  const throttle=clamp(c?.throttle??0,0,1);
  const enabled=(e?.motor_enabled!==false)&&!s.gliding&&throttle>0&&(s.fuel_kg??0)>0&&(s.omega??0)>=0;
  if(!enabled)return {shaftTorque:0,driveTorque:0,shaftPower:0};
  const target=2*Math.PI*E.engine.maximum_wingbeat_hz*throttle;
  const cap=Math.min(E.engine.starting_torque_Nm,E.engine.continuous_shaft_limit_W*throttle/Math.max(.5,Math.abs(s.omega??0)));
  const shaftTorque=clamp(E.engine.governor_torque_gain_Nm_s*(target-(s.omega??0)),0,cap);
  return {shaftTorque,driveTorque:shaftTorque*E.engine.transmission_efficiency,shaftPower:shaftTorque*(s.omega??0)};
}

function poseFn(override){
  if(!override)return wingPose;
  if(typeof override==='function')return override;
  return ()=>override;
}

function aerodynamic(state,environment,poseOverride){
  const s={...state,roll:state.roll??0,heading:state.heading??0,pitch:state.pitch??0,pitch_rate:state.pitch_rate??0,omega:state.omega??0};
  const rho=environment?.rho??E.rho_kg_m3;
  const m=mechanics(parameters,s,poseFn(poseOverride));
  const wind=environment?.wind??[0,0,0];
  const bodyV=worldToBody(sub(s.velocity??[0,0,0],wind),s);
  let F=[0,0,0],Qphi=0,Qpitch=0,diss=0,wingF=[0,0,0];
  const addForce=(Fb,r,jphi,jtheta,dragLoss=true)=>{
    F=add(F,Fb); Qphi+=dot(Fb,jphi); Qpitch+=dot(Fb,jtheta);
    if(dragLoss)diss+=0;
  };
  for(const sample of m.samples){
    if(!(sample.area>0)||rho===0)continue;
    const u=add(bodyV,sample.velocity), us=sub(u,mul(sample.span,dot(u,sample.span)));
    const speed=len(us);
    if(speed<=1e-9)continue;
    const d=mul(us,1/speed);
    const alpha=Math.atan2(-dot(d,sample.normal),dot(d,sample.chord));
    const {CL,CD}=polar(sample.region,alpha,sample.camber);
    const liftDir=unit(cross(sample.span,d));
    const q=.5*rho*speed*speed*sample.area;
    const Fb=add(mul(liftDir,q*CL),mul(d,-q*CD));
    F=add(F,Fb); wingF=add(wingF,Fb);
    Qphi+=dot(Fb,sample.jphi); Qpitch+=dot(Fb,sample.jtheta);
    diss+=q*CD*speed;
  }
  // body parasite drag at the body mass point
  const r0=mul(m.cg,-1), j0=mul(m.dc,-1), jt0=[-r0[1],r0[0],0];
  let u0=add(bodyV,add(mul(j0,s.omega),mul(jt0,s.pitch_rate))), sp0=len(u0);
  let bodyDrag=0;
  if(sp0>1e-9&&rho!==0){
    const d=mul(u0,1/sp0), mag=.5*rho*sp0*sp0*flatArea;
    const Fb=mul(d,-mag); bodyDrag=mag; F=add(F,Fb); Qphi+=dot(Fb,j0); Qpitch+=dot(Fb,jt0); diss+=mag*sp0;
  }
  // horizontal tail
  const rt=sub([-E.coupled.tail_arm_m,0,0],m.cg), jt=mul(m.dc,-1), jtt=[-rt[1],rt[0],0];
  const ut=add(bodyV,add(mul(jt,s.omega),mul(jtt,s.pitch_rate)));
  const vxy=[ut[0],ut[1],0], spt=len(vxy);
  if(spt>1e-9&&rho!==0){
    const d=mul(vxy,1/spt), alpha=Math.atan2(-ut[1],ut[0]);
    const CL=E.coupled.tail_lift_slope*clamp(alpha+E.coupled.tail_incidence_rad,-.35,.35);
    const CD=E.coupled.tail_drag_coefficient+.08*alpha*alpha;
    const q=.5*rho*spt*spt*E.coupled.tail_area_m2;
    const Fb=add(mul(cross([0,0,1],d),q*CL),mul(d,-q*CD));
    F=add(F,Fb); Qphi+=dot(Fb,jt); Qpitch+=dot(Fb,jtt); diss+=q*CD*spt;
  }
  // conventional rudder side force
  const hr=Math.hypot(bodyV[0],bodyV[2]);
  if(hr>1e-9&&rho!==0){
    const mag=.5*rho*hr*hr*E.coupled.tail_area_m2*E.controls.rudder_coefficient*clamp(controlsCache?.rudder??0,-1,1);
    const Fb=[0,0,mag];
    F=add(F,Fb); Qpitch+=dot(Fb,[0,0,0]); diss+=Math.abs(mag)*hr*.05;
  }
  return {m,F,Qphi,Qpitch,diss,wingF,bodyDrag,bodyV};
}

let controlsCache=null;
export function forces(state,controls={},environment={},poseOverride){
  controlsCache=controls;
  const s=state, g=environment.gravity??E.gravity_m_s2;
  const a=aerodynamic(s,environment,poseOverride);
  const mo=motor(s,controls,environment);
  const dscale=environment.damping_scale??1;
  const phaseDamping=E.coupled.phase_damping_Nm_s*(s.omega??0)*dscale;
  const pitchDamping=E.coupled.pitch_damping_Nm_s*(s.pitch_rate??0)*dscale;
  const controlTorque=E.coupled.pitch_control_torque_Nm*clamp(controls.pitch??0,-1,1);
  let bodyF=a.F;
  const worldAero=bodyToWorld(bodyF,s);
  const weight=[0,-a.m.mass*g,0];
  const total=add(worldAero,weight);
  const airspeed=len(a.bodyV);
  controlsCache=null;
  return {
    lift:bodyToWorld(a.wingF,s)[1],
    thrust:a.wingF[0],
    drag:a.bodyDrag,
    power:mo.shaftPower,
    airspeed,
    aero_power_W:-a.Qphi*(s.omega??0),
    wing_dissipation_W:a.diss,
    mass_kg:a.m.mass,
    Qphi:a.Qphi,
    Qpitch:a.Qpitch,
    motor_torque_Nm:mo.driveTorque,
    control_torque_Nm:controlTorque,
    phase_damping_Nm:phaseDamping,
    pitch_damping_Nm:pitchDamping,
    force:total.map(safe),
    wing_force_body_N:a.wingF.map(safe),
    cg:a.m.cg, dc:a.m.dc, mechanics:a.m,
    driveTorque:mo.driveTorque, shaftTorque:mo.shaftTorque
  };
}

export function accelerations(state,controls={},environment={}){
  const f=forces(state,controls,environment);
  const m=f.mechanics, pr=state.pitch_rate??0, om=state.omega??0;
  let phase_accel, pitch_accel;
  const R1=f.driveTorque+f.Qphi-m.Up-f.phase_damping_Nm-.5*m.Ap*om*om+.5*m.Cp*pr*pr;
  const R2=f.Qpitch+f.control_torque_Nm-f.pitch_damping_Nm-m.Bp*om*om-m.Cp*om*pr;
  if(environment.pitch_locked){
    phase_accel=R1/Math.max(1e-6,m.A); pitch_accel=0;
  }else{
    const det=m.A*m.C-m.B*m.B;
    phase_accel=(R1*m.C-R2*m.B)/det;
    pitch_accel=(m.A*R2-m.B*R1)/det;
  }
  return {phase_accel:safe(phase_accel),pitch_accel:safe(pitch_accel),force:f.force.map(safe),details:f};
}

export function contactHeight(state,environment={}){
  const cg=centre(parameters,state,wingPose);
  let h=-Infinity;
  for(const gear of E.gear_centres_m){
    const rel=bodyToWorld(sub(gear,cg),state);
    const surf=environment.surfaceHeight?environment.surfaceHeight((state.position?.[0]??0)+rel[0],(state.position?.[2]??0)+rel[2]):0;
    h=Math.max(h,surf+E.wheel_radius_m-rel[1]);
  }
  return h;
}

function deriv(s,c,e){
  const ac=accelerations(s,c,e), m=ac.details.mass_kg;
  const force=ac.force.slice();
  let status=s.status??'flying';
  let grounded=false, normal=0;
  const ch=contactHeight(s,e);
  if((s.position?.[1]??0)<=ch+0.02 && (s.velocity?.[1]??0)<=1.0 && status!=='crashed'){
    const me=ac.details.mechanics, om=s.omega??0, fy=force[1], Ag=me.A+me.mass*me.dc[1]*me.dc[1], Agp=me.Ap+2*me.mass*me.dc[1]*me.ddc[1];
    const R=ac.details.driveTorque+ac.details.Qphi-me.Up-ac.details.phase_damping_Nm-.5*Agp*om*om+fy*me.dc[1];
    const pa=R/Math.max(1e-6,Ag);
    normal=me.mass*(me.ddc[1]*om*om+me.dc[1]*pa)-fy;
    if(normal>=0){
      grounded=true; ac.phase_accel=pa; ac.pitch_accel=0; force[1]=0;
      const vx=s.velocity?.[0]??0, vz=s.velocity?.[2]??0, hs=Math.hypot(vx,vz);
      if(hs>1e-6){
        const loss=(E.controls.rolling_friction_coefficient*normal+(c.brake??0)*E.controls.brake_force_N);
        force[0]-=loss*vx/hs; force[2]-=loss*vz/hs;
      }
    }
  }
  return {ac,force,m,grounded,normal,status};
}

function advance(s,c,e,dt){
  const d=deriv(s,c,e), inv=1/d.m;
  const ns={...s,position:[...s.position],velocity:[...s.velocity]};
  ns.phase=(s.phase??0)+(s.omega??0)*dt;
  ns.omega=(s.omega??0)+d.ac.phase_accel*dt;
  if(!e.pitch_locked)ns.pitch=clamp((s.pitch??0)+(s.pitch_rate??0)*dt,E.controls.pitch_limits_rad[0],E.controls.pitch_limits_rad[1]);
  ns.pitch_rate=e.pitch_locked?0:(s.pitch_rate??0)+d.ac.pitch_accel*dt;
  ns.roll_rate=(s.roll_rate??0)+(E.controls.roll_accel_rad_s2*clamp(c.bank??0,-1,1)-E.controls.roll_damping_per_s*(s.roll_rate??0))*dt;
  ns.roll=clamp((s.roll??0)+ns.roll_rate*dt,-E.controls.bank_limit_rad,E.controls.bank_limit_rad);
  const speed=Math.max(5,Math.hypot(ns.velocity[0],ns.velocity[2]));
  ns.heading=(s.heading??0)+((E.gravity_m_s2*Math.tan(ns.roll)/speed)+(c.rudder??0)*0.18)*dt;
  for(let i=0;i<3;i++){ns.velocity[i]+=d.force[i]*inv*dt; ns.position[i]+=ns.velocity[i]*dt;}
  if(d.grounded){
    ns.pitch=0; ns.pitch_rate=0;
    ns.position[1]=contactHeight(ns,e);
    const cy=d.ac.details.mechanics.dc[1];
    ns.velocity[1]=cy*ns.omega;
    ns.status='grounded';
  }else ns.status='flying';
  ns.wheel_angle=(s.wheel_angle??0)+Math.hypot(ns.velocity[0],ns.velocity[2])*dt/E.wheel_radius_m;
  const mo=d.ac.details;
  ns.shaft_work_J=(s.shaft_work_J??0)+Math.max(0,mo.power)*dt;
  ns.aero_work_J=(s.aero_work_J??0)+Math.max(0,mo.wing_dissipation_W)*dt;
  ns.drive_heat_J=(s.drive_heat_J??0)+(Math.max(0,mo.shaftTorque*(s.omega??0)-mo.driveTorque*(s.omega??0))+Math.abs(mo.phase_damping_Nm*(s.omega??0))+Math.abs(mo.pitch_damping_Nm*(s.pitch_rate??0)))*dt;
  ns.control_work_J=(s.control_work_J??0)+mo.control_torque_Nm*(s.pitch_rate??0)*dt;
  let fuel=s.fuel_kg??0;
  if((c.throttle??0)>0 && (s.fuel_kg??0)>0 && !s.gliding && (e.motor_enabled!==false) && (s.omega??0)>=0){
    fuel-=mo.shaftTorque*Math.max(0,s.omega??0)*dt*E.fuel.bsfc_kg_kWh/3600000 + E.fuel.idle_kg_s*dt;
  }
  ns.fuel_kg=Math.max(0,fuel);
  ns.time=(s.time??0)+dt;
  const ch=contactHeight(ns,e), sink=(s.velocity?.[1]??0);
  if(ns.position[1]<ch){
    if(Math.abs(sink)>E.controls.safe_touchdown_sink_m_s+1||Math.hypot(ns.velocity[0],ns.velocity[2])>35||Math.abs(ns.roll)>0.7)ns.status='crashed';
    ns.position[1]=ch; if(ns.velocity[1]<0)ns.velocity[1]=0;
  }
  return ns;
}

export function step(state,controls={},environment={},dt){
  let s={...state,position:[...state.position],velocity:[...state.velocity]};
  const n=Math.max(1,Math.ceil(dt/E.coupled.integration_dt_max)), h=dt/n;
  for(let i=0;i<n;i++){
    const mid=advance(s,controls,environment,h*.5);
    const end=advance(mid,controls,environment,h);
    const ns={...end,position:[...s.position],velocity:[...s.velocity]};
    for(let k=0;k<3;k++){ns.position[k]=s.position[k]+(end.position[k]-mid.position[k]); ns.velocity[k]=s.velocity[k]+(end.velocity[k]-mid.velocity[k]);}
    for(const key of ['phase','omega','pitch','pitch_rate','roll','roll_rate','heading','wheel_angle','shaft_work_J','aero_work_J','drive_heat_J','control_work_J']){
      ns[key]=(s[key]??0)+((end[key]??0)-(mid[key]??0));
    }
    ns.fuel_kg=Math.max(0,(s.fuel_kg??0)+((end.fuel_kg??0)-(mid.fuel_kg??0)));
    ns.time=(s.time??0)+h;
    if(end.status==='grounded'){ns.position[1]=contactHeight(ns,environment); if(ns.velocity[1]<0)ns.velocity[1]=0;}
    s=ns;
  }
  return s;
}
