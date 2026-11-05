import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {sourceProbe} from './source-probes.mjs';
import {wheelRotationAxis} from './wheel-axis.mjs';
import {capturePoweredPitch,pitchHuntingVerdict} from './pitch-stability.mjs';
const [base,output,target,version='mechanical-v6-source-first',revision]=process.argv.slice(2);
if(!['mechanical-v6-source-first','mechanical-v7-source-first'].includes(version))throw Error('Unknown calibration task version');
if(revision&&(!['v7-launch-60-65-70-v1','v7-launch-60-65-70-bank-v2'].includes(revision)||version!=='mechanical-v7-source-first'))throw Error('Unknown grading revision');
const bankPolicy=revision==='v7-launch-60-65-70-bank-v2'?JSON.parse(await fs.readFile(new URL('./protocols/'+revision+'.json',import.meta.url))):null;
const E=JSON.parse(await fs.readFile(new URL('../candidate/'+(version==='mechanical-v7-source-first'?'mechanical-v7':'mechanical-v6')+'/engineering.json',import.meta.url)));
let browser;
try{
  browser=await chromium.launch({headless:true,chromiumSandbox:true});const context=await browser.newContext({serviceWorkers:'block'});
  await context.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
  const page=await context.newPage();await page.goto(base+'/__probe.html');
  let result;
  if(target==='stability'){
    try{const samples=await page.evaluate(capturePoweredPitch,{submission_url:base});const verdict=pitchHuntingVerdict(samples);verdict.detail.samples=samples;result={physics:[verdict]};}
    catch(error){result={physics:[{id:'powered_pitch_stability',pass:false,detail:{error:String(error)}}]};}
  }else result=target==='wheel'?await page.evaluate(wheelRotationAxis,{submission_url:base}):await page.evaluate(sourceProbe,{E,scenario:target,...(revision?{launchProfiles:[.6,.65,.7]}:{}),bankPolicy});
  await fs.writeFile(output,JSON.stringify(result,null,2)+'\n');
}finally{await browser?.close()}
