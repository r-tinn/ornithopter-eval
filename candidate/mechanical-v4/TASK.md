# Mechanical ornithopter in a shared flight world — v4 smoke task

Build an engineered, motor-driven ornithopter from the supplied source studies
and explicit engineering assumptions. Implement the aircraft's 3D structure,
articulated wings and flight dynamics inside the supplied flight environment.
The aircraft must be controllable on the runway, in powered flight and while
gliding, and capable of a rolling landing.

The supplied environment already includes hills, 48 trees, two landing strips,
lighting, cameras, UI, keyboard controls and fixed-step scheduling. It is the
same for every model. You are assessed on the aircraft you build within it.

## Editable files and one attempt

Edit only `submission/aircraft.mjs`, `submission/physics.mjs` and
`submission/interpretation.json`. The shared index, styles, environment and
vendored renderer are read-only. No external assets, downloads or package install
are needed. Do not replace the shared world, controls, camera or telemetry.

Use one instruction, medium reasoning and at most 32,000 total output tokens
across the entire attempt, including reasoning, code/tool calls and final text.
Virtual file inspection and native file patches are available. No execution,
rendering, tests, autonomous verification or grader feedback are available.
Token-only notices may be attached to the next normal response after 50% and
75% usage; they are not live counters. Finish with a brief completion message.

## Translate the source studies

Use source 02 to derive dimensionless aspect ratio `AR=b²/S` and the fraction
of full span occupied by the wrist-to-wrist distance. Use its rounded “Say”
dimensions and the paragraph's original total wing area. Apply these proportions
to the **3 m mechanical aircraft**, deriving its area as `S=3²/AR`.

Use source 14 for articulated inner/outer wings and conventional tail/rudder
control. The source studies inform mechanics and aerodynamic proportions.
Design the airframe, drive, wing panels and landing gear as engineered components.
The bird's body dimensions are not aircraft dimensions.

`interpretation.json` must record `sources`, `biomimetic_translation`,
`engineering_assumptions`, `excluded_fields` and `limitations`. Clearly separate
historical observations from the new engineering assumptions in engineering.json.

## Shared API

Follow AIRCRAFT_API.md. All returned state and numeric values must be finite;
inputs are not mutated. The shared platform positions and orients the actual
aircraft root using the production physics state. It mounts the same geometry
for flight and inspection; no alternate inspection illustration is allowed.

Export `parameters` with `aspect_ratio`, `wrist_span_fraction`, `wing_area_m2`,
`span_m`, `body_length_m`, `mass_kg`, `wheel_radius_m`, and `gear_centres`.
The engineering values, including three wheel centres, are supplied assumptions;
the two source ratios must be interpreted from the photographs.

## Required educational physical model

Axes: x forward, y up, z right; heading turns +x toward +z. State and controls are
specified in AIRCRAFT_API.md. Use 6 kg, g=9.80665 and density supplied by the world.
Relative airflow is velocity minus wind. For speed V and angle of attack
`alpha=pitch-atan2(vy_air,hypot(vx_air,vz_air))`, use:

```
CL = clamp(0.6 + 3*alpha, -0.2, 1.4)
CD = 0.035 + CL²/(pi*0.8*AR)
L = 0.5*rho*V²*S*CL
D = 0.5*rho*V²*S*CD
P = 400*throttle
T = 0.65*P/max(V,5)
```

`forces` returns scalar `lift` (signed L), nonnegative scalar `drag` and `thrust`
in newtons; `power` in watts; `airspeed` in m/s; dimensionless `cl`; and total
world-frame `force:[fx,fy,fz]` in newtons, including gravity. Drag opposes flow,
thrust follows flow, and lift follows world-up projected perpendicular to flow,
then banked around the flow vector. Use finite fallbacks at zero/vertical speed.
For the proposed simple rudder model, add horizontal side force
`0.5*rho*V²*S*0.15*controls.rudder` perpendicular to horizontal flow.

Use semi-implicit Euler at 1/120 s. Reject dt outside (0,0.05]. Pitch changes at
0.5*controls.pitch rad/s, clamped to [-0.35,0.45]; roll approaches
0.6*controls.bank at at most 2 rad/s. Heading follows horizontal velocity when
its speed exceeds 0.1 m/s. Use current-state forces before changing attitude.
Phase advances at 2 Hz while powered and stops without power. Animate both
inner wings and outer panels; outer-panel angle relative to its inner wing must
change during a powered cycle. Deflect the actual rudder with rudder input.

Ground contact uses the supplied `environment.surfaceHeight(x,z)` under each
rotated wheel, including wheel radius. Support cancels downward force on the
ground; braking applies up to 18 N against horizontal motion without reversing
it. Lift must cause takeoff, rather than a prescribed path. Touchdown is `landed`
at sink speed <=3 m/s, horizontal speed <=14 m/s and abs(roll)<=0.35; otherwise
`crashed`. Prevent wheel penetration. No altitude lock or hidden autopilot.

Use at most 12,000 aircraft triangles. Reuse geometry/materials, batch rigid parts
where practical and avoid allocations of meshes/materials every frame. The
shared world has no animated scenery, shadow maps or post-processing.

## Provisional smoke-test status

This task uses an educational engineering model. The handwritten preview aircraft
is a withheld integration fixture, not a model-generated result. The 15 automated
binary checks are implemented for smoke testing; four visual predicates remain
separately ungraded. Passing these checks does not establish real-world validity.
