// Trusted verifier. Submitted JavaScript runs only inside sandboxed Chromium.
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
const [base, artifactDir] = process.argv.slice(2);
const results = {source:[],physics:[],interaction:[],diagnostics:{},evidence:{screenshots:[]},infrastructure_error:null};
const add=(group,id,pass,detail)=>results[group].push({id,pass:pass===true,detail});
const near=(a,b,tolerance=1e-6)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tolerance*Math.max(1,Math.abs(b));
const finite=s=>s&&['position','velocity'].every(k=>Array.isArray(s[k])&&s[k].length===3&&s[k].every(Number.isFinite))&&['pitch','roll','phase','time'].every(k=>Number.isFinite(s[k]));
const initial=()=>({position:[0,30,0],velocity:[10,0,0],pitch:0,roll:0,phase:0,time:0,status:'flying'});
const environment={wind:[0,0,0],rho:1.225};
const expected={span_m:7.4*0.3048,wing_area_m2:6.61*0.3048**2,wrist_span_m:3.7*0.3048,
 shoulder_span_m:4*0.0254,body_width_m:8*0.0254,overall_length_m:55*0.0254,aspect_ratio:7.4**2/6.61};
let browser;
try {
 browser=await chromium.launch({headless:true,chromiumSandbox:true});
 results.evidence.runtime={node:process.version,browser:browser.version(),viewport:[1280,800],clock:'Playwright virtual clock'};
 const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block',acceptDownloads:false});
 const blocked=[],errors=[];
 await context.route('**/*',route=>{
  const url=route.request().url();
  if(url.startsWith(base+'/'))return route.continue();
  blocked.push(url.slice(0,200));return route.abort();
 });
 const probe=await context.newPage();
 await probe.goto(base+'/__probe.html');
 try {
  await probe.evaluate(async()=>{window.subject=await import('/physics.mjs');});
  const params=await probe.evaluate(()=>({...window.subject.parameters}));
  for(const [id,value] of Object.entries(expected))add('source',id,
   Number.isFinite(params[id])&&Math.abs(params[id]-value)<=0.005*Math.abs(value),
   {actual:params[id]??null,expected:value,relative_tolerance:0.005});
  const force=async(state,throttle,env=environment)=>probe.evaluate(({state,throttle,env})=>{
   try{return window.subject.forces(state,{throttle,pitch:0,bank:0,brake:0},env);}
   catch(error){return {error:String(error)};}
  },{state,throttle,env});
  const still=initial(),off=await force(still,0),on=await force(still,1);
  add('physics','power_controls_thrust',near(off.thrust,0)&&Number.isFinite(on.thrust)&&on.thrust>0,
   {power_off:off,power_on:on});
  const fast=await force({...still,velocity:[20,0,0]},0);
  add('physics','lift_scales_with_speed_squared',Number.isFinite(off.lift)&&off.lift>0&&near(fast.lift,4*off.lift),
   {speed_10_lift:off.lift??null,speed_20_lift:fast.lift??null,expected_ratio:4,tolerance:1e-6});
  const matching=await force(still,0,{...environment,wind:[10,0,0]});
  add('physics','matching_wind_removes_lift',Number.isFinite(off.lift)&&off.lift>0&&near(matching.lift,0),
   {still_air_lift:off.lift??null,matching_wind_lift:matching.lift??null,tolerance:1e-6});
  async function numeric(id,test){
   try{const {pass,...detail}=await test();add('physics',id,pass,detail);}
   catch(error){add('physics',id,false,{error:String(error).slice(0,1000)});}
  }
  const advance=async(state,throttle,count)=>probe.evaluate(({state,throttle,count})=>{
   const samples=[];
   for(let i=0;i<count;i++){
    state=window.subject.step(state,{throttle,pitch:0,bank:0,brake:0},{wind:[0,0,0],rho:1.225},1/120);
    samples.push(state);
   }
   return samples;
  },{state,throttle,count});
  await numeric('ground_nonpenetration',async()=>{
   const samples=await advance({...initial(),position:[0,0.21,0],velocity:[10,-2,0]},0,240);
   const heights=samples.map(s=>s.position?.[1]);
   return {pass:samples.every(finite)&&heights.every(y=>y>=0.2-1e-9)&&heights.some(y=>near(y,0.2)),
    minimum_y:Math.min(...heights),contact_plane_y:0.2,final:samples.at(-1)};
  });
  await numeric('powered_wingbeat_frequency',async()=>{
   const samples=await advance({...initial(),phase:0.37},1,44);
   const observed=[12,25,44].map(n=>({steps:n,actual:samples[n-1]?.phase,expected:(0.37+4*Math.PI*n/120)%(2*Math.PI)}));
   return {pass:observed.every(s=>near(s.actual,s.expected)),samples:observed,tolerance:1e-6};
  });
  await numeric('unpowered_wingbeat_stops',async()=>{
   const samples=await advance({...initial(),phase:0.73},0,44);
   return {pass:samples.every(s=>near(s.phase,0.73)),initial_phase:0.73,final_phase:samples.at(-1)?.phase};
  });
  await numeric('steady_glide_ratio',async()=>{
   if(!(params.wing_area_m2>0&&params.aspect_ratio>0))throw Error('Positive area and aspect ratio required');
   const cl=0.6,cd=0.035+cl**2/(Math.PI*0.8*params.aspect_ratio),gamma=Math.atan(cd/cl);
   const speed=Math.sqrt(2*6*9.80665*Math.cos(gamma)/(1.225*params.wing_area_m2*cl));
   const start={...initial(),position:[0,100,0],velocity:[speed*Math.cos(gamma),-speed*Math.sin(gamma),0],pitch:-gamma};
   const samples=await advance(start,0,240),end=samples.at(-1);
   const forward=end.position[0]-start.position[0],heightLost=start.position[1]-end.position[1];
   const actual=forward/heightLost,expected=cl/cd;
   return {pass:samples.every(finite)&&forward>1&&heightLost>0.1&&near(actual,expected,0.01),
    actual_ratio:actual,expected_ratio:expected,forward_m:forward,height_lost_m:heightLost,
    initial:start,final:end,relative_tolerance:0.01};
  });
 }catch(error){results.diagnostics.module_error=String(error).slice(0,1500);}
 await probe.close();

 // Each UI check gets a new page. Only the declared input changes between paired trials.
 // runFor fires every animation callback; elapsed laptop/CI time does not set flight duration.
 async function openPage(){
  const page=await context.newPage();page.setDefaultTimeout(1500);
  page.on('pageerror',error=>errors.push(String(error).slice(0,500)));
  await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});
  await page.goto(base+'/index.html');
  if(!results.evidence.screenshots.includes('initial-page.png')){
   await page.screenshot({path:path.join(artifactDir,'initial-page.png')});
   results.evidence.screenshots.push('initial-page.png');
  }
  await page.clock.pauseAt(new Date('2026-01-02T00:00:00Z'));
  await page.clock.runFor(32); // Establish animation timing while the initial state is paused.
  await page.waitForFunction(()=>typeof window.flightLab?.getState==='function');
  return page;
 }
 const state=page=>page.evaluate(()=>window.flightLab.getState());
 const getControls=page=>page.evaluate(()=>window.flightLab.getControls());
 async function throttle(page,value){await page.getByTestId('throttle').fill(String(value));}
 async function reset(page){await page.getByTestId('reset').click();}
 async function holdUp(page,ms){await page.keyboard.down('ArrowUp');await page.clock.runFor(ms);await page.keyboard.up('ArrowUp');}
 async function check(id,action){
  let page;
  try{page=await openPage();const {pass,...detail}=await action(page);add('interaction',id,pass,detail);}
  catch(error){add('interaction',id,false,{error:String(error).slice(0,1500)});}
  finally{if(page)await page.close();else for(const p of context.pages())await p.close();}
 }
 await check('power_moves_forward',async page=>{
  await reset(page);await page.getByTestId('start').click();await page.clock.runFor(1000);
  const neutral=await state(page);
  const poweredPage=await openPage();
  try{
   await reset(poweredPage);await throttle(poweredPage,1);await poweredPage.getByTestId('start').click();await poweredPage.clock.runFor(1000);
   const powered=await state(poweredPage);
   return {pass:finite(neutral)&&finite(powered)&&powered.position[0]-neutral.position[0]>0.1,neutral,powered,minimum_difference_m:0.1};
  }finally{await poweredPage.close();}
 });
 await check('pitch_input_changes_pitch',async page=>{
  await page.getByTestId('approach').click();await page.getByTestId('start').click();await page.clock.runFor(400);
  const neutral=await state(page);
  const pitchedPage=await openPage();
  try{
   await pitchedPage.getByTestId('approach').click();await pitchedPage.getByTestId('start').click();await holdUp(pitchedPage,400);
   const pitched=await state(pitchedPage);
   return {pass:finite(neutral)&&finite(pitched)&&pitched.pitch-neutral.pitch>0.1,neutral,pitched,minimum_difference_rad:0.1};
  }finally{await pitchedPage.close();}
 });
 await check('pause_freezes_state',async page=>{
  await page.getByTestId('approach').click();const before=await state(page);
  await page.getByTestId('start').click();await page.clock.runFor(400);
  await page.getByTestId('pause').click();const paused=await state(page);
  await page.clock.runFor(1000);const after=await state(page);
  return {pass:finite(paused)&&paused.time>before.time&&JSON.stringify(paused)===JSON.stringify(after),before,paused,after};
 });
 await check('reset_restores_state',async page=>{
  await page.getByTestId('approach').click();
  await throttle(page,1);await page.getByTestId('start').click();await page.clock.runFor(400);
  const before=await state(page);await reset(page);await page.clock.runFor(1000);
  const after=await state(page),c=await getControls(page);
  const zero=a=>a.every(v=>v===0);
  return {pass:finite(before)&&before.time>0&&finite(after)&&zero(after.velocity)&&
   after.position[0]===0&&after.position[1]===0.2&&after.position[2]===0&&after.pitch===0&&after.roll===0&&
   after.phase===0&&after.time===0&&after.status==='grounded'&&c.throttle===0,before,after,controls:c};
 });
 await check('takeoff',async page=>{
  await reset(page);await throttle(page,1);await page.getByTestId('start').click();
  await page.clock.runFor(2000);await holdUp(page,300);await page.clock.runFor(3700);
  const samples=[await state(page)];
  for(let i=0;i<4;i++){await page.clock.runFor(250);samples.push(await state(page));}
  return {pass:samples.every(s=>finite(s)&&s.status==='flying'&&s.position[1]>0.7),samples,minimum_height_m:0.7};
 });
 await check('landing',async page=>{
  await page.getByTestId('approach').click();const before=await state(page);
  await page.getByTestId('start').click();await holdUp(page,400);await page.clock.runFor(2000);
  const after=await state(page);
  return {pass:finite(before)&&before.status==='flying'&&before.position[1]===2&&finite(after)&&
   after.status==='landed'&&near(after.position[1],0.2)&&Math.abs(after.velocity[1])<1e-6,before,after};
 });
 let inspection;
 try{
  inspection=await openPage();await reset(inspection);await inspection.getByTestId('view-top').click();
  await inspection.clock.runFor(32);
  await inspection.getByTestId('scene').screenshot({path:path.join(artifactDir,'inspection-top.png')});
  results.evidence.screenshots.push('inspection-top.png');
  await inspection.getByTestId('view-side').click();await inspection.clock.runFor(32);
  await inspection.getByTestId('scene').screenshot({path:path.join(artifactDir,'inspection-side.png')});
  results.evidence.screenshots.push('inspection-side.png');
  await inspection.getByTestId('approach').click();await inspection.getByTestId('view-front').click();
  await throttle(inspection,1);await inspection.getByTestId('start').click();
  results.evidence.flapping_samples=[];
  for(let i=0;i<4;i++){
   if(i)await inspection.clock.runFor(128);
   const file='flap-'+i+'.png';
   await inspection.getByTestId('scene').screenshot({path:path.join(artifactDir,file)});
   results.evidence.screenshots.push(file);
   results.evidence.flapping_samples.push({file,state:await state(inspection)});
  }
 }catch(error){results.diagnostics.inspection_error=String(error).slice(0,1500);}
 finally{if(inspection)await inspection.close();}
 // Real-clock callback timing is advisory. It is not presented-frame/GPU measurement.
 // Playwright clock emulation applies to the context, so use a separate real-clock context.
 const performanceContext=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block',acceptDownloads:false});
 await performanceContext.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
 results.diagnostics.performance={scored:false,measurement:'requestAnimationFrame callback intervals, not presented frames',trials:[]};
 for(const power of [0,1]){
  let page;
  try{
   page=await performanceContext.newPage();page.setDefaultTimeout(1500);await page.goto(base+'/index.html');
   await page.getByTestId('approach').click();await throttle(page,power);await page.getByTestId('start').click();
   const data=await page.evaluate(()=>new Promise(resolve=>{
    const deltas=[];let start,last;const stateStart=window.flightLab.getState();
    function sample(now){
     if(start===undefined){start=now;last=now;requestAnimationFrame(sample);return;}
     deltas.push(now-last);last=now;
     if(now-start<1000){requestAnimationFrame(sample);return;}
     resolve({frame_intervals_ms:deltas,wall_ms:now-start,simulation_seconds:window.flightLab.getState().time-stateStart.time});
    }
    requestAnimationFrame(sample);
   }));
   const sorted=[...data.frame_intervals_ms].sort((a,b)=>a-b),n=sorted.length;
   results.diagnostics.performance.trials.push({throttle:power,samples:n,elapsed_ms:data.wall_ms,
    callback_hz:n*1000/data.wall_ms,p95_interval_ms:sorted[Math.ceil(0.95*n)-1],max_interval_ms:sorted.at(-1),
    simulation_seconds_per_wall_second:data.simulation_seconds/(data.wall_ms/1000)});
  }catch(error){results.diagnostics.performance.trials.push({throttle:power,error:String(error).slice(0,800)});}
  finally{if(page)await page.close();}
 }
 await performanceContext.close();
 results.diagnostics.page_errors=errors;
 results.diagnostics.blocked_requests=blocked;
 await context.close();
}catch(error){results.infrastructure_error=String(error).slice(0,2500);}
finally{if(browser)await browser.close();await fs.writeFile(path.join(artifactDir,'browser-results.json'),JSON.stringify(results,null,2));}
process.exitCode=results.infrastructure_error?2:0;
