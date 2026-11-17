import {makePanel} from './environment/source-mechanism.mjs';

function material(T,color,metalness=.2,roughness=.7){
  return new T.MeshStandardMaterial({color,metalness,roughness});
}

function tube(T,length,radius,color,rx=0,ry=0,rz=0){
  const m=new T.Mesh(new T.CylinderGeometry(radius,radius,length,10),material(T,color,.35,.6));
  m.rotation.set(rx,ry,rz);
  return m;
}

function add(parent,child,x=0,y=0,z=0){
  child.position.set(x,y,z);
  parent.add(child);
  return child;
}

function seatedPilot(T,height){
  const pilot=new T.Group();
  const suit=material(T,0x6d4d35,.05,.95);
  const skin=material(T,0xd8b08d,.05,.9);
  const dark=material(T,0x302a28,.15,.75);
  const torso=add(pilot,new T.Mesh(new T.CylinderGeometry(0.17,0.2,0.72,12),suit),0,0.55,0);
  torso.rotation.z=0.08;
  add(pilot,new T.Mesh(new T.SphereGeometry(0.18,14,12),suit),0,0.82,0);
  add(pilot,new T.Mesh(new T.SphereGeometry(0.2,14,12),suit),0,0.28,0);
  add(pilot,new T.Mesh(new T.SphereGeometry(0.13,14,12),skin),0.12,0.95,0);
  add(pilot,new T.Mesh(new T.SphereGeometry(0.14,14,12),dark),0.12,1.0,0).scale.set(1,.85,1);
  const pelvis=add(pilot,new T.Mesh(new T.SphereGeometry(0.16,12,10),suit),-0.05,0.35,0);
  pelvis.scale.set(1.1,.8,1);
  for(const side of [-1,1]){
    const upperArm=add(pilot,new T.Mesh(new T.CylinderGeometry(0.045,0.05,0.34,10),suit),0.1,0.63,0.17*side);
    upperArm.rotation.z=0.95*side;
    upperArm.rotation.x=0.25;
    const foreArm=add(pilot,new T.Mesh(new T.CylinderGeometry(0.038,0.043,0.3,10),suit),0.33,0.48,0.23*side);
    foreArm.rotation.z=1.2*side;
    foreArm.rotation.x=0.15;
    add(pilot,new T.Mesh(new T.CylinderGeometry(0.055,0.06,0.44,10),suit),-0.02,0.14,0.11*side).rotation.z=-0.78*side;
    add(pilot,new T.Mesh(new T.CylinderGeometry(0.045,0.05,0.42,10),dark),0.25,-0.02,0.12*side).rotation.z=-1.06*side;
    add(pilot,new T.Mesh(new T.BoxGeometry(0.14,0.05,0.08),dark),0.45,-0.2,0.16*side);
  }
  pilot.scale.setScalar(height/1.65);
  return pilot;
}

export function createAircraft(T,p){
  const root=new T.Group();
  root.name='ornithopter';

  const bronze=material(T,0xa88147,.45,.45);
  const steel=material(T,0x6e7376,.65,.42);
  const darkSteel=material(T,0x41484b,.55,.45);
  const wood=material(T,0x72563b,.15,.82);
  const fabric=new T.MeshStandardMaterial({color:0xe6e0ce,metalness:0.02,roughness:0.95,side:T.DoubleSide});
  const leather=material(T,0x574332,.1,.9);

  const fuselage=new T.Group();
  root.add(fuselage);
  add(fuselage,tube(T,p.body_length_m*0.72,0.08,wood,0,0,Math.PI/2),0.1,-0.05,0);
  add(fuselage,tube(T,p.body_length_m*0.45,0.05,steel,0,0,Math.PI/2),-0.2,0.26,0);
  add(fuselage,tube(T,1.15,0.06,steel,0,0,0),-0.65,0.32,0);
  add(fuselage,tube(T,1.2,0.05,steel,0,0,0),0.55,0.22,0);
  add(fuselage,new T.Mesh(new T.ConeGeometry(0.13,0.42,14),bronze),2.52,-0.03,0).rotation.z=-Math.PI/2;
  add(fuselage,new T.Mesh(new T.SphereGeometry(0.16,14,12),bronze),2.32,-0.03,0);

  const cockpit=add(fuselage,new T.Group(),-0.22,0.1,0);
  add(cockpit,new T.Mesh(new T.BoxGeometry(0.75,0.08,0.72),wood),0.05,0.05,0);
  add(cockpit,new T.Mesh(new T.BoxGeometry(0.88,0.04,0.78),steel),0.02,0.32,0);
  add(cockpit,tube(T,0.68,0.03,steel,0,0,0),-0.28,0.36,0.3);
  add(cockpit,tube(T,0.68,0.03,steel,0,0,0),-0.28,0.36,-0.3);
  add(cockpit,new T.Mesh(new T.BoxGeometry(0.42,0.08,0.62),leather),-0.12,0.22,0);
  add(cockpit,new T.Mesh(new T.BoxGeometry(0.22,0.35,0.62),leather),-0.3,0.42,0);

  const pilot=seatedPilot(T,1.65);
  pilot.position.set(-0.05,0.15,0);
  root.add(pilot);

  const engineBed=add(root,new T.Group(),0.15,0.55,0);
  add(engineBed,new T.Mesh(new T.BoxGeometry(0.86,0.16,0.42),darkSteel),0,0,0);
  add(engineBed,new T.Mesh(new T.CylinderGeometry(0.14,0.14,0.54,16),darkSteel),0.18,0.18,0).rotation.z=Math.PI/2;
  add(engineBed,new T.Mesh(new T.CylinderGeometry(0.08,0.08,0.34,14),steel),-0.24,0.14,0).rotation.x=Math.PI/2;
  const crank=add(engineBed,new T.Group(),-0.38,0.02,0);
  add(crank,new T.Mesh(new T.CylinderGeometry(0.17,0.17,0.05,24),bronze),0,0,0).rotation.z=Math.PI/2;
  add(crank,new T.Mesh(new T.CylinderGeometry(0.06,0.06,0.56,18),steel),0,0,0).rotation.x=Math.PI/2;
  const rodLeft=add(root,tube(T,0.8,0.022,steel,0.24,0,-0.18),-0.28,0.47,-0.48);
  const rodRight=add(root,tube(T,0.8,0.022,steel,0.24,0,0.18),-0.28,0.47,0.48);

  const wingPedestal=add(root,new T.Group(),0,0.78,0);
  add(wingPedestal,new T.Mesh(new T.BoxGeometry(0.65,0.12,0.78),darkSteel),0,0,0);
  add(wingPedestal,tube(T,1.6,0.04,steel,0,0,Math.PI/2),0.05,0,0);

  const tailBoom=add(root,new T.Group(),-2.1,0.28,0);
  add(tailBoom,tube(T,2.4,0.045,steel,0,0,Math.PI/2),0,0,0);
  add(tailBoom,tube(T,2.1,0.025,steel,0,0.18,0),0.25,0.1,0.46);
  add(tailBoom,tube(T,2.1,0.025,steel,0,-0.18,0),0.25,0.1,-0.46);

  const tailplane=add(root,new T.Group(),-4.82,0.46,0);
  add(tailplane,new T.Mesh(new T.BoxGeometry(1.1,0.04,2.35),fabric),0,0,0);
  add(tailplane,tube(T,2.3,0.02,steel,0,0,0),0.02,0,0);
  const elevator=add(tailplane,new T.Group(),0.24,0,0);
  add(elevator,new T.Mesh(new T.BoxGeometry(0.42,0.028,2.2),fabric),0,0,0);

  const fin=add(root,new T.Group(),-4.96,0.58,0);
  add(fin,new T.Mesh(new T.BoxGeometry(0.52,1.02,0.04),fabric),0,0.35,0);
  add(fin,tube(T,1.04,0.02,steel,0,0,0),0,0.35,0);
  const rudder=add(fin,new T.Group(),0.16,0.34,0);
  add(rudder,new T.Mesh(new T.BoxGeometry(0.34,0.82,0.028),fabric),0,0,0);

  const leftInner=add(root,new T.Group());
  const leftOuter=add(root,new T.Group());
  const rightInner=add(root,new T.Group());
  const rightOuter=add(root,new T.Group());
  const leftInnerSurface=add(leftInner,new T.Group());
  const leftOuterSurface=add(leftOuter,new T.Group());
  const rightInnerSurface=add(rightInner,new T.Group());
  const rightOuterSurface=add(rightOuter,new T.Group());

  const wingPanels={
    leftInner:[new T.Mesh(makePanel(T,p,'leftInner'),fabric)],
    leftOuter:[new T.Mesh(makePanel(T,p,'leftOuter',0),fabric),new T.Mesh(makePanel(T,p,'leftOuter',1),fabric)],
    rightInner:[new T.Mesh(makePanel(T,p,'rightInner'),fabric)],
    rightOuter:[new T.Mesh(makePanel(T,p,'rightOuter',0),fabric),new T.Mesh(makePanel(T,p,'rightOuter',1),fabric)],
  };
  for(const mesh of wingPanels.leftInner)leftInnerSurface.add(mesh);
  for(const mesh of wingPanels.leftOuter)leftOuterSurface.add(mesh);
  for(const mesh of wingPanels.rightInner)rightInnerSurface.add(mesh);
  for(const mesh of wingPanels.rightOuter)rightOuterSurface.add(mesh);

  for(const side of [-1,1]){
    const z=side*(p.span_m*p.wrist_span_fraction*0.25);
    add(root,tube(T,1.2,0.028,steel,0,0.12*side,0),-0.15,0.55,z);
    add(root,tube(T,1.02,0.022,steel,0.5,0,0.2*side),0.12,0.36,z*0.95);
    add(root,new T.Mesh(new T.SphereGeometry(0.08,12,10),bronze),0.24,0.79,side*0.25);
  }

  const wheelFrames=add(root,new T.Group(),0,0,0);
  const wheelGeom=new T.CylinderGeometry(p.wheel_radius_m,p.wheel_radius_m,0.1,18,1,true);
  const tyreMat=material(T,0x24282b,.1,.92);
  const hubMat=material(T,0x99968c,.4,.55);
  const wheels=p.gear_centres.map(([x,y,z],i)=>{
    add(wheelFrames,tube(T,Math.abs(y),0.024,steel,0,0,0),x,y*0.5,z);
    const axle=add(wheelFrames,tube(T,0.48,0.017,steel,0,0,Math.PI/2),x,y,z);
    axle.userData.index=i;
    const wheel=new T.Mesh(wheelGeom,tyreMat);
    wheel.rotation.x=Math.PI/2;
    wheel.position.set(x,y,z);
    wheel.add(new T.Mesh(new T.CylinderGeometry(p.wheel_radius_m*0.45,p.wheel_radius_m*0.45,0.11,14),hubMat));
    wheelFrames.add(wheel);
    return wheel;
  });
  add(root,tube(T,2.75,0.025,steel,0,0,0),-0.45,-1.2,0);

  return {
    root,
    leftInner,
    leftOuter,
    rightInner,
    rightOuter,
    leftInnerSurface,
    leftOuterSurface,
    rightInnerSurface,
    rightOuterSurface,
    rudder,
    elevator,
    pilot,
    wheels,
    wingPanels,
    crank,
    rodLeft,
    rodRight,
  };
}

export function updateAircraft(a,s,c){
  a.rudder.rotation.y=-0.5*c.rudder;
  a.elevator.rotation.z=0.28*c.pitch;
  for(const wheel of a.wheels){
    wheel.rotation.z=s.wheel_angle;
  }
  if(a.crank){
    a.crank.rotation.x=s.phase;
  }
  if(a.rodLeft){
    a.rodLeft.rotation.z=-0.22+0.14*Math.sin(s.phase);
    a.rodLeft.rotation.x=0.22+0.08*Math.cos(s.phase);
  }
  if(a.rodRight){
    a.rodRight.rotation.z=0.22-0.14*Math.sin(s.phase);
    a.rodRight.rotation.x=0.22+0.08*Math.cos(s.phase);
  }
  if(a.pilot){
    a.pilot.rotation.z=-0.04*c.bank;
    a.pilot.rotation.y=-0.06*c.rudder;
  }
}
