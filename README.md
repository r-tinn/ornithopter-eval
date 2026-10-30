# Ornithopter Eval

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
**No live generator attempt has been tested yet.**
There is no claim of general benchmark validity or real-world aircraft validity.

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
models. `configs/pilot.json` fixes 16,000 total output tokens (including reported
reasoning tokens), 24 API exchanges and 900 seconds. Repeated input usage is logged
separately. Set the same explicit reasoning setting in the config when comparing
models that support it. Each attempt has one instruction; exchanges for file
operations are allowed. No execution or grading feedback is returned to the model.

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
