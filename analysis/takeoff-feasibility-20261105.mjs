// Offline diagnostic replays, never new model trials or changes to their grades.
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
const root=path.resolve('runs/takeoff-feasibility-20261105');
const ports=JSON.parse(await fs.readFile(path.join(root,'servers.json'),'utf8'));
const scenarios=process.argv[2]?JSON.parse(await fs.readFile(process.argv[2],'utf8')):
  [['reference',1,.12],['reference-normal-friction',1,.12],['sol',1,.12],['astra',1,.12],
   ['sol-finer-step',1,.12],['sol',1,0],['sol',1,.05],['sol',1,.2],['sol',1,.3],['sol',.9,.12],['sol',.8,.12]];
const output=path.join(root,process.argv[3]??'results.json');
try{await fs.access(output);throw Error('Preserve prior evidence: output already exists');}catch(error){if(error.code!=='ENOENT')throw error;}
const browser=await chromium.launch({headless:true,chromiumSandbox:true}),results=[];
try{
 for(const [variant,throttle,target,launch={}] of scenarios){
  const base='http://127.0.0.1:'+ports[variant];
  const context=await browser.newContext({serviceWorkers:'block'});
  await context.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
  const page=await context.newPage();await page.goto(base+'/__probe.html');
  const result=await page.evaluate(async({throttle,target,launch})=>{
    const P=await import(launch.physics_module??'/physics.mjs'),K=await import('/kinematics.mjs'),M=await import('/environment/source-mechanism.mjs');
    const {E}=await import('/environment/engineering.mjs'),W=await import('/environment/world.mjs'),field=W.AIRFIELDS[0];
    const e={wind:[0,0,0],rho:1.225,surfaceHeight:W.surfaceHeight},clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
    let s={position:[field.x+field.start,2,field.z],velocity:[0,0,0],pitch:0,roll:0,heading:0,pitch_rate:0,roll_rate:0,
      phase:0,omega:0,fuel_kg:3.6,wheel_angle:0,shaft_work_J:0,aero_work_J:0,drive_heat_J:0,control_work_J:0,
      time:0,status:'grounded',gliding:false,timing_bias:.3,sweep_scale:1};
    s.position[1]=P.contactHeight(s,e);
    let clearFor=0,firstSustained=null,maxClearance=0,transitions=[],samples=[],maxPositiveGroundResidual=0,groundResidual=0;
    const energy=s=>{const q=M.mechanics(P.parameters,s,K.wingPose);return .5*q.mass*M.dot(s.velocity,s.velocity)+q.mass*E.gravity_m_s2*s.position[1]+.5*q.A*s.omega**2+q.B*s.omega*s.pitch_rate+.5*q.C*s.pitch_rate**2+q.U;};
    let oldEnergy=energy(s);
    for(let i=0;i<70*120;i++){
      const power=launch.ramp_s?throttle*Math.min(1,s.time/launch.ramp_s):launch.low_until_speed&&Math.hypot(s.velocity[0],s.velocity[2])<launch.low_until_speed?launch.low_throttle:throttle;
      const old=s,c={throttle:power,pitch:clamp(4*(target-s.pitch)-s.pitch_rate,-1,1),bank:s.time>62?clamp(2*(.45-s.roll)-s.roll_rate,-1,1):0,rudder:0,brake:s.time<(launch.hold_brake_s??0)?1:0};
      s=P.step(s,c,e,1/120);
      const clearance=s.position[1]-P.contactHeight(s,e);maxClearance=Math.max(clearance,maxClearance);
      clearFor=clearance>.3&&s.status==='flying'?clearFor+1/120:0;
      if(clearFor>=2&&!firstSustained)firstSustained={time:s.time,x:s.position[0],clearance};
      const total=energy(s),residual=total-oldEnergy-(s.shaft_work_J-old.shaft_work_J)+(s.aero_work_J-old.aero_work_J)+(s.drive_heat_J-old.drive_heat_J)-(s.control_work_J-old.control_work_J);
      if(old.status!=='flying'||s.status!=='flying'){maxPositiveGroundResidual=Math.max(maxPositiveGroundResidual,residual);groundResidual+=residual;}
      oldEnergy=total;
      if(s.status!==old.status){transitions.push({time:s.time,from:old.status,to:s.status,clearance,vx:s.velocity[0],vy:s.velocity[1]});}
      if(i%120===0)samples.push({time:s.time,x:s.position[0],vx:s.velocity[0],vy:s.velocity[1],clearance,pitch:s.pitch,status:s.status});
      if(s.status==='crashed')break;
    }
    const q=M.mechanics(P.parameters,s,K.wingPose),wheels=P.parameters.gear_centres.map((gear,index)=>{
      const r=M.sub(gear,q.cg),world=M.bodyToWorld(r,s),relative=M.bodyToWorld(M.sub(M.mul([-r[1],r[0],0],s.pitch_rate),M.mul(q.dc,s.omega)),s);
      return {index,clearance:s.position[1]+world[1]-.23-W.surfaceHeight(s.position[0]+world[0],s.position[2]+world[2]),vertical_speed:s.velocity[1]+relative[1]};
    });
    return {throttle,target_pitch_rad:target,first_sustained_takeoff:firstSustained,final_state:s,
      final_clearance:s.position[1]-P.contactHeight(s,e),max_clearance:maxClearance,wheels,
      max_positive_ground_energy_residual_J:maxPositiveGroundResidual,sum_ground_energy_residual_J:groundResidual,
      touchdown_diagnostics:globalThis.__touchdown_diagnostics??[],
      transitions,samples,pass_runway_flight:!!firstSustained&&firstSustained.x<field.x+field.length/2&&s.time>=69.99&&s.status==='flying'&&s.position[1]-P.contactHeight(s,e)>1&&s.roll>.25};
  },{throttle,target,launch});
  results.push({variant,launch,...result});
  console.log(JSON.stringify({variant,throttle,target,pass:result.pass_runway_flight,takeoff:result.first_sustained_takeoff,final_status:result.final_state.status,time:result.final_state.time,max_positive_ground_residual:result.max_positive_ground_energy_residual_J}));
  await fs.writeFile(output,JSON.stringify({kind:'Local diagnostic copies/replays only; no model API calls, repairs to saved trials or new benchmark grades',results},null,2)+'\n');
  await context.close();
 }
}finally{await browser.close();}
