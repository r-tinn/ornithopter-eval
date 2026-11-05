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
  mass_budget:E.mass_budget,wheel_radius_m:E.wheel_radius_m,gear_centres:E.gear_centres_m
};
export function polar(region,alpha,camber) {
  const table=E.sections[region],x=E.sections.alpha_rad;
  let i=0;while(i<x.length-2&&alpha>x[i+1])i++;
  const t=clamp((alpha-x[i])/(x[i+1]-x[i]),0,1),lerp=a=>a[i]+(a[i+1]-a[i])*t;
  const CL=lerp(table.cl_base)+table.camber_lift_gain*(camber-table.camber_reference)*Math.cos(alpha);
  const CD=lerp(table.cd_base)+CL*CL/(Math.PI*E.aero.span_efficiency*AR);
  return {CL,CD,cl:CL,cd:CD};
}
export function forces(s,c={},e={},poseOverride) {
  const m=mechanics(parameters,s,poseOverride?()=>poseOverride:wingPose);
  const rho=e.rho??E.rho_kg_m3,air=worldToBody(sub(s.velocity,e.wind??[0,0,0]),s);
  let total=[0,0,0],wing=[0,0,0],Qphi=0,Qpitch=0,loss=0;
  function apply(F,jphi,jtheta,dissipation) {
    total=add(total,F);Qphi+=dot(F,jphi);Qpitch+=dot(F,jtheta);loss+=dissipation;
  }
  for(const v of m.samples) {
    let u=add(air,v.velocity);u=sub(u,mul(v.span,dot(u,v.span)));
    const speed=Math.hypot(...u);
    if(speed<1e-12||v.area<=0)continue;
    const d=mul(u,1/speed),alpha=Math.atan2(-dot(d,v.normal),dot(d,v.chord));
    const {CL,CD}=polar(v.region,alpha,v.camber),q=.5*rho*speed*speed*v.area;
    const F=mul(sub(mul(unit(cross(v.span,d)),CL),mul(d,CD)),q);
    wing=add(wing,F);apply(F,v.jphi,v.jtheta,q*CD*speed);
  }
  const j0=mul(m.dc,-1),r0=mul(m.cg,-1),jt0=[-r0[1],r0[0],0];
  const u0=add(air,add(mul(j0,s.omega),mul(jt0,s.pitch_rate))),v0=Math.hypot(...u0);
  const drag=.5*rho*v0*v0*Object.values(E.aero.body_flat_plate_areas_m2).reduce((a,b)=>a+b,0);
  if(v0>1e-12)apply(mul(u0,-drag/v0),j0,jt0,drag*v0);
  const rt=sub([-E.coupled.tail_arm_m,0,0],m.cg),jtt=[-rt[1],rt[0],0];
  const ut=add(air,add(mul(j0,s.omega),mul(jtt,s.pitch_rate))),vt=Math.hypot(ut[0],ut[1]);
  if(vt>1e-12) {
    const d=[ut[0]/vt,ut[1]/vt,0],alpha=Math.atan2(-ut[1],ut[0]);
    const CL=E.coupled.tail_lift_slope*clamp(alpha+E.coupled.tail_incidence_rad,-.35,.35);
    const CD=E.coupled.tail_drag_coefficient+.08*alpha*alpha,q=.5*rho*vt*vt*E.coupled.tail_area_m2;
    apply(mul(sub(mul(cross([0,0,1],d),CL),mul(d,CD)),q),j0,jtt,q*CD*vt);
  }
  let world=bodyToWorld(total,s);
  const relative=sub(s.velocity,e.wind??[0,0,0]),horizontal=Math.hypot(relative[0],relative[2]);
  const rudder=(c.rudder??0)*E.controls.rudder_coefficient*.5*rho*horizontal*horizontal;
  if(horizontal>1e-12)world=add(world,[-relative[2]/horizontal*rudder,0,relative[0]/horizontal*rudder]);
  world[1]-=m.mass*(e.gravity??E.gravity_m_s2);
  const throttle=clamp(c.throttle??0,0,1),on=s.fuel_kg>0&&throttle>0&&e.motor_enabled!==false&&!s.gliding;
  let shaftTorque=0;
  if(on&&s.omega>=0) {
    const target=2*Math.PI*E.engine.maximum_wingbeat_hz*throttle;
    shaftTorque=clamp(E.engine.governor_torque_gain_Nm_s*(target-s.omega),0,
      Math.min(E.engine.starting_torque_Nm,E.engine.continuous_shaft_limit_W*throttle/Math.max(.5,Math.abs(s.omega))));
  }
  const damping=e.damping_scale??1;
  return {
    lift:bodyToWorld(wing,s)[1],thrust:wing[0],drag,power:shaftTorque*s.omega,
    airspeed:Math.hypot(...air),aero_power_W:-Qphi*s.omega,wing_dissipation_W:loss,
    mass_kg:m.mass,Qphi,Qpitch,motor_torque_Nm:shaftTorque*E.engine.transmission_efficiency,
    control_torque_Nm:E.coupled.pitch_control_torque_Nm*(c.pitch??0),
    phase_damping_Nm:E.coupled.phase_damping_Nm_s*damping*s.omega,
    pitch_damping_Nm:E.coupled.pitch_damping_Nm_s*damping*s.pitch_rate,
    force:world,wing_force_body_N:wing,mechanics:m,motor_on:on
  };
}
function coupled(s,c,e,f) {
  const m=f.mechanics,w=s.omega,q=s.pitch_rate;
  const R1=f.motor_torque_Nm+f.Qphi-m.Up-f.phase_damping_Nm-.5*m.Ap*w*w+.5*m.Cp*q*q;
  const R2=f.Qpitch+f.control_torque_Nm-f.pitch_damping_Nm-m.Bp*w*w-m.Cp*w*q;
  const det=m.A*m.C-m.B*m.B;
  let phase_accel=e.pitch_locked?R1/m.A:(R1*m.C-m.B*R2)/det;
  const pitch_accel=e.pitch_locked?0:(m.A*R2-m.B*R1)/det;
  if(s.gliding)phase_accel=0;
  return {phase_accel,pitch_accel,force:f.force};
}
export function accelerations(s,c={},e={}) {return coupled(s,c,e,forces(s,c,e));}
function heightWithCG(s,e,cg) {
  let height=-Infinity;
  const axle=bodyToWorld([0,0,1],s),axial=Math.abs(axle[1]);
  const radial=Math.sqrt(Math.max(0,1-axle[1]*axle[1])),r=parameters.wheel_radius_m;
  // Support of the actual rounded tyre profile, including its finite width.
  const support=Math.max(r*radial+.024*axial,(r-.008)*radial+.044*axial,(r-.035)*radial+.065*axial);
  for(const g of parameters.gear_centres) {
    const r=bodyToWorld(sub(g,cg),s),x=s.position[0]+r[0],z=s.position[2]+r[2];
    height=Math.max(height,(e.surfaceHeight?.(x,z)??0)+support-r[1]);
  }
  return height;
}
export function contactHeight(s,e={}) {return heightWithCG(s,e,centre(parameters,s,wingPose));}
function rate(s,c,e,allowGround) {
  const f=forces(s,c,e),m=f.mechanics;
  let a=coupled(s,c,e,f),normal=0,ground=false;
  if(allowGround&&!e.pitch_locked) {
    const Ag=m.A+m.mass*m.dc[1]**2,Agp=m.Ap+2*m.mass*m.dc[1]*m.ddc[1];
    const wa=(f.motor_torque_Nm+f.Qphi-m.Up-f.phase_damping_Nm-.5*Agp*s.omega**2+f.force[1]*m.dc[1])/Ag;
    normal=m.mass*(m.ddc[1]*s.omega**2+m.dc[1]*wa)-f.force[1];
    if(normal>=0) {ground=true;a={...a,phase_accel:wa,pitch_accel:0};}
  }
  const acc=mul(f.force,1/m.mass),vel=s.velocity.slice();
  if(ground) {
    const speed=Math.hypot(vel[0],vel[2]);
    const resistance=E.controls.rolling_friction_coefficient*normal+E.controls.brake_force_N*clamp(c.brake??0,0,1);
    if(speed>1e-8) {
      const decel=resistance/m.mass*Math.min(1,speed/.08);
      acc[0]-=decel*vel[0]/speed;acc[2]-=decel*vel[2]/speed;
    }
    acc[1]=m.ddc[1]*s.omega**2+m.dc[1]*a.phase_accel;vel[1]=m.dc[1]*s.omega;
  }
  const rollAcceleration=ground?0:E.controls.roll_accel_rad_s2*clamp(c.bank??0,-1,1)-E.controls.roll_damping_per_s*s.roll_rate;
  const headingRate=ground?(c.rudder??0)*Math.hypot(s.velocity[0],s.velocity[2])*.025:(c.rudder??0)*E.controls.rudder_coefficient;
  return {
    position:vel,velocity:acc,phase:s.gliding?0:s.omega,omega:a.phase_accel,
    pitch:e.pitch_locked||ground?0:s.pitch_rate,pitch_rate:a.pitch_accel,
    roll:ground?0:s.roll_rate,roll_rate:rollAcceleration,heading:headingRate,
    shaft_work_J:f.power,aero_work_J:f.wing_dissipation_W,
    drive_heat_J:f.power*(1-E.engine.transmission_efficiency)+f.phase_damping_Nm*s.omega+f.pitch_damping_Nm*s.pitch_rate,
    control_work_J:f.control_torque_Nm*s.pitch_rate,
    fuel_kg:-(f.power*E.fuel.bsfc_kg_kWh/3600000+(f.motor_on?E.fuel.idle_kg_s:0)),
    wheel_angle:ground?worldToBody(s.velocity,s)[0]/parameters.wheel_radius_m:0,ground,normal
  };
}
const scalars=['phase','omega','pitch','pitch_rate','roll','roll_rate','heading','shaft_work_J','aero_work_J','drive_heat_J','control_work_J','fuel_kg','wheel_angle'];
function advance(s,k,h) {
  const n={...s,position:add(s.position,mul(k.position,h)),velocity:add(s.velocity,mul(k.velocity,h))};
  for(const key of scalars)n[key]=(s[key]??0)+h*k[key];
  n.fuel_kg=Math.max(0,n.fuel_kg);n.time=(s.time??0)+h;return n;
}
export function step(state,c={},e={},dt) {
  let s={...state,position:state.position.slice(),velocity:state.velocity.slice()};
  if(s.status==='crashed'||dt<=0)return s;
  let remaining=dt;
  while(remaining>1e-14) {
    let h=Math.min(remaining,E.coupled.integration_dt_max);
    // Resolve exhaustion before supplying work. This bound is independent of
    // the governor's changing instantaneous load and is valid at both RK stages.
    if(s.fuel_kg>0&&(c.throttle??0)>0&&e.motor_enabled!==false&&!s.gliding) {
      const bound=E.engine.continuous_shaft_limit_W*clamp(c.throttle,0,1)*E.fuel.bsfc_kg_kWh/3600000+E.fuel.idle_kg_s;
      if(s.fuel_kg<1e-12)s.fuel_kg=0;
      else h=Math.min(h,s.fuel_kg/bound);
    }
    const touch=s.position[1]<=contactHeight(s,e)+1e-7;
    if(touch&&!e.pitch_locked) {
      s.pitch=0;s.pitch_rate=0;s.roll=0;s.roll_rate=0;
      const m=mechanics(parameters,s,wingPose);
      s.position[1]=heightWithCG(s,e,m.cg);s.velocity[1]=m.dc[1]*s.omega;
    }
    const k1=rate(s,c,e,touch);
    let mid=advance(s,k1,h/2);
    if(k1.ground) {
      mid.pitch=0;mid.pitch_rate=0;mid.roll=0;mid.roll_rate=0;
      const m=mechanics(parameters,mid,wingPose);
      mid.position[1]=heightWithCG(mid,e,m.cg);mid.velocity[1]=m.dc[1]*mid.omega;
    }
    const k2=rate(mid,c,e,k1.ground);
    let n=advance(s,k2,h);
    if(k2.ground) {
      n.pitch=0;n.pitch_rate=0;n.roll=0;n.roll_rate=0;
      const m=mechanics(parameters,n,wingPose);
      n.position[1]=heightWithCG(n,e,m.cg);n.velocity[1]=m.dc[1]*n.omega;n.status='grounded';
    } else {
      n.status='flying';
      const m=mechanics(parameters,n,wingPose),floor=heightWithCG(n,e,m.cg);
      if(n.position[1]<floor) {
        let sink=-Infinity;
        for(const gear of parameters.gear_centres) {
          const r=sub(gear,m.cg),jtheta=[-r[1],r[0],0];
          const local=add(mul(m.dc,-n.omega),mul(jtheta,n.pitch_rate));
          sink=Math.max(sink,-n.velocity[1]-bodyToWorld(local,n)[1]);
        }
        const speed=Math.hypot(n.velocity[0],n.velocity[2]);
        const unsafe=sink>E.controls.safe_touchdown_sink_m_s||speed>E.controls.safe_touchdown_speed_m_s||Math.abs(n.roll)>E.controls.safe_touchdown_bank_rad;
        n.status=unsafe?'crashed':'grounded';n.pitch=0;n.pitch_rate=0;n.roll=0;n.roll_rate=0;
        n.position[1]=contactHeight(n,e);n.velocity[1]=m.dc[1]*n.omega;
      }
    }
    if(Math.abs(n.roll)>E.controls.bank_limit_rad) {
      n.roll=clamp(n.roll,-E.controls.bank_limit_rad,E.controls.bank_limit_rad);n.roll_rate=0;
    }
    s=n;remaining-=h;if(s.status==='crashed')break;
  }
  return s;
}
