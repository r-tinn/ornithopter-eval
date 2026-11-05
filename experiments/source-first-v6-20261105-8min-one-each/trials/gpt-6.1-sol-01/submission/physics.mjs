import {E} from './environment/engineering.mjs';
import {wingPose} from './kinematics.mjs';
import {mechanics,centre,bodyToWorld,worldToBody,add,sub,mul,dot,cross,unit} from './environment/source-mechanism.mjs';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const AR=7.4**2/6.61;
export const parameters={
  aspect_ratio:AR,wrist_span_fraction:3.7/7.4,
  span_m:E.span_m,wing_area_m2:E.span_m**2/AR,
  body_length_m:E.body_length_m,pilot_mass_kg:E.pilot_mass_kg,
  dry_mass_kg:E.dry_mass_including_pilot_kg,
  mass_kg:E.dry_mass_including_pilot_kg+E.fuel.initial_kg,
  mass_budget:E.mass_budget.map(x=>({...x})),
  wheel_radius_m:E.wheel_radius_m,gear_centres:E.gear_centres_m.map(x=>x.slice())
};

export function polar(region,alpha,camber){
  const t=E.sections[region],x=E.sections.alpha_rad;
  const a=clamp(alpha,x[0],x[x.length-1]);
  let i=0;while(i<x.length-2&&a>x[i+1])i++;
  const f=(a-x[i])/(x[i+1]-x[i]);
  const cl=t.cl_base[i]+f*(t.cl_base[i+1]-t.cl_base[i])
    +t.camber_lift_gain*(camber-t.camber_reference)*Math.cos(alpha);
  const cd=t.cd_base[i]+f*(t.cd_base[i+1]-t.cd_base[i])
    +cl*cl/(Math.PI*E.aero.span_efficiency*AR);
  return {cl,cd,CL:cl,CD:cd};
}

export function forces(s,c,e,poseOverride){
  const poseFn=poseOverride?(typeof poseOverride==='function'?poseOverride:()=>poseOverride):wingPose;
  const m=mechanics(parameters,s,poseFn);
  const rho=e.rho??E.rho_kg_m3,g=e.gravity??E.gravity_m_s2;
  const air=worldToBody(sub(s.velocity,e.wind??[0,0,0]),s);
  let total=[0,0,0],wing=[0,0,0],Qphi=0,Qpitch=0,dissipation=0,bodyDrag=0;
  function apply(F,jphi,jtheta,loss){
    total=add(total,F);Qphi+=dot(F,jphi);Qpitch+=dot(F,jtheta);dissipation+=loss;
  }
  for(const v of m.samples){
    let u=add(air,v.velocity);
    u=sub(u,mul(v.span,dot(u,v.span)));
    const speed=Math.hypot(...u);
    if(speed<1e-12||v.area<=0)continue;
    const d=mul(u,1/speed),alpha=Math.atan2(-dot(d,v.normal),dot(d,v.chord));
    const {cl,cd}=polar(v.region,alpha,v.camber);
    const q=.5*rho*speed*speed*v.area;
    const F=mul(sub(mul(unit(cross(v.span,d)),cl),mul(d,cd)),q);
    wing=add(wing,F);apply(F,v.jphi,v.jtheta,q*cd*speed);
  }
  const r0=mul(m.cg,-1),j0=mul(m.dc,-1),jt0=[-r0[1],r0[0],0];
  const u0=add(air,add(mul(j0,s.omega),mul(jt0,s.pitch_rate)));
  const v0=Math.hypot(...u0),flat=Object.values(E.aero.body_flat_plate_areas_m2).reduce((a,b)=>a+b,0);
  bodyDrag=.5*rho*v0*v0*flat;
  if(v0>1e-12)apply(mul(u0,-bodyDrag/v0),j0,jt0,bodyDrag*v0);

  const rt=sub([-E.coupled.tail_arm_m,0,0],m.cg),jt=[-rt[1],rt[0],0];
  const ut=add(air,add(mul(j0,s.omega),mul(jt,s.pitch_rate)));
  const vt=Math.hypot(ut[0],ut[1]);
  if(vt>1e-12){
    const d=[ut[0]/vt,ut[1]/vt,0],alpha=Math.atan2(-ut[1],ut[0]);
    const cl=E.coupled.tail_lift_slope*clamp(alpha+E.coupled.tail_incidence_rad,-.35,.35);
    const cd=E.coupled.tail_drag_coefficient+.08*alpha*alpha;
    const q=.5*rho*vt*vt*E.coupled.tail_area_m2;
    apply(mul(sub(mul(cross([0,0,1],d),cl),mul(d,cd)),q),j0,jt,q*cd*vt);
  }
  // A finite rudder load perpendicular to horizontal aircraft airflow.
  const vh=Math.hypot(air[0],air[2]);
  if(vh>1e-12){
    const side=[-air[2]/vh,0,air[0]/vh];
    const f=.5*rho*vh*vh*E.controls.rudder_coefficient*(c.rudder??0);
    apply(mul(side,f),j0,jt,0);
  }
  const throttle=clamp(c.throttle??0,0,1);
  const commanded=(s.fuel_kg>0&&throttle>0&&e.motor_enabled!==false&&!s.gliding);
  let shaftTorque=0;
  if(commanded&&s.omega>=0){
    const target=2*Math.PI*E.engine.maximum_wingbeat_hz*throttle;
    const cap=Math.min(E.engine.starting_torque_Nm,E.engine.continuous_shaft_limit_W*throttle/Math.max(.5,Math.abs(s.omega)));
    shaftTorque=clamp(E.engine.governor_torque_gain_Nm_s*(target-s.omega),0,cap);
  }
  const power=shaftTorque*s.omega,scale=e.damping_scale??1;
  const phaseDamping=E.coupled.phase_damping_Nm_s*s.omega*scale;
  const pitchDamping=E.coupled.pitch_damping_Nm_s*s.pitch_rate*scale;
  const world=bodyToWorld(total,s),wingWorld=bodyToWorld(wing,s);
  world[1]-=m.mass*g;
  return {
    lift:wingWorld[1],thrust:wing[0],drag:bodyDrag,power,
    airspeed:Math.hypot(...air),aero_power_W:-Qphi*s.omega,
    wing_dissipation_W:dissipation,mass_kg:m.mass,Qphi,Qpitch,
    motor_torque_Nm:shaftTorque*E.engine.transmission_efficiency,
    control_torque_Nm:E.coupled.pitch_control_torque_Nm*(c.pitch??0),
    phase_damping_Nm:phaseDamping,pitch_damping_Nm:pitchDamping,
    force:world,wing_force_body_N:wing,mechanism:m,
    fuel_rate_kg_s:commanded?(power*E.fuel.bsfc_kg_kWh/3600000+E.fuel.idle_kg_s):0,
    drive_heat_W:power*(1-E.engine.transmission_efficiency)+phaseDamping*s.omega+pitchDamping*s.pitch_rate,
    control_power_W:E.coupled.pitch_control_torque_Nm*(c.pitch??0)*s.pitch_rate
  };
}

export function accelerations(s,c,e){
  const f=forces(s,c,e),m=f.mechanism,w=s.omega,q=s.pitch_rate;
  const R1=f.motor_torque_Nm+f.Qphi-m.Up-f.phase_damping_Nm-.5*m.Ap*w*w+.5*m.Cp*q*q;
  const R2=f.Qpitch+f.control_torque_Nm-f.pitch_damping_Nm-m.Bp*w*w-m.Cp*w*q;
  let a,b;
  if(e.pitch_locked){a=R1/m.A;b=0;}
  else{
    const det=m.A*m.C-m.B*m.B;
    a=(R1*m.C-m.B*R2)/det;b=(m.A*R2-m.B*R1)/det;
  }
  // The isolated glide preset is a physically latched, extended configuration.
  if(s.gliding){a=0;b=e.pitch_locked?0:(f.Qpitch+f.control_torque_Nm-f.pitch_damping_Nm)/m.C;}
  return {...f,phase_accel:a,pitch_accel:b};
}

export function contactHeight(s,e){
  const cg=centre(parameters,s,wingPose);
  const axle=bodyToWorld([0,0,1],s);
  // Support function of the actual toroidal tyre, including its round tube.
  const tube=.055,major=parameters.wheel_radius_m-tube;
  const radius=major*Math.sqrt(Math.max(0,1-axle[1]**2))+tube;
  let height=-Infinity;
  for(const gear of parameters.gear_centres){
    const r=bodyToWorld(sub(gear,cg),s);
    const terrain=e.surfaceHeight?e.surfaceHeight(s.position[0]+r[0],s.position[2]+r[2]):0;
    height=Math.max(height,terrain-r[1]+radius);
  }
  return height;
}

function derivative(s,c,e,ground){
  const f=accelerations(s,c,e),m=f.mechanism;
  let a=f.phase_accel,b=f.pitch_accel,N=0,constrained=false;
  let acceleration=mul(f.force,1/m.mass);
  if(ground&&!e.pitch_locked&&!s.gliding){
    const dy=m.dc[1],ddy=m.ddc[1];
    const Ag=m.A+m.mass*dy*dy,Agp=m.Ap+2*m.mass*dy*ddy;
    const ag=(f.motor_torque_Nm+f.Qphi-m.Up-f.phase_damping_Nm-.5*Agp*s.omega*s.omega+f.force[1]*dy)/Ag;
    N=m.mass*(ddy*s.omega*s.omega+dy*ag)-f.force[1];
    if(N>=0){
      a=ag;b=0;constrained=true;
      acceleration[1]=ddy*s.omega*s.omega+dy*a;
      const speed=Math.hypot(s.velocity[0],s.velocity[2]);
      const loss=E.controls.rolling_friction_coefficient*N+E.controls.brake_force_N*clamp(c.brake??0,0,1);
      // Regularised Coulomb rolling loss: never reverses a stationary aircraft.
      if(speed>1e-9){
        const decel=Math.min(loss/m.mass,speed/E.coupled.integration_dt_max);
        acceleration[0]-=decel*s.velocity[0]/speed;acceleration[2]-=decel*s.velocity[2]/speed;
      }
    }
  }
  const bank=c.bank??0;
  const rollAccel=constrained?0:E.controls.roll_accel_rad_s2*bank-E.controls.roll_damping_per_s*s.roll_rate;
  const horizontal=Math.hypot(s.velocity[0],s.velocity[2]);
  // Kinematic coordinated heading is not a force or a vertical-lift correction.
  const yaw=constrained?0:(e.gravity??E.gravity_m_s2)*Math.tan(s.roll)/Math.max(5,horizontal)
    +E.controls.rudder_coefficient*(c.rudder??0);
  return {
    position:s.velocity.slice(),velocity:acceleration,
    phase:s.gliding?0:s.omega,omega:a,
    pitch:e.pitch_locked||constrained?0:s.pitch_rate,pitch_rate:b,
    roll:constrained?0:s.roll_rate,roll_rate:rollAccel,heading:yaw,
    fuel_kg:-f.fuel_rate_kg_s,
    shaft_work_J:f.power,aero_work_J:f.wing_dissipation_W,
    drive_heat_J:f.drive_heat_W,control_work_J:f.control_power_W,
    wheel_angle:horizontal/parameters.wheel_radius_m,
    constrained,N
  };
}
const scalarKeys=['phase','omega','pitch','pitch_rate','roll','roll_rate','heading','fuel_kg',
  'shaft_work_J','aero_work_J','drive_heat_J','control_work_J','wheel_angle'];
function advance(s,d,h){
  const out={...s,position:add(s.position,mul(d.position,h)),velocity:add(s.velocity,mul(d.velocity,h))};
  for(const k of scalarKeys)out[k]=(s[k]??0)+h*d[k];
  out.fuel_kg=Math.max(0,out.fuel_kg);
  return out;
}
function constrain(s,e){
  const t={...s,pitch:0,pitch_rate:0,roll:0,roll_rate:0};
  const cg=mechanics(parameters,t,wingPose);
  t.position=s.position.slice();t.velocity=s.velocity.slice();
  t.position[1]=contactHeight(t,e);t.velocity[1]=cg.dc[1]*t.omega;
  return t;
}

export function step(state,c,e,dt){
  let s={...state,position:state.position.slice(),velocity:state.velocity.slice()};
  if(s.status==='crashed'||dt<=0)return s;
  let remaining=dt;
  while(remaining>1e-10){
    let h=Math.min(remaining,E.coupled.integration_dt_max);
    // Split at fuel exhaustion; no shaft work is performed on empty fuel.
    const ground=s.status==='grounded'&&s.position[1]<=contactHeight(s,e)+.025&&!e.pitch_locked;
    if(ground&&!s.gliding)s=constrain(s,e);
    const d1=derivative(s,c,e,ground);
    if(d1.fuel_kg<0&&s.fuel_kg>0)h=Math.min(h,s.fuel_kg/(-d1.fuel_kg));
    let mid=advance(s,d1,h*.5);
    if(d1.constrained)mid=constrain(mid,e);
    const d2=derivative(mid,c,e,ground&&d1.constrained);
    let next=advance(s,d2,h);
    next.time=(s.time??0)+h;
    if(e.pitch_locked){next.pitch=s.pitch;next.pitch_rate=0;}
    if(s.gliding){next.phase=s.phase;next.omega=0;}
    next.roll=clamp(next.roll,-E.controls.bank_limit_rad,E.controls.bank_limit_rad);
    if(Math.abs(next.roll)>=E.controls.bank_limit_rad&&next.roll*next.roll_rate>0)next.roll_rate=0;
    if(d2.constrained){
      next=constrain(next,e);next.status='grounded';
    }else{
      next.status='flying';
      const floor=contactHeight(next,e);
      if(next.position[1]<floor&&!e.pitch_locked){
        const m=mechanics(parameters,next,wingPose);
        // Actual lowest gear vertical velocity, including CG/body reaction.
        let gearVy=Infinity;
        for(const gear of parameters.gear_centres){
          const r=sub(gear,m.cg),jp=mul(m.dc,-1),jt=[-r[1],r[0],0];
          const local=add(mul(jp,next.omega),mul(jt,next.pitch_rate));
          gearVy=Math.min(gearVy,next.velocity[1]+bodyToWorld(local,next)[1]);
        }
        const speed=Math.hypot(next.velocity[0],next.velocity[2]);
        const safe=gearVy>=-E.controls.safe_touchdown_sink_m_s&&speed<=E.controls.safe_touchdown_speed_m_s
          &&Math.abs(next.roll)<=E.controls.safe_touchdown_bank_rad;
        next.position[1]=floor;
        if(!safe){next.status='crashed';next.velocity=[0,0,0];}
        else{
          next.status='grounded';
          next=constrain(next,e);
        }
      }
    }
    s=next;remaining-=h;
    if(s.fuel_kg<1e-12)s.fuel_kg=0;
    if(s.status==='crashed')break;
  }
  return s;
}
