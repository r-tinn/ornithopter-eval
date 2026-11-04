# Source compatibility audit — 4 November 2026

**Verdict: v5 does not yet satisfy the owner's source-first requirement.**
The adult pilot, mechanical scale and petrol engine are compatible additions.
The principal problem is our earlier selection and replacement of source
mechanics, not those additions. This audit supersedes the stale v4 addendum
that referred to a 3 m unpiloted aircraft.

All fifteen original photographs were visually inspected for this audit and
matched the existing archive SHA-256 inventory. Byte-identical copies are
bundled in [the audit archive](../../audits/source-compatibility-20261104/sources/).
The executable v5 model packet still contains only photos 02 and 14. Merely
auditing the other pages does not make them available to an evaluated model.
This is an assistant visual/code audit, not an independent engineering review
or an empirical validation of Stanley's hypotheses.

The corrected source-first brief is
[SOURCE_FIRST_REQUIREMENTS.md](../../docs/SOURCE_FIRST_REQUIREMENTS.md).
The [full audit](../../audits/source-compatibility-20261104/REPORT.md) records
passages, arithmetic, implementation gaps and the exact scope of the verdict.
The v5 simulator, physics and historical calibration artifacts are preserved;
the gaps below have not been repaired by changing documentation.

## What is consistent

| Addition or retained behaviour | Source basis / assessment |
|---|---|
| Powered aircraft carrying a human | Explicit aim in photos 09, 10 and 15. The 55 kg adult is an added scenario value. |
| 14 m span, mass budget, fuel and engine limit | No fixed full-scale values in the readable pages conflict with them. They are provisional inputs; source-consistent flight feasibility is not established. |
| Tail, fin and rudder | Explicit recommendation for an elementary mechanical ornithopter in photo 14. |
| Local motion-derived lift/thrust | Consistent with photo 14's force-vector argument. V5 implements part of it. |
| Selected dimensionless ratios | Photo 02's rounded case gives AR=7.4²/6.61=8.28441755 and wrist/full span=3.7/7.4=0.5. At 14 m, S=23.65887509 m². |
| Wheels, runways, low-load world, cameras, one-shot budget | Mechanical/evaluation additions; they do not replace an aerodynamic principle. |

The 6.61 ft² is itself an elliptical-planform estimate in the source, not an
independent measured wing area. The printed AR=8.29 differs by about 0.067%
from the recomputed rounded inputs and is accepted by the existing 0.5% check.
The unavailable 7.83 comparison and the internally inconsistent 3.135 ft wing
length must not be silently mixed into this case. Photo 04 is a different
nominal swan parameter set, not a competing full-size aircraft specification.

## Where the prototype fails to preserve the principles

| Source principle | V5 problem |
|---|---|
| Photos 09/11: target trajectory → required force history → evaluate wing action | No corresponding analysis/comparison mode. Removing this principle to avoid scripted flight was a mistake: analysis can coexist with force-integrated free flight. |
| Photos 12/13/14: up/forward recovery, trailing/closing, opening and down/back working stroke | Only up/down hinges and twist; the supplied strip point has x=0 and velocity.x=0, constant panel area and no closing/sweep mechanism. Projected span varies with stroke, but the described recovery sequence is not implemented. |
| Photo 14: thin arm section and thin curved/slotted hand section | One NACA 4412-derived polar is imposed on every strip. This is a replacement assumption, not the missing coefficients of the described wing. Rendered flat panels do not fix that force-model difference. |
| Photos 11/12/15: elastic wing/body coupling, resonance and inertial work | A fixed equivalent crank inertia and an algebraically balanced work ledger omit the wing/body spring model and phase-dependent wing kinetic energy. |
| Photo 12: moving wing mass/lift position creates pitch coupling | Prescribed control/damping pitch dynamics; no wing-induced pitching moment or moving-mass coupling. |
| Photo 02: approximately elliptical outer planform | A mandatory linear taper ending at 35% root chord substitutes a different outline. Matching total area and AR alone does not preserve the outline or chord proportions. |
| Photos 12/15: best-glide choice and drag-power basis | A fixed-pose glide ratio between 6 and 14 is an invented acceptance envelope. It neither verifies best L/D nor the source's power analysis. Do not force the mechanical aircraft to the bird's approximate 15–20 either. |

The exact sinusoidal amplitudes/phase, 1.2 Hz limit and shutdown brake are new
mechanical choices. Photo 14's arm angles (−15° to +45°) and hand motion (±45°)
are a swan-takeoff observation with unclear relative/absolute hand axes, not
fully specified linkage equations. V5 instead uses inner −8.02° to +17.19° and
outer relative ±14.90°. Those values cannot be called a faithful reconstruction
of the observed stroke. They require justification in a source-consistent
mechanical completion, rather than a declaration that the source axes do not
matter. A glide configuration must also be deliberate; holding any crank phase
is not evidence of the best-glide configuration discussed in the notes.

## Consequence

Do not certify v5 as implementing all of Stanley's principles, or interpret
28/28 software checks as that certification. The source packet, task, mechanism,
aerodynamic/elastic model and affected graders need a coordinated revision using
the source-first brief. The existing reference remains an inspectable prototype.
No model trials, scores, photos or simulator code were changed by this audit.
