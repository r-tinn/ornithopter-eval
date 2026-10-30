// Trusted scaffold/fixture regression. This does not assign any model a v4 score.
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
const [base,output]=process.argv.slice(2);
const report={kind:'shared-world-and-withheld-fixture-review',model_trial:false,passed:false,checks:[],errors:[],external_requests:[],screenshots:[]};
const check=(id,pass,detail)=>{report.checks.push({id,pass:pass===true,detail});if(!pass)throw Error(id);};
let browser;
try{
  browser=await chromium.launch({headless:true,chromiumSandbox:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1,serviceWorkers:'block'});
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(String(e)));
  page.on('request',r=>{if(!r.url().startsWith(base+'/'))report.external_requests.push(r.url());});
  await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});
  await page.goto(base+'/index.html');await page.waitForFunction(()=>window.flightLab?.getDiagnostics().ready);
  await page.clock.pauseAt(new Date('2026-01-02T00:00:00Z'));await page.clock.runFor(50);
  const state=()=>page.evaluate(()=>flightLab.getState());
  const diagnostics=()=>page.evaluate(()=>flightLab.getDiagnostics());
  const geometry=()=>page.evaluate(()=>flightLab.getGeometryDiagnostics());
  const initial=await diagnostics();
  check('small_fixed_world',initial.terrain_triangles===8192&&initial.trees===48&&initial.airfields===2,initial);
  const mesh=await geometry();
  check('fixture_geometry_bounded',mesh.triangles>0&&mesh.triangles<=12000,mesh);
  check('actual_wheels_rest_on_strip',mesh.wheel_clearances.length===3&&mesh.wheel_clearances.every(x=>Math.abs(x)<.01),mesh);
  const frame=initial.render_frames;await page.clock.runFor(500);
  check('paused_scene_stops_drawing',(await diagnostics()).render_frames===frame,{before:frame,after:(await diagnostics()).render_frames});
  for(const [view,file] of [['Chase','preview-chase.png'],['World','preview-world.png'],['Inspect','preview-inspect.png']]){
    await page.getByRole('button',{name:view,exact:true}).click();await page.clock.runFor(34);
    await page.screenshot({path:path.join(output,file),fullPage:true});report.screenshots.push(file);
  }
  await page.getByRole('button',{name:'Chase',exact:true}).click();
  for(const field of ['Valley','Meadow']){
    await page.getByRole('button',{name:field,exact:true}).click();await page.clock.runFor(34);
    const rest=await state();
    await page.getByTestId('throttle').fill('1');await page.getByTestId('start').click();
    await page.clock.runFor(2000);await page.keyboard.down('ArrowUp');await page.clock.runFor(300);await page.keyboard.up('ArrowUp');
    await page.clock.runFor(4700);
    const airborne=await state(),meshAir=await geometry();
    check(field+'_fixture_takeoff',airborne.status==='flying'&&meshAir.wheel_clearances.every(x=>x>.7),{rest,airborne,geometry:meshAir});
    await page.getByTestId('pause').click();await page.clock.runFor(34);
    if(field==='Valley'){
      const file='preview-flight.png';await page.screenshot({path:path.join(output,file),fullPage:true});report.screenshots.push(file);
    }
    const paused=await state();await page.clock.runFor(500);
    check(field+'_pause_preserves_state',JSON.stringify(paused)===JSON.stringify(await state()),paused);
    await page.getByTestId('approach').click();await page.getByTestId('start').click();await page.clock.runFor(6000);
    const landed=await state(),meshLand=await geometry();
    check(field+'_fixture_landing',landed.status==='landed'&&Math.abs(landed.velocity[1])<1e-6&&meshLand.wheel_clearances.every(x=>x>=-.01&&x<.02),{landed,geometry:meshLand});
    await page.getByTestId('pause').click();await page.clock.runFor(34);
  }
  check('no_external_assets',report.external_requests.length===0,report.external_requests);
  check('no_page_errors',report.errors.length===0,report.errors);
  report.runtime={browser:browser.version(),viewport:[1440,1000],clock:'Playwright virtual clock',fps_scored:false};
  report.passed=true;
}catch(error){report.failure=String(error);}
finally{await browser?.close();await fs.writeFile(path.join(output,'world-review.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({passed:report.passed,checks:report.checks.map(c=>({id:c.id,pass:c.pass})),failure:report.failure}));
process.exitCode=report.passed?0:1;
