// Real-clock export verification against saved model submissions. No API calls.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const base=process.argv[2]??'http://127.0.0.1:8774',out=path.resolve(process.argv[3]??'runs/capture-studio-smoke');
await fs.mkdir(out,{recursive:true});
assert.equal((await fs.readdir(out)).length,0,'Use a fresh evidence directory; preserve earlier observations');
const report={kind:'Capture UI/media regression and illustrative viewer clips; not model trials or new grades',scenarios:[]};
const browser=await chromium.launch({headless:true,chromiumSandbox:true});
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,serviceWorkers:'block'});
  for(const [id,field] of [['gpt-6.1-sol-01','valley'],['gpt-5.6-sol-01','meadow']]){
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(`${base}/trials/${id}/submission/index.html`);
    await page.waitForFunction(()=>window.flightLab?.getDiagnostics().ready&&flightLab.getCaptureDiagnostics);
    await page.locator(`[data-field=${field}]`).click();
    await page.getByRole('button',{name:'Open flight capture studio',exact:true}).click();
    await page.waitForFunction(()=>flightLab.getCaptureDiagnostics().studio&&!flightLab.getCaptureDiagnostics().preparing);
    const before=await page.evaluate(()=>({capture:flightLab.getCaptureDiagnostics(),state:flightLab.getState(),view:flightLab.getViewDiagnostics(),width:document.querySelector('canvas').width,height:document.querySelector('canvas').height}));
    assert.equal(before.width,1920);assert.equal(before.height,1080);assert.equal(before.state.status,'flying');assert(before.state.time>=29.99);assert(before.capture.format);
    await page.screenshot({path:path.join(out,id+'-studio.png'),fullPage:true});
    await page.getByRole('button',{name:'Record 8s clip',exact:true}).click();
    await page.waitForFunction(()=>!flightLab.getCaptureDiagnostics().recording,{},{timeout:20000});
    const video=page.locator('[data-film=preview]');
    await video.waitFor({state:'visible'});
    await page.waitForFunction(()=>document.querySelector('[data-film=preview]').readyState>=2);
    const metadata=await video.evaluate(v=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight,mime:v.currentSrc}));
    assert.equal(metadata.width,1920);assert.equal(metadata.height,1080);assert(metadata.duration>7&&metadata.duration<10,JSON.stringify(metadata));
    const frames=await video.evaluate(async v=>{
      const c=document.createElement('canvas');c.width=320;c.height=180;const ctx=c.getContext('2d',{willReadFrequently:true}),frames=[];
      for(const t of [.4,v.duration-.4]){
        await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Video seek timed out')),5000);v.addEventListener('seeked',()=>{clearTimeout(timer);resolve()},{once:true});v.currentTime=t;});
        ctx.drawImage(v,0,0,c.width,c.height);const pixels=ctx.getImageData(0,0,c.width,c.height).data;let sum=0,square=0;const rgb=[];
        for(let i=0;i<pixels.length;i+=4){const y=(pixels[i]+pixels[i+1]+pixels[i+2])/3;sum+=y;square+=y*y;rgb.push(pixels[i],pixels[i+1],pixels[i+2]);}
        const n=pixels.length/4;frames.push({time:t,mean:sum/n,deviation:Math.sqrt(square/n-(sum/n)**2),rgb});
      }
      let changed=0;for(let i=0;i<frames[0].rgb.length;i+=3)if(Math.abs(frames[0].rgb[i]-frames[1].rgb[i])+Math.abs(frames[0].rgb[i+1]-frames[1].rgb[i+1])+Math.abs(frames[0].rgb[i+2]-frames[1].rgb[i+2])>20)changed++;
      return {samples:frames.map(({time,mean,deviation})=>({time,mean,deviation})),changed_fraction:changed/(320*180)};
    });
    assert(frames.samples.every(f=>f.mean>30&&f.deviation>10),'Decoded frames must contain a scene, not blank video');assert(frames.changed_fraction>.01,'Video must contain motion');
    const clip=page.waitForEvent('download');await page.getByRole('link',{name:/Save (MP4|WEBM) video/}).click();const download=await clip;
    const extension=before.capture.format,clipName=id+'-airfield.'+extension;await download.saveAs(path.join(out,clipName));
    const still=page.waitForEvent('download');await page.getByRole('button',{name:'Save PNG',exact:true}).click();const png=await still;await png.saveAs(path.join(out,id+'-still.png'));
    const bytes=await fs.readFile(path.join(out,id+'-still.png'));assert.equal(bytes.readUInt32BE(16),1920);assert.equal(bytes.readUInt32BE(20),1080);
    const after=await page.evaluate(()=>({state:flightLab.getState(),view:flightLab.getViewDiagnostics(),capture:flightLab.getCaptureDiagnostics()}));
    assert(after.state.time-before.state.time>1,'Recording must advance the actual simulator');assert.equal(after.state.status,'flying');
    assert(after.capture.last_clip.saved_href?.startsWith('/__captures/'),'The clip must persist beyond its blob URL');
    const stored=await(await page.request.get(base+'/__captures/index.json')).json();
    assert(stored.some(item=>after.capture.last_clip.saved_href.endsWith(item.filename)&&item.trial===id));
    await page.screenshot({path:path.join(out,id+'-result.png'),fullPage:true});
    await page.getByRole('button',{name:'Back to simulator',exact:true}).click();
    await page.waitForFunction(()=>!flightLab.getCaptureDiagnostics().studio);
    await page.getByRole('button',{name:'Side',exact:true}).click();
    const manualBefore=await page.evaluate(()=>flightLab.getState());
    await page.getByRole('button',{name:'Capture current view',exact:true}).click();
    const manualAfter=await page.evaluate(()=>({state:flightLab.getState(),mode:flightLab.getDiagnostics().mode}));
    assert.deepEqual(manualBefore,manualAfter.state);assert.equal(manualAfter.mode,'side');
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    const aspect=await page.locator('#viewport').evaluate(e=>e.clientWidth/e.clientHeight);assert(Math.abs(aspect-16/9)<.02);
    await page.screenshot({path:path.join(out,id+'-mobile.png'),fullPage:true});
    if(id==='gpt-6.1-sol-01'){
      await page.setViewportSize({width:1440,height:1000});
      await page.getByLabel('Clip duration',{exact:true}).selectOption('12');
      const previousPreview=await video.evaluate(v=>v.currentSrc);
      await page.getByRole('button',{name:'Record 12s clip',exact:true}).click();
      await page.waitForTimeout(2200);
      await page.getByRole('button',{name:'Stop recording',exact:true}).click();
      await page.waitForFunction(()=>!flightLab.getCaptureDiagnostics().recording&&flightLab.getCaptureDiagnostics().last_clip.requested_seconds===12);
      await page.waitForFunction(previous=>{const v=document.querySelector('[data-film=preview]');return v.currentSrc!==previous&&v.readyState>=2;},previousPreview);
      const shortDuration=await video.evaluate(v=>v.duration);assert(shortDuration>1&&shortDuration<5);
      const short=page.waitForEvent('download');await page.getByRole('link',{name:/Save (MP4|WEBM) video/}).click();await(await short).saveAs(path.join(out,id+'-manual-short.'+extension));
    }
    assert.deepEqual(errors,[]);
    report.scenarios.push({id,field,clip:clipName,metadata:{...metadata,mime:extension},frames,initial_simulation_time:before.state.time,final_simulation_time:after.state.time,capture:after.capture,errors,passed:true});
    await page.close();
  }
  report.passed=true;
}catch(error){report.passed=false;report.error=String(error);throw error}
finally{await browser.close();await fs.writeFile(path.join(out,'review.json'),JSON.stringify(report,null,2)+'\n')}
console.log(JSON.stringify({passed:true,clips:report.scenarios.map(s=>({model:s.id,path:s.clip,duration:s.metadata.duration,size:[s.metadata.width,s.metadata.height],changed_fraction:s.frames.changed_fraction}))}));
