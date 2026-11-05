# Crash-free takeoff witnesses — 5 November 2026

**Yes: the specified reduced physics permit runway takeoff without crashing.**
The earlier audit correctly exposed a touchdown bug but its unsuccessful launches
were insufficient grounds for concluding that takeoff was probably impossible.
Further author experiments found successful launches without changing the mass,
engine, wing motion, aerodynamic model or crash thresholds.

The effective pilot policy uses 62.5% or 65% throttle below 14 m/s horizontal
airspeed, full throttle above it, and the original pitch/bank controller. This is
an external pilot-input policy, not an aircraft autopilot. The published grader
instead commands full throttle from rest, provoking hops and hard impacts before
the aircraft can sustain flight.

| Author implementation | Low-speed throttle | Sustained takeoff | Runway remaining | Clearance at 70 s |
|---|---|---|---|---|
| Corrected touchdown reference | 62.5% | 55.842 s | 271.9 m | 9.48 m |
| Constrained midpoint + inelastic contact | 62.5% | 49.375 s | 282.9 m | 15.28 m |
| Same contact solver, eight-times smaller timestep | 65% | 47.892 s | 297.1 m | 15.69 m |

All three survive the original banking manoeuvre. With only the pilot throttle
policy substituted, the published independent power probe also passes its engine
limits, energy derivatives, trajectory force comparisons, fuel integration and
flight requirements. This diagnostic does **not** change any published grader,
submission or score. It is not a new model cohort or an official seven-pass result.

These are feasibility witnesses, not proof of a robust or visually smooth launch.
There are small airborne hops before final departure. Contact dynamics are
sensitive: the fine-step solver crashes with 62.5% low-speed throttle but passes
with 65%. That failure is preserved alongside the successes. A controller should
be validated across representative implementations and timesteps before replacing
the current calibration; the narrow successful settings should not be presented
as a general flight controller.

To replay all cases locally from the repository root, with no API calls:

```sh
PYTHONPATH=. python3 validation/takeoff-control-witnesses-20261105/reproduce.py runs/fresh-takeoff-witnesses --node /path/to/node
```

The replay requires a fresh destination and checks the current source/world
hashes against this archived protocol before executing the trusted author code.

The search retains all 86 executions in `results1.json` through `results3.json`,
including ten successful 70-second flight sequences. Four independent-oracle
diagnostics are saved in `positive-power-oracle*.json`, including one failure.
No API calls were used. The author code and probe snapshot are bundled here;
provenance is in [summary.json](summary.json). No human aesthetic score is inferred.

The engineering task is therefore feasible, while the existing full-throttle
launch is a poor basis for attributing these particular crashes to model ability.
Keep the physical constants and crash rules; validate the launch control and
contact implementation before spending more on model comparisons.
