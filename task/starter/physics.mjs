// Implement the shared production physics contract in TASK.md.
export const parameters = {};
/**
 * @returns {{lift:number, drag:number, thrust:number, power:number,
 * airspeed:number, cl:number, force:[number,number,number]}}
 * lift: signed L in N; drag/thrust: nonnegative scalar D/T in N.
 * power: W; airspeed: m/s; cl: dimensionless. All numbers finite.
 * Only force is a world-frame [fx,fy,fz] vector in N, including gravity.
 */
export function forces(state, controls, environment) { throw new Error('Not implemented'); }
export function step(state, controls, environment, dt) { throw new Error('Not implemented'); }
