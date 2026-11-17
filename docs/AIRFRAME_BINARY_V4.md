# airframe-binary-v4

This revision changes only pilot clearance from
[airframe-binary-v3](AIRFRAME_BINARY_V3.md). There are still ten deterministic
binary checks. Use `configs/source-first-airframe-v4.json` for new cohorts.

The check still samples the same 24 flapping phases and uses the 8 mm
penetration margin for the head, arms, torso and all other ordinary geometry.
An individual pilot mesh component entirely within the lowest 12% of the
seated pilot's height instead gets a 25 mm margin. This permits shallow
footwell or pedal overlap without excusing a deep intersection. Whole-body
meshes and components extending above that band keep the stricter margin.
This geometric rule does not assign anatomical labels; unusual meshes may
need inspection. All measurements remain sampled, not continuous.

Calibration uses an independent clean author reference, a shallow boot
overlap, a deep boot overlap, and separate head and torso intrusions.
See `analysis/calibrate_clearance.py` and `validation/airframe-binary-v4.json`.
The previous grader and scores remain reproducible under their original
revisions. Saved-model rescoring is retrospective.
