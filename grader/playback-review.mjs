// Regression of shared camera playback, never a new grade of the saved aircraft.
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
const [base,output]=process.argv.slice(2);
await fs.mkdir(output,{recursive:true});
const report={kind:'interactive-camera-regression',model_trial:false,passed:false,checks:[],screenshots:[],errors:[],fps_claimed:false};
const check=(id,pass,detail)=>{report.checks.push({id,pass:pass===true,detail});if(!pass)throw Error(id);};
let browser;
try{
  browser=await chromium.launch({headless:true,chromiumSandbox:true});
  const context=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1,serviceWorkers:'block'});
  await context.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
  for(const id of ['gpt-5.6-sol-01','gpt-6.1-sol-01']){
    const page=await context.newPage();page.on('pageerror',e=>report.errors.push(id+': '+String(e)));
    await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});
    await page.goto(base+'/trials/'+id+'/submission/index.html');
    await page.waitForFunction(()=>window.flightLab?.getDiagnostics().ready);
    await page.clock.pauseAt(new Date('2026-01-02T00:00:00Z'));await page.clock.runFor(50);
    check(id+'_labelled_camera_update',(await page.locator('#fixture-note').innerText()).includes('Updated camera playback'));
    await page.getByTestId('throttle').fill('1');await page.getByTestId('start').click();
    await page.clock.runFor(2000);await page.keyboard.down('ArrowUp');await page.clock.runFor(300);await page.keyboard.up('ArrowUp');
    await page.clock.runFor(4700);
    const samples=[];
    for(let i=0;i<90;i++){
      if(i)await page.clock.runFor(16);
      samples.push(await page.evaluate(()=>({view:flightLab.getViewDiagnostics(),state:flightLab.getState(),diagnostics:flightLab.getDiagnostics()})));
    }
    const errors=samples.map(({view:v})=>{
      const [x,y,z]=v.render_position,dx=v.camera[0]-x,dz=v.camera[2]-z,c=Math.cos(v.render_heading),s=Math.sin(v.render_heading);
      return {side:Math.abs(-dx*s+dz*c),distance:Math.abs(dx*c+dz*s+7.8),centre:Math.abs(v.aircraft_screen[0]),pose:Math.hypot(...v.aircraft_position.map((n,i)=>n-v.render_position[i]))};
    });
    const maxima=Object.fromEntries(['side','distance','centre','pose'].map(k=>[k,Math.max(...errors.map(e=>e[k]))]));
    check(id+'_centred_stable_flight',Object.values(maxima).every(n=>Number.isFinite(n)&&n<1e-8)&&samples.every(s=>s.diagnostics.ready&&s.state.status==='flying'),{max_errors:maxima,samples});
    await page.getByTestId('pause').click();await page.clock.runFor(34);
    const name=id+'-chase.png';await page.screenshot({path:path.join(output,name),fullPage:true});report.screenshots.push(name);
    const before=await page.evaluate(()=>flightLab.getDiagnostics().render_frames);await page.clock.runFor(500);
    check(id+'_pause_stops_drawing',(await page.evaluate(()=>flightLab.getDiagnostics().render_frames))===before);
    await page.getByTestId('start').click();await page.keyboard.down('KeyD');await page.clock.runFor(750);await page.keyboard.up('KeyD');
    const turn=await page.evaluate(()=>flightLab.getViewDiagnostics()),[x,,z]=turn.render_position,dx=turn.camera[0]-x,dz=turn.camera[2]-z;
    check(id+'_behind_after_turn',Math.abs(turn.render_heading)>.02&&Math.abs(-dx*Math.sin(turn.render_heading)+dz*Math.cos(turn.render_heading))<1e-8,turn);
    await page.getByTestId('pause').click();await page.clock.runFor(34);await page.close();
  }
  check('no_page_errors',report.errors.length===0,report.errors);
  report.browser=browser.version();report.passed=true;
}catch(e){report.failure=String(e);}
finally{await browser?.close();await fs.writeFile(path.join(output,'camera-review.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({passed:report.passed,checks:report.checks.map(c=>({id:c.id,pass:c.pass})),failure:report.failure}));
process.exitCode=report.passed?0:1;
