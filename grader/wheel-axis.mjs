// One binary predicate, evaluated on actual tyre mesh geometry in an isolated browser.
// Self-contained so Playwright can serialize it into the browser without trusting declarations.
export async function wheelRotationAxis({submission_url}){
  const detail={tolerance_deg:1,speed_m_s:10,attitude_rad:[0,0,0],steering:0,samples:[]};
  try{
    const T=await import(submission_url+'/environment/vendor/three.module.min.js');
    const A=await import(submission_url+'/aircraft.mjs'),P=await import(submission_url+'/physics.mjs');
    const aircraft=A.createAircraft(T,P.parameters),wheels=aircraft?.wheels;
    if(!aircraft?.root?.isObject3D||!Array.isArray(wheels)||wheels.length!==3||new Set(wheels).size!==3||wheels.some(w=>!w?.isMesh||aircraft.root.getObjectById(w.id)!==w))throw Error('Return three distinct actual tyre meshes below the aircraft root');
    const radius=P.parameters.wheel_radius_m;
    if(!Number.isFinite(radius)||radius<=0)throw Error('Invalid wheel radius');
    // The least-variance direction of a thin tyre's actual vertices is its axle.
    // Jacobi diagonalization handles baked geometry rotations and arbitrary local axes.
    function tyreAxis(geometry){
      const vertices=geometry.getAttribute('position');
      if(!vertices||vertices.count<6)throw Error('Tyre mesh has no measurable geometry');
      const mean=[0,0,0],M=Array.from({length:3},()=>[0,0,0]);
      for(let i=0;i<vertices.count;i++)for(let k=0;k<3;k++)mean[k]+=vertices.array[i*vertices.itemSize+k]/vertices.count;
      for(let i=0;i<vertices.count;i++){
        const v=[0,1,2].map(k=>vertices.array[i*vertices.itemSize+k]-mean[k]);
        if(!v.every(Number.isFinite))throw Error('Non-finite tyre vertices');
        for(let j=0;j<3;j++)for(let k=0;k<3;k++)M[j][k]+=v[j]*v[k]/vertices.count;
      }
      const Q=[[1,0,0],[0,1,0],[0,0,1]];
      for(let n=0;n<24;n++){
        let p=0,q=1;for(const [i,j] of [[0,2],[1,2]])if(Math.abs(M[i][j])>Math.abs(M[p][q])){p=i;q=j;}
        if(Math.abs(M[p][q])<1e-14)break;
        const angle=.5*Math.atan2(2*M[p][q],M[q][q]-M[p][p]),c=Math.cos(angle),s=Math.sin(angle),a=M[p][p],b=M[q][q],v=M[p][q];
        M[p][p]=c*c*a-2*s*c*v+s*s*b;M[q][q]=s*s*a+2*s*c*v+c*c*b;M[p][q]=M[q][p]=0;
        for(let k=0;k<3;k++)if(k!==p&&k!==q){const x=M[k][p],y=M[k][q];M[k][p]=M[p][k]=c*x-s*y;M[k][q]=M[q][k]=s*x+c*y;}
        for(let k=0;k<3;k++){const x=Q[k][p],y=Q[k][q];Q[k][p]=c*x-s*y;Q[k][q]=s*x+c*y;}
      }
      const order=[0,1,2].sort((a,b)=>M[a][a]-M[b][b]);
      if(!(M[order[1]][order[1]]>1e-12&&M[order[0]][order[0]]<.5*M[order[1]][order[1]]))throw Error('Tyre geometry must have an identifiable thin wheel plane');
      return new T.Vector3(...Q.map(row=>row[order[0]])).normalize();
    }
    const angleToZ=v=>Math.acos(Math.max(0,Math.min(1,Math.abs(v.z))))*180/Math.PI;
    const controls={throttle:1,pitch:0,bank:0,rudder:0,brake:0};
    for(const status of ['grounded','flying'])for(let i=0;i<=8;i++){
      const distance=i*Math.PI/4*radius;
      const state={position:[distance,status==='flying'?100:.82,0],velocity:[10,0,0],pitch:0,roll:0,heading:0,phase:.37,time:distance/10,status};
      A.updateAircraft(aircraft,state,controls);aircraft.root.updateMatrixWorld(true);
      const inverseRoot=new T.Matrix4().copy(aircraft.root.matrixWorld).invert();
      const axes=wheels.map((wheel,index)=>{
        const relative=new T.Matrix4().multiplyMatrices(inverseRoot,wheel.matrixWorld);
        const normal=tyreAxis(wheel.geometry).applyMatrix3(new T.Matrix3().getNormalMatrix(relative)).normalize();
        return {wheel:index,name:wheel.name,axis_in_aircraft:normal.toArray(),misalignment_deg:angleToZ(normal)};
      });
      detail.samples.push({status,distance_m:distance,time_s:distance/10,axes});
    }
    detail.max_misalignment_deg=Math.max(...detail.samples.flatMap(s=>s.axes.map(w=>w.misalignment_deg)));
    return {id:'wheel_rotation_axis',pass:Number.isFinite(detail.max_misalignment_deg)&&detail.max_misalignment_deg<=detail.tolerance_deg,detail};
  }catch(e){return {id:'wheel_rotation_axis',pass:false,detail:{...detail,error:String(e)}};}
}
