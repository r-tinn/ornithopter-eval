# Human-piloted mechanical ornithopter — v5 review task

Build a petrol-powered mechanical ornithopter carrying a **visible, recognisable
adult human pilot**. Use the family studies for wing proportions and mechanics,
then implement the supplied reference-informed engineering model inside the
standalone world. The pilot operates the aircraft; they are not its power source.

The world contains hills, 48 instanced trees and two landing strips. Cameras,
controls, rendering, timing and the pure geometric mechanism helper are supplied.
Only aircraft.mjs, physics.mjs, kinematics.mjs and interpretation.json are writable.
No downloads, packages, external assets or original-repository dependency.

One instruction, medium reasoning, 32,000 total output tokens **including
reasoning**, across all responses. Virtual file tools and patches are available;
execution, rendering, tests and grader feedback are unavailable. Budget notices
appear only after crossing 50% and 75% usage.

## Aircraft and sources

Derive `aspect_ratio=b²/S` from source 02's rounded “Say” span and original area
paragraph; derive `wrist_span_fraction` from that same column. Apply these to a
14 m span, with area `span²/AR`. Source 14 informs inner/outer articulation and
conventional tail/rudder control. Biological body dimensions are not airframe
dimensions. The source guide identifies exclusions.

Use the complete component budget in engineering.json: a 55 kg adult pilot,
224.9 kg dry mass including that pilot, and 3.6 kg initial fuel (5 litres), for
228.5 kg initial all-up mass. Force integration uses `dry_mass + fuel_kg`.
Construct a roughly 6 m airframe, engine, transmission, tail and three wheels.
The seated pilot must have a visible head/face, torso, two arms and two legs at
plausible adult proportions; their approximate standing height is 1.65 m.
Use an open cockpit or a view that reveals the actual pilot. No substitute
inspection illustration. The pilot's mesh and their mass are separate requirements.

## One wing mechanism for physics and rendering

Implement wingPose(state) in kinematics.mjs. Both physics.forces and the supplied
renderer consume it. It returns four panel records, each `{stroke,rate,twist,
twistRate}` in radians and radians/s. The shared mechanism.mjs mounts those exact
angles on production wing nodes and supplies strip positions/velocities.

Use the engineering.json sinusoidal mechanism: inner stroke is dihedral plus
inner amplitude*sin(phase); outer stroke is outer amplitude*sin(phase-lag),
relative to the inner panel. Twist is incidence plus the panel's twist
amplitude*cos(its phase). Rates are analytic time derivatives with phase rate
`omega`. Both sides use the same scalar angles; the host mirrors their axes.
With omega=0, all rates are zero and angles remain at their held crank phase.
Presets use the stated parked_phase_rad. Changing drive speed alone must never
change the wing angles discontinuously.

**No direct engine thrust, `eta*P/V` substitute or decorative flapping.** Calculate
wing forces from the supplied strip geometry and the same panel velocities that
move the mesh. Locking wing rates must eliminate powered propulsive work while
allowing gliding lift and drag. Changing outer-panel motion must affect forces.

## Required reduced aerodynamic model

Axes are x forward, y up, z right. Use the body/world transform in AIRCRAFT_API.
For each strip from wingSamples(parameters,pose):

1. Transform relative aircraft velocity `velocity-wind` into the body frame;
   add the strip's wing-motion velocity. Remove its component along strip.span.
2. Let `u` be that in-plane velocity, `v=|u|`, `d=u/v`. At negligible v, force=0.
   `alpha=atan2(-dot(d,normal),dot(d,chord))`.
3. Finite-wing lift slope is `a=a0/(1+a0/(pi*e*AR))`. Clamp alpha to +/-stall_alpha
   for attached `CL=a*(clamped_alpha-alpha0)`. Linearly blend that result toward
   `sin(2*alpha)` between stall_alpha and post_stall_transition, using |alpha|.
   Beyond the transition use the latter value.
4. Linearly interpolate the section profile-drag table at |CL| (endpoint clamp).
   `CD=roughness*profileCD + CL²/(pi*e*AR) + 1.8*sin(alpha)²*blend`.
5. `L=.5*rho*v²*strip.area*CL`, `D=.5*rho*v²*strip.area*CD`.
   `Fstrip=L*unit(cross(span,d))-D*d`. Sum in the body frame and transform to world.
   The signed aerodynamic drive load is `Paero=-sum(dot(Fstrip,strip.velocity))`.

Add airframe drag `.5*rho*V²*sum(flat_plate_areas)` opposite relative airflow.
Add gravity with the actual current mass. Rudder side force is
`.5*rho*V²*S*rudder_coefficient*rudder` perpendicular to horizontal relative flow.
The span efficiency, section table, roughness and individual airframe drag
allowances are specified separately; do not hide all drag in a single constant.

## Petrol, transmission and drive work

The named engine reference supplies a published peak rating; **16 kW continuous
shaft power is our explicit benchmark derating**, not a manufacturer endurance
rating. The petrol engine drives a reduction/linkage/flywheel, not a propeller.

Target wing rate is `2*pi*maximum_wingbeat_hz*throttle`. When fuel>0 and throttle>0,
shaft power is `clamp(governor_gain*(target-omega),0,16000*throttle)`; otherwise 0.
Wingbeat frequency therefore responds to aerodynamic load, rather than staying
at a fixed two hertz regardless of power.

Use equivalent drive energy `Ed=.5*J*omega²`. Over each fixed step:
`Ed_new=Ed + eta_transmission*shaft_work - Paero*dt - friction*omega²*dt`.
Fuel use is `shaft_work*BSFC/3,600,000 + idle_kg_s*dt` while throttle>0 and fuel>0.
Never consume negative fuel or use more than remains. Prorate shaft work on the
final fuel-limited step. Integrate with the current pose before advancing phase.
Advance phase by current omega*dt; derive next omega from Ed_new.

Track cumulative shaft_work_J, aero_work_J and drive_heat_J. Transmission losses,
drive friction and any discarded drive energy enter heat. The mechanism uses an
explicit idealised brake/lock on zero throttle or empty fuel: complete the current
step's phase advance, then omega becomes 0 and the reached phase holds. Residual
drive energy is dissipated. The wings stay where the mechanism stopped; they do
not snap to a different pose. Gliding remains possible, with trim dependent on
that locked pose.
Do not silently create energy if a step exhausts drive energy; subdivide or reject
that step. This is a reduced energy-buffer model, not a torsional structural model.

## Flight, contact and geometry

Use semi-implicit Euler, with internal steps <=1/120 s; accept dt in (0,.05].
Use the supplied pitch/roll acceleration and rate damping. Integrate rates into
attitude with the supplied limits. **Neutral bank input damps roll rate; it does
not command wings level.** Heading follows horizontal velocity above 0.1 m/s.
There is no altitude hold, automatic lift compensation or scripted flight path.

Ground contact uses the terrain under each rotated wheel, its radius, and the
highest required support correction. Ground support cancels downward force.
Rolling resistance uses the supplied coefficient times supported load; braking
adds at most the stated brake force, without reversing velocity. A touchdown
within the sink-speed, horizontal-speed and bank limits is landed; otherwise
crashed. Tyre meshes must not penetrate the terrain. With zero steering, every
wheel axle stays parallel to the airframe lateral axis as the wheel spins.

Keep aircraft geometry <=12,000 triangles. Reuse geometry/materials and allocate
no new meshes/materials per animation frame. Record source uses, translated
mechanics, all new assumptions and limitations in interpretation.json.

This is a new draft protocol for review. Reference-informed assumptions and
software calibration do not validate a real aircraft. Prior v4 scores do not
apply, and the handwritten fixture is not a model result.
