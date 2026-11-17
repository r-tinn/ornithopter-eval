import {E} from './environment/engineering.mjs';
import {makePanel,planform,chordFactor,PANEL_NAMES} from './environment/source-mechanism.mjs';
import {wingPose} from './kinematics.mjs';

// All dimensions in metres. A small, open-cockpit composite / alloy machine,
// not a bird sculpture. Ivory membrane, graphite spars, anodised bronze drive.
export function createAircraft(T,p){
  const root=new T.Group();root.name='Tinn • articulated research aircraft';
  const a={root,wheels:[],wingPanels:{},parameters:p,T,rods:[],cranks:[],carriages:[]};
  const material=(color,metalness=0,roughness=.55,extra={})=>new T.MeshStandardMaterial({color,metalness,roughness,...extra});
  const M={
    fabric:material(0xe9dfbd,0,.85,{side:T.DoubleSide}),
    leaf:material(0xf5eccf,0,.82,{side:T.DoubleSide}),
    blue:material(0x173b46,.35,.35),orange:material(0xc76a32,.25,.42,{side:T.DoubleSide}),
    metal:material(0xa5afb0,.75,.3),dark:material(0x253032,.45,.45),
    bronze:material(0xb58b4f,.75,.28),rubber:material(0x202323,0,.95),
    seat:material(0x6f4932,0,.9),cloth:material(0x526767,0,.95),
    skin:material(0xc99470,0,.8),helmet:material(0xe6dcca,.15,.32),
    glass:material(0x83b4c0,.1,.18,{transparent:true,opacity:.26,side:T.DoubleSide,depthWrite:false}),
    visor:material(0x182b34,.5,.2),light:material(0xdcb173,.2,.4)
  };
  function mesh(geo,mat,pos=[0,0,0],parent=root){
    const n=new T.Mesh(geo,mat);n.position.set(...pos);parent.add(n);return n;
  }
  function ball(pos,scale,mat,parent=root){
    const n=mesh(new T.SphereGeometry(1,16,10),mat,pos,parent);n.scale.set(...scale);return n;
  }
  function box(pos,scale,mat,parent=root){
    return mesh(new T.BoxGeometry(...scale),mat,pos,parent);
  }
  function rod(from,to,r,mat,parent=root){
    const n=mesh(new T.CylinderGeometry(r,r,1,8),mat,[0,0,0],parent);
    setRod(T,n,from,to);return n;
  }
  function disc(pos,r,depth,mat,parent=root){
    // Bake the cylinder's y axis to z; later wheel/crank spin is ONLY about z.
    const g=new T.CylinderGeometry(r,r,depth,24);g.rotateX(Math.PI/2);
    return mesh(g,mat,pos,parent);
  }
  function plate(points,thickness,vertical,mat,parent=root){
    const v=[],idx=[],n=points.length;
    for(const t of [-thickness/2,thickness/2])for(const [x,b] of points)v.push(...(vertical?[x,b,t]:[x,t,b]));
    for(let i=1;i<n-1;i++)idx.push(0,i+1,i,n,n+i,n+i+1);
    for(let i=0;i<n;i++){const j=(i+1)%n;idx.push(i,j,n+i,j,n+j,n+i);}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(v,3));g.setIndex(idx);g.computeVertexNormals();
    return mesh(g,mat,[0,0,0],parent);
  }

  // Fixed undercarriage: three separate tyres, bronze hubs, pale sidewalls,
  // triangular alloy struts. No axle-tilting Euler spin.
  p.gear_centres.forEach((g,i)=>{
    const tube=p.tyre_section_radius_m??.06;
    const tyre=mesh(new T.TorusGeometry(p.wheel_radius_m-tube,tube,10,32),M.rubber,g);
    tyre.name=i===0?'Nose tyre':'Main tyre '+i;tyre.userData.axle=[0,0,1];
    a.wheels.push(tyre);
    disc([0,0,0],.115,.12,M.metal,tyre);
    disc([0,0,.073],.046,.025,M.bronze,tyre);
    disc([0,0,-.073],.046,.025,M.bronze,tyre);
    for(let j=0;j<6;j++){
      const t=j*Math.PI/3;
      rod([.05*Math.cos(t),.05*Math.sin(t),.071],[.105*Math.cos(t),.105*Math.sin(t),.071],.009,M.dark,tyre);
    }
    // A small valve stem makes rotation visible in close inspection.
    rod([.11,0,.062],[.145,0,.062],.008,M.bronze,tyre);
    if(i===0){
      for(const z of [-.1,.1])rod([1.65,-.55,z],[2,-1.2,z],.027,M.metal);
      rod([2,-1.2,-.13],[2,-1.2,.13],.025,M.dark);
      rod([1.35,-.6,0],[1.88,-.94,0],.036,M.dark);
    }else{
      rod([-.7,-.3,g[2]*.2],g,.034,M.metal);
      rod([.55,-.57,g[2]*.2],g,.027,M.metal);
      rod([-.45,-1.2,g[2]-.14],[-.45,-1.2,g[2]+.14],.025,M.dark);
    }
  });

  // Continuous triangulated fuselage load path, cockpit outriggers and boom.
  const stations=[[-2.9,.02,.075],[-1.7,-.14,.16],[-.65,-.37,.34],[.65,-.55,.35],[1.85,-.64,.19],[2.42,-.44,.035]];
  for(let j=0;j<stations.length-1;j++){
    const [x,y,z]=stations[j],[xx,yy,zz]=stations[j+1];
    for(const side of [-1,1]){
      rod([x,y,side*z],[xx,yy,side*zz],.024,M.dark);
      rod([x,y,side*z],[xx,yy+.37,side*zz],.014,M.metal);
      rod([x,y+.3,side*z],[xx,yy,side*zz],.014,M.metal);
    }
    rod([x,y,-z],[x,y,z],.018,M.metal);
  }
  rod([-3.07,.04,0],[-.65,.18,0],.057,M.blue);
  rod([-2.7,.06,0],[-.65,-.35,-.32],.013,M.metal);
  rod([-2.7,.06,0],[-.65,-.35,.32],.013,M.metal);

  // Lower cockpit shell, with an open rim rather than an opaque capsule
  // hiding the seated pilot. Longitudinal rings form an engineered fairing.
  const hullStations=[[-1.05,-.29,.07,.1],[-.55,-.34,.32,.26],[.25,-.39,.43,.35],[1.1,-.43,.42,.34],[1.95,-.45,.3,.26],[2.5,-.4,.02,.04]];
  const hv=[],hi=[],segments=16;
  for(const [x,y,width,depth] of hullStations)for(let j=0;j<=segments;j++){
    const t=Math.PI*j/segments;
    hv.push(x,y-depth*Math.sin(t),width*Math.cos(t));
  }
  for(let i=0;i<hullStations.length-1;i++)for(let j=0;j<segments;j++){
    const k=i*(segments+1)+j;hi.push(k,k+1,k+segments+1,k+1,k+segments+2,k+segments+1);
  }
  const hg=new T.BufferGeometry();hg.setAttribute('position',new T.Float32BufferAttribute(hv,3));hg.setIndex(hi);hg.computeVertexNormals();
  mesh(hg,new T.MeshStandardMaterial({color:0x173b46,metalness:.3,roughness:.42,side:T.DoubleSide}));
  for(const side of [-1,1])for(let i=0;i<hullStations.length-1;i++){
    const h=hullStations[i],k=hullStations[i+1];
    rod([h[0],h[1],side*h[2]],[k[0],k[1],side*k[2]],.017,M.bronze);
  }
  // Removable nose cap and short windscreen, leaving the upper body visible.
  ball([2.12,-.43,0],[.48,.23,.3],M.blue);
  const screen=mesh(new T.SphereGeometry(1,20,12,0,Math.PI*2,0,Math.PI/2),M.glass,[1.55,-.26,0]);
  screen.scale.set(.43,.58,.4);
  rod([1.58,-.26,-.4],[1.58,.2,-.29],.012,M.metal);
  rod([1.58,-.26,.4],[1.58,.2,.29],.012,M.metal);

  // Seated 1.65 m adult: shaped torso, bent knees, arms on a stick, helmet,
  // nose, ears, visor, harness and boots. All below the named pilot Group.
  const pilot=new T.Group();pilot.name='55 kg seated adult pilot';root.add(pilot);a.pilot=pilot;
  box([.55,-.27,0],[.48,.1,.48],M.seat);
  const back=box([.25,.03,0],[.1,.6,.46],M.seat);back.rotation.z=-.18;
  ball([.62,-.17,0],[.27,.18,.22],M.cloth,pilot);
  const torso=ball([.49,.19,0],[.20,.34,.25],M.cloth,pilot);torso.rotation.z=-.15;
  rod([.51,.43,0],[.54,.56,0],.082,M.skin,pilot);
  ball([.56,.69,0],[.13,.175,.13],M.skin,pilot);
  ball([.53,.75,0],[.15,.15,.15],M.helmet,pilot);
  ball([.672,.728,0],[.045,.069,.125],M.visor,pilot);
  ball([.697,.652,0],[.038,.03,.033],M.skin,pilot);
  for(const side of [-1,1]){
    ball([.54,.675,.132*side],[.036,.046,.023],M.helmet,pilot);
    rod([.65,-.2,.13*side],[1.12,-.35,.17*side],.11,M.cloth,pilot);
    ball([1.12,-.35,.17*side],[.12,.115,.11],M.cloth,pilot);
    rod([1.12,-.35,.17*side],[1.57,-.64,.17*side],.075,M.cloth,pilot);
    ball([1.69,-.65,.17*side],[.18,.075,.09],M.dark,pilot);
    rod([.48,.37,.23*side],[.83,.12,.31*side],.065,M.cloth,pilot);
    ball([.83,.12,.31*side],[.068,.073,.065],M.cloth,pilot);
    rod([.83,.12,.31*side],[1.08,.05,.07*side],.052,M.cloth,pilot);
    ball([1.08,.05,.07*side],[.067,.045,.045],M.skin,pilot);
    rod([.57,.44,.135*side],[.79,-.15,.15*side],.024,M.dark,pilot);
    rod([.39,-.14,.21*side],[.79,-.15,.15*side],.025,M.dark,pilot);
    box([1.73,-.69,.17*side],[.22,.045,.12],M.metal);
  }
  box([.794,-.15,0],[.045,.072,.12],M.bronze,pilot);
  rod([1.02,-.46,0],[1.08,.045,0],.018,M.metal);
  ball([1.08,.06,0],[.035,.06,.04],M.dark);
  // Instrument binnacle with simple glass gauges; no screen/UI decoration.
  const panel=box([1.41,.04,0],[.07,.23,.42],M.dark);panel.rotation.z=.18;
  for(const z of [-.12,.02,.13]){
    const gauge=disc([1.365,.065,z],z===.13?.035:.05,.012,M.metal);
    gauge.rotation.y=Math.PI/2;
    const dial=disc([0,0,-.008],z===.13?.028:.042,.004,M.visor,gauge);
    rod([0,0,-.012],[.017,.025,-.012],.003,M.light,gauge);
  }

  // Engine and transmission aft of the seat. No propeller: all shaft work
  // goes through the reduction, transverse crank and the articulated wings.
  box([-.71,-.02,0],[.55,.34,.45],M.dark);
  const cylinder=box([-.73,.24,0],[.3,.28,.3],M.metal);cylinder.rotation.z=.2;
  for(let j=0;j<7;j++)box([-.73,.13+j*.039,0],[.36,.018,.35],M.dark);
  rod([-.77,.4,.05],[-.84,.5,.05],.018,M.helmet);
  disc([-.65,-.02,.27],.19,.10,M.blue);
  disc([-.65,-.02,.33],.10,.03,M.bronze);
  // Exhaust expansion chamber, intake, tank and its retaining straps.
  rod([-.88,.17,-.16],[-1.15,.08,-.37],.045,M.bronze);
  ball([-1.29,-.08,-.36],[.4,.12,.12],M.dark);
  rod([-1.55,-.1,-.36],[-1.8,-.12,-.36],.025,M.bronze);
  ball([-.33,.03,-.29],[.13,.12,.09],M.dark);
  box([-1.18,-.12,.04],[.42,.3,.41],M.metal);
  disc([-1.17,.055,.04],.045,.04,M.bronze).rotation.x=Math.PI/2;
  for(const x of [-1.32,-1.04])rod([x,-.29,-.18],[x,-.29,.26],.024,M.dark);
  // Central pylons, bearing blocks and a slow, highly reduced output crank.
  for(const side of [-1,1]){
    rod([-.9,-.26,side*.26],[0,.8,side*.25],.035,M.metal);
    rod([.34,-.36,side*.28],[0,.8,side*.25],.035,M.metal);
    box([0,.8,side*.25],[.22,.19,.12],M.blue);
    disc([0,.8,side*.32],.11,.055,M.bronze);
  }
  rod([0,.8,-.37],[0,.8,.37],.055,M.metal);
  box([-.31,.43,0],[.42,.46,.35],M.blue);
  for(const side of [-1,1]){
    const crank=new T.Group();crank.position.set(-.3,.52,side*.27);root.add(crank);a.cranks.push(crank);
    disc([0,0,0],.24,.045,M.bronze,crank);
    disc([0,0,side*.028],.16,.015,M.dark,crank);
    for(let j=0;j<6;j++){
      const t=j*Math.PI/3;
      disc([.19*Math.cos(t),.19*Math.sin(t),side*.035],.019,.018,M.metal,crank);
    }
    rod([0,0,side*.045],[.17,0,side*.045],.035,M.metal,crank);
    disc([.17,0,side*.055],.04,.04,M.bronze,crank);
    const link=rod([-.13,.52,side*.33],[0,.8,side*.5],.023,M.metal);
    a.rods.push({node:link,side});
    // Visible paired hinge torsion springs; energy is in the actual model.
    const springPoints=[];
    for(let j=0;j<=100;j++){
      const t=j/100;springPoints.push(new T.Vector3(.12*Math.cos(t*20*Math.PI),.8+.12*Math.sin(t*20*Math.PI),side*(.36+t*.27)));
    }
    mesh(new T.TubeGeometry(new T.CatmullRomCurve3(springPoints),100,.012,5,false),M.bronze);
  }
  // Guarded reduction belt: two rings joined by straight spans.
  for(const [x,y,r] of [[-.65,-.02,.11],[-.3,.52,.22]]){
    mesh(new T.TorusGeometry(r,.017,6,32),M.rubber,[x,y,.39]);
  }
  rod([-.75,.02,.39],[-.5,.61,.39],.017,M.rubber);
  rod([-.55,-.06,.39],[-.10,.43,.39],.017,M.rubber);

  // Conventional, long-arm tail. A contrasting movable elevator and rudder
  // read as controls rather than feathers.
  const tail=new T.Group();tail.position.set(-2.8,.04,0);root.add(tail);
  plate([[.35,-.75],[.19,-1.23],[-.13,-1.34],[-.24,-1.2],[-.24,1.2],[-.13,1.34],[.19,1.23],[.35,.75]],.036,false,M.fabric,tail);
  const elevator=new T.Group();elevator.position.set(-.24,0,0);tail.add(elevator);a.elevator=elevator;
  plate([[0,-1.2],[-.22,-1.14],[-.24,1.14],[0,1.2]],.025,false,M.orange,elevator);
  for(const side of [-1,1])rod([-1.8,-.15,0],[-2.82,.03,side*.96],.012,M.metal);
  plate([[.38,0],[.13,.88],[-.12,1.14],[-.25,1.12],[-.25,0]],.04,true,M.fabric,tail);
  const rudder=new T.Group();rudder.position.set(-.25,0,0);tail.add(rudder);a.rudder=rudder;
  plate([[0,0],[0,1.12],[-.24,.94],[-.31,.15],[-.22,0]],.027,true,M.orange,rudder);
  rod([-3.05,.04,0],[-3.05,1.15,0],.012,M.metal);
  for(const side of [-1,1]){
    rod([.95,-.38,side*.32],[-2.99,.02,side*.12],.004,M.dark);
  }

  // Production membranes MUST remain identity children of Surface. The host
  // writes these exact curved/sliding material-coordinate vertices.
  for(const name of PANEL_NAMES){
    const group=new T.Group(),surface=new T.Group();group.name=name;surface.name=name+'Surface';
    root.add(group);group.add(surface);a[name]=group;a[name+'Surface']=surface;
    a.wingPanels[name]=[];
    for(let leaf=0;leaf<(name.endsWith('Outer')?2:1);leaf++){
      const panel=mesh(makePanel(T,p,name,leaf),leaf?M.leaf:M.fabric,[0,0,0],surface);
      panel.name=name+' / rigid leaf '+leaf;a.wingPanels[name].push(panel);
    }
  }
  // Ribs, leaf seams and spanwise rails share the same material coordinates.
  // Line segments batch fine structure into two draw calls; four moving
  // graphite spars and wrist bearings give the membranes readable depth.
  a.detailLines=[];
  for(const [color,width] of [[0x4b5149,1],[0xb17a39,1]]){
    const geo=new T.BufferGeometry();
    const line=new T.LineSegments(geo,new T.LineBasicMaterial({color,linewidth:width}));
    line.frustumCulled=false;root.add(line);a.detailLines.push(line);
  }
  a.spars=[];a.joints=[];
  for(const name of PANEL_NAMES){
    const node=rod([0,0,0],[0,1,0],name.endsWith('Outer')?.025:.041,M.dark);
    a.spars.push({name,node});
    if(name.endsWith('Inner')){
      const joint=ball([0,0,0],[.115,.115,.115],M.bronze);a.joints.push({name,node:joint});
    }
  }
  for(const side of ['left','right']){
    const link=rod([0,0,0],[1,0,0],.028,M.metal);
    const bearing=ball([0,0,0],[.1,.1,.1],M.bronze);
    const shoulder=rod([0,0,0],[1,0,0],.035,M.metal);
    a.carriages.push({side,link,bearing,shoulder});
    const z=side==='left'?-.25:.25;
    // Fixed shoulder linear guide, sleeve follows the fore/aft linkage.
    rod([-.46,.8,z],[.46,.8,z],.025,M.metal);
    for(const x of [-.46,.46])box([x,.8,z],[.065,.12,.12],M.blue);
  }
  // Fixed small service plates and fasteners.
  for(const side of [-1,1]){
    for(const x of [-.35,.15,.6,1.05])ball([x,-.405,side*.405],[.015,.015,.012],M.metal);
  }
  a.materials=M;
  updateAircraft(a,{phase:0,omega:0,gliding:false,timing_bias:E.wing.timing_bias_low_speed,wheel_angle:0},{pitch:0,rudder:0});
  return a;
}

function setRod(T,node,from,to){
  const d=new T.Vector3(to[0]-from[0],to[1]-from[1],to[2]-from[2]);
  const length=d.length();node.position.set((from[0]+to[0])/2,(from[1]+to[1])/2,(from[2]+to[2])/2);
  node.scale.set(1,Math.max(1e-6,length),1);
  if(length>1e-9)node.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.multiplyScalar(1/length));
}

// Only decorative structure uses this point evaluator. Aerodynamic and
// production leaf geometry remain exclusively the supplied helper's geometry.
function structurePoint(p,pose,name,leaf,t,u,offset=0){
  const g=planform(p),outer=name.endsWith('Outer'),side=name.startsWith('left')?-1:1;
  const v=pose[name],inner=pose[side<0?'leftInner':'rightInner'];
  const mt=outer?leaf*.5+t*.5:t;
  const i=Math.min(3,Math.floor(mt*4)),t0=i/4,t1=(i+1)/4;
  const chord=outer?g.chord*(chordFactor(t0)+(chordFactor(t1)-chordFactor(t0))*(mt-t0)/(t1-t0)):g.chord;
  const r=outer?g.outer*(leaf===0?t*.5:v.exposure-.5+t*.5):g.inner*t;
  const stroke=inner.stroke+(outer?v.stroke:0),cs=Math.cos(stroke),ss=Math.sin(stroke);
  const x=(.25-u)*chord,y=4*u*(1-u)*chord*v.camber-(outer&&leaf===1?.008:0)+offset;
  const xx=x*Math.cos(v.twist)-y*Math.sin(v.twist),yy=x*Math.sin(v.twist)+y*Math.cos(v.twist);
  return [xx+v.sweep,E.wing.root_height_m+(outer?g.inner*Math.sin(inner.stroke):0)+r*ss+yy*cs,
    side*(g.hinge+(outer?g.inner*Math.cos(inner.stroke):0)+r*cs-yy*ss)];
}

export function updateAircraft(a,s,c){
  const {T,parameters:p}=a,pose=wingPose(s);
  for(const tyre of a.wheels)tyre.rotation.set(0,0,-(s.wheel_angle??0));
  a.rudder.rotation.y=-(c.rudder??0)*.4;
  a.elevator.rotation.z=-(c.pitch??0)*.27;
  const theta=s.gliding?0:s.phase-(s.timing_bias??E.wing.timing_bias_low_speed)*Math.sin(s.phase);
  for(const crank of a.cranks)crank.rotation.z=-theta;
  for(const r of a.rods){
    const pin=[-.3+.17*Math.cos(theta),.52-.17*Math.sin(theta),r.side*.33];
    const name=r.side<0?'leftInner':'rightInner';
    setRod(T,r.node,pin,structurePoint(p,pose,name,0,.1,.25,-.055));
  }
  const ribs=[],edges=[];
  const segment=(list,a,b)=>list.push(...a,...b);
  for(const name of PANEL_NAMES){
    const outer=name.endsWith('Outer');
    for(let leaf=0;leaf<(outer?2:1);leaf++){
      for(let j=0;j<=(outer?5:8);j++){
        const t=j/(outer?5:8);
        for(let k=0;k<8;k++){
          const u=k/8,un=(k+1)/8;
          segment(ribs,structurePoint(p,pose,name,leaf,t,u,.008),structurePoint(p,pose,name,leaf,t,un,.008));
          if(!outer){
            const thick=planform(p).chord*E.wing.inner_thickness_fraction;
            segment(ribs,structurePoint(p,pose,name,leaf,t,u,-thick*Math.sin(Math.PI*u)),structurePoint(p,pose,name,leaf,t,un,-thick*Math.sin(Math.PI*un)));
          }
        }
      }
      for(const u of [0,.25,1])for(let j=0;j<8;j++){
        segment(edges,structurePoint(p,pose,name,leaf,j/8,u,.012),structurePoint(p,pose,name,leaf,(j+1)/8,u,.012));
      }
      // Double rails at each rigid outer leaf joint emphasise sliding overlap.
      if(outer)for(const t of [0,1]){
        segment(edges,structurePoint(p,pose,name,leaf,t,0,.015),structurePoint(p,pose,name,leaf,t,.5,.015));
        segment(edges,structurePoint(p,pose,name,leaf,t,.5,.015),structurePoint(p,pose,name,leaf,t,1,.015));
      }
    }
  }
  for(let i=0;i<2;i++){
    const values=i?edges:ribs,geo=a.detailLines[i].geometry,attr=geo.getAttribute('position');
    if(!attr||attr.count*3!==values.length)geo.setAttribute('position',new T.Float32BufferAttribute(values,3));
    else{attr.array.set(values);attr.needsUpdate=true;}
  }
  for(const spar of a.spars){
    const outer=spar.name.endsWith('Outer');
    setRod(T,spar.node,structurePoint(p,pose,spar.name,0,0,.25,-.02),
      structurePoint(p,pose,spar.name,outer?1:0,1,.25,-.02));
  }
  for(const joint of a.joints)joint.node.position.set(...structurePoint(p,pose,joint.name,0,1,.25,-.02));
  for(const carriage of a.carriages){
    const inner=carriage.side+'Inner',outer=carriage.side+'Outer';
    const wrist=structurePoint(p,pose,inner,0,1,.25,-.02);
    const hand=structurePoint(p,pose,outer,0,0,.25,-.02);
    setRod(T,carriage.link,wrist,hand);carriage.bearing.position.set(...hand);
    const shoulder=structurePoint(p,pose,inner,0,0,.25,-.02);
    setRod(T,carriage.shoulder,[0,.8,carriage.side==='left'?-.25:.25],shoulder);
  }
}
