// Withheld integration fixture. Low-poly geometry, one visible seated adult pilot.
import {E} from './environment/engineering.mjs';
import {planform,makePanel} from './environment/source-mechanism.mjs';
export function createAircraft(T,p){
  const root=new T.Group(),g=planform(p),parts={root,wingPanels:{}};
  const materials={frame:new T.MeshStandardMaterial({color:0x415857,roughness:.75}),
    cloth:new T.MeshStandardMaterial({color:0xe4dbc0,side:T.DoubleSide,roughness:1}),
    copper:new T.MeshStandardMaterial({color:0xb68a4e,roughness:.5,metalness:.35}),
    rubber:new T.MeshStandardMaterial({color:0x252b2d,roughness:1}),
    jacket:new T.MeshStandardMaterial({color:0xb24b31,roughness:1}),
    skin:new T.MeshStandardMaterial({color:0xd8a079,roughness:1}),
    trousers:new T.MeshStandardMaterial({color:0x30485e,roughness:1})};
  function mesh(parent,geometry,material,x=0,y=0,z=0,name=''){
    const m=new T.Mesh(geometry,material);m.position.set(x,y,z);m.name=name;parent.add(m);return m;
  }
  const box=(parent,x,y,z,a,b,c,material=materials.frame,name='')=>mesh(parent,new T.BoxGeometry(a,b,c),material,x,y,z,name);
  function rod(parent,a,b,r=.035,material=materials.frame){
    const v=new T.Vector3(...a),w=new T.Vector3(...b),delta=w.clone().sub(v);
    const m=mesh(parent,new T.CylinderGeometry(r,r,delta.length(),6),material);
    m.position.copy(v.add(w).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());return m;
  }
  // Load-bearing truss and tail boom, with a visibly separate engine/transmission.
  for(const side of [-1,1]){
    rod(root,[2.2,-.35,side*.38],[-2.8,0,side*.12]);
    rod(root,[1,.2,side*.45],[-1.2,.65,side*.35]);
    rod(root,[-1.2,.65,side*.35],[-2.8,0,side*.12]);
    rod(root,[.0,-.35,side*.38],[0,.8,side*.25]);
    rod(root,[1,.2,side*.45],[2.2,-.35,side*.38]);
    rod(root,[-.5,-.35,side*.38],[-.5,.65,side*.35]);
  }
  box(root,-.55,.08,0,.65,.55,.6,materials.frame);
  for(let i=0;i<4;i++)box(root,-.4+i*.13,.41,0,.06,.14,.61,materials.copper);
  box(root,.08,.32,0,.3,.55,.5,materials.copper);
  box(root,-.9,-.3,0,.6,.28,.45,materials.rubber);
  for(const side of [-1,1])for(const region of ['Inner','Outer']){
    const name=(side<0?'left':'right')+region;
    const hinge=parts[name]=new T.Group();root.add(hinge);
    const surface=parts[name+'Surface']=new T.Group();hinge.add(surface);
    parts.wingPanels[name]=[];
    for(let leaf=0;leaf<(region==='Outer'?2:1);leaf++){
      const panel=mesh(surface,makePanel(T,p,name,leaf),materials.cloth,0,0,0,name+'Leaf'+leaf);
      parts.wingPanels[name].push(panel);
    }
  }
  const elevator=parts.elevator=new T.Group();elevator.position.set(-2.65,.05,0);root.add(elevator);
  box(elevator,0,0,0,.65,.045,2.1,materials.cloth);
  const rudder=parts.rudder=new T.Group();rudder.position.set(-2.85,.05,0);root.add(rudder);
  const fin=new T.BufferGeometry();fin.setAttribute('position',new T.Float32BufferAttribute([.2,0,0,-.35,0,0,-.25,1.0,0,.15,.6,0],3));fin.setIndex([0,1,2,0,2,3]);fin.computeVertexNormals();mesh(rudder,fin,materials.cloth);
  // Seated human: head with face, torso, two arms and two bent legs.
  const pilot=parts.pilot=new T.Group();pilot.name='seated-adult-pilot';root.add(pilot);
  box(root,1.05,-.4,0,.5,.1,.58,materials.rubber);box(root,.83,-.12,0,.1,.6,.58,materials.rubber);
  box(pilot,1.05,.05,0,.3,.56,.43,materials.jacket,'pilot-torso');
  mesh(pilot,new T.SphereGeometry(.145,12,8),materials.skin,1.08,.52,0,'pilot-head');
  mesh(pilot,new T.SphereGeometry(.15,12,6,0,Math.PI*2,0,Math.PI*.55),materials.trousers,1.08,.54,0);
  box(pilot,1.215,.54,-.07,.02,.025,.035,materials.rubber);box(pilot,1.215,.54,.07,.02,.025,.035,materials.rubber);
  for(const side of [-1,1]){
    rod(pilot,[1.05,.22,side*.25],[1.37,-.04,side*.27],.06,materials.jacket);
    rod(pilot,[1.37,-.04,side*.27],[1.55,.03,side*.15],.055,materials.jacket);
    mesh(pilot,new T.SphereGeometry(.065,8,6),materials.skin,1.55,.03,side*.15);
    rod(pilot,[1.05,-.25,side*.13],[1.55,-.48,side*.16],.085,materials.trousers);
    rod(pilot,[1.55,-.48,side*.16],[1.75,-.88,side*.16],.07,materials.trousers);
    box(pilot,1.83,-.94,side*.16,.27,.12,.17,materials.rubber);
  }
  rod(root,[1.55,-.2,0],[1.55,.06,0],.025);rod(root,[1.5,.06,-.18],[1.5,.06,.18],.025);
  const wheels=parts.wheels=[];
  for(const [x,y,z] of p.gear_centres){
    rod(root,[x*.7,-.25,z*.25],[x,y,z],.045);
    const geometry=new T.CylinderGeometry(p.wheel_radius_m,p.wheel_radius_m,.13,16);geometry.rotateX(Math.PI/2);
    const w=mesh(root,geometry,materials.rubber,x,y,z,'landing-wheel');wheels.push(w);
    const hub=new T.CylinderGeometry(.075,.075,.14,8);hub.rotateX(Math.PI/2);mesh(w,hub,materials.copper);
  }
  return parts;
}
export function updateAircraft(a,state,controls){
  a.rudder.rotation.y=controls.rudder*.45;a.elevator.rotation.z=controls.pitch*.25;
  for(const wheel of a.wheels)wheel.rotation.y=-(state.wheel_angle??0);
}
