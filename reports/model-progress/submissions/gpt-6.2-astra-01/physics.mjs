import {E} from './environment/engineering.mjs';
import {mechanics,centre,add,sub,mul,dot,unit,cross,bodyToWorld,worldToBody} from './environment/source-mechanism.mjs';
import {wingPose} from './kinematics.mjs';

const AR=7.4**2/6.61, K=E.coupled, ctl=E.controls, eng=E.engine;
export const parameters={
  aspect_ratio:AR,wrist_span_fraction:3.7/7.4,span_m:E.span_m,wing_area_m2:E.span_m**2/AR,
  body_length_m:E.body_length_m,pilot_mass_kg:E.pilot_mass_kg,dry_mass_kg:E.dry_mass_including_pilot_kg,
  mass_kg:E.dry_mass_including_pilot_kg+E.fuel.initial_kg,mass_budget:E.mass_budget,
  wheel_radius_m:E.wheel_radius_m,gear_centres:E.gear_centres_m
};
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const len=v=>Math.hypot(...v), zero=[0,0,0], jrot=r=>[-r[1],r[0],0];
const flatArea=Object.values(E.aero.body_flat_plate_areas_m2).reduce((a,b)=>a+b,0);

export function polar(region,alpha,camber){
  const a=E.sections.alpha_rad,table=E.sections[region];
  let i=1;while(i<a.length-1&&alpha>a[i])i++;
  const t=clamp((alpha-a[i-1])/(a[i]-a[i-1]),0,1);
  const interp=v=>v[i-1]+t*(v[i]-v[i-1]);
  const cl=interp(table.cl_base)+table.camber_lift_gain*(camber-table.camber_reference)*Math.cos(alpha);
  const cd=interp(table.cd_base)+cl*cl/(Math.PI*E.aero.span_efficiency*AR);
  return {cl,cd,CL:cl,CD:cd};
}

function loads(s,c,e,m) {
  const rho=e.rho??E.rho_kg_m3, air=sub(s.velocity,e.wind??zero), airB=worldToBody(air,s);
  const w=s.omega,p=s.pitch_rate;
  let sum=[0,0,0],Qphi=0,Qpitch=0,loss=0;
  function apply(f,j,h){sum=add(sum,f);Qphi+=dot(f,j);Qpitch+=dot(f,h);}
  for(const v of m.samples){
    if(!v.area||!rho)continue;
    const flow=add(airB,v.velocity),u=sub(flow,mul(v.span,dot(flow,v.span))),speed=len(u);
    if(!speed)continue;
    const d=mul(u,1/speed);
    const alpha=Math.atan2(-dot(d,v.normal),dot(d,v.chord));
    const {cl,cd}=polar(v.region,alpha,v.camber), q=.5*rho*speed*speed*v.area;
    apply(sub(mul(unit(cross(v.span,d)),q*cl),mul(d,q*cd)),v.jphi,v.jtheta);
    loss+=q*cd*speed;
  }
  const wing=sum;
  // Local airspeed includes both rotation about CG and translation of the
  // frame relative to CG. Use the same Jacobians for velocity and work.
  const r0=mul(m.cg,-1),j0=mul(m.dc,-1),h0=jrot(r0);
  const v0=add(airB,add(mul(j0,w),mul(h0,p))),v0n=len(v0);
  const drag=.5*rho*v0n*v0n*flatArea;
  apply(mul(unit(v0),-drag),j0,h0);loss+=drag*v0n;
  const ht=jrot(add(r0,[-K.tail_arm_m,0,0]));
  const u=add(airB,add(mul(j0,w),mul(ht,p)));u[2]=0;
  const vt=len(u),d=unit(u),alpha=vt?Math.atan2(-u[1],u[0]):0;
  const q=.5*rho*vt*vt*K.tail_area_m2;
  const L=q*K.tail_lift_slope*clamp(alpha+K.tail_incidence_rad,-.35,.35);
  const D=q*(K.tail_drag_coefficient+.08*alpha**2);
  apply(sub(mul(cross([0,0,1],d),L),mul(d,D)),j0,ht);loss+=D*vt;

  const force=bodyToWorld(sum,s);
  force[1]-=m.mass*(e.gravity??E.gravity_m_s2);
  const horiz=Math.hypot(air[0],air[2]);
  const rud=.5*rho*horiz*ctl.rudder_coefficient*parameters.wing_area_m2*(c.rudder??0);
  force[0]-=air[2]*rud;force[2]+=air[0]*rud;
  const throttle=clamp(c.throttle??0,0,1);
  const commanded=s.fuel_kg>0&&throttle>0&&!s.gliding&&e.motor_enabled!==false;
  const shaft=commanded&&w>=0?clamp(eng.governor_torque_gain_Nm_s*(2*Math.PI*eng.maximum_wingbeat_hz*throttle-w),
    0,Math.min(eng.starting_torque_Nm,eng.continuous_shaft_limit_W*throttle/Math.max(.5,Math.abs(w)))):0;
  const damp=e.damping_scale??1;
  return {lift:bodyToWorld(wing,s)[1],thrust:wing[0],drag,power:shaft*w,airspeed:len(air),
    aero_power_W:-Qphi*w,wing_dissipation_W:loss,mass_kg:m.mass,Qphi,Qpitch,force,wing_force_body_N:wing,
    motor_torque_Nm:shaft*eng.transmission_efficiency,control_torque_Nm:K.pitch_control_torque_Nm*(c.pitch??0),
    phase_damping_Nm:damp*K.phase_damping_Nm_s*w,pitch_damping_Nm:damp*K.pitch_damping_Nm_s*p,commanded};
}

export function forces(s,c,e,poseOverride){
  return loads(s,c,e,mechanics(parameters,s,poseOverride?()=>poseOverride:wingPose));
}

function dynamics(s,c,e){
  const m=mechanics(parameters,s,wingPose),f=loads(s,c,e,m);
  const {A,B,C,Ap,Bp,Cp,dc,ddc}=m,w=s.omega,p=s.pitch_rate;
  const torque=f.motor_torque_Nm+f.Qphi-m.Up-f.phase_damping_Nm;
  const R1=torque-.5*Ap*w*w+.5*Cp*p*p;
  const R2=f.Qpitch+f.control_torque_Nm-f.pitch_damping_Nm-Bp*w*w-Cp*w*p;
  const det=A*C-B*B;
  let phase_accel=e.pitch_locked?R1/A:(R1*C-B*R2)/det;
  let pitch_accel=e.pitch_locked?0:(A*R2-B*R1)/det;
  if(s.gliding){phase_accel=0;pitch_accel=e.pitch_locked?0:R2/C;}
  let grounded=false,normal=0;
  if(s.status==='grounded'&&s.position[1]<=gear(s,e,m.cg).height+.0002){
    const v=dc[1], a=ddc[1];
    const ag=(torque-.5*(Ap+2*m.mass*v*a)*w*w+f.force[1]*v)/(A+m.mass*v*v);
    normal=m.mass*(a*w*w+v*ag)-f.force[1];
    if(normal>=0){
      phase_accel=s.gliding?0:ag;pitch_accel=0;grounded=true;
    }
  }
  return {phase_accel,pitch_accel,force:f.force,grounded,normal,m,f};
}

export function accelerations(s,c,e){
  const {phase_accel,pitch_accel,force}=dynamics(s,c,e);
  return {phase_accel,pitch_accel,force};
}

// Tyres are tori with the tube occupying 22% of the outer radius.
function gear(s,e,cg){
  const axle=bodyToWorld([0,0,1],s);
  const radius=parameters.wheel_radius_m;
  const cosine=Math.sqrt(Math.max(0,1-axle[1]**2));
  const rad=radius*(.22+.78*cosine);
  const offset=cosine>1e-8?radius*.78*axle[1]/cosine:0;
  let height=-Infinity,point;
  for(const g of parameters.gear_centres){
    const r=sub(g,cg),v=bodyToWorld(r,s);
    const h=(e.surfaceHeight?.(s.position[0]+v[0]+offset*axle[0],s.position[2]+v[2]+offset*axle[2])??0)+rad-v[1];
    if(h>height){height=h;point=r;}
  }
  return {height,point};
}
export function contactHeight(s,e){return gear(s,e,centre(parameters,s,wingPose)).height;}

function rates(s,c,e,h){
  const {f,m,grounded,normal,phase_accel,pitch_accel}=dynamics(s,c,e);
  const v=s.velocity,acc=mul(f.force,1/m.mass);
  const air=sub(v,e.wind??zero),vx=air[0],vz=air[2],hs=vx*vx+vz*vz;
  let wheel=0;
  if(grounded){
    const ux=v[0]+h*acc[0],uz=v[2]+h*acc[2],speed=Math.hypot(ux,uz);
    if(speed>0){
      const resistance=(ctl.rolling_friction_coefficient*normal+ctl.brake_force_N*(c.brake??0))/m.mass;
      const retard=Math.min(resistance,speed/h);
      acc[0]-=retard*ux/speed;acc[2]-=retard*uz/speed;
    }
    acc[1]=m.ddc[1]*s.omega**2+m.dc[1]*phase_accel;
    wheel=-(v[0]*Math.cos(s.heading)+v[2]*Math.sin(s.heading))/parameters.wheel_radius_m;
  }
  return {acc,vel:v,grounded,phase:s.gliding?0:s.omega,omega:phase_accel,
    pitch:e.pitch_locked||grounded?0:s.pitch_rate,pitch_rate:pitch_accel,
    roll:grounded?0:s.roll_rate,roll_rate:grounded?0:ctl.roll_accel_rad_s2*(c.bank??0)-ctl.roll_damping_per_s*s.roll_rate,
    heading:hs>.25?(vx*acc[2]-vz*acc[0])/hs:0,wheel_angle:wheel,
    shaft_work_J:f.power,aero_work_J:f.wing_dissipation_W,
    drive_heat_J:f.power*(1-eng.transmission_efficiency)+f.phase_damping_Nm*s.omega+f.pitch_damping_Nm*s.pitch_rate,
    control_work_J:f.control_torque_Nm*s.pitch_rate,
    fuel_kg:-(f.power*E.fuel.bsfc_kg_kWh/3600000+(f.commanded?E.fuel.idle_kg_s:0))};
}
const scalars=['phase','omega','pitch','pitch_rate','roll','roll_rate','heading','wheel_angle',
  'shaft_work_J','aero_work_J','drive_heat_J','control_work_J','fuel_kg'];
function advance(s,k,h){
  const n={...s,time:(s.time??0)+h,position:add(s.position,mul(k.vel,h)),velocity:add(s.velocity,mul(k.acc,h))};
  for(const key of scalars)n[key]=(s[key]??0)+k[key]*h;
  n.fuel_kg=Math.max(0,n.fuel_kg);
  if(Math.abs(n.roll)>ctl.bank_limit_rad){
    n.roll=Math.sign(n.roll)*ctl.bank_limit_rad;
    if(n.roll*n.roll_rate>0)n.roll_rate=0;
  }
  n.status=k.grounded?'grounded':'flying';
  return n;
}
function centroidRate(s){
  const h=K.derivative_step;
  return mul(sub(centre(parameters,{...s,phase:s.phase+h},wingPose),
    centre(parameters,{...s,phase:s.phase-h},wingPose)),1/(2*h));
}
function contact(s,e,headingRate) {
  const cg=centre(parameters,s,wingPose);
  const {height}=gear(s,e,cg);
  if(s.status!=='grounded'&&s.position[1]>=height)return;
  const dc=centroidRate(s);
  if(s.status!=='grounded'){
    // Differentiate tyre clearance, not the CG's altitude. This accounts
    // for wing motion, roll, pitch and for terrain rising into the wheels.
    const eps=.0001;
    const ahead={...s,pitch:s.pitch+eps*s.pitch_rate,roll:s.roll+eps*s.roll_rate,
      heading:s.heading+eps*headingRate,position:add(s.position,mul(s.velocity,eps))};
    const h1=gear(ahead,e,add(cg,mul(dc,eps*s.omega))).height;
    const sink=(h1-height)/eps-s.velocity[1];
    if(sink>ctl.safe_touchdown_sink_m_s||Math.abs(s.roll)>ctl.safe_touchdown_bank_rad||
        Math.hypot(s.velocity[0],s.velocity[2])>ctl.safe_touchdown_speed_m_s){
      s.status='crashed';s.position[1]=height;return;
    }
  }
  s.pitch=0;s.pitch_rate=0;s.roll=0;s.roll_rate=0;s.status='grounded';
  s.position[1]=gear(s,e,cg).height;s.velocity[1]=dc[1]*s.omega;
}
function substep(s,c,e,h){
  // Bound the final powered interval by the fuel available. At this limit
  // all intermediate evaluations have fuel for their requested shaft work.
  if(s.fuel_kg>0&&c.throttle>0&&!s.gliding&&e.motor_enabled!==false){
    const maxRate=E.fuel.idle_kg_s+eng.continuous_shaft_limit_W*c.throttle*E.fuel.bsfc_kg_kWh/3600000;
    const safe=s.fuel_kg/maxRate;
    if(safe<h-1e-12){
      if(safe<1e-8)return substep({...s,fuel_kg:0},c,e,h);
      const next=substep(s,c,e,safe);
      return next.status==='crashed'?next:substep(next,c,e,h-safe);
    }
  }
  const k=rates(s,c,e,h),mid=advance(s,k,h/2);
  const k2=rates(mid,c,e,h),n=advance(s,k2,h);
  contact(n,e,k2.heading);
  return n;
}
export function step(s,c,e,dt){
  const count=Math.ceil(dt/K.integration_dt_max);
  let n=s;
  for(let i=0;i<count&&n.status!=='crashed';i++)n=substep(n,c,e,dt/count);
  return n;
}
