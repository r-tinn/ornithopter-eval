# Five-model v7 attempt: infrastructure failures and a deadline

One attempt each was requested for GPT-6.1 Sol, GPT-6 Astra, GPT-5.6 Sol,
GPT-5.5 and GPT-5.4. All five exact IDs were confirmed accessible before
launch. They received the same frozen nine-photo source packet and scaffold,
medium reasoning and 480 seconds. No benchmark token/request cap was imposed.
All five generators were dispatched in parallel, with no automatic retries.

**No attempt produced a usable simulator. This batch cannot support a model
ranking or conclusions about task difficulty or the adequacy of the deadline.**

| Model | Attempt outcome | Raw task result | Time to termination |
|---|---|---|---|
| GPT-6.1 Sol | Transport failure (`URLError`) | Unscored | 78.168 s |
| GPT-6 Astra | Deadline during an in-flight response; no aircraft implementation completed | 0/7 on the incomplete files | 480.010 s |
| GPT-5.6 Sol | Transport failure (`URLError`) | Unscored | 17.786 s |
| GPT-5.5 | Responses API HTTP 503 | Unscored | 15.050 s |
| GPT-5.4 | Transport failure (`URLError`) before any successful response | Unscored | 3.015 s |

Astra received three successful responses, then its fourth request stayed
in flight until the total deadline. Its 0/7 is the literal grader result on
the incomplete starter, whose production startup is not ready. It is not
comparable to a completed model submission. The recorded 108 output tokens
exclude the interrupted request because it returned no usage; this is not
evidence of low token consumption within that request. The record does not
distinguish model reasoning time from provider or transport delays. Astra's
file-only validity check passes; the four infrastructure-aborted audits are
unavailable rather than failed. No human aesthetic rating has been assigned.

The four early errors happened well before 480 seconds. The harness records
HTTP 503 explicitly, but its current generic transport diagnostic does not
preserve the underlying `URLError` reason. We cannot attribute those errors
to a particular network layer or claim that parallelism caused them.

The author reference passed all seven checks immediately before the batch;
the previously documented nine targeted mutants remain rejected. Code and
protocol were committed at `43a196d80e05f6578f484345aba3d1ede4c27e40`.
The frozen input, config, initial instruction, tool traces, responses, partial
submissions and Astra's failed grading evidence are retained. No model output
was repaired, regraded selectively or replaced. Any fresh attempt should be
labelled separately and retain this original failed cohort.
