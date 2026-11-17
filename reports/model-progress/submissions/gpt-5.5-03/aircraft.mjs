import {makePanel,PANEL_NAMES} from './environment/source-mechanism.mjs';
import {E} from './environment/engineering.mjs';

function mat(T,color,rough=0.8,side){
  return new T.MeshLambertMaterial({color,side:side??T.FrontSide});
}
function cyl(T,r1,r2,h,n,m){
  const x=new T.Mesh(new T.CylinderGeometry(r1,r2,h,n),m);
  return x;
}

export function createAircraft(T,p){
  const root=new T.Group();root.name='Stanley source-linked human ornithopter';
  const fabric=mat(T,0xf0ead2,.9,T.DoubleSide),tube=mat(T,0x263238),wood=mat(T,0x8d6e45),metal=mat(T,0x59636a),dark=mat(T,0x1d2326),skin=mat(T,0xc58f66),red=mat(T,0x8b2f2d);
  const aircraft={root,wingPanels:{},wheels:[]};
  for(const name of PANEL_NAMES){
    const g=new T.Group();g.name=name;const s=new T.Group();s.name=name+'Surface';g.add(s);root.add(g);aircraft[name]=g;aircraft[name+'Surface']=s;
    const leaves=[];
    for(let leaf=0;leaf<(name.endsWith('Outer')?2:1);leaf++){
      const mesh=new T.Mesh(makePanel(T,p,name,leaf),fabric);
      mesh.name=name+(name.endsWith('Outer')?'-sliding-leaf-'+leaf:'-broad-arm-panel');
      s.add(mesh);leaves.push(mesh);
    }
    aircraft.wingPanels[name]=leaves;
  }
  const fus=new T.Group();fus.name='open triangular fuselage and wishbone';root.add(fus);
  const keel=cyl(T,.045,.045,p.body_length_m,12,tube);keel.rotation.z=Math.PI/2;keel.position.set(.25,.05,0);fus.add(keel);
  const spine=cyl(T,.035,.035,4.8,10,tube);spine.rotation.z=Math.PI/2;spine.position.set(-.35,.85,0);fus.add(spine);
  for(const z of [-.34,.34]){
    const longeron=cyl(T,.028,.028,4.9,8,wood);longeron.rotation.z=Math.PI/2;longeron.position.set(-.15,.38,z);fus.add(longeron);
    const brace=cyl(T,.018,.018,2.0,8,metal);brace.rotation.set(0,0,.7);brace.position.set(.5,.62,z);fus.add(brace);
  }
  const nose=new T.Mesh(new T.ConeGeometry(.22,.7,16),metal);nose.rotation.z=-Math.PI/2;nose.position.set(3.15,.08,0);fus.add(nose);
  const engine=new T.Group();engine.name='16 kW engine, reduction crank and chain transmission';engine.position.set(.55,.25,0);root.add(engine);aircraft.engine=engine;
  const block=new T.Mesh(new T.BoxGeometry(.62,.42,.48),dark);engine.add(block);
  const crank=new T.Mesh(new T.TorusGeometry(.28,.025,8,32),metal);crank.rotation.y=Math.PI/2;crank.position.set(-.38,.05,0);engine.add(crank);aircraft.crank=crank;
  for(const z of [-.18,.18]){const rod=cyl(T,.018,.018,1.6,8,metal);rod.rotation.set(Math.PI/2,0,.35);rod.position.set(-.55,.45,z);engine.add(rod);}
  const mast=cyl(T,.055,.055,1.75,12,tube);mast.position.set(.15,.85,0);root.add(mast);
  for(const z of [-.55,.55]){
    const strut=cyl(T,.025,.025,2.45,8,metal);strut.rotation.set(.65,0,z>0?.36:-.36);strut.position.set(.45,.72,z/2);root.add(strut);
  }
  const tailboom=cyl(T,.035,.035,3.35,10,tube);tailboom.rotation.z=Math.PI/2;tailboom.position.set(-2.45,.28,0);root.add(tailboom);
  const tailplane=new T.Mesh(new T.BoxGeometry(.9,.035,2.25),fabric);tailplane.position.set(-3.25,.45,0);root.add(tailplane);
  const elevator=new T.Mesh(new T.BoxGeometry(.42,.03,2.0),fabric);elevator.position.set(-3.75,.45,0);root.add(elevator);aircraft.elevator=elevator;
  const fin=new T.Mesh(new T.BoxGeometry(.65,1.0,.035),fabric);fin.position.set(-3.4,.9,0);root.add(fin);
  const rudder=new T.Mesh(new T.BoxGeometry(.5,.82,.035),fabric);rudder.position.set(-3.85,.86,0);root.add(rudder);aircraft.rudder=rudder;
  const pilot=new T.Group();pilot.name='seated 55 kg adult pilot';pilot.position.set(1.25,.18,0);root.add(pilot);aircraft.pilot=pilot;
  const torsoGeom=typeof T.CapsuleGeometry==='function'?new T.CapsuleGeometry(.18,.62,6,12):new T.SphereGeometry(.28,16,8);
  const torso=new T.Mesh(torsoGeom,mat(T,0x315f7a));torso.scale.set(1,.9,.75);torso.rotation.z=-.2;torso.position.set(0,.55,0);pilot.add(torso);
  const head=new T.Mesh(new T.SphereGeometry(.16,16,12),skin);head.position.set(.05,1.03,0);pilot.add(head);
  const helmet=new T.Mesh(new T.SphereGeometry(.17,16,8,0,Math.PI*2,0,Math.PI/2),red);helmet.position.set(.05,1.05,0);pilot.add(helmet);
  for(const z of [-.13,.13]){
    const arm=cyl(T,.04,.035,.75,8,skin);arm.rotation.set(Math.PI/2,0,.8);arm.position.set(.18,.64,z);pilot.add(arm);
    const leg=cyl(T,.055,.045,.95,8,mat(T,0x2b3338));leg.rotation.set(0,0,1.15);leg.position.set(.42,.22,z);pilot.add(leg);
  }
  const seat=new T.Mesh(new T.BoxGeometry(.5,.12,.55),mat(T,0x3f3428));seat.position.set(1.15,.22,0);root.add(seat);
  const gearMat=mat(T,0x202326);
  E.gear_centres_m.forEach((g,i)=>{
    const fork=cyl(T,.022,.022,1.25,8,metal);fork.position.set(g[0],-.62,g[2]);fork.rotation.x=i?0:.12;root.add(fork);
    const wheel=new T.Mesh(new T.TorusGeometry(E.wheel_radius_m,.045,10,28),gearMat);
    wheel.name=i?'main wheel '+i:'nose wheel';wheel.position.set(...g);root.add(wheel);aircraft.wheels.push(wheel);
  });
  const label=new T.Mesh(new T.BoxGeometry(.18,.18,.18),red);label.position.set(.15,.82,0);root.add(label);
  return aircraft;
}

export function updateAircraft(a,s,c){
  const angle=s.wheel_angle??0;
  a.wheels?.forEach(w=>{w.rotation.z=angle;});
  if(a.rudder)a.rudder.rotation.y=-(c?.rudder??0)*.35;
  if(a.elevator)a.elevator.rotation.z=(c?.pitch??0)*.25;
  if(a.crank)a.crank.rotation.x=s.phase??0;
  if(a.engine)a.engine.rotation.z=.025*Math.sin(s.phase??0);
  if(a.pilot)a.pilot.rotation.z=.03*Math.sin((s.phase??0)*2);
}
