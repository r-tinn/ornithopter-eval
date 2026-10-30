# Binary grading contract — swan-v3.0

This pilot has one construction task and **25 required pass/fail checks**.
There are no weights, percentages, aesthetic scores or partial-credit rubrics.
The report retains each question, boolean verdict and observed evidence.

Seven source checks, seven physics checks and six browser checks are deterministic.
Five image checks require a human or an explicitly selected image-capable LLM.
Unreviewed image checks are null (ungraded), never assumed to pass. Any known
failure makes the task verdict false; a full pass requires all 25 checks true.
The report stays awaiting_review until all five image questions are answered,
including when an automated check has already failed.

## Source parameters: seven questions

Each exported parameter in physics.mjs is compared with one selected source value.
Tolerance is 0.5% relative, allowing paper rounding and normal decimal conversion.

| Field | Paper value | Expected SI value |
|---|---|---|
| span_m | 7.4 ft | 2.25552 m |
| wing_area_m2 | 6.61 ft² | 0.6140890944 m² |
| wrist_span_m | 3.7 ft | 1.12776 m |
| shoulder_span_m | 4 in | 0.1016 m |
| body_width_m | 8 in | 0.2032 m |
| overall_length_m | 55 in | 1.397 m |
| aspect_ratio | b²/S using the selected values | 7.4²/6.61 |

The trusted expected values come from the audited source packet, not an LLM at
grading time. The grader imports the module in a browser and reads its exports.
This verifies the numeric declaration. It does not prove that a renderer or
force calculation uses that declaration. No points are awarded for merely
populating documentation fields.

## Physics: seven questions

The old v1 numerical oracle independently reimplemented the specified equations
and compared the complete force output. That checked equation agreement, not
whether those equations represented a real ornithopter. The current checks each
test one specific property:

| ID | Controlled experiment | Pass condition |
|---|---|---|
| power_controls_thrust | At velocity [10,0,0], compare throttle 0 with 1. | Zero-power thrust is zero; powered thrust is finite and positive. |
| lift_scales_with_speed_squared | At zero pitch/roll and unchanged density, compare velocity [10,0,0] with [20,0,0]. | Baseline lift is positive and finite; second lift is four times the first. |
| matching_wind_removes_lift | At velocity [10,0,0], compare wind [0,0,0] with [10,0,0]. | Baseline lift is positive and finite; matching-wind lift is zero. |
| ground_nonpenetration | Start at y=0.21 m, velocity [10,-2,0], power off; step 2 s at 1/120 s. | Contact is reached and every sampled position remains at or above y=0.2 m (1e-9 m tolerance). |
| powered_wingbeat_frequency | Start phase 0.37 rad, power on; sample after 12, 25 and 44 steps of 1/120 s. | Phase equals (0.37 + 4*pi*t) modulo 2*pi, within 1e-6 rad. Non-aligned samples avoid accepting an incorrect frequency by aliasing whole cycles. |
| unpowered_wingbeat_stops | Start phase 0.73 rad with power off; advance 44 steps. | Every phase remains 0.73 rad within 1e-6. |
| steady_glide_ratio | Start in the specified still-air, zero-angle-of-attack steady trim at 100 m; power off for 2 s. | Actual forward distance / height lost agrees with CL/CD within 1%; require positive travel and descent. |

The comparisons use |actual − expected| <= 1e-6 * max(1, |expected|).
Gravity is not part of the reported aerodynamic lift scalar: it still acts
when relative airflow is zero. Positive baselines prevent an implementation
returning zero for every force from passing.

For example, with L = 0.5*rho*v²*S*CL, doubling v while keeping rho, S and CL fixed
gives 4L. The grader checks that ratio, without recomputing an entire flight.
The glide ratio is horizontal distance per metre lost, e.g. 10:1 means 10 m
forward for 1 m down. In steady, unpowered flight in still air, glide ratio =
L/D = CL/CD ([NASA explanation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/lift-to-drag-ratio/)).
The inverse is height lost per metre forward; sink rate is height lost per second.

The expected trim uses CL=0.6 and CD=0.035+CL²/(pi*0.8*AR), gamma=atan(CD/CL),
speed=sqrt(2*mass*g*cos(gamma)/(rho*S*CL)), pitch=-gamma and velocity
[speed*cos(gamma), -speed*sin(gamma), 0]. Accepted exported area and aspect ratio
are used to allow source rounding consistently. This starts in equilibrium,
so the test measures steady gliding rather than a transient dive or flare.
With the reference values the expected glide ratio is approximately 11.47:1.
This is a check of the stated educational polar, not evidence that Stanley's
design would achieve that ratio. No experimental glide polar was supplied.

The contact test covers the point-mass contact plane, not wheel/mesh intersection.
Wingbeat timing checks phase, not pixels; the image sequence separately checks
visible flapping. These narrow cases leave much of the solver unverified.

## Browser: six questions

Playwright performs actual UI actions and reads copies of the production state
through window.flightLab. Each check opens a fresh page. Each half of a paired
trial also opens a fresh page with the same clock schedule and starting conditions.
A virtual clock fires animation callbacks at fixed
times so laptop/CI speed does not determine how long an input is held.

| ID | Action | Binary observation |
|---|---|---|
| power_moves_forward | Reset and Start for 1 s at throttle 0; repeat at throttle 1. | Powered x exceeds neutral x by more than 0.1 m. |
| pitch_input_changes_pitch | From approach, run 0.4 s neutral; repeat holding ArrowUp. | ArrowUp pitch exceeds neutral pitch by more than 0.1 rad. |
| pause_freezes_state | Start approach for 0.4 s, Pause, advance clock 1 s. | State had advanced before Pause and is exactly unchanged afterwards. |
| reset_restores_state | Run approach with full power for 0.4 s, Reset, advance clock 1 s. | Exact initial state and zero throttle persist, including time 0. |
| takeoff | Full power; Start; after 2 s hold ArrowUp 0.3 s, then release. | At 6, 6.25, 6.5, 6.75 and 7 s, status is flying and y > 0.7 m. |
| landing | Approach; Start; hold ArrowUp 0.4 s, release; run 2 more seconds. | Airborne initial state reaches landed at y=0.2 m with zero vertical velocity. |

These are input-to-state tests. Avoiding a crash, making no network requests or
showing a canvas earns no separate pass. Browser errors and blocked requests are
diagnostics only. Missing/broken modules or controls fail affected checks; an
early exception cannot shorten the checklist.

These tests trust the required state hook to expose the state used by production
physics/rendering. They do not independently establish that pixels follow it.
A dishonest hook, canned flight path or model that passes just these cases can
still exploit the grader. The eval makes no claim to close those gaps.

## Image review: five questions, five separate calls

Each LLM call receives only the images needed for its single question. The top
view follows Reset and view-top, nose up. The side view follows view-side, nose
right. The four front-view frames follow approach, view-front, full throttle and
Start, at approximately 0, 0.125, 0.25 and 0.375 s. The captured state and phase
are retained with each filename. No submitted prose, previous judge answer or
unrelated screenshot is included.

| ID | Question | Pass only when |
|---|---|---|
| wings_on_both_sides | Is there a wing on each lateral side? | A wing visibly attaches to both the left and right of the central body. |
| tail_behind_wings | Is the tail aft of the wing roots? | A distinct tail surface visibly attaches below the wing-root region in the nose-up view. |
| wings_transverse | Do the wings extend across the body? | On each wing, root-to-tip lateral displacement exceeds fore/aft displacement in the top view. |
| fin_present | Is a distinct tail fin visible? | A fin projects above the aft body behind the wing roots in the side view. |
| visible_flapping | Do both wingtips move vertically relative to their roots? | Each tip visibly changes relative height across the four front-view frames. Whole-body/camera motion does not count. |

The first three questions receive Unknown-2.jpg and inspection-top.png. The fin
question receives inspection-side.png only; the flapping question receives only
flap-0.png through flap-3.png. Its answer must cite at least two distinct frames.

Each call returns only a boolean pass, one short reason and supplied evidence
filenames. The strict output schema contains no numeric score. A false answer
means the specified feature is absent, incorrect or cannot be confirmed because
it is obscured/ambiguous. No judgement of polish, colours, overall resemblance,
beauty, proportions or flight realism is requested. The selected pages do not
unambiguously specify an exact fin angle, leading-edge direction, rudder hinge or
biological stroke, so those are not graded. The upright aft fin is an explicit
benchmark convention supporting the existing conventional-fin requirement.

A malformed, refused, truncated or failed judge response leaves checks ungraded.
It is not interpreted as a failed aircraft. Raw responses (including model,
usage and response IDs), evidence hashes and reviewer-code hash are retained in
review.json. Calls are not automatically retried. If a later call fails, earlier
responses remain recorded and are not silently used as a complete review.
Another judge requires a separate grading directory.

A boolean output does not make an LLM infallible. The reference and deliberately
incorrect images calibrate selected cases only; broader human-labelled cases
are still needed before model rankings. Live results, when run, are recorded
separately in validation/live-images.json. Humans use the same five questions
and JSON shape in review-example.json.

The first live test with gpt-4.1-mini-2025-04-14 detected static wings, a missing
fin and lengthwise wings. It also passed and failed wings_on_both_sides for
byte-identical reference/static-wing top-view images. The photo, question and
model settings were identical too. This is a judge inconsistency, not evidence
that a wing vanished. The calibration is marked failed despite detecting the
target defects; these image judgments require human review or a better-calibrated
judge before rankings. No retry was selected to conceal the failed control.

Reproduce the consistency audit from retained raw reviews:

```sh
python3 -m ornithopter_eval audit-reviews validation/image-reviews/*.json
```

It compares question text, image-byte hashes, task/model and returned sampling
settings, and exits with status 1 on a conflicting verdict. Consistent answers
can still be consistently wrong; this is one calibration check, not judge validation.

## Rendering performance: diagnostic only

A separate real-clock browser context measures one-second powered and unpowered
approach runs. It records callback rate, p95/max requestAnimationFrame interval,
and simulation-seconds per wall-second. Virtual-clock correctness tests cannot
measure real lag; Playwright clock emulation affects the entire context, so the
timing probe uses a fresh context without emulation.

Callback timing is not a presented-frame/GPU measurement. There is no FPS pass
threshold yet: hardware, refresh rate, browser mode and competing load have not
been standardized. These values help investigate lag without scoring the host.
No running-scene jitter verdict is assigned. With a following camera, scenery
should move; a fair jitter test needs a defined camera/landmark trajectory to
distinguish a rendering defect from intended motion.

Wheels are neither required nor checked in this swan-scale task. Rudder presence
is represented by the conventional fin requirement; independent rudder actuation
is not specified, and there is no yaw control/state contract to test.

## Reproduction and calibration

The harness still gives the generator one instruction and a fixed file-only
budget, without execution, rendering, testing or grader feedback. It logs source,
starter and final file hashes; task/model/budget; usage; responses/tool results;
completion status; and runtime. The grader serves only submission assets to a
fresh sandboxed Chromium profile with external requests blocked, restrictive CSP,
a clean environment and process timeout. It never runs submitted Node/Python
code on the host. This is not a hardened environment for hostile code.

validate sends the calibration reference through a mocked Responses transport
and the real patch adapter, then runs real browser grading. Deliberate defects
check that their corresponding binary verifier fails: wrong source units,
constant free thrust, lift linear in speed, ignored wind, disabled integration,
disabled Pause, ground penetration, wrong wingbeat frequency, unpowered flapping,
zero drag, and an empty starter. Separate rendering-only mutants remove the fin,
freeze the wing geometry, or point the wings lengthwise. They must retain passing
automated results so the visual checks isolate rendering defects.
The reference must pass all 20 automated checks; image checks remain ungraded
until a human or live judge reviews them. These selected mutations establish
sensitivity to those defects only. They do not establish scientific validity,
complete task coverage, judge accuracy or model rankings.

Infrastructure errors and grader-wide timeouts carry no task verdict. Missing
review never becomes a fabricated pass. Versions v1, v2 and v3 have incompatible
grading semantics; retain the task version with every report and comparison.
Fix inputs, budgets, reasoning setting, browser/runtime and grader revision when
comparing models, and report all attempts.
