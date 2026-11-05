import test from 'node:test';
import assert from 'node:assert/strict';
import {pitchHuntingVerdict} from '../grader/pitch-stability.mjs';
const trace=fn=>Array.from({length:1600},(_,i)=>({time:(i+1)/20,pitch:fn((i+1)/20)*Math.PI/180}));
test('small wingbeat motion and gradual trim changes are accepted',()=>{
  assert.equal(pitchHuntingVerdict(trace(t=>5+3*Math.sin(2*Math.PI*t)+t*.04)).pass,true);
  assert.equal(pitchHuntingVerdict(trace(t=>t*.5)).pass,true);
});
test('repeated slow large pitch surges fail despite superimposed wingbeat motion',()=>{
  const result=pitchHuntingVerdict(trace(t=>3+23*Math.sin(2*Math.PI*t/10)+3*Math.sin(2*Math.PI*t)));
  assert.equal(result.pass,false);assert.ok(result.detail.reversals.length>=4);
});
test('one transient excursion is not called persistent pitch hunting',()=>{
  assert.equal(pitchHuntingVerdict(trace(t=>25*Math.exp(-(((t-35)/4)**2)))).pass,true);
});
test('missing, discontinuous and non-finite observations cannot pass',()=>{
  assert.equal(pitchHuntingVerdict([]).pass,false);
  const valid=trace(()=>0);
  assert.equal(pitchHuntingVerdict(valid.slice(0,100)).pass,false);
  const broken=valid.slice();broken[700]={time:35.05,pitch:NaN};
  assert.equal(pitchHuntingVerdict(broken).pass,false);
  assert.equal(pitchHuntingVerdict(valid.filter(s=>s.time<40||s.time>41)).pass,false);
});
