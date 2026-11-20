import * as THREE from './vendor/three.module.js';
import { createCyberBuildingMaterials, addCyberFacadeDetails } from './cyber-facades.js';
import { addCyberSigns } from './cyber-signs.js';
import { addCyberWeather } from './cyber-weather.js';
import { addCyberHarbor } from './cyber-harbor.js';
import { addCyberStreets } from './cyber-streets.js';
import { createCityReflections, reflectCity } from './city-reflections.js';
import { addCyberTraffic } from './cyber-traffic.js';
import { addRainImpacts } from './rain-impact.js';
import { addSkybridges } from './skybridges.js';
import { createCourierShip } from './courier-ship.js';
import { addVehicleSignReflections } from './vehicle-reflections.js';

const phases = [0x4df2ff, 0xff4f9d];
const districtColors = [0xffbd69, 0x7bddfa, 0xd290fc, 0x77f0ba, 0xffa178, 0x9ea8ff];
const districtIndex = x => x < -12 ? 0 : x > 12 ? 2 : 1;
const towers = [
  { x: -38, z: 14, w: 10, d: 11, h: 13 }, { x: -25, z: 11, w: 9, d: 7, h: 9 },
  { x: -13, z: 21, w: 8, d: 13, h: 12 }, { x: 15, z: 17, w: 11, d: 10, h: 14 },
  { x: 32, z: 10, w: 12, d: 9, h: 11 }, { x: 43, z: 9, w: 6, d: 9, h: 16 },
  { x: -42, z: -24, w: 9, d: 12, h: 12 }, { x: -16, z: -28, w: 8, d: 9, h: 15 },
  { x: 10, z: -34, w: 9, d: 9, h: 15 }, { x: 42, z: -26, w: 8, d: 10, h: 14 },
  { x: -34, z: -44, w: 13, d: 8, h: 19 }, { x: 26, z: -45, w: 11, d: 8, h: 15 },
];

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.10;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x12132b);
  scene.fog = new THREE.FogExp2(0x302a53, .0092);
  const camera = new THREE.PerspectiveCamera(59, 2, .08, 260);
  const ambient = new THREE.HemisphereLight(0xb6c8df, 0x3c323d, 1.02);
  const moon = new THREE.DirectionalLight(0xc9dafa, 2.85);
  moon.position.set(66, 80, -115);
  moon.castShadow = true;
  moon.shadow.autoUpdate = false;
  moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -77, right: 77, top: 79, bottom: -64, near: 43, far: 259 });
  moon.shadow.normalBias = .059;
  moon.shadow.bias = -.00014;
  moon.shadow.camera.updateProjectionMatrix();
  const signLights = Array.from({ length: 6 }, () => new THREE.PointLight(0xffffff, 0, 15, 2));
  const phaseSpill = new THREE.PointLight(phases[0], 5.4, 9, 2);
  scene.add(ambient, moon, phaseSpill, ...signLights);
  for (const light of [ambient, moon, phaseSpill, ...signLights]) reflectCity(light);

  const box = new THREE.BoxGeometry();
  const octahedron = new THREE.OctahedronGeometry(1);
  const alloy = standard(0xcbd7dc, .48);
  const dark = standard(0x192a47, .3);
  const curb = standard(0x51627a, .28);
  const softAmber = lit(0xf3b875, .52);
  const { shell: shellColors, roof: roofColors } = createCyberBuildingMaterials();
  const glow = phases.map(color => lit(color, 1.22));
  const districtMaterials = districtColors.map(color => lit(color, .88));
  const onlineMaterial = lit(0x9dffc6, 1.05);
  const rooftopLights = [lit(0xf9a961, .22), lit(0x7cc6d8, .20), lit(0xbba0ee, .22)];

  function standard(color, metalness) {
    return new THREE.MeshStandardMaterial({ color, metalness, roughness: .62, flatShading: true });
  }

  function lit(color, intensity) {
    return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: .37, flatShading: true });
  }

  function mount(parent, geometry, material, x, y, z, w = 1, h = 1, d = 1) {
    const item = new THREE.Mesh(geometry, material);
    item.position.set(x, y, z);
    item.scale.set(w, h, d);
    parent.add(item);
    return item;
  }

  function batchBoxes(parent) {
    const byMaterial = new Map();
    for (const item of parent.children) {
      if (item.geometry !== box) continue;
      if (!byMaterial.has(item.material)) byMaterial.set(item.material, []);
      byMaterial.get(item.material).push(item);
    }
    for (const [material, objects] of byMaterial) {
      if (objects.length < 2) continue;
      const batch = new THREE.InstancedMesh(box, material, objects.length);
      batch.castShadow = objects[0].castShadow;
      batch.receiveShadow = objects[0].receiveShadow;
      objects.forEach((item, index) => {
        item.updateMatrix();
        batch.setMatrixAt(index, item.matrix);
      });
      parent.remove(...objects);
      parent.add(batch);
    }
  }

  const sky = new THREE.Mesh(new THREE.SphereGeometry(166, 20, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    vertexShader: `varying vec3 skyRay;
      void main() { skyRay = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `varying vec3 skyRay;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(41.57, 289.53))) * 43758.5453); }
      void main() {
        vec3 ray = normalize(skyRay);
        float rise = smoothstep(-.13, .39, ray.y);
        vec3 color = mix(vec3(.226, .172, .314), vec3(.046, .041, .113), rise);
        float horizon = pow(max(0., 1. - abs(ray.y + .01) * 6.), 2.7);
        color += vec3(.156, .040, .091) * horizon * smoothstep(-.70, .91, ray.x);
        color += vec3(.028, .109, .149) * horizon * (1. - smoothstep(-.2, .8, ray.x));
        float cloud = sin(ray.x * 11.4 + ray.y * 43. + sin(ray.z * 7.) * 2.3)
                    * cos(ray.z * 13.1 - ray.y * 35. - sin(ray.x * 19.) * .85);
        color += vec3(.076, .067, .107) * smoothstep(.13, .8, cloud) * (1. - smoothstep(.04, .61, abs(ray.y + .03)));
        vec2 skyCell = vec2(atan(ray.x, -ray.z) * 107., ray.y * 111.);
        float star = step(.989, hash(floor(skyCell))) * (1. - smoothstep(.065, .19, length(fract(skyCell) - .5)));
        color += vec3(.56, .66, .81) * star * smoothstep(.028, .27, ray.y);
        vec3 moon = normalize(vec3(.57, .69, -1.));
        float moonDistance = length(ray - moon);
        float crescent = (1. - smoothstep(.030, .034, moonDistance)) * smoothstep(.025, .031, length(ray - normalize(moon + vec3(.010, .009, 0.))));
        color += vec3(.66, .62, .57) * crescent + vec3(.125, .083, .078) * exp(-moonDistance * 17.);
        gl_FragColor = vec4(color, 1.);
      }`,
  }));
  sky.frustumCulled = false;
  sky.renderOrder = -100;
  scene.add(sky);

  reflectCity(sky);
  const reflections = createCityReflections(renderer, scene);
  const harbor = addCyberHarbor(scene, reflections.uniforms);
  const traffic = new THREE.Group();
  const updateTraffic = addCyberTraffic(traffic);
  const vehicleReflections = addVehicleSignReflections(traffic);
  reflectCity(traffic);
  scene.add(traffic);
  const updateWeather = addCyberWeather(scene);
  const impacts = addRainImpacts(scene);

  let architecture = new THREE.Group();
  scene.add(architecture);
  const matrixItem = new THREE.Object3D();
  const windowMaterial = new THREE.MeshStandardMaterial({ color: 0x465363, roughness: .22, metalness: .38 });
  windowMaterial.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec2 paneUv; varying float roomSeed;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      paneUv = uv;
      roomSeed = fract(sin(dot(instanceMatrix[3].xyz, vec3(7.13, 8.67, 53.61))) * 4237.1);`);
    shader.fragmentShader = 'varying vec2 paneUv; varying float roomSeed;\n' + shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      vec2 frame = smoothstep(vec2(.018), vec2(.095), min(paneUv, 1.-paneUv));
      float mullion = smoothstep(.025, .055, abs(paneUv.x - (.35 + .3 * roomSeed)));
      float blind = roomSeed > .69 ? .55 + .45 * smoothstep(.22, .35, fract(paneUv.y * 3.)) : 1.;
      totalEmissiveRadiance += vColor.rgb * frame.x * frame.y * mullion * blind * (.63 + .63 * paneUv.y);`);
  };
  const windowColors = [0xefaa69, 0x80cee8, 0xd5a0fa].map(color => new THREE.Color(color));
  const windowColorBuffer = new THREE.Color();
  let facade = null;
  let facadeSectors = [];
  let litDistricts = -1;
  let previousBuildings = null;
  let cameraBlockers = [];
  let cyberSigns;
  let cityEmitters = [];
  let nextLightRefresh = -1;
  let disposeStreets;
  function setBuildings(buildings, bridges, districts) {
    if (buildings === previousBuildings) return;
    cyberSigns?.dispose();
    disposeStreets?.();
    scene.remove(architecture);
    architecture.traverse(child => {
      if (child.isInstancedMesh) child.dispose();
    });
    architecture = new THREE.Group();
    scene.add(architecture);
    previousBuildings = buildings;
    const levelsFor = building => building.levels ?? [{ ...building, bottom: 0 }];
    cameraBlockers = buildings.flatMap(building => levelsFor(building).map(({ x, z, w, d, bottom, h }) => new THREE.Box3(
      new THREE.Vector3(x - w / 2 - .21, bottom, z - d / 2 - .21),
      new THREE.Vector3(x + w / 2 + .21, h + .19, z + d / 2 + .21),
    )));
    for (const b of bridges) cameraBlockers.push(new THREE.Box3(
      new THREE.Vector3(b.x - b.w / 2 - .15, b.bottom - .1, b.z - b.d / 2 - .15),
      new THREE.Vector3(b.x + b.w / 2 + .15, b.h + .1, b.z + b.d / 2 + .15)));
    addSkybridges(architecture, bridges);
    const windows = [];
    buildings.forEach((building, index) => {
      const serviceDistrict = building.x > 52 || building.z > 52
        ? districts.slice(3).reduce((nearest, station) => Math.hypot(building.x - station.x, building.z - station.z) < Math.hypot(building.x - nearest.x, building.z - nearest.z) ? station : nearest, districts[3])?.id - 1
        : districtIndex(building.x);
      const sector = Number.isFinite(serviceDistrict) ? serviceDistrict % 3 : districtIndex(building.x);
      levelsFor(building).forEach(({ x, z, w, d, h, bottom }, tier) => {
        const height = h - bottom;
        const shell = mount(architecture, box, shellColors[sector], x, bottom + height / 2, z, w, height, d);
        shell.castShadow = shell.receiveShadow = true;
        const roof = mount(architecture, box, roofColors[sector], x, h + .06, z, w * 1.025, .12, d * 1.025);
        roof.castShadow = roof.receiveShadow = true;
        for (const side of [-1, 1]) {
          const rib = mount(architecture, box, dark, x + side * w * .415, bottom + height / 2, z + d / 2 + .03, .11, height * .96, .085);
          rib.castShadow = rib.receiveShadow = true;
        }
        if (tier || index % 3 === 0) {
          mount(architecture, box, rooftopLights[sector], x, h - .28, z + d / 2 + .059, w * .70, .045, .072);
        }
        for (let row = 0, y = bottom + 1.78; y < h - .36; y += 1.54, row++) {
          const spacing = sector === 0 ? 1.77 : 1.31;
          for (let col = 0, dx = -w * .32; dx < w * .38; dx += spacing, col++) {
            if ((row * 3 + col * 5 + index) % 11 < 4) continue;
            const wide = tier ? Math.min(spacing - .14, w * .17) : sector === 0 ? .89 : .61;
            const paneHeight = tier ? ((index % 3 === 0) ? .53 : .81) : .44;
            windows.push([x + dx, y, z + d / 2 + .021, wide, paneHeight, .045, sector, serviceDistrict]);
            if (index % 3 === 1) windows.push([x + dx, y, z - d / 2 - .021, wide, paneHeight, .045, sector, serviceDistrict]);
          }
          for (let col = 0, dz = -d * .33; dz < d * .39; dz += 1.51, col++) {
            if ((row * 5 + col * 3 + index) % 13 < 6) continue;
            const sideHeight = tier ? .66 : .40;
            const sideWidth = tier ? Math.min(.94, d * .18) : .57;
            windows.push([x + w / 2 + .021, y, z + dz, .045, sideHeight, sideWidth, sector, serviceDistrict]);
            windows.push([x - w / 2 - .021, y, z + dz, .045, sideHeight, sideWidth, sector, serviceDistrict]);
          }
        }
      });
    });
    batchBoxes(architecture);
    facade = new THREE.InstancedMesh(box, windowMaterial, windows.length);
    facadeSectors = windows.map(([, , , , , , material, district]) => Number.isFinite(district) ? district : material);
    litDistricts = -1;
    windows.forEach(([x, y, z, w, h, d, sector], index) => {
      matrixItem.position.set(x, y, z);
      matrixItem.scale.set(w, h, d);
      matrixItem.updateMatrix();
      facade.setMatrixAt(index, matrixItem.matrix);
      facade.setColorAt(index, windowColors[sector]);
    });
    facade.instanceMatrix.needsUpdate = true;
    architecture.add(facade);
    addCyberFacadeDetails(architecture, buildings, windows);
    cyberSigns = addCyberSigns(architecture, buildings);
    vehicleReflections.setBoards(cyberSigns.boards);
    disposeStreets = addCyberStreets(architecture, buildings);
    reflectCity(architecture);
    cityEmitters = [...cyberSigns.lights, ...disposeStreets.shopLights,
      ...districts.map((d, i) => ({ x: d.x, y: d.y, z: d.z, color: districtColors[i] }))];
    nextLightRefresh = -1;
    impacts.setBuildings([...buildings, ...bridges.map(b => ({ ...b, levels: [b] }))]);
    impacts.setLights(cityEmitters);
    harbor.setLights(cityEmitters, buildings);
    moon.shadow.needsUpdate = true;
    renderer.shadowMap.needsUpdate = true;
  }

  function updateLocalLights(player, time) {
    if (time < nextLightRefresh) return;
    nextLightRefresh = time + .18;
    const range = source => Math.hypot(player.x - source.x, player.y - source.y, player.z - source.z);
    const nearest = [...cityEmitters].sort((a, b) => range(a) - range(b));
    signLights.forEach((light, i) => {
      const source = nearest[i];
      light.intensity = source ? 19 * (1 - THREE.MathUtils.smoothstep(range(source), 20, 47)) : 0;
      if (!source || !light.intensity) return;
      light.color.set(source.color);
      light.position.set(source.x, source.y, source.z);
    });
  }

  function lightDistricts(districts) {
    const next = districts.reduce((mask, district, index) => mask | (Number(district.online) << index), 0);
    if (!facade || next === litDistricts) return;
    litDistricts = next;
    facadeSectors.forEach((sector, index) => {
      const seed = (index * 967 + (index % 7) * 19) % 101;
      const powered = next & (1 << sector);
      const power = seed < (powered ? 82 : 32) ? .55 + (seed % 9) * .12 : .021;
      windowColorBuffer.copy(windowColors[sector % 3]);
      if (seed % 4 === 0) windowColorBuffer.setHex(0xffdeb0);
      if (seed % 7 === 0) windowColorBuffer.setHex(0xb7cdda);
      facade.setColorAt(index, windowColorBuffer.multiplyScalar(power));
    });
    facade.instanceColor.needsUpdate = true;
  }

  const ship = createCourierShip();
  const drone = ship.group;
  const landingLight = new THREE.SpotLight(0xffe2b5, 76, 25, .48, .76, 2);
  landingLight.position.set(0, -.10, -.86);
  landingLight.target.position.set(0, -2.95, -12);
  landingLight.castShadow = true;
  landingLight.shadow.mapSize.set(512, 512);
  landingLight.shadow.camera.near = .16;
  landingLight.shadow.normalBias = .014;
  landingLight.shadow.bias = -.00035;
  landingLight.shadow.autoUpdate = false;
  drone.add(landingLight, landingLight.target);
  let nextBeamShadow = -1;
  harbor.setCraftModel(drone);
  scene.add(drone);
  reflectCity(drone);
  const fuselage = new THREE.IcosahedronGeometry(1, 0);
  const ring = new THREE.TorusGeometry(1, .045, 6, 38);

  const bases = new Map();
  const platform = new THREE.CylinderGeometry(1, 1.06, .30, 12);
  const beaconGeometry = new THREE.CylinderGeometry(.038, .115, 1, 8, 1, true);
  const gateShapes = [new THREE.TorusGeometry(1, .034, 6, 4), ring, new THREE.TorusGeometry(1, .034, 6, 6)];
  function districtLabel(district, index) {
    const plate = document.createElement('canvas');
    plate.width = 384;
    plate.height = 66;
    const context = plate.getContext('2d');
    context.fillStyle = '#10192de6';
    context.fillRect(0, 4, plate.width, 58);
    const color = `#${districtColors[index].toString(16)}`;
    context.fillStyle = color;
    context.fillRect(0, 4, 4, 58);
    context.fillRect(380, 4, 4, 58);
    context.font = 'bold 32px monospace';
    context.textBaseline = 'middle';
    context.textAlign = 'center';
    context.fillText(`${String(index + 1).padStart(2, '0')} / ${district.name.toUpperCase()}`, 192, 34, 353);
    const map = new THREE.CanvasTexture(plate);
    map.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map, fog: false, depthWrite: false, toneMapped: false }));
    label.position.y = district.y + 4.6;
    label.scale.set(7.1, 1.22, 1);
    return label;
  }
  function baseFor(district, index) {
    if (bases.has(district.id)) return bases.get(district.id);
    const radius = district.radius || 4;
    const mat = districtMaterials[index];
    const group = new THREE.Group();
    group.position.set(district.x, 0, district.z);
    mount(group, platform, dark, 0, .3, 0, radius * 1.15, 1, radius * 1.15);
    mount(group, platform, roofColors[index % 3], 0, .44, 0, radius * .99, .4, radius * .99);
    const beamMaterial = new THREE.MeshBasicMaterial({ color: mat.color, opacity: .25, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    mount(group, beaconGeometry, beamMaterial, 0, district.y + 7, 0, 4.1, 14, 4.1);
    const rim = mount(group, ring, mat, 0, .53, 0, radius, radius, radius);
    rim.rotation.x = -Math.PI / 2;
    const flightRing = mount(group, gateShapes[index % 3], mat, 0, district.y, 0, radius * .83, radius * .83, radius * .83);
    if (index === 2) flightRing.rotation.z = Math.PI / 6;
    const floatCore = mount(group, octahedron, mat, 0, district.y, 0, .39, .63, .39);
    for (const side of [-1, 1]) {
      const column = side * radius * .85;
      mount(group, box, dark, column, district.y * .48, 0, index === 0 ? .66 : .46, district.y * .96, .69);
      mount(group, box, rooftopLights[index % 3], column, district.y * .53, .36, .065, district.y * .80, .04);
      mount(group, box, mat, column, district.y + .13, 0, .42, .25, .52);
    }
    const chargePips = Array.from({ length: district.needed || 2 }, (_, pip) => {
      const x = (pip - ((district.needed || 2) - 1) / 2) * .49;
      return mount(group, box, dark, x, district.y - radius * .73, .09, .34, .12, .16);
    });
    group.add(districtLabel(district, index));
    scene.add(group);
    const record = { beamMaterial, floatCore, flightRing, rim, chargePips, mat, y: district.y };
    bases.set(district.id, record);
    return record;
  }

  const crystalPool = [];
  const hazardPool = [];
  const relayPool = [];
  const trialGate = new THREE.Group();
  const gateFrame = new THREE.TorusGeometry(1, .022, 5, 6);
  const brokenGate = new THREE.TorusGeometry(1, .027, 5, 12, Math.PI * .41);
  const trialArcs = Array.from({ length: 4 }, (_, segment) => {
    const arc = mount(trialGate, brokenGate, glow[0], 0, 0, .012, 1.05, 1.05, 1.05);
    arc.rotation.z = segment * Math.PI / 2;
    return arc;
  });
  const trialFrame = mount(trialGate, gateFrame, alloy, 0, 0, 0);
  const trialCore = mount(trialGate, gateFrame, glow[0], 0, 0, 0, .24, .24, .24);
  scene.add(trialGate);
  const depthLines = new THREE.BufferGeometry();
  const depthPoints = [];
  for (let dash = 0; dash < 12; dash++) {
    depthPoints.push(0, dash / 12, 0, 0, (dash + .40) / 12, 0);
  }
  depthLines.setAttribute('position', new THREE.Float32BufferAttribute(depthPoints, 3));
  const depthMaterials = phases.map(color => new THREE.LineBasicMaterial({ color, opacity: .44, transparent: true, depthWrite: false }));
  const depthRing = new THREE.TorusGeometry(1, .042, 4, 4);
  function usePool(list, pool, create, update) {
    list.forEach((entry, index) => {
      if (!pool[index]) {
        pool[index] = create();
        scene.add(pool[index].group);
      }
      update(pool[index], entry);
    });
    for (let index = list.length; index < pool.length; index++) pool[index].group.visible = false;
  }
  function crystalModel() {
    const group = new THREE.Group();
    const crystal = mount(group, octahedron, glow[0], 0, 0, 0, .46, .78, .46);
    const footprint = mount(group, depthRing, glow[0], 0, 0, 0, .54, .54, .54);
    footprint.rotation.x = -Math.PI / 2;
    const depth = new THREE.LineSegments(depthLines, depthMaterials[0]);
    group.add(depth);
    return { group, crystal, footprint, depth };
  }
  const hazardShell = phases.map(color => new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: .60 }));
  function hazardModel() {
    const group = new THREE.Group();
    const shell = mount(group, fuselage, hazardShell[0], 0, 0, 0);
    const inner = mount(group, octahedron, glow[0], 0, 0, 0, .48, .48, .48);
    return { group, shell, inner };
  }
  function relayModel() {
    const group = new THREE.Group();
    const outline = mount(group, gateShapes[0], glow[0], 0, .08, 0, 1.2, 1.2, 1.2);
    outline.rotation.z = Math.PI / 4;
    const module = mount(group, box, glow[0], 0, 0, 0, .58, .58, .58);
    const pole = mount(group, box, dark, 0, 0, 0, .15, 1, .15);
    const antenna = mount(group, box, softAmber, 0, 1.12, 0, .65, .08, .08);
    return { group, outline, module, pole, antenna };
  }

  const nextCamera = new THREE.Vector3();
  const target = new THREE.Vector3();
  const cameraRay = new THREE.Ray();
  const shadowCenter = new THREE.Vector2();
  const moonRay = new THREE.Ray(new THREE.Vector3(), moon.position.clone().normalize());
  const cameraHit = new THREE.Vector3();
  const projectionPoint = new THREE.Vector3();
  let pageWidth = 0;
  let pageHeight = 0;
  let elapsed = 0;
  let positioned = false;
  let cameraYaw = 0;
  let cameraPlayer;
  let lastX = 0;
  let lastZ = 0;
  function resize() {
    const width = Math.max(1, canvas.clientWidth || 960);
    const height = Math.max(1, canvas.clientHeight || 480);
    if (width === pageWidth && height === pageHeight) return;
    pageWidth = width;
    pageHeight = height;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = THREE.MathUtils.lerp(67, 59, THREE.MathUtils.smoothstep(camera.aspect, .65, 1.45));
    camera.updateProjectionMatrix();
  }

  function project(point) {
    projectionPoint.set(point.x, point.y, point.z).project(camera);
    const { x, y, z } = projectionPoint;
    return { x: (x + 1) * pageWidth / 2, y: (1 - y) * pageHeight / 2, behind: z > 1, visible: Math.abs(x) <= 1 && Math.abs(y) <= 1 && Math.abs(z) <= 1 };
  }

  function cameraClearance(desired) {
    cameraRay.direction.copy(desired).sub(cameraRay.origin);
    const reach = cameraRay.direction.length();
    cameraRay.direction.normalize();
    let clearReach = reach;
    for (const blocker of cameraBlockers) {
      if (cameraRay.intersectBox(blocker, cameraHit)) {
        clearReach = Math.min(clearReach, cameraRay.origin.distanceTo(cameraHit) - .22);
      }
    }
    return { reach, clearReach };
  }

  function surfaceBelow(point) {
    let y = .29;
    for (const roof of cameraBlockers) {
      if (roof.max.y < point.y && roof.max.y > y &&
          point.x > roof.min.x && point.x < roof.max.x && point.z > roof.min.z && point.z < roof.max.z) {
        y = roof.max.y;
      }
    }
    return y;
  }

  function showTrialGate(state) {
    const { circuit } = state;
    trialGate.visible = circuit?.status === 'ready' || circuit?.status === 'running';
    if (!trialGate.visible) return;
    const gates = window.GridOpenWorld.circuitGates;
    const gate = gates[circuit.next];
    const pulse = .96 + Math.sin(elapsed * 2.7) * .035;
    trialGate.position.set(gate.x, gate.y, gate.z);
    trialGate.rotation.y = gate.bearing;
    trialGate.scale.setScalar(gate.radius * pulse);
    trialArcs.forEach((arc, segment) => {
      arc.material = glow[gate.phase];
      arc.rotation.z = segment * Math.PI / 2 + elapsed * .24;
    });
    trialFrame.rotation.z = Math.PI / 6;
    trialCore.material = glow[gate.phase];
    trialCore.rotation.z = -elapsed * .65;
  }

  function render(state, delta = .016) {
    resize();
    const dt = Number.isFinite(delta) ? Math.max(0, Math.min(.05, delta > 1 ? delta / 1000 : delta)) : 0;
    elapsed += dt;
    harbor.update(elapsed);
    updateTraffic(elapsed);
    const { player } = state;
    setBuildings(state.buildings?.length ? state.buildings : towers, state.bridges || [], state.districts || []);
    disposeStreets.update(elapsed, player);
    lightDistricts(state.districts || []);
    updateLocalLights(player, elapsed);
    vehicleReflections.update(player, elapsed);
    if (Math.hypot(player.x - shadowCenter.x, player.z - shadowCenter.y) > 49) {
      shadowCenter.set(player.x, player.z);
      moon.position.set(player.x + 66, 80, player.z - 115);
      moon.target.position.set(player.x, 0, player.z);
      moon.target.updateMatrixWorld();
      moon.shadow.needsUpdate = true;
      renderer.shadowMap.needsUpdate = true;
    }
    moonRay.origin.set(player.x, player.y + .2, player.z);
    const phase = Number(Boolean(player.phase));
    const cameraDistance = player.boosting ? 13.8 : 9.6;
    const freshCamera = cameraPlayer !== player || !positioned || Math.hypot(player.x - lastX, player.z - lastZ) > 25;
    cameraPlayer = player;
    const yawError = player.heading - cameraYaw;
    cameraYaw = freshCamera ? player.heading : cameraYaw + Math.atan2(Math.sin(yawError), Math.cos(yawError)) * (1 - Math.exp(-9 * dt));
    const forwardX = Math.sin(cameraYaw), forwardZ = -Math.cos(cameraYaw);
    nextCamera.set(player.x - forwardX * cameraDistance, player.y + 4.75, player.z - forwardZ * cameraDistance);
    cameraRay.origin.set(player.x, player.y + .48, player.z);
    const { reach, clearReach } = cameraClearance(nextCamera);
    const blocked = clearReach < reach;
    if (blocked && clearReach < 4.5) {
      nextCamera.set(player.x, player.y + 7.8, player.z);
      const vertical = cameraClearance(nextCamera);
      if (vertical.clearReach < vertical.reach) cameraRay.at(Math.max(.16, vertical.clearReach), nextCamera);
    } else if (blocked) cameraRay.at(Math.max(.16, clearReach), nextCamera);
    if (blocked || freshCamera) camera.position.copy(nextCamera);
    else camera.position.lerp(nextCamera, 1 - Math.exp(-13 * dt));
    const actual = cameraClearance(camera.position);
    if (actual.clearReach < actual.reach) cameraRay.at(Math.max(.16, actual.clearReach), camera.position);
    positioned = true;
    const distance = Math.hypot(player.x - camera.position.x, player.z - camera.position.z);
    const lead = THREE.MathUtils.clamp(2.5 + distance * .53, 2.5, 9.5);
    target.set(player.x + forwardX * lead, player.y + Math.min(1, distance / 10), player.z + forwardZ * lead);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    sky.position.copy(camera.position);
    drone.position.set(player.x, player.y + Math.sin(elapsed * 7) * .10, player.z);
    phaseSpill.position.set(player.x - Math.sin(player.heading) * 1.05,
      player.y - .18, player.z + Math.cos(player.heading) * 1.05);
    phaseSpill.color.setHex(phases[phase]);
    phaseSpill.intensity = player.boosting ? 13 : 6.2;
    const remainingTurn = -(player.heading || 0) - drone.rotation.y;
    drone.rotation.y += Math.atan2(Math.sin(remainingTurn), Math.cos(remainingTurn)) * .23;
    drone.rotation.z = THREE.MathUtils.lerp(drone.rotation.z, THREE.MathUtils.clamp(-Math.sin(yawError) * 1.5, -.35, .35), .18);
    drone.rotation.x = THREE.MathUtils.lerp(drone.rotation.x, player.boosting ? -.18 : -.025, .16);
    harbor.setDroneShade(drone.position, !cameraBlockers.some(box => moonRay.intersectsBox(box)), drone.rotation.y);
    drone.visible = !(player.invulnerable > 0) || Math.floor(elapsed * 17) % 3 !== 0;
    ship.update(phase, player.boosting, player.braking, elapsed);
    if (elapsed >= nextBeamShadow) {
      landingLight.shadow.needsUpdate = true;
      renderer.shadowMap.needsUpdate = true;
      nextBeamShadow = elapsed + (pageWidth < 650 ? .16 : .095);
    }
    lastX = player.x;
    lastZ = player.z;

    (state.districts || []).forEach((district, index) => {
      const base = baseFor(district, index);
      const material = district.online ? onlineMaterial : base.mat;
      base.floatCore.material = base.flightRing.material = base.rim.material = material;
      base.beamMaterial.color.copy(material.color);
      base.beamMaterial.opacity = district.online ? .39 : .21 + Math.sin(elapsed * 2 + index) * .045;
      base.floatCore.rotation.set(elapsed * .25, elapsed * .82, .17);
      base.floatCore.position.y = base.y + Math.sin(elapsed * 3 + index) * .37;
      base.chargePips.forEach((pip, index) => { pip.material = index < district.delivered ? onlineMaterial : dark; });
    });
    usePool(state.cells || [], crystalPool, crystalModel, ({ group, crystal, footprint, depth }, cell) => {
      group.visible = !cell.collected;
      if (cell.collected) return;
      const color = Number(Boolean(cell.phase));
      const elevation = cell.y + Math.sin(elapsed * 3 + cell.x) * .17;
      const height = Math.max(0, elevation - surfaceBelow(cell));
      group.position.set(cell.x, elevation, cell.z);
      crystal.material = footprint.material = glow[color];
      crystal.rotation.set(.19, elapsed * 2.3, .19);
      footprint.position.y = -height;
      depth.position.y = -height;
      depth.scale.y = Math.max(0, height - .6);
      depth.material = depthMaterials[color];
    });
    usePool(state.hazards || [], hazardPool, hazardModel, ({ group, shell, inner }, hazard) => {
      const color = Number(Boolean(hazard.phase));
      const scale = hazard.radius || 1;
      group.visible = true;
      group.position.set(hazard.x, hazard.y, hazard.z);
      group.scale.setScalar(scale);
      shell.material = hazardShell[color];
      inner.material = glow[color];
      shell.rotation.set(elapsed * -.48, elapsed * .55, elapsed * .75);
      inner.rotation.copy(shell.rotation);
    });
    usePool(state.relays || [], relayPool, relayModel, ({ group, outline, module, pole, antenna }, relay) => {
      const material = relay.active ? onlineMaterial : glow[Number(Boolean(relay.phase))];
      const height = Math.max(.35, relay.y - surfaceBelow(relay));
      group.visible = true;
      group.position.set(relay.x, relay.y, relay.z);
      outline.material = module.material = antenna.material = material;
      module.rotation.set(.28, elapsed * .69, .21);
      outline.rotation.y = Math.sin(elapsed * 1.8) * .26;
      pole.position.y = -height / 2;
      pole.scale.y = height;
    });
    cyberSigns.update(elapsed);
    updateWeather(state, camera, elapsed);
    impacts.update(elapsed, player);
    showTrialGate(state);
    reflections.update(camera, elapsed, pageWidth, pageHeight, drone);
    renderer.render(scene, camera);
  }

  resize();
  return { render, resize, project, trafficSources: updateTraffic.audioSources, get listenerHeading() { return cameraYaw; } };
}
