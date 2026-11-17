import {E} from './environment/engineering.mjs';
import {wingPose} from './kinematics.mjs';
import {mechanics,centre,bodyToWorld,worldToBody,add,sub,mul,dot,cross,unit} from './environment/source-mechanism.mjs';

// Photo 02: rounded "Say" span 7.4 ft, original area 6.61 ft².
const AR=7.4**2/6.61;
export const parameters=Object.freeze({
  aspect_ratio:AR,wrist_span_fraction:3.7/7.4,
  span_m:E.span_m,wing_area_m2:E.span_m**2/AR,
  body_length_m:E.body_length_m,pilot_mass_kg:E.pilot_mass_kg,
  dry_mass_kg:E.dry_mass_including_pilot_kg,
  mass_kg:E.dry_mass_including_pilot_kg+E.fuel.initial_kg,
  mass_budget:E.mass_budget,wheel_radius_m:E.wheel_radius_m,tyre_section_radius_m:.06,
  gear_centres:E.gear_centres_m
});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const norm=a=>Math.hypot(...a);
const K=E.coupled;
const flatArea=Object.values(E.aero.body_flat_plate_areas_m2).reduce((a,b)=>a+b,0);

export function polar(region,alpha,camber){
  const table=E.sections[region],xs=E.sections.alpha_rad;
  const a=clamp(alpha,xs[0],xs[xs.length-1]);
  let i=0;while(i<xs.length-2&&a>xs[i+1])i++;
  const t=(a-xs[i])/(xs[i+1]-xs[i]);
  const interp=ys=>ys[i]+t*(ys[i+1]-ys[i]);
  const cl=interp(table.cl_base)+table.camber_lift_gain*((camber??table.camber_reference)-table.camber_reference)*Math.cos(alpha);
  const cd=interp(table.cd_base)+cl*cl/(Math.PI*E.aero.span_efficiency*AR);
  return {cl,cd,CL:cl,CD:cd};
}

function evaluate(s,c,e,poseOverride){
  const poseFn=poseOverride?(typeof poseOverride==='function'?poseOverride:()=>poseOverride):wingPose;
  const m=mechanics(parameters,s,poseFn);
  const rho=e.rho??E.rho_kg_m3, gravity=e.gravity??E.gravity_m_s2;
  const air=worldToBody(sub(s.velocity,e.wind??[0,0,0]),s);
  let total=[0,0,0],wing=[0,0,0],Qphi=0,Qpitch=0,dissipation=0;
  function apply(F,jphi,jtheta){
    total=add(total,F);Qphi+=dot(F,jphi);Qpitch+=dot(F,jtheta);
  }
  for(const strip of m.samples){
    const raw=add(air,strip.velocity);
    const u=sub(raw,mul(strip.span,dot(raw,strip.span))),v=norm(u);
    if(v<1e-12||strip.area<=0)continue;
    const d=mul(u,1/v);
    const alpha=Math.atan2(-dot(d,strip.normal),dot(d,strip.chord));
    const {cl,cd}=polar(strip.region,alpha,strip.camber);
    const q=.5*rho*v*v*strip.area;
    const F=mul(sub(mul(unit(cross(strip.span,d)),cl),mul(d,cd)),q);
    wing=add(wing,F);apply(F,strip.jphi,strip.jtheta);
    dissipation+=q*cd*v;
  }
  const j0=mul(m.dc,-1),r0=mul(m.cg,-1),jt0=[-r0[1],r0[0],0];
  const u0=add(air,add(mul(j0,s.omega),mul(jt0,s.pitch_rate))),v0=norm(u0);
  const drag=.5*rho*flatArea*v0*v0;
  if(v0>1e-12){apply(mul(u0,-drag/v0),j0,jt0);dissipation+=drag*v0;}

  const rt=sub([-K.tail_arm_m,0,0],m.cg),jtt=[-rt[1],rt[0],0];
  const ut=add(air,add(mul(j0,s.omega),mul(jtt,s.pitch_rate)));
  const vt=Math.hypot(ut[0],ut[1]);
  if(vt>1e-12){
    const d=[ut[0]/vt,ut[1]/vt,0],alpha=Math.atan2(-ut[1],ut[0]);
    const cl=K.tail_lift_slope*clamp(alpha+K.tail_incidence_rad,-.35,.35);
    const cd=K.tail_drag_coefficient+.08*alpha*alpha,q=.5*rho*vt*vt*K.tail_area_m2;
    apply(mul(sub(mul(cross([0,0,1],d),cl),mul(d,cd)),q),j0,jtt);
    dissipation+=q*cd*vt;
  }
  let force=bodyToWorld(total,s);
  const worldAir=sub(s.velocity,e.wind??[0,0,0]),horizontal=Math.hypot(worldAir[0],worldAir[2]);
  if(horizontal>1e-12){
    const side=.5*rho*horizontal*horizontal*E.controls.rudder_coefficient*(c.rudder??0);
    force=add(force,[-worldAir[2]*side/horizontal,0,worldAir[0]*side/horizontal]);
  }
  force[1]-=m.mass*gravity;
  const throttle=clamp(c.throttle??0,0,1);
  const commanded=s.fuel_kg>0&&throttle>0&&e.motor_enabled!==false&&!s.gliding;
  let shaftTorque=0;
  if(commanded&&s.omega>=0){
    const target=2*Math.PI*E.engine.maximum_wingbeat_hz*throttle;
    const cap=Math.min(E.engine.starting_torque_Nm,E.engine.continuous_shaft_limit_W*throttle/Math.max(.5,Math.abs(s.omega)));
    shaftTorque=clamp(E.engine.governor_torque_gain_Nm_s*(target-s.omega),0,cap);
  }
  const power=shaftTorque*s.omega,scale=e.damping_scale??1;
  const phaseDamping=K.phase_damping_Nm_s*s.omega*scale;
  const pitchDamping=K.pitch_damping_Nm_s*s.pitch_rate*scale;
  const controlTorque=K.pitch_control_torque_Nm*(c.pitch??0);
  const f={
    lift:bodyToWorld(wing,s)[1],thrust:wing[0],drag,power,airspeed:norm(air),
    aero_power_W:-Qphi*s.omega,wing_dissipation_W:dissipation,
    mass_kg:m.mass,Qphi,Qpitch,
    motor_torque_Nm:shaftTorque*E.engine.transmission_efficiency,
    control_torque_Nm:controlTorque,phase_damping_Nm:phaseDamping,
    pitch_damping_Nm:pitchDamping,force,wing_force_body_N:wing,
    shaft_torque_Nm:shaftTorque,
    drive_heat_W:power*(1-E.engine.transmission_efficiency)+phaseDamping*s.omega+pitchDamping*s.pitch_rate,
    control_power_W:controlTorque*s.pitch_rate,
    fuel_rate_kg_s:power*E.fuel.bsfc_kg_kWh/3600000+(commanded?E.fuel.idle_kg_s:0)
  };
  return {f,m};
}
export function forces(s,c,e,poseOverride){return evaluate(s,c,e,poseOverride).f;}

function solve(s,c,e,groundAllowed=false){
  const {f,m}=evaluate(s,c,e),w=s.omega,q=s.pitch_rate;
  const R1=f.motor_torque_Nm+f.Qphi-m.Up-f.phase_damping_Nm-.5*m.Ap*w*w+.5*m.Cp*q*q;
  const R2=f.Qpitch+f.control_torque_Nm-f.pitch_damping_Nm-m.Bp*w*w-m.Cp*w*q;
  const det=m.A*m.C-m.B*m.B;
  let phase_accel=e.pitch_locked?R1/m.A:(m.C*R1-m.B*R2)/det;
  let pitch_accel=e.pitch_locked?0:(m.A*R2-m.B*R1)/det;
  let normal=0,ground=false,force=f.force.slice();
  if(groundAllowed&&!e.pitch_locked){
    const Ag=m.A+m.mass*m.dc[1]**2,Agp=m.Ap+2*m.mass*m.dc[1]*m.ddc[1];
    const a=(f.motor_torque_Nm+f.Qphi-m.Up-f.phase_damping_Nm-.5*Agp*w*w+force[1]*m.dc[1])/Ag;
    const N=m.mass*(m.ddc[1]*w*w+m.dc[1]*a)-force[1];
    if(N>=0){
      ground=true;normal=N;phase_accel=a;pitch_accel=0;force[1]+=N;
      const speed=Math.hypot(s.velocity[0],s.velocity[2]);
      if(speed>1e-10){
        // Regularised Coulomb loss at rest, never an assisting ground force.
        const loss=(E.controls.rolling_friction_coefficient*N+E.controls.brake_force_N*clamp(c.brake??0,0,1))*Math.tanh(speed/.12);
        force[0]-=loss*s.velocity[0]/speed;force[2]-=loss*s.velocity[2]/speed;
      }
    }
  }
  return {...f,force,phase_accel,pitch_accel,normal,ground,m};
}
export function accelerations(s,c,e){
  const touching=s.status==='grounded'&&!e.pitch_locked&&!!e.surfaceHeight&&
    Math.abs(s.pitch)<1e-9&&Math.abs(s.roll)<1e-9&&s.position[1]<=contactHeight(s,e)+1e-5;
  const a=solve(s,c,e,touching);
  return {phase_accel:a.phase_accel,pitch_accel:a.pitch_accel,force:a.force};
}

function contactWithCentre(s,e,cg){
  let height=-Infinity;
  for(const gear of parameters.gear_centres){
    const r=bodyToWorld(sub(gear,cg),s);
    const terrain=e.surfaceHeight?e.surfaceHeight(s.position[0]+r[0],s.position[2]+r[2]):0;
    // Toroidal tyre: major circle is in aircraft x/y, with a round .06 m
    // section. Upright its exact envelope radius is the declared .23 m.
    const axle=bodyToWorld([0,0,1],s);
    const tube=parameters.tyre_section_radius_m;
    const tyreDrop=(parameters.wheel_radius_m-tube)*Math.sqrt(Math.max(0,1-axle[1]**2))+tube;
    height=Math.max(height,terrain-r[1]+tyreDrop);
  }
  return height;
}
export function contactHeight(s,e){return contactWithCentre(s,e,centre(parameters,s,wingPose));}

// Explicit midpoint RK2. The runway is a unilateral holonomic constraint,
// not a lift threshold; internal CG motion contributes to its normal load.
function derivative(s,c,e,ground){
  const a=solve(s,c,e,ground);
  const rollAccel=E.controls.roll_accel_rad_s2*(c.bank??0)-E.controls.roll_damping_per_s*(s.roll_rate??0);
  const speed=Math.hypot(s.velocity[0],s.velocity[2]);
  return {
    a,position:s.velocity,velocity:mul(a.force,1/a.mass_kg),
    phase:s.omega,omega:a.phase_accel,
    pitch:e.pitch_locked||a.ground?0:s.pitch_rate,
    pitch_rate:a.pitch_accel,roll:a.ground?0:(s.roll_rate??0),
    roll_rate:a.ground?0:rollAccel,
    heading:(c.rudder??0)*E.controls.rudder_coefficient*Math.min(1,speed/6),
    fuel_kg:-a.fuel_rate_kg_s,
    shaft_work_J:a.power,aero_work_J:a.wing_dissipation_W,
    drive_heat_J:a.drive_heat_W,control_work_J:a.control_power_W,
    wheel_angle:a.ground?worldToBody(s.velocity,s)[0]/parameters.wheel_radius_m:0
  };
}
const scalars=['phase','omega','pitch','pitch_rate','roll','roll_rate','heading','fuel_kg','shaft_work_J','aero_work_J','drive_heat_J','control_work_J','wheel_angle'];
function advance(s,k,h){
  const n={...s,position:add(s.position,mul(k.position,h)),velocity:add(s.velocity,mul(k.velocity,h)),time:(s.time??0)+h};
  for(const key of scalars)n[key]=(s[key]??0)+h*k[key];
  n.fuel_kg=Math.max(0,n.fuel_kg);
  return n;
}
function constrain(s,e,m){
  s.pitch=0;s.pitch_rate=0;s.roll=0;s.roll_rate=0;
  // Ground projection needs only the centroid, not another full inertia solve.
  let q=m;
  if(!q){
    const h=K.derivative_step,cg=centre(parameters,s,wingPose);
    const lo=centre(parameters,{...s,phase:s.phase-h},wingPose);
    const hi=centre(parameters,{...s,phase:s.phase+h},wingPose);
    q={cg,dc:mul(sub(hi,lo),1/(2*h))};
  }
  s.position[1]=contactWithCentre(s,e,q.cg);
  s.velocity[1]=q.dc[1]*s.omega;
}
export function step(state,c,e,dt){
  let s={...state,position:state.position.slice(),velocity:state.velocity.slice()};
  if(!(dt>0)||s.status==='crashed')return s;
  const count=Math.ceil(dt/K.integration_dt_max),h=dt/count;
  for(let it=0;it<count;it++){
    let ground=s.status==='grounded'&&!e.pitch_locked&&!!e.surfaceHeight&&s.position[1]<=contactHeight(s,e)+1e-5;
    if(ground)constrain(s,e);
    const k1=derivative(s,c,e,ground);
    if(!k1.a.ground)ground=false;
    const mid=advance(s,k1,h/2);
    if(ground)constrain(mid,e);
    const k2=derivative(mid,c,e,ground);
    let n=advance(s,k2,h);
    n.roll=clamp(n.roll,-E.controls.bank_limit_rad,E.controls.bank_limit_rad);
    if(Math.abs(n.roll)>=E.controls.bank_limit_rad&&n.roll*n.roll_rate>0)n.roll_rate=0;
    if(e.pitch_locked){n.pitch=s.pitch;n.pitch_rate=s.pitch_rate;}
    n.status=k2.a.ground?'grounded':'flying';
    if(k2.a.ground){
      constrain(n,e);
    }else if(!e.pitch_locked&&e.surfaceHeight){
      const cg=centre(parameters,n,wingPose),height=contactWithCentre(n,e,cg);
      if(n.position[1]<height){
        const m=mechanics(parameters,n,wingPose);
        // Gear sink is not the CG's vertical speed: subtract its moving
        // centroid contribution, and include the body's pitching velocity.
        let sink=0;
        for(const g of parameters.gear_centres){
          const r=sub(g,m.cg),jt=[-r[1],r[0],0];
          const local=add(mul(m.dc,-n.omega),mul(jt,n.pitch_rate));
          sink=Math.max(sink,-(n.velocity[1]+bodyToWorld(local,n)[1]));
        }
        const speed=Math.hypot(n.velocity[0],n.velocity[2]);
        const unsafe=sink>E.controls.safe_touchdown_sink_m_s||speed>E.controls.safe_touchdown_speed_m_s||Math.abs(n.roll)>E.controls.safe_touchdown_bank_rad;
        n.status=unsafe?'crashed':'grounded';
        if(unsafe){n.position[1]=height;n.velocity=[0,0,0];n.pitch_rate=0;n.roll_rate=0;}
        else constrain(n,e);
      }
    }
    s=n;
    if(s.status==='crashed')break;
  }
  return s;
}
