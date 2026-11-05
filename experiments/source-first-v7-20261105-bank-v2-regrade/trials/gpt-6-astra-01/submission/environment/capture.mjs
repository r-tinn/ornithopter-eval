// Optional presentation/export tools. No model physics or external services.
export const FILM={width:1920,height:1080,fps:30,bitrate:12_000_000};
export function recordingFormat(Recorder=globalThis.MediaRecorder){
  for(const mime of ['video/mp4;codecs=avc1.420028','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm']){
    if(Recorder?.isTypeSupported(mime))return {mime,extension:mime.startsWith('video/mp4')?'mp4':'webm'};
  }
  return null;
}
export function cinematicView(position,heading,span,seconds,eye,target){
  const sweep=Math.sin(Math.min(1,Math.max(0,seconds)/16)*Math.PI/2);
  const angle=2.85-.18*sweep,distance=span*1.85;
  const x=Math.cos(angle)*distance,z=Math.sin(angle)*distance,c=Math.cos(heading),s=Math.sin(heading);
  eye.set(position.x+c*x-s*z,position.y+span*.65,position.z+s*x+c*z);
  target.set(position.x+c*span*.16,position.y+span*.015,position.z+s*span*.16);
}

export function installCapture(host){
  const format=recordingFormat(),originalTitle=document.title;
  let studio=false,recording=false,preparing=false,recorder=null,stream=null,timer=null,ticker=null;
  let clipURL=null,stillURL=null,epoch=0,recordStarted=0,cancelPrepare=null,exitAfterStop=false;
  let previousView='chase',previousScroll=0,lastClip=null;
  const style=document.createElement('style');style.textContent=`
    .film-launch{position:absolute;right:18px;top:15px;z-index:2;background:#f6f4e6e8;border-color:#a6b6a0;box-shadow:0 2px 8px #203c3710;font-size:11px}
    .scene-caption{right:155px}
    .film-section{margin:20px 0;padding:14px 0;border-top:1px solid #d4d7c8;border-bottom:1px solid #d4d7c8}
    .film-section .film-actions{display:flex;gap:6px;flex-wrap:wrap}.film-section p{font-size:11px;line-height:1.5;color:#6d7e70;margin:7px 0 0}.film-section a{font-size:11px;color:#496049;display:inline-block;margin-top:8px}
    .film-studio{display:none;color:#e9e9db;font:13px/1.4 system-ui,sans-serif}.film-studio button,.film-studio select,.film-studio a{font:12px system-ui,sans-serif;border:1px solid #62756b;border-radius:5px;background:#253b34;color:#f1f1e5;padding:10px 14px;text-decoration:none}
    .film-studio button:hover,.film-studio a:hover{background:#3a5146}.film-studio button:disabled{opacity:.4}.film-studio select{padding:9px}
    .film-studio [data-film=record]{background:#c57c48;border-color:#c57c48;color:#fff}.film-studio [data-film=stop]{background:#9e493d;color:white}
    .film-heading,.film-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;max-width:1600px;margin:auto;padding:14px 24px;flex-wrap:wrap}
    .film-brand{font:23px Georgia,serif}.film-kicker{font-size:10px;letter-spacing:.16em;color:#a5b8a8;margin-bottom:4px}.film-toolbar{flex-wrap:wrap;padding-top:16px}.film-controls{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.film-status{color:#b7c8b9;font-size:12px;margin:0;max-width:440px}.film-status[role=alert]{color:#ffc9b8}
    .film-preview{display:flex;align-items:start;gap:18px;max-width:1000px;margin:0 auto;padding:16px 24px 28px}.film-preview video{width:min(400px,45vw);aspect-ratio:16/9;background:#0d1714;border:1px solid #56695d;border-radius:5px}.film-preview p{margin:4px 0 16px;color:#b7c8b9}.film-preview [hidden]{display:none}
    body.film-mode{background:#14251f;overflow-x:hidden}body.film-mode main{padding:0;max-width:none}body.film-mode header,body.film-mode .flight>aside,body.film-mode footer{display:none}
    body.film-mode .flight{display:block;height:auto;min-height:0;border:0;border-radius:0;background:none;overflow:visible}
    body.film-mode #viewport{width:min(calc(100vw - 48px),calc((100vh - 190px)*16/9));height:auto;min-height:0;aspect-ratio:16/9;margin:0 auto;box-shadow:0 15px 55px #0004;border-radius:5px;overflow:hidden}
    body.film-mode .scene-caption,body.film-mode #flight-status,body.film-mode .film-launch{display:none}body.film-mode .film-studio{display:block}body.film-mode [hidden]{display:none!important}
    @media(max-width:700px){.film-heading,.film-toolbar{padding:12px 16px}.film-brand{font-size:20px}body.film-mode #viewport{width:calc(100vw - 24px)}.film-preview{padding:12px;flex-wrap:wrap}.film-preview video{width:100%}.film-controls{gap:7px}.film-studio button,.film-studio select,.film-studio a{padding:9px 10px}}
  `;document.head.append(style);
  const section=document.createElement('section');section.className='film-section';section.setAttribute('aria-label','Capture a flight');
  section.innerHTML='<div class="eyebrow">CAPTURE A FLIGHT</div><div class="film-actions"><button data-film="flyby">Film a flyby</button><button data-film="current">Capture current view</button></div><p>A clean, widescreen clip for your blog. Video and PNG exports.</p><a href="/__captures/index.html" target="_blank" rel="noopener">Saved clips ↗</a>';
  const aside=document.querySelector('.flight>aside');aside.querySelector('.power').before(section);
  const launch=document.createElement('button');launch.className='film-launch';launch.textContent='Film a flyby';launch.setAttribute('aria-label','Open flight capture studio');host.viewport.append(launch);
  const header=document.createElement('div');header.className='film-studio';header.innerHTML='<div class="film-heading"><div><div class="film-kicker">THE AIRFIELD · CAPTURE STUDIO</div><div class="film-brand">From paper to flight.</div></div><div class="film-controls"><a href="/__captures/index.html" target="_blank" rel="noopener">Saved clips ↗</a><button data-film="exit">Back to simulator</button></div></div>';
  document.body.prepend(header);
  const panel=document.createElement('div');panel.className='film-studio';panel.innerHTML=`
    <div class="film-toolbar"><div class="film-controls">
      <button data-film="prepare">New airfield pass</button>
      <select data-film="camera" aria-label="Film camera"><option value="cinematic">Cinematic sweep</option><option value="chase">Chase</option><option value="side">Side profile</option><option value="orbit">Orbit / inspect</option><option value="pilot">Pilot</option><option value="top">Top</option><option value="front">Front</option><option value="world">World</option></select>
      <select data-film="duration" aria-label="Clip duration"><option value="8">8 seconds</option><option value="12">12 seconds</option></select>
      <button data-film="record">Record 8s clip</button><button data-film="stop" hidden>Stop recording</button><button data-film="still">Save PNG</button>
    </div><p class="film-status" data-film="status" role="status" aria-live="polite">1920 × 1080 · 30 fps · ${format?format.extension.toUpperCase()+' video':'PNG stills'}</p></div>
    <div class="film-preview" data-film="result" hidden><video data-film="preview" controls loop muted playsinline aria-label="Recorded flight preview"></video><div><div class="film-kicker">YOUR FLIGHT CLIP</div><p data-film="description"></p><a data-film="download">Save video</a><p>Only the flight scene is in the recording.</p></div></div>`;
  document.body.append(panel);
  const $=name=>panel.querySelector('[data-film='+name+']');
  const status=(message,error=false)=>{$('status').textContent=message;$('status').setAttribute('role',error?'alert':'status');};
  const fileName=extension=>{
    const trial=location.pathname.match(/\/trials\/([^/]+)\//)?.[1]??'ornithopter';
    return trial.replace(/[^a-z0-9_-]/gi,'-')+'-airfield-'+new Date().toISOString().replace(/[:.]/g,'-')+'.'+extension;
  };
  async function saveLocally(blob){
    const trial=location.pathname.match(/\/trials\/([^/]+)\//)?.[1]??'ornithopter';
    const response=await fetch('/__captures',{method:'POST',headers:{'Content-Type':blob.type,'X-Flight-Trial':trial},body:blob});
    if(!response.ok)throw Error('Local save unavailable');
    return response.json();
  }
  function buttons(){
    const busy=recording||preparing;
    for(const name of ['prepare','camera','duration','still'])$(name).disabled=busy;
    $('record').disabled=busy||!format||typeof host.canvas.captureStream!=='function';
    $('record').hidden=recording;$('stop').hidden=!recording;
    $('record').textContent='Record '+$('duration').value+'s clip';
  }
  function clearTimers(){clearTimeout(timer);clearInterval(ticker);timer=ticker=null;}
  function releaseStream(){stream?.getTracks().forEach(track=>track.stop());stream=null;}
  function stop(message){
    if(!recording)return;
    clearTimers();host.pause();if(message)status(message);
    if(recorder?.state!=='inactive')recorder.stop();
  }
  async function prepare(){
    if(recording||preparing)return;
    preparing=true;buttons();cancelPrepare=new AbortController();status('Preparing an airfield pass…');
    try{
      await host.prepare(cancelPrepare.signal);
      epoch=host.state().time;host.setView('cinematic');$('camera').value='cinematic';host.render();
      status('Ready. A slow camera sweep, powered flight, and the runway below.');
    }catch(error){if(error.name!=='AbortError')status('Could not prepare this aircraft: '+error.message,true);}
    finally{preparing=false;cancelPrepare=null;buttons();}
  }
  async function enter(airfield){
    if(!host.ready())return;
    if(!studio){previousView=host.view();previousScroll=scrollY;host.pause();studio=true;epoch=host.state().time;document.body.classList.add('film-mode');document.title='Capture studio · '+originalTitle;host.resize();scrollTo(0,0);}
    if(airfield)await prepare();
    else{
      const view=host.view();$('camera').value=view;host.setView(view);host.render();
      status('Your current flight and camera. Press record when ready.');buttons();
    }
  }
  function exit(){
    cancelPrepare?.abort();
    if(recording){exitAfterStop=true;stop();return;}
    studio=false;host.pause();document.body.classList.remove('film-mode');document.title=originalTitle;host.setView(previousView);host.resize();scrollTo(0,previousScroll);$('preview').pause();
  }
  function record(){
    if(!studio||preparing||recording||!format)return;
    if(host.state().status==='crashed'){status('This aircraft has crashed. Prepare a new airfield pass first.',true);return;}
    let failed=false,chunks=[],simulationStart=host.state().time;
    try{
      stream=host.canvas.captureStream(FILM.fps);
      recorder=new MediaRecorder(stream,{mimeType:format.mime,videoBitsPerSecond:FILM.bitrate});
      recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
      recorder.onerror=event=>{failed=true;status('Recording failed: '+(event.error?.message??'encoder error'),true);stop();};
      recorder.onstop=async()=>{
        clearTimers();releaseStream();recording=false;host.pause();buttons();
        if(!failed&&chunks.length){
          const blob=new Blob(chunks,{type:recorder.mimeType||format.mime});
          lastClip={requested_seconds:Number($('duration').value),wall_seconds:(performance.now()-recordStarted)/1000,
            simulation_seconds:host.state().time-simulationStart,mime:blob.type,bytes:blob.size};
          const currentClip=lastClip;
          if(clipURL)URL.revokeObjectURL(clipURL);clipURL=URL.createObjectURL(blob);
          $('preview').src=clipURL;$('download').href=clipURL;$('download').download=fileName(format.extension);$('download').textContent='Save '+format.extension.toUpperCase()+' video';$('download').hidden=true;
          $('description').textContent=`1080p · 30 fps · ${(blob.size/1_000_000).toFixed(1)} MB · Preview loops`;
          $('result').hidden=false;status('Clip ready. Saving it to your local clip library…');
          try{
            const saved=await saveLocally(blob);Object.assign(currentClip,{saved_path:saved.saved_path,saved_href:saved.href});
            if(currentClip===lastClip){$('download').href=saved.download_href;$('download').download=saved.filename;status('Saved locally. Preview below, or open Saved clips any time.');}
          }catch(error){if(currentClip===lastClip)status('Clip ready. Use Save video to download it in your browser.');}
          if(currentClip===lastClip)$('download').hidden=false;
        }else if(!failed)status('No frames were recorded. Keep this tab visible and try again.',true);
        if(exitAfterStop){exitAfterStop=false;exit();}
      };
      recording=true;recordStarted=performance.now();buttons();recorder.start(250);host.render();host.start();
      const duration=Number($('duration').value);
      const progress=()=>status(`Recording · ${Math.max(0,duration-(performance.now()-recordStarted)/1000).toFixed(1)}s remaining · keep this tab visible`);
      progress();ticker=setInterval(progress,100);timer=setTimeout(()=>stop(),duration*1000);
    }catch(error){failed=true;clearTimers();releaseStream();recording=false;host.pause();buttons();status('Could not record: '+error.message,true);}
  }
  async function still(){
    host.render();
    try{
      const blob=await new Promise((resolve,reject)=>host.canvas.toBlob(blob=>blob?resolve(blob):reject(Error('No image data')),'image/png'));
      const a=document.createElement('a');let local=false;
      try{const saved=await saveLocally(blob);a.href=saved.download_href;a.download=saved.filename;local=true;}
      catch(error){if(stillURL)URL.revokeObjectURL(stillURL);stillURL=URL.createObjectURL(blob);a.href=stillURL;a.download=fileName('png');}
      a.click();status(local?'PNG saved locally. Open Saved clips to find it.':'A clean 1920 × 1080 PNG is ready to download.');
    }catch(error){status('Could not save this frame: '+error.message,true);}
  }
  for(const button of [launch,section.querySelector('[data-film=flyby]')])button.onclick=()=>enter(true);
  section.querySelector('[data-film=current]').onclick=()=>enter(false);
  header.querySelector('[data-film=exit]').onclick=exit;
  $('prepare').onclick=prepare;$('record').onclick=record;$('stop').onclick=()=>stop();$('still').onclick=still;
  $('camera').onchange=()=>{epoch=host.state().time;host.setView($('camera').value);host.render();};$('duration').onchange=buttons;
  document.addEventListener('keydown',event=>{if(studio&&event.key==='Escape')exit();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&recording)stop('Recording stopped when this tab was hidden.');});
  window.addEventListener('blur',()=>{if(recording)stop('Recording stopped when the window lost focus.');});
  window.addEventListener('pagehide',()=>{clearTimers();releaseStream();if(clipURL)URL.revokeObjectURL(clipURL);if(stillURL)URL.revokeObjectURL(stillURL);});
  for(const button of [launch,...section.querySelectorAll('button')])button.disabled=!host.ready();
  buttons();
  return {get studio(){return studio;},get recording(){return recording;},get epoch(){return epoch;},
    diagnostics:()=>({studio,recording,preparing,format:format?.extension??null,width:FILM.width,height:FILM.height,target_fps:FILM.fps,last_clip:lastClip})};
}
