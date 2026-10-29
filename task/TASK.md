# Swan Flight Lab — swan-v1.0

Build a dependency-free interactive 3D ornithopter flight lab from the two source
photographs and SOURCE_GUIDE.md. Deliver a self-contained static site in
`submission/`: `index.html`, `physics.mjs`, `interpretation.json`, plus optional
local JS/CSS. No downloads, build step, imports from a CDN, or external requests.
Canvas with real 3D projection or WebGL are both acceptable. A flat sprite is not.

## One attempt

You receive one user instruction, a fixed budget and the same starter files as
every other model. You may inspect supplied text files and edit your submission.
You cannot execute code, calculate using tools, run a server, build, render,
lint or test, or see grading feedback. Tool exchanges for reading and writing
are allowed within this single attempt. Finish with a brief completion message.
All execution and grading occur after submission. Patch-application success is
file-operation feedback, not program verification. The shell tool is a virtual
file inspector: only `ls PATH`, `cat PATH`, and `head -n N PATH` are implemented;
it never runs a command or launches a process. Paths start `inputs/` or `submission/`.

## Interpret the sources

Export `parameters` from physics.mjs with numeric SI fields:
`span_m`, `wing_area_m2`, `wrist_span_m`, `shoulder_span_m`, `body_width_m`,
`overall_length_m`, and `aspect_ratio` (derive b²/S). Read values from page 02
using the source guide. Use 1 ft = 0.3048 m and 1 in = 0.0254 m exactly.
`interpretation.json` must contain `sources` (an array of objects with `id`,
`used_for`), `assumptions` (array of strings), `excluded_fields` (array of strings),
and `limitations` (array of strings). Explain your decisions in those fields.

## Explicit benchmark model (new assumptions)

Use SI, x forward, y up, z lateral. Mass = 6 kg; g = 9.80665; rho = 1.225 kg/m³.
This is a point-mass, cycle-averaged model, with independently animated wing
panels, not a structural, unsteady-flow or aeroelastic solver.

Export pure functions `forces(state, controls, environment)` and
`step(state, controls, environment, dt)` from physics.mjs. They must use the same
production implementation as the browser. Inputs must not be mutated.

State: `{position:[x,y,z], velocity:[vx,vy,vz], pitch, roll, phase, time, status}`.
Angles are radians. Controls: `{throttle, pitch, bank, brake}` with throttle/brake
in [0,1] and pitch/bank in [-1,1]. Environment: `{wind:[wx,wy,wz], rho}`.

Forces: relative air velocity = velocity − wind; speed = its norm. With
`alpha = state.pitch − atan2(vy_air, hypot(vx_air,vz_air))`, set
`CL = clamp(0.6 + 3*alpha, -0.2, 1.4)` and
`CD = 0.035 + CL²/(pi*0.8*aspect_ratio)`.
`L = 0.5*rho*speed²*S*CL`, `D = 0.5*rho*speed²*S*CD`.
Mechanical power P = 400*throttle W; cycle-averaged thrust
`T = 0.65*P/max(speed,5)`. Propulsive power T*speed may not exceed 0.65*P.
This thrust models an assumed powered flapping drive, not experimentally proven
wing performance. At zero speed use [1,0,0] as the forward unit vector.

Drag opposes relative flow and thrust follows it. Lift is perpendicular to
relative flow: project world-up onto that perpendicular plane, normalize,
then rotate about the forward vector by roll. Use a finite fallback for vertical
flow. Gravity is [0,-mass*g,0]. Return
`{lift,drag,thrust,power,airspeed,cl,force:[fx,fy,fz]}` (force includes gravity).

For dt in (0,0.05], advance with semi-implicit Euler (velocity before position).
Pitch changes at `0.5*controls.pitch` rad/s, clamped to [-0.35,0.45]. Roll approaches
`0.6*controls.bank` at at most 2 rad/s. Phase advances at 2 Hz while powered and
stops with zero throttle. Use current-state forces before updating attitude.
Reject invalid dt. Use fixed physics steps of 1/120 s in the real-time UI.

Ground is y=0.2 m. On the ground support cancels downward vertical force.
Braking adds up to 18 N against horizontal motion without reversing it.
Lift can overcome weight to allow takeoff; do not impose a flight path.
On an airborne touchdown, sink speed <=3 m/s, horizontal speed <=14 m/s and
abs(roll)<=0.35 rad produce `landed`; otherwise `crashed`. Ground status is
`grounded` before first takeoff; airborne status is `flying`. Prevent penetration.
No auto-level, altitude lock, prescribed sine trajectory, or hidden autopilot.

## Browser contract

Render a visible articulated model with symmetric inner and outer wing panels,
wrist locations and overall proportions informed by the source. The outer panel
must visibly change angle relative to the inner panel; use a documented assumed
stroke. Include a tail and fin/rudder, ground/runway, depth cues and an orbitable
inspection view. State clearly that this is an educational approximation.

Required `data-testid` elements:
`scene` (canvas, at least 600×350 CSS pixels at a 1280×800 viewport),
`start`, `pause`, `reset`, `approach`, `throttle` (range 0..1), and `telemetry`.
ArrowUp/ArrowDown change pitch, ArrowLeft/ArrowRight change bank; Space brakes.
Telemetry displays speed, altitude, simulation time and status, updates while
running and freezes on pause. Handle key release and focus loss.

Reset to position [0,0.2,0], velocity [0,0,0], zero attitude, phase/time 0,
status grounded, throttle 0, paused. Start runs physics. Pause freezes physics
and wing animation. `approach` loads position [0,2,0], velocity [10,-1,0],
pitch/roll/phase/time 0, status flying, throttle 0, paused. Both presets must
render immediately. Simulation must support takeoff with power and manual pitch,
and a safe landing from the approach preset with sensible input.

Expose `window.flightLab = {getState(), getControls()}` returning JSON-safe
copies of the actual state and controls used by the render/physics loop. This is
observation only: no grader-specific behavior. A 3D visual/source review is
separate from numeric parameter checks; publishing a claim of physical validity
requires evidence beyond this eval.
