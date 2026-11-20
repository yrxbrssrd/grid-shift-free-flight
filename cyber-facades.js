import * as THREE from './vendor/three.module.js';

const size = 256;
const districts = [
  { wall: [102, 82, 76], surface: [83, 72, 67], frame: 0x685753, steel: 0x978984, paint: 0x98603a, lamp: 0xba7546, panels: [64, 32], seam: 16, fluted: true },
  { wall: [70, 93, 109], surface: [65, 80, 91], frame: 0x485d71, steel: 0x7997ac, paint: 0x3d7387, lamp: 0x5e9fac, panels: [64, 64], seam: 25, fluted: false },
  { wall: [88, 76, 107], surface: [75, 71, 88], frame: 0x5f5771, steel: 0x8a829b, paint: 0x775383, lamp: 0x9e6eac, panels: [128, 64], seam: 22, fluted: false },
];
const districtAt = x => x < -12 ? 0 : x > 12 ? 2 : 1;
const box = new THREE.BoxGeometry();
const cylinder = new THREE.CylinderGeometry(.5, .5, 1, 8);

function hash(x, y, seed) {
  let n = Math.imul(x + seed, 374761393) + Math.imul(y, 668265263);
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967295;
}

function field(x, y, width, height, seed) {
  const sx = x / width;
  const sy = y / height;
  const ix = Math.floor(sx);
  const iy = Math.floor(sy);
  const fx = sx - ix;
  const fy = sy - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const nextX = (ix + 1) % (size / width);
  const nextY = (iy + 1) % (size / height);
  const a = hash(ix, iy, seed) * (1 - u) + hash(nextX, iy, seed) * u;
  const b = hash(ix, nextY, seed) * (1 - u) + hash(nextX, nextY, seed) * u;
  return a * (1 - v) + b * v;
}

function grainMaps(district, index, rooftop = false) {
  function surface(colorSpace = THREE.NoColorSpace) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const pixels = ctx.createImageData(size, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = colorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(rooftop ? 1 : 2, rooftop ? 1 : 2);
    texture.anisotropy = 4;
    return { ctx, pixels, texture };
  }

  const base = surface(THREE.SRGBColorSpace);
  const height = surface();
  const roughness = surface();
  const [panelW, panelH] = rooftop ? [64, 64] : district.panels;
  const palette = rooftop ? district.surface : district.wall;
  const oxidation = index === 0 ? [32, 8, -9] : [9, 12, 15];
  const seed = index * 31 + (rooftop ? 17 : 3);

  for (let y = 0; y < size; y++) {
    const row = Math.floor(y / panelH);
    const seamY = y % panelH;
    for (let x = 0; x < size; x++) {
      const panelX = (x + (index !== 1 && row % 2 ? panelW / 2 : 0)) % size;
      const col = Math.floor(panelX / panelW);
      const seamX = panelX % panelW;
      const seam = Math.min(seamX, seamY, panelW - seamX, panelH - seamY);
      const low = field(x, y, 64, 64, seed) - .5;
      const grain = hash(x, y, seed) - .5;
      const mottling = field(x, y, 8, 8, seed + 16) - .5;
      const runoff = field(x, y, 8, 64, seed + 7) - .5;
      const shade = hash(col, row, seed + 14) - .5;
      const flute = district.fluted && !rooftop ? Math.cos(x * Math.PI / 4) : 0;
      const rivetX = Math.min(Math.abs(seamX - 6), Math.abs(seamX - panelW + 6));
      const rivetY = Math.min(Math.abs(seamY - 6), Math.abs(seamY - panelH + 6));
      const rivet = Math.max(0, 1 - Math.hypot(rivetX, rivetY) / 2.6);
      const joint = seam < 1.5 ? 1 : 0;
      const edge = seamX === 2 || seamY === 2 ? 1 : 0;
      const weathering = Math.max(0, runoff + mottling * .5 + low - .18);
      const deposit = field(x, y, 4, 16, seed + 26);
      const corrosion = Math.max(0, deposit + runoff - .72) * Math.max(0, 1 - seam / 12);
      const patch = Math.max(0, field(x, y, 16, 16, seed + 53) - .63);
      const rain = rooftop ? weathering * 12 + patch * 67 : weathering * 45 + corrosion * 31;
      const value = low * 30 + grain * (rooftop ? 34 : 16) + mottling * 17 + shade * 19 + flute * 9
        - rain - district.seam * joint + edge * 10 + rivet * 28;
      const buildHeight = 161 + grain * (rooftop ? 37 : 12) + mottling * 14 + flute * 16
        - joint * 97 + edge * 43 + rivet * 48 + corrosion * 28;
      const wetness = 182 + grain * 18 + mottling * 30 + joint * 28 - weathering * 104 - patch * 94;
      const offset = (y * size + x) * 4;

      for (let channel = 0; channel < 3; channel++) {
        base.pixels.data[offset + channel] = palette[channel] + value + corrosion * oxidation[channel];
        height.pixels.data[offset + channel] = buildHeight;
        roughness.pixels.data[offset + channel] = wetness;
      }
      base.pixels.data[offset + 3] = height.pixels.data[offset + 3] = roughness.pixels.data[offset + 3] = 255;
    }
  }

  for (const map of [base, height, roughness]) map.ctx.putImageData(map.pixels, 0, 0);
  return { map: base.texture, bumpMap: height.texture, roughnessMap: roughness.texture };
}

export function createCyberBuildingMaterials() {
  const materials = {
    shell: districts.map((district, index) => new THREE.MeshStandardMaterial({
      ...grainMaps(district, index),
      bumpScale: .105,
      metalness: index === 0 ? .34 : .23,
      roughness: .92,
    })),
    roof: districts.map((district, index) => new THREE.MeshStandardMaterial({
      ...grainMaps(district, index, true),
      bumpScale: .085,
      metalness: .32,
      roughness: 1,
    })),
  };
  for (const shell of materials.shell) {
    // Use the same real-world sheet size on the podium and the upper storeys.
    shell.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
        #ifdef USE_INSTANCING
          vec3 span = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vec2 faceSpan = abs(normal.y) > .5 ? span.xz : (abs(normal.x) > .5 ? span.zy : span.xy);
          vMapUv *= faceSpan / 8.;
          vBumpMapUv *= faceSpan / 8.;
          vRoughnessMapUv *= faceSpan / 8.;
        #endif`);
    };
  }
  return materials;
}

const metals = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .52, roughness: .44 });
const recesses = new THREE.MeshStandardMaterial({ color: 0x182132, metalness: .25, roughness: .76 });
const accents = new THREE.MeshStandardMaterial({
  color: 0xffffff, roughness: .42, metalness: .24, emissive: 0x412c3b, emissiveIntensity: .42,
});

export function addCyberFacadeDetails(parent, buildings, windows = []) {
  const batches = new Map([[metals, []], [recesses, []], [accents, []]]);
  const add = (mat, color, x, y, z, w, h, d) => batches.get(mat).push({ color, x, y, z, w, h, d });
  const pipes = [];

  for (const [x, y, z, w, h, d, sector] of windows) {
    const xFacing = w < d;
    const { steel, frame } = districts[sector];
    const width = xFacing ? d : w;
    const mountWindowPart = (mat, color, atY, partWidth, height, depth) =>
      add(mat, color, x, atY, z, xFacing ? depth : partWidth, height, xFacing ? partWidth : depth);
    mountWindowPart(recesses, 0xffffff, y, width + .17, h + .13, .035);
    mountWindowPart(metals, frame, y + h / 2 + .043, width + .18, .085, .105);
    mountWindowPart(metals, steel, y - h / 2 - .039, width + .22, .074, .148);
  }

  buildings.forEach((building, index) => {
    const street = building.levels?.[0] ?? building;
    const roof = building.levels?.at(-1) ?? building;
    const { x, z, w, d } = street;
    const streetHeight = building.streetHeight ?? street.h;
    const sector = districtAt(building.x);
    const { frame, steel, paint, lamp } = districts[sector];
    const lowStory = Math.min(streetHeight, 2.85);
    const ceiling = streetHeight - .16;
    const faces = [[0, 1], [1, 0], [0, -1], [-1, 0]];

    faces.forEach(([dx, dz], faceIndex) => {
      const span = dz ? w : d;
      function face(mat, color, across, y, width, height, depth, setback = 0) {
        const projection = depth / 2 + setback;
        add(mat, color, x + dx * (w / 2 + projection) + dz * across, y,
          z + dz * (d / 2 + projection) - dx * across,
          dz ? width : depth, height, dx ? width : depth);
      }
      function round(color, across, y, radius, height, clearance, sideways = false) {
        const centerX = x + dx * (w / 2 + clearance) + dz * across;
        const centerZ = z + dz * (d / 2 + clearance) - dx * across;
        pipes.push({ color, x: centerX, y, z: centerZ, w: radius * 2, h: height, d: radius * 2,
          rx: sideways ? dx * Math.PI / 2 : 0, rz: sideways ? dz * Math.PI / 2 : 0 });
      }

      // Folded structural rails stand proud of the wall and catch grazing light.
      face(metals, frame, 0, ceiling, span, .19, .15);
      face(recesses, 0xffffff, 0, ceiling - .165, span * .99, .06, .085);
      face(metals, frame, 0, lowStory, span, .14, .18);
      face(metals, steel, 0, lowStory + .06, span * .94, .035, .049, .13);
      face(recesses, 0xffffff, 0, .35, span, .26, .09);
      for (const end of [-1, 1]) {
        face(metals, frame, end * (span / 2 - .22), streetHeight * .48, .27, streetHeight * .96, .145);
        face(metals, paint, end * (span / 2 - .42), lowStory * .49, .07, lowStory * .89, .12);
      }

      if ((index + faceIndex) % 3 === 0 || faceIndex === 0) {
        const offset = (index % 2 ? -.22 : .22) * span;
        const doorW = Math.min(span * .38, sector === 0 ? 2.58 : 1.7);
        face(recesses, 0xffffff, offset, 1.34, doorW, 1.95, .095);
        face(metals, frame, offset, 2.27, doorW + .2, .17, .15);
        for (const end of [-1, 1]) {
          face(metals, frame, offset + end * (doorW / 2 + .032), 1.34, .12, 1.95, .14);
          face(accents, lamp, offset + end * doorW * .32, 2.27, .34, .048, .027, .15);
        }
        const slats = sector === 0 ? 8 : 4;
        for (let slatIndex = 0; slatIndex < slats; slatIndex++) {
          face(metals, frame, offset, .61 + slatIndex * (1.35 / slats), doorW * .92, .054, .029, .095);
        }
      } else {
        const panelW = Math.min(.26 * span, 1.58);
        face(recesses, 0xffffff, 0, 1.72, panelW, .65, .08);
        face(metals, frame, 0, 2.045, panelW + .13, .09, .14);
        for (const grille of [-2, -1, 0, 1, 2]) {
          face(metals, frame, 0, 1.72 + grille * .107, panelW - .13, .046, .044, .08);
        }
      }

      if ((index * 7 + faceIndex) % 3 !== 1 && streetHeight > 4.9) {
        const ductOffset = ((index + faceIndex) % 2 ? -.34 : .34) * span;
        const ductHeight = streetHeight - lowStory - .56;
        face(recesses, 0xffffff, ductOffset, lowStory + ductHeight / 2, .245, ductHeight, .095);
        face(metals, frame, ductOffset, lowStory + ductHeight / 2, .13, ductHeight, .068, .095);
        for (let y = lowStory + .54; y < streetHeight - .55; y += 1.84) {
          face(metals, paint, ductOffset, y, .268, .085, .043, .155);
        }
      }

      const serviceY = lowStory + .57;
      const side = (index + faceIndex) % 2 ? 1 : -1;
      if (streetHeight > 5.25 && (faceIndex !== 2 || index % 3 === 1)) {
        const across = span * .27 * side;
        if (sector === 0 || (sector === 2 && index % 3 === 0)) {
          const run = Math.min(streetHeight - serviceY - .75, 4.45);
          const twinOffsets = [across, across + .19 * side];
          for (let lane = 0; lane < twinOffsets.length; lane++) {
            const offset = twinOffsets[lane];
            const reach = run - lane * .41;
            const top = serviceY + reach;
            const radius = lane ? .044 : .072;
            round(lane ? paint : steel, offset, serviceY + reach / 2, radius, reach, .149);
            round(steel, offset - side * .14, top, radius, .28, .149, true);
            for (let collar = serviceY + .31; collar < top - .16; collar += 1.23) {
              round(frame, offset, collar, radius + .024, .105, .149);
              face(metals, paint, offset, collar, .24, .058, .09, .054);
            }
          }
        } else {
          const panelW = sector === 1 ? 1.13 : 1.46;
          const panelH = sector === 1 ? .49 : .63;
          face(metals, frame, across, serviceY, panelW, panelH, .215);
          face(recesses, 0xffffff, across, serviceY, panelW - .16, panelH - .14, .025, .214);
          face(metals, steel, across, serviceY + panelH * .49, panelW + .093, .071, .257);
          const slots = sector === 1 ? 7 : 9;
          for (let slot = 0; slot < slots; slot++) {
            const cross = across + ((slot + .5) / slots - .5) * (panelW - .15);
            face(metals, steel, cross, serviceY, .027, panelH - .13, .035, .233);
          }
          for (const end of [-1, 1]) {
            face(metals, paint, across + end * panelW * .32, serviceY - panelH * .54, .16, .14, .19);
          }
        }
      }

      const ledgeHeight = Math.min(streetHeight - .65, 5.04);
      if (ledgeHeight > lowStory + .75 && (sector === 1 || sector === 2 || (index + faceIndex) % 2 === 0)) {
        face(metals, frame, 0, ledgeHeight, span * .82, .12, .243);
        face(recesses, 0xffffff, 0, ledgeHeight - .12, span * .79, .12, .12);
        if (sector !== 0) {
          const sections = Math.max(2, Math.floor(span * .71));
          for (let section = 0; section < sections; section++) {
            const across = (section / (sections - 1) - .5) * span * .78;
            face(metals, steel, across, ledgeHeight + .127, .073, .16, .105, .132);
          }
          face(metals, steel, 0, ledgeHeight + .205, span * .8, .048, .044, .195);
        }
      }
    });

    // Low-profile rooftop extraction units sit within the existing collision clearance.
    const unitW = Math.min(roof.w * .29, 1.3);
    const unitD = Math.min(roof.d * .28, 1.45);
    const side = index % 2 ? -1 : 1;
    const unitX = roof.x + Math.min(.8, roof.w * .15) * side;
    const unitZ = roof.z + Math.min(.65, roof.d * .15) * side;
    const h = roof.h;
    add(metals, frame, unitX, h + .22, unitZ, unitW, .54, unitD);
    add(recesses, 0xffffff, unitX, h + .494, unitZ, unitW * .9, .049, unitD * .87);
    for (let bar = -2; bar <= 2; bar++) {
      add(metals, steel, unitX + bar * unitW * .16, h + .526, unitZ, .055, .042, unitD * .82);
    }
    add(metals, paint, unitX, h + .386, unitZ + unitD * .49, unitW * .78, .058, .036);
    const railZ = roof.z + side * (roof.d / 2 - .21);
    const railSpan = roof.w * (index % 3 === 0 ? .67 : .49);
    const railCenter = roof.x - side * roof.w * .06;
    add(metals, frame, railCenter, h + .167, railZ, railSpan, .092, .14);
    if (index % 3 === 0) {
      for (const fraction of [-.49, -.165, .165, .49]) {
        add(metals, steel, railCenter + railSpan * fraction, h + .328, railZ, .055, .298, .061);
      }
      add(metals, steel, railCenter, h + .473, railZ, railSpan, .059, .064);
    }
  });

  const transform = new THREE.Object3D();
  const color = new THREE.Color();

  for (const [material, items, geometry = box] of [...batches, [metals, pipes, cylinder]]) {
    if (items.length === 0) continue;
    const meshes = new THREE.InstancedMesh(geometry, material, items.length);
    meshes.name = 'Street facade relief';
    meshes.castShadow = material === metals;
    meshes.receiveShadow = true;
    items.forEach((item, index) => {
      transform.position.set(item.x, item.y, item.z);
      transform.rotation.set(item.rx ?? 0, 0, item.rz ?? 0);
      transform.scale.set(item.w, item.h, item.d);
      transform.updateMatrix();
      meshes.setMatrixAt(index, transform.matrix);
      meshes.setColorAt(index, color.setHex(item.color));
    });
    meshes.instanceMatrix.needsUpdate = true;
    meshes.instanceColor.needsUpdate = true;
    parent.add(meshes);
  }
}
