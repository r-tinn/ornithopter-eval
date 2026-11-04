# Source-first requirements for the next ornithopter task

Status: corrected design brief following the 4 November 2026 source audit.
This is not an implemented simulator or a newly calibrated task version.
The executable v5 prototype does not yet meet this brief.

## Authority

Stanley's notes supply the physical ideas and design method. Additional pilot,
airframe, engine and environmental assumptions supply missing engineering data.
They must not replace a source principle merely because a different model is
easier to implement or grade. The aircraft is a mechanical application of the
ideas, rather than a literal swan.

For every requirement, record the source photograph and passage, its confidence,
its mechanical translation, the missing quantities supplied by the task, and the
binary observation that would verify it. An unreadable number is an unresolved
number, not a reason to discard the surrounding readable principle. Preserve
revisions and uncertainties; do not attribute our derivations to Stanley.

## Principles the task must retain

1. **Evaluate wing motion against a force requirement.** Photos 09 and 11 use a
   smooth target trajectory, speed and frequency to determine required force
   histories, then compare candidate wing actions against them. Supply a small
   analysis mode alongside free flight. In SI, for a chosen reference motion
   `y=y0+A*sin(omega*t)`, the required total upward nongravitational force is
   `m*(g-A*omega²*sin(omega*t))`. This equation is our explicit derivation of the
   readable method, not a transcription of the revised marginal formula. The
   condition `A*omega²<=g` applies only if that scenario requires nonnegative
   upward force. Free flight must still integrate forces; never prescribe the
   aircraft's trajectory to manufacture agreement.
2. **Resolve local forces from local wing motion.** Photos 12–14 describe the
   hand wing's motion changing the direction of its aerodynamic forces. Resolve
   local lift and drag into forward and vertical components, using actual mesh
   motion and air-relative velocity. Include fore-and-aft motion as well as
   stroke and incidence. No separate throttle-to-thrust shortcut.
3. **Distinguish arm and hand action across the cycle.** Photos 12–14 describe
   trailing/closing on recovery and opening/reorienting for the working stroke,
   with reduced area and span on recovery. Supply an explicit mechanical
   analogue: folding, overlapping or another documented effective-area mechanism,
   with the same motion represented in geometry and forces. A fixed-area paddle
   with a second up/down hinge does not implement all these actions. Mechanical
   feathers or a biological appearance are not requirements.
   Photo 11 also distinguishes low-speed stroke timing from cruise timing;
   provide that degree of freedom instead of imposing equal-duration strokes
   at every speed. The notes do not supply an exact duty-cycle schedule.
4. **Retain the spanwise aerodynamic distinction.** Photo 14 describes roughly
   5–6% arm-section thickness and a very thin, curved/slotted outer region.
   Photo 13 also distinguishes incidence, camber and thickness. Fill missing
   section data with documented, compatible approximations and uncertainty;
   do not substitute one conventional-airfoil polar for every region. The
   goshawk's exact camber percentages are examples, not swan specifications.
   The clear handwritten addition in photo 13 includes changing camber as well
   as incidence. Represent that mechanical degree of freedom and its force
   effect, with a declared approximation, rather than relabelling twist as camber.
   Photo 08's multi-axis chart needs an explicit, uncertainty-aware reading;
   its presence does not justify inventing exact coefficient samples or applying
   low-Re curves unchanged to the full-size machine.
5. **Represent elastic/inertial coupling.** Photos 11–12 describe a wing/body
   mass–spring system, resonance and the cost of operating away from it. Supply
   missing mass distributions, inertias, stiffness, damping and linkage details
   as declared assumptions. Derive their effects on motion and work. A constant
   crank-speed energy buffer alone is not that model. Energy recovery is not a
   free source of propulsion; do not grade an unqualified claim that resonance
   always improves flight.
6. **Account for forces, moments and the moving mass.** Photo 12 relates
   fore-and-aft wing motion to changing CG/lift separation and pitching moment.
   Represent the corresponding coupling at an appropriate reduced order. Do not
   force the body to align with the flow, or let a control-only pitch equation
   stand in for the source mechanism. Explain the mechanical control/tail
   assumptions used to complete the model.
7. **Preserve cyclic loading and consistent power accounting.** Photos 10–12
   discuss within-cycle lift/thrust variation; photo 15 starts with `D*V` glide
   power and distinguishes additional aerodynamic, body-motion and wing-inertia
   terms. Account for reversible kinetic, gravitational and elastic stores,
   losses and motor work without double-counting. Keep biological metabolic
   efficiency separate from petrol-to-shaft conversion. The unexplained 25%
   and uncertain handwritten expression are not exact grading targets.
8. **Derive glide and cruise behaviour from the resulting aircraft.** Photos
   11–12 discuss gliding near best L/D and transitions between gliding and
   flapping. Determine the mechanical aircraft's L/D and sink from its actual
   geometry/forces/mass. Neither the notes' approximate bird L/D of 15–20 nor
   our invented 6–14 acceptance window is a universal aircraft constraint.
   Evaluate a deliberate glide configuration, distinguish best range from
   minimum sink, and account for any work needed to deploy/lock the wings.
9. **Preserve coherent geometric evidence.** Photo 02 supplies the selected
   planform case, including an approximately elliptical outer-wing area
   assumption. Use a curved or converged piecewise approximation rather than
   imposing an unrelated straight taper. Keep the source AR and wrist ratios
   in their stated spread-wing reference pose; projected span can change
   through the cycle. Do not mix this case with photo 04's different nominal
   Standard Model Swan. Explain reference-area and central-body treatment.
10. **Use conventional controls where the notes recommend them.** Photo 14
    explicitly proposes a conventional tail or weight shift, and a fin/rudder
    for a mechanical ornithopter. An engineered tail, rudder, wheels and dry-land
    runway operations are compatible applications. They do not require swan
    anatomy or a water-running simulation.

## Additional scenario details

Retain a visible adult pilot and a petrol-powered machine. Photos 09, 10 and 15
explicitly envisage a powered, human-carrying ornithopter. The 55 kg pilot, 14 m
span, 6 m body, component budget totalling 228.5 kg wet, finite fuel and 16 kW
shaft cap are provisional scenario inputs, not recovered notebook values.
They can fill missing numbers, subject to a source-consistent feasibility check.
Mass and span alone do not establish feasibility or determine spring/inertia
parameters. If this aircraft cannot take off within the engine limit under the
source-consistent model, report that result and revisit the added assumptions;
do not change the notes' principles or invent lift to obtain a passing fixture.

Keep the supplied lightweight world, cameras, two strips and few trees. Keep
medium reasoning, 32,000 total output tokens including reasoning and one-shot
generation without execution. These are evaluation conditions, not aircraft
physics. Bundle all source/scaffold files needed by the eventual task here.

## Grader consequences

Keep narrowly targeted binary checks, but make their predicates test the source
principles above. Examples include a known trajectory's required force, actual
outer-area reduction on recovery, sensitivity to fore-and-aft motion, separate
section behaviour, elastic energy return with zero damping, energy loss with
damping, mass-dependent inertia, and force-derived glide accounting. Use common
states and controlled interventions. Do not assume every intervention improves
thrust or every powered turn descends.

Retain useful existing pilot, mass, fuel, wheel-axis, contact, geometry/motion
coupling and banking checks. Reconsider the prescribed global NACA response,
fixed sinusoidal mechanism and arbitrary glide envelope before calibration.
Calibrate each new check against a correct fixture and a deliberate defect.
Passing the old 28 checks cannot establish compliance with this revised brief.

Appendix 12, several cited datasets/films and parts of the marginal revisions
are absent. Implement the readable principles with explicit engineering
completions; do not claim the missing algorithm has been recovered.
