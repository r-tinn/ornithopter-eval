# Deterministic airframe revision: airframe-binary-v5

This explicit revision retains the nine source images, all engineering constants,
crash limits, four editable files, medium reasoning and the 480-second deadline.
It supersedes the older packet's human aesthetic-rating instructions. There is
no human or LLM judge. Seven existing checks and these three checks each earn one
point (/10); a failed file-only audit zeros the attempt.

- Give the pilot physical clearance through the full wing cycle. Keep at
  least 20 cm between the head and the swept wings and moving hardware.
  Aircraft parts must not pass through the head, body or limbs. Normal seat,
  harness, pedal and hand-control contact is allowed. Shallow contact around
  the soles of the feet gets limited extra tolerance.
- Build a visibly connected moving drive from the input to the wing. For a
  crank drive, keep the moving pin joined to its connecting rod and tie the
  rod's other end to a consistent wing attachment point. A cam and follower
  can instead transmit the motion to the wing directly or through a rocker
  at the wing root. A separately animated pulley and a rod that follows the
  wing from a fixed airframe anchor do not form a connected drive.
- Keep actual outer-wing leaf motion smooth and consistent with the prescribed
  sliding recovery mechanism. A fast but correctly prescribed recovery is allowed;
  discontinuous jumps, double transforms and excessive tip speeds/accelerations fail.

Rear-truss geometry and forward-fuselage visual polish are not scored. The exact deterministic predicates and their limits are published
in docs/AIRFRAME_BINARY_V5.md.
