import {E} from './environment/engineering.mjs';
import {wingPose} from './kinematics.mjs';
import {makePanel,planform,chordFactor,PANEL_NAMES} from './environment/source-mechanism.mjs';

export function createAircraft(T,p) {
  const root=new T.Group();root.name='Tinn — experimental mechanical sailplane';
  const a={root,wingPanels:{},wheels:[],wingDetails:[],wristLinks:[],T,p};
  const material=(color,metalness=0,roughness=.6)=>new T.MeshStandardMaterial({color,metalness,roughness});
  const steel=material(0x36464a,.78,.3),aluminium=material(0xb7c4c3,.75,.27);
  const brass=material(0xb28a48,.65,.35),rubber=material(0x202829,0,.92);
  const blue=material(0x174d58,.35,.42),leather=material(0x633d2e,0,.85);
  const fabric=new T.MeshStandardMaterial({color:0xece2c6,side:T.DoubleSide,roughness:.91,metalness:0});
  const outerFabric=new T.MeshStandardMaterial({color:0xf6eed9,side:T.DoubleSide,roughness:.88});
  const skin=material(0xc78b65,0,.85),suit=material(0x344c5c,0,.95),visor=material(0x233b42,.5,.15);
  function mesh(geo,mat,parent=root,pos=[0,0,0]) {
    const m=new T.Mesh(geo,mat);m.position.fromArray(pos);parent.add(m);return m;
  }
  function ball(pos,size,mat,parent=root) {
    const m=mesh(new T.SphereGeometry(1,16,10),mat,parent,pos);m.scale.set(...size);return m;
  }
  function box(pos,size,mat,parent=root) {return mesh(new T.BoxGeometry(...size),mat,parent,pos);}
  function tube(from,to,r,mat,parent=root) {
    const m=mesh(new T.CylinderGeometry(r,r,1,8),mat,parent);
    setRod(m,from,to);return m;
  }
  function group(name,pos=[0,0,0],parent=root) {
    const g=new T.Group();g.name=name;g.position.fromArray(pos);parent.add(g);return g;
  }
  function plate(points,mat,parent=root) {
    const geo=new T.BufferGeometry(),v=[];
    for(let i=1;i<points.length-1;i++)v.push(...points[0],...points[i],...points[i+1]);
    geo.setAttribute('position',new T.Float32BufferAttribute(v,3));geo.computeVertexNormals();
    return mesh(geo,mat,parent);
  }
  // Identity wing containers: production leaf vertices are mounted by the host.
  for(const name of PANEL_NAMES) {
    a[name]=group(name);a[name+'Surface']=group(name+'Surface',[0,0,0],a[name]);
    a.wingPanels[name]=[];
    const outer=name.endsWith('Outer');
    for(let leaf=0;leaf<(outer?2:1);leaf++) {
      const panel=mesh(makePanel(T,p,name,leaf),outer?outerFabric:fabric,a[name+'Surface']);
      panel.name=name+' sliding material leaf '+leaf;a.wingPanels[name].push(panel);
      // Ribs follow the same curved material coordinates, including overlap.
      const count=outer?2:4;
      for(let j=0;j<=count;j++)for(let u=0;u<2;u++) {
        const rod=tube([0,0,0],[0,1,0],.009,brass,a[name]);
        a.wingDetails.push({rod,name,leaf,t0:j/count,u0:u*.5,t1:j/count,u1:(u+1)*.5});
      }
      for(const u of [.08,.72])for(let j=0;j<count;j++) {
        const rod=tube([0,0,0],[0,1,0],u<.1?.024:.013,steel,a[name]);
        a.wingDetails.push({rod,name,leaf,t0:j/count,u0:u,t1:(j+1)/count,u1:u});
      }
      if(!outer) {
        // The arm is a shallow structural airfoil, unlike the thin hand plate.
        for(let j=0;j<=count;j++)for(let u=0;u<2;u++) {
          const rod=tube([0,0,0],[0,1,0],.008,aluminium,a[name]);
          a.wingDetails.push({rod,name,leaf,t0:j/count,u0:u*.5,t1:j/count,u1:(u+1)*.5,lower:true});
        }
      }
    }
  }
  for(const side of [-1,1]) {
    const bearing=ball([0,0,0],[.13,.13,.10],brass);
    const cap=ball([0,0,0],[.065,.065,.11],steel);
    const links=[.08,.72].map(u=>({u,rod:tube([0,0,0],[0,1,0],.028,aluminium)}));
    a.wristLinks.push({side,bearing,cap,links});
  }
  // Triangulated, load-bearing keel and two longerons.
  const stations=[[-3.05,-.05,.08],[-1.65,-.32,.22],[-.55,-.55,.36],[.65,-.55,.36],[1.8,-.5,.23],[2.35,-.4,.06]];
  for(let side of [-1,1]) {
    for(let i=0;i<stations.length-1;i++) {
      const [x,y,z]=stations[i],[xx,yy,zz]=stations[i+1];
      tube([x,y,side*z],[xx,yy,side*zz],.032,steel);
      tube([x,y+.4,side*z*.8],[xx,yy+.4,side*zz*.8],.022,aluminium);
      tube([x,y,side*z],[xx,yy+.4,side*zz*.8],.016,steel);
      tube([x,y+.4,side*z*.8],[xx,yy,side*zz],.012,brass);
    }
  }
  for(const [x,y,z] of stations) {
    tube([x,y,-z],[x,y,z],.025,steel);
    for(const sign of [-1,1])ball([x,y,sign*z],[.045,.045,.045],brass);
  }
  ball([1.6,-.42,0],[.85,.23,.32],blue);
  ball([-.45,-.42,0],[.65,.20,.3],blue);
  box([.4,-.35,0],[.55,.12,.52],leather);
  const seat=box([.14,-.05,0],[.1,.58,.52],leather);seat.rotation.z=.12;
  // Engine block, cooling fins, intake, exhaust and reduction drive.
  box([-.8,-.03,0],[.5,.4,.44],steel);
  for(let i=0;i<7;i++)box([-.8,.12+i*.035,0],[.48,.016,.48],aluminium);
  tube([-.6,.3,0],[-.6,.52,0],.06,steel);
  ball([-1.04,.12,.32],[.19,.16,.12],rubber);
  tube([-.93,.02,-.28],[-1.35,-.15,-.4],.045,brass);
  tube([-1.35,-.15,-.4],[-1.95,-.2,-.4],.085,steel);
  a.crank=group('slow reduction crank',[-.15,.52,0]);
  const disk=mesh(new T.CylinderGeometry(.28,.28,.09,32),brass,a.crank);disk.rotation.x=Math.PI/2;
  for(let i=0;i<8;i++) {
    const ang=i*Math.PI/4;
    tube([0,0,0],[.24*Math.cos(ang),.24*Math.sin(ang),0],.018,steel,a.crank);
  }
  ball([-.15,.52,.07],[.075,.075,.045],aluminium);
  tube([-.8,.1,.27],[-.15,.52,.27],.035,rubber);
  tube([-.85,.2,.29],[-.2,.62,.29],.025,rubber);
  // Hinge pylons and the visible paired spring housings.
  for(const z of [-.25,.25]) {
    tube([-.5,-.3,z],[0,.8,z],.055,steel);
    tube([.65,-.3,z],[0,.8,z],.034,aluminium);
    tube([-.35,.48,z],[-.35,.79,z],.075,brass);
    for(let j=0;j<6;j++) {
      const ring=mesh(new T.TorusGeometry(.078,.01,5,12),steel,root,[-.35,.5+j*.05,z]);
      ring.rotation.x=Math.PI/2;
    }
    const hinge=mesh(new T.CylinderGeometry(.11,.11,.12,16),aluminium,root,[0,.8,z]);
    hinge.rotation.z=Math.PI/2;
  }
  a.pushrods=[];
  for(const side of [-1,1]) {
    const rod=tube([0,0,0],[0,1,0],.022,aluminium);
    a.pushrods.push({rod,side});
  }
  // Tail surfaces: a conventional long-arm stabilizer, separate elevator and rudder.
  const tailMat=fabric.clone();tailMat.color.setHex(0xd8d9c6);
  const stabilizer=group('fixed incidence stabilizer',[-2.8,0,0]);
  stabilizer.rotation.z=E.coupled.tail_incidence_rad;
  plate([[.29,0,-1.15],[.08,0,-1.3],[-.12,0,-1.15],[-.12,0,1.15],[.08,0,1.3],[.29,0,1.15]],tailMat,stabilizer);
  tube([.10,0,-1.25],[.10,0,1.25],.024,steel,stabilizer);
  a.elevator=group('elevator',[-.12,0,0],stabilizer);
  plate([[0,0,-1.15],[-.19,0,-1.03],[-.19,0,1.03],[0,0,1.15]],fabric,a.elevator);
  for(const z of [-.9,-.45,0,.45,.9])tube([.27,.005,z],[-.11,.005,z],.008,brass,stabilizer);
  plate([[-2.55,0,0],[-2.8,.95,0],[-3.08,1.02,0],[-3.08,0,0]],tailMat);
  tube([-2.55,0,0],[-2.8,.95,0],.022,steel);
  a.rudder=group('rudder',[-3.08,0,0]);
  plate([[0,0,0],[0,1.02,0],[-.3,.88,0],[-.38,.17,0]],fabric,a.rudder);
  for(const z of [-.3,.3])tube([.35,-.28,z],[-3.02,.08,z*.1],.006,brass);
  // Three actual tyres: geometry's axle is baked along z; spin remains about z.
  for(let i=0;i<p.gear_centres.length;i++) {
    const g=p.gear_centres[i],side=Math.sign(g[2])||1;
    tube([i===0?1.5:-.25,-.35,i===0?0:side*.3],g,.042,steel);
    tube([i===0?2.15:-1,-.4,i===0?0:side*.24],g,.026,aluminium);
    const r=p.wheel_radius_m;
    const tyreGeo=new T.LatheGeometry([
      new T.Vector2(.13,-.065),new T.Vector2(r-.035,-.065),
      new T.Vector2(r-.008,-.044),new T.Vector2(r,-.024),
      new T.Vector2(r,.024),new T.Vector2(r-.008,.044),
      new T.Vector2(r-.035,.065),new T.Vector2(.13,.065),
      new T.Vector2(.13,-.065)
    ],28);
    tyreGeo.rotateX(Math.PI/2);
    const tyre=mesh(tyreGeo,rubber,root,g);tyre.name='Tyre '+i;
    a.wheels.push(tyre);
    for(const z of [-.071,.071]) {
      const hubGeo=new T.CylinderGeometry(.13,.13,.012,20);hubGeo.rotateX(Math.PI/2);
      mesh(hubGeo,aluminium,tyre,[0,0,z]);
      for(let j=0;j<6;j++) {
        const t=j*Math.PI/3;
        tube([.035*Math.cos(t),.035*Math.sin(t),z*1.1],[.116*Math.cos(t),.116*Math.sin(t),z*1.1],.009,steel,tyre);
      }
      ball([0,0,z*1.25],[.043,.043,.025],brass,tyre);
    }
  }
  // Seated adult, not a scale marker: articulated limbs, boots, hands and harness.
  a.pilot=group('pilot');
  ball([.47,-.15,0],[.19,.18,.21],suit,a.pilot);
  const torso=ball([.4,.17,0],[.19,.32,.24],suit,a.pilot);torso.rotation.z=.12;
  tube([.42,.4,0],[.46,.53,0],.075,skin,a.pilot);
  ball([.47,.66,0],[.125,.16,.125],skin,a.pilot);
  ball([.445,.735,0],[.142,.13,.145],blue,a.pilot);
  ball([.565,.685,0],[.043,.068,.115],visor,a.pilot);
  ball([.6,.628,0],[.038,.028,.035],skin,a.pilot);
  for(const z of [-.13,.13]) {
    tube([.48,-.15,z],[.93,-.25,z],.085,suit,a.pilot);
    ball([.93,-.25,z],[.085,.09,.08],suit,a.pilot);
    tube([.93,-.25,z],[1.12,-.65,z],.065,suit,a.pilot);
    ball([1.22,-.66,z],[.16,.075,.085],leather,a.pilot);
    tube([.4,.33,z*1.7],[.68,.07,z*2],.062,suit,a.pilot);
    tube([.68,.07,z*2],[.9,.04,z*.9],.047,suit,a.pilot);
    ball([.9,.04,z*.9],[.065,.045,.044],skin,a.pilot);
    tube([.3,.4,z],[.59,-.15,-z],.018,leather,a.pilot);
  }
  ball([.6,-.1,0],[.045,.045,.025],brass,a.pilot);
  tube([.85,-.34,0],[.9,.05,0],.018,steel);
  tube([.9,.05,-.15],[.9,.05,.15],.023,rubber);
  box([1.17,.02,0],[.11,.27,.48],blue);
  for(const z of [-.13,0,.13]) {
    const gauge=mesh(new T.CylinderGeometry(.045,.045,.015,16),visor,root,[1.105,.06,z]);
    gauge.rotation.z=Math.PI/2;
    tube([1.093,.06,z],[1.093,.085,z+.012],.003,aluminium);
  }
  const glass=new T.MeshStandardMaterial({color:0xaed4d7,transparent:true,opacity:.22,roughness:.15,metalness:.1,side:T.DoubleSide,depthWrite:false});
  const screen=ball([1.3,.19,0],[.25,.3,.33],glass);
  screen.scale.x=.14;
  tube([1.25,-.05,-.31],[1.25,.3,-.23],.012,brass);
  tube([1.25,-.05,.31],[1.25,.3,.23],.012,brass);
  // Fuel tank behind the seat, restrained by two steel bands.
  ball([-1.38,-.05,0],[.31,.23,.26],blue);
  for(const x of [-1.5,-1.25]) {
    const band=mesh(new T.TorusGeometry(.24,.012,6,20),aluminium,root,[x,-.05,0]);band.rotation.y=Math.PI/2;
  }
  a.setRod=setRod;
  function setRod(m,from,to) {
    const A=new T.Vector3(...from),B=new T.Vector3(...to),d=B.clone().sub(A);
    m.position.copy(A.add(B).multiplyScalar(.5));m.scale.y=d.length();
    m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());
  }
  updateAircraft(a,{phase:0,gliding:false,wheel_angle:0},{});return a;
}

// Material-coordinate structural members track production geometry, not a
// separate approximate flap animation.
function wingPoint(p,pose,name,leaf,t,u,lower=false) {
  const g=planform(p),side=name.startsWith('left')?-1:1,outer=name.endsWith('Outer');
  const v=pose[name],inn=pose[side<0?'leftInner':'rightInner'];
  const stroke=inn.stroke+(outer?v.stroke:0),mt=outer?leaf*.5+t*.5:t;
  let chord=g.chord;
  if(outer) {
    const i=Math.min(3,Math.floor(mt*4)),aa=i/4,bb=(i+1)/4;
    chord*=chordFactor(aa)+(chordFactor(bb)-chordFactor(aa))*(mt-aa)/(bb-aa);
  }
  const r=outer?g.outer*(leaf===0?t*.5:(v.exposure-.5)+t*.5):g.inner*t;
  const thickness=lower?4*u*(1-u)*chord*E.wing.inner_thickness_fraction:0;
  const x=(.25-u)*chord,y=4*u*(1-u)*chord*v.camber-(outer&&leaf===1?.008:0)+.006-thickness;
  const xx=x*Math.cos(v.twist)-y*Math.sin(v.twist),yy=x*Math.sin(v.twist)+y*Math.cos(v.twist);
  const rootY=E.wing.root_height_m+(outer?g.inner*Math.sin(inn.stroke):0);
  const rootZ=g.hinge+(outer?g.inner*Math.cos(inn.stroke):0);
  return [xx+v.sweep,rootY+r*Math.sin(stroke)+yy*Math.cos(stroke),side*(rootZ+r*Math.cos(stroke)-yy*Math.sin(stroke))];
}
export function updateAircraft(a,s,c={}) {
  for(const wheel of a.wheels)wheel.rotation.set(0,0,-(s.wheel_angle??0));
  a.rudder.rotation.y=-(c.rudder??0)*.4;
  a.elevator.rotation.z=-(c.pitch??0)*.25;
  a.crank.rotation.z=s.phase;
  const pose=wingPose(s);
  for(const d of a.wingDetails)a.setRod(d.rod,wingPoint(a.p,pose,d.name,d.leaf,d.t0,d.u0,d.lower),wingPoint(a.p,pose,d.name,d.leaf,d.t1,d.u1,d.lower));
  for(const w of a.wristLinks) {
    const inner=w.side<0?'leftInner':'rightInner',outer=w.side<0?'leftOuter':'rightOuter';
    const pt=wingPoint(a.p,pose,inner,0,1,.25);
    w.bearing.position.fromArray(pt);w.cap.position.fromArray(pt);
    for(const link of w.links)a.setRod(link.rod,wingPoint(a.p,pose,inner,0,.94,link.u),wingPoint(a.p,pose,outer,0,.055,link.u));
  }
  for(const d of a.pushrods) {
    const end=wingPoint(a.p,pose,d.side<0?'leftInner':'rightInner',0,.22,.25);
    a.setRod(d.rod,[-.15+.2*Math.cos(s.phase),.52+.2*Math.sin(s.phase),d.side*.16],end);
  }
}
