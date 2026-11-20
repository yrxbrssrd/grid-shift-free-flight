import * as THREE from './vendor/three.module.js';
import { outerWalkingMap } from './outer-city.js';
import { furnishDistrictStreets } from './district-streets.js';

const amber = 0xffa764;
const seafoam = 0x64e4d2;
const orchid = 0xe98aeb;
const iron = 0x253143;
const rubber = 0x151926;
const galvanized = 0x667582;
const pavement = 0x565c67;
const copper = 0x89564e;
const glass = 0x2c5b75;
const ground = .231;

const districts = [
  { at: [-15, 17], side: 1, offset: -2.02, type: 'food', light: amber, display: 0 },
  { at: [18, 17], side: -1, offset: -.52, type: 'venue', light: orchid, display: 1 },
  { at: [-14, -9], side: 1, offset: .14, type: 'food', light: seafoam, display: 2 },
  { at: [12, -8], side: -1, offset: -.06, type: 'venue', light: 0xc4e57e, display: 1 },
  { at: [-26, 5], side: 1, offset: -.48, type: 'logistics', light: amber, display: 3 },
  { at: [-39, 8], side: -1, offset: -1.61, type: 'logistics', light: amber, display: 3 },
  { at: [29, 7], side: -1, offset: .89, type: 'food', light: orchid, display: 2 },
  { at: [38, -9], side: -1, offset: .24, type: 'venue', light: orchid, display: 1 },
  { at: [-43, -12], side: 1, offset: 1.3, type: 'logistics', light: amber, display: 3 },
  { at: [45, -28], side: -1, offset: -.95, type: 'logistics', light: seafoam, display: 3 },
];

const displayRows = [
  { title: 'EMBER', label: 'LATE KITCHEN', line: 'BROTH / RICE / TEA', color: '#ffa570' },
  { title: 'ENTRY', label: 'ADMISSIONS', line: 'OPEN AFTER DARK', color: '#f3a8fa' },
  { title: 'LUMEN', label: 'NIGHT MARKET', line: 'HOT FOOD / COLD TEA', color: '#8beddf' },
  { title: 'CARGO', label: 'PORT SERVICE', line: 'DOCK ROUTING / OPEN', color: '#ffd184' },
];

const shops = [
  { at: [-15, 17], face: 1, style: 0, offset: -.08, lit: true },
  { at: [-15, 17], face: 0, style: 0, offset: .14 },
  { at: [18, 17], face: -1, style: 1, offset: .05, lit: true },
  { at: [18, 17], face: 0, style: 1, offset: -.15 },
  { at: [-14, -9], face: 0, style: 2, offset: .02, lit: true },
  { at: [-14, -9], face: 1, style: 2, offset: .04 },
  { at: [12, -8], face: -1, style: 3, offset: .05 },
  { at: [-26, 5], face: 1, type: 'loading', offset: -.08 },
  { at: [-39, 8], face: 0, type: 'loading', offset: .10 },
  { at: [29, 7], face: -1, style: 0, offset: -.12 },
  { at: [38, -9], face: -1, style: 1, offset: .17 },
  { at: [-43, -12], face: 1, type: 'loading', offset: -.12 },
  { at: [45, -28], face: 0, style: 3, offset: .03 },
  { at: [-13, -25], face: 0, type: 'loading', offset: 0 },
  { at: [3, -24], face: 0, style: 3, offset: .10 },
];

const interiors = [
  { label: 'EMBER / LATE KITCHEN', wall: '#5d3027', shade: '#1d1a22', metal: '#805142', light: '#ffd08a', fill: '#ab7661', trim: 0x92513e, lamp: 0xffb478 },
  { label: 'HALO / ADMISSIONS', wall: '#4d2d52', shade: '#171b29', metal: '#754d76', light: '#faafd8', fill: '#986582', trim: 0x644369, lamp: 0xf0a4e2 },
  { label: 'LUMEN / PROVISIONS', wall: '#345653', shade: '#17292f', metal: '#468576', light: '#b2efcc', fill: '#8ba281', trim: 0x436b62, lamp: 0xa5e6bb },
  { label: 'SIGNAL REPAIR / OPEN', wall: '#3c4c71', shade: '#171c32', metal: '#526583', light: '#bfd4ff', fill: '#848ca3', trim: 0x4d6077, lamp: 0xb8deff },
];

function makeShopAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  interiors.forEach(({ label, wall, shade, metal, light, fill }, row) => {
    const y = row * 128;
    const glow = ctx.createLinearGradient(0, y + 24, 0, y + 118);
    glow.addColorStop(0, wall);
    glow.addColorStop(.53, shade);
    glow.addColorStop(1, '#141722');
    ctx.fillStyle = shade;
    ctx.fillRect(0, y, 512, 128);
    ctx.fillStyle = glow;
    ctx.fillRect(8, y + 22, 496, 95);
    ctx.strokeStyle = '#07091058';
    ctx.lineWidth = 1;
    for (let y2 = 36; y2 < 116; y2 += 13) {
      ctx.beginPath();
      ctx.moveTo(8, y + y2);
      ctx.lineTo(504, y + y2);
      ctx.stroke();
      for (let x = 15 + (y2 % 2) * 11; x < 508; x += 24) {
        ctx.beginPath();
        ctx.moveTo(x, y + y2 - 13);
        ctx.lineTo(x, y + y2);
        ctx.stroke();
      }
    }
    for (const x of [42, 263, 397]) {
      const bulb = ctx.createRadialGradient(x + 25, y + 36, 0, x + 25, y + 36, 92);
      bulb.addColorStop(0, `${light}88`);
      bulb.addColorStop(.38, `${light}26`);
      bulb.addColorStop(1, `${light}00`);
      ctx.fillStyle = bulb;
      ctx.fillRect(x - 42, y + 20, Math.min(156, 547 - x), 90);
      ctx.fillStyle = metal;
      ctx.fillRect(x + 1, y + 28, 49, 5);
      ctx.fillStyle = light;
      ctx.fillRect(x + 3, y + 33, 44, 3);
    }

    for (const start of [24, 184, 350]) {
      ctx.fillStyle = shade;
      ctx.fillRect(start, y + 61, 126, 52);
      for (let shelf = 0; shelf < 2; shelf++) {
        ctx.fillStyle = metal;
        ctx.fillRect(start - 2, y + 81 + 18 * shelf, 130, 3);
        for (let i = 0; i < 7; i++) {
          const height = 5 + (i * 7 + start + row) % 10;
          const x = start + 4 + i * 17;
          const top = y + 80 + 18 * shelf - height;
          ctx.fillStyle = i % 3 === 0 ? fill : metal;
          ctx.fillRect(x, top, 9 + (i + row) % 5, height);
          ctx.fillStyle = `${light}8c`;
          ctx.fillRect(x, top, 9 + (i + row) % 5, 1.5);
        }
      }
    }
    ctx.fillStyle = metal;
    ctx.fillRect(12, y + 104, 488, 3);
    ctx.fillStyle = '#192028';
    ctx.fillRect(11, y + 108, 489, 10);
    ctx.font = 'bold 12px monospace';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = light;
    ctx.fillText(label, 20, y + 13);
    ctx.fillRect(445, y + 12, 43, 2);
    ctx.fillStyle = '#b9d3f91b';
    ctx.beginPath();
    ctx.moveTo(90, y + 24);
    ctx.lineTo(201, y + 24);
    ctx.lineTo(113, y + 115);
    ctx.lineTo(56, y + 115);
    ctx.closePath();
    ctx.fill();
  });
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  return atlas;
}

function makeDisplayAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  displayRows.forEach(({ title, label, line, color }, row) => {
    const y = row * 128;
    ctx.fillStyle = '#111926';
    ctx.fillRect(0, y, 256, 128);
    ctx.fillStyle = color;
    ctx.fillRect(14, y + 15, 3, 99);
    ctx.fillRect(27, y + 93, 201, 2);
    ctx.font = '700 36px sans-serif';
    ctx.fillText(title, 26, y + 58);
    ctx.font = '700 13px monospace';
    ctx.fillText(label, 29, y + 82);
    ctx.font = '600 11px monospace';
    ctx.fillStyle = '#dce9e7';
    ctx.fillText(line, 29, y + 110);
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i === 1 ? color : '#5d606f';
      ctx.fillRect(209 + i * 9, y + 21, 4, 4);
    }
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

const innerWalks = [
  [-7.23, 8.5, -7.23, 20.2], [9.10, 10.65, 9.10, 20.3], [-7.48, -10.6, -7.48, 3.0], [7.23, -9.85, 7.23, 1.9],
  [-40.9, -11.35, -19.0, -11.35], [-37.9, -21.15, -7.4, -21.15], [15.1, -21.8, 38.1, -21.8],
  [-50.25, -22.0, -50.25, 26.5], [-47.2, 39.65, -7.4, 39.65], [7.5, 39.35, 46.4, 39.35],
  [51.9, -15.3, 51.9, 32.4], [-34.4, -40.5, -11.0, -40.5], [5.7, -40.8, 48.0, -40.8], [-5.22, 29.2, -5.22, 39.6],
];
const outerPromenades = [
  [91, -42.1, 130.5, -42.1], [137.1, -22, 137.1, 53], [137.3, 69, 137.3, 111.5],
  [70.1, 92.1, 70.1, 129.8], [-41, 129.85, -16.0, 129.85], [-6.5, 134.25, 35.1, 134.25],
  [39.5, 132.85, 88.6, 132.85], [95.5, 127.1, 123.7, 127.1],
];
const coatColors = [0xe6ae68, 0x647b92, 0xa76c82, 0x8d7cba, 0x81b1a4, 0xad604f, 0x78949b, 0xa7ab84, 0xb48e45];
const umbrellaColors = [0x74445f, 0x32566d, 0xaa7e46, 0x60658c, 0x345d59, 0x60474d];

function onQuay(x, z, coast) {
  let inland = false;
  for (let i = 0, j = coast.length - 1; i < coast.length; j = i++) {
    const [ax, az] = coast[i], [bx, bz] = coast[j];
    if ((az > z) !== (bz > z) && x < ax + (bx - ax) * (z - az) / (bz - az)) inland = !inland;
  }
  return inland;
}

function walkerFraction(seed) {
  const value = Math.sin(seed * 28.314 + 3.71) * 25973.572;
  return value - Math.floor(value);
}

function planFootpaths(buildings, furniture) {
  const { coast, arterials, serviceLanes, plazas } = outerWalkingMap;
  const buckets = new Map();
  const key = (x, z) => `${Math.floor(x / 8)},${Math.floor(z / 8)}`;
  function avoid(x, z, halfWidth, halfDepth) {
    const bounds = [x - halfWidth, z - halfDepth, x + halfWidth, z + halfDepth];
    for (let gx = Math.floor(bounds[0] / 8); gx <= Math.floor(bounds[2] / 8); gx++) {
      for (let gz = Math.floor(bounds[1] / 8); gz <= Math.floor(bounds[3] / 8); gz++) {
        const cell = `${gx},${gz}`;
        if (!buckets.has(cell)) buckets.set(cell, []);
        buckets.get(cell).push(bounds);
      }
    }
  }
  const buffer = .55;
  for (const building of buildings) {
    for (const block of building.levels ?? [{ ...building, bottom: 0 }]) {
      if (block.bottom < 1.9) avoid(block.x, block.z, block.w / 2 + buffer, block.d / 2 + buffer);
    }
  }
  for (const { x, y, z, w, h, d, yaw } of furniture) {
    if (y + h / 2 < .38 || y - h / 2 > 1.99) continue;
    const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
    avoid(x, z, (w * c + d * s) / 2 + .33, (w * s + d * c) / 2 + .33);
  }
  for (const [x, z, w, d] of [[0, -3, 8.5, 108], [0, -3.5, 12.4, 17], [0, -16, 112, 7.6],
    [0, 45, 100, 5.8], [-32.05, 13.1, 2.9, 62.5], [49.65, 13.1, 2.9, 62.5], [48, 12, 23.3, 4.3], [-10, 47, 4.7, 14.5]]) {
    avoid(x, z, w / 2 + .18, d / 2 + .18);
  }
  for (const [ax, az, bx, bz, width] of [...arterials, ...serviceLanes]) {
    const vertical = ax === bx;
    avoid((ax + bx) / 2, (az + bz) / 2, (vertical ? width : bx - ax) / 2 + .20, (vertical ? bz - az : width) / 2 + .20);
  }
  const pads = [...[[-28, -22], [0, -4], [28, -26]].map(([x, z]) => ({ x, z, radius: 4.13 })),
    ...plazas.map(({ x, z }) => ({ x, z, radius: z > 90 ? 5.62 : 5.19 }))];

  const routes = [];
  function trace([x, z, targetX, targetZ], y, spacing, supportedWalkway = false) {
    const length = Math.hypot(targetX - x, targetZ - z);
    const dx = (targetX - x) / length, dz = (targetZ - z) / length;
    const steps = Math.ceil(length / .33);
    let started = -1;
    for (let i = 0; i <= steps; i++) {
      const progress = i * length / steps;
      const px = x + dx * progress, pz = z + dz * progress;
      const landed = supportedWalkway || (onQuay(px + .43, pz, coast) && onQuay(px - .43, pz, coast) &&
        onQuay(px, pz + .43, coast) && onQuay(px, pz - .43, coast));
      const safe = landed &&
        !buckets.get(key(px, pz))?.some(([a, b, c, d]) => px > a && px < c && pz > b && pz < d) &&
        !pads.some(pad => (px - pad.x) ** 2 + (pz - pad.z) ** 2 < pad.radius ** 2);
      if (safe && started < 0) started = progress;
      if ((safe && i !== steps) || started < 0) continue;
      const end = safe ? progress : progress - length / steps;
      if (end - started >= 3.65) routes.push({ x: x + dx * (started + .16), z: z + dz * (started + .16),
        dx, dz, y, length: end - started - .32, spacing });
      started = -1;
    }
  }

  for (const line of innerWalks) trace(line, .239, 8.9, true);
  arterials.forEach(([ax, az, bx, bz, width], index) => {
    const vertical = ax === bx;
    for (const side of [-1, 1]) {
      const shoulder = side * (width / 2 + .55);
      const line = vertical ? [ax + shoulder, az + 1.2, bx + shoulder, bz - 1.1] : [ax + 1.2, az + shoulder, bx - 1.1, bz + shoulder];
      trace(line, .249, index === 0 ? 14.5 : 12.8, index === 0 || index === 2);
    }
  });
  for (const { x, z } of plazas) {
    for (const side of [-1, 1]) trace([x - 5.55, z + side * 5.58, x + 5.55, z + side * 5.58], .249, 6.3);
  }
  for (const line of outerPromenades) trace(line, .2395, 11.6);
  const frontages = buildings.filter(({ x, z }) => x > 70 || z > 69);
  frontages.forEach(({ x, z, w, d }, index) => {
    if (index % 3 !== 1) return;
    const edge = z + d / 2 + 1.62;
    trace([x - w * .39, edge, x + w * .39, edge], .24, 9.9);
  });

  return routes.flatMap((route, path) => {
    const count = Math.max(1, Math.round(route.length / route.spacing));
    return Array.from({ length: count }, (_, index) => {
      const seed = path * 11 + index * 61;
      const pick = (items, salt) => items[Math.floor(walkerFraction(seed + salt) * items.length)];
      const speed = .64 + walkerFraction(seed + 1) * .55;
      return { route, speed, pause: .54 + walkerFraction(seed + 2) ** 2 * 2.8,
        offset: (index + walkerFraction(seed + 3)) * route.length / (count * speed) + path * .38,
        lane: count === 1 ? 0 : (index % 2 ? .14 : -.14),
        scale: 1.33 + walkerFraction(seed + 4) * .33, cadence: 1.27 + walkerFraction(seed + 5) * .38,
        coat: pick(coatColors, 6), umbrella: walkerFraction(seed + 7) < .43 ? pick(umbrellaColors, 8) : 0,
        skin: pick([0xc9977c, 0x976d57, 0xb08369, 0xd1a993], 9),
        legwear: pick([0x3e4658, 0x514353, 0x374e56, 0x2f4447], 10) };
    });
  });
}

function addPedestrians(group, buildings, furniture) {
  const people = planFootpaths(buildings, furniture);
  const shade = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .76 });
  const shadow = new THREE.MeshBasicMaterial({ color: 0x111520, transparent: true, opacity: .22, depthWrite: false });
  const canopyProfile = [[.50, -.042], [.478, -.009], [.38, .048], [.27, .099], [.095, .134], [0, .14]];
  function model(name, geometry, capacity, material = shade) {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
    return { mesh, next: 0 };
  }
  const limbs = model('Walking figures', new THREE.CylinderGeometry(.51, .49, 1, 7), people.length * 16);
  const faces = model('Faces, hoods and hands', new THREE.SphereGeometry(.5, 8, 6), people.length * 4);
  const bags = model('Shoes and messenger bags', new THREE.BoxGeometry(), people.length * 3);
  const umbrellas = model('Rain umbrellas', new THREE.LatheGeometry(canopyProfile.map(([x, y]) => new THREE.Vector2(x, y)), 8), people.length);
  const shadows = model('Pedestrian contact shadows', new THREE.CircleGeometry(.5, 12), people.length, shadow);
  const meshes = [limbs, faces, bags, umbrellas, shadows];
  const motion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const up = new THREE.Vector3(0, 1, 0);
  const vector = new THREE.Vector3();
  const personYaw = new THREE.Quaternion();
  const turn = new THREE.Quaternion();
  const tint = new THREE.Color();
  const pose = new THREE.Object3D();
  let initialized = false;
  let previousTime;
  let lastX = Infinity, lastZ = Infinity;

  function add(batch, color) {
    pose.updateMatrix();
    const index = batch.next++;
    batch.mesh.setMatrixAt(index, pose.matrix);
    if (batch !== shadows) batch.mesh.setColorAt(index, tint.set(color));
  }

  function draw(person, clock, focus) {
    const { route, pause, cadence } = person;
    const walking = route.length / person.speed;
    const half = walking + pause;
    const cycle = (clock + person.offset) % (half * 2);
    const back = cycle >= half;
    const legTime = cycle % half;
    const easing = THREE.MathUtils.smoothstep(legTime, walking, half);
    const heading = Math.atan2(route.dx, route.dz) + (Number(back) + easing) * Math.PI;
    const moving = 1 - THREE.MathUtils.smoothstep(legTime, walking - .18, walking);
    const weight = moving * THREE.MathUtils.smoothstep(legTime, 0, .22);
    const walk = (legTime * cadence) % 1;
    const progress = Math.min(legTime, walking) * person.speed;
    const along = back ? route.length - progress : progress;
    const x = route.x + route.dx * along + route.dz * person.lane;
    const z = route.z + route.dz * along - route.dx * person.lane;
    if (focus && (x - focus.x) ** 2 + (z - focus.z) ** 2 > 82 ** 2) return;
    const c = Math.cos(heading);
    const s = Math.sin(heading);
    const scale = person.scale;
    const stride = person.speed * .6 / (cadence * scale);
    const bodyBob = .014 * Math.sin(walk * Math.PI * 4) * weight;
    personYaw.setFromAxisAngle(up, heading);

    function at(across, y, toward) {
      pose.position.set(x + scale * (c * across + s * toward), route.y + scale * y, z + scale * (c * toward - s * across));
    }

    function shape(batch, color, x, y, toward, w, h, d, pitch = 0) {
      at(x, y, toward);
      pose.rotation.set(pitch, heading, 0, 'YXZ');
      pose.scale.set(w * scale, h * scale, d * scale);
      add(batch, color);
    }

    function bone(color, x, y, toward, x2, y2, toward2, w, depth = w) {
      vector.set(x2 - x, y2 - y, toward2 - toward);
      const length = vector.length();
      vector.multiplyScalar(1 / length);
      turn.setFromUnitVectors(up, vector);
      at((x + x2) / 2, (y + y2) / 2, (toward + toward2) / 2);
      pose.quaternion.copy(personYaw).multiply(turn);
      pose.scale.set(w * scale, length * scale * 1.085, depth * scale);
      add(limbs, color);
    }

    shape(shadows, 0, 0, .012, .035, .38, .62, 1, -Math.PI / 2);
    shape(limbs, person.legwear, 0, .503 + bodyBob, 0, .164, .112, .125);
    shape(limbs, person.coat, 0, .66 + bodyBob, .014, .217, .266, .139);
    shape(limbs, 0x303745, 0, .81 + bodyBob, .024, .072, .085, .069);
    shape(faces, person.coat, 0, .896 + bodyBob, .015, .139, .159, .129);
    shape(faces, person.skin, 0, .886 + bodyBob, .056, .083, .103, .056);
    shape(bags, 0x353541, -.107, .556 + bodyBob, -.041, .132, .154, .079, .12);

    for (const side of [-1, 1]) {
      const phase = (walk + (side + 1) * .25) % 1;
      const planted = phase < .6;
      const glide = planted ? phase / .6 : (phase - .6) / .4;
      const foot = (planted ? .5 - glide : glide - .5) * stride * weight;
      const lift = planted ? 0 : Math.sin(glide * Math.PI) * .085 * weight;
      const knee = .025 + foot * .5 + lift * .59;
      const kneeY = .262 + lift * .55;
      const hip = side * .052;
      const footX = side * .061;
      bone(person.legwear, hip, .494 + bodyBob, 0, footX, kneeY, knee, .067, .077);
      bone(person.legwear, footX, kneeY, knee, footX, .066 + lift, foot, .056, .06);
      shape(bags, rubber, footX, .035 + lift, foot + .025, .072, .069, .136);

      const hold = person.umbrella && side === 1;
      const armSwing = -foot * .65;
      const elbow = hold ? .093 : armSwing * .47;
      const hand = hold ? .147 : .024 + armSwing;
      const handY = hold ? .764 : .471;
      bone(person.coat, side * .103, .755 + bodyBob, .014, side * .139, .604 + bodyBob, elbow, .062);
      bone(person.coat, side * .139, .604 + bodyBob, elbow, side * .151, handY + bodyBob, hand, .054);
      shape(faces, person.skin, side * .151, handY + bodyBob, hand, .042, .064, .049);
    }

    if (person.umbrella) {
      const top = .992 + bodyBob;
      bone(galvanized, .151, .757 + bodyBob, .147, .136, top, .095, .014);
      shape(umbrellas, person.umbrella, .136, top, .095, .636, .58, .636, -.062);
    }
  }

  function update(elapsed, focus) {
    const time = motion?.matches ? 0 : elapsed;
    const moved = focus && Math.hypot(focus.x - lastX, focus.z - lastZ) > 2.5;
    if (initialized && time >= previousTime && time - previousTime < 1 / 30 && !moved) return;
    previousTime = time;
    if (focus) { lastX = focus.x; lastZ = focus.z; }
    meshes.forEach(batch => { batch.next = 0; });
    people.forEach(person => draw(person, time, focus));
    meshes.forEach(({ mesh, next }) => {
      mesh.count = next;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        if (!initialized) mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        mesh.instanceColor.needsUpdate = true;
      }
    });
    initialized = true;
  }

  update(0);
  return update;
}

export function addCyberStreets(parent, buildings) {
  const group = new THREE.Group();
  group.name = 'Street markets and loading bays';
  parent.add(group);

  const boxes = [];
  const lights = [];
  const rounds = [];
  const foliage = [];
  const screens = [];
  const shopWindows = [];
  const fabric = [];
  const shopLights = [];
  const pose = new THREE.Object3D();
  pose.rotation.order = 'YXZ';
  const tint = new THREE.Color();

  function station(x, z, face, light) {
    const c = Math.cos(face);
    const s = Math.sin(face);
    function place(batch, across, y, toward, w, h, d, color, yaw = 0, pitch = 0, roll = 0) {
      batch.push({ x: x + c * across + s * toward, y: ground + y, z: z - s * across + c * toward,
        w, h, d, color, yaw: face + yaw, pitch, roll });
    }
    return {
      box: (...args) => place(boxes, ...args),
      light: (across, y, toward, w, h, d, color = light, ...rotation) => place(lights, across, y, toward, w, h, d, color, ...rotation),
      round: (...args) => place(rounds, ...args),
      plant: (...args) => place(foliage, ...args),
      screen: (...args) => place(screens, ...args),
      interior: (...args) => place(shopWindows, ...args),
      cloth: (...args) => place(fabric, ...args),
    };
  }

  function paving(shop, width, depth) {
    shop.box(0, .025, 0, width, .05, depth, 0x3e4a55);
    shop.box(0, .045, depth / 2 - .06, width, .075, .12, pavement);
    for (let line = -.35; line <= .4; line += .25) {
      shop.box(line * width, .052, 0, .018, .008, depth * .91, rubber);
    }
  }

  function bollard(shop, across, toward) {
    shop.round(across, .034, toward, .28, .068, .28, rubber);
    shop.round(across, .292, toward, .15, .54, .15, iron);
    shop.light(across, .497, toward, .155, .042, .154);
    shop.round(across, .572, toward, .17, .09, .17, galvanized);
  }

  function planter(shop, x, z, variant) {
    shop.box(x, .036, z, .74, .072, .50, rubber);
    shop.box(x, .178, z, .69, .286, .46, 0x4d5466);
    shop.box(x, .329, z, .73, .058, .49, iron);
    for (let shoot = -2; shoot <= 2; shoot++) {
      const size = .16 + .03 * ((shoot + variant + 6) % 4);
      shop.plant(x + shoot * .119, .38 + size * .32, z + Math.sin(shoot + variant) * .08,
        .14, size, .15, (shoot + variant) % 3 === 0 ? 0x547964 : 0x2a5e59, 0, -.25 + shoot * .19, .23 * shoot);
    }
  }

  function bench(shop, x, z) {
    for (const leg of [-1, 1]) {
      shop.box(x + leg * .44, .13, z, .13, .26, .35, iron);
      shop.box(x + leg * .46, .21, z - .21, .079, .41, .08, galvanized);
    }
    for (const slat of [-1, 0, 1]) {
      shop.box(x, .283, z + slat * .13, 1.17, .065, .113, 0x846c64);
      shop.box(x, .336 + (slat + 1) * .087, z - .22, 1.16, .059, .067, 0x846c64);
    }
  }

  function counter(shop, display, venue) {
    const width = venue ? 1.62 : 2.23;
    const painted = venue ? 0x604d70 : 0x6f554f;
    shop.box(0, .12, -.24, width, .18, .75, rubber);
    shop.box(0, .44, -.24, width - .13, .49, .71, iron);
    shop.box(0, .454, .127, width - .23, .4, .06, painted);
    for (let edge = -.45; edge < .46; edge += .125) {
      shop.box(edge * width, .451, .169, .032, .35, .034, galvanized);
    }
    shop.box(0, .704, -.236, width + .056, .081, .86, galvanized);
    shop.light(0, .655, .177, width - .13, .043, .046);
    shop.box(0, .858, -.37, width - .23, .265, .31, iron, 0, -.11);
    shop.screen(0, .863, -.196, width - .31, .215, 1, display, 0, -.11);
    shop.box(-width * .34, .772, .052, .28, .056, .155, rubber);
    shop.box(width * .36, .766, -.007, .14, .048, .14, galvanized);
    if (!venue) {
      for (let i = 0; i < 3; i++) {
        shop.round(.21 + .16 * i, .762, .024, .13, .07, .13, i === 1 ? copper : glass);
        shop.round(.21 + .16 * i, .801, .024, .121, .013, .121, galvanized);
      }
    }
  }

  function loading(shop, display) {
    // Low powered tugs and containers sit parallel to the workshop doors.
    for (let i = 0; i < 2; i++) {
      const x = (i - .5) * 1.55;
      const z = -.27 + i * .53;
      for (const side of [-1, 1]) {
        shop.round(x + side * .51, .15, z + .28, .27, .115, .27, rubber, 0, 0, Math.PI / 2);
        shop.round(x + side * .51, .15, z - .28, .27, .115, .27, rubber, 0, 0, Math.PI / 2);
      }
      shop.box(x, .24, z, .97, .183, .81, galvanized);
      shop.box(x, .42, z, .85, .29, .69, i ? 0x4a716f : copper);
      shop.box(x, .583, z, .91, .07, .76, iron);
      for (const strap of [-1, 1]) {
        shop.box(x + strap * .31, .425, z + .357, .076, .31, .041, galvanized);
        shop.light(x + strap * .33, .236, z + .415, .128, .063, .038, i ? seafoam : amber);
      }
    }
    shop.box(-1.78, .38, -.56, .55, .65, .39, iron);
    shop.box(-1.78, .754, -.42, .64, .252, .24, galvanized, 0, -.16);
    shop.screen(-1.78, .765, -.295, .56, .21, 1, display, 0, -.16);
  }

  function storefront(shop, width, style) {
    const { trim, lamp } = interiors[style];
    const y = 1.33;
    shop.box(0, y, .054, width + .16, 1.97, .109, rubber);
    shop.interior(0, y, .126, width - .10, 1.81, 1, style);
    shop.box(0, y + .968, .133, width + .18, .145, .188, iron);
    shop.box(0, y - .955, .128, width + .21, .124, .213, trim);
    shop.box(0, y + .706, .144, width, .041, .078, galvanized);
    for (const frac of [-.5, -.174, .174, .5]) {
      shop.box(frac * width, y, .143, Math.abs(frac) === .5 ? .123 : .075, 1.96, .153, iron);
    }
    for (const side of [-1, 1]) {
      shop.box(side * width * .056, y - .235, .191, .027, .268, .041, galvanized);
      shop.light(side * width * .302, y + .924, .228, width * .216, .035, .042, lamp);
    }

    const awningWidth = width + .27;
    const canopyY = y + 1.122;
    shop.box(0, canopyY + .12, .061, awningWidth + .09, .092, .121, iron);
    for (let stripe = 0; stripe < 13; stripe++) {
      const x = ((stripe + .5) / 13 - .5) * awningWidth;
      const color = stripe % 3 === 0 ? trim : 0x33404a;
      shop.cloth(x, canopyY, .138, awningWidth / 13 + .003, .05, .255, color, 0, .487);
      shop.cloth(x, canopyY - .075, .245, awningWidth / 13 + .002, .112, .018, color);
    }
    for (const side of [-1, 1]) {
      shop.box(side * awningWidth * .463, canopyY - .101, .134, .035, .049, .212, galvanized, 0, -.29);
    }
  }

  function dockDoor(shop, width) {
    const y = 1.12;
    shop.box(0, y, .053, width + .41, 2.22, .095, rubber);
    shop.box(0, y + .049, .104, width, 1.78, .055, 0x414755);
    for (let slat = 0; slat < 12; slat++) {
      shop.box(0, y - .775 + slat * .145, .148, width, .075, .042, slat % 3 === 0 ? galvanized : 0x525864);
    }
    shop.box(0, y + 1.084, .136, width + .442, .203, .209, iron);
    shop.box(0, y - 1.023, .119, width + .285, .09, .225, galvanized);
    shop.light(0, y + 1.029, .247, width * .48, .044, .034, 0xcdb78e);
    for (const side of [-1, 1]) {
      shop.box(side * (width / 2 + .073), y, .136, .156, 2.08, .217, iron);
      for (let stripe = 0; stripe < 5; stripe++) {
        shop.box(side * (width / 2 + .071), .22 + stripe * .096, .252, .125, .039, .021, 0x947343, 0, 0, .27 * side);
      }
      shop.light(side * (width / 2 + .1), y + .853, .232, .088, .058, .042, amber);
    }
    shop.box(width * .28, .784, .206, .32, .43, .064, rubber);
    shop.light(width * .28, .882, .247, .132, .051, .034, 0xbdd1a6);
  }

  shops.forEach(({ at: [x, z], face, style, offset, lit, type }) => {
    const building = buildings.find(item => item.x === x && item.z === z);
    if (!building) return;
    const main = building.levels?.[0] ?? building;
    const level = face === 1 ? building.levels?.find((part, index) => index > 0 && !part.bottom) ?? main : main;
    const span = face ? level.d : level.w;
    const width = Math.min(span * (type === 'loading' ? .55 : .69), type === 'loading' ? 4.85 : 5.40);
    const across = Math.min(span / 2 - width / 2 - .34, Math.abs(offset) * span) * Math.sign(offset);
    const frontX = level.x + face * level.w / 2 + (face ? 0 : across);
    const frontZ = level.z + (face ? -face * across : level.d / 2);
    const shop = station(frontX, frontZ, face * Math.PI / 2, interiors[style]?.lamp || amber);
    if (type === 'loading') dockDoor(shop, width);
    else storefront(shop, width, style);
    if (lit) shopLights.push({ x: frontX + face * .76, y: ground + 2.16, z: frontZ + (face ? 0 : .76), color: interiors[style].lamp });
  });

  function marketStall(x, z, fabricColor, display, angle) {
    const stall = station(x, z, angle, interiors[display].lamp);
    const width = 2.52;
    paving(stall, width + .24, 1.55);
    stall.box(0, .29, -.30, width, .44, .70, iron);
    stall.box(0, .532, -.30, width + .05, .095, .73, galvanized);
    stall.box(0, .34, .074, width - .14, .312, .09, fabricColor);
    stall.light(0, .524, .092, width * .91, .053, .07);
    for (const side of [-1, 1]) {
      stall.box(side * width * .47, .677, -.60, .075, .64, .084, galvanized);
      stall.box(side * width * .46, .68, .29, .084, .64, .085, iron);
    }

    for (let stripe = 0; stripe < 11; stripe++) {
      const x = ((stripe + .5) / 11 - .5) * (width + .21);
      const color = stripe % 3 === 1 ? 0x6d726d : fabricColor;
      stall.cloth(x, .99, -.149, (width + .21) / 11 + .004, .065, 1.12, color, 0, .083);
      stall.cloth(x, .924, .403, (width + .21) / 11, .12, .045, color);
      if (stripe % 2 === 0) stall.light(x, .931, .305, .078, .04, .10);
    }

    for (const x of [-.78, -.22, .37, .86]) {
      stall.box(x, .612, -.265, .43, .11, .40, copper);
      for (let pile = 0; pile < 4; pile++) {
        const dx = (pile % 2 - .5) * .129;
        const dz = Math.floor(pile / 2) * .121;
        const color = (pile + display) % 2 === 0 ? 0xbb9765 : 0x688570;
        stall.round(x + dx, .69 + dz * .28, -.33 + dz, .107, .070 + dz * .34, .106, color);
      }
    }
    stall.box(-.82, .627, .53, .53, .112, .20, galvanized, 0, -.18);
    stall.screen(-.82, .642, .631, .474, .088, 1, display, 0, -.18);
    planter(stall, -1.49, -.31, display);
  }

  // Covered runners and merchandise occupy the little plaza below the Emberside alley.
  for (const [x, z, color, style, yaw] of [
    [-15.80, 5.88, 0x9e6954, 0, .13], [-12.42, 5.23, 0x477c78, 2, -.13], [-9.25, 4.67, 0x745374, 1, -.25],
    [-14.31, 1.64, 0x585d7f, 3, .75], [-10.76, 1.21, 0x89684e, 0, .34],
  ]) {
    marketStall(x, z, color, style, yaw);
  }
  const plaza = station(-13.02, 3.42, 0, amber);
  for (const [x, z] of [[-4.08, 1.76], [4.74, -.46], [-.37, 1.94]]) bollard(plaza, x, z);
  for (const x of [-2.32, .58, 3.51]) {
    bench(plaza, x, .38);
    plaza.box(x, .048, -.36, 1.06, .028, .42, 0x49626a);
    planter(plaza, x + .75, .33, Math.floor(x + 4));
  }

  function clearlyOutside(x, z) {
    return buildings.every(building => Math.abs(x - building.x) > building.w / 2 + .5 ||
      Math.abs(z - building.z) > building.d / 2 + .5);
  }

  districts.forEach(({ at: [x, z], side, offset, type, light, display }, index) => {
    const building = buildings.find(item => item.x === x && item.z === z);
    if (!building) return;
    const streetX = x + side * (building.w / 2 + 1.66);
    const streetZ = z + offset;
    if (!clearlyOutside(streetX, streetZ)) return;
    const yaw = side * Math.PI / 2;
    const shop = station(streetX, streetZ, yaw, light);
    const wide = type === 'logistics' || type === 'food';
    paving(shop, wide ? 4.47 : 3.67, 1.98);
    if (type === 'logistics') loading(shop, display);
    else counter(shop, display, type === 'venue');
    bollard(shop, wide ? 1.96 : 1.62, .78);
    bollard(shop, wide ? -1.96 : -1.62, .78);
    if (type !== 'logistics') {
      planter(shop, 1.62, -.49, index);
      if (wide) bench(shop, -.96, .58);
    }
  });

  // The old port road has three furnished sidewalk islands beside its narrow kerbs.
  for (const [x, z, side, light] of [[-5.66, 13, 1, amber], [5.62, 3.7, -1, seafoam], [-6.60, -4.8, 1, seafoam], [5.73, -29, -1, orchid]]) {
    if (!clearlyOutside(x, z)) continue;
    const shop = station(x, z, side * Math.PI / 2, light);
    paving(shop, 3.56, .92);
    bench(shop, 0, -.035);
    planter(shop, 1.24, -.043, 2);
    bollard(shop, -1.48, .10);
  }

  furnishDistrictStreets(buildings, new Set(shops.map(shop => shop.at.join(','))), {
    station, storefront, dockDoor, bench, planter, loading, marketStall, counter, shopLights,
  });

  function batch(name, geometry, material, items, shadow = false) {
    if (items.length > 800 && material.map === null) {
      const tiles = new Map();
      for (const part of items) {
        const key = Math.floor(part.x / 20) + ',' + Math.floor(part.z / 20);
        if (!tiles.has(key)) tiles.set(key, []);
        tiles.get(key).push(part);
      }
      if (tiles.size > 1) {
        for (const tile of tiles.values()) batch(name, geometry, material, tile, shadow);
        return;
      }
    }
    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    mesh.name = name;
    mesh.castShadow = shadow;
    mesh.receiveShadow = shadow;
    items.forEach(({ x, y, z, yaw, pitch, roll, w, h, d, color }, index) => {
      pose.position.set(x, y, z);
      pose.rotation.set(pitch, yaw, roll);
      pose.scale.set(w, h, d);
      pose.updateMatrix();
      mesh.setMatrixAt(index, pose.matrix);
      if (material.map === null) mesh.setColorAt(index, tint.set(color));
    });
    group.add(mesh);
    return mesh;
  }

  const steel = new THREE.MeshStandardMaterial({ roughness: .56, metalness: .34 });
  const box = new THREE.BoxGeometry();
  const materials = new Set([steel]);
  batch('Street hardware', box, steel, boxes, true);
  batch('Cast fixtures', new THREE.CylinderGeometry(.5, .5, 1, 10), steel, rounds, true);
  const leaves = new THREE.MeshStandardMaterial({ roughness: .87 });
  const lamps = new THREE.MeshBasicMaterial({ toneMapped: false });
  materials.add(leaves).add(lamps);
  batch('Street foliage', new THREE.DodecahedronGeometry(.63, 0), leaves, foliage, true);
  batch('Counter and bollard lights', box, lamps, lights);

  const cloth = new THREE.MeshStandardMaterial({ roughness: .93 });
  materials.add(cloth);
  batch('Fabric shop and market awnings', box, cloth, fabric, true);

  const textures = [makeDisplayAtlas(), makeShopAtlas()];
  function panels(name, items, atlas) {
    const geometry = new THREE.PlaneGeometry();
    geometry.setAttribute('displayRow', new THREE.InstancedBufferAttribute(Float32Array.from(items, panel => panel.color), 1));
    const material = new THREE.MeshBasicMaterial({ map: atlas, toneMapped: false });
    material.onBeforeCompile = shader => {
      shader.vertexShader = `attribute float displayRow;\n${shader.vertexShader}`
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv.y = (3. + (vMapUv.y * .94 + .03) - displayRow) * .25;');
    };
    materials.add(material);
    batch(name, geometry, material, items);
  }
  panels('Kiosk information displays', screens, textures[0]);
  panels('Lit shop interiors', shopWindows, textures[1]);

  const updatePedestrians = addPedestrians(group, buildings, [...boxes, ...rounds]);
  function dispose() {
    parent.remove(group);
    const geometries = new Set();
    group.children.forEach(mesh => {
      mesh.dispose();
      geometries.add(mesh.geometry);
      materials.add(mesh.material);
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    textures.forEach(texture => texture.dispose());
  }
  dispose.shopLights = shopLights;
  dispose.update = updatePedestrians;
  return dispose;
}
