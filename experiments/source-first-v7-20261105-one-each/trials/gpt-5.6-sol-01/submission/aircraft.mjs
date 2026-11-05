import {makePanel} from './environment/source-mechanism.mjs';

export function createAircraft(T,p){
  const root=new T.Group();root.name='Silver Heron ornithopter';
  const mat=(color,rough=.55,metal=.25,extra={})=>new T.MeshStandardMaterial({color,roughness:rough,metalness:metal,...extra});
  const steel=mat(0x68747b,.28,.82),dark=mat(0x172126,.38,.7),wood=mat(0x8a542c,.65,.08);
  const brass=mat(0xb88932,.3,.72),red=mat(0x8d2721,.48,.3),skin=mat(0xc88763,.7,0);
  const fabric=new T.MeshStandardMaterial({color:0xd8d0b1,roughness:.78,metalness:0,side:T.DoubleSide,transparent:true,opacity:.88});
  const tailFabric=new T.MeshStandardMaterial({color:0xb9c5b8,roughness:.72,side:T.DoubleSide});
  const mesh=(g,m,parent=root)=>{const q=new T.Mesh(g,m);parent.add(q);return q;};
  const rod=(a,b,r=.035,m=steel,parent=root)=>{
    const d=new T.Vector3(...b).sub(new T.Vector3(...a)),q=mesh(new T.CylinderGeometry(r,r,d.length(),8),m,parent);
    q.position.fromArray(a).addScaledVector(d,.5);q.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return q;
  };
  // A triangulated, boat-like fuselage rather than an opaque generic box.
  rod([-2.65,-.42,0],[2.45,-.42,0],.075,steel);
  rod([-2.25,.42,0],[1.85,.42,0],.065,steel);
  for(const x of [-2.2,-1.25,-.3,.7,1.65]){
    rod([x,-.42,-.48],[x,.42,0],.035,steel);rod([x,-.42,.48],[x,.42,0],.035,steel);
    rod([x,-.42,-.48],[x,-.42,.48],.035,steel);
  }
  rod([-2.4,-.42,-.35],[1.9,.42,0],.025,wood);rod([-2.4,-.42,.35],[1.9,.42,0],.025,wood);
  const nose=mesh(new T.ConeGeometry(.43,1.15,12),mat(0x60726d,.45,.45));nose.rotation.z=-Math.PI/2;nose.position.set(2.45,-.08,0);
  // Engine, reduction drum, opposed crank discs and visible pushrods.
  const engine=new T.Group();engine.position.set(.15,-.28,0);root.add(engine);
  const block=mesh(new T.BoxGeometry(.72,.55,.7),dark,engine);
  for(const z of [-.43,.43]){const cyl=mesh(new T.CylinderGeometry(.2,.2,.38,12),steel,engine);cyl.rotation.x=Math.PI/2;cyl.position.set(.05,.16,z);}
  const gearbox=mesh(new T.CylinderGeometry(.38,.38,.3,18),brass,engine);gearbox.rotation.x=Math.PI/2;gearbox.position.set(-.48,.18,0);
  const crank=new T.Group();crank.position.set(-.48,.18,0);engine.add(crank);
  for(const z of [-.2,.2]){const disk=mesh(new T.CylinderGeometry(.31,.31,.045,20),steel,crank);disk.rotation.x=Math.PI/2;disk.position.z=z;}
  rod([-.48,.18,-.55],[-.05,.8,-.25],.04,brass,engine);rod([-.48,.18,.55],[-.05,.8,.25],.04,brass,engine);
  // Four identity panel frames required by the production geometry contract.
  const wingPanels={};const result={root,wingPanels,crank};
  for(const name of ['leftInner','leftOuter','rightInner','rightOuter']){
    const group=new T.Group(),surface=new T.Group();group.name=name;surface.name=name+'Surface';
    root.add(group);group.add(surface);result[name]=group;result[name+'Surface']=surface;
    wingPanels[name]=[];
    const leaves=name.endsWith('Outer')?2:1;
    for(let leaf=0;leaf<leaves;leaf++){
      const panel=mesh(makePanel(T,p,name,leaf),fabric,surface);panel.name=name+(leaves>1?` sliding leaf ${leaf+1}`:' membrane');
      wingPanels[name].push(panel);
    }
  }
  // Central hinge barrels, spars and cable king-posts make the load path legible.
  for(const z of [-.25,.25]){
    const hinge=mesh(new T.CylinderGeometry(.11,.11,.28,14),brass);hinge.rotation.x=Math.PI/2;hinge.position.set(0,.8,z);
    rod([0,.8,z],[0,1.72,z],.035,steel);rod([0,1.7,z],[.45,.1,z],.018,dark);
  }
  // Conventional empennage, explicitly a mechanical completion suggested by 14.
  rod([-2.85,-.05,0],[-1.4,.1,0],.06,steel);
  const tailShape=new T.Shape();tailShape.moveTo(-3.05,0);tailShape.lineTo(-1.7,0);tailShape.lineTo(-2.15,.7);tailShape.lineTo(-2.9,.55);tailShape.closePath();
  const elevator=mesh(new T.ShapeGeometry(tailShape),tailFabric);elevator.rotation.x=Math.PI/2;elevator.name='elevator';result.elevator=elevator;
  const finShape=new T.Shape();finShape.moveTo(-2.85,0);finShape.lineTo(-1.85,0);finShape.lineTo(-2.55,1.05);finShape.lineTo(-2.9,.8);finShape.closePath();
  const fin=mesh(new T.ShapeGeometry(finShape),tailFabric);fin.position.y=.05;
  const rudder=mesh(new T.BoxGeometry(.045,.82,.035),red);rudder.position.set(-2.74,.56,0);rudder.name='rudder';result.rudder=rudder;
  // Seated adult: boots, bent legs, torso, arms, helmet and face.
  const pilot=new T.Group();pilot.name='pilot';pilot.position.set(.75,.05,0);root.add(pilot);result.pilot=pilot;
  const torso=mesh(new T.CapsuleGeometry(.24,.62,6,10),mat(0x344c42,.75,.05),pilot);torso.position.y=.65;torso.rotation.z=-.12;
  const head=mesh(new T.SphereGeometry(.16,14,10),skin,pilot);head.position.set(.04,1.17,0);
  const helmet=mesh(new T.SphereGeometry(.175,14,8,0,Math.PI*2,0,Math.PI*.62),red,pilot);helmet.position.set(.04,1.2,0);
  for(const side of [-1,1]){
    rod([.02,.86,side*.2],[.38,.48,side*.27],.055,mat(0x344c42,.75,.05),pilot);
    rod([.38,.48,side*.27],[.63,.42,side*.16],.045,skin,pilot);
    rod([-.08,.38,side*.14],[.42,-.13,side*.2],.07,mat(0x4a4036,.8,0),pilot);
    rod([.42,-.13,side*.2],[.92,-.32,side*.18],.065,dark,pilot);
  }
  mesh(new T.BoxGeometry(.5,.12,.62),wood,pilot).position.set(-.1,.14,0);
  // Three actual tyres and triangulated gear legs.
  const wheels=[];
  p.gear_centres.forEach((g,i)=>{
    const tyre=mesh(new T.TorusGeometry(p.wheel_radius_m-.055,.055,10,20),mat(0x101314,.9,.05));tyre.position.fromArray(g);tyre.name=i?'main tyre':'nose tyre';wheels.push(tyre);
    const hub=mesh(new T.CylinderGeometry(.065,.065,.12,12),brass);hub.rotation.x=Math.PI/2;hub.position.fromArray(g);
    rod([g[0],g[1],g[2]],[i?-.25:1.3,-.22,g[2]*.35],.045,steel);
    if(i)rod([g[0],g[1],g[2]],[.35,-.3,g[2]*.15],.035,steel);
  });
  result.wheels=wheels;
  // Fuel tank and control column.
  const tank=mesh(new T.CapsuleGeometry(.22,.55,5,10),mat(0x9c3526,.35,.6));tank.rotation.z=Math.PI/2;tank.position.set(-.85,-.12,0);
  result.controlColumn=rod([1.05,.2,0],[1.28,.74,0],.026,dark);
  return result;
}

export function updateAircraft(a,s,c){
  for(const wheel of a.wheels)wheel.rotation.z=-s.wheel_angle;
  a.rudder.rotation.y=-.45*(c.rudder??0);
  a.elevator.rotation.z=.22*(c.pitch??0);
  a.controlColumn.rotation.z=-.18*(c.pitch??0);
  a.crank.rotation.z=s.phase;
}
