// Author-only diagnostic. Published grader stays unchanged; substitute its pilot throttle policy only.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('./',import.meta.url),author=new URL('author/',root),{E}=await import(new URL('environment/engineering.mjs',author));
const original=await fs.readFile(new URL('source-probes.snapshot.mjs',root),'utf8'),results=[];
for(const [module,low] of [['physics.mjs',.625],['physics-combined.mjs',.625],['physics-combined-fine.mjs',.625]]){
 let source=original.replace("import('/physics.mjs')",`import(${JSON.stringify(new URL(module,author).href)})`).replace("import('/kinematics.mjs')",`import(${JSON.stringify(new URL('kinematics.mjs',author).href)})`).replace("import('/environment/world.mjs')",`import(${JSON.stringify(new URL('environment/world.mjs',author).href)})`);
 const old='const c={...controls,throttle:1,pitch:clamp(4*(.12-s.pitch)-s.pitch_rate,-1,1),bank:s.time>62?';
 if(!source.includes(old))throw Error('Published controller changed');
 source=source.replace(old,`const c={...controls,throttle:Math.hypot(s.velocity[0],s.velocity[2])<14?${low}:1,pitch:clamp(4*(.12-s.pitch)-s.pitch_rate,-1,1),bank:s.time>62?`);
 const {sourceProbe}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const result=await sourceProbe({E,scenario:'power'});results.push({kind:'Diagnostic controller substitution, not a new grade or model trial',module,low_throttle:low,published_probe_sha256:createHash('sha256').update(original).digest('hex'),result});
 await fs.writeFile(new URL('positive-power-oracle.json',root),JSON.stringify(results,null,2));
 const x=result.physics[0];console.log(JSON.stringify({module,pass:x.pass,takeoff:x.detail.first_sustained_takeoff,status:x.detail.final_state.status,time:x.detail.final_state.time,clearance:x.detail.final_clearance_m,trajectory_force_correct:x.detail.trajectory_force_correct,fuel_correct:x.detail.fuel_correct,energy_derivatives:x.detail.derivatives.map(d=>d.pass)}));
}
