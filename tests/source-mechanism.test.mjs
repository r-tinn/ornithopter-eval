import test from 'node:test';
import assert from 'node:assert/strict';
import {E} from '../candidate/mechanical-v6/scaffold/environment/engineering.mjs';
import {geometry,mechanics} from '../candidate/mechanical-v6/scaffold/environment/source-mechanism.mjs';
// This tests supplied geometric bookkeeping on the trusted author pose, never model submissions.
// Import a copy with its relative engineering path resolved via a data-free fixture wrapper below.
const p={span_m:14,wing_area_m2:196/(7.4**2/6.61),wrist_span_fraction:.5,dry_mass_kg:173.9};
const pose=s=>Object.fromEntries(['leftInner','leftOuter','rightInner','rightOuter'].map(n=>{const outer=n.endsWith('Outer'),q=s.phase;return[n,{stroke:(outer?0:.08)-(outer?.36:.3)*Math.sin(q),twist:.06-(outer?.3:.13)*Math.cos(q),sweep:-(outer?.8:.4)*Math.sin(q),camber:outer?.045:.022,exposure:outer?(q===0?1:.65):1}]}));
test('overlap reduces exposure while retaining every moving mass',()=>{
  const open=geometry(p,pose({phase:0})),closed=geometry(p,pose({phase:Math.PI}));
  assert.ok(Math.abs(open.samples.reduce((a,s)=>a+s.area,0)-p.wing_area_m2)<1e-10);
  assert.ok(closed.samples.reduce((a,s)=>a+s.area,0)<p.wing_area_m2);
  assert.equal(open.masses.reduce((a,m)=>a+m.kg,0),30);
  assert.equal(closed.masses.reduce((a,m)=>a+m.kg,0),30);
});
test('moving geometry yields finite positive coupled inertia',()=>{
  // Smooth exposure for differentiation; do not use the discontinuous two-pose test above.
  const smooth=s=>{const v=pose(s);for(const n of ['leftOuter','rightOuter'])v[n].exposure=.825+.175*Math.cos(s.phase);return v};
  for(const phase of [0,.7,1.8,3.4,5.2]){const q=mechanics(p,{phase,omega:3,pitch_rate:.2,fuel_kg:3.6},smooth);assert.ok(q.A>0&&q.C>0&&q.A*q.C-q.B*q.B>0);assert.ok(q.samples.every(s=>s.velocity.every(Number.isFinite)));assert.equal(q.mass,177.5);assert.ok(q.ddc.every(Number.isFinite));}
});
