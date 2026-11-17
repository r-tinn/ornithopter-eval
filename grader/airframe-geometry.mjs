// Geometry measurements only. No mesh-name, material, model-ID or prose heuristics.
export function geometryComponents(T,mesh,splitNormals=false){
 const attr=mesh.geometry.getAttribute('position'),index=mesh.geometry.index;
 if(!attr||attr.count<3)return [];
 const points=[],sourceIndices=[],lookup=new Map(),map=[];
 for(let i=0;i<attr.count;i++){
  const v=new T.Vector3();mesh.getVertexPosition(i,v);
  const normals=mesh.geometry.getAttribute('normal');
  const key=v.toArray().map(x=>Math.round(x*1e5)).join(',')+(splitNormals&&normals?':'+[normals.getX(i),normals.getY(i),normals.getZ(i)].map(x=>Math.round(x*1e4)).join(','):'');
  if(!lookup.has(key)){lookup.set(key,points.length);points.push(v);sourceIndices.push(i);}map.push(lookup.get(key));
 }
 const parent=points.map((_,i)=>i),find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
 const faces=[];
 for(let i=0;i<(index?.count??attr.count);i+=3){const ids=[0,1,2].map(j=>map[index?index.getX(i+j):i+j]);if(new Set(ids).size<3)continue;faces.push(ids);for(const id of ids.slice(1))parent[find(id)]=find(ids[0]);}
 const groups=new Map();for(const face of faces){const k=find(face[0]);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(face);}
 return [...groups.values()].map(faces=>({mesh,indices:[...new Set(faces.flat())],local:points,sourceIndices,faces}));
}
export function worldComponent(T,c){
 const verts=c.sourceIndices.map(i=>c.mesh.getVertexPosition(i,new T.Vector3()).applyMatrix4(c.mesh.matrixWorld)),box=new T.Box3().setFromPoints(c.indices.map(i=>verts[i]));
 return {...c,verts,box};
}
export function member(T,c,slenderness=5){
 const vs=c.indices.map(i=>c.verts[i]),mean=vs.reduce((a,b)=>a.add(b),new T.Vector3()).multiplyScalar(1/vs.length);
 const cov=Array.from({length:3},()=>[0,0,0]);for(const v of vs){const d=v.clone().sub(mean).toArray();for(let i=0;i<3;i++)for(let j=0;j<3;j++)cov[i][j]+=d[i]*d[j];}
 const diagonal=[0,1,2].sort((a,b)=>cov[b][b]-cov[a][a]);let axis=new T.Vector3().setComponent(diagonal[0],1);
 for(let k=0;k<24;k++){const a=axis.toArray();axis.set(...cov.map(row=>row.reduce((s,v,i)=>s+v*a[i],0))).normalize();}
 const ts=vs.map(v=>v.clone().sub(mean).dot(axis)),lo=Math.min(...ts),hi=Math.max(...ts),length=hi-lo;
 if(length<.12)return null;
 const radius=Math.max(...vs.map((v,i)=>v.clone().sub(mean).addScaledVector(axis,-ts[i]).length()));
 if(radius>.13||length<slenderness*radius)return null;
 return {a:mean.clone().addScaledVector(axis,lo),b:mean.clone().addScaledVector(axis,hi),length,radius,component:c};
}
export function trussVerdict(T,members){
 const nodes=[],edges=new Set(),tolerance=.10;
 const node=p=>{let i=nodes.findIndex(q=>q.distanceTo(p)<=tolerance);if(i<0){i=nodes.length;nodes.push(p.clone());}return i;};
 for(const m of members){const a=node(m.a),b=node(m.b);if(a!==b)edges.add([a,b].sort((a,b)=>a-b).join(':'));}
 const has=(a,b)=>edges.has([a,b].sort((a,b)=>a-b).join(':')),triangles=[];
 for(let a=0;a<nodes.length;a++)for(let b=a+1;b<nodes.length;b++)if(has(a,b))for(let c=b+1;c<nodes.length;c++)if(has(a,c)&&has(b,c)){
  const area=nodes[b].clone().sub(nodes[a]).cross(nodes[c].clone().sub(nodes[a])).length()/2;
  if(area>.025)triangles.push([a,b,c]);
 }
 const connected=[],seen=new Set();
 for(let start=0;start<nodes.length;start++){
  if(seen.has(start))continue;const set=new Set([start]),queue=[start];seen.add(start);
  while(queue.length){const v=queue.pop();for(let j=0;j<nodes.length;j++)if(!seen.has(j)&&has(v,j)){seen.add(j);set.add(j);queue.push(j);}}
  connected.push(set);
 }
 const cases=connected.map(set=>{const box=new T.Box3().setFromPoints([...set].map(i=>nodes[i])),size=box.getSize(new T.Vector3()).toArray(),count=triangles.filter(t=>t.every(v=>set.has(v))).length;return {triangles:count,size_m:size,joints:set.size};});
 return {id:'rear_truss_structure',pass:cases.some(c=>c.triangles>=3&&c.size_m[0]>=1.2&&c.size_m[1]>=.2&&c.size_m[2]>=.2),detail:{scope:'Connected slender-member triangular bays in the aft region, not strength/material/visual-quality certification',endpoint_tolerance_m:tolerance,minimum_triangle_area_m2:.025,cases,members:members.map(m=>({a:m.a.toArray(),b:m.b.toArray()}))}};
}
export function insideComponent(T,p,c,margin=.008){
 if(!c.box.clone().expandByScalar(-margin).containsPoint(p))return false;
 const ray=new T.Ray(p,new T.Vector3(1,.173,.291).normalize()),hit=new T.Vector3(),distances=[];
 let nearest=Infinity;
 for(const face of c.faces){const [a,b,d]=face.map(i=>c.verts[i]),tri=new T.Triangle(a,b,d);
  nearest=Math.min(nearest,tri.closestPointToPoint(p,new T.Vector3()).distanceTo(p));
  if(ray.intersectTriangle(a,b,d,false,hit)){const dist=p.distanceTo(hit);if(dist>1e-7&&!distances.some(v=>Math.abs(v-dist)<1e-6))distances.push(dist);}
 }
 return nearest>margin&&distances.length%2===1;
}
