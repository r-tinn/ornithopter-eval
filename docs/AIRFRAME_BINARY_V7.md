# airframe-binary-v7

This grader-only revision keeps the same ten binary checks and the exact same
task prompt. Use the saved submissions and run the checks locally. The change
is limited to torso and arm penetration within pilot clearance.

The 20 cm head gap and the upper-body height band are unchanged. The
penetration margin is 25 mm to ignore shallow surface overlap. A stationary
narrow control component may overlap a compact forward hand mesh; a
stationary broad, thin rear support may contact the central torso. These
are geometric heuristics, not exemptions based on mesh names, model identity
or human ratings. A moving part cannot use either exception. The evidence
distinguishes permitted contacts from the remaining witnesses. The geometric
proxy can miss real clipping or flag unusual contact geometry.

Independent author fixtures exercise contact grips, seatbacks, torso and arm
intrusions, head spacing, and detached and frozen drives. The Astra outputs
were used as retrospective regression cases after manual inspection. Prior
scores remain available and were not overwritten.
