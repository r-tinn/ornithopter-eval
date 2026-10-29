// Trusted grader. Submitted code runs only inside a fresh Chromium context.
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
const [base, artifactDir] = process.argv.slice(2);
const results = {source:[], physics:[], interaction:[], evidence:{}, infrastructure_error:null};
const add=(dimension,id,pass,detail='')=>results[dimension].push({id,pass:Boolean(pass),detail});
const close=(a,b,tol=1e-6)=>Number.isFinite(a)&&Math.abs(a-b)<=tol*Math.max(1,Math.abs(b));
const finite=s=>s&&['position','velocity'].every(k=>Array.isArray(s[k])&&s[k].length===3&&s[k].every(Number.isFinite))&&['pitch','roll','phase','time'].every(k=>Number.isFinite(s[k]));
const b=7.4*0.3048,S=6.61*0.3048**2,AR=7.4**2/6.61;
const expected={span_m:b,wing_area_m2:S,wrist_span_m:3.7*0.3048,shoulder_span_m:4*0.0254,body_width_m:8*0.0254,overall_length_m:55*0.0254,aspect_ratio:AR};
let physicsParameters=expected;
const initial=(extra={})=>({position:[0,30,0],velocity:[13,0,0],pitch:0,roll:0,phase:0,time:0,status:'flying',...extra});
const controls=(extra={})=>({throttle:0,pitch:0,bank:0,brake:0,...extra});
const env=(extra={})=>({wind:[0,0,0],rho:1.225,...extra});
function oracle(s,c,e){
 const air=s.velocity.map((v,i)=>v-e.wind[i]),v=Math.hypot(...air),u=v>1e-10?air.map(x=>x/v):[1,0,0];
 const cl=Math.max(-0.2,Math.min(1.4,0.6+3*(s.pitch-Math.atan2(air[1],Math.hypot(air[0],air[2])))));
 const q=0.5*e.rho*v*v,lift=q*physicsParameters.wing_area_m2*cl,drag=q*physicsParameters.wing_area_m2*(0.035+cl*cl/(Math.PI*0.8*physicsParameters.aspect_ratio));
 const power=400*c.throttle,thrust=0.65*power/Math.max(v,5);
 let up=[0,1,0].map((x,i)=>x-u[i]*u[1]);let n=Math.hypot(...up);if(n<1e-9){up=[0,0,1];n=1;}up=up.map(x=>x/n);
 const right=[u[1]*up[2]-u[2]*up[1],u[2]*up[0]-u[0]*up[2],u[0]*up[1]-u[1]*up[0]];
 return {lift,drag,power,thrust,airspeed:v,cl,force:u.map((x,i)=>x*(thrust-drag)+lift*(up[i]*Math.cos(s.roll)+right[i]*Math.sin(s.roll))-(i===1?6*9.80665:0))};
}
let browser;
try {
 browser=await chromium.launch({headless:true,chromiumSandbox:true});
 results.evidence.runtime={node:process.version,browser:browser.version(),viewport:[1280,800]};
 const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block',acceptDownloads:false});
 const blocked=[];
 await context.route('**/*',route=>{const url=route.request().url();if(url.startsWith(base+'/'))return route.continue();blocked.push(url);return route.abort();});
 let probe=await context.newPage();
 probe.setDefaultTimeout(4000);
 await probe.goto(base+'/__probe.html');
 let imported=true;
 try{await probe.evaluate(async()=>{window.subject=await import('/physics.mjs');});}
 catch(error){imported=false;results.evidence.module_error=String(error).slice(0,1500);}
 const invoke=async(method,args)=>probe.evaluate(({method,args})=>{
   try { const before=JSON.stringify(args),value=window.subject[method](...args);return {value,immutable:before===JSON.stringify(args)}; }
   catch(error){return {error:String(error)};}
 },{method,args});
 if(imported){
  const params=await probe.evaluate(()=>({...window.subject.parameters}));
  for(const [key,value] of Object.entries(expected))add('source',key,Number.isFinite(params[key])&&Math.abs(params[key]-value)<=0.005*Math.abs(value),{actual:params[key]??null,expected:value,relative_tolerance:0.005});
  add('source','aspect_ratio_consistency',close(params.aspect_ratio,params.span_m**2/params.wing_area_m2,0.005));
  if(Number.isFinite(params.wing_area_m2)&&params.wing_area_m2>0&&Number.isFinite(params.aspect_ratio)&&params.aspect_ratio>0)physicsParameters=params;
  const cases=[
    ['rest',initial({velocity:[0,0,0]}),controls(),env()],
    ['cruise',initial(),controls({throttle:0.5}),env()],
    ['crosswind',initial({velocity:[16,1,3],roll:0.4,pitch:0.15}),controls({throttle:0.8}),env({wind:[-2,0,4]})],
    ['tailwind',initial(),controls(),env({wind:[8,0,0]})],
    ['matching_wind',initial(),controls(),env({wind:[13,0,0]})],
    ['thin_air',initial({velocity:[21,-2,0],pitch:0.1}),controls({throttle:1}),env({rho:0.6})],
    ['negative_lift',initial({pitch:-0.35}),controls(),env()],
    ['bank_left',initial({roll:-0.5}),controls(),env()],
    ['vertical_flow',initial({velocity:[0,8,0]}),controls({throttle:1}),env()],
  ];
  for(const [id,s,c,e] of cases){
    const r=await invoke('forces',[s,c,e]),want=oracle(s,c,e),got=r.value;
    const pass=got&&['lift','drag','power','thrust','airspeed','cl'].every(k=>close(got[k],want[k]))&&Array.isArray(got.force)&&got.force.length===3&&got.force.every((x,i)=>close(x,want.force[i]));
    add('physics','forces_'+id,pass&&r.immutable,{actual:got??r.error,expected:want});
  }
  const s=initial(),c=controls({throttle:0.5,pitch:0.4,bank:1}),e=env(),dt=0.01;
  const r=await invoke('step',[s,c,e,dt]),f=oracle(s,c,e),next=r.value;
  const velocity=s.velocity.map((v,i)=>v+f.force[i]/6*dt),position=s.position.map((x,i)=>x+velocity[i]*dt);
  add('physics','integration',finite(next)&&next.velocity.every((v,i)=>close(v,velocity[i]))&&next.position.every((v,i)=>close(v,position[i]))&&close(next.time,dt)&&close(next.pitch,0.002)&&close(next.roll,0.02)&&close(next.phase,4*Math.PI*dt)&&r.immutable,r);
  for(const dt of [0,-1,0.1]){const r=await invoke('step',[s,c,e,dt]);add('physics','invalid_dt_'+dt,Boolean(r.error));}
  const stopped=await invoke('step',[initial({phase:0.8}),controls(),e,0.01]);
  add('physics','no_power_no_wingbeat',close(stopped.value?.phase,0.8));
  const scenarios=await probe.evaluate(()=>{
   const base={position:[0,0.2,0],velocity:[0,0,0],pitch:0,roll:0,phase:0,time:0,status:'grounded'};
   const e={wind:[0,0,0],rho:1.225},c={throttle:1,pitch:0,bank:0,brake:0};
   try{
    let s=structuredClone(base),maxHeight=0;
    for(let i=0;i<960;i++){s=window.subject.step(s,{...c,pitch:i>240&&i<360?0.3:0},e,1/120);maxHeight=Math.max(maxHeight,s.position[1]);}
    let glide={...base,position:[0,100,0],velocity:[17,0,0],status:'flying'};
    const energy=s=>6*9.80665*s.position[1]+3*s.velocity.reduce((a,v)=>a+v*v,0),before=energy(glide);
    for(let i=0;i<400;i++)glide=window.subject.step(glide,{...c,throttle:0},e,0.005);
    let a=structuredClone(glide),b=structuredClone(glide);
    for(let i=0;i<50;i++)a=window.subject.step(a,{...c,throttle:0.4},e,0.02);
    for(let i=0;i<100;i++)b=window.subject.step(b,{...c,throttle:0.4},e,0.01);
    const repeat1=window.subject.step(base,c,e,1/120),repeat2=window.subject.step(base,c,e,1/120);
    return {takeoff:s,maxHeight,energyBefore:before,energyAfter:energy(glide),convergence:Math.hypot(...a.position.map((x,i)=>x-b.position[i])),repeatable:JSON.stringify(repeat1)===JSON.stringify(repeat2)};
   }catch(error){return {error:String(error)};}
  });
  add('physics','powered_takeoff',finite(scenarios.takeoff)&&scenarios.maxHeight>0.7,scenarios);
  add('physics','unpowered_energy',Number.isFinite(scenarios.energyAfter)&&scenarios.energyAfter<scenarios.energyBefore,scenarios);
  add('physics','timestep_convergence',Number.isFinite(scenarios.convergence)&&scenarios.convergence<0.25,scenarios.convergence??null);
  add('physics','determinism',scenarios.repeatable===true);
  for(const [id,s,expectedStatus] of [
    ['gentle',initial({position:[0,0.201,0],velocity:[10,-1,0]}),'landed'],
    ['hard',initial({position:[0,0.201,0],velocity:[10,-5,0]}),'crashed'],
    ['banked',initial({position:[0,0.201,0],velocity:[10,-1,0],roll:0.7}),'crashed'],
    ['fast',initial({position:[0,0.201,0],velocity:[20,-1,0]}),'crashed'],
  ]){const r=await invoke('step',[s,controls(),env(),0.01]);add('physics','contact_'+id,finite(r.value)&&r.value.status===expectedStatus&&r.value.position[1]>=0.2,r);}
 }else{add('source','module_load',false);add('physics','module_load',false);}
 await probe.close();
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(4000);page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(base+'/index.html');
 await page.waitForTimeout(150);
 try{
  const canvas=page.getByTestId('scene');await canvas.waitFor();
  const box=await canvas.boundingBox();add('interaction','scene_visible',await canvas.isVisible()&&box.width>=600&&box.height>=350,box);
  await page.screenshot({path:path.join(artifactDir,'inspection.png')});
  const getState=()=>page.evaluate(()=>window.flightLab.getState());
  const start=await getState();
  add('interaction','reset_initial',finite(start)&&start.time===0&&start.position[1]===0.2&&start.velocity.every(v=>v===0));
  await page.getByTestId('throttle').focus();await page.keyboard.press('End');
  add('interaction','throttle_control',(await page.evaluate(()=>window.flightLab.getControls())).throttle===1);
  await page.getByTestId('start').click();await page.waitForTimeout(350);
  await page.keyboard.down('ArrowUp');await page.waitForTimeout(250);await page.keyboard.up('ArrowUp');
  await page.keyboard.down('ArrowRight');await page.waitForTimeout(150);await page.keyboard.up('ArrowRight');
  add('interaction','bank_control',(await getState()).roll>0.03);
  for(let i=0;i<3;i++){await page.waitForTimeout(120);await page.screenshot({path:path.join(artifactDir,`powered-${i}.png`)});}
  await page.getByTestId('pause').click();
  await page.waitForTimeout(80); // Let the UI render the paused state before sampling it.
  const running=await getState();
  add('interaction','start_and_pitch',finite(running)&&running.time>0.2&&running.pitch>0.03&&running.position[0]>start.position[0],running);
  const t1=await page.getByTestId('telemetry').innerText(),f1=await canvas.screenshot();
  await page.waitForTimeout(150);const frozen=await getState(),f2=await canvas.screenshot();
  add('interaction','pause_state_and_telemetry',JSON.stringify(running)===JSON.stringify(frozen)&&t1===await page.getByTestId('telemetry').innerText());
  add('interaction','paused_canvas_stability',f1.equals(f2),'Exact paused-canvas comparison only; does not establish stability during flight.');
  await page.getByTestId('reset').click();const reset=await getState();
  add('interaction','reset_control',finite(reset)&&reset.time===0&&reset.phase===0&&reset.status==='grounded'&&reset.velocity.every(v=>v===0));
  await page.getByTestId('approach').click();const approach=await getState();
  add('interaction','approach_preset',finite(approach)&&approach.position[1]===2&&approach.velocity[0]===10&&approach.velocity[1]===-1&&approach.status==='flying'&&approach.time===0);
  await page.getByTestId('start').click();await page.keyboard.down('ArrowUp');await page.waitForTimeout(400);await page.keyboard.up('ArrowUp');
  for(let i=0;i<4;i++){await page.waitForTimeout(350);await page.screenshot({path:path.join(artifactDir,`flight-${i}.png`)});}
  await page.keyboard.down('Space');await page.waitForTimeout(100);
  add('interaction','brake_control',(await page.evaluate(()=>window.flightLab.getControls())).brake===1);
  await page.waitForTimeout(200);await page.keyboard.up('Space');
  await page.getByTestId('pause').click();const landing=await getState();
  add('interaction','landing_journey',finite(landing)&&landing.status==='landed'&&landing.position[1]>=0.2,landing);
  await page.getByTestId('reset').click();const beforeOrbit=await canvas.screenshot();
  const orbitBox=await canvas.boundingBox();await page.mouse.move(orbitBox.x+200,orbitBox.y+180);await page.mouse.down();await page.mouse.move(orbitBox.x+330,orbitBox.y+200,{steps:8});await page.mouse.up();
  add('interaction','orbit_changes_view',!beforeOrbit.equals(await canvas.screenshot()));
  await page.screenshot({path:path.join(artifactDir,'orbit.png')});
 }catch(error){add('interaction','browser_contract',false,String(error).slice(0,1500));}
 add('interaction','no_uncaught_errors',errors.length===0,errors);
 add('interaction','no_external_requests',blocked.length===0,blocked.map(u=>u.slice(0,200)));
 results.evidence.screenshots=['inspection.png','powered-0.png','powered-1.png','powered-2.png','flight-0.png','flight-1.png','flight-2.png','flight-3.png','orbit.png'];
 await context.close();
}catch(error){results.infrastructure_error=String(error).slice(0,2500);}
finally{if(browser)await browser.close();await fs.writeFile(path.join(artifactDir,'browser-results.json'),JSON.stringify(results,null,2));}
process.exitCode=results.infrastructure_error?2:0;
