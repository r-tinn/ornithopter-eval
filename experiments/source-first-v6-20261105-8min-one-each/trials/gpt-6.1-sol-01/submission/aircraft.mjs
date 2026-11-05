import {makePanel,PANEL_NAMES,geometry,planform,chordFactor} from './environment/source-mechanism.mjs';
import {wingPose} from './kinematics.mjs';
import {E} from './environment/engineering.mjs';

// No textures or imported models: linen, tubular metal, plywood and leather.
export function createAircraft(T,p){
  const root=new T.Group();root.name='Tinn • experimental quick-return ornithopter';
  const a={root,wingPanels:{},wheels:[],T,p,ribs:[],spars:[],links:[],lowerRibs:[],wrists:[]};
  const mat=(color,roughness=.55,metalness=0)=>new T.MeshStandardMaterial({color,roughness,metalness});
  const M={
    fabric:new T.MeshStandardMaterial({color:0xe9dfbd,side:T.DoubleSide,roughness:.92,metalness:0}),
    leaf:new T.MeshStandardMaterial({color:0xd7cba5,side:T.DoubleSide,roughness:.88}),
    frame:mat(0x314a4b,.4,.65),steel:mat(0xb1b8b2,.3,.8),dark:mat(0x202c2f,.4,.6),
    brass:mat(0xc49b55,.32,.72),wood:mat(0x80583c,.7),pod:mat(0x164c50,.32,.35),
    cream:mat(0xe5d8b7,.65),rubber:mat(0x202626,.94),seat:mat(0x744936,.8),
    skin:mat(0xc98e67,.8),suit:mat(0x64736b,.9),pants:mat(0x625445,.93),
    visor:new T.MeshStandardMaterial({color:0x243e43,roughness:.18,metalness:.5}),
    glass:new T.MeshStandardMaterial({color:0x9dc7cb,transparent:true,opacity:.23,roughness:.16,metalness:.08,side:T.DoubleSide}),
    red:mat(0xa84930,.55),black:mat(0x11191b,.7)
  };
  a.materials=M;
  function mesh(g,m,parent=root,pos=[0,0,0]){
    const o=new T.Mesh(g,m);o.position.fromArray(pos);parent.add(o);return o;
  }
  function ellipsoid(pos,scale,m,parent=root){
    const o=mesh(new T.SphereGeometry(1,20,12),m,parent,pos);o.scale.fromArray(scale);return o;
  }
  function box(pos,size,m,parent=root){
    return mesh(new T.BoxGeometry(...size),m,parent,pos);
  }
  function rod(from,to,r,m,parent=root){
    const o=mesh(new T.CylinderGeometry(r,r,1,8),m,parent);
    setRod(o,from,to,T);return o;
  }
  function bolt(pos,r=.055,parent=root){
    const o=mesh(new T.CylinderGeometry(r,r,.075,6),M.brass,parent,pos);
    o.rotation.x=Math.PI/2;return o;
  }
  function disk(pos,r,width,m,parent=root){
    const o=mesh(new T.CylinderGeometry(r,r,width,24),m,parent,pos);
    o.rotation.x=Math.PI/2;return o;
  }
  for(const name of PANEL_NAMES){
    const group=new T.Group(),surface=new T.Group();
    group.name=name;surface.name=name+'Surface';root.add(group);group.add(surface);
    a[name]=group;a[name+'Surface']=surface;
    a.wingPanels[name]=[];
    for(let leaf=0;leaf<(name.endsWith('Outer')?2:1);leaf++){
      const panel=mesh(makePanel(T,p,name,leaf),leaf?M.leaf:M.fabric,surface);
      panel.name=name+' sliding fabric leaf '+leaf;
      a.wingPanels[name].push(panel);
    }
  }
  // A triangulated six-metre load path, not a solid cartoon bird body.
  const stations=[
    {x:2.25,y:-.55,w:.16},{x:1.35,y:-.55,w:.42},
    {x:.1,y:-.5,w:.44},{x:-1,y:-.38,w:.31},{x:-2.8,y:-.13,w:.1}
  ];
  for(let i=0;i<stations.length-1;i++){
    const b=stations[i],d=stations[i+1];
    for(const side of [-1,1]){
      rod([b.x,b.y,side*b.w],[d.x,d.y,side*d.w],.033,M.frame);
      rod([b.x,b.y+.58,side*b.w*.7],[d.x,d.y+.58,side*d.w*.7],.027,M.frame);
      rod([b.x,b.y,side*b.w],[d.x,d.y+.58,side*d.w*.7],.015,M.steel);
      rod([b.x,b.y+.58,side*b.w*.7],[d.x,d.y,side*d.w],.012,M.steel);
    }
    rod([b.x,b.y,-b.w],[b.x,b.y,b.w],.025,M.frame);
  }
  // Formed nose shell and cockpit sill, with an open cut-out above the seat.
  ellipsoid([1.4,-.49,0],[.98,.32,.43],M.pod);
  ellipsoid([2.15,-.43,0],[.32,.2,.25],M.cream);
  for(const side of [-1,1]){
    rod([1.75,-.25,side*.33],[.18,-.18,side*.41],.038,M.brass);
    rod([.18,-.18,side*.41],[-.25,.38,side*.28],.032,M.frame);
    rod([-.5,-.25,side*.3],[-.25,.78,side*.25],.035,M.frame);
    rod([-.25,.78,side*.25],[.25,.8,side*.25],.045,M.steel);
  }
  // Slender rear boom and conventional, long-arm tail.
  rod([-.8,.05,0],[-3.25,.03,0],.085,M.frame);
  for(const side of [-1,1])rod([-.4,-.45,side*.25],[-2.85,.06,0],.014,M.steel);
  const tailBase=ellipsoid([-2.8,.04,0],[.61,.045,1.05],M.cream);
  tailBase.rotation.z=E.coupled.tail_incidence_rad;
  rod([-2.64,.08,-1],[-2.64,.08,1],.026,M.frame);
  a.elevator=new T.Group();a.elevator.name='elevator';a.elevator.position.set(-3.05,.045,0);root.add(a.elevator);
  ellipsoid([-.15,0,0],[.26,.035,1],M.pod,a.elevator);
  // Rounded fin and rudder; their hinges are mechanically legible.
  ellipsoid([-2.73,.59,0],[.43,.67,.047],M.cream);
  rod([-3.0,.08,0],[-3.0,1.1,0],.021,M.frame);
  a.rudder=new T.Group();a.rudder.name='rudder';a.rudder.position.set(-3,.54,0);root.add(a.rudder);
  ellipsoid([-.18,.02,0],[.27,.55,.035],M.pod,a.rudder);
  for(const y of [.15,.55,.94])bolt([-3,y,.035],.035);
  for(const side of [-1,1])rod([-2.8,.08,side*.9],[-2.72,1.05,0],.009,M.steel);

  // Seat, adult pilot and controls: knees and hands point forward (+x).
  const seat=box([.35,-.25,0],[.65,.12,.55],M.seat);
  const back=box([.01,.09,0],[.12,.65,.57],M.seat);back.rotation.z=-.12;
  a.pilot=new T.Group();a.pilot.name='pilot';root.add(a.pilot);
  const pilot=a.pilot;
  ellipsoid([.42,.14,0],[.24,.39,.235],M.suit,pilot);
  ellipsoid([.58,-.18,0],[.29,.16,.24],M.pants,pilot);
  // Neck, face, ears, nose, helmet, goggles and chin strap.
  rod([.48,.45,0],[.5,.61,0],.085,M.skin,pilot);
  ellipsoid([.52,.76,0],[.155,.205,.15],M.skin,pilot);
  const helmet=ellipsoid([.5,.84,0],[.178,.17,.169],M.cream,pilot);
  ellipsoid([.67,.75,0],[.047,.049,.045],M.skin,pilot);
  for(const side of [-1,1]){
    ellipsoid([.52,.75,side*.148],[.045,.065,.027],M.skin,pilot);
    ellipsoid([.651,.82,side*.066],[.045,.049,.058],M.visor,pilot);
    rod([.56,.85,side*.15],[.54,.61,side*.08],.012,M.seat,pilot);
  }
  rod([.662,.822,-.025],[.662,.822,.025],.013,M.brass,pilot);
  for(const side of [-1,1]){
    const hip=[.62,-.19,side*.16],knee=[1.05,-.34,side*.21],ankle=[1.35,-.67,side*.21];
    rod(hip,knee,.105,M.pants,pilot);ellipsoid(knee,[.11,.11,.11],M.pants,pilot);
    rod(knee,ankle,.079,M.pants,pilot);
    ellipsoid([1.45,-.7,side*.21],[.19,.085,.094],M.dark,pilot);
    const shoulder=[.45,.36,side*.22],elbow=[.78,.08,side*.31],hand=[1.02,.02,side*.23];
    rod(shoulder,elbow,.071,M.suit,pilot);rod(elbow,hand,.056,M.suit,pilot);
    ellipsoid(hand,[.075,.052,.051],M.skin,pilot);
    rod([.2,.41,side*.19],[.61,-.11,-side*.13],.024,M.black,pilot);
    rod([1.27,-.65,side*.21],[1.48,-.57,side*.21],.024,M.steel);
  }
  box([.7,-.08,0],[.045,.08,.1],M.brass,pilot);
  rod([.95,-.43,0],[1.04,.05,0],.022,M.dark);
  rod([1.04,.05,-.24],[1.04,.05,.24],.025,M.seat);
  const dash=box([1.43,-.05,0],[.08,.29,.53],M.wood);dash.rotation.z=-.15;
  for(const z of [-.16,0,.16]){
    const d=mesh(new T.CylinderGeometry(.066,.066,.012,20),M.black,root,[1.377,-.025,z]);d.rotation.z=Math.PI/2;
    const ring=mesh(new T.TorusGeometry(.067,.007,6,20),M.brass,root,[1.367,-.025,z]);ring.rotation.y=Math.PI/2;
    rod([1.352,-.025,z],[1.352,.013,z+.022],.004,M.cream);
  }
  // Low, curved windscreen with brass beading.
  const screen=mesh(new T.SphereGeometry(1,20,12,0,Math.PI,0,Math.PI/2),M.glass,root,[1.37,.02,0]);
  screen.scale.set(.34,.43,.43);screen.rotation.y=Math.PI/2;
  rod([1.42,.01,-.4],[1.42,.32,-.25],.013,M.brass);
  rod([1.42,.01,.4],[1.42,.32,.25],.013,M.brass);

  // A compact single-cylinder engine, finned barrel, exhaust, tank and reduction.
  box([-.79,.05,0],[.53,.37,.47],M.dark);
  disk([-.79,.08,.27],.19,.07,M.steel);
  const barrel=mesh(new T.CylinderGeometry(.14,.16,.36,12),M.steel,root,[-.85,.35,0]);barrel.rotation.z=.2;
  for(let i=0;i<7;i++){
    const fin=mesh(new T.CylinderGeometry(.19,.19,.018,12),M.dark,root,[-.85+.01*i,.2+i*.045,0]);fin.rotation.z=.2;
  }
  rod([-.79,.49,0],[-.79,.59,0],.018,M.cream);
  rod([-.79,.59,0],[-.42,.39,.1],.012,M.black);
  rod([-.93,.31,-.17],[-1.27,.18,-.33],.04,M.steel);
  rod([-1.27,.18,-.33],[-1.45,-.23,-.34],.045,M.dark);
  const exhaust=mesh(new T.CylinderGeometry(.085,.085,.51,12),M.steel,root,[-1.39,-.22,-.34]);exhaust.rotation.z=Math.PI/2;
  ellipsoid([-.65,-.43,0],[.4,.18,.28],M.cream);
  bolt([-.65,-.25,0],.05);
  rod([-.65,-.26,.12],[-.73,.17,.19],.014,M.black);
  box([-.32,.42,0],[.39,.33,.4],M.frame);
  for(const z of [-.24,.24]){
    disk([-.3,.49,z],.23,.055,M.brass);
    disk([-.3,.49,z*1.15],.15,.02,M.dark);
    for(let i=0;i<12;i++){
      const t=i*Math.PI/6;
      bolt([-.3+.185*Math.cos(t),.49+.185*Math.sin(t),z*1.19],.017);
    }
  }
  a.crank=new T.Group();a.crank.position.set(-.3,.49,.29);root.add(a.crank);
  rod([0,0,0],[.16,0,0],.035,M.steel,a.crank);bolt([.16,0,.02],.04,a.crank);
  rod([-.3,.49,-.29],[-.3,.49,.29],.05,M.steel);
  // Visible opposed spring packs, not an energy source.
  for(const side of [-1,1]){
    rod([-.6,.64,side*.24],[.12,.68,side*.24],.045,M.dark);
    for(let i=0;i<13;i++){
      const ring=mesh(new T.TorusGeometry(.064,.009,5,10),M.steel,root,[-.6+i*.055,.64+i*.003,side*.24]);
      ring.rotation.y=Math.PI/2;
    }
    disk([0,.8,side*.26],.13,.11,M.brass);
    bolt([0,.8,side*.34],.075);
    a.links.push(rod([-.3,.65,side*.28],[0,.8,side*.34],.022,M.steel));
  }
  // Gear: actual toroidal tyres are in XY, so their rolling axle is always Z.
  for(const [i,g] of p.gear_centres.entries()){
    const tyre=mesh(new T.TorusGeometry(p.wheel_radius_m-.055,.055,10,28),M.rubber,root,g);
    tyre.name=['nose tyre','port main tyre','starboard main tyre'][i];
    a.wheels.push(tyre);
    disk([0,0,0],.13,.11,M.steel,tyre);
    disk([0,0,.064],.055,.035,M.brass,tyre);
    for(let j=0;j<6;j++){
      const t=j*Math.PI/3;
      rod([.04*Math.cos(t),.04*Math.sin(t),.063],[.135*Math.cos(t),.135*Math.sin(t),.063],.009,M.dark,tyre);
    }
    const mount=i===0?[1.75,-.42,0]:[-.2,-.37,Math.sign(g[2])*.34];
    rod(mount,[g[0],g[1]+.09,g[2]],.038,M.steel);
    rod([i===0?1.3:.45,-.5,i===0?0:Math.sign(g[2])*.3],g,.022,M.frame);
    if(i>0)rod([-.9,-.35,Math.sign(g[2])*.25],g,.022,M.frame);
    bolt([g[0],g[1],g[2]+.1],.048);
  }
  // Source-coordinate ribs and spars follow the curved/sliding surfaces.
  for(let i=0;i<16;i++){
    a.ribs.push([rod([0,0,0],[0,1,0],.013,M.wood),rod([0,0,0],[0,1,0],.013,M.wood)]);
  }
  // The inner arm has a deep structural section; the outer leaves stay thin.
  for(let i=0;i<8;i++){
    a.lowerRibs.push([
      rod([0,0,0],[0,1,0],.011,M.wood),
      rod([0,0,0],[0,1,0],.011,M.wood),
      rod([0,0,0],[0,1,0],.009,M.frame)
    ]);
  }
  for(const side of [-1,1]){
    const hub=mesh(new T.CylinderGeometry(.105,.105,.14,12),M.brass);
    hub.rotation.z=Math.PI/2;
    a.wrists.push({
      side,hub,
      rail:rod([0,0,0],[1,0,0],.038,M.steel),
      spar:rod([0,0,0],[1,0,0],.032,M.frame),
      actuator:rod([0,0,0],[1,0,0],.018,M.steel)
    });
  }
  for(let i=0;i<12;i++)a.spars.push(rod([0,0,0],[0,1,0],.022,M.frame));
  // Small inspection markings rendered as geometry, never as extra scenery.
  for(const side of [-1,1]){
    box([1.72,-.38,side*.382],[.27,.035,.008],M.brass);
    for(let i=0;i<4;i++)box([1.63+i*.055,-.42,side*.39],[.022,.035,.009],M.cream);
  }
  return a;
}

function setRod(o,from,to,T){
  const start=new T.Vector3(...from),end=new T.Vector3(...to),d=end.clone().sub(start);
  const length=d.length();
  o.position.copy(start).add(end).multiplyScalar(.5);
  o.scale.set(1,Math.max(1e-6,length),1);
  if(length>1e-8)o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.multiplyScalar(1/length));
}

export function updateAircraft(a,s,c){
  const {T,p}=a,pose=wingPose(s);
  for(const wheel of a.wheels)wheel.rotation.set(0,0,s.wheel_angle??0);
  a.rudder.rotation.y=-(c.rudder??0)*.4;
  a.elevator.rotation.z=-(c.pitch??0)*.22;
  a.crank.rotation.z=s.phase;
  for(let i=0;i<2;i++){
    const side=i===0?-1:1,v=pose[side<0?'leftInner':'rightInner'];
    setRod(a.links[i],[-.3,.49+.16*Math.sin(s.phase),side*.29],
      [v.sweep,.8+.18*Math.sin(v.stroke),side*(.28+.18*Math.cos(v.stroke))],T);
  }
  const geo=geometry(p,pose),g=planform(p);
  for(const w of a.wrists){
    const inner=pose[w.side<0?'leftInner':'rightInner'],outer=pose[w.side<0?'leftOuter':'rightOuter'];
    const root=[inner.sweep,.8,w.side*g.hinge];
    const wrist=[inner.sweep,.8+g.inner*Math.sin(inner.stroke),w.side*(g.hinge+g.inner*Math.cos(inner.stroke))];
    const slide=[outer.sweep,wrist[1],wrist[2]];
    w.hub.position.fromArray(slide);
    setRod(w.spar,root,wrist,T);
    setRod(w.rail,wrist,slide.map((x,i)=>x+(i===0?.14:0)),T);
    setRod(w.actuator,[inner.sweep,.84,w.side*.34],
      [wrist[0],wrist[1]-.075,wrist[2]],T);
  }
  const prev={};let si=0,li=0;
  for(let i=0;i<geo.samples.length;i++){
    const v=geo.samples[i],outer=v.region==='outer';
    const t=outer?v.leaf*.5+v.t*.5:0;
    const j=Math.min(3,Math.floor(t*4)),ta=j/4,tb=(j+1)/4;
    const chord=outer?g.chord*(chordFactor(ta)+(chordFactor(tb)-chordFactor(ta))*(t-ta)/(tb-ta)):g.chord;
    function point(u){
      return v.point.map((x,k)=>x+(.25-u)*chord*v.chord[k]+(4*u*(1-u)-.75)*chord*v.camber*v.normal[k]);
    }
    const le=point(0),mid=point(.5),te=point(1);
    setRod(a.ribs[i][0],le,mid,T);setRod(a.ribs[i][1],mid,te,T);
    if(!outer){
      const lower=mid.map((x,k)=>x-E.wing.inner_thickness_fraction*chord*v.normal[k]);
      setRod(a.lowerRibs[li][0],le,lower,T);
      setRod(a.lowerRibs[li][1],lower,te,T);
      setRod(a.lowerRibs[li][2],lower,mid,T);li++;
    }
    const key=v.name+v.leaf;
    const spar=point(.2);
    if(prev[key]&&si<a.spars.length)setRod(a.spars[si++],prev[key],spar,T);
    prev[key]=spar;
  }
  for(let i=si;i<a.spars.length;i++)a.spars[i].visible=false;
  for(let i=0;i<si;i++)a.spars[i].visible=true;
}
