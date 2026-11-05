# Source-first v7: sequential five-model comparison

One fresh trial per selected model, in the supplied order. All received the same frozen nine-photo packet, medium reasoning and a 480-second generation deadline, with no benchmark token/request cap. Generation and grading completed before dispatching the next model. No model retries or output repairs were made.

The batch was configured to stop before the next model on the first API/transport error, grading infrastructure error, or request interrupted by the generation deadline. Ordinary task-check failures continue. Execution controls and stop reasons are retained in `experiment.json`.

| Model | Raw binary checks | File-only validity | Simulator opens | Sustained takeoff observed | Generation |
|---|---|---|---|---|---|
| gpt-6.1-sol | 6/7 | Yes | Yes | No | 361.128 s |
| gpt-6-astra | 6/7 | Yes | Yes | No | 431.669 s |
| gpt-5.6-sol | 5/7 | Yes | Yes | No | 220.027 s |
| gpt-5.5 | 4/7 | No | Yes | Yes | 195.319 s |
| gpt-5.4 | 0/7 | Yes | Yes | No | 448.554 s |

Takeoff observations are diagnostics from the existing powered-flight check, not extra points. Taking off alone does not pass that check: power, energy, force and flight/bank assertions must also pass. Component totals do not establish complete usable flight. Raw scores of file-only-invalid submissions remain visible but are excluded from valid-attempt means. Human aesthetic realism remains separate; no rating is inferred here.

| Binary grader | gpt-6.1-sol | gpt-6-astra | gpt-5.6-sol | gpt-5.5 | gpt-5.4 |
|---|---|---|---|---|---|
| wing_cycle_force_coupling | Pass | Pass | Fail | Fail | Fail |
| elastic_inertial_exchange | Pass | Pass | Pass | Pass | Fail |
| wing_body_pitch_coupling | Pass | Pass | Pass | Fail | Fail |
| power_limited_flight | Fail | Fail | Fail | Fail | Fail |
| unpowered_glide_balance | Pass | Pass | Pass | Pass | Fail |
| powered_pitch_stability | Pass | Pass | Pass | Pass | Fail |
| wheel_rotation_axis | Pass | Pass | Pass | Pass | Fail |

All five submitted inside the deadline, with 77 recorded HTTP calls and no API/transport failures. The stop guard did not trigger. All five production pages initialize. None passed the complete power-limited flight check.

## Observed limitations

- gpt-6.1-sol: recorded flight sequence crashed at 17.550 simulated seconds.
- gpt-6-astra: recorded flight sequence crashed at 17.550 simulated seconds.
- gpt-5.6-sol: recorded flight sequence crashed at 18.617 simulated seconds.
- gpt-5.5: takeoff was observed, but forces along the trajectory failed the independent source-model comparison.
- gpt-5.5: file-only audit rejected requested command "ls submission && ls inputs". This records an attempted allowlist violation, not evidence that a verification program actually ran.
- gpt-5.4: recorded flight sequence crashed at 4.458 simulated seconds.

Code frozen at `485fd4d47ab9bf5781dc67fb50815c80f551dabb`. The author reference passed all seven checks and nine targeted mutants were rejected; all grader hashes match that calibration (`preflight.json`). Per-request IDs, timestamps, HTTP headers, outcomes and observed phases are saved under each trial's API diagnostics. `playback-summary.json` derives the table directly from unchanged records and verifies nonoverlapping HTTP intervals. Source packets, model files, raw traces and grader evidence are retained. One trial each is exploratory and supports no definitive model ranking.
