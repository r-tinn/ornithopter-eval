import {E} from './environment/engineering.mjs';
import {wingPose} from './kinematics.mjs';
import {mechanics,centre,add,sub,mul,dot,cross,unit,bodyToWorld,worldToBody} from './environment/source-mechanism.mjs';

// Photo 02: rounded "Say" 7.4 ft and original 6.61 square feet.
const AR=7.4**2/6.61;
export const parameters={
  aspect_ratio:AR,wrist_span_fraction:3.7/7.4,
  span_m:E.span_m,wing_area_m2:E.span_m**2/AR,body_length_m:E.body_length_m,
  pilot_mass_kg:E.pilot_mass_kg,dry_mass_kg:E.dry_mass_including_pilot_kg,
  mass_kg:E.dry_mass_including_pilot_kg+E.fuel.initial_kg,
  mass_budget:E.mass_budget.map(x=>({...x})),wheel_radius_m:E.wheel_radius_m,
  gear_centres:E.gear_centres_m.map(x=>x.slice())
};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function interpolate(xs,ys,x){
  if(x<=xs[0])return ys[0];
  for(let i=1;i<xs.length;i++)if(x<=xs[i]){
    const t=(x-xs[i-1])/(xs[i]-xs[i-1]);return ys[i-1]+t*(ys[i]-ys[i-1]);
  }
  return ys[ys.length-1];
}
export function polar(region,alpha,camber){
  const t=E.sections[String(region).toLowerCase().includes('outer')?'outer':'inner'];
  const cl=interpolate(E.sections.alpha_rad,t.cl_base,alpha)+t.camber_lift_gain*(camber-t.camber_reference)*Math.cos(alpha);
  const cd=interpolate(E.sections.alpha_rad,t.cd_base,alpha)+cl*cl/(Math.PI*E.aero.span_efficiency*AR);
  return {cl,cd,CL:cl,CD:cd};
}
function commanded(s,c,e){
  return !s.gliding&&e.motor_enabled!==false&&s.fuel_kg>0&&(c.throttle??0)>0;
}
export function forces(s,c,e,poseOverride){
  const poseFn=poseOverride?(typeof poseOverride==='function'?poseOverride:()=>poseOverride):wingPose;
  const m=mechanics(parameters,s,poseFn),rho=e.rho??E.rho_kg_m3;
  const air=worldToBody(sub(s.velocity,e.wind??[0,0,0]),s);
  let total=[0,0,0],wing=[0,0,0],Qphi=0,Qpitch=0,loss=0;
  function apply(F,jphi,jtheta){total=add(total,F);Qphi+=dot(F,jphi);Qpitch+=dot(F,jtheta);}
  for(const a of m.samples){
    let u=add(air,a.velocity);
    u=sub(u,mul(a.span,dot(u,a.span)));
    const speed=Math.hypot(...u);
    if(speed<1e-12||a.area<=0)continue;
    const d=mul(u,1/speed),alpha=Math.atan2(-dot(d,a.normal),dot(d,a.chord));
    const {cl,cd}=polar(a.region,alpha,a.camber),q=.5*rho*speed*speed*a.area;
    const F=mul(sub(mul(unit(cross(a.span,d)),cl),mul(d,cd)),q);
    wing=add(wing,F);apply(F,a.jphi,a.jtheta);loss+=q*cd*speed;
  }
  const r0=mul(m.cg,-1),j0=mul(m.dc,-1),jt0=[-r0[1],r0[0],0];
  const u0=add(air,add(mul(j0,s.omega),mul(jt0,s.pitch_rate)));
  const speed0=Math.hypot(...u0),flat=Object.values(E.aero.body_flat_plate_areas_m2).reduce((a,b)=>a+b,0);
  const drag=.5*rho*speed0*speed0*flat;
  apply(speed0>1e-12?mul(u0,-drag/speed0):[0,0,0],j0,jt0);
  loss+=drag*speed0;
  const tail=E.coupled,r=sub([-tail.tail_arm_m,0,0],m.cg),jt=[-r[1],r[0],0];
  const ut=add(air,add(mul(j0,s.omega),mul(jt,s.pitch_rate)));
  const u=[ut[0],ut[1],0],v=Math.hypot(...u);
  if(v>1e-12){
    const d=mul(u,1/v),alpha=Math.atan2(-u[1],u[0]);
    const cl=tail.tail_lift_slope*clamp(alpha+tail.tail_incidence_rad,-.35,.35);
    const cd=tail.tail_drag_coefficient+.08*alpha*alpha,q=.5*rho*v*v*tail.tail_area_m2;
    apply(mul(sub(mul(cross([0,0,1],d),cl),mul(d,cd)),q),j0,jt);
    loss+=q*cd*v;
  }
  const horizontal=[air[0],0,air[2]],hs=Math.hypot(...horizontal);
  if(hs>1e-12){
    const side=[-horizontal[2]/hs,0,horizontal[0]/hs];
    apply(mul(side,.5*rho*hs*hs*E.controls.rudder_coefficient*(c.rudder??0)),j0,jt);
  }
  const throttle=clamp(c.throttle??0,0,1),eng=E.engine;
  let shaft=0;
  if(commanded(s,c,e)&&s.omega>=0){
    const cap=Math.min(eng.starting_torque_Nm,eng.continuous_shaft_limit_W*throttle/Math.max(.5,Math.abs(s.omega)));
    shaft=clamp(eng.governor_torque_gain_Nm_s*(2*Math.PI*eng.maximum_wingbeat_hz*throttle-s.omega),0,cap);
  }
  const power=shaft*s.omega,ds=e.damping_scale??1;
  const phaseDamping=E.coupled.phase_damping_Nm_s*s.omega*ds;
  const pitchDamping=E.coupled.pitch_damping_Nm_s*s.pitch_rate*ds;
  const control=E.coupled.pitch_control_torque_Nm*(c.pitch??0);
  const force=bodyToWorld(total,s);force[1]-=m.mass*(e.gravity??E.gravity_m_s2);
  return {lift:bodyToWorld(wing,s)[1],thrust:wing[0],drag,power,
    airspeed:Math.hypot(...air),aero_power_W:-Qphi*s.omega,
    wing_dissipation_W:loss,mass_kg:m.mass,Qphi,Qpitch,
    motor_torque_Nm:shaft*eng.transmission_efficiency,control_torque_Nm:control,
    phase_damping_Nm:phaseDamping,pitch_damping_Nm:pitchDamping,
    force,wing_force_body_N:wing,mechanics:m};
}
export function contactHeight(s,e){
  const cg=centre(parameters,s,wingPose),height=e.surfaceHeight??(()=>0);
  let h=-Infinity;
  for(const wheel of parameters.gear_centres){
    const r=bodyToWorld(sub(wheel,cg),s);
    // The projected circular tyre radius, about its actual lateral axle.
    const axis=bodyToWorld([0,0,1],s);
    const radius=parameters.wheel_radius_m*Math.sqrt(Math.max(0,1-axis[1]**2));
    h=Math.max(h,height(s.position[0]+r[0],s.position[2]+r[2])-r[1]+radius);
  }
  return h;
}
export function accelerations(s,c,e){
  const f=forces(s,c,e),m=f.mechanics,w=s.omega,p=s.pitch_rate;
  const R1=f.motor_torque_Nm+f.Qphi-m.Up-f.phase_damping_Nm-.5*m.Ap*w*w+.5*m.Cp*p*p;
  const R2=f.Qpitch+f.control_torque_Nm-f.pitch_damping_Nm-m.Bp*w*w-m.Cp*w*p;
  const determinant=m.A*m.C-m.B*m.B;
  let phase_accel=(R1*m.C-m.B*R2)/determinant;
  let pitch_accel=(m.A*R2-m.B*R1)/determinant,normal=0,grounded=false;
  const force=f.force.slice();
  if(e.pitch_locked){phase_accel=R1/m.A;pitch_accel=0;}
  else if(s.status==='grounded'&&s.position[1]<=contactHeight(s,e)+.02){
    const Ag=m.A+m.mass*m.dc[1]**2,Agp=m.Ap+2*m.mass*m.dc[1]*m.ddc[1];
    const a=(f.motor_torque_Nm+f.Qphi-m.Up-f.phase_damping_Nm-.5*Agp*w*w+force[1]*m.dc[1])/Ag;
    normal=m.mass*(m.ddc[1]*w*w+m.dc[1]*a)-force[1];
    if(normal>=0){
      grounded=true;phase_accel=a;pitch_accel=0;force[1]+=normal;
      const speed=Math.hypot(s.velocity[0],s.velocity[2]);
      if(speed>1e-8){
        const resistance=E.controls.rolling_friction_coefficient*normal+E.controls.brake_force_N*clamp(c.brake??0,0,1);
        // Saturation prevents Coulomb friction from reversing a stopped wheel.
        const friction=Math.min(resistance,speed*m.mass/E.coupled.integration_dt_max);
        force[0]-=friction*s.velocity[0]/speed;force[2]-=friction*s.velocity[2]/speed;
      }
    }
  }
  return {...f,force,phase_accel,pitch_accel,normal_load_N:Math.max(0,normal),grounded};
}
function derivative(s,c,e){
  const a=accelerations(s,c,e),m=a.mechanics;
  const bank=clamp(c.bank??0,-1,1);
  const rollAccel=E.controls.roll_accel_rad_s2*bank-E.controls.roll_damping_per_s*s.roll_rate;
  const fuel=commanded(s,c,e)?a.power*E.fuel.bsfc_kg_kWh/3600000+E.fuel.idle_kg_s:0;
  return {a,position:s.velocity,velocity:mul(a.force,1/m.mass),
    phase:s.omega,omega:a.phase_accel,pitch:e.pitch_locked||a.grounded?0:s.pitch_rate,
    pitch_rate:a.pitch_accel,roll:s.roll_rate,roll_rate:rollAccel,
    heading:(c.rudder??0)*E.controls.rudder_coefficient,
    fuel_kg:-fuel,wheel_angle:-Math.hypot(s.velocity[0],s.velocity[2])/parameters.wheel_radius_m,
    shaft_work_J:a.power,aero_work_J:a.wing_dissipation_W,
    drive_heat_J:a.power*(1-E.engine.transmission_efficiency)+a.phase_damping_Nm*s.omega+a.pitch_damping_Nm*s.pitch_rate,
    control_work_J:a.control_torque_Nm*s.pitch_rate};
}
const scalars=['phase','omega','pitch','pitch_rate','roll','roll_rate','heading','fuel_kg','wheel_angle','shaft_work_J','aero_work_J','drive_heat_J','control_work_J'];
function advance(s,d,h){
  const n={...s,position:add(s.position,mul(d.position,h)),velocity:add(s.velocity,mul(d.velocity,h))};
  for(const key of scalars)n[key]=(s[key]??0)+h*d[key];
  n.fuel_kg=Math.max(0,n.fuel_kg);
  return n;
}
export function step(state,c,e,dt){
  let s={...state,position:state.position.slice(),velocity:state.velocity.slice()};
  if(s.status==='crashed'||!(dt>0))return s;
  const count=Math.ceil(dt/E.coupled.integration_dt_max),h=dt/count;
  for(let i=0;i<count;i++){
    const d0=derivative(s,c,e),mid=advance(s,d0,h/2);
    if(d0.a.grounded){
      mid.pitch=0;mid.pitch_rate=0;mid.roll=0;mid.roll_rate=0;
      mid.position[1]=contactHeight(mid,e);
      mid.velocity[1]=centreVerticalRate(mid);
    }
    const dm=derivative(mid,c,e);
    let n=advance(s,dm,h);n.time=(s.time??0)+h;
    if(dm.a.grounded){
      n.pitch=0;n.pitch_rate=0;n.roll=0;n.roll_rate=0;n.status='grounded';
      n.position[1]=contactHeight(n,e);n.velocity[1]=centreVerticalRate(n);
    }else{
      n.status='flying';
      const contact=contactHeight(n,e);
      if(n.position[1]<contact&&(e.gravity??E.gravity_m_s2)>0&&!e.pitch_locked){
        const m=dm.a.mechanics;
        // Gear velocity is CG velocity less the wing-driven CG reaction,
        // plus the rotational velocity of the body-fixed contact point.
        const j=bodyToWorld(m.dc,n);
        const sink=n.velocity[1]-j[1]*n.omega;
        const unsafe=sink < -E.controls.safe_touchdown_sink_m_s||
          Math.hypot(n.velocity[0],n.velocity[2])>E.controls.safe_touchdown_speed_m_s||
          Math.abs(n.roll)>E.controls.safe_touchdown_bank_rad;
        n.status=unsafe?'crashed':'grounded';
        n.pitch=0;n.pitch_rate=0;n.roll=0;n.roll_rate=0;
        n.position[1]=contactHeight(n,e);n.velocity[1]=centreVerticalRate(n);
      }
    }
    if(e.pitch_locked){n.pitch=s.pitch;n.pitch_rate=s.pitch_rate;}
    s=n;if(s.status==='crashed')break;
  }
  return s;
}
function centreVerticalRate(s){
  // A narrow CG-only derivative avoids recomputing the full mass matrix.
  const h=E.coupled.derivative_step;
  return (centre(parameters,{...s,phase:s.phase+h},wingPose)[1]-centre(parameters,{...s,phase:s.phase-h},wingPose)[1])/(2*h)*s.omega;
}
