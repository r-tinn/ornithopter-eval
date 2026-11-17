import {makePanel} from './environment/source-mechanism.mjs';

function tube(T,length,radius,color){
  return new T.Mesh(
    new T.CylinderGeometry(radius,radius,length,10),
    new T.MeshStandardMaterial({color,roughness:.7,metalness:.45}),
  );
}

function box(T,size,color){
  return new T.Mesh(
    new T.BoxGeometry(size[0],size[1],size[2]),
    new T.MeshStandardMaterial({color,roughness:.8,metalness:.2}),
  );
}

function rodBetween(T,a,b,radius,color){
  const v=new T.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
  const mesh=tube(T,v.length(),radius,color);
  mesh.position.set((a[0]+b[0])*.5,(a[1]+b[1])*.5,(a[2]+b[2])*.5);
  mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());
  return mesh;
}

export function createAircraft(T,p){
  const root=new T.Group();
  root.name='ornithopterRoot';

  const fabric=new T.MeshStandardMaterial({color:0xe8e0cf,side:T.DoubleSide,roughness:.95,metalness:0});
  const bronze=0x735c34, steel=0x666b70, dark=0x2a2f33, wood=0x7c5a38, leather=0x5b3a25;

  const fuselage=new T.Group();
  root.add(fuselage);
  const keel=tube(T,p.body_length_m*.72,.09,dark);
  keel.rotation.z=Math.PI/2;
  keel.position.x=-.15;
  fuselage.add(keel);
  const upperLongeron=tube(T,p.body_length_m*.62,.05,steel);
  upperLongeron.rotation.z=Math.PI/2;
  upperLongeron.position.set(-.1,.55,0);
  fuselage.add(upperLongeron);
  const noseCone=new T.Mesh(new T.ConeGeometry(.18,.7,12),new T.MeshStandardMaterial({color:bronze,roughness:.55,metalness:.35}));
  noseCone.rotation.z=-Math.PI/2;
  noseCone.position.set(2.55,-.05,0);
  fuselage.add(noseCone);
  const cockpit=box(T,[1.15,.45,.62],wood);
  cockpit.position.set(.55,.05,0);
  fuselage.add(cockpit);
  const fairing=new T.Mesh(new T.CapsuleGeometry(.24,.9,6,12),new T.MeshStandardMaterial({color:0x8f7a5d,roughness:.8,metalness:.1}));
  fairing.rotation.z=Math.PI/2;
  fairing.position.set(.1,.28,0);
  fuselage.add(fairing);

  for(const z of [-.42,.42]){
    fuselage.add(rodBetween(T,[1.8,-.15,0],[.15,.75,z],.028,steel));
    fuselage.add(rodBetween(T,[1.3,-.2,z],[ -1.8,.38,0],.024,steel));
    fuselage.add(rodBetween(T,[.35,.72,z],[-1.6,-.28,z*.7],.018,steel));
  }

  const engineFrame=new T.Group();
  engineFrame.position.set(-.2,.52,0);
  fuselage.add(engineFrame);
  const hoop=new T.Mesh(new T.TorusGeometry(.34,.03,10,24,Math.PI*2),new T.MeshStandardMaterial({color:steel,roughness:.65,metalness:.5}));
  hoop.rotation.y=Math.PI/2;
  engineFrame.add(hoop);
  const propHub=new T.Mesh(new T.CylinderGeometry(.09,.09,.16,14),new T.MeshStandardMaterial({color:dark,roughness:.45,metalness:.6}));
  propHub.rotation.z=Math.PI/2;
  engineFrame.add(propHub);
  const crankLeft=new T.Group(),crankRight=new T.Group();
  crankLeft.position.set(.15,.48,-.46);
  crankRight.position.set(.15,.48,.46);
  root.add(crankLeft,crankRight);
  const crankDiscL=new T.Mesh(new T.CylinderGeometry(.18,.18,.04,20),new T.MeshStandardMaterial({color:bronze,roughness:.5,metalness:.45}));
  crankDiscL.rotation.x=Math.PI/2;
  crankLeft.add(crankDiscL);
  const crankDiscR=crankDiscL.clone();
  crankRight.add(crankDiscR);
  const pushrodL=rodBetween(T,[0,0,0],[0,.72,0],.022,steel);
  const pushrodR=rodBetween(T,[0,0,0],[0,.72,0],.022,steel);
  crankLeft.add(pushrodL);
  crankRight.add(pushrodR);

  const mast=rodBetween(T,[.2,-.2,0],[.2,1.05,0],.038,steel);
  fuselage.add(mast);
  const shoulderBeam=tube(T,2.7,.055,dark);
  shoulderBeam.rotation.x=Math.PI/2;
  shoulderBeam.position.set(.22,.9,0);
  fuselage.add(shoulderBeam);

  const leftInner=new T.Group(),leftOuter=new T.Group(),rightInner=new T.Group(),rightOuter=new T.Group();
  const leftInnerSurface=new T.Group(),leftOuterSurface=new T.Group(),rightInnerSurface=new T.Group(),rightOuterSurface=new T.Group();
  leftInner.add(leftInnerSurface);leftOuter.add(leftOuterSurface);rightInner.add(rightInnerSurface);rightOuter.add(rightOuterSurface);
  root.add(leftInner,leftOuter,rightInner,rightOuter);

  const wingPanels={
    leftInner:[new T.Mesh(makePanel(T,p,'leftInner'),fabric)],
    rightInner:[new T.Mesh(makePanel(T,p,'rightInner'),fabric)],
    leftOuter:[new T.Mesh(makePanel(T,p,'leftOuter',0),fabric),new T.Mesh(makePanel(T,p,'leftOuter',1),fabric)],
    rightOuter:[new T.Mesh(makePanel(T,p,'rightOuter',0),fabric),new T.Mesh(makePanel(T,p,'rightOuter',1),fabric)],
  };
  leftInnerSurface.add(...wingPanels.leftInner);
  rightInnerSurface.add(...wingPanels.rightInner);
  leftOuterSurface.add(...wingPanels.leftOuter);
  rightOuterSurface.add(...wingPanels.rightOuter);

  const tailBoomL=rodBetween(T,[-.4,.25,-.24],[-2.7,.62,-.46],.024,steel);
  const tailBoomR=rodBetween(T,[-.4,.25,.24],[-2.7,.62,.46],.024,steel);
  const tailBoomC=rodBetween(T,[-.5,-.08,0],[-2.85,.3,0],.03,dark);
  fuselage.add(tailBoomL,tailBoomR,tailBoomC);

  const tailplane=new T.Group();
  tailplane.position.set(-2.8,.62,0);
  root.add(tailplane);
  const tailFixed=box(T,[.62,.06,2.15],wood);
  tailFixed.position.set(.08,0,0);
  tailplane.add(tailFixed);
  const elevator=new T.Group();
  elevator.position.set(-.18,0,0);
  tailplane.add(elevator);
  const elevatorSurface=box(T,[.46,.04,2.05],0xd9d0c1);
  elevatorSurface.material.side=T.DoubleSide;
  elevator.add(elevatorSurface);

  const finPost=box(T,[.08,1.1,.14],wood);
  finPost.position.set(-3.05,1.02,0);
  root.add(finPost);
  const fin=new T.Mesh(new T.BufferGeometry(),new T.MeshStandardMaterial({color:0xdccfb9,side:T.DoubleSide,roughness:.95,metalness:0}));
  const finShape=new T.Shape();
  finShape.moveTo(0,0);finShape.lineTo(.7,.16);finShape.quadraticCurveTo(.95,.55,.45,1.18);finShape.lineTo(0,1.02);finShape.lineTo(0,0);
  fin.geometry=new T.ShapeGeometry(finShape);
  fin.rotation.y=Math.PI/2;
  fin.position.set(-3.05,.42,-.01);
  root.add(fin);
  const rudder=new T.Group();
  rudder.position.set(-3.02,.48,0);
  root.add(rudder);
  const rudderShape=new T.Shape();
  rudderShape.moveTo(0,0);rudderShape.lineTo(.45,.1);rudderShape.quadraticCurveTo(.6,.5,.24,1.0);rudderShape.lineTo(0,.9);rudderShape.lineTo(0,0);
  const rudderSurface=new T.Mesh(new T.ShapeGeometry(rudderShape),new T.MeshStandardMaterial({color:0xe7dbc8,side:T.DoubleSide,roughness:.95,metalness:0}));
  rudderSurface.rotation.y=Math.PI/2;
  rudder.add(rudderSurface);

  const pilot=new T.Group();
  root.add(pilot);
  pilot.position.set(.5,.46,0);
  const torso=new T.Mesh(new T.CapsuleGeometry(.18,.42,6,12),new T.MeshStandardMaterial({color:0x5b6676,roughness:.9,metalness:.05}));
  torso.rotation.z=.08;
  pilot.add(torso);
  const head=new T.Mesh(new T.SphereGeometry(.12,16,12),new T.MeshStandardMaterial({color:0xd6b29a,roughness:.9,metalness:0}));
  head.position.set(.08,.42,0);
  pilot.add(head);
  const helmet=new T.Mesh(new T.SphereGeometry(.125,16,12,0,Math.PI*2,0,Math.PI*.7),new T.MeshStandardMaterial({color:0x42352d,roughness:.6,metalness:.15}));
  helmet.position.copy(head.position);
  helmet.position.y+=.02;
  pilot.add(helmet);
  const seat=box(T,[.34,.08,.46],leather);
  seat.position.set(-.06,-.22,0);
  seat.rotation.z=-.1;
  pilot.add(seat);
  for(const side of [-1,1]){
    const arm=rodBetween(T,[.02,.18,0],[.34,.04,.24*side],.035,0x495667);
    const forearm=rodBetween(T,[.34,.04,.24*side],[.62,-.02,.45*side],.028,0x495667);
    const thigh=rodBetween(T,[-.05,-.1,.12*side],[.22,-.38,.15*side],.04,0x4d5661);
    const shin=rodBetween(T,[.22,-.38,.15*side],[.78,-.74,.16*side],.032,0x4d5661);
    const boot=box(T,[.18,.08,.1],0x2f241e);
    boot.position.set(.86,-.78,.16*side);
    pilot.add(arm,forearm,thigh,shin,boot);
  }

  const wheelMaterial=new T.MeshStandardMaterial({color:0x232323,roughness:.95,metalness:.05});
  const hubMaterial=new T.MeshStandardMaterial({color:steel,roughness:.5,metalness:.55});
  const wheels=p.gear_centres.map((centre,i)=>{
    const carrier=new T.Group();
    carrier.position.set(...centre);
    root.add(carrier);
    const strutTop=i===0?[1.45,.28,0]:[-.32,.12,0];
    root.add(rodBetween(T,strutTop,centre,.03,steel));
    if(i!==0)root.add(rodBetween(T,[-.4,.45,centre[2]*.35],centre,.022,steel));
    const wheel=new T.Mesh(new T.TorusGeometry(p.wheel_radius_m,.045,12,24),wheelMaterial);
    carrier.add(wheel);
    const hub=new T.Mesh(new T.CylinderGeometry(.045,.045,.14,16),hubMaterial);
    hub.rotation.x=Math.PI/2;
    carrier.add(hub);
    return wheel;
  });

  return {
    root,
    leftInner,leftOuter,rightInner,rightOuter,
    leftInnerSurface,leftOuterSurface,rightInnerSurface,rightOuterSurface,
    rudder,elevator,pilot,wheels,wingPanels,
    linkage:{crankLeft,crankRight,pushrodL,pushrodR},
  };
}

export function updateAircraft(a,s,c){
  for(const wheel of a.wheels)wheel.rotation.z=s.wheel_angle??0;
  a.rudder.rotation.y=-(c?.rudder??0)*.45;
  a.elevator.rotation.z=(c?.pitch??0)*.22;
  if(a.linkage){
    const phase=s.gliding?0:s.phase;
    a.linkage.crankLeft.rotation.z=phase;
    a.linkage.crankRight.rotation.z=phase+Math.PI;
    a.linkage.pushrodL.rotation.z=.32*Math.sin(phase);
    a.linkage.pushrodR.rotation.z=.32*Math.sin(phase+Math.PI);
  }
}
