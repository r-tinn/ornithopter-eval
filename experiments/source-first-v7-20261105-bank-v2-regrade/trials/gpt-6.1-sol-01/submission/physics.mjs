import {E} from './environment/engineering.mjs';
import {wingPose} from './kinematics.mjs';
import {mechanics,add,sub,mul,dot,cross,unit,bodyToWorld,worldToBody} from './environment/source-mechanism.mjs';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
// Photo 02: rounded "Say" span 7.4 ft, original area paragraph 6.61 ft².
const AR=7.4**2/6.61;
export const parameters={
  ...E,aspect_ratio:AR,wrist_span_fraction:3.7/7.4,
  wing_area_m2:14**2/AR,dry_mass_kg:173.9,mass_kg:177.5,
  gear_centres:E.gear_centres_m.map(v=>v.slice())
};

export function polar(region,alpha,camber){
  const table=E.sections[region.toLowerCase()],xs=E.sections.alpha_rad;
  let i=0;
  const a=clamp(alpha,xs[0],xs[xs.length-1]);
  while(i<xs.length-2&&a>xs[i+1])i++;
  const t=(a-xs[i])/(xs[i+1]-xs[i]);
  const interp=v=>v[i]+t*(v[i+1]-v[i]);
  const CL=interp(table.cl_base)+table.camber_lift_gain*(camber-table.camber_reference)*Math.cos(alpha);
  const CD=interp(table.cd_base)+CL*CL/(Math.PI*E.aero.span_efficiency*AR);
  return {CL,CD,cl:CL,cd:CD};
}

export function forces(s,c,e,poseOverride){
  const frozenPose=typeof poseOverride==='function'?poseOverride(s):poseOverride;
  const q=mechanics(parameters,s,frozenPose?()=>frozenPose:wingPose);
  const rho=e.rho??E.rho_kg_m3,g=e.gravity??E.gravity_m_s2;
  const air=worldToBody(sub(s.velocity,e.wind??[0,0,0]),s);
  let total=[0,0,0],wing=[0,0,0],Qphi=0,Qpitch=0,loss=0,bodyDrag=0;
  const apply=(F,jphi,jtheta)=>{
    total=add(total,F);Qphi+=dot(F,jphi);Qpitch+=dot(F,jtheta);
  };
  for(const v of q.samples){
    if(v.area<=0)continue;
    let u=add(air,v.velocity);
    u=sub(u,mul(v.span,dot(u,v.span)));
    const speed=Math.hypot(...u);
    if(speed<1e-12)continue;
    const d=mul(u,1/speed);
    const alpha=Math.atan2(-dot(d,v.normal),dot(d,v.chord));
    const {CL,CD}=polar(v.region,alpha,v.camber);
    const pressure=.5*rho*speed*speed*v.area;
    const F=mul(sub(mul(unit(cross(v.span,d)),CL),mul(d,CD)),pressure);
    wing=add(wing,F);apply(F,v.jphi,v.jtheta);
    loss+=pressure*CD*speed;
  }
  const r0=mul(q.cg,-1),j0=mul(q.dc,-1);
  const local=(r,j)=>add(air,add(mul(j,s.omega),mul([-r[1],r[0],0],s.pitch_rate)));
  const u0=local(r0,j0),v0=Math.hypot(...u0);
  const flat=Object.values(E.aero.body_flat_plate_areas_m2).reduce((a,b)=>a+b,0);
  bodyDrag=.5*rho*v0*v0*flat;
  if(v0>1e-12){
    apply(mul(u0,-bodyDrag/v0),j0,[-r0[1],r0[0],0]);
    loss+=bodyDrag*v0;
  }
  const rT=sub([-E.coupled.tail_arm_m,0,0],q.cg),uT=local(rT,j0);
  const speedT=Math.hypot(uT[0],uT[1]);
  if(speedT>1e-12){
    const d=[uT[0]/speedT,uT[1]/speedT,0];
    const alpha=Math.atan2(-uT[1],uT[0]);
    const CL=E.coupled.tail_lift_slope*clamp(alpha+E.coupled.tail_incidence_rad,-.35,.35);
    const CD=E.coupled.tail_drag_coefficient+.08*alpha*alpha;
    const pressure=.5*rho*speedT*speedT*E.coupled.tail_area_m2;
    const F=mul(sub(mul(cross([0,0,1],d),CL),mul(d,CD)),pressure);
    apply(F,j0,[-rT[1],rT[0],0]);loss+=pressure*CD*speedT;
  }
  const horizontal=Math.hypot(air[0],air[2]);
  if(horizontal>1e-12){
    const side=.5*rho*horizontal*horizontal*E.controls.rudder_coefficient*(c.rudder??0);
    apply(mul([-air[2]/horizontal,0,air[0]/horizontal],side),j0,[-r0[1],r0[0],0]);
  }
  const throttle=clamp(c.throttle??0,0,1);
  const commanded=s.fuel_kg>0&&throttle>0&&e.motor_enabled!==false&&!s.gliding;
  const on=commanded&&s.omega>=0;
  let shaftTorque=0;
  if(on){
    const target=2*Math.PI*E.engine.maximum_wingbeat_hz*throttle;
    shaftTorque=clamp(E.engine.governor_torque_gain_Nm_s*(target-s.omega),0,
      Math.min(E.engine.starting_torque_Nm,E.engine.continuous_shaft_limit_W*throttle/Math.max(.5,Math.abs(s.omega))));
  }
  const damping=e.damping_scale??1;
  const phaseDamping=E.coupled.phase_damping_Nm_s*s.omega*damping;
  const pitchDamping=E.coupled.pitch_damping_Nm_s*s.pitch_rate*damping;
  const force=add(bodyToWorld(total,s),[0,-q.mass*g,0]);
  return {
    force,lift:bodyToWorld(wing,s)[1],thrust:wing[0],drag:bodyDrag,
    power:shaftTorque*s.omega,airspeed:Math.hypot(...air),
    aero_power_W:-Qphi*s.omega,wing_dissipation_W:loss,
    mass_kg:q.mass,Qphi,Qpitch,motor_torque_Nm:shaftTorque*E.engine.transmission_efficiency,
    control_torque_Nm:E.coupled.pitch_control_torque_Nm*(c.pitch??0),
    phase_damping_Nm:phaseDamping,pitch_damping_Nm:pitchDamping,
    wing_force_body_N:wing,mechanics:q,motor_commanded:commanded
  };
}

function heightWith(s,e,q){
  let height=-Infinity;
  const lateralY=bodyToWorld([0,0,1],s)[1];
  // Support of the actual .12 m wide, lateral-axis cylindrical tyre.
  const tyreDepth=parameters.wheel_radius_m*Math.sqrt(Math.max(0,1-lateralY*lateralY))+.06*Math.abs(lateralY);
  for(const gear of parameters.gear_centres){
    const r=bodyToWorld(sub(gear,q.cg),s);
    const ground=e.surfaceHeight?e.surfaceHeight(s.position[0]+r[0],s.position[2]+r[2]):0;
    height=Math.max(height,ground+tyreDepth-r[1]);
  }
  return height;
}
export function contactHeight(s,e){
  return heightWith(s,e,mechanics(parameters,s,wingPose));
}

export function accelerations(s,c,e){
  const f=forces(s,c,e),q=f.mechanics,w=s.omega,p=s.pitch_rate;
  const R1=f.motor_torque_Nm+f.Qphi-q.Up-f.phase_damping_Nm-.5*q.Ap*w*w+.5*q.Cp*p*p;
  const R2=f.Qpitch+f.control_torque_Nm-f.pitch_damping_Nm-q.Bp*w*w-q.Cp*w*p;
  let phase_accel,pitch_accel,grounded=false,normal_load_N=0;
  if(e.pitch_locked){
    phase_accel=R1/q.A;pitch_accel=0;
  }else{
    const determinant=q.A*q.C-q.B*q.B;
    phase_accel=(q.C*R1-q.B*R2)/determinant;
    pitch_accel=(q.A*R2-q.B*R1)/determinant;
    // Pitch=0 three-wheel holonomic reduction. Release only when normal < 0,
    // not when an instantaneous wing-lift threshold happens to be exceeded.
    const near=s.position[1]<=heightWith(s,e,q)+.0005;
    if(near&&Math.abs(s.pitch)<1e-7&&Math.abs(s.roll)<1e-7){
      const Ag=q.A+q.mass*q.dc[1]**2;
      const Agp=q.Ap+2*q.mass*q.dc[1]*q.ddc[1];
      const ga=(f.motor_torque_Nm+f.Qphi-q.Up-f.phase_damping_Nm-.5*Agp*w*w+f.force[1]*q.dc[1])/Ag;
      const N=q.mass*(q.ddc[1]*w*w+q.dc[1]*ga)-f.force[1];
      if(N>=0){
        grounded=true;normal_load_N=N;phase_accel=ga;pitch_accel=0;
        f.force=f.force.slice();f.force[1]+=N;
        const speed=Math.hypot(s.velocity[0],s.velocity[2]);
        if(speed>1e-9){
          const resistance=E.controls.rolling_friction_coefficient*N+E.controls.brake_force_N*clamp(c.brake??0,0,1);
          const friction=Math.min(resistance,speed*q.mass/E.coupled.integration_dt_max);
          f.force[0]-=friction*s.velocity[0]/speed;f.force[2]-=friction*s.velocity[2]/speed;
          f.ground_loss_W=friction*speed;
        }
      }
    }
  }
  return {...f,phase_accel,pitch_accel,grounded,normal_load_N};
}

function derivative(s,c,e){
  const a=accelerations(s,c,e);
  const rollAccel=E.controls.roll_accel_rad_s2*(c.bank??0)-E.controls.roll_damping_per_s*s.roll_rate;
  const velocity=a.grounded?[s.velocity[0],a.mechanics.dc[1]*s.omega,s.velocity[2]]:s.velocity;
  return {a,position:velocity,velocity:mul(a.force,1/a.mass_kg),
    phase:s.omega,omega:a.phase_accel,pitch:e.pitch_locked||a.grounded?0:s.pitch_rate,
    pitch_rate:a.pitch_accel,roll:a.grounded?0:s.roll_rate,roll_rate:a.grounded?0:rollAccel,
    heading:(c.rudder??0)*E.controls.rudder_coefficient,
    fuel_kg:a.motor_commanded?-(a.power*E.fuel.bsfc_kg_kWh/3600000+E.fuel.idle_kg_s):0,
    shaft_work_J:a.power,aero_work_J:a.wing_dissipation_W,
    drive_heat_J:a.power*(1-E.engine.transmission_efficiency)+a.phase_damping_Nm*s.omega+a.pitch_damping_Nm*s.pitch_rate+(a.ground_loss_W??0),
    control_work_J:a.control_torque_Nm*s.pitch_rate};
}
function advance(s,d,h){
  const n={...s,position:add(s.position,mul(d.position,h)),velocity:add(s.velocity,mul(d.velocity,h))};
  for(const key of ['phase','omega','pitch','pitch_rate','roll','roll_rate','heading','fuel_kg','shaft_work_J','aero_work_J','drive_heat_J','control_work_J'])
    n[key]=(s[key]??0)+h*d[key];
  n.fuel_kg=Math.max(0,n.fuel_kg);
  if(d.a.grounded){
    n.pitch=0;n.pitch_rate=0;n.roll=0;n.roll_rate=0;
    const q=mechanics(parameters,n,wingPose);
    n.position[1]=heightWith(n,d.environment??{},q);
    n.velocity[1]=q.dc[1]*n.omega;
  }
  return n;
}
export function step(state,c,e,dt){
  let s={...state,position:state.position.slice(),velocity:state.velocity.slice()};
  if(s.status==='crashed'||!(dt>0))return s;
  const count=Math.ceil(dt/E.coupled.integration_dt_max),h=dt/count;
  for(let i=0;i<count;i++){
    const k1=derivative(s,c,e);k1.environment=e;
    const mid=advance(s,k1,h/2);
    const k2=derivative(mid,c,e);k2.environment=e;
    const n=advance(s,k2,h);
    n.time=(s.time??0)+h;
    // There is no mode switch when the motor is cut: the same mechanism coasts.
    const q=mechanics(parameters,n,wingPose),height=heightWith(n,e,q);
    if(n.position[1]<height&&!e.pitch_locked){
      let bodySink=Infinity;
      for(const gear of parameters.gear_centres){
        const r=sub(gear,q.cg);
        const rotational=add(mul([-r[1],r[0],0],n.pitch_rate),
          mul([0,-r[2],r[1]],n.roll_rate));
        const relative=bodyToWorld(sub(rotational,mul(q.dc,n.omega)),n);
        bodySink=Math.min(bodySink,n.velocity[1]+relative[1]);
      }
      const unsafe=bodySink < -E.controls.safe_touchdown_sink_m_s||
        Math.hypot(n.velocity[0],n.velocity[2])>E.controls.safe_touchdown_speed_m_s||
        Math.abs(n.roll)>E.controls.safe_touchdown_bank_rad;
      if(!k1.a.grounded&&unsafe)n.status='crashed';
      else{
        n.pitch=0;n.pitch_rate=0;n.roll=0;n.roll_rate=0;
        n.position[1]=heightWith(n,e,q);n.velocity[1]=q.dc[1]*n.omega;n.status='grounded';
      }
    }else n.status=k2.a.grounded?'grounded':'flying';
    // Wheel geometry is built in the XY plane: rolling is around lateral Z.
    const forward=worldToBody(n.velocity,n)[0];
    n.wheel_angle=(s.wheel_angle??0)-forward*h/parameters.wheel_radius_m;
    n.roll=clamp(n.roll,-E.controls.bank_limit_rad,E.controls.bank_limit_rad);
    s=n;
    if(s.status==='crashed')break;
  }
  return s;
}
