# Eight-minute source-first comparison: one trial per model

Both models received the same nine original notebook photos, the concise smooth-takeoff instruction, medium reasoning and 480 seconds. No benchmark token/request cap, no execution or verification tools, no model retries, no repairs to submissions, and unchanged six binary task graders/crash limits. Time notices were configured only at the 50%/75% checkpoints, delivered at the next exchange. 5.6 completed without another exchange after crossing a checkpoint; 6.1 received the 50% notice, then completed without a further exchange for a 75% notice. No extra request was made solely to deliver a notice. This is one exploratory trial per model, not a reliable model ranking.

| Model | Raw component checks | Simulator opens | Sustained takeoff / flight-and-bank sequence | File-only validity | Generation |
|---|---|---|---|---|---|
| GPT-5.6 Sol | 3/6 | Yes | Yes / completed | Pass | Submitted in 248.284 s |
| GPT-6.1 Sol | 5/6 | Yes | No / crashed | Pass | Submitted in 437.444 s |

Both finish inside the deadline. Human aesthetic ratings remain ungraded.

## GPT-5.6 Sol: playable flight, numerical specification failures

The production playback is flying after about 25 seconds. In the controlled trajectory, it sustains takeoff before the runway end and finishes 70 simulated seconds airborne, about 26.53 m above gear contact, with the required bank. Its bundled power_limited_flight outcome nevertheless fails because the independently reconstructed force comparison fails: maximum residual about 2.02 N. Engine-cap, short energy-rate and fuel cases pass.

It passes elastic/inertial exchange, unpowered glide balance and wheel-axis checks. The wing-cycle and coupled-pitch checks fail. It rounds the required aspect ratio to 8.29, affecting area, geometry, forces and inertia; maximum geometry error is about 0.967 mm against the published 0.2 mm tolerance. Its reported lift uses body-y rather than world-vertical wing force. Preserve these as specification failures, without implying that the aircraft cannot fly. File-only validity passes.

## GPT-6.1 Sol: numerical component passes, failed takeoff

It passes wing-cycle forces/geometry, elastic/inertial exchange, wing/body pitch, glide balance and wheel axis. Engine cap, short energy-rate, fuel and trajectory-force comparisons also pass within the bundled power check; its maximum force residual is approximately 4.72e-13 N. But it never sustains takeoff and crashes at 17.5375 simulated seconds in the runway scenario. Neutral-input production playback also crashes, around 19.63 seconds. All four files are saved and the model submits normally, without a deadline cutoff. More time did not guarantee a working takeoff in this individual trial.

## Interpretation

The raw x/6 count describes independent component checks, not a percentage of working simulator or a complete-task success. Startup and the flight sequence are shown separately here because the same raw scores accompany very different useful behavior. No grader or threshold was tuned to these outputs. The derived playback-summary.json links directly to the untouched source reports. Original submissions, images, transcripts, trajectories and captures are retained, and the owner can play both simulators and rate aesthetic realism separately.
