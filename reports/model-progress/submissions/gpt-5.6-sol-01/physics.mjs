import {E} from './environment/engineering.mjs';
import {wingPose} from './kinematics.mjs';
import {mechanics,add,sub,mul,dot,cross,unit,bodyToWorld,worldToBody}
  from './environment/source-mechanism.mjs';

const AR=7.4*7.4/6.61;
export const parameters=Object.freeze({
  aspect_ratio:AR,wrist_span_fraction:3.7/7.4,span_m:E.span_m,
  wing_area_m2:E.span_m*E.span_m/AR,body_length_m:E.body_length_m,
  pilot_mass_kg:E.pilot_mass_kg,dry_mass_kg:E.dry_mass_including_pilot_kg,
  mass_kg:E.dry_mass_including_pilot_kg+E.fuel.initial_kg,
  mass_budget:E.mass_budget,wheel_radius_m:E.wheel_radius_m,
  gear_centres:E.gear_centres_m
});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const zeros=()=>[0,0,0];

export function polar(region,alpha,camber){
  const xs=E.sections.alpha_rad,t=E.sections[region];
  let i=0;
  if(alpha<=xs[0])i=0;
  else if(alpha>=xs[xs.length-1])i=xs.length-2;
  else while(i<xs.length-2&&alpha>xs[i+1])i++;
  const f=clamp((alpha-xs[i])/(xs[i+1]-xs[i]),0,1);
  const lerp=a=>a[i]+(a[i+1]-a[i])*f;
  const CL=lerp(t.cl_base)+t.camber_lift_gain*(camber-t.camber_reference)*Math.cos(alpha);
  const CD=lerp(t.cd_base)+CL*CL/(Math.PI*E.aero.span_efficiency*parameters.aspect_ratio);
  return {CL,CD};
}

function engine(s,c,e){
  const throttle=clamp(c.throttle??0,0,1);
  const enabled=e.motor_enabled!==false&&!s.gliding&&s.fuel_kg>0&&throttle>0&&s.omega>=0;
  if(!enabled)return {shaft:0,drive:0,power:0};
  const target=2*Math.PI*E.engine.maximum_wingbeat_hz*throttle;
  const shaft=clamp(E.engine.governor_torque_gain_Nm_s*(target-s.omega),0,
    Math.min(E.engine.starting_torque_Nm,E.engine.continuous_shaft_limit_W*throttle/Math.max(.5,Math.abs(s.omega))));
  return {shaft,drive:shaft*E.engine.transmission_efficiency,power:shaft*s.omega};
}
function localVelocity(base,r,jphi,s,m){
  const jtheta=[-r[1],r[0],0];
  return add(base,add(mul(jphi,s.omega),mul(jtheta,s.pitch_rate)));
}

export function forces(s,c,e,poseOverride){
  const poseFn=poseOverride
    ?(typeof poseOverride==='function'?poseOverride:()=>poseOverride)
    :wingPose;
  const m=mechanics(parameters,s,poseFn),rho=e.rho??E.rho_kg_m3;
  const air=worldToBody(sub(s.velocity,e.wind??zeros()),s);
  let wing=zeros(),total=zeros(),Qphi=0,Qpitch=0,loss=0;
  for(const q of m.samples){
    if(q.area<=0)continue;
    const u=add(air,q.velocity),flow=sub(u,mul(q.span,dot(u,q.span)));
    const speed=Math.hypot(...flow);
    if(speed<=1e-12||rho===0)continue;
    const d=mul(flow,1/speed);
    const alpha=Math.atan2(-dot(d,q.normal),dot(d,q.chord));
    const p=polar(q.region,alpha,q.camber),dyn=.5*rho*speed*speed*q.area;
    const F=mul(sub(mul(unit(cross(q.span,d)),p.CL),mul(d,p.CD)),dyn);
    wing=add(wing,F);total=add(total,F);
    Qphi+=dot(F,q.jphi);Qpitch+=dot(F,q.jtheta);
    loss+=dyn*p.CD*speed;
  }
  // Flat-plate drag is applied at the moving airframe centroid.
  const r0=mul(m.cg,-1),j0=mul(m.dc,-1),ub=localVelocity(air,r0,j0,s,m);
  const vb=Math.hypot(...ub);
  let bodyDrag=0;
  if(vb>1e-12&&rho!==0){
    const area=Object.values(E.aero.body_flat_plate_areas_m2).reduce((a,x)=>a+x,0);
    bodyDrag=.5*rho*vb*vb*area;
    const F=mul(ub,-bodyDrag/vb),jt=[-r0[1],r0[0],0];
    total=add(total,F);Qphi+=dot(F,j0);Qpitch+=dot(F,jt);loss+=bodyDrag*vb;
  }
  // Conventional tail: its negative arm supplies static pitch stability.
  const rt=sub([-E.coupled.tail_arm_m,0,0],m.cg),jtphi=mul(m.dc,-1);
  const ut=localVelocity(air,rt,jtphi,s,m),vt=Math.hypot(ut[0],ut[1]);
  if(vt>1e-12&&rho!==0){
    const d=[ut[0]/vt,ut[1]/vt,0];
    const alpha=Math.atan2(-ut[1],ut[0]);
    const CL=E.coupled.tail_lift_slope*clamp(alpha+E.coupled.tail_incidence_rad,-.35,.35);
    const CD=E.coupled.tail_drag_coefficient+.08*alpha*alpha;
    const dyn=.5*rho*vt*vt*E.coupled.tail_area_m2;
    const F=mul(sub(mul(cross([0,0,1],d),CL),mul(d,CD)),dyn);
    total=add(total,F);Qphi+=dot(F,jtphi);Qpitch+=dot(F,[-rt[1],rt[0],0]);
    loss+=dyn*CD*vt;
  }
  // A small conventional rudder force; yaw inertia is outside this reduction.
  const vh=Math.hypot(air[0],air[2]);
  if(vh>1e-12&&rho!==0&&c.rudder){
    const d=[air[0]/vh,0,air[2]/vh];
    const side=unit(cross([0,1,0],d));
    total=add(total,mul(side,.5*rho*vh*vh*E.coupled.tail_area_m2*
      E.controls.rudder_coefficient*clamp(c.rudder,-1,1)));
  }
  const motor=engine(s,c,e),dscale=e.damping_scale??1;
  const phaseDamping=E.coupled.phase_damping_Nm_s*s.omega*dscale;
  const pitchDamping=E.coupled.pitch_damping_Nm_s*s.pitch_rate*dscale;
  const controlTorque=E.coupled.pitch_control_torque_Nm*clamp(c.pitch??0,-1,1);
  const worldAero=bodyToWorld(total,s),g=e.gravity??E.gravity_m_s2;
  const force=add(worldAero,[0,-m.mass*g,0]);
  return {lift:wing[1],thrust:wing[0],drag:bodyDrag,power:motor.power,
    airspeed:Math.hypot(...air),aero_power_W:-Qphi*s.omega,
    wing_dissipation_W:loss,mass_kg:m.mass,Qphi,Qpitch,
    motor_torque_Nm:motor.drive,shaft_torque_Nm:motor.shaft,
    control_torque_Nm:controlTorque,phase_damping_Nm:phaseDamping,
    pitch_damping_Nm:pitchDamping,force,wing_force_body_N:wing,
    aero_force_body_N:total,mechanics:m,drive_torque_Nm:motor.drive};
}

export function accelerations(s,c,e){
  const f=forces(s,c,e),m=f.mechanics;
  const R1=f.drive_torque_Nm+f.Qphi-m.Up-f.phase_damping_Nm
    -.5*m.Ap*s.omega*s.omega+.5*m.Cp*s.pitch_rate*s.pitch_rate;
  const R2=f.Qpitch+f.control_torque_Nm-f.pitch_damping_Nm
    -m.Bp*s.omega*s.omega-m.Cp*s.omega*s.pitch_rate;
  let phase_accel,pitch_accel;
  if(e.pitch_locked){
    phase_accel=R1/m.A;pitch_accel=0;
  }else{
    const det=m.A*m.C-m.B*m.B;
    phase_accel=(R1*m.C-R2*m.B)/det;
    pitch_accel=(R2*m.A-R1*m.B)/det;
  }
  return {...f,phase_accel,pitch_accel,force:f.force};
}

export function contactHeight(s,e){
  const m=mechanics(parameters,s,wingPose),surface=e.surfaceHeight??(()=>0);
  let height=-Infinity;
  for(const gear of E.gear_centres_m){
    const rel=bodyToWorld(sub(gear,m.cg),s);
    const x=s.position[0]+rel[0],z=s.position[2]+rel[2];
    height=Math.max(height,surface(x,z)+E.wheel_radius_m-rel[1]);
  }
  return height;
}

function derivative(s,c,e,groundCandidate){
  const a=accelerations(s,c,e),m=a.mechanics;
  let phase=a.phase_accel,pitch=a.pitch_accel,fy=a.force[1],normal=0,ground=false;
  if(groundCandidate){
    const Ag=m.A+m.mass*m.dc[1]*m.dc[1];
    const Agp=m.Ap+2*m.mass*m.dc[1]*m.ddc[1];
    phase=(a.drive_torque_Nm+a.Qphi-m.Up-a.phase_damping_Nm
      -.5*Agp*s.omega*s.omega+fy*m.dc[1])/Ag;
    normal=m.mass*(m.ddc[1]*s.omega*s.omega+m.dc[1]*phase)-fy;
    ground=normal>=0;
    if(ground)pitch=0;
  }
  let acc=mul(a.force,1/m.mass);
  if(ground){
    const vx=s.velocity[0],vz=s.velocity[2],v=Math.hypot(vx,vz);
    const rolling=E.controls.rolling_friction_coefficient*normal+
      E.controls.brake_force_N*clamp(c.brake??0,0,1);
    if(v>.01){acc[0]-=rolling/m.mass*vx/v;acc[2]-=rolling/m.mass*vz/v;}
    acc[1]=m.ddc[1]*s.omega*s.omega+m.dc[1]*phase;
  }
  const rollAccel=E.controls.roll_accel_rad_s2*clamp(c.bank??0,-1,1)
    -E.controls.roll_damping_per_s*s.roll_rate;
  return {a,m,phase,pitch,acc,rollAccel,ground,normal};
}
function midpointState(s,d,h){
  return {...s,position:add(s.position,mul(s.velocity,h)),
    velocity:add(s.velocity,mul(d.acc,h)),phase:s.phase+s.omega*h,
    omega:s.omega+d.phase*h,pitch:s.pitch+s.pitch_rate*h,
    pitch_rate:s.pitch_rate+d.pitch*h,roll:s.roll+s.roll_rate*h,
    roll_rate:s.roll_rate+d.rollAccel*h,time:s.time+h};
}

export function step(state,controls,environment,dt){
  let s={...state,position:[...state.position],velocity:[...state.velocity]};
  const n=Math.max(1,Math.ceil(dt/E.coupled.integration_dt_max)),h=dt/n;
  for(let k=0;k<n;k++){
    const clearance=s.position[1]-contactHeight(s,environment);
    const candidate=s.status==='grounded'||clearance<=.002;
    const d1=derivative(s,controls,environment,candidate);
    const mid=midpointState(s,d1,h/2),d=derivative(mid,controls,environment,candidate&&d1.ground);
    const oldFuel=s.fuel_kg;
    s.position=add(s.position,mul(mid.velocity,h));
    s.velocity=add(s.velocity,mul(d.acc,h));
    s.phase+=mid.omega*h;s.omega+=d.phase*h;
    s.pitch+=mid.pitch_rate*h;s.pitch_rate+=d.pitch*h;
    s.roll+=mid.roll_rate*h;s.roll_rate+=d.rollAccel*h;
    const speed=Math.hypot(mid.velocity[0],mid.velocity[2]);
    s.heading+=(E.controls.rudder_coefficient*(controls.rudder??0)
      +(environment.gravity??E.gravity_m_s2)*Math.tan(mid.roll)/Math.max(5,speed))*h;
    s.time+=h;
    const commanded=(controls.throttle??0)>0&&oldFuel>0&&environment.motor_enabled!==false&&!mid.gliding;
    const burn=d.a.power*E.fuel.bsfc_kg_kWh/3600000+
      (commanded?E.fuel.idle_kg_s:0);
    s.fuel_kg=Math.max(0,oldFuel-burn*h);
    s.shaft_work_J=(s.shaft_work_J??0)+d.a.power*h;
    s.aero_work_J=(s.aero_work_J??0)+d.a.wing_dissipation_W*h;
    const transmission=d.a.power*(1-E.engine.transmission_efficiency);
    const damping=d.a.phase_damping_Nm*mid.omega+d.a.pitch_damping_Nm*mid.pitch_rate;
    s.drive_heat_J=(s.drive_heat_J??0)+(transmission+damping)*h;
    s.control_work_J=(s.control_work_J??0)+d.a.control_torque_Nm*mid.pitch_rate*h;
    if(environment.pitch_locked){s.pitch=state.pitch;s.pitch_rate=0;}
    if(d.ground){
      s.pitch=0;s.pitch_rate=0;s.roll=0;s.roll_rate=0;
      s.position[1]=contactHeight(s,environment);
      const mm=mechanics(parameters,s,wingPose);
      s.velocity[1]=mm.dc[1]*s.omega;
      s.status='grounded';
      s.wheel_angle=(s.wheel_angle??0)+Math.hypot(mid.velocity[0],mid.velocity[2])*h/E.wheel_radius_m;
    }else{
      const ch=contactHeight(s,environment),sink=s.velocity[1]-d.m.dc[1]*s.omega;
      if(s.position[1]<ch){
        if(-sink>E.controls.safe_touchdown_sink_m_s||Math.hypot(...s.velocity)>E.controls.safe_touchdown_speed_m_s||Math.abs(s.roll)>E.controls.safe_touchdown_bank_rad){
          s.status='crashed';s.position[1]=ch;s.velocity=[0,0,0];
        }else{s.position[1]=ch;s.status='grounded';}
      }else s.status='flying';
    }
  }
  return s;
}
