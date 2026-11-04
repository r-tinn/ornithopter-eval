import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import {wheelRotationAxis} from './wheel-axis.mjs';
const [base,output,input]=process.argv.slice(2),items=JSON.parse(await fs.readFile(input,'utf8'));
const report={kind:'post-hoc-wheel-axis-audit',check_id:'wheel_rotation_axis',rubric_version:'mechanical-v4.1',original_grades_changed:false,results:[]};
let browser;
try{
  browser=await chromium.launch({headless:true,chromiumSandbox:true});
  const context=await browser.newContext({serviceWorkers:'block'});
  await context.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());
  const page=await context.newPage();await page.goto(base+'/__probe.html');
  for(const item of items){
    const result=await page.evaluate(wheelRotationAxis,{submission_url:base+'/'+item.submission});
    report.results.push({...item,...result});
  }
}catch(e){report.infrastructure_error=String(e);process.exitCode=1;}
finally{await browser?.close();await fs.writeFile(path.join(output,'wheel-axis.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({results:report.results.map(r=>({trial:r.trial,pass:r.pass,max_misalignment_deg:r.detail.max_misalignment_deg,error:r.detail.error})),infrastructure_error:report.infrastructure_error}));
