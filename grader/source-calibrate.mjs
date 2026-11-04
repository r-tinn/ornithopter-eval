import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {sourceProbe} from './source-probes.mjs';
import {wheelRotationAxis} from './wheel-axis.mjs';
const [base,output,target]=process.argv.slice(2),E=JSON.parse(await fs.readFile(new URL('../candidate/mechanical-v6/engineering.json',import.meta.url)));
let browser;
try{
  browser=await chromium.launch({headless:true,chromiumSandbox:true});const context=await browser.newContext({serviceWorkers:'block'});
  await context.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
  const page=await context.newPage();await page.goto(base+'/__probe.html');
  const result=target==='wheel'?await page.evaluate(wheelRotationAxis,{submission_url:base}):await page.evaluate(sourceProbe,{E,scenario:target});
  await fs.writeFile(output,JSON.stringify(result,null,2)+'\n');
}finally{await browser?.close()}
