# Launch-profile calibration — 5 November 2026

**Recommended attempt order: 65%, 62.5%, 63.75%.** Replace the proposed 50% and
80% extremes with the two lower profiles. This is a proposed controller revision;
published graders, model submissions, scores and task packets remain unchanged.

Each percentage is the commanded throttle **below 14 m/s horizontal speed**;
above that threshold command 100%. This is a speed-feedback policy evaluated at
each 1/120 s pilot exchange: if speed falls below 14 again, return to the lower
setting. A latched transition or a gradual ramp is a different, untested policy.
Use fresh from-rest initial states for each attempt, the existing pitch/bank
controller, and the full original flight acceptance conditions. Each attempt
must take off before the runway ends, survive the bank and remain airborne at
70 s. Passing an earlier attempt ends the proposed sequence; failures stay saved.

## Evidence

The author-only sweep contains **106 executions across 20 throttle settings**.
The focused comparison uses two corrected contact implementations and four
integration substeps: 1/240, 1/480, 1/960 and 1/1920 s. The second implementation
also enforces the ground constraint at the midpoint and applies a momentum
projection on safe landing. All physical constants, notebook inputs, mass,
engine limits and crash thresholds remain fixed. No model API calls were used.

| Low-speed throttle | Successful variants / 8 | Observation |
|---|---|---|
| 50% | 0/8 | Still grounded at the 70-second endpoint |
| 65% | 7/8 | Good first attempt; fails the second contact implementation at 1/240 s |
| 62.5% | 6/8 | Rescues that 65% failure; first two profiles cover all eight variants |
| 63.75% | 7/8 | Strong extra alternative; no additional portfolio coverage in this matrix |
| 80% | 0/8 | Crashes in all variants, at about 28–30 s |

Larger throttle values were not consistently better. Throttle changes the
governor's target wingbeat speed as well as the power cap; that changes lift
pulses and the phase of runway recontact. Rounded alternatives 63%, 64%, 66%
were also tested across all eight variants and succeeded in 5/8, 6/8, 2/8
respectively. The recommended fractions are empirical test profiles, not
universal physical optima or measurements of a real aircraft.

The published independent power probe was replayed on the corrected reference
with only its pilot throttle policy substituted. All three recommended profiles
pass the complete probe, including power/torque limits, airborne energy
derivatives, independently reconstructed trajectory forces, fuel integration,
takeoff and the subsequent bank. Sustained takeoff is observed at 51.208 s,
55.842 s and 53.483 s respectively, leaving about 298, 272 and 285 m of runway.
These diagnostic probe results are not new official model grades.

The three-profile portfolio covers all eight tested variants; it is **not**
validated on unseen model submissions. Individual results remain sensitive to
contact handling and timestep, and some successful impacts are near the unchanged
2 m/s limit. Small runway hops remain. Three attempts help distinguish capability
from an unsuitable pilot input, but do not establish smoothness or full contact
solver correctness. The third profile is optional evidence-based redundancy,
not a demonstrated requirement on the reference. Do not select further profiles
after inspecting a new model cohort.

All successes and failures, wheel-impact diagnostics and state samples are in
`*-results.json`. [Summary and provenance](summary.json),
[precise proposed profile contract](recommended-profiles.json) and
[full independent power probes](power-validation.json) are retained alongside
the exact author code. The source/world packet is checked by hash on replay:

```sh
PYTHONPATH=. python3 validation/launch-profile-calibration-20261105/reproduce.py runs/fresh-launch-calibration --node /path/to/node
```

Use a fresh output directory. No change to the frozen v7 protocol is made here;
the proposed multi-attempt controller requires an explicit versioned revision
before use in a new cohort.
