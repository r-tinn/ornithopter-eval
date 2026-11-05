import {makePanel} from './environment/source-mechanism.mjs';

function mat(T,color,roughness=.65,metalness=.15,extra={}){
  return new T.MeshStandardMaterial({color,roughness,metalness,...extra});
}
function mesh(T,g,m,parent,name){
  const x=new T.Mesh(g,m);x.name=name||'';parent.add(x);return x;
}
function beam(T,parent,a,b,r,m,name){
  const A=new T.Vector3(...a),B=new T.Vector3(...b),d=B.clone().sub(A);
  const x=mesh(T,new T.CylinderGeometry(r,r,d.length(),10),m,parent,name);
  x.position.copy(A.add(B).multiplyScalar(.5));
  x.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());
  return x;
}

export function createAircraft(T,p){
  const root=new T.Group();root.name='Silver Swan mechanical ornithopter';
  const ivory=mat(T,0xe8dfc8,.82,.03),tube=mat(T,0x334448,.3,.72);
  const bronze=mat(T,0xa66a32,.28,.75),dark=mat(T,0x161c1d,.5,.45);
  const red=mat(T,0x8f2f25,.58,.12),skin=mat(T,0xc98f68,.8,0),leather=mat(T,0x503224,.82,.05);
  const fabric=mat(T,0xd8d1b8,.76,.02,{side:T.DoubleSide,transparent:true,opacity:.92});
  const outerFabric=mat(T,0xc4d5cf,.68,.03,{side:T.DoubleSide,transparent:true,opacity:.84});

  // Slender welded-tube keel and open pilot cage.
  beam(T,root,[-2.8,-.12,0],[2.55,-.12,0],.105,tube,'keel');
  beam(T,root,[-2.35,-.12,0],[-1.55,.7,0],.065,tube);
  beam(T,root,[-1.55,.7,0],[.75,.72,0],.065,tube);
  beam(T,root,[.75,.72,0],[2.35,-.12,0],.065,tube);
  for(const z of [-.42,.42]){
    beam(T,root,[-1.55,.7,z],[.75,.72,z],.038,tube);
    beam(T,root,[-1.55,.7,z],[-2.35,-.12,0],.035,tube);
    beam(T,root,[.75,.72,z],[2.35,-.12,0],.035,tube);
    beam(T,root,[-.85,-.08,z],[-.85,.72,z],.034,tube);
  }
  const nose=mesh(T,new T.ConeGeometry(.34,1.25,16),ivory,root,'nose fairing');
  nose.rotation.z=-Math.PI/2;nose.position.set(2.48,-.02,0);
  const tank=mesh(T,new T.CapsuleGeometry(.25,.72,5,10),red,root,'fuel tank');
  tank.rotation.z=Math.PI/2;tank.position.set(-.75,.14,0);

  // Visible engine, reduction wheel, crank and opposed push rods.
  const engine=mesh(T,new T.BoxGeometry(.62,.65,.7),dark,root,'16 kW engine');
  engine.position.set(.72,.22,0);
  for(const z of [-.39,.39]){const cyl=mesh(T,new T.CylinderGeometry(.17,.2,.28,12),dark,root,'cylinder');cyl.rotation.x=Math.PI/2;cyl.position.set(.72,.38,z);}
  const flywheel=mesh(T,new T.TorusGeometry(.42,.055,10,30),bronze,root,'reduction wheel');
  flywheel.position.set(.05,.72,0);
  const crank=beam(T,root,[.05,.72,-.04],[.05,1.12,-.04],.045,bronze,'crank');
  const pushL=beam(T,root,[.05,1.1,-.04],[-.05,.81,-1.78],.028,bronze,'left pushrod');
  const pushR=beam(T,root,[.05,1.1,.04],[-.05,.81,1.78],.028,bronze,'right pushrod');

  // Source-linked surfaces must remain identity groups directly below root.
  const wingPanels={},surfaces={};
  for(const name of ['leftInner','leftOuter','rightInner','rightOuter']){
    const group=new T.Group();group.name=name;root.add(group);
    const surface=new T.Group();surface.name=name+'Surface';group.add(surface);
    wingPanels[name]=[];
    const count=name.endsWith('Outer')?2:1;
    for(let leaf=0;leaf<count;leaf++){
      const panel=mesh(T,makePanel(T,p,name,leaf),name.endsWith('Outer')?outerFabric:fabric,surface,name+' leaf '+leaf);
      wingPanels[name].push(panel);
    }
    surfaces[name]=[group,surface];
  }
  // Hinges and spanwise spars remain readable while the membrane itself is
  // supplied by the shared source mechanism.
  for(const z of [-.25,.25]){
    const h=mesh(T,new T.CylinderGeometry(.11,.11,.34,12),bronze,root,'wing hinge');
    h.rotation.x=Math.PI/2;h.position.set(0,.8,z);
  }
  // Conventional source-compatible tail: fixed stabiliser, elevator, fin/rudder.
  const stab=mesh(T,new T.BoxGeometry(1.22,.045,2.55),fabric,root,'tailplane');
  stab.position.set(-2.55,.18,0);
  const elevator=new T.Group();elevator.name='elevator';root.add(elevator);
  const elev=mesh(T,new T.BoxGeometry(.48,.035,2.35),red,elevator,'elevator surface');elev.position.set(-3.05,.18,0);
  const fin=mesh(T,new T.BufferGeometry(),fabric,root,'fin');
  fin.geometry.setAttribute('position',new T.Float32BufferAttribute([-2.75,.18,0,-2.3,1.45,0,-1.85,.18,0],3));
  fin.geometry.setIndex([0,1,2]);fin.geometry.computeVertexNormals();
  const rudder=new T.Group();rudder.name='rudder';root.add(rudder);
  const rud=mesh(T,new T.BufferGeometry(),red,rudder,'rudder surface');
  rud.geometry.setAttribute('position',new T.Float32BufferAttribute([-2.76,.2,0,-2.3,1.43,0,-3.05,.25,0],3));
  rud.geometry.setIndex([0,1,2]);rud.geometry.computeVertexNormals();

  // Three true tyres, with their rolling axle along body z.
  const wheels=[];
  for(let i=0;i<p.gear_centres.length;i++){
    const q=p.gear_centres[i],w=mesh(T,new T.TorusGeometry(p.wheel_radius_m-.065,.065,10,22),dark,root,'tyre '+i);
    w.position.set(...q);wheels.push(w);
    beam(T,root,[q[0],q[1]+.05,q[2]],[q[0]-.18,-.18,q[2]*.58],.027,tube,'gear leg');
    const hub=mesh(T,new T.CylinderGeometry(.055,.055,.13,12),bronze,root,'wheel hub');
    hub.rotation.x=Math.PI/2;hub.position.set(...q);
  }

  // A recognisable seated, helmeted 1.65 m adult with hands on the controls.
  const pilot=new T.Group();pilot.name='pilot';root.add(pilot);
  const seat=mesh(T,new T.BoxGeometry(.62,.12,.58),leather,pilot,'seat');seat.position.set(-.58,.18,0);
  const torso=mesh(T,new T.CapsuleGeometry(.2,.48,5,10),red,pilot,'pilot torso');torso.position.set(-.58,.72,0);
  const head=mesh(T,new T.SphereGeometry(.17,16,12),skin,pilot,'pilot head');head.position.set(-.55,1.22,0);
  const helmet=mesh(T,new T.SphereGeometry(.185,16,8,0,Math.PI*2,0,Math.PI*.58),ivory,pilot,'helmet');helmet.position.set(-.55,1.25,0);
  for(const z of [-.18,.18]){
    beam(T,pilot,[-.52,.9,z],[-.12,.61,z*.75],.06,red,'arm');
    beam(T,pilot,[-.52,.3,z],[-.02,-.12,z*.9],.075,leather,'leg');
  }
  beam(T,root,[-.08,.47,-.28],[-.08,.47,.28],.018,bronze,'control bar');

  return {root,
    leftInner:surfaces.leftInner[0],leftInnerSurface:surfaces.leftInner[1],
    leftOuter:surfaces.leftOuter[0],leftOuterSurface:surfaces.leftOuter[1],
    rightInner:surfaces.rightInner[0],rightInnerSurface:surfaces.rightInner[1],
    rightOuter:surfaces.rightOuter[0],rightOuterSurface:surfaces.rightOuter[1],
    wingPanels,rudder,elevator,pilot,wheels,flywheel,crank,pushL,pushR};
}

export function updateAircraft(a,s,c){
  for(const w of a.wheels)w.rotation.z=-(s.wheel_angle||0);
  a.rudder.rotation.y=-.38*(c.rudder||0);
  a.elevator.rotation.z=.28*(c.pitch||0);
  a.flywheel.rotation.z=s.phase;
  // The crank detail communicates phase without touching host wing geometry.
  a.crank.rotation.z=.22*Math.sin(s.phase);
  a.pushL.rotation.x=.035*Math.sin(s.phase);
  a.pushR.rotation.x=-.035*Math.sin(s.phase);
}
