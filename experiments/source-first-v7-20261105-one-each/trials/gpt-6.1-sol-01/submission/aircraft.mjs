import {makePanel,PANEL_NAMES,geometry,planform,chordFactor} from './environment/source-mechanism.mjs';
import {wingPose} from './kinematics.mjs';
import {E} from './environment/engineering.mjs';

export function createAircraft(T,p){
  const root=new T.Group();root.name='AURELIA · experimental articulated aircraft';
  const a={root,wheels:[],wingPanels:{},T,p,links:[],ribs:[],lowerRibs:[],ribWebs:[],cranks:[]};
  const mat=(color,metalness=0,roughness=.6)=>new T.MeshStandardMaterial({color,metalness,roughness});
  const carbon=mat(0x253638,.55,.35),alloy=mat(0xb9c4bc,.72,.29),brass=mat(0xb4914e,.7,.3);
  const red=mat(0x98432e,.25,.43),rubber=mat(0x202627,0,.86),leather=mat(0x503b2c,0,.8);
  const cream=new T.MeshStandardMaterial({color:0xe7debe,side:T.DoubleSide,roughness:.87,metalness:0});
  const outerFabric=new T.MeshStandardMaterial({color:0xd5d6c4,side:T.DoubleSide,roughness:.8});
  const mesh=(geo,material,parent=root)=>{
    const m=new T.Mesh(geo,material);parent.add(m);return m;
  };
  const ball=(pos,scale,material,parent=root)=>{
    const m=mesh(new T.SphereGeometry(1,12,8),material,parent);m.position.set(...pos);m.scale.set(...scale);return m;
  };
  const box=(pos,size,material,parent=root)=>{
    const m=mesh(new T.BoxGeometry(...size),material,parent);m.position.set(...pos);return m;
  };
  function rod(from,to,r=.025,material=alloy,parent=root){
    const m=mesh(new T.CylinderGeometry(r,r,1,8),material,parent);
    setRod(T,m,from,to);return m;
  }
  a.rod=rod;
  function disk(pos,r,depth,material,parent=root){
    const m=mesh(new T.CylinderGeometry(r,r,depth,20),material,parent);
    m.rotation.x=Math.PI/2;m.position.set(...pos);return m;
  }
  // A triangulated, open rear boom with no decorative bird-like fuselage.
  const stations=[
    {x:2.7,y:-.48,w:.10,h:.12},{x:1.65,y:-.35,w:.38,h:.35},
    {x:.35,y:-.35,w:.43,h:.42},{x:-.85,y:-.25,w:.32,h:.4},
    {x:-2.95,y:.08,w:.08,h:.1}
  ];
  for(let i=0;i<stations.length-1;i++){
    const u=stations[i],v=stations[i+1];
    for(const sign of [-1,1]){
      rod([u.x,u.y,sign*u.w],[v.x,v.y,sign*v.w],.035,carbon);
      rod([u.x,u.y+u.h,sign*u.w],[v.x,v.y+v.h,sign*v.w],.026,carbon);
      rod([u.x,u.y,sign*u.w],[v.x,v.y+v.h,sign*v.w],.015,alloy);
      rod([u.x,u.y+u.h,sign*u.w],[v.x,v.y,sign*v.w],.011,alloy);
    }
    rod([u.x,u.y,-u.w],[u.x,u.y,u.w],.024,carbon);
    rod([u.x,u.y+u.h,-u.w],[u.x,u.y+u.h,u.w],.025,alloy);
  }
  // Small composite cockpit tub and the seated pilot, with exposed controls.
  ball([1.35,-.39,0],[1.13,.24,.43],red);
  box([.56,-.18,0],[.48,.08,.47],leather);
  const seat=box([.24,.04,0],[.10,.51,.48],leather);seat.rotation.z=-.13;
  a.pilot=new T.Group();a.pilot.name='pilot';root.add(a.pilot);
  const suit=mat(0x516d72),skin=mat(0xc7926e),helmet=mat(0xe6d6b5,.12,.43),boot=mat(0x302c29);
  ball([.52,.27,0],[.19,.29,.22],suit,a.pilot);
  ball([.62,.67,0],[.115,.12,.115],skin,a.pilot);
  ball([.60,.735,0],[.145,.135,.143],helmet,a.pilot);
  const visor=ball([.718,.726,0],[.045,.067,.123],mat(0x233b42,.4,.18),a.pilot);
  for(const z of [-.14,.14]){
    rod([.59,-.05,z],[1.07,-.15,z],.085,suit,a.pilot);
    rod([1.07,-.15,z],[1.43,-.47,z],.064,suit,a.pilot);
    ball([1.51,-.48,z],[.17,.075,.09],boot,a.pilot);
    rod([.53,.43,z*1.35],[.89,.23,z*1.9],.057,suit,a.pilot);
    rod([.89,.23,z*1.9],[1.12,.27,z*.75],.047,suit,a.pilot);
    ball([1.12,.27,z*.75],[.06,.045,.05],skin,a.pilot);
    // Lap and shoulder harness.
    rod([.27,.43,z],[.68,-.02,z*.7],.024,leather,a.pilot);
  }
  box([.74,-.035,0],[.06,.045,.09],brass,a.pilot);
  rod([1.14,-.32,0],[1.12,.27,0],.018,carbon);
  rod([1.10,.27,-.14],[1.10,.27,.14],.025,rubber);
  box([1.58,.08,0],[.12,.3,.49],carbon);
  for(const z of [-.14,0,.14])disk([1.65,.12,z],.055,.015,alloy);
  // Flyscreen is a small clear fairing, not a closed canopy hiding the adult.
  const glass=new T.MeshStandardMaterial({color:0xb5d6d0,transparent:true,opacity:.28,roughness:.15,side:T.DoubleSide,depthWrite:false});
  const screen=ball([1.6,.29,0],[.23,.28,.37],glass);screen.scale.x=.10;
  rod([1.59,.05,-.36],[1.59,.48,-.25],.013,alloy);
  rod([1.59,.05,.36],[1.59,.48,.25],.013,alloy);
  // Engine, cooling fins, fuel tank, exhaust and slow-speed reduction stage.
  box([-.65,.03,0],[.59,.43,.48],carbon);
  disk([-.61,.17,.29],.20,.09,alloy);
  for(let j=0;j<7;j++)box([-.62,.28+j*.026,0],[.38,.014,.38],alloy);
  box([-1.16,-.04,0],[.38,.33,.43],mat(0x9ca7a0,.6,.4));
  disk([-1.16,.15,0],.045,.06,brass);
  rod([-.75,.18,-.25],[-1.05,.16,-.43],.035,alloy);
  rod([-1.05,.16,-.43],[-1.62,-.03,-.43],.045,carbon);
  rod([-.52,.34,.21],[-.17,.46,.21],.018,brass);
  // The mast, bearings and bilateral spring cartridges carry the actual hinges.
  for(const z of [-.26,.26]){
    rod([-.75,-.17,z],[0,.8,z],.045,carbon);
    rod([.36,-.17,z],[0,.8,z],.035,carbon);
    rod([-.65,.18,z],[0,.64,z],.025,alloy);
    disk([0,.8,z],.135,.10,brass);
    const crank=new T.Group();crank.position.set(0,.60,z*1.7);root.add(crank);
    rod([0,0,0],[.19,0,0],.024,alloy,crank);
    disk([.19,0,0],.045,.04,brass,crank);a.cranks.push(crank);
    // Visible torsion-spring winding around the spanwise root shaft.
    const pts=[];
    for(let j=0;j<=100;j++){const t=j/100;pts.push(new T.Vector3(.10*Math.cos(t*Math.PI*16),.8+.10*Math.sin(t*Math.PI*16),z+(t-.5)*.19));}
    mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts),100,.009,5,false),alloy);
  }
  rod([0,.8,-.42],[0,.8,.42],.045,alloy);
  disk([-.28,.36,.39],.24,.06,carbon);
  disk([-.28,.36,.43],.18,.065,brass);
  rod([-.62,.17,.35],[-.28,.36,.42],.035,rubber);
  // Actual source-linked curved panels; their Groups remain identity transforms.
  for(const name of PANEL_NAMES){
    const g=new T.Group();g.name=name;root.add(g);a[name]=g;
    const surface=new T.Group();surface.name=name+'Surface';g.add(surface);a[name+'Surface']=surface;
    a.wingPanels[name]=[];
    for(let leaf=0;leaf<(name.endsWith('Outer')?2:1);leaf++){
      const panel=mesh(makePanel(T,p,name,leaf),name.endsWith('Inner')?cream:outerFabric,surface);
      panel.name=name+' · sliding leaf '+leaf;a.wingPanels[name].push(panel);
    }
  }
  // Slender external ribs, quarter-chord spars and wrist joints follow the same
  // camber/stroke/slide coordinates as production fabric, without moving it.
  for(let i=0;i<16;i++){
    a.ribs.push([rod([0,0,0],[1,0,0],.009,alloy),rod([0,0,0],[1,0,0],.009,alloy)]);
    a.lowerRibs.push([rod([0,0,0],[1,0,0],.008,carbon),rod([0,0,0],[1,0,0],.008,carbon)]);
    a.ribWebs.push(rod([0,0,0],[1,0,0],.008,alloy));
    a.links.push(rod([0,0,0],[1,0,0],i<8?.025:.017,carbon));
  }
  a.wrists=[ball([0,0,0],[.105,.105,.105],brass),ball([0,0,0],[.105,.105,.105],brass)];
  // Conventional tail: rounded fabric stabiliser and fin on the long rear boom.
  function foil(parent,vertical=false){
    const shape=new T.Shape();
    shape.moveTo(.42,0);
    shape.bezierCurveTo(.35,.5,.16,1.28,-.15,1.37);
    shape.bezierCurveTo(-.34,1.38,-.50,.85,-.48,0);
    shape.bezierCurveTo(-.50,-.85,-.34,-1.38,-.15,-1.37);
    shape.bezierCurveTo(.16,-1.28,.35,-.5,.42,0);
    const g=new T.ShapeGeometry(shape,18);
    if(!vertical)g.rotateX(Math.PI/2);
    return mesh(g,cream,parent);
  }
  const stabiliser=new T.Group();stabiliser.position.set(-2.8,.23,0);root.add(stabiliser);
  foil(stabiliser);
  rod([-2.42,.23,-1.05],[-2.42,.23,1.05],.025,carbon);
  a.elevator=new T.Group();a.elevator.name='elevator';a.elevator.position.set(-3.05,.23,0);root.add(a.elevator);
  const elev=box([-.18,0,0],[.36,.035,2.02],red,a.elevator);
  const fin=new T.Group();fin.position.set(-2.8,.23,0);root.add(fin);
  const fshape=new T.Shape();fshape.moveTo(.42,0);fshape.bezierCurveTo(.26,.8,-.12,1.03,-.4,.93);fshape.lineTo(-.48,0);fshape.closePath();
  mesh(new T.ShapeGeometry(fshape,16),cream,fin);
  rod([-2.4,.25,0],[-2.94,1.13,0],.023,carbon);
  a.rudder=new T.Group();a.rudder.name='rudder';a.rudder.position.set(-3.23,.23,0);root.add(a.rudder);
  const rs=new T.Shape();rs.moveTo(0,0);rs.lineTo(0,.94);rs.bezierCurveTo(-.45,.98,-.46,.25,-.36,0);rs.closePath();
  mesh(new T.ShapeGeometry(rs,12),red,a.rudder);
  for(const sign of [-1,1]){
    rod([-1.02,-.13,sign*.25],[-2.8,.23,sign*1.05],.008,alloy);
    rod([1.13,-.23,sign*.2],[-3.23,.30,sign*.035],.006,brass);
  }
  // Three actual toroidal tyre meshes, with z axles. Spin about local z only.
  for(const [i,g] of p.gear_centres.entries()){
    const [x,y,z]=g;
    const top=i===0?[1.65,-.25,0]:[-.4,-.13,Math.sign(z)*.28];
    rod(top,[x,y,z],.036,carbon);
    rod([i===0?2.28:.4,-.40,Math.sign(z)*.25],[x,y,z],.025,alloy);
    rod([x,y,z-.16],[x,y,z+.16],.035,alloy);
    const tyre=mesh(new T.TorusGeometry(p.wheel_radius_m-.06,.06,10,28),rubber);
    tyre.position.set(...g);tyre.name=['nose tyre','port main tyre','starboard main tyre'][i];
    a.wheels.push(tyre);
    disk([0,0,0],.085,.115,alloy,tyre);
    for(let j=0;j<6;j++){
      const t=j*Math.PI/3;
      rod([0,0,0],[.165*Math.cos(t),.165*Math.sin(t),0],.008,alloy,tyre);
    }
    disk([0,0,.075],.04,.025,brass,tyre);
  }
  a.materials={carbon,alloy,brass,red,cream};
  return a;
}

function setRod(T,m,a,b){
  const from=new T.Vector3(...a),to=new T.Vector3(...b),d=to.sub(from);
  m.position.copy(from).addScaledVector(d,.5);
  const len=d.length();m.scale.set(1,Math.max(1e-6,len),1);
  m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());
}

export function updateAircraft(a,s,c={}){
  const {T,p}=a,pose=wingPose(s),geo=geometry(p,pose),g=planform(p);
  for(const wheel of a.wheels)wheel.rotation.set(0,0,s.wheel_angle??0);
  a.rudder.rotation.y=-(c.rudder??0)*.4;
  a.elevator.rotation.z=-(c.pitch??0)*.25;
  a.cranks.forEach(crank=>crank.rotation.z=-s.phase);
  const previous={};
  geo.samples.forEach((v,i)=>{
    const outer=v.region==='outer';
    const materialT=outer?v.leaf*.5+v.t*.5:0;
    const k=Math.min(3,Math.floor(materialT*4)),f=materialT*4-k;
    const chord=outer?g.chord*(chordFactor(k/4)*(1-f)+chordFactor((k+1)/4)*f):g.chord;
    // Quarter-chord sample contains .75*camber*chord of curvature.
    const at=u=>v.point.map((x,j)=>x+(.25-u)*chord*v.chord[j]+(4*u*(1-u)-.75)*chord*v.camber*v.normal[j]);
    const thickness=chord*(outer?E.wing.outer_thickness_fraction:E.wing.inner_thickness_fraction);
    const lower=u=>at(u).map((x,j)=>x-4*u*(1-u)*thickness*v.normal[j]);
    setRod(T,a.ribs[i][0],at(0),at(.5));
    setRod(T,a.ribs[i][1],at(.5),at(1));
    setRod(T,a.lowerRibs[i][0],lower(0),lower(.5));
    setRod(T,a.lowerRibs[i][1],lower(.5),lower(1));
    setRod(T,a.ribWebs[i],at(.25),lower(.25));
    const key=v.name+v.leaf;
    let start=previous[key];
    if(!start){
      const side=v.name.startsWith('left')?-1:1;
      const inn=pose[side<0?'leftInner':'rightInner'];
      start=outer?[inn.sweep,E.wing.root_height_m+g.inner*Math.sin(inn.stroke),side*(g.hinge+g.inner*Math.cos(inn.stroke))]:[pose[v.name].sweep,E.wing.root_height_m,side*g.hinge];
    }
    setRod(T,a.links[i],start,v.point);previous[key]=v.point;
  });
  for(let i=0;i<2;i++){
    const side=i===0?-1:1,inn=pose[side<0?'leftInner':'rightInner'];
    a.wrists[i].position.set(inn.sweep,E.wing.root_height_m+g.inner*Math.sin(inn.stroke),side*(g.hinge+g.inner*Math.cos(inn.stroke)));
  }
}
