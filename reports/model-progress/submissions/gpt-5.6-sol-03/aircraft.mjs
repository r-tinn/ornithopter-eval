import {makePanel,PANEL_NAMES} from './environment/source-mechanism.mjs';
import {E} from './environment/engineering.mjs';

const mat=(T,color,rough=.65,metal=.15,extra={})=>
  new T.MeshStandardMaterial({color,roughness:rough,metalness:metal,...extra});

function rod(T,parent,a,b,r,material){
  const d=new T.Vector3().subVectors(new T.Vector3(...b),new T.Vector3(...a));
  const mesh=new T.Mesh(new T.CylinderGeometry(r,r,d.length(),10),material);
  mesh.position.fromArray(a).add(new T.Vector3(...b)).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());
  parent.add(mesh);return mesh;
}
function box(T,parent,size,pos,material,bevel=false){
  const g=bevel?new T.CapsuleGeometry(size[1]/2,Math.max(.01,size[0]-size[1]),6,12):
    new T.BoxGeometry(...size);
  const m=new T.Mesh(g,material);m.position.fromArray(pos);
  if(bevel)m.rotation.z=Math.PI/2;
  parent.add(m);return m;
}

export function createAircraft(T,p){
  const root=new T.Group();root.name='Stanley mechanical ornithopter';
  const steel=mat(T,0x34434a,.38,.72),alloy=mat(T,0x8d9a9b,.3,.72);
  const brass=mat(T,0xb58332,.28,.72),wood=mat(T,0x76503a,.72,.05);
  const red=mat(T,0x8f2922,.5,.22),dark=mat(T,0x171d1e,.65,.2);
  const fabric=mat(T,0xe5ddc6,.78,.02,{side:T.DoubleSide,transparent:true,opacity:.92});
  const tailFabric=mat(T,0xc6d4c9,.72,.03,{side:T.DoubleSide});

  // A triangulated, canoe-like fuselage with a visible keel and upper longerons.
  const frame=new T.Group();frame.name='tubular truss';root.add(frame);
  const stations=[
    [2.55,.05,.18],[1.6,.48,.58],[.45,.56,.72],[-1.25,.42,.56],[-2.65,.32,.25]
  ];
  for(const z of [-1,1]){
    for(let i=0;i<stations.length-1;i++){
      const a=stations[i],b=stations[i+1];
      rod(T,frame,[a[0],a[1],z*a[2]],[b[0],b[1],z*b[2]],.035,steel);
      rod(T,frame,[a[0],-.42,z*a[2]*.72],[b[0],-.42,z*b[2]*.72],.03,steel);
      rod(T,frame,[a[0],a[1],z*a[2]],[b[0],-.42,z*b[2]*.72],.025,alloy);
    }
  }
  for(const q of stations)rod(T,frame,[q[0],q[1],-q[2]],[q[0],q[1],q[2]],.026,alloy);
  box(T,root,[3.25,.55,1.02],[.2,-.18,0],wood,true);
  box(T,root,[1.15,.34,.95],[.55,.28,0],dark,true);

  // Exposed engine, reduction drum, crankshaft and paired connecting rods.
  const engine=new T.Group();engine.position.set(-.55,.02,0);root.add(engine);
  box(T,engine,[.72,.56,.62],[0,0,0],dark);
  for(const z of [-.23,.23]){
    const cyl=new T.Mesh(new T.CylinderGeometry(.19,.22,.42,12),alloy);
    cyl.geometry.rotateX(Math.PI/2);cyl.position.set(.02,.31,z);engine.add(cyl);
  }
  const driveWheel=new T.Mesh(new T.CylinderGeometry(.34,.34,.11,24),brass);
  driveWheel.geometry.rotateX(Math.PI/2);driveWheel.position.set(-.02,.18,.38);engine.add(driveWheel);
  const crank=new T.Group();crank.position.set(-.02,.18,.46);engine.add(crank);
  rod(T,crank,[0,0,-1.15],[0,0,1.15],.055,steel);
  for(const z of [-1.05,1.05]){
    const hub=new T.Mesh(new T.CylinderGeometry(.14,.14,.14,16),brass);
    hub.geometry.rotateX(Math.PI/2);hub.position.z=z;crank.add(hub);
    rod(T,crank,[0,0,z],[.38,.15,z],.045,brass);
  }

  // Direct identity wing groups are mandatory: host supplies the same curved
  // leaf geometry used by the force and mass helper.
  const wingPanels={},surfaces={};
  for(const name of PANEL_NAMES){
    const group=new T.Group();group.name=name;root.add(group);
    const surface=new T.Group();surface.name=name+'Surface';group.add(surface);
    const leaves=[];
    for(let leaf=0;leaf<(name.endsWith('Outer')?2:1);leaf++){
      const mesh=new T.Mesh(makePanel(T,p,name,leaf),fabric);
      mesh.name=name+(name.endsWith('Outer')?` sliding leaf ${leaf+1}`:' broad arm sail');
      surface.add(mesh);leaves.push(mesh);
    }
    wingPanels[name]=leaves;surfaces[name]=surface;
  }
  // Shoulder pivots and wishbone spring housings make the load path readable.
  for(const z of [-.25,.25]){
    const bearing=new T.Mesh(new T.CylinderGeometry(.13,.13,.2,16),brass);
    bearing.geometry.rotateX(Math.PI/2);bearing.position.set(0,E.wing.root_height_m,z);root.add(bearing);
    rod(T,root,[-.5,.1,z],[0,E.wing.root_height_m,z],.045,steel);
    rod(T,root,[.45,.0,z],[0,E.wing.root_height_m,z],.045,steel);
  }
  const spring=new T.Mesh(new T.TorusGeometry(.28,.035,8,24),brass);
  spring.rotation.x=Math.PI/2;spring.position.set(-.08,.69,0);root.add(spring);

  // Conventional tailplane, elevator and fin/rudder (a completion sanctioned
  // by the source), with clearly separate movable groups.
  const elevator=new T.Group();elevator.name='elevator';elevator.position.set(-2.72,.42,0);root.add(elevator);
  const tailShape=new T.Shape();tailShape.moveTo(-.48,0);tailShape.lineTo(.42,0);
  tailShape.lineTo(.2,1.38);tailShape.lineTo(-.25,1.15);tailShape.closePath();
  const tg=new T.ShapeGeometry(tailShape);
  const leftTail=new T.Mesh(tg,tailFabric);leftTail.rotation.x=Math.PI/2;leftTail.rotation.z=-Math.PI/2;
  const rightTail=leftTail.clone();rightTail.scale.y=-1;elevator.add(leftTail,rightTail);
  const rudder=new T.Group();rudder.name='rudder';rudder.position.set(-2.72,.43,0);root.add(rudder);
  const finShape=new T.Shape();finShape.moveTo(-.35,0);finShape.lineTo(.38,0);
  finShape.lineTo(.12,.95);finShape.lineTo(-.22,.72);finShape.closePath();
  const fin=new T.Mesh(new T.ShapeGeometry(finShape),tailFabric);rudder.add(fin);

  // Recognisable 55 kg seated adult: pelvis/chest/head, bent legs, arms,
  // helmet, harness and control column.
  const pilot=new T.Group();pilot.name='pilot';pilot.position.set(.58,.22,0);root.add(pilot);
  const suit=mat(T,0x394f63,.72,.02),skin=mat(T,0xc99470,.8,0),helmet=mat(T,0xe6e0c8,.35,.15);
  box(T,pilot,[.48,.62,.42],[0,.38,0],suit,true);
  const head=new T.Mesh(new T.SphereGeometry(.16,16,10),skin);head.position.set(.03,.82,0);pilot.add(head);
  const shell=new T.Mesh(new T.SphereGeometry(.175,16,8,0,Math.PI*2,0,Math.PI*.62),helmet);
  shell.position.copy(head.position);pilot.add(shell);
  for(const z of [-.17,.17]){
    rod(T,pilot,[.08,.22,z],[.48,-.08,z],.07,suit);
    rod(T,pilot,[.48,-.08,z],[.88,-.32,z],.06,suit);
    rod(T,pilot,[.04,.61,z],[.37,.35,z*.75],.045,suit);
    rod(T,pilot,[.37,.35,z*.75],[.48,.18,z*.45],.04,skin);
  }
  for(const z of [-.2,.2])rod(T,pilot,[-.13,.22,z],[.2,.67,-z*.3],.018,red);
  rod(T,root,[1.05,-.18,0],[1.05,.43,0],.025,steel);
  const grip=new T.Mesh(new T.CylinderGeometry(.035,.035,.32,10),dark);
  grip.geometry.rotateX(Math.PI/2);grip.position.set(1.05,.43,0);root.add(grip);

  // Three actual tyre meshes.  Their geometry is baked with its cylinder axis
  // along body z, and update rotates each mesh about exactly that axle.
  const wheels=[];
  for(const centre of E.gear_centres_m){
    const tyre=new T.Mesh(new T.TorusGeometry(E.wheel_radius_m-.055,.055,10,20),dark);
    // TorusGeometry is made in x/y, so its hole and rolling axle are body z.
    tyre.position.fromArray(centre);tyre.name='actual pneumatic tyre';root.add(tyre);wheels.push(tyre);
    rod(T,root,[centre[0],centre[1],centre[2]],[centre[0]-.28,-.35,centre[2]*.45],.028,steel);
  }

  return {root,leftInner:root.getObjectByName('leftInner'),
    leftOuter:root.getObjectByName('leftOuter'),rightInner:root.getObjectByName('rightInner'),
    rightOuter:root.getObjectByName('rightOuter'),
    leftInnerSurface:surfaces.leftInner,leftOuterSurface:surfaces.leftOuter,
    rightInnerSurface:surfaces.rightInner,rightOuterSurface:surfaces.rightOuter,
    wingPanels,rudder,elevator,pilot,wheels,driveWheel,crank};
}

export function updateAircraft(a,s,c){
  for(const wheel of a.wheels)wheel.rotation.z=-(s.wheel_angle??0);
  a.rudder.rotation.y=-.42*(c.rudder??0);
  a.elevator.rotation.z=.28*(c.pitch??0);
  if(a.driveWheel)a.driveWheel.rotation.z=s.phase;
  if(a.crank)a.crank.rotation.z=s.phase;
}
