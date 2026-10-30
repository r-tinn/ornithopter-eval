# First frontier calibration: useful findings, no clean model ranking

Six independent API trials ran on 30 October 2026: three each for
`gpt-5.6-sol` and `gpt-6.1-sol`, with **medium reasoning on every request**.
There were no trial retries, execution tools, autonomous tests or grader feedback.
The source packet, task, grader and budget were frozen before the first request.

## Frozen protocol and raw results

Task: `swan-v3.0`. Protocol commit:
`b6c3703ff35304e269ee06118b304a52817d38e1`.
Each attempt had 16,000 total output tokens, including reasoning, at most
24 requests and 900 seconds. Two models ran concurrently per round; the browser
grader ran after submission. Exact hashes are in `experiment.json` and each
attempt's `manifest.json`.

| Model | Repeat | Automated checks | Outcome | Output tokens | Generation seconds |
|---|---:|---:|---|---:|---:|
| gpt-5.6-sol | 1 | 17/20 | Submitted | 11,920 | 97.484 |
| gpt-5.6-sol | 2 | 17/20 | Submitted | 10,130 | 79.796 |
| gpt-5.6-sol | 3 | 17/20 | Submitted | 10,870 | 88.103 |
| gpt-6.1-sol | 1 | 0/20 | Token cap during a file patch; no runnable simulator | 16,000 | 267.602 |
| gpt-6.1-sol | 2 | 20/20 | Submitted | 15,746 | 223.217 |
| gpt-6.1-sol | 3 | 20/20 | Runnable code finished; closing message hit token cap | 16,000 | 244.779 |

Raw mean checks passed: 17.00/20 for 5.6, 13.33/20 for 6.1. These are descriptive
results of this frozen protocol, **not evidence that 5.6 is the stronger model**.
Five submissions passed all six interaction checks. Each is available unchanged
through the artifact viewer. The remaining attempt retains its unchanged starter,
initial-page screenshot and full generated patch text in the response log.

All five visual checks remain ungraded for every attempt. The previously tested
image judge failed consistency calibration. A 20/20 result here is not a full
25-check task pass. The source/physics/UI checks also do not prove full physical
correctness, faithful mesh coupling, or realistic flight.

## Finding 1: force representation contaminates the score

All three 5.6 submissions returned three-component vectors for `lift`, `drag`
and `thrust`. The three failing physics checks expected scalar magnitudes.
The task gives scalar force equations and names the returned fields, but does
not explicitly type these three fields. Returning vectors is a plausible reading.

The saved observations in every 5.6 trial have zero thrust magnitude with power
off, 26 N with power on, exactly four times the lift magnitude at twice the
airspeed, and zero lift magnitude when wind matches aircraft velocity.
These three failures therefore do not establish incorrect physical behaviour.
`posthoc-audit.json` records the magnitudes, without modifying any score.

Before another comparison, make the output types explicit and calibrate the
grader against alternate valid representations. This batch does not establish
that the numerical/UI portion is difficult enough for frontier models.

## Finding 2: incomplete-response handling loses completed work

In 6.1 repeat 1, the final API response contained four completed file operations
followed by an unfinished `app.mjs` patch. The original harness discarded every
operation in an incomplete response, including the completed ones. Its 0/20
combines token exhaustion with this harness defect; it must not be interpreted
as twenty independent reasoning failures. The unfinished application still
prevents claiming that this attempt produced a working simulator.

After all six trials finished, the harness was fixed for future runs: apply
operations explicitly marked completed, reject unfinished operations, then stop
without another API request. A regression test covers this case. **None of these
six submissions or original grades were repaired, rerun or rescored.** The frozen
commit above reproduces the original handling; current code includes the fix.

In 6.1 repeat 3, the only unfinished item was its final text message. Its complete
simulator had already been written in earlier responses and passed all 20 checks.

## Inspect the artifacts

From the repository root:

```sh
python3 -m ornithopter_eval serve-artifacts experiments/frontier-20261030-medium-3x --port 8765
```

Open http://127.0.0.1:8765/ for simulator links, source, readable transcripts,
individual check evidence and screenshots. No API key or browser dependencies
are needed to serve the saved static simulators. The exported folder also
contains `artifacts.zip` and `export-sha256.json`.

Every attempt retains the original source images, instruction, budget, runtime,
API usage, raw responses, tool results, submission and grader captures. Submission
hashes and explicit medium reasoning settings were verified after the batch.
No completed trial was selected for replacement. The three repeats are
exploratory, and this is one tightly specified implementation task.
