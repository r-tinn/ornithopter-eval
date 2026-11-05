# V7 launch revision: 60%, 65%, 70%

Explicit retrospective grading revision `v7-launch-60-65-70-v1` for unchanged
`mechanical-v7-source-first` submissions. It is not a new generation cohort or a
silent replacement of the published full-throttle grades. The source packet,
engineering model, crash thresholds, six other checks, file-only validity and
separate human aesthetic rating are unchanged.

The `power_limited_flight` check tries low-speed throttle 0.60, 0.65, 0.70 in
that order. Each attempt resets to the original from-rest runway initial state.
At every 1/120-second pilot exchange, horizontal speed below 14 m/s selects the
profile throttle; at or above 14 m/s selects 1.0. Falling below 14 again returns
to the lower throttle. No latched switch, ramp, free crank speed or automatic
configuration change is added. Original pitch control and banking after 62 s
remain unchanged.

Each attempt must satisfy the **entire** original power-limited flight check:
engine torque/power cases, energy derivatives, independently reconstructed
trajectory forces, fuel use, sustained takeoff before the runway end and flight
with the required clearance/bank at 70 seconds, without crashing. One passing
attempt passes this single binary grader, ending the sequence immediately.
A failed attempt or stepping exception is retained and the next profile begins
from fresh state. Static engine/energy failures cannot be rescued by taking off.

The report saves `attempts`, each initial state, sampled states/controls and
failure details; `passed_attempt` is one-based or null. The top-level flight
summary refers to the winning attempt, or the last failure if none passes.
The report fingerprints the current grader and explicitly names this revision.

The owner's 60/65/70 choice differs from the earlier proposed 65/62.5/63.75
calibration. The corrected reference must pass and targeted faults must still be
rejected before regrading the five saved model submissions. All failed reference
attempts and calibration mutants remain visible. No new model API requests are
needed for regrading.

```sh
python3 -m ornithopter_eval grade PATH/TO/submission --output PATH/TO/new-grade \
  --grading-revision v7-launch-60-65-70-v1 --node /path/to/node
```

Omitting the revision retains the historical full-throttle grading behavior.
Saved generation configurations and published task instructions retain their
original meaning. New generation cohorts must explicitly adopt/document the
revised grading protocol rather than silently changing archived v7 packets.
