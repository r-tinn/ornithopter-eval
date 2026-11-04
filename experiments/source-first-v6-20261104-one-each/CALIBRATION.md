# Source-first v6: one trial per model

Both models received the same nine original photos, engineering assumptions,
four-minute deadline and medium reasoning. Six binary task graders are separate
from file-only validity and human aesthetic realism. This is an exploratory pair.

| Model | Raw task checks | File-only validity | Termination | Playback |
|---|---|---|---|---|
| GPT-5.6 Sol | 3/6 | Fails strict reader syntax | Submitted | Startup fails: missing returned wing Surface references |
| GPT-6.1 Sol | 5/6 | Pass | Four-minute cutoff | Opens; powered takeoff test crashes; glide preset works |

5.6 passed elastic/inertial exchange, glide balance and wheel-axis checks. Its
rounded AR=8.29 differs from the required derived ratio, affecting production
geometry/forces and some coupled-pitch comparisons. The UI also cannot find
leftInnerSurface because it was created but omitted from the returned object.
The strict file reader rejected a chained cat/cat command using &&. It attempted
only file reads; this is not evidence of attempted tests or code execution.
The original strict-policy failure is retained, so it is excluded from valid-run
means. Its raw task result is still displayed.

6.1 passed wing-cycle geometry/forces, elastic/inertial exchange, wing/body pitch,
glide balance and wheel-axis checks. It failed the powered takeoff/bank scenario,
crashing during runway/ground-contact motion before sustained takeoff. All four
files were saved before the deadline; the final in-flight API request was cut
off. Unknown token usage for that interrupted request is recorded as unknown.
No additional model time, retries or author repairs were supplied.

## Grader correction retained alongside initial grading

The task says to clamp section-table lookup to its endpoints, then apply a
separate camber correction using cos(alpha). Both models used the actual alpha.
The initial author reference/oracle accidentally used the clamped lookup angle
inside that cosine, causing small spurious force mismatches in reversed flow.
The reference/oracle were corrected to match the published formula, and the
unchanged submissions were regraded into grade-corrected/. Original grade/
reports, logs and screenshots remain. The correction does not change either
model's six-check score: both still fail powered takeoff. No thresholds or
source data were adjusted. New regression coverage checks out-of-range alpha.
See experiment.json grading_corrections and each report's grader hashes.

The linked Captures and Checks use the corrected grading. Initial grading is
also linked. The human 1–5 aesthetic score is ungraded until the owner flies and
rates a submission. The author reference is excluded from this model cohort.
