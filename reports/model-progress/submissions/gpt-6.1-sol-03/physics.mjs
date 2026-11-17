import {E} from './environment/engineering.mjs';
import {wingPose} from './kinematics.mjs';
import {mechanics,centre,add,sub,mul,dot,cross,unit,bodyToWorld,worldToBody} from './environment/source-mechanism.mjs';

// Photo 02: rounded "Say" span 7.4 ft, original paragraph area 6.61 ft².
const AR=7.4**2/6.61;
export const parameters={
  aspect_ratio:AR,wrist_span_fraction:3.7/7.4,
  span_m:E.span_m,wing_area_m2:E.span_m**2/AR,
  body_length_m:E.body_length_m,pilot_mass_kg:E.pilot_mass_kg,
  dry_mass_kg:E.dry_mass_including_pilot_kg,
  mass_kg:E.dry_mass_including_pilot_kg+E.fuel.initial_kg,
  mass_budget:E.mass_budget.map(x=>({...x})),
  wheel_radius_m:E.wheel_radius_m,
  gear_centres:E.gear_centres_m.map(x=>[...x])
};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function interpolate(values,x){
  const a=E.sections.alpha_rad;
  if(x<=a[0])return values[0];
  for(let i=1;i<a.length;i++)if(x<=a[i]){
    const t=(x-a[i-1])/(a[i]-a[i-1]);
    return values[i-1]*(1-t)+values[i]*t;
  }
  return values[values.length-1];
}
export function polar(region,alpha,camber){
  const table=E.sections[region],cl=interpolate(table.cl_base,alpha)+table.camber_lift_gain*(camber-table.camber_reference)*Math.cos(alpha);
  const cd=interpolate(table.cd_base,alpha)+cl*cl/(Math.PI*E.aero.span_efficiency*AR);
  return {cl,cd,CL:cl,CD:cd};
}
export function forces(s,c={},e={},poseOverride){
  const poseFn=typeof poseOverride==='function'?poseOverride:(poseOverride?()=>poseOverride:wingPose);
  const m=mechanics(parameters,s,poseFn);
  const rho=e.rho??E.rho_kg_m3,gravity=e.gravity??E.gravity_m_s2;
  const air=worldToBody(sub(s.velocity,e.wind??[0,0,0]),s);
  let total=[0,0,0],wing=[0,0,0],Qphi=0,Qpitch=0,loss=0;
  function apply(F,jphi,jtheta,dissipation=0){
    total=add(total,F);Qphi+=dot(F,jphi);Qpitch+=dot(F,jtheta);loss+=dissipation;
  }
  for(const v of m.samples){
    if(!(v.area>0))continue;
    let u=add(air,v.velocity);
    u=sub(u,mul(v.span,dot(u,v.span)));
    const speed=Math.hypot(...u);if(speed<1e-12)continue;
    const d=mul(u,1/speed),alpha=Math.atan2(-dot(d,v.normal),dot(d,v.chord));
    const {cl,cd}=polar(v.region,alpha,v.camber),q=.5*rho*speed*speed*v.area;
    const F=mul(sub(mul(unit(cross(v.span,d)),cl),mul(d,cd)),q);
    wing=add(wing,F);apply(F,v.jphi,v.jtheta,q*cd*speed);
  }
  const j0=mul(m.dc,-1),r0=mul(m.cg,-1),jt0=[-r0[1],r0[0],0];
  const u0=add(air,add(mul(j0,s.omega),mul(jt0,s.pitch_rate)));
  const speed0=Math.hypot(...u0);
  const flat=Object.values(E.aero.body_flat_plate_areas_m2).reduce((a,b)=>a+b,0);
  const drag=.5*rho*speed0*speed0*flat;
  apply(mul(u0,-drag/Math.max(1e-12,speed0)),j0,jt0,drag*speed0);
  const rt=sub([-E.coupled.tail_arm_m,0,0],m.cg),jtt=[-rt[1],rt[0],0];
  const ut=add(air,add(mul(j0,s.omega),mul(jtt,s.pitch_rate)));
  const vt=Math.hypot(ut[0],ut[1]);
  if(vt>1e-12){
    const d=[ut[0]/vt,ut[1]/vt,0],alpha=Math.atan2(-ut[1],ut[0]);
    const cl=E.coupled.tail_lift_slope*clamp(alpha+E.coupled.tail_incidence_rad,-.35,.35);
    const cd=E.coupled.tail_drag_coefficient+.08*alpha*alpha;
    const q=.5*rho*vt*vt*E.coupled.tail_area_m2;
    apply(mul(sub(mul(cross([0,0,1],d),cl),mul(d,cd)),q),j0,jtt,q*cd*vt);
  }
  // A finite rudder side force does no work along horizontal relative flow.
  const horizontal=Math.hypot(air[0],air[2]);
  if(horizontal>1e-12){
    const f=.5*rho*horizontal*horizontal*E.controls.rudder_coefficient*(c.rudder??0);
    apply(mul([-air[2]/horizontal,0,air[0]/horizontal],f),[0,0,0],[0,0,0]);
  }
  const throttle=clamp(c.throttle??0,0,1),omega=s.omega;
  const commanded=s.fuel_kg>0&&throttle>0&&e.motor_enabled!==false&&!s.gliding;
  let shaftTorque=0;
  if(commanded&&omega>=0){
    const target=2*Math.PI*E.engine.maximum_wingbeat_hz*throttle;
    shaftTorque=clamp(E.engine.governor_torque_gain_Nm_s*(target-omega),0,
      Math.min(E.engine.starting_torque_Nm,E.engine.continuous_shaft_limit_W*throttle/Math.max(.5,Math.abs(omega))));
  }
  const power=shaftTorque*omega,drive=shaftTorque*E.engine.transmission_efficiency;
  const damping=e.damping_scale??1;
  const phaseDamping=E.coupled.phase_damping_Nm_s*omega*damping;
  const pitchDamping=E.coupled.pitch_damping_Nm_s*s.pitch_rate*damping;
  const controlTorque=E.coupled.pitch_control_torque_Nm*(c.pitch??0);
  const force=add(bodyToWorld(total,s),[0,-m.mass*gravity,0]);
  return {lift:bodyToWorld(wing,s)[1],thrust:wing[0],drag,power,
    airspeed:Math.hypot(...air),aero_power_W:-Qphi*omega,
    wing_dissipation_W:loss,mass_kg:m.mass,Qphi,Qpitch,
    motor_torque_Nm:drive,control_torque_Nm:controlTorque,
    phase_damping_Nm:phaseDamping,pitch_damping_Nm:pitchDamping,
    force,wing_force_body_N:wing,mechanism:m,commanded,
    heat_W:power*(1-E.engine.transmission_efficiency)+phaseDamping*omega+pitchDamping*s.pitch_rate,
    control_power_W:controlTorque*s.pitch_rate};
}
export function accelerations(s,c={},e={}){
  const f=forces(s,c,e),m=f.mechanism,w=s.omega,q=s.pitch_rate;
  const R1=f.motor_torque_Nm+f.Qphi-m.Up-f.phase_damping_Nm-.5*m.Ap*w*w+.5*m.Cp*q*q;
  const R2=f.Qpitch+f.control_torque_Nm-f.pitch_damping_Nm-m.Bp*w*w-m.Cp*w*q;
  const det=m.A*m.C-m.B*m.B;
  let phase_accel=(R1*m.C-R2*m.B)/det,pitch_accel=(R2*m.A-R1*m.B)/det;
  if(e.pitch_locked){phase_accel=R1/m.A;pitch_accel=0;}
  if(s.gliding)phase_accel=0;
  return {...f,phase_accel,pitch_accel};
}
export function contactHeight(s,e={}){
  const cg=centre(parameters,s,wingPose);
  let height=-Infinity;
  for(const gear of parameters.gear_centres){
    const r=bodyToWorld(sub(gear,cg),s);
    height=Math.max(height,(e.surfaceHeight?.(s.position[0]+r[0],s.position[2]+r[2])??0)+parameters.wheel_radius_m-r[1]);
  }
  return height;
}
function derivative(s,c,e,ground){
  const f=accelerations(s,c,e),m=f.mechanism;
  let normal=0,constrained=false;
  if(ground&&!e.pitch_locked){
    const Ag=m.A+m.mass*m.dc[1]**2;
    const Agp=m.Ap+2*m.mass*m.dc[1]*m.ddc[1];
    const a=(f.motor_torque_Nm+f.Qphi-m.Up-f.phase_damping_Nm-.5*Agp*s.omega**2+f.force[1]*m.dc[1])/Ag;
    normal=m.mass*(m.ddc[1]*s.omega**2+m.dc[1]*a)-f.force[1];
    if(normal>=0){
      constrained=true;f.phase_accel=s.gliding?0:a;f.pitch_accel=0;
    }
  }
  let acceleration=mul(f.force,1/m.mass);
  if(constrained){
    acceleration[1]=m.ddc[1]*s.omega**2+m.dc[1]*f.phase_accel;
    const v=Math.hypot(s.velocity[0],s.velocity[2]);
    if(v>1e-10){
      const resistance=E.controls.rolling_friction_coefficient*normal+E.controls.brake_force_N*clamp(c.brake??0,0,1);
      acceleration[0]-=resistance*s.velocity[0]/v/m.mass;
      acceleration[2]-=resistance*s.velocity[2]/v/m.mass;
    }
  }
  const bank=c.bank??0;
  const rollAccel=E.controls.roll_accel_rad_s2*bank-E.controls.roll_damping_per_s*s.roll_rate;
  // Neutral bank holds its angle; yaw responds to the finite rudder control.
  const headingRate=E.controls.rudder_coefficient*(c.rudder??0)*Math.hypot(...s.velocity)/E.span_m;
  return {f,constrained,normal,position:[...s.velocity],velocity:acceleration,
    phase:s.gliding?0:s.omega,omega:f.phase_accel,
    pitch:e.pitch_locked||constrained?0:s.pitch_rate,pitch_rate:f.pitch_accel,
    roll:constrained?0:s.roll_rate,roll_rate:constrained?0:rollAccel,heading:headingRate,
    fuel_kg:f.commanded?-(f.power*E.fuel.bsfc_kg_kWh/3600000+E.fuel.idle_kg_s):0,
    shaft_work_J:f.power,aero_work_J:f.wing_dissipation_W,drive_heat_J:f.heat_W,
    control_work_J:f.control_power_W,
    wheel_angle:constrained?Math.hypot(s.velocity[0],s.velocity[2])/parameters.wheel_radius_m:0,time:1};
}
const fields=['phase','omega','pitch','pitch_rate','roll','roll_rate','heading','fuel_kg','shaft_work_J','aero_work_J','drive_heat_J','control_work_J','wheel_angle','time'];
function advance(s,d,h){
  const n={...s,position:add(s.position,mul(d.position,h)),velocity:add(s.velocity,mul(d.velocity,h))};
  for(const key of fields)n[key]=(s[key]??0)+h*d[key];
  n.fuel_kg=Math.max(0,n.fuel_kg);
  return n;
}
export function step(state,c={},e={},dt){
  let s={...state,position:[...state.position],velocity:[...state.velocity]};
  if(s.status==='crashed'||!(dt>0))return s;
  let remaining=dt;
  while(remaining>1e-12){
    let h=Math.min(remaining,E.coupled.integration_dt_max);
    const ground=s.position[1]<=contactHeight(s,e)+1e-6&&!e.pitch_locked;
    if(ground){
      // All three wheels define the runway reduction, with moving whole CG.
      s.pitch=0;s.pitch_rate=0;s.roll=0;s.roll_rate=0;
      const m=mechanics(parameters,s,wingPose);
      s.position[1]=contactHeight(s,e);s.velocity[1]=m.dc[1]*s.omega;
    }
    const d0=derivative(s,c,e,ground);
    // Resolve a last partial fuel interval rather than granting a complete
    // substep of work from an arbitrarily small remaining fuel quantity.
    if(d0.fuel_kg<0)h=Math.min(h,s.fuel_kg/(-d0.fuel_kg));
    let mid=advance(s,d0,h/2);
    if(d0.constrained){
      mid.pitch=0;mid.pitch_rate=0;mid.position[1]=contactHeight(mid,e);
      mid.velocity[1]=centreVelocity(mid);
    }
    let dm=derivative(mid,c,e,d0.constrained);
    if(dm.fuel_kg<0 && -dm.fuel_kg*h>s.fuel_kg){
      h=s.fuel_kg/(-dm.fuel_kg);
      mid=advance(s,d0,h/2);
      if(d0.constrained){
        mid.pitch=0;mid.pitch_rate=0;mid.position[1]=contactHeight(mid,e);
        mid.velocity[1]=centreVelocity(mid);
      }
      dm=derivative(mid,c,e,d0.constrained);
    }
    let next=advance(s,dm,h);
    if(s.fuel_kg>0&&next.fuel_kg<1e-12)next.fuel_kg=0;
    if(dm.constrained){
      next.pitch=0;next.pitch_rate=0;next.roll=0;next.roll_rate=0;
      next.position[1]=contactHeight(next,e);next.velocity[1]=centreVelocity(next);
      next.status='grounded';
      // Static friction cannot reverse a slow ground roll.
      if(next.velocity[0]*s.velocity[0]<0&&Math.abs(s.velocity[0])<.1)next.velocity[0]=0;
    }else{
      next.status='flying';
      const height=contactHeight(next,e);
      if(next.position[1]<height){
        const m=mechanics(parameters,next,wingPose);
        const sink=gearSinkVelocity(next,e,m);
        const unsafe=sink < -E.controls.safe_touchdown_sink_m_s ||
          Math.hypot(next.velocity[0],next.velocity[2])>E.controls.safe_touchdown_speed_m_s ||
          Math.abs(next.roll)>E.controls.safe_touchdown_bank_rad;
        next.status=unsafe?'crashed':'grounded';
        next.pitch=0;next.pitch_rate=0;next.roll=0;next.roll_rate=0;
        next.position[1]=contactHeight(next,e);next.velocity[1]=centreVelocity(next);
      }
    }
    next.roll=clamp(next.roll,-E.controls.bank_limit_rad,E.controls.bank_limit_rad);
    s=next;
    remaining-=h;
    if(s.status==='crashed')break;
  }
  return s;
}
function centreVelocity(s){return mechanics(parameters,s,wingPose).dc[1]*s.omega;}
function gearSinkVelocity(s,e,m){
  let lowest=Infinity,sink=s.velocity[1];
  for(const gear of parameters.gear_centres){
    const r=sub(gear,m.cg),rw=bodyToWorld(r,s);
    const clearance=s.position[1]+rw[1]-parameters.wheel_radius_m-
      (e.surfaceHeight?.(s.position[0]+rw[0],s.position[2]+rw[2])??0);
    if(clearance<lowest){
      lowest=clearance;
      const local=add(mul(m.dc,-s.omega),
        add(mul([-r[1],r[0],0],s.pitch_rate),mul([0,-r[2],r[1]],s.roll_rate)));
      sink=s.velocity[1]+bodyToWorld(local,s)[1];
    }
  }
  return sink;
}
