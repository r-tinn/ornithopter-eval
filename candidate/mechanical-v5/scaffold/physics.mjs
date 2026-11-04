// Model-owned file. See inputs/TASK.md and inputs/AIRCRAFT_API.md.
export const parameters = {};
export function polar(alpha) { throw new Error('Implement the reference-informed polar.'); }
export function forces(state, controls, environment) { throw new Error('Implement aircraft forces.'); }
export function step(state, controls, environment, dt) { throw new Error('Implement flight dynamics.'); }
