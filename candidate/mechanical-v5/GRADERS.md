# V5 draft: 28 automated binary checks and five binary visual questions

Every check is pass/fail. No weights or visual-quality score. Automated totals
exclude pending visual questions. The source packet, assumptions and test inputs
are fixed for the cohort; graders run only after submission. No tests or grader
feedback are returned during generation. Old cohorts keep their original rubric.

## Source — three deterministic checks

- aspect_ratio_from_study: notebook-derived AR within 0.5%.
- wrist_fraction_from_study: notebook-derived fraction within 0.5%.
- mechanical_area_consistent: span=14 m and area=196/AR within 0.5%.

## Physics — sixteen deterministic causal/numerical checks

| ID | Targeted observation |
|---|---|
| mass_budget_complete | Every component matches the supplied budget, including the 55 kg pilot; dry and wet totals are correct. |
| fuel_accounting | One second of shaft work consumes BSFC*work plus commanded-on idle fuel; input state remains unchanged. |
| empty_tank_stops_drive | Start nearly empty, run, then run again: no negative fuel, shaft power=0, omega=0, phase holds; shaft work cannot exceed fuel allowance. |
| drive_lock_preserves_pose | At four crank phases, set omega to zero: stroke/twist angles stay unchanged within 1e-9 and all rates become zero. |
| fuel_mass_affects_weight | Add 1 kg of fuel at rest: mass rises by 1 kg and downward force rises by g N. |
| locked_wings_no_propulsion | At 12 m/s with open throttle, override all wing rates to zero over a sampled cycle: aero drive work=0 and mean axial wing force is not propulsive. Gliding lift is allowed. |
| outer_motion_changes_propulsion | Freeze only outer hinge rates: cycle-mean axial force changes by >1 N. This tests dependence, not a particular optimal direction. |
| stroke_rate_changes_propulsion | Halve hinge/twist rates at the same angles: cycle-mean axial force changes by >1 N. |
| shaft_power_limited | Sample throttle and drive rates: finite shaft power in [0,16000*throttle], with positive available power in at least one case. |
| drive_energy_balance | Three seconds of motion: shaft work minus aero work, losses and drive-energy increase has residual <0.01 J. This checks the represented mechanical buffer, not all omitted physical processes. |
| bank_reduces_vertical_force | At the same horizontal flow and fixed wings, 60° bank halves vertical wing force, tolerance 1e-5 on the ratio. |
| banked_trim_loses_height | From a common level-lift speed, compare wings-level and 45° bank for 1 s with no compensation: banked height is >0.15 m lower and vertical speed >0.3 m/s lower. This is not a demand that every powered turn descend. |
| neutral_bank_retains_bank | Initial bank=.5 rad, zero roll rate and neutral controls: bank remains within .01 rad after 1 s. |
| post_stall_lift_reduces | At the stated transition angle, CL is >.2 below the stall-edge value and CD >.1 above it. |
| glide_ratio_in_envelope | Fixed unpowered pose, pitch=-.08, initial velocity [16,-1.2,0]: settle 10 s, measure 5 s. Positive height loss and horizontal distance/height loss between 6 and 14; no fuel use. This is a hypothetical model envelope, not measured aircraft performance. |
| locked_wings_matching_wind | Match aircraft velocity with wind at omega=0: only gravity remains. |

The geometry helper is supplied; forces, polar, fuel and stepping remain model
work. Scalar/vector contracts are enforced on sampled fields. These selected
probes do not prove full equation compliance or resistance to adversarial code.

## Production geometry/world — nine deterministic checks

| ID | Targeted observation |
|---|---|
| pilot_mesh_present | Visible geometry in the mounted pilot Group, with seated bounds at human scale. A box could pass this narrow presence test; recognisability is separately reviewed. |
| rendered_wings_match_physics | Compare actual panel quarter-chord transforms and finite-difference velocities against aerodynamic strip geometry at four phases. Position, velocity and twist-rate error <.001 in their respective SI units. |
| wing_geometry_matches_area | Sum actual panel triangle areas: prescribed area within 0.5%; lateral tips within .01 m of +/-7 m in the zero-angle pose. |
| wheel_rotation_axis | Same measured-tyre-plane predicate as v4.1: all axles within 1° of airframe z during straight travel and flight. No rolling-speed or spin-decay assessment. |
| wheels_above_surface | Sample actual transformed tyres every .1 s through both approaches: no penetration beyond .01 m, and at least one tyre touches within .02 m at the end. A pitched aircraft need not touch all three wheels simultaneously. |
| takeoff_from_strip | Full throttle from rest; sample at 35, 36 and 37 s on each strip. Flying and every wheel >.3 m above the contact surface. |
| landing_on_strip | Supplied zero-power approach on both strips: landed within 10 s, no crash, vertical speed zero and actual tyre contact. |
| rudder_mesh_and_yaw | Browser KeyD input versus neutral approach for 1 s: actual rudder deflection >.1 rad and heading change >.02 rad in the commanded direction. |
| aircraft_geometry_bounded | Actual production aircraft contains geometry and <=12,000 triangles, including instances. |

Long sequences use the supplied advanceForReview hook: it runs the **same**
production physics, then renders the mounted aircraft. It supplies no replacement
trajectory or force oracle. Keyboard/rudder checks use browser input. Timing and
draw calls remain diagnostics; this rubric does not claim a hardware-independent
frame rate or absence of all rendering artefacts.

## Five separate binary human visual questions

1. recognisable_adult_pilot: clearly visible seated adult, head/face, torso,
   two arms and two legs. Use Pilot/front/side screenshots of the production model.
2. mechanical_airframe: visibly engineered frame, motor and wing-drive mechanism.
3. wings_lateral: main wings extend to both sides.
4. tail_aft: horizontal tail and upright fin/rudder are behind the main wings.
5. landing_gear_visible: three wheels and supporting gear are visibly present.

Each answer needs a boolean, short reason and actual screenshot filename(s).
Ambiguous, hidden or absent evidence does not pass. The review command accepts
these v5 questions; the existing LLM judge remains restricted to its earlier
calibrated protocol. No new visual LLM results are implied or silently substituted.

The fourteen calibration variants include a handwritten positive reference and
selected deliberate defects: missing pilot, omitted pilot mass, free thrust,
ignored motion override, false wing rates, snapping shutdown, wrong wheel axis, unlimited fuel,
excess shaft power, auto-levelling, zero drag, a syntax error and an empty starter. All results
and captures are retained. Calibration shows detection of those software defects;
it is not empirical aerodynamic or structural validation.
