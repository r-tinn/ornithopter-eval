import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import {E} from '../candidate/mechanical-v5/scaffold/environment/engineering.mjs';
import {pilotedNumeric} from './piloted-numeric.mjs';
import {pilotedGeometry} from './piloted-geometry.mjs';
import {wheelRotationAxis} from './wheel-axis.mjs';
const [base,output]=process.argv.slice(2),report={source:[],physics:[],interaction:[],diagnostics:{errors:[]},evidence:{screenshots:[]}};
let browser;
const check=(id,pass,detail)=>report.interaction.push({id,pass:pass===true,detail});
try{
  browser=await chromium.launch({headless:true,chromiumSandbox:true});
  const context=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1,serviceWorkers:'block'});
  context.setDefaultTimeout(4000);
  await context.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());
  const probe=await context.newPage();await probe.goto(base+'/__probe.html');
  const numeric=await probe.evaluate(pilotedNumeric,{E});
  report.source=numeric.source;report.physics=numeric.physics;if(numeric.error)report.diagnostics.numeric_error=numeric.error;
  report.interaction.push(...await probe.evaluate(pilotedGeometry));
  report.interaction.push(await probe.evaluate(wheelRotationAxis,{submission_url:base}));
  await probe.close();
  const page=await context.newPage();page.on('pageerror',e=>report.diagnostics.errors.push(String(e)));
  await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});await page.goto(base+'/index.html');
  await page.waitForFunction(()=>window.flightLab).catch(e=>report.diagnostics.initialization=String(e));
  await page.clock.pauseAt(new Date('2026-01-02T00:00:00Z'));await page.clock.runFor(50);
  const state=()=>page.evaluate(()=>flightLab.getState()),geometry=()=>page.evaluate(()=>flightLab.getGeometryDiagnostics());
  const advance=async seconds=>{await page.evaluate(s=>flightLab.advanceForReview(s),seconds);await page.clock.runFor(34);};
  const capture=async name=>{await page.screenshot({path:path.join(output,name)});report.evidence.screenshots.push(name);};
  const reset=async(field,approach=false)=>{
    await page.getByRole('button',{name:field,exact:true}).click();
    await page.getByTestId(approach?'approach':'reset').click();await page.clock.runFor(34);
  };
  const ready=await page.evaluate(()=>window.flightLab?.getDiagnostics()??{ready:false,reason:'Candidate modules did not initialize'});report.diagnostics.initial=ready;
  if(ready.ready){
    await capture('initial.png');const g=await geometry();check('aircraft_geometry_bounded',g.triangles>0&&g.triangles<=12000,g);
    try{
      const samples=[];
      for(const key of [null,'KeyD']){
        await reset('Valley',true);if(key)await page.keyboard.down(key);await page.getByTestId('start').click();await page.clock.runFor(1000);
        samples.push({state:await state(),articulation:await page.evaluate(()=>flightLab.getArticulationDiagnostics())});
        if(key)await page.keyboard.up(key);await page.getByTestId('pause').click();await page.clock.runFor(34);
      }
      const delta=Math.atan2(Math.sin(samples[1].state.heading-samples[0].state.heading),Math.cos(samples[1].state.heading-samples[0].state.heading));
      check('rudder_mesh_and_yaw',delta>.02&&samples[1].articulation.rudder_angle-samples[0].articulation.rudder_angle>.1,{samples,heading_delta:delta});
    }catch(e){check('rudder_mesh_and_yaw',false,{error:String(e)});}
    const takeoffs=[],landings=[],contacts=[];
    for(const field of ['Valley','Meadow']){
      try{
        await reset(field);await page.getByTestId('throttle').fill('1');await advance(35);
        const samples=[];
        for(let i=0;i<3;i++){if(i)await advance(1);samples.push({state:await state(),geometry:await geometry()});}
        takeoffs.push({field,pass:samples.every(s=>s.state.status==='flying'&&s.geometry.wheel_clearances.length===3&&s.geometry.wheel_clearances.every(x=>Number.isFinite(x)&&x>.3)),samples});
        await capture('flight-'+field.toLowerCase()+'.png');
      }catch(e){takeoffs.push({field,pass:false,error:String(e)});}
      try{
        await reset(field,true);const samples=[];
        for(let i=0;i<100;i++){await advance(.1);samples.push({state:await state(),geometry:await geometry()});}
        const last=samples.at(-1),clear=last.geometry.wheel_clearances,touches=clear.length===3&&clear.every(x=>Number.isFinite(x)&&x>=-.01)&&clear.some(x=>x<=.02);
        landings.push({field,pass:last.state.status==='landed'&&samples.every(x=>x.state.status!=='crashed')&&touches&&Math.abs(last.state.velocity[1])<1e-8,last});
        contacts.push({field,pass:touches&&samples.every(x=>x.geometry.wheel_clearances.length===3&&x.geometry.wheel_clearances.every(v=>Number.isFinite(v)&&v>=-.01)),samples});
        await capture('landing-'+field.toLowerCase()+'.png');
      }catch(e){landings.push({field,pass:false,error:String(e)});contacts.push({field,pass:false,error:String(e)});}
    }
    check('takeoff_from_strip',takeoffs.length===2&&takeoffs.every(x=>x.pass),takeoffs);
    check('landing_on_strip',landings.length===2&&landings.every(x=>x.pass),landings);
    check('wheels_above_surface',contacts.length===2&&contacts.every(x=>x.pass),contacts);
    await reset('Valley');
    for(const [view,name] of [['Inspect','inspection-orbit.png'],['Top','inspection-top.png'],['Side','inspection-side.png'],['Front','inspection-front.png'],['Pilot','inspection-pilot.png']]){
      await page.getByRole('button',{name:view,exact:true}).click();await page.clock.runFor(34);await capture(name);
    }
    await page.getByRole('button',{name:'Inspect',exact:true}).click();await page.getByTestId('throttle').fill('1');
    for(let i=0;i<4;i++){await advance(.12);await capture('flap-'+i+'.png');}
    report.diagnostics.final=await page.evaluate(()=>flightLab.getDiagnostics());
  }
  report.diagnostics.runtime={browser:browser.version(),viewport:[1280,900],clock:'virtual clock; trusted production step loop for long sequences',fps_scored:false};
}catch(e){report.infrastructure_error=String(e);}
finally{await browser?.close();await fs.writeFile(path.join(output,'browser-results.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({source:report.source.map(x=>({id:x.id,pass:x.pass})),physics:report.physics.map(x=>({id:x.id,pass:x.pass})),interaction:report.interaction.map(x=>({id:x.id,pass:x.pass})),error:report.infrastructure_error}));
