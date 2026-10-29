# Grading contract

The task and numeric contracts are public. The evaluated agent can access only
its prepared `inputs/` and `submission/` through the virtual tool adapter; it
cannot read this grader, reference implementation, hidden expected values, API
credentials, or local repository. Public publication is not a guarantee against
future training contamination. This is **one task**, not a demonstrated general
benchmark or a claim of saturation resistance.

| Dimension | Weight | Evidence and limits |
|---|---:|---|
| Source checks | 25% | SI source parameters within 0.5% relative tolerance; required interpretation fields and source IDs. Documentation completeness does not establish semantic accuracy. |
| Physics | 35% | Wind/flow, units, density, stall clamp, power budget, force directions, integration, immutability, contact, takeoff, repeatability, energy and step-size checks. These establish compliance with the specified approximate model. |
| Browser interaction | 20% | Fixed Playwright actions: controls, pause, reset, pitch/bank, landing approach, brake, orbit, telemetry, errors and network requests. This is scripted computer interaction, not an autonomous CUA-model pilot. |
| Source/visual interpretation | 10% | Explicit human or multimodal judge review of source images, documentation and rendered frames: planform, proportions, two-panel articulation, tail and honest attribution. |
| Visual quality | 10% | Explicit human or multimodal judge review of depth, usability, layout and visible artifacts in sampled frames. |

Checks within each deterministic dimension are equally weighted, with a fixed
denominator: 9 source, 22 physics and 14 interaction checks. Unreached checks fail;
early module/UI errors cannot shrink the denominator and inflate a score. Force comparisons
use a relative/absolute combined tolerance of 1e-6 against an independently written
oracle. This strict tolerance applies to equations, not confidence in real-world
aerodynamics. The step-size check allows 0.25 m position difference over one second
at the stated scenario; it is a numerical convergence sanity check, not a universal
error bound. Accepted source rounding should be used consistently in the force
equations. Individual failures and actual/expected evidence remain in the report.

An overall weighted score exists only when **all five** dimensions have scores.
Missing review yields `overall_score: null`, never a silent renormalization.
Always publish the dimension breakdown, attempt status and configuration too.

## Reproducibility and evidence

Runs record task/input/starter hashes, exact model identifier, configuration,
token usage, elapsed time, request/response and tool-result events, completion
status, and final file hashes. Output-token budget includes reasoning tokens
reported by the API; repeated input-token consumption is recorded separately.
There is a request cap and a wall-clock cap. Transport failure is not retried
automatically because the provider may have already consumed an attempt.

The API may consume a final request up to its timeout. A response arriving after
the wall-clock deadline is recorded but its edits are not applied. Byte/file
limits and file access are enforced by host code. No dependency installation,
shell interpreter, model subprocess, browser or verification tool is exposed.
The task can require multiple Responses exchanges for file operations; “one
attempt” does not mean literally one HTTP request or prohibit thought/editing.

The grader serves only submitted static assets to fresh Chromium with network
requests blocked, service workers disabled, a restrictive CSP, a clean credential
environment, a separate browser profile and a process-group timeout. It never
executes submitted Node/Python code on the host. Chromium's sandbox is enabled.
These measures are not an independently hardened sandbox for actively hostile
submissions; use a disposable VM/container when evaluating adversarial code.

Browser tests capture initial/orbit screenshots, powered wingbeat samples and
landing samples. Exact paused-canvas equality checks a frozen scene only. Dynamic
sample review cannot prove absence of all flicker, depth correctness, source
fidelity or real-world flight validity. Visual reviewers must state uncertainty
and cite filenames. A multimodal judge is optional, uncalibrated and potentially
biased; retain its model ID and output separately from deterministic results.

`validate` submits a newly written reference through an injected offline Responses
transport and the real native patch adapter, then grades it. It also grades wrong
length units, thrust independent of power, broken integration, and an empty starter.
Detecting these proves only those checks are sensitive to those defects. Neither
the fixture nor mutation testing establishes coverage of all possible shortcuts.
The source/visual grader remains necessary because valid exported numbers alone
do not establish that the displayed mesh or production simulation uses them.

## Failures and comparisons

`submitted` means the model ended the attempt; `budget_exhausted` is a distinct
model-attempt outcome and may leave partial files. `infrastructure_error` means
transport, environment or malformed API accounting; do not report it as a zero.
Missing/broken module or UI yields failed checks. A browser timeout is reported as
`submission_timeout` requiring triage, because infrastructure slowness and infinite
submission loops cannot always be distinguished automatically.

For comparisons, fix the task version, source hashes, starter, token/request/time
budgets, reasoning setting, host/browser environment and grader revision. Report
every attempt; do not silently select the best retry. Model sampling remains
stochastic. Repeated attempts and confidence intervals are needed before strong
ranking claims; v1 does not invent confidence from a single run.
