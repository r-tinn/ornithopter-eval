import {E} from './environment/engineering.mjs';
import {wingPose} from './kinematics.mjs';
import {mechanics,add,sub,mul,dot,cross,unit,bodyToWorld,worldToBody} from './environment/source-mechanism.mjs';

const AR=8.29;
export const parameters=Object.freeze({
  aspect_ratio:AR,wrist_span_fraction:.5,span_m:14,wing_area_m2:14*14/AR,
  body_length_m:6,pilot_mass_kg:55,dry_mass_kg:173.9,mass_kg:177.5,
  mass_budget:E.mass_budget,wheel_radius_m:E.wheel_radius_m,
  gear_centres:E.gear_centres_m.map(v=>v.slice())
});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const finite=(x,d=0)=>Number.isFinite(x)?x:d;

export function polar(region,alpha,camber){
  const table=E.sections[region.toLowerCase()],xs=E.sections.alpha_rad;
  const a=clamp(alpha,xs[0],xs[xs.length-1]);
  let i=0;while(i<xs.length-2&&a>xs[i+1])i++;
  const t=(a-xs[i])/(xs[i+1]-xs[i]);
  const lerp=v=>v[i]+(v[i+1]-v[i])*t;
  const CL=lerp(table.cl_base)+table.camber_lift_gain*(camber-table.camber_reference)*Math.cos(alpha);
  return {CL,CD:lerp(table.cd_base)+CL*CL/(Math.PI*E.aero.span_efficiency*parameters.aspect_ratio)};
}
function shaft(s,c,e){
  const throttle=clamp(finite(c.throttle),0,1),omega=s.omega;
  if(e.motor_enabled===false||s.gliding||!(s.fuel_kg>0)||!(throttle>0)||omega<0)return {shaft:0,drive:0,power:0};
  const target=2*Math.PI*E.engine.maximum_wingbeat_hz*throttle;
  const cap=Math.min(E.engine.starting_torque_Nm,E.engine.continuous_shaft_limit_W*throttle/Math.max(.5,Math.abs(omega)));
  const q=clamp(E.engine.governor_torque_gain_Nm_s*(target-omega),0,cap);
  return {shaft:q,drive:q*E.engine.transmission_efficiency,power:q*omega};
}
function airLoads(s,c,e,poseFn){
  const mech=mechanics(parameters,s,poseFn),rho=Math.max(0,finite(e.rho,E.rho_kg_m3));
  const wind=e.wind??[0,0,0],base=worldToBody(sub(s.velocity,wind),s);
  let F=[0,0,0],wing=[0,0,0],Qphi=0,Qpitch=0,diss=0;
  for(const q of mech.samples){
    const u=add(base,q.velocity),flow=sub(u,mul(q.span,dot(u,q.span))),speed=Math.hypot(...flow);
    if(speed<1e-10||q.area<=0||rho===0)continue;
    const d=mul(flow,1/speed),alpha=Math.atan2(-dot(d,q.normal),dot(d,q.chord));
    const p=polar(q.region,alpha,q.camber),lift=unit(cross(q.span,d));
    const f=mul(sub(mul(lift,p.CL),mul(d,p.CD)),.5*rho*speed*speed*q.area);
    F=add(F,f);wing=add(wing,f);Qphi+=dot(f,q.jphi);Qpitch+=dot(f,q.jtheta);
    diss+=.5*rho*speed*speed*q.area*p.CD*speed;
  }
  // Parasite drag acts at the airframe point represented relative to whole CG.
  const r0=mul(mech.cg,-1),j0=mul(mech.dc,-1),u0=add(base,add(mul(j0,s.omega),[-r0[1]*s.pitch_rate,r0[0]*s.pitch_rate,0]));
  const v0=Math.hypot(...u0),area=Object.values(E.aero.body_flat_plate_areas_m2).reduce((a,x)=>a+x,0);
  let bodyDrag=0;
  if(v0>1e-10&&rho>0){
    bodyDrag=.5*rho*v0*v0*area;
    const f=mul(u0,-bodyDrag/v0);F=add(F,f);Qphi+=dot(f,j0);Qpitch+=dot(f,[-r0[1],r0[0],0]);diss+=bodyDrag*v0;
  }
  // Conventional horizontal tail, including the local pitch and phase velocity.
  const rt=sub([-E.coupled.tail_arm_m,0,0],mech.cg),jt=mul(mech.dc,-1);
  const ut=add(base,add(mul(jt,s.omega),[-rt[1]*s.pitch_rate,rt[0]*s.pitch_rate,0]));
  const tv=Math.hypot(ut[0],ut[1]);
  if(tv>1e-10&&rho>0){
    const d=[ut[0]/tv,ut[1]/tv,0],alpha=Math.atan2(-d[1],d[0]);
    const CL=E.coupled.tail_lift_slope*clamp(alpha+E.coupled.tail_incidence_rad,-.35,.35);
    const CD=E.coupled.tail_drag_coefficient+.08*alpha*alpha,q=.5*rho*tv*tv*E.coupled.tail_area_m2;
    const f=add(mul(cross([0,0,1],d),q*CL),mul(d,-q*CD));
    F=add(F,f);Qphi+=dot(f,jt);Qpitch+=dot(f,[-rt[1],rt[0],0]);diss+=q*CD*tv;
  }
  // Rudder is a finite side-force completion, at the same tail arm.
  const hv=Math.hypot(ut[0],ut[2]);
  if(hv>1e-10&&rho>0&&c.rudder){
    const d=[ut[0]/hv,0,ut[2]/hv],side=unit(cross(d,[0,1,0]));
    const f=mul(side,.5*rho*hv*hv*E.coupled.tail_area_m2*E.controls.rudder_coefficient*clamp(c.rudder,-1,1));
    F=add(F,f);Qphi+=dot(f,jt);Qpitch+=dot(f,[-rt[1],rt[0],0]);
  }
  return {mech,F,wing,Qphi,Qpitch,diss,bodyDrag,base};
}
export function forces(s,c,e,poseOverride){
  const poseFn=typeof poseOverride==='function'?poseOverride:(poseOverride?(()=>poseOverride):wingPose);
  const a=airLoads(s,c,e,poseFn),motor=shaft(s,c,e),dampScale=finite(e.damping_scale,1);
  const phaseDamping=E.coupled.phase_damping_Nm_s*s.omega*dampScale;
  const pitchDamping=E.coupled.pitch_damping_Nm_s*s.pitch_rate*dampScale;
  const pilot=E.coupled.pitch_control_torque_Nm*clamp(finite(c.pitch),-1,1);
  const aeroWorld=bodyToWorld(a.F,s),g=finite(e.gravity,E.gravity_m_s2);
  const total=add(aeroWorld,[0,-a.mech.mass*g,0]),airSpeed=Math.hypot(...a.base);
  return {
    lift:a.wing[1],thrust:a.wing[0],drag:a.bodyDrag,power:motor.power,airspeed:airSpeed,
    aero_power_W:-a.Qphi*s.omega,wing_dissipation_W:a.diss,mass_kg:a.mech.mass,
    Qphi:a.Qphi,Qpitch:a.Qpitch,motor_torque_Nm:motor.drive,shaft_torque_Nm:motor.shaft,
    control_torque_Nm:pilot,phase_damping_Nm:phaseDamping,pitch_damping_Nm:pitchDamping,
    force:total,wing_force_body_N:a.wing,air_force_body_N:a.F,mechanics:a.mech,
    shaft_power_W:motor.power
  };
}
export function accelerations(s,c,e){
  const f=forces(s,c,e),m=f.mechanics;
  const R1=f.motor_torque_Nm+f.Qphi-m.Up-f.phase_damping_Nm-.5*m.Ap*s.omega*s.omega+.5*m.Cp*s.pitch_rate*s.pitch_rate;
  const R2=f.Qpitch+f.control_torque_Nm-f.pitch_damping_Nm-m.Bp*s.omega*s.omega-m.Cp*s.omega*s.pitch_rate;
  let phase_accel,pitch_accel;
  if(e.pitch_locked){
    phase_accel=R1/m.A;pitch_accel=0;
  }else{
    const det=m.A*m.C-m.B*m.B;
    phase_accel=(R1*m.C-R2*m.B)/det;
    pitch_accel=(R2*m.A-R1*m.B)/det;
  }
  return {...f,phase_accel,pitch_accel,translation_accel:mul(f.force,1/m.mass)};
}
function contactInfo(s,e){
  let best=-Infinity;
  for(const gear of parameters.gear_centres){
    const rel=sub(gear,mechanics(parameters,s,wingPose).cg),wr=bodyToWorld(rel,s);
    const h=e.surfaceHeight?e.surfaceHeight(s.position[0]+wr[0],s.position[2]+wr[2]):0;
    best=Math.max(best,h+parameters.wheel_radius_m-wr[1]);
  }
  return best;
}
export function contactHeight(s,e){return contactInfo(s,e);}
function derivative(s,c,e,grounded=false){
  const a=accelerations(s,c,e),m=a.mechanics;
  let pa=a.phase_accel,pra=a.pitch_accel,ay=a.translation_accel[1];
  if(grounded){
    const Ag=m.A+m.mass*m.dc[1]*m.dc[1],Agp=m.Ap+2*m.mass*m.dc[1]*m.ddc[1];
    pa=(a.motor_torque_Nm+a.Qphi-m.Up-a.phase_damping_Nm-.5*Agp*s.omega*s.omega+a.force[1]*m.dc[1])/Ag;
    pra=0;ay=m.ddc[1]*s.omega*s.omega+m.dc[1]*pa;
  }
  return {a,phase:s.omega,omega:pa,pitch:s.pitch_rate,pitch_rate:pra,
    position:s.velocity,velocity:[a.translation_accel[0],ay,a.translation_accel[2]]};
}
const midState=(s,k,h)=>({...s,position:s.position.map((x,i)=>x+k.position[i]*h),velocity:s.velocity.map((x,i)=>x+k.velocity[i]*h),
  phase:s.phase+k.phase*h,omega:s.omega+k.omega*h,pitch:s.pitch+k.pitch*h,pitch_rate:s.pitch_rate+k.pitch_rate*h});
export function step(state,controls,environment,dt){
  let s={...state,position:state.position.slice(),velocity:state.velocity.slice()};
  const n=Math.max(1,Math.ceil(dt/E.coupled.integration_dt_max)),h=dt/n;
  for(let j=0;j<n;j++){
    const floor=contactHeight(s,environment),grounded=s.status==='grounded'||(s.position[1]<=floor+1e-4&&s.velocity[1]<=0);
    const k1=derivative(s,controls,environment,grounded),mid=midState(s,k1,h/2),k=derivative(mid,controls,environment,grounded);
    const oldFuel=s.fuel_kg;
    s=midState(s,k,h);
    s.time=finite(s.time)+h;
    const commanded=environment.motor_enabled!==false&&!mid.gliding&&controls.throttle>0&&oldFuel>0;
    const burn=k.a.power*E.fuel.bsfc_kg_kWh/3600000+(commanded?E.fuel.idle_kg_s:0);
    s.fuel_kg=Math.max(0,oldFuel-burn*h);
    s.shaft_work_J=finite(s.shaft_work_J)+k.a.power*h;
    s.aero_work_J=finite(s.aero_work_J)+k.a.wing_dissipation_W*h;
    s.drive_heat_J=finite(s.drive_heat_J)+((k.a.shaft_power_W-k.a.motor_torque_Nm*mid.omega)+
      k.a.phase_damping_Nm*mid.omega+k.a.pitch_damping_Nm*mid.pitch_rate)*h;
    s.control_work_J=finite(s.control_work_J)+k.a.control_torque_Nm*mid.pitch_rate*h;
    // Finite roll/yaw controls; neutral bank holds rather than self-levelling.
    const rr=s.roll_rate+(E.controls.roll_accel_rad_s2*clamp(finite(controls.bank),-1,1)-E.controls.roll_damping_per_s*s.roll_rate)*h;
    s.roll=clamp(s.roll+rr*h,-E.controls.bank_limit_rad,E.controls.bank_limit_rad);s.roll_rate=rr;
    const speed=Math.hypot(s.velocity[0],s.velocity[2]);
    s.heading+=E.controls.rudder_coefficient*clamp(finite(controls.rudder),-1,1)*speed*h/Math.max(5,speed);
    s.wheel_angle=finite(s.wheel_angle)+speed*h/parameters.wheel_radius_m;
    if(grounded){
      const normal=k.a.mechanics.mass*(k.a.mechanics.ddc[1]*mid.omega*mid.omega+k.omega*k.a.mechanics.dc[1])-k.a.force[1];
      if(normal>=0){
        s.pitch=0;s.pitch_rate=0;s.position[1]=contactHeight(s,environment);s.velocity[1]=k.a.mechanics.dc[1]*s.omega;s.status='grounded';
        const loss=(E.controls.rolling_friction_coefficient*normal+E.controls.brake_force_N*clamp(finite(controls.brake),0,1))*h/k.a.mechanics.mass;
        const vxz=Math.hypot(s.velocity[0],s.velocity[2]);
        if(vxz>0){const nv=Math.max(0,vxz-loss);s.velocity[0]*=nv/vxz;s.velocity[2]*=nv/vxz;}
      }else s.status='flying';
    }else{
      const ch=contactHeight(s,environment);
      if(s.position[1]<ch){
        const sink=s.velocity[1]-k.a.mechanics.dc[1]*s.omega;
        if(sink < -E.controls.safe_touchdown_sink_m_s||Math.hypot(s.velocity[0],s.velocity[2])>E.controls.safe_touchdown_speed_m_s||Math.abs(s.roll)>E.controls.safe_touchdown_bank_rad)s.status='crashed';
        else {s.status='grounded';s.position[1]=ch;s.velocity[1]=k.a.mechanics.dc[1]*s.omega;s.pitch=0;s.pitch_rate=0;}
      }else s.status='flying';
    }
  }
  return s;
}
