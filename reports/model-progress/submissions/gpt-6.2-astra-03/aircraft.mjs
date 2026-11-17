import {E} from './environment/engineering.mjs';
import {makePanel,PANEL_NAMES,planform,chordFactor} from './environment/source-mechanism.mjs';
import {wingPose} from './kinematics.mjs';

// Fenland S-02. Ivory sailcloth, spruce battens, bottle-green enamel and
// vermilion inspection marks. All dimensions below are metres, at body datum.
const PI=Math.PI;
const ink=0x164841,trim=0xe2b570,signal=0xc85730;

// A woven, rib-taped sail, laid out in MATERIAL coordinates so the second leaf
// carries its own markings underneath the first on the return stroke.
function sailPrint(T,outer){
  const w=256,h=256,bytes=new Uint8Array(w*h*4);
  const linen=outer?[238,224,187]:[232,214,174], green=[34,81,75], red=[195,79,41], bone=[245,233,200];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const u=(y+.5)/h,t=(x+.5)/w;
    let col=linen;
    const stripe=outer?t-.075*(u-.5):0;
    if(outer && stripe>.78)col=green;
    if(outer && stripe>.75 && stripe<.768)col=red;
    if(u<.039)col=green;
    if(u>.968 || (u>.049 && u<.056))col=[170,140,93];
    // Survey badge: sun disc intersected by a stylised pair of wings.
    if(!outer){
      const dx=(t-.76)*1.75,dy=u-.44, r=Math.hypot(dx,dy);
      if(r<.119)col=green;
      if(r<.109)col=bone;
      if(r<.092)col=red;
      if(Math.abs(dx)<.14 && Math.abs(dy-(.011-.27*Math.abs(dx)))<.029-.155*Math.abs(dx))col=green;
    }
    const rib=Math.abs(t*8-Math.round(t*8));
    const tape=rib<.038?(rib<.023?5:-15):0;
    const grain=((x*17+y*79+(x^y)*11)%9-4)*.55+((x%2)+(y%2)-1)*2;
    const shade=-5*Math.cos(2*PI*t*8)-3*u+grain+tape;
    const k=(y*w+x)*4;
    for(let i=0;i<3;i++)bytes[k+i]=Math.min(255,Math.max(0,col[i]+shade));
    bytes[k+3]=255;
  }
  const tex=new T.DataTexture(bytes,w,h);tex.colorSpace=T.SRGBColorSpace;
  tex.magFilter=T.LinearFilter;tex.minFilter=T.LinearMipmapLinearFilter;
  tex.generateMipmaps=true;tex.needsUpdate=true;return tex;
}

export function createAircraft(T,p){
  const root=new T.Group();root.name='Fenland • S-02';
  const a={root,wheels:[],wingPanels:{},leaves:[],rockers:[],cables:[],T,p};
  function group(name,parent=root,...xyz){
    const g=new T.Group();g.name=name;parent.add(g);if(xyz.length)g.position.set(...xyz);return g;
  }
  const mat=(color,roughness=.65,metalness=0,options={})=>new T.MeshStandardMaterial({color,roughness,metalness,...options});
  const M={green:mat(ink,.36,.32),jade:mat(0x36736a,.42,.25),gold:mat(0xb78a48,.35,.58),
    alloy:mat(0xacb8b3,.36,.68),steel:mat(0x414f51,.35,.62),black:mat(0x273134,.7),
    rubber:mat(0x222729,.91),cream:mat(0xefddb5,.66),wood:mat(0xac7545,.53),
    orange:mat(signal,.44,.22),hide:mat(0x654630,.83),suit:mat(0xaa7446,.88),
    suitDark:mat(0x4b5146,.86),flesh:mat(0xc78e67,.76),visor:mat(0x233c40,.18,.47),
    white:mat(0xffecca,.53),glass:mat(0xb5deda,.18,.1,{transparent:true,opacity:.38,side:T.DoubleSide,depthWrite:false})};
  const at=(g,m,parent,x,y,z,bake=true)=>{
    const mesh=new T.Mesh(g,m);mesh.position.set(x,y,z);mesh.userData.bake=bake;parent.add(mesh);return mesh;
  };
  function box(parent,xyz,size,m){
    return at(new T.BoxGeometry(...size),m,parent,...xyz);
  }
  function pod(parent,xyz,size,m){
    const mesh=at(new T.SphereGeometry(1,16,12),m,parent,...xyz);mesh.scale.set(...size);return mesh;
  }
  function rod(parent,a,b,r,m,r2=r,n=10){
    const d=new T.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
    const mesh=at(new T.CylinderGeometry(r2,r,d.length(),n),m,parent,
      (a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2);
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return mesh;
  }
  function path(parent,points,r,m,n=8){for(let i=1;i<points.length;i++)rod(parent,points[i-1],points[i],r,m,r,n);}
  function sheet(parent,coords,idx,m){
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(coords.flat(),3));g.setIndex(idx);g.computeVertexNormals();
    return at(g,m,parent,0,0,0);
  }
  // Batch stationary fittings by parent and finish. Keep the actual tyres,
  // fabric and articulated subassemblies independent.
  function batch(g){
    const bins=new Map();
    for(const m of [...g.children]){
      if(m.children.length)batch(m);
      if(!m.isMesh||!m.userData.bake ||m.children.length)continue;
      let b=bins.get(m.material);
      if(!b){b={v:[],n:[],i:[]};bins.set(m.material,b);}
      m.updateMatrix();const norm=new T.Matrix3().getNormalMatrix(m.matrix);
      const pos=m.geometry.getAttribute('position'),ns=m.geometry.getAttribute('normal'),v=new T.Vector3();
      const start=b.v.length/3;
      for(let j=0;j<pos.count;j++){
        v.fromBufferAttribute(pos,j).applyMatrix4(m.matrix);b.v.push(v.x,v.y,v.z);
        v.fromBufferAttribute(ns,j).applyNormalMatrix(norm);b.n.push(v.x,v.y,v.z);
      }
      const ix=m.geometry.index;
      for(let i=0;i<(ix?ix.count:pos.count);i++)b.i.push(start+(ix?ix.getX(i):i));
      g.remove(m);m.geometry.dispose();
    }
    for(const [m,b] of bins){
      const geo=new T.BufferGeometry();
      geo.setAttribute('position',new T.Float32BufferAttribute(b.v,3));geo.setAttribute('normal',new T.Float32BufferAttribute(b.n,3));
      geo.setIndex(b.i);g.add(new T.Mesh(geo,m));
    }
  }

  // Open touring shell: a loft from keel to rolled coaming. The stern
  // remains open, exposing the reduction gear, engine and Warren tail boom.
  const stations=[[.14,-.35,-.18,.18],[.36,-.57,.02,.33],[.67,-.68,.01,.405],
    [1.00,-.73,-.12,.425],[1.34,-.72,-.16,.415],[1.64,-.65,-.05,.37],
    [1.92,-.55,-.08,.30],[2.22,-.45,-.14,.20],[2.52,-.31,-.23,.055],[2.59,-.272,-.27,.006]];
  const profile=[[0,0],[.61,.10],[.89,.31],[.99,.57],[1,.64],[1,.675],[.975,.86],[.92,1]];
  const finishes=[M.green,M.green,M.green,M.jade,M.gold,M.cream,M.cream];
  for(const sign of [-1,1]){
    function pt(st,i){
      const [x,lo,hi,width]=st,[z,y]=profile[i];return [x,lo+(hi-lo)*y,width*z*sign];
    }
    for(let j=1;j<stations.length;j++){
      for(let i=1;i<profile.length;i++){
        const v=[pt(stations[j-1],i-1),pt(stations[j],i-1),pt(stations[j],i),pt(stations[j-1],i)];
        const m=finishes[i-1];m.side=T.DoubleSide;
        sheet(root,v,[0,1,2,0,2,3],m);
      }
      const l=pt(stations[j-1],7),r=pt(stations[j],7);
      rod(root,l,r,.018,M.hide);
      if(j>=6 || j===1){
        sheet(root,[l,r,[r[0],r[1]+.040,0],[l[0],l[1]+.040,0]],[0,1,2,0,2,3],M.green);
      }
    }
    for(let j=1;j<stations.length-1;j++){
      const [x,y,z]=pt(stations[j],6);
      pod(root,[x,y,z],[.009,.009,.006],M.gold);
    }
  }
  // Seat shell, flight deck, a small curved three-light windscreen.
  box(root,[.84,-.46,0],[.44,.10,.43],M.hide);
  const back=box(root,[.59,-.19,0],[.082,.53,.435],M.hide);back.rotation.z=.16;
  box(root,[1.57,-.21,0],[.12,.26,.60],M.black).rotation.z=-.20;
  for(const [z,r] of [[-.162,.052],[-.04,.049],[.08,.045],[.18,.035]]){
    rod(root,[1.486,-.171,z],[1.504,-.171,z],r+.007,M.gold,r+.007,20);
    rod(root,[1.478,-.171,z],[1.486,-.171,z],r,M.cream,r,20);
    rod(root,[1.474,-.17,z],[1.474,-.147,z+.009],.003,M.black);
  }
  // A push-pull throttle quadrant on the left longeron.
  box(root,[1.03,-.16,-.31],[.20,.075,.060],M.steel);
  rod(root,[1.03,-.135,-.31],[1.09,-.047,-.31],.011,M.alloy);
  pod(root,[1.09,-.047,-.31],[.026,.023,.018],M.orange);
  for(const z of [-.143,.143])rod(root,[1.47,-.57,z],[1.57,-.50,z],.044,M.rubber,.044,8);
  const glassBase=[],glassTop=[];
  for(let i=0;i<=8;i++){
    const t=-PI/2+PI*i/8;
    glassBase.push([1.60+.25*Math.cos(t),-.055,.335*Math.sin(t)]);
    glassTop.push([1.57+.12*Math.cos(t),.015+.215*Math.cos(t),.334*Math.sin(t)]);
    if(i>0)sheet(root,[glassBase[i-1],glassBase[i],glassTop[i],glassTop[i-1]],[0,1,2,0,2,3],M.glass);
  }
  path(root,glassBase,.011,M.gold);path(root,glassTop,.009,M.alloy);
  for(const i of [0,4,8])rod(root,glassBase[i],glassTop[i],.010,M.alloy);

  const pilot=a.pilot=group('pilot');
  pod(pilot,[.87,-.365,0],[.177,.133,.188],M.suitDark);
  const torso=pod(pilot,[.821,-.095,0],[.156,.277,.222],M.suit);torso.rotation.z=.12;
  pod(pilot,[.79,.117,0],[.121,.065,.147],M.cream);
  pod(pilot,[.809,.174,0],[.072,.091,.076],M.flesh);
  pod(pilot,[.818,.292,0],[.110,.138,.098],M.flesh);
  pod(pilot,[.926,.291,0],[.030,.035,.027],M.flesh);
  pod(pilot,[.798,.345,0],[.118,.115,.111],M.cream);
  pod(pilot,[.855,.352,0],[.106,.037,.113],M.orange);
  pod(pilot,[.902,.327,0],[.058,.040,.099],M.visor);
  for(const k of [-1,1]){
    pod(pilot,[.79,.307,.101*k],[.052,.065,.023],M.black);
    pod(pilot,[.79,.308,.12*k],[.036,.047,.008],M.green);
    const shoulder=[.796,.035,k*.174],elbow=[.925,-.195,k*.218],hand=[1.145,-.137,k*.153];
    rod(pilot,shoulder,elbow,.078,M.suit,.061);pod(pilot,shoulder,[.08,.08,.078],M.suit);
    pod(pilot,elbow,[.065,.066,.063],M.suit);rod(pilot,elbow,hand,.061,M.suit,.043);
    pod(pilot,hand,[.064,.049,.047],M.hide);
    rod(pilot,[.89,-.38,k*.119],[1.221,-.319,k*.133],.099,M.suitDark,.087);
    pod(pilot,[1.22,-.323,k*.133],[.088,.084,.084],M.suitDark);
    rod(pilot,[1.22,-.333,k*.133],[1.48,-.55,k*.14],.080,M.suitDark,.056);
    pod(pilot,[1.53,-.54,k*.14],[.128,.079,.060],M.hide);
    // Two harnesses converge on a metal quick-release buckle.
    path(pilot,[[.79,.143,.108*k],[.91,.078,.120*k],[.968,-.14,.090*k],[.976,-.29,.038*k]],.021,M.black);
  }
  box(pilot,[.98,-.286,0],[.025,.059,.085],M.gold);
  rod(root,[1.19,-.565,0],[1.14,-.135,0],.021,M.steel);
  rod(root,[1.14,-.138,-.18],[1.14,-.138,.18],.018,M.hide);

  // Tapered triangular lattice: compression longerons in enamel, diagonal
  // ties and spliced sockets at each shared node.
  const bays=[[-3.18,.015,.075,.037],[-2.48,.045,-.065,.102],[-1.71,.10,-.19,.18],
    [-.97,.17,-.36,.246],[-.39,.17,-.49,.30],[.32,.025,-.52,.30],[.96,-.1,-.54,.26],[1.98,-.22,-.45,.13]];
  for(let j=0;j<bays.length;j++){
    const [x,y,ky,w]=bays[j],bottom=[x,ky,0];
    if(j<bays.length-1){
      const [X,Y,K,W]=bays[j+1];rod(root,bottom,[X,K,0],.029,M.green);
      for(const k of [-1,1]){
        const u=[x,y,k*w],u2=[X,Y,k*W];rod(root,u,u2,.025,M.jade);
        rod(root,j%2?u:bottom,j%2?[X,K,0]:u2,.015,M.alloy);
        rod(root,j%2?bottom:u,j%2?u2:[X,K,0],.006,M.steel);
        rod(root,u,bottom,.016,M.green);pod(root,u,[.039,.035,.035],M.gold);
      }
      rod(root,[x,y,-w],[x,y,w],.017,M.steel);
    }
  }
  // Breech frame and linear guides under the translating shoulder bearings.
  for(const k of [-1,1]){
    rod(root,[-.94,.12,.24*k],[-.57,.79,.25*k],.038,M.green);
    rod(root,[.37,-.16,.31*k],[.48,.79,.25*k],.033,M.green);
    rod(root,[-.39,-.45,.15*k],[.42,.79,.25*k],.021,M.alloy);
    rod(root,[-.55,.79,.25*k],[.49,.79,.25*k],.048,M.alloy);
    for(const x of [-.55,.49])rod(root,[x-.035,.79,.25*k],[x+.035,.79,.25*k],.065,M.gold);
  }
  rod(root,[-.55,.79,-.25],[-.55,.79,.25],.034,M.green);
  // Engine: crankcase, finned inclined cylinder, ignition lead and tuned
  // expansion exhaust. Separate saddle tank sits below the pilot's seat.
  pod(root,[-.43,-.063,0],[.31,.202,.215],M.steel);
  pod(root,[.34,-.35,0],[.31,.151,.215],M.jade);
  for(const x of [.21,.49])box(root,[x,-.377,0],[.026,.246,.396],M.gold);
  rod(root,[-.48,.04,0],[-.665,.33,0],.129,M.black,.114,14);
  for(let i=0;i<8;i++){
    const x=-.52-.019*i,y=.11+.027*i;
    rod(root,[x,y,0],[x-.008,y+.012,0],.151-i*.002,M.alloy,.152-i*.002,16);
  }
  rod(root,[-.67,.326,0],[-.71,.389,0],.043,M.cream,.026);
  path(root,[[-.71,.39,0],[-.79,.405,.08],[-.83,.23,.16],[-.46,-.07,.18]],.012,M.black);
  path(root,[[-.58,.21,.101],[-.66,.17,.285],[-.89,.025,.32]],.048,M.gold,12);
  rod(root,[-.89,.025,.32],[-1.17,.063,.32],.05,M.steel,.105,16);
  rod(root,[-1.17,.063,.32],[-1.39,.094,.31],.105,M.steel,.10,16);
  rod(root,[-1.39,.094,.31],[-1.70,.17,.28],.10,M.steel,.032,16);
  rod(root,[-1.70,.17,.28],[-1.86,.20,.25],.032,M.black);
  // Reduction belt and eccentric shaft, both about longitudinal axes.
  const crank=a.crank=group('Slow shaft and crank throws',root,-.27,.385,0);
  rod(root,[-.54,.385,0],[.17,.385,0],.039,M.alloy);
  for(const [y,R] of [[-.075,.084],[.385,.208]]){
    rod(root,[-.287,y,0],[-.237,y,0],R,M.black,R,32);
    rod(root,[-.292,y,0],[-.285,y,0],R+.007,M.gold,R+.007,32);
    rod(root,[-.237,y,0],[-.228,y,0],R+.007,M.steel,R+.007,32);
  }
  for(const k of [-1,1]){
    rod(root,[-.259,-.084,k*.084],[-.259,.345,k*.205],.021,M.black);
    // A housed primary reduction ahead of the final drive. The bearing
    // block, fixed case and inspection plugs don't rotate with the pulleys.
    box(root,[-.387,.135,k*.188],[.11,.15,.07],M.green);
    rod(root,[-.47,.135,k*.188],[-.438,.135,k*.188],.039,M.gold,.039,6);
    for(const h of [-.11,-.055,0])rod(root,[-.36,h,k*.134],[-.305,h,k*.134],.028,M.alloy,.028,6);
  }
  // Two handed face cams share one slow shaft. The rockers do not translate
  // with sweep: splined torque tubes transmit their angle through the sliding
  // shoulder carriage. Each bearing pin follows a closed captive groove,
  // rather than a pushrod stretching to accommodate an arbitrary flap law.
  function faceCam(side,shaftX){
    const count=96, verts=new Float32Array((count+1)*7*3),indices=[];
    const camGeo=new T.BufferGeometry();
    camGeo.setAttribute('position',new T.BufferAttribute(verts,3));
    // Section across rim: side wall / land / groove floor / land / side wall.
    const section=[[-.041,-.013],[-.041,.012],[-.015,.012],[-.010,.002],[.010,.002],[.015,.012],[.032,.012]];
    for(let j=0;j<count;j++)for(let i=0;i<6;i++){
      const n=j*7+i;indices.push(n,n+7,n+1,n+7,n+8,n+1);
    }
    camGeo.setIndex(indices);
    const cam=new T.Mesh(camGeo,mat(0xa8a498,.39,.62,{side:T.DoubleSide}));crank.add(cam);
    cam.position.x=shaftX+.27;
    for(let i=0;i<5;i++){
      const th=2*PI*i/5,cy=Math.cos(th),sz=Math.sin(th);
      rod(crank,[shaftX+.27,0,0],[shaftX+.27,.212*cy,.212*sz],.038,M.steel,.023,8);
    }
    rod(crank,[shaftX+.24,0,0],[shaftX+.30,0,0],.060,M.gold,.060,12);
    const rocker=group(side<0?'Port return lever':'Starboard return lever',root,shaftX+.044,.8,side*.25);
    rod(rocker,[0,0,0],[0,-.195,-side*.15],.051,M.orange,.032);
    rod(rocker,[-.045,-.195,-side*.15],[.042,-.195,-side*.15],.023,M.alloy);
    rod(rocker,[.027,-.195,-side*.15],[.043,-.195,-side*.15],.026,M.gold,.026,6);
    // Longitudinal spring cartridge and index band around each torque tube.
    rod(root,[-.64,.8,side*.25],[-.504,.8,side*.25],.091,M.green,.091,20);
    for(let i=0;i<4;i++){
      const cy=Math.cos(i*PI/2),sz=Math.sin(i*PI/2);
      rod(root,[-.65,.8+cy*.070,side*.25+sz*.070],[-.64,.8+cy*.070,side*.25+sz*.070],.013,M.gold,.013,6);
    }
    rod(rocker,[-.062,0,0],[.062,0,0],.064,M.gold,.064,16);
    rod(rocker,[-.5-shaftX,.041,0],[.46-shaftX,.041,0],.013,M.gold);
    function cut(bias){
      const pos=camGeo.getAttribute('position');
      for(let j=0;j<=count;j++){
        const phi=2*PI*j/count,pose=wingPose({phase:phi,timing_bias:bias});
        const ang=-side*pose.leftInner.stroke;
        const yy=.8-.385-.195*Math.cos(ang)+side*.15*Math.sin(ang);
        const zz=side*.25-.195*Math.sin(ang)-side*.15*Math.cos(ang);
        // Mill the measured wrist follower locus in rotating coordinates.
        const y=yy*Math.cos(phi)+zz*Math.sin(phi),z=zz*Math.cos(phi)-yy*Math.sin(phi);
        const r=Math.hypot(y,z);
        section.forEach(([dr,x],i)=>pos.setXYZ(j*7+i,x,y*(1+dr/r),z*(1+dr/r)));
      }
      pos.needsUpdate=true;camGeo.computeVertexNormals();camGeo.computeBoundingSphere();
    }
    a.rockers.push({side,rocker,cut});
  }
  faceCam(-1,-.475);faceCam(1,-.084);

  // Bicycle-pattern spoked wheels, on genuine z axles. Tyre geometry is
  // already in the XY plane, with rim and spokes children of the tyre mesh.
  for(const [x,y,z] of p.gear_centres){
    const R=p.wheel_radius_m,wheel=at(new T.TorusGeometry(R-.045,.045,12,40),M.rubber,root,x,y,z,false);
    wheel.name=z===0?'Nose tyre':z<0?'Port tyre':'Starboard tyre';a.wheels.push(wheel);
    at(new T.TorusGeometry(R-.080,.014,8,32),M.alloy,wheel,0,0,0);
    for(let i=0;i<16;i++){
      const theta=2*PI*i/16;
      rod(wheel,[.026*Math.cos(theta+.36),.026*Math.sin(theta+.36),i%2?.036:-.036],
        [(R-.080)*Math.cos(theta),(R-.080)*Math.sin(theta),0],.0045,M.alloy,.0038,5);
    }
    rod(wheel,[0,0,-.059],[0,0,.059],.037,M.gold,.037,16);
    if(!z){
      for(const k of [-1,1]){
        path(root,[[1.92,-.412,.105*k],[1.91,-.91,.076*k],[x,y,.073*k]],.027,M.alloy);
        rod(root,[1.56,-.51,.20*k],[1.93,-.96,.075*k],.020,M.green);
      }
    }else{
      const k=Math.sign(z),hub=[x,y,z-.075*k];
      rod(root,[.48,-.38,.25*k],hub,.030,M.jade);
      rod(root,[-.99,-.15,.22*k],hub,.033,M.jade);
      rod(root,[-.41,-.46,0],hub,.022,M.alloy);
      rod(root,hub,[x,y,z+.065*k],.021,M.steel);
    }
  }

  // Loft a lenticular section along the span (or height for the fin).
  function foil(parent,vertical,rows,m){
    const v=[],idx=[];m.side=T.DoubleSide;
    for(const [t,le,te,depth] of rows){
      for(const [u,h] of [[0,0],[.27,1],[1,0],[.32,-.72]]){
        const x=le+(te-le)*u;
        v.push(vertical?[x,t,h*depth]:[x,h*depth,t]);
      }
    }
    for(let j=1;j<rows.length;j++)for(let n=0;n<4;n++){
      const i=4*(j-1)+n,k=4*(j-1)+(n+1)%4;
      idx.push(i,i+4,k,k,i+4,k+4);
    }
    const last=4*(rows.length-1);idx.push(0,1,2,0,2,3,last,last+2,last+1,last,last+3,last+2);
    return sheet(parent,v,idx,m);
  }
  const stab=group('Tailplane saddle',root,-2.86,.105,0);stab.rotation.z=E.coupled.tail_incidence_rad;
  const el=a.elevator=group('elevator',stab,-.13,0,0);
  const fin=group('Dorsal fin',root,-2.94,.118,0);
  const rud=a.rudder=group('rudder',fin,-.175,0,0);
  for(const k of [-1,1]){
    foil(stab,false,[[0,.56,-.12,.042],[.47*k,.51,-.12,.037],[1.05*k,.33,-.12,.028],[1.29*k,.14,-.11,.017],[1.35*k,-.028,-.084,.009]],M.cream);
    foil(el,false,[[0,0,-.34,.026],[.52*k,0,-.33,.025],[1.04*k,0,-.23,.020],[1.27*k,0,-.065,.011]],M.jade);
    rod(root,[-2.28,-.07,k*.081],[-2.82,.10,k*.94],.015,M.alloy);
  }
  foil(fin,true,[[0,.70,-.164,.039],[.23,.44,-.164,.038],[.62,.15,-.164,.030],[.84,.005,-.164,.020],[.91,-.10,-.164,.012]],M.green);
  foil(rud,true,[[0,0,-.30,.032],[.22,0,-.36,.035],[.66,0,-.32,.030],[.84,0,-.19,.020],[.91,0,-.04,.012]],M.orange);
  for(const h of [.19,.63])rod(fin,[-.175,h,0],[-.175,h+.07,0],.036,M.gold);
  // Hand-cut tail serial. Map each segment onto the side of the foil
  // rather than drawing view-facing lettering over the aircraft.
  for(const sign of [-1,1]){
    const serialPt=(x,y)=>{
      const xx=.072+sign*x, f=(y-.23)/(.62-.23);
      const le=.44+f*(.15-.44),half=.038+f*(.030-.038);
      const u=(le-xx)/(le+.164), peak=sign===1?.27:.32;
      return [xx,y,sign*(.001+half*(sign===1?1:.72)*Math.min(u/peak,(1-u)/(1-peak)))];
    };
    const bar=(x1,y1,x2,y2)=>{
      const dx=x2-x1,dy=y2-y1,r=.010/Math.hypot(dx,dy);
      sheet(fin,[serialPt(x1-r*dy,y1+r*dx),serialPt(x2-r*dy,y2+r*dx),
        serialPt(x2+r*dy,y2-r*dx),serialPt(x1+r*dy,y1-r*dx)],[0,1,2,0,2,3],M.cream);
    };
    const stroke=pts=>pts.slice(1).forEach((pt,i)=>bar(...pts[i],...pt));
    stroke([[-.083,.452],[-.099,.433],[-.099,.317],[-.082,.300],[-.038,.300],[-.021,.318],
      [-.021,.434],[-.038,.452],[-.083,.452]]);
    stroke([[.011,.420],[.039,.452],[.081,.452],[.098,.433],[.098,.406],[.016,.320],[.016,.300],[.101,.300]]);
    // Cable guides clear the lattice. The final free length meets a horn
    // mounted on the moving surface; the rest pays out through the guide.
    const tailGuide=[-2.47,.074,sign*.135],rudTip=[-.05,.114,sign*.170];
    path(root,[[.73,-.36,sign*.31],[-.37,-.233,sign*.32],[-1.70,-.045,sign*.194],tailGuide],.0055,M.steel,6);
    pod(root,tailGuide,[.025,.022,.018],M.gold);
    rod(rud,[-.05,.114,0],rudTip,.018,M.steel,.011);
    const cable=at(new T.CylinderGeometry(.006,.006,1,6),M.steel,root,0,0,0,false);
    a.cables.push({cable,parent:rud,local:new T.Vector3(...rudTip),guide:new T.Vector3(...tailGuide),
      ancestors:[rud,fin]});
    const elevGuide=[-2.46,-.04,sign*.173],elevTip=[0,-.117,sign*.311];
    rod(el,[0,0,sign*.311],elevTip,.019,M.steel,.012);
    rod(root,[-.37,-.315,sign*.298],elevGuide,.005,M.steel,.005,6);
    const elevCable=at(new T.CylinderGeometry(.006,.006,1,6),M.steel,root,0,0,0,false);
    a.cables.push({cable:elevCable,parent:el,local:new T.Vector3(...elevTip),guide:new T.Vector3(...elevGuide),
      ancestors:[el,stab]});
  }

  const g=planform(p),w=E.wing;
  const fabric=[false,true].map(o=>mat(0xffffff,.86,.04,{map:sailPrint(T,o),side:T.DoubleSide}));
  const cuffMat=mat(0xc39f69,.7,.04,{side:T.DoubleSide});
  function outerChord(t){
    const i=Math.min(3,Math.floor(t*4)),f=t*4-i;
    return g.chord*((1-f)*chordFactor(i/4)+f*chordFactor((i+1)/4));
  }
  for(const name of PANEL_NAMES){
    const outer=name.endsWith('Outer'),side=name.startsWith('left')?-1:1;
    const assembly=a[name]=group(name),surface=a[name+'Surface']=group(name+'Surface',assembly);
    const panels=a.wingPanels[name]=[];
    for(let leaf=0;leaf<(outer?2:1);leaf++){
      const geom=makePanel(T,p,name,leaf),uv=[],N=outer?2:4;
      for(let j=0;j<=N;j++)for(let i=0;i<=2;i++)uv.push(outer?(leaf+j/N)/2:j/N,i/2);
      geom.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
      const skin=new T.Mesh(geom,fabric[+outer]);panels.push(skin);surface.add(skin);
      const rig=group(`${name} • ${leaf?'slipper':'spar'}`,assembly);
      const coords=[],indices=[],verts=[],depth=outer?w.outer_thickness_fraction:w.inner_thickness_fraction;
      const len=outer?g.outer*.5:g.inner;
      function vertex(t,u,lowering){
        const chord=outer?outerChord((leaf+t)*.5):g.chord;
        verts.push((.25-u)*chord,-lowering*chord,side*t*len);
        coords.push([chord*(1-Math.abs(2*u-1)),-lowering*chord,outer&&leaf===1?-.008:0]);
        return coords.length-1;
      }
      function quad(i,j,k,l){indices.push(i,j,k,k,j,l);}
      // Rolled nose cuff and the undersides of bent ribs. Between them the
      // wing is fabric, not a solid plank. Follow the curved upper mesh at
      // each chord station, independently of section thickness.
      const count=outer?4:8;
      for(let j=0;j<=count;j++){
        const t=j/count,a0=Math.max(0,t-.007),a1=Math.min(1,t+.007);
        let prev;
        for(const [u,k] of [[0,0],[.08,.70],[.26,1],[.50,.72],[.77,.39],[1,0]]){
          const l=vertex(a0,u,k*depth),r=vertex(a1,u,k*depth);
          if(prev)quad(prev[0],prev[1],l,r);prev=[l,r];
        }
        if(j<count){
          const end=(j+1)/count;
          quad(vertex(t,0,0),vertex(end,0,0),vertex(t,.055,.62*depth),vertex(end,.055,.62*depth));
          quad(vertex(t,.055,.62*depth),vertex(end,.055,.62*depth),vertex(t,.13,.80*depth),vertex(end,.13,.80*depth));
        }
      }
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(verts,3));
      geo.setIndex(indices);geo.computeVertexNormals();
      const ribs=new T.Mesh(geo,cuffMat);ribs.frustumCulled=false;rig.add(ribs);
      const y0=outer?(leaf?-.012:.001):-.035, rail=outer?.016:.032;
      rod(rig,[0,y0,0],[0,y0,side*len],rail,outer?M.steel:M.wood,rail*.76);
      if(!outer){
        rod(rig,[-.14,0,0],[.14,0,0],.076,M.gold,.076,16);
        rod(rig,[-.124,0,0],[-.124,-.14,.20*side],.029,M.green);
        rod(rig,[-.29,0,side*len],[.41,0,side*len],.041,M.alloy);
      }else if(!leaf)rod(rig,[-.07,0,0],[.07,0,0],.061,M.gold);
      a.leaves.push({name,side,outer,leaf,rig,geo,coords});
    }
  }
  a.form=g;
  batch(root);
  return a;
}

export function updateAircraft(a,s,c){
  const pose=wingPose(s),w=E.wing,g=a.form;
  for(const wheel of a.wheels)wheel.rotation.z=s.wheel_angle??0;
  a.rudder.rotation.y=.43*(c.rudder??0);a.elevator.rotation.z=-.28*(c.pitch??0);
  const vertical=new a.T.Vector3(0,1,0);
  for(const {cable,local,guide,ancestors} of a.cables){
    const end=local.clone();
    for(const part of ancestors){part.updateMatrix();end.applyMatrix4(part.matrix);}
    cable.position.copy(guide).lerp(end,.5);end.sub(guide);
    cable.scale.y=end.length();cable.quaternion.setFromUnitVectors(vertical,end.normalize());
  }
  const phi=s.gliding?0:s.phase;a.crank.rotation.x=phi;
  for(const {name,outer,side,leaf,rig,geo,coords} of a.leaves){
    const v=pose[name],inn=pose[side<0?'leftInner':'rightInner'];
    const angle=inn.stroke+(outer?v.stroke:0);
    const start=outer && leaf?g.outer*(v.exposure-.5):0;
    rig.position.set(v.sweep,w.root_height_m+(outer?g.inner*Math.sin(inn.stroke):0)+start*Math.sin(angle),
      side*(g.hinge+(outer?g.inner*Math.cos(inn.stroke):0)+start*Math.cos(angle)));
    rig.rotation.set(-side*angle,0,v.twist,'XYZ');
    const pos=geo.getAttribute('position');
    for(let i=0;i<coords.length;i++){
      const [cam,floor,offset]=coords[i];pos.setY(i,cam*v.camber+floor+offset);
    }
    pos.needsUpdate=true;geo.computeVertexNormals();
  }
  const bias=s.timing_bias??w.timing_bias_low_speed;
  for(const {side,rocker,cut} of a.rockers){
    if(bias!==a.camBias)cut(bias);
    rocker.rotation.x=-side*pose.leftInner.stroke;
  }
  a.camBias=bias;
}
