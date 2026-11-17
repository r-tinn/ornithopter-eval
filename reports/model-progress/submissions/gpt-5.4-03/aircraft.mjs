import {makePanel} from './environment/source-mechanism.mjs';
import {wingPose} from './kinematics.mjs';

function material(T,color,metalness=.1,roughness=.75){
  return new T.MeshStandardMaterial({color,metalness,roughness,side:T.DoubleSide});
}

function tube(T,a,b,r,mat){
  const va=a.clone(),vb=b.clone(),delta=vb.clone().sub(va),len=delta.length();
  const mesh=new T.Mesh(new T.CylinderGeometry(r,r,len,10),mat);
  mesh.position.copy(va).addScaledVector(vb.clone().sub(va),.5);
  mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());
  return mesh;
}

function mirrored(root,node){
  root.add(node);
  const copy=node.clone(true);
  copy.scale.z*=-1;
  root.add(copy);
  return [node,copy];
}

function seatedPilot(T,height){
  const g=new T.Group();
  const suit=material(T,0x6a5948,.05,.9);
  const leather=material(T,0x4d3626,.05,.85);
  const skin=material(T,0xc58a66,.02,.95);
  const dark=material(T,0x2c2b2b,.2,.6);

  const pelvis=new T.Mesh(new T.BoxGeometry(.34,.18,.26),suit);
  pelvis.position.set(.05,.52,0);g.add(pelvis);
  const torso=new T.Mesh(new T.CapsuleGeometry(.14,.42,6,10),suit);
  torso.position.set(-.02,.84,0);torso.rotation.z=.12;g.add(torso);
  const head=new T.Mesh(new T.SphereGeometry(.11,14,10),skin);
  head.position.set(-.14,1.18,0);g.add(head);
  const helmet=new T.Mesh(new T.SphereGeometry(.118,14,10,0,Math.PI*2,0,Math.PI*.7),dark);
  helmet.position.copy(head.position);helmet.scale.y=.8;g.add(helmet);

  const limb=(length,radius,colorMat,x0,y0,z0,rx=0,rz=0)=>{
    const m=new T.Mesh(new T.CapsuleGeometry(radius,length,4,8),colorMat);
    m.position.set(x0,y0,z0);m.rotation.x=rx;m.rotation.z=rz;g.add(m);return m;
  };
  limb(.26,.05,suit,.1,.84,.19,0,1.15);
  limb(.26,.05,suit,.1,.84,-.19,0,-1.15);
  limb(.33,.045,suit,.34,.48,.11,Math.PI/2-.2,.35);
  limb(.33,.045,suit,.34,.48,-.11,Math.PI/2-.2,-.35);
  limb(.36,.045,suit,.72,.43,.11,Math.PI/2-.8,.22);
  limb(.36,.045,suit,.72,.43,-.11,Math.PI/2-.8,-.22);
  limb(.31,.042,leather,.13,.22,.09,.2,-.08);
  limb(.31,.042,leather,.13,.22,-.09,-.2,.08);
  return g;
}

function wheelMesh(T,radius,width,tyreMat,hubMat){
  const tyreGeom=new T.CylinderGeometry(radius,radius,width,20,1,true);
  tyreGeom.rotateX(Math.PI/2);
  const tyre=new T.Mesh(tyreGeom,tyreMat);
  const hub=new T.Mesh(new T.CylinderGeometry(radius*.34,radius*.34,width*1.15,16),hubMat);
  hub.geometry.rotateX(Math.PI/2);
  tyre.add(hub);
  for(let i=0;i<6;i++){
    const spoke=new T.Mesh(new T.BoxGeometry(radius*.55,.02,.02),hubMat);
    spoke.rotation.z=i*Math.PI/3;
    tyre.add(spoke);
  }
  return tyre;
}

export function createAircraft(T,p){
  const root=new T.Group();
  root.name='ornithopterRoot';

  const fabric=material(T,0xe4e0cf,.02,.96);
  const brass=material(T,0x8e7243,.45,.45);
  const steel=material(T,0x697077,.55,.4);
  const timber=material(T,0x6e5941,.1,.82);
  const dark=material(T,0x30343a,.55,.38);
  const tyreMat=material(T,0x222222,.15,.88);
  const leather=material(T,0x574032,.08,.88);

  const fuselage=new T.Group();
  root.add(fuselage);

  const keel=tube(T,new T.Vector3(2.2,.05,0),new T.Vector3(-2.6,.1,0),.05,timber);
  fuselage.add(keel);
  fuselage.add(tube(T,new T.Vector3(1.6,.35,0),new T.Vector3(-1.4,.95,0),.04,timber));
  fuselage.add(tube(T,new T.Vector3(1.6,.35,0),new T.Vector3(-1.7,.25,.42),.032,steel));
  fuselage.add(tube(T,new T.Vector3(1.6,.35,0),new T.Vector3(-1.7,.25,-.42),.032,steel));
  fuselage.add(tube(T,new T.Vector3(-1.4,.95,0),new T.Vector3(-2.4,.42,.32),.028,steel));
  fuselage.add(tube(T,new T.Vector3(-1.4,.95,0),new T.Vector3(-2.4,.42,-.32),.028,steel));

  const nacelle=new T.Mesh(new T.CapsuleGeometry(.28,1.55,8,14),material(T,0xb6bbb8,.1,.7));
  nacelle.rotation.z=Math.PI/2;
  nacelle.position.set(.35,.72,0);
  fuselage.add(nacelle);

  const fairing=new T.Mesh(new T.ConeGeometry(.22,.9,14),fabric);
  fairing.rotation.z=-Math.PI/2;
  fairing.position.set(2.4,.72,0);
  fuselage.add(fairing);

  const mast=tube(T,new T.Vector3(.3,.62,0),new T.Vector3(-.1,1.18,0),.045,steel);
  fuselage.add(mast);

  const wingCrank=new T.Mesh(new T.CylinderGeometry(.15,.15,.3,16),brass);
  wingCrank.rotation.z=Math.PI/2;
  wingCrank.position.set(.15,1.16,0);
  fuselage.add(wingCrank);

  const engine=new T.Group();
  engine.position.set(.75,.9,0);
  const engineBlock=new T.Mesh(new T.BoxGeometry(.54,.44,.44),dark);
  engine.add(engineBlock);
  const engineShroud=new T.Mesh(new T.CylinderGeometry(.18,.18,.54,14),steel);
  engineShroud.rotation.z=Math.PI/2;
  engineShroud.position.set(.05,.04,0);
  engine.add(engineShroud);
  const propShaft=new T.Mesh(new T.CylinderGeometry(.05,.05,.46,10),brass);
  propShaft.rotation.z=Math.PI/2;
  propShaft.position.set(-.36,.08,0);
  engine.add(propShaft);
  mirrored(engine,tube(T,new T.Vector3(.22,.1,.16),new T.Vector3(.58,.34,.16),.02,steel));
  fuselage.add(engine);

  const tank=new T.Mesh(new T.CylinderGeometry(.17,.17,.58,12),material(T,0x72685a,.08,.75));
  tank.rotation.z=Math.PI/2;
  tank.position.set(.55,.46,0);
  fuselage.add(tank);

  const seat=new T.Group();
  seat.position.set(.2,.4,0);
  seat.add(new T.Mesh(new T.BoxGeometry(.48,.08,.4),leather));
  const seatBack=new T.Mesh(new T.BoxGeometry(.1,.52,.42),leather);
  seatBack.position.set(-.18,.26,0);seatBack.rotation.z=.17;seat.add(seatBack);
  fuselage.add(seat);

  const pilot=seatedPilot(T,p.pilot_height_m??1.65);
  pilot.position.set(.12,.08,0);
  root.add(pilot);

  const tailBoom=tube(T,new T.Vector3(-1.6,.85,0),new T.Vector3(-4.15,1.02,0),.035,steel);
  root.add(tailBoom);
  root.add(tube(T,new T.Vector3(-1.2,.68,.28),new T.Vector3(-3.5,.82,.56),.02,steel));
  root.add(tube(T,new T.Vector3(-1.2,.68,-.28),new T.Vector3(-3.5,.82,-.56),.02,steel));

  const tailPlane=new T.Group();
  tailPlane.position.set(-4.4,1.02,0);
  const tailSurf=new T.Mesh(new T.BoxGeometry(1.2,.03,2.2),fabric);
  tailPlane.add(tailSurf);
  root.add(tailPlane);

  const elevator=new T.Group();
  elevator.position.set(-.45,0,0);
  elevator.add(new T.Mesh(new T.BoxGeometry(.36,.035,2.12),material(T,0xd0ccb8,.02,.94)));
  tailPlane.add(elevator);

  const fin=new T.Mesh(new T.BoxGeometry(.86,1.08,.05),fabric);
  fin.position.set(-4.48,1.48,0);
  fin.rotation.z=.08;
  root.add(fin);

  const rudder=new T.Group();
  rudder.position.set(-4.63,1.44,0);
  rudder.add(new T.Mesh(new T.BoxGeometry(.46,.82,.03),material(T,0xd8d1bf,.02,.94)));
  root.add(rudder);

  const leftInner=new T.Group(),rightInner=new T.Group(),leftOuter=new T.Group(),rightOuter=new T.Group();
  const leftInnerSurface=new T.Group(),rightInnerSurface=new T.Group(),leftOuterSurface=new T.Group(),rightOuterSurface=new T.Group();
  leftInner.add(leftInnerSurface);rightInner.add(rightInnerSurface);leftOuter.add(leftOuterSurface);rightOuter.add(rightOuterSurface);
  root.add(leftInner,rightInner,leftOuter,rightOuter);

  const wingPanels={
    leftInner:[new T.Mesh(makePanel(T,p,'leftInner'),fabric)],
    rightInner:[new T.Mesh(makePanel(T,p,'rightInner'),fabric)],
    leftOuter:[new T.Mesh(makePanel(T,p,'leftOuter',0),fabric),new T.Mesh(makePanel(T,p,'leftOuter',1),fabric)],
    rightOuter:[new T.Mesh(makePanel(T,p,'rightOuter',0),fabric),new T.Mesh(makePanel(T,p,'rightOuter',1),fabric)]
  };
  leftInnerSurface.add(...wingPanels.leftInner);
  rightInnerSurface.add(...wingPanels.rightInner);
  leftOuterSurface.add(...wingPanels.leftOuter);
  rightOuterSurface.add(...wingPanels.rightOuter);

  const spanHalf=(p.span_m??14)/2;
  const wrist=spanHalf*(p.wrist_span_fraction??.5);
  const innerSpar=tube(T,new T.Vector3(.08,1.15,.2),new T.Vector3(0,1.15,wrist-.18),.035,timber);
  const outerSpar=tube(T,new T.Vector3(0,1.15,wrist+.02),new T.Vector3(-.52,1.06,spanHalf-.28),.024,steel);
  const innerSparR=innerSpar.clone(true);innerSparR.scale.z*=-1;
  const outerSparR=outerSpar.clone(true);outerSparR.scale.z*=-1;
  leftInner.add(innerSpar);rightInner.add(innerSparR);
  leftOuter.add(outerSpar);rightOuter.add(outerSparR);

  const truss=tube(T,new T.Vector3(.18,.9,.18),new T.Vector3(.1,1.15,wrist-.1),.016,brass);
  const trussR=truss.clone(true);trussR.scale.z*=-1;
  leftInner.add(truss);rightInner.add(trussR);

  const wingBraceL=tube(T,new T.Vector3(.28,.55,.18),new T.Vector3(-.1,1.07,wrist-.46),.015,steel);
  root.add(wingBraceL);
  const wingBraceR=wingBraceL.clone(true);wingBraceR.scale.z=-1;root.add(wingBraceR);

  const wheelGroups=[];
  const wheels=[];
  for(const gear of p.gear_centres){
    const group=new T.Group();
    group.position.set(gear[0],gear[1]+(p.wheel_radius_m??.23),gear[2]);
    const wheel=wheelMesh(T,p.wheel_radius_m??.23,.09,tyreMat,steel);
    group.add(wheel);
    root.add(group);
    wheelGroups.push(group);
    wheels.push(wheel);
  }
  root.add(tube(T,new T.Vector3(2,.18,0),new T.Vector3(-.45,.18,.92),.03,steel));
  root.add(tube(T,new T.Vector3(2,.18,0),new T.Vector3(-.45,.18,-.92),.03,steel));
  root.add(tube(T,new T.Vector3(-.45,.18,.92),new T.Vector3(-.45,.18,-.92),.03,steel));
  root.add(tube(T,new T.Vector3(2,.18,0),new T.Vector3(2,-.12,0),.03,steel));
  root.add(tube(T,new T.Vector3(-.45,.18,.92),new T.Vector3(-.45,-.12,.92),.025,steel));
  root.add(tube(T,new T.Vector3(-.45,.18,-.92),new T.Vector3(-.45,-.12,-.92),.025,steel));

  const crankLeft=tube(T,new T.Vector3(.15,1.16,0),new T.Vector3(.08,1.15,wrist-.12),.018,brass);
  const crankRight=crankLeft.clone(true);crankRight.scale.z=-1;
  root.add(crankLeft,crankRight);

  const aircraft={
    root,
    leftInner,
    rightInner,
    leftOuter,
    rightOuter,
    leftInnerSurface,
    rightInnerSurface,
    leftOuterSurface,
    rightOuterSurface,
    rudder,
    elevator,
    pilot,
    wheels,
    wingPanels
  };
  aircraft._wheelGroups=wheelGroups;
  aircraft._cranks=[crankLeft,crankRight];
  aircraft._tailPlane=tailPlane;
  return aircraft;
}

export function updateAircraft(a,s,c){
  const wheelAngle=s?.wheel_angle??0;
  for(const wheel of a.wheels)wheel.rotation.z=wheelAngle;
  a.rudder.rotation.y=.45*(c?.rudder??0);
  a.elevator.rotation.z=-.28*(c?.pitch??0);
  const pose=wingPose(s);
  const crankSweep=pose.leftInner.stroke-(pose.leftOuter.stroke*.3);
  if(a._cranks?.[0])a._cranks[0].rotation.x=.12+.65*crankSweep;
  if(a._cranks?.[1])a._cranks[1].rotation.x=.12+.65*crankSweep;
  if(a.pilot){
    a.pilot.rotation.z=-.08*(c?.bank??0);
    a.pilot.position.y=.08+.02*Math.sin(s?.phase??0);
  }
  if(a._tailPlane)a._tailPlane.rotation.x=.02*Math.sin((s?.phase??0)*2);
}
