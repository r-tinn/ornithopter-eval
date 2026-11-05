# Banking evaluation and controller revision

**The old grader gave the aircraft an unsuitable pilot sequence.** It started
banking by absolute clock at 62 seconds, independent of height or time since
takeoff. It demanded the original 0.45 rad (~26 degrees) bank immediately and
kept it banked until the 70-second endpoint.

| Observation | GPT-6.1 Sol | GPT-6 Astra |
|---|---:|---:|
| Clearance when the old 60% profile starts banking | 4.53 m | 4.61 m |
| Time since confirmed sustained takeoff | 1.83 s | 1.84 s |
| Peak roll rate | 12.04 degrees/s | 12.04 degrees/s |
| Original 65% profile crash | 68.89 s | 68.91 s |
| Same 65% flight with banking disabled | Flying at 120 s | Flying at 120 s |
| Clearance at 120 s without bank | 62.37 m | 62.43 m |

The recorded states match exactly before the old bank starts, so this is a paired
controller counterfactual, not a repaired aircraft or a different launch. Banking
really reduces vertical lift; the ground impact is a real simulated response.
The unfair part was the clock-based low-altitude manoeuvre. A 12-degree/s roll
rate is not intrinsically a physics error; here it was unnecessarily abrupt and
combined with almost no height reserve. These observations do not prove every
aircraft equation correct or establish real-world airworthiness.

## Frozen revised pilot

Keep the 60/65/70% launch attempts, original engine/aircraft constants and crash
rules. Wait for at least **30 m tyre clearance for 3 continuous seconds**, speed
at least 14 m/s, and at least 5 seconds since confirmed sustained takeoff. Fail
if that readiness has not been achieved by 150 simulated seconds.

Smoothly roll into the **same original 0.45 rad bank** over 8 seconds, hold for
6 seconds, roll out over 8 seconds, then observe 8 seconds of recovery. Require
real bank above 0.25 rad for at least 3 continuous hold seconds, uninterrupted
airborne status, final bank magnitude below 0.08 rad and original clearance above
1 m. Do not grant height, speed, lift compensation or a hidden aircraft autopilot.
The aircraft may descend; this tests a finite manoeuvre with height reserve and
recovery. The generator's eight-minute budget is unchanged.

The reference sweep tested 20/30/40/50 m gates, 0.30/0.45 rad targets, multiple
roll-in durations and an unreachable gate. The chosen policy retains the larger
original bank angle, adds margin above the passing 20 m gate and reduces peak
reference roll rate to about 4.7 degrees/s. It was frozen before applying its
bank programme to the saved submissions. All author candidates and failures are
retained, including the intentionally unreachable gate, in
[raw study evidence](study/raw-evidence.zip); [readable summary](study/summary.json).

## Validation and scope

- Corrected author reference: **7/7** task checks pass.
- Same portfolio/controller: passes **8/8** author contact/timestep variants.
- All previous nine faults remain rejected; a new roll-input-ignored mutant is
  also rejected. Actual banking is mandatory; postponing it forever cannot pass.
- Original and v1 power probes match their archived implementations exactly.
- Python regression suite: 112 tests pass.

See [behavior assertions](behavior.json), [positive report](positive/report.json),
[negative calibration](negative/summary.json) and the
[versioned protocol](../../docs/grading-revisions/v7-launch-60-65-70-bank-v2.md).
All saved model physics, source packets and earlier grades remain unchanged.
These are local calibration/diagnostic runs with zero model API calls, not fresh
model generations or human aesthetic scores.

Reproduce author policy selection and the eight-variant check from a matching
checkout using fresh output directories:

```sh
PYTHONPATH=. python3 validation/bank-v2-20261105/study/reproduce.py runs/fresh-bank-study --node /path/to/node
python3 -m analysis.audit_takeoff_reference runs/fresh-bank-reference validation/fresh-bank-positive --node /path/to/node --grading-revision v7-launch-60-65-70-bank-v2
PYTHONPATH=. python3 analysis/calibrate_source_first.py runs/fresh-bank-mutants --node /path/to/node --grading-revision v7-launch-60-65-70-bank-v2 --reference-physics runs/fresh-bank-reference/submission/physics.mjs
```
