# V7 production contract

The four root files are writable; all environment files are supplied read-only.
Axes: x forward, y up, z right. Root Euler(roll,-heading,pitch,'YZX').

createAircraft(T,parameters) returns root plus descendant Groups leftInner,
leftOuter,rightInner,rightOuter, corresponding name+'Surface', rudder, elevator,
pilot, and three distinct actual tyre Meshes in wheels. These wing Groups are
identity transforms directly under root, with Surface under its corresponding
Group. wingPanels maps each name to an ARRAY: one actual Inner Mesh or two
actual Outer leaf Meshes. Use makePanel(T,p,name,leaf) from source-mechanism.mjs
for each geometry. Add them under its Surface with identity transform. The host
mounts the actual source-linked curved/sliding leaf geometry after updateAircraft.
Use DoubleSide fabric material. Other mechanical detail is your design.

updateAircraft animates wheels about their axle and rudder/elevator/mechanical
details. It must not replace/hide the aircraft or override the host's wing geometry.
Rendering and forces use the same model-owned wingPose. The host positions the
body relative to total-aircraft CG; do not move root yourself.

parameters includes aspect_ratio,wrist_span_fraction,span_m,wing_area_m2,
body_length_m,pilot_mass_kg,dry_mass_kg,mass_kg,mass_budget,wheel_radius_m,gear_centres.
Full component allocations and extended planform are from the supplied specification.

State: position[3],velocity[3],pitch,roll,heading,pitch_rate,roll_rate,phase,omega,
fuel_kg,wheel_angle,time,status,shaft_work_J,aero_work_J,drive_heat_J,control_work_J,
gliding:boolean,timing_bias:number, optional sweep_scale (default1; zero disables fore/aft linkage). phase/omega use radians/radians per second.
Controls: throttle/brake in [0,1], pitch/bank/rudder in [-1,1].
Environment: wind[3],rho,surfaceHeight(x,z), optional gravity,motor_enabled,
pitch_locked,damping_scale. Never mutate state, controls, environment or parameters.

forces returns finite scalar lift (vertical wing force),thrust (signed body-x
wing force),drag (body drag magnitude),power (shaft W),airspeed,aero_power_W
(-Qphi*omega),wing_dissipation_W (all aerodynamic drag losses),mass_kg,Qphi,Qpitch,
motor_torque_Nm (after transmission),control_torque_Nm,phase_damping_Nm,
pitch_damping_Nm; force[3] (total world force incl. gravity),wing_force_body_N[3].
Scalars never become vectors. accelerations returns phase_accel,pitch_accel and
force[3] using the same production force/coupling model. Other finite diagnostics
may be returned. step advances without input mutation; contactHeight returns CG
altitude for actual lowest tyre contact with the supplied terrain.

The helper's mass points keep all 30 kg of wings during overlap. Inner/outer
shape is a four-segment rounded outer ellipse with tip taper; chord normalises
the extended area, excluding the central hinge gap. Camber is a curved three-point
section, distinct from thickness metadata/structural section construction.
Finite-difference derivative step is fixed in engineering.json. Section pitching
moments, flow between overlapping leaves and unsteady wakes are omitted. Point
forces include the represented camber/twist/slide work through their actual
application-point velocities. These are declared reduced-model assumptions.

The host may release Approach's glide clutch after an explicit positive throttle
request. Expect gliding=false, phase=0, omega=0 with preserved CG translation,
fuel and pitch angular momentum. Never disable the engine solely because the
aircraft was initially created with Approach; use the current state.gliding.
