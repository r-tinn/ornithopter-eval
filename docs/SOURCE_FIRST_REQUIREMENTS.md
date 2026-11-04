# Source-first requirements for the next ornithopter task

Status: implemented as [mechanical-v6](../candidate/mechanical-v6/TASK.md), with
nine original source photographs, a coupled reduced model and six calibrated
binary task graders. The normative numerical task/API/assumptions are in that
packet; the discussion below records the design principles and approach.
File-only validity and human aesthetic realism (1–5) remain separate.

## Visual design

Create a visually striking, convincing mechanical ornithopter that brings the
sketches to life. Preserve source wing proportions, outline, articulation and
functional relationships. Use coherent materials and plausible structural
members, joints and transmission, with the adult pilot at a believable scale.
Make the mechanism readable and its movement smooth and physically meaningful.
Aim for compelling views during flight and close inspection within the existing
geometry/performance limits and supplied lightweight world. Visual polish must
support the source principles and flight model. Do not trade source fidelity
for ornament. The owner will fly the result and give a separate 1–5 aesthetic
realism score using the published anchors. The same wording is supplied in new
generator packets as [DESIGN_BRIEF.md](../task/DESIGN_BRIEF.md).

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

For the next packet, include photo 02 for geometry and photos 09–15 for the
method, cycle mechanics, sections, controls and work accounting. Photo 13's
opening continuation is part of the wing-action argument even though its later
figure depicts a goshawk. Include photo 08 as section-data context if that chart
is used. Supply scoped readable guidance for uncertain passages. This source selection is now bundled in v6.

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

## One workable lightweight implementation

Use this as a favourable, clearly specified first engineering completion of the
notes. Simple ideal joints and a linked mechanism are acceptable. Motor work,
wing inertia and aerodynamic losses still have to be accounted for. The
following construction is our proposed implementation, not a recovered linkage
or a claim that Stanley supplied these missing numerical details. Equivalent
small models are acceptable if they retain the same physical dependencies.

### Separate inner and outer wing behaviour

Divide each side into an inner panel and an outer assembly. Start with four
aerodynamic strips per region, sixteen in total; a few additional strips for
closing surfaces are acceptable. Reuse the same lift/drag equations, but give
the inner and outer regions separate small coefficient tables. A table entry
describes how a section behaves at a given airflow angle, camber and stated
flow regime. Interpolate between entries instead of solving fluid flow.

Use a thin conventional section for the arm region and a thin curved/slotted
surface approximation for the hand region. Represent the source's 5–6% inner
thickness distinctly from camber. A few ribs and fabric panels are sufficient
geometry. For changing camber, move a middle rib/profile point between two
declared curvatures and interpolate the corresponding aerodynamic tables.
Turning the whole panel changes incidence; changing its curvature changes camber.
The same camber variable must affect both the visible shape and the force model.

Supply the numerical tables and their uncertainty in the eventual task packet.
Separate known source readings from added estimates, and state their Reynolds
range. The graph in photo 08 can inform this work; its ambiguous scales and
low-Re curves cannot silently become exact full-size aircraft data. Do not
require the outer region to produce more thrust at every possible angle merely
because the notes propose an advantage in a particular part of the stroke.

### A small, linked opening-and-closing cycle

Drive the mechanism with one crank phase. Use four smoothly connected stages;
the table describes a possible mechanical translation of photos 12–14, not
four measured timestamps:

| Stage | Main action | Outer assembly |
|---|---|---|
| Prepare near the top | Turn into the working stroke | Open and orient for the stroke; choose the working camber. |
| Working stroke | Move down and back | Remain extended, with the prescribed twist/camber. |
| Turn near the bottom | Slow and reverse | Begin folding/overlapping and allow the outer part to trail. |
| Recovery | Move up and forward | Use a shorter exposed span/area; reopen smoothly before the next working stroke. |

One simple construction uses two overlapping leaves in each outer assembly.
The leaves fold or overlap on recovery and spread on the working stroke. Count
only the exposed area in the low-order aerodynamic model, with an explicit
overlap rule. Keep the hidden leaf's mass and inertia. Alternatively use a
documented folding construction with the same intended span/area effect.
Do not just shrink a mesh and delete its mass, or reduce force area while
showing an unchanged open wing.

For a review example, the task could specify recovery exposure of 65% of the
extended outer area, and a low-speed working/recovery time split of 60/40,
approaching 50/50 at cruise. These are **proposed gap-filling values**, not
notebook readings, validated optima or current grading thresholds. Fix their
final values after reference feasibility checks and before a model cohort.

Use smooth periodic curves for stroke, fore/aft sweep, folding, twist and camber.
Make angles and rates continuous at the joins and cycle boundary. All motions
can be mechanically linked to crank phase, so this need not introduce five
separate actuators. Phase advances according to the loaded drive dynamics;
wall-clock animation cannot keep the wings moving after the drive stops.

### Calculate force from the motion that is actually drawn

For each exposed strip, find its position, orientation and velocity from that
same linked geometry. Include aircraft translation, body rotation, fore/aft
sweep, flapping and the local movement caused by folding/twist/camber. Subtract
the wind to obtain motion relative to the air. Use the region's coefficient
table to calculate lift and drag, resolve their directions and sum the forces
and moments. Moving the wings now changes propulsion through those calculations.

Forces on an overlapping assembly can be a declared exposed-surface
approximation; the next task need not solve flow between the leaves. Preserve
the distinction between this approximation and an experimentally established
effect. NASA's descriptions of [force directions](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/drag/)
and [coefficient dependence and flow similarity](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/lift-coefficient/)
support the general calculation, not the proposed ornithopter's performance.

### Give the linked wings inertia and a spring

Distribute the existing wing-mass allowance across the actual moving pieces.
A few mass points per panel, or uniform rigid panels with known centres and
inertias, are sufficient. Include the transmission's inertia separately. The
whole wing mass cannot stay attached to a stationary body point while the
rendered wings move.

Add a torsion spring at the main flapping joint: it applies torque
`-k*(angle-neutral_angle)` and stores `0.5*k*(angle-neutral_angle)^2` joules.
A small declared damping term supplies loss. Choose an initial stiffness from
the effective wing inertia and a target cruise oscillation frequency; for the
isolated linear test, `k=I_effective*(2*pi*f_target)^2`. Treat this as a starting
engineering assumption. The loaded coupled mechanism need not resonate at
exactly that isolated frequency.

A linked mechanism can still use the same crank phase to control its sequence.
Compute how its effective inertia and stored spring energy vary through the
cycle, and let motor torque, aerodynamic load and spring torque determine its
speed. This retains a simple linkage while representing the cost of reversing
the wings. Prescribing the phase speed independently of load would bypass it.

For an isolated one-coordinate example with pitch held fixed, the energy-derived
equation is:

`I(phi)*phi_ddot + 0.5*I_prime(phi)*phi_dot^2 + U_prime(phi)`
`    = motor_torque + aero_generalised_torque - damping_torque`

Here `I` includes moving panels and drive inertia; `U` includes represented
elastic/potential stores. The derivative term matters when folding and stroke
change the effective inertia. This equation is an implementation illustration,
not a notebook transcription. In flight, couple it to body motion as below.
Use a finite starting-torque limit as well as the shaft-power cap; do not divide
power by zero drive speed. Supply that missing torque limit as a task parameter.

### Let wing motion affect the body

Track the whole aircraft's centre of mass. Calculate each component's position
from the current mechanism pose and derive where the fuselage sits relative to
that centre. This allows the body to respond as the wings move without creating
an extra external force from internal movement.

Apply aerodynamic forces at declared locations. Their offsets from the current
centre of mass produce pitching moments; include the tail's contribution.
Include the wing/body reaction through the same inertia calculation. Updating
the centre of mass and adding `r cross F` alone does not account for all moving
wing inertia.

A compact approach is a coupled crank-phase/body-pitch model: express the
kinetic energy of the moving masses and derive a small two-coordinate system.
It solves two coupled accelerations, rather than simulating hundreds of
flexible elements. This is a reduced longitudinal model; any omitted roll/yaw
coupling must be stated. A small multibody helper can be supplied in the
eventual scaffold so the evaluated agent connects source geometry, forces and
parameters without having to write a general-purpose solver. The helper is
planned support, not a module already present in v5.

Energy-based coupled-coordinate dynamics are a standard construction; see
[MIT's multibody dynamics notes](https://underactuated.csail.mit.edu/multibody.html).
That reference supports the method, not the adequacy of this particular reduction.

### Keep an explicit account of the work

Record motor work, aerodynamic work, damping/friction heat and the changing
kinetic, gravitational and spring energy of the represented system. Account
for work needed to fold, twist or change camber, including any section moments
used by the reduced aerodynamic model. Mechanical linkage does not make those
loads disappear. Avoid counting the same aerodynamic or inertial work twice.

Use a favourable ideal spring for an isolated check: with motor, aerodynamic
loads and damping disabled, energy should exchange between motion and the
spring without growing. A second check adds damping and verifies energy loss.
Keep the installed aircraft's stated transmission and aerodynamic losses in
its flight calculation. Positive average drag work still needs energy.

### Add a one-wingbeat comparison panel

Choose a target cruising speed, body-height amplitude and frequency as explicit
analysis inputs. Sample a cycle and plot the required upward force
`m*(g-A*omega^2*sin(omega*t))` alongside the force calculated from the proposed
wing action at those analysis states. Report the signed residual, mean and RMS
error, average forward force and required work. If the cycle speed varies,
weight averages by elapsed time, rather than averaging phase samples equally.

This panel explains whether the candidate mechanism meets the chosen target.
A mismatch is an informative result. It must not cause hidden changes to the
forces, engine power or free-flight trajectory. The binary check initially
verifies the calculation and honest reporting; a physically justified flight
acceptance threshold must be set before calibration, not fitted to model results.

### Make a deliberate glide configuration

Provide a defined extended-wing, neutral-sweep glide pose. Use the linkage to
reach it and include the work and loss of the transition, or initialise directly
in that pose for an isolated glide test. Stopping the engine at an arbitrary
crank angle is a separate shutdown state, not automatically the best glide.

Use the actual force model to scan a short speed/trim range, identify best L/D
and distinguish it from minimum sink. Then compare a freely integrated,
approximately steady descent with its calculated lift, drag and energy loss.
No added thrust may hold the glide up. Do not require an invented universal
glide-ratio window.

For the outline, approximate photo 02's outer ellipse with a small fixed number
of segments and use that same planform in the force strips. State whether the
central region is counted in the reference area. Preserve the source ratios in
the extended reference pose and let the exposed/projected shape vary during
recovery. Conventional tail/rudder and the existing wheel/contact checks can
complete the machine without adding biological anatomy or complex scenery.

### What must be fixed before this becomes a runnable task

Publish one small parameter set covering the two section models, mass/inertia
distribution, spring/damping, torque limit, phase curves, exposed-area rule and
glide transition. Label every new value and its basis. Verify that the combined
reference respects the mass and power scenario, then freeze it for the cohort.
The frozen completion and actual calibration are now in candidate/mechanical-v6 and validation/source-first-v6. Earlier suggestions here are explanatory; the runnable packet fixes exact parameters and tolerances.

## Additional scenario details

Retain a visible adult pilot and a petrol-powered machine. Photos 09, 10 and 15
explicitly envisage a powered, human-carrying ornithopter. The 55 kg pilot, 14 m
span, 6 m body, component budget totalling 177.5 kg wet, finite fuel and 16 kW
shaft cap are provisional scenario inputs, not recovered notebook values.
They can fill missing numbers, checked for internal feasibility in the labelled author reference, not experimentally validated.
Mass and span alone do not establish feasibility or determine spring/inertia
parameters. If this aircraft cannot take off within the engine limit under the
source-consistent model, report that result and revisit the added assumptions;
do not change the notes' principles or invent lift to obtain a passing fixture.

Keep the supplied lightweight world, cameras, two strips and few trees. Use
medium reasoning, a **240-second generation deadline with no benchmark token cap**, and
one-shot generation with targeted file reads/edits only. No execution, syntax
checks, builds, tests, browser access or grader feedback during generation.
Reading edited files and mental review remain allowed. Blocked out-of-policy
tool requests fail the seventh grader. Deliver time notices only at 50% and
75% (120 and 180 s), at the next exchange if one occurs. No benchmark request
cap or extra exchange solely for a notice. The deadline includes API/tool time;
retain completed files at cutoff. These are evaluation conditions, not aircraft
physics. Bundle all source/scaffold files needed by the eventual task here.

## Grader consequences

Use exactly the eight rows in [SOURCE_FIRST_GRADERS.md](SOURCE_FIRST_GRADERS.md).
Score the six task targets and report the file-only validity result separately.
Record the owner's aesthetic realism rating separately as 1–5, initially ungraded.
Remove the easy standalone points; retain useful pilot, geometry, source-number
and UI observations as non-scoring diagnostics and required deliverables.
The wheel-axis check remains a scored regression. Keep the force-comparison
panel inspectable without awarding a separate easy point for printing a formula.
Use controlled interventions, independent expectations and retained raw evidence.
Do not assume every intervention improves thrust or every powered turn descends.
Calibrate each new check against a correct fixture and a deliberate defect.
Passing the old 28 checks cannot establish compliance with this revised brief.

Appendix 12, several cited datasets/films and parts of the marginal revisions
are absent. Implement the readable principles with explicit engineering
completions; do not claim the missing algorithm has been recovered.
