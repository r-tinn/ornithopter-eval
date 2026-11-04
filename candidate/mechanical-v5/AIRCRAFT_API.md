# V5 aircraft/shared-world contract

Four writable files: aircraft.mjs, physics.mjs, kinematics.mjs and interpretation.json.
The host, mechanism helper, engineering assumptions and renderer are immutable.
The complete vendored Three.js runtime is supplied. No original project is needed.

## aircraft.mjs

Export `createAircraft(THREE,parameters)` and `updateAircraft(aircraft,state,controls)`.
Return a root Group plus these real descendant nodes:

- leftInner, leftOuter, rightInner, rightOuter: flap hinge Groups.
- Each corresponding `name+'Surface'`: a twist Group beneath that flap hinge.
- wingPanels: mapping from those four names to their actual thin aerodynamic
  panel Meshes beneath their respective Surface nodes.
- rudder, elevator, pilot: the production control surfaces and seated pilot Group.
- wheels: three distinct actual thin tyre Meshes, with measurable wheel planes.

`planform(parameters)` gives the source-derived panel lengths and common root chord.
Inner hinges are at `[0,root_height,+/-hinge_offset]`. Outer hinges are at
`[0,0,+/-inner_length]` beneath their inner flap Groups. Surface Groups share their
hinge origin. Panel quarter-chord lies on local x=0; root/tip leading-edge x is
chord/4, trailing-edge x is -3*chord/4. Inner chord is constant; outer tip chord
is root chord*taper. Left panels extend along -z; right panels along +z.

The host calls updateAircraft, then **mountWingPose**, then sets the root from
the physics state. Update only wheels, rudder, elevator and cosmetic mechanism
parts; do not override wing transforms, mutate panel geometry, or hide the
production model during inspection. The host owns the same single mounted model
in flight and all inspection cameras. No alternate pilot/wing illustration.

Root orientation is THREE.Euler(roll,-heading,pitch,'YZX'): apply roll about body
x, pitch about z, then heading about world y. The supplied pure geometric
wingSamples helper uses the same hinge conventions as mountWingPose.

## kinematics.mjs

Export `wingPose(state)` returning an object keyed by the four panel names.
Each value contains finite scalar `stroke, rate, twist, twistRate`. Inner stroke
includes dihedral; outer stroke/rate are relative to the inner hinge. Surface
twist is local to each panel, not accumulated from the inner Surface.
Do not read controls, DOM, clock or renderer. Use the supplied mechanism constants,
state.phase and state.omega. Physics imports this exact function. The host mirrors
left/right hinge rotation signs and directly applies the returned angles.

## physics.mjs

Export `parameters`, `polar(alpha)`, `forces(state,controls,environment,poseOverride?)`
and `step(state,controls,environment,dt)`.

Parameters include aspect_ratio, wrist_span_fraction, span_m, wing_area_m2,
body_length_m, pilot_mass_kg, dry_mass_kg, mass_kg (initial wet mass), mass_budget,
wheel_radius_m and gear_centres. Preserve the full component allocations, not
only their total. Derive area and the two source ratios from the photographs.

State:
```
{position:[x,y,z], velocity:[vx,vy,vz], pitch,roll,heading,
 pitch_rate,roll_rate, phase,omega, fuel_kg, wheel_angle,
 shaft_work_J,aero_work_J,drive_heat_J, time,status}
```
All angles use radians; omega is crank/wing-cycle radians per second. The three
work fields are cumulative joules. Status is grounded, flying, landed or crashed.
Controls are `{throttle,pitch,bank,rudder,brake}`: throttle/brake [0,1], others [-1,1].
Environment is `{wind:[wx,wy,wz],rho,surfaceHeight(x,z)}`. Do not mutate inputs.

Forces must use poseOverride when supplied, otherwise wingPose(state). The
override is a deterministic causal-test hook, not an alternative production model.
Return finite scalar lift (vertical wing force), drag (nonnegative body-drag
magnitude), thrust (**signed body-x wing force**, including wing profile/induced
drag), power (engine shaft W), airspeed, aero_power_W (signed), wing_dissipation_W
(nonnegative), drive_friction_W, mass_kg; plus force:[fx,fy,fz] (total world force
including gravity) and wing_force_body_N:[fx,fy,fz]. `polar` returns scalar cl,cd.
Scalar fields must never be vectors. At locked wings thrust can be negative.

World presets: reset starts on the selected strip at rest, root height 1.43 m,
full fuel, omega=0 and all counters=0. Approach starts 5 m above that height,
velocity [16,-1.2,0], pitch=-.08, zero power, omega=0. Both presets use
E.wing.parked_phase_rad. Presets pause simulation. The ideal drive brake/lock
preserves the reached wing angles; its energy dissipation is a stated approximation.

window.flightLab exposes authoritative getState/getControls/getDiagnostics,
actual transformed getGeometryDiagnostics, and interpolated getViewDiagnostics.
Geometry diagnostics include actual mesh triangles, tyre clearances and pilot
mesh count. These are observation hooks, not substitute claims about geometry.
Chase camera and aircraft use the same interpolated pose, directly behind the
heading. Pilot camera reveals the same mounted pilot. Supplied UI earns no points.
