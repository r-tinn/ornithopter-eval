import {E} from './environment/engineering.mjs';
import {wingPose} from './kinematics.mjs';
import {mechanics,centre,add,sub,mul,dot,cross,unit,bodyToWorld,worldToBody} from './environment/source-mechanism.mjs';

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
function lerpTable(xs,ys,x){
  if(x<=xs[0])return ys[0];
  const n=xs.length;if(x>=xs[n-1])return ys[n-1];
  let i=1;while(xs[i]<x)i++;
  const t=(x-xs[i-1])/(xs[i]-xs[i-1]);
  return ys[i-1]+t*(ys[i]-ys[i-1]);
}
export function polar(region,alpha,camber){
  const q=E.sections[region],cl=lerpTable(E.sections.alpha_rad,q.cl_base,alpha)+
    q.camber_lift_gain*(camber-q.camber_reference)*Math.cos(alpha);
  const cd=lerpTable(E.sections.alpha_rad,q.cd_base,alpha)+
    cl*cl/(Math.PI*E.aero.span_efficiency*parameters.aspect_ratio);
  return {CL:cl,CD:cd,cl,cd};
}
function localAir(s,e){
  return worldToBody(sub(s.velocity,e.wind??[0,0,0]),s);
}
function motor(s,c,e){
  const throttle=clamp(c.throttle??0,0,1);
  if(!(s.fuel_kg>0&&throttle>0&&s.omega>=0&&(e.motor_enabled??true)&&!s.gliding))
    return {shaft:0,drive:0,power:0};
  const target=2*Math.PI*E.engine.maximum_wingbeat_hz*throttle;
  const shaft=clamp(E.engine.governor_torque_gain_Nm_s*(target-s.omega),0,
    Math.min(E.engine.starting_torque_Nm,
      E.engine.continuous_shaft_limit_W*throttle/Math.max(.5,Math.abs(s.omega))));
  return {shaft,drive:shaft*E.engine.transmission_efficiency,power:shaft*s.omega};
}
function aerodynamic(s,c,e,poseOverride){
  const poseFn=typeof poseOverride==='function'?poseOverride:
    (poseOverride?(()=>poseOverride):wingPose);
  const m=mechanics(parameters,s,poseFn),rho=e.rho??E.rho_kg_m3;
  const aircraftAir=localAir(s,e);
  let wing=[0,0,0],total=[0,0,0],Qphi=0,Qpitch=0,diss=0;
  for(const q of m.samples){
    let u=add(aircraftAir,q.velocity);
    u=sub(u,mul(q.span,dot(u,q.span)));
    const speed=Math.hypot(...u);
    if(speed<1e-10||rho===0)continue;
    const d=mul(u,1/speed),alpha=Math.atan2(-dot(d,q.normal),dot(d,q.chord));
    const p=polar(q.region,alpha,q.camber);
    const F=mul(sub(mul(unit(cross(q.span,d)),p.CL),mul(d,p.CD)),
      .5*rho*speed*speed*q.area);
    wing=add(wing,F);total=add(total,F);
    Qphi+=dot(F,q.jphi);Qpitch+=dot(F,q.jtheta);
    diss+=.5*rho*speed*speed*q.area*p.CD*speed;
  }
  // Parasite drag acts at the fixed airframe origin, whose local motion is -dc.
  const r0=mul(m.cg,-1),j0=mul(m.dc,-1);
  const ub=add(aircraftAir,add(mul(j0,s.omega),mul([-r0[1],r0[0],0],s.pitch_rate)));
  const vb=Math.hypot(...ub),flat=Object.values(E.aero.body_flat_plate_areas_m2).reduce((a,b)=>a+b,0);
  let bodyDrag=0;
  if(vb>1e-10&&rho!==0){
    bodyDrag=.5*rho*vb*vb*flat;
    const F=mul(ub,-bodyDrag/vb);total=add(total,F);
    Qphi+=dot(F,j0);Qpitch+=dot(F,[-r0[1],r0[0],0]);diss+=bodyDrag*vb;
  }
  // Conventional horizontal tail, evaluated in its own moving x/y plane.
  const rt=sub([-E.coupled.tail_arm_m,0,0],m.cg),jt=mul(m.dc,-1);
  const jtheta=[-rt[1],rt[0],0];
  const ut=add(aircraftAir,add(mul(jt,s.omega),mul(jtheta,s.pitch_rate)));
  const vt=Math.hypot(ut[0],ut[1]);
  if(vt>1e-10&&rho!==0){
    const d=[ut[0]/vt,ut[1]/vt,0];
    const alpha=Math.atan2(-ut[1],ut[0]);
    const CL=E.coupled.tail_lift_slope*clamp(alpha+E.coupled.tail_incidence_rad,-.35,.35);
    const CD=E.coupled.tail_drag_coefficient+.08*alpha*alpha;
    const lift=unit(cross([0,0,1],d));
    const F=mul(sub(mul(lift,CL),mul(d,CD)),.5*rho*vt*vt*E.coupled.tail_area_m2);
    total=add(total,F);Qphi+=dot(F,jt);Qpitch+=dot(F,jtheta);
    diss+=.5*rho*vt*vt*E.coupled.tail_area_m2*CD*vt;
  }
  // Rudder is a reduced side-force control on the same tail area.
  const vh=Math.hypot(ut[0],ut[2]);
  if(vh>1e-10&&rho!==0&&(c.rudder??0)!==0){
    const d=[ut[0]/vh,0,ut[2]/vh],side=unit(cross([0,1,0],d));
    const F=mul(side,.5*rho*vh*vh*E.coupled.tail_area_m2*
      E.controls.rudder_coefficient*clamp(c.rudder,-1,1));
    total=add(total,F);Qphi+=dot(F,jt);Qpitch+=dot(F,jtheta);
  }
  return {m,total,wing,Qphi,Qpitch,diss,bodyDrag,aircraftAir,
    airspeed:Math.hypot(...aircraftAir)};
}
export function forces(s,c,e,poseOverride){
  const a=aerodynamic(s,c,e,poseOverride),mot=motor(s,c,e);
  const g=e.gravity??E.gravity_m_s2;
  const worldAero=bodyToWorld(a.total,s);
  const force=add(worldAero,[0,-a.m.mass*g,0]);
  const dampScale=e.damping_scale??1;
  const phaseDamping=(E.coupled.phase_damping_Nm_s+E.engine.drive_friction_Nm_s)*
    s.omega*dampScale;
  const pitchDamping=E.coupled.pitch_damping_Nm_s*s.pitch_rate*dampScale;
  const controlTorque=E.coupled.pitch_control_torque_Nm*clamp(c.pitch??0,-1,1);
  return {lift:a.wing[1],thrust:a.wing[0],drag:a.bodyDrag,power:mot.power,
    airspeed:a.airspeed,aero_power_W:-a.Qphi*s.omega,
    wing_dissipation_W:a.diss,mass_kg:a.m.mass,Qphi:a.Qphi,Qpitch:a.Qpitch,
    motor_torque_Nm:mot.drive,shaft_torque_Nm:mot.shaft,
    control_torque_Nm:controlTorque,phase_damping_Nm:phaseDamping,
    pitch_damping_Nm:pitchDamping,force,wing_force_body_N:a.wing,
    mechanics:a.m,aero_force_body_N:a.total};
}
function solveDynamics(s,c,e){
  const f=forces(s,c,e),m=f.mechanics;
  const R1=f.motor_torque_Nm+f.Qphi-m.Up-f.phase_damping_Nm-
    .5*m.Ap*s.omega*s.omega+.5*m.Cp*s.pitch_rate*s.pitch_rate;
  if(e.pitch_locked){
    return {...f,phase_accel:R1/m.A,pitch_accel:0};
  }
  const R2=f.Qpitch+f.control_torque_Nm-f.pitch_damping_Nm-
    m.Bp*s.omega*s.omega-m.Cp*s.omega*s.pitch_rate;
  const det=m.A*m.C-m.B*m.B;
  return {...f,phase_accel:(R1*m.C-R2*m.B)/det,
    pitch_accel:(R2*m.A-R1*m.B)/det};
}
export function accelerations(s,c,e){
  const d=solveDynamics(s,c,e);
  return {phase_accel:d.phase_accel,pitch_accel:d.pitch_accel,
    force:d.force,acceleration:mul(d.force,1/d.mass_kg)};
}
function clearance(s,e){
  return s.position[1]-contactHeight(s,e);
}
export function contactHeight(s,e){
  const cg=centre(parameters,s,wingPose);
  let required=-Infinity;
  for(const gear of E.gear_centres_m){
    const rel=bodyToWorld(sub(gear,cg),s);
    const x=s.position[0]+rel[0],z=s.position[2]+rel[2];
    const ground=(e.surfaceHeight?.(x,z)??0);
    required=Math.max(required,ground+E.wheel_radius_m-rel[1]);
  }
  return required;
}
function rates(s,c,e,groundHint=false){
  const d=solveDynamics(s,c,e),m=d.mechanics;
  let pa=d.phase_accel,pia=d.pitch_accel,acc=mul(d.force,1/d.mass_kg),ground=false,normal=0;
  if(groundHint){
    const Ag=m.A+m.mass*m.dc[1]*m.dc[1];
    const Agp=m.Ap+2*m.mass*m.dc[1]*m.ddc[1];
    pa=(d.motor_torque_Nm+d.Qphi-m.Up-d.phase_damping_Nm-.5*Agp*s.omega*s.omega+
      d.force[1]*m.dc[1])/Ag;
    normal=m.mass*(m.ddc[1]*s.omega*s.omega+m.dc[1]*pa)-d.force[1];
    if(normal>=0){
      ground=true;pia=0;
      const horizontal=Math.hypot(s.velocity[0],s.velocity[2]);
      let loss=E.controls.rolling_friction_coefficient*normal+
        E.controls.brake_force_N*clamp(c.brake??0,0,1);
      loss=Math.min(loss,horizontal*m.mass/Math.max(E.coupled.integration_dt_max,1e-4));
      const fr=horizontal>1e-8?[-loss*s.velocity[0]/horizontal,0,-loss*s.velocity[2]/horizontal]:[0,0,0];
      acc=mul(add(d.force,fr),1/m.mass);acc[1]=0;
    }
  }
  const rollAccel=E.controls.roll_accel_rad_s2*clamp(c.bank??0,-1,1)-
    E.controls.roll_damping_per_s*s.roll_rate;
  const speed=Math.hypot(s.velocity[0],s.velocity[2]);
  const headingRate=E.controls.rudder_coefficient*clamp(c.rudder??0,-1,1)+
    (speed>2?(e.gravity??E.gravity_m_s2)*Math.tan(s.roll)/speed:0);
  return {d,pa,pia,acc,ground,normal,rollAccel,headingRate};
}
function advanceOne(s,c,e,h){
  const near=clearance(s,e)<=.015||s.status==='grounded';
  const k1=rates(s,c,e,near);
  const mid={...s,position:s.position.map((x,i)=>x+.5*h*s.velocity[i]),
    velocity:s.velocity.map((x,i)=>x+.5*h*k1.acc[i]),
    phase:s.phase+.5*h*s.omega,omega:s.omega+.5*h*k1.pa,
    pitch:s.pitch+.5*h*s.pitch_rate,pitch_rate:s.pitch_rate+.5*h*k1.pia,
    roll:s.roll+.5*h*s.roll_rate,roll_rate:s.roll_rate+.5*h*k1.rollAccel,
    heading:s.heading+.5*h*k1.headingRate};
  const k2=rates(mid,c,e,k1.ground);
  const n={...s,position:s.position.map((x,i)=>x+h*mid.velocity[i]),
    velocity:s.velocity.map((x,i)=>x+h*k2.acc[i]),
    phase:s.phase+h*mid.omega,omega:s.omega+h*k2.pa,
    pitch:s.pitch+h*mid.pitch_rate,pitch_rate:s.pitch_rate+h*k2.pia,
    roll:s.roll+h*mid.roll_rate,roll_rate:s.roll_rate+h*k2.rollAccel,
    heading:s.heading+h*k2.headingRate,time:s.time+h};
  if(e.pitch_locked){n.pitch=s.pitch;n.pitch_rate=s.pitch_rate;}
  n.roll=clamp(n.roll,-E.controls.bank_limit_rad,E.controls.bank_limit_rad);
  if(Math.abs(n.roll)>=E.controls.bank_limit_rad&&n.roll*n.roll_rate>0)n.roll_rate=0;
  if(k2.ground){
    n.pitch=0;n.pitch_rate=0;n.position[1]=contactHeight(n,e);
    const mm=mechanics(parameters,n,wingPose);
    n.velocity[1]=mm.dc[1]*n.omega;
    n.status='grounded';
    n.wheel_angle=(s.wheel_angle??0)+Math.hypot(n.position[0]-s.position[0],n.position[2]-s.position[2])/E.wheel_radius_m;
  }else{
    const ch=clearance(n,e);
    if(ch<0){
      const mm=mechanics(parameters,n,wingPose);
      const sink=n.velocity[1]-bodyToWorld(mul(mm.dc,n.omega),n)[1];
      if(-sink>E.controls.safe_touchdown_sink_m_s||
         Math.hypot(n.velocity[0],n.velocity[2])>E.controls.safe_touchdown_speed_m_s||
         Math.abs(n.roll)>E.controls.safe_touchdown_bank_rad)n.status='crashed';
      else {
        n.pitch=0;n.pitch_rate=0;n.position[1]=contactHeight(n,e);
        const landed=mechanics(parameters,n,wingPose);
        n.velocity[1]=landed.dc[1]*n.omega;n.status='grounded';
      }
    }else n.status='flying';
  }
  const q=k2.d,commanded=(c.throttle??0)>0&&(e.motor_enabled??true)&&!mid.gliding&&mid.fuel_kg>0;
  const fuel=h*(q.power*E.fuel.bsfc_kg_kWh/3600000+(commanded?E.fuel.idle_kg_s:0));
  n.fuel_kg=Math.max(0,s.fuel_kg-fuel);
  n.shaft_work_J=(s.shaft_work_J??0)+q.power*h;
  n.aero_work_J=(s.aero_work_J??0)+q.wing_dissipation_W*h;
  const transmission=q.power*(1-E.engine.transmission_efficiency);
  const damping=q.phase_damping_Nm*mid.omega+q.pitch_damping_Nm*mid.pitch_rate;
  n.drive_heat_J=(s.drive_heat_J??0)+(transmission+damping)*h;
  n.control_work_J=(s.control_work_J??0)+q.control_torque_Nm*mid.pitch_rate*h;
  return n;
}
export function step(state,controls,environment,dt){
  let s={...state,position:state.position.slice(),velocity:state.velocity.slice()};
  const count=Math.max(1,Math.ceil(dt/E.coupled.integration_dt_max)),h=dt/count;
  for(let i=0;i<count;i++)s=advanceOne(s,controls,environment,h);
  return s;
}
