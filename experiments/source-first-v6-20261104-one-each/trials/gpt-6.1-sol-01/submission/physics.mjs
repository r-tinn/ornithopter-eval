import {E} from './environment/engineering.mjs';
import {wingPose} from './kinematics.mjs';
import {mechanics,centre,add,sub,mul,dot,cross,unit,bodyToWorld,worldToBody} from './environment/source-mechanism.mjs';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const AR=7.4*7.4/6.61;
export const parameters={
  aspect_ratio:AR,wrist_span_fraction:3.7/7.4,span_m:E.span_m,
  wing_area_m2:E.span_m**2/AR,body_length_m:E.body_length_m,
  pilot_mass_kg:E.pilot_mass_kg,dry_mass_kg:E.dry_mass_including_pilot_kg,
  mass_kg:E.dry_mass_including_pilot_kg+E.fuel.initial_kg,
  mass_budget:E.mass_budget.map(v=>({...v})),wheel_radius_m:E.wheel_radius_m,
  gear_centres:E.gear_centres_m.map(v=>v.slice())
};
export function polar(region,alpha,camber){
  const a=E.sections.alpha_rad,t=E.sections[region.toLowerCase()];
  const x=clamp(alpha,a[0],a[a.length-1]);
  let i=0;while(i<a.length-2&&x>a[i+1])i++;
  const f=(x-a[i])/(a[i+1]-a[i]);
  const interp=v=>v[i]+f*(v[i+1]-v[i]);
  const CL=interp(t.cl_base)+t.camber_lift_gain*(camber-t.camber_reference)*Math.cos(alpha);
  const CD=interp(t.cd_base)+CL*CL/(Math.PI*E.aero.span_efficiency*AR);
  return {CL,CD,cl:CL,cd:CD};
}
function commanded(s,c,e){
  return !s.gliding&&e.motor_enabled!==false&&s.fuel_kg>0&&(c.throttle??0)>0;
}
export function forces(s,c={},e={},poseOverride){
  const model=mechanics(parameters,s,poseOverride?(typeof poseOverride==='function'?poseOverride:()=>poseOverride):wingPose);
  const rho=e.rho??E.rho_kg_m3,omega=s.omega,pr=s.pitch_rate;
  const air=worldToBody(sub(s.velocity,e.wind??[0,0,0]),s);
  let total=[0,0,0],wing=[0,0,0],Qphi=0,Qpitch=0,loss=0;
  function apply(F,jphi,jtheta,dissipation=0){
    total=add(total,F);Qphi+=dot(F,jphi);Qpitch+=dot(F,jtheta);loss+=dissipation;
  }
  for(const sample of model.samples){
    let u=add(air,sample.velocity);
    u=sub(u,mul(sample.span,dot(u,sample.span)));
    const speed=Math.hypot(...u);
    if(speed<1e-12||sample.area<=0)continue;
    const d=mul(u,1/speed),alpha=Math.atan2(-dot(d,sample.normal),dot(d,sample.chord));
    const {CL,CD}=polar(sample.region,alpha,sample.camber);
    const q=.5*rho*speed*speed*sample.area;
    const F=mul(sub(mul(unit(cross(sample.span,d)),CL),mul(d,CD)),q);
    wing=add(wing,F);apply(F,sample.jphi,sample.jtheta,q*CD*speed);
  }
  const r0=mul(model.cg,-1),j0=mul(model.dc,-1),jt0=[-r0[1],r0[0],0];
  const u0=add(air,add(mul(j0,omega),mul(jt0,pr))),v0=Math.hypot(...u0);
  const drag=.5*rho*v0*v0*Object.values(E.aero.body_flat_plate_areas_m2).reduce((a,b)=>a+b,0);
  apply(v0>1e-12?mul(u0,-drag/v0):[0,0,0],j0,jt0,drag*v0);
  const rt=sub([-E.coupled.tail_arm_m,0,0],model.cg),jtt=[-rt[1],rt[0],0];
  const ut=add(air,add(mul(j0,omega),mul(jtt,pr))),vt=Math.hypot(ut[0],ut[1]);
  if(vt>1e-12){
    const d=[ut[0]/vt,ut[1]/vt,0],alpha=Math.atan2(-ut[1],ut[0]);
    const CL=E.coupled.tail_lift_slope*clamp(alpha+E.coupled.tail_incidence_rad,-.35,.35);
    const CD=E.coupled.tail_drag_coefficient+.08*alpha*alpha,q=.5*rho*vt*vt*E.coupled.tail_area_m2;
    apply(mul(sub(mul(cross([0,0,1],d),CL),mul(d,CD)),q),j0,jtt,q*CD*vt);
  }
  const vh=Math.hypot(air[0],air[2]);
  if(vh>1e-12){
    const side=[-air[2]/vh,0,air[0]/vh];
    apply(mul(side,.5*rho*vh*vh*E.controls.rudder_coefficient*(c.rudder??0)),j0,jtt);
  }
  const throttle=clamp(c.throttle??0,0,1);
  let shaftTorque=0;
  if(commanded(s,c,e)&&omega>=0){
    const target=2*Math.PI*E.engine.maximum_wingbeat_hz*throttle;
    shaftTorque=clamp(E.engine.governor_torque_gain_Nm_s*(target-omega),0,
      Math.min(E.engine.starting_torque_Nm,E.engine.continuous_shaft_limit_W*throttle/Math.max(.5,Math.abs(omega))));
  }
  const damping=e.damping_scale??1,power=shaftTorque*omega;
  const world=bodyToWorld(total,s),wingWorld=bodyToWorld(wing,s);
  world[1]-=model.mass*(e.gravity??E.gravity_m_s2);
  return {
    force:world,lift:wingWorld[1],thrust:wing[0],drag,power,airspeed:Math.hypot(...air),
    aero_power_W:-Qphi*omega,wing_dissipation_W:loss,mass_kg:model.mass,Qphi,Qpitch,
    motor_torque_Nm:shaftTorque*E.engine.transmission_efficiency,
    control_torque_Nm:E.coupled.pitch_control_torque_Nm*(c.pitch??0),
    phase_damping_Nm:E.coupled.phase_damping_Nm_s*omega*damping,
    pitch_damping_Nm:E.coupled.pitch_damping_Nm_s*pr*damping,
    wing_force_body_N:wing,model
  };
}
function heightWith(s,e,cg){
  let height=-Infinity;
  for(const g of parameters.gear_centres){
    const r=bodyToWorld(sub(g,cg),s);
    const terrain=e.surfaceHeight?e.surfaceHeight(s.position[0]+r[0],s.position[2]+r[2]):0;
    // Circular tyres rotate in the body x/y plane, their axle is z.
    const axle=bodyToWorld([0,0,1],s);
    const radius=(parameters.wheel_radius_m-.052)*Math.sqrt(Math.max(0,1-axle[1]**2))+.052;
    height=Math.max(height,terrain-r[1]+radius);
  }
  return height;
}
export function contactHeight(s,e={}){
  return heightWith(s,e,centre(parameters,s,wingPose));
}
export function accelerations(s,c={},e={}){
  const f=forces(s,c,e),m=f.model;
  const R1=f.motor_torque_Nm+f.Qphi-m.Up-f.phase_damping_Nm-.5*m.Ap*s.omega**2+.5*m.Cp*s.pitch_rate**2;
  const R2=f.Qpitch+f.control_torque_Nm-f.pitch_damping_Nm-m.Bp*s.omega**2-m.Cp*s.omega*s.pitch_rate;
  const det=m.A*m.C-m.B*m.B;
  let phase_accel=e.pitch_locked?R1/m.A:(R1*m.C-R2*m.B)/det;
  let pitch_accel=e.pitch_locked?0:(R2*m.A-R1*m.B)/det;
  let ground=false,normal=0,force=f.force.slice();
  if(!e.pitch_locked&&s.position[1]<=heightWith(s,e,m.cg)+.002&&Math.abs(s.pitch)<.025&&Math.abs(s.roll)<.025){
    const Ag=m.A+m.mass*m.dc[1]**2,Agp=m.Ap+2*m.mass*m.dc[1]*m.ddc[1];
    const ag=(f.motor_torque_Nm+f.Qphi-m.Up-f.phase_damping_Nm-.5*Agp*s.omega**2+force[1]*m.dc[1])/Ag;
    const N=m.mass*(m.ddc[1]*s.omega**2+m.dc[1]*ag)-force[1];
    if(N>=0){
      ground=true;normal=N;phase_accel=ag;pitch_accel=0;
      force[1]+=N;
      const speed=Math.hypot(s.velocity[0],s.velocity[2]);
      if(speed>1e-10){
        const resistance=Math.min(E.controls.rolling_friction_coefficient*N+E.controls.brake_force_N*(c.brake??0),speed*m.mass/E.coupled.integration_dt_max);
        force[0]-=resistance*s.velocity[0]/speed;force[2]-=resistance*s.velocity[2]/speed;
      }
    }
  }
  return {...f,force,phase_accel:s.gliding?0:phase_accel,pitch_accel,ground,normal};
}
function derivative(s,c,e){
  const f=accelerations(s,c,e);
  const rollAccel=E.controls.roll_accel_rad_s2*(c.bank??0)-E.controls.roll_damping_per_s*s.roll_rate;
  const fuelRate=commanded(s,c,e)?f.power*E.fuel.bsfc_kg_kWh/3600000+E.fuel.idle_kg_s:0;
  return {f,position:s.velocity,velocity:mul(f.force,1/f.mass_kg),
    phase:s.gliding?0:s.omega,omega:f.phase_accel,
    pitch:e.pitch_locked||f.ground?0:s.pitch_rate,pitch_rate:f.pitch_accel,
    roll:f.ground?0:s.roll_rate,roll_rate:f.ground?0:rollAccel,
    heading:(c.rudder??0)*E.controls.rudder_coefficient*Math.hypot(s.velocity[0],s.velocity[2])/E.body_length_m,
    fuel_kg:-fuelRate,shaft_work_J:f.power,aero_work_J:f.wing_dissipation_W,
    drive_heat_J:f.power*(1-E.engine.transmission_efficiency)+f.phase_damping_Nm*s.omega+f.pitch_damping_Nm*s.pitch_rate,
    control_work_J:f.control_torque_Nm*s.pitch_rate};
}
const fields=['phase','omega','pitch','pitch_rate','roll','roll_rate','heading','fuel_kg','shaft_work_J','aero_work_J','drive_heat_J','control_work_J'];
function advance(s,d,h){
  const out={...s,position:add(s.position,mul(d.position,h)),velocity:add(s.velocity,mul(d.velocity,h))};
  for(const k of fields)out[k]=(s[k]??0)+h*d[k];
  out.fuel_kg=Math.max(0,out.fuel_kg);
  if(d.f.ground){
    out.pitch=0;out.pitch_rate=0;out.roll=0;out.roll_rate=0;
    const m=mechanics(parameters,out,wingPose);
    out.velocity[1]=m.dc[1]*out.omega;
  }
  return out;
}
export function step(state,c={},e={},dt){
  let s={...state,position:state.position.slice(),velocity:state.velocity.slice()};
  const n=Math.max(1,Math.ceil(dt/E.coupled.integration_dt_max)),h=dt/n;
  for(let i=0;i<n;i++){
    if(s.status==='crashed')break;
    let k1=derivative(s,c,e);
    // Split at fuel exhaustion rather than delivering unbudgeted shaft work.
    let parts=[h];
    if(k1.f.power>0&&s.fuel_kg>0&&-k1.fuel_kg*h>s.fuel_kg)parts=[s.fuel_kg/(-k1.fuel_kg),h-s.fuel_kg/(-k1.fuel_kg)];
    for(const h0 of parts){
      if(h0<=0)continue;
      k1=derivative(s,c,e);
      const mid=advance(s,k1,h0/2);
      if(k1.f.ground)mid.position[1]=contactHeight(mid,e);
      const km=derivative(mid,c,e);
      let next=advance(s,km,h0);
      if(km.f.ground)next.position[1]=contactHeight(next,e);
      next.time=(s.time??0)+h0;
      next.wheel_angle=(s.wheel_angle??0)+h0*Math.hypot(s.velocity[0],s.velocity[2])/parameters.wheel_radius_m;
      const floor=contactHeight(next,e);
      if(next.position[1]<floor){
        const m=mechanics(parameters,next,wingPose);
        const gearSink=next.velocity[1]-bodyToWorld(mul(m.dc,next.omega),next)[1];
        const hard=gearSink < -E.controls.safe_touchdown_sink_m_s ||
          Math.hypot(next.velocity[0],next.velocity[2])>E.controls.safe_touchdown_speed_m_s ||
          Math.abs(next.roll)>E.controls.safe_touchdown_bank_rad;
        next.status=hard&&!km.f.ground?'crashed':'grounded';
        next.pitch=0;next.pitch_rate=0;next.roll=0;next.roll_rate=0;
        next.position[1]=contactHeight(next,e);
        const gm=mechanics(parameters,next,wingPose);next.velocity[1]=gm.dc[1]*next.omega;
      }else next.status=km.f.ground?'grounded':'flying';
      s=next;
    }
  }
  return s;
}
