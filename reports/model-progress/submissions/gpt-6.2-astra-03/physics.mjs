import {E} from './environment/engineering.mjs';
import {mechanics,centre,bodyToWorld,worldToBody,add,sub,mul,dot,cross,unit} from './environment/source-mechanism.mjs';
import {wingPose} from './kinematics.mjs';

const AR=7.4**2/6.61;
export const parameters={
  aspect_ratio:AR,wrist_span_fraction:3.7/7.4,span_m:E.span_m,
  wing_area_m2:E.span_m**2/AR,body_length_m:E.body_length_m,pilot_mass_kg:E.pilot_mass_kg,
  dry_mass_kg:E.dry_mass_including_pilot_kg,mass_kg:E.dry_mass_including_pilot_kg+E.fuel.initial_kg,
  mass_budget:E.mass_budget,wheel_radius_m:E.wheel_radius_m,gear_centres:E.gear_centres_m
};
const K=E.coupled, ctl=E.controls, eng=E.engine;
const clamp=(n,l,h)=>Math.min(h,Math.max(l,n));
const bodyArea=Object.values(E.aero.body_flat_plate_areas_m2).reduce((a,b)=>a+b,0);
const zero=[0,0,0];

export function polar(region,alpha,camber){
  const xs=E.sections.alpha_rad, t=E.sections[region];
  let i=0;
  while(i<xs.length-2 && alpha>xs[i+1])i++;
  const f=clamp((alpha-xs[i])/(xs[i+1]-xs[i]),0,1);
  const lerp=ys=>ys[i]+(ys[i+1]-ys[i])*f;
  const cl=lerp(t.cl_base)+t.camber_lift_gain*((camber??t.camber_reference)-t.camber_reference)*Math.cos(alpha);
  const cd=lerp(t.cd_base)+cl*cl/(Math.PI*E.aero.span_efficiency*AR);
  return {cl,cd,CL:cl,CD:cd};
}

function loads(s,c,e,q,powerLimit=Infinity){
  const rho=e.rho??E.rho_kg_m3, gravity=e.gravity??E.gravity_m_s2;
  const air=worldToBody(sub(s.velocity,e.wind??zero),s);
  const o=s.omega,v=s.pitch_rate;
  let F=[0,0,0],Qphi=0,Qpitch=0,loss=0;
  function apply(f,j,k){
    F=add(F,f);Qphi+=dot(f,j);Qpitch+=dot(f,k);
  }
  for(const strip of q.samples){
    if(strip.area===0)continue;
    const raw=add(air,strip.velocity);
    const u=sub(raw,mul(strip.span,dot(raw,strip.span))),speed=Math.hypot(...u);
    if(speed===0)continue;
    const d=mul(u,1/speed),alpha=Math.atan2(-dot(d,strip.normal),dot(d,strip.chord));
    const {cl,cd}=polar(strip.region,alpha,strip.camber),qS=.5*rho*speed*speed*strip.area;
    apply(mul(sub(mul(unit(cross(strip.span,d)),cl),mul(d,cd)),qS),strip.jphi,strip.jtheta);
    loss+=qS*cd*speed;
  }
  const wing_force_body_N=F.slice(),lift=bodyToWorld(F,s)[1];
  const j=mul(q.dc,-1),pitchJ=r=>[-r[1],r[0],0];
  const local=k=>add(add(air,mul(j,o)),mul(k,v));
  const k0=pitchJ(mul(q.cg,-1)), body=local(k0),V=Math.hypot(...body);
  const drag=.5*rho*bodyArea*V*V;
  apply(mul(unit(body),-drag),j,k0);
  loss+=drag*V;

  const kt=pitchJ(sub([-K.tail_arm_m,0,0],q.cg));
  const [tx,ty]=local(kt),vt=Math.hypot(tx,ty);
  if(vt>0){
    const d=[tx/vt,ty/vt,0],alpha=Math.atan2(-ty,tx);
    const cl=K.tail_lift_slope*clamp(alpha+K.tail_incidence_rad,-.35,.35);
    const cd=K.tail_drag_coefficient+.08*alpha*alpha,qS=.5*rho*vt*vt*K.tail_area_m2;
    apply(mul(sub(mul([-d[1],d[0],0],cl),mul(d,cd)),qS),j,kt);
    loss+=qS*cd*vt;
  }
  const force=bodyToWorld(F,s),rel=sub(s.velocity,e.wind??zero);
  const side=.5*rho*Math.hypot(rel[0],rel[2])*ctl.rudder_coefficient*(c.rudder??0)*parameters.wing_area_m2;
  force[0]-=side*rel[2];force[2]+=side*rel[0];force[1]-=q.mass*gravity;

  const throttle=clamp(c.throttle??0,0,1);
  const on=throttle>0 && s.fuel_kg>0 && !s.gliding && e.motor_enabled!==false;
  const governor=eng.governor_torque_gain_Nm_s*(2*Math.PI*eng.maximum_wingbeat_hz*throttle-o);
  const torque=on && o>=0?Math.min(clamp(governor,0,eng.starting_torque_Nm),
    eng.continuous_shaft_limit_W*throttle/Math.max(.5,Math.abs(o)),
    powerLimit/Math.max(1e-12,o)):0;
  const damping=e.damping_scale??1;
  return {lift,thrust:wing_force_body_N[0],wing_force_body_N,drag,force,Qphi,Qpitch,
    power:torque*o,motor_torque_Nm:torque*eng.transmission_efficiency,
    control_torque_Nm:K.pitch_control_torque_Nm*(c.pitch??0),
    phase_damping_Nm:K.phase_damping_Nm_s*o*damping,pitch_damping_Nm:K.pitch_damping_Nm_s*v*damping,
    aero_power_W:-Qphi*o,wing_dissipation_W:loss,airspeed:Math.hypot(...rel),mass_kg:q.mass,engine_on:on};
}
export function forces(s,c,e,poseOverride){
  const q=mechanics(parameters,s,poseOverride?()=>poseOverride:wingPose);
  return loads(s,c,e,q);
}

// Torus tyre: its circular tread is perpendicular to the lateral axle.
function contact(s,e,cg){
  const axle=bodyToWorld([0,0,1],s),tube=.045,ring=parameters.wheel_radius_m-tube;
  const surface=e.surfaceHeight??(()=>0);
  let height=-Infinity,point;
  for(const g of parameters.gear_centres){
    const r=bodyToWorld(sub(g,cg),s);
    const x=s.position[0]+r[0],z=s.position[2]+r[2],level=surface(x,z);
    const dx=(surface(x+.05,z)-level)/.05,dz=(surface(x,z+.05)-level)/.05;
    // Support of a torus on the local terrain facet: one radius in the
    // tyre plane, and the tread radius along the facet normal.
    const n=unit([-dx,1,-dz]),inPlane=sub(n,mul(axle,dot(n,axle)));
    const offset=add(mul(unit(inPlane),-ring),mul(n,-tube));
    const h=(dx===0&&dz===0&&s.roll===0?level:surface(x+offset[0],z+offset[2]))-r[1]-offset[1];
    if(h>height){height=h;point=g;}
  }
  return {height,point};
}
export function contactHeight(s,e){return contact(s,e,centre(parameters,s,wingPose)).height;}

function derivative(state,c,e,tryGround,h,powerLimit=Infinity){
  const s=state,q=mechanics(parameters,s,wingPose);
  // "Grounded" is contact history, not a force that can pull the aircraft
  // back onto a distant strip. Allow for O(h²) in the midpoint predictor.
  if(tryGround && s.position[1]>contact(s,e,q.cg).height+.001)tryGround=false;
  // At intermediate quadrature positions use the tangent velocity, rather
  // than the previous configuration's vertical reaction.
  const o=s.omega, v=s.pitch_rate,cy=q.dc[1],cc=q.ddc[1];
  const input=tryGround?{...s,velocity:[s.velocity[0],cy*o,s.velocity[2]]}:s;
  const f=loads(input,c,e,q,powerLimit);
  const drive=f.motor_torque_Nm+f.Qphi-q.Up-f.phase_damping_Nm;
  const pitch=f.Qpitch+f.control_torque_Nm-f.pitch_damping_Nm;
  const R1=drive-.5*q.Ap*o*o+.5*q.Cp*v*v;
  const R2=pitch-q.Bp*o*o-q.Cp*o*v,det=q.A*q.C-q.B*q.B;
  let phase_accel=(q.C*R1-q.B*R2)/det,pitch_accel=(q.A*R2-q.B*R1)/det;
  if(e.pitch_locked){phase_accel=R1/q.A;pitch_accel=0;}
  if(s.gliding){phase_accel=0;pitch_accel=e.pitch_locked?0:pitch/q.C;}
  let grounded=false,acc=mul(f.force,1/q.mass);
  if(tryGround){
    const Ag=q.A+q.mass*cy*cy,Agp=q.Ap+2*q.mass*cy*cc;
    const ao=s.gliding?0:(drive-.5*Agp*o*o+f.force[1]*cy)/Ag;
    const ay=cc*o*o+cy*ao,normal=q.mass*ay-f.force[1];
    if(normal>=0){
      grounded=true;phase_accel=ao;pitch_accel=0;acc[1]=ay;
      // Oppose predicted rolling velocity; static friction cannot reverse it.
      const vx=s.velocity[0]+acc[0]*h,vz=s.velocity[2]+acc[2]*h,speed=Math.hypot(vx,vz);
      if(speed>0){
        const slow=Math.min(speed/h,(ctl.rolling_friction_coefficient*normal+(c.brake??0)*ctl.brake_force_N)/q.mass);
        acc[0]-=slow*vx/speed;acc[2]-=slow*vz/speed;
      }
    }
  }
  const flat2=s.velocity[0]**2+s.velocity[2]**2;
  const headingRate=flat2>1?(s.velocity[0]*acc[2]-s.velocity[2]*acc[0])/flat2:0;
  return {f,phase_accel,pitch_accel,force:f.force,acc,grounded,
    vel:input.velocity,phaseRate:s.gliding?0:o,pitchRate:e.pitch_locked||grounded?0:v,
    rollRate:grounded?0:s.roll_rate,rollAccel:grounded?0:ctl.roll_accel_rad_s2*(c.bank??0)-ctl.roll_damping_per_s*s.roll_rate,
    headingRate,spin:grounded?-Math.hypot(s.velocity[0],s.velocity[2])/parameters.wheel_radius_m:0,
    heat:f.power*(1-eng.transmission_efficiency)+o*f.phase_damping_Nm+v*f.pitch_damping_Nm,
    pilotWork:f.control_torque_Nm*v};
}
export function accelerations(s,c,e){
  const {phase_accel,pitch_accel,force}=derivative(s,c,e,s.status==='grounded',K.integration_dt_max);
  return {phase_accel,pitch_accel,force};
}
function advance(s,d,h){
  const roll=clamp(s.roll+h*d.rollRate,-ctl.bank_limit_rad,ctl.bank_limit_rad);
  const rr=s.roll_rate+h*d.rollAccel;
  return {...s,position:add(s.position,mul(d.vel,h)),velocity:add(s.velocity,mul(d.acc,h)),
    phase:s.phase+h*d.phaseRate,omega:s.omega+h*d.phase_accel,
    pitch:d.grounded?0:s.pitch+h*d.pitchRate,pitch_rate:d.grounded?0:s.pitch_rate+h*d.pitch_accel,
    roll:d.grounded?0:roll,roll_rate:d.grounded||Math.abs(roll)>=ctl.bank_limit_rad && rr*roll>0?0:rr,
    heading:s.heading+h*d.headingRate,wheel_angle:(s.wheel_angle??0)+h*d.spin,
    time:(s.time??0)+h,status:d.grounded?'grounded':'flying',
    fuel_kg:Math.max(0,s.fuel_kg-h*(d.f.power*E.fuel.bsfc_kg_kWh/3600000+(d.f.engine_on?E.fuel.idle_kg_s:0))),
    shaft_work_J:(s.shaft_work_J??0)+h*d.f.power,aero_work_J:(s.aero_work_J??0)+h*d.f.wing_dissipation_W,
    drive_heat_J:(s.drive_heat_J??0)+h*d.heat,control_work_J:(s.control_work_J??0)+h*d.pilotWork};
}
function contactCorrection(s,e,grounded){
  const cg=centre(parameters,s,wingPose), {height}=contact(s,e,cg);
  if(!grounded && s.position[1]>height)return s;
  const h=K.derivative_step;
  if(!grounded){
    // Differentiate the clearance itself, not just the CG altitude. This
    // includes the moving mass centre, pitch/roll of the lowest wheel and
    // terrain rising or falling along the track.
    const ahead={...s,position:add(s.position,mul(s.velocity,h)),phase:s.phase+h*s.omega,
      pitch:s.pitch+h*s.pitch_rate,roll:s.roll+h*s.roll_rate};
    const sink=(contactHeight(ahead,e)-height)/h-s.velocity[1];
    if(sink<0){s.position[1]=height;return s;}
    if(sink>ctl.safe_touchdown_sink_m_s ||
       Math.hypot(s.velocity[0],s.velocity[2])>ctl.safe_touchdown_speed_m_s ||
       Math.abs(s.roll)>ctl.safe_touchdown_bank_rad){
      s.position[1]=height;s.status='crashed';return s;
    }
  }
  const dc=mul(sub(centre(parameters,{...s,phase:s.phase+h},wingPose),
                   centre(parameters,{...s,phase:s.phase-h},wingPose)),.5/h);
  s.status='grounded';s.pitch=s.pitch_rate=s.roll=s.roll_rate=0;
  s.position[1]=contact(s,e,cg).height;s.velocity[1]=dc[1]*s.omega;
  return s;
}
export function step(state,c,e,dt){
  let s=state;
  const n=Math.ceil(dt/K.integration_dt_max),h=dt/n;
  for(let i=0;i<n && s.status!=='crashed';i++){
    // The last fraction of fuel can supply at most this substep's work.
    const pmax=Math.max(0,s.fuel_kg/h-E.fuel.idle_kg_s)*3600000/E.fuel.bsfc_kg_kWh;
    const a=derivative(s,c,e,s.status==='grounded',h,pmax);
    const mid=advance(s,a,.5*h);
    const b=derivative(mid,c,e,a.grounded,h,pmax);
    s=contactCorrection(advance(s,b,h),e,b.grounded);
  }
  return s;
}
