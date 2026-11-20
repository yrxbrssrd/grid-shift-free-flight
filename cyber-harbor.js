import * as THREE from './vendor/three.module.js';
import { reflectCity } from './city-reflections.js';
import { createStreetSurfaces } from './street-surfaces.js';
import { addOuterCity } from './outer-city.js';
import { addWaterfrontLife } from './waterfront-life.js';

const amber = 0xffa847;
const violet = 0xb06bff;
const teal = 0x3bfce2;
const coral = 0xff538f;
const shoreline = [
  [-54, -36], [-47, -51], [-27, -54], [-17, -59], [24, -59], [36, -53], [52, -53],
  [57, -40], [55, -21], [59, -13], [59, 20], [54, 29], [51, 48], [33, 53], [18, 53],
  [13, 58], [-19, 58], [-31, 51], [-51, 49], [-56, 39], [-57, 16], [-61, 10], [-61, -20], [-55, -25],
];
const junctionLights = [[-7, 8, 0xffc78b], [6, -17, 0xbadbf4], [-27, -20, amber], [26, -24, violet], [-3, 38, teal]];
const waterfrontLights = [[-50, -50, amber], [-18, -58, teal], [18, -57, coral], [48, -52, violet], [58, -13, teal], [-60, -18, coral], [-51, 48, amber], [14, 57, teal]];


function randomSeed(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function material(color, metalness = .2, roughness = .65) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}

function neon(color) {
  return new THREE.MeshBasicMaterial({ color, toneMapped: false });
}

function planarUV(geometry, tileSize) {
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / tileSize, pos.getY(i) / tileSize);
  return geometry;
}

const craftMaskSpan = 5.6;

function craftSilhouette(model) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const pen = canvas.getContext('2d');
  const center = canvas.width / 2;
  const scale = canvas.width / craftMaskSpan;
  const relative = new THREE.Matrix4();
  const vertex = new THREE.Vector3();
  model.updateWorldMatrix(true, true);
  const rootInverse = model.matrixWorld.clone().invert();
  pen.fillStyle = '#000';
  pen.fillRect(0, 0, canvas.width, canvas.height);
  pen.beginPath();
  model.traverseVisible(part => {
    if (!part.isMesh || part.isInstancedMesh || part.material.transparent || !part.material.depthWrite) return;
    const positions = part.geometry.getAttribute('position');
    if (!positions) return;
    const indices = part.geometry.index;
    const plane = new Float32Array(positions.count * 2);
    relative.multiplyMatrices(rootInverse, part.matrixWorld);
    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i).applyMatrix4(relative);
      plane[i * 2] = center + vertex.x * scale;
      plane[i * 2 + 1] = center + vertex.z * scale;
    }
    const count = indices ? indices.count : positions.count;
    for (let i = 0; i + 2 < count; i += 3) {
      const a = 2 * (indices ? indices.getX(i) : i);
      const b = 2 * (indices ? indices.getX(i + 1) : i + 1);
      const c = 2 * (indices ? indices.getX(i + 2) : i + 2);
      const signedArea = (plane[b] - plane[a]) * (plane[c + 1] - plane[a + 1])
        - (plane[c] - plane[a]) * (plane[b + 1] - plane[a + 1]);
      if (Math.abs(signedArea) < .001) continue;
      // Use one winding so overlapping hull, wings and cowlings fill as a union.
      const next = signedArea > 0 ? b : c;
      const last = signedArea > 0 ? c : b;
      pen.moveTo(plane[a], plane[a + 1]);
      pen.lineTo(plane[next], plane[next + 1]);
      pen.lineTo(plane[last], plane[last + 1]);
      pen.closePath();
    }
  });
  pen.fillStyle = '#fff';
  pen.fill();
  return new THREE.CanvasTexture(canvas);
}

export function addCyberHarbor(scene, reflectionUniforms) {
  const harbor = new THREE.Group();
  scene.add(harbor);
  const surfaces = createStreetSurfaces();
  const clock = { value: 0 };
  const atlasSize = 256;
  const groundData = new Uint8Array(atlasSize * atlasSize * 4);
  const groundLight = new THREE.DataTexture(groundData, atlasSize, atlasSize);
  groundLight.minFilter = groundLight.magFilter = THREE.LinearFilter;
  const craft = { value: new THREE.Vector4() };
  const craftHeading = { value: new THREE.Vector2(1, 0) };
  const craftMask = { value: new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1) };
  craftMask.value.needsUpdate = true;
  const pavement = new THREE.MeshStandardMaterial({ ...surfaces.concrete, bumpScale: .105, roughness: .94, metalness: .03 });
  const wetRoad = new THREE.MeshStandardMaterial({ ...surfaces.asphalt, bumpScale: .080, roughness: .91, metalness: .02 });
  const stone = new THREE.MeshStandardMaterial({ ...surfaces.pavers, bumpScale: .105, roughness: .95, metalness: .02 });
  for (const surface of [pavement, wetRoad, stone]) {
    surface.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, reflectionUniforms, { groundLight: { value: groundLight }, harborTime: clock, craft,
        craftHeading, craftMask,
        roadFilm: { value: surface === wetRoad ? .95 : surface === stone ? .5 : .55 } });
      shader.vertexShader = `varying vec3 harborPoint;
        varying vec4 mirrorCoord;
        uniform mat4 cityProjection;\n` + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        harborPoint = (modelMatrix * vec4(position, 1.)).xyz;
        mirrorCoord = cityProjection * vec4(harborPoint, 1.);`);
      shader.fragmentShader = `varying vec3 harborPoint;
        varying vec4 mirrorCoord;
        uniform sampler2D groundLight;
        uniform sampler2D cityMirror;
        uniform sampler2D craftMask;
        uniform float harborTime;
        uniform vec4 craft;
        uniform vec2 craftHeading;
        uniform float roadFilm;
        vec2 craftUv(vec2 offset) {
          vec2 local = vec2(dot(offset, vec2(craftHeading.x, -craftHeading.y)), dot(offset, craftHeading.yx));
          return .5 + local * vec2(1., -1.) / ${craftMaskSpan.toFixed(1)};
        }
        ` + shader.fragmentShader.replace('#include <opaque_fragment>', `
          vec2 p = harborPoint.xz;
          vec4 lightmap = texture2D(groundLight, (p + 64.) / 220.);
          outgoingLight = outgoingLight * (.45 + .55 * lightmap.a) + lightmap.rgb * .39;
          float altitude = max(.1, craft.y - harborPoint.y);
          vec2 underneath = p - craft.xz;
          float soften = log2(1. + altitude * .53);
          float contact = texture2D(craftMask, craftUv(underneath), .18 + soften).r * exp(-altitude * .22);
          vec2 projectedMoon = underneath + altitude * vec2(.825, -1.4375);
          float penumbra = texture2D(craftMask, craftUv(projectedMoon), .10 + soften * 1.12).r
            * exp(-altitude * .080) * craft.w;
          outgoingLight *= 1. - .54 * contact - .53 * penumbra;
          vec2 uv = .5 + .5 * mirrorCoord.xy / max(.001, mirrorCoord.w);
          vec3 eye = normalize(cameraPosition - harborPoint);
          float pool = .45 * sin(p.x * .53 + p.y * .18) + .40 * cos(p.y * .62 + 1.7 * sin(p.x * .4)) + .2 * sin(p.x * 1.57 - p.y * .86);
          float wet = smoothstep(-.70, .70, pool);
          float waves = sin(p.y * 15. + sin(p.x * 4.) * 2. + harborTime * 1.6);
          float rough = mix(.004, .0008, wet);
          uv += rough * vec2(sin(p.x * 8. - p.y * 11.), waves);
          vec2 blur = vec2(rough * .85, rough * 2.8);
          vec3 film = texture2D(cityMirror, uv).rgb * .50
                    + (texture2D(cityMirror, uv + blur).rgb + texture2D(cityMirror, uv - blur).rgb) * .25;
          float edge = smoothstep(0., .045, min(min(uv.x, 1.-uv.x), min(uv.y, 1.-uv.y)));
          float grazing = pow(1. - clamp(eye.y, 0., 1.), 3.);
          float porous = 1. - smoothstep(.32, .88, roughnessFactor);
          float fresnel = (.052 + .74 * grazing) * (.14 + .65 * wet + .21 * porous);
          outgoingLight = mix(outgoingLight, film, edge * roadFilm * fresnel);
          #include <opaque_fragment>`);
    };
  }

  const shore = new THREE.Shape(shoreline.map(([x, z]) => new THREE.Vector2(x, -z)));
  const seawall = new THREE.Mesh(new THREE.ExtrudeGeometry(shore, { depth: .55, bevelEnabled: true, bevelSize: .16, bevelThickness: .12, bevelSegments: 1, steps: 1 }), material(0x3b4865, .3));
  seawall.rotation.x = -Math.PI / 2;
  seawall.position.y = -.49;
  harbor.add(seawall);
  const apron = new THREE.Mesh(planarUV(new THREE.ShapeGeometry(shore), 9.6), pavement);
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = .23;
  apron.receiveShadow = true;
  harbor.add(apron);
  for (const [x, z, w, d, offset = 0] of [[0, -3, 8.5, 108], [0, -3.5, 12.4, 17, .004], [0, -16, 112, 7.6, .008], [0, 45, 100, 5.8, .008], [-44, 10.7, 8.6, 4.1], [43, -20, 15.7, 3.4], [48, 12, 23.3, 4.3], [-10, 47, 4.7, 14.5]]) {
    const road = new THREE.Mesh(planarUV(new THREE.PlaneGeometry(w, d), 10.8), wetRoad);
    road.rotation.x = -Math.PI / 2;
    road.position.set(x, .253 + offset, z);
    road.receiveShadow = true;
    harbor.add(road);
  }

  // Stone sidewalks split into individual blocks at intersections and run down the market alleys.
  const walks = [
    [-7.6, 23, 6.3, 33], [8.15, 23, 7.1, 33], [-8.7, -4, 4.7, 14.2], [8.2, -4, 3.8, 14.2],
    [-19, 5.1, 13.8, 4.3], [22, 14.0, 9.6, 4.1], [-26, -11.6, 30, 2.2], [27, -11.6, 35, 2.2],
    [-24, -20.7, 30, 2.1], [26, -21.0, 36, 2.2], [39, 38.9, 15, 4.5], [-41, 38.9, 20, 4.7],
  ];
  for (const [x, z, w, d] of walks) {
    const paving = new THREE.Mesh(planarUV(new THREE.PlaneGeometry(w, d), 6.4), stone);
    paving.rotation.x = -Math.PI / 2;
    paving.position.set(x, .237, z);
    paving.receiveShadow = true;
    harbor.add(paving);
  }

  addOuterCity(scene, { asphalt: wetRoad, concrete: pavement, pavers: stone });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(650, 650), new THREE.ShaderMaterial({
    uniforms: { ...reflectionUniforms, time: clock, anchors: { value: waterfrontLights.map(([x, z]) => new THREE.Vector2(x, z)) }, tints: { value: waterfrontLights.map(([, , value]) => new THREE.Color(value)) } },
    toneMapped: false,
    vertexShader: `uniform mat4 cityProjection; varying vec4 mirrorCoord; varying vec2 bay;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.);
        bay = world.xz;
        mirrorCoord = cityProjection * vec4(bay.x, .25, bay.y, 1.);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `uniform sampler2D cityMirror; uniform float time; varying vec4 mirrorCoord; varying vec2 bay;
      uniform vec2 anchors[${waterfrontLights.length}]; uniform vec3 tints[${waterfrontLights.length}];
      void main() {
        vec2 view = bay - cameraPosition.xz;
        float dist = length(view);
        vec2 forward = view / max(.001, dist);
        vec2 right = vec2(-forward.y, forward.x);
        float sweep = sin(bay.x * .16 - bay.y * .23 + time * .47);
        float wave = sin(bay.y * 4.1 + bay.x * .31 + sweep * 3.8 + sin(bay.x * .53 + time * 1.2) * 1.4 + time * 2.1);
        float wave2 = sin(bay.x * .87 + bay.y * 1.16 + sweep * 1.7 - time * 1.2);
        float glint = smoothstep(.57, .99, wave * .67 + wave2 * .36) * (.43 + .57 * sweep * sweep) * (1. - smoothstep(27., 114., dist));
        vec3 result = mix(vec3(.032, .069, .109), vec3(.158, .131, .261), smoothstep(18., 135., dist));
        result += vec3(.052, .101, .139) * glint + vec3(.01, .021, .027) * (.5 + .5 * wave2);
        for (int i = 0; i < ${waterfrontLights.length}; i++) {
          vec2 v = bay - anchors[i];
          float along = dot(v, forward);
          float cross = dot(v, right) + .46 * wave2;
          float line = max(0., 1. - abs(cross) * (1. / (1.15 + abs(along) * .095)));
          float stretch = max(0., 1. - abs(along) / 16.);
          result += tints[i] * line * line * stretch * stretch * (.07 + .32 * smoothstep(-.3, .98, wave));
        }
        vec2 uv = .5 + .5 * mirrorCoord.xy / max(.001, mirrorCoord.w);
        uv += vec2(wave2 * .0028, wave * .009) * (1. - .64 * smoothstep(0., 75., dist));
        vec3 reflection = sqrt(texture2D(cityMirror, uv).rgb);
        float frame = smoothstep(0., .055, min(min(uv.x, 1.-uv.x), min(uv.y, 1.-uv.y)));
        result = mix(result, reflection, frame * (.26 + .25 * smoothstep(10., 80., dist)));
        gl_FragColor = vec4(result, 1.);
      }`,
  }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = -.24;
  harbor.add(water);

  const dark = material(0x172133, .33);
  const concrete = material(0x3a4354, .32);
  const paint = material(0x87877a, .05);
  const rail = material(0x735466, .44);
  const skyline = [material(0x141628), material(0x161d32), material(0x29334d), material(0x222a43)];
  const colored = new Map([amber, violet, teal, coral, 0x87b3da, 0xa77a65, 0xffc78b, 0xbadbf4].map(value => [value, neon(value)]));
  const piles = new Map();
  function place(surface, x, y, z, w, h, d, yaw = 0, pitch = 0) {
    if (!piles.has(surface)) piles.set(surface, []);
    piles.get(surface).push([x, y, z, w, h, d, yaw, pitch]);
  }
  for (let i = -12; i <= 12; i++) {
    const offset = i * 4;
    if (Math.abs(i + 4) > 1) place(paint, 0, .265, offset, .10, .012, 1.6);
    if (Math.abs(i) > 1) place(paint, offset, .267, -16, 1.6, .012, .10);
    if (i % 3 === 0 || Math.abs(offset) <= 12) continue;
    place(concrete, -4.3, .273, offset, .23, .14, 3.55);
    place(concrete, 4.3, .273, offset, .23, .14, 3.55);
  }
  for (const [x, z, tint] of junctionLights) {
    place(dark, x, 1.48, z, .18, 2.65, .18);
    place(dark, x, 2.78, z, 1.06, .12, .21);
    place(colored.get(tint), x, 2.69, z, .81, .07, .19);
    if (z === 8 || x === 6 || z === 38) {
      const lamp = new THREE.SpotLight(tint, 57, 13, 1.07, .63, 2);
      lamp.castShadow = true;
      lamp.shadow.autoUpdate = false;
      lamp.shadow.needsUpdate = true;
      lamp.shadow.mapSize.set(512, 512);
      lamp.shadow.bias = -.0006;
      lamp.shadow.normalBias = .014;
      lamp.shadow.camera.near = .18;
      lamp.position.set(x, 2.61, z);
      lamp.target.position.set(x + (x < 0 ? 1.25 : -.9), .25, z + .9);
      harbor.add(lamp, lamp.target);
    }
  }
  for (const z of [-21.4, -10.3, 40.9]) {
    for (let i = -4; i <= 4; i++) {
      if (i === 0) continue;
      place(paint, i * .77, .266, z, .33, .011, 1.17);
    }
  }
  for (const [x, z] of [[-4.63, 18], [4.66, 8.8], [4.66, -30], [-4.66, -5.4], [-4.66, 37.4]]) {
    place(concrete, x, .28, z, .53, .10, 1.32);
    for (let i = -4; i <= 4; i++) place(dark, x, .335, z + i * .126, .42, .022, .046);
  }
  const access = [[-1.5, 23.6], [1.3, 12.8], [-2.2, -13], [16.6, -16.3], [-28.7, -15.1], [1.5, 35], [32.6, -17.8], [-.6, -33.9]];
  const iron = material(0x535860, .68, .58);
  const covers = new THREE.InstancedMesh(new THREE.CylinderGeometry(.46, .49, .034, 24), iron, access.length);
  const coverPose = new THREE.Object3D();
  access.forEach(([x, z], i) => {
    coverPose.position.set(x, .27, z);
    coverPose.updateMatrix();
    covers.setMatrixAt(i, coverPose.matrix);
    for (let slot = -3; slot <= 3; slot++) {
      const width = .61 * Math.sqrt(1 - (slot / 4) ** 2);
      place(dark, x, .288, z + slot * .085, width, .008, .045, i % 2 * .35);
    }
  });
  covers.receiveShadow = true;
  harbor.add(covers);
  const tactile = material(0xac865d, .14, .78);
  for (const side of [-1, 1]) {
    for (const z of [-10.3, -21.4, 40.9]) {
      const x = side * (z === -10.3 ? 6.44 : 4.65);
      place(tactile, x, .26, z, .46, .045, 1.28);
      for (let row = -4; row <= 4; row++) for (let col = -1; col <= 1; col++) {
        place(paint, x + col * .119, .288, z + row * .125, .072, .027, .071);
      }
    }
  }
  for (const [x, z, tint] of waterfrontLights) {
    place(dark, x, .57, z, .7, 1.48, .7);
    place(colored.get(tint), x, 1.33, z, .51, .15, .52);
  }
  for (const edge of [-52, 140]) {
    for (let pos = -48; pos < 140; pos += 8) {
      for (const [x, z] of [[pos, edge], [edge, pos]]) {
        place(dark, x, .21, z, .65, .42, .65);
        place(colored.get(amber), x, .49, z, .48, .15, .48);
      }
    }
  }

  // The rail viaduct and the far neighborhoods continue beyond the flight perimeter.
  for (const side of [-1, 1]) {
    const mouth = side * 98;
    place(concrete, mouth, 5.96, -66.2, 32, .42, 3.25);
    for (const wall of [-1, 1]) place(concrete, mouth, 4.88, -66.2 + wall * 1.46, 32, 2.1, .28);
    place(dark, mouth, 3.6, -66.2, 32, .45, 2.98);
    place(colored.get(amber), side * 81.95, 5.70, -66.2, .09, .070, 2.57);
  }
  for (const gauge of [-.43, .43]) place(rail, 0, 3.83, -66.2 + gauge, 186, .10, .09);
  place(dark, 0, 5.56, -66.19, 165, .018, .018);
  for (let x = -78; x < 81; x += 13) {
    place(rail, x, 4.75, -67.7, .10, 2.42, .12);
    place(rail, x, 5.84, -66.95, .065, .07, 1.65);
    place(dark, x, 5.69, -66.19, .025, .25, .025);
  }
  place(concrete, 0, 2.5, -67, 186, 1.55, 4.9);
  place(dark, 0, 3.5, -67, 186, .6, 4.55);
  for (const side of [-1, 1]) {
    place(rail, 0, 4.13, -67 + side * 2.18, 186, .14, .1);
    for (let i = -9; i <= 9; i++) {
      const x = i * 9.6;
      place(dark, x, 1.22, -67 + side * .88, .76, 3.6, .73);
      place(colored.get(i % 4 === 0 ? coral : 0x87b3da), x, 3.72, -67 + side * 2.29, 1.85, .10, .11);
    }
  }
  const random = randomSeed(1908);
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 30; i++) {
      const angle = Math.PI * (.07 + i * .0308);
      const distance = 77 + row * 23 + random() * 10;
      const x = Math.cos(angle) * distance * 1.39;
      const z = Math.min(-54 - row * 9, -18 - Math.sin(angle) * distance);
      const w = 2.7 + random() * 9.4;
      const d = 4 + random() * 5.5;
      const h = 5 + random() * (row === 0 ? 29 : 36);
      if (row === 0 && Math.abs(x) < 35 && z < -90) continue;
      const facade = skyline[(i + row) % skyline.length];
      const podium = i % 4 === 1 ? .70 : .87;
      place(dark, x, -.12, z, w + 5, .55, d + 4);
      place(facade, x, h * podium / 2, z, w, h * podium, d);
      place(facade, x + w * .08, h * (.5 + podium * .5), z - d * .10, w * .63, h * (1 - podium), d * .73);
      if (i % 7 === 2) {
        place(concrete, x, h + 1, z, .18, 2.1, .18);
        place(colored.get(coral), x, h + 2.12, z, .22, .25, .23);
      }
      for (let floor = 1; floor < h * podium; floor += 2.4) {
        if (random() < .47) continue;
        place(colored.get(i % 4 === 0 ? 0xa77a65 : 0x87b3da), x + w * .12, floor + .12, z + d / 2 + .016, w * (.25 + random() * .41), .13, .05);
      }
    }
  }
  // Across the southern channel, warehouses give way to a second residential shoreline.
  for (let i = 0; i < 40; i++) {
    const angle = Math.PI * (1.014 + i / 41);
    const x = Math.cos(angle) * (130 + random() * 25) + 28;
    const z = x < -59 || x > 150 ? 83 - Math.sin(angle) * 49 : 150 - Math.sin(angle) * (18 + random() * 14);
    const w = 4 + random() * 5, d = 5 + random() * 6, h = 8 + random() * 28;
    const wall = skyline[i % skyline.length];
    place(dark, x, .22, z, w + 3, 1.0, d + 4);
    place(wall, x, h * .39, z, w, h * .78, d);
    place(wall, x + w * .07, h * .89, z, w * .62, h * .22, d * .68);
    for (let y = 2.6; y < h * .78 - 1; y += 2.9) {
      if (random() > .4) place(colored.get(i % 4 ? 0x87b3da : 0xa77a65), x, y, z - d / 2 - .03, w * .53, .15, .06);
    }
  }
  for (const [x, z, tint] of [[-49, -58, amber], [37, -60, coral], [61, -57, teal]]) {
    place(dark, x, .1, z, 12, .9, 7);
    place(rail, x, 6.7, z, .52, 13.4, .5);
    place(rail, x + 4.5, 13.5, z, 12.3, .58, .45);
    place(rail, x + 3.4, 11.0, z, 7, .21, .30, 0, .71);
    place(colored.get(tint), x + 10.2, 13.39, z, .33, .24, .39);
    place(dark, x + 8.4, 10.66, z, .11, 5.4, .11);
  }
  const towerSteel = material(0x233448, .47, .41);
  function skylineTier(material, x, y, z, radiusTop, radiusBottom, height, sides, angle = 0) {
    const segment = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, sides), material);
    segment.position.set(x, y, z);
    segment.rotation.y = angle;
    harbor.add(segment);
  }
  // Three legible silhouettes punctuate the skyline across the bay.
  place(dark, -24, .09, -91, 17, .7, 17);
  skylineTier(skyline[2], -24, 10.9, -91, 4.55, 5.6, 22, 12);
  skylineTier(towerSteel, -24, 26.2, -91, 3.65, 4.55, 8.8, 12);
  skylineTier(colored.get(teal), -24, 22.3, -91, 4.73, 4.74, .22, 12);
  skylineTier(colored.get(teal), -24, 30.72, -91, 3.67, 3.77, .23, 12);
  for (let i = 7; i < 26; i += 3) {
    place(colored.get(0x87b3da), -24, i, -85.95 - i * .035, 4.3 - i * .075, .12, .09);
  }
  place(dark, 0, .1, -98, 18, .7, 11);
  for (const side of [-1, 1]) {
    const x = side * 5.2;
    place(skyline[3], x, 13.5, -98, 5.6, 27, 7.3);
    place(towerSteel, x - side * .65, 30, -98, 4.2, 6, 6.18);
    place(colored.get(violet), x - side * 1.56, 19.6, -94.26, .15, 25.2, .07);
    place(colored.get(coral), x - side * .65, 33.05, -95.4, 3.2, .19, .13);
  }
  place(towerSteel, 0, 24.3, -96.6, 12.1, 2.45, 3.8);
  place(colored.get(violet), 0, 24.1, -94.67, 6.55, .19, .06);
  place(dark, 24, .1, -95, 19, .7, 15);
  skylineTier(towerSteel, 24, 13.9, -95, 4.1, 7.2, 28, 4, Math.PI / 4);
  skylineTier(skyline[3], 24, 29.6, -95, 1.2, 4.10, 3.5, 4, Math.PI / 4);
  skylineTier(colored.get(amber), 24, 28.04, -95, 4.20, 4.20, .12, 4, Math.PI / 4);
  place(colored.get(coral), 24, 31.51, -95, .28, .32, .28);
  const box = new THREE.BoxGeometry();
  const item = new THREE.Object3D();
  function batch(parent, surface, pieces) {
    const batch = new THREE.InstancedMesh(box, surface, pieces.length);
    pieces.forEach(([x, y, z, w, h, d, yaw, pitch], index) => {
      item.position.set(x, y, z);
      item.rotation.set(0, yaw, pitch);
      item.scale.set(w, h, d);
      item.updateMatrix();
      batch.setMatrixAt(index, item.matrix);
    });
    parent.add(batch);
  }
  for (const [surface, pieces] of piles) batch(harbor, surface, pieces);

  const freightTrain = new THREE.Group();
  freightTrain.position.set(-58, 3.89, -66.2);
  harbor.add(freightTrain);
  const trainDecks = [];
  const trainShells = [];
  const trainWindows = [];
  const trainLights = [];
  const trainRims = [];
  const trainStanchions = [];
  const trainPaint = new THREE.MeshPhysicalMaterial({ color: 0x93a6a7, metalness: .63, roughness: .40, clearcoat: .82, clearcoatRoughness: .20 });
  const coachGlass = new THREE.MeshPhysicalMaterial({ color: 0x375669, emissive: 0x283a45, metalness: .25, roughness: .14, clearcoat: 1 });
  const cabinTints = [material(0xe1b891, .16, .38), material(0xadbfc8, .18, .33)];
  for (const [i, tint] of cabinTints.entries()) tint.emissive.setHex(i ? 0x465a68 : 0x6d462a);
  const seating = [[], []];
  const wheels = [];
  for (let car = 0; car < 4; car++) {
    const x = -car * 5.4;
    const end = car === 0;
    const profile = new THREE.Shape();
    profile.moveTo(-2.39, .29);
    profile.lineTo(2.15, .29);
    profile.quadraticCurveTo(end ? 2.85 : 2.40, .32, end ? 2.78 : 2.40, .62);
    profile.lineTo(end ? 2.40 : 2.37, 1.05);
    profile.quadraticCurveTo(2.27, 1.21, 2.03, 1.21);
    profile.lineTo(-2.16, 1.21);
    profile.quadraticCurveTo(-2.39, 1.18, -2.39, .98);
    profile.closePath();
    const shell = new THREE.Mesh(new THREE.ExtrudeGeometry(profile, { depth: 1.03, bevelSize: .046, bevelThickness: .052, bevelSegments: 3, curveSegments: 5 }), trainPaint);
    shell.position.set(x, 0, -.515);
    freightTrain.add(shell);
    trainDecks.push([x, .23, 0, 4.37, .17, 1.05, 0, 0]);
    for (const axle of [-1.69, -1.27, 1.27, 1.69]) {
      for (const side of [-1, 1]) wheels.push([x + axle, .14, side * .435]);
    }
    for (const side of [-1, 1]) {
      const z = side * .571;
      trainLights.push([x, .49, z, 4.55, .047, .021, 0, 0]);
      trainRims.push([x, .422, z, 4.56, .022, .026, 0, 0]);
      trainDecks.push([x, .871, z, 4.42, .35, .025, 0, 0]);
      for (let w = 0; w < 7; w++) {
        const wx = x - 1.83 + w * .60;
        trainWindows.push([wx, .868, z + side * .021, .53, .28, .025, 0, 0]);
        if ((w + car) % 4 !== 0) seating[(car + w) % 2].push([wx - .055, .875, z + side * .036, .36, .19, .008, 0, 0]);
        trainStanchions.push([wx + .08, .862, z + side * .042, .024, .272, .009, 0, 0]);
      }
      for (const door of [-1.72, 1.30]) trainDecks.push([x + door, .64, z + side * .020, .019, .61, .018, 0, 0]);
      if (end) trainLights.push([x + 2.76, .56, side * .38, .06, .07, .16, 0, 0]);
    }
    if (end) trainWindows.push([x + 2.565, .855, 0, .042, .48, .96, 0, .75]);
    if (car < 3) {
      trainDecks.push([x - 2.71, .54, 0, .67, .7, .82, 0, 0]);
      for (let fold = 0; fold < 4; fold++) trainRims.push([x - 2.45 - fold * .16, .59, 0, .036, .74, .88, 0, 0]);
    }
    trainShells.push([x, 1.285, 0, 1.24, .13, .62, 0, 0]);
    for (let slot = -4; slot <= 4; slot++) trainRims.push([x + slot * .114, 1.36, 0, .042, .025, .49, 0, 0]);
    if (car === 1 || car === 3) {
      trainRims.push([x - .98, 1.38, 0, .58, .031, .048, 0, .46], [x - 1.01, 1.57, 0, .53, .031, .048, 0, -.35],
        [x - 1.20, 1.65, 0, .072, .036, .59, 0, 0]);
    }
  }
  const bogies = new THREE.InstancedMesh(new THREE.CylinderGeometry(.143, .143, .094, 12), iron, wheels.length);
  wheels.forEach(([x,y,z], i) => {
    item.position.set(x,y,z); item.rotation.set(Math.PI / 2, 0, 0); item.scale.setScalar(1); item.updateMatrix();
    bogies.setMatrixAt(i, item.matrix);
  });
  freightTrain.add(bogies);
  batch(freightTrain, dark, trainDecks);
  batch(freightTrain, trainPaint, trainShells);
  batch(freightTrain, coachGlass, trainWindows);
  batch(freightTrain, rail, trainRims);
  batch(freightTrain, dark, trainStanchions);
  for (const [i, litSeats] of seating.entries()) batch(freightTrain, cabinTints[i], litSeats);
  batch(freightTrain, colored.get(coral), trainLights);

  const updateWaterfront = addWaterfrontLife(harbor);
  reflectCity(harbor);
  // These surfaces sample the mirror and must stay out of its rendering pass.
  harbor.traverse(mesh => {
    if (mesh === seawall || [pavement, wetRoad, stone, water.material].includes(mesh.material)) mesh.layers.disable(1);
  });

  function setLights(signLights, buildings) {
    const sources = [
      ...junctionLights.map(([x, z, tint]) => ({ x, y: 2.68, z, tint: new THREE.Color(tint), intensity: 21 })),
      ...signLights.map(light => ({ ...light, tint: new THREE.Color(light.color), intensity: 13 })),
    ];
    const feet = buildings.flatMap(building => (building.levels || [building]).filter(level => !level.bottom));
    for (let iz = 0; iz < atlasSize; iz++) {
      for (let ix = 0; ix < atlasSize; ix++) {
        const x = (ix + .5) / atlasSize * 220 - 64;
        const z = (iz + .5) / atlasSize * 220 - 64;
        let sky = 1;
        for (const b of feet) {
          const dx = Math.max(0, Math.abs(x - b.x) - b.w / 2);
          const dz = Math.max(0, Math.abs(z - b.z) - b.d / 2);
          const distance = dx * dx + dz * dz;
          if (distance < 58) sky = Math.min(sky, .10 + .90 * distance / (distance + Math.min(b.h, 13) * .6));
        }
        const i = (iz * atlasSize + ix) * 4;
        let red = 0, green = 0, blue = 0;
        for (const source of sources) {
          const dx = source.x - x, dz = source.z - z;
          const range = dx * dx + dz * dz + source.y * source.y;
          if (range > 350) continue;
          const lux = source.intensity * source.y / (range * Math.sqrt(range)) * (1 - range / 350) ** 2;
          red += source.tint.r * lux;
          green += source.tint.g * lux;
          blue += source.tint.b * lux;
        }
        groundData[i] = Math.round(Math.min(1, red * .28) * 255);
        groundData[i + 1] = Math.round(Math.min(1, green * .28) * 255);
        groundData[i + 2] = Math.round(Math.min(1, blue * .28) * 255);
        groundData[i + 3] = Math.round(sky * 255);
      }
    }
    groundLight.needsUpdate = true;
  }
  return {
    setLights,
    setCraftModel(model) {
      craftMask.value.dispose();
      craftMask.value = craftSilhouette(model);
    },
    setDroneShade(position, receivesMoon, yaw) {
      craft.value.set(position.x, position.y, position.z, receivesMoon ? 1 : 0);
      craftHeading.value.set(Math.cos(yaw), Math.sin(yaw));
    },
    update(time) {
      clock.value = time;
      updateWaterfront(time);
      freightTrain.position.x = (33 + time * 8.4) % 201 - 92;
    },
  };
}
