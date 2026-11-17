// Supplemental drive predicates. Inspect rendered transforms, independent of names.
export function inspectDrive(T,root,pilotIds,frames,wing,mount){
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
   tracks.get(link.id)[k]=link;
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
 const instancePairs=[],camContacts=[];
 for(const [id,t] of moving)if(id.startsWith('instance:'))for(const [other,u] of moving){
  if(id===other||![t[0].a,t[0].b,u[0].a,u[0].b].some(low)||![t[0].a,t[0].b,u[0].a,u[0].b].some(out))continue;
  const gap=Math.min(...['a','b'].flatMap(a=>['a','b'].map(b=>Math.max(...t.map((l,i)=>l[a].distanceTo(u[i][b]))))));
  if(gap<=.12)instancePairs.push({members:[id,other],max_gap_m:gap});
 }
 for(const [j,cam] of cams.entries())if(cam.travel>.025)for(const [id] of moving)for(const end of ['a','b']){
  const gap=Math.max(...camTracks[j].map(f=>f.get(id+':'+end)??Infinity));
  if(gap<=.06)camContacts.push({cam:j,follower:id,end,max_surface_gap_m:gap});
 }
 return {pass:instancePairs.length>0||camContacts.length>0,instance_pairs:instancePairs,cam_contacts:camContacts,phase_samples:phases.length};
}
