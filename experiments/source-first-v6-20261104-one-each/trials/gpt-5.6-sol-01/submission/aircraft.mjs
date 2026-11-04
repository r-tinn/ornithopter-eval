import {makePanel} from './environment/source-mechanism.mjs';

export function createAircraft(T,p){
  const root=new T.Group();root.name='Stanley source-first ornithopter';
  const metal=new T.MeshStandardMaterial({color:0x39434b,metalness:.75,roughness:.28});
  const tube=new T.MeshStandardMaterial({color:0xb8c1c4,metalness:.85,roughness:.22});
  const wood=new T.MeshStandardMaterial({color:0x7a3f20,roughness:.55});
  const fabric=new T.MeshStandardMaterial({color:0xe8e0c8,roughness:.72,side:T.DoubleSide,transparent:true,opacity:.91});
  const dark=new T.MeshStandardMaterial({color:0x171b1c,roughness:.7});
  const red=new T.MeshStandardMaterial({color:0x8e241a,metalness:.3,roughness:.42});
  const skin=new T.MeshStandardMaterial({color:0xc98e68,roughness:.85});
  const suit=new T.MeshStandardMaterial({color:0x24384c,roughness:.8});
  const addMesh=(parent,g,m,pos=[0,0,0])=>{const o=new T.Mesh(g,m);o.position.set(...pos);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;};
  const beam=(parent,a,b,r=.035,mat=tube)=>{
    const d=new T.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]),len=d.length();
    const o=addMesh(parent,new T.CylinderGeometry(r,r,len,10),mat,[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2]);
    o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return o;
  };
  // Slender boat-like pod and exposed triangulated load path.
  const pod=addMesh(root,new T.SphereGeometry(1,24,12),metal,[.15,-.05,0]);pod.scale.set(2.65,.48,.58);
  addMesh(root,new T.ConeGeometry(.46,1.65,18),metal,[2.65,-.03,0]).rotation.z=-Math.PI/2;
  for(const z of [-.42,.42]){
    beam(root,[-2.4,-.25,z],[1.95,-.25,z],.035);
    beam(root,[-1.65,-.25,z],[.1,.88,z],.04);
    beam(root,[.1,.88,z],[1.75,-.25,z],.04);
  }
  beam(root,[-1.65,-.25,-.42],[-1.65,-.25,.42],.04);
  beam(root,[.1,.88,-.42],[.1,.88,.42],.05);
  // Engine, flywheel, reduction shaft and paired crank discs remain readable.
  const engine=new T.Group();engine.position.set(.15,.1,0);root.add(engine);
  addMesh(engine,new T.BoxGeometry(.72,.55,.62),red);
  for(const z of [-.38,.38]){const cyl=addMesh(engine,new T.CylinderGeometry(.22,.22,.18,18),metal,[0,.2,z]);cyl.rotation.x=Math.PI/2;}
  const fly=addMesh(engine,new T.CylinderGeometry(.39,.39,.12,24),wood,[-.25,.05,.43]);fly.rotation.x=Math.PI/2;
  beam(root,[.05,.45,-.55],[.05,.45,.55],.065,metal);
  for(const z of [-.55,.55])addMesh(root,new T.SphereGeometry(.13,14,8),red,[.05,.45,z]);
  // Four contract wing groups are identity transforms directly below root.
  const wingPanels={};let leftInner,leftOuter,rightInner,rightOuter;
  for(const name of ['leftInner','leftOuter','rightInner','rightOuter']){
    const group=new T.Group();group.name=name;root.add(group);
    const surface=new T.Group();surface.name=name+'Surface';group.add(surface);
    const leaves=[];
    for(let leaf=0;leaf<(name.endsWith('Outer')?2:1);leaf++){
      const mesh=new T.Mesh(makePanel(T,p,name,leaf),fabric);mesh.name=name+(leaf?' sliding tip leaf':' main leaf');
      surface.add(mesh);leaves.push(mesh);
    }
    wingPanels[name]=leaves;
    if(name==='leftInner')leftInner=group;if(name==='leftOuter')leftOuter=group;
    if(name==='rightInner')rightInner=group;if(name==='rightOuter')rightOuter=group;
  }
  // Tailplane, separate elevator, fin and rudder.
  const tail=addMesh(root,new T.BoxGeometry(1.35,.055,2.25),fabric,[-2.48,.2,0]);
  tail.geometry.translate(0,0,0);
  const elevator=new T.Group();elevator.name='elevator';elevator.position.set(-3.0,.2,0);root.add(elevator);
  addMesh(elevator,new T.BoxGeometry(.5,.065,2.05),fabric);
  addMesh(root,new T.BoxGeometry(1.2,.95,.055),fabric,[-2.5,.62,0]);
  const rudder=new T.Group();rudder.name='rudder';rudder.position.set(-3.02,.67,0);root.add(rudder);
  addMesh(rudder,new T.BoxGeometry(.48,.78,.065),fabric);
  beam(root,[-2.8,.2,-1.05],[-1.3,-.2,-.38],.03);beam(root,[-2.8,.2,1.05],[-1.3,-.2,.38],.03);
  // A clearly seated, helmeted 1.65 m adult, hands on the control bar.
  const pilot=new T.Group();pilot.name='pilot';pilot.position.set(.85,.25,0);root.add(pilot);
  const torso=addMesh(pilot,new T.BoxGeometry(.42,.68,.34),suit,[0,.32,0]);torso.rotation.z=-.13;
  addMesh(pilot,new T.SphereGeometry(.19,18,12),skin,[-.08,.83,0]);
  const helmet=addMesh(pilot,new T.SphereGeometry(.205,18,10),red,[-.1,.88,0]);helmet.scale.y=.8;
  for(const z of [-.2,.2]){
    beam(pilot,[0,.55,z*.65],[.43,.32,z],.055,suit);
    beam(pilot,[.43,.32,z],[.65,.35,z*.75],.045,skin);
    beam(pilot,[.04,.05,z*.55],[.58,-.35,z],.075,suit);
    beam(pilot,[.58,-.35,z],[1.02,-.45,z*.8],.06,dark);
  }
  beam(root,[1.46,.58,-.42],[1.46,.58,.42],.025,wood);
  // Three independently represented pneumatic tyres. Geometry is baked so the
  // mesh's local z axis is both axle and animation axis.
  const wheels=[];
  for(const g of p.gear_centres){
    beam(root,[g[0],g[1]+.7,g[2]],[g[0],g[1],g[2]],.035);
    const geo=new T.TorusGeometry(p.wheel_radius_m-.055,.055,10,22); // outer radius equals the contact model
    const w=addMesh(root,geo,dark,g);w.name='actual tyre';w.userData.axle='z';wheels.push(w);
    addMesh(w,new T.CylinderGeometry(.055,.055,.12,12).rotateX(Math.PI/2),metal);
  }
  root.userData.mechanical={fly,engine};
  return {root,leftInner,leftOuter,rightInner,rightOuter,wingPanels,rudder,elevator,pilot,wheels};
}
export function updateAircraft(a,s,c){
  for(const w of a.wheels)w.rotation.z=s.wheel_angle||0;
  a.rudder.rotation.y=-.42*(c.rudder||0);
  a.elevator.rotation.z=.3*(c.pitch||0);
  const mech=a.root.userData.mechanical;if(mech)mech.fly.rotation.z=s.phase||0;
}
