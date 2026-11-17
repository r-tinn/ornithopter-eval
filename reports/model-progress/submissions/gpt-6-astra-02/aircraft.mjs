import {E} from './environment/engineering.mjs';
import {PANEL_NAMES,makePanel,planform,chordFactor} from './environment/source-mechanism.mjs';
import {wingPose} from './kinematics.mjs';

// All dimensions are metres. The palette distinguishes fabric, carbon,
// aluminium, bronze bearings and the exposed mechanical drive.
export function createAircraft(T,p){
  const root=new T.Group();root.name='TINN / articulated flight demonstrator';
  const a={root,wingPanels:{},wheels:[],T,p,links:[],cranks:[],joints:[],springs:[]};
  const material=(color,metalness=0,roughness=.55)=>new T.MeshStandardMaterial({color,metalness,roughness});
  const mat={
    carbon:material(0x263537,.45,.42),metal:material(0xb6c5c3,.72,.32),
    bronze:material(0xc29853,.7,.33),green:material(0x174d49,.32,.37),
    fabric:material(0xe8dfbd,0,.88),rubber:material(0x22292a,0,.9),
    leather:material(0x704d35,0,.84),suit:material(0x9d784d,0,.9),
    skin:material(0xcc9874,0,.78),dark:material(0x111c23,.3,.28),
    red:material(0xb84d32,.25,.45)
  };
  mat.fabric.side=T.DoubleSide;
  a.mat=mat;
  function mesh(g,m,parent=root){
    const o=new T.Mesh(g,m);parent.add(o);return o;
  }
  function box(size,pos,m,parent=root){
    const o=mesh(new T.BoxGeometry(...size),m,parent);o.position.set(...pos);return o;
  }
  function ellipsoid(scale,pos,m,parent=root){
    const o=mesh(new T.SphereGeometry(1,16,10),m,parent);
    o.scale.set(...scale);o.position.set(...pos);return o;
  }
  function rod(from,to,r,m,parent=root){
    const o=mesh(new T.CylinderGeometry(r,r,1,8),m,parent);
    placeRod(T,o,from,to);return o;
  }
  function disc(r,depth,pos,m,parent=root){
    const g=new T.CylinderGeometry(r,r,depth,24);
    g.rotateX(Math.PI/2); // bake axle orientation: actual local tyre/disc axis is z
    const o=mesh(g,m,parent);o.position.set(...pos);return o;
  }
  a.rod=rod;
  // Broad arm panels and two full-mass sliding leaves per hand assembly.
  for(const name of PANEL_NAMES){
    const group=new T.Group(),surface=new T.Group();
    group.name=name;surface.name=name+'Surface';root.add(group);group.add(surface);
    a[name]=group;a[name+'Surface']=surface;
    const outer=name.endsWith('Outer'),list=[];
    for(let leaf=0;leaf<(outer?2:1);leaf++){
      const g=makePanel(T,p,name,leaf);
      const colours=[];
      const count=outer?2:4;
      for(let row=0;row<=count;row++)for(let col=0;col<3;col++){
        const tip=outer&&leaf===1&&row===count;
        const colour=new T.Color(tip?0x275e58:leaf===1?0xd9cda7:0xf0e6c7);
        colours.push(colour.r,colour.g,colour.b);
      }
      g.setAttribute('color',new T.Float32BufferAttribute(colours,3));
      const fabric=mat.fabric.clone();fabric.color.set(0xffffff);fabric.vertexColors=true;
      const panel=mesh(g,fabric,surface);
      panel.name=name+(outer?` sliding leaf ${leaf+1}`:' fabric arm');
      panel.userData.thickness_fraction=outer?E.wing.outer_thickness_fraction:E.wing.inner_thickness_fraction;
      list.push(panel);
    }
    a.wingPanels[name]=list;
  }
  // One batched set of articulated rib caps, leaf rails and fabric seams.
  const detailGeometry=new T.BufferGeometry();
  detailGeometry.setAttribute('position',new T.BufferAttribute(new Float32Array(6000),3));
  detailGeometry.setDrawRange(0,0);
  a.ribs=new T.LineSegments(detailGeometry,new T.LineBasicMaterial({color:0x5c6252}));
  a.ribs.frustumCulled=false;root.add(a.ribs);
  for(const side of [-1,1]){
    for(let i=0;i<3;i++){
      const link=rod([0,0,0],[0,1,0],i===0?.048:.024,i===0?mat.carbon:mat.metal);
      a.links.push({mesh:link,side,index:i});
    }
    // Shoulder clevises and fixed spring seats.
    box([.36,.16,.16],[0,.8,side*.25],mat.metal);
    disc(.115,.12,[0,.8,side*.30],mat.bronze).rotation.y=Math.PI/2;
    const wrist=disc(.10,.14,[0,0,0],mat.bronze);
    wrist.rotation.y=Math.PI/2;
    a.joints.push({mesh:wrist,side});
    rod([-.48,-.15,side*.3],[0,.8,side*.25],.038,mat.carbon);
    rod([.55,-.2,side*.3],[0,.8,side*.25],.035,mat.carbon);
    // Helical spring: recoverable storage, not a propulsion source.
    const helix=[];
    for(let j=0;j<=100;j++){
      const t=j/100,angle=t*Math.PI*2*10;
      helix.push(new T.Vector3(.09*Math.cos(angle),t*.52,.09*Math.sin(angle)));
    }
    const spring=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(helix),100,.009,5,false),mat.bronze);
    spring.position.set(-.36,.08,side*.36);root.add(spring);a.springs.push(spring);
  }
  // Tapered triangulated keel. Open aft bay reveals that this is a machine,
  // not an animal-shaped fairing or a generic single-piece airplane.
  const stations=[
    {x:2.65,y:-.48,w:.10,h:.15},
    {x:1.65,y:-.35,w:.35,h:.48},
    {x:.3,y:-.37,w:.42,h:.62},
    {x:-.85,y:-.25,w:.34,h:.45},
    {x:-2.85,y:.05,w:.07,h:.12}
  ];
  for(let i=0;i<stations.length-1;i++){
    const f=stations[i],b=stations[i+1];
    for(const side of [-1,1]){
      for(const up of [-1,1]){
        rod([f.x,f.y+up*f.h/2,side*f.w],[b.x,b.y+up*b.h/2,side*b.w],.027,mat.carbon);
      }
      rod([f.x,f.y-f.h/2,side*f.w],[b.x,b.y+b.h/2,side*b.w],.016,mat.metal);
      rod([f.x,f.y+f.h/2,side*f.w],[b.x,b.y-b.h/2,side*b.w],.012,mat.metal);
    }
  }
  for(const st of stations){
    rod([st.x,st.y-st.h/2,-st.w],[st.x,st.y-st.h/2,st.w],.025,mat.carbon);
  }
  ellipsoid([.72,.26,.36],[1.92,-.39,0],mat.green);
  ellipsoid([.47,.24,.35],[.52,-.55,0],mat.green);
  box([1.35,.045,.56],[.95,-.49,0],mat.carbon);
  // Small brushed-metal nose badge and navigation lamps.
  ellipsoid([.09,.04,.08],[2.55,-.30,0],mat.bronze);
  for(const side of [-1,1])ellipsoid([.05,.035,.035],[.22,.82,side*.4],side<0?mat.red:mat.green);
  // Seat, harness and recognisable clothed adult at the controls.
  const pilot=new T.Group();pilot.name='seated 55 kg adult pilot';root.add(pilot);a.pilot=pilot;
  box([.46,.11,.43],[.52,-.15,0],mat.leather);
  const back=box([.10,.55,.44],[.23,.11,0],mat.leather);back.rotation.z=-.12;
  ellipsoid([.17,.30,.23],[.47,.20,0],mat.suit,pilot);
  ellipsoid([.20,.13,.23],[.57,-.10,0],mat.suit,pilot);
  rod([.44,.45,0],[.46,.60,0],.072,mat.skin,pilot);
  ellipsoid([.125,.16,.12],[.48,.72,0],mat.skin,pilot);
  ellipsoid([.142,.145,.137],[.465,.79,0],mat.fabric,pilot);
  // Face is forward (+x); goggles and a small nose read in inspection views.
  ellipsoid([.028,.055,.105],[.593,.746,0],mat.dark,pilot);
  ellipsoid([.037,.035,.035],[.612,.687,0],mat.skin,pilot);
  for(const side of [-1,1]){
    ellipsoid([.035,.075,.065],[.46,.737,side*.125],mat.leather,pilot);
    const shoulder=[.47,.40,side*.22],elbow=[.72,.10,side*.28],hand=[.95,.08,side*.13];
    rod(shoulder,elbow,.065,mat.suit,pilot);rod(elbow,hand,.054,mat.suit,pilot);
    ellipsoid([.07,.048,.05],hand,mat.leather,pilot);
    const hip=[.57,-.09,side*.15],knee=[1.00,-.27,side*.19],ankle=[1.28,-.65,side*.18];
    rod(hip,knee,.085,mat.suit,pilot);rod(knee,ankle,.064,mat.suit,pilot);
    ellipsoid([.17,.075,.078],[1.38,-.66,side*.18],mat.leather,pilot);
    rod([.62,.43,side*.15],[.68,-.07,side*.05],.022,mat.dark,pilot);
    rod([.35,-.08,side*.22],[.71,-.07,side*.04],.024,mat.dark,pilot);
    box([.18,.035,.14],[1.43,-.70,side*.18],mat.metal);
  }
  box([.07,.075,.095],[.70,-.04,0],mat.bronze,pilot);
  rod([.83,-.43,0],[.95,.07,0],.019,mat.carbon);
  rod([.95,.07,-.15],[.95,.07,.15],.023,mat.dark);
  const dash=box([.08,.22,.52],[1.22,.03,0],mat.green);
  dash.rotation.z=-.16;
  for(const z of [-.15,0,.15]){
    const dial=disc(.060,.012,[1.17,.065,z],mat.dark);
    dial.rotation.y=Math.PI/2;
    rod([1.155,.065,z],[1.152,.097,z+.019],.004,mat.fabric);
  }
  // Curved transparent wind deflector, open cockpit rather than a glass bubble.
  const glass=new T.MeshStandardMaterial({color:0xb0dbd4,transparent:true,opacity:.26,roughness:.2,metalness:.1,side:T.DoubleSide,depthWrite:false});
  const screen=mesh(new T.SphereGeometry(1,16,8,0,Math.PI*2,0,Math.PI/2),glass);
  screen.scale.set(.28,.38,.39);screen.position.set(1.3,.10,0);screen.rotation.z=-.45;
  // Engine and explicitly non-propeller transmission behind the pilot.
  box([.48,.35,.43],[-.53,-.14,0],mat.metal);
  box([.30,.32,.30],[-.55,.15,0],mat.dark);
  for(let i=0;i<7;i++)box([.38,.025,.36],[-.55,.02+i*.047,0],mat.metal);
  rod([-.5,.39,0],[-.48,.48,0],.025,mat.fabric);
  ellipsoid([.26,.15,.12],[-.83,-.20,.37],mat.dark);
  rod([-.64,.09,.19],[-.82,-.13,.37],.032,mat.bronze);
  rod([-.86,-.2,.37],[-1.19,-.28,.37],.025,mat.metal);
  box([.40,.30,.40],[-1.05,-.15,0],mat.green);
  disc(.045,.03,[-1.05,.025,0],mat.bronze).rotation.x=Math.PI/2;
  for(const side of [-1,1]){
    const drive=new T.Group();drive.position.set(-.28,.42,side*.33);root.add(drive);
    drive.name='slow crank and reduction wheel';a.cranks.push(drive);
    const ring=mesh(new T.TorusGeometry(.27,.025,6,32),mat.bronze,drive);
    disc(.07,.075,[0,0,0],mat.metal,drive);
    for(let k=0;k<6;k++){
      const t=k*Math.PI/3;
      rod([0,0,0],[.25*Math.cos(t),.25*Math.sin(t),0],.016,mat.metal,drive);
    }
    disc(.035,.08,[.19,0,0],mat.metal,drive);
    const pulley=disc(.105,.06,[-.55,-.13,side*.33],mat.bronze);
    // Belt tangents make the motor-to-wing power path legible.
    rod([-.66,-.12,side*.33],[-.55,.43,side*.33],.015,mat.dark);
    rod([-.45,-.14,side*.33],[-.03,.36,side*.33],.015,mat.dark);
    const link=rod([0,0,0],[0,1,0],.018,mat.metal);
    a.links.push({mesh:link,side,index:3});
  }
  // Conventional tail: thin fixed stabiliser, separate hinged elevator and fin.
  const tail=ellipsoid([.40,.035,1.02],[-2.60,.10,0],mat.fabric);
  tail.rotation.z=E.coupled.tail_incidence_rad;
  rod([-2.54,.10,-.97],[-2.54,.10,.97],.022,mat.carbon);
  const elevator=new T.Group();elevator.name='elevator';elevator.position.set(-2.84,.09,0);root.add(elevator);a.elevator=elevator;
  ellipsoid([.19,.025,.97],[-.12,0,0],mat.green,elevator);
  const finShape=new T.Shape();
  finShape.moveTo(-2.22,.10);finShape.lineTo(-2.50,.96);
  finShape.quadraticCurveTo(-2.72,1.17,-2.88,1.00);
  finShape.lineTo(-2.88,.10);finShape.closePath();
  const fin=mesh(new T.ExtrudeGeometry(finShape,{depth:.035,bevelEnabled:false}),mat.fabric);fin.position.z=-.0175;
  rod([-2.30,.12,0],[-2.67,.99,0],.021,mat.carbon);
  const rudder=new T.Group();rudder.name='rudder';rudder.position.set(-2.88,.1,0);root.add(rudder);a.rudder=rudder;
  const rs=new T.Shape();rs.moveTo(0,0);rs.lineTo(0,.90);rs.quadraticCurveTo(-.30,.82,-.33,.37);rs.lineTo(-.24,0);rs.closePath();
  const rm=mesh(new T.ExtrudeGeometry(rs,{depth:.025,bevelEnabled:false}),mat.green,rudder);rm.position.z=-.0125;
  for(const side of [-1,1]){
    rod([-.10,-.16,side*.28],[-2.84,.10,side*.25],.006,mat.bronze);
    rod([-1.02,-.34,side*.20],[-2.55,.10,side*.75],.010,mat.metal);
  }
  // Three actual toroidal tyre meshes. A z spin changes tread/spoke positions
  // while leaving the wheel plane normal lateral at every rolling angle.
  for(let i=0;i<p.gear_centres.length;i++){
    const g=p.gear_centres[i],z=g[2],nose=i===0;
    rod([nose?1.60:-.15,-.45,nose?-.12:z*.32],[g[0],g[1],z-.07],.030,mat.metal);
    rod([nose?2.2:-.85,-.40,nose?.12:z*.32],[g[0],g[1],z+.07],.025,mat.carbon);
    rod([g[0],g[1],z-.16],[g[0],g[1],z+.16],.026,mat.metal);
    const tyre=mesh(new T.TorusGeometry(p.wheel_radius_m-.06,.06,10,32),mat.rubber);
    tyre.position.set(...g);tyre.name=['nose tyre','left main tyre','right main tyre'][i];
    tyre.userData.axle=[0,0,1];a.wheels.push(tyre);
    const rim=mesh(new T.TorusGeometry(.115,.023,6,20),mat.metal,tyre);
    disc(.048,.15,[0,0,0],mat.bronze,tyre);
    for(let k=0;k<8;k++){
      const angle=k*Math.PI/4;
      rod([0,0,0],[.127*Math.cos(angle),.127*Math.sin(angle),0],.009,mat.metal,tyre);
    }
    // Contrasting valve and shoulder marks make rotation readable.
    box([.025,.034,.117],[0,.174,0],mat.leather,tyre);
  }
  // Lightweight maker's plate; no canvas, textures, network or external assets.
  box([.24,.11,.012],[-.14,-.28,.43],mat.bronze);
  for(const x of [-.23,-.05])ellipsoid([.012,.012,.009],[x,-.28,.442],mat.metal);
  // Hand-built stencil strokes, not a font or texture asset.
  const glyphs={
    T:[[0,1,1,1],[.5,1,.5,0]],
    I:[[0,1,1,1],[.5,1,.5,0],[0,0,1,0]],
    N:[[0,0,0,1],[0,1,1,0],[1,0,1,1]]
  };
  for(const side of [-1,1]){
    for(let i=0;i<4;i++)for(const [x0,y0,x1,y1] of glyphs['TINN'[i]]){
      rod([1.5-i*.15+x0*.10,-.42+y0*.13,side*.344],
        [1.5-i*.15+x1*.10,-.42+y1*.13,side*.344],.008,mat.fabric);
    }
  }
  updateAircraft(a,{phase:0,gliding:false,timing_bias:E.wing.timing_bias_low_speed,wheel_angle:0},{});
  return a;
}

function placeRod(T,o,from,to){
  const v=new T.Vector3(...to).sub(new T.Vector3(...from));
  const length=v.length();
  o.position.set((from[0]+to[0])/2,(from[1]+to[1])/2,(from[2]+to[2])/2);
  o.scale.set(1,Math.max(length,.0001),1);
  if(length>1e-10)o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.multiplyScalar(1/length));
}

// Structural detail follows the same material coordinates as makePanel. It
// never changes a production leaf or any of the four identity wing Groups.
function wingPoint(p,pose,name,leaf,t,u,depth=0){
  const g=planform(p),outer=name.endsWith('Outer'),side=name.startsWith('left')?-1:1;
  const v=pose[name],inn=pose[side<0?'leftInner':'rightInner'];
  const stroke=inn.stroke+(outer?v.stroke:0);
  let chord=g.chord;
  if(outer){
    const mt=leaf*.5+t*.5,i=Math.min(3,Math.floor(mt*4)),lo=i/4,hi=(i+1)/4;
    chord*=chordFactor(lo)+(chordFactor(hi)-chordFactor(lo))*(mt-lo)/(hi-lo);
  }
  const r=outer?g.outer*(leaf===0?t*.5:v.exposure-.5+t*.5):g.inner*t;
  const x=(.25-u)*chord,y=4*u*(1-u)*chord*v.camber-(outer&&leaf===1?.008:0)+depth;
  const xx=x*Math.cos(v.twist)-y*Math.sin(v.twist),yy=x*Math.sin(v.twist)+y*Math.cos(v.twist);
  return [xx+v.sweep,E.wing.root_height_m+(outer?g.inner*Math.sin(inn.stroke):0)+r*Math.sin(stroke)+yy*Math.cos(stroke),
    side*(g.hinge+(outer?g.inner*Math.cos(inn.stroke):0)+r*Math.cos(stroke)-yy*Math.sin(stroke))];
}

export function updateAircraft(a,s,c={}){
  const pose=wingPose(s),T=a.T;
  for(const tyre of a.wheels)tyre.rotation.set(0,0,-(s.wheel_angle??0));
  a.rudder.rotation.y=-.38*(c.rudder??0);
  a.elevator.rotation.z=-.24*(c.pitch??0);
  for(const crank of a.cranks)crank.rotation.z=-(s.phase??0);
  for(const spring of a.springs)spring.scale.y=1+.24*Math.sin(pose.leftInner.stroke-E.wing.dihedral_rad);
  for(const joint of a.joints){
    joint.mesh.position.set(...wingPoint(a.p,pose,joint.side<0?'leftInner':'rightInner',0,1,.25));
  }
  for(const link of a.links){
    const {side,index,mesh}=link,name=side<0?'leftInner':'rightInner';
    let from,to;
    if(index===0){from=wingPoint(a.p,pose,name,0,0,.25);to=wingPoint(a.p,pose,name,0,1,.25);}
    else if(index===1){from=[-.28,.42,side*.33];to=wingPoint(a.p,pose,name,0,.22,.25);}
    else if(index===2){from=wingPoint(a.p,pose,name,0,1,.25);to=wingPoint(a.p,pose,side<0?'leftOuter':'rightOuter',0,1,.25);}
    else{
      const ph=-(s.phase??0);
      from=[-.28+.19*Math.cos(ph),.42+.19*Math.sin(ph),side*.33];
      to=wingPoint(a.p,pose,name,0,.12,.3);
    }
    placeRod(T,mesh,from,to);
  }
  const attr=a.ribs.geometry.getAttribute('position');let n=0;
  const line=(p,q)=>{attr.setXYZ(n++,...p);attr.setXYZ(n++,...q);};
  for(const name of PANEL_NAMES){
    const outer=name.endsWith('Outer'),count=outer?4:8;
    for(let leaf=0;leaf<(outer?2:1);leaf++){
      const point=(t,u,d=0)=>wingPoint(a.p,pose,name,leaf,t,u,d);
      for(let j=0;j<=count;j++){
        const t=j/count;
        for(let u=0;u<4;u++)line(point(t,u/4,.006),point(t,(u+1)/4,.006));
        if(!outer){
          const thickness=planform(a.p).chord*E.wing.inner_thickness_fraction;
          line(point(t,0),point(t,.5,-thickness));
          line(point(t,.5,-thickness),point(t,1));
        }
      }
      for(let j=0;j<count;j++)for(const u of [0,.25,1])
        line(point(j/count,u,.008),point((j+1)/count,u,.008));
      // Thin diagonal shear bracing supports the fabric rather than adding feathers.
      for(let j=0;j<count;j++)line(point(j/count,.25,.01),point((j+1)/count,.88,.01));
    }
  }
  attr.needsUpdate=true;a.ribs.geometry.setDrawRange(0,n);
}
