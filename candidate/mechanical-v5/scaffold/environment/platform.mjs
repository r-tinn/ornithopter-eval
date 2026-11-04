import {E} from './engineering.mjs';
import {wingPose} from '../kinematics.mjs';
import {mountWingPose,PANEL_NAMES} from './mechanism.mjs';
// Shared, fixed UI/rendering/timing. Model work lives in the four root aircraft files.
import * as T from './vendor/three.module.min.js';
import {AIRFIELDS,WORLD,createWorld,surfaceHeight} from './world.mjs';
import * as physics from '../physics.mjs';
import {createAircraft,updateAircraft} from '../aircraft.mjs';
import {PHYSICS_DT,FRAME_MS,copyPose,interpolatePose,chaseView,nextFrameDeadline} from './view-motion.mjs';

const $=s=>document.querySelector(s),canvas=$('[data-testid=scene]'),viewport=$('#viewport');
const scene=new T.Scene();scene.background=new T.Color(0xb8cece);scene.fog=new T.Fog(0xb8cece,700,3100);
scene.add(new T.HemisphereLight(0xf3f1df,0x6d7d50,2.4));
const sun=new T.DirectionalLight(0xfff0ce,2.1);sun.position.set(-160,280,130);scene.add(sun);
const renderer=new T.WebGLRenderer({canvas,antialias:false,powerPreference:'low-power'});
renderer.setPixelRatio(Math.min(devicePixelRatio,WORLD.pixel_ratio));renderer.shadowMap.enabled=false;
renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.NeutralToneMapping;
const camera=new T.PerspectiveCamera(48,1,.5,6500),world=createWorld(T,scene);
const shadow=new T.Mesh(new T.CircleGeometry(1,16),new T.MeshBasicMaterial({color:0x253d2f,transparent:true,opacity:.13,depthWrite:false}));
shadow.rotation.x=-Math.PI/2;shadow.scale.set(1.3,.65,1);scene.add(shadow);
const environment={wind:[0,0,0],rho:1.225,surfaceHeight};
const controls={throttle:0,pitch:0,bank:0,rudder:0,brake:0};
let state,previousState,renderState,aircraft,ready=false,running=false,mode='chase',field=AIRFIELDS[0],last=null,nextDraw=0,accumulator=0,frame=null,dirty=true;
let orbitYaw=2.4,orbitPitch=.38,orbitDistance=E.span_m*1.25,drag=null,lastUI=0;
const keys=new Set(),position=new T.Vector3(),target=new T.Vector3(),desired=new T.Vector3();
function setStatus(message){$('#flight-status').textContent=message;}
function preset(approach=false){
  const x=approach?field.x-65:field.x+field.start,z=field.z;
  state={position:[x,surfaceHeight(x,z)+1.43+(approach?5:0),z],velocity:approach?[16,-1.2,0]:[0,0,0],pitch:approach?-.08:0,roll:0,heading:0,phase:E.wing.parked_phase_rad,omega:0,fuel_kg:E.fuel.initial_kg,pitch_rate:0,roll_rate:0,wheel_angle:0,shaft_work_J:0,aero_work_J:0,drive_heat_J:0,time:0,status:approach?'flying':'grounded'};
  previousState=copyPose(state);renderState=copyPose(state);
  Object.assign(controls,{throttle:0,pitch:0,bank:0,rudder:0,brake:0});keys.clear();running=false;accumulator=0;last=null;nextDraw=0;
  $('[data-testid=throttle]').value='0';$('#field-label').textContent=field.name;lastUI=0;
  requestDraw();
}
function requestDraw(){dirty=true;if(frame===null)frame=requestAnimationFrame(animate);}
function fail(error){running=false;ready=false;setStatus('Aircraft pending: '+String(error.message??error));$('[data-testid=start]').disabled=true;}
function shaftPower(){
  if(!ready)return 0;
  try{const power=physics.forces(state,controls,environment).power;if(!Number.isFinite(power))throw Error('Non-finite shaft power');return power;}
  catch(error){fail(error);return 0;}
}
try{
  aircraft=createAircraft(T,physics.parameters);
  if(!aircraft?.root?.isObject3D)throw Error('createAircraft must return a Three.js root.');
  for(const name of [...PANEL_NAMES,...PANEL_NAMES.map(n=>n+'Surface'),'rudder','elevator','pilot']){
    const node=aircraft[name];
    if(!node?.isObject3D||aircraft.root.getObjectById(node.id)!==node)throw Error(name+' must be a production part below root.');
  }
  if(!Array.isArray(aircraft.wheels)||aircraft.wheels.length!==3||aircraft.wheels.some(w=>!w?.isMesh||aircraft.root.getObjectById(w.id)!==w))throw Error('Return the three actual wheel meshes.');
  scene.add(aircraft.root);ready=true;
}catch(error){fail(error);shadow.visible=false;}
function draw(){
  if(running)interpolatePose(previousState,state,accumulator/PHYSICS_DT,renderState);
  else copyPose(state,renderState);
  if(ready){
    try{
      updateAircraft(aircraft,renderState,controls);
      mountWingPose(aircraft,wingPose(renderState));
      aircraft.root.position.fromArray(renderState.position);
      aircraft.root.rotation.set(renderState.roll,-renderState.heading,renderState.pitch,'YZX');
      shadow.position.set(renderState.position[0],surfaceHeight(renderState.position[0],renderState.position[2])+.025,renderState.position[2]);
      shadow.material.opacity=.13/(1+Math.max(0,renderState.position[1]-surfaceHeight(renderState.position[0],renderState.position[2])-1.43)*.3);
    }catch(error){fail(error);}
  }
  position.fromArray(renderState.position);camera.up.set(0,1,0);
  const near=mode==='world'?2:.5;
  if(camera.near!==near){camera.near=near;camera.updateProjectionMatrix();}
  const yaw=-renderState.heading,scale=(physics.parameters.span_m||3)/3;
  if(mode==='world'){
    desired.set(-700,650,1000);target.set(250,0,10);
  }else if(mode==='chase'){
    // Camera and airframe share the same interpolated pose, with no lateral offset
    // or independently delayed camera position / immediate look-at mismatch.
    chaseView(position,renderState.heading,scale,surfaceHeight,desired,target);
  }else if(mode==='pilot'){
    desired.set(4.5,1.5,3.5).applyAxisAngle(new T.Vector3(0,1,0),yaw).add(position);
    target.set(1.1,.1,0).applyAxisAngle(new T.Vector3(0,1,0),yaw).add(position);
  }else{
    const offsets={top:[0,7.4,0],side:[0,.2,7],front:[6.3,.2,0]};
    if(mode==='orbit')desired.set(Math.cos(orbitYaw)*Math.cos(orbitPitch),Math.sin(orbitPitch),Math.sin(orbitYaw)*Math.cos(orbitPitch)).multiplyScalar(orbitDistance);
    else desired.fromArray(offsets[mode]??offsets.side).multiplyScalar(scale);
    desired.applyAxisAngle(new T.Vector3(0,1,0),yaw).add(position);target.copy(position);
    if(mode==='top')camera.up.set(Math.cos(renderState.heading),0,Math.sin(renderState.heading));
  }
  desired.y=Math.max(desired.y,surfaceHeight(desired.x,desired.z)+.35);
  camera.position.copy(desired);camera.lookAt(target);renderer.render(scene,camera);
  if(state.time-lastUI>.1||!running){
    const speed=Math.hypot(...state.velocity),height=state.position[1]-surfaceHeight(state.position[0],state.position[2])-1.43;
    $('#speed').innerHTML=speed.toFixed(1)+' <small>m/s</small>';
    $('#height').innerHTML=Math.max(0,height).toFixed(1)+' <small>m</small>';
    $('[data-testid=telemetry]').textContent=`${state.status.toUpperCase()} · ${running?'RUNNING':'PAUSED'}\nPitch ${(state.pitch*180/Math.PI).toFixed(1)}° · Bank ${(state.roll*180/Math.PI).toFixed(1)}°\nSimulation ${state.time.toFixed(2)} s\nFuel ${state.fuel_kg.toFixed(2)} kg · Mass ${(E.dry_mass_including_pilot_kg+state.fuel_kg).toFixed(1)} kg\nWingbeat ${(state.omega/(2*Math.PI)).toFixed(2)} Hz · Shaft ${(shaftPower()/1000).toFixed(1)} kW`;
    $('#power-label').textContent=Math.round(controls.throttle*100)+'%';
    if(ready)setStatus((running?'Flying the implementation':'Paused · ready to inspect')+' / '+state.status);
    const info=renderer.info;
    $('#resources').textContent=`Terrain: ${world.terrainTriangles} triangles\nTrees: ${world.treeCount}, instanced\nLanding strips: ${AIRFIELDS.length}\nDraw calls: ${info.render.calls}\nTriangles this frame: ${info.render.triangles}\nShadow maps: off\nPixel ratio: ${renderer.getPixelRatio()}\nRender cap: ${WORLD.frame_hz} Hz\nPaused: renders on interaction only`;
    lastUI=state.time;
  }
}
function animate(now){
  frame=null;const elapsed=last===null?0:Math.min((now-last)/1000,.15);last=now;
  if(running&&ready){
    controls.throttle=Math.min(1,Math.max(0,controls.throttle+((keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0))*elapsed*.55));
    controls.pitch=(keys.has('ArrowUp')?1:0)-(keys.has('ArrowDown')?1:0);
    controls.bank=(keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0);
    controls.rudder=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0);controls.brake=keys.has('Space')?1:0;
    $('[data-testid=throttle]').value=String(controls.throttle);accumulator+=elapsed;
    try{
      while(accumulator>=PHYSICS_DT){copyPose(state,previousState);state=physics.step(state,controls,environment,PHYSICS_DT);accumulator-=PHYSICS_DT;}
      if(!state?.position?.every(Number.isFinite)||!state.velocity?.every(Number.isFinite))throw Error('Non-finite aircraft state.');
      if(state.status==='crashed')running=false;
    }catch(error){fail(error);}
    dirty=true;
  }
  if(dirty&&(!running||now+.5>=nextDraw)){draw();nextDraw=nextFrameDeadline(now,nextDraw,FRAME_MS);dirty=false;}
  if(running||dirty)frame=requestAnimationFrame(animate);else last=null;
}
function pause(){running=false;keys.clear();controls.pitch=controls.bank=controls.rudder=controls.brake=0;accumulator=0;requestDraw();}
function start(){if(ready&&state.status!=='crashed'){copyPose(state,previousState);running=true;last=null;nextDraw=0;requestDraw();}}
$('[data-testid=start]').onclick=start;$('[data-testid=pause]').onclick=pause;
$('[data-testid=reset]').onclick=()=>preset(false);$('[data-testid=approach]').onclick=()=>preset(true);
$('[data-testid=throttle]').oninput=e=>{controls.throttle=+e.target.value;requestDraw();};
for(const button of document.querySelectorAll('[data-view]'))button.onclick=()=>{
  mode=button.dataset.view;$('#camera-label').textContent=mode.toUpperCase()+' VIEW';
  for(const b of document.querySelectorAll('[data-view]'))b.classList.toggle('selected',b===button);requestDraw();
};
for(const button of document.querySelectorAll('[data-field]'))button.onclick=()=>{
  field=AIRFIELDS.find(f=>f.id===button.dataset.field);
  for(const b of document.querySelectorAll('[data-field]'))b.classList.toggle('selected',b===button);preset(false);
};
canvas.addEventListener('pointerdown',e=>{if(mode==='orbit'){drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);}});
canvas.addEventListener('pointermove',e=>{if(drag){orbitYaw-=(e.clientX-drag[0])*.009;orbitPitch=Math.max(.04,Math.min(1.4,orbitPitch+(e.clientY-drag[1])*.007));drag=[e.clientX,e.clientY];requestDraw();}});
canvas.addEventListener('pointerup',()=>{drag=null;});canvas.addEventListener('pointercancel',()=>{drag=null;});
canvas.addEventListener('wheel',e=>{if(mode==='orbit'){e.preventDefault();orbitDistance=Math.max(9,Math.min(42,orbitDistance+e.deltaY*.025));requestDraw();}},{passive:false});
window.addEventListener('keydown',e=>{
  if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyW','KeyS','KeyA','KeyD'].includes(e.code)){e.preventDefault();keys.add(e.code);}
  if(e.repeat)return;if(e.code==='KeyP')running?pause():start();if(e.code==='KeyR')preset(false);
});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',pause);
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
new ResizeObserver(()=>{renderer.setSize(viewport.clientWidth,viewport.clientHeight,false);camera.aspect=viewport.clientWidth/viewport.clientHeight;camera.updateProjectionMatrix();requestDraw();}).observe(viewport);
function geometryDiagnostics(){
  if(!aircraft?.root)return {triangles:0,wheel_clearances:[]};
  aircraft.root.updateMatrixWorld(true);let triangles=0;
  aircraft.root.traverse(node=>{if(node.isMesh){const n=node.geometry.index?.count??node.geometry.attributes.position?.count??0;triangles+=n/3*(node.isInstancedMesh?node.count:1);}});
  const point=new T.Vector3();
  const clearances=aircraft.wheels.map(wheel=>{
    let minimum=Infinity;const vertices=wheel.geometry.getAttribute('position');
    for(let i=0;i<vertices.count;i++){
      point.fromBufferAttribute(vertices,i).applyMatrix4(wheel.matrixWorld);
      minimum=Math.min(minimum,point.y-surfaceHeight(point.x,point.z));
    }
    return minimum;
  });
  return {triangles,wheel_clearances:clearances,pilot_meshes:(()=>{let n=0;aircraft.pilot?.traverse(x=>{if(x.isMesh)n++;});return n;})()};
}
function viewDiagnostics(){
  const projected=position.clone().project(camera);
  return {camera:camera.position.toArray(),target:target.toArray(),up:camera.up.toArray(),
    render_position:renderState.position.slice(),aircraft_position:aircraft?.root.position.toArray(),
    aircraft_screen:projected.toArray(),render_heading:renderState.heading,render_time:renderState.time,
    interpolation_alpha:running?accumulator/PHYSICS_DT:1};
}
function advanceForReview(seconds){
  if(!ready||!Number.isFinite(seconds)||seconds<0||seconds>60)throw Error('Review advance must be in [0,60] seconds');
  pause();
  for(let i=0;i<Math.round(seconds/PHYSICS_DT);i++)state=physics.step(state,controls,environment,PHYSICS_DT);
  copyPose(state,previousState);accumulator=0;requestDraw();
  return structuredClone(state);
}
window.flightLab={advanceForReview,getArticulationDiagnostics:()=>({rudder_angle:aircraft?.rudder.rotation.y}),getViewDiagnostics:viewDiagnostics,getState:()=>structuredClone(state),getControls:()=>({...controls}),getGeometryDiagnostics:geometryDiagnostics,
  getDiagnostics:()=>({mode,field:field.id,ready,running,terrain_triangles:world.terrainTriangles,trees:world.treeCount,airfields:AIRFIELDS.length,draw_calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,render_frames:renderer.info.render.frame,paused_rendering:'on demand',external_assets:false})};
if(physics.parameters.fixture_only)$('#fixture-note').textContent='V5 handwritten reference fixture — not a model result. Hypothetical human-piloted aircraft; reference-informed educational physics.';
preset(false);
