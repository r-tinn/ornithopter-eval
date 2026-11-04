# Source-first mechanical ornithopter

Read all nine attached notebook photographs afresh and implement their readable
principles in a convincing human-piloted mechanical aircraft. Our supplied
engineering model fills missing numbers; the source guide distinguishes these
assumptions from Stanley's work. Build the aircraft and working flight simulation
inside the supplied hills, trees and two-strip world. The world, renderer,
controls and geometric/mass helper are provided; no external assets or packages.

**240 seconds total generation time**, including reading images, reasoning,
API latency and file operations. Medium reasoning; no benchmark output-token or
request-count cap. Warnings at the next exchange after 120 and 180 seconds.
Only targeted file reads and native patches are available. No execution,
verification, tests, syntax checks, browser previews, HTTP or grader feedback.
Complete the four declared files before the cutoff: physics.mjs, kinematics.mjs,
aircraft.mjs, interpretation.json. Reading and thinking through edits is allowed.

## Source and visual design

Derive aspect_ratio and wrist_span_fraction from photo 02. Set area=14²/AR.
Use the revised favourable engineering.json mass budget: 55 kg seated adult pilot,
173.9 kg dry mass, 3.6 kg fuel, 177.5 kg initially wet. Make a recognisable pilot,
plausible frame, motor/transmission, tail/fin/rudder, three wheels and source-shaped
wings. Use the supplied visual-design brief. The owner will fly it and rate
aesthetic realism separately, 1–5. No automatic points for generic UI or scenery.

## Source-linked cycle — kinematics.mjs

Export wingPose(s). Let phi=s.gliding?0:s.phase, b=s.timing_bias (default
engineering.wing.timing_bias_low_speed), theta=phi-b*sin(phi). The low-speed
setting lengthens the working stroke; cruise b=0 is equal timing. Treat b as a
fixed linkage setting for each run; changing settings requires resetting.

For each side return Inner and Outer records with finite stroke, twist, sweep
(metres), exposure and camber (dimensionless):

- Inner stroke=dihedral-inner_amplitude*sin(theta); outer relative
  stroke=-outer_amplitude*sin(theta).
- Region twist=incidence-region_twist_amplitude*cos(theta), feathering against local stroke velocity.
- Inner sweep=-.5*sweep_amplitude_m*sin(theta); outer sweep=-sweep_amplitude_m*sin(theta). Multiply both by s.sweep_scale (default1); zero is a published causal intervention.
- Inner exposure=1; outer exposure=1-(1-recovery_exposure)*
  (.5-.5*tanh(4*cos(theta))/tanh(4)).
- Region camber=region_camber_base+region_camber_amplitude*cos(theta).

These phase curves are an explicit mechanical completion, not notebook samples.
The outer assembly consists of two rigid half-length sliding leaves. Recovery
overlap shortens exposed span; hidden leaf mass remains. Different camber
changes curved production geometry and section coefficients, independently of
twist. Geometry, mass points and time/phase derivatives come from the supplied
source-mechanism.mjs helper using YOUR wingPose. Physics and rendering must
consume that same function. Clock-driven or prescribed-speed flapping is forbidden.

## Local aerodynamics — physics.mjs

Export parameters, polar(region,alpha,camber), forces(s,c,e,poseOverride?),
accelerations(s,c,e), step(s,c,e,dt) and contactHeight(s,e). See AIRCRAFT_API.md.

For polar, linearly interpolate that region's cl_base/cd_base on sections.alpha_rad
(endpoint clamp). Add camber_lift_gain*(camber-camber_reference)*cos(alpha) to CL.
CD=interpolated cd_base+CL²/(pi*span_efficiency*AR). Inner/outer tables and all
values in engineering.json are explicit illustrative assumptions, not chart digitisation.

mechanics(parameters,s,wingPose) returns the actual distributed masses, total
mass, centroid cg, centroid derivative dc, samples, spring U and Up, and the
two-coordinate inertia A,B,C and phase derivatives Ap,Bp,Cp. For a test pose
override pass a constant pose function to mechanics. Samples include r (from
whole-aircraft CG), jphi, jtheta, velocity=jphi*omega+jtheta*pitch_rate,
area (exposed only), region, camber, chord, normal and span.

For each exposed strip, u=body-relative aircraft air velocity+sample.velocity.
Remove dot(u,span)*span, normalise to d. alpha=atan2(-dot(d,normal),dot(d,chord)).
F=.5*rho*|u|²*area*(CL*unit(cross(span,d))-CD*d). At zero speed F=0.
Sum F, Qphi=dot(F,jphi), Qpitch=dot(F,jtheta) and dissipation=D*|u|.

Apply airframe drag at r0=-cg, j0=-dc, using its local velocity and the summed
body flat-plate areas. Add a horizontal tail at r=[-tail_arm,0,0]-cg, jphi=-dc:
use its local x/y airflow, alpha=atan2(-uy,ux), CL=tail_lift_slope*clamp(alpha,-.35,.35),
CD=tail_drag_coefficient+.08*alpha². In tail CL use alpha+tail_incidence_rad. Resolve lift perpendicular to that flow
with cross([0,0,1],d), drag opposite it. Include tail forces, moments and work.
Add rudder side force from the stated controls coefficient, perpendicular to
horizontal air velocity. Transform all forces to world axes; add actual weight.
There is no direct thrust, bank lift compensation, altitude hold or free energy.

## Coupled dynamics and work

The helper constructs T=.5*A*omega²+B*omega*pitch_rate+.5*C*pitch_rate²
from actual moving mass geometry about the whole-aircraft CG, plus drive/body
inertia. U=k*(inner_stroke-dihedral)² accounts for both hinge springs. Solve:

```
R1=driveTorque+Qphi-Up-phaseDamping-.5*Ap*omega²+.5*Cp*pitch_rate²
R2=Qpitch+pilotTorque-pitchDamping-Bp*omega²-Cp*omega*pitch_rate
[A B; B C] * [phase_accel; pitch_accel] = [R1; R2]
```

PilotTorque=pitch_control_torque_Nm*c.pitch. Damping torques use coupled
phase/pitch coefficients times their corresponding rates and e.damping_scale
(default1). In isolated tests e.pitch_locked holds pitch and uses R1/A for phase;
e.motor_enabled=false disables engine; e.gravity=0 removes gravity; rho=0 removes air.
These are causal interventions on the same production functions, not special test answers.

Shaft torque is nonnegative, only with fuel, throttle>0, omega>=0, motor enabled
and gliding=false: clamp(gain*(target-omega),0,min(starting_torque,
16000*throttle/max(.5,abs(omega)))). target=2*pi*maximum_wingbeat_hz*throttle.
Shaft power=torque*omega. Drive torque=shaft torque*transmission efficiency.
Finite starting torque replaces division by zero; spring/inertia determine speed.
Fuel use=shaftWork*bsfc/3600000 + idle_kg_s*dt while commanded on; never negative.
On exhaustion, no motor work. Do not stop phase motion arbitrarily when power
is removed. Coast under the same spring/inertia/air/damping forces.

Integrate COM translation and both coupled coordinates with midpoint RK2 or
better, substeps <=integration_dt_max. Record cumulative shaft_work_J,
aero_work_J (total aerodynamic dissipation), drive_heat_J (transmission+damping),
control_work_J. No counter may substitute for actual physical energy in grading.
Glide preset directly initialises stroke=dihedral for Inner/0 for Outer, twist=incidence, sweep=0, exposure=1 and region base camber, at omega=0, gliding=true;
it is an isolated configuration, not a free in-flight pose transition. Do not
change this mode or timing setting during flight. Powering the glide preset is
disabled; Reset selects the working mechanism again.

Position is total-aircraft CG. The renderer subtracts rotated cg to place the
body, so wing mass movement produces a real body-relative reaction. Apply the
same correction to gear contact. Clamp to actual tyre contact on the terrain,
with finite rolling/braking loss, safe touchdown and crash status. Ground contact
may constrain pitch; isolated airborne tests never use that constraint.
Roll/rudder use the supplied finite control coefficients; neutral bank holds
bank. Roll/yaw inertial coupling is omitted; longitudinal energy probes use zero
roll/rudder. Forces still rotate in 3D, so banking changes vertical force.

For runway contact, a valid simple reduction holds body pitch=0 while all gear
is constrained. The whole CG then moves vertically with cg_y(phi). The helper
also exposes ddc (second phase derivative of cg). Use Ag=A+m*dc_y² and
Agp=Ap+2*m*dc_y*ddc_y. Ground phase acceleration is
(torque+Qphi-Up-phaseDamping-.5*Agp*omega²+force_y*dc_y)/Ag.
Normal load is m*(ddc_y*omega²+dc_y*phase_accel)-force_y. Retain the constraint
only with nonnegative normal load; otherwise use the airborne coupled solve.
Set CG height to actual gear contact and vertical velocity=dc_y*omega while
constrained. Judge touchdown with actual gear sink velocity, subtracting the
body-relative CG motion. Other constraint solvers with the same dependencies
are allowed. This is a reduced three-wheel runway model, not a suspension model.

The deliberate glide preset is in engineering.glide: its speed, pitch and flight
path are derived by zero pitching moment, aerodynamic D/L and weight balance of
the extended frozen model. Use these values for Approach. The glide grader also
perturbs initial speed by +/-10%. No in-flight mode switch or hidden trim autopilot.

The supplied comparison panel samples required m*(g-A*omega²*sin(omega*t)) and
your actual upward wing force for one reference cycle. It reports signed/RMS
residual and forward force. A mismatch is informative; never prescribe free
flight or change the forces to match the panel.

## Evaluation

Six binary task graders: wing-cycle forces/geometry, elastic/inertial energy,
wing/body pitch coupling, finite-power takeoff/bank, motor-off glide balance,
and the actual wheel rotation axis. Exact probes/tolerances are published in
GRADERS.md. File-only validity is separate. Human aesthetic realism is separate.
Save source interpretations and stated limitations in interpretation.json.
