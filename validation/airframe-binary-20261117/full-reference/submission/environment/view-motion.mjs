// Presentation only. Never feeds interpolated values back into the integrator.
export const PHYSICS_DT=1/120;
export const FRAME_MS=1000/60;
const mix=(a,b,t)=>a+(b-a)*t;
const angle=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;

export function copyPose(source,out={position:[0,0,0],velocity:[0,0,0]}){
  const position=out.position,velocity=out.velocity;
  Object.assign(out,source,{position,velocity});
  for(let i=0;i<3;i++){position[i]=source.position[i];velocity[i]=source.velocity[i];}
  return out;
}

export function interpolatePose(previous,current,alpha,out){
  copyPose(current,out);
  const t=Math.max(0,Math.min(1,alpha));
  for(let i=0;i<3;i++){
    out.position[i]=mix(previous.position[i],current.position[i],t);
    out.velocity[i]=mix(previous.velocity[i],current.velocity[i],t);
  }
  for(const key of ['pitch','roll','heading','phase'])out[key]=angle(previous[key],current[key],t);
  for(const key of ['omega','fuel_kg','pitch_rate','roll_rate'])if(Number.isFinite(previous[key])&&Number.isFinite(current[key]))out[key]=mix(previous[key],current[key],t);
  out.time=mix(previous.time,current.time,t);
  return out;
}

export function chaseView(position,heading,scale,surfaceHeight,eye,target){
  const x=Math.cos(heading),z=Math.sin(heading);
  eye.set(position.x-7.8*scale*x,position.y+2.8*scale,position.z-7.8*scale*z);
  eye.y=Math.max(eye.y,surfaceHeight(eye.x,eye.z)+.35);
  target.set(position.x+.9*scale*x,position.y+.15*scale,position.z+.9*scale*z);
}

// Carry the deadline forward rather than discarding the fractional frame period.
// A 144 Hz display can then alternate 2/3 callbacks to average 60 draws per second.
export function nextFrameDeadline(now,deadline,period=FRAME_MS){
  return deadline+Math.max(1,Math.floor((now-deadline)/period)+1)*period;
}
