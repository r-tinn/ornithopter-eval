import {E} from './environment/engineering.mjs';
import {wingPose} from './kinematics.mjs';
import {mechanics,centre,add,sub,mul,dot,cross,unit,bodyToWorld,worldToBody} from './environment/source-mechanism.mjs';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const parameters={
  aspect_ratio:7.4**2/6.61,wrist_span_fraction:3.7/7.4,
  span_m:E.span_m,wing_area_m2:14**2/(7.4**2/6.61),
  body_length_m:E.body_length_m,pilot_mass_kg:E.pilot_mass_kg,
  dry_mass_kg:E.dry_mass_including_pilot_kg,
  mass_kg:E.dry_mass_including_pilot_kg+E.fuel.initial_kg,
  mass_budget:E.mass_budget,wheel_radius_m:E.wheel_radius_m,
  gear_centres:E.gear_centres_m
};
export function polar(region,alpha,camber){
  const a=E.sections.alpha_rad,t=E.sections[region];
  let i=0;
  while(i<a.length-2&&alpha>a[i+1])i++;
  const f=clamp((alpha-a[i])/(a[i+1]-a[i]),0,1);
  const interp=table=>table[i]+f*(table[i+1]-table[i]);
  const CL=interp(t.cl_base)+t.camber_lift_gain*(camber-t.camber_reference)*Math.cos(alpha);
  const CD=interp(t.cd_base)+CL*CL/(Math.PI*E.aero.span_efficiency*parameters.aspect_ratio);
  return {CL,CD,cl:CL,cd:CD};
}

export function forces(s,c={},e={},poseOverride){
  const poseFn=poseOverride?(typeof poseOverride==='function'?poseOverride:()=>poseOverride):wingPose;
  const m=mechanics(parameters,s,poseFn),rho=e.rho??E.rho_kg_m3;
  const air=worldToBody(sub(s.velocity,e.wind??[0,0,0]),s);
  let wing=[0,0,0],body=[0,0,0],Qphi=0,Qpitch=0,loss=0,drag=0;
  const apply=(F,jphi,jtheta)=>{
    Qphi+=dot(F,jphi);Qpitch+=dot(F,jtheta);
  };
  for(const v of m.samples){
    let u=add(air,v.velocity);
    u=sub(u,mul(v.span,dot(u,v.span)));
    const speed=Math.hypot(...u);
    if(speed<1e-12||v.area<=0)continue;
    const d=mul(u,1/speed),alpha=Math.atan2(-dot(d,v.normal),dot(d,v.chord));
    const {CL,CD}=polar(v.region,alpha,v.camber);
    const q=.5*rho*speed*speed*v.area;
    const F=mul(sub(mul(unit(cross(v.span,d)),CL),mul(d,CD)),q);
    wing=add(wing,F);apply(F,v.jphi,v.jtheta);loss+=q*CD*speed;
  }
  const r0=mul(m.cg,-1),j0=mul(m.dc,-1),jt0=[-r0[1],r0[0],0];
  const u0=add(air,add(mul(j0,s.omega),mul(jt0,s.pitch_rate)));
  const speed0=Math.hypot(...u0);
  const cda=Object.values(E.aero.body_flat_plate_areas_m2).reduce((a,b)=>a+b,0);
  if(speed0>1e-12){
    drag=.5*rho*cda*speed0*speed0;
    const F=mul(u0,-drag/speed0);
    body=add(body,F);apply(F,j0,jt0);loss+=drag*speed0;
  }
  const rt=sub([-E.coupled.tail_arm_m,0,0],m.cg),jt=[-rt[1],rt[0],0];
  const ut=add(air,add(mul(j0,s.omega),mul(jt,s.pitch_rate)));
  const ts=Math.hypot(ut[0],ut[1]);
  if(ts>1e-12){
    const d=[ut[0]/ts,ut[1]/ts,0],alpha=Math.atan2(-ut[1],ut[0]);
    const CL=E.coupled.tail_lift_slope*clamp(alpha+E.coupled.tail_incidence_rad,-.35,.35);
    const CD=E.coupled.tail_drag_coefficient+.08*alpha*alpha,q=.5*rho*ts*ts*E.coupled.tail_area_m2;
    const F=mul(sub(mul(cross([0,0,1],d),CL),mul(d,CD)),q);
    body=add(body,F);apply(F,j0,jt);loss+=q*CD*ts;
  }
  // Rudder is a finite side-force control, not a source of forward thrust.
  const hs=Math.hypot(air[0],air[2]);
  if(hs>1e-12){
    const F=mul([-air[2]/hs,0,air[0]/hs],.5*rho*hs*hs*E.controls.rudder_coefficient*(c.rudder??0));
    body=add(body,F);apply(F,j0,jt0);
  }
  const throttle=clamp(c.throttle??0,0,1);
  const commanded=s.fuel_kg>0&&throttle>0&&e.motor_enabled!==false&&!s.gliding;
  let shaft=0;
  if(commanded&&s.omega>=0){
    const target=2*Math.PI*E.engine.maximum_wingbeat_hz*throttle;
    shaft=clamp(E.engine.governor_torque_gain_Nm_s*(target-s.omega),0,
      Math.min(E.engine.starting_torque_Nm,E.engine.continuous_shaft_limit_W*throttle/Math.max(.5,Math.abs(s.omega))));
  }
  const power=shaft*s.omega,drive=shaft*E.engine.transmission_efficiency;
  const damping=e.damping_scale??1;
  const phaseDamping=E.coupled.phase_damping_Nm_s*s.omega*damping;
  const pitchDamping=E.coupled.pitch_damping_Nm_s*s.pitch_rate*damping;
  const pilot=E.coupled.pitch_control_torque_Nm*(c.pitch??0);
  const wf=bodyToWorld(wing,s);
  const force=add(bodyToWorld(add(wing,body),s),[0,-m.mass*(e.gravity??E.gravity_m_s2),0]);
  return {lift:wf[1],thrust:wing[0],drag,power,airspeed:Math.hypot(...air),
    aero_power_W:-Qphi*s.omega,wing_dissipation_W:loss,mass_kg:m.mass,
    Qphi,Qpitch,motor_torque_Nm:drive,shaft_torque_Nm:shaft,
    control_torque_Nm:pilot,phase_damping_Nm:phaseDamping,pitch_damping_Nm:pitchDamping,
    force,wing_force_body_N:wing,mechanism:m,motor_commanded:commanded};
}

// The torus tyre has major radius .17 and circular .06 rubber section.
function contactWithCG(s,e,cg){
  const axis=bodyToWorld([0,0,1],s);
  const support=(E.wheel_radius_m-.06)*Math.sqrt(Math.max(0,1-axis[1]**2))+.06;
  let height=-Infinity;
  for(const gear of parameters.gear_centres){
    const r=bodyToWorld(sub(gear,cg),s);
    height=Math.max(height,(e.surfaceHeight?.(s.position[0]+r[0],s.position[2]+r[2])??0)+support-r[1]);
  }
  return height;
}
export function contactHeight(s,e={}){
  return contactWithCG(s,e,centre(parameters,s,wingPose));
}

function solve(s,c,e,allowGround=true){
  const f=forces(s,c,e),m=f.mechanism,w=s.omega,p=s.pitch_rate;
  const R1=f.motor_torque_Nm+f.Qphi-m.Up-f.phase_damping_Nm-.5*m.Ap*w*w+.5*m.Cp*p*p;
  const R2=f.Qpitch+f.control_torque_Nm-f.pitch_damping_Nm-m.Bp*w*w-m.Cp*w*p;
  let phase_accel,pitch_accel;
  if(e.pitch_locked){phase_accel=R1/m.A;pitch_accel=0;}
  else{
    const det=m.A*m.C-m.B*m.B;
    phase_accel=(m.C*R1-m.B*R2)/det;
    pitch_accel=(m.A*R2-m.B*R1)/det;
  }
  if(s.gliding){phase_accel=0;pitch_accel=e.pitch_locked?0:R2/m.C;}
  let ground=false,normal=0,force=f.force.slice();
  // No attitude/ground shortcut is used in isolated airborne dynamics.
  const nearGround=s.position[1]<=contactWithCG(s,e,m.cg)+1e-5;
  if(allowGround&&!e.pitch_locked&&nearGround&&Math.abs(s.roll)<.26){
    const Ag=m.A+m.mass*m.dc[1]**2;
    const Agp=m.Ap+2*m.mass*m.dc[1]*m.ddc[1];
    const ga=s.gliding?0:(f.motor_torque_Nm+f.Qphi-m.Up-f.phase_damping_Nm-.5*Agp*w*w+force[1]*m.dc[1])/Ag;
    normal=m.mass*(m.ddc[1]*w*w+m.dc[1]*ga)-force[1];
    if(normal>=0){
      ground=true;phase_accel=ga;pitch_accel=0;
      force[1]+=normal;
      const horizontal=Math.hypot(s.velocity[0],s.velocity[2]);
      if(horizontal>1e-9){
        const resistance=E.controls.rolling_friction_coefficient*normal+E.controls.brake_force_N*(c.brake??0);
        const friction=Math.min(resistance,horizontal*m.mass/E.coupled.integration_dt_max);
        force[0]-=friction*s.velocity[0]/horizontal;force[2]-=friction*s.velocity[2]/horizontal;
      }
    }
  }
  return {...f,force,phase_accel,pitch_accel,ground,normal};
}
export function accelerations(s,c={},e={}){
  return solve(s,c,e);
}

function derivative(s,c,e){
  const a=solve(s,c,e),m=a.mechanism;
  const rollAccel=E.controls.roll_accel_rad_s2*(c.bank??0)-E.controls.roll_damping_per_s*s.roll_rate;
  // Bank holds at neutral stick; no artificial vertical compensation.
  const yaw=(e.gravity??E.gravity_m_s2)*Math.tan(s.roll)/Math.max(5,Math.hypot(s.velocity[0],s.velocity[2]))
    +E.controls.rudder_coefficient*(c.rudder??0);
  return {a,position:s.velocity.slice(),velocity:mul(a.force,1/m.mass),
    phase:s.gliding?0:s.omega,omega:a.phase_accel,
    pitch:e.pitch_locked||a.ground?0:s.pitch_rate,pitch_rate:a.pitch_accel,
    roll:s.roll_rate,roll_rate:rollAccel,heading:a.ground?0:yaw,
    fuel_kg:a.motor_commanded?-(a.power*E.fuel.bsfc_kg_kWh/3600000+E.fuel.idle_kg_s):0,
    wheel_angle:a.ground?Math.hypot(s.velocity[0],s.velocity[2])/E.wheel_radius_m:0,
    shaft_work_J:a.power,aero_work_J:a.wing_dissipation_W,
    drive_heat_J:a.power*(1-E.engine.transmission_efficiency)+a.phase_damping_Nm*s.omega+a.pitch_damping_Nm*s.pitch_rate,
    control_work_J:a.control_torque_Nm*s.pitch_rate};
}
const scalars=['phase','omega','pitch','pitch_rate','roll','roll_rate','heading','fuel_kg','wheel_angle','shaft_work_J','aero_work_J','drive_heat_J','control_work_J'];
function advance(s,d,h){
  const n={...s,position:add(s.position,mul(d.position,h)),velocity:add(s.velocity,mul(d.velocity,h))};
  for(const k of scalars)n[k]=(s[k]??0)+d[k]*h;
  n.fuel_kg=Math.max(0,n.fuel_kg);
  n.roll=clamp(n.roll,-E.controls.bank_limit_rad,E.controls.bank_limit_rad);
  if(d.a.ground){
    n.pitch=0;n.pitch_rate=0;n.roll=0;n.roll_rate=0;
  }
  return n;
}
function projectGround(n,e){
  const m=mechanics(parameters,n,wingPose);
  n.pitch=0;n.pitch_rate=0;n.roll=0;n.roll_rate=0;
  n.position[1]=contactWithCG(n,e,m.cg);n.velocity[1]=m.dc[1]*n.omega;
}
export function step(state,c={},e={},dt){
  let s={...state,position:state.position.slice(),velocity:state.velocity.slice()};
  if(s.status==='crashed'||!(dt>0))return s;
  let remaining=dt;
  while(remaining>1e-12){
    if(s.fuel_kg<1e-12)s.fuel_kg=0;
    let h=Math.min(remaining,E.coupled.integration_dt_max);
    const k1=derivative(s,c,e);
    // Resolve fuel exhaustion as an event, rather than supplying a whole
    // substep of shaft work after the last available fuel has been burnt.
    if(k1.fuel_kg<0)h=Math.min(h,s.fuel_kg/(-k1.fuel_kg));
    let mid=advance(s,k1,h/2);
    if(k1.a.ground)projectGround(mid,e);
    let k2=derivative(mid,c,e);
    for(let retry=0;retry<8&&-k2.fuel_kg*h>s.fuel_kg;retry++){
      h*=s.fuel_kg/(-k2.fuel_kg*h)*(1-1e-10);
      mid=advance(s,k1,h/2);
      if(k1.a.ground)projectGround(mid,e);
      k2=derivative(mid,c,e);
    }
    let n=advance(s,k2,h);
    n.time=(s.time??0)+h;
    if(k2.a.ground){
      projectGround(n,e);n.status='grounded';
    }else{
      n.status='flying';
      const m=mechanics(parameters,n,wingPose),height=contactWithCG(n,e,m.cg);
      if(n.position[1]<height&&!e.pitch_locked){
        let lowest=-Infinity,sink=0;
        for(const gear of parameters.gear_centres){
          const r=sub(gear,m.cg),worldR=bodyToWorld(r,n);
          const required=(e.surfaceHeight?.(n.position[0]+worldR[0],n.position[2]+worldR[2])??0)-worldR[1];
          if(required>lowest){
            lowest=required;
            const localV=add(mul(m.dc,-n.omega),[-r[1]*n.pitch_rate,r[0]*n.pitch_rate,0]);
            sink=n.velocity[1]+bodyToWorld(localV,n)[1];
          }
        }
        const horizontal=Math.hypot(n.velocity[0],n.velocity[2]);
        if(sink < -E.controls.safe_touchdown_sink_m_s||horizontal>E.controls.safe_touchdown_speed_m_s||Math.abs(n.roll)>E.controls.safe_touchdown_bank_rad){
          n.position[1]=height;n.status='crashed';n.velocity=[0,0,0];return n;
        }
        projectGround(n,e);n.status='grounded';
      }
    }
    s=n;
    remaining-=h;
  }
  return s;
}
