# Does the revised task only add to Stanley's notes?

**No: the executable v5 prototype is not yet source-faithful enough.** The human
pilot, larger aircraft and petrol power are consistent with his intended
application. Several earlier benchmark choices instead omit or replace the
principles that should define the task. Labelling those choices as new
assumptions does not make them acceptable gap-filling.

This is an audit result and a corrected brief, not a completed physics rewrite.
The prototype at port 8768, its source packet, 28-check rubric, reference fixture
and all prior model cohorts have not been changed by the audit.

## Evidence and scope

All fifteen original photographs were directly visually inspected on 4 November
2026 and checked against the existing `task/source-manifest.json` SHA-256 values.
Unaltered copies are bundled in [sources](sources/), with [inventory](inventory.json).
The family archive's earlier readings were consulted after reading the images;
they were treated as interpretations, not as substitutes for the photographs.
No expert authentication, new wind-tunnel evidence or missing appendix is claimed.

| Photo | Readable evidence relevant to this audit | Treatment |
|---|---|---|
| [01](sources/Unknown.jpg) | Annotated swan outline; several pencil dimensions/units obscured | Do not invent exact dimensions from uncertain marks. |
| [02](sources/Unknown-2.jpg) | Scaled dimensions; rounded span/wrist/chord; approximately elliptical outer-area estimate | Preserve the coherent rounded case and explain its assumptions. |
| [03](sources/Unknown-3.jpg) | BE50 section discussion, Reynolds numbers, nominal sweep and speed calculations | Different nominal case; useful method, not interchangeable coefficients. |
| [04](sources/Unknown-4.jpg) | Explicit Standard Model Swan assumptions, nominal AR, wing loading and glide calculation | Do not combine its 9.2 AR with photo 02's other geometry. |
| [05](sources/Unknown-5.jpg) | Reproduced continuous wake | Qualitative evidence; a wake renderer/CFD solver is not required to implement the reduced force method. |
| [06](sources/Unknown-6.jpg) | Species planform comparison and AR discussion | Proportions affect behaviour; not all species are numerical specifications for this machine. |
| [07](sources/Unknown-7.jpg) | Revised cycle-force graph, multiple constructions/conditions | Preserve provenance; no exact digitisation or curve-matching oracle is justified yet. |
| [08](sources/Unknown-8.jpg) | Göttingen 417a curved-plate lift/drag/moment chart at two labelled Reynolds numbers | Relevant section context, but separate scales and uncertain readings need care. |
| [09](sources/Unknown-9.jpg) | Define target sine trajectory, speed and frequency; evaluate wing actions with steady aerodynamics; intended manned ornithopter | Central design method and explicit support for the piloted application. |
| [10](sources/Unknown-10.jpg) | Powered man-carrying application; cyclic lift/thrust and flight-regime discussion | Retain cycle-resolved loading; no imposed straight/level flight. |
| [11](sources/Unknown-11.jpg) | Stroke timing, resonance, target-force comparison, continuous lift at cruise; extensive revisions | Keep readable principles, distinguish them from uncertain revised formulas. |
| [12](sources/Unknown-12.jpg) | Wing/body mass–spring coupling, inertia, pitching moment, best-L/D glide and detailed arm/hand sequence | Central mechanics; missing constants need completion, not exclusion. |
| [13](sources/Unknown-13.jpg) | Continuation: reduced recovery area/span, incidence and handwritten camber; separate goshawk cross-section example | Preserve the continuation. Do not assign the goshawk percentages to a swan. |
| [14](sources/Unknown-14.jpg) | Thin arm/curved slotted hand region, local force resolution, recovery closure, tail/rudder, takeoff observations | Central mechanics plus compatible conventional aircraft controls. |
| [15](sources/Unknown-15.jpg) | Glide drag power, additional work/stores, man-carrying application; missing Appendix 12 | Preserve power-accounting principles; do not invent the appendix or ambiguous 25% efficiency meaning. |

## The added scenario values

| Added detail | Compatibility finding |
|---|---|
| Visible adult pilot, 55 kg | Consistent: photos 09, 10 and 15 explicitly envisage a man-carrying powered machine. The mass and appearance details are ours. |
| 14 m span, 6 m airframe | No conflicting full-scale dimension in the readable notes. Scale source proportions; do not also impose the swan's absolute body dimensions. |
| 224.9 kg dry including pilot, 228.5 kg initially wet | Arithmetic is consistent. These are assumed allocations, not source measurements. Wing mass must feed inertia/CG dynamics as well as weight. |
| Petrol engine, finite fuel, 16 kW shaft cap | Compatible with a powered machine; the notes do not prescribe its fuel or engine. Mechanical losses and energy stores must complete the notes' accounting. |
| Propulsion derived from actual wing motion | Directly aligned with the local-velocity/force argument. Current implementation covers only part of the described motion. |
| Conventional tail, fin and rudder | Photo 14 expressly recommends these for an elementary ornithopter. |
| Wheels, hills, trees and two landing strips | Compatible mechanical/world additions. Biological water takeoff is an observation to interpret, not a requirement to give the craft webbed feet. |
| Banking, contact and performance checks | Compatible physical/software checks, provided they do not impose compensation or arbitrary performance targets in place of source calculations. |
| Shutdown brake, exact phase law, equal stroke timing and fixed 1.2 Hz limit | Newly chosen mechanisms, not recovered source details. They need to be reconciled with recovery/glide geometry, elastic energy, stroke timing and required work. Current choices have not established that. |

No source conflict found for the pilot/scale/petrol **scenario inputs** is not a
proof that those inputs produce a feasible aircraft. Test feasibility after
restoring the source mechanics. If required work exceeds the cap, report it and
revise the added assumptions instead of weakening the source model.

## Material omissions and replacements

1. **The source packet is too narrow.** Only photos 02 and 14 reach the model.
   Photo 09 was treated as context, photo 12 as unusable without constants, and
   photo 13 as irrelevant because its lower figure is a goshawk. This loses the
   central method, spring/body coupling, and the continuation of the swan wing
   action at the top of photo 13. A usable next packet must include those
   principles and clearly scoped readings of uncertain passages.
2. **An unrelated global aerodynamic surrogate is mandatory.** V5 uses one
   NACA 4412-derived profile table for every inner/outer strip. Photo 14 makes
   the spanwise section distinction central to the local force argument. This
   is not remedied by rendering a thin membrane or by acknowledging NACA data
   uncertainty. Missing coefficients must be filled with a compatible section
   model, preserving the distinction and the source's camber discussion.
3. **The recovery and working strokes are incomplete.** In `wingSamples`, all
   sampled points and velocities have zero fore-and-aft component. Panel area
   is fixed; only stroke and twist change. Projected span does vary with hinge
   angle, but there is no closing/trailing and opening sequence implementing
   photos 12–14. Twist is not camber; a vertical hinge is not fore/aft sweep.
4. **Elastic/inertial coupling is omitted.** `0.5*J*omega²` is energy in an
   equivalent rotating buffer. It does not represent articulated wing kinetic
   energy varying with phase, a wing/body spring, resonance, common-CG coupling
   or the source's inertial-power question. The ledger can balance while those
   processes are absent. A reduced elastic model is compatible with low cost;
   full flexible-wing CFD/FEA is not required by the notes' method.
5. **Pitch is disconnected from the source mechanism.** Photo 12 discusses
   changing CG/lift separation and pitching moment. V5 sets pitch acceleration
   from control input and damping alone. It does not evaluate whether wing
   movement produces the described body response.
6. **The comparison method is absent.** Photos 09 and 11 compare calculated
   forces from candidate wing action with a target motion's required forces.
   V5 has only free flight and software probes. The analysis method should be
   restored without scripting the free-flight trajectory.
7. **Geometry is only partially preserved.** V5 mandates a straight outer taper
   with a nonzero 35% tip chord. Photo 02's 6.61 ft² area was based on an
   approximately elliptical outer part. AR and wrist ratio alone do not show
   that the original chord distribution or outline was implemented.
8. **Some graders prescribe the replacement model.** The global post-stall
   predicate and fixed 6–14 glide envelope test our chosen surrogate. They do
   not verify the corresponding source calculations. An efficient faithful
   candidate should not fail merely for exceeding our arbitrary glide cap.

Code evidence: [task](../../candidate/mechanical-v5/TASK.md),
[source guide](../../candidate/mechanical-v5/SOURCE_GUIDE.md),
[engineering inputs](../../candidate/mechanical-v5/engineering.json),
[mechanism](../../candidate/mechanical-v5/scaffold/environment/mechanism.mjs),
[fixture kinematics](../../fixtures/mechanical-v5/kinematics.mjs),
[fixture forces/step](../../fixtures/mechanical-v5/physics.mjs),
[grader specification](../../candidate/mechanical-v5/GRADERS.md).
Their hashes are recorded in [arithmetic.json](arithmetic.json).

## Recomputed checks and boundaries

- Rounded source case: AR=7.4²/6.61=8.28441755, wrist fraction=0.5. Its printed
  8.29 is within the existing 0.5% tolerance. At 14 m, effective S=23.65887509 m².
- Current component budget sums to 224.9 kg dry; 5 L × 0.72 kg/L adds 3.6 kg.
  Wet mass=228.5 kg; initial wing loading≈9.66 kg/m². These do not determine
  stiffness, structural strength, mass distribution or installed aero efficiency.
- Current straight-taper root chord=2.107695 m. Scaling photo 02's rounded 12 in
  chord with its 7.4 ft span would instead give 1.891892 m; our current chord is
  about 11.4% larger than that source-scaled value. This is evidence
  that preserved AR is not a complete reconstruction, not a second hidden
  grading target. The source area/reference-body convention also needs stating.
- Current inner stroke is −8.02° to +17.19°, outer relative stroke ±14.90°.
  Photo 14's swan takeoff observation is arm −15° to +45°, hand ±45°. The hand
  reference axis is not resolved. Do not silently equate these motions or
  impose biological stroke numbers on a different-scale linkage without analysis.
- Photo 14's approximate +10% frequency / +20% stiffness suggestion is internally
  consistent with an ideal oscillator: sqrt(1.2)≈1.0954. It supplies a useful
  check on a completed spring model, but not an absolute spring constant.
- For a sine target, `F_up=m*(g-A*omega²*sin(omega*t))` follows Newton's law.
  It can be checked independently of any chosen wing mechanism. Negative-force
  avoidance is a conditional scenario assumption, not a universal prohibition.

Reproduce hashes and arithmetic without the old repository or an API key:

```sh
python3 analysis/source_compatibility.py --output runs/source-arithmetic-new.json
```

The [corrected requirements](../../docs/SOURCE_FIRST_REQUIREMENTS.md) make the
notes authoritative and identify the work needed before another model cohort.
This audit does not turn uncertain marginal text, the missing Appendix 12, or
unmeasured aerodynamic coefficients into known facts. No all-principles
compliance verdict is justified until the task, implementation and graders
are revised together.
