# Mechanical v4 smoke test — 30 October 2026

One independent attempt per model. This is the shared-world mechanical task,
not the previous swan-v3 cohort. The protocol was committed as
`7fd662a3f91f1c383efaba11ac55e4ad6be9680c` before either live attempt.

| Model | Source | Physics | In-world integration | Automated total | Output tokens used |
|---|---:|---:|---:|---:|---:|
| gpt-6.1-sol | 3/3 | 6/6 | 6/6 | 15/15 | 12,958 |
| gpt-5.6-sol | 3/3 | 6/6 | 6/6 | 15/15 | 19,842 |

Both attempts submitted normally within 32,000 total output tokens, including
reasoning. Every request explicitly used medium reasoning. No model had execution,
browser, verification or grader feedback. Native file-application feedback was
available. There were no API retries, repeat attempts, submission repairs or
post-hoc rescoring. GPT-5.6 initially tried to create the three existing stub files;
the native tool rejected those operations, and the model then updated the files.
That feedback and the 50% token checkpoint are retained in its transcript.
GPT-6.1 used less than 50% of the budget and received no token checkpoint.

The four visual predicates remain null/ungraded: lateral wings, aft tail,
visible landing gear and relative outer-panel articulation. No live image judge
was called. **15/15 is only the automated subtotal, not a full-task or visual-quality
score.** Timing and render/resource counts are diagnostics, not frame-rate grades.
The current automated checks do not separate these two smoke attempts. One attempt
per model cannot support a ranking; these outcomes suggest more demanding checks
or tasks are needed before using this task to compare frontier performance.

The grader was checked against a withheld working fixture (15/15), wrong source
values, broken force/phase dynamics, a frozen integrator, oversized wheel/high-poly
geometry and an empty starter (0/15). See `validation/mechanical-v4.json` in the
repository and the reproducible `validate-mechanical` command. That calibration
only covers selected defects and is not scientific validation of flight physics.

## Inspect the outputs

From the artifact viewer, open **Fly simulator** for either unchanged submission.
Set motor power to 100%, press Start, wait roughly two seconds, then briefly hold
ArrowUp. Arrow keys control pitch/bank, A/D the rudder, Space the brake, P pause,
and R reset. Inspect, Top, Side, Front and World change the supplied camera.
Approach starts the supplied zero-power landing preset; press Start to run it.
Both Valley and Meadow strips are available.

Each trial contains the original input photographs and full task/API contract,
all fixed-world files and vendored renderer/license, model-written aircraft,
physics and interpretation, manifest and hashes, raw API events, readable
transcript, source listing, grader report, sampled state/contact evidence and
13 screenshots. Submissions have no dependency on the original Ornithopter repo.

Serve this directory locally with `python3 -m ornithopter_eval serve-artifacts
experiments/mechanical-v4-smoke-20261030 --port 8767`. Then open
http://127.0.0.1:8767/. Directly opening the HTML from disk does not load ES modules.
`artifacts.zip` is a portable copy of these results.

To repeat with paid API calls, use a **fresh output directory**:

```sh
python3 -m ornithopter_eval compare --models gpt-6.1-sol gpt-5.6-sol --repeats 1 --config configs/mechanical-v4-smoke.json --output runs/mechanical-v4-smoke-new
```

Frozen protocol, source and submission hashes were verified after grading.
The API key remains only in the ignored local configuration; it is not included
in inputs, evaluated code, browser environment or archived artifacts.
