// Diagnostic only. Replay saved collision witnesses and measure wing/head spacing.
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const [base,file]=process.argv.slice(2);
const witnesses=JSON.parse(await fs.readFile(file,'utf8'));
const browser=await chromium.launch({headless:true,chromiumSandbox:true});
try{
 const ctx=await browser.newContext({serviceWorkers:'block'});
 await ctx.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());
 const page=await ctx.newPage();await page.goto(base+'/__probe.html');
 console.log(JSON.stringify(await page.evaluate(async ({base,witnesses})=>{
  const T=await import(base+'/environment/vendor/three.module.min.js'),A=await import(base+'/aircraft.mjs'),P=await import(base+'/physics.mjs'),K=await import(base+'/kinematics.mjs'),M=await import(base+'/environment/source-mechanism.mjs'),{E}=await import(base+'/environment/engineering.mjs'),G=await import(base+'/__airframe-geometry.mjs');
  const a=A.createAircraft(T,P.parameters),controls={throttle:1,pitch:0,bank:0,rudder:0,brake:0};
  function mount(phase,bias){
   const s={position:[0,100,0],velocity:[16,0,0],pitch:0,pitch_rate:0,roll:0,heading:0,phase,omega:6,fuel_kg:3.6,time:0,status:'flying',wheel_angle:0,sweep_scale:1,gliding:false,timing_bias:bias};
   A.updateAircraft(a,s,controls);M.mountWingPose(a,K.wingPose(s),P.parameters);
   a.root.position.set(0,0,0);a.root.rotation.set(0,0,0);a.root.updateMatrixWorld(true);
  }
  mount(0,E.wing.timing_bias_low_speed);
  const parts=[];
  a.pilot.traverse(m=>{if(m.isMesh&&m.visible)parts.push(...G.geometryComponents(T,m));});
  const body=parts.map(c=>G.worldComponent(T,c)),bounds=new T.Box3();
  body.forEach(c=>bounds.union(c.box));
  // Head proxy: actual uppermost 15 cm of the seated pilot geometry.
  const cutoff=bounds.max.y-.15;
  const head=body.flatMap(c=>c.indices.map(i=>c.verts[i]).filter(v=>v.y>=cutoff));
  const nearest=new T.Vector3(),tri=new T.Triangle();
  const gaps=[];
  for(const bias of [0,E.wing.timing_bias_low_speed]){
   let best={gap_m:Infinity};
   for(let i=0;i<120;i++){
    const phase=i*2*Math.PI/120;mount(phase,bias);
    for(const [name,leaves] of Object.entries(a.wingPanels)){
     if(!name.endsWith('Inner'))continue;
     for(const m of leaves){
      const pos=m.geometry.getAttribute('position'),idx=m.geometry.index;
      const verts=Array.from({length:pos.count},(_,j)=>new T.Vector3().fromBufferAttribute(pos,j).applyMatrix4(m.matrixWorld));
      for(let j=0;j<(idx?.count??pos.count);j+=3){
       tri.set(...[0,1,2].map(k=>verts[idx?idx.getX(j+k):j+k]));
       for(const v of head){
        const q=tri.closestPointToPoint(v,nearest),gap=v.distanceTo(q);
        if(gap<best.gap_m)best={gap_m:gap,phase_rad:phase,wing:name,head_point_m:v.toArray(),wing_point_m:q.toArray()};
       }
      }
     }
    }
   }
   gaps.push({bias,...best});
  }
  const phases=new Map();
  for(const w of witnesses){if(!phases.has(w.phase))phases.set(w.phase,[]);phases.get(w.phase).push(w);}
  const unique=new Map();
  for(const [phase,ws] of phases){
   mount(phase,E.wing.timing_bias_low_speed);
   const current=parts.map(c=>G.worldComponent(T,c));
   for(const w of ws){
    const p=new T.Vector3(...w.point_m);
    let depth=0;
    for(const c of current){
     const margin=c.box.max.y<=bounds.min.y+.12*(bounds.max.y-bounds.min.y)?.025:.008;
     if(!G.insideComponent(T,p,c,margin))continue;
     let d=Infinity;
     for(const f of c.faces){
      tri.set(...f.map(j=>c.verts[j]));d=Math.min(d,p.distanceTo(tri.closestPointToPoint(p,nearest)));
     }
     depth=Math.max(depth,d);
    }
    const key=w.point_m.map(v=>Math.round(v*1000)).join(',');
    const old=unique.get(key);
    if(!old||depth>old.depth_m)unique.set(key,{point_m:w.point_m,depth_m:depth});
   }
  }
  return {head_cutoff_m:cutoff,head_samples:head.length,wing_gaps:gaps,
          distinct_witness_locations_1mm:unique.size,
          witnesses_in_top_15cm:[...unique.values()].filter(w=>w.point_m[1]>=cutoff).length,
          deepest_reported_witnesses:[...unique.values()].sort((a,b)=>b.depth_m-a.depth_m).slice(0,5)};
 },{base,witnesses})));
}finally{await browser.close();}
