import {E} from './environment/engineering.mjs';
import {mechanics,bodyToWorld,worldToBody,add,sub,mul,dot,cross,unit} from './environment/source-mechanism.mjs';
import {wingPose} from './kinematics.mjs';

export const parameters={
  aspect_ratio:8.29,wrist_span_fraction:.5,span_m:E.span_m,
  wing_area_m2:E.span_m*E.span_m/8.29,body_length_m:E.body_length_m,
  pilot_mass_kg:E.pilot_mass_kg,dry_mass_kg:E.dry_mass_including_pilot_kg,
  mass_kg:E.dry_mass_including_pilot_kg+E.fuel.initial_kg,
  mass_budget:E.mass_budget,wheel_radius_m:E.wheel_radius_m,
  gear_centres:E.gear_centres_m
};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

export function polar(region,alpha,camber){
  const xs=E.sections.alpha_rad,t=E.sections[region];
  let i=0;
  if(alpha<=xs[0]) i=0;
  else if(alpha>=xs[xs.length-1]) i=xs.length-2;
  else while(i<xs.length-2&&alpha>xs[i+1])i++;
  const f=clamp((alpha-xs[i])/(xs[i+1]-xs[i]),0,1);
  const lerp=a=>a[i]+f*(a[i+1]-a[i]);
  const CL=lerp(t.cl_base)+t.camber_lift_gain*(camber-t.camber_reference)*Math.cos(alpha);
  return {CL,CD:lerp(t.cd_base)+CL*CL/(Math.PI*E.aero.span_efficiency*parameters.aspect_ratio)};
}
function drive(s,c,e){
  const throttle=clamp(c.throttle||0,0,1),on=(e.motor_enabled!==false)&&!s.gliding&&s.fuel_kg>0&&throttle>0&&s.omega>=0;
  if(!on)return {shaft:0,torque:0,power:0};
  const target=2*Math.PI*E.engine.maximum_wingbeat_hz*throttle;
  const shaft=clamp(E.engine.governor_torque_gain_Nm_s*(target-s.omega),0,
    Math.min(E.engine.starting_torque_Nm,E.engine.continuous_shaft_limit_W*throttle/Math.max(.5,Math.abs(s.omega))));
  return {shaft,torque:shaft*E.engine.transmission_efficiency,power:shaft*s.omega};
}
function airVelocity(s,e){
  return worldToBody(sub(s.velocity,e.wind||[0,0,0]),s);
}
function addLoad(acc,F,r,jphi,jtheta,loss){
  acc.F=add(acc.F,F);acc.Qphi+=dot(F,jphi);acc.Qpitch+=dot(F,jtheta);
  acc.loss+=loss; acc.moment=add(acc.moment,cross(r,F));
}
export function forces(s,c,e,poseOverride){
  const poseFn=poseOverride?(typeof poseOverride==='function'?poseOverride:()=>poseOverride):wingPose;
  const m=mechanics(parameters,s,poseFn),rho=e.rho===undefined?E.rho_kg_m3:e.rho;
  const base=airVelocity(s,e),a={F:[0,0,0],Qphi:0,Qpitch:0,loss:0,moment:[0,0,0]},wing=[0,0,0];
  for(const p of m.samples){
    if(p.area<=0)continue;
    let u=add(base,p.velocity);u=sub(u,mul(p.span,dot(u,p.span)));
    const speed=Math.hypot(...u);if(speed<1e-12)continue;
    const d=mul(u,1/speed),alpha=Math.atan2(-dot(d,p.normal),dot(d,p.chord));
    const pc=polar(p.region,alpha,p.camber),lift=unit(cross(p.span,d));
    const F=mul(sub(mul(lift,pc.CL),mul(d,pc.CD)),.5*rho*speed*speed*p.area);
    addLoad(a,F,p.r,p.jphi,p.jtheta,.5*rho*speed*speed*p.area*pc.CD*speed);
    wing.splice(0,3,...add(wing,F));
  }
  // Parasitic airframe drag acts at the body mass point relative to whole CG.
  const r0=mul(m.cg,-1),j0=mul(m.dc,-1),ub=add(base,add(mul(j0,s.omega),[-r0[1]*s.pitch_rate,r0[0]*s.pitch_rate,0]));
  const vb=Math.hypot(...ub),flat=Object.values(E.aero.body_flat_plate_areas_m2).reduce((x,y)=>x+y,0);
  let bodyDrag=0;
  if(vb>1e-12){bodyDrag=.5*rho*vb*vb*flat;addLoad(a,mul(ub,-bodyDrag/vb),r0,j0,[-r0[1],r0[0],0],bodyDrag*vb);}
  // Conventional horizontal tail, its incidence entering only the lift law.
  const rt=sub([-E.coupled.tail_arm_m,0,0],m.cg),jt=mul(m.dc,-1);
  const ut=add(base,add(mul(jt,s.omega),[-rt[1]*s.pitch_rate,rt[0]*s.pitch_rate,0]));
  const vh=Math.hypot(ut[0],ut[1]);
  if(vh>1e-12){
    const d=[ut[0]/vh,ut[1]/vh,0],alpha=Math.atan2(-ut[1],ut[0]);
    const CL=E.coupled.tail_lift_slope*clamp(alpha+E.coupled.tail_incidence_rad,-.35,.35);
    const CD=E.coupled.tail_drag_coefficient+.08*alpha*alpha,q=.5*rho*vh*vh*E.coupled.tail_area_m2;
    const F=mul(sub(mul(cross([0,0,1],d),CL),mul(d,CD)),q);
    addLoad(a,F,rt,jt,[-rt[1],rt[0],0],q*CD*vh);
  }
  // Rudder is a finite side-force control, not hidden thrust.
  const vr=Math.hypot(ut[0],ut[2]);
  if(vr>1e-12&&c.rudder){
    const d=[ut[0]/vr,0,ut[2]/vr],side=unit(cross([0,1,0],d));
    const F=mul(side,.5*rho*vr*vr*E.coupled.tail_area_m2*E.controls.rudder_coefficient*clamp(c.rudder,-1,1));
    addLoad(a,F,rt,jt,[-rt[1],rt[0],0],0);
  }
  const motor=drive(s,c,e),ds=e.damping_scale===undefined?1:e.damping_scale;
  const phaseD=ds*E.coupled.phase_damping_Nm_s*s.omega;
  const pitchD=ds*E.coupled.pitch_damping_Nm_s*s.pitch_rate;
  const control=E.coupled.pitch_control_torque_Nm*clamp(c.pitch||0,-1,1);
  let total=bodyToWorld(a.F,s),g=e.gravity===undefined?E.gravity_m_s2:e.gravity;
  total[1]-=m.mass*g;
  const wb=bodyToWorld(wing,s);
  return {lift:wb[1],thrust:wing[0],drag:bodyDrag,power:motor.power,airspeed:Math.hypot(...base),
    aero_power_W:-a.Qphi*s.omega,wing_dissipation_W:a.loss,mass_kg:m.mass,Qphi:a.Qphi,Qpitch:a.Qpitch,
    motor_torque_Nm:motor.torque,shaft_torque_Nm:motor.shaft,control_torque_Nm:control,
    phase_damping_Nm:phaseD,pitch_damping_Nm:pitchD,force:total,wing_force_body_N:wing,
    mechanics:m,body_force_N:a.F,body_moment_Nm:a.moment,shaft_power_W:motor.power};
}
export function accelerations(s,c,e){
  const f=forces(s,c,e),m=f.mechanics;
  const R1=f.motor_torque_Nm+f.Qphi-m.Up-f.phase_damping_Nm-.5*m.Ap*s.omega*s.omega+.5*m.Cp*s.pitch_rate*s.pitch_rate;
  const R2=f.Qpitch+f.control_torque_Nm-f.pitch_damping_Nm-m.Bp*s.omega*s.omega-m.Cp*s.omega*s.pitch_rate;
  let pa,qa,grounded=false,normal_load_N=0;
  if(e.pitch_locked){pa=R1/m.A;qa=0;}
  else {const det=m.A*m.C-m.B*m.B;pa=(R1*m.C-R2*m.B)/det;qa=(R2*m.A-R1*m.B)/det;}
  // Reduced all-three-wheels runway constraint from the production mass
  // geometry. It is discarded immediately when its normal reaction is tensile.
  if(!e.pitch_locked&&e.surfaceHeight&&s.position[1]<=contactHeight(s,e)+.003&&s.velocity[1]<=.25){
    const Ag=m.A+m.mass*m.dc[1]*m.dc[1],Agp=m.Ap+2*m.mass*m.dc[1]*m.ddc[1];
    const pg=(f.motor_torque_Nm+f.Qphi-m.Up-f.phase_damping_Nm-.5*Agp*s.omega*s.omega+
      f.force[1]*m.dc[1])/Ag;
    const n=m.mass*(m.ddc[1]*s.omega*s.omega+m.dc[1]*pg)-f.force[1];
    if(n>=0){pa=pg;qa=0;grounded=true;normal_load_N=n;}
  }
  return {...f,phase_accel:pa,pitch_accel:qa,acceleration:mul(f.force,1/m.mass),grounded,normal_load_N};
}
export function contactHeight(s,e){
  const cg=mechanics(parameters,s,wingPose).cg;
  let h=-Infinity;
  for(const gear of E.gear_centres_m){
    const off=bodyToWorld(sub(gear,cg),s),x=s.position[0]+off[0],z=s.position[2]+off[2];
    h=Math.max(h,(e.surfaceHeight?e.surfaceHeight(x,z):0)-off[1]+E.wheel_radius_m);
  }
  return h;
}
function deriv(s,c,e){
  const a=accelerations(s,c,e),ground=a.grounded;
  let av=a.acceleration.slice();
  if(ground){
    av[1]=0;
    const speed=Math.hypot(s.velocity[0],s.velocity[2]),normal=a.normal_load_N;
    if(speed>.01){const loss=E.controls.rolling_friction_coefficient*normal+(c.brake||0)*E.controls.brake_force_N;av[0]-=loss*s.velocity[0]/speed/a.mass_kg;av[2]-=loss*s.velocity[2]/speed/a.mass_kg;}
  }
  return {a,av,ground,velocity:s.velocity,omega:s.omega,pitch_rate:s.pitch_rate,roll_rate:s.roll_rate||0};
}
const advance=(s,d,h)=>({...s,position:add(s.position,mul(d.velocity,h)),velocity:add(s.velocity,mul(d.av,h)),
  phase:s.phase+d.omega*h,omega:s.omega+d.a.phase_accel*h,pitch:s.pitch+d.pitch_rate*h,
  pitch_rate:s.pitch_rate+d.a.pitch_accel*h,roll:s.roll+d.roll_rate*h,
  roll_rate:(s.roll_rate||0)+(E.controls.roll_accel_rad_s2*(d.controlsBank||0)-E.controls.roll_damping_per_s*(s.roll_rate||0))*h,
  heading:s.heading});
export function step(state,controls,environment,dt){
  let s={...state,position:state.position.slice(),velocity:state.velocity.slice()},left=dt;
  while(left>1e-12){
    const h=Math.min(left,E.coupled.integration_dt_max),d1=deriv(s,controls,environment);d1.controlsBank=clamp(controls.bank||0,-1,1);
    const mid=advance(s,d1,h/2),d2=deriv(mid,controls,environment);d2.controlsBank=d1.controlsBank;
    const old=s;s=advance(s,d2,h);
    s.time=(old.time||0)+h;
    const commanded=(environment.motor_enabled!==false)&&!old.gliding&&old.fuel_kg>0&&(controls.throttle||0)>0;
    const burn=(d2.a.shaft_power_W*E.fuel.bsfc_kg_kWh/3600000+(commanded?E.fuel.idle_kg_s:0))*h;
    s.fuel_kg=Math.max(0,old.fuel_kg-burn);
    s.shaft_work_J=(old.shaft_work_J||0)+d2.a.shaft_power_W*h;
    s.aero_work_J=(old.aero_work_J||0)+d2.a.wing_dissipation_W*h;
    s.drive_heat_J=(old.drive_heat_J||0)+((1-E.engine.transmission_efficiency)*d2.a.shaft_power_W+
      d2.a.phase_damping_Nm*mid.omega+d2.a.pitch_damping_Nm*mid.pitch_rate)*h;
    s.control_work_J=(old.control_work_J||0)+d2.a.control_torque_Nm*mid.pitch_rate*h;
    const ch=contactHeight(s,environment);
    const touching=d2.a.grounded||s.position[1]<ch;
    if(touching){
      const wasFlying=old.status==='flying'||old.position[1]>contactHeight(old,environment)+.05;
      const gearSink=old.velocity[1]-d2.a.mechanics.dc[1]*old.omega;
      if(wasFlying&&(-gearSink>E.controls.safe_touchdown_sink_m_s||
        Math.hypot(old.velocity[0],old.velocity[2])>E.controls.safe_touchdown_speed_m_s||
        Math.abs(old.roll)>E.controls.safe_touchdown_bank_rad))s.status='crashed';
      else if(s.status!=='crashed')s.status='grounded';
      s.position[1]=ch;
      s.velocity[1]=d2.a.grounded?d2.a.mechanics.dc[1]*s.omega:Math.max(0,s.velocity[1]);
      if(d2.a.grounded){s.pitch=0;s.pitch_rate=0;}
    }else if(s.position[1]>ch+.03&&s.status!=='crashed')s.status='flying';
    const speed=Math.hypot(s.velocity[0],s.velocity[2]);s.wheel_angle=(old.wheel_angle||0)+speed*h/E.wheel_radius_m;
    left-=h;
  }
  return s;
}
