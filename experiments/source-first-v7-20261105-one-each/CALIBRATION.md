# Source-first v7: one fresh trial per model

Both models received the same nine original notebook photos, aircraft task,
relocated scenery, medium reasoning and 480-second deadline. There was no
benchmark token/request cap, execution or verification during generation,
model retry, submission repair or grader adjustment to these outputs.

Meadow is now 1.8 km from Valley, on an elevated meadow beyond the southern
ridge. Terrain and tree counts are unchanged. Valley's local takeoff surface
is unchanged apart from floating point rounding below 1e-12 m. This cohort
uses the already calibrated v7 stability revision and seven-check rubric.

| Model | Binary checks | Simulator opens | Sustained runway takeoff | Airborne pitch stability | File-only validity | Generation |
|---|---|---|---|---|---|---|
| GPT-5.6 Sol | 4/7 | Yes | No; crashes at 17.558 s | Pass | Pass | Submitted in 188.500 s |
| GPT-6.1 Sol | 6/7 | Yes | No; crashes at 17.550 s | Pass | Pass | Submitted in 350.247 s |

Both submitted inside the deadline. Neither completes the 70-second runway
flight-and-bank sequence. A component total is not a percentage of usable
flight. The separate pitch-stability scenario starts already airborne and
therefore does not certify takeoff. Human aesthetic ratings remain ungraded.

| Binary grader | GPT-5.6 Sol | GPT-6.1 Sol |
|---|---|---|
| Wing-cycle forces and production geometry | Fail | Pass |
| Elastic/inertial energy exchange | Pass | Pass |
| Wing/body pitch coupling | Fail | Pass |
| Power-limited takeoff and flight | Fail | Fail |
| Unpowered glide balance | Pass | Pass |
| Wheel rotation axis | Pass | Pass |
| Neutral-input powered pitch stability | Pass | Pass |

5.6 has additional numerical/geometry failures: maximum sampled production
vertex error is 0.967 mm against the published 0.2 mm tolerance, wing force
values differ, and selected coupled-pitch acceleration cases miss the numerical
tolerance. Its takeoff trajectory also misses the independent force comparison
(maximum residual about 1.28 N). Engine-cap, short energy-rate and fuel cases
pass, but the aircraft crashes without sustaining takeoff.

6.1 matches the independent force comparison along its short takeoff trajectory
(maximum residual about 9.12e-13 N). Its engine, energy-rate and fuel cases
also pass. Its power-limited flight check fails because it crashes before
sustained takeoff. More passing component checks did not produce a usable
runway takeoff in this trial.

Both pass the 80-second full-throttle, neutral-input airborne stability
scenario. After the settling period, the two-second averaged pitch ranges
are 3.74–6.97 degrees for 5.6 and 3.72–7.00 degrees for 6.1, with zero large
slow reversals. These are narrow, fixed-scenario observations.

`playback-summary.json` derives the startup/takeoff/stability table directly
from the original reports. The UI, all source files, transcripts, grader
captures and numerical trajectories are saved unchanged. One trial per model
is exploratory; no ranking claim is made from this pair.
