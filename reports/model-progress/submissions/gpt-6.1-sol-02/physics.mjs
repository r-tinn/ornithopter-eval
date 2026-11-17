import {E} from './environment/engineering.mjs';
import {wingPose} from './kinematics.mjs';
import {mechanics,centre,add,sub,mul,dot,cross,unit,bodyToWorld,worldToBody} from './environment/source-mechanism.mjs';

// Photo 02: rounded "Say" full span 7.4 ft, area paragraph 6.61 ft².
const AR=7.4**2/6.61;
export const parameters={
  aspect_ratio:AR,wrist_span_fraction:3.7/7.4,span_m:E.span_m,
  wing_area_m2:E.span_m**2/AR,body_length_m:E.body_length_m,
  pilot_mass_kg:E.pilot_mass_kg,dry_mass_kg:E.dry_mass_including_pilot_kg,
  mass_kg:E.dry_mass_including_pilot_kg+E.fuel.initial_kg,
  mass_budget:E.mass_budget.map(x=>({...x})),wheel_radius_m:E.wheel_radius_m,
  gear_centres:E.gear_centres_m.map(x=>x.slice())
};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const norm=a=>Math.hypot(...a);
function interpolate(xs,ys,x){
  if(x<=xs[0])return ys[0];
  for(let i=1;i<xs.length;i++)if(x<=xs[i]){
    const t=(x-xs[i-1])/(xs[i]-xs[i-1]);return ys[i-1]*(1-t)+ys[i]*t;
  }
  return ys[ys.length-1];
}
export function polar(region,alpha,camber){
  const table=E.sections[region],xs=E.sections.alpha_rad;
  const CL=interpolate(xs,table.cl_base,alpha)+table.camber_lift_gain*(camber-table.camber_reference)*Math.cos(alpha);
  const CD=interpolate(xs,table.cd_base,alpha)+CL*CL/(Math.PI*E.aero.span_efficiency*AR);
  return {CL,CD,cl:CL,cd:CD};
}
export function forces(s,c={},e={},poseOverride){
  const poseFn=typeof poseOverride==='function'?poseOverride:poseOverride?()=>poseOverride:wingPose;
  const m=mechanics(parameters,s,poseFn),rho=e.rho??E.rho_kg_m3;
  const air=worldToBody(sub(s.velocity,e.wind??[0,0,0]),s);
  let total=[0,0,0],wing=[0,0,0],Qphi=0,Qpitch=0,loss=0;
  function apply(F,jphi,jtheta){
    total=add(total,F);Qphi+=dot(F,jphi);Qpitch+=dot(F,jtheta);
  }
  for(const v of m.samples){
    let u=add(air,v.velocity);
    u=sub(u,mul(v.span,dot(u,v.span)));
    const speed=norm(u);
    if(speed<1e-10||v.area<=0)continue;
    const d=mul(u,1/speed),alpha=Math.atan2(-dot(d,v.normal),dot(d,v.chord));
    const {CL,CD}=polar(v.region,alpha,v.camber),q=.5*rho*speed*speed*v.area;
    const F=mul(sub(mul(unit(cross(v.span,d)),CL),mul(d,CD)),q);
    wing=add(wing,F);apply(F,v.jphi,v.jtheta);loss+=q*CD*speed;
  }
  const r0=mul(m.cg,-1),j0=mul(m.dc,-1),jt0=[-r0[1],r0[0],0];
  const u0=add(air,add(mul(j0,s.omega),mul(jt0,s.pitch_rate)));
  const plate=Object.values(E.aero.body_flat_plate_areas_m2).reduce((a,b)=>a+b,0);
  const bodyDrag=.5*rho*norm(u0)**2*plate;
  apply(mul(unit(u0),-bodyDrag),j0,jt0);loss+=bodyDrag*norm(u0);
  const tail=E.coupled,rt=sub([-tail.tail_arm_m,0,0],m.cg),jtt=[-rt[1],rt[0],0];
  const ut=add(air,add(mul(j0,s.omega),mul(jtt,s.pitch_rate)));
  ut[2]=0;
  const vt=norm(ut);
  if(vt>1e-10){
    const d=mul(ut,1/vt),alpha=Math.atan2(-ut[1],ut[0]);
    const CL=tail.tail_lift_slope*clamp(alpha+tail.tail_incidence_rad,-.35,.35);
    const CD=tail.tail_drag_coefficient+.08*alpha*alpha,q=.5*rho*vt*vt*tail.tail_area_m2;
    apply(mul(sub(mul(cross([0,0,1],d),CL),mul(d,CD)),q),j0,jtt);
    loss+=q*CD*vt;
  }
  const vh=Math.hypot(air[0],air[2]);
  if(vh>1e-10){
    const side=.5*rho*vh*vh*E.controls.rudder_coefficient*(c.rudder??0);
    total=add(total,mul([-air[2]/vh,0,air[0]/vh],side));
  }
  const throttle=clamp(c.throttle??0,0,1);
  const commanded=s.fuel_kg>0&&throttle>0&&s.omega>=0&&e.motor_enabled!==false&&!s.gliding;
  const shaftTorque=commanded?clamp(E.engine.governor_torque_gain_Nm_s*(2*Math.PI*E.engine.maximum_wingbeat_hz*throttle-s.omega),0,
    Math.min(E.engine.starting_torque_Nm,E.engine.continuous_shaft_limit_W*throttle/Math.max(.5,Math.abs(s.omega)))):0;
  const power=shaftTorque*s.omega,motor=shaftTorque*E.engine.transmission_efficiency;
  const damping=e.damping_scale??1;
  const phaseD=E.coupled.phase_damping_Nm_s*s.omega*damping;
  const pitchD=E.coupled.pitch_damping_Nm_s*s.pitch_rate*damping;
  const control=E.coupled.pitch_control_torque_Nm*(c.pitch??0);
  const force=bodyToWorld(total,s);force[1]-=m.mass*(e.gravity??E.gravity_m_s2);
  return {lift:bodyToWorld(wing,s)[1],thrust:wing[0],drag:bodyDrag,power,
    airspeed:norm(air),aero_power_W:-Qphi*s.omega,wing_dissipation_W:loss,
    mass_kg:m.mass,Qphi,Qpitch,motor_torque_Nm:motor,control_torque_Nm:control,
    phase_damping_Nm:phaseD,pitch_damping_Nm:pitchD,force,wing_force_body_N:wing,
    mechanics:m,shaft_torque_Nm:shaftTorque,commanded,
    drive_heat_W:power*(1-E.engine.transmission_efficiency)+phaseD*s.omega+pitchD*s.pitch_rate,
    control_power_W:control*s.pitch_rate};
}
export function accelerations(s,c={},e={}){
  const f=forces(s,c,e),m=f.mechanics,w=s.omega,p=s.pitch_rate;
  const R1=f.motor_torque_Nm+f.Qphi-m.Up-f.phase_damping_Nm-.5*m.Ap*w*w+.5*m.Cp*p*p;
  const R2=f.Qpitch+f.control_torque_Nm-f.pitch_damping_Nm-m.Bp*w*w-m.Cp*w*p;
  const det=m.A*m.C-m.B*m.B;
  let phase_accel=e.pitch_locked?R1/m.A:(R1*m.C-R2*m.B)/det;
  let pitch_accel=e.pitch_locked?0:(R2*m.A-R1*m.B)/det;
  if(s.gliding){phase_accel=0;pitch_accel=e.pitch_locked?0:R2/m.C;}
  return {...f,phase_accel,pitch_accel};
}
function heightWithCG(s,e,cg){
  let height=-Infinity;
  for(const gear of parameters.gear_centres){
    const r=bodyToWorld(sub(gear,cg),s);
    const ground=e.surfaceHeight?.(s.position[0]+r[0],s.position[2]+r[2])??0;
    // Tyre axle is lateral; projected circular radius in the vertical plane.
    const axle=bodyToWorld([0,0,1],s);
    const radius=(parameters.wheel_radius_m-.055)*Math.sqrt(Math.max(0,1-axle[1]**2))+.055;
    height=Math.max(height,ground+radius-r[1]);
  }
  return height;
}
export function contactHeight(s,e={}){
  return heightWithCG(s,e,centre(parameters,s,wingPose));
}
function derivative(s,c,e,groundCandidate){
  const a=accelerations(s,c,e),m=a.mechanics;
  let grounded=false,N=0;
  if(groundCandidate&&!e.pitch_locked){
    const Ag=m.A+m.mass*m.dc[1]**2;
    const Agp=m.Ap+2*m.mass*m.dc[1]*m.ddc[1];
    const q=(a.motor_torque_Nm+a.Qphi-m.Up-a.phase_damping_Nm-.5*Agp*s.omega**2+a.force[1]*m.dc[1])/Ag;
    N=m.mass*(m.ddc[1]*s.omega**2+m.dc[1]*q)-a.force[1];
    if(N>=0){grounded=true;a.phase_accel=s.gliding?0:q;a.pitch_accel=0;}
  }
  const dv=mul(a.force,1/m.mass);
  if(grounded){
    const horizontal=Math.hypot(s.velocity[0],s.velocity[2]);
    const resistance=E.controls.rolling_friction_coefficient*N+E.controls.brake_force_N*clamp(c.brake??0,0,1);
    if(horizontal>1e-8){
      // Smooth Coulomb regularisation prevents reversing a stationary wheel.
      const decel=resistance/m.mass*Math.min(1,horizontal/.1);
      dv[0]-=decel*s.velocity[0]/horizontal;dv[2]-=decel*s.velocity[2]/horizontal;
    }
    dv[1]=m.ddc[1]*s.omega**2+m.dc[1]*a.phase_accel;
  }
  return {a,grounded,N,dx:s.velocity,dv,
    dphase:s.gliding?0:s.omega,dpitch:e.pitch_locked||grounded?0:s.pitch_rate,
    dw:a.phase_accel,dp:a.pitch_accel,
    droll:s.roll_rate??0,dr:E.controls.roll_accel_rad_s2*(c.bank??0)-E.controls.roll_damping_per_s*(s.roll_rate??0),
    dh:E.controls.rudder_coefficient*(c.rudder??0)*Math.hypot(s.velocity[0],s.velocity[2])/E.span_m,
    fuel:a.commanded?-(a.power*E.fuel.bsfc_kg_kWh/3600000+E.fuel.idle_kg_s):0};
}
function advance(s,k,h){
  return {...s,position:add(s.position,mul(k.dx,h)),velocity:add(s.velocity,mul(k.dv,h)),
    phase:s.phase+k.dphase*h,omega:s.omega+k.dw*h,pitch:s.pitch+k.dpitch*h,pitch_rate:s.pitch_rate+k.dp*h,
    roll:s.roll+k.droll*h,roll_rate:(s.roll_rate??0)+k.dr*h,heading:s.heading+k.dh*h,
    fuel_kg:Math.max(0,s.fuel_kg+k.fuel*h),time:(s.time??0)+h,
    shaft_work_J:(s.shaft_work_J??0)+k.a.power*h,
    aero_work_J:(s.aero_work_J??0)+k.a.wing_dissipation_W*h,
    drive_heat_J:(s.drive_heat_J??0)+k.a.drive_heat_W*h,
    control_work_J:(s.control_work_J??0)+k.a.control_power_W*h,
    wheel_angle:(s.wheel_angle??0)+Math.hypot(s.velocity[0],s.velocity[2])/parameters.wheel_radius_m*h};
}
export function step(state,c={},e={},dt){
  let s={...state,position:state.position.slice(),velocity:state.velocity.slice()};
  if(s.status==='crashed'||!(dt>0))return s;
  const count=Math.ceil(dt/E.coupled.integration_dt_max),h=dt/count;
  for(let i=0;i<count;i++){
    const m0=mechanics(parameters,s,wingPose);
    const height=heightWithCG(s,e,m0.cg);
    const candidate=!e.pitch_locked&&s.position[1]<=height+.001&&s.velocity[1]-m0.dc[1]*s.omega<.15;
    if(candidate&&s.status==='grounded'){
      s.pitch=0;s.pitch_rate=0;s.roll=0;s.roll_rate=0;
      s.position[1]=contactHeight(s,e);s.velocity[1]=m0.dc[1]*s.omega;
    }
    const k1=derivative(s,c,e,candidate);
    let mid=advance(s,k1,h/2);
    if(k1.grounded){mid.pitch=0;mid.pitch_rate=0;mid.position[1]=contactHeight(mid,e);}
    const km=derivative(mid,c,e,k1.grounded);
    let next=advance(s,km,h);
    if(km.grounded){
      next.pitch=0;next.pitch_rate=0;next.roll=0;next.roll_rate=0;
      const mn=mechanics(parameters,next,wingPose);
      next.position[1]=heightWithCG(next,e,mn.cg);next.velocity[1]=mn.dc[1]*next.omega;
      next.status='grounded';
    }else{
      next.status='flying';
      const mn=mechanics(parameters,next,wingPose),floor=heightWithCG(next,e,mn.cg);
      if(!e.pitch_locked&&next.position[1]<floor){
        // Actual wheel vertical velocity, including CG/body reaction and pitch.
        let sink=0;
        for(const gear of parameters.gear_centres){
          const r=sub(gear,mn.cg),vbody=add(mul(mn.dc,-next.omega),mul([-r[1],r[0],0],next.pitch_rate));
          sink=Math.max(sink,-next.velocity[1]-bodyToWorld(vbody,next)[1]);
        }
        const speed=Math.hypot(next.velocity[0],next.velocity[2]);
        const unsafe=sink>E.controls.safe_touchdown_sink_m_s||speed>E.controls.safe_touchdown_speed_m_s||Math.abs(next.roll)>E.controls.safe_touchdown_bank_rad;
        next.pitch=0;next.pitch_rate=0;next.roll=0;next.roll_rate=0;
        next.position[1]=contactHeight(next,e);next.velocity[1]=mn.dc[1]*next.omega;
        next.status=unsafe?'crashed':'grounded';
      }
    }
    s=next;if(s.status==='crashed')break;
  }
  return s;
}
