# Three-profile launch revision validation

Revision `v7-launch-60-65-70-v1` grades unchanged v7 submissions. Fresh attempts
use 60%, 65%, 70% throttle below 14 m/s and full throttle above; the first
complete passing flight ends the sequence. All original engine, force, energy,
fuel, runway, banking and crash assertions remain required.

The corrected author reference passes **all seven** checks. Its failed 60%
attempt is retained, 65% passes, and 70% is not attempted. The two saved initial
states are identical. See [positive report](positive/report.json) and
[behavior assertions](behavior.json).

All [nine targeted mutants](negative/summary.json) remain rejected. The
overpowered-engine mutant retains all three failed attempts: flight cannot
override failed engine invariants. Each mutant's result, changed code and log
are preserved. These are author calibration tests, never model trials or ratings.

The default power probe, without the explicit revision, was compared against the
archived implementation on the same corrected reference and matched exactly.
Historical full-throttle semantics and published reports remain unchanged.
The Python regression suite passed 112 tests; view-motion tests also passed.
The new workbench was browser-tested: five original-grade links, five simulator
pages ready, zero observed page errors. See [UI check](workbench-ui.json).

Reproduce with fresh directories and the project's Node/Playwright runtime:

```sh
python3 -m analysis.audit_takeoff_reference runs/new-launch-reference validation/new-launch-positive --node /path/to/node --grading-revision v7-launch-60-65-70-v1
PYTHONPATH=. python3 analysis/calibrate_source_first.py runs/new-launch-mutants --node /path/to/node --grading-revision v7-launch-60-65-70-v1 --reference-physics runs/new-launch-reference/submission/physics.mjs
```

No model API requests were made. The new cohort page is a retrospective regrade
of the saved five-model sequential cohort; every original aircraft and initial
grade is byte-preserved and separately linked.
