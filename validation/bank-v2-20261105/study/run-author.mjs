// Trusted author implementations only; evaluated model code is never executed in Node.
import fs from 'node:fs/promises';
import {Worker,isMainThread,workerData,parentPort} from 'node:worker_threads';
const root=new URL('./',import.meta.url);
if(isMainThread){
 const plans=JSON.parse(await fs.readFile(new URL(process.argv[2],root))),output=new URL(process.argv[3],root);try{await fs.access(output);throw Error('Preserve previous output');}catch(e){if(e.code!=='ENOENT')throw e;}
 const results=[];let n=0;
 async function next(){while(n<plans.length){const plan=plans[n++];const result=await new Promise((resolve,reject)=>{const w=new Worker(new URL(import.meta.url),{workerData:plan,env:{}});w.on('message',resolve);w.on('error',reject);w.on('exit',c=>{if(c)reject(Error('Worker exited '+c));});});results.push(result);await fs.writeFile(output,JSON.stringify(results,null,2));const d=result.result.physics[0].detail;console.log(JSON.stringify({label:plan.label,pass:d.pass,bank_start:d.bank_maneuver?.start?.state.time,bank_clearance:d.bank_maneuver?.start?.clearance,min_clearance:d.bank_maneuver?.min_clearance_m,final_clearance:d.final_clearance_m,status:d.final_state?.status,time:d.final_state?.time,peak_roll_rate:d.bank_maneuver?.max_roll_rate_rad_s}));}}
 await Promise.all(Array.from({length:4},next));
}else{
 const plan=workerData,author=new URL('author/',root),{E}=await import(new URL('environment/engineering.mjs',author));let source=await fs.readFile(new URL('source-probes.snapshot.mjs',root),'utf8');
 for(const [from,to] of [['/physics.mjs',plan.module],['/kinematics.mjs','kinematics.mjs'],['/environment/world.mjs','environment/world.mjs']])source=source.replace(`import('${from}')`,`import(${JSON.stringify(new URL(to,author).href)})`);
 const {sourceProbe}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 parentPort.postMessage({plan,result:await sourceProbe({E,scenario:'power',launchProfiles:plan.launch_profiles??[plan.low_throttle],bankPolicy:plan.policy})});
}
