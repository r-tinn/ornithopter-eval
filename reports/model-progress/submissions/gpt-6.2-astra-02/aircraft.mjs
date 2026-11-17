import {E} from './environment/engineering.mjs';
import {PANEL_NAMES,makePanel,planform,mountWingPose} from './environment/source-mechanism.mjs';
import {wingPose} from './kinematics.mjs';

const tau=2*Math.PI;
const mix=(a,b,t)=>a.map((x,i)=>x+(b[i]-x)*t);

// All the markings are made here: lapped panels, rib tapes, stitching and
// inspection stencils measured in the same material coordinates as the sail.
function textile(T,left){
  const material=new T.MeshStandardMaterial({color:0xf0d8a1,roughness:.88,side:T.DoubleSide});
  if(typeof document==='undefined')return material;
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=384;
  const g=canvas.getContext('2d');if(!g)return material;
  const W=canvas.width,H=canvas.height,grad=g.createLinearGradient(0,0,0,H);
  grad.addColorStop(0,'#c6ae83');grad.addColorStop(.18,'#f3e5c4');grad.addColorStop(.58,'#ead8af');grad.addColorStop(1,'#d2bc92');
  g.fillStyle=grad;g.fillRect(0,0,W,H);
  const poly=(pts,color)=>{g.fillStyle=color;g.beginPath();pts.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();g.fill();};
  // A fine herringbone highlight in the woven cover, not a moving screen effect.
  g.strokeStyle='rgba(255,251,215,.12)';g.lineWidth=.7;g.beginPath();
  for(let x=-H;x<W;x+=5){g.moveTo(x,0);g.lineTo(x+H,H);}g.stroke();
  poly([[0,0],[W,0],[W,H],[961,H],[933,62],[0,29]],'#214b50');
  poly([[914,0],[938,0],[965,H],[944,H]],'#bc5736');
  poly([[900,0],[906,0],[936,H],[930,H]],'#ad8358');
  g.fillStyle='#a9714a';g.fillRect(0,H-4,W,4);
  for(let i=0;i<=24;i++){
    let x=1024*i/24;
    g.fillStyle='rgba(79,58,41,.19)';g.fillRect(x-2,0,5,H);
    g.fillStyle='rgba(255,249,219,.43)';g.fillRect(x,0,2,H);
    g.setLineDash([3,5]);g.strokeStyle='rgba(80,66,46,.34)';g.beginPath();g.moveTo(x+3,0);g.lineTo(x+3,H);g.stroke();g.setLineDash([]);
  }
  g.save();g.translate(313,237);g.scale(left?-1:1,2.2);g.textAlign='center';g.fillStyle='#334d4b';
  g.font='bold 31px sans-serif';g.fillText('F E N   0 2',0,0);g.font='8px sans-serif';g.fillText('S U R V E Y    •    E X P E R I M E N T A L',0,15);g.restore();
  const tex=new T.CanvasTexture(canvas);tex.flipY=false;tex.colorSpace=T.SRGBColorSpace;
  tex.anisotropy=4;material.map=tex;material.color.setHex(0xffffff);return material;
}

export function createAircraft(T,p){
  const root=new T.Group();root.name='Fen S-02 • articulated field aircraft';
  const a={root,wheels:[],wingPanels:{},T,p};
  const group=(par,name,xyz=[0,0,0])=>{const g=new T.Group();g.name=name;g.position.set(...xyz);par.add(g);return g;};
  const mat=(color,metalness=0,roughness=.58,extras={})=>new T.MeshStandardMaterial({color,metalness,roughness,...extras});
  const m={
    enamel:mat(0x16464b,.32,.35), dark:mat(0x18272c,.45), tubing:mat(0x436165,.55,.35),
    alu:mat(0xa4b4b1,.68,.34), brass:mat(0xb58242,.58,.32), red:mat(0xbb512f,.25,.4),
    cream:mat(0xe8d8ae,.1), rubber:mat(0x212323,.03,.94),seat:mat(0x784833,0,.82),
    skin:mat(0xb87953),suit:mat(0x52716b),trousers:mat(0x394c50),visor:mat(0x293f4b,.51,.19),
    glass:mat(0xbcd8ce,.18,.17,{transparent:true,opacity:.26,side:T.DoubleSide,depthWrite:false})
  };
  const mesh=(par,geom,material,pos=[0,0,0],name='')=>{
    const obj=new T.Mesh(geom,material);obj.position.set(...pos);obj.name=name;par.add(obj);return obj;
  };
  const vec=arr=>new T.Vector3(...arr),up=vec([0,1,0]);
  const rod=(par,A,B,r,material,rTop=r,N=9)=>{
    const ab=vec(B).sub(vec(A)),len=ab.length();
    const o=mesh(par,new T.CylinderGeometry(rTop,r,len,N),material,mix(A,B,.5));
    if(len)o.quaternion.setFromUnitVectors(up,ab.divideScalar(len));return o;
  };
  const ball=(par,pos,scale,material)=>{
    const o=mesh(par,new T.SphereGeometry(1,16,12),material,pos);o.scale.set(...scale);return o;
  };
  const box=(par,pos,size,material)=>mesh(par,new T.BoxGeometry(...size),material,pos);
  const ring=(par,pos,major,minor,material,segs=40)=>mesh(par,new T.TorusGeometry(major,minor,8,segs),material,pos);
  function skin(par,positions,indices,material,colors){
    const geo=new T.BufferGeometry();
    geo.setAttribute('position',new T.Float32BufferAttribute(positions.flat(),3));geo.setIndex(indices);
    if(colors)geo.setAttribute('color',new T.Float32BufferAttribute(colors.flat(),3));
    geo.computeVertexNormals();return mesh(par,geo,material);
  }
  const kit={T,a,p,root,m,group,mat,mesh,rod,ball,box,ring,skin};
  const chassis=group(root,'Riveted launch nacelle and triangulated boom');
  buildHull(kit,chassis);buildPilot(kit,chassis);buildTail(kit,chassis);
  buildGear(kit,chassis);buildDrive(kit,chassis);buildWings(kit);
  // Static fabrication is batched by finish; animated assemblies and all
  // material-coordinate production surfaces remain separate from the frame.
  for(const g of [chassis,a.pilot,a.elevator,a.rudder,...a.wheels])batchChildren(T,g);
  const parked={phase:E.wing.parked_phase_rad,gliding:false,wheel_angle:0};
  mountWingPose(a,wingPose(parked),p);updateAircraft(a,parked,{});
  return a;
}

function batchChildren(T,group){
  const by=new Map();
  for(const o of group.children.slice())if(o.isMesh&&!o.material.transparent){
    const list=by.get(o.material)||[];list.push(o);by.set(o.material,list);
  }
  for(const [mat,list] of by){
    if(list.length<3 || list.some(o=>o.geometry.attributes.color || o.geometry.attributes.uv&&mat.map))continue;
    const pos=[],nor=[],idx=[];
    for(const o of list){
      o.updateMatrix();const geo=o.geometry.clone();geo.applyMatrix4(o.matrix);
      const v=geo.attributes.position,n=geo.attributes.normal,base=pos.length/3;
      for(let i=0;i<v.count;i++){pos.push(v.getX(i),v.getY(i),v.getZ(i));nor.push(n.getX(i),n.getY(i),n.getZ(i));}
      if(geo.index){for(const i of geo.index.array)idx.push(i+base);}else for(let i=0;i<v.count;i++)idx.push(base+i);
      group.remove(o);geo.dispose();o.geometry.dispose();
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
    g.setAttribute('normal',new T.Float32BufferAttribute(nor,3));g.setIndex(idx);group.add(new T.Mesh(g,mat));
  }
}

function buildHull({T,m,mat,mesh,ball,box,rod,skin},g){
  // Open, rolled cockpit edge. Each station describes the remaining arc of
  // shell, so the panel lip wraps around the actual opening, not a black decal.
  const stations=[
    [-1.47,-.38,.04,.06,0],[-1.32,-.39,.21,.23,0],[-.99,-.4,.32,.32,.62],
    [-.45,-.4,.36,.39,1.06],[-.06,-.4,.37,.45,1.16],[.38,-.39,.385,.47,1.17],
    [.82,-.4,.39,.47,1.22],[1.23,-.41,.37,.46,1.15],[1.53,-.42,.34,.44,.88],
    [1.69,-.4,.32,.41,.27],[1.75,-.395,.32,.397,0],[1.98,-.38,.28,.34,0],
    [2.22,-.355,.21,.245,0],[2.45,-.345,.11,.133,0],[2.56,-.34,.012,.018,0]];
  const pts=[],idx=[],cols=[],N=40,edge=[[],[]];
  for(let i=0;i<stations.length;i++){
    const [x,y,rz,ry,cut]=stations[i];
    for(let j=0;j<=N;j++){
      const t=cut+(tau-2*cut)*j/N,cs=Math.cos(t),z=rz*Math.sin(t);
      const pos=[x,y+ry*cs,z];pts.push(pos);
      const color=new T.Color(x>2.45?0xc16843:cs>.34?0x296065:cs>.20?0xc39c66:cs>-.48?0x16474c:0x223a40);
      cols.push(color.toArray());
      if(j===0 || j===N)edge[+(j===N)].push(pos);
      if(i && j){const a=i*(N+1)+j;idx.push(a-N-2,a-1,a,a-N-2,a,a-N-1);}
    }
  }
  skin(g,pts,idx,mat(0xffffff,.28,.38,{vertexColors:true,side:T.DoubleSide}),cols);
  for(const run of edge)for(let i=2;i<=10;i++)rod(g,run[i-1],run[i],.018,m.seat);
  // Flush inspection panel on each cheek. Interpolate the loft stations
  // so the name and fasteners sit on the blister rather than floating on a
  // rectangle. The tiny print identifies the machine, not the source bird.
  function cheek(x,y,s,clearance=.004){
    const i=stations.findIndex(st=>st[0]>=x),st=mix(stations[i-1],stations[i],(x-stations[i-1][0])/(stations[i][0]-stations[i-1][0]));
    return [x,y,s*(st[2]*Math.sqrt(Math.max(0,1-((y-st[1])/st[3])**2))+clearance)];
  }
  let nameplate;
  if(typeof document!=='undefined'){
    const c=document.createElement('canvas');c.width=512;c.height=112;const d=c.getContext('2d');
    if(d){
      d.fillStyle='#193c41';d.fillRect(0,0,512,112);
      d.strokeStyle='#be9764';d.lineWidth=3;d.strokeRect(8,8,496,96);d.fillStyle='#ebd9ab';
      d.font='italic bold 72px serif';d.fillText('Fen',30,78);
      d.fillStyle='#d68555';d.fillRect(202,25,3,63);d.fillStyle='#ead8ad';
      d.font='bold 27px sans-serif';d.fillText('SERIES   S–02',225,55);
      d.font='15px sans-serif';d.fillText('MECHANICAL FLIGHT',225,82);
      const tex=new T.CanvasTexture(c);tex.flipY=false;tex.colorSpace=T.SRGBColorSpace;
      nameplate=mat(0xffffff,.18,.49,{map:tex,side:T.DoubleSide});
    }
  }
  for(const s of [-1,1]){
    if(nameplate){
      const q=[],uv=[],tri=[];
      for(let i=0;i<=10;i++)for(let j=0;j<=3;j++){
        q.push(cheek(.58+.68*i/10,-.335-.151*j/3,s));uv.push(s>0?i/10:1-i/10,j/3);
        if(i&&j){const k=i*4+j;tri.push(k-5,k-1,k,k-5,k,k-4);}
      }
      const geo=new T.BufferGeometry();
      geo.setAttribute('position',new T.Float32BufferAttribute(q.flat(),3));
      geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(tri);geo.computeVertexNormals();mesh(g,geo,nameplate);
    }
    for(const x of [.09,.3,.51,.72,.93,1.14,1.35,1.56,1.77,1.98]){
      const y=-.24-.028*(x-1)**2;
      rod(g,cheek(x,y,s,-.002),cheek(x,y,s,.005),.009,m.alu,.008,8);
    }
    for(const x of [.595,1.245])for(const y of [-.348,-.474])
      rod(g,cheek(x,y,s,.002),cheek(x,y,s,.010),.007,m.brass,.006,8);
  }
  // The black main longerons reappear aft of the boat-shaped lower pan.
  for(const s of [-1,1]){
    const upper=[[-2.99,.04,.08*s],[-2.37,.13,.13*s],[-1.64,.23,.23*s],[-.96,.29,.32*s],[-.18,.26,.31*s]];
    const lower=[[-2.99,-.06,.07*s],[-2.37,-.16,.12*s],[-1.64,-.3,.20*s],[-.96,-.55,.25*s],[-.18,-.64,.30*s]];
    for(let i=0;i<4;i++){
      rod(g,upper[i],upper[i+1],.033,m.enamel);rod(g,lower[i],lower[i+1],.035,m.enamel);
      rod(g,lower[i],upper[i+1],.018,m.alu);rod(g,upper[i],lower[i+1],.007,m.tubing);
      rod(g,upper[i],lower[i],.021,m.tubing);ball(g,upper[i],[.045,.046,.044],m.brass);
    }
    rod(g,upper[0],[-2.99,.04,-.08*s],.026,m.tubing);
    // Hardpoints to the central wing pylon and intermediate engine mount.
    rod(g,[-1,.18,.27*s],[-.37,.79,.21*s],.047,m.tubing);
    rod(g,[.45,-.17,.33*s],[.34,.79,.21*s],.052,m.enamel);
    rod(g,[-.93,-.27,.30*s],[.32,.77,.21*s],.022,m.alu);
    rod(g,[-.59,.80,.25*s],[.59,.8,.25*s],.041,m.alu);
    rod(g,[.17,-.25,.34*s],[-2.82,.12,.1*s],.007,m.dark);
    for(const b of [-.43,.44])box(g,[b,.78,.25*s],[.081,.104,.10],m.brass);
  }
  rod(g,[-.35,.70,-.25],[-.35,.70,.25],.043,m.tubing);
  rod(g,[.32,.7,-.24],[.32,.7,.24],.043,m.tubing);
  box(g,[.85,-.74,0],[1.46,.07,.48],m.dark);
}

function buildPilot({T,a,root,m,group,rod,ball,box,skin},frame){
  const p=a.pilot=group(root,'55 kg seated test pilot');
  // Bucket, high back, side bolsters; shoulders are in front of the pylon.
  box(frame,[.63,-.59,0],[.53,.09,.46],m.seat);
  const back=box(frame,[.43,-.28,0],[.085,.68,.46],m.seat);back.rotation.z=.16;
  for(const sign of [-1,1])ball(frame,[.60,-.48,.225*sign],[.24,.105,.038],m.seat);
  ball(p,[.67,-.46,0],[.16,.14,.19],m.trousers);
  const chest=ball(p,[.585,-.17,0],[.147,.33,.205],m.suit);chest.rotation.z=.16;
  ball(p,[.54,.049,0],[.116,.095,.186],m.suit);
  rod(p,[.546,.043,0],[.548,.18,0],.067,m.skin);
  ball(p,[.557,.229,0],[.103,.134,.094],m.skin);
  ball(p,[.646,.218,0],[.038,.034,.031],m.skin);
  ball(p,[.534,.287,0],[.123,.108,.108],m.cream);
  ball(p,[.633,.271,0],[.051,.041,.101],m.visor);
  // Ear cups and chin retention webbing.
  for(const sign of [-1,1]){
    ball(p,[.52,.236,.093*sign],[.060,.066,.028],m.dark);
    ball(p,[.52,.242,.113*sign],[.045,.049,.016],m.red);
    rod(p,[.525,.22,.090*sign],[.609,.142,.046*sign],.014,m.seat);
    const shoulder=[.55,.00,sign*.174],elbow=[.62,-.239,sign*.238],hand=[.887,-.17,sign*.137];
    ball(p,shoulder,[.096,.10,.089],m.suit);
    rod(p,shoulder,elbow,.089,m.suit,.065);ball(p,elbow,[.068,.07,.067],m.suit);
    rod(p,elbow,hand,.067,m.suit,.046);
    ball(p,hand,[.067,.047,.043],m.seat);
    const hip=[.68,-.45,.111*sign],knee=[1.059,-.445,.145*sign],ankle=[1.251,-.724,.144*sign];
    rod(p,hip,knee,.10,m.trousers,.086);ball(p,knee,[.087,.089,.082],m.trousers);
    rod(p,knee,ankle,.083,m.trousers,.05);
    ball(p,[1.299,-.745,sign*.144],[.134,.059,.065],m.seat);
    rod(frame,[1.347,-.78,sign*.215],[1.347,-.78,sign*.084],.024,m.alu);
    rod(p,[.54,.08,.127*sign],[.693,-.20,.091*sign],.025,m.brass);
    rod(p,[.693,-.20,.091*sign],[.784,-.385,.031*sign],.024,m.dark);
    rod(p,[.60,-.43,.197*sign],[.784,-.385,.031*sign],.026,m.dark);
  }
  box(p,[.782,-.38,0],[.032,.051,.072],m.alu);
  rod(frame,[.93,-.73,0],[.912,-.173,0],.019,m.alu);
  rod(frame,[.9,-.17,-.14],[.9,-.17,.14],.023,m.dark);
  // Close, slightly sloped binnacle faced towards the pilot.
  const dash=box(frame,[1.363,-.183,0],[.105,.203,.55],m.enamel);dash.rotation.z=.15;
  for(const [z,r] of [[-.165,.047],[-.051,.056],[.087,.053],[.192,.031]]){
    rod(frame,[1.298,-.16,z],[1.310,-.16,z],r,m.brass,r,24);
    rod(frame,[1.294,-.16,z],[1.299,-.16,z],r*.84,m.dark,r*.84,24);
    rod(frame,[1.29,-.16,z],[1.29,-.16+r*.48,z+r*.36],.0028,m.cream);
  }
  const pts=[],idx=[];
  for(let i=0;i<=14;i++){
    const q=i*Math.PI/14,z=Math.cos(q),cs=Math.sin(q);
    pts.push([1.48+cs*.13,-.17+.16*cs,.31*z],[1.47-.10*cs,-.095+.26*cs,.286*z]);
    if(i){const k=i*2;idx.push(k-2,k,k+1,k-2,k+1,k-1);rod(frame,pts[k-1],pts[k+1],.009,m.alu);}
  }
  skin(frame,pts,idx,m.glass);
}

function buildTail({T,a,root,m,group,rod,ball,skin,mat},g){
  // Rounded, closed sections at a small series of loft stations rather
  // than crossed planes. span-axis loft doubles as the vertical fin.
  function foil(parent,vertical,stations,paint){
    let pts=[],idx=[],N=16;
    for(let j=0;j<stations.length;j++){
      const [z,le,te,ry]=stations[j];
      for(let i=0;i<N;i++){
        const t=tau*i/N,x=te+(le-te)*(.5+.5*Math.cos(t)),y=ry*Math.sin(t);
        pts.push(vertical?[x,z,y]:[x,y,z]);
        if(j){const k=j*N+i,b=j*N+(i+1)%N;idx.push(k-N,b-N,b,k-N,b,k);}
      }
    }
    const geoMat=paint.clone();geoMat.side=T.DoubleSide;
    skin(parent,pts,idx,geoMat);
  }
  const stab=group(root,'Fixed tailplane • negative incidence',[-2.83,.075,0]);stab.rotation.z=E.coupled.tail_incidence_rad;
  const elevator=a.elevator=group(stab,'elevator');
  const fixed=[],moving=[];
  for(const f of [-1,-.96,-.84,-.5,0,.5,.84,.96,1]){
    const t=Math.abs(f),shape=Math.sqrt(Math.max(.002,1-t*t));
    fixed.push([f*1.34,.52*shape+.01,.012,.043*shape]);
    moving.push([f*1.34,-.004,-.24*shape-.012,.027*shape]);
  }
  foil(stab,false,fixed,m.cream);foil(elevator,false,moving,m.enamel);
  const fin=group(root,'Dorsal stabiliser',[-2.96,.064,0]);
  foil(fin,true,[[-.11,.72,0,.057],[.15,.75,0,.055],[.38,.53,0,.042],
    [.73,.32,0,.032],[.93,.2,0,.026],[1,.095,0,.014],[1.013,.007,0,.003]],m.enamel);
  a.rudder=group(fin,'rudder');
  foil(a.rudder,true,[[-.09,-.012,-.27,.034],[.04,-.012,-.35,.047],[.42,-.012,-.38,.043],
    [.81,-.012,-.26,.038],[.97,-.012,-.14,.021],[1.01,-.012,-.028,.007]],m.red);
  rod(g,[-2.96,-.05,0],[-2.96,1.06,0],.013,m.brass);
  for(const s of [-1,1]){
    rod(g,[-2.92,-.115,s*.08],[-2.72,.071,s*.96],.018,m.alu);
    rod(g,[-2.88,.79,s*.015],[-2.76,.076,s*1.13],.005,m.tubing);
    ball(g,[-2.81,.075,s*.976],[.04,.037,.043],m.brass);
  }
  // A shop number on both faces of the stabiliser.
  if(typeof document!=='undefined'){
    const c=document.createElement('canvas');c.width=256;c.height=160;
    const ctx=c.getContext('2d');if(ctx){
      ctx.fillStyle='#f6deac';ctx.textAlign='center';ctx.font='bold 89px sans-serif';ctx.fillText('02',128,97);
      ctx.fillRect(34,108,188,3);ctx.font='bold 19px sans-serif';ctx.fillText('F E N    /    S E R I E S',128,138);
      const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;
      const label=mat(0xffffff,0,.75,{map,transparent:true,depthWrite:false});
      for(const side of [-1,1]){
        const badge=new T.Mesh(new T.PlaneGeometry(.31,.205),label);
        badge.position.set(.203,.36,.047*side);badge.rotation.y=side<0?Math.PI:0;fin.add(badge);
      }
    }
  }
}

function buildGear({a,p,root,m,rod,ring,ball},g){
  for(const [x,y,z] of p.gear_centres){
    const R=p.wheel_radius_m,main=z!==0,side=Math.sign(z);
    const tyre=ring(root,[x,y,z],.78*R,.22*R,m.rubber,48);tyre.name=main?'Main pneumatic tyre':'Nose pneumatic tyre';
    a.wheels.push(tyre);
    for(const off of [-.029,.029]){
      ring(tyre,[0,0,off],.139,.013,m.alu,36);
      for(let i=0;i<10;i++){
        const t=i*tau/10,ang=t+Math.sign(off)*.46;
        rod(tyre,[Math.cos(ang)*.036,.036*Math.sin(ang),off*1.2],[.14*Math.cos(t),.14*Math.sin(t),off*.54],.0038,m.alu,.0038,5);
      }
    }
    rod(tyre,[0,0,-.064],[0,0,.064],.039,m.brass,.039,18);
    rod(g,[x,y,z-.084],[x,y,z+.084],.017,m.dark);
    if(main){
      rod(g,[x,y+.02,z-side*.073],[-.97,-.3,.29*side],.036,m.enamel);
      rod(g,[x,y+.02,z-side*.073],[.60,-.59,.29*side],.035,m.tubing);
      rod(g,[x,y+.02,z-side*.073],[-.47,-.1,side*.33],.023,m.alu);
      rod(g,[x,y+.22,z-side*.24],[-.47,-.1,.33*side],.039,m.red,.031);
      if(side<0)rod(g,[x,y+.03,z-side*.078],[x,y+.03,-z+side*.078],.016,m.tubing);
    }else{
      for(const s of [-1,1])rod(g,[x,y,s*.079],[2.035,-.88,s*.035],.024,m.alu);
      rod(g,[2.035,-.88,0],[1.92,-.48,0],.033,m.alu,.04);
      rod(g,[2,-.76,0],[1.92,-.48,0],.052,m.enamel);
      rod(g,[1.97,-.72,0],[1.52,-.70,0],.022,m.tubing);
    }
    ball(g,[x,y,z+.076],[.026,.026,.015],m.alu);
  }
}

function buildDrive({T,a,m,root,group,rod,ring,ball,box},g){
  // Exposed single, canted fin stack with expansion chamber and silencer.
  ball(g,[-.81,-.025,0],[.255,.223,.235],m.dark);
  rod(g,[-1.01,-.005,0],[-.59,-.005,0],.181,m.alu,.17,20);
  const foot=[-.86,.095,.08],head=[-1.04,.367,.194];
  rod(g,foot,head,.113,m.dark,.115,16);
  for(let i=0;i<8;i++)
    rod(g,mix(foot,head,i/8),mix(foot,head,(i+.42)/8),.145-i*.002,m.alu,.145-i*.002,16);
  rod(g,head,[-1.066,.429,.215],.037,m.cream);ball(g,[-1.067,.427,.215],[.042,.032,.036],m.rubber);
  const pipe=[[-1.01,.24,.22],[-1.19,.21,.31],[-1.26,.087,.32],[-1.20,-.018,.33],[-1.04,-.05,.36]];
  for(let i=1;i<pipe.length;i++)rod(g,pipe[i-1],pipe[i],.039,m.brass);
  rod(g,[-1.04,-.05,.36],[-.82,-.09,.36],.037,m.tubing,.067);
  rod(g,[-.82,-.09,.36],[-.46,-.14,.36],.067,m.dark,.053);
  rod(g,[-.46,-.14,.36],[-.40,-.15,.36],.032,m.tubing);
  // Fuel cell, riveted straps, inlet and the reduction tower.
  ball(g,[-.28,-.21,0],[.24,.18,.24],m.cream);
  for(const x of [-.4,-.18])box(g,[x,-.063,0],[.029,.026,.33],m.seat);
  rod(g,[-.26,-.104,.135],[-.26,-.025,.135],.039,m.brass);
  box(g,[-.54,.185,0],[.156,.55,.24],m.enamel);
  rod(g,[-.65,.424,0],[.23,.424,0],.062,m.alu);
  for(const [cy,r] of [[-.004,.088],[.424,.172]]){
    rod(g,[-.469,cy,0],[-.367,cy,0],r,m.dark,r,32);
    rod(g,[-.368,cy,0],[-.35,cy,0],r*1.04,m.brass,r*1.04,32);
    rod(g,[-.35,cy,0],[-.329,cy,0],r*.43,m.tubing,r*.43,18);
  }
  for(const s of [-1,1])box(g,[-.411,.206,s*.131],[.085,.436,.023],m.rubber).rotation.x=s*.19;
  a.crank=group(root,'Slow crankshaft',[-.1,.424,0]);
  for(const s of [-1,1]){
    const x=s*.123;
    rod(a.crank,[x-.018,0,0],[x+.018,0,0],.136,m.tubing,.136,28);
    rod(a.crank,[x,0,0],[x,0,.144],.043,m.brass,.031);
    rod(a.crank,[x-.037,0,.144],[x+.037,0,.144],.032,m.alu,.032,16);
  }
}

function buildWings({T,a,p,root,m,group,mesh,rod,box}){
  const pf=planform(p),fabric=[textile(T,true),textile(T,false)];
  const jig={wingPanels:{}}, anchors=[], stock=new Map(), sleeves=[];
  // Jig copies carry only vertices (no additional rendered sails). In this
  // way a cable end or rib on a moving leaf follows exactly its local fabric
  // triangle, even while chord, wrist sweep and overlap are all changing.
  const vertex=(geo,side,name,t,u,drop,count,leaf)=>{
    const it=Math.min(count-1,Math.floor(t*count)),iu=Math.min(1,Math.floor(u*2));
    const f=t*count-it,b=u*2-iu,ix=3*it+iu;
    const offsets=f+b<=1?[ix,ix+3,ix+1]:[ix+4,ix+3,ix+1];
    const weights=f+b<=1?[1-b-f,f,b]:[f+b-1,1-b,1-f];
    const attr=geo.getAttribute('position');
    let depth=drop*pf.chord;
    if(name.endsWith('Outer')){
      const eta=(leaf+t)/2,seg=Math.min(3,Math.floor(eta*4)),ff=eta*4-seg;
      const shape=z=>E.wing.taper_ratio+(1-E.wing.taper_ratio)*Math.sqrt(1-z*z);
      depth*=shape(seg/4)*(1-ff)+shape((seg+1)/4)*ff;
    }
    const pt=new T.Vector3();
    anchors.push((pose,normals)=>{
      const v=attr.array,A=3*offsets[0],B=3*offsets[1],C=3*offsets[2];
      const x=weights[0],y=weights[1],z=weights[2];
      pt.set(v[A]*x+v[B]*y+v[C]*z,v[A+1]*x+v[B+1]*y+v[C+1]*z,v[A+2]*x+v[B+2]*y+v[C+2]*z);
      pt.addScaledVector(normals[name],-depth);
    });return pt;
  };
  function moving(f){
    const pt=new T.Vector3();anchors.push((pose,n,s)=>pt.set(...f(pose,s)));return pt;
  }
  function bar(A,B,r,material){
    if(!stock.has(material))stock.set(material,[]);
    stock.get(material).push({A,B,r});
  }
  const locate={};
  for(const name of PANEL_NAMES){
    const left=name.startsWith('left'),side=left?-1:1,outer=name.endsWith('Outer'),count=outer?2:4;
    const parent=a[name]=group(root,name),surf=a[name+'Surface']=group(parent,name+'Surface');
    a.wingPanels[name]=[];jig.wingPanels[name]=[];locate[name]=[];
    for(let leaf=0;leaf<(outer?2:1);leaf++){
      const geo=makePanel(T,p,name,leaf),uv=[];
      for(let j=0;j<=count;j++)for(let i=0;i<3;i++){
        const t=j/count;
        uv.push((pf.hinge+(outer?pf.inner+pf.outer*(leaf+t)*.5:pf.inner*t))/pf.half,i*.5);
      }
      geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
      const panel=mesh(surf,geo,fabric[+!left],[0,0,0],name+' • '+(outer?'sliding leaf '+(1+leaf):'arm sail'));
      panel.userData.section_thickness_fraction=outer?E.wing.outer_thickness_fraction:E.wing.inner_thickness_fraction;
      a.wingPanels[name].push(panel);
      const copy=makePanel(T,p,name,leaf);
      jig.wingPanels[name].push({geometry:copy});
      const cache=new Map();
      function at(t,u,d=0){
        const key=[t,u,d].join(',');
        if(!cache.has(key))cache.set(key,vertex(copy,side,name,t,u,d,count,leaf));
        return cache.get(key);
      }
      locate[name].push(at);
      // Battens are physical section construction under the source mean
      // surface: deep triangular arm ribs, slender laminated hand battens.
      const depth=panel.userData.section_thickness_fraction;
      const ribCount=outer?4:8,rr=outer?.008:.012;
      for(let i=0;i<=ribCount;i++){
        const t=i/ribCount,L=at(t,0,.002),spar=at(t,.26,depth),aft=at(t,.71,.54*depth),Tedge=at(t,1,.002);
        bar(L,spar,rr,m.brass);bar(spar,aft,rr*.9,m.brass);bar(aft,Tedge,rr*.73,m.brass);
        if(!outer){
          bar(spar,at(t,.5,.002),rr*.67,m.alu);bar(at(t,.5,.002),aft,rr*.67,m.alu);
        }
        if(i===0)continue;
        const t0=(i-1)/ribCount;
        bar(at(t0,0,.002),L,outer?.013:.021,m.enamel);
        bar(at(t0,1,.002),Tedge,outer?.008:.012,m.brass);
        bar(at(t0,.26,depth),spar,outer?.015:.033,m.tubing);
        bar(at(t0,.71,.54*depth),aft,outer?.012:.019,m.tubing);
        if(!outer)bar(at(t0,i%2?.26:.71,i%2?depth:.54*depth),i%2?aft:spar,.006,m.dark);
      }
    }
  }
  for(const side of [-1,1]){
    const prefix=side<0?'left':'right',I=prefix+'Inner',O=prefix+'Outer';
    const wrist=locate[I][0],hand=locate[O][0];
    const sleeve=group(root,'Sliding root trunnion');
    sleeves.push([sleeve,I,side]);
    rod(sleeve,[-.163,0,0],[.163,0,0],.063,m.dark,.063,20);
    for(const x of [-.139,.117])rod(sleeve,[x,0,0],[x+.026,0,0],.073,m.brass,.073,18);
    const coil=[];
    for(let i=0;i<=112;i++){const f=i/112,t=tau*7*f;coil.push(new T.Vector3(-.110+.219*f,.077*Math.cos(t),.077*Math.sin(t)));}
    mesh(sleeve,new T.TubeGeometry(new T.CatmullRomCurve3(coil),112,.0105,6,false),m.alu);
    box(sleeve,[.151,-.047,0],[.039,.11,.13],m.tubing);
    const trunnion=moving(pose=>[pose[I].sweep,E.wing.root_height_m,side*pf.hinge]);
    bar(trunnion,wrist(.13,.26,.055),.038,m.red);
    bar(trunnion,wrist(0,.71,.03),.028,m.tubing);
    const big=moving((pose,s)=>[-.10+side*.123,.424-.144*Math.sin(s.gliding?0:s.phase),.144*Math.cos(s.gliding?0:s.phase)]);
    bar(big,wrist(.117,.26,.055),.025,m.alu);
    // A wrist carriage carries a forward spar and a swept drag link. Their
    // bearings shift fore/aft relative to each other, rather than stretching
    // the fabric spanning the step.
    bar(wrist(1,.24,.045),hand(0,.24,.009),.038,m.brass);
    bar(wrist(.93,.66,.033),hand(0,.66,.009),.026,m.tubing);
    bar(wrist(.94,.26,.055),hand(.09,.26,.008),.022,m.red);
    const runner=locate[O][1];
    bar(hand(.36,.258,.013),runner(.12,.258,.012),.019,m.alu);
  }
  const batches=[];
  for(const [material,list] of stock){
    const obj=new T.InstancedMesh(new T.CylinderGeometry(1,1,1,8),material,list.length);
    obj.frustumCulled=false;obj.name='Working wing structure';root.add(obj);
    obj.instanceMatrix.setUsage(T.DynamicDrawUsage);batches.push([obj,list]);
  }
  const temp=new T.Object3D(),up=new T.Vector3(0,1,0),axis=new T.Vector3(),normals={};
  for(const name of PANEL_NAMES)normals[name]=new T.Vector3();
  a.rig=(s,pose)=>{
    mountWingPose(jig,pose,p);
    for(const name of PANEL_NAMES){
      const side=name.startsWith('left')?-1:1,out=name.endsWith('Outer');
      const stroke=pose[name].stroke+(out?pose[side<0?'leftInner':'rightInner'].stroke:0);
      const cb=Math.cos(pose[name].twist),sb=Math.sin(pose[name].twist);
      normals[name].set(-sb,cb*Math.cos(stroke),-side*cb*Math.sin(stroke));
    }
    for(const fn of anchors)fn(pose,normals,s);
    for(const [g,name,side] of sleeves)g.position.set(pose[name].sweep,E.wing.root_height_m,side*pf.hinge);
    for(const [obj,list] of batches){
      for(let i=0;i<list.length;i++){
        const {A,B,r}=list[i];axis.subVectors(B,A);const len=axis.length();
        temp.position.copy(A).lerp(B,.5);temp.scale.set(r,Math.max(.001,len),r);
        if(len>1e-9)temp.quaternion.setFromUnitVectors(up,axis.divideScalar(len));
        temp.updateMatrix();obj.setMatrixAt(i,temp.matrix);
      }
      obj.instanceMatrix.needsUpdate=true;
    }
  };
}

export function updateAircraft(a,s,c){
  for(const wheel of a.wheels)wheel.rotation.z=s.wheel_angle??0;
  a.rudder.rotation.y=.46*(c.rudder??0);
  a.elevator.rotation.z=-.28*(c.pitch??0); // Nose-up command: trailing edge rises.
  a.crank.rotation.x=s.gliding?0:s.phase;
  a.rig(s,wingPose(s));
}
