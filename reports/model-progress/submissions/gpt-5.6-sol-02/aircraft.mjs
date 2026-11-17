import {makePanel} from './environment/source-mechanism.mjs';

export function createAircraft(T,p){
  const root=new T.Group();root.name='Silver Heron ornithopter';
  const mat=(color,roughness=.65,metalness=.05,extra={})=>new T.MeshStandardMaterial({color,roughness,metalness,...extra});
  const carbon=mat(0x263238,.42,.55),steel=mat(0x9ba5a4,.3,.72);
  const brass=mat(0xb4873f,.35,.62),leather=mat(0x6b3826,.82,.02);
  const ivory=mat(0xe8dfc4,.78,.02,{side:T.DoubleSide,transparent:true,opacity:.91});
  const ivory2=mat(0xd7caa8,.8,.02,{side:T.DoubleSide,transparent:true,opacity:.82});
  const red=mat(0x923b2f,.62,.08),rubber=mat(0x17191a,.9,.02);
  const skin=mat(0xc58c68,.82),cloth=mat(0x334d58,.85),glass=mat(0x87aeba,.18,.1,{transparent:true,opacity:.52});
  const mesh=(geometry,material,parent=root)=>{const m=new T.Mesh(geometry,material);parent.add(m);return m;};
  const box=(size,pos,material=carbon,parent=root)=>{
    const m=mesh(new T.BoxGeometry(...size),material,parent);m.position.set(...pos);return m;
  };
  const rod=(a,b,r=.035,material=carbon,parent=root)=>{
    const A=new T.Vector3(...a),B=new T.Vector3(...b),d=B.clone().sub(A);
    const m=mesh(new T.CylinderGeometry(r,r,d.length(),8),material,parent);
    m.position.copy(A.add(B).multiplyScalar(.5));
    m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return m;
  };
  // A deep triangulated keel: the structure reads as a machine rather than a bird costume.
  const longerons=[
    [[-2.85,.02,-.24],[2.7,.05,-.24]], [[-2.85,.02,.24],[2.7,.05,.24]],
    [[-2.3,.72,-.34],[1.85,.72,-.34]], [[-2.3,.72,.34],[1.85,.72,.34]]
  ];longerons.forEach(x=>rod(...x,.045,carbon));
  for(const x of [-2.25,-1.35,-.45,.45,1.35,2.15]){
    rod([x,.04,-.24],[x,.7,-.34],.025,steel);rod([x,.04,.24],[x,.7,.34],.025,steel);
    rod([x,.04,-.24],[x-.45,.7,-.34],.022,carbon);rod([x,.04,.24],[x-.45,.7,.34],.022,carbon);
  }
  rod([-2.8,.03,0],[-3.05,.35,0],.045,steel);
  // Streamlined nose, cockpit coaming and translucent windscreen.
  const nose=mesh(new T.ConeGeometry(.37,1.18,16),red);nose.rotation.z=-Math.PI/2;nose.position.set(2.55,.38,0);
  box([1.35,.12,.72],[1.15,.13,0],leather);
  const screen=mesh(new T.SphereGeometry(.48,16,8,0,Math.PI*2,0,Math.PI/2),glass);
  screen.scale.set(.9,.75,.8);screen.position.set(.8,.58,0);
  // Engine, reduction shaft, opposed crank discs and a guarded chain/belt.
  const engine=new T.Group();root.add(engine);engine.position.set(-.15,.4,0);
  box([.68,.48,.62],[0,0,0],carbon,engine);
  for(const z of [-.34,.34]){
    const cyl=mesh(new T.CylinderGeometry(.18,.18,.32,12),steel,engine);
    cyl.rotation.x=Math.PI/2;cyl.position.set(.06,.12,z);
  }
  const crank=new T.Group();root.add(crank);crank.position.set(-.42,.79,0);
  for(const z of [-.2,.2]){
    const disc=mesh(new T.CylinderGeometry(.24,.24,.035,20),brass,crank);
    disc.rotation.x=Math.PI/2;disc.position.z=z;
    rod([0,0,z],[.19,0,z],.025,steel,crank);
  }
  const driveWheel=mesh(new T.TorusGeometry(.39,.035,8,28),steel);
  driveWheel.position.set(-.42,.79,0);
  const belt=mesh(new T.TorusGeometry(.31,.022,6,28),mat(0x3a2921,.9));
  belt.position.set(-.15,.4,.36);
  // Shoulder bearings and spring wishbone visually connect transmission to both panels.
  for(const z of [-.25,.25]){
    const bearing=mesh(new T.CylinderGeometry(.12,.12,.16,16),brass);
    bearing.rotation.x=Math.PI/2;bearing.position.set(0,.8,z);
  }
  rod([-.42,.79,-.2],[.02,.8,-.25],.035,steel);
  rod([-.42,.79,.2],[.02,.8,.25],.035,steel);
  for(const z of [-.2,.2]){
    const spring=mesh(new T.TorusGeometry(.16,.025,6,18),brass);
    spring.rotation.x=Math.PI/2;spring.position.set(-.05,.78,z);
  }
  // Production wing hierarchy. All four linkage groups remain identity transforms.
  const wingPanels={};
  for(const name of ['leftInner','leftOuter','rightInner','rightOuter']){
    const group=new T.Group();group.name=name;root.add(group);
    const surface=new T.Group();surface.name=name+'Surface';group.add(surface);
    const count=name.endsWith('Outer')?2:1;
    wingPanels[name]=[];
    for(let leaf=0;leaf<count;leaf++){
      const panel=mesh(makePanel(T,p,name,leaf),leaf?ivory2:ivory,surface);
      panel.name=name+(count>1?' leaf '+(leaf+1):' panel');
      wingPanels[name].push(panel);
    }
  }
  // Compact shoulder ferrules remain on the fuselage; the host-morphed production
  // surfaces themselves carry the visible moving spars and overlapping leaves.
  for(const z of [-.31,.31]){
    const collar=mesh(new T.TorusGeometry(.12,.035,7,16),brass);
    collar.position.set(0,.8,z);
  }
  // Tailplane, elevator and fin/rudder are conventional completions explicitly allowed by the notes.
  const tailplane=box([1.15,.055,2.35],[-2.62,.32,0],ivory);
  tailplane.name='fixed tailplane';
  const elevator=new T.Group();root.add(elevator);elevator.position.set(-3.05,.32,0);
  box([.52,.045,2.25],[0,0,0],red,elevator);
  const fin=box([.78,1.15,.055],[-2.58,.78,0],ivory);
  fin.rotation.z=-.16;
  const rudder=new T.Group();root.add(rudder);rudder.position.set(-3.0,.83,0);
  const rudderBlade=box([.42,.92,.045],[0,0,0],red,rudder);rudderBlade.rotation.z=-.08;
  rod([-2.55,.28,-.95],[-2.0,.05,-.22],.025,steel);rod([-2.55,.28,.95],[-2.0,.05,.22],.025,steel);
  // Seated 55 kg adult pilot with articulated-looking limbs, harness and helmet.
  const pilot=new T.Group();root.add(pilot);pilot.name='seated pilot';pilot.position.set(.72,.2,0);
  const torso=box([.38,.65,.46],[0,.48,0],cloth,pilot);torso.rotation.z=-.13;
  const head=mesh(new T.SphereGeometry(.16,14,10),skin,pilot);head.position.set(.07,.92,0);
  const helmet=mesh(new T.SphereGeometry(.175,14,8,0,Math.PI*2,0,Math.PI*.58),red,pilot);helmet.position.set(.07,.96,0);
  rod([-.03,.7,-.2],[.43,.52,-.28],.055,cloth,pilot);rod([-.03,.7,.2],[.43,.52,.28],.055,cloth,pilot);
  rod([-.08,.27,-.15],[.52,.05,-.16],.075,cloth,pilot);rod([-.08,.27,.15],[.52,.05,.16],.075,cloth,pilot);
  rod([-.12,.75,-.23],[.2,.35,.23],.025,red,pilot);rod([-.12,.75,.23],[.2,.35,-.23],.025,red,pilot);
  rod([.44,.5,-.33],[.44,.5,.33],.018,steel,pilot);
  // Three braced landing legs and three actual tyres.
  const wheels=[];
  for(const g of p.gear_centres){
    rod([g[0]-.28,.02,g[2]],[g[0],g[1],g[2]],.035,steel);
    rod([g[0]+.28,.02,g[2]],[g[0],g[1],g[2]],.035,steel);
    const w=mesh(new T.CylinderGeometry(p.wheel_radius_m,p.wheel_radius_m,.115,20),rubber);
    w.position.set(...g);w.userData.basePosition=g.slice();w.name='tyre';
    wheels.push(w);
    const hub=mesh(new T.CylinderGeometry(.075,.075,.13,12),brass,w);
  }
  return {root,leftInner:root.getObjectByName('leftInner'),leftOuter:root.getObjectByName('leftOuter'),
    rightInner:root.getObjectByName('rightInner'),rightOuter:root.getObjectByName('rightOuter'),
    leftInnerSurface:root.getObjectByName('leftInnerSurface'),leftOuterSurface:root.getObjectByName('leftOuterSurface'),
    rightInnerSurface:root.getObjectByName('rightInnerSurface'),rightOuterSurface:root.getObjectByName('rightOuterSurface'),
    wingPanels,rudder,elevator,pilot,wheels,crank,driveWheel,belt,T};
}
export function updateAircraft(a,s,c){
  a.rudder.rotation.y=-.42*(c.rudder??0);
  a.elevator.rotation.z=.28*(c.pitch??0);
  a.crank.rotation.z=-s.phase;
  a.driveWheel.rotation.z=-s.phase;
  a.belt.rotation.z=-s.phase*.55;
  for(const w of a.wheels){
    const q1=new a.T.Quaternion().setFromAxisAngle(new a.T.Vector3(1,0,0),Math.PI/2);
    const q2=new a.T.Quaternion().setFromAxisAngle(new a.T.Vector3(0,1,0),s.wheel_angle??0);
    w.quaternion.copy(q1).multiply(q2);
  }
}
