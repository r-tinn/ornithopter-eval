import {E} from './environment/engineering.mjs';
import {wingPose} from './kinematics.mjs';
import {mechanics,bodyToWorld,worldToBody,add,sub,mul,dot,cross,unit} from './environment/source-mechanism.mjs';

export const parameters={
  aspect_ratio:8.29,
  wrist_span_fraction:.5,
  span_m:E.span_m,
  wing_area_m2:E.span_m*E.span_m/8.29,
  body_length_m:E.body_length_m,
  pilot_mass_kg:E.pilot_mass_kg,
  dry_mass_kg:E.dry_mass_including_pilot_kg,
  mass_kg:E.dry_mass_including_pilot_kg+E.fuel.initial_kg,
  mass_budget:E.mass_budget,
  wheel_radius_m:E.wheel_radius_m,
  gear_centres:E.gear_centres_m.map(x=>x.slice())
};

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const finite=x=>Number.isFinite(x)?x:0;
function interp(xs,ys,x){
  if(x<=xs[0])return ys[0];
  const n=xs.length;if(x>=xs[n-1])return ys[n-1];
  let i=0;while(i<n-2&&x>xs[i+1])i++;
  const t=(x-xs[i])/(xs[i+1]-xs[i]);
  return ys[i]+t*(ys[i+1]-ys[i]);
}
export function polar(region,alpha,camber){
  const key=String(region).toLowerCase(),q=E.sections[key];
  if(!q)throw Error('Unknown aerodynamic region '+region);
  const cl0=interp(E.sections.alpha_rad,q.cl_base,alpha);
  const CL=cl0+q.camber_lift_gain*(camber-q.camber_reference)*Math.cos(alpha);
  const CD=interp(E.sections.alpha_rad,q.cd_base,alpha)+CL*CL/(Math.PI*E.aero.span_efficiency*parameters.aspect_ratio);
  return {CL,CD};
}

function shaft(s,c,e){
  const throttle=clamp(finite(c.throttle),0,1);
  if(e.motor_enabled===false||s.gliding||!(s.fuel_kg>0)||throttle<=0||s.omega<0)return {shaftTorque:0,driveTorque:0,power:0};
  const target=2*Math.PI*E.engine.maximum_wingbeat_hz*throttle;
  const cap=Math.min(E.engine.starting_torque_Nm,E.engine.continuous_shaft_limit_W*throttle/Math.max(.5,Math.abs(s.omega)));
  const shaftTorque=clamp(E.engine.governor_torque_gain_Nm_s*(target-s.omega),0,cap);
  return {shaftTorque,driveTorque:shaftTorque*E.engine.transmission_efficiency,power:shaftTorque*s.omega};
}

function aerodynamic(s,c,e,poseFn){
  const M=mechanics(parameters,s,poseFn),rho=Math.max(0,finite(e.rho??E.rho_kg_m3));
  const wind=e.wind??[0,0,0],base=worldToBody(sub(s.velocity,wind),s);
  let wing=[0,0,0],all=[0,0,0],Qphi=0,Qpitch=0,wingLoss=0,totalLoss=0;
  const apply=(F,r,jphi,jtheta,loss,isWing=false)=>{
    all=add(all,F);if(isWing)wing=add(wing,F);
    Qphi+=dot(F,jphi);Qpitch+=dot(F,jtheta);totalLoss+=loss;
    if(isWing)wingLoss+=loss;
  };
  for(const a of M.samples){
    const u=add(base,a.velocity),v=sub(u,mul(a.span,dot(u,a.span))),speed=Math.hypot(...v);
    if(speed<1e-9||a.area<=0)continue;
    const d=mul(v,1/speed),alpha=Math.atan2(-dot(d,a.normal),dot(d,a.chord));
    const p=polar(a.region,alpha,a.camber),q=.5*rho*speed*speed*a.area;
    const F=mul(sub(mul(unit(cross(a.span,d)),p.CL),mul(d,p.CD)),q);
    apply(F,a.r,a.jphi,a.jtheta,q*p.CD*speed,true);
  }
  // Parasite drag acts at the body datum, whose motion reacts to wing CG motion.
  const r0=mul(M.cg,-1),j0=mul(M.dc,-1),jt0=[-r0[1],r0[0],0];
  const ub=add(base,add(mul(j0,s.omega),mul(jt0,s.pitch_rate))),vb=Math.hypot(...ub);
  const flat=Object.values(E.aero.body_flat_plate_areas_m2).reduce((a,x)=>a+x,0);
  let bodyDrag=0;
  if(vb>1e-9){
    bodyDrag=.5*rho*vb*vb*flat;
    apply(mul(ub,-bodyDrag/vb),r0,j0,jt0,bodyDrag*vb);
  }
  // Conventional horizontal tail, at its real moving point.
  const rt=sub([-E.coupled.tail_arm_m,0,0],M.cg),jpt=mul(M.dc,-1),jtt=[-rt[1],rt[0],0];
  const ut=add(base,add(mul(jpt,s.omega),mul(jtt,s.pitch_rate))),ht=Math.hypot(ut[0],ut[1]);
  if(ht>1e-9){
    const d=[ut[0]/ht,ut[1]/ht,0],alpha=Math.atan2(-ut[1],ut[0]);
    const CL=E.coupled.tail_lift_slope*clamp(alpha+E.coupled.tail_incidence_rad,-.35,.35);
    const CD=E.coupled.tail_drag_coefficient+.08*alpha*alpha,q=.5*rho*ht*ht*E.coupled.tail_area_m2;
    const F=mul(sub(mul(cross([0,0,1],d),CL),mul(d,CD)),q);
    apply(F,rt,jpt,jtt,q*CD*ht);
  }
  // Rudder: a bounded side force perpendicular to horizontal relative motion.
  const hs=Math.hypot(base[0],base[2]),rud=clamp(finite(c.rudder),-1,1);
  if(hs>1e-9&&rud){
    const d=[base[0]/hs,0,base[2]/hs],side=unit(cross([0,1,0],d));
    const F=mul(side,.5*rho*hs*hs*E.coupled.tail_area_m2*E.controls.rudder_coefficient*rud);
    apply(F,rt,jpt,jtt,0);
  }
  return {M,bodyForce:all,wingForce:wing,Qphi,Qpitch,wingLoss,totalLoss,bodyDrag,airspeed:Math.hypot(...base)};
}

export function forces(s,c,e,poseOverride){
  const poseFn=poseOverride?(typeof poseOverride==='function'?poseOverride:()=>poseOverride):wingPose;
  const a=aerodynamic(s,c,e,poseFn),motor=shaft(s,c,e);
  const gravity=e.gravity===undefined?E.gravity_m_s2:e.gravity;
  const worldAero=bodyToWorld(a.bodyForce,s),force=add(worldAero,[0,-a.M.mass*gravity,0]);
  const phaseDamping=E.coupled.phase_damping_Nm_s*s.omega*(e.damping_scale??1);
  const pitchDamping=E.coupled.pitch_damping_Nm_s*s.pitch_rate*(e.damping_scale??1);
  const pilotTorque=E.coupled.pitch_control_torque_Nm*clamp(finite(c.pitch),-1,1);
  return {
    lift:a.wingForce[1],thrust:a.wingForce[0],drag:a.bodyDrag,power:motor.power,
    airspeed:a.airspeed,aero_power_W:-a.Qphi*s.omega,wing_dissipation_W:a.totalLoss,
    mass_kg:a.M.mass,Qphi:a.Qphi,Qpitch:a.Qpitch,motor_torque_Nm:motor.driveTorque,
    control_torque_Nm:pilotTorque,phase_damping_Nm:phaseDamping,pitch_damping_Nm:pitchDamping,
    force,wing_force_body_N:a.wingForce.slice(),body_force_N:a.bodyForce,world_aero_force_N:worldAero,
    shaft_torque_Nm:motor.shaftTorque,total_aero_dissipation_W:a.totalLoss,mechanics:a.M
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
    const det=Math.max(1e-8,m.A*m.C-m.B*m.B);
    phase_accel=(R1*m.C-R2*m.B)/det;
    pitch_accel=(R2*m.A-R1*m.B)/det;
  }
  return {phase_accel,pitch_accel,force:f.force.slice(),...f};
}

export function contactHeight(s,e){
  const M=mechanics(parameters,s,wingPose);
  const axle=bodyToWorld([0,0,1],s),tyreSupport=(E.wheel_radius_m-.065)*Math.sqrt(Math.max(0,1-axle[1]*axle[1]))+.065;
  let needed=-Infinity;
  for(const g of E.gear_centres_m){
    const rel=bodyToWorld(sub(g,M.cg),s);
    const x=s.position[0]+rel[0],z=s.position[2]+rel[2];
    const ground=(e.surfaceHeight?e.surfaceHeight(x,z):0);
    needed=Math.max(needed,ground+tyreSupport-rel[1]);
  }
  return needed;
}

function derivative(s,c,e,grounded){
  const f=forces(s,c,e),m=f.mechanics,mass=m.mass;
  let pa,qa,worldForce=f.force.slice();
  if(grounded){
    const fy=f.force[1],Ag=m.A+mass*m.dc[1]*m.dc[1];
    const Agp=m.Ap+2*mass*m.dc[1]*m.ddc[1];
    pa=(f.motor_torque_Nm+f.Qphi-m.Up-f.phase_damping_Nm-.5*Agp*s.omega*s.omega+fy*m.dc[1])/Ag;
    const normal=mass*(m.ddc[1]*s.omega*s.omega+m.dc[1]*pa)-fy;
    if(normal<0)return derivative(s,c,e,false);
    qa=0;worldForce[1]=0;
    const horizontal=Math.hypot(s.velocity[0],s.velocity[2]);
    if(horizontal>1e-7){
      const loss=E.controls.rolling_friction_coefficient*normal+E.controls.brake_force_N*clamp(c.brake??0,0,1);
      worldForce[0]-=loss*s.velocity[0]/horizontal;worldForce[2]-=loss*s.velocity[2]/horizontal;
    }
  }else{
    const a=accelerations(s,c,e);pa=a.phase_accel;qa=a.pitch_accel;
  }
  const rollAccel=E.controls.roll_accel_rad_s2*clamp(c.bank??0,-1,1)-E.controls.roll_damping_per_s*s.roll_rate;
  const speed=Math.hypot(s.velocity[0],s.velocity[2]);
  const yawRate=E.controls.rudder_coefficient*clamp(c.rudder??0,-1,1)*speed/Math.max(3,parameters.body_length_m)
    +(speed>2?(e.gravity??E.gravity_m_s2)*Math.tan(s.roll)/speed:0);
  return {pos:s.velocity.slice(),vel:mul(worldForce,1/mass),phase:s.omega,omega:pa,pitch:s.pitch_rate,pitch_rate:qa,
    roll:s.roll_rate,roll_rate:rollAccel,heading:yawRate,f,grounded};
}

function shifted(s,d,h){
  return {...s,position:s.position.map((x,i)=>x+d.pos[i]*h),velocity:s.velocity.map((x,i)=>x+d.vel[i]*h),
    phase:s.phase+d.phase*h,omega:s.omega+d.omega*h,pitch:s.pitch+d.pitch*h,pitch_rate:s.pitch_rate+d.pitch_rate*h,
    roll:s.roll+d.roll*h,roll_rate:s.roll_rate+d.roll_rate*h,heading:s.heading+d.heading*h};
}

export function step(state,controls,environment,dt){
  let s={...state,position:state.position.slice(),velocity:state.velocity.slice()};
  const n=Math.max(1,Math.ceil(Math.max(0,dt)/E.coupled.integration_dt_max)),h=dt/n;
  for(let k=0;k<n;k++){
    const ch=contactHeight(s,environment),on=s.status==='grounded'||(s.position[1]<=ch+.015&&s.velocity[1]<=0);
    if(on){
      s.pitch=0;s.pitch_rate=0;s.roll=0;s.roll_rate=0;s.position[1]=ch;
      s.velocity[1]=mechanics(parameters,s,wingPose).dc[1]*s.omega;
    }
    const d1=derivative(s,controls,environment,on),mid=shifted(s,d1,h/2);
    const d2=derivative(mid,controls,environment,on),next=shifted(s,d2,h);
    const f=d2.f,shaftWork=Math.max(0,f.power*h);
    const commanded=environment.motor_enabled!==false&&!s.gliding&&controls.throttle>0&&s.fuel_kg>0;
    const burn=shaftWork*E.fuel.bsfc_kg_kWh/3600000+(commanded?E.fuel.idle_kg_s*h:0);
    next.fuel_kg=Math.max(0,s.fuel_kg-burn);
    next.shaft_work_J=(s.shaft_work_J??0)+Math.min(shaftWork,s.fuel_kg*E.fuel.lower_heating_value_J_kg);
    next.aero_work_J=(s.aero_work_J??0)+f.total_aero_dissipation_W*h;
    next.drive_heat_J=(s.drive_heat_J??0)+((f.power*(1-E.engine.transmission_efficiency))
      +Math.abs(f.phase_damping_Nm*mid.omega)+Math.abs(f.pitch_damping_Nm*mid.pitch_rate))*h;
    next.control_work_J=(s.control_work_J??0)+f.control_torque_Nm*mid.pitch_rate*h;
    next.time=(s.time??0)+h;
    next.wheel_angle=(s.wheel_angle??0)+Math.hypot(s.velocity[0],s.velocity[2])*h/E.wheel_radius_m;
    next.pitch=clamp(next.pitch,...E.controls.pitch_limits_rad);
    next.roll=clamp(next.roll,-E.controls.bank_limit_rad,E.controls.bank_limit_rad);
    const nh=contactHeight(next,environment);
    if(on&&d2.grounded&&next.position[1]<=nh+.08){
      next.position[1]=nh;
      next.velocity[1]=mechanics(parameters,next,wingPose).dc[1]*next.omega;
      next.pitch=0;next.pitch_rate=0;next.roll=0;next.roll_rate=0;next.status='grounded';
    }else if(next.position[1]<nh){
      const sink=next.velocity[1]-f.mechanics.dc[1]*next.omega;
      if(-sink>E.controls.safe_touchdown_sink_m_s||Math.hypot(...next.velocity)>E.controls.safe_touchdown_speed_m_s||Math.abs(next.roll)>E.controls.safe_touchdown_bank_rad)next.status='crashed';
      else next.status='grounded';
      next.position[1]=nh;next.velocity[1]=0;
    }else next.status='flying';
    s=next;
  }
  return s;
}
