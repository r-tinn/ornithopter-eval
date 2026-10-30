export function createAircraft(THREE, parameters) {
  const root = new THREE.Group();
  root.name = "Mechanical ornithopter";
  const material = (color, roughness, metalness) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const dark = material(0x202a32, 0.72, 0.55);
  const metal = material(0x9aa7ad, 0.38, 0.82);
  const brass = material(0xb77b2e, 0.4, 0.72);
  const wingMaterial = material(0xd8c69a, 0.74, 0.05);
  const controlMaterial = material(0xb94a3e, 0.62, 0.12);
  const tire = material(0x17191a, 0.92, 0.02);
  wingMaterial.side = THREE.DoubleSide;
  controlMaterial.side = THREE.DoubleSide;

  const rodGeometry = new THREE.CylinderGeometry(0.025, 0.025, 1, 8);
  const thinRodGeometry = new THREE.CylinderGeometry(0.012, 0.012, 1, 7);
  const jointGeometry = new THREE.CylinderGeometry(0.055, 0.055, 0.07, 12);
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const yAxis = new THREE.Vector3(0, 1, 0);

  function box(parent, size, position, mat, name) {
    const mesh = new THREE.Mesh(boxGeometry, mat);
    mesh.scale.set(...size);
    mesh.position.set(...position);
    mesh.name = name || "structure";
    parent.add(mesh);
    return mesh;
  }
  function rod(parent, a, b, mat = metal, thin = false) {
    const mesh = new THREE.Mesh(thin ? thinRodGeometry : rodGeometry, mat);
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const direction = vb.clone().sub(va);
    mesh.position.copy(va).add(vb).multiplyScalar(0.5);
    mesh.scale.set(1, direction.length(), 1);
    mesh.quaternion.setFromUnitVectors(yAxis, direction.normalize());
    parent.add(mesh);
    return mesh;
  }

  box(root, [1.65, 0.12, 0.18], [0, 0.02, 0], dark, "central keel");
  box(root, [0.34, 0.34, 0.36], [0.34, 0.09, 0], metal, "motor housing");
  rod(root, [-0.78, -0.08, -0.14], [0.65, -0.08, -0.14]);
  rod(root, [-0.78, -0.08, 0.14], [0.65, -0.08, 0.14]);
  rod(root, [-0.65, -0.08, -0.14], [0.22, 0.28, -0.14]);
  rod(root, [-0.65, -0.08, 0.14], [0.22, 0.28, 0.14]);
  rod(root, [0.22, 0.28, -0.14], [0.72, -0.08, -0.14]);
  rod(root, [0.22, 0.28, 0.14], [0.72, -0.08, 0.14]);

  const motor = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.13, 0.30, 16), brass);
  motor.rotation.x = Math.PI / 2;
  motor.position.set(0.34, 0.09, 0);
  motor.name = "400 W electric motor";
  root.add(motor);
  const driveCrank = new THREE.Group();
  driveCrank.name = "two-hertz crankshaft";
  driveCrank.position.set(0.22, 0.23, 0);
  root.add(driveCrank);
  const diskGeometry = new THREE.CylinderGeometry(0.105, 0.105, 0.025, 16);
  for (const z of [-0.18, 0.18]) {
    const disk = new THREE.Mesh(diskGeometry, brass);
    disk.rotation.x = Math.PI / 2;
    disk.position.z = z;
    driveCrank.add(disk);
  }

  const innerLength = parameters.span_m * parameters.wrist_span_fraction / 2 - 0.14;
  const outerLength = parameters.span_m * (1 - parameters.wrist_span_fraction) / 2;
  const innerGeometry = new THREE.BoxGeometry(0.58, 0.035, innerLength);
  function taperedGeometry(sign) {
    const t = 0.0175, z = sign * outerLength;
    const vertices = new Float32Array([
      .34,t,0, -.24,t,0, -.06,t,z, .14,t,z,
      .34,-t,0, -.24,-t,0, -.06,-t,z, .14,-t,z
    ]);
    const indices = [
      0,1,2, 0,2,3, 7,6,5, 7,5,4, 0,4,5, 0,5,1,
      3,2,6, 3,6,7, 0,3,7, 0,7,4, 1,5,6, 1,6,2
    ];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }
  function wing(side) {
    const sign = side === "right" ? 1 : -1;
    const inner = new THREE.Group();
    inner.name = `${side} inner wing`;
    inner.position.set(0.12, 0.18, sign * 0.14);
    root.add(inner);
    const panel = new THREE.Mesh(innerGeometry, wingMaterial);
    panel.position.set(0.04, 0, sign * innerLength / 2);
    panel.name = `${side} parallel-chord inner panel`;
    inner.add(panel);
    rod(inner, [.28,.035,0], [.28,.035,sign*innerLength], dark, true);
    rod(inner, [-.19,.035,0], [-.19,.035,sign*innerLength], dark, true);
    rod(inner, [.28,.045,0], [-.19,.045,sign*innerLength], dark, true);
    const outer = new THREE.Group();
    outer.name = `${side} outer hand panel`;
    outer.position.set(0, 0, sign * innerLength);
    inner.add(outer);
    const skin = new THREE.Mesh(taperedGeometry(sign), wingMaterial);
    skin.name = `${side} tapered outer panel`;
    outer.add(skin);
    rod(outer, [.27,.035,0], [.12,.035,sign*outerLength], dark, true);
    rod(outer, [-.19,.035,0], [-.045,.035,sign*outerLength], dark, true);
    const wrist = new THREE.Mesh(jointGeometry, brass);
    wrist.rotation.x = Math.PI / 2;
    wrist.name = `${side} wrist hinge`;
    outer.add(wrist);
    rod(root, [.22,.23,sign*.18], [.10,.21,sign*.32], brass, true);
    return { inner, outer };
  }
  const left = wing("left"), right = wing("right");

  box(root, [.44,.035,.82], [-.70,.08,0], wingMaterial, "horizontal stabilizer");
  const elevator = new THREE.Group();
  elevator.name = "elevator";
  elevator.position.set(-.92, .08, 0);
  root.add(elevator);
  box(elevator, [.22,.028,.78], [-.11,0,0], controlMaterial, "elevator surface");
  box(root, [.40,.42,.035], [-.74,.28,0], wingMaterial, "vertical fin");
  const rudder = new THREE.Group();
  rudder.name = "rudder";
  rudder.position.set(-.94, .28, 0);
  root.add(rudder);
  box(rudder, [.22,.38,.03], [-.11,0,0], controlMaterial, "rudder surface");

  const wheels = [];
  const wheelGeometry = new THREE.CylinderGeometry(
    parameters.wheel_radius_m, parameters.wheel_radius_m, .065, 20);
  parameters.gear_centres.forEach((centre, i) => {
    const upper = i === 0 ? [.42,-.12,0] : [-.35,-.12,centre[2]];
    rod(root, upper, centre);
    const wheel = new THREE.Mesh(wheelGeometry, tire);
    wheel.name = i === 0 ? "nose wheel" : `main wheel ${i}`;
    wheel.position.set(...centre);
    wheel.rotation.order = "YXZ";
    wheel.rotation.x = Math.PI / 2;
    root.add(wheel);
    wheels.push(wheel);
  });
  root.userData.driveCrank = driveCrank;
  root.userData.wheelRadius = parameters.wheel_radius_m;
  return {
    root,
    leftInner: left.inner, leftOuter: left.outer,
    rightInner: right.inner, rightOuter: right.outer,
    rudder, elevator, wheels
  };
}

function finite(v) { return Number.isFinite(v) ? v : 0; }
function control(v) { return Math.max(-1, Math.min(1, finite(v))); }
export function updateAircraft(aircraft, state, controls) {
  const phase = finite(state && state.phase);
  const bank = control(controls && controls.bank);
  const stroke = .34 * Math.sin(phase);
  aircraft.leftInner.rotation.x = stroke + .035 * bank;
  aircraft.rightInner.rotation.x = -stroke + .035 * bank;
  const hand = .24 * Math.sin(phase + .85);
  aircraft.leftOuter.rotation.x = hand;
  aircraft.rightOuter.rotation.x = -hand;
  aircraft.rudder.rotation.y = -.48 * control(controls && controls.rudder);
  aircraft.elevator.rotation.z = .38 * control(controls && controls.pitch);
  const crank = aircraft.root.userData.driveCrank;
  if (crank) crank.rotation.z = phase;
  const heading = finite(state && state.heading);
  const p = state && Array.isArray(state.position) ? state.position : [0,0,0];
  const travel = finite(p[0]) * Math.cos(heading) + finite(p[2]) * Math.sin(heading);
  const spin = -travel / aircraft.root.userData.wheelRadius;
  for (const wheel of aircraft.wheels) wheel.rotation.y = spin;
}
