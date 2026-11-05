// Executes only trusted author code, never evaluated-model submissions.
import fs from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {Worker,isMainThread,workerData,parentPort} from 'node:worker_threads';
const root=new URL('./',import.meta.url);
if(isMainThread){
 const batch=JSON.parse(await fs.readFile(new URL(process.argv[2],root),'utf8'));
 const output=new URL(process.argv[3],root);try{await fs.access(output);throw Error('Output exists');}catch(e){if(e.code!=='ENOENT')throw e;}
 const results=[];let next=0;
 async function run(){while(next<batch.length){const item=batch[next++];const result=await new Promise((resolve,reject)=>{const w=new Worker(new URL(import.meta.url),{workerData:item,env:{}});w.on('message',resolve);w.on('error',reject);w.on('exit',code=>{if(code)reject(Error('Worker exit '+code));});});results.push(result);await fs.writeFile(output,JSON.stringify(results,null,2));console.log(JSON.stringify({...item,...result,samples:undefined,transitions:undefined,final_state:undefined}));}}
 await Promise.all(Array.from({length:4},run));
}else{
 const plan=workerData,clock=performance.now(),P=await import(new URL('author/'+(plan.module??'physics.mjs'),root));
 const {E}=await import(new URL('author/environment/engineering.mjs',root)),W=await import(new URL('author/environment/world.mjs',root));
 const f=W.AIRFIELDS[0],e={wind:[0,0,0],rho:1.225,surfaceHeight:W.surfaceHeight},clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 let s={position:[f.x+f.start,2,f.z],velocity:[0,0,0],pitch:0,roll:0,heading:0,pitch_rate:0,roll_rate:0,phase:0,omega:0,fuel_kg:3.6,wheel_angle:0,shaft_work_J:0,aero_work_J:0,drive_heat_J:0,control_work_J:0,time:0,status:'grounded',gliding:false,timing_bias:.3,sweep_scale:1};s.position[1]=P.contactHeight(s,e);
 let clearFor=0,takeoff=null,peak=0,samples=[],transitions=[];
 const dt=1/120,end=plan.end??70;
 for(let i=0;i<end*120;i++){
  let throttle=plan.throttle??1,pitch=plan.pitch_input??null;
  if(plan.ramp_s)throttle*=Math.min(1,s.time/plan.ramp_s);
  if(plan.low_until_speed&&Math.hypot(s.velocity[0],s.velocity[2])<plan.low_until_speed)throttle=plan.low_throttle;
  if(plan.power_steps)for(const [until,power] of plan.power_steps){throttle=power;if(s.time<until)break;}
  if(plan.phase_gate)throttle*=Math.cos(s.phase)>plan.phase_gate.threshold?plan.phase_gate.high:plan.phase_gate.low;
  const target=plan.target??.12;
  if(pitch===null)pitch=clamp((plan.kp??4)*(target-s.pitch)-(plan.kd??1)*s.pitch_rate,-1,1);
  if(plan.pitch_steps)for(const [until,input] of plan.pitch_steps){pitch=input;if(s.time<until)break;}
  const old=s;s=P.step(s,{throttle,pitch,bank:s.time>62?clamp(2*(.45-s.roll)-s.roll_rate,-1,1):0,rudder:0,brake:0},e,dt);
  const clearance=s.position[1]-P.contactHeight(s,e);peak=Math.max(peak,clearance);
  clearFor=clearance>.3&&s.status==='flying'?clearFor+dt:0;
  if(clearFor>=2&&!takeoff)takeoff={time:s.time,x:s.position[0]};
  if(old.status!==s.status)transitions.push({time:s.time,from:old.status,to:s.status,clearance,vx:s.velocity[0],vy:s.velocity[1]});
  if(i%120===0)samples.push({time:s.time,status:s.status,clearance,vx:s.velocity[0],vy:s.velocity[1],pitch:s.pitch,omega:s.omega,x:s.position[0]});
  if(s.status==='crashed'||!Number.isFinite(s.position[1]))break;
 }
 parentPort.postMessage({plan,elapsed_wall_s:(performance.now()-clock)/1000,status:s.status,time:s.time,takeoff,peak_clearance:peak,pass:!!takeoff&&takeoff.x<f.x+f.length/2&&s.time>=69.99&&s.status==='flying'&&s.position[1]-P.contactHeight(s,e)>1&&s.roll>.25,final_state:s,samples,transitions});
}
