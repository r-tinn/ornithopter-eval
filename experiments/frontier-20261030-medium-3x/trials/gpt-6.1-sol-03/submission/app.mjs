import {parameters, constants, forces, step} from './physics.mjs';

const $ = id => document.getElementById(id);
const canvas = $('scene'), ctx = canvas.getContext('2d');
const environment = {wind: [0,0,0], rho: constants.rho};
let state, running = false, accumulator = 0, lastTime = null;
const controls = {throttle:0, pitch:0, bank:0, brake:0};
const keys = new Set();
const fixedDt = 1/120;
let view = 'orbit', yaw = .82, elevation = .43, distance = 3.8, orthoZoom = 1;
let width = 800, height = 460, ratio = 1;
let drag = null;
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm = v => {const n=Math.hypot(...v);return v.map(x=>x/n);};
const sub = (a,b) => a.map((v,i)=>v-b[i]);
const add = (a,b) => a.map((v,i)=>v+b[i]);
const scale = (a,s) => a.map(v=>v*s);
const copy = x => JSON.parse(JSON.stringify(x));

window.flightLab = {
  getState: () => copy(state),
  getControls: () => copy(controls)
};

function clearKeys() {
  keys.clear();
  controls.pitch=0; controls.bank=0; controls.brake=0;
}
function updateKeys() {
  controls.pitch=(keys.has('ArrowUp')?1:0)-(keys.has('ArrowDown')?1:0);
  controls.bank=(keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0);
  controls.brake=keys.has('Space')?1:0;
}
function load(approach=false) {
  running=false; accumulator=0; lastTime=null;
  state={position:[0,approach?2:.2,0],velocity:approach?[10,-1,0]:[0,0,0],
    pitch:0,roll:0,phase:0,time:0,status:approach?'flying':'grounded'};
  clearKeys(); controls.throttle=0; $('throttle').value='0';
  updateUI(); render();
}
function updateUI() {
  const f=forces(state,controls,environment);
  $('speed').innerHTML=`${f.airspeed.toFixed(2)} <small>m/s</small>`;
  $('altitude').innerHTML=`${state.position[1].toFixed(2)} <small>m</small>`;
  $('sim-time').innerHTML=`${state.time.toFixed(2)} <small>s</small>`;
  $('flight-status').textContent=state.status[0].toUpperCase()+state.status.slice(1);
  $('flight-status').style.color=state.status==='crashed'?'#ef9e88':state.status==='flying'?'#91c6b9':'#cbd9bd';
  $('throttle-value').textContent=`${Math.round(controls.throttle*100)}%`;
  $('power-value').textContent=`${Math.round(400*controls.throttle)} W`;
  $('pitch-readout').textContent=`${(state.pitch*180/Math.PI).toFixed(1)}°`;
  $('bank-readout').textContent=`${(state.roll*180/Math.PI).toFixed(1)}°`;
  $('brake-readout').textContent=controls.brake?'ON':'OFF';
  $('run-label').textContent=running?'RUNNING':'PAUSED';
  $('run-label').parentElement.classList.toggle('running',running);
  $('start').setAttribute('aria-pressed',String(running));
  $('pause').setAttribute('aria-pressed',String(!running));
}
$('start').onclick=()=>{running=true;lastTime=null;updateUI();};
$('pause').onclick=()=>{running=false;accumulator=0;updateUI();};
$('reset').onclick=()=>load(false);
$('approach').onclick=()=>load(true);
$('throttle').oninput=e=>{controls.throttle=Number(e.target.value);updateUI();render();};
window.addEventListener('keydown',e=>{
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)){
    e.preventDefault();keys.add(e.code);updateKeys();updateUI();
  }
});
window.addEventListener('keyup',e=>{
  if(keys.has(e.code)){e.preventDefault();keys.delete(e.code);updateKeys();updateUI();}
});
window.addEventListener('blur',()=>{clearKeys();updateUI();});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){clearKeys();lastTime=null;accumulator=0;}
});

function setView(name) {
  view=name;orthoZoom=1;
  for(const v of ['orbit','top','side','front']){
    const b=$('view-'+v);b.classList.toggle('selected',v===view);b.setAttribute('aria-pressed',String(v===view));
  }
  render();
}
for(const name of ['orbit','top','side','front']) $('view-'+name).onclick=()=>setView(name);
canvas.addEventListener('pointerdown',e=>{
  drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);
  canvas.style.cursor='grabbing';
});
canvas.addEventListener('pointermove',e=>{
  if(!drag)return;
  if(view!=='orbit'){
    if(view==='top'){elevation=1.3;yaw=0;}
    if(view==='side'){elevation=.05;yaw=0;}
    if(view==='front'){elevation=.05;yaw=Math.PI/2;}
    setView('orbit');
  }
  yaw-=(e.clientX-drag.x)*.008;
  elevation=clamp(elevation+(e.clientY-drag.y)*.007,-.12,1.49);
  drag={x:e.clientX,y:e.clientY};render();
});
const release=()=>{drag=null;canvas.style.cursor='grab';};
canvas.addEventListener('pointerup',release);
canvas.addEventListener('pointercancel',release);
canvas.addEventListener('wheel',e=>{
  e.preventDefault();
  if(view==='orbit')distance=clamp(distance*Math.exp(e.deltaY*.001),2.5,9);
  else orthoZoom=clamp(orthoZoom*Math.exp(-e.deltaY*.001),.65,1.25);
  render();
},{passive:false});
canvas.style.cursor='grab';

// The same model mesh is used by every inspection view.
// Angles below are display-only assumptions, not a source-derived stroke law.
function buildModel() {
  const surfaces=[], lines=[], points=[];
  function face(vertices,color,edge='#5e6256',unlit=false){surfaces.push({vertices,color,edge,unlit});}
  function line(vertices,color='#6b7770',lineWidth=1){lines.push({vertices,color,lineWidth});}
  const p=state.phase;
  const armAngle=.28*Math.sin(p);
  const handAngle=.48*Math.sin(p-.65);
  const root=parameters.shoulder_span_m/2, wrist=parameters.wrist_span_m/2, tip=parameters.span_m/2;
  function wingPoint(x,r,side,y=0) {
    const arm=Math.min(r,wrist)-root;
    const hand=Math.max(0,r-wrist);
    const radial=root+arm*Math.cos(armAngle)+hand*Math.cos(armAngle+handAngle);
    return [x,y+arm*Math.sin(armAngle)+hand*Math.sin(armAngle+handAngle),side*radial];
  }
  for(const side of [-1,1]){
    const wp=(x,r,y=0)=>wingPoint(x,r,side,y);
    // Near-parallel-chord arm, visibly separated from the hand by a wrist spar.
    const stations=6;
    for(let i=0;i<stations;i++){
      const a=root+(wrist-root)*i/stations,b=root+(wrist-root)*(i+1)/stations;
      face([wp(.148,a),wp(.148,b),wp(.06,b),wp(.06,a)],'#c4a174');
      face([wp(.06,a),wp(.06,b),wp(-.157,b),wp(-.157,a)],'#e5e2cf');
      line([wp(-.14,a,.004),wp(.13,a,.004)],'#9d9c83',.7);
    }
    line([wp(.109,root,.008),wp(.109,wrist,.008)],'#e7c38d',2.6);
    // Hand envelope tapers elliptically with a small aft sweep.
    function edges(t) {
      const chord=.305*Math.sqrt(Math.max(.0004,1-t*t));
      const center=-.005-.1*t;
      return [center+chord*.5,center-chord*.5];
    }
    const n=16;
    for(let i=0;i<n;i++){
      const t=i/n,u=(i+1)/n;
      const a=wrist+(tip-wrist)*t,b=wrist+(tip-wrist)*u;
      const [la,ta]=edges(t),[lb,tb]=edges(u);
      const ma=la-(la-ta)*.28,mb=lb-(lb-tb)*.28;
      face([wp(la,a),wp(lb,b),wp(mb,b),wp(ma,a)],i%2?'#caaa7d':'#c3a073');
      face([wp(ma,a),wp(mb,b),wp(tb,b),wp(ta,a)],i%2?'#eee9d7':'#dddcc8');
      // Individual feather/panel seam at the aft portion of each strip.
      line([wp(ma,a,.004),wp(ta-.014,a,.004)],'#929b8c',.7);
      if(i>9)face([wp(ta+.021,a,.003),wp(tb+.018,b,.003),wp(tb,b,.003),wp(ta,a,.003)],'#a5aa98');
    }
    line([wp(.128,wrist,.008),wp(-.148,wrist,.008)],'#576f6c',2.3);
    points.push({position:wp(.018,wrist,.015),color:'#e6bd7d',radius:.027});
    points.push({position:wp(.018,root,.01),color:'#a4c6b2',radius:.025});
    line([wp(.018,root,.022),wp(.018,wrist,.022),wp(-.09,tip,.022)],'#617d73',1.25);
  }
  // Faceted ellipsoidal fuselage, retaining maximum source body width.
  function tube(rings,sides,colors) {
    const pts=rings.map(([x,y,ry,rz])=>Array.from({length:sides},(_,i)=>{
      const a=2*Math.PI*i/sides;return [x,y+ry*Math.cos(a),rz*Math.sin(a)];
    }));
    for(let j=0;j<pts.length-1;j++)for(let i=0;i<sides;i++){
      face([pts[j][i],pts[j+1][i],pts[j+1][(i+1)%sides],pts[j][(i+1)%sides]],colors[i%colors.length],'#777e70');
    }
    face(pts[0],colors[0]);face(pts[pts.length-1],colors[0]);
  }
  tube([[-.41,.015,.025,.025],[-.27,.025,.093,.073],[-.08,.035,.125,parameters.body_width_m/2],
    [.12,.035,.105,.09],[.265,.055,.055,.048]],12,['#dddccc','#eeebd9','#d4d6c5','#b8c5b7']);
  // Long tapered forward neck and small head; entire length is 1.397 m.
  tube([[.22,.06,.055,.047],[.37,.085,.037,.033],[.54,.105,.026,.026],
    [.72,.13,.029,.027],[.79,.14,.043,.034],[.825,.13,.028,.026]],10,['#e1e0cc','#f1eddb','#c8d0bf']);
  face([[.816,.154,-.024],[.86,.132,0],[.816,.154,.024],[.816,.114,.024],[.86,.123,0],[.816,.114,-.024]],'#c69a62','#856c4d');
  for(const side of [-1,1])points.push({position:[.793,.15,side*.032],color:'#203d3a',radius:.009});
  // Horizontal tail: a distinct surface aft of the wing roots.
  face([[-.32,.035,0],[-.47,.025,-.235],[-.537,.025,-.18],[-.51,.025,0],
    [-.537,.025,.18],[-.47,.025,.235]],'#d5d9c4','#8c9b86');
  for(const side of [-1,1])line([[-.345,.039,0],[-.51,.029,side*.18]],'#9fae99',1);
  // Raised conventional fin; rudder seam remains visible from the side.
  const fin=[[-.295,.07,0],[-.397,.332,0],[-.493,.295,0],[-.523,.035,0]];
  face(fin,'#c9a576','#7e8168');
  line([[-.462,.306,.003],[-.481,.057,.003]],'#6c7e6c',1.4);
  line([[-.41,.055,0],[-.25,.145,0],[.12,.145,0]],'#5b8077',1.4);
  // Small underbody keel / contact skid. Not a wheel or extra contact solver.
  face([[-.20,-.08,-.028],[.1,-.08,-.028],[.08,-.18,-.018],[-.13,-.18,-.018]],'#65796c');
  face([[-.20,-.08,.028],[.1,-.08,.028],[.08,-.18,.018],[-.13,-.18,.018]],'#65796c');
  return {surfaces,lines,points};
}

function worldPoint(v) {
  const c=Math.cos(state.roll),s=Math.sin(state.roll),cp=Math.cos(state.pitch),sp=Math.sin(state.pitch);
  const y=v[1]*c-v[2]*s,z=v[1]*s+v[2]*c;
  return [state.position[0]+v[0]*cp-y*sp,state.position[1]+v[0]*sp+y*cp,state.position[2]+z];
}
function camera() {
  const target=add(state.position,[0,.035,0]);
  let offset,up=[0,1,0];
  if(view==='top'){offset=[0,5,0];up=[1,0,0];}
  else if(view==='side')offset=[0,0,5];
  else if(view==='front')offset=[5,0,0];
  else offset=[distance*Math.sin(yaw)*Math.cos(elevation),distance*Math.sin(elevation),distance*Math.cos(yaw)*Math.cos(elevation)];
  const eye=add(target,offset),forward=norm(scale(offset,-1)),right=norm(cross(forward,up));
  up=cross(right,forward);
  return {eye,forward,right,up};
}
let cam;
function cameraSpace(v) {
  const d=sub(v,cam.eye);return [dot(d,cam.right),dot(d,cam.up),dot(d,cam.forward)];
}
function projectCamera(v) {
  if(view==='orbit'){
    if(v[2]<.08)return null;
    const f=height*1.5/v[2];
    return [width/2+v[0]*f,height*.52-v[1]*f,v[2]];
  }
  const s=Math.min(width/2.95,height/1.9)*orthoZoom;
  return [width/2+v[0]*s,height*.52-v[1]*s,v[2]];
}
function project(v){return projectCamera(cameraSpace(v));}
function polygon(vertices,fill,stroke=null,lineWidth=.7) {
  const p=vertices.map(project);
  if(p.some(v=>!v))return;
  ctx.beginPath();p.forEach((v,i)=>i?ctx.lineTo(v[0],v[1]):ctx.moveTo(v[0],v[1]));ctx.closePath();
  if(fill){ctx.fillStyle=fill;ctx.fill();}
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.stroke();}
}
function worldLine(vertices,color,lineWidth=1) {
  ctx.strokeStyle=color;ctx.lineWidth=lineWidth;
  for(let i=1;i<vertices.length;i++){
    let a=cameraSpace(vertices[i-1]),b=cameraSpace(vertices[i]);
    if(view==='orbit'){
      if(a[2]<.08&&b[2]<.08)continue;
      if(a[2]<.08){const t=(.08-a[2])/(b[2]-a[2]);a=a.map((v,k)=>v+(b[k]-v)*t);}
      if(b[2]<.08){const t=(.08-b[2])/(a[2]-b[2]);b=b.map((v,k)=>v+(a[k]-v)*t);}
    }
    a=projectCamera(a);b=projectCamera(b);
    if(!a||!b)continue;
    ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();
  }
}
function shade(hex,normal) {
  const l=norm([-.3,1,.6]),light=.79+.21*Math.abs(dot(normal,l));
  const n=parseInt(hex.slice(1),16);
  return `rgb(${Math.round((n>>16)*light)},${Math.round(((n>>8)&255)*light)},${Math.round((n&255)*light)})`;
}
function drawGround(model) {
  const cx=Math.floor(state.position[0]/2)*2,cz=Math.floor(state.position[2]/2)*2;
  // Runway tiles and grid are world geometry, not a screen-aligned backdrop.
  for(let i=-18;i<25;i++){
    const x=cx+i*2;
    polygon([[x,0,-1.35],[x+2,0,-1.35],[x+2,0,1.35],[x,0,1.35]],'#294246');
    if(Math.floor(x/2)%2===0)polygon([[x,.002,-.018],[x+.7,.002,-.018],[x+.7,.002,.018],[x,.002,.018]],'#6a7c72');
  }
  for(let i=-18;i<=22;i++){
    const x=cx+i*2,z=cz+i*2;
    worldLine([[x,.001,cz-36],[x,.001,cz+44]],'#658a7d24',.7);
    worldLine([[cx-36,.001,z],[cx+44,.001,z]],'#658a7d24',.7);
  }
  worldLine([[cx-36,.003,-1.35],[cx+48,.003,-1.35]],'#88978666',1);
  worldLine([[cx-36,.003,1.35],[cx+48,.003,1.35]],'#88978666',1);
  // Soft, flattened silhouette provides a height cue without adding flight forces.
  ctx.save();ctx.globalAlpha=Math.max(.025,.16/(1+Math.max(0,state.position[1]-.2)*.3));
  for(const f of model.surfaces){
    const points=f.vertices.map(worldPoint).map(v=>[v[0]+v[1]*.28,.006,v[2]+v[1]*.12]);
    polygon(points,'#071a1d');
  }
  ctx.restore();
}
function render() {
  if(!state)return;
  ctx.setTransform(ratio,0,0,ratio,0,0);
  const gradient=ctx.createLinearGradient(0,0,0,height);
  gradient.addColorStop(0,'#192d35');gradient.addColorStop(1,'#2e4948');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);
  cam=camera();
  const model=buildModel();
  drawGround(model);
  const items=model.surfaces.map(f=>{
    const vertices=f.vertices.map(worldPoint);
    const normal=norm(cross(sub(vertices[1],vertices[0]),sub(vertices[2],vertices[0])));
    return {...f,vertices,depth:vertices.reduce((s,v)=>s+cameraSpace(v)[2],0)/vertices.length,
      fill:shade(f.color,normal)};
  });
  items.sort((a,b)=>b.depth-a.depth);
  for(const f of items)polygon(f.vertices,f.fill,f.edge,.6);
  // Fine structural seams and exposed wrist/shoulder markers.
  for(const l of model.lines)worldLine(l.vertices.map(worldPoint),l.color,l.lineWidth);
  for(const p of model.points){
    const q=project(worldPoint(p.position));if(!q)continue;
    const s=view==='orbit'?height*1.5/q[2]:Math.min(width/2.95,height/1.9)*orthoZoom;
    ctx.beginPath();ctx.arc(q[0],q[1],Math.max(1.2,p.radius*s),0,Math.PI*2);
    ctx.fillStyle=p.color;ctx.fill();ctx.strokeStyle='#455e52';ctx.lineWidth=.7;ctx.stroke();
  }
  // A subtle vignette keeps attention on the airframe.
  const vg=ctx.createRadialGradient(width/2,height*.48,height*.2,width/2,height*.48,width*.7);
  vg.addColorStop(0,'#061b2200');vg.addColorStop(1,'#061b2244');
  ctx.fillStyle=vg;ctx.fillRect(0,0,width,height);
}
function resize() {
  const r=canvas.getBoundingClientRect();
  width=r.width;height=r.height;ratio=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
  render();
}
new ResizeObserver(resize).observe(canvas);
function frame(now) {
  if(lastTime===null)lastTime=now;
  const elapsed=Math.min(.1,Math.max(0,(now-lastTime)/1000));lastTime=now;
  if(running){
    accumulator+=elapsed;
    while(accumulator>=fixedDt){
      state=step(state,controls,environment,fixedDt);
      accumulator-=fixedDt;
      if(state.status==='crashed'){running=false;accumulator=0;break;}
    }
    updateUI();
  }
  render();
  requestAnimationFrame(frame);
}
load(false);
resize();
requestAnimationFrame(frame);
