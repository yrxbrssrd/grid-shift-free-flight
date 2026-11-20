import * as THREE from './vendor/three.module.js';
import { addRoadSpray } from './road-spray.js';

const westLane = [[-2.05, -17.15], [-2.05, -12.8], [-4.78, -9.1], [-4.78, .5], [-2.05, 4.2],
  [-2.05, 44.5], [-32.05, 44.5], [-32.05, -17.15]];
const eastLane = [[2.05, -17.94], [49.65, -17.94], [49.65, 44.5], [2.05, 44.5],
  [2.05, 4.2], [4.78, .5], [4.78, -9.1], [2.05, -12.8]];
const ferryRoute = [[-68, -62.8], [147, -62.8], [147, 147], [-68, 147]];

function makeRoute(points, turnRadius) {
  const corners = points.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const turns = corners.map((center, i) => {
    const prev = corners[(i + corners.length - 1) % corners.length];
    const next = corners[(i + 1) % corners.length];
    const enter = center.clone().lerp(prev, Math.min(.43, turnRadius / center.distanceTo(prev)));
    const exit = center.clone().lerp(next, Math.min(.43, turnRadius / center.distanceTo(next)));
    return { enter, center, exit };
  });
  const parts = [];
  let length = 0;
  turns.forEach(({ enter, center, exit }, i) => {
    const prev = turns[(i + turns.length - 1) % turns.length];
    for (const curve of [new THREE.LineCurve3(prev.exit, enter), new THREE.QuadraticBezierCurve3(enter, center, exit)]) {
      const span = curve.getLength();
      parts.push({ curve, span, start: length });
      length += span;
    }
  });
  const ahead = new THREE.Vector3();
  const behind = new THREE.Vector3();
  return (distance, position) => {
    const along = THREE.MathUtils.euclideanModulo(distance, length);
    const part = parts.find(({ start, span }) => along < start + span);
    const t = part.curve.getUtoTmapping((along - part.start) / part.span);
    part.curve.getPoint(t, position);
    part.curve.getPoint(Math.min(1, t + .002), ahead);
    part.curve.getPoint(Math.max(0, t - .002), behind);
    return Math.atan2(ahead.x - behind.x, ahead.z - behind.z);
  };
}

function bevelBody() {
  const outline = new THREE.Shape();
  outline.moveTo(-.39, -.39);
  outline.lineTo(.39, -.39);
  outline.lineTo(.39, .39);
  outline.lineTo(-.39, .39);
  outline.closePath();
  return new THREE.ExtrudeGeometry(outline, { depth: .78, bevelEnabled: true, bevelThickness: .11,
    bevelSize: .11, bevelSegments: 1, steps: 1, curveSegments: 1 }).translate(0, 0, -.39);
}

const carAxles = [-.86, .87];
const vanAxles = [-1.11, 1.11];
const busAxles = [-.98, 1.00];

// Longitudinal lofts keep the shoulders continuous and the wheel wells open.
function loft(sections, profile, extraSections = []) {
  const stations = [...new Set([...sections.map(section => section[0]), ...extraSections])].sort((a, b) => a - b);
  const positions = [], uv = [], indices = [];
  const first = stations[0], last = stations.at(-1);
  let ring = 0;
  stations.forEach((z, station) => {
    const upper = Math.max(1, sections.findIndex(row => row[0] >= z));
    const a = sections[upper - 1], b = sections[upper];
    const mix = (z - a[0]) / (b[0] - a[0]);
    const shape = profile(a.slice(1).map((value, i) => THREE.MathUtils.lerp(value, b[i + 1], mix)), z);
    ring = shape.length;
    shape.forEach(([x, y], side) => {
      positions.push(x, y, z);
      uv.push(side / ring, (z - first) / (last - first));
    });
    if (station === 0) return;
    const here = (station - 1) * ring, there = here + ring;
    for (let i = 0; i < ring; i++) {
      const next = (i + 1) % ring;
      indices.push(here + i, here + next, there + i, here + next, there + next, there + i);
    }
  });
  const perimeterVertices = positions.length / 3;
  for (const [offset, end] of [[0, first], [perimeterVertices - ring, last]]) {
    const edge = positions.slice(offset * 3, (offset + ring) * 3);
    const center = positions.length / 3;
    const y = edge.filter((_, index) => index % 3 === 1).reduce((a, b) => a + b, 0) / ring;
    positions.push(0, y, end, ...edge);
    uv.push(.5, .5);
    for (let i = 0; i < ring; i++) uv.push(.5 + edge[i * 3] * .3, .5 + (edge[i * 3 + 1] - y) * .7);
    for (let i = 0; i < ring; i++) {
      const a = center + 1 + i, b = center + 1 + (i + 1) % ring;
      indices.push(center, ...(end === first ? [b, a] : [a, b]));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function mirrored(side) {
  return [...side, ...side.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
}

function roadShell(sections, axles, radius = .267) {
  const archSections = axles.flatMap(center => Array.from({ length: 15 }, (_, index) =>
    center + Math.cos(index / 14 * Math.PI) * radius));
  return loft(sections, ([wide, floor, sill, shoulder, top], z) => {
    let arch = sill;
    for (const axle of axles) {
      const distance = Math.abs(z - axle);
      if (distance <= radius + .00001) arch = Math.max(arch, .237 + Math.sqrt(Math.max(0, radius ** 2 - distance ** 2)));
    }
    return mirrored([
      [0, floor], [wide * .731, floor], [wide * .848, Math.max(floor + .01, arch - .024)],
      [wide * .97, arch], [wide, Math.max(arch + .012, shoulder - .076)],
      [wide * .958, shoulder], [wide * .839, top - .018], [0, top],
    ]);
  }, archSections);
}

function cap(sections) {
  return loft(sections, ([width, bottom, top]) => mirrored([[0, bottom], [width * .91, bottom],
    [width, bottom + (top - bottom) * .34], [width * .72, top - .016], [0, top]]));
}

function pod(sections) {
  return loft(sections, ([wide, bottom, top]) => mirrored([[0, bottom], [wide * .86, bottom], [wide, bottom + .063],
    [wide, top - .118], [wide * .94, top - .047], [wide * .81, top - .015], [0, top]]));
}

function joined(...surfaces) {
  const streams = Object.fromEntries(['position', 'normal', 'uv'].map(name => [name, []]));
  const indices = [];
  let offset = 0;
  for (const surface of surfaces) {
    for (const name of Object.keys(streams)) streams[name].push(...surface.attributes[name].array);
    if (surface.index) {
      for (const index of surface.index.array) indices.push(index + offset);
    } else {
      for (let i = 0; i < surface.attributes.position.count; i++) indices.push(i + offset);
    }
    offset += surface.attributes.position.count;
    surface.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  for (const [name, data] of Object.entries(streams)) geometry.setAttribute(name, new THREE.Float32BufferAttribute(data, name === 'uv' ? 2 : 3));
  geometry.setIndex(indices);
  return geometry;
}

const carChassis = [
  [-1.395, .599, .195, .242, .476, .510], [-1.29, .688, .182, .221, .516, .556],
  [-.94, .724, .184, .219, .552, .582], [-.55, .703, .173, .218, .574, .610],
  [.26, .701, .170, .211, .573, .623], [.65, .710, .174, .225, .547, .589],
  [.90, .730, .185, .232, .529, .573], [1.15, .699, .188, .240, .508, .547],
  [1.34, .634, .205, .261, .476, .503], [1.40, .582, .229, .269, .437, .479],
];
const vanChassis = [
  [-1.74, .692, .215, .246, .689, .728], [-1.60, .766, .185, .224, .704, .752],
  [-1.12, .789, .184, .224, .727, .760], [-.15, .761, .182, .220, .715, .755],
  [.64, .769, .199, .232, .680, .715], [1.11, .790, .195, .228, .618, .661],
  [1.56, .732, .193, .243, .590, .621], [1.73, .678, .214, .254, .534, .578],
];
const busChassis = [
  [-1.635, .735, .207, .231, .705, .731], [-1.50, .804, .175, .217, .715, .747],
  [-.96, .837, .173, .211, .722, .768], [0, .836, .171, .213, .724, .771],
  [.98, .839, .172, .210, .721, .769], [1.50, .792, .183, .225, .697, .729],
  [1.635, .715, .209, .248, .661, .711],
];

const carCanopy = { belt: [.652, .575, -.882, .813], roof: [.478, .925, -.616, .420] };
const vanCanopy = { belt: [.717, .695, .003, 1.400], roof: [.612, 1.205, -.035, .925] };
const busCanopy = { belt: [.785, .699, -1.524, 1.575], roof: [.728, 1.176, -1.451, 1.505] };
const cabinCanopy = { belt: [1.072, .991, -1.834, 2.175], roof: [.989, 1.649, -1.754, 1.928] };

function windowGeometry({ belt, roof }, panes, ends = [true, true]) {
  const position = [], uv = [];
  const point = ([x, y, rear, front], side, at) => [x * side, y, THREE.MathUtils.lerp(rear, front, at)];
  function quad(a, b, c, d) {
    position.push(...a, ...b, ...c, ...c, ...b, ...d);
    uv.push(0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1);
  }
  for (const side of [-1, 1]) for (const [a, b] of panes) {
    quad(point(belt, side, a), point(belt, side, b), point(roof, side, a), point(roof, side, b));
  }
  for (const end of [0, 1]) {
    if (ends[end]) quad(point(belt, -1, end), point(belt, 1, end), point(roof, -1, end), point(roof, 1, end));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function marineShell() {
  return loft([
    [-2.88, .96, -.150, -.027, .206, .550], [-2.55, 1.19, -.204, -.086, .224, .582],
    [-1.84, 1.28, -.28, -.112, .249, .591], [-.8, 1.287, -.301, -.120, .258, .605],
    [.66, 1.282, -.292, -.104, .253, .624], [1.86, 1.20, -.243, -.061, .281, .655],
    [2.59, .925, -.139, .041, .357, .691], [3.13, .608, -.047, .141, .477, .734],
    [3.57, .304, .127, .271, .565, .770], [3.80, .045, .414, .471, .654, .785],
  ], ([width, keel, chine, flare, deck]) => mirrored([[0, keel], [width * .37, keel + .044],
    [width * .72, chine], [width * .92, flare], [width, deck - .044], [width * .955, deck], [0, deck]]));
}

function weatheredPaint() {
  const size = 128;
  const color = new Uint8Array(size * size * 4);
  const height = new Uint8Array(color.length);
  function hash(x, y) {
    let value = Math.imul(x + 117, 1597334677) ^ Math.imul(y + 19, 3812015801);
    value = Math.imul(value ^ (value >>> 16), 2246822519);
    return (value >>> 0) / 4294967295;
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const grain = hash(x, y);
    const run = .5 + .5 * Math.sin(x * .491 + Math.sin(y * .067) * 2.1);
    const spray = Math.max(0, (hash(x >> 2, y >> 3) + grain) * .5 - .67);
    const scratch = hash(x + 79, y >> 3) > .984 && y % 8 < 6 ? .18 : 0;
    const dirt = .078 * spray + .035 * run;
    color[i] = Math.round(251 - dirt * 338 + scratch * 15);
    color[i + 1] = Math.round(250 - dirt * 357 + scratch * 15);
    color[i + 2] = Math.round(248 - dirt * 382 + scratch * 15);
    color[i + 3] = height[i + 3] = 255;
    height[i] = height[i + 1] = height[i + 2] = 144 + grain * 45 + run * 18 - spray * 70 - scratch * 200;
  }
  const texture = data => {
    const map = new THREE.DataTexture(data, size, size);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true;
    map.needsUpdate = true;
    return map;
  };
  const map = texture(color);
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = texture(height);
  const paint = new THREE.MeshPhysicalMaterial({ map, bumpMap, roughnessMap: bumpMap, bumpScale: .0105,
    roughness: .53, metalness: .47, clearcoat: .91, clearcoatRoughness: .178, envMapIntensity: 1.03 });
  paint.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 panelPoint;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\npanelPoint = position;');
    shader.fragmentShader = 'varying vec3 panelPoint;\n' + shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float splash = 1. - smoothstep(.17, .52, panelPoint.y + .033 * sin(panelPoint.z * 45.));
      diffuseColor.rgb *= 1. - splash * .22;`);
  };
  return paint;
}

function glazedWindows() {
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x638ba2, roughness: .078, metalness: .17, ior: 1.49,
    clearcoat: 1, clearcoatRoughness: .067, envMapIntensity: 1.65, transparent: true, opacity: .66,
    side: THREE.DoubleSide, forceSinglePass: true, depthWrite: false });
  glass.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      vec3 viewAxis = normalize(vViewPosition);
      float fresnel = pow(1. - clamp(abs(dot(normal, viewAxis)), 0., 1.), 2.0);
      diffuseColor.a = clamp(.28 + .58 * fresnel, .0, .88);
      outgoingLight += vec3(.025, .055, .085) * (.25 + fresnel * .82);
      #include <opaque_fragment>`);
  };
  return glass;
}

function tyreProfile() {
  const side = [[.615, -.44], [.675, -.50], [.769, -.488], [.852, -.459], [.925, -.391],
    [.974, -.313], [.991, -.243], [.990, -.182], [.973, -.167], [.973, -.143], [.993, -.126],
    [1, -.046], [.979, -.031], [.979, 0], [1, .016], [1, .046]];
  const finish = side.slice(0, -4).reverse().map(([r, y]) => [r, -y]);
  const profile = [...side, ...finish, [.615, .44], [.615, -.44]];
  return new THREE.LatheGeometry(profile.map(([radius, lateral]) => new THREE.Vector2(radius, lateral)), 32);
}

function tyreRubber() {
  const material = new THREE.MeshStandardMaterial({ roughness: .92, metalness: 0 });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 tyrePoint;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntyrePoint = position;');
    shader.fragmentShader = 'varying vec3 tyrePoint;\n' + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float r = length(tyrePoint.xz);
      float bearing = atan(tyrePoint.z, tyrePoint.x);
      float tread = smoothstep(.41, .88, cos(30. * bearing + 13. * abs(tyrePoint.y)));
      float cut = smoothstep(.91, .968, r) * (1. - smoothstep(.33, .45, abs(tyrePoint.y)));
      float sidewall = .09 * smoothstep(.33, .49, abs(tyrePoint.y)) * (sin(129. * r) + 1.);
      diffuseColor.rgb *= 1. - .38 * tread * cut - sidewall;`);
  };
  return material;
}

function alloyRim() {
  const outer = new THREE.TorusGeometry(.907, .065, 7, 36).rotateX(Math.PI / 2);
  const inner = new THREE.TorusGeometry(.821, .031, 6, 36).rotateX(Math.PI / 2);
  const rims = [outer, inner];
  for (let spoke = 0; spoke < 9; spoke++) {
    const angle = (spoke / 9) * Math.PI * 2;
    const blade = new THREE.Shape();
    const trace = [[.235, -.20], [.40, -.19], [.858, -.084], [.868, .071], [.573, .117], [.237, .17]];
    trace.forEach(([radius, twist], i) => {
      const x = radius * Math.cos(angle + twist), y = radius * Math.sin(angle + twist);
      if (i) blade.lineTo(x, y);
      else blade.moveTo(x, y);
    });
    blade.closePath();
    rims.push(new THREE.ExtrudeGeometry(blade, { depth: .092, bevelEnabled: true,
      bevelThickness: .013, bevelSize: .016, bevelSegments: 1, steps: 1 }).translate(0, 0, -.045).rotateX(-Math.PI / 2));
  }
  return joined(...rims);
}

function routeSign() {
  const art = document.createElement('canvas');
  art.width = 192;
  art.height = 88;
  const pen = art.getContext('2d');
  pen.fillStyle = '#162427';
  pen.fillRect(0, 0, 192, 88);
  pen.fillStyle = '#70f5d7';
  pen.fillRect(4, 4, 4, 80);
  pen.fillRect(184, 4, 4, 80);
  pen.textAlign = 'center';
  pen.textBaseline = 'middle';
  pen.font = 'bold 58px monospace';
  pen.fillText('07', 96, 34);
  pen.font = 'bold 16px monospace';
  pen.fillText('NIGHTLINE', 96, 71);
  const texture = new THREE.CanvasTexture(art);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const markingColumns = 4;
const markingRows = 2;
const markings = Object.freeze({ cab: 0, courier: 1, transit: 2, ferry: 3, harbor: 4, plate: 5, safety: 6, roof: 7 });

function markingMaterial() {
  const art = document.createElement('canvas');
  art.width = 1024;
  art.height = 128;
  const ctx = art.getContext('2d');
  const w = art.width / markingColumns;
  const h = art.height / markingRows;
  const tiles = [
    ['#242030', '#ffbd5b', 'CROSSWIND CAB', 'DISTRICT SERVICE'],
    ['#14243a', '#82f8de', 'NIGHT PARCEL', 'PRIORITY COURIER'],
    ['#244653', '#c6f2c2', '07 NIGHTLINE', 'CROSSWIND TRANSIT'],
    ['#19314d', '#a5f2e8', 'NIGHT FERRY', 'DISTRICT SHUTTLE   HB-02'],
    ['#5d313a', '#ffdb9e', 'HARBOR LINK', 'PORT SERVICE   HB-17'],
    ['#ece4ca', '#242a35', 'CX 6742', 'CROSSWIND REGISTRY'],
    ['#332638', '#ffd16b', 'KEEP CLEAR', 'WALKWAY ACCESS'],
    ['#2e2636', '#ffd87b', 'CAB 08', 'NIGHT CITY'],
  ];
  for (const [id, [background, ink, title, caption]] of tiles.entries()) {
    const x = id % markingColumns * w;
    const y = Math.floor(id / markingColumns) * h;
    ctx.fillStyle = background;
    ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
    ctx.fillStyle = ink;
    ctx.fillRect(x + 11, y + 10, 3, h - 20);
    ctx.fillRect(x + w - 14, y + 10, 3, h - 20);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 27px system-ui, sans-serif';
    ctx.fillText(title, x + w / 2, y + 26, w - 40);
    ctx.font = 'bold 10px monospace';
    ctx.fillText(caption, x + w / 2, y + 47, w - 40);
    if (id === markings.cab || id === markings.safety) {
      for (let corner = 0; corner < 6; corner++) {
        const stripe = corner * 12 + 19;
        ctx.fillRect(x + stripe, y + (corner % 2 ? 8 : 53), 9, 3);
        ctx.fillRect(x + w - stripe - 10, y + (corner % 2 ? 8 : 53), 9, 3);
      }
    }
  }
  const map = new THREE.CanvasTexture(art);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const material = new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: .45, toneMapped: false });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute vec4 decalTile;\n' + shader.vertexShader.replace('#include <uv_vertex>',
      '#include <uv_vertex>\nvMapUv = decalTile.xy + vMapUv * decalTile.zw;');
  };
  return material;
}

function makeGlowMaterial(time) {
  return new THREE.ShaderMaterial({
    uniforms: { time },
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    vertexShader: `
      attribute float kind;
      varying vec2 plate;
      varying float effect;
      varying vec3 tint;
      void main() {
        plate = uv;
        effect = kind;
        tint = instanceColor;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      varying vec2 plate;
      varying float effect;
      varying vec3 tint;
      void main() {
        float across = plate.x * 2.0 - 1.0;
        float forward = 1.0 - plate.y;
        float edge = smoothstep(0.0, .075, plate.x) * smoothstep(0.0, .075, 1.0 - plate.x);
        float density;
        if (effect < .5) {
          float twin = abs(abs(across) - mix(.34, .23, forward));
          float beam = max(0.0, 1.0 - twin / mix(.18, .65, forward));
          float pools = .76 + .24 * sin(forward * 27.0 + sin(across * 27.0) * .8);
          density = edge * beam * beam * smoothstep(0.0, .08, forward) * (1.0 - forward) * (1.0 - forward) * pools * .27;
        } else if (effect < 1.5) {
          float glow = max(0.0, 1.0 - length(vec2(across * 1.04, (forward - .5) * 1.94)));
          density = glow * glow * .17;
        } else {
          float back = plate.y;
          float ribs = abs(across) - mix(.20, .79, back);
          float wake = exp(-ribs * ribs * 150.0);
          float foam = max(0.0, 1.0 - abs(across) * 4.0) * .70 * (1.0 - back);
          float ripple = .42 + .58 * smoothstep(-.48, .83, sin(back * 49.0 + time * 4.8 + sin(across * 25.0)));
          density = edge * (wake + foam) * ripple * smoothstep(0.0, .1, back) * pow(1.0 - back, 1.36) * .23;
        }
        gl_FragColor = vec4(tint, density);
        #include <colorspace_fragment>
      }
    `,
  });
}

function contactMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    vertexShader: `
      varying vec2 footprint;
      void main() {
        footprint = uv;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 footprint;
      void main() {
        vec2 edge = smoothstep(vec2(.18, .47), vec2(1.0), abs(footprint * 2.0 - 1.0));
        gl_FragColor = vec4(.006, .010, .019, (1.0 - edge.x) * (1.0 - edge.y) * .53);
        #include <colorspace_fragment>
      }
    `,
  });
}

export function addCyberTraffic(scene) {
  const group = new THREE.Group();
  const street = new THREE.MeshStandardMaterial({ color: 0x262c39, roughness: .53, metalness: .14 });
  const sideStreetGeometry = new THREE.PlaneGeometry(2.90, 62.5);
  for (const x of [-32.05, 49.65]) {
    const segment = new THREE.Mesh(sideStreetGeometry, street);
    segment.position.set(x, .249, 13.1);
    segment.rotation.x = -Math.PI / 2;
    segment.receiveShadow = true;
    group.add(segment);
  }

  const time = { value: 0 };
  const west = makeRoute(westLane, 3.2);
  const east = makeRoute(eastLane, 3.2);
  const sea = makeRoute(ferryRoute, 6.2);
  const paint = weatheredPaint();
  const glass = glazedWindows();
  const trim = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .70, metalness: .09 });
  const rim = new THREE.MeshStandardMaterial({ roughness: .31, metalness: .73, envMapIntensity: 1.23 });
  const lens = new THREE.MeshPhysicalMaterial({ color: 0xbacede, roughness: .159, ior: 1.49,
    clearcoat: .85, clearcoatRoughness: .11, transparent: true, opacity: .22, depthWrite: false });
  const light = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const lightSpill = makeGlowMaterial(time);
  const sign = new THREE.MeshBasicMaterial({ map: routeSign(), toneMapped: false });
  const batches = {
    body: { geometry: bevelBody(), material: trim, parts: [] },
    carPaint: { geometry: joined(roadShell(carChassis, carAxles), cap([
      [-.643, .402, .906, .937], [-.515, .500, .918, .984], [-.21, .518, .918, .999],
      [.164, .512, .920, .994], [.371, .496, .919, .979], [.442, .429, .912, .941],
    ])), material: paint, parts: [] },
    vanPaint: { geometry: joined(roadShell(vanChassis, vanAxles, .276), pod([
      [-1.682, .650, .676, 1.281], [-1.58, .731, .686, 1.375], [-.89, .753, .688, 1.414],
      [-.28, .742, .690, 1.406], [.119, .711, .696, 1.341], [.180, .651, .692, 1.295],
    ]), cap([
      [-.072, .592, 1.182, 1.335], [.221, .665, 1.182, 1.331], [.730, .643, 1.190, 1.306], [.923, .621, 1.19, 1.257], [.968, .566, 1.168, 1.223],
    ])), material: paint, parts: [] },
    busPaint: { geometry: joined(roadShell(busChassis, busAxles, .276), cap([
      [-1.61, .643, 1.145, 1.235], [-1.475, .766, 1.154, 1.307], [-.98, .816, 1.157, 1.347],
      [0, .818, 1.155, 1.342], [1.00, .811, 1.155, 1.345], [1.462, .767, 1.156, 1.324], [1.58, .692, 1.146, 1.255],
    ])), material: paint, parts: [] },
    cabinPaint: { geometry: joined(pod([
      [-1.99, .97, .552, .993], [-1.79, 1.066, .552, 1.030], [-.6, 1.101, .569, 1.031],
      [.86, 1.109, .592, 1.039], [1.85, 1.092, .643, 1.042], [2.175, .983, .665, 1.007],
    ]), cap([
      [-1.875, .93, 1.619, 1.699], [-1.65, 1.037, 1.626, 1.792], [-.27, 1.086, 1.632, 1.805],
      [1.32, 1.082, 1.633, 1.798], [1.89, 1.055, 1.621, 1.747], [1.998, .946, 1.609, 1.687],
    ])), material: paint, parts: [] },
    carGlass: { geometry: windowGeometry(carCanopy, [[0, 1]]), material: glass, parts: [] },
    vanGlass: { geometry: windowGeometry(vanCanopy, [[.09, 1]], [false, true]), material: glass, parts: [] },
    busGlass: { geometry: windowGeometry(busCanopy, [[0, 1]]), material: glass, parts: [] },
    ferryGlass: { geometry: windowGeometry(cabinCanopy, [[0, 1]]), material: glass, parts: [] },
    fittings: { geometry: new THREE.BoxGeometry(), material: trim, parts: [] },
    tubes: { geometry: new THREE.CylinderGeometry(.5, .5, 1, 8), material: trim, parts: [] },
    wheels: { geometry: new THREE.CylinderGeometry(1, 1, 1, 14), material: trim, parts: [] },
    tyres: { geometry: tyreProfile(), material: tyreRubber(), parts: [] },
    rims: { geometry: alloyRim(), material: rim, parts: [] },
    lamps: { geometry: new THREE.BoxGeometry(), material: light, parts: [] },
    lenses: { geometry: bevelBody(), material: lens, parts: [] },
    hull: { geometry: marineShell(), material: paint, parts: [] },
    contact: { geometry: new THREE.PlaneGeometry(), material: contactMaterial(), parts: [] },
    spill: { geometry: new THREE.PlaneGeometry(), material: lightSpill, parts: [] },
    sign: { geometry: new THREE.PlaneGeometry(), material: sign, parts: [] },
    decal: { geometry: new THREE.PlaneGeometry(), material: markingMaterial(), parts: [] },
  };
  const units = [];
  const audioSources = [];
  const piece = new THREE.Object3D();
  const world = new THREE.Matrix4();
  const tint = new THREE.Color();
  const upright = new THREE.Vector3(0, 1, 0);
  const reach = new THREE.Vector3();

  function unit(path, start, speed, y = .265, drifting = 0) {
    const actor = { path, start, speed, y, drifting, transform: new THREE.Object3D() };
    units.push(actor);
    return actor;
  }

  function addMotorSource(actor, kind) {
    const source = { id: audioSources.length + 1, kind, x: 0, y: 0, z: 0, vx: 0, vz: 0, speed: 0 };
    audioSources.push(source);
    actor.motor = source;
  }

  function add(actor, batch, color, x, y, z, w, h, d, pitch = 0, roll = 0, kind = 0, yaw = 0) {
    piece.position.set(x, y, z);
    piece.scale.set(w, h, d);
    piece.rotation.set(pitch, yaw, roll);
    piece.updateMatrix();
    batches[batch].parts.push({ actor, matrix: piece.matrix.clone(), color, kind });
  }

  const rubber = 0x151b27;
  const instrumentPanel = 0x26323e;
  const lampWhite = 0xc6f4ff;
  const brakeRed = 0xff355f;
  const signalAmber = 0xff9e3e;
  const steel = 0x8595a3;

  function decal(actor, mark, x, y, z, w, h, yaw = 0, pitch = 0) {
    add(actor, 'decal', 0xffffff, x, y, z, w, h, 1, pitch, 0, mark, yaw);
  }

  function beam(actor, color, start, end, width, depth = width, round = false) {
    reach.set(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
    const length = reach.length();
    piece.position.set((start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2);
    piece.scale.set(width, length, depth);
    piece.quaternion.setFromUnitVectors(upright, reach.multiplyScalar(1 / length));
    piece.updateMatrix();
    batches[round ? 'tubes' : 'fittings'].parts.push({ actor, matrix: piece.matrix.clone(), color, kind: 0 });
  }

  function windowPosts(actor, {belt, roof}, bars, color, width, scale = 1) {
    const point = ([x, y, rear, front], side, at) => [x * side * scale, y, THREE.MathUtils.lerp(rear, front, at) * scale];
    for (const side of [-1, 1]) {
      for (const at of bars) beam(actor, color, point(belt, side, at), point(roof, side, at), width * scale, width * scale * .79);
      beam(actor, color, point(belt, side, 0), point(belt, side, 1), width * .65 * scale);
    }
  }

  function wipers(actor, {belt, roof}) {
    const height = roof[1] - belt[1];
    const point = (x, rise) => [x, belt[1] + rise, belt[3] + (roof[3] - belt[3]) * rise / height + .011];
    for (const [hinge, offset] of [[-.39, .34], [.20, .26]]) {
      const blade = point(hinge + offset * .42, height * .25);
      beam(actor, 0x171e27, point(hinge, height * .081), blade, .009, .009);
      beam(actor, 0x141c28, point(hinge - .047, height * .185), point(hinge + offset, height * .32), .012, .011);
    }
  }

  function seats(actor, rows, ample, base, tint, scale = 1) {
    for (const [index, z] of rows.entries()) for (const side of [-1, 1]) {
      const x = ample * side * scale;
      const color = index % 2 ? 0x685350 : tint;
      add(actor, 'body', instrumentPanel, x, base + .052, z * scale, .296 * scale, .094, .29 * scale);
      add(actor, 'body', color, x, base + .157, (z - .116) * scale, .272 * scale, .304, .082 * scale, -.16);
      add(actor, 'fittings', color, x, base + .255, (z - .128) * scale, .18 * scale, .089, .076 * scale);
    }
  }

  function axles(actor, width, axlesAt) {
    for (const z of axlesAt) {
      for (const side of [-1, 1]) {
        const mount = width * .47 * side;
        add(actor, 'tyres', 0x1b2028, mount, .239, z, .235, .196, .235, 0, Math.PI / 2, 1);
        add(actor, 'wheels', 0x343a45, mount + .036 * side, .239, z, .149, .029, .149, 0, Math.PI / 2);
        add(actor, 'wheels', 0x606471, mount + .061 * side, .239, z, .124, .019, .124, 0, Math.PI / 2);
        add(actor, 'wheels', 0x9b634f, mount + .073 * side, .289, z - .064, .027, .023, .052, 0, Math.PI / 2);
        add(actor, 'rims', 0xabb0b3, mount + .103 * side, .239, z, .158, .078, .158, 0, Math.PI / 2);
        add(actor, 'wheels', 0x525d69, mount + .107 * side, .239, z, .045, .022, .045, 0, Math.PI / 2);
        add(actor, 'wheels', 0x7c8894, mount + .12 * side, .239, z, .027, .012, .027, 0, Math.PI / 2);
        for (let bolt = 0; bolt < 5; bolt++) {
          const polar = bolt * Math.PI * 2 / 5;
          add(actor, 'wheels', steel, mount + .119 * side, .239 + Math.sin(polar) * .034, z + Math.cos(polar) * .034, .0061, .009, .0061, 0, Math.PI / 2);
        }
      }
    }
  }

  function frontLights(actor, width, nose, rise, beamLength) {
    for (const side of [-1, 1]) {
      const x = width * .315 * side;
      add(actor, 'body', rubber, x, rise + .001, nose - .033, width * .267, .127, .086);
      add(actor, 'body', 0x9aaab3, x, rise + .011, nose + .004, width * .233, .079, .039);
      add(actor, 'fittings', 0x2b4357, x, rise + .011, nose + .021, width * .212, .060, .016);
      for (const bulb of [-1, 1]) add(actor, 'lamps', lampWhite, x + bulb * width * .048, rise + .012, nose + .034, width * .071, .029, .012);
      for (let rib = -4; rib <= 4; rib++) {
        add(actor, 'fittings', 0xa2bdcc, x + rib * width * .0205, rise + .011, nose + .041, .010, .069, .011);
      }
      add(actor, 'lenses', 0xffffff, x, rise + .012, nose + .045, width * .246, .091, .034);
      add(actor, 'lamps', signalAmber, width * .445 * side, rise - .028, nose - .005, width * .047, .026, .025);
    }
    add(actor, 'fittings', 0x0d1729, 0, rise - .1, nose - .028, width * .37, .172, .073);
    for (const strip of [-.05, 0, .05]) add(actor, 'fittings', steel, 0, rise - .10 + strip, nose + .013, width * .34, .017, .018);
    add(actor, 'spill', 0x8bd8ff, 0, .023, nose + beamLength * .46, width * 2.12, beamLength, 1, -Math.PI / 2);
  }

  function rearLights(actor, width, back, rise) {
    for (const side of [-1, 1]) {
      add(actor, 'fittings', rubber, width * .36 * side, rise, back + .018, width * .22, .125, .060);
      add(actor, 'lamps', brakeRed, width * .37 * side, rise + .023, back - .009, width * .155, .050, .038);
      add(actor, 'lamps', signalAmber, width * .37 * side, rise - .027, back - .009, width * .15, .024, .036);
    }
    decal(actor, markings.plate, 0, rise - .098, back - .027, width * .29, .115, Math.PI);
    add(actor, 'spill', brakeRed, 0, .022, back - .8, width * 1.55, 1.94, 1, -Math.PI / 2, 0, 1);
  }

  function contact(actor, width, length) {
    add(actor, 'contact', 0xffffff, 0, .019, 0, width + .48, length + .55, 1, -Math.PI / 2);
  }

  function car(path, progress, speed, color, roofBadge) {
    const actor = unit(path, progress, speed);
    addMotorSource(actor, roofBadge ? 'taxi' : 'car');
    add(actor, 'carPaint', color, 0, 0, 0, 1, 1, 1);
    add(actor, 'carGlass', 0xffffff, 0, 0, 0, 1, 1, 1);
    windowPosts(actor, carCanopy, [0, .446, 1], 0x272b33, .038);
    wipers(actor, carCanopy);
    seats(actor, [.12, -.46], .235, .559, 0xb89a7d);
    add(actor, 'body', instrumentPanel, 0, .645, .598, 1.14, .113, .234, -.13);
    add(actor, 'fittings', 0x5c6b68, -.19, .714, .524, .27, .036, .063, -.09);
    add(actor, 'lamps', 0x74dbb7, -.188, .733, .503, .228, .012, .023);
    add(actor, 'body', rubber, 0, .254, 1.355, 1.24, .110, .11);
    add(actor, 'body', rubber, 0, .247, -1.357, 1.26, .092, .124);
    for (const side of [-1, 1]) {
      const yaw = side * Math.PI / 2;
      add(actor, 'body', 0x333d49, .689 * side, .251, -.018, .079, .111, 1.17);
      add(actor, 'fittings', 0x4f4650, .703 * side, .277, -.053, .029, .026, 1.12);
      // Fine stamped panel lines follow the actual shoulder and end before each arch.
      const seam = (a, b) => beam(actor, 0x49404a, [a[0]*side,a[1],a[2]], [b[0]*side,b[1],b[2]], .012, .012);
      const door = [[.694,.551,.525],[.708,.517,.485],[.710,.302,.467],[.697,.285,-.520],[.701,.470,-.535],[.683,.556,-.602]];
      for (let i = 1; i < door.length; i++) seam(door[i-1],door[i]);
      seam([.696,.554,-.180],[.706,.296,-.207]);
      for (const z of [-.368, -.045]) {
        add(actor, 'body', 0x322d36, .706*side, .501, z, .025, .039, .163);
        add(actor, 'body', 0x9da4a9, .721*side, .510, z-.012, .026, .022, .132);
      }
      beam(actor, 0x5e514f, [.454*side,.594,.568],[.482*side,.528,1.241],.011,.011);
      add(actor, 'body', rubber, .71 * side, .690, .58, .169, .093, .157);
      add(actor, 'fittings', 0x94a9b7, .72 * side, .693, .514, .124, .061, .014);
      if (roofBadge) decal(actor, markings.cab, .714 * side, .451, -.055, .87, .143, yaw);
    }
    if (roofBadge) {
      add(actor, 'fittings', rubber, 0, .999, -.19, .52, .09, .30);
      add(actor, 'lamps', 0xffc66d, 0, 1.061, -.19, .43, .098, .25);
      decal(actor, markings.roof, 0, 1.010, -.404, .68, .221, 0, -Math.PI / 2);
    }
    axles(actor, 1.43, carAxles);
    frontLights(actor, 1.34, 1.407, .414, 4.5);
    rearLights(actor, 1.34, -1.400, .431);
    contact(actor, 1.43, 2.75);
  }

  function courier(path, progress, speed) {
    const actor = unit(path, progress, speed);
    addMotorSource(actor, 'courier');
    add(actor, 'vanPaint', 0x627a9d, 0, 0, 0, 1, 1, 1);
    add(actor, 'vanGlass', 0xffffff, 0, 0, 0, 1, 1, 1);
    windowPosts(actor, vanCanopy, [.076, .463, 1], 0x313544, .063);
    wipers(actor, vanCanopy);
    seats(actor, [.55], .267, .704, 0xc8a887);
    add(actor, 'body', instrumentPanel, 0, .778, 1.16, 1.24, .147, .160, -.17);
    add(actor, 'lamps', 0x73ccb6, -.25, .851, 1.1, .228, .018, .059, -.22);
    add(actor, 'fittings', 0x3e5266, 0, 1.421, -.55, .78, .047, .88);
    for (const rib of [-.72, -.48, -.24, .02, .26]) {
      add(actor, 'fittings', steel, 0, 1.442, rib, .76, .022, .036);
    }
    for (const side of [-1, 1]) {
      add(actor, 'fittings', 0x3aa29f, side * .757, .809, -.679, .019, .085, 1.61);
      add(actor, 'body', rubber, side * .669, .611, -1.681, .105, .251, .161);
      add(actor, 'fittings', 0x627389, side * .754, .397, -.543, .024, .067, .98);
      add(actor, 'fittings', 0x29384c, side * .749, 1.033, -1.264, .018, .506, .021);
      add(actor, 'fittings', steel, side * .759, .943, -.428, .041, .061, .145);
      add(actor, 'body', rubber, side * .746, .946, 1.129, .163, .136, .166);
      add(actor, 'fittings', steel, side * .756, .953, 1.055, .114, .078, .017);
      decal(actor, markings.courier, side * .761, 1.111, -.65, 1.04, .246, side * Math.PI / 2);
    }
    for (const side of [-1, 1]) {
      add(actor, 'body', 0x515c75, side * .31, 1.045, -1.688, .558, .504, .043);
      add(actor, 'fittings', steel, side * .038, .918, -1.718, .034, .115, .043);
    }
    decal(actor, markings.courier, 0, 1.206, -1.719, 1.12, .18, Math.PI);
    axles(actor, 1.56, vanAxles);
    frontLights(actor, 1.56, 1.743, .52, 5);
    rearLights(actor, 1.56, -1.743, .49);
    contact(actor, 1.56, 3.44);
  }

  function shuttle(path, progress, speed) {
    const transitColor = 0x428375;
    const transitTrim = 0xc5d6b5;
    const front = unit(path, progress, speed);
    const rear = unit(path, progress - 3.42, speed);
    const joint = unit(path, progress - 1.71, speed);
    addMotorSource(front, 'shuttle');
    for (const actor of [front, rear]) {
      add(actor, 'busPaint', transitColor, 0, 0, 0, 1, 1, 1);
      add(actor, 'busGlass', 0xffffff, 0, 0, 0, 1, 1, 1);
      windowPosts(actor, busCanopy, [0, .209, .40, .61, .802, 1], 0x38514b, .067);
      seats(actor, [-1.05, -.59, -.12, .37, .85], .491, .749, 0xb8a78a);
      add(actor, 'fittings', transitTrim, 0, 1.324, -.18, .68, .075, 1.45);
      for (const slit of [-.42, -.26, -.10, .06]) {
        add(actor, 'fittings', 0x687676, 0, 1.366, slit, .57, .024, .034);
      }
      contact(actor, 1.64, 3.22);
      for (const side of [-1, 1]) {
        add(actor, 'fittings', transitTrim, side * .8, .704, 0, .041, .071, 2.85);
        add(actor, 'lamps', 0xcab88a, side * .50, 1.155, -.055, .041, .028, 2.585);
        add(actor, 'fittings', rubber, side * .814, .519, -.49, .023, .31, .024);
        decal(actor, markings.transit, side * .838, .611, -.04, 1.60, .155, side * Math.PI / 2);
        add(actor, 'body', 0x39464b, side * .777, .225, -.041, .091, .095, 1.46);
      }
    }
    add(joint, 'body', rubber, 0, .718, 0, 1.29, .99, 1.17);
    for (const z of [-.27, -.07, .13, .33]) {
      add(joint, 'fittings', 0x364154, 0, .72, z, 1.32, 1.01, .037);
    }
    axles(front, 1.64, busAxles);
    axles(rear, 1.64, busAxles);
    frontLights(front, 1.64, 1.634, .508, 5.6);
    rearLights(rear, 1.64, -1.634, .514);
    add(front, 'fittings', instrumentPanel, 0, .813, 1.37, 1.23, .113, .203, -.14);
    wipers(front, busCanopy);
    add(front, 'sign', 0xffffff, 0, 1.36, .795, .71, .324, 1, -Math.PI / 2);
    add(front, 'sign', 0xffffff, 0, 1.136, 1.548, .79, .176, 1, -.13);
  }

  function ferry(path, progress, speed, color, small) {
    const boat = unit(path, progress, speed, -.399, .016);
    const wake = unit(path, progress, speed, -.228);
    const scale = small ? .63 : 1;
    const put = (batch, tint, x, y, z, w, h, d, pitch = 0, kind = 0, yaw = 0) =>
      add(boat, batch, tint, x * scale, y, z * scale, w * scale, h, d * scale, pitch, 0, kind, yaw);
    const stripe = small ? 0xc37561 : 0x3d9b92;
    const livery = small ? markings.harbor : markings.ferry;
    put('hull', color, 0, 0, 0, 1, 1, 1);
    put('cabinPaint', small ? 0xbfae96 : 0xbcc5b5, 0, 0, 0, 1, 1, 1);
    put('ferryGlass', 0xffffff, 0, 0, 0, 1, 1, 1);
    windowPosts(boat, cabinCanopy, [0, .193, .37, .557, .757, 1], 0x46575d, .071, scale);
    seats(boat, [-1.36, -.89, -.41, .12, .647, 1.16], .66, .799, 0xba9574, scale);
    put('body', 0x94a59f, 0, 1.805, .912, 1.46, .106, .875);
    put('fittings', 0x253746, 0, 1.869, .91, 1.25, .047, .70);
    for (const rib of [-.31, -.132, .047, .225]) {
      put('fittings', steel, 0, 1.897, .91 + rib, 1.21, .021, .034);
    }
    put('fittings', rubber, 0, 1.92, -.63, .37, .62, .65);
    put('fittings', stripe, 0, 2.20, -.63, .40, .108, .68);
    put('fittings', 0x86938f, .23, 2.34, .76, .063, 1.09, .063);
    put('lamps', lampWhite, .23, 2.881, .76, .104, .102, .104);
    put('body', 0x344856, 0, 1.136, 1.859, 1.78, .174, .24, -.19);
    if (!small) wipers(boat, cabinCanopy);
    put('lamps', 0x95d9be, -.43, 1.224, 1.784, .23, .025, .075);
    put('body', 0x61706e, 0, .725, 2.62, 1.05, .053, .53);
    put('decal', 0xffffff, 0, .754, 2.61, .99, .25, 1, -Math.PI / 2, markings.safety);
    put('decal', 0xffffff, 0, 1.822, -.18, 1.31, .30, 1, -Math.PI / 2, livery);
    for (const side of [-1, 1]) {
      const handrail = (from, to, width, hue) => beam(boat, hue,
        [from[0] * side * scale, from[1], from[2] * scale], [to[0] * side * scale, to[1], to[2] * scale], width * scale, width * scale, true);
      put('lamps', side < 0 ? brakeRed : 0x72fadf, side * 1.06, 1.637, 1.74, .101, .092, .104);
      put('lamps', 0xf2d79d, side * .61, 1.574, -.12, .047, .038, 3.39);
      const gunwale = [[.99, .563, -2.68], [1.249, .581, -1.84], [1.266, .619, .60], [1.184, .648, 1.87], [.918, .692, 2.58], [.608, .735, 3.13]];
      for (let i = 1; i < gunwale.length; i++) handrail(gunwale[i - 1], gunwale[i], .068, stripe);
      const prowRail = [[1.045, .990, 2.15], [.88, 1.032, 2.56], [.59, 1.082, 3.13], [.32, 1.105, 3.53], [.057, 1.104, 3.66]];
      for (let i = 1; i < prowRail.length; i++) handrail(prowRail[i - 1], prowRail[i], .043, steel);
      for (const [x, y, z] of prowRail.slice(0, -1)) handrail([x, y - .305, z], [x, y, z], .038, steel);
      for (const z of [-1.35, -.63, .335, 1.38]) {
        add(boat, 'wheels', rubber, side * 1.104 * scale, .853, z * scale, .105, .036, .109, 0, Math.PI / 2);
        add(boat, 'wheels', steel, side * 1.126 * scale, .853, z * scale, .091, .017, .094, 0, Math.PI / 2);
        add(boat, 'wheels', 0x465f69, side * 1.138 * scale, .854, z * scale, .071, .02, .073, 0, Math.PI / 2);
      }
      handrail([1.174, .928, -2.47], [1.167, .953, -1.96], .044, steel);
      handrail([1.174, .891, -2.63], [1.174, .928, -2.47], .044, steel);
      handrail([1.174, .63, -2.47], [1.174, .928, -2.47], .041, steel);
      put('decal', 0xffffff, side * 1.123, .937, -.12, 1.67, .119, 1, 0, livery, side * Math.PI / 2);
    }
    add(wake, 'spill', 0x87c4d7, 0, 0, -8.64 * scale, 6.5 * scale, 12.3 * scale, 1, -Math.PI / 2, 0, 2);
  }

  shuttle(west, 61, 4.8);
  car(west, 26, 4.8, 0xa05c71, false);
  courier(west, 113, 4.8);
  car(east, 31, 5.4, 0xdf963c, true);
  car(east, 78, 5.4, 0x7373b7, false);
  courier(east, 144, 5.4);
  const quayLane = makeRoute([[87.35, -35], [87.35, 51], [90.65, 51], [90.65, -35]], 1.65);
  const heightsLane = makeRoute([[87.35, 56], [87.35, 113], [90.65, 113], [90.65, 56]], 1.65);
  const yardLane = makeRoute([[-37, 85.35], [72, 85.35], [72, 88.65], [-37, 88.65]], 1.65);
  car(quayLane, 24, 4.9, 0xd59551, true);
  courier(quayLane, 109, 4.9);
  car(heightsLane, 15, 4.4, 0x667da8, false);
  courier(heightsLane, 69, 4.4);
  car(yardLane, 13, 5.1, 0xa44454, false);
  courier(yardLane, 109, 5.1);
  ferry(sea, 282, 4.05, 0x213e55, false);
  ferry(sea, 451, 3.6, 0x874949, true);

  for (const [key, batch] of Object.entries(batches)) {
    const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.parts.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.receiveShadow = key === 'body' || key === 'hull' || key === 'fittings' || key.endsWith('Paint');
    if (key === 'spill') {
      batch.geometry.setAttribute('kind', new THREE.InstancedBufferAttribute(Float32Array.from(batch.parts, part => part.kind), 1));
      mesh.renderOrder = 1;
    }
    if (key === 'decal') {
      const tiles = batch.parts.flatMap(({ kind }) => [
        (kind % markingColumns + .01) / markingColumns,
        (markingRows - 1 - Math.floor(kind / markingColumns) + .01) / markingRows,
        .98 / markingColumns, .98 / markingRows,
      ]);
      batch.geometry.setAttribute('decalTile', new THREE.InstancedBufferAttribute(Float32Array.from(tiles), 4));
    }
    if (key !== 'contact') batch.parts.forEach(({ color }, index) => mesh.setColorAt(index, tint.setHex(color)));
    batch.mesh = mesh;
    group.add(mesh);
  }
  const roadSpray = addRoadSpray(group, [...batches.tyres.parts, ...batches.rims.parts, ...batches.wheels.parts]);
  scene.add(group);

  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  let lastTime = -1;
  function updateTraffic(elapsed) {
    time.value = reducedMotion?.matches ? 0 : elapsed;
    if (lastTime === time.value) return;
    const frameTime = lastTime >= 0 ? time.value - lastTime : 0;
    lastTime = time.value;
    for (const { path, start, speed, transform, y, drifting, motor } of units) {
      const heading = path(start + time.value * speed, transform.position);
      const wave = drifting * Math.sin(time.value * 1.7 + start);
      const yawChange = heading - transform.rotation.y;
      const yawRate = frameTime > 0 && frameTime < .2 ? Math.atan2(Math.sin(yawChange), Math.cos(yawChange)) / frameTime : 0;
      const lean = THREE.MathUtils.clamp(yawRate * .034, -.063, .063);
      const roll = y > 0 ? THREE.MathUtils.lerp(transform.rotation.z, lean, 1 - Math.exp(-9 * Math.max(0, frameTime))) : wave * .63;
      transform.position.y = y + wave;
      transform.rotation.set(wave * .42, heading, roll, 'YXZ');
      transform.updateMatrix();
      if (motor) {
        motor.x = transform.position.x;
        motor.y = transform.position.y + .29;
        motor.z = transform.position.z;
        motor.speed = reducedMotion?.matches ? 0 : speed;
        motor.vx = Math.sin(heading) * motor.speed;
        motor.vz = Math.cos(heading) * motor.speed;
      }
    }
    roadSpray.update(time.value, !reducedMotion?.matches);
    for (const { mesh, parts } of Object.values(batches)) {
      parts.forEach((part, index) => {
        const pose = roadSpray.wheels.get(part) || part.actor.transform.matrix;
        mesh.setMatrixAt(index, world.multiplyMatrices(pose, part.matrix));
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
  updateTraffic.audioSources = audioSources;
  updateTraffic(0);
  return updateTraffic;
}
