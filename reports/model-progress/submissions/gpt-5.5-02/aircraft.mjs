import {E} from './environment/engineering.mjs';
import {makePanel,PANEL_NAMES} from './environment/source-mechanism.mjs';

function mat(T,color,rough=0.75,side){
  return new T.MeshStandardMaterial({color,roughness:rough,metalness:.08,side});
}

export function createAircraft(T,p){
  const root=new T.Group();root.name='source-linked human ornithopter';
  const fabric=new T.MeshStandardMaterial({color:0xf2efe0,roughness:.9,metalness:0,side:T.DoubleSide,transparent:true,opacity:.86});
  const wood=mat(T,0x7b5133),metal=mat(T,0x38434a,.45),dark=mat(T,0x1d2427),skin=mat(T,0xc58b67),leather=mat(T,0x3b2419),red=mat(T,0x8d3e2f);
  const fus=new T.Mesh(new T.CylinderGeometry(.22,.30,4.8,16),metal);fus.rotation.z=Math.PI/2;fus.position.set(.35,.2,0);fus.name='open tubular fuselage keel';root.add(fus);
  const nose=new T.Mesh(new T.ConeGeometry(.32,.9,16),metal);nose.rotation.z=-Math.PI/2;nose.position.set(2.9,.22,0);root.add(nose);
  const seat=new T.Mesh(new T.BoxGeometry(.55,.18,.52),leather);seat.position.set(.75,.35,0);seat.rotation.z=-.18;root.add(seat);
  const tank=new T.Mesh(new T.CylinderGeometry(.18,.18,.62,16),red);tank.rotation.x=Math.PI/2;tank.position.set(.05,.32,0);root.add(tank);
  const engine=new T.Group();engine.name='16 kW engine and crank reduction';
  const block=new T.Mesh(new T.BoxGeometry(.55,.42,.48),dark);block.position.set(1.55,.35,0);engine.add(block);
  const crank=new T.Mesh(new T.CylinderGeometry(.25,.25,.12,24),metal);crank.rotation.x=Math.PI/2;crank.position.set(1.2,.36,0);engine.add(crank);
  root.add(engine);
  const mast=new T.Mesh(new T.CylinderGeometry(.035,.045,1.9,8),metal);mast.position.set(.35,1.0,0);root.add(mast);
  for(const z of [-.34,.34]){
    const strut=new T.Mesh(new T.CylinderGeometry(.022,.022,2.1,8),metal);
    strut.position.set(.65,.75,z);strut.rotation.z=.35;root.add(strut);
  }
  const pilot=new T.Group();pilot.name='seated 55 kg pilot';
  const body=new T.Mesh(new T.CylinderGeometry(.18,.22,.72,12),new T.MeshStandardMaterial({color:0x304d69,roughness:.8}));body.position.set(.72,.83,0);body.rotation.z=-.25;pilot.add(body);
  const head=new T.Mesh(new T.SphereGeometry(.14,16,12),skin);head.position.set(.58,1.28,0);pilot.add(head);
  const helmet=new T.Mesh(new T.SphereGeometry(.148,16,8,0,Math.PI*2,0,Math.PI*.55),dark);helmet.position.copy(head.position);helmet.position.y+=.025;pilot.add(helmet);
  for(const z of [-.18,.18]){
    const arm=new T.Mesh(new T.CylinderGeometry(.035,.035,.72,8),skin);arm.position.set(.95,.88,z);arm.rotation.z=Math.PI/2.7;arm.rotation.x=z>0?.35:-.35;pilot.add(arm);
    const leg=new T.Mesh(new T.CylinderGeometry(.045,.045,.86,8),new T.MeshStandardMaterial({color:0x273445,roughness:.8}));leg.position.set(1.05,.42,z);leg.rotation.z=Math.PI/2.3;pilot.add(leg);
  }
  root.add(pilot);
  const tailBoom=new T.Mesh(new T.CylinderGeometry(.035,.04,3.2,8),metal);tailBoom.rotation.z=Math.PI/2;tailBoom.position.set(-1.75,.32,0);root.add(tailBoom);
  const elevator=new T.Group();elevator.name='elevator';
  const et=new T.Mesh(new T.BoxGeometry(.55,.035,2.2),fabric);et.position.set(-3.15,.55,0);elevator.add(et);root.add(elevator);
  const rudder=new T.Group();rudder.name='rudder';
  const ru=new T.Mesh(new T.BoxGeometry(.55,1.0,.035),fabric);ru.position.set(-3.28,.85,0);rudder.add(ru);root.add(rudder);
  const wheels=[];
  for(const [i,g] of E.gear_centres_m.entries()){
    const yoke=new T.Mesh(new T.CylinderGeometry(.018,.018,.9,8),metal);yoke.position.set(g[0],(g[1]+.1)/2,g[2]);root.add(yoke);
    const wheel=new T.Mesh(new T.TorusGeometry(E.wheel_radius_m,.045,10,24),dark);
    wheel.name=i===0?'nose actual tyre':'left/right actual tyre '+i;
    wheel.position.set(...g);root.add(wheel);wheels.push(wheel);
  }
  const wingPanels={};
  const aircraft={root,pilot,rudder,elevator,wheels,wingPanels};
  for(const name of PANEL_NAMES){
    const group=new T.Group();group.name=name;
    const surface=new T.Group();surface.name=name+'Surface';group.add(surface);root.add(group);
    aircraft[name]=group;aircraft[name+'Surface']=surface;
    const leaves=[];
    for(let leaf=0;leaf<(name.endsWith('Outer')?2:1);leaf++){
      const mesh=new T.Mesh(makePanel(T,p,name,leaf),fabric);
      mesh.name=name+(leaf?' sliding overlapping outer leaf':' source curved fabric');
      surface.add(mesh);leaves.push(mesh);
    }
    wingPanels[name]=leaves;
  }
  // Visible spars and wrist hinges, separate from host-mounted aerodynamic leaves.
  for(const side of [-1,1]){
    const spar=new T.Mesh(new T.CylinderGeometry(.025,.035,3.2,8),wood);spar.position.set(.15,.82,side*1.85);spar.rotation.x=Math.PI/2;root.add(spar);
    const wrist=new T.Mesh(new T.SphereGeometry(.09,12,8),metal);wrist.position.set(.05,.88,side*3.35);root.add(wrist);
    const rod=new T.Mesh(new T.CylinderGeometry(.018,.018,2.0,8),metal);rod.position.set(.85,.55,side*.9);rod.rotation.z=1.1;rod.rotation.x=side*.8;root.add(rod);
  }
  return aircraft;
}

export function updateAircraft(a,s,c){
  const wa=s.wheel_angle??0;
  a.wheels?.forEach(w=>{w.rotation.z=wa;});
  if(a.rudder)a.rudder.rotation.y=-(c?.rudder??0)*.32;
  if(a.elevator)a.elevator.rotation.z=(c?.pitch??0)*.22;
  if(a.pilot){
    a.pilot.rotation.z=-(c?.pitch??0)*.03;
    a.pilot.rotation.y=(c?.rudder??0)*.04;
  }
}
