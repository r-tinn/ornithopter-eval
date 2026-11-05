import {makePanel} from './environment/source-mechanism.mjs';
import {E} from './environment/engineering.mjs';

function mat(T,color,rough=.8,metal=.05,side){
  return new T.MeshStandardMaterial({color,roughness:rough,metalness:metal,side});
}
function cyl(T,r,h,matl,radial=16){
  return new T.Mesh(new T.CylinderGeometry(r,r,h,radial),matl);
}

export function createAircraft(T,p){
  const root=new T.Group(); root.name='Stanley source-first mechanical ornithopter';
  const fabric=mat(T,0xf1eee0,.95,0,T.DoubleSide);
  const frame=mat(T,0x3b4650,.55,.35), wood=mat(T,0x8b5a2b,.8,.05), dark=mat(T,0x181818,.7,.15);
  const skin=mat(T,0xc99572,.75,0), suit=mat(T,0x26334a,.85,0), brass=mat(T,0xb08a31,.45,.35);
  const groups={root,wingPanels:{},wheels:[]};
  for(const name of ['leftInner','leftOuter','rightInner','rightOuter']){
    const g=new T.Group(); g.name=name; const s=new T.Group(); s.name=name+'Surface'; g.add(s); root.add(g); groups[name]=g; groups[name+'Surface']=s;
    const leaves=name.endsWith('Outer')?[0,1]:[0];
    groups.wingPanels[name]=leaves.map(leaf=>{const mesh=new T.Mesh(makePanel(T,p,name,leaf),fabric); mesh.name=name+' leaf '+leaf; s.add(mesh); return mesh;});
  }
  // long canoe fuselage / keel
  const body=cyl(T,.18,p.body_length_m,wood,18); body.rotation.z=Math.PI/2; body.scale.y=1; body.position.set(.25,.25,0); body.name='varnished light fuselage boom'; root.add(body);
  const nose=cyl(T,.13,1.1,frame,16); nose.rotation.z=Math.PI/2; nose.position.set(2.55,.26,0); root.add(nose);
  // wing carry-through, wishbone and struts
  const spar=cyl(T,.045,2.0,frame,12); spar.rotation.x=Math.PI/2; spar.position.set(.05,E.wing.root_height_m,0); root.add(spar);
  for(const z of [-1,1]){
    const strut=cyl(T,.026,2.7,frame,8); strut.rotation.z=.88*z; strut.rotation.y=.18; strut.position.set(.15,.35,z*.55); root.add(strut);
    const push=cyl(T,.018,3.6,brass,8); push.rotation.z=1.18*z; push.position.set(.75,.52,z*.35); root.add(push);
  }
  // engine, fuel and visible reduction drums
  const eng=cyl(T,.32,.58,dark,24); eng.rotation.x=Math.PI/2; eng.position.set(.85,.42,0); root.add(eng);
  const tank=cyl(T,.18,.75,mat(T,0x9cc0d3,.35,.05),18); tank.rotation.z=Math.PI/2; tank.position.set(.25,.62,0); root.add(tank);
  for(const z of [-.28,.28]){const pulley=cyl(T,.16,.055,brass,24); pulley.rotation.x=Math.PI/2; pulley.position.set(.55,.73,z); root.add(pulley);}
  // conventional tail, fin, rudder and elevator
  const tailGroup=new T.Group(); tailGroup.position.set(-2.75,.42,0); root.add(tailGroup);
  const tailplane=new T.Mesh(new T.BoxGeometry(.75,.035,1.85),fabric); tailplane.name='spread trimming tailplane'; tailGroup.add(tailplane);
  groups.elevator=new T.Mesh(new T.BoxGeometry(.32,.025,1.75),fabric); groups.elevator.position.x=-.48; tailGroup.add(groups.elevator);
  const fin=new T.Mesh(new T.BoxGeometry(.55,.9,.035),fabric); fin.position.set(-.15,.38,0); tailGroup.add(fin);
  groups.rudder=new T.Mesh(new T.BoxGeometry(.35,.72,.03),fabric); groups.rudder.position.set(-.48,.34,0); tailGroup.add(groups.rudder);
  // seated pilot: torso/head/limbs, visible scale reference
  groups.pilot=new T.Group(); groups.pilot.name='55 kg seated adult pilot'; groups.pilot.position.set(.65,.72,0); root.add(groups.pilot);
  const torso=new T.Mesh(new T.SphereGeometry(.24,16,12),suit); torso.scale.set(.75,1.45,.55); torso.rotation.z=-.25; groups.pilot.add(torso);
  const head=new T.Mesh(new T.SphereGeometry(.13,18,12),skin); head.position.set(.1,.43,0); groups.pilot.add(head);
  for(const z of [-.12,.12]){const arm=cyl(T,.035,.55,skin,8); arm.rotation.z=1.15; arm.position.set(.13,.16,z); groups.pilot.add(arm); const leg=cyl(T,.045,.72,suit,8); leg.rotation.z=Math.PI/2.8; leg.position.set(.35,-.28,z); groups.pilot.add(leg);}
  // three actual tyre meshes, torus plane normal is local z: the rolling axle is aircraft lateral z.
  for(const [i,g] of E.gear_centres_m.entries()){
    const tyre=new T.Mesh(new T.TorusGeometry(E.wheel_radius_m,.055,10,28),dark);
    tyre.name='actual rolling tyre '+i; tyre.position.set(...g); root.add(tyre); groups.wheels.push(tyre);
    const fork=cyl(T,.025,.7,frame,8); fork.rotation.x=Math.PI/2; fork.position.set(g[0],g[1]+.28,g[2]); root.add(fork);
  }
  return groups;
}

export function updateAircraft(a,s,c){
  for(const wheel of a.wheels)wheel.rotation.z=s.wheel_angle??0;
  if(a.rudder)a.rudder.rotation.y=-(c?.rudder??0)*.35;
  if(a.elevator)a.elevator.rotation.z=(c?.pitch??0)*.25;
}
