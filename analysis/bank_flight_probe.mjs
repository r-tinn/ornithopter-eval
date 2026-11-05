// Isolated browser diagnostic for submitted aircraft; no model code runs in Node.
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {sourceProbe} from '../grader/source-probes.mjs';
const [base,output,optionsFile]=process.argv.slice(2);
try{await fs.access(output);throw Error('Preserve prior diagnostic output');}catch(e){if(e.code!=='ENOENT')throw e;}
const E=JSON.parse(await fs.readFile(new URL('../candidate/mechanical-v7/engineering.json',import.meta.url)));
const options=JSON.parse(await fs.readFile(optionsFile));
const browser=await chromium.launch({headless:true,chromiumSandbox:true});
try{
  const context=await browser.newContext({serviceWorkers:'block'});
  await context.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
  const page=await context.newPage();await page.goto(base+'/__probe.html');
  const result=await page.evaluate(sourceProbe,{E,scenario:'power',...options});
  await fs.writeFile(output,JSON.stringify({kind:'Local diagnostic, not a model trial or revised official score',options,result},null,2)+'\n');
  const d=result.physics[0].detail;
  console.log(JSON.stringify({status:d.final_state?.status,time:d.final_state?.time,clearance:d.final_clearance_m,bank:d.bank_maneuver}));
}finally{await browser.close();}
