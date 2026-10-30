// A small electric research machine, not an enlargement of the animal's body.
// All dimensions below are metres. The geometry mounted here is the flight model.
export function createAircraft(THREE, parameters) {
  const root = new THREE.Group();
  root.name = 'Kestrel M3 | 400 W articulated test aircraft';
  const material = (color, metalness = 0, roughness = 0.65) =>
    new THREE.MeshStandardMaterial({color, metalness, roughness});
  const skin = material(0xe9e4cc);
  const teal = material(0x126773, 0.35);
  const carbon = material(0x263137, 0.45);
  const alloy = material(0xbac9ca, 0.75, 0.32);
  const orange = material(0xf3a335, 0.3, 0.4);
  const rubber = material(0x171f25, 0, 0.88);
  const dark = material(0x0d303e, 0.35, 0.3);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const unitTube = new THREE.CylinderGeometry(1, 1, 1, 8);
  const unitDisc = new THREE.CylinderGeometry(1, 1, 1, 20);
  const axisY = new THREE.Vector3(0, 1, 0);
  const pointA = new THREE.Vector3(), pointB = new THREE.Vector3();
  function mesh(parent, geometry, mat, name) {
    const m = new THREE.Mesh(geometry, mat);
    m.name = name;
    parent.add(m);
    return m;
  }
  function box(parent, pos, size, mat, name) {
    const m = mesh(parent, unitBox, mat, name);
    m.position.set(...pos); m.scale.set(...size);
    return m;
  }
  function rod(parent, a, b, radius, mat, name) {
    const m = mesh(parent, unitTube, mat, name);
    pointA.set(...a); pointB.set(...b).sub(pointA);
    m.position.copy(pointA).addScaledVector(pointB, 0.5);
    m.scale.set(radius, pointB.length(), radius);
    m.quaternion.setFromUnitVectors(axisY, pointB.normalize());
    return m;
  }
  function disc(parent, pos, radius, length, axis, mat, name) {
    const m = mesh(parent, unitDisc, mat, name);
    m.position.set(...pos); m.scale.set(radius, length, radius);
    if (axis === 'x') m.rotation.z = -Math.PI / 2;
    if (axis === 'z') m.rotation.x = Math.PI / 2;
    return m;
  }
  // Octagonal, tapered sheet-metal equipment pod; nose x=+1, tail x=-1.
  function podGeometry() {
    const stations = [
      [-0.70, 0.085, 0.07], [-0.35, 0.17, 0.14],
      [0.47, 0.17, 0.14], [0.86, 0.11, 0.095], [1.0, 0.025, 0.025]
    ];
    const v = [], idx = [];
    for (const [x, height, width] of stations) {
      for (let j = 0; j < 8; j++) {
        const a = 2 * Math.PI * j / 8 + Math.PI / 8;
        v.push(x, -0.025 + height * Math.cos(a), width * Math.sin(a));
      }
    }
    for (let i = 0; i < stations.length - 1; i++) {
      for (let j = 0; j < 8; j++) {
        const a = i * 8 + j, b = i * 8 + (j + 1) % 8;
        idx.push(a, b, a + 8, b, b + 8, a + 8);
      }
    }
    for (let j = 1; j < 7; j++) {
      idx.push(0, j + 1, j);
      const end = (stations.length - 1) * 8;
      idx.push(end, end + j, end + j + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  // Closed wing sections with a thin, explicitly engineered biconvex profile.
  // Mirroring reverses winding, so both panels have outward normals.
  function panelGeometry(length, chord0, chord1, sweep, sign, thickness, lead = 0.40) {
    const v = [], idx = [];
    const fractions = [0, 0.14, 0.38, 0.72, 1];
    const profile = [0.07, 0.8, 1, 0.55, 0.04];
    for (let top = 0; top < 2; top++) {
      for (let end = 0; end < 2; end++) {
        const chord = end ? chord1 : chord0;
        for (let i = 0; i < 5; i++) {
          v.push(lead - end * sweep - fractions[i] * chord,
            (top === 0 ? 1 : -1) * thickness * 0.5 * profile[i] * (end ? 0.65 : 1),
            sign * end * length);
        }
      }
    }
    function tri(a, b, c) {
      if (sign > 0) idx.push(a, b, c); else idx.push(a, c, b);
    }
    for (let i = 0; i < 4; i++) {
      tri(i, i + 1, i + 5); tri(i + 1, i + 6, i + 5);
      tri(10 + i, 15 + i, 11 + i); tri(11 + i, 15 + i, 16 + i);
      tri(i, 10 + i, i + 1); tri(i + 1, 10 + i, 11 + i);
      tri(5 + i, 6 + i, 15 + i); tri(6 + i, 16 + i, 15 + i);
    }
    tri(0, 5, 10); tri(5, 15, 10);
    tri(4, 14, 9); tri(9, 14, 19);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  mesh(root, podGeometry(), skin, 'tapered equipment pod');
  box(root, [0.49, 0.13, 0], [0.35, 0.045, 0.15], dark, 'avionics access cover');
  box(root, [-0.06, -0.13, 0], [0.48, 0.10, 0.20], carbon, 'battery tray');
  for (const x of [-0.23, 0.10])
    box(root, [x, -0.13, 0], [0.025, 0.12, 0.23], orange, 'battery retaining strap');
  // Aft carbon boom and braced conventional empennage, within the 2 m length.
  rod(root, [-0.27, 0.02, 0], [-0.95, 0.06, 0], 0.038, carbon, 'tail boom');
  for (const side of [-1, 1])
    rod(root, [-0.38, -0.10, side * 0.11], [-0.90, 0.04, side * 0.23],
      0.009, alloy, 'tail brace');

  // Wing area includes the stationary centre carry-through, not the tail.
  const half = parameters.span_m / 2;
  const wrist = half * parameters.wrist_span_fraction;
  const shoulder = 0.11;
  const innerLength = wrist - shoulder;
  const outerLength = half - wrist;
  const tipRatio = 0.28;
  const chord = parameters.wing_area_m2 /
    (2 * wrist + outerLength * (1 + tipRatio));
  const tipChord = chord * tipRatio;
  mesh(root, panelGeometry(shoulder * 2, chord, chord, 0, 1, 0.026),
    skin, 'centre carry-through wing').position.set(0, 0.20, -shoulder);
  rod(root, [0.27, 0.20, -0.19], [0.27, 0.20, 0.19], 0.023, alloy,
    'fixed carry-through spar');
  const assemblies = [];
  for (const side of [-1, 1]) {
    const label = side < 0 ? 'left' : 'right';
    const inner = new THREE.Group(); inner.name = label + ' shoulder hinge / inner wing';
    inner.position.set(0, 0.20, side * shoulder); root.add(inner);
    const outer = new THREE.Group(); outer.name = label + ' wrist hinge / outer wing';
    outer.position.z = side * innerLength; inner.add(outer);
    mesh(inner, panelGeometry(innerLength, chord, chord, 0, side, 0.026),
      skin, label + ' parallel-chord inner skin');
    mesh(outer, panelGeometry(outerLength, chord, tipChord, 0.14, side, 0.018),
      skin, label + ' tapered outer skin');
    rod(inner, [0.36, 0.019, 0], [0.36, 0.019, side * innerLength],
      0.013, teal, label + ' inner leading spar');
    rod(inner, [0.40 - chord * 0.72, 0.016, 0],
      [0.40 - chord * 0.72, 0.016, side * innerLength], 0.007, carbon,
      label + ' inner rear spar');
    rod(outer, [0.36, 0.012, 0], [0.26 - tipChord * 0.12, 0.008, side * outerLength],
      0.010, teal, label + ' outer leading spar');
    rod(outer, [0.40 - chord * 0.75, 0.012, 0],
      [0.26 - tipChord * 0.75, 0.008, side * outerLength], 0.006, carbon,
      label + ' outer rear spar');
    for (let i = 1; i < 6; i++) {
      const z = side * innerLength * i / 6;
      rod(inner, [0.39, 0.018, z], [0.41 - chord, 0.018, z],
        0.004, alloy, label + ' inner rib cap');
    }
    for (let i = 1; i < 6; i++) {
      const t = i / 6, z = side * outerLength * t;
      const c = chord + (tipChord - chord) * t, lead = 0.40 - 0.14 * t;
      rod(outer, [lead - 0.012, 0.012, z], [lead - c + 0.012, 0.012, z],
        0.0035, alloy, label + ' outer rib cap');
    }
    box(outer, [0.26 - tipChord * 0.5, 0, side * (outerLength - 0.024)],
      [tipChord, 0.018, 0.048], orange, label + ' high-visibility wingtip');
    for (const x of [0.16, 0.31]) {
      disc(root, [x, 0.20, side * shoulder], 0.041, 0.046, 'x', alloy,
        label + ' shoulder bearing');
      disc(inner, [x, 0, side * innerLength], 0.029, 0.034, 'x', orange,
        label + ' wrist bearing');
    }
    box(inner, [0.20, 0.028, side * (innerLength - 0.055)],
      [0.09, 0.046, 0.062], carbon, label + ' wrist servo');
    rod(outer, [0.20, 0.018, 0], [0.20, 0.085, side * 0.06],
      0.008, orange, label + ' wrist actuation horn');
    // Shoulder horn is attached to its actual flapping wing.
    rod(inner, [0.12, 0, 0], [0.12, 0.085, side * 0.13],
      0.012, orange, label + ' shoulder bellcrank');
    assemblies.push({inner, outer, side});
  }

  // Electric motor, reduction housing, common shaft, rotating eccentric crank.
  disc(root, [0.43, -0.015, 0], 0.074, 0.24, 'x', carbon, '400 W electric motor');
  for (const x of [0.34, 0.39, 0.44, 0.49, 0.54])
    disc(root, [x, -0.015, 0], 0.080, 0.012, 'x', alloy, 'motor cooling ring');
  box(root, [0.235, 0.045, 0], [0.10, 0.22, 0.20], teal, 'reduction gear housing');
  disc(root, [0.165, 0.10, 0], 0.112, 0.045, 'x', alloy, 'reduction gear cover');
  disc(root, [0.126, 0.10, 0], 0.077, 0.018, 'x', orange, 'output flange');
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    disc(root, [0.139, 0.10 + 0.094 * Math.cos(a), 0.094 * Math.sin(a)],
      0.008, 0.01, 'x', carbon, 'gear cover bolt');
  }
  const crank = new THREE.Group();
  crank.position.set(0.12, 0.10, 0); crank.name = 'motor-driven eccentric';
  root.add(crank);
  rod(crank, [0, -0.045, 0], [0, 0.045, 0], 0.015, orange, 'balanced crank web');
  disc(crank, [0, 0.045, 0], 0.019, 0.030, 'x', alloy, 'crankpin');
  const driveLinks = [];
  for (const {side} of assemblies) {
    const link = rod(root, [0.12, 0.145, 0], [0.12, 0.285, side * 0.24],
      0.008, alloy, 'articulated drive connecting rod');
    driveLinks.push({mesh: link, side});
  }

  // Fixed stabilizer and movable elevator, aft of the CG.
  box(root, [-0.785, 0.07, 0], [0.19, 0.018, 0.86], teal, 'horizontal stabilizer');
  const elevator = new THREE.Group();
  elevator.name = 'actual elevator hinge'; elevator.position.set(-0.88, 0.07, 0);
  root.add(elevator);
  box(elevator, [-0.06, 0, 0], [0.12, 0.016, 0.86], skin, 'elevator surface');
  rod(root, [-0.88, 0.07, -0.43], [-0.88, 0.07, 0.43], 0.008, alloy,
    'elevator hinge tube');
  box(root, [-0.79, 0.235, 0], [0.18, 0.32, 0.018], teal, 'vertical fin');
  const rudder = new THREE.Group();
  rudder.name = 'actual rudder hinge'; rudder.position.set(-0.88, 0.08, 0);
  root.add(rudder);
  box(rudder, [-0.06, 0.155, 0], [0.12, 0.31, 0.018], orange, 'rudder surface');
  rod(root, [-0.88, 0.085, 0], [-0.88, 0.39, 0], 0.007, alloy,
    'rudder hinge tube');
  box(root, [-0.49, 0.075, 0], [0.08, 0.04, 0.08], carbon, 'tail control servos');
  rod(root, [-0.51, 0.10, 0.032], [-0.88, 0.10, 0.032], 0.003, alloy,
    'rudder pushrod');

  // Tricycle gear uses the actual assumed wheel centres, not a display offset.
  const wheels = [];
  const tireGeometry = new THREE.CylinderGeometry(
    parameters.wheel_radius_m, parameters.wheel_radius_m, 0.075, 20);
  tireGeometry.rotateX(Math.PI / 2);
  const hubGeometry = new THREE.CylinderGeometry(0.082, 0.082, 0.079, 12);
  hubGeometry.rotateX(Math.PI / 2);
  for (let i = 0; i < parameters.gear_centres.length; i++) {
    const centre = parameters.gear_centres[i];
    const [x, y, z] = centre;
    const wheel = mesh(root, tireGeometry, rubber, i === 0 ? 'nose wheel' : 'main wheel ' + i);
    wheel.position.set(x, y, z);
    mesh(wheel, hubGeometry, alloy, 'metal wheel hub');
    box(wheel, [0, 0, 0.042], [0.12, 0.022, 0.008], orange, 'wheel rotation marker');
    wheels.push(wheel);
    if (i === 0) {
      rod(root, [0.55, -0.12, 0], [x, y + 0.04, z], 0.021, alloy,
        'nose oleo strut');
      rod(root, [0.25, -0.12, 0], [x, y + 0.07, z], 0.012, carbon,
        'nose drag brace');
    } else {
      rod(root, [-0.18, -0.10, z * 0.30], [x, y + 0.035, z],
        0.019, alloy, 'main gear leg');
      rod(root, [0.15, -0.10, z * 0.25], [x, y + 0.035, z],
        0.012, carbon, 'main gear drag brace');
      box(root, [x - 0.09, y + 0.025, z + (z > 0 ? -0.05 : 0.05)],
        [0.045, 0.075, 0.032], orange, 'wheel brake caliper');
    }
    rod(root, [x, y, z - 0.06], [x, y, z + 0.06], 0.018, alloy, 'wheel axle');
  }
  rod(root, [-0.45, -0.61, -0.32], [-0.45, -0.61, 0.32], 0.010, carbon,
    'main gear cross tie');

  const aircraft = {
    root,
    leftInner: assemblies[0].inner, leftOuter: assemblies[0].outer,
    rightInner: assemblies[1].inner, rightOuter: assemblies[1].outer,
    rudder, elevator, wheels, crank, driveLinks,
    wheelRadius: parameters.wheel_radius_m,
    // Scratch objects are allocated once, never inside updateAircraft.
    linkDirection: new THREE.Vector3(), linkUp: new THREE.Vector3(0, 1, 0)
  };
  updateAircraft(aircraft, {phase: 0, time: 0, velocity: [0, 0, 0]}, {});
  return aircraft;
}

export function updateAircraft(aircraft, state, controls = {}) {
  const finite = x => Number.isFinite(x) ? x : 0;
  const bound = x => Math.max(-1, Math.min(1, finite(x)));
  const phase = finite(state.phase);
  const powered = finite(controls.throttle) > 0;
  // Angles are mechanical design choices, not the ambiguous biological angles.
  const stroke = powered ? 0.36 * Math.sin(phase) : 0;
  const wrist = powered ? 0.22 * Math.sin(phase - 0.85) + 0.045 : 0;
  aircraft.leftInner.rotation.x = stroke;
  aircraft.rightInner.rotation.x = -stroke;
  aircraft.leftOuter.rotation.x = wrist;
  aircraft.rightOuter.rotation.x = -wrist;
  aircraft.rudder.rotation.y = 0.45 * bound(controls.rudder);
  aircraft.elevator.rotation.z = -0.30 * bound(controls.pitch);
  aircraft.crank.rotation.x = powered ? phase : 0;
  // Connecting rods close from the eccentric to actual moving shoulder horns.
  const crankY = 0.10 + 0.045 * Math.cos(powered ? phase : 0);
  const crankZ = 0.045 * Math.sin(powered ? phase : 0);
  for (const link of aircraft.driveLinks) {
    const a = -link.side * stroke;
    const hornY = 0.20 + 0.085 * Math.cos(a) - link.side * 0.13 * Math.sin(a);
    const hornZ = link.side * 0.11 + 0.085 * Math.sin(a) + link.side * 0.13 * Math.cos(a);
    const d = aircraft.linkDirection.set(0, hornY - crankY, hornZ - crankZ);
    link.mesh.position.set(0.12, (hornY + crankY) / 2, (hornZ + crankZ) / 2);
    const length = d.length();
    link.mesh.scale.set(0.008, length, 0.008);
    if (length > 1e-8) link.mesh.quaternion.setFromUnitVectors(aircraft.linkUp, d.normalize());
  }
  // Purely visual rolling, driven by travelled-speed approximation; no root motion.
  const speed = Math.hypot(finite(state.velocity?.[0]), finite(state.velocity?.[2]));
  const spin = -(finite(state.time) * speed / aircraft.wheelRadius) % (2 * Math.PI);
  for (const wheel of aircraft.wheels) wheel.rotation.z = spin;
}
