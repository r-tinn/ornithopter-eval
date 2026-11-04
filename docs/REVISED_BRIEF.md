# Revised working prompt

Rework the evaluation so each model builds a mechanical ornithopter inside a
shared, prebuilt 3D flight environment. Reuse the useful terrain, tree and runway
elements from the original family simulator, copying and adapting everything
needed into this repository. The finished repository must run independently.

Keep the environment small: hills, a few simple trees and two landing strips.
Use static scenery, modest geometry, instancing and a restrained rendering
budget. The environment has no other aircraft or complicated scenery systems.

The model implements the aircraft's geometry, articulated wing mechanism and
flight dynamics. Withhold any existing working aircraft and flight solution
from its packet. The fixed world, cameras, controls and interface are supplied
infrastructure and receive no model credit.

Use the grandfather's studies as biomimetic engineering inspiration. Reaudit
the selected photographs, transfer appropriate wing proportions and mechanical
ideas, and state aircraft scale, mass, power and other assumptions separately.
The result should be a human-piloted engineered airframe with mechanical wings,
control surfaces and landing gear. Include a visible, recognisable seated adult
pilot of 55 kg and plausible adult proportions. The initial v5 budget is 224.9 kg
dry including the pilot, plus 3.6 kg fuel, at 14 m span. Keep a component mass
ledger, separate petrol chemical energy from shaft work, and deplete finite fuel.

Use a lightweight petrol powertrain anchored to a published engine package.
State any derating, transmission losses, aerodynamic drag allowances and fuel
consumption assumptions explicitly. Use reference section data and document
which whole-aircraft terms remain estimates; do not claim empirical validation.

Propulsion must come from the actual wing mechanism. One kinematics function
drives both production geometry and the strip aerodynamic calculation. Locking
wing motion removes propulsive work even with throttle open. Account for drive
work, losses and stored mechanical energy. Use an explicit post-stall transition,
and prevent neutral bank controls from automatically levelling the aircraft.

Propose simple binary checks of source interpretation, mechanics, force
properties, control response, takeoff, gliding, landing and wheel contact.
Keep visual questions specific and avoid aesthetic scoring.

Retain one instruction, no execution or verification tools, medium reasoning,
32,000 total output tokens including reasoning, and token-only notices after
50% and 75% usage. Preserve every submission, a playable simulator, grader
evidence and camera views suitable for independent inspection and sharing.

Present the revised task, scaffold boundary and proposed graders for review
before another model calibration.
