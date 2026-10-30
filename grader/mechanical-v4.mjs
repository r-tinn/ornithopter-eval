// Provisional binary v4 smoke grader. No feedback is returned to generators.
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
const [base,output]=process.argv.slice(2);
const report={source:[],physics:[],interaction:[],diagnostics:{errors:[],external_requests:[]},evidence:{screenshots:[]}};
let browser;
const check=(group,id,pass,detail)=>report[group].push({id,pass:pass===true,detail});
try {
  browser=await chromium.launch({headless:true,chromiumSandbox:true});
  const context=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1,serviceWorkers:'block'});
  context.setDefaultTimeout(3500);
  await context.route('**/*',route=>{
    if(route.request().url().startsWith(base+'/'))return route.continue();
    report.diagnostics.external_requests.push(route.request().url());return route.abort();
  });
  const probe=await context.newPage();
  await probe.goto(base+'/__probe.html');
  const numeric=await probe.evaluate(async()=>{
    const out={source:[],physics:[]};
    const scalar=(value,name)=>{if(typeof value!=='number'||!Number.isFinite(value))throw Error(name+' must be a finite scalar; got '+(Array.isArray(value)?'array':typeof value));return value;};
    const add=(group,id,fn)=>{try{const {pass,detail}=fn();out[group].push({id,pass:pass===true,detail});}catch(e){out[group].push({id,pass:false,detail:{error:String(e)}});}};
    try {
      const m=await import('./physics.mjs'),p=m.parameters;
      const AR=7.4**2/6.61,S=9/AR;
      const near=(a,b,t=.005)=>typeof a==='number'&&Number.isFinite(a)&&Math.abs(a-b)<=Math.abs(b)*t;
      add('source','aspect_ratio_from_study',()=>({pass:near(p.aspect_ratio,AR),detail:{actual:p.aspect_ratio,expected:AR,relative_tolerance:.005}}));
      add('source','wrist_fraction_from_study',()=>({pass:near(p.wrist_span_fraction,.5),detail:{actual:p.wrist_span_fraction,expected:.5,relative_tolerance:.005}}));
      add('source','mechanical_area_consistent',()=>({pass:near(p.span_m,3)&&near(p.wing_area_m2,S),detail:{span:p.span_m,area:p.wing_area_m2,expected_span:3,expected_area:S}}));
      const env={wind:[0,0,0],rho:1.225,surfaceHeight:()=>0};
      const state=()=>({position:[0,1000,0],velocity:[10,0,0],pitch:0,roll:0,heading:0,phase:.37,time:0,status:'flying'});
      const controls={throttle:0,pitch:0,bank:0,rudder:0,brake:0};
      add('physics','power_controls_thrust',()=>{
        const off=scalar(m.forces(state(),controls,env).thrust,'thrust'),on=scalar(m.forces(state(),{...controls,throttle:1},env).thrust,'thrust');
        return {pass:Math.abs(off)<1e-9&&on>0,detail:{off,on}};
      });
      add('physics','lift_scales_with_speed_squared',()=>{
        const slow=scalar(m.forces(state(),controls,env).lift,'lift'),fast=scalar(m.forces({...state(),velocity:[20,0,0]},controls,env).lift,'lift');
        return {pass:slow>0&&Math.abs(fast/slow-4)<4e-6,detail:{slow,fast,ratio:fast/slow}};
      });
      add('physics','matching_wind_removes_lift',()=>{
        const still=scalar(m.forces(state(),controls,env).lift,'lift'),matching=scalar(m.forces(state(),controls,{...env,wind:[10,0,0]}).lift,'lift');
        return {pass:still>0&&Math.abs(matching)<1e-9,detail:{still,matching}};
      });
      add('physics','powered_phase_frequency',()=>{
        let s=state();const samples=[];
        for(let i=1;i<=44;i++){
          s=m.step(s,{...controls,throttle:1},env,1/120);
          if([12,25,44].includes(i)){
            const actual=scalar(s.phase,'phase'),expected=(.37+4*Math.PI*i/120)%(2*Math.PI),error=Math.abs(Math.atan2(Math.sin(actual-expected),Math.cos(actual-expected)));
            samples.push({step:i,actual,expected,error});
          }
        }
        return {pass:samples.every(s=>s.error<1e-6),detail:samples};
      });
      add('physics','unpowered_phase_stops',()=>{
        let s=state();for(let i=0;i<44;i++)s=m.step(s,controls,env,1/120);
        const actual=scalar(s.phase,'phase');return {pass:Math.abs(actual-.37)<1e-6,detail:{initial:.37,actual}};
      });
      add('physics','steady_glide_ratio',()=>{
        const CL=.6,CD=.035+CL**2/(Math.PI*.8*AR),gamma=Math.atan(CD/CL),V=Math.sqrt(2*6*9.80665*Math.cos(gamma)/(1.225*S*CL));
        let s={...state(),pitch:-gamma,velocity:[V*Math.cos(gamma),-V*Math.sin(gamma),0]};const start=structuredClone(s);
        for(let i=0;i<240;i++)s=m.step(s,controls,env,1/120);
        const distance=Math.hypot(s.position[0]-start.position[0],s.position[2]-start.position[2]),lost=start.position[1]-s.position[1];
        const actual=scalar(distance/lost,'glide ratio'),expected=CL/CD;
        return {pass:lost>0&&Math.abs(actual/expected-1)<.01,detail:{distance,height_lost:lost,actual,expected,relative_tolerance:.01,initial:start,final:s}};
      });
    } catch(e) {out.error=String(e);}
    return out;
  });
  report.source=numeric.source;report.physics=numeric.physics;
  if(numeric.error)report.diagnostics.physics_import_error=numeric.error;
  await probe.close();
  const page=await context.newPage();
  page.on('pageerror',e=>report.diagnostics.errors.push(String(e)));
  await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});
  await page.goto(base+'/index.html');
  await page.waitForFunction(()=>window.flightLab,{timeout:3500}).catch(e=>{report.diagnostics.initialization_error=String(e);});
  await page.clock.pauseAt(new Date('2026-01-02T00:00:00Z'));await page.clock.runFor(50);
  const state=()=>page.evaluate(()=>flightLab.getState());
  const diag=()=>page.evaluate(()=>flightLab.getDiagnostics());
  const geometry=()=>page.evaluate(()=>flightLab.getGeometryDiagnostics());
  const capture=async(name)=>{try{await page.screenshot({path:path.join(output,name),timeout:3500});report.evidence.screenshots.push(name);}catch(e){report.diagnostics.errors.push(name+': '+String(e));}};
  await capture('initial.png');
  const attempt=async(id,fn)=>{try{const v=await fn();check('interaction',id,v.pass,v.detail);}catch(e){check('interaction',id,false,{error:String(e)});}};
  const ready=await diag().catch(()=>null);report.diagnostics.initial=ready;
  if(ready?.ready){
    await attempt('aircraft_geometry_bounded',async()=>{const g=await geometry();return {pass:g.triangles>0&&g.triangles<=12000,detail:g};});
    const advance=ms=>page.clock.runFor(ms);
    const approach=async(field='Valley')=>{
      await page.getByRole('button',{name:field,exact:true}).click();await page.getByTestId('approach').click();await advance(34);
    };
    const controlTrial=async(key,ms)=>{
      await approach();if(key)await page.keyboard.down(key);await page.getByTestId('start').click();await advance(ms);
      if(key)await page.keyboard.up(key);const s=await state();await page.getByTestId('pause').click();await advance(34);return s;
    };
    await attempt('pitch_input_changes_pitch',async()=>{
      const neutral=await controlTrial(null,400),pressed=await controlTrial('ArrowUp',400);
      return {pass:Number.isFinite(pressed.pitch)&&pressed.pitch-neutral.pitch>.1,detail:{neutral,pressed,delta:pressed.pitch-neutral.pitch}};
    });
    await attempt('rudder_changes_heading',async()=>{
      const neutral=await controlTrial(null,1000),pressed=await controlTrial('KeyD',1000),delta=Math.atan2(Math.sin(pressed.heading-neutral.heading),Math.cos(pressed.heading-neutral.heading));
      return {pass:Number.isFinite(delta)&&delta>.02,detail:{neutral,pressed,delta}};
    });
    const takeoffs=[],landings=[],contacts=[];
    for(const field of ['Valley','Meadow']){
      try{
        await page.getByRole('button',{name:field,exact:true}).click();await advance(34);
        await page.getByTestId('throttle').fill('1');await page.getByTestId('start').click();
        await advance(2000);await page.keyboard.down('ArrowUp');await advance(300);await page.keyboard.up('ArrowUp');await advance(3700);
        const samples=[];
        for(let i=0;i<5;i++){
          if(i)await advance(250);samples.push({at_seconds:6+i*.25,state:await state(),geometry:await geometry(),diagnostics:await diag()});
        }
        takeoffs.push({field,pass:samples.every(v=>v.diagnostics.ready&&v.state.status==='flying'&&v.geometry.wheel_clearances.length===3&&v.geometry.wheel_clearances.every(x=>Number.isFinite(x)&&x>.7)),samples});
        await page.getByTestId('pause').click();await advance(34);await capture('flight-'+field.toLowerCase()+'.png');
      }catch(e){takeoffs.push({field,pass:false,error:String(e)});}
      try{
        await approach(field);await page.getByTestId('start').click();
        const samples=[];let crashed=false;
        for(let i=1;i<=60;i++){
          await advance(100);const s=await state(),g=await geometry(),d=await diag();
          if(s.status==='crashed')crashed=true;
          samples.push({at_seconds:i/10,state:s,geometry:g,ready:d.ready});
        }
        const final=samples.at(-1),clear=final.geometry.wheel_clearances;
        const touches=clear.length===3&&clear.every(x=>Number.isFinite(x)&&x>=-.01&&x<=.02);
        landings.push({field,pass:final.ready&&!crashed&&final.state.status==='landed'&&Math.abs(final.state.velocity[1])<1e-6&&touches,final,crashed});
        contacts.push({field,pass:samples.every(v=>v.ready&&v.geometry.wheel_clearances.length===3&&v.geometry.wheel_clearances.every(x=>Number.isFinite(x)&&x>=-.01))&&touches,samples});
        await page.getByTestId('pause').click();await advance(34);await capture('landing-'+field.toLowerCase()+'.png');
      }catch(e){landings.push({field,pass:false,error:String(e)});contacts.push({field,pass:false,error:String(e)});}
    }
    check('interaction','takeoff_from_strip',takeoffs.length===2&&takeoffs.every(t=>t.pass),takeoffs);
    check('interaction','landing_on_strip',landings.length===2&&landings.every(t=>t.pass),landings);
    check('interaction','wheels_above_surface',contacts.length===2&&contacts.every(t=>t.pass),contacts);
    try{
    await page.getByRole('button',{name:'Valley',exact:true}).click();await page.getByTestId('reset').click();await advance(34);
    for(const [view,name] of [['Inspect','inspection-orbit.png'],['Top','inspection-top.png'],['Side','inspection-side.png'],['Front','inspection-front.png']]){
      await page.getByRole('button',{name:view,exact:true}).click();await advance(34);await capture(name);
    }
    await page.getByTestId('throttle').fill('1');await advance(34);await capture('flap-0.png');await page.getByTestId('start').click();
    for(let i=1;i<=3;i++){await advance(125);await capture('flap-'+i+'.png');}
    await page.getByTestId('pause').click();await advance(34);
    report.diagnostics.final=await diag();
    }catch(e){report.diagnostics.visual_capture_error=String(e);}
  }else report.diagnostics.aircraft_unavailable=true;
  report.diagnostics.runtime={browser:browser.version(),viewport:[1280,900],clock:'Playwright virtual clock',fps_scored:false,wheel_sampling_seconds:.1};
}catch(e){report.infrastructure_error=String(e);}
finally{await browser?.close();await fs.writeFile(path.join(output,'browser-results.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({source:report.source.map(c=>({id:c.id,pass:c.pass})),physics:report.physics.map(c=>({id:c.id,pass:c.pass})),interaction:report.interaction.map(c=>({id:c.id,pass:c.pass})),infrastructure_error:report.infrastructure_error}));
