# Seven binary task checks, file-only validity, human aesthetics

V7 adds a neutral-input pitch-stability regression; published v6 remains six checks. No score weights or extra easy points.
Every task check yields one boolean plus raw cases, trajectories and errors.
Unavailable infrastructure is reported separately; unreached required behavior
in a successfully loaded submission fails its check.

1. **wing_cycle_force_coupling.** Bias=0/.3, phase=0,.7,1.8,3.2,4.9,
   omega=0/4, air velocity=[18,-.4,.3], pitch=.07, pitch_rate=.08.
   Independently reconstruct the source-linked pose, exposed leaves, both
   section tables, strip forces, generalized loads and losses. Compare force/load
   scalars/vectors within 1e-4 SI + 0.01%; pose within 1e-7. Inspect actual
   transformed production-leaf vertices at phases0,1,pi,5 within0.2mm of the
   expected curved/sliding geometry. The supplied helper earns no separate point.
2. **elastic_inertial_exchange.** Release phase=.25,omega=0 from rest in vacuum,
   gravity=0,motor off,pitch locked. Integrate2.5s at1/240s with damping_scale=0
   then1. Reconstruct mass-point inertia and spring energy from geometry; use
   actual phase/rate, never candidate energy counters. Require motion >.2rad/s,
   residual<0.5% initial elastic energy+0.1J, and >1J known damping loss in the
   damped case. A frozen mechanism cannot pass by retaining constant energy.
3. **wing_body_pitch_coupling.** Phase=.7/1.8,omega=3,pitch_rate=.15,
   fore/aft sweep_scale=1/0; vacuum,zero gravity,motor/damping off,neutral pilot.
   Independently construct the coupled mass matrix and initial accelerations,
   then integrate40ms. Initial accelerations within1e-4+0.01%; final pitch
   within0.5mrad, pitch/phase rates within.005rad/s, phase within.001rad.
   Catch a plausible acceleration API disconnected from production stepping.
4. **power_limited_flight.** Sample fuel=0/3.6kg, throttle=0/.3/1,
   omega=0,.1,3,5,6,8; compare actual torque/power with the capped model.
   At phases.4,1.7,3.8, reconstruct the airborne mechanical energy derivative
   through production stepping: tolerance10W+0.3%, with mass held fixed only in
   this derivative measurement to remove advected fuel mass. Then run70s on
   Valley strip from rest, low-speed bias.3, full throttle. Pitch command is
   clamp(4*(.12-pitch)-pitch_rate,-1,1). From62s bank command is
   clamp(2*(.45-roll)-roll_rate,-1,1). Require2s continuous clearance>.3m
   before runway end, airborne and >1m clear with bank>.25rad at70s; no crash.
   Every shaft sample<=16kW+.001W; independently reconstructed trajectory forces
   within.1N; actual fuel matches integrated work/idle within0.1g+1%.
   Save the complete sampled trajectory and all cap/energy cases. This does not
   require every powered turn to descend.
5. **unpowered_glide_balance.** Initialise the extended glide trim given in
   engineering.glide, at100m altitude; repeat with90%,100%,110% speed. Motor0,
   neutral controls,10s integration at1/120s. Reconstruct complete mechanical
   energy, aerodynamic losses and body-pitch damping. Require positive descent
   (>0.1m), forward travel, no motor/fuel use, and residual<1J+0.5% integrated
   losses; acceleration must match independently reconstructed force/mass within
   .02m/s². No generic L/D interval. The declared model's steady trim is about
   7.29m travelled per metre lost; it is not an empirical aircraft measurement.
6. **wheel_rotation_axis.** Actual tyre planes stay within1degree of aircraft
   lateral z through nine rolling angles, grounded and airborne, steering
   neutral. Supply travel distance and explicit wheel_angle. No wheel-speed or
   spin-decay claim. This directly targets the observed wrong-axis wheel bug.

7. **powered_pitch_stability.** Start already airborne at500m, velocity[16,0,0],
   pitch.1, phase0, omega6, full fuel, timing bias.3. Integrate80s at1/120s,
   throttle1 and neutral pitch/bank/rudder/brake throughout. No pitch controller.
   Record20Hz; discard the first20s and average pitch in2s windows. Fail after
   four alternating reversals each at least15degrees in this slow signal. This
   targets persistent multi-second pitch hunting, not small wingbeat motion or
   one settling transient. Flight must remain finite, airborne and powered,
   with forward travel and real wing motion; missing flight is a failure.
   This is a stated product acceptance target, not a universal flight-safety rule.

**File-only validity** audits all recorded attempted tools. Only targeted
ls/cat/head reads and declared patches. A blocked execution request still fails.
No private reasoning inspection. Missing/inconsistent traces are unavailable.

**Human aesthetic realism,1–5** is entered only by the owner after playing the
simulator. Separate from x/6 and protocol pass/fail; initially ungraded. The
supplied DESIGN_BRIEF.md gives the anchors. Rating revisions are retained.

Independent equations verify the frozen educational reduction, not empirical
ornithopter performance, structural safety, CFD or every possible implementation
defect. Positive fixtures and targeted broken variants must be retained and
calibrated before the cohort. Do not tune the rubric to the resulting model ranking.
