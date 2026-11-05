# Five saved models: 60/65/70 launch regrade

Same five submissions from the sequential cohort. No new model generation or API calls. The generation prompt and all submitted physics/geometry remain byte-identical. This is a retrospective grading revision, not a fresh benchmark cohort. Original grades and cohort notes remain linked.

| Model | Original | Regraded | Complete powered flight | File-only validity |
|---|---|---|---|---|
| gpt-6.1-sol | 6/7 | 6/7 | Fail | Pass |
| gpt-6-astra | 6/7 | 6/7 | Fail | Pass |
| gpt-5.6-sol | 5/7 | 6/7 | Pass | Pass |
| gpt-5.5 | 4/7 | 4/7 | Fail | Fail — excluded from means |
| gpt-5.4 | 0/7 | 0/7 | Fail | Pass |

## Launch attempts

Every attempt resets from rest. Profile throttle applies below 14 m/s horizontal speed; full throttle above. Stop at first complete pass. Success requires the full original power/force/energy/fuel and 70-second takeoff/bank conditions, not merely leaving the runway.

| Model | Profile | Full result | Sustained takeoff | Final status | Failed conditions |
|---|---|---|---|---|---|
| gpt-6.1-sol | 60% | Fail | Yes | crashed at 67.325 s | crashed, ended before 70 s, final clearance |
| gpt-6.1-sol | 65% | Fail | Yes | crashed at 68.888 s | crashed, ended before 70 s, final clearance |
| gpt-6.1-sol | 70% | Fail | No | crashed at 40.454 s | crashed, no sustained takeoff, ended before 70 s, final clearance, final bank |
| gpt-6-astra | 60% | Fail | Yes | crashed at 67.363 s | crashed, ended before 70 s, final clearance, final bank |
| gpt-6-astra | 65% | Fail | Yes | crashed at 68.913 s | crashed, ended before 70 s, final clearance, final bank |
| gpt-6-astra | 70% | Fail | Yes | crashed at 69.933 s | crashed, ended before 70 s, final clearance, final bank |
| gpt-5.6-sol | 60% | Pass | Yes | flying at 70.000 s | All complete-flight conditions pass |
| gpt-5.5 | 60% | Fail | Yes | flying at 70.000 s | trajectory forces |
| gpt-5.5 | 65% | Fail | Yes | flying at 70.000 s | trajectory forces |
| gpt-5.5 | 70% | Fail | Yes | flying at 70.000 s | trajectory forces |
| gpt-5.4 | 60% | Fail | No | flying at 7.192 s | energy derivative, trajectory forces, no sustained takeoff, ended before 70 s, final clearance, final bank |
| gpt-5.4 | 65% | Fail | No | crashed at 6.692 s | energy derivative, trajectory forces, crashed, no sustained takeoff, ended before 70 s, final clearance, final bank |
| gpt-5.4 | 70% | Fail | No | crashed at 6.292 s | energy derivative, trajectory forces, crashed, no sustained takeoff, ended before 70 s, final clearance, final bank |

GPT-5.6 Sol passes at 60%; 65% and 70% are not attempted. Sol and Astra achieve takeoff in several profiles but crash during the later bank phase. GPT-5.5 remains airborne but fails the independent force comparison; its file-only validity also remains failed. Human aesthetic scores are separate and have not been inferred.

The corrected author reference passes all seven checks; all nine targeted mutants are rejected. The positive reference retains its failed 60% attempt, passes 65%, then skips 70%. The historical default power probe was checked against the archived implementation and matched exactly. See GRADING_REVISION.md and regrade-calibration.json.

All production pages initialize. The Fly simulator links open the unchanged submitted aircraft. Grader capture images are generic production inspections, not a recording of the successful scripted flight. Use the attempt traces in each revised report to inspect the actual checked controls and states. The optional labelled host/capture overlay remains separate from model output and scoring.
