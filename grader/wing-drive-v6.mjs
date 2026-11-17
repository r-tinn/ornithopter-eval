// Supplemental drive predicates. Inspect rendered transforms, independent of names.
export function inspectDrive(T,craft,pilotIds,frames,wing,mount){
 const root=craft.root;
 const phases=frames.map((_,i)=>i*2*Math.PI/frames.length);
 const instances=[],cams=[];
 mount(0);
 root.traverse(mesh=>{
  if(!mesh.isMesh||pilotIds.has(mesh.id))return;
  for(let n=mesh;n;n=n.parent)if(!n.visible)return;
  if(!(Array.isArray(mesh.material)?mesh.material:[mesh.material]).some(m=>m.visible&&m.opacity>.05))return;
  const pos=mesh.geometry.getAttribute('position');
  if(!pos||!pos.count)return;
  const box=new T.Box3().setFromBufferAttribute(pos),size=box.getSize(new T.Vector3());
  if(mesh.isInstancedMesh){
   // A slender instance can be formed by scaling a unit cylinder along its axis.
   const sides=size.toArray();
   for(let i=0;i<mesh.count;i++)instances.push({mesh,i,box,sides});
  }else if(size.x<.12&&size.y>.25&&size.z>.25&&pos.count>=32){
   cams.push({mesh,pos,index:mesh.geometry.index,travel:0,first:new T.Vector3().fromBufferAttribute(pos,0).applyMatrix4(mesh.matrixWorld)});
  }
 });
 const within=(a,b)=>Math.max(Math.abs(a.z),Math.abs(b.z))<1.15&&Math.min(a.x,b.x)>-1.5&&Math.max(a.x,b.x)<.7&&Math.min(a.y,b.y)>-.05;
 const low=p=>p.y<wing.root_height_m-.12;
 const out=p=>p.y>wing.root_height_m-.15&&Math.abs(p.z)>wing.hinge_offset_m*.6;
 const tracks=new Map(),camTracks=cams.map(()=>[]);
 const matrix=new T.Matrix4(),v=new T.Vector3(),near=new T.Vector3(),tri=new T.Triangle();
 for(const [k,phase] of phases.entries()){
  mount(phase);
  const links=frames[k].map(m=>({id:'mesh:'+m.index,a:new T.Vector3(...m.a),b:new T.Vector3(...m.b)}));
  for(const [j,{mesh,i,box,sides}] of instances.entries()){
   mesh.getMatrixAt(i,matrix);matrix.premultiply(mesh.matrixWorld);
   const lengths=sides.map((x,n)=>x*v.setFromMatrixColumn(matrix,n).length());
   const axis=lengths.indexOf(Math.max(...lengths)),length=lengths[axis];
   if(length<.12||length<1.5*Math.max(...lengths.filter((_,i)=>i!==axis)))continue;
   const center=box.getCenter(new T.Vector3());
   const a=center.clone().setComponent(axis,box.min.getComponent(axis)).applyMatrix4(matrix);
   const b=center.setComponent(axis,box.max.getComponent(axis)).applyMatrix4(matrix);
   if(within(a,b))links.push({id:'instance:'+j,a,b});
  }
  for(const link of links){
   if(!tracks.has(link.id))tracks.set(link.id,Array(phases.length));
   const track=tracks.get(link.id),prev=track[k-1];
   if(prev&&prev.a.distanceTo(link.a)+prev.b.distanceTo(link.b)>prev.a.distanceTo(link.b)+prev.b.distanceTo(link.a)) [link.a,link.b]=[link.b,link.a];
   track[k]=link;
  }
  for(const [j,cam] of cams.entries()){
   const {mesh,pos,index}=cam;
   cam.travel=Math.max(cam.travel,v.fromBufferAttribute(pos,0).applyMatrix4(mesh.matrixWorld).distanceTo(cam.first));
   const verts=Array.from({length:pos.count},(_,i)=>new T.Vector3().fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld));
   const box=new T.Box3().setFromPoints(verts).expandByScalar(.06),distances=new Map();
   for(const l of links)for(const [end,tip,other] of [['a',l.a,l.b],['b',l.b,l.a]]){
    if(!low(tip)||!out(other)||!box.containsPoint(tip))continue;
    let distance=Infinity;
    for(let f=0;f<(index?.count??pos.count);f+=3){
     const [a,b,c]=[0,1,2].map(i=>verts[index?index.getX(f+i):f+i]);
     tri.set(a,b,c);distance=Math.min(distance,tri.closestPointToPoint(tip,near).distanceTo(tip));
    }
    distances.set(l.id+':'+end,distance);
   }
   camTracks[j].push(distances);
  }
 }
 const moving=[...tracks.entries()].filter(([,t])=>t.filter(Boolean).length===phases.length&&
   t.some(l=>Math.max(l.a.distanceTo(t[0].a),l.b.distanceTo(t[0].b))>.025));
 const ends=['a','b'];
 const travel=(t,e)=>Math.max(...t.map(l=>l[e].distanceTo(t[0][e])));
 const mate=(t,e,u,f)=>Math.max(...t.map((l,i)=>l[e].distanceTo(u[i][f])));
 const pivot=(t,e,f)=>travel(t,e)<=.025&&travel(t,f)>.05&&
   t[0][e].y<wing.root_height_m-.12&&t[0][e].distanceTo(t[0][f])>=.12&&
   Math.max(...t.map(l=>Math.abs(l[e].distanceTo(l[f])-t[0][e].distanceTo(t[0][f]))))<=.025;
 // The same output endpoint must stay near the same side's rendered inner
 // wing every phase. A sliding attachment need not track one fabric point.
 const wingFrames=phases.map(phase=>{
  mount(phase);const list=[];
  for(const name of ['leftInner','rightInner'])for(const m of craft.wingPanels[name]){
   const pos=m.geometry.getAttribute('position'),idx=m.geometry.index;
   for(let i=0;i<(idx?.count??pos.count);i+=3)list.push({name,verts:[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(pos,idx?idx.getX(i+k):i+k).applyMatrix4(m.matrixWorld))});
  }return list;
 });
 function output(t,e){
  if(travel(t,e)<.05)return null;
  let best=Infinity;
  for(const side of ['leftInner','rightInner']){
   const gap=Math.max(...t.map((l,k)=>{
    let min=Infinity;
    for(const {name,verts} of wingFrames[k])if(name===side){
     tri.set(...verts);min=Math.min(min,l[e].distanceTo(tri.closestPointToPoint(l[e],near)));
    }
    return min;
   }));
   best=Math.min(best,gap);
  }
  return best<=.14?best:null;
 }
 const outputs=new Map();
 const wingGap=(id,t,e)=>{const key=id+':'+e;if(!outputs.has(key))outputs.set(key,output(t,e));return outputs.get(key);};
 const paths=[],camContacts=[];
 for(const [input,t] of moving)for(const anchored of ends){
  const pin=anchored==='a'?'b':'a';
  if(!pivot(t,anchored,pin))continue;
  for(const [rod,u] of moving)if(input!==rod)for(const end of ends){
   if(travel(u,end)<.05)continue;
   const pinGap=mate(t,pin,u,end);if(pinGap>.08)continue;
   const wing_gap_m=wingGap(rod,u,end==='a'?'b':'a');
   if(wing_gap_m!==null)paths.push({input,rod,pin_gap_m:pinGap,wing_gap_m});
  }
 }
 // A grounded rocker pivot can be coaxial with a sweeping wing root. Its
 // output is angular: compare the follower's rotation with inner-wing stroke
 // about the longitudinal axis, rather than demanding a translating pivot.
 for(const [j,cam] of cams.entries())if(cam.travel>.05)for(const [id,t] of moving)for(const end of ends){
  const gap=Math.max(...camTracks[j].map(f=>f.get(id+':'+end)??Infinity));
  const opposite=end==='a'?'b':'a';
  if(gap>.06||travel(t,end)<.05)continue;
  const direct=wingGap(id,t,opposite);
  const rootAt=t[0][opposite];
  let rocker_error_rad=null;
  if(travel(t,opposite)<=.025&&Math.abs(rootAt.y-wing.root_height_m)<.12&&Math.abs(Math.abs(rootAt.z)-wing.hinge_offset_m)<.10){
   const side=Math.sign(rootAt.z),wingName=side<0?'leftInner':'rightInner';
   const normal=phases.map(phase=>{
    mount(phase);const m=craft.wingPanels[wingName][0],p=m.geometry.getAttribute('position');
    const a=new T.Vector3().fromBufferAttribute(p,0).applyMatrix4(m.matrixWorld),b=new T.Vector3().fromBufferAttribute(p,3).applyMatrix4(m.matrixWorld);
    return Math.atan2(b.y-a.y,b.z-a.z);
   });
   const angle=t.map(l=>Math.atan2(l[end].y-l[opposite].y,l[end].z-l[opposite].z));
   const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
   rocker_error_rad=Math.max(...angle.map((a,i)=>Math.abs(wrap((a-angle[0])-(normal[i]-normal[0])))));
   if(rocker_error_rad>.15)rocker_error_rad=null;
  }
  if(direct!==null||rocker_error_rad!==null)camContacts.push({cam:j,follower:id,cam_surface_gap_m:gap,wing_gap_m:direct,rocker_error_rad});
 }
 return {pass:paths.length>0||camContacts.length>0,crank_paths:paths,cam_contacts:camContacts,phase_samples:phases.length};
}
