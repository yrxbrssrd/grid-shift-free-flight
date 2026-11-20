import * as THREE from './vendor/three.module.js';

const rainWindX = .14;
const rainWindZ = .046;
const mistPatches = [
  [-28, -15, 6.5, .77, 4.8, 0xe77649, .12],
  [-18, 23, 4.3, .75, 5.2, 0xe7a85b, .11],
  [-36, 15, 6.0, .80, 4.6, 0xf06c73, .10],
  [-4, 12, 6.8, .83, 3.9, 0x69b9f5, .15],
  [2, 24, 4.2, .63, 5.4, 0x62b8d9, .11],
  [5, -11, 5.3, .86, 5.1, 0x437ede, .16],
  [-3, -34, 5.0, .81, 5.2, 0x73baca, .11],
  [15, -16, 5.9, .84, 4.2, 0xe477e3, .13],
  [30, -24, 6.5, .85, 4.5, 0xc375ed, .13],
  [26, 18, 5.1, .76, 4.0, 0xe468d4, .13],
  [35, -40, 4.9, .70, 5.0, 0x9b7cf8, .11],
];
const searchlights = [
  { x: -38.8, y: 13.82, z: -58, range: 47, spread: 4.6, tilt: .39, bearing: .78, phase: .7, color: 0x82d6f0 },
  { x: 47.2, y: 13.82, z: -60, range: 45, spread: 4.1, tilt: .37, bearing: -.78, phase: 2.7, color: 0xb389e3 },
  { x: 71.2, y: 13.82, z: -57, range: 42, spread: 4.2, tilt: .40, bearing: -1.19, phase: .2, color: 0x789ebe },
];

function noise(seed) {
  const value = Math.sin(seed * 78.233 + 19.19) * 43758.5453;
  return value - Math.floor(value);
}

function makeRain(time) {
  const positions = [];
  const drops = [];
  const anchors = [];
  const spacing = 1.9;
  for (let row = -32; row <= 32; row++) {
    for (let column = -32; column <= 32; column++) {
      const seed = 65 * (row + 32) + column + 32;
      const x = (column + noise(seed * 5 + 1) - .5) * spacing;
      const z = (row + noise(seed * 5 + 2) - .5) * spacing;
      const speed = noise(seed * 5 + 3);
      const cycle = noise(seed * 5 + 4);
      anchors.push([x, z]);
      // The two segment vertices share an anchor and cycle. Their y values mark the head and tail.
      positions.push(x, 0, z, x, 1, z);
      drops.push(cycle, speed, cycle, speed);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('drop', new THREE.Float32BufferAttribute(drops, 2));
  const rainFloor = new THREE.BufferAttribute(new Float32Array(positions.length / 3), 1);
  geometry.setAttribute('rainFloor', rainFloor);
  const focus = new THREE.Vector2();
  const rain = new THREE.LineSegments(geometry, new THREE.ShaderMaterial({
    uniforms: { time, focus: { value: focus }, wind: { value: new THREE.Vector2(rainWindX, rainWindZ) } },
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    vertexShader: `
      attribute vec2 drop;
      attribute float rainFloor;
      uniform float time;
      uniform vec2 focus;
      uniform vec2 wind;
      varying vec3 tint;
      varying float density;
      void main() {
        float head = fract(drop.x - time * mix(.35, .73, drop.y)) * 33. + .32;
        float y = head + position.y * mix(.36, .94, drop.y);
        vec2 xz = position.xz - wind * y;
        vec3 world = vec3(xz.x, y, xz.y);
        float fromCamera = distance(world, cameraPosition);
        float distanceFade = smoothstep(4.0, 9.0, fromCamera) * (1.0 - smoothstep(30.0, 61.0, fromCamera));
        float nearPlayer = 1.0 - smoothstep(25.0, 42.0, distance(xz, focus));
        float groundFade = smoothstep(rainFloor, rainFloor + .7, head) * (1.0 - smoothstep(27.0, 33.0, head));
        float byStreet = 1.0 - min(smoothstep(3.0, 12.0, abs(xz.x)), smoothstep(4.0, 15.0, abs(xz.y + 16.0)));
        density = distanceFade * nearPlayer * groundFade * mix(.54, 1.0, byStreet) * mix(.18, .025, position.y);
        tint = mix(vec3(.17, .32, .47), vec3(.38, .16, .36), smoothstep(12.0, 50.0, xz.x));
        tint = mix(tint, vec3(.37, .23, .15), smoothstep(14.0, 46.0, -xz.x));
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 tint;
      varying float density;
      void main() {
        if (density < .006) discard;
        gl_FragColor = vec4(tint, density);
        #include <colorspace_fragment>
      }
    `,
  }));
  rain.frustumCulled = false;
  rain.renderOrder = 9;

  function setRoofs(buildings) {
    const tiers = buildings.flatMap(building => building.levels || [building]);
    anchors.forEach(([x, z], index) => {
      let floor = .33;
      for (const { x: centerX, z: centerZ, w, d, h } of tiers) {
        if (Math.abs(x - rainWindX * h - centerX) < w / 2 &&
            Math.abs(z - rainWindZ * h - centerZ) < d / 2) floor = Math.max(floor, h + .18);
      }
      rainFloor.setX(index * 2, floor);
      rainFloor.setX(index * 2 + 1, floor);
    });
    rainFloor.needsUpdate = true;
  }

  return { rain, focus, setRoofs };
}

function makeMist(time) {
  const geometry = new THREE.SphereGeometry(1, 14, 10);
  geometry.setAttribute('strength', new THREE.InstancedBufferAttribute(
    Float32Array.from(mistPatches, patch => patch[6]), 1,
  ));
  const material = new THREE.ShaderMaterial({
    uniforms: { time },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: `
      attribute float strength;
      varying vec3 worldPoint;
      varying vec3 center;
      varying vec3 radius;
      varying vec3 tint;
      varying float opacity;
      void main() {
        vec4 local = instanceMatrix * vec4(position, 1.0);
        worldPoint = (modelMatrix * local).xyz;
        center = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        radius = vec3(instanceMatrix[0][0], instanceMatrix[1][1], instanceMatrix[2][2]);
        tint = instanceColor;
        opacity = strength;
        gl_Position = projectionMatrix * viewMatrix * vec4(worldPoint, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      varying vec3 worldPoint;
      varying vec3 center;
      varying vec3 radius;
      varying vec3 tint;
      varying float opacity;
      void main() {
        vec3 origin = (cameraPosition - center) / radius;
        vec3 ray = normalize(worldPoint - cameraPosition) / radius;
        float projection = max(0.0, -dot(ray, origin) / dot(ray, ray));
        vec3 core = origin + ray * projection;
        float crossSection = max(0.0, 1.0 - dot(core, core));
        vec2 worldCore = center.xz + core.xz * radius.xz;
        float clouds = .73 + .27 * sin(worldCore.x * .63 + sin(worldCore.y * .82) + time * .44)
                                 * sin(worldCore.y * .81 - time * .30);
        float fade = 1.0 - smoothstep(29.0, 61.0, distance(center, cameraPosition));
        gl_FragColor = vec4(tint, crossSection * crossSection * clouds * fade * opacity);
        #include <colorspace_fragment>
      }
    `,
  });
  const mist = new THREE.InstancedMesh(geometry, material, mistPatches.length);
  const shape = new THREE.Object3D();
  const color = new THREE.Color();
  mistPatches.forEach(([x, z, width, height, depth, tint], index) => {
    shape.position.set(x, .29 + height, z);
    shape.scale.set(width, height, depth);
    shape.updateMatrix();
    mist.setMatrixAt(index, shape.matrix);
    mist.setColorAt(index, color.setHex(tint));
  });
  mist.renderOrder = 1;
  return mist;
}

function makeSearchlights(time) {
  const material = new THREE.ShaderMaterial({
    uniforms: { time },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: `
      varying vec3 worldPoint;
      varying vec3 source;
      varying vec3 throwVector;
      varying vec3 tint;
      varying float width;
      void main() {
        mat4 worldMatrix = modelMatrix * instanceMatrix;
        worldPoint = (worldMatrix * vec4(position, 1.0)).xyz;
        source = (worldMatrix * vec4(0.0, -.5, 0.0, 1.0)).xyz;
        throwVector = worldMatrix[1].xyz;
        width = length(worldMatrix[0].xyz);
        tint = instanceColor;
        gl_Position = projectionMatrix * viewMatrix * vec4(worldPoint, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      varying vec3 worldPoint;
      varying vec3 source;
      varying vec3 throwVector;
      varying vec3 tint;
      varying float width;
      void main() {
        vec3 viewRay = normalize(worldPoint - cameraPosition);
        vec3 eye = cameraPosition - source;
        float reach = length(throwVector);
        vec3 direction = throwVector / reach;
        float angle = dot(direction, viewRay);
        float axial = (dot(eye, direction) - angle * dot(eye, viewRay)) / max(.035, 1.0 - angle * angle);
        axial = clamp(axial, 0.0, reach);
        vec3 axisPoint = direction * axial - eye;
        float fromAxis = length(axisPoint - viewRay * dot(axisPoint, viewRay));
        float along = axial / reach;
        float radial = clamp(1.0 - fromAxis / (width * mix(.085, 1.0, along)), 0.0, 1.0);
        float edge = radial * radial * (3.0 - 2.0 * radial);
        float falloff = (1.0 - smoothstep(.24, .95, along)) * smoothstep(0.0, .035, along);
        float bands = .91 + .09 * sin(worldPoint.y * .63 + worldPoint.x * .11 - time * .36);
        float haze = 1.0 - smoothstep(85.0, 195.0, length(eye));
        float density = edge * falloff * bands * haze * (.14 + .19 * exp(-along * 6.0));
        gl_FragColor = vec4(mix(tint, vec3(.72, .85, 1.0), radial * .24), density);
        #include <colorspace_fragment>
      }
    `,
  });
  const beam = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, .085, 1, 18, 1, true), material, searchlights.length);
  beam.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  beam.frustumCulled = false;
  beam.renderOrder = 2;
  const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(.31, 10, 5),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), searchlights.length);
  const shape = new THREE.Object3D();
  const direction = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();
  searchlights.forEach(({ x, y, z, color }, index) => {
    tint.setHex(color);
    beam.setColorAt(index, tint);
    lamps.setColorAt(index, tint.lerp(new THREE.Color(0xf4faff), .45));
    shape.position.set(x, y, z);
    shape.updateMatrix();
    lamps.setMatrixAt(index, shape.matrix);
  });

  let lastTime = -1;
  function sweep() {
    const elapsed = time.value;
    if (elapsed === lastTime) return;
    lastTime = elapsed;
    searchlights.forEach(({ x, y, z, range, spread, tilt, bearing, phase }, index) => {
      const angle = bearing + .44 * Math.sin(elapsed * .19 + phase);
      const lean = tilt + .10 * Math.sin(elapsed * .23 + phase);
      direction.set(Math.sin(angle) * lean, 1, -Math.cos(angle) * lean).normalize();
      shape.position.set(x, y, z).addScaledVector(direction, range * .5);
      shape.quaternion.setFromUnitVectors(up, direction);
      shape.scale.set(spread, range, spread);
      shape.updateMatrix();
      beam.setMatrixAt(index, shape.matrix);
    });
    beam.instanceMatrix.needsUpdate = true;
  }
  sweep();
  return { beam, lamps, sweep };
}

export function addCyberWeather(scene) {
  const time = { value: 0 };
  const { rain, focus, setRoofs } = makeRain(time);
  const mist = makeMist(time);
  const { beam, lamps, sweep } = makeSearchlights(time);
  const motion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  let lastBuildings;
  scene.add(mist, rain, beam, lamps);

  return function updateWeather({ player, buildings }, _camera, elapsed) {
    if (buildings !== lastBuildings) {
      setRoofs(buildings || []);
      lastBuildings = buildings;
    }
    rain.visible = !motion?.matches;
    time.value = motion?.matches ? 0 : elapsed;
    focus.set(player.x, player.z);
    sweep();
  };
}
