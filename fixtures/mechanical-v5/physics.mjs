// Withheld handwritten calibration fixture; not a generated result or validated aircraft.
import {E} from './environment/engineering.mjs';
import {wingSamples} from './environment/mechanism.mjs';
import {wingPose} from './kinematics.mjs';
const AR=7.4**2/6.61,G=E.gravity_m_s2,J=E.engine.equivalent_drive_inertia_kg_m2;
export const parameters={fixture_only:true,aspect_ratio:AR,wrist_span_fraction:.5,span_m:E.span_m,
  wing_area_m2:E.span_m**2/AR,body_length_m:E.body_length_m,pilot_mass_kg:E.pilot_mass_kg,
  dry_mass_kg:E.dry_mass_including_pilot_kg,mass_kg:E.dry_mass_including_pilot_kg+E.fuel.initial_kg,
  mass_budget:E.mass_budget,wheel_radius_m:E.wheel_radius_m,gear_centres:E.gear_centres_m};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),add=(a,b)=>a.map((x,i)=>x+b[i]);
const scale=(a,k)=>a.map(x=>x*k),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const n=Math.hypot(...a);return n>1e-10?scale(a,1/n):[1,0,0];};
export const mass=s=>parameters.dry_mass_kg+Math.max(0,s.fuel_kg);
export function bodyToWorld(v,s){
  const cr=Math.cos(s.roll),sr=Math.sin(s.roll),cp=Math.cos(s.pitch),sp=Math.sin(s.pitch),ch=Math.cos(s.heading),sh=Math.sin(s.heading);
  const [x,y,z]=v,b=cr*y-sr*z,c=sr*y+cr*z,u=cp*x-sp*b,w=sp*x+cp*b;
  return [ch*u-sh*c,w,sh*u+ch*c];
}
function worldToBody(v,s){
  return [dot(v,bodyToWorld([1,0,0],s)),dot(v,bodyToWorld([0,1,0],s)),dot(v,bodyToWorld([0,0,1],s))];
}
export function polar(alpha){
  const a=E.aero,slope=a.section_lift_slope_per_rad/(1+a.section_lift_slope_per_rad/(Math.PI*a.span_efficiency*AR));
  const edge=clamp(alpha,-a.stall_alpha_rad,a.stall_alpha_rad);
  const attached=slope*(edge-a.zero_lift_alpha_rad);
  const blend=clamp((Math.abs(alpha)-a.stall_alpha_rad)/(a.post_stall_transition_rad-a.stall_alpha_rad),0,1);
  const cl=attached*(1-blend)+Math.sin(2*alpha)*blend;
  const table=a.section_profile_drag,x=Math.abs(cl);let profile=table.at(-1)[1];
  for(let i=1;i<table.length;i++)if(x<=table[i][0]){const [a0,b0]=table[i-1],[a1,b1]=table[i];profile=b0+(b1-b0)*clamp((x-a0)/(a1-a0),0,1);break;}
  const cd=a.roughness_multiplier*profile
    +cl*cl/(Math.PI*a.span_efficiency*AR)+1.8*Math.sin(alpha)**2*blend;
  return {cl,cd};
}
export function forces(state,controls,environment,pose=wingPose(state)){
  const air=state.velocity.map((x,i)=>x-environment.wind[i]),bodyAir=worldToBody(air,state),V=Math.hypot(...air);
  let wing=[0,0,0],aeroPower=0,dissipation=0;
  for(const strip of wingSamples(parameters,pose)){
    const local=add(bodyAir,strip.velocity),u=local.map((x,i)=>x-strip.span[i]*dot(local,strip.span)),speed=Math.hypot(...u);
    if(speed<1e-9)continue;
    const direction=scale(u,1/speed),alpha=Math.atan2(-dot(direction,strip.normal),dot(direction,strip.chord)),p=polar(alpha);
    const q=.5*environment.rho*speed*speed*strip.area,L=q*p.cl,D=q*p.cd;
    const f=add(scale(unit(cross(strip.span,direction)),L),scale(direction,-D));
    wing=add(wing,f);aeroPower-=dot(f,strip.velocity);dissipation+=D*speed;
  }
  const area=Object.values(E.aero.body_flat_plate_areas_m2).reduce((a,b)=>a+b,0),bodyDrag=.5*environment.rho*V*V*area;
  const worldWing=bodyToWorld(wing,state),dragVector=scale(unit(air),-bodyDrag);
  const rudder=.5*environment.rho*V*V*parameters.wing_area_m2*E.controls.rudder_coefficient*clamp(controls.rudder,-1,1);
  const side=unit([-air[2],0,air[0]]),force=add(add(worldWing,dragVector),scale(side,rudder));force[1]-=mass(state)*G;
  const target=2*Math.PI*E.engine.maximum_wingbeat_hz*clamp(controls.throttle,0,1);
  const power=state.fuel_kg>0&&target>0?clamp((target-state.omega)*E.engine.governor_gain_W_per_rad_s,0,E.engine.continuous_shaft_limit_W*clamp(controls.throttle,0,1)):0;
  return {force,lift:worldWing[1],thrust:wing[0],drag:bodyDrag,power,airspeed:V,
    wing_force_body_N:wing,aero_power_W:aeroPower,wing_dissipation_W:dissipation,
    drive_friction_W:E.engine.drive_friction_Nm_s*state.omega*state.omega,mass_kg:mass(state)};
}
export function contactHeight(s,env){
  return Math.max(...parameters.gear_centres.map(p=>{
    const r=bodyToWorld(p,s);return env.surfaceHeight(s.position[0]+r[0],s.position[2]+r[2])+parameters.wheel_radius_m-r[1];
  }));
}
function tick(state,controls,environment,dt){
  const s={...state,position:state.position.slice(),velocity:state.velocity.slice()},c=E.controls;
  if(s.status==='crashed')return {...s,time:s.time+dt};
  const f=forces(state,controls,environment),m=mass(state),net=f.force.slice();
  const floor=contactHeight(state,environment),contact=state.position[1]<=floor+1e-5;
  if(contact&&net[1]<0){
    const load=-net[1];net[1]=0;
    const speed=Math.hypot(state.velocity[0],state.velocity[2]);
    if(speed>0){const brake=Math.min(c.brake_force_N*controls.brake+c.rolling_friction_coefficient*load,speed*m/dt);net[0]-=brake*state.velocity[0]/speed;net[2]-=brake*state.velocity[2]/speed;}
  }
  s.velocity=state.velocity.map((v,i)=>v+net[i]/m*dt);s.position=state.position.map((v,i)=>v+s.velocity[i]*dt);
  s.pitch_rate=state.pitch_rate+(c.pitch_accel_rad_s2*controls.pitch-c.pitch_damping_per_s*state.pitch_rate)*dt;
  s.roll_rate=state.roll_rate+(c.roll_accel_rad_s2*controls.bank-c.roll_damping_per_s*state.roll_rate)*dt;
  s.pitch=clamp(state.pitch+s.pitch_rate*dt,...c.pitch_limits_rad);
  s.roll=clamp(state.roll+s.roll_rate*dt,-c.bank_limit_rad,c.bank_limit_rad);
  if(Math.hypot(...s.velocity.filter((_,i)=>i!==1))>.1)s.heading=Math.atan2(s.velocity[2],s.velocity[0]);
  const requestedFuel=(f.power*E.fuel.bsfc_kg_kWh/3600000+(controls.throttle>0&&state.fuel_kg>0?E.fuel.idle_kg_s:0))*dt;
  const used=Math.min(state.fuel_kg,requestedFuel),fraction=requestedFuel>0?used/requestedFuel:1;
  const shaftWork=f.power*dt*fraction,gearWork=shaftWork*E.engine.transmission_efficiency;
  s.fuel_kg=Math.max(0,state.fuel_kg-used);
  const energy=.5*J*state.omega**2+(gearWork-f.aero_power_W*dt-f.drive_friction_W*dt);
  if(energy<-.001)throw Error('Drive energy exhausted within step; reduce dt');
  const lock=controls.throttle<=0||s.fuel_kg<=0;
  s.omega=lock?0:Math.sqrt(Math.max(0,2*energy/J));
  s.phase=(state.phase+state.omega*dt)%(2*Math.PI);
  s.shaft_work_J=(state.shaft_work_J??0)+shaftWork;
  s.aero_work_J=(state.aero_work_J??0)+f.aero_power_W*dt;
  s.drive_heat_J=(state.drive_heat_J??0)+shaftWork-gearWork+f.drive_friction_W*dt+(lock?Math.max(0,energy):0);
  s.wheel_angle=(state.wheel_angle??0)+(contact?Math.hypot(state.velocity[0],state.velocity[2])*dt/parameters.wheel_radius_m:0);
  s.time=state.time+dt;
  const ground=contactHeight(s,environment);
  if(s.position[1]>ground+1e-4)s.status='flying';
  if(s.position[1]<=ground){
    if(state.status==='flying')s.status=s.velocity[1]>=-c.safe_touchdown_sink_m_s&&Math.hypot(s.velocity[0],s.velocity[2])<=c.safe_touchdown_speed_m_s&&Math.abs(s.roll)<=c.safe_touchdown_bank_rad?'landed':'crashed';
    s.position[1]=ground;s.velocity[1]=Math.max(0,s.velocity[1]);
    if(s.status==='crashed')s.velocity=[0,0,0];
  }
  return s;
}
export function step(state,controls,environment,dt){
  if(!Number.isFinite(dt)||dt<=0||dt>.05)throw RangeError('dt must be in (0,.05]');
  let s=state,remaining=dt;
  while(remaining>1e-12){const h=Math.min(1/120,remaining);s=tick(s,controls,environment,h);remaining-=h;}
  return s;
}
