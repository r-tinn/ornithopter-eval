// Adapted from the family Ornithopter project's procedural terrain and airfield.
// Standalone: no imports, assets or paths into that project.
export const WORLD = Object.freeze({size:3600, segments:64, trees:48, frame_hz:60, pixel_ratio:1.25});
export const AIRFIELDS = Object.freeze([
  Object.freeze({id:'valley',name:'Valley strip',x:-120,z:-165,length:266,width:18,start:-110}),
  Object.freeze({id:'meadow',name:'Meadow strip',x:780,z:285,length:220,width:16,start:-90}),
]);
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
function natural(x,z){
  const broad=7.5*Math.sin(x*.0042)*Math.cos(z*.0036);
  const detail=2.2*Math.sin((x+z)*.014)+1.4*Math.cos((x-z)*.019);
  const north=285*Math.exp(-((x-360)**2)/310000-((z+880)**2)/92000)
    +205*Math.exp(-((x+520)**2)/240000-((z+790)**2)/115000);
  const south=245*Math.exp(-((x-640)**2)/280000-((z-960)**2)/105000)
    +175*Math.exp(-((x+650)**2)/190000-((z-870)**2)/90000);
  return broad+detail+north+south-2;
}
export function designedTerrainHeight(x,z){
  let height=natural(x,z);
  for(const field of AIRFIELDS){
    const outside=Math.hypot(Math.max(0,Math.abs(x-field.x)-field.length/2-80),Math.max(0,Math.abs(z-field.z)-80));
    height=natural(field.x,field.z)+(height-natural(field.x,field.z))*smooth(0,85,outside);
  }
  return height;
}
// Contact and graphics use the same triangular height field, not different resolutions.
export function terrainHeight(x,z){
  const cell=WORLD.size/WORLD.segments,half=WORLD.size/2;
  const gx=clamp((x+half)/cell,0,WORLD.segments-1e-9),gz=clamp((z+half)/cell,0,WORLD.segments-1e-9);
  const ix=Math.floor(gx),iz=Math.floor(gz),u=gx-ix,v=gz-iz;
  const x0=ix*cell-half,z0=iz*cell-half;
  const a=designedTerrainHeight(x0,z0),b=designedTerrainHeight(x0+cell,z0);
  const c=designedTerrainHeight(x0,z0+cell),d=designedTerrainHeight(x0+cell,z0+cell);
  return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
}
export function runwayAt(x,z){return AIRFIELDS.find(f=>Math.abs(x-f.x)<=f.length/2&&Math.abs(z-f.z)<=f.width/2)??null;}
export function surfaceHeight(x,z){const field=runwayAt(x,z);return field?designedTerrainHeight(field.x,field.z)+.23:terrainHeight(x,z);}
function seeded(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}

export function createWorld(T,scene){
  const positions=[],colours=[],indices=[],n=WORLD.segments,half=WORLD.size/2;
  const low=new T.Color(0x607852),mid=new T.Color(0x8a9671),high=new T.Color(0xa39b83),snow=new T.Color(0xd6d4c8);
  for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){
    const x=i/n*WORLD.size-half,z=j/n*WORLD.size-half,y=designedTerrainHeight(x,z);
    positions.push(x,y,z);
    const colour=low.clone();
    if(y<45)colour.lerp(mid,clamp(y/60+.04*Math.sin(x*.031+z*.017),0,1));
    else if(y<185)colour.copy(mid).lerp(high,(y-45)/140);
    else colour.copy(high).lerp(snow,clamp((y-185)/95,0,1));
    colours.push(colour.r,colour.g,colour.b);
  }
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){const a=j*(n+1)+i,b=a+1,c=a+n+1,d=c+1;indices.push(a,c,b,b,c,d);}
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new T.Float32BufferAttribute(colours,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  const terrain=new T.Mesh(geometry,new T.MeshLambertMaterial({vertexColors:true}));
  terrain.name='shared-terrain';scene.add(terrain);
  const road=new T.MeshLambertMaterial({color:0x585e59}),edge=new T.MeshLambertMaterial({color:0x9c9a7d});
  const stripes=new T.InstancedMesh(new T.PlaneGeometry(8,.45),new T.MeshBasicMaterial({color:0xeee8d1}),24);
  const dummy=new T.Object3D();let stripe=0;
  for(const field of AIRFIELDS){
    const y=designedTerrainHeight(field.x,field.z);
    const shoulder=new T.Mesh(new T.BoxGeometry(field.length+8,.12,field.width+7),edge);
    shoulder.position.set(field.x,y+.08,field.z);shoulder.name='shared-'+field.id+'-shoulder';scene.add(shoulder);
    const strip=new T.Mesh(new T.BoxGeometry(field.length,.14,field.width),road);
    strip.position.set(field.x,y+.16,field.z);strip.name='shared-'+field.id+'-runway';scene.add(strip);
    for(let k=0;k<12;k++){
      dummy.position.set(field.x+(k-5.5)*(field.length/14),y+.235,field.z);
      dummy.rotation.set(-Math.PI/2,0,0);dummy.updateMatrix();stripes.setMatrixAt(stripe++,dummy.matrix);
    }
  }
  stripes.name='shared-runway-markings';scene.add(stripes);
  const crowns=new T.InstancedMesh(new T.ConeGeometry(2.1,7,5),new T.MeshLambertMaterial({color:0x345b40}),WORLD.trees);
  const trunks=new T.InstancedMesh(new T.CylinderGeometry(.22,.3,2.6,5),new T.MeshLambertMaterial({color:0x67513c}),WORLD.trees);
  const random=seeded(73194);let count=0,attempts=0;
  while(count<WORLD.trees&&attempts++<5000){
    const x=(random()-.5)*2050,z=(random()-.5)*1350;
    if(AIRFIELDS.some(f=>Math.abs(x-f.x)<f.length/2+80&&Math.abs(z-f.z)<90))continue;
    const y=terrainHeight(x,z),scale=.8+random()*.8;
    dummy.rotation.set(0,random()*Math.PI,0);dummy.scale.setScalar(scale);
    dummy.position.set(x,y+1.3*scale,z);dummy.updateMatrix();trunks.setMatrixAt(count,dummy.matrix);
    dummy.position.y=y+5.4*scale;dummy.updateMatrix();crowns.setMatrixAt(count,dummy.matrix);count++;
  }
  crowns.name='shared-tree-canopies';trunks.name='shared-tree-trunks';scene.add(crowns,trunks);
  return {terrain,airfields:AIRFIELDS,treeCount:count,terrainTriangles:indices.length/3};
}
