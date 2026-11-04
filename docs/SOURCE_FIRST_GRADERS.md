# Seven graders for the source-first revision

This replaces the proposed many-check scoring scheme **for the next task**.
It does not rescore archived attempts or relabel v5's 28 checks. The old 15/15
model results used v4; no frontier model has completed the source-first revision.
Its difficulty or saturation is not yet established.

There are seven binary outcomes: six task graders and one file-only validity
grader. Report performance as **x/6**, with protocol **pass/fail** separately.
Obeying tool rules does not earn an easy performance point. For invalid runs,
retain raw artifact results but exclude them from valid-performance aggregates.
Also report the invalid rate and valid completions per all started attempts, so
exclusions cannot make a model look better. Missing evidence is unavailable,
never an inferred pass or an automatic model failure.

## The seven questions

| # / ID | Single target | Probe and failure it must catch | Status |
|---|---|---|---|
| 1. `wing_cycle_force_coupling` | Does the visible working/recovery mechanism produce the forces implied by its actual motion and separate inner/outer section models? | At published phases/flows, independently reconstruct exposed geometry, velocities and forces from the frozen source-consistent model; compare with production geometry and force output. Catch decorative folding, unchanged force area, missing sweep/camber or a substituted shared polar. | Specification; new mechanism, coefficients and oracle needed. |
| 2. `elastic_inertial_exchange` | Does the spring exchange energy with the actual moving wing/body inertia without unaccounted energy creation or loss? | Release a displaced isolated mechanism with motor, air and damping disabled. Reconstruct kinetic/spring energy from mass geometry during real movement; add known damping and check its loss. Catch prescribed-speed animation, omitted wing inertia or a decorative spring/energy counter. | Specification; coupled reference needed. |
| 3. `wing_body_pitch_coupling` | Does wing motion produce the pitching response predicted by the coupled model with neutral pilot input? | Compare matched states with a controlled fore/aft-motion intervention. Independently calculate coupling/moments and compare initial acceleration and a short integration. Catch control-only pitch or automatic flow alignment. No universal response sign is assumed. | Specification; coupled reference needed. |
| 4. `power_limited_flight` | Can the aircraft complete a published takeoff-and-banked-flight scenario within its finite engine/fuel allowance? | Retain the full production trajectory, forces, work and fuel history. Fixed pilot/mass, engine cap, runway and trim/maneuver. Catch free thrust, power-limit bypass or hidden bank lift compensation. Powered turns need not always descend. | Specification; source-consistent feasibility and scenario bounds needed. |
| 5. `unpowered_glide_balance` | Does the deliberately configured glide lose mechanical energy at the rate predicted by its aerodynamic losses? | Published speed/trim cases, zero motor input, force-derived descent and reconstructed energy loss. Include residual wing/spring motion. Catch altitude hold, zero drag and hidden propulsion. No arbitrary 6–14 L/D window. | Specification; new glide/loss model needed. |
| 6. `wheel_rotation_axis` | Does each rendered wheel rotate about its axle during straight travel and airborne motion? | Reuse `grader/wheel-axis.mjs`: infer the tyre's thin axis from transformed production geometry; every axle stays within 1° of aircraft lateral z with steering neutral. Supply both travel distance and `wheel_angle` so either animation convention is exercised. Must retain the saved GPT-5.6 failure and GPT-6.1 pass. | **Implemented existing regression**, with explicit wheel-angle input coverage. |
| 7. `no_verification_tools` | Did the generator request only declared file reads and edits throughout its recorded attempt? | Audit every observed tool request and matched result. Any out-of-policy request fails even if blocked. Missing/inconsistent evidence cannot pass. No LLM judge or inspection of encrypted reasoning. | **Implemented** in `ornithopter_eval/rollout.py`, recorded automatically on new runs. |

Each physical scenario may use several fixed inputs to verify its one dependency.
It yields one boolean, reason and raw evidence; no subtest points, weights or
aesthetic score. These are new integrated probes, not seven headings around all
the old easy checks. The wheel check is retained because it detects a specific
observed failure the owner requires.

## What leaves the score

Remove standalone points for copying AR/wrist/mass values, having any pilot mesh,
having wings on both sides, having a fin, responding to a button, showing any
flapping, or staying under a triangle count. Preserve those task requirements
and expose useful measurements/captures as **non-scoring diagnostics**, without
hidden extra scoring gates. An x/6 score describes these six targets, not every
deliverable or real-world flight validity. The target-trajectory comparison
panel remains required and inspectable; printing its formula earns no point.

## Calibration before a cohort

Publish exact scenario states, interventions, tolerances, time windows and model
parameters before generation. Expected results must come from independent
equations and geometry, not candidate energy counters or self-reported success.
Tolerances must reflect numerical/geometry error of the frozen model. They are
**not yet fixed for graders 1–5**, which must not be presented as runnable.

Each needs an inspected positive reference and a targeted broken variant it
rejects. Preserve failures and conflicting judgments. V5's handwritten reference
does not implement the new source-first mechanics and is not its positive
fixture. Do not tune thresholds, parameters or budgets to force a model ranking.
Record token cutoffs separately from physics defects and retain completed files
at cutoff without extra tokens, retries or generation-time feedback.

## File-only policy

Allow only `ls PATH`, `cat PATH`, `head -n N PATH` inside `inputs/` or
`submission/`, plus native `apply_patch` edits to declared writable files. The
host interprets read commands directly; it never invokes Bash.

Forbid interpreters, `node --check`, builds/tests, browser/rendering tools, HTTP,
grader calls, pipelines/substitution or other commands, including failed requests.
Rereads, mental checking, correcting a rejected patch and writing the required
in-product analysis mode are allowed. Running that mode during generation is
forbidden. The restriction applies to the evaluated model; benchmark authors
still validate the harness and calibrate graders after submission.

New runs save a final event, trace SHA-256 in the manifest and
`rollout-review.json`. The auditor checks event pairing, call/result identity,
advertised tool definitions and final metadata. The hash supports reproducible
integrity checking; it is not external attestation against someone editing both
the host manifest and log. Old unsealed logs remain preserved and do not receive
automatic compliance passes.

## Generation constraints

Use [source-first-budget.json](../configs/source-first-budget.json): **20,000 total
output tokens**, including reasoning, code/tool calls and final text; **medium
reasoning**. Notices only at 50%/75% (10,000/15,000 used), at the next exchange if
one occurs. Retain 24 exchanges, 2 MB and the existing 900 s operational timeout.
The token reduction is 37.5%; do not also introduce a short provider-latency race.
The API output count already includes reasoning:
[official OpenAI token accounting](https://developers.openai.com/api/docs/guides/reasoning).

The profile overlays generation constraints; it does not implement a task/rubric.
`--generation-profile configs/source-first-budget.json` works with `prepare`,
`run` and `compare`, saving resolved limits and the profile hash while preserving
the original config. Applying it to v5 still uses **v5's sources and graders**.
Keep historical reproduction commands on their original configs without an
overlay. Use this profile by default when the source-first task is implemented.

Prepare a **v5 harness-only** budget smoke packet without an API call:

```sh
python3 -m ornithopter_eval prepare runs/constrained-harness-review --config configs/mechanical-v5-smoke.json --generation-profile configs/source-first-budget.json
python3 -m ornithopter_eval audit-rollout runs/FINISHED_RUN --output runs/rollout-recheck.json
```

The first command does not prepare the revised physics task. The full seven-row
rubric remains a review specification until the missing physics work is complete.
