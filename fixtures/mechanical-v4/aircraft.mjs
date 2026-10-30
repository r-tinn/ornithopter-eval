// Handwritten review fixture. This file is withheld from evaluated models.
export function createAircraft(T,parameters){
  const root=new T.Group();root.name='fixture-mechanical-airframe';
  const frame=new T.MeshLambertMaterial({color:0x414e4c}),wood=new T.MeshLambertMaterial({color:0xa17846});
  const cloth=new T.MeshLambertMaterial({color:0xe8d7af,side:T.DoubleSide});
  const copper=new T.MeshLambertMaterial({color:0xb56c3e}),rubber=new T.MeshLambertMaterial({color:0x252e2a});
  function part(geometry,material,parent,x=0,y=0,z=0){const mesh=new T.Mesh(geometry,material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;}
  function rod(parent,a,b,r=.018,material=frame){
    const p=new T.Vector3(...a),q=new T.Vector3(...b),delta=q.clone().sub(p);
    const m=part(new T.CylinderGeometry(r,r,delta.length(),6),material,parent);
    m.position.copy(p).add(q).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());return m;
  }
  // Open structural fuselage, motor and tail boom.
  for(const z of [-.12,.12]){
    rod(root,[-.9,0,z*.25],[.7,0,z]);rod(root,[-.55,-.22,z],[.55,-.22,z]);
    rod(root,[-.55,-.22,z],[-.25,.12,z]);rod(root,[-.25,.12,z],[.25,-.22,z]);rod(root,[.25,-.22,z],[.7,0,z]);
  }
  for(const x of [-.55,.25,.6])rod(root,[x,-.22,-.12],[x,-.22,.12]);
  part(new T.BoxGeometry(.42,.24,.24),copper,root,.28,-.08,0);
  const axle=part(new T.CylinderGeometry(.065,.065,.42,10),frame,root,.1,.14,0);axle.rotation.x=Math.PI/2;
  part(new T.BoxGeometry(.26,.1,.21),frame,root,-.3,-.17,0);
  const leftInner=new T.Group(),rightInner=new T.Group(),leftOuter=new T.Group(),rightOuter=new T.Group();
  function panel(parent,start,end,chordA,chordB){
    const x=.1,points=[x+chordA*.4,0,start,x-chordA*.6,0,start,x+chordB*.4,0,end,x-chordB*.6,0,end];
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(points,3));geo.setIndex([0,1,2,1,3,2]);geo.computeVertexNormals();
    part(geo,cloth,parent);
    rod(parent,[x+chordA*.4,.006,start],[x+chordB*.4,.006,end],.012,wood);
    rod(parent,[x-chordA*.6,.006,start],[x-chordB*.6,.006,end],.01,wood);
    for(let i=0;i<=4;i++){const t=i/4,z=start+(end-start)*t,c=chordA+(chordB-chordA)*t;rod(parent,[x+c*.4,.008,z],[x-c*.6,.008,z],.006,wood);}
  }
  for(const [sign,inner,outer] of [[-1,leftInner,leftOuter],[1,rightInner,rightOuter]]){
    inner.position.set(0,.16,sign*.1);root.add(inner);
    panel(inner,0,sign*.65,.47,.47);
    outer.position.set(0,0,sign*.65);inner.add(outer);panel(outer,0,sign*.75,.47,.19);
    part(new T.SphereGeometry(.045,8,6),copper,outer);
    rod(root,[.1,-.12,sign*.12],[.1,.13,sign*.1],.025);
  }
  const elevator=new T.Group();elevator.position.set(-.85,.02,0);root.add(elevator);
  part(new T.BoxGeometry(.26,.018,.85),cloth,elevator);rod(elevator,[0,.015,-.42],[0,.015,.42],.011,wood);
  const rudder=new T.Group();rudder.position.set(-.91,.04,0);root.add(rudder);
  const fin=new T.BufferGeometry();fin.setAttribute('position',new T.Float32BufferAttribute([.1,0,0,-.16,0,0,-.12,.46,0,.02,.3,0],3));fin.setIndex([0,1,2,0,2,3]);fin.computeVertexNormals();part(fin,cloth,rudder);
  rod(rudder,[-.16,0,0],[-.12,.46,0],.009,wood);
  const wheels=[];
  for(const [x,y,z] of parameters.gear_centres){
    rod(root,[x,-.15,z*.3],[x,y,z],.022,frame);
    const wheel=part(new T.CylinderGeometry(parameters.wheel_radius_m,parameters.wheel_radius_m,.085,12),rubber,root,x,y,z);
    wheel.rotation.x=Math.PI/2;wheel.name='landing-wheel';wheels.push(wheel);
    const hub=part(new T.CylinderGeometry(.055,.055,.09,8),copper,wheel);hub.rotation.set(0,0,0);
  }
  // Bake rigid rods/panels into material batches; retain the articulated groups.
  for(const group of [root,leftInner,leftOuter,rightInner,rightOuter,rudder,elevator]){
    const batches=new Map();
    for(const child of [...group.children]){
      if(!child.isMesh||child.name==='landing-wheel')continue;
      child.updateMatrix();const geometry=(child.geometry.index?child.geometry.toNonIndexed():child.geometry.clone()).applyMatrix4(child.matrix);
      const batch=batches.get(child.material)??[];batch.push(geometry);batches.set(child.material,batch);
      group.remove(child);child.geometry.dispose();
    }
    for(const [material,chunks] of batches){
      const geometry=new T.BufferGeometry();
      for(const attribute of ['position','normal']){
        const data=new Float32Array(chunks.reduce((n,g)=>n+g.getAttribute(attribute).array.length,0));let offset=0;
        for(const g of chunks){data.set(g.getAttribute(attribute).array,offset);offset+=g.getAttribute(attribute).array.length;}
        geometry.setAttribute(attribute,new T.BufferAttribute(data,3));
      }
      group.add(new T.Mesh(geometry,material));for(const g of chunks)g.dispose();
    }
  }
  return {root,leftInner,leftOuter,rightInner,rightOuter,rudder,elevator,wheels};
}
export function updateAircraft(aircraft,state,controls){
  const inner=controls.throttle>0?.35*Math.sin(state.phase):0;
  const outer=controls.throttle>0?.25*Math.sin(state.phase-.65):0;
  aircraft.leftInner.rotation.x=-inner;aircraft.rightInner.rotation.x=inner;
  aircraft.leftOuter.rotation.x=-outer;aircraft.rightOuter.rotation.x=outer;
  aircraft.rudder.rotation.y=controls.rudder*.4;aircraft.elevator.rotation.z=controls.pitch*.22;
}
