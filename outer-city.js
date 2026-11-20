import * as THREE from './vendor/three.module.js';

// A single quay outline joins the east and south districts around the old harbour basin.
const coast = [
  [73, -44], [93, -48], [119, -48], [133, -42], [141, -29], [140, -12], [143, 3],
  [142, 19], [145, 35], [142, 51], [145, 68], [142, 82], [143, 100], [138, 116],
  [129, 126], [113, 133], [101, 138], [81, 140], [60, 136], [39, 139], [20, 139],
  [0, 137], [-17, 139], [-34, 135], [-44, 131], [-45, 121], [-48, 104], [-48, 88], [-45, 75],
  [-41, 71], [-25, 70], [-13, 71], [1, 70], [15, 72], [31, 72], [46, 70], [57, 73], [69, 72],
  [73, 65], [71, 53], [74, 38], [72, 25], [73, 12], [70, -3], [72, -16], [69, -26],
];

const arterials = [
  [52, 12, 90, 12, 7.55],
  [89, -40, 89, 121, 8.15],
  [-10, 52, -10, 129, 7.4],
  [-42, 87, 124, 87, 7.95],
];

const serviceLanes = [
  [89, -9.7, 122, -9.7, 2.65],
  [89, 37.15, 106, 37.15, 1.95],
  [-28.55, 87, -28.55, 106.35, 2.75],
  [4.95, 87, 4.95, 110.4, 2.3],
];

const plazas = [
  { x: 111, z: -1, accent: 0x76f6cf, posts: [[-6.24, -3.5], [-6.24, 3.5], [6.24, -3.5], [6.24, 3.5]] },
  { x: 121, z: 81, accent: 0xdb8cff, posts: [[-6.24, -1.43], [-6.24, 3.5], [6.24, -3.5], [6.24, 3.5]] },
  { x: 17, z: 111, accent: 0xf6b36e, posts: [[-5.44, -3.5], [-6.24, 3.5], [6.24, -3.5], [6.24, 2.05]] },
];

export const outerWalkingMap = { coast, arterials, serviceLanes, plazas };

function groundMaterial(surface, roughness, bumpScale) {
  return surface.isMaterial ? surface : new THREE.MeshStandardMaterial({ ...surface, roughness, bumpScale, metalness: .035 });
}

function pathRect([fromX, fromZ, toX, toZ, width]) {
  if (fromX === toX) return [fromX - width / 2, fromZ, fromX + width / 2, toZ];
  return [fromX, fromZ - width / 2, toX, fromZ + width / 2];
}

function contained(x, z, regions) {
  return regions.some(([lowX, lowZ, highX, highZ]) => x > lowX && x < highX && z > lowZ && z < highZ);
}

// Split overlapping roads and crossing footways into a single flush surface per material.
function flatNetwork(regions, exclusions, altitude, tileSize) {
  const edges = [...regions, ...exclusions];
  const xCuts = [...new Set(edges.flatMap(([a, , c]) => [a, c]))].sort((a, b) => a - b);
  const zCuts = [...new Set(edges.flatMap(([, b, , d]) => [b, d]))].sort((a, b) => a - b);
  const vertices = [];
  const uv = [];
  const normals = [];
  for (let i = 1; i < xCuts.length; i++) for (let j = 1; j < zCuts.length; j++) {
    const [a, b] = [xCuts[i - 1], zCuts[j - 1]];
    const [c, d] = [xCuts[i], zCuts[j]];
    const x = (a + c) / 2, z = (b + d) / 2;
    if (!contained(x, z, regions) || contained(x, z, exclusions)) continue;
    for (const [px, pz] of [[a, b], [a, d], [c, b], [c, b], [a, d], [c, d]]) {
      vertices.push(px, altitude, pz);
      uv.push(px / tileSize, -pz / tileSize);
      normals.push(0, 1, 0);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}

export function addOuterCity(scene, surfaces) {
  const group = new THREE.Group();
  group.name = 'East and south waterfront districts';
  scene.add(group);

  const asphalt = groundMaterial(surfaces.asphalt, .91, .082);
  const concrete = groundMaterial(surfaces.concrete, .94, .105);
  const pavers = groundMaterial(surfaces.pavers, .94, .097);
  const stone = new THREE.MeshStandardMaterial({ roughness: .84, metalness: .16 });
  const metal = new THREE.MeshStandardMaterial({ roughness: .57, metalness: .58 });
  const illuminated = new THREE.MeshBasicMaterial({ toneMapped: false });
  const shore = new THREE.Shape(coast.map(([x, z]) => new THREE.Vector2(x, -z)));
  const base = new THREE.Mesh(new THREE.ExtrudeGeometry(shore, {
    depth: .58, bevelSize: .25, bevelThickness: .135, bevelSegments: 1, steps: 1,
  }), new THREE.MeshStandardMaterial({ color: 0x3c4658, roughness: .85, metalness: .19 }));
  base.rotation.x = -Math.PI / 2;
  base.position.y = -.50;
  group.add(base);
  const landGeometry = new THREE.ShapeGeometry(shore);
  const position = landGeometry.attributes.position;
  const uv = landGeometry.attributes.uv;
  for (let i = 0; i < position.count; i++) uv.setXY(i, position.getX(i) / 9.6, position.getY(i) / 9.6);
  const land = new THREE.Mesh(landGeometry, concrete);
  land.name = 'Outer quay surface and apron';
  land.rotation.x = -Math.PI / 2;
  land.position.y = .229;
  land.receiveShadow = true;
  group.add(land);

  const mainPaths = [...arterials, ...serviceLanes].map(pathRect);
  const walks = arterials.map(([ax, az, bx, bz, width]) => pathRect([ax, az, bx, bz, width + 3.8]));
  for (const { x, z } of plazas) walks.push([x - 7.2, z - 5.7, x + 7.2, z + 5.7]);
  const walkway = new THREE.Mesh(flatNetwork(walks, mainPaths, .248, 6.4), pavers);
  const roads = new THREE.Mesh(flatNetwork(mainPaths, [], .259, 10.8), asphalt);
  walkway.name = 'Outer district sidewalks and station plazas';
  roads.name = 'East connection, South connection and ring roads';
  walkway.receiveShadow = roads.receiveShadow = true;
  group.add(walkway, roads);

  const structural = [];
  const fittings = [];
  const lamps = [];
  function place(parts, x, y, z, w, h, d, color, yaw = 0) {
    parts.push({ x, y, z, w, h, d, color, yaw });
  }

  // The ferry lane stays outboard of this pair of low concrete causeways.
  for (const [x, z, length, yaw, tint] of [[65, 12, 15.8, 0, 0x65ccdb], [-10, 64.5, 15.5, Math.PI / 2, 0xffb772]]) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const put = (parts, along, y, across, w, h, d, color) =>
      place(parts, x + along * c + across * s, y, z - along * s + across * c, w, h, d, color, yaw);
    put(structural, 0, -.06, 0, length + 1.15, .58, 11.32, 0x414d5e);
    put(fittings, 0, -.056, 0, length + 1.31, .105, 11.42, 0x202a3b);
    for (const side of [-1, 1]) {
      put(structural, 0, .286, side * 5.42, length, .11, .21, 0x54616b);
      put(fittings, 0, .634, side * 5.38, length, .085, .105, 0x556379);
      put(fittings, 0, .412, side * 5.38, length, .064, .077, 0x343e53);
      for (let post = -3; post <= 3; post++) {
        put(fittings, post * 2.15, .479, side * 5.37, .128, .474, .137, 0x536173);
        if (Math.abs(post) % 2 === 1) {
          put(lamps, post * 2.15, .669, side * 5.37, .134, .07, .151, tint);
          put(lamps, post * 2.15, -.115, side * 5.71, .47, .075, .035, tint);
        }
      }
    }
  }

  // Flood ledges and mooring lamps give the new coast a readable profile over the tide.
  coast.forEach(([x0, z0], i) => {
    const [x1, z1] = coast[(i + 1) % coast.length];
    const dx = x1 - x0, dz = z1 - z0;
    const length = Math.hypot(dx, dz);
    const yaw = -Math.atan2(dz, dx);
    const x = (x0 + x1) / 2, z = (z0 + z1) / 2;
    const bridgeLip = (Math.abs(x - 73) < 3.4 && Math.abs(z - 12) < 9.7) || (Math.abs(z - 70) < 5 && Math.abs(x + 10) < 10);
    if (bridgeLip) return;
    place(structural, x, .138, z, length + .09, .26, .41, 0x465161, yaw);
    place(structural, x, -.084, z, length + .08, .11, .31, 0x576070, yaw);
    if (i % 3 === 1) return;
    const hue = x > 79 ? (i % 4 === 0 ? 0xbf91f0 : 0x78cde0) : 0xe3a36a;
    const steps = Math.ceil(length / 4.1);
    for (let step = 1; step < steps; step++) {
      const f = step / steps;
      const px = x0 + dx * f, pz = z0 + dz * f;
      place(fittings, px, .438, pz, .289, .435, .283, 0x273549, yaw);
      place(lamps, px, .622, pz, .22, .077, .22, hue, yaw);
      place(fittings, px, .676, pz, .265, .041, .263, 0x454d5b, yaw);
    }
  });

  function line(parts, atX, atZ, across, y, w, h, d, color, vertical) {
    place(parts, atX + (vertical ? across : 0), y, atZ + (vertical ? 0 : across), w, h, d, color, vertical ? 0 : Math.PI / 2);
  }

  arterials.forEach(([a, b, c, d, width], index) => {
    const vertical = a === c;
    const length = vertical ? d - b : c - a;
    const railEnd = .5 * width + .12;
    const hue = index < 2 ? 0x88cbe2 : 0xe8aa76;
    for (let run = 1.9; run < length - .6; run += 3.85) {
      const x = a + (vertical ? 0 : run), z = b + (vertical ? run : 0);
      const intersection = (Math.abs(z - 87) < 5 && (Math.abs(x - 89) < 5 || Math.abs(x + 10) < 5)) || (Math.abs(z - 12) < 5.5 && Math.abs(x - 89) < 4.7);
      if (intersection) continue;
      line(structural, x, z, 0, .269, .101, .008, 1.54, 0x918a80, vertical);
      for (const side of [-1, 1]) {
        line(structural, x, z, side * railEnd, .268, .17, .112, 3.58, 0x626775, vertical);
        line(structural, x, z, side * (width / 2 - .32), .269, .050, .009, 3.48, 0x8f8278, vertical);
        if (Math.floor(run / 3.85) % 4 === 0) {
          line(fittings, x, z, side * (width / 2 + 1.25), .546, .26, .615, .26, 0x253245, vertical);
          line(lamps, x, z, side * (width / 2 + 1.26), .836, .18, .065, .18, hue, vertical);
        }
        if (Math.floor(run / 3.85) % 5 === 2) {
          line(fittings, x, z, side * (width / 2 - .12), .266, .295, .018, .69, 0x26313d, vertical);
          for (let grate = -2; grate <= 2; grate++) {
            line(structural, x + (vertical ? 0 : grate * .112), z + (vertical ? grate * .112 : 0), side * (width / 2 - .10), .276, .272, .012, .036, 0x4b5661, vertical);
          }
        }
      }
    }
  });

  for (const [x, z] of [[89, 12], [89, 87], [-10, 87]]) {
    for (const [sx, sz, vertical] of [[0, -4.62, true], [0, 4.62, true], [-4.65, 0, false], [4.65, 0, false]]) {
      for (let stripe = -4; stripe <= 4; stripe++) {
        line(structural, x + sx, z + sz, stripe * .70, .273, .29, .008, 1.03, 0xaca191, vertical);
      }
    }
  }

  for (const { x, z, accent, posts } of plazas) {
    for (const [dx, dz] of posts) {
      place(structural, x + dx, .32, z + dz, 1.39, .145, 1.1, 0x566171);
      place(fittings, x + dx, .675, z + dz, .294, .696, .25, 0x263647);
      place(lamps, x + dx, .992, z + dz, .191, .085, .21, accent);
      place(fittings, x + dx, 1.056, z + dz, .238, .084, .228, 0x495665);
    }
    for (const offset of [-5.32, 5.32]) {
      place(structural, x, .263, z + offset, 6.9, .021, .09, 0x727977);
      for (let marker = -4; marker <= 4; marker++) {
        place(lamps, x + marker * .73, .277, z + offset, .19, .033, .065, accent);
      }
    }
  }

  const box = new THREE.BoxGeometry();
  const transform = new THREE.Object3D();
  const tint = new THREE.Color();
  for (const [parts, material, name, shadow] of [
    [structural, stone, 'Seawall sections and road markings', false],
    [fittings, metal, 'Quay rails and street equipment', true],
    [lamps, illuminated, 'Harbour and causeway markers', false],
  ]) {
    const mesh = new THREE.InstancedMesh(box, material, parts.length);
    mesh.name = name;
    mesh.receiveShadow = true;
    mesh.castShadow = shadow;
    parts.forEach(({ x, y, z, w, h, d, color, yaw }, index) => {
      transform.position.set(x, y, z);
      transform.rotation.y = yaw;
      transform.scale.set(w, h, d);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
      mesh.setColorAt(index, tint.set(color));
    });
    mesh.layers.enable(1);
    group.add(mesh);
  }
  return group;
}
