# V7 bank controller revision

Revision `v7-launch-60-65-70-bank-v2` preserves the 60%, 65%, 70% launch attempts,
14 m/s speed-feedback throttle rule and early stop after the first complete pass.
It replaces v1's clock-triggered bank at 62 s with a height-gated finite manoeuvre.
Original v7 and v1 grades, generation packets and submitted aircraft stay intact.

## Pilot sequence

1. From the original rest state, require sustained takeoff before the runway end.
2. Fly wings-level with the original pitch controller. Wait for actual tyre
   clearance over local terrain of at least 30 m and horizontal speed at least
   14 m/s for 3 continuous seconds. At least 5 seconds must have passed since
   confirmed sustained takeoff. Fail if readiness is not reached by 150 seconds.
3. Smoothly ramp the target from zero to the **original 0.45 rad bank angle**
   over 8 seconds using cubic smoothstep. Apply the original finite bank input
   controller and aircraft coefficients; do not clamp aircraft pose/rate.
4. Hold the target for 6 seconds, smoothly roll out over 8 seconds, then observe
   8 seconds of wings-level recovery.

Require actual bank above 0.25 rad for at least 3 continuous seconds during the
hold, uninterrupted airborne status from manoeuvre start through recovery,
completed manoeuvre, final bank magnitude below 0.08 rad and original final
clearance above 1 m. A craft that never reaches height, ignores bank commands or
crashes cannot pass. Total simulated duration is bounded by 180 seconds per
attempt; the bank sequence ends after its 30-second programme, not an arbitrary
70-second clock. Browser grading has a separate 360-second real-time timeout.
This does not alter the model's 480-second generation deadline.

Engine limits, aerodynamic equations, mass, wing motion, energy derivatives,
force comparisons, fuel tolerances, crash limits and the six other task checks
are unchanged. No altitude hold, direct lift compensation, injected speed/height,
configuration change or repaired model physics is added. Descent in the turn is
allowed; the pilot gives it height and rolls out rather than demanding level flight.

## Reason for revision

The old pilot began turning with only about 4.5 m clearance on the 60% Sol/Astra
launches, about 2 seconds after confirmed takeoff. It reached 19 degrees bank in
2 seconds and peaked at 12 degrees/s, then stayed banked. Without that bank,
both unchanged submissions remained airborne to 120 seconds with about 62 m
clearance. Those are local diagnostic counterfactuals, not new model trials.

The new policy was selected from author-reference experiments before testing
its bank programme on saved model submissions. Tests included 20/30/40/50 m
height gates, the original and a smaller target angle, different roll-in times,
plus a deliberately unreachable height gate. The selected policy retains the
original angle, uses the 30 m gate for margin, and gives a peak roll rate around
4.7 degrees/s on the reference. This is a benchmark pilot assumption, not a
real-aircraft operating recommendation or flight validation.

The exact policy is in `grader/protocols/v7-launch-60-65-70-bank-v2.json`, hashed
in each revised report. Reports retain every attempted launch, bank readiness
state, controls/stages, minimum clearance, actual hold duration, peak roll rate
and recovery outcome. New scores require corrected-reference validation and
rejection of the nine previous mutants plus a mutant that ignores roll input.

```sh
python3 -m ornithopter_eval regrade-experiment PATH/TO/original-experiment \
  --output PATH/TO/new-bank-workbench --grading-revision v7-launch-60-65-70-bank-v2 \
  --node /path/to/node
```

Omitting a revision keeps historical full-throttle semantics. Explicit v1 keeps
its 62-second bank and 70-second horizon. A new-generation cohort must explicitly
adopt/document this revised grading protocol rather than rewriting old packets.
