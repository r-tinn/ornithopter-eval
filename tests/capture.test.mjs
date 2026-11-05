import test from 'node:test';
import assert from 'node:assert/strict';
import {recordingFormat,cinematicView} from '../candidate/mechanical-v7/scaffold/environment/capture.mjs';

test('video format selection falls back across available encoders and unsupported browsers',()=>{
  const only=mime=>({isTypeSupported:entry=>entry===mime});
  assert.deepEqual(recordingFormat(only('video/mp4')),{mime:'video/mp4',extension:'mp4'});
  assert.deepEqual(recordingFormat(only('video/webm;codecs=vp8')),{mime:'video/webm;codecs=vp8',extension:'webm'});
  assert.equal(recordingFormat(null),null);
});

test('cinematic framing follows one pose continuously without changing aircraft state',()=>{
  const vector=()=>({set(x,y,z){Object.assign(this,{x,y,z});return this;}});
  const eye=vector(),target=vector(),position={x:20,y:100,z:-165},before=JSON.stringify(position);
  for(const heading of [-Math.PI,-1,0,1,Math.PI]){
    let previous=null;
    for(let t=0;t<=20;t+=.1){
      cinematicView(position,heading,14,t,eye,target);
      assert.equal(JSON.stringify(position),before);
      assert(Math.abs(Math.hypot(eye.x-position.x,eye.z-position.z)-14*1.85)<1e-10);
      assert(eye.y>position.y);
      if(previous)assert(Math.hypot(eye.x-previous.x,eye.z-previous.z)<.07);
      previous={...eye};
    }
  }
});
