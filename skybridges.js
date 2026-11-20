import * as THREE from './vendor/three.module.js';

const box = new THREE.BoxGeometry();
const signPlane = new THREE.PlaneGeometry();
const signs = new Map();

// All details stay inside the walkway's physical envelope.
const steel = new THREE.MeshStandardMaterial({ metalness: .55, roughness: .48 });
const glass = new THREE.MeshStandardMaterial({
  color: 0xffffff, emissive: 0x63391f, emissiveIntensity: .44, roughness: .24, metalness: .14,
  transparent: true, opacity: .37, depthWrite: false,
});
const glow = new THREE.MeshBasicMaterial({ toneMapped: false });

function nameplate({ name, tint }) {
  if (signs.has(name)) return signs.get(name);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const color = new THREE.Color(tint).getStyle();
  ctx.fillStyle = '#11141e';
  ctx.fillRect(0, 0, 512, 64);
  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.strokeRect(5, 7, 502, 50);
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillStyle = '#fbf1dc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.toUpperCase(), 256, 33, 441);
  for (const x of [22, 490]) {
    ctx.fillStyle = color;
    ctx.fillRect(x - 2, 28, 4, 8);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const plate = new THREE.MeshBasicMaterial({ map, toneMapped: false });
  signs.set(name, plate);
  return plate;
}

export function addSkybridges(parent, bridges) {
  const group = new THREE.Group();
  group.name = 'Elevated pedestrian walkways';
  const batches = new Map([[steel, []], [glass, []], [glow, []]]);
  const shape = new THREE.Object3D();
  const tint = new THREE.Color();

  bridges.forEach((bridge, index) => {
    const { x, z, w, d, h, bottom, axis } = bridge;
    const north = axis === 'z';
    const length = north ? d : w;
    const width = north ? w : d;
    const height = h - bottom;
    const world = new THREE.Matrix4().makeRotationY(north ? -Math.PI / 2 : 0);
    world.setPosition(x, bottom, z);
    const body = [0x3f3b43, 0x34364b, 0x3e4f54][index];
    const frame = [0x9f7361, 0x707a9b, 0x648d96][index];
    const glassColors = [
      [0x85614b, 0xb0774d, 0xb4a095],
      [0x7884a6, 0x8f759e, 0xc09366],
      [0x5a7d80, 0x71a7a9, 0xdbaf65],
    ][index];
    const segments = Math.ceil(length / (index === 1 ? 1.74 : 1.55));
    const span = length / segments;
    const innerEdge = width / 2 - .075;

    function mount(material, color, px, py, pz, sx, sy, sz, rotation = 0) {
      shape.position.set(px, py, pz);
      shape.rotation.set(0, 0, rotation);
      shape.scale.set(sx, sy, sz);
      shape.updateMatrix();
      batches.get(material).push({
        color,
        matrix: new THREE.Matrix4().multiplyMatrices(world, shape.matrix),
      });
    }

    mount(steel, body, 0, .093, 0, length, .186, width);
    mount(steel, body, 0, height - .091, 0, length, .182, width);
    for (const side of [-1, 1]) {
      const outside = innerEdge * side;
      const paneEdge = (innerEdge - .071) * side;
      mount(steel, frame, 0, .22, outside, length, .105, .15);
      mount(steel, frame, 0, height - .23, outside, length, .095, .15);
      mount(steel, body, 0, .57, outside, length - .14, .067, .12);
      mount(glow, bridge.tint, 0, .142, outside + side * .047, length - .26, .031, .036);
      mount(glow, 0xffbd8b, 0, height - .204, width * side * .228, length - .62, .04, .055);

      for (let bay = 0; bay < segments; bay++) {
        const center = (bay + .5) * span - length / 2;
        const pane = glassColors[(bay * 7 + index) % glassColors.length];
        mount(glass, pane, center, height / 2 + .07, paneEdge, span - .103, height - .62, .046);
        mount(steel, frame, center - span / 2 + .057, height / 2, outside, .107, height - .29, .139);
        if (bay === segments - 1) {
          mount(steel, frame, length / 2 - .057, height / 2, outside, .107, height - .29, .139);
        }

        const change = (bay % 2 ? -1 : 1) * (side === 1 ? 1 : -1);
        if (index === 1 || (bay + index) % 3 !== 1) {
          const rise = height - .58;
          const run = (span - .095) * change;
          mount(steel, frame, center, .3 + rise / 2, outside, Math.hypot(run, rise), .064, .105, Math.atan2(rise, run));
        }
        if (bay % 2 === 0) {
          mount(steel, body, center, height - .194, 0, .082, .11, width - .13);
          mount(steel, body, center, .153, 0, .103, .09, width - .15);
        }
      }

      if (index === 1 || side > 0) {
        const plate = new THREE.Mesh(signPlane, nameplate(bridge));
        plate.position.set(0, height - .34, side * (width / 2 - .001));
        plate.rotation.y = side > 0 ? 0 : Math.PI;
        plate.scale.set(Math.min(length * .32, 5.65), .48, 1);
        const frameGroup = new THREE.Group();
        frameGroup.position.set(x, bottom, z);
        frameGroup.rotation.y = north ? -Math.PI / 2 : 0;
        frameGroup.add(plate);
        group.add(frameGroup);
      }
    }

    for (const end of [-1, 1]) {
      mount(steel, body, end * (length / 2 - .095), height / 2, 0, .19, height - .14, width - .10);
      mount(steel, frame, end * (length / 2 - .237), height / 2, 0, .11, height - .12, width);
      mount(glow, bridge.tint, end * (length / 2 - .31), .443, 0, .043, .043, width - .18);
    }
  });

  for (const [material, items] of batches) {
    if (!items.length) continue;
    const instances = new THREE.InstancedMesh(box, material, items.length);
    instances.castShadow = material === steel;
    instances.receiveShadow = material === steel;
    items.forEach(({ color, matrix }, index) => {
      instances.setMatrixAt(index, matrix);
      instances.setColorAt(index, tint.setHex(color));
    });
    instances.instanceMatrix.needsUpdate = true;
    instances.instanceColor.needsUpdate = true;
    group.add(instances);
  }
  parent.add(group);
  return group;
}
