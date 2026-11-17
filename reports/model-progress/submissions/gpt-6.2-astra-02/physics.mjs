import {E} from './environment/engineering.mjs';
import {mechanics,centre,add,sub,mul,dot,cross,unit,worldToBody,bodyToWorld} from './environment/source-mechanism.mjs';
import {wingPose} from './kinematics.mjs';

const AR=7.4**2/6.61, K=E.coupled, G=E.controls, motor=E.engine;
export const parameters={
  aspect_ratio:AR,wrist_span_fraction:3.7/7.4,span_m:E.span_m,
  wing_area_m2:E.span_m**2/AR,body_length_m:E.body_length_m,
  pilot_mass_kg:E.pilot_mass_kg,dry_mass_kg:E.dry_mass_including_pilot_kg,
  mass_kg:E.dry_mass_including_pilot_kg+E.fuel.initial_kg,
  mass_budget:E.mass_budget,wheel_radius_m:E.wheel_radius_m,gear_centres:E.gear_centres_m
};
const P=parameters, zero=[0,0,0], clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const norm=v=>Math.hypot(...v), J=r=>[-r[1],r[0],0];
const plate=Object.values(E.aero.body_flat_plate_areas_m2).reduce((a,b)=>a+b,0);
export function polar(region,alpha,camber){
  const sec=E.sections[region.toLowerCase()],x=E.sections.alpha_rad;
  let i=1;while(i<x.length-1 && alpha>x[i])i++;
  const f=clamp((alpha-x[i-1])/(x[i]-x[i-1]),0,1);
  const at=y=>y[i-1]+(y[i]-y[i-1])*f;
  const cl=at(sec.cl_base)+sec.camber_lift_gain*((camber??sec.camber_reference)-sec.camber_reference)*Math.cos(alpha);
  const cd=at(sec.cd_base)+cl*cl/(Math.PI*E.aero.span_efficiency*AR);
  return {cl,cd,CL:cl,CD:cd};
}
const command=(s,c,e)=>s.fuel_kg>0 && c.throttle>0 && !s.gliding && e.motor_enabled!==false;

function loads(s,c,e,m){
  const u0=worldToBody(sub(s.velocity,e.wind??zero),s),rho=e.rho??E.rho_kg_m3;
  let F=[0,0,0], Qphi=0,Qpitch=0,loss=0;
  function apply(f,j,k){
    F=add(F,f);Qphi+=dot(f,j);Qpitch+=dot(f,k);
  }
  for(const a of m.samples){
    if(a.area<=0)continue;
    const raw=add(u0,a.velocity),u=sub(raw,mul(a.span,dot(a.span,raw))),v=norm(u);
    if(v<1e-12)continue;
    const d=mul(u,1/v);
    const alpha=Math.atan2(-dot(d,a.normal),dot(d,a.chord));
    const {cl,cd}=polar(a.region,alpha,a.camber),q=.5*rho*v*v*a.area;
    apply(sub(mul(unit(cross(a.span,d)),q*cl),mul(d,q*cd)),a.jphi,a.jtheta);
    loss+=q*cd*v;
  }
  const wing=F;
  const j=mul(m.dc,-1),k=J(mul(m.cg,-1));
  const bodyVelocity=add(u0,mul(j,s.omega));
  const ub=add(bodyVelocity,mul(k,s.pitch_rate)),vb=norm(ub);
  const drag=.5*rho*vb*vb*plate;
  apply(mul(ub,-.5*rho*vb*plate),j,k);loss+=drag*vb;

  const kt=J(sub([-K.tail_arm_m,0,0],m.cg)),ut=add(bodyVelocity,mul(kt,s.pitch_rate));
  const vt=Math.hypot(ut[0],ut[1]);
  if(vt>1e-12){
    const d=[ut[0]/vt,ut[1]/vt,0],alpha=Math.atan2(-d[1],d[0]);
    const cl=K.tail_lift_slope*clamp(alpha+K.tail_incidence_rad,-.35,.35);
    const cd=K.tail_drag_coefficient+.08*alpha*alpha,q=.5*rho*vt*vt*K.tail_area_m2;
    apply(sub(mul([-d[1],d[0],0],q*cl),mul(d,q*cd)),j,kt);
    loss+=q*cd*vt;
  }
  // Lateral control in the horizontal plane; no velocity is assigned by steering.
  const vAir=sub(s.velocity,e.wind??zero),vh=Math.hypot(vAir[0],vAir[2]);
  const side=.5*rho*vh*K.tail_area_m2*G.rudder_coefficient*(c.rudder??0);
  const force=add(bodyToWorld(F,s),[-side*vAir[2],-m.mass*(e.gravity??E.gravity_m_s2),side*vAir[0]]);
  const th=clamp(c.throttle??0,0,1),target=2*Math.PI*motor.maximum_wingbeat_hz*th;
  const torque=command(s,c,e)&&s.omega>=0?clamp(motor.governor_torque_gain_Nm_s*(target-s.omega),0,
    Math.min(motor.starting_torque_Nm,motor.continuous_shaft_limit_W*th/Math.max(.5,Math.abs(s.omega)))):0;
  return {lift:bodyToWorld(wing,s)[1],thrust:wing[0],drag,force,wing_force_body_N:wing,
    Qphi,Qpitch,mass_kg:m.mass,airspeed:norm(u0),power:torque*s.omega,
    motor_torque_Nm:torque*motor.transmission_efficiency,
    phase_damping_Nm:K.phase_damping_Nm_s*s.omega*(e.damping_scale??1),
    pitch_damping_Nm:K.pitch_damping_Nm_s*s.pitch_rate*(e.damping_scale??1),
    control_torque_Nm:K.pitch_control_torque_Nm*(c.pitch??0),
    aero_power_W:-Qphi*s.omega,wing_dissipation_W:loss};
}
export function forces(s,c,e,poseOverride){
  const pose=typeof poseOverride==='function'?poseOverride(s):poseOverride;
  return loads(s,c,e,mechanics(P,s,pose?()=>pose:wingPose));
}

// The tyre is a circular tread of radius 0.22R on a ring of radius 0.78R.
function groundHeight(s,e,cg){
  let floor=-Infinity;
  const axis=bodyToWorld([0,0,1],s),R=P.wheel_radius_m;
  for(const ctr of P.gear_centres){
    const r=bodyToWorld(sub(ctr,cg),s);
    const x=s.position[0]+r[0],z=s.position[2]+r[2],height=e.surfaceHeight;
    const y=height?height(x,z):0;
    // The service strips are level, but a landing away from them may be
    // on one of the sloping terrain triangles. Use the torus support in
    // that triangle's normal direction, not a vertical spherical wheel.
    const gx=height?(height(x+R,z)-height(x-R,z))/(2*R):0;
    const gz=height?(height(x,z+R)-height(x,z-R))/(2*R):0;
    const n2=1+gx*gx+gz*gz,axial=axis[1]-axis[0]*gx-axis[2]*gz;
    const below=R*(.22*Math.sqrt(n2)+.78*Math.sqrt(Math.max(0,n2-axial*axial)));
    floor=Math.max(floor,y+below-r[1]);
  }
  return floor;
}
export function contactHeight(s,e){return groundHeight(s,e,centre(P,s,wingPose));}

function derivative(s,c,e,ground,h){
  const m=mechanics(P,s,wingPose),f=loads(s,c,e,m);
  const w=s.omega,v=s.pitch_rate,mass=m.mass;
  const phaseLoad=f.motor_torque_Nm+f.Qphi-m.Up-f.phase_damping_Nm;
  const R1=phaseLoad-.5*m.Ap*w*w+.5*m.Cp*v*v;
  const R2=f.Qpitch+f.control_torque_Nm-f.pitch_damping_Nm-m.Bp*w*w-m.Cp*w*v;
  const det=m.A*m.C-m.B*m.B;
  let aw=(m.C*R1-m.B*R2)/det,av=(m.A*R2-m.B*R1)/det;
  if(e.pitch_locked){aw=R1/m.A;av=0;}
  if(s.gliding){aw=0;av=e.pitch_locked?0:R2/m.C;}
  const acc=mul(f.force,1/mass);
  let supported=false;
  if(ground){
    const d=m.dc[1],dd=m.ddc[1],Ag=m.A+mass*d*d;
    const ag=s.gliding?0:(phaseLoad-.5*(m.Ap+2*mass*d*dd)*w*w+f.force[1]*d)/Ag;
    const ay=dd*w*w+d*ag,N=mass*ay-f.force[1];
    if(N>=0){
      supported=true;aw=ag;av=0;acc[1]=ay;
      const friction=(N*G.rolling_friction_coefficient+(c.brake??0)*G.brake_force_N)/mass;
      const vx=s.velocity[0]+acc[0]*h,vz=s.velocity[2]+acc[2]*h;
      const frictionScale=Math.min(1/h,friction/Math.max(1e-12,Math.hypot(vx,vz)));
      acc[0]-=vx*frictionScale;acc[2]-=vz*frictionScale;
    }
  }
  const air=sub(s.velocity,e.wind??zero),speed2=air[0]**2+air[2]**2;
  const yaw=speed2>1?(air[0]*acc[2]-air[2]*acc[0])/speed2:0;
  return {force:f.force,phase_accel:aw,pitch_accel:av,supported,acc,
    burn:f.power*E.fuel.bsfc_kg_kWh/3600000+(command(s,c,e)?E.fuel.idle_kg_s:0),
    heat:f.power*(1-motor.transmission_efficiency)+f.phase_damping_Nm*w+f.pitch_damping_Nm*v,
    shaft:f.power,diss:f.wing_dissipation_W,control:f.control_torque_Nm*v,
    spin:supported?-(s.velocity[0]*Math.cos(s.heading)+s.velocity[2]*Math.sin(s.heading))/P.wheel_radius_m:0,
    rollAcc:supported?0:G.roll_accel_rad_s2*(c.bank??0)-G.roll_damping_per_s*s.roll_rate,
    yaw,dpos:s.velocity,dphase:w,dpitch:e.pitch_locked?0:v,droll:supported?0:s.roll_rate,
    dcy:m.dc[1],ddcy:m.ddc[1]};
}
export function accelerations(s,c,e){
  const {force,phase_accel,pitch_accel}=derivative(s,c,e,s.status==='grounded',K.integration_dt_max);
  return {force,phase_accel,pitch_accel};
}
function advance(s,k,h){
  const roll=clamp(s.roll+h*k.droll,-G.bank_limit_rad,G.bank_limit_rad);
  const rate=s.roll_rate+h*k.rollAcc;
  return {...s,position:add(s.position,mul(k.dpos,h)),velocity:add(s.velocity,mul(k.acc,h)),
    omega:s.omega+h*k.phase_accel,phase:s.phase+h*k.dphase,pitch_rate:s.pitch_rate+h*k.pitch_accel,
    pitch:s.pitch+h*k.dpitch,roll,roll_rate:Math.abs(roll)>=G.bank_limit_rad&&rate*roll>0?0:rate,
    heading:s.heading+h*k.yaw,time:s.time+h,wheel_angle:(s.wheel_angle??0)+h*k.spin,
    fuel_kg:Math.max(0,s.fuel_kg-h*k.burn),shaft_work_J:(s.shaft_work_J??0)+h*k.shaft,
    aero_work_J:(s.aero_work_J??0)+h*k.diss,drive_heat_J:(s.drive_heat_J??0)+h*k.heat,
    control_work_J:(s.control_work_J??0)+h*k.control};
}

// Project a supported body back onto the rolling manifold rather than
// throwing away the vertical COM velocity at the end of every step.
function settle(s,e){
  s.pitch=s.pitch_rate=s.roll=s.roll_rate=0;
  s.position[1]=contactHeight(s,e);
  const h=K.derivative_step;
  const cy=ph=>centre(P,{...s,phase:ph},wingPose)[1];
  s.velocity[1]=s.omega*(cy(s.phase+h)-cy(s.phase-h))/(2*h);
  s.status='grounded';
}
function handleContact(n,e,k){
  if(k.supported){settle(n,e);return;}
  n.status='flying';
  const height=contactHeight(n,e);
  if(n.position[1]>height)return;
  const h=1e-5;
  const future={...n,phase:n.phase+h*n.omega,pitch:n.pitch+h*n.pitch_rate,roll:n.roll+h*n.roll_rate,
    position:add(n.position,mul(n.velocity,h))};
  const sink=(contactHeight(future,e)-height)/h-n.velocity[1];
  n.position[1]=height;
  if(sink<0)return; // Lifting clear, not a landing impact.
  if(sink>G.safe_touchdown_sink_m_s || Math.hypot(n.velocity[0],n.velocity[2])>G.safe_touchdown_speed_m_s ||
     Math.abs(n.roll)>G.safe_touchdown_bank_rad){n.status='crashed';return;}
  settle(n,e);
}
export function step(s,c,e,dt){
  let left=dt;
  while(left>1e-12 && s.status!=='crashed'){
    let h=Math.min(left,K.integration_dt_max);
    const ground=s.status==='grounded';
    const a=derivative(s,c,e,ground,h);
    // Locate fuel exhaustion as an event within the step. Use a positive-fuel
    // midpoint on the powered side, then integrate the remaining coast normally.
    if(a.burn>0)h=Math.min(h,s.fuel_kg/a.burn);
    const mid=advance(s,a,.5*h);
    const b=derivative(mid,c,e,ground&&a.supported,h);
    if(b.burn>0)h=Math.min(h,s.fuel_kg/b.burn);
    const next=advance(s,b,h);
    if(next.fuel_kg<1e-15)next.fuel_kg=0;
    handleContact(next,e,b);
    left-=h;s=next;
  }
  return s;
}
