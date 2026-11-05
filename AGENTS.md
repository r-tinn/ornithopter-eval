# Project context and standing authorization

This is R-Tinn's personal family ornithopter evaluation project. It is not a
company project. Use the personal `r-tinn` GitHub account and this repository:
`https://github.com/r-tinn/ornithopter-eval`. Do not connect it to OpenAI-FDE or
other work/company accounts.

The owner explicitly confirmed on 30 October 2026 that the family has given
permission to use this project's notebook photographs and simulator images,
that the project material is intended to be public, and that these images may
be sent to OpenAI for evaluation and grader testing. This authorization covers
the selected source photos, generated inspection/flapping screenshots and
deliberately broken simulator variants used to calibrate the eval, including
publishing project material in the personal repository.

Treat this permission as standing within that scope. Do not ask the owner to
approve these same uses again merely because another screenshot, test variant,
grader pass or session is involved. This does not authorize unrelated projects,
accounts, services or data.

Keep API keys local in the Git-ignored `.env` with owner-only permissions. Never
commit keys, expose them in outputs, or pass them to evaluated submissions.

Prefer focused binary checks and report their exact scope. Preserve failed
judge calibration and conflicting judgments; do not select retries to hide them.

For the next source-first protocol, use medium reasoning and a 480-second
generation deadline, via configs/source-first-v7.json or the explicit overlay
configs/source-first-time-8min.json. No benchmark token or
request-count cap. Preserve the old token profiles for reproduction. Do not
silently reinterpret a saved task/config as the new protocol.
The current v7 rubric has nine outcomes: seven binary task graders including the
neutral-input powered_pitch_stability check and the
existing wheel_rotation_axis regression, plus no_verification_tools as a separate
validity result, and a separate human aesthetic_realism rating from 1 to 5 after
the owner flies the submission. Never invent a human rating or combine it into
the binary task total. Preserve rating revisions and submission identity.
Time-budget notices are limited to the 50% and 75% thresholds (240 and 360 s),
delivered at the next exchange; do not send ongoing usage updates. Retain
the original settings for published cohorts.
Keep configs/source-first-time.json as the original four-minute profile. Keep the
added takeoff instruction brief: sustained flight before the runway ends, without
unstable bouncing or premature ground-contact release. Do not add numeric crash
thresholds or diagnostic implementation advice to that instruction. Keep the
existing engineering model and crash limits unchanged, except for the explicit
versioned stability revision below.

The current eval is a mechanical ornithopter inside a supplied lightweight
world. The swan studies inform wing proportions/mechanics, not a literal animal
design target. Keep only hills, a few trees and two landing strips; bundle all
needed files here so the original project is never a runtime dependency. No
other aircraft or complicated scenery systems are needed. The source-first v7 task uses nine photos (02,08–15), a 55kg pilot and revised favourable 177.5kg wet budget. Do not present an author reference fixture as a model result. Use configs/source-first-v7.json for new cohorts; all seven task graders must pass the author reference and reject the documented targeted mutants before a model cohort.

V7 is a separate stability revision. Preserve all published v6 six-check scores
and packets. The new pitch check targets large multi-second hunting with fixed
full throttle and neutral pilot input; small wingbeat pitch motion is acceptable.
V6's handwritten reference also hunted, so v7 explicitly changes the illustrative
passive pitch damping from140 to1000 N m s/rad, with its dissipated energy counted.
All other engineering constants, notebook sources, mass and crash limits stay fixed.
Approach starts paused, 450 m before the runway and 100 m above local gear
contact, as a zero-power glide. A user throttle request releases the
glide clutch; the finite engine spins the wings up, and zero power then coasts.
Saved v6/v7 playback gets a labelled host-control/preset overlay and an original-playback
option. Never repair saved model physics or overwrite their recorded grades.
