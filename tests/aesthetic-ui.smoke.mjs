import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

// This server creates only a temporary offline cohort. All ratings below are test data.
const fixture=spawn(process.env.PYTHON||'python3',['tests/serve_aesthetic_fixture.py'],{stdio:['ignore','pipe','inherit']});
let browser;
try {
  const ready=await new Promise((resolve,reject)=>{
    let output='';const timer=setTimeout(()=>reject(Error('Fixture server did not start')),10000);
    fixture.on('exit',code=>{clearTimeout(timer);reject(Error('Fixture exited '+code))});
    fixture.stdout.on('data',chunk=>{output+=chunk;const artifact=output.match(/Artifact workbench: (http:\/\/[^\s]+)/),review=output.match(/Human aesthetic review: (http:\/\/[^\s]+)/);if(artifact&&review){clearTimeout(timer);resolve({artifact:artifact[1],review:review[1]})}});
  });
  assert.notEqual(new URL(ready.artifact).origin,new URL(ready.review).origin);
  const immutable=['experiment.json','trials/offline-model-01/manifest.json','trials/offline-model-01/submission/index.html'];
  const archiveBefore=await Promise.all(immutable.map(async name=>(await fetch(ready.artifact+name)).text()));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1180,height:1120}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(ready.artifact);
  assert.equal(await page.getByRole('link',{name:/Rate aesthetic realism/}).getAttribute('href'),ready.review);
  await page.goto(ready.review);
  await page.getByRole('heading',{name:'Aesthetic realism'}).waitFor();
  assert.equal(await page.locator('input[name=score]').count(),5);
  assert.equal(await page.locator('input[name=score]:checked').count(),0);
  assert.match(await page.locator('#status').innerText(),/Not rated yet/);
  const fly=await page.locator('#fly').getAttribute('href');
  const simulator=await browser.newPage();await simulator.goto(fly);
  assert.match(await simulator.locator('h1').innerText(),/Offline UI fixture/);await simulator.close();
  await page.locator('input[name=score][value="4"]').check();
  await page.locator('#played').check();
  await page.locator('#notes').fill('Offline browser fixture only — not a real model rating.');
  await page.getByRole('button',{name:'Save my rating'}).click();
  await page.getByText('Saved 4 / 5. Previous ratings remain in the history.').waitFor();
  await page.reload();assert.match(await page.locator('#status').innerText(),/Saved: 4 \/ 5 · revision 1/);
  await page.locator('input[name=score][value="2"]').check();await page.locator('#played').check();
  await page.getByRole('button',{name:'Save my rating'}).click();
  await page.getByText('Saved 2 / 5. Previous ratings remain in the history.').waitFor();
  const snapshot=await (await page.request.get(ready.review+'api/reviews')).json();
  assert.deepEqual(snapshot.records.map(r=>r.score),[4,2]);
  assert.equal(snapshot.trials[0].latest.revision,2);
  const archiveAfter=await Promise.all(immutable.map(async name=>(await fetch(ready.artifact+name)).text()));
  assert.deepEqual(archiveAfter,archiveBefore);
  await page.getByText('Rating history',{exact:true}).click();
  assert.equal(await page.locator('#history p').count(),2);
  const out=path.resolve('runs/aesthetic-ui-smoke');await mkdir(out,{recursive:true});
  await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
  await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,fixture:'temporary offline cohort only',ratings_saved:[4,2],archive_mutations:0,page_errors:errors,screenshots:out}));
} finally {
  if(browser)await browser.close();
  if(fixture.exitCode===null){const ended=new Promise(resolve=>fixture.once('exit',resolve));fixture.kill('SIGTERM');await ended;}
}
