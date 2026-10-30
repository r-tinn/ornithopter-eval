import {parameters as p, step, forces} from './physics.mjs';
const $=id=>document.querySelector(`[data-testid="${id}"]`);
const canvas=$('scene'), ctx=canvas.getContext('2d'), throttle=$('throttle');
let state, paused=true, keys=new Set(), accumulator=0, last=0, yaw=-0.9, elevation=0.5, view='orbit';
let controls={throttle:0,pitch:0,bank:0,brake:0};
const env={wind:[0,0,0],rho:1.225};
function preset(approach=false){
 state={position:[0,approach?2:0.2,0],velocity:approach?[10,-1,0]:[0,0,0],pitch:0,roll:0,phase:0,time:0,status:approach?'flying':'grounded'};
 controls={throttle:0,pitch:0,bank:0,brake:0};throttle.value='0';keys.clear();paused=true;accumulator=0;draw();
}
$('start').onclick=()=>{paused=false;draw();};$('pause').onclick=()=>{paused=true;accumulator=0;draw();};
$('reset').onclick=()=>preset();$('approach').onclick=()=>preset(true);
for(const name of ['top','side','front'])$('view-'+name).onclick=()=>{view=name;draw();};
throttle.oninput=()=>{controls.throttle=Number(throttle.value);draw();};
window.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)){e.preventDefault();keys.add(e.code);}});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{keys.clear();paused=true;accumulator=0;});
document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();paused=true;accumulator=0;}});
let drag=null;canvas.onpointerdown=e=>{drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);};
canvas.onpointerup=()=>{drag=null;};canvas.onpointermove=e=>{if(drag){view='orbit';yaw+=(e.clientX-drag[0])*0.009;elevation=Math.max(0.1,Math.min(1.2,elevation+(e.clientY-drag[1])*0.006));drag=[e.clientX,e.clientY];draw();}};
window.flightLab={getState:()=>structuredClone(state),getControls:()=>({...controls})};
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const normalize=a=>{const l=Math.hypot(...a);return a.map(v=>v/l);};
function draw(){
 const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(devicePixelRatio,2);
 if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#142a38';ctx.fillRect(0,0,w,h);
 const eye=view==='top'?[0,state.position[1]+4,0]:view==='side'?[0,state.position[1],4]:view==='front'?[4,state.position[1],0]:
  [5*Math.cos(elevation)*Math.cos(yaw),state.position[1]+5*Math.sin(elevation),5*Math.cos(elevation)*Math.sin(yaw)];
 const forward=normalize([0,state.position[1],0].map((v,i)=>v-eye[i])),right=normalize(cross(forward,view==='top'?[1,0,0]:[0,1,0])),up=cross(right,forward);
 document.querySelector('.caption').textContent={top:'TOP VIEW / NOSE UP',side:'SIDE VIEW / NOSE RIGHT',front:'FRONT VIEW'}[view]??'PERSPECTIVE VIEW / TWO-PART WING';
 const project=a=>{const r=a.map((v,i)=>v-eye[i]),z=dot(r,forward);return z<0.1?null:[w/2+dot(r,right)*h/z,h/2-dot(r,up)*h/z];};
 function line(points,color,width=1,fill=null){const q=points.map(project);if(q.some(v=>!v))return;ctx.beginPath();q.forEach((v,i)=>i?ctx.lineTo(...v):ctx.moveTo(...v));if(fill){ctx.closePath();ctx.fillStyle=fill;ctx.fill();}ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
 const ox=state.position[0]%2,oz=state.position[2]%2;
 for(let i=-8;i<=8;i++){line([[-8,0,i-oz],[8,0,i-oz]],'#29404b');line([[i-ox,0,-8],[i-ox,0,8]],'#29404b');}
 line([[-8,0.01,-0.8],[8,0.01,-0.8]],'#698177',2);line([[-8,0.01,0.8],[8,0.01,0.8]],'#698177',2);
 for(let i=-8;i<=8;i+=2)line([[i-ox,0.015,0],[i+0.6-ox,0.015,0]],'#728783',2);
 const pitch=state.pitch,roll=state.roll;
 const transform=a=>{const [x,y,z]=a;const yy=y*Math.cos(roll)-z*Math.sin(roll),zz=y*Math.sin(roll)+z*Math.cos(roll);return [x*Math.cos(pitch)-yy*Math.sin(pitch),state.position[1]+x*Math.sin(pitch)+yy*Math.cos(pitch),zz];};
 const shape=(a,c,f)=>line(a.map(transform),c,1.5,f);
 shape([[p.overall_length_m/2,0,0],[-p.overall_length_m/2,0,-0.05],[-p.overall_length_m/2,0,0.05]],'#d9dfd1','#b5c1b5');
 shape([[-0.45,0,-0.3],[-0.7,0,-0.3],[-0.7,0,0.3],[-0.45,0,0.3]],'#aec3ba','#587e7a');
 shape([[-0.48,0,0],[-0.7,0.3,0],[-0.7,0,0]],'#b0c6bb','#6e8f81');
 const root=p.shoulder_span_m/2,wrist=p.wrist_span_m/2,tip=p.span_m/2;
 const chord=p.wing_area_m2/(2*((wrist-root)+(tip-wrist)*Math.PI/4));
 const inner=controls.throttle>0?0.45*Math.sin(state.phase):0;
 const outer=controls.throttle>0?0.35*Math.sin(state.phase-0.7):0;
 for(const side of [-1,1]){
  const wing=(x,r)=>{const inboard=Math.min(r,wrist)-root,outboard=Math.max(0,r-wrist);return [x,inboard*Math.sin(inner)+outboard*Math.sin(inner+outer),side*(root+inboard*Math.cos(inner)+outboard*Math.cos(inner+outer))];};
  const polygon=[];
  for(let j=0;j<=18;j++){const r=root+(tip-root)*j/18,c=r<=wrist?chord:chord*Math.sqrt(Math.max(0,1-((r-wrist)/(tip-wrist))**2));polygon.push(wing(c/2,r));}
  for(let j=18;j>=0;j--){const r=root+(tip-root)*j/18,c=r<=wrist?chord:chord*Math.sqrt(Math.max(0,1-((r-wrist)/(tip-wrist))**2));polygon.push(wing(-c/2,r));}
  shape(polygon,'#e6c19b',side<0?'#b88155':'#c99b6c');
  line([wing(-chord/2,wrist),wing(chord/2,wrist)].map(transform),'#f9e4b8',2);
  for(let j=0;j<5;j++){const r=root+(tip-root)*(j+0.5)/5;line([wing(-chord/2*(r>wrist?0.7:1),r),wing(chord/2*(r>wrist?0.7:1),r)].map(transform),'#a26c49');}
 }
 const f=forces(state,controls,env);
 $('telemetry').textContent=`${paused?'PAUSED':'RUNNING'} / ${state.status.toUpperCase()}\nSpeed     ${f.airspeed.toFixed(2)} m/s\nAltitude  ${(state.position[1]-0.2).toFixed(2)} m\nTime      ${state.time.toFixed(2)} s\nLift      ${f.lift.toFixed(1)} N`;
 document.querySelector('#power').textContent=`${Math.round(controls.throttle*100)}%`;
}
function frame(now){
 const elapsed=last?Math.min(0.05,(now-last)/1000):0;last=now;
 controls.pitch=Number(keys.has('ArrowUp'))-Number(keys.has('ArrowDown'));
 controls.bank=Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft'));
 controls.brake=Number(keys.has('Space'));
 if(!paused){accumulator+=elapsed;while(accumulator>=1/120){state=step(state,controls,env,1/120);accumulator-=1/120;}}
 draw();requestAnimationFrame(frame);
}
preset();requestAnimationFrame(frame);
