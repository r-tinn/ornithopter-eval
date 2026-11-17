// Isolated inspection of the actual submitted aircraft modules. No model name is rendered.
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
const [base,out]=process.argv.slice(2);
const policy=JSON.parse(await fs.readFile(new URL('./protocols/airframe-binary-v1.json',import.meta.url)));
let browser;
try{
 browser=await chromium.launch({headless:true,chromiumSandbox:true});
 const context=await browser.newContext({viewport:{width:1800,height:1200},deviceScaleFactor:1,serviceWorkers:'block'});
 await context.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());
 const page=await context.newPage();await page.goto(base+'/__probe.html');
 const measurements=await page.evaluate(async ({base,policy})=>{
  const T=await import(base+'/environment/vendor/three.module.min.js'),A=await import(base+'/aircraft.mjs'),P=await import(base+'/physics.mjs'),K=await import(base+'/kinematics.mjs'),M=await import(base+'/environment/source-mechanism.mjs'),{E}=await import(base+'/environment/engineering.mjs');
  const G=await import(base+'/__airframe-geometry.mjs');
  const H=await import(base+'/__head-clearance.mjs');
  const D=await import(base+'/__wing-drive-v5.mjs');
  const a=A.createAircraft(T,P.parameters),expected=A.createAircraft(T,P.parameters);
  const controls={throttle:1,pitch:0,bank:0,rudder:0,brake:0};
  const state={position:[0,100,0],velocity:[16,0,0],pitch:0,pitch_rate:0,roll:0,heading:0,phase:0,omega:6,fuel_kg:3.6,time:0,status:'flying',wheel_angle:0,sweep_scale:1,gliding:false};
  const mount=(s,craft=a)=>{A.updateAircraft(craft,s,controls);M.mountWingPose(craft,K.wingPose(s),P.parameters);craft.root.position.set(0,0,0);craft.root.rotation.set(0,0,0);craft.root.updateMatrixWorld(true);};
  const points=craft=>['leftOuter','rightOuter'].flatMap(n=>craft.wingPanels[n].flatMap(mesh=>{
   if(!mesh.isMesh||craft.root.getObjectById(mesh.id)!==mesh)throw Error('Missing mounted outer leaf');
   const pos=mesh.geometry.getAttribute('position'),out=[];
   for(let i=0;i<pos.count;i++)out.push(new T.Vector3().fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld).toArray());return out;
  }));
  const metrics=frames=>{
   const dt=2*Math.PI/policy.motion_check.phase_samples/6,N=frames.length;
   let speed=0,acceleration=0;
   for(let i=0;i<N;i++)for(let j=0;j<frames[i].length;j++){
    const lo=frames[(i+N-1)%N][j],p=frames[i][j],hi=frames[(i+1)%N][j];
    speed=Math.max(speed,Math.hypot(...hi.map((v,k)=>(v-lo[k])/(2*dt))));
    acceleration=Math.max(acceleration,Math.hypot(...hi.map((v,k)=>(v-2*p[k]+lo[k])/(dt*dt))));
   }return {peak_speed_m_s:speed,peak_acceleration_m_s2:acceleration};
  };
  const cases=[];
  for(const bias of [0,E.wing.timing_bias_low_speed]){
   const actual=[],ideal=[];
   for(let i=0;i<policy.motion_check.phase_samples;i++){
    const s={...state,timing_bias:bias,phase:i*2*Math.PI/policy.motion_check.phase_samples};mount(s);actual.push(points(a));
    // Independent identity transforms: the host's mandated material-coordinate helper.
    M.mountWingPose(expected,K.wingPose(s),P.parameters);
    expected.root.position.set(0,0,0);expected.root.rotation.set(0,0,0);
    for(const name of M.PANEL_NAMES){for(const node of [expected[name],expected[name+'Surface'],...expected.wingPanels[name]]){node.position.set(0,0,0);node.rotation.set(0,0,0);node.scale.set(1,1,1);}}
    expected.root.updateMatrixWorld(true);ideal.push(points(expected));
   }
   const observed=metrics(actual),reference=metrics(ideal),factor=policy.motion_check.envelope_multiplier;
   cases.push({timing_bias:bias,observed,reference,pass:Object.keys(observed).every(k=>Number.isFinite(observed[k])&&observed[k]<=factor*reference[k])});
  }
  mount({...state,timing_bias:E.wing.timing_bias_low_speed});
  const pilotIds=new Set();if(!a.pilot?.isObject3D||a.root.getObjectById(a.pilot.id)!==a.pilot)throw Error('Mounted pilot object is required');
  a.pilot.traverse(n=>pilotIds.add(n.id));
  const components=[],pilotComponents=[];
  a.root.traverse(mesh=>{if(!mesh.isMesh)return;let visible=true;for(let n=mesh;n;n=n.parent)if(!n.visible)visible=false;
   const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];
   if(!visible||!mats.some(m=>m.visible&&m.opacity>.05))return;
   for(const c of G.geometryComponents(T,mesh,!pilotIds.has(mesh.id)))(pilotIds.has(mesh.id)?pilotComponents:components).push(c);
  });
  if(!pilotComponents.length)throw Error('Pilot has no measurable visible mesh');
  const witnesses=[],driveFrames=[];let tested=0,tolerated=0;
  for(let i=0;i<24;i++){
   const phase=i*2*Math.PI/24;mount({...state,phase,timing_bias:E.wing.timing_bias_low_speed});
   const pilot=pilotComponents.map(c=>G.worldComponent(T,c)),bounds=new T.Box3();pilot.forEach(c=>bounds.union(c.box));
   const moving=[];
   for(let ci=0;ci<components.length;ci++){
    const c=G.worldComponent(T,components[ci]),m=G.member(T,c,3);
    if(m&&Math.max(Math.abs(m.a.z),Math.abs(m.b.z))<1.15&&Math.min(m.a.x,m.b.x)>-1.5&&Math.max(m.a.x,m.b.x)<.7&&Math.min(m.a.y,m.b.y)>-.05){moving.push({index:ci,a:m.a.toArray(),b:m.b.toArray(),length:m.length});}
    if(!c.box.intersectsBox(bounds))continue;
    const candidates=c.indices.map(j=>c.verts[j]);
    // Subdivide actual mesh edges in the pilot's bounding box: long thin bars
    // crossing the body must not escape merely because their endpoints are outside.
    for(const face of c.faces)for(const [u,v] of [[0,1],[1,2],[2,0]]){
     const start=c.verts[face[u]],end=c.verts[face[v]],edge=end.clone().sub(start),length=edge.length();
     if(!length||!new T.Box3().setFromPoints([start,end]).intersectsBox(bounds))continue;
     const N=Math.ceil(length/.025);for(let j=1;j<N;j++){const p=start.clone().addScaledVector(edge,j/N);if(bounds.containsPoint(p))candidates.push(p);}
    }
    candidates.sort((a,b)=>b.y-a.y);
    for(const p of candidates){if(!bounds.containsPoint(p))continue;tested++;
     // Only components entirely in the lowest 12% of the seated pilot
     // qualify. A merged torso/leg mesh retains the strict threshold.
     const footCeiling=bounds.min.y+.12*(bounds.max.y-bounds.min.y);
     if(pilot.some(body=>{
      const atFoot=body.box.max.y<=footCeiling;
      if(!G.insideComponent(T,p,body,.008))return false;
      if(atFoot&&!G.insideComponent(T,p,body,.025)){tolerated++;return false;}
      return true;
     })){witnesses.push({phase,aircraft_component:ci,upper_pilot_region:p.y>bounds.max.y-.3*(bounds.max.y-bounds.min.y),point_m:p.toArray(),scope:'Actual non-pilot mesh surface lies inside a pilot component beyond its clearance tolerance'});break;}
    }
   }
   driveFrames.push(moving);
  }
  const initial=driveFrames[0],movingLinks=[];
  for(const link of initial){const track=driveFrames.map(f=>f.find(x=>x.index===link.index));if(track.some(x=>!x))continue;
   const travel=Math.max(...track.map(x=>Math.max(new T.Vector3(...x.a).distanceTo(new T.Vector3(...link.a)),new T.Vector3(...x.b).distanceTo(new T.Vector3(...link.b)))));
   const lengths=track.map(x=>x.length);if(travel>.025&&Math.max(...lengths)/Math.min(...lengths)<2.5)movingLinks.push({...link,travel_m:travel});
  }
  const connected=[];for(let i=0;i<movingLinks.length;i++)for(let j=i+1;j<movingLinks.length;j++){
   const l=movingLinks[i],r=movingLinks[j],dist=Math.max(...driveFrames.map(frame=>{const L=frame.find(x=>x.index===l.index),R=frame.find(x=>x.index===r.index);return Math.min(...['a','b'].flatMap(x=>['a','b'].map(y=>new T.Vector3(...L[x]).distanceTo(new T.Vector3(...R[y])))));}));
   const reachesLow=[...l.a.slice(1,2),...l.b.slice(1,2),...r.a.slice(1,2),...r.b.slice(1,2)].some(y=>y<E.wing.root_height_m-.12);
   const reachesWing=[l.a,l.b,r.a,r.b].some(p=>p[1]>E.wing.root_height_m-.15&&Math.abs(p[2])>E.wing.hinge_offset_m*.6);
   if(dist<=.12&&reachesLow&&reachesWing)connected.push({members:[l.index,r.index],joint_gap_m:dist});
  }
  const revisedDrive=D.inspectDrive(T,a,pilotIds,driveFrames, E.wing, phase=>mount({...state,phase,timing_bias:E.wing.timing_bias_low_speed}));
  const clearance=H.headClearance(T,a,pilotIds,E.wing,(phase,timing_bias)=>mount({...state,phase,timing_bias}));
  const geometry=[{id:'pilot_clearance',pass:witnesses.length===0&&clearance.pass,detail:{head_clearance:clearance,body_penetration_pass:witnesses.length===0,phase_samples:24,penetration_margin_m:.008,edge_sample_spacing_m:.025,pilot_components:pilotComponents.length,tested_surface_points:tested,foot_band_fraction:.12,foot_penetration_margin_m:.025,tolerated_foot_samples:tolerated,witnesses,scope:'Sampled non-pilot mesh surfaces penetrating the actual pilot mesh. Contacts below 8 mm ignored, or 25 mm for components entirely in the bottom 12% of pilot height; no guarantee between phase samples or for concealed/incorrect pilot geometry.'}},
   {id:'wing_drive_linkage',pass:revisedDrive.pass,detail:{revised_drive:revisedDrive,moving_links:movingLinks,connected_pairs:connected,scope:'A crank pin or cam follower must remain connected through motion to a repeatable wing output. This tests rendered geometry, not force transmission.'}}];
  const scene=new T.Scene();scene.background=new T.Color('#e8edf0');scene.add(new T.HemisphereLight(0xffffff,0x64727a,2.2));
  const light=new T.DirectionalLight(0xffffff,2.8);light.position.set(6,10,7);scene.add(light);scene.add(a.root);
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(600,400);renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;
  const target=document.createElement('canvas');target.width=1800;target.height=1200;document.body.replaceChildren(target);document.body.style.margin='0';const ctx=target.getContext('2d');
  window.inspectAirframe=({region,phases})=>{
   ctx.fillStyle='#e8edf0';ctx.fillRect(0,0,1800,1200);
   const boxes={pilot:[[-.3,-1.2,-1.15],[2.8,1.4,1.15]],drive:[[-1.5,-.5,-1.1],[1,1.5,1.1]],forward:[[.6,-1.2,-.9],[3.1,1.2,.9]],rear:[[-3.6,-1.1,-.9],[-.35,1.3,.9]]};
   const [min,max]=boxes[region],box=new T.Box3(new T.Vector3(...min),new T.Vector3(...max)),center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3());
   const directions=[[.3,.25,1],[-.3,.25,-1],[1,.35,.65]];
   for(let row=0;row<3;row++)for(let col=0;col<3;col++){
    const phase=phases[col],s={...state,phase,timing_bias:E.wing.timing_bias_low_speed};mount(s);
    const camera=new T.PerspectiveCamera(35,1.5,.01,100);const radius=Math.max(size.x/1.5,size.y,size.z)*1.65;
    camera.position.copy(center).add(new T.Vector3(...directions[row]).normalize().multiplyScalar(radius));camera.lookAt(center);renderer.render(scene,camera);
    ctx.drawImage(renderer.domElement,col*600,row*400);ctx.fillStyle='#26363b';ctx.fillRect(col*600,row*400,600,25);ctx.fillStyle='white';ctx.font='14px sans-serif';ctx.fillText('View '+(row+1)+' · phase '+phase.toFixed(3)+' rad',col*600+12,row*400+18);
   }
  };
  return {checks:[{id:'wingtip_motion_continuity',pass:cases.every(c=>c.pass),detail:{...policy.motion_check,cases}},...geometry]};
 },{base,policy});
 await fs.writeFile(path.join(out,'measurements.json'),JSON.stringify(measurements,null,2)+'\n');
 const evidence={};
 for(const [id,region] of [['pilot_clearance','pilot'],['wing_drive_linkage','drive']]){
  evidence[id]=[];
  const batches=(region==='pilot'||region==='drive')?[[0,Math.PI/3,2*Math.PI/3],[Math.PI,4*Math.PI/3,5*Math.PI/3]]:[[0,Math.PI/2,Math.PI]];
  for(let i=0;i<batches.length;i++){
   await page.evaluate(arg=>window.inspectAirframe(arg),{region,phases:batches[i]});
   const name=id+'-'+i+'.png';await page.screenshot({path:path.join(out,name)});evidence[id].push(name);
  }
 }
 await fs.writeFile(path.join(out,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
}catch(e){await fs.writeFile(path.join(out,'capture-error.json'),JSON.stringify({error:String(e)}));process.exitCode=1;}
finally{await browser?.close();}
