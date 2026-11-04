import {makePanel,PANEL_NAMES,geometry,planform,chordFactor} from './environment/source-mechanism.mjs';
import {wingPose} from './kinematics.mjs';

export function createAircraft(T,p){
  const root=new T.Group(),a={root,wheels:[],wingPanels:{},T,p};
  const mat=(color,metalness=0,roughness=.6)=>new T.MeshStandardMaterial({color,metalness,roughness});
  const graphite=mat(0x263c40,.65,.32),metal=mat(0xaab9b5,.8,.27),brass=mat(0xc89649,.65,.3);
  const teal=mat(0x155d63,.4,.35),leather=mat(0x553b2d,0,.8),rubber=mat(0x202624,0,.93);
  const fabric=new T.MeshStandardMaterial({color:0xe6d6aa,side:T.DoubleSide,roughness:.87,metalness:0});
  const fabricOuter=fabric.clone();fabricOuter.color.setHex(0xf2e6c8);
  const mesh=(g,m,pos,parent=root)=>{
    const n=new T.Mesh(g,m);if(pos)n.position.fromArray(pos);parent.add(n);return n;
  };
  const sphere=(r,m,pos,scale=[1,1,1],parent=root)=>{
    const n=mesh(new T.SphereGeometry(r,16,10),m,pos,parent);n.scale.fromArray(scale);return n;
  };
  const box=(size,m,pos,parent=root)=>mesh(new T.BoxGeometry(...size),m,pos,parent);
  const tube=(from,to,r=.025,m=metal,parent=root)=>{
    const v=new T.Vector3(...to).sub(new T.Vector3(...from));
    const n=mesh(new T.CylinderGeometry(r,r,v.length(),8),m,from,parent);
    n.position.addScaledVector(v,.5);n.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());return n;
  };
  a.tube=tube;
  // Open triangulated tubular longerons, with a tapered six-metre silhouette.
  const stations=[[-3,0,.1],[-1.4,-.3,.30],[.2,-.44,.42],[1.5,-.36,.35],[3,-.16,.05]];
  for(let i=0;i<stations.length-1;i++){
    const [x,y,z]=stations[i],[xx,yy,zz]=stations[i+1];
    for(const side of [-1,1]){
      tube([x,y,side*z],[xx,yy,side*zz],.032,graphite);
      tube([x,y+.46,side*z],[xx,yy+.46,side*zz],.025,metal);
      tube([x,y,side*z],[xx,yy+.46,side*zz],.018,metal);
      tube([x,y+.46,side*z],[x,y,side*z],.021,graphite);
    }
    tube([x,y,-z],[x,y,z],.023,graphite);
  }
  sphere(.62,teal,[1.83,-.15,0],[1.6,.52,.63]);
  sphere(.5,teal,[.3,-.42,0],[2.3,.3,.85]);
  // Rear boom stays clear of the wing transmission.
  tube([-1.1,.0,0],[-3,.12,0],.085,graphite);
  for(const side of [-1,1]){
    tube([-.45,-.4,side*.32],[-2.8,.13,side*.15],.018,metal);
    tube([-.3,.35,side*.4],[-.05,.8,side*.25],.045,graphite);
    sphere(.12,brass,[-.05,.8,side*.25],[1,1,.7]);
    tube([-.05,.8,-.25],[-.05,.8,.25],.065,metal);
  }
  // Compact two-stroke, cooling fins, exhaust, tank and slow output reduction.
  box([.64,.38,.43],graphite,[-.8,-.03,0]);
  const cylinder=box([.30,.42,.33],metal,[-.76,.28,0]);cylinder.rotation.z=-.22;
  for(let j=0;j<7;j++)box([.38,.018,.40],graphite,[-.76,.13+j*.05,0]);
  tube([-1,.16,.2],[-1.4,.05,.28],.055,brass);
  tube([-1.4,.05,.28],[-1.5,-.25,.28],.085,graphite);
  sphere(.29,metal,[-1.42,-.18,0],[.85,.78,1.05]);
  box([.45,.07,.45],teal,[-1.4,-.41,0]);
  sphere(.045,brass,[-1.4,.06,0]);
  const gearbox=mesh(new T.CylinderGeometry(.26,.26,.3,20),teal,[-.28,.26,0]);
  gearbox.rotation.x=Math.PI/2;
  const crank=new T.Group();crank.position.set(-.28,.35,0);root.add(crank);a.crank=crank;
  const fly=mesh(new T.TorusGeometry(.29,.035,8,28),brass,[0,0,.18],crank);
  for(let i=0;i<6;i++){
    const q=i*Math.PI/3;
    tube([0,0,.18],[.27*Math.cos(q),.27*Math.sin(q),.18],.016,metal,crank);
  }
  sphere(.055,metal,[.17,0,.22],[1,1,1],crank);
  a.links=[];
  for(const z of [-.25,.25]){
    const rod=tube([-.1,.35,z],[0,.8,z],.025,brass);
    a.links.push({rod,z});
    // Captive hinge spring and thrust bearings.
    const coil=mesh(new T.TorusGeometry(.13,.025,8,24),graphite,[0,.8,z]);
    coil.rotation.y=Math.PI/2;
  }
  // A seated 1.65 m adult: pelvis, bent legs, separate hands, face and visor.
  const pilot=new T.Group();root.add(pilot);a.pilot=pilot;
  const suit=mat(0x405a63),skin=mat(0xbd8f6c),boot=mat(0x322c27),helmet=mat(0xd9d8cc,.1,.4);
  box([.47,.10,.50],leather,[.60,-.07,0]);
  const back=box([.11,.66,.48],leather,[.30,.22,0]);back.rotation.z=-.12;
  sphere(.24,suit,[.67,.20,0],[.72,1.32,.82],pilot);
  sphere(.19,suit,[.77,-.01,0],[1.2,.7,1],pilot);
  tube([.64,.37,0],[.64,.55,0],.072,skin,pilot);
  sphere(.15,skin,[.66,.67,0],[.9,1.13,.83],pilot);
  sphere(.166,helmet,[.635,.73,0],[.96,.86,1],pilot);
  sphere(.151,mat(0x293e45,.55,.16),[.715,.73,0],[.7,.40,.95],pilot);
  sphere(.043,skin,[.803,.665,0],[1,.8,.65],pilot);
  for(const side of [-1,1]){
    const z=side*.15;
    tube([.77,.0,z],[1.19,-.12,z],.09,suit,pilot);
    sphere(.09,suit,[1.19,-.12,z],[1,1,1],pilot);
    tube([1.19,-.12,z],[1.46,-.52,z],.066,suit,pilot);
    sphere(.095,boot,[1.54,-.55,z],[1.7,.65,.85],pilot);
    tube([.62,.37,side*.18],[.97,.15,side*.28],.06,suit,pilot);
    tube([.97,.15,side*.28],[1.12,.27,side*.1],.047,suit,pilot);
    sphere(.06,skin,[1.12,.27,side*.1],[1,1,1],pilot);
    tube([.41,.46,side*.16],[.81,.02,side*.10],.018,brass,pilot);
    tube([1.42,-.51,z],[1.67,-.51,z],.025,metal);
  }
  tube([1.08,-.16,0],[1.12,.29,0],.023,graphite);
  tube([1.12,.29,-.14],[1.12,.29,.14],.028,leather);
  const instrument=box([.1,.22,.38],graphite,[1.45,.2,0]);instrument.rotation.z=.2;
  for(const z of [-.10,.10]){
    const dial=mesh(new T.CircleGeometry(.064,16),leather,[1.39,.22,z]);
    dial.rotation.y=-Math.PI/2;
    tube([1.38,.22,z],[1.38,.26,z+.02],.005,helmet);
  }
  // Conventional tail: fixed stabilizer and independent hinged controls.
  box([.43,.035,2.0],teal,[-2.67,.13,0]);
  a.elevator=new T.Group();a.elevator.position.set(-2.94,.13,0);root.add(a.elevator);
  box([.24,.028,1.94],fabric,[-.12,0,0],a.elevator);
  const fin=mesh(new T.BoxGeometry(.65,.70,.035),teal,[-2.62,.51,0]);fin.rotation.z=-.18;
  a.rudder=new T.Group();a.rudder.position.set(-2.97,.55,0);root.add(a.rudder);
  box([.24,.66,.028],fabric,[-.12,0,0],a.rudder);
  tube([-2.9,.14,-.85],[-1.6,-.24,-.25],.012,metal);
  tube([-2.9,.14,.85],[-1.6,-.24,.25],.012,metal);
  // Three actual tyres. Torus normal is z; spin is ONLY around z.
  for(const g of p.gear_centres){
    const [x,y,z]=g;
    tube([x===2?1.55:-.55,-.25,z*.28],[x,y,z],.036,metal);
    tube([x===2?2.25:.55,-.3,z*.25],[x,y,z],.025,graphite);
    tube([x,y,z-.13],[x,y,z+.13],.038,metal);
    const wheel=mesh(new T.TorusGeometry(p.wheel_radius_m-.052,.052,10,28),rubber,g);
    a.wheels.push(wheel);
    const hub=mesh(new T.CylinderGeometry(.072,.072,.15,12),metal,[0,0,0],wheel);hub.rotation.x=Math.PI/2;
    for(let j=0;j<8;j++){
      const q=j*Math.PI/4;
      tube([0,0,0],[.17*Math.cos(q),.17*Math.sin(q),0],.009,metal,wheel);
    }
  }
  for(const name of PANEL_NAMES){
    a[name]=new T.Group();a[name].name=name;root.add(a[name]);
    a[name+'Surface']=new T.Group();a[name+'Surface'].name=name+'Surface';a[name].add(a[name+'Surface']);
    a.wingPanels[name]=[];
    for(let leaf=0;leaf<(name.endsWith('Outer')?2:1);leaf++){
      const n=new T.Mesh(makePanel(T,p,name,leaf),name.endsWith('Outer')?fabricOuter:fabric);
      a[name+'Surface'].add(n);a.wingPanels[name].push(n);
    }
  }
  // Fine rib/spar overlay; its coordinates follow the same actual curved sections.
  const lines=new T.BufferGeometry();
  lines.setAttribute('position',new T.BufferAttribute(new Float32Array(2400),3));
  a.structure=new T.LineSegments(lines,new T.LineBasicMaterial({color:0x776b49,transparent:true,opacity:.7}));
  a.structure.frustumCulled=false;root.add(a.structure);
  a.spars=[];
  for(const name of PANEL_NAMES)for(let leaf=0;leaf<(name.endsWith('Outer')?2:1);leaf++){
    const rod=tube([0,0,0],[0,1,0],name.endsWith('Outer')?.019:.035,graphite);
    const bearing=sphere(.064,brass,[0,0,0],[1,.55,1]);
    a.spars.push({name,leaf,rod,bearing});
  }
  a.sparMaterial=graphite;
  return a;
}
export function updateAircraft(a,s,c={}){
  const {T}=a;
  for(const w of a.wheels)w.rotation.set(0,0,-(s.wheel_angle??0));
  a.rudder.rotation.y=-(c.rudder??0)*.35;
  a.elevator.rotation.z=-(c.pitch??0)*.25;
  a.crank.rotation.z=s.phase;
  for(const {rod,z} of a.links){
    const from=new T.Vector3(-.28+.17*Math.cos(s.phase),.35+.17*Math.sin(s.phase),z);
    const to=new T.Vector3(-.05,.8,z),v=to.clone().sub(from);
    rod.position.copy(from).addScaledVector(v,.5);
    rod.scale.y=v.length()/.461;rod.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());
  }
  // Reconstruct visible seam lines directly from the helper's sample geometry.
  const pose=wingPose(s),g=planform(a.p),geo=geometry(a.p,pose),array=a.structure.geometry.attributes.position.array;
  for(const {name,leaf,rod,bearing} of a.spars){
    const rows=geo.samples.filter(v=>v.name===name&&v.leaf===leaf);
    const first=rows[0],last=rows[rows.length-1];
    const from=new T.Vector3(...first.point),to=new T.Vector3(...last.point);
    const delta=to.clone().sub(from),fraction=last.t-first.t;
    if(fraction>1e-8){
      delta.multiplyScalar(1/fraction);
      from.addScaledVector(delta,-first.t);
      to.copy(from).add(delta);
    }
    from.addScaledVector(new T.Vector3(...first.normal),.012);
    to.addScaledVector(new T.Vector3(...last.normal),.012);
    const v=to.sub(from);
    rod.position.copy(from).addScaledVector(v,.5);
    rod.scale.y=v.length();rod.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());
    bearing.position.copy(from);
  }
  let n=0;
  const line=(u,v)=>{
    if(n+6>array.length)return;
    for(const x of [...u,...v])array[n++]=x;
  };
  for(const name of PANEL_NAMES){
    const rows=geo.samples.filter(v=>v.name===name),outer=name.endsWith('Outer');
    for(let i=0;i<rows.length;i++){
      const v=rows[i],t=outer?v.leaf*.5+v.t*.5:v.t,chord=g.chord*(outer?chordFactor(t):1);
      const u0=v.point.map((x,k)=>x+.25*chord*v.chord[k]+(.006-.75*chord*v.camber)*v.normal[k]);
      const um=v.point.map((x,k)=>x-.25*chord*v.chord[k]+(.006+.25*chord*v.camber)*v.normal[k]);
      const u1=v.point.map((x,k)=>x-.75*chord*v.chord[k]+(.006-.75*chord*v.camber)*v.normal[k]);
      line(u0,um);line(um,u1);
      if(i>0&&rows[i-1].leaf===v.leaf){
        const prev=rows[i-1];
        line(prev.point.map((x,k)=>x+.009*prev.normal[k]),v.point.map((x,k)=>x+.009*v.normal[k]));
      }
    }
  }
  a.structure.geometry.setDrawRange(0,n/3);
  a.structure.geometry.attributes.position.needsUpdate=true;
}
