// Review/calibration fixture only. Never copied into a model-visible task packet.
export const parameters={fixture_only:true,span_m:3,aspect_ratio:7.4**2/6.61,
  wrist_span_fraction:3.7/7.4,wing_area_m2:9/(7.4**2/6.61),body_length_m:2,mass_kg:6,
  wheel_radius_m:.16,gear_centres:[[.6,-.66,0],[-.45,-.66,-.32],[-.45,-.66,.32]]};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const scale=(a,k)=>a.map(v=>v*k);
const unit=a=>{const n=Math.hypot(...a);return n>1e-10?scale(a,1/n):[1,0,0];};
function rotated(point,s){
  const [x,y,z]=point,cr=Math.cos(s.roll),sr=Math.sin(s.roll),cp=Math.cos(s.pitch),sp=Math.sin(s.pitch),ch=Math.cos(s.heading),sh=Math.sin(s.heading);
  const a=x,b=y*cr-z*sr,c=y*sr+z*cr,u=a*cp-b*sp,v=a*sp+b*cp;
  return [u*ch-c*sh,v,u*sh+c*ch];
}
export function contactHeight(state,environment){
  return Math.max(...parameters.gear_centres.map(p=>{
    const v=rotated(p,state);
    return environment.surfaceHeight(state.position[0]+v[0],state.position[2]+v[2])+parameters.wheel_radius_m-v[1];
  }));
}
export function forces(state,controls,environment){
  const air=state.velocity.map((v,i)=>v-environment.wind[i]),airspeed=Math.hypot(...air),forward=unit(air);
  const alpha=state.pitch-Math.atan2(air[1],Math.hypot(air[0],air[2]));
  const cl=clamp(.6+3*alpha,-.2,1.4),cd=.035+cl**2/(Math.PI*.8*parameters.aspect_ratio);
  const qS=.5*environment.rho*airspeed**2*parameters.wing_area_m2;
  const lift=qS*cl,drag=qS*cd,power=400*clamp(controls.throttle,0,1),thrust=.65*power/Math.max(airspeed,5);
  let up=[0,1,0].map((x,i)=>x-forward[i]*forward[1]);if(Math.hypot(...up)<1e-9)up=[0,0,1];up=unit(up);
  const right=cross(forward,up),liftDirection=up.map((x,i)=>x*Math.cos(state.roll)+right[i]*Math.sin(state.roll));
  const side=unit([-forward[2],0,forward[0]]),rudderForce=qS*.15*controls.rudder;
  const force=forward.map((x,i)=>x*(thrust-drag)+liftDirection[i]*lift+side[i]*rudderForce-(i===1?6*9.80665:0));
  return {lift,drag,thrust,power,airspeed,cl,force};
}
export function step(state,controls,environment,dt){
  if(!Number.isFinite(dt)||dt<=0||dt>.05)throw RangeError('dt must be in (0,.05]');
  const s={...state,position:[...state.position],velocity:[...state.velocity]};
  if(s.status==='crashed')return {...s,time:s.time+dt};
  const force=[...forces(state,controls,environment).force],floor=contactHeight(state,environment);
  const grounded=state.position[1]<=floor+1e-5&&state.status!=='flying';
  if(grounded){
    force[1]=Math.max(0,force[1]);
    const v=Math.hypot(state.velocity[0],state.velocity[2]);
    if(v>1e-9){const brake=Math.min(18*controls.brake,v*6/dt);force[0]-=brake*state.velocity[0]/v;force[2]-=brake*state.velocity[2]/v;}
  }
  s.velocity=state.velocity.map((v,i)=>v+force[i]/6*dt);s.position=state.position.map((p,i)=>p+s.velocity[i]*dt);
  s.pitch=clamp(state.pitch+.5*controls.pitch*dt,-.35,.45);
  s.roll=state.roll+clamp(.6*controls.bank-state.roll,-2*dt,2*dt);
  if(Math.hypot(s.velocity[0],s.velocity[2])>.1)s.heading=Math.atan2(s.velocity[2],s.velocity[0]);
  s.phase=(state.phase+(controls.throttle>0?4*Math.PI*dt:0))%(2*Math.PI);s.time+=dt;
  const ground=contactHeight(s,environment);
  if(s.position[1]>ground+.0001)s.status='flying';
  if(s.position[1]<=ground){
    if(state.status==='flying')s.status=s.velocity[1]>=-3&&Math.hypot(s.velocity[0],s.velocity[2])<=14&&Math.abs(s.roll)<=.35?'landed':'crashed';
    s.position[1]=ground;s.velocity[1]=Math.max(0,s.velocity[1]);
    if(s.status==='crashed')s.velocity=[0,0,0];
  }
  return s;
}
