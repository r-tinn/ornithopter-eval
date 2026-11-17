import {E} from './environment/engineering.mjs';
import {wingPose} from './kinematics.mjs';
import {mechanics,bodyToWorld,worldToBody,dot,cross,unit,add,sub,mul} from './environment/source-mechanism.mjs';

const AR=7.4*7.4/6.61;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const finite=(v,d=0)=>Number.isFinite(v)?v:d;
const controls0={throttle:0,pitch:0,bank:0,rudder:0,brake:0};

export const parameters={
  status:E.status,
  aspect_ratio:AR,
  wrist_span_fraction:0.5,
  span_m:E.span_m,
  wing_area_m2:E.span_m*E.span_m/AR,
  body_length_m:E.body_length_m,
  pilot_height_m:E.pilot_height_m,
  pilot_mass_kg:E.pilot_mass_kg,
  dry_mass_kg:E.dry_mass_including_pilot_kg,
  mass_kg:E.dry_mass_including_pilot_kg+E.fuel.initial_kg,
  mass_budget:E.mass_budget,
  wheel_radius_m:E.wheel_radius_m,
  gear_centres:E.gear_centres_m,
  glide:E.glide,
  source_derived:E.source_derived,
  limitations:E.limitations
};

function interp(xs,ys,x){
  if(x<=xs[0])return ys[0];
  for(let i=1;i<xs.length;i++)if(x<=xs[i]){
    const t=(x-xs[i-1])/(xs[i]-xs[i-1]);
    return ys[i-1]+(ys[i]-ys[i-1])*t;
  }
  return ys[ys.length-1];
}

export function polar(region,alpha,camber){
  const key=region==='outer'?'outer':'inner',sec=E.sections[key],a=E.sections.alpha_rad;
  const cl0=interp(a,sec.cl_base,alpha);
  const cd0=interp(a,sec.cd_base,alpha);
  const CL=cl0+sec.camber_lift_gain*(camber-sec.camber_reference)*Math.cos(alpha);
  const CD=cd0+CL*CL/(Math.PI*E.aero.span_efficiency*parameters.aspect_ratio);
  return {CL,CD,cl:CL,cd:CD};
}

function poseFn(override){
  if(!override)return wingPose;
  if(typeof override==='function')return override;
  return ()=>override;
}

function motor(s,c,e){
  const throttle=clamp(finite(c?.throttle,0),0,1);
  if(!(throttle>0)||!(s.fuel_kg>0)||s.omega<0||e?.motor_enabled===false||s.gliding)return {shaft:0,drive:0,power:0,target:0};
  const target=2*Math.PI*E.engine.maximum_wingbeat_hz*throttle;
  const wanted=E.engine.governor_torque_gain_Nm_s*(target-s.omega);
  const limit=Math.min(E.engine.starting_torque_Nm,E.engine.continuous_shaft_limit_W*throttle/Math.max(.5,Math.abs(s.omega)));
  const shaft=clamp(wanted,0,limit);
  return {shaft,drive:shaft*E.engine.transmission_efficiency,power:shaft*Math.max(0,s.omega),target};
}

function aeroAndLoads(s,c=controls0,e={},override){
  const rho=finite(e.rho,E.rho_kg_m3),pose=poseFn(override),mec=mechanics(parameters,s,pose);
  const relWorld=sub(s.velocity??[0,0,0],e.wind??[0,0,0]);
  const vBody=worldToBody(relWorld,s);
  let Fbody=[0,0,0],Qphi=0,Qpitch=0,diss=0,wing=[0,0,0],wingDiss=0;
  for(const sm of mec.samples){
    if(!(sm.area>0)||rho<=0)continue;
    const u=add(vBody,sm.velocity),span=unit(sm.span);
    const u2=sub(u,mul(span,dot(u,span))),speed=Math.hypot(...u2);
    if(!(speed>1e-8))continue;
    const d=mul(u2,1/speed);
    const alpha=Math.atan2(-dot(d,sm.normal),dot(d,sm.chord));
    const p=polar(sm.region,alpha,sm.camber);
    const q=.5*rho*speed*speed*sm.area;
    const liftDir=unit(cross(span,d));
    const F=add(mul(liftDir,q*p.CL),mul(d,-q*p.CD));
    Fbody=add(Fbody,F);wing=add(wing,F);
    Qphi+=dot(F,sm.jphi);Qpitch+=dot(F,sm.jtheta);
    const loss=q*p.CD*speed;diss+=loss;wingDiss+=loss;
  }
  const flat=Object.values(E.aero.body_flat_plate_areas_m2).reduce((a,b)=>a+b,0);
  {
    const r=mul(mec.cg,-1),jphi=mul(mec.dc,-1),jtheta=[-r[1],r[0],0];
    const u=add(vBody,add(mul(jphi,s.omega),mul(jtheta,s.pitch_rate)));
    const speed=Math.hypot(...u);
    if(speed>1e-8&&rho>0){
      const d=mul(u,1/speed),q=.5*rho*speed*speed*flat;
      const F=mul(d,-q);
      Fbody=add(Fbody,F);Qphi+=dot(F,jphi);Qpitch+=dot(F,jtheta);diss+=q*speed;
    }
  }
  {
    const r=sub([-E.coupled.tail_arm_m,0,0],mec.cg),jphi=mul(mec.dc,-1),jtheta=[-r[1],r[0],0];
    const u=add(vBody,add(mul(jphi,s.omega),mul(jtheta,s.pitch_rate)));
    const ux=u[0],uy=u[1],speed=Math.hypot(ux,uy);
    if(speed>1e-8&&rho>0){
      const d=[ux/speed,uy/speed,0],alpha=Math.atan2(-uy,ux);
      const CL=E.coupled.tail_lift_slope*clamp(alpha+E.coupled.tail_incidence_rad,-.35,.35);
      const CD=E.coupled.tail_drag_coefficient+.08*alpha*alpha;
      const q=.5*rho*speed*speed*E.coupled.tail_area_m2;
      const F=add(mul(cross([0,0,1],d),q*CL),mul(d,-q*CD));
      Fbody=add(Fbody,F);Qphi+=dot(F,jphi);Qpitch+=dot(F,jtheta);diss+=q*CD*speed;
    }
  }
  {
    const speed=Math.hypot(vBody[0],vBody[2]);
    if(speed>1e-8&&rho>0){
      const side=[-vBody[2]/speed,0,vBody[0]/speed];
      const q=.5*rho*speed*speed*E.coupled.tail_area_m2*E.controls.rudder_coefficient*clamp(finite(c?.rudder,0),-1,1);
      Fbody=add(Fbody,mul(side,q));
    }
  }
  const Fworld=bodyToWorld(Fbody,s);
  const g=finite(e.gravity,E.gravity_m_s2);
  const total=add(Fworld,[0,-mec.mass*g,0]);
  return {mec,Fbody,Fworld,total,Qphi,Qpitch,diss,wingDiss,wing};
}

export function forces(state,controls=controls0,environment={},poseOverride){
  const a=aeroAndLoads(state,controls,environment,poseOverride),mo=motor(state,controls,environment);
  const dampingScale=finite(environment.damping_scale,1);
  const phaseDamping=E.coupled.phase_damping_Nm_s*state.omega*dampingScale;
  const pitchDamping=E.coupled.pitch_damping_Nm_s*state.pitch_rate*dampingScale;
  const wingWorld=bodyToWorld(a.wing,state);
  return {
    lift:wingWorld[1],
    thrust:a.wing[0],
    drag:Math.max(0,a.diss/Math.max(.1,Math.hypot(...worldToBody(sub(state.velocity??[0,0,0],environment.wind??[0,0,0]),state)))),
    power:mo.power,
    airspeed:Math.hypot(...worldToBody(sub(state.velocity??[0,0,0],environment.wind??[0,0,0]),state)),
    aero_power_W:-a.Qphi*state.omega,
    wing_dissipation_W:a.diss,
    mass_kg:a.mec.mass,
    Qphi:a.Qphi,
    Qpitch:a.Qpitch,
    motor_torque_Nm:mo.drive,
    control_torque_Nm:E.coupled.pitch_control_torque_Nm*clamp(finite(controls?.pitch,0),-1,1),
    phase_damping_Nm:phaseDamping,
    pitch_damping_Nm:pitchDamping,
    force:a.total,
    wing_force_body_N:a.wing,
    aero_work_rate_W:a.diss
  };
}

export function accelerations(state,controls=controls0,environment={}){
  const a=aeroAndLoads(state,controls,environment),mo=motor(state,controls,environment);
  const dampingScale=finite(environment.damping_scale,1);
  const phaseDamping=E.coupled.phase_damping_Nm_s*state.omega*dampingScale;
  const pitchDamping=E.coupled.pitch_damping_Nm_s*state.pitch_rate*dampingScale;
  const pilot=E.coupled.pitch_control_torque_Nm*clamp(finite(controls.pitch,0),-1,1);
  const m=a.mec;
  let phase_accel,pitch_accel;
  const R1=mo.drive+a.Qphi-m.Up-phaseDamping-.5*m.Ap*state.omega*state.omega+.5*m.Cp*state.pitch_rate*state.pitch_rate;
  const R2=a.Qpitch+pilot-pitchDamping-m.Bp*state.omega*state.omega-m.Cp*state.omega*state.pitch_rate;
  if(environment.pitch_locked){
    phase_accel=R1/Math.max(1e-6,m.A);pitch_accel=0;
  }else{
    const det=m.A*m.C-m.B*m.B;
    phase_accel=(R1*m.C-R2*m.B)/Math.max(1e-6,det);
    pitch_accel=(m.A*R2-m.B*R1)/Math.max(1e-6,det);
  }
  return {phase_accel,pitch_accel,force:a.total,Qphi:a.Qphi,Qpitch:a.Qpitch,mass_kg:m.mass,
    motor_torque_Nm:mo.drive,control_torque_Nm:pilot,phase_damping_Nm:phaseDamping,pitch_damping_Nm:pitchDamping};
}

export function contactHeight(s,e={}){
  const cg=mechanics(parameters,s,wingPose).cg;
  let h=-Infinity;
  for(const g0 of E.gear_centres_m){
    const off=bodyToWorld(sub(g0,cg),s);
    const x=s.position[0]+off[0],z=s.position[2]+off[2];
    h=Math.max(h,(e.surfaceHeight?e.surfaceHeight(x,z):0)+E.wheel_radius_m-off[1]);
  }
  return h;
}

function groundDerivative(s,c,e){
  const ss={...s,pitch:0,pitch_rate:0};
  const a=aeroAndLoads(ss,c,e),mo=motor(ss,c,e),m=a.mec,dampingScale=finite(e.damping_scale,1);
  const phaseDamping=E.coupled.phase_damping_Nm_s*ss.omega*dampingScale;
  const Ag=m.A+m.mass*m.dc[1]*m.dc[1],Agp=m.Ap+2*m.mass*m.dc[1]*m.ddc[1];
  const phase_accel=(mo.drive+a.Qphi-m.Up-phaseDamping-.5*Agp*ss.omega*ss.omega+a.total[1]*m.dc[1])/Math.max(1e-6,Ag);
  const normal=m.mass*(m.ddc[1]*ss.omega*ss.omega+m.dc[1]*phase_accel)-a.total[1];
  const f=a.total.slice();
  const vx=s.velocity[0],vz=s.velocity[2],hs=Math.hypot(vx,vz);
  const roll=E.controls.rolling_friction_coefficient*Math.max(0,normal)+E.controls.brake_force_N*clamp(finite(c.brake,0),0,1);
  if(hs>1e-5){f[0]-=roll*vx/hs;f[2]-=roll*vz/hs;}
  f[1]=0;
  return {force:f,phase_accel,pitch_accel:0,normal,mass:m.mass,mo,a,mec:m,grounded:normal>=0};
}

function deriv(s,c,e){
  const onGround=s.position[1]<=contactHeight({...s,pitch:0},e)+0.03&&s.velocity[1]<=1.5;
  if(onGround){
    const g=groundDerivative(s,c,e);
    if(g.grounded)return g;
  }
  const ac=accelerations(s,c,e);
  const mass=ac.mass_kg;
  return {...ac,mass,grounded:false,mo:motor(s,c,e),a:aeroAndLoads(s,c,e)};
}

function advanceOnce(s,c,e,h){
  const d=deriv(s,c,e),mass=d.mass_kg??d.mass;
  const ax=d.force[0]/mass,ay=d.force[1]/mass,az=d.force[2]/mass;
  const mid={...s,
    position:[s.position[0]+s.velocity[0]*h*.5,s.position[1]+s.velocity[1]*h*.5,s.position[2]+s.velocity[2]*h*.5],
    velocity:[s.velocity[0]+ax*h*.5,s.velocity[1]+ay*h*.5,s.velocity[2]+az*h*.5],
    phase:s.phase+s.omega*h*.5,omega:s.omega+d.phase_accel*h*.5,
    pitch:s.pitch+s.pitch_rate*h*.5,pitch_rate:s.pitch_rate+d.pitch_accel*h*.5
  };
  if(e.pitch_locked){mid.pitch=s.pitch;mid.pitch_rate=0;}
  const dm=deriv(mid,c,e),mass2=dm.mass_kg??dm.mass;
  let n={...s};
  n.position=[s.position[0]+mid.velocity[0]*h,s.position[1]+mid.velocity[1]*h,s.position[2]+mid.velocity[2]*h];
  n.velocity=[s.velocity[0]+dm.force[0]/mass2*h,s.velocity[1]+dm.force[1]/mass2*h,s.velocity[2]+dm.force[2]/mass2*h];
  n.phase=s.phase+mid.omega*h;n.omega=s.omega+dm.phase_accel*h;
  n.pitch=e.pitch_locked?s.pitch:s.pitch+mid.pitch_rate*h;n.pitch_rate=e.pitch_locked?0:s.pitch_rate+dm.pitch_accel*h;
  n.roll_rate=(s.roll_rate??0)+(E.controls.roll_accel_rad_s2*clamp(finite(c.bank,0),-1,1)-E.controls.roll_damping_per_s*(s.roll_rate??0))*h;
  n.roll=clamp((s.roll??0)+n.roll_rate*h,-E.controls.bank_limit_rad,E.controls.bank_limit_rad);
  n.heading=(s.heading??0)+E.controls.rudder_coefficient*clamp(finite(c.rudder,0),-1,1)*Math.max(0,Math.hypot(n.velocity[0],n.velocity[2]))*.08*h;
  n.pitch=clamp(n.pitch,E.controls.pitch_limits_rad[0],E.controls.pitch_limits_rad[1]);
  n.time=(s.time??0)+h;
  n.shaft_work_J=(s.shaft_work_J??0)+(dm.mo?.power??motor(mid,c,e).power)*h;
  n.aero_work_J=(s.aero_work_J??0)+(dm.a?.diss??aeroAndLoads(mid,c,e).diss)*h;
  const phaseDamp=Math.abs(E.coupled.phase_damping_Nm_s*mid.omega*mid.omega);
  const pitchDamp=Math.abs(E.coupled.pitch_damping_Nm_s*mid.pitch_rate*mid.pitch_rate);
  n.drive_heat_J=(s.drive_heat_J??0)+(Math.max(0,(dm.mo?.shaft??0)-(dm.mo?.drive??0))*Math.max(0,mid.omega)+phaseDamp+pitchDamp)*h;
  const pilot=E.coupled.pitch_control_torque_Nm*clamp(finite(c.pitch,0),-1,1);
  n.control_work_J=(s.control_work_J??0)+pilot*mid.pitch_rate*h;
  const burn=((dm.mo?.power??0)*E.fuel.bsfc_kg_kWh/3600000+(clamp(finite(c.throttle,0),0,1)>0&&s.fuel_kg>0?E.fuel.idle_kg_s:0))*h;
  n.fuel_kg=Math.max(0,(s.fuel_kg??0)-Math.max(0,burn));
  n.wheel_angle=(s.wheel_angle??0)+Math.hypot(mid.velocity[0],mid.velocity[2])/E.wheel_radius_m*h;
  if(dm.grounded){
    n.pitch=0;n.pitch_rate=0;
    n.position[1]=contactHeight({...n,pitch:0},e);
    const cg=mechanics(parameters,{...n,pitch:0},wingPose).cg;
    n.velocity[1]=cg[1]*0+mechanics(parameters,{...n,pitch:0},wingPose).dc[1]*n.omega;
    n.status='grounded';
  }else n.status='flying';
  const ch=contactHeight(n,e);
  if(n.position[1]<ch){
    const sink=n.velocity[1];
    if(sink<-E.controls.safe_touchdown_sink_m_s||Math.hypot(n.velocity[0],n.velocity[2])>E.controls.safe_touchdown_speed_m_s||Math.abs(n.roll)>E.controls.safe_touchdown_bank_rad)n.status='crashed';
    n.position[1]=ch;n.velocity[1]=Math.max(0,n.velocity[1]);n.pitch=0;n.pitch_rate=0;
    if(n.status!=='crashed')n.status='grounded';
  }
  return n;
}

export function step(state,controls=controls0,environment={},dt){
  let s={...state,position:state.position.slice(),velocity:state.velocity.slice()};
  const hmax=E.coupled.integration_dt_max,steps=Math.max(1,Math.ceil(dt/hmax)),h=dt/steps;
  for(let i=0;i<steps;i++){
    if(s.status==='crashed')break;
    s=advanceOnce(s,controls,environment,h);
  }
  return s;
}
