# Proposed v4 checklist — owner review before model calibration

**19 binary checks: 15 automated, four visual.** These replace the old checklist
for the proposed mechanical-aircraft task. They are a review specification;
v4 grading and judge calibration are not yet claimed as implemented or validated.
No old trial is rescored under these new requirements.

The shared environment, cameras and UI are provided infrastructure. Their
correctness is checked separately and earns no model points. No aesthetic score,
weighted average, generic “realism” judgment or hardware-dependent FPS pass/fail.

## Source interpretation — three deterministic questions

| ID | Binary question | Proposed comparison |
|---|---|---|
| aspect_ratio_from_study | Is exported AR derived from the selected source span and area? | 7.4²/6.61, within 0.5%. |
| wrist_fraction_from_study | Is the wrist-to-wrist fraction derived from that same source column? | 3.7/7.4, within 0.5%. |
| mechanical_area_consistent | Does the mechanical wing area preserve that AR at the published span? | 3²/AR, within 0.5%, with span 3 m. |

This tests an engineering translation of wing proportions. It does not score
literal bird body dimensions or prove that the visible wing uses the declaration.

## Flight functions — six deterministic questions

| ID | Controlled comparison | Pass |
|---|---|---|
| power_controls_thrust | At 10 m/s, compare throttle 0 and 1. | Scalar thrust is zero off and positive on. |
| lift_scales_with_speed_squared | Double level relative-air speed from 10 to 20 m/s. | Positive scalar lift quadruples, relative tolerance 1e-6. |
| matching_wind_removes_lift | Set wind equal to velocity [10,0,0]. | Positive still-air lift becomes zero. |
| powered_phase_frequency | Sample phase after 12, 25 and 44 powered 1/120 s steps. | Follows the published 2 Hz cycle, tolerance 1e-6 rad. |
| unpowered_phase_stops | Advance 44 steps at zero throttle. | Phase stays fixed. |
| steady_glide_ratio | Start at the specified zero-alpha steady trim and step for 2 s. | Distance / height lost matches CL/CD within 1%. |

For the glide test use CL=0.6, CD from the published polar, gamma=atan(CD/CL),
V=sqrt(2*m*g*cos(gamma)/(rho*S*CL)), pitch=-gamma and velocity
[V*cos(gamma),-V*sin(gamma),0], well above the terrain. Force outputs have explicit
scalar types; the net force is a separate vector. These selected properties do
not validate the complete aerodynamic model or real-world aircraft performance.

## Aircraft in the shared world — six deterministic browser questions

| ID | One cause / observation | Proposed pass condition |
|---|---|---|
| pitch_input_changes_pitch | Compare neutral approach with ArrowUp held 0.4 s. | Actual production pitch increases by >0.1 rad. |
| rudder_changes_heading | Compare neutral approach with D held 1 s. | Actual heading changes toward +z by >0.02 rad. |
| takeoff_from_strip | Full power; Start; at 2 s hold ArrowUp 0.3 s, then release. | Flying with wheel clearance >0.7 m at 6, 6.25, 6.5, 6.75 and 7 s. Repeat on both strips. |
| landing_on_strip | Start the supplied zero-power approach and run for 6 s. | Landed, no crash, with zero downward velocity and wheels on the surface. Repeat on both strips. |
| wheels_above_surface | Sample the actual transformed wheel geometry during approach/contact. | Lowest tyre points do not penetrate the rendered/contact surface by >0.01 m, and touchdown reaches it within 0.02 m. Both strips. |
| aircraft_geometry_bounded | Count triangles in production aircraft meshes, including instances. | <=12,000 aircraft triangles, with nonempty geometry. |

Takeoff/landing sequences must be calibrated against a withheld working fixture
and broken variants before they can be frozen. Wheel checks must inspect actual
production geometry, not a second declared “contact height”. Surface sampling
must agree with the rendered terrain/runway. Hook values alone do not prove
correct appearance, mesh coupling, rudder rendering or absence of all collisions.

## Four isolated visual questions — human or calibrated image judge

1. **wings_lateral:** In a top view, is a wing attached on each lateral side of
   the frame, extending across its nose-to-tail axis?
2. **tail_aft:** In a side view, is the tail fin aft of the wing roots and above
   the aft frame?
3. **landing_gear_visible:** In the supplied side/front views, are at least two
   wheels visibly attached below the frame by landing-gear structure?
4. **outer_panels_articulate:** Across four powered front-view frames, does
   each outer panel visibly change angle relative to its own inner panel?

Each question receives only the relevant view(s), one boolean rubric, a short
reason and evidence filenames. The articulation sequence samples roughly
0, 0.125, 0.25 and 0.375 s. Whole-aircraft/camera translation does not establish
relative articulation. No aesthetic score is used. Test judges against known
positive/negative image sets and identical-image consistency before ranking.
Until then, visual checks stay ungraded or receive a recorded human review.

Timing, draw calls, resource counts and frame stalls remain visible diagnostics.
Pausing/resuming/resetting the supplied scaffold are infrastructure regression
checks, not model grades. A checklist pass is not scientific validation or proof
that every written requirement is satisfied.
