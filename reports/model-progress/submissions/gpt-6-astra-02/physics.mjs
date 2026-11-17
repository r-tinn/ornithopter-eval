import {E} from './environment/engineering.mjs';
import {wingPose} from './kinematics.mjs';
import {mechanics,centre,add,sub,mul,dot,cross,unit,bodyToWorld,worldToBody} from './environment/source-mechanism.mjs';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const AR=7.4**2/6.61;
export const parameters=Object.freeze({
  aspect_ratio:AR,wrist_span_fraction:3.7/7.4,
  span_m:E.span_m,wing_area_m2:E.span_m**2/AR,
  body_length_m:E.body_length_m,pilot_mass_kg:E.pilot_mass_kg,
  dry_mass_kg:E.dry_mass_including_pilot_kg,
  mass_kg:E.dry_mass_including_pilot_kg+E.fuel.initial_kg,
  mass_budget:E.mass_budget,wheel_radius_m:E.wheel_radius_m,
  gear_centres:E.gear_centres_m
});

export function polar(region,alpha,camber){
  const table=E.sections[region], xs=E.sections.alpha_rad;
  const a=clamp(alpha,xs[0],xs[xs.length-1]);
  let i=0;
  while(i<xs.length-2&&a>xs[i+1])i++;
  const t=(a-xs[i])/(xs[i+1]-xs[i]);
  const lerp=values=>values[i]+t*(values[i+1]-values[i]);
  const cl=lerp(table.cl_base)+table.camber_lift_gain*((camber??table.camber_reference)-table.camber_reference)*Math.cos(alpha);
  const cd=lerp(table.cd_base)+cl*cl/(Math.PI*E.aero.span_efficiency*AR);
  return {cl,cd,CL:cl,CD:cd};
}

function commanded(s,c,e){
  return !s.gliding&&s.fuel_kg>0&&(c.throttle??0)>0&&e.motor_enabled!==false;
}

// Reuse geometric bookkeeping when contact projection and force evaluation
// ask for the same configuration. No state or caller-owned array is changed.
let lastMechanismKey=null,lastMechanism=null;
function mechanismAt(s){
  const key=[s.phase,s.fuel_kg,s.omega,s.pitch_rate,!!s.gliding,
    s.timing_bias??E.wing.timing_bias_low_speed,s.sweep_scale??1];
  if(lastMechanismKey&&key.every((v,i)=>v===lastMechanismKey[i]))return lastMechanism;
  lastMechanismKey=key;
  lastMechanism=mechanics(parameters,s,wingPose);
  return lastMechanism;
}

export function forces(s,c={},e={},poseOverride){
  const poseFn=poseOverride?(typeof poseOverride==='function'?poseOverride:()=>poseOverride):wingPose;
  const m=poseOverride?mechanics(parameters,s,poseFn):mechanismAt(s);
  const rho=e.rho??E.rho_kg_m3;
  const air=worldToBody(sub(s.velocity,e.wind??[0,0,0]),s);
  let total=[0,0,0],wing=[0,0,0],Qphi=0,Qpitch=0,loss=0;
  function apply(F,jphi,jtheta,dissipation=0){
    total=add(total,F);Qphi+=dot(F,jphi);Qpitch+=dot(F,jtheta);loss+=dissipation;
  }
  for(const v of m.samples){
    let u=add(air,v.velocity);
    u=sub(u,mul(v.span,dot(u,v.span)));
    const speed=Math.hypot(...u);
    if(speed<1e-12||v.area<=0)continue;
    const d=mul(u,1/speed);
    const alpha=Math.atan2(-dot(d,v.normal),dot(d,v.chord));
    const {cl,cd}=polar(v.region,alpha,v.camber);
    const q=.5*rho*speed*speed*v.area;
    const F=mul(sub(mul(unit(cross(v.span,d)),cl),mul(d,cd)),q);
    wing=add(wing,F);apply(F,v.jphi,v.jtheta,q*cd*speed);
  }
  const r0=mul(m.cg,-1),j0=mul(m.dc,-1),jt0=[-r0[1],r0[0],0];
  const u0=add(air,add(mul(j0,s.omega),mul(jt0,s.pitch_rate)));
  const speed0=Math.hypot(...u0);
  const plate=Object.values(E.aero.body_flat_plate_areas_m2).reduce((a,b)=>a+b,0);
  const drag=.5*rho*plate*speed0*speed0;
  if(speed0>1e-12)apply(mul(u0,-drag/speed0),j0,jt0,drag*speed0);
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
  // Rudder force is perpendicular to horizontal flow: no fictitious propulsive work.
  const vh=Math.hypot(u0[0],u0[2]);
  if(vh>1e-12){
    const side=.5*rho*vh*vh*E.controls.rudder_coefficient*clamp(c.rudder??0,-1,1);
    apply(mul([-u0[2]/vh,0,u0[0]/vh],side),j0,jt0);
  }
  const throttle=clamp(c.throttle??0,0,1),engine=E.engine;
  let shaft=0;
  if(commanded(s,c,e)&&s.omega>=0){
    const target=2*Math.PI*engine.maximum_wingbeat_hz*throttle;
    const cap=Math.min(engine.starting_torque_Nm,engine.continuous_shaft_limit_W*throttle/Math.max(.5,Math.abs(s.omega)));
    shaft=clamp(engine.governor_torque_gain_Nm_s*(target-s.omega),0,cap);
  }
  const power=shaft*s.omega;
  const motor=shaft*engine.transmission_efficiency;
  const damping=e.damping_scale??1;
  const pd=E.coupled.phase_damping_Nm_s*s.omega*damping;
  const td=E.coupled.pitch_damping_Nm_s*s.pitch_rate*damping;
  const control=E.coupled.pitch_control_torque_Nm*clamp(c.pitch??0,-1,1);
  const force=bodyToWorld(total,s);
  force[1]-=m.mass*(e.gravity??E.gravity_m_s2);
  return {
    force,lift:bodyToWorld(wing,s)[1],thrust:wing[0],drag,power,
    airspeed:Math.hypot(...air),aero_power_W:-Qphi*s.omega,
    wing_dissipation_W:loss,mass_kg:m.mass,Qphi,Qpitch,
    wing_force_body_N:wing,motor_torque_Nm:motor,shaft_torque_Nm:shaft,
    control_torque_Nm:control,phase_damping_Nm:pd,pitch_damping_Nm:td,
    drive_heat_W:power-motor*s.omega+pd*s.omega+td*s.pitch_rate,
    control_power_W:control*s.pitch_rate,mechanism:m
  };
}

// Gear is attached to the body, not to the moving whole-system centroid.
// Tyres are toroids in the x/y plane (major radius R-.06, tube radius .06).
function gearHeight(s,e,cg){
  const axis=bodyToWorld([0,0,1],s);
  const projection=Math.sqrt(Math.max(0,1-axis[1]*axis[1]));
  const ring=parameters.wheel_radius_m-.06;
  const low=projection>1e-10?
    mul(sub([0,-1,0],mul(axis,-axis[1])),ring/projection):[0,0,0];
  low[1]-=.06;
  let height=-Infinity;
  for(const g of parameters.gear_centres){
    const r=add(bodyToWorld(sub(g,cg),s),low);
    height=Math.max(height,(e.surfaceHeight?.(s.position[0]+r[0],s.position[2]+r[2])??0)-r[1]);
  }
  return height;
}
export function contactHeight(s,e={}){
  return gearHeight(s,e,centre(parameters,s,wingPose));
}

function solve(s,c,e,f,allowGround=true){
  const m=f.mechanism,w=s.omega,q=s.pitch_rate;
  const R1=f.motor_torque_Nm+f.Qphi-m.Up-f.phase_damping_Nm-.5*m.Ap*w*w+.5*m.Cp*q*q;
  const R2=f.Qpitch+f.control_torque_Nm-f.pitch_damping_Nm-m.Bp*w*w-m.Cp*w*q;
  let phase_accel,pitch_accel;
  if(e.pitch_locked){phase_accel=R1/m.A;pitch_accel=0;}
  else{
    const det=m.A*m.C-m.B*m.B;
    phase_accel=(m.C*R1-m.B*R2)/det;
    pitch_accel=(m.A*R2-m.B*R1)/det;
  }
  let grounded=false,normal=0,force=f.force.slice();
  if(allowGround&&!e.pitch_locked&&s.status==='grounded'&&
     Math.abs(s.pitch)<1e-8&&Math.abs(s.roll)<1e-8&&
     s.position[1]<=gearHeight(s,e,m.cg)+.002){
    const dy=m.dc[1],ddy=m.ddc[1],Ag=m.A+m.mass*dy*dy;
    const Agp=m.Ap+2*m.mass*dy*ddy;
    const a=(f.motor_torque_Nm+f.Qphi-m.Up-f.phase_damping_Nm-.5*Agp*w*w+force[1]*dy)/Ag;
    normal=m.mass*(ddy*w*w+dy*a)-force[1];
    if(normal>=0){
      grounded=true;phase_accel=a;pitch_accel=0;
      force[1]+=normal;
      const speed=Math.hypot(s.velocity[0],s.velocity[2]);
      const friction=E.controls.rolling_friction_coefficient*normal+E.controls.brake_force_N*clamp(c.brake??0,0,1);
      // Continuous near-rest friction avoids numerical reversal/chatter.
      if(speed>1e-10){
        const resistance=friction*Math.min(1,speed/.1);
        force[0]-=resistance*s.velocity[0]/speed;
        force[2]-=resistance*s.velocity[2]/speed;
      }
    }
  }
  if(s.gliding)phase_accel=0; // the deliberately latched, frozen glide configuration
  return {phase_accel,pitch_accel,force,grounded,normal_load_N:Math.max(0,normal)};
}
export function accelerations(s,c={},e={}){
  const f=forces(s,c,e);
  return {...solve(s,c,e,f),mass_kg:f.mass_kg};
}

function derivative(s,c,e){
  const f=forces(s,c,e),a=solve(s,c,e,f);
  const rollAccel=a.grounded?0:E.controls.roll_accel_rad_s2*clamp(c.bank??0,-1,1)-E.controls.roll_damping_per_s*s.roll_rate;
  // Finite rudder steering; bank changes force orientation, not lift magnitude.
  const headingRate=E.controls.rudder_coefficient*clamp(c.rudder??0,-1,1);
  const fuelRate=commanded(s,c,e)?f.power*E.fuel.bsfc_kg_kWh/3600000+E.fuel.idle_kg_s:0;
  return {
    position:s.velocity,velocity:mul(a.force,1/f.mass_kg),
    phase:s.gliding?0:s.omega,omega:a.phase_accel,
    pitch:e.pitch_locked||a.grounded?0:s.pitch_rate,pitch_rate:a.pitch_accel,
    roll:a.grounded?0:s.roll_rate,roll_rate:rollAccel,
    heading:headingRate,fuel_kg:-fuelRate,time:1,
    wheel_angle:a.grounded?worldToBody(s.velocity,s)[0]/parameters.wheel_radius_m:0,
    shaft_work_J:f.power,aero_work_J:f.wing_dissipation_W,
    drive_heat_J:f.drive_heat_W,control_work_J:f.control_power_W,
    grounded:a.grounded
  };
}
const scalarKeys=['phase','omega','pitch','pitch_rate','roll','roll_rate','heading','fuel_kg','time','wheel_angle','shaft_work_J','aero_work_J','drive_heat_J','control_work_J'];
function advance(s,d,h){
  const n={...s,position:add(s.position,mul(d.position,h)),velocity:add(s.velocity,mul(d.velocity,h))};
  for(const k of scalarKeys)n[k]=(s[k]??0)+h*d[k];
  n.fuel_kg=Math.max(0,n.fuel_kg);
  return n;
}
function projectGround(s,e){
  s.pitch=0;s.pitch_rate=0;s.roll=0;s.roll_rate=0;
  const m=mechanismAt(s);
  s.position[1]=gearHeight(s,e,m.cg);
  s.velocity[1]=m.dc[1]*s.omega;
  s.status='grounded';
  return s;
}
function finishContact(previous,n,c,e,wasConstrained){
  if(e.pitch_locked)return n;
  if(wasConstrained){
    // Recheck the normal reaction at the new phase, never release on lift alone.
    projectGround(n,e);
    const f=forces(n,c,e),a=solve(n,c,e,f);
    if(!a.grounded)n.status='flying';
    return n;
  }
  n.status='flying';
  const h=contactHeight(n,e);
  if(n.position[1]<h){
    // Contact-height derivative includes the moving CG and attitude. Thus a
    // downward body-relative CG excursion is not mistaken for an impact.
    const eps=1e-4;
    const future={...n,phase:n.phase+(n.gliding?0:n.omega*eps),
      pitch:n.pitch+n.pitch_rate*eps,roll:n.roll+n.roll_rate*eps,
      position:add(n.position,mul(n.velocity,eps))};
    const gearRise=(contactHeight(future,e)-h)/eps;
    const sink=Math.max(0,gearRise-n.velocity[1]);
    const speed=Math.hypot(n.velocity[0],n.velocity[2]);
    n.position[1]=h;
    if(sink>E.controls.safe_touchdown_sink_m_s||
       speed>E.controls.safe_touchdown_speed_m_s||
       Math.abs(n.roll)>E.controls.safe_touchdown_bank_rad){
      n.status='crashed';n.velocity=[0,0,0];
      return n;
    }
    projectGround(n,e);
  }
  return n;
}

export function step(state,c={},e={},dt){
  let s={...state,position:state.position.slice(),velocity:state.velocity.slice()};
  if(!(dt>0)||s.status==='crashed')return s;
  let remaining=dt;
  while(remaining>1e-12){
    let h=Math.min(remaining,E.coupled.integration_dt_max);
    if(s.status==='grounded'&&!e.pitch_locked)projectGround(s,e);
    // Resolve fuel exhaustion inside a substep. The engine is not allowed to
    // deliver a full step of shaft work after its remaining fuel is spent.
    if(s.fuel_kg<1e-12)s.fuel_kg=0;
    const d1=derivative(s,c,e);
    if(d1.fuel_kg<0)h=Math.min(h,s.fuel_kg/-d1.fuel_kg);
    let mid,d2;
    for(let event=0;event<12;event++){
      mid=advance(s,d1,h/2);
      if(d1.grounded)projectGround(mid,e);
      else mid.status='flying';
      d2=derivative(mid,c,e);
      const used=-d2.fuel_kg*h;
      if(used<=s.fuel_kg||used===0)break;
      h*=s.fuel_kg/used*(1-1e-12);
    }
    let next=advance(s,d2,h);
    if(e.pitch_locked){next.pitch=state.pitch;next.pitch_rate=state.pitch_rate;}
    if(s.gliding){next.omega=0;next.phase=s.phase;}
    const bankLimit=E.controls.bank_limit_rad;
    if(Math.abs(next.roll)>bankLimit){
      next.roll=clamp(next.roll,-bankLimit,bankLimit);
      if(next.roll*next.roll_rate>0)next.roll_rate=0;
    }
    next=finishContact(s,next,c,e,d1.grounded&&d2.grounded);
    s=next;
    remaining-=h;
    if(s.status==='crashed')break;
  }
  return s;
}
