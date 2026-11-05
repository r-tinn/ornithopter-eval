# Current-instructions author-reference audit — 5 November 2026

**The old positive reference does not establish that the current task is solvable.**
Its input packet and physics fixture match the current v7 files, but its contact
implementation violates the current touchdown requirement.

In `fixtures/mechanical-v7/physics.mjs`, `v` and `out.velocity` refer to the same
array. Ground contact sets its downward velocity to zero before `wheelSink` reads
`v[1]`. The old collision check therefore discards the impact speed it should
measure. It also omits wheel motion from pitch rotation and the horizontal
touchdown speed limit. The original seven-pass result is preserved as historical
evidence, not a compliant positive control.

A new packet was prepared from the current v7 inputs. Its author implementation
was corrected to snapshot the impact state before clamping, measure actual
contacting tyre velocities including pitch rotation and moving CG, and apply
the existing touchdown limits. This is a correction of the handwritten fixture,
**not an independent model generation or a complete certification of its contact
solver**. No notebook input, mass, engine, aerodynamic constant or crash limit
was changed. The original fixture remains unchanged pending a validated replacement.

The corrected reference passes six checks and fails `power_limited_flight`:
it crashes at 16.575 simulated seconds, before sustained takeoff. The final
contact has approximately 2.184 m/s downward tyre speed, exceeding the unchanged
2 m/s limit. All six other component checks pass. See [full report](report.json),
[audit and hashes](audit.json), [exact corrected implementation](corrected-physics.mjs)
and [reference manifest](reference-manifest.json).

The unchanged recent Sol and Astra submissions both crash at 17.55 seconds.
An eight-times smaller integration step still crashes Sol at 17.5495 seconds.
Fourteen additional brake-hold, throttle-ramp and low-power launch plans on
unchanged Sol physics all crash. These are labelled local diagnostics, not new
model runs or grader scores. The saved `results*.json` retain all attempted
cases, including the old reference's passing replays. Ground energy residuals
are diagnostic only and are not an independently validated energy grader.

This establishes a calibration defect, **not mathematical impossibility**.
There is currently no demonstrated fully compliant takeoff reference. The
fixed launch/controller, contact reduction and strongly pulsed lift need a
validated reference before attributing these takeoff failures to model ability.
Increasing engine power or relaxing crash limits is not justified by this audit.

To reproduce the corrected reference against the current checkout, use fresh
output directories and a Node executable with the project's Playwright browser:

```sh
python3 -m analysis.audit_takeoff_reference runs/fresh-author-audit validation/fresh-author-audit --node /path/to/node
```

Published submissions, their recorded grades, original calibration reports and
cohort packets are preserved. This audit does not retroactively change scores.
