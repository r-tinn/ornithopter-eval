# Aircraft / shared-world boundary

The model receives the complete standalone scaffold and two source photographs.
Only aircraft.mjs, physics.mjs and interpretation.json are writable. The file
policy enforces that boundary and hashes every shared file. No existing aircraft
or solved flight implementation is in the empty packet.

## aircraft.mjs

```js
export function createAircraft(THREE, parameters) {
  // Called once. Construct your actual aircraft using the supplied Three.js API.
  return {root, leftInner, leftOuter, rightInner, rightOuter, rudder, elevator, wheels};
}
export function updateAircraft(aircraft, state, controls) {
  // Update the existing articulated geometry. Do not create a second scene/UI.
}
```

`root` is a THREE.Group with local x forward, y up and z right. The other named
parts are the actual production Object3D nodes below root; `wheels` is the array
of the three actual wheel meshes. Outer wing nodes are children of their
respective inner-wing nodes and rotate at their wrists. Names provide mounting
and inspection references, not substitute numeric claims about unseen meshes.

The host sets root.position from state.position and root.rotation from
`Euler(roll,-heading,pitch,'YZX')`. updateAircraft sets local wing and control
surface articulation. It must not reposition the whole aircraft, alter the
shared world, or replace the actual model with a separate inspection drawing.
The wheels use the centres and radius in engineering.json. Any stylistic
decisions beyond these explicit requirements remain model choices.

The renderer is pinned to Three.js 0.185.1, vendored locally with its MIT license.
No CDN, installation or original repository is needed. Shaded basic geometry
and opaque materials are sufficient. Lighting, cameras, inputs and timing
are provided. A Group with Mesh children using BufferGeometry, BoxGeometry,
CylinderGeometry and simple materials is sufficient to build the aircraft.

## physics.mjs

```js
export const parameters = { /* source-derived and engineering values */ };
export function forces(state, controls, environment) { /* scalar forces + net vector */ }
export function step(state, controls, environment, dt) { /* return a new state */ }
```

State is `{position:[x,y,z], velocity:[vx,vy,vz], pitch, roll, heading, phase,
time, status}`. Angles are radians. Status is grounded, flying, landed or crashed.
Controls are `{throttle,pitch,bank,rudder,brake}`; throttle/brake are [0,1], the
others [-1,1]. Environment is `{wind:[wx,wy,wz],rho,surfaceHeight(x,z)}`.
surfaceHeight is the fixed world's ground/contact surface, identical for models.
Input vectors and objects must not be mutated.

The root starts 0.82 m above the selected runway: the lowest wheel is on the
surface at zero attitude. Reset selects the runway start and zero velocity.
Approach places it 2 m above that resting height, with velocity [10,-1,0],
zero attitude, zero throttle and flying status. Both presets pause the simulation.

The platform's window.flightLab exposes read-only copies through getState(),
getControls(), getDiagnostics() and getGeometryDiagnostics(). The last reports
actual mesh triangle counts and transformed wheel-to-surface clearance, computed
from the mounted geometry rather than a second declared contact height.
These are supplied production observation
hooks. The evaluated aircraft owns forces, stepping and articulation; the
shared platform owns start/pause/reset, UI, state mounting and camera behaviour.
Those supplied UI functions are scaffold regression tests, not model scores.
