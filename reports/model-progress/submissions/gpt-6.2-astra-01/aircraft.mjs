import {E} from './environment/engineering.mjs';
import {makePanel,planform,chordFactor,PANEL_NAMES} from './environment/source-mechanism.mjs';
import {wingPose} from './kinematics.mjs';

// Screen-printed sailcloth. Coordinates are fixed to the material, so the
// seams, inspection bands and lettering travel with each individual leaf.
function sailPrint(T,outer,leaf,left){
  if(typeof document==='undefined')return null;
  const cv=document.createElement('canvas');cv.width=1024;cv.height=512;
  const g=cv.getContext('2d');if(!g)return null;
  const fill=(color,x,y,w,h)=>{g.fillStyle=color;g.fillRect(x,y,w,h);};
  const ink='#174e53', red='#cb552d', w=cv.width,h=cv.height;
  fill(outer?'#edddad':'#f5e7c5',0,0,w,h);
  // Doped fabric over cap strips; slight value change between stitched bays.
  const n=outer?4:7,bay=w/n;
  for(let j=0;j<n;j++){
    const x=j*bay,shade=g.createLinearGradient(x,0,x+bay,0);
    shade.addColorStop(0,'rgba(110,76,33,.21)');shade.addColorStop(.06,'rgba(255,255,247,.35)');
    shade.addColorStop(.14,'rgba(255,255,247,.02)');shade.addColorStop(.85,'rgba(103,83,50,.015)');
    shade.addColorStop(1,'rgba(110,76,33,.12)');fill(shade,x,0,bay,h);
  }
  // Continuous leading-edge tape, widening into the reinforced distal cap.
  g.fillStyle=ink;g.beginPath();g.moveTo(0,0);g.lineTo(w,0);g.lineTo(w,outer&&leaf?118:52);
  g.lineTo(0,outer&&leaf?52:45);g.closePath();g.fill();
  fill('#bc994f',0,46,w,4);fill('#836b49',0,h-6,w,6);
  if(outer&&leaf){fill(red,.70*w,0,.075*w,h);fill(ink,.79*w,0,.025*w,h);fill(ink,.92*w,0,w*.08,h);}
  if(!outer){
    fill(ink,0,0,w*.055,h);fill(red,w*.063,0,w*.018,h);
    g.save();g.translate(w*.53,h*.59);if(left)g.scale(-1,1);
    g.fillStyle=ink;g.textAlign='center';g.font='600 55px sans-serif';g.fillText(left?'ST–07':'SEREIN',0,0);
    g.font='16px monospace';g.fillText(left?'EXPERIMENTAL   /   07':'K E S T R E L   W O R K S',0,27);
    g.restore();
  }
  for(let j=0;j<=n;j++){
    fill('rgba(251,240,202,.62)',j*bay-3,0,6,h);
    for(let y=6;y<h;y+=12)fill('rgba(73,60,39,.38)',j*bay-1,y,2,5);
  }
  for(let y=0;y<h;y+=4)fill('rgba(95,74,36,.035)',0,y,w,1);
  for(let x=0;x<w;x+=4)fill('rgba(255,255,224,.07)',x,0,1,h);
  const tx=new T.CanvasTexture(cv);tx.colorSpace=T.SRGBColorSpace;tx.anisotropy=4;return tx;
}

export function createAircraft(T,p){
  const root=new T.Group(),a={root,wheels:[],wingPanels:{},leaves:[],shuttles:[],wrists:[],links:[],rotors:[],steering:[]};
  root.name='ST-07 | Serein';
  const group=(parent,name)=>{const o=new T.Group();o.name=name;parent.add(o);return o;};
  const paint=(color,metalness=0,roughness=.57)=>new T.MeshStandardMaterial({color,metalness,roughness,side:T.DoubleSide});
  const enamel=paint(0x184d52,.32,.34), dark=paint(0x22353a,.45), alloy=paint(0x9ca9a6,.68,.31),
    warm=paint(0xce9751,.55,.36), cream=paint(0xe6d7ad,.12),signal=paint(0xc65332,.28,.38),
    rubber=paint(0x252a29,0,.95), leather=paint(0x543e31,.05,.8), linen=paint(0xd1bc97),
    suit=paint(0x3a6166),pants=paint(0x39444a), skin=paint(0xb9805f), glass=paint(0x294952,.55,.2);
  const V=(xyz)=>new T.Vector3(...xyz),up=V([0,1,0]);
  const mesh=(par,geo,mat,xyz=[0,0,0])=>{
    const m=new T.Mesh(geo,mat);m.position.set(...xyz);par.add(m);return m;
  };
  const oval=(par,xyz,scale,mat)=>{
    const m=mesh(par,new T.SphereGeometry(1,16,12),mat,xyz);m.scale.set(...scale);return m;
  };
  const box=(par,xyz,size,mat)=>mesh(par,new T.BoxGeometry(...size),mat,xyz);
  function align(o,from,to){
    const delta=V(to).sub(V(from));o.position.copy(V(from)).addScaledVector(delta,.5);
    o.quaternion.setFromUnitVectors(up,delta.clone().normalize());return delta.length();
  }
  const rod=(par,from,to,r,mat,rEnd=r,n=10)=>{
    const m=mesh(par,new T.CylinderGeometry(rEnd,r,V(to).distanceTo(V(from)),n),mat);
    align(m,from,to);return m;
  };
  const chain=(par,points,r,mat)=>{for(let i=1;i<points.length;i++)rod(par,points[i-1],points[i],r,mat);};
  function ring(par,xyz,R,r,mat,n=32){
    return mesh(par,new T.TorusGeometry(R,r,8,n),mat,xyz);
  }
  function surface(par,vertices,idx,mat){
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
    geo.setIndex(idx);geo.computeVertexNormals();return mesh(par,geo,mat);
  }
  // Hollow canoe shell, elliptical frames in x-stations. Vary the opening
  // rather than concealing the seated pilot inside a solid ellipsoid.
  const hull=group(root,'Bicolour monocoque & coaming');
  const stations=[[-1.1,-.25,.055,.08,.1],[-.78,-.31,.23,.22,.64],[-.36,-.33,.34,.34,.97],
    [.36,-.38,.38,.38,1.04],[.94,-.4,.39,.46,1.20],[1.46,-.44,.36,.42,1.07],
    [1.78,-.44,.28,.39,.1],[2.16,-.48,.21,.28,.06],[2.48,-.5,.08,.13,.02],[2.57,-.51,.018,.035,.01]];
  function hullPt(st,f){
    const [x,y,rz,ry,gap]=st,b=gap+f*(2*Math.PI-2*gap);return [x,y+ry*Math.cos(b),rz*Math.sin(b)];
  }
  for(const [lo,hi,mat] of [[0,.15,enamel],[.15,.167,warm],[.167,.833,cream],[.833,.85,warm],[.85,1,enamel]]){
    const v=[],idx=[],n=Math.max(2,Math.round((hi-lo)*40));
    for(let j=0;j<stations.length;j++)for(let i=0;i<=n;i++){
      v.push(...hullPt(stations[j],lo+(hi-lo)*i/n));const k=j*(n+1)+i;
      if(j&&i)idx.push(k-n-2,k-n-1,k,k-n-2,k,k-1);
    }surface(hull,v,idx,mat);
  }
  for(const u of [0,1])chain(hull,stations.map(st=>hullPt(st,u)),.016,warm);
  for(const st of [stations[2],stations[4],stations[6]]){
    chain(hull,Array.from({length:13},(_,i)=>hullPt(st,i/12)),.013,alloy);
  }
  const frame=group(root,'Warren frame · carry-through bulkheads');
  // An open triangular tail truss, broad at its forward carry-through and
  // narrow at the empennage. Crossed diagonals are tension stays.
  const truss=[[-3.22,.02,.06,.10],[-2.52,.04,.13,.24],[-1.84,.07,.21,.38],[-1.12,.11,.27,.49],[-.36,.17,.31,.61]];
  for(let i=0;i<truss.length;i++){
    const [x,y,z,d]=truss[i],bot=[x,y-d,0];
    rod(frame,[x,y,-z],[x,y,z],.023,alloy);
    for(const side of [-1,1]){
      const top=[x,y,side*z];rod(frame,top,bot,.018,alloy);
      if(i){const [X,Y,Z,D]=truss[i-1];
        rod(frame,[X,Y,side*Z],top,.032,enamel);
        rod(frame,[X,Y-D,0],top,.016,warm);
        rod(frame,[X,Y,side*Z],bot,.009,dark);
        if(side===1)rod(frame,[X,Y-D,0],bot,.029,enamel);
      }
    }
  }
  for(const side of [-1,1]){
    const z=side*.32;
    chain(frame,[[-.87,-.35,z],[-.32,.74,z],[.38,.73,z],[.88,-.34,z],[1.93,-.64,z*.65]],.031,dark);
    rod(frame,[-.55,-.45,z],[.38,.73,z],.022,alloy);
    rod(frame,[.38,.73,z],[-.36,.17,z],.014,warm);
    rod(frame,[-.65,.8,side*.25],[.65,.8,side*.25],.036,alloy);
    for(const x of [-.54,.53]){
      box(frame,[x,.76,side*.25],[.074,.11,.1],enamel);
      if(side===1)rod(frame,[x,.73,-.30],[x,.73,.30],.023,dark);
    }
  }
  const gear=group(root,'Undercarriage · oleos & torque links');
  for(const [x,y,z] of p.gear_centres){
    const side=Math.sign(z)||1,zk=z-side*.075;
    if(z){
      rod(gear,[.44,-.55,side*.29],[x,y,zk],.033,dark,.026);
      rod(gear,[-.85,-.3,side*.26],[x,y,zk],.027,enamel);
      rod(gear,[-.38,-.51,side*.31],[x,y+.15,zk],.049,alloy,.035);
      rod(gear,[x,y+.19,zk],[x,y,zk],.022,warm);
    }else{
      rod(gear,[1.81,-.49,0],[x-.04,y+.18,0],.052,enamel,.038);
      for(const d of [-1,1])rod(gear,[x-.07,y+.24,d*.077],[x,y,d*.077],.024,alloy);
    }
    const radius=p.wheel_radius_m;
    const tyre=ring(root,[x,y,z],radius*.78,radius*.22,rubber,40);
    tyre.name=z?'Main tyre':'Nose tyre';a.wheels.push(tyre);
    const wheel=group(tyre,'Wire wheel');
    ring(wheel,[0,0,0],radius*.58,.014,alloy);
    rod(wheel,[0,0,-.064],[0,0,.064],.041,enamel,.041,16);
    for(let i=0;i<12;i++){
      const b=i*Math.PI/6;
      rod(wheel,[0,0,.041*(i%2?1:-1)],[.137*Math.cos(b),.137*Math.sin(b),0],.006,alloy);
    }
    rod(gear,[x,y,z-.088],[x,y,z+.088],.019,warm);
  }

  // Thin lenticular tail panels built as perimeter lofts; distinct hinges
  // instead of rotating the whole empennage for every steering input.
  function foil(par,bound,mat,thick,fin=false){
    const v=[],idx=[],n=bound.length,c=bound.reduce((a,b)=>[a[0]+b[0]/n,a[1]+b[1]/n],[0,0]);
    const pt=([x,b],offset)=>fin?[x,b,offset]:[x,offset,b];
    v.push(...pt(c,thick));for(const xy of bound)v.push(...pt(xy,0));
    v.push(...pt(c,-thick));
    for(let i=0;i<n;i++){const j=1+(i+1)%n;idx.push(0,i+1,j,n+1,j,i+1);}
    return surface(par,v,idx,mat);
  }
  const tail=group(root,'Tailplane • fixed incidence');tail.position.set(-2.84,.11,0);
  tail.rotation.z=E.coupled.tail_incidence_rad;
  for(const side of [-1,1]){
    foil(tail,[[.49,0],[.36,side*.62],[.11,side*1.30],[-.09,side*1.46],[-.17,side*1.45],[-.17,0]],cream,.047);
    rod(frame,[-2.39,-.14,0],[-2.89,.12,side*1.04],.014,alloy);
    rod(tail,[.36,0,side*.62],[.11,0,side*1.3],.013,enamel);
  }
  a.elevator=group(tail,'elevator');a.elevator.position.x=-.18;
  foil(a.elevator,[[0,-1.45],[-.1,-1.41],[-.25,-1.12],[-.33,-.37],[-.34,.37],[-.25,1.12],[-.1,1.41],[0,1.45]],enamel,.027);
  const fin=group(root,'Swept vertical stabilizer');fin.position.set(-3.02,.10,0);
  foil(fin,[[.89,0],[.57,.14],[.20,.67],[.06,.84],[0,.86],[0,-.06]],cream,.045,true);
  rod(fin,[.57,.14,0],[.2,.67,0],.014,warm);
  a.rudder=group(fin,'rudder');
  foil(a.rudder,[[-.014,-.08],[-.014,.86],[-.14,.89],[-.26,.82],[-.34,.61],[-.38,.19],[-.32,-.06]],enamel,.026,true);
  for(const y of [.18,.63])rod(fin,[0,y-.042,0],[0,y+.042,0],.026,warm);
  foil(a.rudder,[[-.019,.67],[-.308,.59],[-.297,.66],[-.019,.745]],signal,.031,true);
  for(const side of [-1,1]){
    const guide=[-2.52,.20,side*.165];
    chain(frame,[[1.7,-.68,side*.18],[.70,-.45,side*.29],[-.88,-.22,side*.29],guide],.0065,dark);
    rod(frame,[-2.52,.04,side*.13],guide,.011,alloy);
    rod(a.rudder,[-.115,.10,0],[-.115,.10,side*.15],.018,warm,.013);
    const cable=mesh(root,new T.CylinderGeometry(.006,.006,1,6),dark);
    a.steering.push({guide,side,cable});
  }

  // Single cylinder, fin stack, intake, exhaust can and two-stage drive.
  const motor=group(root,'Engine installation');
  oval(motor,[-.63,-.03,0],[.24,.22,.25],alloy);
  rod(motor,[-.68,-.02,-.23],[-.68,-.02,.25],.168,dark,.168,20);
  const cylinder=group(motor,'Finned barrel');cylinder.position.set(-.66,.06,0);cylinder.rotation.z=.33;
  rod(cylinder,[0,0,0],[0,.35,0],.116,dark);
  for(let i=0;i<7;i++)rod(cylinder,[0,.06+i*.043,0],[0,.073+i*.043,0],.153,alloy,.153,16);
  box(cylinder,[0,.37,0],[.21,.06,.21],enamel);rod(cylinder,[0,.38,0],[0,.46,0],.024,cream);
  chain(motor,[[-.81,.24,.03],[-1.04,.25,.14],[-1.13,.09,.21],[-1.05,-.09,.26],[-1.3,-.13,.26]],.047,warm);
  rod(motor,[-1.26,-.13,.26],[-1.73,-.09,.23],.086,dark,.067,16);
  rod(motor,[-1.72,-.09,.23],[-1.81,-.095,.23],.035,alloy);
  oval(motor,[-.55,-.26,.12],[.25,.13,.17],signal);
  const wheelDrive=(par,x,y,z,R,mat)=>{
    const g=group(par,'Drive sheave');g.position.set(x,y,z);
    ring(g,[0,0,0],R-.012,.016,mat);
    rod(g,[0,0,-.034],[0,0,.034],.036,warm);
    for(let i=0;i<5;i++)rod(g,[0,0,0],[R*Math.cos(i*2*Math.PI/5),R*Math.sin(i*2*Math.PI/5),0],.013,mat);
    return g;
  };
  a.rotors.push(wheelDrive(motor,-.68,-.02,.28,.11,alloy),wheelDrive(motor,-.19,.33,.28,.218,enamel));
  for(const side of [-1,1])rod(motor,[-.68-.078*side,-.02+.078*side,.28],[-.19-.156*side,.33+.156*side,.28],.018,rubber);
  rod(motor,[-.19,.33,-.20],[-.19,.33,.29],.065,alloy);
  box(motor,[-.18,.38,0],[.28,.24,.25],enamel);
  rod(motor,[-.22,.40,0],[-.22,.60,0],.084,alloy);
  rod(motor,[-.36,.57,0],[.20,.57,0],.062,dark);
  // Spun fuel cell strapped to its saddle, with filler and protected line
  // to the engine. The warm tank finish contrasts with the cold gearbox.
  oval(motor,[.32,-.054,0],[.194,.097,.083],warm);
  rod(motor,[.39,.018,0],[.39,.063,0],.031,alloy);
  rod(motor,[.39,.061,0],[.39,.078,0],.037,enamel);
  for(const x of [.23,.41]){
    const strap=ring(motor,[x,-.054,0],.083,.008,dark,20);strap.rotation.y=Math.PI/2;
    strap.scale.y=1.09;strap.scale.x=.94;
    rod(motor,[x,-.14,-.083],[x,-.14,.083],.017,enamel);
  }
  chain(motor,[[.18,-.09,.042],[.08,-.17,.18],[-.29,-.16,.18],[-.51,.11,.13]],.012,rubber);

  // A tailored seated figure; torso and helmet have their own section
  // profiles (shoulders, waist, chin, crown) rather than a capsule stack.
  const pilot=a.pilot=group(root,'pilot');
  pilot.position.set(1.01,-.37,0);
  const cockpit=group(root,'Pilot cradle and controls');
  box(cockpit,[1.04,-.44,0],[.46,.085,.42],leather);
  const back=box(cockpit,[.83,-.17,0],[.084,.54,.42],leather);back.rotation.z=.21;
  function form(par,rows,mat,n=16){
    const v=[],idx=[];for(let j=0;j<rows.length;j++){
      const [y,x,rx,rz]=rows[j];for(let i=0;i<n;i++){
        const t=2*Math.PI*i/n;v.push(x+rx*Math.cos(t),y,rz*Math.sin(t));
        const k=j*n+i,next=j*n+(i+1)%n;if(j)idx.push(k-n,k,next,next,next-n,k-n);
      }
    }return surface(par,v,idx,mat);
  }
  form(pilot,[[-.035,0,.14,.17],[.07,-.008,.13,.185],[.18,-.034,.132,.157],[.36,-.068,.158,.20],
    [.46,-.085,.13,.217],[.50,-.09,.07,.105]],suit);
  rod(pilot,[-.091,.47,0],[-.09,.59,0],.065,skin);
  form(pilot,[[.544,-.051,.071,.067],[.57,-.059,.088,.086],[.64,-.068,.107,.091],
    [.72,-.079,.105,.096],[.766,-.084,.078,.069]],skin);
  oval(pilot,[.038,.648,0],[.035,.041,.028],skin);
  form(pilot,[[.674,-.09,.116,.104],[.725,-.08,.124,.111],[.781,-.089,.098,.092],
    [.813,-.09,.053,.050],[.823,-.09,.009,.008]],cream,20);
  oval(pilot,[.02,.691,0],[.045,.04,.096],glass);
  for(const side of [-1,1]){
    const z=side*.106;
    rod(pilot,[-.09,.663,.86*z],[-.09,.663,1.12*z],.053,leather);
    rod(pilot,[-.09,.663,1.12*z],[-.09,.663,1.21*z],.039,enamel);
    chain(pilot,[[-.066,.63,z],[-.018,.562,.72*z],[.012,.56,.42*z]],.009,leather);
    // Webbing follows suit contour down to a central lap buckle.
    chain(pilot,[[-.105,.48,side*.133],[.028,.438,side*.117],[.077,.329,side*.103],[.096,.16,side*.052]],.022,linen);
    rod(pilot,[.013,.059,side*.15],[.11,.14,side*.035],.023,leather);
    const thigh=[.36,-.085,side*.137],ankle=[.62,-.368,side*.152];
    rod(pilot,[.029,.016,side*.103],thigh,.104,pants,.08,14);oval(pilot,thigh,[.086,.081,.08],pants);
    rod(pilot,thigh,ankle,.076,pants,.053,14);
    oval(pilot,[ankle[0]+.052,-.386,ankle[2]],[.126,.060,.067],leather);
    rod(cockpit,[1.60,-.82,side*.12],[1.75,-.76,side*.12],.029,dark);
    const shoulder=[-.068,.414,side*.19],elbow=[.046,.22,side*.221],wrist=[.285,.267,side*.112];
    oval(pilot,shoulder,[.081,.077,.080],suit);
    rod(pilot,shoulder,elbow,.077,suit,.062);oval(pilot,elbow,[.064,.062,.062],suit);
    rod(pilot,elbow,wrist,.063,suit,.044);
    oval(pilot,[.296,.272,side*.107],[.054,.039,.041],leather);
  }
  box(pilot,[.108,.143,0],[.024,.064,.09],warm);
  chain(cockpit,[[1.25,-.57,0],[1.3,-.12,0],[1.3,-.10,.12]],.019,dark);
  rod(cockpit,[1.3,-.10,-.13],[1.3,-.10,.13],.024,leather);
  const binnacle=box(cockpit,[1.60,-.17,0],[.08,.16,.38],enamel);binnacle.rotation.z=-.19;
  for(const z of [-.105,0,.105]){
    rod(cockpit,[1.535,-.158,z],[1.558,-.158,z],.045,alloy);
    rod(cockpit,[1.531,-.158,z],[1.536,-.158,z],.037,rubber);
    rod(cockpit,[1.53,-.159,z],[1.529,-.136,z+.012],.003,cream);
  }
  // Laminated flyscreen: a curved, raked segment with a narrow gasket. The
  // pilot is still in an open cockpit; the screen stops below his sightline.
  const screen=paint(0x9dd2cc,.10,.18);screen.transparent=true;screen.opacity=.28;screen.depthWrite=false;
  {
    const v=[],ix=[],rim=[],sill=[];
    for(let i=0;i<=14;i++){
      const t=Math.PI*i/14,k=Math.sin(t),z=.313*Math.cos(t);
      const lower=[1.42+.37*k,-.23+.194*k,z],upper=[1.40+.25*k,-.205+.49*k,z];
      v.push(...lower,...upper);rim.push(upper);sill.push(lower);
      if(i)ix.push(2*i-2,2*i,2*i+1,2*i-2,2*i+1,2*i-1);
    }
    surface(cockpit,v,ix,screen);chain(cockpit,rim,.008,alloy);chain(cockpit,sill,.012,enamel);
  }

  buildWings();
  function buildWings(){
    const g=planform(p);a.plan=g;
    for(const name of PANEL_NAMES){
      const outer=name.endsWith('Outer'),left=name.startsWith('left'),side=left?-1:1,count=outer?2:4;
      const panel=a[name]=group(root,name),surf=a[name+'Surface']=group(panel,name+'Surface');
      a.wingPanels[name]=[];
      for(let leaf=0;leaf<(outer?2:1);leaf++){
        const geo=makePanel(T,p,name,leaf),mat=paint(0xfff6df,.04,.78);
        mat.map=sailPrint(T,outer,leaf,left);if(!mat.map)mat.color.setHex(leaf?0xe5c998:0xefdfb8);
        const uv=[];for(let j=0;j<=count;j++)for(let i=0;i<3;i++)uv.push(j/count,1-i/2);
        geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));const sheet=mesh(surf,geo,mat);
        sheet.name=name+(outer?(leaf?' · slider':' · socket'):' · arm fabric');a.wingPanels[name].push(sheet);
        // Independent detail frames; the host's material-point surfaces above
        // remain identity meshes. Interior ribs carry depth BELOW the skin.
        const carrier=group(root,'Articulated spar');const ribs=group(carrier,'Section ribs');
        const v=outer?E.wing.camber_outer_base:E.wing.camber_inner_base;
        const depth=outer?E.wing.outer_thickness_fraction:E.wing.inner_thickness_fraction;
        const chord=t=>{
          if(!outer)return g.chord;
          const k=(leaf+t)*2,i=Math.min(3,Math.floor(k)),f=k-i;
          return g.chord*(chordFactor(i/4)*(1-f)+chordFactor((i+1)/4)*f);
        };
        const width=outer?g.outer/2:g.inner;
        function pt(t,u,ofs=0){
          const c=chord(t);return [(.25-u)*c,((1-Math.abs(2*u-1))*v+ofs)*c,side*t*width];
        }
        // Cap strips and tie members. Slightly relieved from sailcloth to
        // avoid coplanar flicker as the skin cambers under load.
        const N=outer?4:7;
        for(let j=0;j<=N;j++){
          const t=j/N;
          chain(ribs,[pt(t,0),pt(t,.23,-depth*.8),pt(t,.5,-depth),pt(t,1)],outer?.009:.014,cream);
          if(!outer)rod(ribs,pt(t,.23,-depth*.8),pt(t,.68,-.008),.008,warm);
          if(j)for(const [u,ofs,r] of [[.035,-depth*.16,outer?.014:.024],[.26,-depth*.72,outer?.018:.032],[.73,-depth*.40,.012]]){
            rod(ribs,pt((j-1)/N,u,ofs),pt(t,u,ofs),r,u===.035?enamel:dark);
          }
        }
        a.leaves.push({carrier,ribs,outer,side,name,leaf,chord,width});
      }
      if(!outer){
        const block=group(root,'Trunnion carriage');block.position.set(0,E.wing.root_height_m,side*g.hinge);
        rod(block,[-.135,0,0],[.135,0,0],.081,warm,.081,16);
        for(const x of [-.14,.14])rod(block,[x-.015,0,0],[x+.015,0,0],.088,enamel);
        a.shuttles.push({block,name});
        const crank=group(root,'Eccentric rocker drive');crank.position.set(side*.10,.57,0);
        const arm=rod(crank,[0,0,0],[0,0,side*.162],.036,warm);arm.name='Crank web';
        rod(crank,[-.055,0,side*.162],[.055,0,side*.162],.032,alloy);
        const link=mesh(root,new T.CylinderGeometry(.021,.025,1,10),alloy);
        const collar=oval(root,[0,0,0],[.052,.06,.061],enamel);
        a.links.push({crank,link,collar,side,name});
        // Sliding wrist clevis. The hand can lead or trail the arm without
        // asking the two fabric edges to act as a load-bearing joint.
        const wrist=group(root,'Wrist fork & fore/aft guide');
        rod(wrist,[-.59,0,0],[.58,0,0],.029,alloy);
        for(const x of [-.49,.43]){
          rod(wrist,[x,-.02,0],[x,.02,-.09*side],.042,enamel);
          rod(wrist,[x-.027,0,0],[x+.027,0,0],.049,warm);
        }
        const sleeve=group(wrist,'Hand spar bearing');
        rod(sleeve,[-.093,0,0],[.093,0,0],.053,enamel);
        for(const x of [-.08,.08])rod(sleeve,[x-.008,0,0],[x+.008,0,0],.058,warm);
        a.wrists.push({wrist,sleeve,side,name});
      }
    }
  }

  // Batch stationary detail in each local frame. The moving trunnions,
  // control surfaces, crank, three actual tyres and six cloth meshes remain
  // independent nodes. No per-frame mesh allocation.
  function pack(par){
    const bags=new Map();
    for(const m of par.children.slice()){
      if(!m.isMesh)continue;
      let bag=bags.get(m.material);if(!bag){bag={v:[],n:[],ix:[]};bags.set(m.material,bag);}
      m.updateMatrix();const geo=m.geometry.clone().applyMatrix4(m.matrix),pos=geo.getAttribute('position');
      const base=bag.v.length/3;bag.v.push(...pos.array);bag.n.push(...geo.getAttribute('normal').array);
      if(geo.index){for(const j of geo.index.array)bag.ix.push(base+j);}
      else for(let j=0;j<pos.count;j++)bag.ix.push(base+j);
      par.remove(m);geo.dispose();m.geometry.dispose();
    }
    for(const [mat,{v,n,ix}] of bags){
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(v,3));
      geo.setAttribute('normal',new T.Float32BufferAttribute(n,3));geo.setIndex(ix);mesh(par,geo,mat);
    }
  }
  for(const par of [frame,hull,gear,motor,cylinder,tail,fin,a.rudder,a.elevator,cockpit,pilot,
    ...a.wheels.map(w=>w.children[0]),...a.leaves.map(l=>l.ribs),...a.rotors,...a.links.map(l=>l.crank),
    ...a.shuttles.map(l=>l.block),...a.wrists.flatMap(w=>[w.wrist,w.sleeve])])pack(par);
  // The spars' relative morph is exactly the change in ordinate of the
  // three-point fabric profile, so the caps stay at depth as camber changes.
  for(const l of a.leaves)for(const m of l.ribs.children){
    const geo=m.geometry,pos=geo.getAttribute('position'),dy=new Float32Array(pos.count*3);
    for(let i=0;i<pos.count;i++){
      const t=Math.max(0,Math.min(1,pos.getZ(i)*l.side/l.width)),c=l.chord(t);
      const u=.25-pos.getX(i)/c;
      dy[i*3+1]=Math.max(0,1-Math.abs(2*u-1))*c*
        (l.outer?E.wing.camber_outer_amplitude:E.wing.camber_inner_amplitude);
    }
    geo.morphAttributes.position=[new T.BufferAttribute(dy,3)];geo.morphTargetsRelative=true;m.updateMorphTargets();
  }
  a.align=align;
  return a;
}

export function updateAircraft(a,s,c){
  const pose=wingPose(s),g=a.plan,phase=s.gliding?0:s.phase;
  for(const {name,side,leaf,outer,carrier,ribs} of a.leaves){
    const v=pose[name],inn=pose[side<0?'leftInner':'rightInner'];
    const stroke=inn.stroke+(outer?v.stroke:0);
    const offset=leaf?(v.exposure-.5)*g.outer:0,dy=leaf?-.008*Math.cos(v.twist):0;
    carrier.position.set(v.sweep+(leaf?.008*Math.sin(v.twist):0),
      E.wing.root_height_m+(outer?g.inner*Math.sin(inn.stroke):0)+offset*Math.sin(stroke)+dy*Math.cos(stroke),
      side*(g.hinge+(outer?g.inner*Math.cos(inn.stroke):0)+offset*Math.cos(stroke)-dy*Math.sin(stroke)));
    carrier.rotation.x=-side*stroke;ribs.rotation.z=v.twist;
    const b=outer?E.wing.camber_outer_base:E.wing.camber_inner_base;
    const amp=outer?E.wing.camber_outer_amplitude:E.wing.camber_inner_amplitude;
    for(const m of ribs.children)m.morphTargetInfluences[0]=(v.camber-b)/amp;
  }
  for(const {block,name} of a.shuttles)block.position.x=pose[name].sweep;
  for(const {wrist,sleeve,name,side} of a.wrists){
    const v=pose[name],hand=pose[side<0?'leftOuter':'rightOuter'];
    wrist.position.set(v.sweep,E.wing.root_height_m+g.inner*Math.sin(v.stroke),side*(g.hinge+g.inner*Math.cos(v.stroke)));
    wrist.rotation.x=-side*v.stroke;sleeve.position.x=hand.sweep-v.sweep;
  }
  for(const {crank,link,collar,side,name} of a.links){
    const v=pose[name],r=.62;
    crank.rotation.x=side*phase;
    const pin=[crank.position.x,.57-.162*Math.sin(phase),side*.162*Math.cos(phase)];
    const rocker=[v.sweep,E.wing.root_height_m+r*Math.sin(v.stroke)-.06,side*(g.hinge+r*Math.cos(v.stroke))];
    link.scale.y=a.align(link,pin,rocker);collar.position.set(...rocker);
  }
  a.rotors[0].rotation.z=phase*8;a.rotors[1].rotation.z=phase*4;
  for(const wheel of a.wheels)wheel.rotation.z=s.wheel_angle??0;
  a.rudder.rotation.y=(c.rudder??0)*.45;
  const cs=Math.cos(a.rudder.rotation.y),sn=Math.sin(a.rudder.rotation.y);
  for(const {cable,guide,side} of a.steering){
    cable.scale.y=a.align(cable,guide,[-3.02-.115*cs+side*.15*sn,.20,.115*sn+side*.15*cs]);
  }
  a.elevator.rotation.z=-(c.pitch??0)*.32;
}
