# Ornithopter Eval

**Can an AI turn Stanley J. O. Tinn's old sketches and calculations into a working
3D flight lab, without running or testing its code first?**

This is a small, reproducible **single-task pilot** measuring source interpretation
and simulator implementation. It includes two audited original photographs, a
bounded task, a Responses API harness, deterministic and browser graders, optional
multimodal review, and a newly written calibration simulator.

The current delivery is validated offline. **No live model or model-judge call has
been tested yet.** An API key is needed only when you choose to run those trials.
There is no claim of general benchmark validity or real-world aircraft validity.

The historical source photographs and generated preview are currently kept local
pending approval for public sharing. The code can be published independently.

## Start here

- [The model's task](task/TASK.md) and [source guide](task/SOURCE_GUIDE.md)
- [Why these sources were selected](docs/SOURCE_AUDIT.md)
- [Scoring, evidence and limitations](docs/GRADERS.md)
- [Latest offline calibration results](validation/latest.json)

## Setup

Use Python 3.10+, Node.js 22+ and pnpm 11.19.0. Python uses only the standard
library. Browser testing uses a pinned Playwright version and its matching Chromium.

If the original photographs are absent from your checkout, obtain the authorized
source packet from the repository owner and place `Unknown-2.jpg` and
`Unknown-14.jpg` in `task/sources/`. Preserve the original bytes; their hashes are
checked against `task/source-manifest.json`. Do not substitute unrelated images.
Full task preparation, runner tests and browser calibration require this packet.
The code-only CI path runs file-policy tests and explicitly skips dataset checks.

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

Set `OPENAI_API_KEY` in your local environment; never put it in the task or a
tracked file. Use a model that supports images, Responses `apply_patch` and local
`shell`. Tool support depends on the selected model. No model ID is assumed.

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

## Complete the visual/source review

Deterministic grading reports three dimension scores and leaves the two review
dimensions **ungraded**, with no overall score. View the captured evidence in the
grade directory. A model review, using a separately selected image-capable model:

```sh
python3 -m ornithopter_eval judge runs/model-a-01/submission runs/model-a-01/grade --model YOUR_JUDGE_MODEL_ID
```

Or write a human review following `docs/GRADERS.md` and the JSON shape in
`docs/review-example.json`, then import it:

```sh
python3 -m ornithopter_eval review runs/model-a-01/grade my-review.json --reviewer "Reviewer name"
```

Reports retain separate scores, failed-check evidence, screenshots, submission
hashes and reviewer metadata. No missing dimension is silently renormalized.
Fixed browser actions are a reproducible interaction grader; a free-form CUA
model pilot is outside v1. Image samples and paused-frame equality cannot prove
that a live simulation never flickers. An attractive renderer cannot establish
correct physics or real flight.

## Repository layout

```text
task/                 Model-visible specification, starter and original images
configs/              Fixed attempt budgets
ornithopter_eval/     Standard-library Python harness, tool policy, grading and CLI
grader/               Trusted, isolated browser checks
reference/            Calibration implementation; never exposed to evaluated model
tests/                Tool-policy, budget, API-loop and scoring regression tests
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
