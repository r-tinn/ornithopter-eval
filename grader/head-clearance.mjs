// Sample the wings and moving hardware around the rendered pilot's head.
export function headClearance(T,craft,pilotIds,wing,mount){
 const phaseCount=48,minimum=.20;
 const items=[],panels=new Set(Object.values(craft.wingPanels).flat());
 const p=new T.Vector3(),q=new T.Vector3(),tri=new T.Triangle(),world=new T.Matrix4(),instance=new T.Matrix4();
 mount(0,0);
 craft.root.traverse(mesh=>{
  if(!mesh.isMesh||pilotIds.has(mesh.id))return;
  for(let n=mesh;n;n=n.parent)if(!n.visible)return;
  if(!(Array.isArray(mesh.material)?mesh.material:[mesh.material]).some(m=>m.visible&&m.opacity>.05))return;
  const pos=mesh.geometry.getAttribute('position');if(!pos?.count)return;
  for(let i=0,n=mesh.isInstancedMesh?mesh.count:1;i<n;i++)items.push({mesh,i,pos,surface:panels.has(mesh)});
 });
 function matrix(item){
  world.copy(item.mesh.matrixWorld);
  if(item.mesh.isInstancedMesh){item.mesh.getMatrixAt(item.i,instance);world.multiply(instance);}
  return world;
 }
 const sets=[];
 for(const bias of [0,wing.timing_bias_low_speed]){
  mount(0,bias);
  const ref=items.map(item=>{
   matrix(item);return [0,Math.floor(item.pos.count/2),item.pos.count-1].map(i=>item.mesh.getVertexPosition(i,new T.Vector3()).applyMatrix4(world));
  });
  const best={timing_bias:bias,gap_m:null};
  for(let k=0;k<phaseCount;k++){
   const phase=k*2*Math.PI/phaseCount;mount(phase,bias);
   const pilot=[];
   craft.pilot.traverse(mesh=>{
    if(!mesh.isMesh)return;
    for(let n=mesh;n;n=n.parent)if(!n.visible)return;
    const pos=mesh.geometry.getAttribute('position');
    for(let i=0;i<(pos?.count??0);i++)pilot.push(mesh.getVertexPosition(i,new T.Vector3()).applyMatrix4(mesh.matrixWorld));
   });
   const ceiling=Math.max(...pilot.map(p=>p.y));
   const head=pilot.filter(p=>p.y>=ceiling-.15);
   if(!head.length)throw Error('No head proxy geometry');
   const region=new T.Box3().setFromPoints(head).expandByScalar(.60);
   for(const [j,item] of items.entries()){
    const {mesh,pos,surface}=item;
    matrix(item);
    if(!surface&&!ref[j].some((point,z)=>mesh.getVertexPosition([0,Math.floor(pos.count/2),pos.count-1][z],p).applyMatrix4(world).distanceTo(point)>.025))continue;
    const vertices=Array.from({length:pos.count},(_,i)=>mesh.getVertexPosition(i,new T.Vector3()).applyMatrix4(world));
    if(!new T.Box3().setFromPoints(vertices).intersectsBox(region))continue;
    const idx=mesh.geometry.index;
    for(let i=0;i<(idx?.count??pos.count);i+=3){
     tri.set(...[0,1,2].map(z=>vertices[idx?idx.getX(i+z):i+z]));
     for(const h of head){
      const gap=h.distanceTo(tri.closestPointToPoint(h,q));
      if(best.gap_m===null||gap<best.gap_m)Object.assign(best,{gap_m:gap,phase_rad:phase,part:surface?'wing surface':'moving hardware',head_point_m:h.toArray(),aircraft_point_m:q.toArray()});
     }
    }
   }
  }
  sets.push(best);
 }
 return {pass:sets.every(s=>s.gap_m===null||s.gap_m>=minimum),minimum_m:minimum,phase_samples:phaseCount,
  cases:sets,scope:'Top 15 cm of pilot mesh, sampled vertices against wings and moving mesh triangles. Hardware movement detected at three tracked vertices. This is an illustrative simulator clearance allowance, not an airworthiness standard.'};
}
