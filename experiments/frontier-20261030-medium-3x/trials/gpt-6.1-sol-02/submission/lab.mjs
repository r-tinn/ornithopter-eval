import {parameters as p, forces, step} from './physics.mjs';

const $ = id => document.getElementById(id);
const canvas = $('scene'), ctx = canvas.getContext('2d');
const environment = {wind:[0,0,0], rho:1.225};
const initial = () => ({position:[0,0.2,0],velocity:[0,0,0],pitch:0,roll:0,phase:0,time:0,status:'grounded'});
let state = initial(), controls = {throttle:0,pitch:0,bank:0,brake:0}, running = false;
let accumulator = 0, lastFrame = null;
const held = new Set();
window.flightLab = {
  getState: () => JSON.parse(JSON.stringify(state)),
  getControls: () => JSON.parse(JSON.stringify(controls))
};
function setRunning(value) {
  running = value;
  accumulator = 0;
  lastFrame = null;
  $('run-label').textContent = value ? 'SIMULATION RUNNING' : 'SIMULATION PAUSED';
  document.querySelector('.scene-status').classList.toggle('running', value);
  $('start').setAttribute('aria-pressed', String(value));
  $('pause').setAttribute('aria-pressed', String(!value));
}
function power(value) {
  controls.throttle = value;
  $('throttle').value = value;
  $('throttle').style.setProperty('--fill', `${value*100}%`);
  $('throttle-output').innerHTML = `${Math.round(value*100)}<span>%</span>`;
}
function clearKeys() {
  held.clear();
  controls.pitch = controls.bank = controls.brake = 0;
}
function load(approach) {
  setRunning(false);
  clearKeys();
  state = approach ? {...initial(),position:[0,2,0],velocity:[10,-1,0],status:'flying'} : initial();
  power(0);
  updateTelemetry();
  render();
}
$('start').onclick = () => setRunning(true);
$('pause').onclick = () => setRunning(false);
$('reset').onclick = () => load(false);
$('approach').onclick = () => load(true);
$('throttle').addEventListener('input', e => power(Number(e.target.value)));
function setKeys() {
  controls.pitch = Number(held.has('ArrowUp'))-Number(held.has('ArrowDown'));
  controls.bank = Number(held.has('ArrowRight'))-Number(held.has('ArrowLeft'));
  controls.brake = Number(held.has('Space'));
}
const keyCodes = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'];
window.addEventListener('keydown', e => {
  if (!keyCodes.includes(e.code)) return;
  e.preventDefault();
  held.add(e.code);
  setKeys();
});
window.addEventListener('keyup', e => {
  if (!keyCodes.includes(e.code)) return;
  e.preventDefault();
  held.delete(e.code);
  setKeys();
});
window.addEventListener('blur', clearKeys);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearKeys(); accumulator = 0; lastFrame = null; }
});
$('notes-toggle').onclick = () => {
  const open = $('notes').hidden;
  $('notes').hidden = !open;
  $('notes-toggle').setAttribute('aria-expanded', String(open));
};
function updateTelemetry() {
  const air = forces(state, controls, environment);
  $('speed').innerHTML = `${air.airspeed.toFixed(2)} <small>m/s</small>`;
  $('altitude').innerHTML = `${state.position[1].toFixed(2)} <small>m</small>`;
  $('time').innerHTML = `${state.time.toFixed(2)} <small>s</small>`;
  $('status').textContent = state.status.toUpperCase();
  $('status').classList.toggle('airborne', state.status === 'flying');
  $('status').classList.toggle('crash', state.status === 'crashed');
  $('pitch-value').textContent = `${(state.pitch*180/Math.PI).toFixed(1)}°`;
  $('bank-value').textContent = `${(state.roll*180/Math.PI).toFixed(1)}°`;
  $('speed-bar').style.width = `${Math.min(100,air.airspeed/20*100)}%`;
}

// A small dependency-free 3D renderer. All aircraft vertices are in metres.
// Every camera uses this same articulated mesh, transformed by actual attitude.
const add = (a,b) => a.map((x,i)=>x+b[i]);
const sub = (a,b) => a.map((x,i)=>x-b[i]);
const mul = (a,s) => a.map(x=>x*s);
const dot = (a,b) => a.reduce((n,x,i)=>n+x*b[i],0);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit = a => mul(a,1/(Math.hypot(...a)||1));
let cameraMode = 'orbit', azimuth = 0.85, elevation = 0.48, zoom = 1;
let width = 800, height = 423, camera;
function chooseView(mode) {
  cameraMode = mode; zoom = 1;
  for (const id of ['orbit','top','side','front']) $(id).classList.toggle('selected', id === mode);
  $('camera-label').textContent = mode === 'orbit' ? 'PERSPECTIVE' : `${mode.toUpperCase()} / ORTHOGRAPHIC`;
  $('view-hint').textContent = mode === 'orbit' ? 'FOLLOW CAMERA' : `${mode.toUpperCase()} INSPECTION`;
  render();
}
for (const mode of ['orbit','top','side','front']) $(mode).onclick = () => chooseView(mode);
let drag = null;
canvas.addEventListener('pointerdown', e => {
  drag = {x:e.clientX,y:e.clientY};
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (!drag) return;
  if (cameraMode !== 'orbit') chooseView('orbit');
  azimuth += (e.clientX-drag.x)*0.008;
  elevation = Math.max(-0.05, Math.min(1.48,elevation+(e.clientY-drag.y)*0.006));
  drag = {x:e.clientX,y:e.clientY};
  render();
});
canvas.addEventListener('pointerup', () => drag = null);
canvas.addEventListener('pointercancel', () => drag = null);
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  zoom = Math.max(0.65,Math.min(1.8,zoom*Math.exp(-e.deltaY*.001)));
  render();
}, {passive:false});
function resize() {
  const bounds = canvas.getBoundingClientRect();
  width = bounds.width; height = bounds.height;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  render();
}
new ResizeObserver(resize).observe(canvas);
function setupCamera() {
  const target = add(state.position,[0.06,0.05,0]);
  let offset, up = [0,1,0];
  if (cameraMode === 'top') {offset=[0,4,0];up=[1,0,0];}
  else if (cameraMode === 'side') offset=[0,0,4];
  else if (cameraMode === 'front') offset=[4,0,0];
  else offset=[3.8*Math.cos(elevation)*Math.cos(azimuth),3.8*Math.sin(elevation),3.8*Math.cos(elevation)*Math.sin(azimuth)];
  const position = add(target,offset), forward = unit(sub(target,position));
  const right = unit(cross(forward,up)), realUp = unit(cross(right,forward));
  camera = {position,forward,right,up:realUp,orthographic:cameraMode!=='orbit', scale:Math.min(width/3.0,height/1.95)*zoom, focal:Math.min(width*1.12,height*1.82)*zoom};
}
function project(v) {
  const d = sub(v,camera.position), depth = dot(d,camera.forward);
  const scale = camera.orthographic ? camera.scale : camera.focal/depth;
  return {x:width/2+dot(d,camera.right)*scale, y:height*0.51-dot(d,camera.up)*scale, depth, scale};
}
function world(v) {
  // Roll around body x, then pitch about z, then translate.
  const cr=Math.cos(state.roll),sr=Math.sin(state.roll),cp=Math.cos(state.pitch),sp=Math.sin(state.pitch);
  const y=v[1]*cr-v[2]*sr,z=v[1]*sr+v[2]*cr;
  return add([v[0]*cp-y*sp,v[0]*sp+y*cp,z],state.position);
}
let faces = [], strokes = [], dots = [];
function face(vertices,color,edge='#394943',lineWidth=0.65) {
  const verticesWorld = vertices.map(world);
  const normal = unit(cross(sub(verticesWorld[1],verticesWorld[0]),sub(verticesWorld[2],verticesWorld[0])));
  const lighting = 0.76+0.24*Math.abs(dot(normal,unit([0.2,1,0.5])));
  faces.push({vertices:verticesWorld,color,edge,lineWidth,lighting});
}
function line(vertices,color='#57685c',lineWidth=0.8) {strokes.push({vertices:vertices.map(world),color,lineWidth});}
function joint(v,r,color) { dots.push({v:world(v),r,color}); }
function tube(rings,color) {
  const n=12, vertices=rings.map(([x,y,ry,rz])=>Array.from({length:n},(_,i)=>[x,y+Math.cos(i*2*Math.PI/n)*ry,Math.sin(i*2*Math.PI/n)*rz]));
  for(let k=0;k<vertices.length-1;k++)for(let i=0;i<n;i++)face([vertices[k][i],vertices[k+1][i],vertices[k+1][(i+1)%n],vertices[k][(i+1)%n]],color,'#667367',0.4);
  face([...vertices[0]].reverse(),color);face(vertices.at(-1),color);
}
function mesh() {
  faces=[];strokes=[];dots=[];
  const shoulder=p.shoulder_span_m/2, wrist=p.wrist_span_m/2;
  const arm=wrist-shoulder, hand=(p.span_m-p.wrist_span_m)/2;
  const a=0.42*Math.sin(state.phase), b=0.36*Math.sin(state.phase-0.65);
  const chord=0.3048;
  for (const side of [-1,1]) {
    function wingPoint(x,s,isOuter=false) {
      if (!isOuter) return [x,0.035+s*Math.sin(a),side*(shoulder+s*Math.cos(a))];
      return [x,0.035+arm*Math.sin(a)+s*Math.sin(a+b),side*(shoulder+arm*Math.cos(a)+s*Math.cos(a+b))];
    }
    // Parallel-chord inboard panels; softly curved ellipse-like hand panels.
    for(let i=0;i<5;i++) {
      const s0=arm*i/5,s1=arm*(i+1)/5;
      const v=[wingPoint(.05+chord/2,s0),wingPoint(.05+chord/2,s1),wingPoint(.05-chord/2,s1),wingPoint(.05-chord/2,s0)];
      face(v,i===0?'#c9cbb6':'#ece9d7');
      line([wingPoint(.105,s0),wingPoint(.105,s1)],'#a7af92',1.2);
      line([wingPoint(-.08,s0),wingPoint(-.08,s1)],'#c0c2aa',0.7);
    }
    const steps=18;
    const outerEdges = t => {
      const center=.05-.11*t;
      const c=chord*Math.sqrt(Math.max(0,1-t*t));
      return [center+c/2,center-c/2];
    };
    for(let i=0;i<steps;i++) {
      const t0=i/steps,t1=(i+1)/steps;
      const [f0,r0]=outerEdges(t0),[f1,r1]=outerEdges(t1);
      const v=[wingPoint(f0,t0*hand,true),wingPoint(f1,t1*hand,true),wingPoint(r1,t1*hand,true),wingPoint(r0,t0*hand,true)];
      face(v,i>=14?'#d37b50':i>=11?'#d6c5a5':'#f1eddb','#8d937c',0.5);
      line([wingPoint(f0*.38+r0*.62,t0*hand,true),wingPoint(r0,t0*hand,true)],'#9caa8e',0.65);
    }
    line([wingPoint(.105,0),wingPoint(.105,arm),wingPoint(.105,0,true),wingPoint(-.055,hand,true)],'#8e9a79',1.7);
    joint(wingPoint(.05,0),.025,'#c47a4c');
    joint(wingPoint(.05,0,true),.023,'#d88653');
    line([wingPoint(.05,0,true),wingPoint(-.06,.08,true)],'#b2603d',2);
  }
  // Tapered body with a slender, forward-reaching swan neck.
  tube([[-.37,.015,.025,.035],[-.23,.01,.075,.083],[-.06,.025,.10,p.body_width_m/2],[.13,.04,.083,.075],[.25,.045,.04,.038],[.55,.055,.026,.025],[.79,.065,.023,.022],[.84,.075,.033,.029],[p.overall_length_m-.5,.068,.008,.008]],'#e9e5d3');
  line([[.26,.077,0],[.57,.085,0],[.79,.095,0]],'#baa887',1);
  // Dark equipment saddle and contrasting nose/beak.
  face([[-.13,.125,-.045],[.065,.125,-.045],[.10,.119,.045],[-.13,.125,.045]],'#354d46','#273b35');
  line([[-.11,.129,0],[.07,.129,0]],'#d48750',2);
  tube([[.85,.076,.022,.023],[.897,.068,.004,.006]],'#d18651');
  joint([.826,.09,.026],.006,'#1b3334');
  joint([.826,.09,-.026],.006,'#1b3334');
  // Tail behind wing roots. Both sides of the stabilizer and a raised fin.
  for(const s of [-1,1]) {
    face([[-.24,.025,0],[-.36,.035,s*.25],[-.5,.025,s*.18],[-.46,.022,0]],'#b9c6ad','#637863');
    face([[-.39,.032,s*.231],[-.5,.025,s*.18],[-.46,.022,0],[-.40,.028,0]],'#d17c4e','#7d795d');
    line([[-.40,.034,0],[-.39,.037,s*.231]],'#63745f',0.8);
  }
  face([[-.245,.04,0],[-.37,.32,0],[-.43,.32,0],[-.50,.035,0]],'#d19a6d','#8c7050',0.8);
  face([[-.43,.32,.001],[-.50,.035,.001],[-.455,.035,.001],[-.395,.28,.001]],'#d76e44','#9e6544',0.6);
  line([[-.405,.28,.003],[-.465,.038,.003]],'#755d45',1);
  // Small mechanical keel (not wheels) reinforces the model's three dimensions.
  face([[-.17,-.055,-.02],[.15,-.03,-.02],[.08,-.11,-.02],[-.12,-.11,-.02]],'#718573');
}
function path(points) {
  ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
  for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);
}
function worldLine(a,b,color,lw=1) {
  const aa=project(a),bb=project(b);
  if(aa.depth<.12||bb.depth<.12)return;
  ctx.strokeStyle=color;ctx.lineWidth=lw;
  path([aa,bb]);ctx.stroke();
}
function groundPolygon(v,color) {
  const points=v.map(project);
  if(points.some(v=>v.depth<.15))return;
  path(points);ctx.closePath();ctx.fillStyle=color;ctx.fill();
}
function drawGround() {
  // Real world-space runway and metric grid slide underneath the moving model.
  const x0=Math.floor(state.position[0]/5)*5,z0=Math.floor(state.position[2]/5)*5;
  groundPolygon([[x0-20,0,-1.9],[x0+30,0,-1.9],[x0+30,0,1.9],[x0-20,0,1.9]],'#3a514d');
  for(let i=-20;i<=30;i++)worldLine([x0+i,0,z0-20],[x0+i,0,z0+20],i%5===0?'#53645a77':'#53645a33',i%5===0?.9:.55);
  for(let i=-20;i<=20;i++)worldLine([x0-20,0,z0+i],[x0+30,0,z0+i],i%5===0?'#53645a77':'#53645a33',i%5===0?.9:.55);
  worldLine([x0-20,.001,-1.85],[x0+30,.001,-1.85],'#a3a88b88',1);
  worldLine([x0-20,.001,1.85],[x0+30,.001,1.85],'#a3a88b88',1);
  for(let i=-10;i<15;i++){
    const x=x0+i*2;
    worldLine([x,.002,0],[x+.8,.002,0],'#b4b39699',2);
    worldLine([x,.002,-1.85],[x,.002,-1.7],'#a3a88b66',1);
    worldLine([x,.002,1.85],[x,.002,1.7],'#a3a88b66',1);
  }
  // A translucent planform shadow on the actual y=0 ground plane.
  const shadowOpacity=Math.max(.045,.19-state.position[1]*.012);
  for(const shape of faces) {
    if(shape.vertices.length<3)continue;
    const shadow=shape.vertices.map(v=>[v[0]-.2*v[1],.004,v[2]+.16*v[1]]);
    groundPolygon(shadow,`rgba(13,27,26,${shadowOpacity})`);
  }
}
function shade(hex, lighting) {
  const rgb=[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*lighting));
  return `rgb(${rgb.join(',')})`;
}
function render() {
  if(!ctx)return;
  setupCamera();
  const bg=ctx.createLinearGradient(0,0,0,height);
  bg.addColorStop(0,'#253c3f');bg.addColorStop(.65,'#354c49');bg.addColorStop(1,'#40554c');
  ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);
  mesh();
  drawGround();
  // Faces, structural lines and hinge caps share one depth-sorted render queue.
  const queue=[];
  for(const f of faces) {
    const ps=f.vertices.map(project);
    if(ps.some(v=>v.depth<.1))continue;
    queue.push({type:'face',data:f,ps,depth:ps.reduce((s,v)=>s+v.depth,0)/ps.length});
  }
  for(const s of strokes) {
    const ps=s.vertices.map(project);
    if(ps.some(v=>v.depth<.1))continue;
    queue.push({type:'line',data:s,ps,depth:ps.reduce((n,v)=>n+v.depth,0)/ps.length-.002});
  }
  for(const d of dots) {const point=project(d.v);queue.push({type:'dot',data:d,ps:[point],depth:point.depth-.025});}
  queue.sort((a,b)=>b.depth-a.depth);
  ctx.lineJoin='round';ctx.lineCap='round';
  for(const q of queue) {
    const d=q.data;
    if(q.type==='dot') {
      if(q.ps[0].depth<.1)continue;
      ctx.beginPath();ctx.arc(q.ps[0].x,q.ps[0].y,Math.max(1,d.r*q.ps[0].scale),0,2*Math.PI);
      ctx.fillStyle=d.color;ctx.fill();ctx.strokeStyle='#57664d';ctx.lineWidth=.7;ctx.stroke();
    } else {
      path(q.ps);
      if(q.type==='face'){
        ctx.closePath();ctx.fillStyle=shade(d.color,d.lighting);ctx.fill();
        ctx.strokeStyle=d.edge;ctx.lineWidth=d.lineWidth;ctx.stroke();
      }else{ctx.strokeStyle=d.color;ctx.lineWidth=d.lineWidth;ctx.stroke();}
    }
  }
  drawCompass();
}
function drawCompass() {
  const origin={x:width-44,y:height-52};
  const start=project(state.position);
  for(const [v,label,color] of [[[.22,0,0],'X','#c29568'],[[0,.22,0],'Y','#b6c9a5'],[[0,0,.22],'Z','#91b6b2']]) {
    const endpoint=project(add(state.position,v));
    const dx=endpoint.x-start.x,dy=endpoint.y-start.y;
    if(Math.hypot(dx,dy)<4)continue;
    ctx.strokeStyle=color;ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(origin.x,origin.y);ctx.lineTo(origin.x+dx*.65,origin.y+dy*.65);ctx.stroke();
    ctx.fillStyle=color;ctx.font='8px Arial';ctx.fillText(label,origin.x+dx*.82-3,origin.y+dy*.82+3);
  }
}
function frame(now) {
  if(lastFrame===null)lastFrame=now;
  const elapsed=Math.min(.1,(now-lastFrame)/1000);lastFrame=now;
  if(running && !document.hidden) {
    accumulator+=elapsed;
    while(accumulator>=1/120) {
      state=step(state,controls,environment,1/120);
      accumulator-=1/120;
    }
    updateTelemetry();
  }
  render();
  requestAnimationFrame(frame);
}
power(0);setRunning(false);updateTelemetry();resize();requestAnimationFrame(frame);
