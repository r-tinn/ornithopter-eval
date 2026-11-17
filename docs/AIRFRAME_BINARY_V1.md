# airframe-binary-v1 — deterministic construction and motion

New explicit scoring revision: seven unchanged v7 physics/wheel checks plus four
binary geometry/motion checks, equal weight, out of eleven. A failed file-only
validity audit zeros the complete attempt and stays in the mean. Human aesthetic
ratings and LLM judgments contribute no points. Historical ratings, /8 views,
source packets, model submissions and published /7 scores remain intact.

Use `configs/source-first-airframe-v1.json` for future generations. This explicitly
adds the construction requirements to the model's initial task; it does not
reinterpret configs/source-first-v7.json or regenerate archived packets. Medium
reasoning, 480 seconds, 50%/75% notices, and no token/request-count cap remain.
The base flight controller is v7-launch-60-65-70-bank-v2. Constants, source-linked
wing mechanics, mass, crash limits and the environment are unchanged.

## Four predicates and exact limits

1. **pilot_clearance:** instantiate the actual submitted pilot and aircraft;
   sample 24 phases of the low-speed wing cycle. Split pilot meshes into connected
   geometric components. Test non-pilot mesh vertices and edges sampled at most
   25 mm apart for being inside pilot components, at least 8 mm from their surface.
   Save component indices, phases and 3D witness points, flagging the upper pilot
   region. Visible pilot-descendant clothing/helmet meshes are part of the pilot,
   not obstacles. Normal surface contact is below the penetration margin.
   This is a deterministic *sampled mesh-penetration* check, not continuous
   collision certification. It can miss thin crossings between samples, depends
   on the submitted pilot representation, and cannot infer material/cloth softness
   or reliably interpret arbitrary non-manifold/open volumes. It does not use
   model names, object names, colours or text descriptions to decide clearance.
2. **wing_drive_linkage:** recover slender connected mesh components from actual
   vertices, separating hard-normal cylinder caps even inside batched meshes.
   Track members in the engine/root region through the same 24 phases. Require
   at least two members with endpoint travel >25 mm, apparent length ratio <2.5
   (allowing telescoping links), joined within 120 mm throughout all sampled phases,
   collectively reaching below the wing root and out towards its hinges. A drive
   member's length must exceed 120 mm, radius <=130 mm, and length/radius >=3;
   the stricter truss-member ratio is >=5. Region: endpoints x in (-1.5,0.7)m,
   |z|<1.15m and y>-0.05m. The lower endpoint must reach below root height-0.12m;
   an upper endpoint must exceed root height-0.15m and |z|>0.6*hinge offset.
   This tests a visible joined moving linkage. It does **not** establish engine
   torque transfer, fixed pin locations, crank mechanical advantage or valid joint
   stresses. Some valid alternative mechanisms can fall outside this narrow
   construction contract; a future revision must calibrate them before claiming
   general mechanical validity. Static/disconnected decorative hardware fails.
3. **wingtip_motion_continuity:** track actual transformed outer-leaf vertices
   through 240 phases, including the cyclic seam, at nominal omega=6 rad/s for
   both prescribed timing biases. Central differences must give finite peak
   speed and acceleration no greater than 1.5 times those of the prescribed
   identity-transform material-coordinate helper. This rejects extra transforms
   and sampled snapping; it allows the prescribed rapid recovery and sliding
   overlap. It does not score every decorative spar/rib, actual engine RPM,
   real-world aeroelasticity, or prove smoothness between samples. The existing
   wing-cycle grader independently enforces the intended phase curves.
4. **rear_truss_structure:** extract actual slender members (length>120 mm,
   radius<=130 mm, length/radius>=5) whose endpoints lie in the aft region
   -3.7<x<-0.35m. Connect endpoints within 100 mm. Require a connected graph
   containing at least three triangular cycles, each area>0.025m², spanning
   >=1.2m longitudinally and >=0.2m in both height and width. Transverse links
   connect triangulated side frames into a 3D assembly. A single boom, planar
   truss, unbraced rectangular ladder or tiny decorative triangles fails.
   This tests geometric triangulation, not material realism, strength, fatigue,
   mass-budget fidelity or actual load-path stiffness. No mesh-name matching.

**Not scored:** forward-fuselage beauty, convincing materials or visual polish.
A simple deterministic test would be a weak proxy for that request. Keep this
idea in the backlog rather than calling it an objective realism measurement.

## Calibration and interpretation

`validation/airframe-binary-v1.json` pins the adopted browser kernel and policy.
A changed kernel blocks adoption until recalibrated. Author fixtures are explicitly
not model results. Independent positive constructions and targeted mutants cover
head penetration, a frozen linkage, removed diagonal bracing and a whipping tip.
Earlier failed calibration/diagnostic results remain under
`validation/airframe-binary-20261117`; no favorable retry replaces a model score.

Reproduction (fresh directories required; zero API/model calls):

```
PYTHONPATH=. python3 analysis/calibrate_airframe.py runs/fresh-airframe-calibration --node /path/to/node
python3 -m ornithopter_eval.airframe /absolute/submission --output runs/fresh-inspection --node /path/to/node
```

Saved-model comparisons use unchanged saved submissions and original seven-check
results, with new supplemental evidence. These requirements were chosen **after
looking at the models' outputs**; this is exploratory retrospective analysis,
not held-out evidence of a model ranking. No requirement guarantees a named model
passes. A fresh cohort receiving the explicit revised specification is needed
for a prospective comparison. All file-only failures still score zero.
