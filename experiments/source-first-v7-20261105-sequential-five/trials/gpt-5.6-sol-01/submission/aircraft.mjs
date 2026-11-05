import {makePanel} from './environment/source-mechanism.mjs';
import {wingPose} from './kinematics.mjs';

function material(T,color,roughness=.65,metalness=0){
  return new T.MeshStandardMaterial({color,roughness,metalness});
}
function mesh(T,geometry,mat,parent,name){
  const m=new T.Mesh(geometry,mat);m.name=name??'';parent.add(m);return m;
}
function rod(T,parent,a,b,r,mat,name){
  const va=new T.Vector3(...a),vb=new T.Vector3(...b),d=vb.clone().sub(va);
  const g=new T.CylinderGeometry(r,r,d.length(),8);
  const m=mesh(T,g,mat,parent,name);
  m.position.copy(va.add(vb).multiplyScalar(.5));
  m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());
  return m;
}

export function createAircraft(T,p){
  const root=new T.Group();root.name='Stanley source-linked ornithopter';
  const carbon=material(T,0x273331,.34,.72),steel=material(T,0x9ca5a0,.28,.82);
  const bronze=material(T,0xa56736,.3,.72),wood=material(T,0x765238,.72,.05);
  const fabric=new T.MeshStandardMaterial({color:0xe8dfc6,roughness:.82,
    metalness:0,side:T.DoubleSide,transparent:true,opacity:.9});
  const redFabric=new T.MeshStandardMaterial({color:0x9e3f31,roughness:.78,
    side:T.DoubleSide});
  const rubber=material(T,0x171918,.88,0),skin=material(T,0xb77c58,.8,0);
  const suit=material(T,0x394c52,.78,0),leather=material(T,0x503326,.82,0);

  // Long triangular keel and upper compression spine make the loads readable.
  rod(T,root,[-2.75,-.36,0],[2.65,-.36,0],.075,carbon,'lower keel');
  rod(T,root,[-2.55,-.34,0],[.15,.72,0],.055,steel,'aft upper longeron');
  rod(T,root,[.15,.72,0],[2.65,-.34,0],.055,steel,'forward upper longeron');
  for(const x of [-2,-1.15,-.25,.65,1.5,2.3]){
    rod(T,root,[x,-.34,-.42],[x,-.34,.42],.038,carbon);
    rod(T,root,[x,-.34,-.4],[x,.48,0],.03,steel);
    rod(T,root,[x,-.34,.4],[x,.48,0],.03,steel);
  }
  const nose=mesh(T,new T.ConeGeometry(.39,1.15,12),redFabric,root,'nose fairing');
  nose.rotation.z=-Math.PI/2;nose.position.set(2.83,-.04,0);
  const tank=mesh(T,new T.CylinderGeometry(.29,.29,.72,12),bronze,root,'fuel tank');
  tank.rotation.z=Math.PI/2;tank.position.set(.68,.02,0);

  // Exposed 16 kW engine, reduction drum, shaft and symmetric crank cheeks.
  const engine=mesh(T,new T.BoxGeometry(.72,.62,.72),carbon,root,'engine');
  engine.position.set(-.45,.02,0);
  for(const z of [-.28,-.14,0,.14,.28]){
    const fin=mesh(T,new T.BoxGeometry(.48,.07,.82),steel,root,'cooling fin');
    fin.position.set(-.45,.13+z*.1,z);
  }
  const drum=mesh(T,new T.CylinderGeometry(.3,.3,.34,16),bronze,root,'reduction drum');
  drum.geometry.rotateX(Math.PI/2);drum.position.set(-.08,.58,0);
  rod(T,root,[-.08,.58,-.65],[-.08,.58,.65],.045,steel,'wing drive shaft');
  const cranks=[];
  for(const z of [-.5,.5]){
    const crank=new T.Group();crank.position.set(-.08,.58,z);root.add(crank);
    const wheel=mesh(T,new T.TorusGeometry(.25,.035,8,20),bronze,crank,'crank wheel');
    const pin=mesh(T,new T.SphereGeometry(.065,10,7),steel,crank,'eccentric pin');
    pin.position.set(.23,0,0);cranks.push(crank);
  }
  for(const side of [-1,1]){
    rod(T,root,[-.08,.58,.5*side],[.05,.8,1.05*side],.028,bronze,'drive link');
    const hinge=mesh(T,new T.CylinderGeometry(.105,.105,.24,12),steel,root,'wing hinge');
    hinge.geometry.rotateX(Math.PI/2);hinge.position.set(0,.8,.25*side);
  }

  // The four identity groups are direct children: helper-generated panel
  // vertices already live in aircraft coordinates.
  const wingPanels={};
  const result={root,wingPanels,cranks};
  for(const name of ['leftInner','leftOuter','rightInner','rightOuter']){
    const group=new T.Group();group.name=name;root.add(group);
    const surface=new T.Group();surface.name=name+'Surface';group.add(surface);
    result[name]=group;result[name+'Surface']=surface;
    const count=name.endsWith('Outer')?2:1;
    wingPanels[name]=[];
    for(let leaf=0;leaf<count;leaf++){
      const panel=mesh(T,makePanel(T,p,name,leaf),fabric,surface,name+' leaf '+leaf);
      panel.material=leaf===1?fabric.clone():fabric;
      if(leaf===1)panel.material.opacity=.78;
      wingPanels[name].push(panel);
    }
  }

  // Cockpit, seat and a scaled seated adult with articulated-looking limbs.
  const seat=mesh(T,new T.BoxGeometry(.58,.12,.62),leather,root,'pilot seat');
  seat.position.set(.65,.1,0);seat.rotation.z=-.12;
  const back=mesh(T,new T.BoxGeometry(.12,.82,.62),leather,root,'seat back');
  back.position.set(.25,.46,0);back.rotation.z=-.12;
  const pilot=new T.Group();pilot.name='pilot';root.add(pilot);result.pilot=pilot;
  const torso=mesh(T,new T.CapsuleGeometry(.22,.62,5,10),suit,pilot,'pilot torso');
  torso.position.set(.52,.73,0);torso.rotation.z=-.12;
  const head=mesh(T,new T.SphereGeometry(.19,14,10),skin,pilot,'pilot head');
  head.position.set(.42,1.36,0);
  const helmet=mesh(T,new T.SphereGeometry(.202,14,8,0,Math.PI*2,0,Math.PI*.58),
    material(T,0xd7d0bb,.45,.1),pilot,'helmet');helmet.position.set(.42,1.39,0);
  for(const side of [-1,1]){
    rod(T,pilot,[.51,.96,.18*side],[.93,.72,.31*side],.07,suit,'pilot upper arm');
    rod(T,pilot,[.93,.72,.31*side],[1.18,.76,.18*side],.055,skin,'pilot forearm');
    rod(T,pilot,[.58,.36,.17*side],[1.12,-.2,.23*side],.09,suit,'pilot thigh');
    rod(T,pilot,[1.12,-.2,.23*side],[1.72,-.35,.23*side],.065,suit,'pilot shin');
    const boot=mesh(T,new T.BoxGeometry(.32,.13,.16),leather,pilot,'boot');
    boot.position.set(1.8,-.34,.23*side);
  }
  rod(T,root,[1.18,.76,-.25],[1.18,.76,.25],.025,steel,'control bar');

  // Conventional tail allowed by the notes: broad stabilizer, elevator,
  // swept fin and a visibly separate rudder.
  const tailplane=mesh(T,new T.BoxGeometry(.5,.045,2.25),redFabric,root,'tailplane');
  tailplane.position.set(-2.65,.08,0);
  const elevator=new T.Group();elevator.name='elevator';elevator.position.set(-2.98,.08,0);root.add(elevator);
  const elev=mesh(T,new T.BoxGeometry(.16,.04,2.25),fabric,elevator,'elevator surface');
  const fin=mesh(T,new T.BufferGeometry(),redFabric,root,'fin');
  fin.geometry.setAttribute('position',new T.Float32BufferAttribute([
    -2.75,.08,0,-2.55,1.18,0,-3.18,.08,0],3));
  fin.geometry.setIndex([0,1,2]);fin.geometry.computeVertexNormals();
  const rudder=new T.Group();rudder.name='rudder';rudder.position.set(-2.94,.1,0);root.add(rudder);
  const rud=mesh(T,new T.BoxGeometry(.34,.78,.035),fabric,rudder,'rudder surface');
  rud.position.set(-.12,.42,0);rud.rotation.z=-.18;
  result.rudder=rudder;result.elevator=elevator;

  // Three actual tyres. TorusGeometry's axle is local z; spinning about z
  // therefore never changes the tyre plane.
  const wheels=[];
  for(let i=0;i<p.gear_centres.length;i++){
    const q=p.gear_centres[i],hub=[q[0],q[1],q[2]];
    rod(T,root,[q[0]-(i?-.25:.35),-.32,i?q[2]*.55:0],hub,.035,steel,'gear strut');
    const tyreSection=.07;
    const wheel=mesh(T,new T.TorusGeometry(p.wheel_radius_m-tyreSection,tyreSection,10,24),rubber,root,'tyre '+i);
    wheel.position.set(...hub);
    const rim=mesh(T,new T.CylinderGeometry(.115,.115,.055,16),steel,wheel,'wheel hub');
    rim.geometry.rotateX(Math.PI/2);
    wheels.push(wheel);
  }
  result.wheels=wheels;
  return result;
}

export function updateAircraft(a,s,c){
  for(const w of a.wheels)w.rotation.z=-(s.wheel_angle??0);
  a.rudder.rotation.y=-.42*(c.rudder??0);
  a.elevator.rotation.z=.28*(c.pitch??0);
  for(const crank of a.cranks)crank.rotation.z=s.phase;
  // Link rods are decorative, while their crank and the production wing
  // surfaces visibly share the exact integrated phase.
  a.root.userData.currentWingPose=wingPose(s);
}
