import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import {sourceProbe} from './source-probes.mjs';
import {wheelRotationAxis} from './wheel-axis.mjs';
const [base,output]=process.argv.slice(2),E=JSON.parse(await fs.readFile(new URL('../candidate/mechanical-v6/engineering.json',import.meta.url))),report={source:[],physics:[],interaction:[],diagnostics:{errors:[]},evidence:{screenshots:[]}};
let browser;
try{
  browser=await chromium.launch({headless:true,chromiumSandbox:true});
  const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});context.setDefaultTimeout(5000);
  await context.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
  const probe=await context.newPage();await probe.goto(base+'/__probe.html');
  const numeric=await probe.evaluate(sourceProbe,{E});report.physics=numeric.physics;report.diagnostics.numeric=numeric.diagnostics;
  report.interaction.push(await probe.evaluate(wheelRotationAxis,{submission_url:base}));await probe.close();
  const page=await context.newPage();page.on('pageerror',error=>report.diagnostics.errors.push(String(error)));
  await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});await page.goto(base+'/index.html');
  await page.waitForFunction(()=>window.flightLab).catch(error=>report.diagnostics.initialization=String(error));
  await page.clock.pauseAt(new Date('2026-01-02T00:00:00Z'));await page.clock.runFor(50);
  report.diagnostics.initial=await page.evaluate(()=>window.flightLab?.getDiagnostics()??{ready:false});
  const capture=async name=>{await page.screenshot({path:path.join(output,name)});report.evidence.screenshots.push(name)};
  if(report.diagnostics.initial.ready){
    await capture('initial.png');
    for(const [view,name] of [['Inspect','inspection-orbit.png'],['Top','inspection-top.png'],['Side','inspection-side.png'],['Front','inspection-front.png'],['Pilot','inspection-pilot.png']]){await page.getByRole('button',{name:view,exact:true}).click();await page.clock.runFor(34);await capture(name)}
    await page.getByTestId('throttle').fill('1');
    for(let i=0;i<4;i++){await page.evaluate(()=>flightLab.advanceForReview(.12));await page.clock.runFor(34);await capture('flap-'+i+'.png')}
    await page.getByRole('button',{name:'Chase',exact:true}).click();
    await page.evaluate(()=>flightLab.advanceForReview(25));await page.clock.runFor(34);await capture('flight.png');
    report.diagnostics.simulator_after_25s=await page.evaluate(()=>({state:flightLab.getState(),geometry:flightLab.getGeometryDiagnostics()}));
  }else{
    const wing=report.physics.find(x=>x.id==='wing_cycle_force_coupling');if(wing){wing.pass=false;wing.detail.production_render_error=report.diagnostics.initial;}
    await capture('initialization-failure.png');
  }
  report.diagnostics.runtime={browser:browser.version(),viewport:[1280,900],fps_scored:false};
}catch(error){report.infrastructure_error=String(error)}
finally{await browser?.close();await fs.writeFile(path.join(output,'browser-results.json'),JSON.stringify(report,null,2)+'\n')}
console.log(JSON.stringify({checks:[...report.physics,...report.interaction].map(({id,pass})=>({id,pass})),error:report.infrastructure_error}));
