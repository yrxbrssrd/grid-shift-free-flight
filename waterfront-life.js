import * as THREE from './vendor/three.module.js';

const tideLevel = -.24;
const dockSites = [
  { x: 68.2, z: -9.4, yaw: -Math.PI / 2, length: 8.6, color: 0xffb876 },
  { x: 69.8, z: 28.7, yaw: -Math.PI / 2, length: 9.2, color: 0x78cae6 },
  { x: 21, z: 69.1, yaw: Math.PI, length: 10.1, color: 0xffac72 },
  { x: 101, z: -50.2, yaw: Math.PI, length: 8.1, color: 0x96e7d6 },
  { x: 23, z: 141, yaw: 0, length: 8.8, color: 0xd792f6 },
];

const serviceLanes = [
  { x: 62.8, z: -14, rx: .82, rz: 16.5, period: 35, offset: 1.37, paint: 0x5d8791 },
  { x: 64.6, z: 40, rx: 1.32, rz: 13.6, period: 39, offset: 2.16, paint: 0x6b876f },
  { x: 23.5, z: 63.4, rx: 12.75, rz: .91, period: 40, offset: .41, paint: 0xa16f58 },
  { x: 101, z: -55.5, rx: 12.2, rz: .52, period: 44, offset: 2.80, paint: 0x636c99 },
];

function workboatHull() {
  const plan = new THREE.Shape();
  plan.moveTo(-.63, 1.42);
  plan.lineTo(.63, 1.42);
  plan.lineTo(.69, -.57);
  plan.quadraticCurveTo(.56, -1.51, 0, -1.85);
  plan.quadraticCurveTo(-.56, -1.51, -.69, -.57);
  plan.closePath();
  return new THREE.ExtrudeGeometry(plan, { depth: .27, bevelThickness: .058, bevelSize: .057,
    bevelSegments: 1, curveSegments: 4, steps: 1 }).rotateX(-Math.PI / 2);
}

export function addWaterfrontLife(parent) {
  const group = new THREE.Group();
  group.name = 'Canal pontoons, harbour crews and service craft';
  parent.add(group);
  const metal = new THREE.MeshStandardMaterial({ roughness: .64, metalness: .36 });
  const paint = new THREE.MeshStandardMaterial({ roughness: .83, metalness: .12 });
  const glow = new THREE.MeshBasicMaterial({ toneMapped: false });
  const time = { value: 0 };
  const wake = new THREE.ShaderMaterial({
    uniforms: { time },
    transparent: true, depthWrite: false, toneMapped: false,
    vertexShader: `
      varying vec2 wash;
      void main() {
        wash = uv;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.);
      }`,
    fragmentShader: `
      uniform float time;
      varying vec2 wash;
      void main() {
        float age = wash.y;
        float edge = abs(wash.x - .5);
        float v = edge - mix(.095, .39, age);
        float tide = exp(-v * v * 213.) * (.58 + .42 * sin(age * 24. - time * 3.8));
        float foam = exp(-edge * edge * 90.) * .28;
        float fade = smoothstep(0., .11, age) * (1. - age) * (1. - age);
        gl_FragColor = vec4(.44, .65, .75, fade * (tide * .19 + foam * .14));
        #include <colorspace_fragment>
      }`,
  });
  const batches = {
    deck: { material: paint, geometry: new THREE.BoxGeometry(), parts: [] },
    trim: { material: metal, geometry: new THREE.BoxGeometry(), parts: [] },
    pole: { material: metal, geometry: new THREE.CylinderGeometry(.5, .5, 1, 8), parts: [] },
    float: { material: paint, geometry: workboatHull(), parts: [] },
    person: { material: paint, geometry: new THREE.CapsuleGeometry(.32, .36, 3, 6), parts: [] },
    light: { material: glow, geometry: new THREE.BoxGeometry(), parts: [] },
    wash: { material: wake, geometry: new THREE.PlaneGeometry(), parts: [] },
  };
  const actor = new THREE.Object3D();
  const part = new THREE.Object3D();
  const colored = new THREE.Color();
  const composed = new THREE.Matrix4();
  const pontoons = [];
  const crews = [];
  const boats = [];
  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');

  function mount(pose, key, color, x, y, z, w, h, d, pitch = 0, roll = 0) {
    part.position.set(x, y, z);
    part.rotation.set(pitch, 0, roll);
    part.scale.set(w, h, d);
    part.updateMatrix();
    batches[key].parts.push({ pose, color, matrix: part.matrix.clone() });
  }

  function character(pose, jacket, owner, x, y, z, facing, activity, wave) {
    const put = (key, ...args) => mount(pose, key, ...args);
    const sits = activity === 'pilot';
    const torso = sits ? .77 : .99;
    put('person', jacket, 0, torso, 0, 0.67, .53, .39);
    put('person', 0x73605e, 0, torso + .366, .008, .34, .27, .32);
    put('trim', 0x273542, 0, torso + .456, .035, .213, .065, .22);
    put('deck', 0xc0b4a2, 0, torso + .055, .100, .261, .047, .022);
    for (const side of [-1, 1]) {
      put('person', 0x2a374a, side * .089, sits ? .45 : .414, sits ? .116 : 0, .27, sits ? .30 : .63, .28, sits ? -.39 : .01);
      put('trim', 0x222b37, side * .09, .077 + (sits ? .16 : 0), sits ? .16 : .042, .119, .133, .218);
      put('person', jacket, side * .213, torso - .07, activity === 'fish' ? .12 : .084,
        .26, .37, .30, activity === 'fish' ? .75 : .43, side * -.17);
    }
    if (activity === 'fish') {
      put('pole', 0x675949, .245, .92, .663, .023, 1.29, .023, 1.31);
      put('pole', 0x8c9c9d, .245, .337, 1.284, .006, 1.40, .006);
      put('light', 0xeaa68e, .245, -.365, 1.284, .034, .051, .036);
    }
    crews.push({ pose, owner, x, y, z, facing, activity, wave });
  }

  for (const [index, { x, z, yaw, length, color }] of dockSites.entries()) {
    const pose = new THREE.Matrix4();
    const shore = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z);
    const deck = (key, ...args) => mount(pose, key, ...args);
    pontoons.push({ pose, x, z, yaw });
    deck('trim', 0x344656, 0, -.116, 0, length, .28, 2.4);
    deck('deck', 0x645e59, 0, .051, 0, length - .06, .109, 2.3);
    for (const side of [-1, 1]) {
      deck('trim', 0x4f6670, 0, .064, side * 1.16, length - .06, .15, .075);
    }
    const planks = Math.round(length / .45);
    for (let i = 0; i < planks; i++) {
      const along = (i + .5) * (length / planks) - length / 2;
      deck('deck', [0x706860, 0x6d6258, 0x807369, 0x756660][(i * 5 + index) % 4], along, .118,
        0, length / planks - .022, .041, 2.23);
      if (i % 4 === 0) {
        deck('trim', 0x2a3544, along, -.05, 1.21, .22, .30, .126);
        if (Math.abs(along) > .85) deck('trim', 0x667782, along, .40, -1.048, .064, .615, .067);
      }
    }
    for (const side of [-1, 1]) {
      const edge = side * (length / 2 - .22);
      const railLength = length / 2 - 1.12;
      deck('trim', 0x677786, side * (.87 + railLength / 2), .703, -1.054, railLength, .057, .068);
      deck('pole', 0x5f7480, edge, .395, .79, .111, .562, .111);
      deck('pole', 0x27323e, edge, .654, .79, .205, .089, .205);
      deck('light', color, edge, .716, .79, .153, .051, .152);
      deck('trim', 0x1c2737, edge, .20, -.67, .34, .114, .22);
      deck('pole', 0xaf9a73, edge, .275, -.67, .14, .13, .14);
    }
    // The fixed gangway slopes from the quay to the floating deck.
    mount(shore, 'trim', 0x505e6a, 0, .163, -2.59, 1.42, .087, 3.38, .028);
    for (const side of [-1, 1]) {
      mount(shore, 'trim', 0x637784, side * .685, .435, -2.55, .063, .058, 3.30, .028);
      for (const z of [-1.12, -2.2, -3.14, -4.04]) mount(shore, 'trim', 0x546375, side * .673, .31, z, .062, .286, .07);
    }
    for (let rung = 0; rung < 13; rung++) {
      mount(shore, 'trim', 0x758189, 0, .199 - .007 * rung, -3.94 + rung * .22, 1.30, .021, .038);
    }
    for (const [along, depth] of [[-length * .31, -.56], [length * .35, -.61]]) {
      deck('deck', 0x645445, along, .317, depth, .78, .36, .51);
      for (const side of [-1, 1]) deck('trim', 0x9a876c, along + side * .24, .50, depth, .048, .034, .53);
      deck('deck', 0x4b655a, along - .14, .57, depth, .37, .18, .32);
    }
    if (index === 1 || index === 2 || index === 4) {
      const craneX = length * .38;
      deck('pole', 0x9b7650, craneX, .737, -.39, .130, 1.25, .130);
      deck('trim', 0x92704e, craneX, 1.39, .11, .118, .132, 1.16, -.17);
      deck('pole', 0x4a5158, craneX, 1.016, .69, .025, .52, .025);
      deck('trim', 0xab926f, craneX, .733, .69, .11, .055, .095);
    }
    character(new THREE.Matrix4(), index % 2 ? 0x6c8a91 : 0xa0785e, pose, -length * .22, .14, .47, 0, 'fish', index * 1.41);
    if (index < 3) character(new THREE.Matrix4(), index % 2 ? 0x997a5a : 0x5f9588,
      pose, length * .24, .14, -.31, -.59, 'check', index * 1.07);
  }

  for (const [index, lane] of serviceLanes.entries()) {
    const pose = new THREE.Matrix4();
    const wash = new THREE.Matrix4();
    const hull = (key, ...args) => mount(pose, key, ...args);
    boats.push({ ...lane, pose, wash });
    hull('float', lane.paint, 0, -.211, 0, 1, 1, 1);
    hull('deck', 0xb2a497, 0, .054, -.335, 1.265, .077, 1.95);
    hull('deck', 0x3b4c56, 0, .086, -.33, 1.006, .043, 1.61);
    hull('trim', 0x4d5e66, 0, .213, .31, .741, .342, .21);
    hull('trim', 0x87bac7, 0, .420, .37, .714, .279, .031, -.25);
    hull('trim', 0x38454e, 0, .262, -1.41, .292, .336, .334);
    hull('light', 0xffe6ac, 0, .274, 1.11, .16, .088, .078);
    hull('light', 0xffa86f, 0, .221, -1.42, .099, .075, .038);
    for (const side of [-1, 1]) {
      hull('trim', 0xa7aaa4, side * .696, .113, -.031, .063, .067, 2.49);
      hull('light', side < 0 ? 0xe86765 : 0x7ee79e, side * .641, .253, .30, .084, .088, .109);
      for (const z of [-1.09, -.61, .86]) hull('pole', 0x676a65, side * .53, .16, z, .085, .19, .085);
    }
    character(new THREE.Matrix4(), index % 2 ? 0x946f64 : 0x8a956b, pose, 0, .111, -.245, 0, 'pilot', index * .92);
    mount(wash, 'wash', 0xffffff, 0, 0, -2.94, 2.4, 3.33, 1, -Math.PI / 2);
  }

  for (const [key, batch] of Object.entries(batches)) {
    const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.parts.length);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.receiveShadow = key !== 'light' && key !== 'wash';
    if (key !== 'wash') batch.parts.forEach(({ color }, index) => mesh.setColorAt(index, colored.setHex(color)));
    batch.mesh = mesh;
    group.add(mesh);
  }

  let lastTime = -1;
  function update(elapsed) {
    const t = reducedMotion?.matches ? 0 : elapsed;
    if (t === lastTime) return;
    lastTime = t;
    time.value = t;
    pontoons.forEach(({ pose, x, z, yaw }, index) => {
      actor.position.set(x, .027 * Math.sin(t * 1.3 + index * 2.04), z);
      actor.rotation.set(.0033 * Math.sin(t * 1.7 + index), yaw, .005 * Math.cos(t * 1.4 + index), 'YXZ');
      actor.updateMatrix();
      pose.copy(actor.matrix);
    });
    for (const { pose, wash, x, z, rx, rz, period, offset } of boats) {
      const phase = t * Math.PI * 2 / period + offset;
      const bx = x + Math.cos(phase) * rx;
      const bz = z + Math.sin(phase) * rz;
      const yaw = Math.atan2(-Math.sin(phase) * rx, Math.cos(phase) * rz);
      actor.position.set(bx, .026 * Math.sin(t * 1.89 + offset), bz);
      actor.rotation.set(.017 * Math.cos(t * 1.76 + offset), yaw, .023 * Math.sin(t * 1.37 + offset), 'YXZ');
      actor.updateMatrix();
      pose.copy(actor.matrix);
      wash.makeRotationY(yaw).setPosition(bx, tideLevel + .015, bz);
    }
    for (const { pose, owner, x, y, z, facing, activity, wave } of crews) {
      const cycle = t * (activity === 'check' ? .86 : 1.39) + wave;
      actor.position.set(x + (activity === 'check' ? .39 * Math.sin(cycle) : 0), y, z);
      actor.rotation.set(.045 * Math.sin(cycle), facing + .15 * Math.cos(cycle), .038 * Math.cos(cycle), 'YXZ');
      actor.updateMatrix();
      pose.multiplyMatrices(owner, actor.matrix);
    }
    for (const { mesh, parts } of Object.values(batches)) {
      parts.forEach(({ pose, matrix }, i) => mesh.setMatrixAt(i, composed.multiplyMatrices(pose, matrix)));
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
  update(0);
  return update;
}
