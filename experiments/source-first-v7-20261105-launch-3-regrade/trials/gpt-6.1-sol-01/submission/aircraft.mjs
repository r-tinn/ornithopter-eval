import {makePanel,planform,PANEL_NAMES,chordFactor} from './environment/source-mechanism.mjs';
import {E} from './environment/engineering.mjs';
import {wingPose} from './kinematics.mjs';

// A fabric-covered, exposed-linkage experimental aircraft, not a bird costume.
export function createAircraft(T,p){
  const root=new T.Group();root.name='Tinn / Resonant 14';
  const a={root,wingPanels:{},wheels:[],T,p,animatedRods:[],wingDetail:[],wrists:[]};
  const material=(color,metalness=0,roughness=.65)=>new T.MeshStandardMaterial({color,metalness,roughness});
  const m=a.materials={
    fabric:new T.MeshStandardMaterial({color:0xe7d6a7,side:T.DoubleSide,roughness:.86,metalness:0}),
    outer:new T.MeshStandardMaterial({color:0xf0e4c7,side:T.DoubleSide,roughness:.8}),
    frame:material(0x284b4b,.65,.35),alloy:material(0xa9b4ad,.82,.29),
    dark:material(0x202c30,.48,.43),brass:material(0xbb8d42,.7,.32),
    red:material(0xa64630,.25,.5),rubber:material(0x181c1b,0,.93),
    leather:material(0x553a2b,0,.85),suit:material(0x546878,0,.9),
    skin:material(0xc48e6b,0,.8),visor:material(0x182e3b,.45,.23),
    white:material(0xd7d1b9,0,.75)
  };
  const mesh=(geo,mat,parent=root,pos=[0,0,0])=>{
    const obj=new T.Mesh(geo,mat);obj.position.set(...pos);parent.add(obj);return obj;
  };
  const box=(size,pos,mat,parent=root)=>mesh(new T.BoxGeometry(...size),mat,parent,pos);
  const sphere=(scale,pos,mat,parent=root)=>{
    const o=mesh(new T.SphereGeometry(1,16,10),mat,parent,pos);o.scale.set(...scale);return o;
  };
  const rod=(v,w,r,mat,parent=root)=>{
    const obj=mesh(new T.CylinderGeometry(r,r,1,8),mat,parent);
    fitRod(obj,v,w);return obj;
  };
  a.rod=rod;
  // The four wing mounting groups and their surfaces stay identity transforms.
  for(const name of PANEL_NAMES){
    const group=a[name]=new T.Group(),surface=a[name+'Surface']=new T.Group();
    group.name=name;surface.name=name+'Surface';root.add(group);group.add(surface);
    a.wingPanels[name]=[];
    const count=name.endsWith('Outer')?2:1;
    for(let leaf=0;leaf<count;leaf++){
      const panel=mesh(makePanel(T,p,name,leaf),count===2?m.outer:m.fabric,surface);
      panel.name=name+' / rigid sliding leaf '+leaf;
      a.wingPanels[name].push(panel);
    }
    // Slender spars, rib caps and perimeter tapes. These are mechanical detail,
    // not substitute surfaces. Every member follows the production linkage.
    for(let leaf=0;leaf<count;leaf++){
      const divisions=count===2?4:7;
      for(let j=0;j<=divisions;j++){
        for(let k=0;k<2;k++){
          const obj=rod([0,0,0],[0,1,0],.008,m.frame);
          a.wingDetail.push({obj,name,leaf,t0:j/divisions,t1:j/divisions,u0:k/2,u1:(k+1)/2});
        }
      }
      for(let j=0;j<divisions;j++){
        for(const u of [0,.25,1]){
          const obj=rod([0,0,0],[0,1,0],u===.25?.026:.012,u===.25?m.frame:m.brass);
          a.wingDetail.push({obj,name,leaf,t0:j/divisions,t1:(j+1)/divisions,u0:u,u1:u});
        }
      }
    }
  }
  // Triangulated fuselage: two longerons each side, narrowing into a tail boom.
  const stations=[
    {x:2.5,y:-.12,w:.18,h:.26},{x:1.5,y:-.15,w:.43,h:.4},
    {x:.35,y:-.15,w:.46,h:.48},{x:-.7,y:-.13,w:.36,h:.48},
    {x:-2.9,y:.02,w:.08,h:.13}
  ];
  for(let j=0;j<stations.length-1;j++){
    const b=stations[j],d=stations[j+1];
    for(const side of [-1,1]){
      for(const high of [-1,1]){
        rod([b.x,b.y+high*b.h,side*b.w],[d.x,d.y+high*d.h,side*d.w],j===3?.025:.031,m.frame);
      }
      rod([b.x,b.y-b.h,side*b.w],[d.x,d.y+d.h,side*d.w],.018,m.alloy);
      rod([b.x,b.y+b.h,side*b.w],[b.x,b.y-b.h,side*b.w],.022,m.frame);
    }
    rod([b.x,b.y-b.h,-b.w],[b.x,b.y-b.h,b.w],.026,m.frame);
  }
  // A compact nose shell and open cockpit; no opaque bulb concealing the pilot.
  sphere([.61,.31,.34],[2.05,-.06,0],m.red);
  box([.9,.08,.78],[1.05,-.55,0],m.dark);
  box([.14,.7,.72],[.42,-.05,0],m.leather).rotation.z=-.12;
  box([.61,.1,.68],[.78,-.38,0],m.leather);
  for(const side of [-1,1]){
    rod([1.48,.08,.44*side],[.4,.18,.47*side],.025,m.alloy);
    rod([.4,.18,.47*side],[.25,.55,.42*side],.025,m.frame);
  }
  // Engine, cooling fins, exhaust and fuel tank sit aft of the seat.
  box([.61,.45,.55],[-.56,-.12,0],m.dark);
  for(let i=0;i<9;i++)box([.39,.025,.61],[-.57,.04+i*.035,0],m.alloy);
  sphere([.21,.22,.22],[-.13,-.17,0],m.alloy);
  rod([-.55,.18,-.37],[-1.15,.13,-.42],.065,m.dark);
  rod([-1.15,.13,-.42],[-1.38,-.07,-.42],.065,m.dark);
  box([.63,.36,.58],[-1.24,-.08,0],m.red);
  const cap=mesh(new T.CylinderGeometry(.06,.06,.055,12),m.brass,root,[-1.24,.13,0]);
  cap.name='five litre tank filler';
  // Reduction gearbox, crank axle, twin spring cartridges and shoulder bearings.
  box([.45,.34,.63],[0,.42,0],m.frame);
  rod([0,.58,-.48],[0,.58,.48],.065,m.alloy);
  a.crank=new T.Group();a.crank.position.set(0,.58,0);root.add(a.crank);
  for(const z of [-.35,.35]){
    const disc=mesh(new T.CylinderGeometry(.23,.23,.045,24),m.brass,a.crank,[0,0,z]);
    disc.rotation.x=Math.PI/2;
    rod([0,0,z],[.18,0,z],.035,m.dark,a.crank);
    sphere([.055,.055,.055],[.18,0,z],m.alloy,a.crank);
  }
  for(const side of [-1,1]){
    rod([-.33,.05,.32*side],[-.12,.74,.25*side],.065,m.dark);
    for(let i=0;i<11;i++){
      const ring=mesh(new T.TorusGeometry(.069,.012,5,12),m.brass,root,[-.33+.21*i/11,.05+.69*i/11,.32*side-.07*side*i/11]);
      ring.rotation.x=Math.PI/2;ring.rotation.z=-.3;
    }
    sphere([.12,.12,.12],[0,.8,.25*side],m.brass);
    const push=rod([.18,.58,.35*side],[0,.8,.9*side],.022,m.alloy);
    a.animatedRods.push({obj:push,side});
    // A gimballed wrist bearing and two fore/aft sliding guides make the
    // difference between inner sweep and hand sweep mechanically readable.
    const bearing=sphere([.10,.10,.10],[0,0,0],m.brass);
    const carriage=sphere([.075,.075,.075],[0,0,0],m.alloy);
    const rail=rod([0,0,0],[0,1,0],.032,m.dark);
    const tie=rod([0,0,0],[0,1,0],.018,m.alloy);
    a.wrists.push({side,bearing,carriage,rail,tie});
  }
  // Visible belt drive (no propeller, jet or fictitious thrust apparatus).
  for(const z of [-.22,.22]){
    rod([-.56,-.1,z],[0,.42,z],.018,m.rubber);
    rod([-.78,-.02,z],[-.17,.5,z],.018,m.rubber);
  }
  // High aspect-ratio conventional empennage on the slender rear boom.
  const tailMat=m.fabric;
  a.elevator=new T.Group();a.elevator.position.set(-2.8,.02,0);root.add(a.elevator);
  const tail=sphere([.43,.035,1.1],[0,0,0],tailMat,a.elevator);
  tail.name='horizontal stabilizer and elevator';
  rod([0,0,-1.08],[0,0,1.08],.024,m.frame,a.elevator);
  rod([.23,0,-.9],[.23,0,.9],.012,m.brass,a.elevator);
  a.rudder=new T.Group();a.rudder.position.set(-2.75,.1,0);root.add(a.rudder);
  const fin=sphere([.39,.55,.033],[-.02,.46,0],m.red,a.rudder);
  rod([.16,0,0],[.16,.87,0],.022,m.frame,a.rudder);
  // Tail bracing and physically legible control runs.
  for(const z of [-.95,.95]){
    rod([-2.65,.03,z],[-2.75,.82,0],.007,m.alloy);
    rod([.3,-.32,z<0?-.31:.31],[-2.8,.05,z*.35],.006,m.brass);
  }
  // Three actual tyres. Geometry is rotated once, not its Object3D: the tyre
  // planes are XY and the axle is Z for every subsequent wheel_angle.
  for(const [i,g] of p.gear_centres.entries()){
    const geo=new T.CylinderGeometry(p.wheel_radius_m,p.wheel_radius_m,.12,24);
    geo.rotateX(Math.PI/2);
    const tyre=mesh(geo,m.rubber,root,g);tyre.name=['nose tyre','port main tyre','starboard main tyre'][i];
    a.wheels.push(tyre);
    const hubGeo=new T.CylinderGeometry(.105,.105,.126,16);hubGeo.rotateX(Math.PI/2);
    mesh(hubGeo,m.alloy,tyre);
    const axle=mesh(new T.CylinderGeometry(.035,.035,.16,12),m.brass,tyre);axle.rotation.x=Math.PI/2;
    for(let k=0;k<6;k++){
      const angle=k*Math.PI/3;
      rod([0,0,.067],[.16*Math.cos(angle),.16*Math.sin(angle),.067],.009,m.alloy,tyre);
    }
    if(i===0){
      for(const z of [-.105,.105])rod([1.77,-.35,z],[g[0],g[1],z],.035,m.frame);
    }else{
      rod([.3,-.43,.29*Math.sign(g[2])],g,.035,m.frame);
      rod([-.85,-.42,.3*Math.sign(g[2])],g,.029,m.alloy);
    }
  }
  // Seated 1.65 m adult: pelvis, bent legs/boots, torso, neck, face and helmet,
  // with arms on a stick and restrained shoulders. All dimensions are metres.
  a.pilot=new T.Group();a.pilot.name='55 kg seated pilot';root.add(a.pilot);
  const pilot=a.pilot;
  sphere([.18,.22,.23],[.83,-.17,0],m.suit,pilot);
  const torso=sphere([.18,.34,.245],[.72,.22,0],m.suit,pilot);torso.rotation.z=.12;
  rod([.72,.47,0],[.75,.57,0],.075,m.skin,pilot);
  sphere([.125,.165,.12],[.79,.69,0],m.skin,pilot);
  sphere([.151,.142,.151],[.765,.77,0],m.white,pilot);
  sphere([.07,.067,.127],[.893,.735,0],m.visor,pilot);
  sphere([.035,.043,.05],[.924,.668,0],m.skin,pilot);
  for(const side of [-1,1]){
    const z=side*.13;
    rod([.89,-.21,z],[1.29,-.32,z],.095,m.suit,pilot);
    sphere([.1,.1,.1],[1.29,-.32,z],m.suit,pilot);
    rod([1.29,-.32,z],[1.53,-.65,z],.067,m.suit,pilot);
    sphere([.18,.08,.085],[1.64,-.66,z],m.dark,pilot);
    rod([.74,.39,.22*side],[1.04,.12,.29*side],.063,m.suit,pilot);
    sphere([.067,.065,.067],[1.04,.12,.29*side],m.suit,pilot);
    rod([1.04,.12,.29*side],[1.29,.12,.08*side],.051,m.suit,pilot);
    sphere([.06,.045,.05],[1.29,.12,.08*side],m.leather,pilot);
    rod([.57,.46,.17*side],[.97,-.17,.18*side],.025,m.dark,pilot);
    rod([1.1,-.56,z],[1.79,-.56,z],.015,m.alloy);
  }
  box([.08,.07,.12],[.96,-.16,0],m.brass,pilot);
  rod([1.24,-.4,0],[1.29,.13,0],.02,m.alloy);
  box([.13,.15,.42],[1.6,.03,0],m.dark);
  // Three small instrument faces, no external textures.
  for(const z of [-.13,0,.13]){
    const dial=mesh(new T.CylinderGeometry(.045,.045,.008,16),m.white,root,[1.526,.075,z]);
    dial.rotation.z=Math.PI/2;
    rod([1.518,.075,z],[1.518,.102,z+.018],.004,m.dark);
  }
  return a;
}

function fitRod(obj,v,w){
  // THREE's cylinder primitive is aligned with +Y.
  const dx=w[0]-v[0],dy=w[1]-v[1],dz=w[2]-v[2],length=Math.hypot(dx,dy,dz);
  obj.position.set((v[0]+w[0])/2,(v[1]+w[1])/2,(v[2]+w[2])/2);
  obj.scale.y=Math.max(1e-7,length);
  // Quaternion from [0,1,0] to direction, without allocating a vector.
  if(length>1e-10){
    const x=dx/length,y=dy/length,z=dz/length;
    if(y<-.999999)obj.quaternion.set(1,0,0,0);
    else obj.quaternion.set(z,0,-x,1+y).normalize();
  }
}

// Detail point uses the same material coordinates and two rigid leaves as the
// supplied production panel. The host remains sole owner of panel vertices.
function detailPoint(p,pose,name,leaf,t,u){
  const g=planform(p),outer=name.endsWith('Outer'),side=name.startsWith('left')?-1:1;
  const v=pose[name],inn=pose[side<0?'leftInner':'rightInner'];
  const stroke=inn.stroke+(outer?v.stroke:0);
  const mt=outer?(leaf*.5+t*.5):t;
  const k=Math.min(3,Math.floor(mt*4)),lo=k/4,hi=(k+1)/4;
  const chord=outer?g.chord*(chordFactor(lo)+(chordFactor(hi)-chordFactor(lo))*(mt-lo)/(hi-lo)):g.chord;
  const r=outer?g.outer*(leaf===0?t*.5:v.exposure-.5+t*.5):g.inner*t;
  const x=(.25-u)*chord,y=4*u*(1-u)*chord*v.camber-(outer&&leaf===1?.008:0);
  const ca=Math.cos(v.twist),sa=Math.sin(v.twist),cs=Math.cos(stroke),ss=Math.sin(stroke);
  const xx=x*ca-y*sa,yy=x*sa+y*ca;
  return [xx+v.sweep,E.wing.root_height_m+(outer?g.inner*Math.sin(inn.stroke):0)+r*ss+yy*cs,
    side*(g.hinge+(outer?g.inner*Math.cos(inn.stroke):0)+r*cs-yy*ss)];
}
export function updateAircraft(a,s,c){
  const pose=wingPose(s);
  for(const w of a.wheels)w.rotation.set(0,0,s.wheel_angle??0);
  a.rudder.rotation.y=-(c.rudder??0)*.4;
  a.elevator.rotation.z=-(c.pitch??0)*.22;
  a.crank.rotation.z=s.phase;
  for(const item of a.wingDetail){
    fitRod(item.obj,detailPoint(a.p,pose,item.name,item.leaf,item.t0,item.u0),
      detailPoint(a.p,pose,item.name,item.leaf,item.t1,item.u1));
  }
  for(const item of a.animatedRods){
    const z=item.side*.35,phi=s.phase;
    fitRod(item.obj,[.18*Math.cos(phi),.58+.18*Math.sin(phi),z],
      detailPoint(a.p,pose,item.side<0?'leftInner':'rightInner',0,.22,.25));
  }
  for(const item of a.wrists){
    const prefix=item.side<0?'left':'right';
    const inn=detailPoint(a.p,pose,prefix+'Inner',0,1,.25);
    const out=detailPoint(a.p,pose,prefix+'Outer',0,0,.25);
    item.bearing.position.set(...inn);item.carriage.position.set(...out);
    fitRod(item.rail,inn,out);
    fitRod(item.tie,detailPoint(a.p,pose,prefix+'Inner',0,.88,.65),
      detailPoint(a.p,pose,prefix+'Outer',0,.13,.65));
  }
}
