import {E} from './environment/engineering.mjs';
import {wingPose} from './kinematics.mjs';
import {makePanel,planform,chordFactor,PANEL_NAMES} from './environment/source-mechanism.mjs';

// All articulated structure uses material coordinates on the production leaves.
function wingPoint(p,pose,name,leaf,t,u,offset=0){
  const g=planform(p),outer=name.endsWith('Outer'),side=name.startsWith('left')?-1:1;
  const v=pose[name],inn=pose[side<0?'leftInner':'rightInner'];
  const mt=outer?(leaf+t)/2:t;
  const j=Math.min(3,Math.floor(mt*4)),a=j/4,b=(j+1)/4;
  const chord=outer?g.chord*(chordFactor(a)+(chordFactor(b)-chordFactor(a))*(mt-a)/(b-a)):g.chord;
  const r=outer?g.outer*(leaf===0?t/2:v.exposure-.5+t/2):g.inner*t;
  const angle=inn.stroke+(outer?v.stroke:0),ct=Math.cos(v.twist),st=Math.sin(v.twist),cs=Math.cos(angle),sn=Math.sin(angle);
  const x=(.25-u)*chord,y=4*u*(1-u)*chord*v.camber-(outer&&leaf===1?.008:0)+offset;
  const xx=x*ct-y*st,yy=x*st+y*ct;
  return [xx+v.sweep,E.wing.root_height_m+(outer?g.inner*Math.sin(inn.stroke):0)+r*sn+yy*cs,
    side*(g.hinge+(outer?g.inner*Math.cos(inn.stroke):0)+r*cs-yy*sn)];
}
export function createAircraft(T,p){
  const root=new T.Group();root.name='S14 — elastic-drive research ornithopter';
  const a={root,wheels:[],wingPanels:{},members:[],cranks:[],p};
  const mat=(color,metalness=0,roughness=.6)=>new T.MeshStandardMaterial({color,metalness,roughness});
  const M={
    frame:mat(0x234b49,.65,.36),carbon:mat(0x263134,.35,.45),silver:mat(0xc7c9bd,.8,.28),
    brass:mat(0xba8a4c,.75,.32),rubber:mat(0x202629,0,.91),leather:mat(0x593a2e,0,.9),
    suit:mat(0xc87943,0,.85),skin:mat(0xc89b7b,0,.8),helmet:mat(0xeee5cb,.12,.4),
    visor:mat(0x28484e,.5,.22),dark:mat(0x18292c,.4,.48),
    fabric:new T.MeshStandardMaterial({color:0xe9dfbd,side:T.DoubleSide,roughness:.88,metalness:0}),
    outerFabric:new T.MeshStandardMaterial({color:0xd4d2b0,side:T.DoubleSide,roughness:.82,metalness:0}),
    tail:new T.MeshStandardMaterial({color:0x37605a,side:T.DoubleSide,roughness:.68}),
    red:mat(0xab4a32,.1,.6)
  };
  a.materials=M;
  function mesh(geo,material,parent=root,pos=[0,0,0]){
    const m=new T.Mesh(geo,material);m.position.set(...pos);parent.add(m);return m;
  }
  function box(pos,size,material,parent=root){
    return mesh(new T.BoxGeometry(...size),material,parent,pos);
  }
  function ball(pos,scale,material,parent=root){
    const m=mesh(new T.SphereGeometry(1,12,8),material,parent,pos);m.scale.set(...scale);return m;
  }
  function placeRod(m,start,end){
    const v=new T.Vector3(...end).sub(new T.Vector3(...start));
    m.position.set(...start).addScaledVector(v,.5);m.scale.set(1,v.length(),1);
    if(v.length()>1e-9)m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());
  }
  function rod(start,end,r,material,parent=root){
    const m=mesh(new T.CylinderGeometry(r,r,1,8),material,parent);
    placeRod(m,start,end);return m;
  }
  a.placeRod=placeRod;
  function cylinder(pos,r,length,material,axis='z',parent=root){
    const m=mesh(new T.CylinderGeometry(r,r,length,20),material,parent,pos);
    if(axis==='z')m.rotation.x=Math.PI/2;
    if(axis==='x')m.rotation.z=Math.PI/2;
    return m;
  }
  // Tapered open Warren-truss keel, with a continuous readable load path.
  const stations=[[-3.05,-.15,.05],[-1.8,-.32,.19],[-.55,-.48,.36],[.75,-.55,.4],[2.35,-.65,.22],[2.85,-.53,.06]];
  for(let i=0;i<stations.length-1;i++){
    const [x,y,z]=stations[i],[xx,yy,zz]=stations[i+1];
    for(const side of [-1,1]){
      rod([x,y,side*z],[xx,yy,side*zz],.035,M.frame);
      rod([x,y+.45,side*z],[xx,yy+.45,side*zz],.026,M.frame);
      rod([x,y,side*z],[xx,yy+.45,side*zz],.018,M.silver);
      rod([x,y+.45,side*z],[x,y,side*z],.022,M.frame);
    }
    rod([x,y,-z],[x,y,z],.023,M.frame);
  }
  // A narrow streamlined nose tray, not an opaque box around the pilot.
  ball([2.18,-.48,0],[.65,.19,.28],M.frame);
  box([1.15,-.59,0],[1.8,.065,.65],M.carbon);
  for(const z of [-.4,.4]){
    rod([-.5,-.2,z],[.02,.81,z*.62],.055,M.frame);
    rod([.8,-.4,z],[.02,.81,z*.62],.045,M.frame);
  }
  cylinder([0,.8,0],.13,.68,M.silver);
  for(const z of [-.26,.26]){
    cylinder([0,.8,z],.19,.075,M.brass);
    cylinder([0,.8,z*1.26],.08,.1,M.dark);
    // Visible coil packs beside the central rocker axle.
    for(let i=0;i<9;i++){
      const ring=mesh(new T.TorusGeometry(.12,.018,6,16),M.silver,root,[0,.8,z+(i-4)*.025]);
      ring.name='torsion spring winding';
    }
  }
  // Engine, cooling head, exhaust, fuel tank and guarded reduction drive.
  box([-.82,-.02,0],[.65,.48,.49],M.dark);
  cylinder([-.77,.3,0],.19,.42,M.silver,'y');
  for(let i=0;i<7;i++)box([-.77,.16+i*.045,0],[.43,.018,.43],M.carbon);
  cylinder([-1.12,-.03,.3],.065,.35,M.brass,'y');
  rod([-1.12,-.18,.3],[-1.65,-.24,.3],.055,M.dark);
  cylinder([-1.57,-.24,.3],.09,.42,M.silver,'x');
  ball([-1.35,-.16,0],[.38,.23,.28],M.frame);
  box([-.98,.02,-.31],[.2,.24,.12],M.red);
  for(const [x,y,r] of [[-.57,.1,.2],[0,.56,.28]]){
    const disc=cylinder([x,y,.32],r,.055,M.brass);
    const crank=new T.Group();crank.position.set(x,y,.36);root.add(crank);
    rod([0,0,0],[r*.7,0,0],.035,M.silver,crank);
    cylinder([r*.7,0,0],.05,.08,M.dark,'z',crank);
    a.cranks.push(crank);
    disc.name='reduction pulley';
  }
  for(const z of [.28,.37]){
    rod([-.74,.13,z],[-.22,.74,z],.017,M.rubber);
    rod([-.4,-.03,z],[.22,.41,z],.017,M.rubber);
  }
  // Three-wheel undercarriage: torus normals and true spin axes are lateral z.
  for(const [i,g] of p.gear_centres.entries()){
    const tyre=mesh(new T.TorusGeometry(p.wheel_radius_m-.055,.055,8,28),M.rubber,root,g);
    tyre.name=['nose tyre','port main tyre','starboard main tyre'][i];a.wheels.push(tyre);
    cylinder([0,0,0],.075,.14,M.brass,'z',tyre);
    for(let j=0;j<8;j++){
      const q=j*Math.PI/4;
      rod([.06*Math.cos(q),.06*Math.sin(q),0],[.17*Math.cos(q),.17*Math.sin(q),0],.009,M.silver,tyre);
    }
    const mount=i===0?[1.83,-.43,0]:[-.43,-.3,Math.sign(g[2])*.34];
    rod(mount,g,.032,M.silver);
    rod([i===0?2.4:.5,-.5,i===0?0:Math.sign(g[2])*.3],g,.024,M.frame);
    rod([g[0],g[1],g[2]-.12],[g[0],g[1],g[2]+.12],.025,M.brass);
  }
  // Conventional long-arm tail; controls hinge at their actual trailing edges.
  const tail=mesh(new T.SphereGeometry(1,16,8),M.tail,root,[-2.6,.02,0]);
  tail.scale.set(.49,.045,1.22);tail.rotation.z=E.coupled.tail_incidence_rad;
  const elevator=new T.Group();elevator.name='elevator';elevator.position.set(-2.78,.025,0);root.add(elevator);a.elevator=elevator;
  const elev=ball([-.22,0,0],[.28,.027,1.12],M.helmet,elevator);
  const fin=ball([-2.68,.44,0],[.38,.61,.035],M.tail);fin.rotation.z=-.2;
  const rudder=new T.Group();rudder.name='rudder';rudder.position.set(-2.87,.43,0);root.add(rudder);a.rudder=rudder;
  ball([-.12,0,0],[.22,.5,.028],M.helmet,rudder);
  rod([-1.05,-.22,-.14],[-2.9,.02,-.65],.008,M.silver);
  rod([-1.05,-.22,.14],[-2.9,.02,.65],.008,M.silver);
  // Seated adult: pelvis, separate bent legs, boots, torso, arms, gloves, helmet.
  const pilot=new T.Group();pilot.name='pilot';pilot.userData.description='55 kg seated adult';root.add(pilot);a.pilot=pilot;
  box([.91,-.26,0],[.55,.12,.49],M.leather);
  const back=box([.64,.03,0],[.12,.57,.49],M.leather);back.rotation.z=.18;
  ball([.99,-.13,0],[.23,.18,.22],M.suit,pilot);
  const torso=ball([.92,.18,0],[.2,.34,.25],M.suit,pilot);torso.rotation.z=.12;
  rod([.8,.41,-.15],[1.08,-.12,.15],.025,M.dark,pilot);
  rod([.8,.41,.15],[1.08,-.12,-.15],.025,M.dark,pilot);
  box([1.1,.05,0],[.035,.07,.12],M.silver,pilot);
  cylinder([.91,.53,0],.065,.14,M.skin,'y',pilot);
  ball([.94,.7,0],[.13,.17,.125],M.skin,pilot);
  ball([.91,.76,0],[.155,.145,.15],M.helmet,pilot);
  ball([1.055,.735,0],[.05,.069,.118],M.visor,pilot);
  rod([.98,.61,-.1],[1.01,.59,.1],.012,M.dark,pilot);
  for(const side of [-1,1]){
    const z=side*.17;
    rod([1.02,-.18,z],[1.55,-.35,z],.105,M.suit,pilot);
    ball([1.55,-.35,z],[.11,.105,.1],M.suit,pilot);
    rod([1.55,-.35,z],[1.81,-.76,z],.075,M.suit,pilot);
    ball([1.94,-.8,z],[.22,.095,.095],M.dark,pilot);
    const zs=side*.25;
    ball([.91,.37,zs],[.1,.1,.1],M.suit,pilot);
    rod([.91,.37,zs],[1.14,.11,zs*1.15],.069,M.suit,pilot);
    rod([1.14,.11,zs*1.15],[1.43,.12,zs*.65],.055,M.suit,pilot);
    ball([1.43,.12,zs*.65],[.07,.06,.06],M.leather,pilot);
    rod([1.8,-.9,z],[2.03,-.9,z],.022,M.silver);
  }
  // Stick, instrument binnacle, four visible instruments and throttle quadrant.
  rod([1.2,-.48,0],[1.43,.1,0],.018,M.silver);
  rod([1.43,.1,-.18],[1.43,.1,.18],.025,M.dark);
  const panel=box([1.78,.04,0],[.08,.28,.49],M.frame);panel.rotation.z=-.2;
  for(let i=0;i<4;i++){
    cylinder([1.729,.03+(i%2)*.115,(Math.floor(i/2)-.5)*.2],.043,.018,M.helmet,'x');
    rod([1.716,.04+(i%2)*.115,(Math.floor(i/2)-.5)*.2],[1.715,.065+(i%2)*.115,(Math.floor(i/2)-.5)*.2+.018],.004,M.dark);
  }
  rod([.98,-.18,-.4],[1.12,.05,-.4],.015,M.silver);
  ball([1.12,.05,-.4],[.035,.035,.035],M.red);
  // Production wing surfaces stay identity-mounted; only their vertices move.
  for(const name of PANEL_NAMES){
    const group=new T.Group(),surface=new T.Group();
    group.name=name;surface.name=name+'Surface';root.add(group);group.add(surface);
    a[name]=group;a[name+'Surface']=surface;a.wingPanels[name]=[];
    const outer=name.endsWith('Outer');
    for(let leaf=0;leaf<(outer?2:1);leaf++){
      const skin=mesh(makePanel(T,p,name,leaf),outer?M.outerFabric:M.fabric,surface);
      skin.name=name+' rigid fabric leaf '+leaf;a.wingPanels[name].push(skin);
      function linked(t0,u0,t1,u1,r,material,off=0){
        const member=rod([0,0,0],[0,1,0],r,material,group);
        a.members.push({member,name,leaf,t0,u0,t1,u1,off});
      }
      // Thin outer battens; deeper inner ribs communicate the distinct sections.
      for(const u of [.08,.32,.94])for(let j=0;j<4;j++)
        linked(j/4,u,(j+1)/4,u,u===.32?.023:.012,u===.32?M.frame:M.brass);
      for(let j=0;j<=4;j++){
        const t=j/4;
        linked(t,0,t,.5,.011,M.silver);
        linked(t,.5,t,1,.009,M.silver);
        if(!outer){
          linked(t,.08,t,.85,.01,M.frame,-.055);
          linked(t,.08,t,.32,.008,M.silver,-.025);
        }
      }
      linked(0,.12,1,.85,.006,M.carbon);
    }
  }
  a.linkages=[];
  for(const side of [-1,1]){
    const name=side<0?'leftInner':'rightInner';
    for(const z of [.13,.4]){
      const member=rod([0,0,0],[0,1,0],.027,M.brass);
      a.linkages.push({member,name,start:[.02,.35,side*z]});
    }
  }
  updateAircraft(a,{phase:0,omega:0,gliding:false,timing_bias:.3,wheel_angle:0}, {});
  return a;
}
export function updateAircraft(a,s,c={}){
  const pose=wingPose(s);
  for(const wheel of a.wheels)wheel.rotation.set(0,0,-(s.wheel_angle??0));
  a.rudder.rotation.y=-(c.rudder??0)*.4;
  a.elevator.rotation.z=-(c.pitch??0)*.25;
  for(const [i,crank] of a.cranks.entries())crank.rotation.z=s.phase*(i===0?3:1);
  for(const v of a.members){
    a.placeRod(v.member,wingPoint(a.p,pose,v.name,v.leaf,v.t0,v.u0,v.off),
      wingPoint(a.p,pose,v.name,v.leaf,v.t1,v.u1,v.off));
  }
  for(const v of a.linkages)a.placeRod(v.member,v.start,wingPoint(a.p,pose,v.name,0,.14,.3,-.04));
}
