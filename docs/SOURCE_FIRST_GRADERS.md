# Eight graders for the source-first revision

The runnable task is [mechanical-v6-source-first](../candidate/mechanical-v6/TASK.md).
Its [exact public probes and tolerances](../candidate/mechanical-v6/GRADERS.md)
and independent browser grader implement all six task targets. Positive and
seven targeted negative author fixtures are calibrated before the model cohort.
These are checks of a declared educational reduction, not flight validation.

There are six binary task outcomes, one binary file-only validity outcome and
one human aesthetic-realism score. Report performance as **x/6**, protocol
**pass/fail**, and human aesthetics **1–5** separately (ungraded until reviewed).
Obeying tool rules does not earn an easy performance point. For invalid runs,
retain raw artifact results but exclude them from valid-performance aggregates.
Also report the invalid rate and valid completions per all started attempts, so
exclusions cannot make a model look better. Missing evidence is unavailable,
never an inferred pass or an automatic model failure.

## The eight questions

| # / ID | Single target | Probe and failure it must catch | Status |
|---|---|---|---|
| 1. `wing_cycle_force_coupling` | Does the visible working/recovery mechanism produce the forces implied by its actual motion and separate inner/outer section models? | At published phases/flows, independently reconstruct exposed geometry, velocities and forces from the frozen source-consistent model; compare with production geometry and force output. Catch decorative folding, unchanged force area, missing sweep/camber or a substituted shared polar. | **Implemented**; independent geometry, section/force reconstruction and actual production vertices. |
| 2. `elastic_inertial_exchange` | Does the spring exchange energy with the actual moving wing/body inertia without unaccounted energy creation or loss? | Release a displaced isolated mechanism with motor, air and damping disabled. Reconstruct kinetic/spring energy from mass geometry during real movement; add known damping and check its loss. Catch prescribed-speed animation, omitted wing inertia or a decorative spring/energy counter. | **Implemented**; actual mass-point energy and coupled reference. |
| 3. `wing_body_pitch_coupling` | Does wing motion produce the pitching response predicted by the coupled model with neutral pilot input? | Compare matched states with a controlled fore/aft-motion intervention. Independently calculate coupling/moments and compare initial acceleration and a short integration. Catch control-only pitch or automatic flow alignment. No universal response sign is assumed. | **Implemented**; actual mass-point energy and coupled reference. |
| 4. `power_limited_flight` | Can the aircraft complete a published takeoff-and-banked-flight scenario within its finite engine/fuel allowance? | Retain the full production trajectory, forces, work and fuel history. Fixed pilot/mass, engine cap, runway and trim/maneuver. Catch free thrust, power-limit bypass or hidden bank lift compensation. Powered turns need not always descend. | **Implemented**; source-consistent author takeoff/bank trajectory and finite power/fuel accounting. |
| 5. `unpowered_glide_balance` | Does the deliberately configured glide lose mechanical energy at the rate predicted by its aerodynamic losses? | Published speed/trim cases, zero motor input, force-derived descent and reconstructed energy loss. Include residual wing/spring motion. Catch altitude hold, zero drag and hidden propulsion. No arbitrary 6–14 L/D window. | **Implemented**; derived trim and perturbed-speed force/energy balance. |
| 6. `wheel_rotation_axis` | Does each rendered wheel rotate about its axle during straight travel and airborne motion? | Reuse `grader/wheel-axis.mjs`: infer the tyre's thin axis from transformed production geometry; every axle stays within 1° of aircraft lateral z with steering neutral. Supply both travel distance and `wheel_angle` so either animation convention is exercised. Must retain the saved GPT-5.6 failure and GPT-6.1 pass. | **Implemented existing regression**, with explicit wheel-angle input coverage. |
| 7. `no_verification_tools` | Did the generator request only declared file reads and edits throughout its recorded attempt? | Audit every observed tool request and matched result. Any out-of-policy request fails even if blocked. Missing/inconsistent evidence cannot pass. No LLM judge or inspection of encrypted reasoning. | **Implemented** in `ornithopter_eval/rollout.py`, recorded automatically on new runs. |
| 8. `aesthetic_realism` | After flying it, how convincing, compelling and faithful to the source sketches is the mechanical aircraft? | Owner enters 1–5 in the local review UI, considering proportions, coherent materials/construction, readable mechanisms, pilot scale and movement. No LLM proxy or automatic default. | **Implemented** human-rating UI and append-only local ledger; no model submission has been rated by the authoring agent. |

Each physical scenario may use several fixed inputs to verify its one dependency.
It yields one boolean, reason and raw evidence; no subtest points or weights.
The separate human grader is deliberately ordinal. These are new integrated probes, not headings around all
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
Tolerances reflect numerical/geometry error of the frozen model. They are fixed for the runnable v6 task in its GRADERS.md, with retained positive/negative calibration evidence.

Each needs an inspected positive reference and a targeted broken variant it
rejects. Preserve failures and conflicting judgments. V5's handwritten reference
does not implement the new source-first mechanics and is not its positive
fixture. Do not tune thresholds, parameters or budgets to force a model ranking.
Record deadline cutoffs separately from physics defects and retain completed
files at cutoff without extensions, retries or generation-time grader feedback.

## Human aesthetic realism

Fly and inspect the aircraft before rating it. Judge how convincingly it brings
the sketches to life as a mechanical design, not whether you prefer one artistic
style. Consider source proportions and silhouette, believable construction,
coherent materials, appropriately scaled pilot and mechanisms, and visual motion.
The task explicitly asks for a striking, realistic, compelling design within the
existing lightweight rendering limits. This score does not establish physical
correctness and has no automatic pass threshold.

| Score | Anchor |
|---|---|
| 1 | Rough and unconvincing: incoherent shape, construction or movement. |
| 2 | Recognisable but crude: weak proportions, materials or mechanical clarity. |
| 3 | Believable engineered aircraft, with clear visual shortcomings. |
| 4 | Convincing, source-faithful and polished: coherent construction and motion. |
| 5 | Exceptional realism and coherence: compelling, source-faithful mechanical design. |

`serve-artifacts` starts a separate local human-review page linked from the
gallery. Open the simulator, play it, select a score, confirm you have flown it
and save. Optional notes and reviewer name are retained. Ratings bind to the
submission's complete recorded file hashes and task version. Revisions append;
they never overwrite earlier judgments, manifests, automated reports or ZIPs.
Export ratings JSON from the review page. Local ledgers live in Git-ignored
`reviews/aesthetics/`; keep/export them with your experiment records.

Submissions remain on the read-only artifact origin. The trusted review UI runs
on a different loopback port and requires its own session token to save ratings,
so a submission cannot award itself a human score. Existing cohorts can receive
a separately labelled retrospective rating; their original rubric is unchanged.

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

Use [source-first-time.json](../configs/source-first-time.json): **240 seconds**
from generation start, **medium reasoning**, with **no benchmark output-token or
request-count cap**. The API request omits `max_output_tokens`; the provider's
own response/context limits still apply. Keep the 2 MB submission limit.

Warn only at 50%/75% of elapsed time: **120 and 180 seconds**. Deliver each
threshold once at the next exchange, combining crossed thresholds if necessary.
No extra request solely to deliver a warning. A warning cannot interrupt an
in-flight response. The deadline includes API latency, reasoning, generation
and file-tool handling, but excludes preparation and grading. A killable API
worker enforces the local cutoff even if a request stalls. No late tool dispatch;
edits completing late are discarded. Keep previously completed files and grade
those artifacts with a distinct `wall_time_limit` termination reason. Provider
usage for an interrupted request is unknown; local cancellation does not promise
that provider generation or billing stops at exactly the same instant.

The latest saved mechanical runs took **128.889 s (5.6 Sol)** and **190.063 s
(6.1 Sol)**. Four minutes gives the slower run about 50 s of headroom while being
far tighter than 900 s. These are older-task timings, not feasibility evidence
for the harder source-first mechanics. Freeze 240 s before the next cohort,
record latency/cutoff rates and revisit only in a new labelled profile if needed.
See [saved timing basis](../analysis/time-budget.json). Do not tune it to force a ranking.

The profile overlays generation constraints; it does not implement a task/rubric.
`--generation-profile configs/source-first-time.json` works with `prepare`,
`run` and `compare`, saving resolved limits and the profile hash while preserving
the original config. Applying it to v5 still uses **v5's sources and graders**.
Keep historical reproduction commands on their original configs without an
overlay. Use this profile by default when the source-first task is implemented.
The previous 20,000-token profile remains unchanged for reproducibility.
New packets include the frozen [visual design brief](../task/DESIGN_BRIEF.md);
historical prompts and ratings are not rewritten.

Prepare a **v5 harness-only** budget smoke packet without an API call:

```sh
python3 -m ornithopter_eval prepare runs/timed-harness-review --config configs/mechanical-v5-smoke.json --generation-profile configs/source-first-time.json
python3 -m ornithopter_eval audit-rollout runs/FINISHED_RUN --output runs/rollout-recheck.json
```

The command above is a v5 budget-only reproduction. To prepare the revised task, use `python3 -m ornithopter_eval prepare runs/source-first-packet --config configs/source-first-v6.json`.
