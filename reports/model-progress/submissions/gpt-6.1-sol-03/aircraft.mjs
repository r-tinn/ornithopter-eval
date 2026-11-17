import {E} from './environment/engineering.mjs';
import {wingPose} from './kinematics.mjs';
import {makePanel,planform,chordFactor,PANEL_NAMES} from './environment/source-mechanism.mjs';

// All fabrication is procedural. Dimensions below are visual engineering
// completions, not additional simulated masses.
export function createAircraft(T,p){
  const root=new T.Group();root.name='Tinn • articulated demonstrator';
  const a={root,wheels:[],wingPanels:{},T,p,movingRods:[],cranks:[]};
  const material=(color,metalness=0,roughness=.55)=>new T.MeshStandardMaterial({color,metalness,roughness});
  const M={
    frame:material(0x233b3c,.65,.32),metal:material(0x9ca9a8,.8,.3),
    brass:material(0xc59a52,.65,.34),dark:material(0x172426,.35,.48),
    rubber:material(0x22282a,0,.88),ivory:material(0xe9dfbe,.05,.65),
    teal:material(0x1b6268,.35,.37),seat:material(0x49392f,0,.87),
    suit:material(0x62766b,0,.88),skin:material(0xba8663,0,.85),
    helmet:material(0xf4ead2,.15,.35),visor:material(0x223e48,.45,.16),
    red:material(0xc4573e,.2,.5)
  };
  a.materials=M;
  const mesh=(g,m,pos=[0,0,0],parent=root)=>{
    const o=new T.Mesh(g,m);o.position.set(...pos);parent.add(o);return o;
  };
  const ball=(pos,r,mat,parent=root,scale=[1,1,1])=>{
    const o=mesh(new T.SphereGeometry(r,14,10),mat,pos,parent);o.scale.set(...scale);return o;
  };
  const box=(pos,size,mat,parent=root)=>mesh(new T.BoxGeometry(...size),mat,pos,parent);
  const rod=(from,to,r,mat,parent=root)=>{
    const o=mesh(new T.CylinderGeometry(r,r,1,8),mat,[0,0,0],parent);
    setRod(T,o,from,to);return o;
  };
  a.rod=rod;
  // Semi-translucent sailcloth over graphite ribs; sliding outer leaves are
  // separate actual surfaces, with their overlap visible from above and below.
  for(const name of PANEL_NAMES){
    const group=new T.Group(),surface=new T.Group();
    group.name=name;surface.name=name+'Surface';root.add(group);group.add(surface);
    a[name]=group;a[name+'Surface']=surface;
    const outer=name.endsWith('Outer');
    a.wingPanels[name]=[];
    for(let leaf=0;leaf<(outer?2:1);leaf++){
      const fabric=new T.MeshStandardMaterial({
        color:outer?(leaf?0xe1d5af:0xf0e5c6):0xf1e8cc,
        side:T.DoubleSide,roughness:.8,metalness:.03,
        transparent:true,opacity:.94
      });
      const o=mesh(makePanel(T,p,name,leaf),fabric,[0,0,0],surface);
      o.name=name+' • fabric leaf '+leaf;a.wingPanels[name].push(o);
      // Ribs, edge cables and paired spars share the precise material mapping.
      const count=outer?2:4;
      const segments=[];
      for(let i=0;i<=count;i++){
        const t=i/count;
        segments.push([t,0,t,.5],[t,.5,t,1]);
      }
      for(const u of [0,.25,.72,1])for(let i=0;i<count;i++)segments.push([i/count,u,(i+1)/count,u]);
      const buffer=new T.BufferGeometry();
      buffer.setAttribute('position',new T.BufferAttribute(new Float32Array(segments.length*6),3));
      const lines=new T.LineSegments(buffer,new T.LineBasicMaterial({color:outer?0x5c604f:0x435959,transparent:true,opacity:.85}));
      root.add(lines);
      a.movingRods.push({name,leaf,segments,lines});
      for(let j=0;j<count;j++){
        const spar=rod([0,0,0],[0,1,0],outer?.018:.027,M.frame);
        a.movingRods.push({name,leaf,spar,t0:j/count,t1:(j+1)/count,u:.25});
      }
    }
  }
  // Open lower cockpit shell: lofted sections give a narrow, rounded nose,
  // exposed upper rails and an integrated cream belly rather than a solid box.
  const stations=[
    [-1.25,.09,-.24],[-.95,.28,-.28],[-.3,.43,-.28],
    [.5,.45,-.28],[1.3,.38,-.3],[1.95,.23,-.32],[2.35,.025,-.3]
  ];
  const vertices=[],indices=[],n=12;
  for(const [x,r,y] of stations)for(let j=0;j<=n;j++){
    const t=Math.PI*j/n;
    vertices.push(x,y-r*Math.sin(t),r*Math.cos(t));
  }
  for(let i=0;i<stations.length-1;i++)for(let j=0;j<n;j++){
    const k=i*(n+1)+j;indices.push(k,k+1,k+n+1,k+1,k+n+2,k+n+1);
  }
  const hull=new T.BufferGeometry();
  hull.setAttribute('position',new T.Float32BufferAttribute(vertices,3));hull.setIndex(indices);hull.computeVertexNormals();
  const shell=mesh(hull,M.teal);shell.material.side=T.DoubleSide;
  // Tubular longerons and a fully triangulated tail boom.
  for(const z of [-.39,.39]){
    rod([-1.1,-.3,z],[1.45,-.28,z],.032,M.frame);
    rod([1.45,-.28,z],[2.32,-.3,0],.026,M.frame);
    rod([-.7,-.45,z],[-3.4,.02,z*.15],.037,M.frame);
    rod([-.65,.3,z],[-3.4,.02,z*.15],.026,M.frame);
    rod([-.7,-.45,z],[-.65,.3,z],.024,M.metal);
    rod([-1.6,-.3,z*.7],[-2.3,.15,z*.45],.018,M.metal);
    rod([-1.6,.18,z*.7],[-2.3,-.2,z*.45],.018,M.metal);
    rod([-.6,.2,z],[.1,.78,z*.6],.043,M.frame);
    rod([.85,-.22,z],[.1,.78,z*.6],.034,M.frame);
  }
  for(const x of [-.8,0,.8,1.45])rod([x,-.3,-.39],[x,-.3,.39],.025,M.metal);
  // Three wheels: cylinder geometry is baked into the x/y tyre plane, so
  // subsequent rotation about local z is exactly rotation about the axle.
  for(const [x,y,z] of p.gear_centres){
    const tyreGeometry=new T.TorusGeometry(p.wheel_radius_m-.052,.052,10,24);
    const tyre=mesh(tyreGeometry,M.rubber,[x,y,z]);tyre.name='Actual tyre';
    a.wheels.push(tyre);
    const hub=mesh(new T.CylinderGeometry(.078,.078,.13,12),M.metal,[0,0,0],tyre);
    hub.rotation.x=Math.PI/2;
    for(let k=0;k<6;k++){
      const t=k*Math.PI/3;
      rod([.065*Math.cos(t),.065*Math.sin(t),0],[.17*Math.cos(t),.17*Math.sin(t),0],.009,M.metal,tyre);
    }
    const axle=rod([x,y,z-.13],[x,y,z+.13],.032,M.metal);
    axle.name='Lateral wheel axle';
    const anchor=[x>1?1.35:-.45,-.4,z*.3];
    rod(anchor,[x,y,z],.036,M.frame);
    rod([x>.5?.55:.45,-.32,z*.3],[x,y,z],.026,M.metal);
    ball([x,y+.08,z],.065,M.brass);
  }
  // EFI engine with finned cylinder, exhaust, belt reduction and slow crank.
  box([-.65,-.02,0],[.58,.43,.46],M.dark);
  for(let i=0;i<8;i++)box([-.64,.17+i*.026,0],[.43,.014,.43],M.metal);
  ball([-.62,.41,0],.23,M.dark,root,[1,.5,1]);
  rod([-.9,.26,.12],[-1.2,.25,.16],.045,M.dark);
  rod([-1.2,.25,.16],[-1.35,-.1,.16],.055,M.metal);
  const silencer=mesh(new T.CylinderGeometry(.09,.09,.65,12),M.dark,[-1.05,-.18,.27]);silencer.rotation.z=Math.PI/2;
  box([-.8,-.3,-.27],[.42,.27,.24],M.ivory); // fuel tank
  ball([-.8,-.13,-.27],.035,M.brass);
  rod([-.7,.3,0],[-.05,.65,0],.022,M.brass);
  for(const [x,y,r] of [[-.65,.01,.12],[.05,.56,.28]]){
    const pulley=new T.Group();pulley.position.set(x,y,.32);root.add(pulley);
    const disk=mesh(new T.CylinderGeometry(r,r,.065,24),M.dark,[0,0,0],pulley);disk.rotation.x=Math.PI/2;
    const rim=mesh(new T.TorusGeometry(r,.012,6,24),M.brass,[0,0,.04],pulley);
    for(let j=0;j<4;j++){
      const ang=j*Math.PI/2;
      rod([0,0,.045],[r*.85*Math.cos(ang),r*.85*Math.sin(ang),.045],.014,M.metal,pulley);
    }
    a.cranks.push(pulley);
  }
  // Two visible belt runs; fixed envelope, rotating pulleys.
  rod([-.73,.1,.32],[-.16,.82,.32],.018,M.rubber);
  rod([-.53,-.05,.32],[.3,.4,.32],.018,M.rubber);
  rod([.05,.56,-.43],[.05,.56,.43],.05,M.metal);
  for(const side of [-1,1]){
    ball([0,.8,side*.25],.095,M.brass);
    rod([-.22,.8,side*.25],[.24,.8,side*.25],.045,M.metal);
    const piston=rod([-.25,.2,side*.25],[0,.8,side*.25],.028,M.brass);
    a.cranks.push({piston,side});
    // Bronze torsion spring coils surrounding the hinge spindle.
    const pts=[];
    for(let i=0;i<=96;i++){
      const t=i/96,ang=t*Math.PI*16;
      pts.push(new T.Vector3(-.13+t*.26,.8+.11*Math.cos(ang),side*.25+.11*Math.sin(ang)));
    }
    mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts),96,.012,5,false),M.brass);
  }
  // Thin conventional stabilizers on the long triangulated boom.
  function foil(points,mat,parent=root){
    const shape=new T.Shape();shape.moveTo(...points[0]);for(const v of points.slice(1))shape.lineTo(...v);shape.closePath();
    return mesh(new T.ExtrudeGeometry(shape,{depth:.035,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.018,bevelThickness:.012}),mat,[0,0,0],parent);
  }
  const tail=new T.Group();tail.position.set(-2.8,.05,0);tail.rotation.x=Math.PI/2;root.add(tail);
  foil([[.42,0],[.2,1.12],[-.35,1.35],[-.58,1.08],[-.58,-1.08],[-.35,-1.35],[.2,-1.12]],M.ivory,tail);
  a.elevator=new T.Group();a.elevator.position.set(-3.32,.05,0);root.add(a.elevator);
  const el=box([-.08,0,0],[.24,.038,2.08],M.teal,a.elevator);
  rod([-2.5,.07,-1],[-3.1,.07,-1.17],.014,M.frame);
  rod([-2.5,.07,1],[-3.1,.07,1.17],.014,M.frame);
  foil([[-2.38,.08],[-2.9,1.14],[-3.28,1.2],[-3.45,.08]],M.ivory);
  a.rudder=new T.Group();a.rudder.position.set(-3.35,.12,0);root.add(a.rudder);
  foil([[0,0],[.07,.95],[-.18,1],[-.32,.2],[-.24,0]],M.teal,a.rudder);
  rod([-1.05,-.22,-.22],[-3.32,.14,-.05],.007,M.metal);
  rod([-1.05,-.22,.22],[-3.32,.14,.05],.007,M.metal);
  // A recognisable seated, clothed adult: bent limbs, boots, gloves, harness,
  // face, helmet and a forward-looking dark visor.
  a.pilot=new T.Group();root.add(a.pilot);a.pilot.name='Seated 55 kg adult pilot';
  const pilot=a.pilot;
  box([.48,-.2,0],[.52,.12,.5],M.seat);
  const back=box([.16,.12,0],[.1,.65,.47],M.seat);back.rotation.z=-.15;
  ball([.45,.08,0],.24,M.suit,pilot,[.85,1.2,.85]);
  const torso=ball([.35,.37,0],.28,M.suit,pilot,[.72,1.25,.75]);torso.rotation.z=-.12;
  rod([.39,.54,0],[.44,.72,0],.075,M.skin,pilot);
  ball([.46,.85,0],.155,M.skin,pilot,[.93,1.12,.9]);
  ball([.43,.91,0],.17,M.helmet,pilot,[1,1,.98]);
  ball([.565,.89,0],.113,M.visor,pilot,[.5,.52,1.22]);
  ball([.598,.8,0],.032,M.skin,pilot,[1,.7,.75]);
  for(const side of [-1,1]){
    const z=side*.15;
    rod([.47,.03,z],[.91,-.22,z],.10,M.suit,pilot);
    ball([.91,-.22,z],.105,M.suit,pilot);
    rod([.91,-.22,z],[1.28,-.39,z],.072,M.suit,pilot);
    ball([1.36,-.39,z],.1,M.dark,pilot,[1.6,.65,.8]);
    rod([.36,.52,side*.22],[.64,.27,side*.32],.064,M.suit,pilot);
    ball([.64,.27,side*.32],.066,M.suit,pilot);
    rod([.64,.27,side*.32],[.95,.2,side*.13],.053,M.suit,pilot);
    ball([.95,.2,side*.13],.062,M.seat,pilot);
    rod([.23,.61,side*.17],[.65,-.02,side*.15],.023,M.dark,pilot);
    rod([1.35,-.39,z-.08],[1.35,-.39,z+.08],.018,M.metal);
  }
  box([.62,.08,0],[.08,.07,.18],M.brass,pilot);
  rod([.8,-.22,0],[.94,.2,0],.018,M.metal);
  ball([.94,.2,0],.04,M.dark);
  // Compact instrument brow and transparent low windscreen, leaving pilot open.
  const panel=box([1.18,.12,0],[.06,.24,.58],M.dark);panel.rotation.z=-.2;
  for(const z of [-.17,0,.17]){
    const gauge=mesh(new T.CylinderGeometry(.063,.063,.015,18),M.ivory,[1.137,.15,z]);gauge.rotation.z=Math.PI/2;
    rod([1.123,.15,z],[1.12,.19,z+.02],.004,M.dark);
  }
  const glass=new T.MeshStandardMaterial({color:0xabcbd0,transparent:true,opacity:.28,side:T.DoubleSide,roughness:.16,metalness:.1,depthWrite:false});
  const windscreen=mesh(new T.SphereGeometry(.44,20,12,0,Math.PI,0,Math.PI/2),glass,[1.35,.15,0]);
  windscreen.scale.set(.8,1,1);windscreen.rotation.z=-Math.PI/2;
  // Registration-like bands and small nav lamps are geometry, not assets.
  for(const z of [-.405,.405])box([.9,-.37,z],[.42,.045,.015],M.brass);
  ball([-.25,.38,-.4],.025,M.red);
  ball([-.25,.38,.4],.025,M.teal);
  updateAircraft(a,{phase:0,omega:0,wheel_angle:0,gliding:false},{});
  return a;
}

function setRod(T,o,a,b){
  const v=new T.Vector3(...b).sub(new T.Vector3(...a));
  o.position.set((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2);
  o.scale.set(1,Math.max(1e-7,v.length()),1);
  o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());
}
// Decorative structure follows the same curved material coordinates as the
// helper. It does not transform the four identity wing groups or leaf meshes.
function wingPoint(p,pose,name,leaf,t,u){
  const g=planform(p),side=name.startsWith('left')?-1:1,outer=name.endsWith('Outer');
  const v=pose[name],inn=pose[side<0?'leftInner':'rightInner'];
  const mt=outer?leaf*.5+t*.5:t;
  const i=Math.min(3,Math.floor(mt*4)),lo=i/4,hi=(i+1)/4;
  const chord=outer?g.chord*(chordFactor(lo)+(chordFactor(hi)-chordFactor(lo))*(mt-lo)/(hi-lo)):g.chord;
  const r=outer?g.outer*(leaf===0?t*.5:v.exposure-.5+t*.5):g.inner*t;
  const stroke=inn.stroke+(outer?v.stroke:0);
  const x=(.25-u)*chord,y=4*u*(1-u)*chord*v.camber-(outer&&leaf===1?.008:0);
  const b=x*Math.sin(v.twist)+y*Math.cos(v.twist);
  return [x*Math.cos(v.twist)-y*Math.sin(v.twist)+v.sweep,
    E.wing.root_height_m+(outer?g.inner*Math.sin(inn.stroke):0)+r*Math.sin(stroke)+b*Math.cos(stroke),
    side*(g.hinge+(outer?g.inner*Math.cos(inn.stroke):0)+r*Math.cos(stroke)-b*Math.sin(stroke))];
}
export function updateAircraft(a,s,c={}){
  const pose=wingPose(s);
  for(const wheel of a.wheels)wheel.rotation.z=-(s.wheel_angle??0);
  a.rudder.rotation.y=-(c.rudder??0)*.38;
  a.elevator.rotation.z=(c.pitch??0)*.28;
  for(const o of a.cranks){
    if(o.isGroup)o.rotation.z=-(s.phase??0);
    else if(o.piston){
      const endpoint=wingPoint(a.p,pose,o.side<0?'leftInner':'rightInner',0,.15,.25);
      setRod(a.T,o.piston,[-.25,.2,o.side*.25],endpoint);
    }
  }
  for(const v of a.movingRods){
    if(v.spar){
      setRod(a.T,v.spar,wingPoint(a.p,pose,v.name,v.leaf,v.t0,v.u),wingPoint(a.p,pose,v.name,v.leaf,v.t1,v.u));
    }else{
      const attr=v.lines.geometry.getAttribute('position');
      v.segments.forEach((segment,j)=>{
        attr.setXYZ(j*2,...wingPoint(a.p,pose,v.name,v.leaf,segment[0],segment[1]));
        attr.setXYZ(j*2+1,...wingPoint(a.p,pose,v.name,v.leaf,segment[2],segment[3]));
      });
      attr.needsUpdate=true;v.lines.geometry.computeBoundingSphere();
    }
  }
}
