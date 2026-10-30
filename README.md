# Ornithopter Eval

**The intended next task is a mechanical aircraft inside a fixed, lightweight
flight world.** The [v4 review candidate](candidate/mechanical-v4/README.md)
includes standalone hills, 48 simple trees, two landing strips, controls and
cameras. Only aircraft geometry, articulation and flight dynamics are model work.
The [revised brief](docs/REVISED_BRIEF.md), [candidate task](candidate/mechanical-v4/TASK.md),
[source re-audit](candidate/mechanical-v4/SOURCE_AUDIT.md) and
[19 proposed binary checks](candidate/mechanical-v4/GRADERS.md) are ready for review.

```sh
python3 -m ornithopter_eval prepare-world runs/mechanical-v4-review --reference
python3 -m ornithopter_eval serve-world runs/mechanical-v4-review --port 8766
```

Open `http://127.0.0.1:8766/`. The aircraft in this preview is a handwritten,
withheld integration fixture. The environment, renderer and license are copied
into this repository; the old project is not needed to prepare or run it.
V4 is a review candidate, with no model scores or completed grader calibration.
The existing `run`/`compare` commands below still implement the previous v3 task;
they do not run this candidate. The original trials are retained unchanged.

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

The current task is **swan-v3.1**: the task and starter require scalar `lift`,
`drag` and `thrust` in newtons, with signed lift and a separate total-force vector.
The first live cohort remains archived as swan-v3.0 with its original grades.
New generator runs default to **32,000 total output tokens, including reasoning**,
with **medium reasoning** explicitly requested for every model. The harness sends
only two token-budget checkpoints, after crossing 50% and 75% usage. The first
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
python3 -m ornithopter_eval run --model YOUR_MODEL_ID --output runs/model-a-01
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
python3 -m ornithopter_eval prepare runs/packet-preview
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
