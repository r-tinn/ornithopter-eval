# Ornithopter Eval

**Latest five-model attempt:** [GPT-6.1 Sol, GPT-6 Astra, GPT-5.6 Sol, GPT-5.5 and GPT-5.4](experiments/source-first-v7-20261105-five-models/index.html), one run each at medium reasoning and 480 seconds. Four attempts stopped on API/transport errors and remain unscored. Astra hit the deadline during an in-flight response and its incomplete starter scored a raw 0/7. No usable simulator completed; this batch does not support a model ranking. [Exact records and interpretation](experiments/source-first-v7-20261105-five-models/CALIBRATION.md) · [All artifacts](experiments/source-first-v7-20261105-five-models/artifacts.zip).

Serve this cohort with `python3 -m ornithopter_eval serve-artifacts experiments/source-first-v7-20261105-five-models --port 8774`. The gallery retains each original failure and Astra's grading evidence.

The current task is [source-first v7](candidate/mechanical-v7/TASK.md). A fresh
model receives **nine original notebook photographs (02,08–15)** plus clearly
labelled engineering completions:55kg adult pilot,14m span,**177.5kg initial all-up
mass**,16kW petrol engine and finite fuel. Read [the numerical assumptions and
feasibility changes](candidate/mechanical-v7/ENGINEERING_NOTES.md).

The model creates a mechanical ornithopter in the supplied lightweight hills,
trees and two-strip world. Shared geometry/mass bookkeeping supports closing
outer leaves, distinct region camber and sections, real spring/wing inertia,
whole-aircraft CG movement and coupled wing/body pitch. Forces and work follow
the actual linked motion. No original-project runtime dependency. Meadow now sits
1.8 km from Valley, beyond the southern ridge on an elevated meadow; the world
still uses 8,192 terrain triangles and 48 trees. [Scenery review](validation/world-relocation-20261105/README.md).

There are **seven binary task graders**:wing-cycle forces/production geometry,
elastic/inertial energy,wing/body pitch,finite-power takeoff/bank,unpowered glide
balance,actual wheel rotation axis,and neutral-input powered pitch stability. **File-only tool validity** is separate.
**Human aesthetic realism (1–5)** is entered after you fly the simulator.
[Exact probes/tolerances](candidate/mechanical-v7/GRADERS.md) and
[v7 positive/negative calibration](validation/source-first-v7/summary.json) are saved.
The labelled author reference passes all seven; all nine deliberate defects are
rejected. The observed 5.6 slow oscillation is retained as a separate regression
example, without changing its published six-check score. These are checks on an
educational reduced model, not a flight-validated aircraft design.

The old full-throttle runway grader used a pitch controller. The new stability
check uses neutral pilot input, filters out small wingbeat motion and detects
persistent large slow reversals. V6's reference also hunted, so v7 explicitly
increases the illustrative passive pitch damping from140 to1000 N m s/rad and
accounts for its dissipation. Other engineering constants and crash limits are
unchanged. [Observation evidence](validation/pitch-hunting-20261105/index.html).

Approach starts 450 m before the runway and 100 m above local ground contact,
paused with the wings already flapping, 16 m/s forward speed and **90% throttle**.
This is an already-powered initial condition. Reducing throttle coasts the
mechanism under the same physics. Saved v6/v7 viewers get labelled host-control/preset updates, with original
playback still available. Saved model physics, captures and grades are intact.
This avoids the failed stopped-wing restart in the earlier Approach preset;
it does not repair or certify that transition. [Original failed restart observations](validation/earlier-approach-20261105/README.md)
remain intact. [Powered Approach review](validation/powered-approach-20261105/README.md).

New CLI runs use **480 seconds (eight minutes)**, **medium reasoning**, and **no benchmark token
or request cap**. The model knows the deadline upfront. Warnings arrive at the
next exchange after240/360s. Only targeted virtual file reads and declared
patches are allowed; no execution, tests, browser or grader feedback. Completed
files survive cutoff; late edits are discarded.

The initial task explicitly requires sustained takeoff before the runway ends,
without unstable bouncing or premature ground-contact release. The eight-minute baseline
uses `configs/source-first-v7.json`; its explicit budget overlay is
`configs/source-first-time-8min.json`. Published cohorts retain their
recorded budgets and task packets. The original
`configs/source-first-time.json` profile remains available unchanged.

```sh
python3 -m ornithopter_eval compare --models gpt-5.6-sol gpt-6.1-sol --repeats 1 --config configs/source-first-v7.json --output runs/source-first-v7-comparison
python3 -m ornithopter_eval serve-artifacts runs/source-first-v7-comparison --port 8772
```

The gallery links each playable submission, seven grader results, captured views,
raw transcript,source,and file-only audit. **Rate aesthetic realism ·1–5** opens
the human review UI. Scores bind to complete submission hashes and retain every
revision. Local ledgers are Git-ignored in reviews/aesthetics; export JSON from
the review page. No automatic aesthetic judgment is substituted for yours.

For blog visuals, open either current v7 simulator and click **Film a flyby**.
The capture studio prepares a real powered airfield pass with a slow camera
sweep, hides the interface from the exported scene and records an **8- or
12-second, 1920 × 1080 video**. Preview it, then choose **Save MP4 video**
(WebM on browsers without MP4 recording). **Save PNG** exports a clean still.
**Capture current view** preserves your flight and camera instead of preparing
a new pass. The local viewer saves videos and stills in the Git-ignored
`captures/<cohort>/` directory; **Saved clips** opens that library after a reload.
No external upload or extra package is needed. Keep the tab visible during recording.

The studio targets 30 fps; real-time speed depends on the browser and model's
physics cost. It changes camera/presentation and initial viewing conditions,
not submitted aircraft code or recorded grades. [Example films and verification](validation/capture-studio-20261105/library-final/index.html).

Every new packet contains all nine original images,the added assumptions,
source interpretation guide,the public probe specification and visual design
brief. No live key is passed to a submission or committed. Generation logs,
manifest hashes,grader trajectories and screenshots are retained for inspection.

Fresh live runs also save `api-diagnostics.json`, linked as **API diagnostics**
in the results gallery and included in the transcript/export. Per-request atomic
snapshots live in `api-diagnostics/request-0001.json`, etc. They record:

- UTC start/end times, request index, byte counts and observed durations.
- A unique client request ID and any received server request ID, following
  [OpenAI's request-debugging guidance](https://developers.openai.com/api/reference/overview#debugging-requests).
- HTTP status, structured provider error type/code/message, `Retry-After`, and
  received processing-time/rate-limit headers from an explicit allowlist.
- Underlying exception types, redacted messages, OS error numbers and TLS
  certificate diagnostics when available. DNS, TLS, proxy-tunnel, connection
  reset/refusal and timeout errors have distinct categories.
- The last observed phase if the deadline kills a request, including whether
  response headers had arrived and the body was being read. Interrupted usage
  remains unknown.

Waiting for headers includes connection setup, request upload and server
processing; that phase alone cannot identify which was slow. Parent request
`elapsed_seconds` includes worker startup/cleanup; `transport_elapsed_seconds`
and `response_headers_seconds` measure observations inside the HTTP worker.
Diagnostics retain bounded, credential-redacted fields, without dumping request
bodies, image payloads, cookies, authorization headers or proxy credentials.
Generation budgets, time notices, no-retry behaviour and the scoring protocol
stay as configured. Published attempts are not rewritten to add missing data.

For a labelled author reference (never a model result), call
`prepare_world(...,reference=True,task_version=LATEST_SOURCE_FIRST_VERSION)` from the
Python preparation API. Author mutant calibration is reproducible with
`PYTHONPATH=. python3 analysis/calibrate_source_first.py runs/new-calibration --node /path/to/node`.

## Preserved v4 task and results

The [v4 smoke results](experiments/mechanical-v4-smoke-20261030/CALIBRATION.md) and
[playable artifact viewer](experiments/mechanical-v4-smoke-20261030/index.html) are saved:
one attempt each, GPT-6.1 Sol and GPT-5.6 Sol, medium reasoning, 32,000 total output
tokens. Both passed 15/15 automated checks; four visual predicates remain ungraded.

**The v4 smoke task builds a mechanical aircraft inside a fixed, lightweight
flight world.** The [v4 task and commands](candidate/mechanical-v4/README.md)
includes standalone hills, 48 simple trees, two landing strips, controls and
cameras. Only aircraft geometry, articulation and flight dynamics are model work.
The [revised brief](docs/REVISED_BRIEF.md), [candidate task](candidate/mechanical-v4/TASK.md),
[source re-audit](candidate/mechanical-v4/SOURCE_AUDIT.md) and
[20 binary checks](candidate/mechanical-v4/GRADERS.md) define the provisional smoke test.

```sh
python3 -m ornithopter_eval prepare-world runs/mechanical-v4-review --reference
python3 -m ornithopter_eval serve-world runs/mechanical-v4-review --port 8766
```

Open `http://127.0.0.1:8766/`. The aircraft in this preview is a handwritten,
withheld integration fixture. The environment, renderer and license are copied
into this repository; the old project is not needed to prepare or run it.
Reproduce the earlier task with its explicit configuration:

```sh
python3 -m ornithopter_eval compare --models gpt-6.1-sol gpt-5.6-sol --repeats 1 --config configs/mechanical-v4-smoke.json --output runs/mechanical-v4-smoke
python3 -m ornithopter_eval serve-artifacts runs/mechanical-v4-smoke --port 8767
```

V4.1 reports 16 automated binary checks and four ungraded visual predicates. The
handwritten fixture and selected broken variants are tested separately from
model submissions. Use a fresh output directory. Medium reasoning, 32,000 total
output tokens including reasoning, no execution during generation and no retries.
The original v3 trials and their configuration are retained unchanged.

Interactive v4 playback now uses a centred chase camera and interpolates the
visible aircraft and camera together between physics steps. The server labels
this camera update; it does not rewrite the saved submissions, grades, captures,
ZIP or their hashes. Each trial offers an **Original camera** link. To serve the
archived camera throughout, add `--original-camera` to `serve-artifacts`.
Playback provenance is available at `/viewer-camera.json` on the local server.
[Camera regression evidence](validation/camera-review.json) covers both saved
model aircraft. `node --test tests/view-motion.test.mjs` checks interpolation,
angle wrapping and render scheduling across simulated 30–165 Hz callbacks;
these checks do not establish a hardware-independent frame rate.

The additional wheel-axis check is deterministic. The separate
[post-hoc wheel audit](audits/wheel-axis-20261104/wheel-axis.json) fails the saved
GPT-5.6 Sol wheel animation and passes GPT-6.1 Sol. Original 15/15 cohort scores
remain unchanged. The [power-model audit](analysis/power-model.json) separates
measured source ratios from the uncalibrated mass, drive, efficiency and drag
assumptions; no power assumptions have been changed by this grader update.
Reproduce the isolated browser measurements with
`python3 analysis/probe_flight.py --output runs/flight-probe-new.json`,
then reproduce the dimensional calculations
with `python3 analysis/power_model.py --output runs/power-audit-new.json`.
The latter reads the committed browser measurements in `analysis/flight-probe.json`.

## Previous task and calibration

**Can an AI turn Stanley J. O. Tinn's old sketches and calculations into a working
3D flight lab, without running or testing its code first?**

This is a small, reproducible **single-task pilot** measuring source interpretation
and simulator implementation. It includes two audited original photographs, a
bounded task, a Responses API harness, 20 automated binary checks, five focused
image-review questions, and a newly written calibration simulator.

The current delivery is validated offline. Live image tests caught the three
selected rendering defects, but the tested judge model also gave contradictory
wing-presence verdicts for an identical image. Its calibration is therefore
**not passed**; use human review or calibrate another judge before model rankings.
The first live comparison ran **three repeats each of GPT-5.6 Sol and GPT-6.1 Sol,
both at medium reasoning**. It exposed a force-output ambiguity and an
incomplete-response handling defect; the raw scores do not establish a clean
model ranking. [Results and findings](experiments/frontier-20261030-medium-3x/CALIBRATION.md)
and [all six saved attempts](experiments/frontier-20261030-medium-3x/index.html)
are included for independent inspection.
There is no claim of general benchmark validity or real-world aircraft validity.

The earlier swan task is **swan-v3.1**: its task and starter require scalar `lift`,
`drag` and `thrust` in newtons, with signed lift and a separate total-force vector.
The first live cohort remains archived as swan-v3.0 with its original grades.
These preserved swan configurations use **32,000 total output tokens, including
reasoning**, with **medium reasoning** and two token checkpoints after 50% and
75% usage. New CLI runs use the eight-minute configuration described above. The first
16,000-token cohort retains its original settings and scores.

The two selected family source photographs and reference preview are included
with permission and retain their original attribution.

## Start here

- [The model's task](task/TASK.md) and [source guide](task/SOURCE_GUIDE.md)
- [Why these sources were selected](docs/SOURCE_AUDIT.md)
- [Binary checks, evidence and limitations](docs/GRADERS.md)
- [Latest offline calibration results](validation/latest.json)
- [Live image calibration and consistency failure](validation/live-images.json)

## Setup

Use Python 3.10+, Node.js 22+ and pnpm 11.19.0. Python uses only the standard
library. Browser testing uses a pinned Playwright version and its matching Chromium.

The selected photographs are versioned in `task/sources/`. Their hashes are
checked against `task/source-manifest.json`; preserve the original bytes.
The CI workflow runs unit tests and the full offline browser calibration.
It pins Ubuntu 22.04 to support the bundled Chromium sandbox without changing
the host's AppArmor policy or disabling browser sandboxing.

```sh
pnpm install --frozen-lockfile
PLAYWRIGHT_BROWSERS_PATH="$PWD/.cache/browsers" pnpm exec playwright install chromium
python3 -m unittest discover -s tests -v
python3 -m ornithopter_eval validate
```

On Linux you may need `pnpm exec playwright install --with-deps chromium` instead.
The CI workflow installs browser system dependencies. Grading needs permission to
bind a loopback-only test server and launch Chromium with its sandbox enabled.
Do not disable the sandbox just to obtain a score.

To explore the reference simulator:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory reference
```

Open `http://127.0.0.1:8000`. It is a calibration fixture, deliberately withheld
from the evaluated agent. It is not a model submission or a recovered flight design.

## One-attempt model run (when a key is available)

Set `OPENAI_API_KEY` in your local environment or in the Git-ignored `.env` file
at the repository root, with permissions 0600. The environment takes precedence;
the harness reads only that key and never executes the config file. Never put
the key in the task or a tracked file. Use a model that supports images, Responses
`apply_patch` and local `shell`. Tool support depends on the selected model.
No model ID is assumed.

```sh
python3 -m ornithopter_eval run --model YOUR_MODEL_ID --output runs/model-a-01 --config configs/pilot.json
python3 -m ornithopter_eval grade runs/model-a-01/submission --output runs/model-a-01/grade
```

Repeat with a different explicit model ID and a fresh output directory to compare
models. `configs/pilot.json` fixes 32,000 total output tokens (including reported
reasoning tokens), 24 API exchanges and 900 seconds. Repeated input usage is logged
separately. Medium reasoning is the explicit default, including when a custom
config omits the setting or leaves it null. Each attempt has one instruction; exchanges for file
operations are allowed. No execution or grading feedback is returned to the model.

The allowance covers reasoning, generated code/tool calls and final text across
the entire attempt. Each API request is capped at the remaining allowance.
Budget notices occur only after a completed response crosses 50% or 75%, once
per threshold, and are attached to the next normal request. If one response
crosses both thresholds, one notice combines them. There are no extra API calls,
per-exchange updates, time updates or request-count updates. A long response may
cross a threshold before a notice can be delivered; a cutoff or final submission
does not trigger another request just to deliver a notice. Notices are retained
in the event log and readable transcript.

The “shell” is a **virtual inspector**, implemented in Python: `ls`, `cat`, and
`head` over permitted files. It never invokes Bash, Python, Node or a shell
interpreter. Native `apply_patch` calls are applied by a bounded local file adapter.
There are no browser, test, build, network or computation tools for the model.

`prepare` creates an inspectable packet without an API key:

```sh
python3 -m ornithopter_eval prepare runs/packet-preview --config configs/pilot.json
python3 -m ornithopter_eval verify-sources
```

Run directories contain input copies, hashes/configuration, a submission, an
attempt manifest, and response/tool-result events. They are ignored by Git to
avoid publishing trial outputs inadvertently. The harness never logs API headers
or passes API credentials into the submission's browser environment.

## Repeated frontier-model calibration

The comparison fixes **medium reasoning** for both explicit model IDs, 32,000
total output tokens per attempt (including reasoning), 24 requests and 900 seconds.
It runs two independent generators per round, then grades their unchanged output.
There are no automatic retries or revisions after grading.

```sh
python3 -m ornithopter_eval compare --models gpt-5.6-sol gpt-6.1-sol --repeats 3 --config configs/frontier-calibration.json --output runs/frontier-medium-3x
python3 -m ornithopter_eval serve-artifacts runs/frontier-medium-3x --port 8765
```

Open `http://127.0.0.1:8765/` for all six simulators, grader screenshots, reports,
readable transcripts and source files. Each attempt retains its exact input,
budget, usage, response/tool events and submission hashes. Protocol and grader
hashes are frozen before the first round. An API or grading failure stays visible
and stops later rounds; it is never scored as a model failure.

The initial comparison reports **20 deterministic checks**. Five visual checks
remain ungraded because the previously tested image judge failed calibration.
Passing 20/20 therefore does not mean passing the full task. Three repeats are
exploratory; results are reported as observed, without tuning to a desired ranking.

Current harness code retains completed file operations from an otherwise
incomplete response and rejects unfinished operations. The first published batch
used the earlier all-or-nothing handling; its original outputs and scores are
preserved, with the effect documented in its calibration notes.

To publish a portable copy, including a ZIP of all artifacts:

```sh
python3 -m ornithopter_eval export runs/frontier-medium-3x experiments/frontier-medium-3x
python3 -m ornithopter_eval serve-artifacts experiments/frontier-medium-3x --port 8765
```

Export verifies copied bytes. The local viewer serves only that artifact folder;
the repository's API key is never served or passed to a simulator.

## Complete the five image checks

V3 reports individual pass/fail results: seven source parameters, seven physics
checks and six UI cause-and-effect checks. Physics now includes ground contact,
powered/unpowered wingbeat timing and steady glide ratio. There are no weights
or visual-quality scores.

Five image questions cover wings on both sides, tail position, transverse wing
orientation, fin presence and visible flapping. Each gets its own LLM call with
only the relevant view or short frame sequence; source comparisons also receive
the original photo. Use a separately selected image-capable model:

```sh
python3 -m ornithopter_eval judge runs/model-a-01/submission runs/model-a-01/grade --model YOUR_JUDGE_MODEL_ID
```

Or write a human review following `docs/GRADERS.md` and the JSON shape in
`docs/review-example.json`, then import it:

```sh
python3 -m ornithopter_eval review runs/model-a-01/grade my-review.json --reviewer "Reviewer name"
```

Reports retain each boolean verdict, failed-check evidence, screenshot,
submission hashes and reviewer metadata. A full task pass requires all 25 checks.
An unreviewed check is null; an infrastructure failure is never a model score.
Fixed Playwright actions use a virtual clock and observe the production state
hook. They establish narrow input-to-state behaviour; they do not independently
prove truthful coupling or realistic flight. Rendered flapping is checked from
four images separately from the numeric phase. LLM answers still require calibration.

Real-clock callback timing and simulation speed are recorded as diagnostics.
Frame-rate and running-scene jitter do not affect pass/fail until a hardware and
camera protocol is defined. Wheels and rudder actuation are outside this task.

## Repository layout

```text
task/                 Model-visible specification, starter and original images
configs/              Fixed attempt budgets
ornithopter_eval/     Standard-library Python harness, tool policy, grading and CLI
grader/               Trusted, isolated browser checks
reference/            Calibration implementation; never exposed to evaluated model
tests/                Tool-policy, budget, API-loop and binary-review tests
validation/           Offline calibration summary and reference preview
docs/                 Source audit, grader contract and human-review shape
```

Reference and selected defect mutations calibrate software checks; they are not
independent scientific validation or evidence of model rankings. A later audit
can examine grader shortcuts, judge bias and task validity before publishing claims.
Source photographs retain their original attribution; no new license to the
historical material is granted here.

API implementation references: [Apply Patch](https://developers.openai.com/api/docs/guides/tools-apply-patch),
[Shell](https://developers.openai.com/api/docs/guides/tools-shell),
[image inputs](https://developers.openai.com/api/docs/guides/images-vision), and
[stateless reasoning](https://developers.openai.com/api/docs/guides/reasoning).
