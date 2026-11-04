import test from 'node:test';
import assert from 'node:assert/strict';
import {PHYSICS_DT,FRAME_MS,copyPose,interpolatePose,chaseView,nextFrameDeadline} from '../candidate/mechanical-v4/scaffold/environment/view-motion.mjs';

const state=(x=0,heading=0)=>({position:[x,50,0],velocity:[12,0,0],pitch:0,roll:0,heading,phase:0,time:x/12,status:'flying'});
const vector=()=>({x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}});

test('chase camera stays centred behind the aircraft through turns and translation',()=>{
  const eye=vector(),target=vector();
  for(const heading of [-Math.PI,-2,-.3,0,.9,Math.PI]){
    for(const x of [-100,0,2000]){
      const position={x,y:50,z:600};chaseView(position,heading,1,()=>0,eye,target);
      const dx=eye.x-x,dz=eye.z-position.z;
      assert.ok(Math.abs(dx*(-Math.sin(heading))+dz*Math.cos(heading))<1e-10,'no side offset');
      assert.ok(Math.abs(dx*Math.cos(heading)+dz*Math.sin(heading)+7.8)<1e-10,'behind rather than ahead');
      assert.ok(Math.abs(eye.y-position.y-2.8)<1e-10);
      assert.ok(Math.abs((target.x-x)*(-Math.sin(heading))+(target.z-position.z)*Math.cos(heading))<1e-10);
    }
  }
});

test('camera and visible aircraft use one continuous pose at varying refresh rates',()=>{
  for(const hz of [30,60,90,120,144,165]){
    let current=state(),previous=copyPose(current),render=copyPose(current),accumulator=0,deadline=0,draws=0;
    const step=1/hz;
    for(let frame=1;frame<=hz*2;frame++){
      const now=frame*step;accumulator+=step;
      while(accumulator>=PHYSICS_DT){copyPose(current,previous);current=state(current.position[0]+12*PHYSICS_DT);accumulator-=PHYSICS_DT;}
      if(now*1000+.5<deadline)continue;
      deadline=nextFrameDeadline(now*1000,deadline);draws++;
      const before=JSON.stringify(current);interpolatePose(previous,current,accumulator/PHYSICS_DT,render);
      assert.equal(JSON.stringify(current),before,'display interpolation cannot change physics');
      assert.ok(Math.abs(render.position[0]-12*Math.max(0,now-PHYSICS_DT))<1e-8,'linear movement has no fixed-step jumps');
      const eye=vector(),target=vector();chaseView({x:render.position[0],y:50,z:0},render.heading,1,()=>0,eye,target);
      assert.ok(Math.abs(eye.x-render.position[0]+7.8)<1e-10,'camera has no independent translational lag');
    }
    assert.ok(Math.abs(draws-Math.min(hz,60)*2)<=1,`${hz} Hz should not collapse to 48/55 fps: ${draws}`);
  }
});

test('circular angles cross the wrap boundary without a full-turn camera jump',()=>{
  const a=state(0,Math.PI-.02),b=state(0,-Math.PI+.02),out=copyPose(b);
  a.phase=2*Math.PI-.02;b.phase=.02;
  interpolatePose(a,b,.5,out);
  assert.ok(Math.abs(out.heading-Math.PI)<1e-10);
  assert.ok(Math.abs(out.phase-2*Math.PI)<1e-10);
});

test('frame deadlines retain remainder under irregular callbacks without catch-up draw bursts',()=>{
  let deadline=0,now=0,draws=0;
  const intervals=[7,9,11,8,14,6,12,10];
  for(let i=0;i<2000;i++){
    now+=intervals[i%intervals.length];
    if(now+.5>=deadline){draws++;const old=deadline;deadline=nextFrameDeadline(now,deadline);assert.ok(deadline>old);}
  }
  assert.ok(Math.abs(draws-now/FRAME_MS)<=1);
  assert.ok(nextFrameDeadline(now+2000,deadline)>now+2000,'skip missed deadlines after a stall');
});
