# Deterministic airframe revision: airframe-binary-v2

This explicit revision retains the nine source images, all engineering constants,
crash limits, four editable files, medium reasoning and the 480-second deadline.
It supersedes the older packet's human aesthetic-rating instructions. There is
no human or LLM judge. Seven existing checks and these three checks each earn one
point (/10); a failed file-only audit zeros the attempt.

- Give the pilot physical clearance through the full wing cycle. Aircraft parts
  must not pass through the head, body or limbs. Normal seat, harness, pedal and
  hand-control contact is allowed. The grader samples actual mesh surfaces over
  the cycle; it ignores penetrations below 8 mm.
- Model the moving wing-drive linkage, including connected moving members from
  the engine region towards the wing roots. Crank, connecting-rod and telescoping
  arrangements are allowed. A static engine box or unconnected decorative wheel
  is insufficient. The deterministic check measures joined moving slender members;
  it does not certify joint forces or mechanical advantage.
- Keep actual outer-wing leaf motion smooth and consistent with the prescribed
  sliding recovery mechanism. A fast but correctly prescribed recovery is allowed;
  discontinuous jumps, double transforms and excessive tip speeds/accelerations fail.

Rear-truss geometry and forward-fuselage visual polish are not scored. The exact deterministic predicates and their limits are published
in docs/AIRFRAME_BINARY_V2.md.
