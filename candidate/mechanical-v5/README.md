# Piloted mechanical ornithopter — v5 draft

**Source audit, 4 November:** this executable prototype does not yet implement
all the principles in Stanley's notes. Its pilot/engine/mass additions are
compatible in intent, but important source mechanics were omitted or replaced.
See [the findings](SOURCE_AUDIT.md) and
[the corrected source-first requirements](../../docs/SOURCE_FIRST_REQUIREMENTS.md).
The task/physics below remain available for inspection, not certified as the
completed source-first eval. No further model calibration has been run.

This candidate replaces the small unmanned v4 aircraft for future work. It adds
a visible 55 kg adult, a 228.5 kg wet mass budget, finite petrol fuel, a shaft-work
limit and wing-motion-derived propulsion. It bundles all runtime files.

Review TASK.md, AIRCRAFT_API.md, engineering.json and ENGINEERING_NOTES.md.
The four writable model files are aircraft.mjs, physics.mjs, kinematics.mjs and
interpretation.json. The supplied world includes the same hills and few trees,
two longer strips and a Pilot inspection camera. No legacy project is required.

```sh
python3 -m ornithopter_eval prepare-piloted runs/piloted-review --reference
python3 -m ornithopter_eval serve-world runs/piloted-review --port 8768
python3 -m ornithopter_eval validate-piloted
```

The preview is a labelled handwritten integration fixture, never a model result.
Omit --reference for the unsolved model packet. Future model attempts can use
configs/mechanical-v5-smoke.json, with medium reasoning and 32,000 total output
tokens including reasoning. No new API trials are run by the commands above.

The draft has 28 deterministic binary checks and five separate binary human
visual questions. No weighted quality score. Visual questions remain pending
until review; an automated total is not a full-task pass. Old cohorts retain
their own versions and scores. See GRADERS.md for exact scopes.
