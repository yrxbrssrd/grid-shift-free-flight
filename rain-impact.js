import * as THREE from './vendor/three.module.js';

const windX = .14;
const windZ = .046;
const streetHeight = .277;
const lamps = [
  [0, 20, 0x82c6e4], [-7, 8, 0x54ddc9], [6, -17, 0xec6baf], [-27, -20, 0xf2a95c],
  [26, -24, 0xba83ef], [-3, 38, 0x5bd1d5], [5, 9, 0xad7bd7], [-18, 18, 0xe18c71],
];

function random(seed) {
  const value = Math.sin(seed * 26.391 + 13.17) * 43758.5453;
  return value - Math.floor(value);
}

function chooseAnchors() {
  const anchors = [];
  for (let row = -37; row <= 102; row++) {
    for (let column = -37; column <= 102; column++) {
      const seed = (row + 37) * 145 + column + 37;
      const x = (column + random(seed * 6 + 1) - .5) * 1.34;
      const z = (row + random(seed * 6 + 2) - .5) * 1.34;
      const outer = x > 52 || z > 52;
      if (outer && (Math.abs(x - 66) < 3 && Math.abs(z - 12) > 4 || Math.abs(z - 65) < 3 && Math.abs(x + 10) > 4)) continue;
      const avenue = (Math.abs(x) < 7.2 && z > -35 && z < 54) || Math.abs(z + 16) < 3.8 || Math.abs(x - 89) < 3.2 || Math.abs(z - 87) < 3.;
      if (!outer && Math.abs(x) + Math.abs(z) * .41 > 66.7) continue;
      if (!avenue && random(seed * 6 + 3) < (outer ? .88 : .76)) continue;
      anchors.push({ x, z, kind: random(seed * 6 + 4), start: random(seed * 6 + 5), size: random(seed * 6 + 6) });
    }
  }
  return anchors;
}

const timing = `
  uniform float clock;
  uniform vec2 focus;
  attribute vec4 anchor;
  attribute vec2 seed;
  attribute vec4 nearbyLight;
  varying vec2 mark;
  varying vec3 ink;
  varying float opacity;
  varying float age;
  const vec2 wind = vec2(${windX}, ${windZ});
  float hash(float num) { return fract(sin(num * 189.19) * 15371.617); }
  float period() { return mix(1.59, 3.35, seed.x); }
  float cycleAge() { return mod(clock + anchor.w * period(), period()); }
  float viewFade(vec3 point) {
    float depth = distance(cameraPosition, point);
    return smoothstep(2.1, 5.4, depth) * (1.0 - smoothstep(32.0, 52.0, depth))
      * (1.0 - smoothstep(27.0, 45.0, distance(focus, anchor.xz)));
  }
  mat4 worldToScreen() { return projectionMatrix * viewMatrix; }
`;

function material(uniforms, vertexShader, fragmentShader, derivatives = false) {
  return new THREE.ShaderMaterial({
    uniforms, vertexShader: timing + vertexShader, fragmentShader: `
      varying vec2 mark;
      varying vec3 ink;
      varying float opacity;
      varying float age;
    ` + fragmentShader,
    side: THREE.DoubleSide, forceSinglePass: true, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    extensions: { derivatives },
  });
}

function fallingMaterial(uniforms) {
  return material(uniforms, `
    void main() {
      float remaining = period() - cycleAge();
      float travel = mix(.46, .87, seed.y);
      mark = uv;
      age = remaining;
      ink = mix(nearbyLight.rgb, vec3(.67, .80, .93), .48);
      opacity = 0.0;
      if (remaining > travel || anchor.y < 0.0) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        return;
      }
      float head = remaining * mix(13.8, 22.2, seed.x);
      float tip = head + uv.y * mix(.45, .97, seed.y);
      vec3 point = anchor.xyz + vec3(-wind.x * tip, tip, -wind.y * tip);
      vec3 edge = normalize(cross(cameraPosition - point, vec3(-wind.x, 1.0, -wind.y)));
      point += edge * position.x * mix(.013, .031, seed.y);
      float top = 1.0 - smoothstep(travel * .76, travel, remaining);
      float flicker = .81 + .19 * hash(floor((clock + anchor.w * period()) / period()) + seed.y * 19.0);
      opacity = top * viewFade(point) * mix(.34, .69, nearbyLight.a) * flicker;
      gl_Position = worldToScreen() * vec4(point, 1.0);
    }
  `, `
    void main() {
      float edge = 1.0 - smoothstep(.04, .50, abs(mark.x - .5));
      float line = (1.0 - mark.y) * sqrt(1.0 - mark.y) * smoothstep(0.0, .11, mark.y);
      gl_FragColor = vec4(ink, edge * line * opacity);
      #include <colorspace_fragment>
    }
  `);
}

function rippleMaterial(uniforms) {
  return material(uniforms, `
    void main() {
      mark = position.xy;
      age = cycleAge() / mix(.43, .67, seed.y);
      ink = mix(nearbyLight.rgb, vec3(.57, .73, .91), .33);
      opacity = 0.0;
      if (age >= 1.0 || anchor.y < 0.0) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        return;
      }
      float swell = (1.0 - exp(-age * 3.65)) * mix(.20, .44, seed.y);
      float size = .028 + swell;
      vec3 point = anchor.xyz + vec3(position.x * size, .001, position.y * size);
      opacity = viewFade(anchor.xyz) * mix(.41, .71, nearbyLight.a) * (1.0 - age) * (1.0 - age);
      gl_Position = worldToScreen() * vec4(point, 1.0);
    }
  `, `
    void main() {
      float radius = length(mark);
      float pixel = max(.014, fwidth(radius));
      float first = 1.0 - smoothstep(.025, .025 + pixel, abs(radius - .74));
      float second = (1.0 - smoothstep(.018, .018 + pixel, abs(radius - .45))) * smoothstep(.08, .22, age);
      float flash = exp(-radius * radius * 37.0 - age * 18.0);
      float shape = (first + second * .26 + flash * .58) * (1.0 - smoothstep(.88, 1.0, radius));
      gl_FragColor = vec4(ink, shape * opacity);
      #include <colorspace_fragment>
    }
  `, true);
}

function crownMaterial(uniforms) {
  return material(uniforms, `
    vec3 bubble(float t, vec2 along, float kick, float sideways) {
      vec2 offset = along * (.018 + t * sideways);
      float climb = max(0.0, t * (kick - 9.0 * t));
      return vec3(offset.x, climb, offset.y);
    }
    void main() {
      float spray = position.z;
      float throwSeed = hash(seed.x * 63.0 + spray * 87.9);
      float localAge = cycleAge() - throwSeed * .024;
      float kick = mix(1.55, 2.77, throwSeed);
      float stay = kick / 9.0;
      mark = uv;
      age = localAge;
      ink = mix(nearbyLight.rgb, vec3(.83, .92, 1.0), .60);
      opacity = 0.0;
      if (localAge <= 0.0 || localAge >= stay || anchor.y < 0.0) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        return;
      }
      float angle = (spray + seed.x + throwSeed * .55) * 1.256637;
      vec2 along = vec2(cos(angle), sin(angle));
      float outward = mix(.59, 1.46, throwSeed);
      float t = max(0.0, localAge - (1.0 - uv.y) * mix(.032, .076, seed.y));
      vec3 point = anchor.xyz + bubble(t, along, kick, outward);
      vec3 path = bubble(t + .015, along, kick, outward) - bubble(t - .015, along, kick, outward);
      vec3 edge = normalize(cross(cameraPosition - point, path));
      point += edge * position.x * mix(.012, .027, seed.y);
      opacity = viewFade(point) * mix(.52, .84, nearbyLight.a) * smoothstep(0.0, .021, localAge) * (1.0 - localAge / stay);
      gl_Position = worldToScreen() * vec4(point, 1.0);
    }
  `, `
    void main() {
      float thin = 1.0 - smoothstep(.18, .49, abs(mark.x - .5));
      float lengthwise = smoothstep(0.0, .55, mark.y) * (1.0 - smoothstep(.89, 1.0, mark.y));
      gl_FragColor = vec4(ink, thin * lengthwise * opacity);
      #include <colorspace_fragment>
    }
  `);
}

function crownGeometry() {
  const geometry = new THREE.BufferGeometry();
  const vertices = [];
  const uv = [];
  const indices = [];
  for (let arm = 0; arm < 5; arm++) {
    const i = arm * 4;
    vertices.push(-1, 0, arm, 1, 0, arm, -1, 1, arm, 1, 1, arm);
    uv.push(0, 0, 1, 0, 0, 1, 1, 1);
    indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  return geometry;
}

function contains(tier, x, z, border = 0) {
  return Math.abs(x - tier.x) <= tier.w / 2 + border && Math.abs(z - tier.z) <= tier.d / 2 + border;
}

function isCovered(tier, x, z, height) {
  const enter = Math.max(0, tier.bottom - height);
  const exit = Math.min(21, tier.h - height);
  if (enter >= exit) return false;
  const minX = Math.min(x - windX * enter, x - windX * exit);
  const maxX = Math.max(x - windX * enter, x - windX * exit);
  const minZ = Math.min(z - windZ * enter, z - windZ * exit);
  const maxZ = Math.max(z - windZ * enter, z - windZ * exit);
  return maxX > tier.x - tier.w / 2 && minX < tier.x + tier.w / 2 &&
    maxZ > tier.z - tier.d / 2 && minZ < tier.z + tier.d / 2;
}

export function addRainImpacts(scene) {
  const anchors = chooseAnchors();
  const position = new THREE.InstancedBufferAttribute(new Float32Array(anchors.length * 4), 4);
  const lightData = new THREE.InstancedBufferAttribute(new Float32Array(anchors.length * 4), 4);
  const seed = new THREE.InstancedBufferAttribute(Float32Array.from(anchors.flatMap(({ kind, size }) => [kind, size])), 2);
  const uniforms = { clock: { value: 0 }, focus: { value: new THREE.Vector2() } };
  const group = new THREE.Group();
  group.name = 'Rain impacts';
  scene.add(group);

  function mount(base, surface, order) {
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setIndex(base.index);
    geometry.setAttribute('position', base.getAttribute('position'));
    geometry.setAttribute('uv', base.getAttribute('uv'));
    geometry.setAttribute('anchor', position);
    geometry.setAttribute('seed', seed);
    geometry.setAttribute('nearbyLight', lightData);
    geometry.instanceCount = anchors.length;
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    group.add(mesh);
  }
  const quad = new THREE.PlaneGeometry(2, 2);
  mount(quad, rippleMaterial(uniforms), 2);
  mount(crownGeometry(), crownMaterial(uniforms), 7);
  mount(quad, fallingMaterial(uniforms), 8);

  let previousBuildings;
  function setBuildings(buildings = []) {
    if (buildings === previousBuildings) return;
    previousBuildings = buildings;
    const tiers = buildings.flatMap(building => building.levels || [{ ...building, bottom: 0 }]);
    anchors.forEach(({ x, z, start }, i) => {
      let roof;
      for (const tier of tiers) {
        if (contains(tier, x, z) && (!roof || tier.h > roof.h)) roof = tier;
      }
      let height = roof ? roof.h + .13 : streetHeight;
      if ((roof && !contains(roof, x, z, -.135)) || tiers.some(tier => isCovered(tier, x, z, height))) height = -1;
      position.setXYZW(i, x, height, z, start);
    });
    position.needsUpdate = true;
  }

  const baseRain = new THREE.Color(0x9ab8d0);
  const tint = new THREE.Color();
  const sourceColor = new THREE.Color();
  function setLights(signs = []) {
    const sources = [...lamps, ...signs.map(({ x, z, color }) => [x, z, color])];
    anchors.forEach(({ x, z }, i) => {
      let best = 89;
      let closest = 0;
      for (const [lightX, lightZ, color] of sources) {
        const distance = (x - lightX) ** 2 + (z - lightZ) ** 2;
        if (distance >= best) continue;
        best = distance;
        closest = color;
      }
      const intensity = Math.max(0, 1 - best / 89);
      tint.copy(baseRain).lerp(sourceColor.set(closest), intensity * .65);
      lightData.setXYZW(i, tint.r, tint.g, tint.b, intensity);
    });
    lightData.needsUpdate = true;
  }

  setBuildings();
  setLights();

  const motion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  return { setBuildings, setLights, update(elapsed, player) {
    group.visible = !motion?.matches;
    uniforms.clock.value = elapsed;
    uniforms.focus.value.set(player.x, player.z);
  } };
}
