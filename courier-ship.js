import * as THREE from './vendor/three.module.js';

const modes = [0x56e8ff, 0xff58bd];

// The same engraved sheet supplies the coat, its scratches and the raised panel edges.
function aircraftSkin() {
  const layers = Array.from({ length: 3 }, () => {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    return c.getContext('2d');
  });
  const [paint, height, rough] = layers;
  let seed = 82921;
  const random = () => ((seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 4294967296);
  const palettes = [['#a7acae','#c8c9c4','#89979f','#b8bcb9'], ['#888','#a3a3a3','#949494','#999'], ['#b9b9b9','#999','#777','#aaa']];
  for (let row = 0; row < 8; row++) for (let col = 0; col < 4; col++) {
    const cell = Math.floor(random() * 4), x = col * 128, y = row * 64;
    layers.forEach((ctx, i) => {
      ctx.fillStyle = palettes[i][cell]; ctx.fillRect(x, y, 128, 64);
      ctx.strokeStyle = ['#323d42','#262626','#525252'][i]; ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, y + 2, 124, 60);
      for (const sx of [8,118]) for (const sy of [8,54]) {
        ctx.fillStyle = ['#343d40','#323232','#606060'][i]; ctx.fillRect(x + sx, y + sy, 3, 3);
      }
    });
    if ((row + col * 3) % 6 === 0) { paint.fillStyle = '#d49a43'; paint.fillRect(x + 4,y + 6, 120, 10); }
  }
  for (let i = 0; i < 5200; i++) {
    const x = random() * 512, y = random() * 512, length = .5 + random() ** 5 * 9;
    paint.fillStyle = i % 2 ? '#132c3533' : '#ebeee854'; paint.fillRect(x,y,length,.7);
    if (length > 4) {
      rough.fillStyle = '#656565';
      rough.fillRect(x, y, length, 1.2);
      height.fillStyle = '#656565';
      height.fillRect(x, y, length, .8);
    }
  }
  const maps = layers.map(({canvas}, i) => { const t = new THREE.CanvasTexture(canvas); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.anisotropy=4; if(!i)t.colorSpace=THREE.SRGBColorSpace; return t; });
  return { map:maps[0], bumpMap:maps[1], roughnessMap:maps[2], bumpScale:.018 };
}

// Loft chamfered cross sections along the flight axis, keeping the canopy and hull independent.
function loft(sections) {
  const vertices=[], uvs=[];
  const ring=([z,w,h,y])=>[[-w*.72,y+h,z],[w*.72,y+h,z],[w,y+h*.35,z],[w*.91,y-h*.45,z],[w*.62,y-h,z],[-w*.62,y-h,z],[-w*.91,y-h*.45,z],[-w,y+h*.35,z]];
  const loops=sections.map(ring);
  function triangle(a,b,c, ta,tb,tc) {vertices.push(...a,...b,...c);uvs.push(...ta,...tb,...tc);}
  for(let row=1;row<loops.length;row++){
    const f=loops[row-1],b=loops[row], v0=(row-1)/(loops.length-1),v1=row/(loops.length-1);
    for(let i=0;i<8;i++){
      const j=(i+1)%8, u0=i/8,u1=(i+1)/8;
      triangle(f[i],b[i],b[j],[u0,v0],[u0,v1],[u1,v1]);
      triangle(f[i],b[j],f[j],[u0,v0],[u1,v1],[u1,v0]);
    }
  }
  for(let i=1;i<7;i++) {
    triangle(loops[0][0],loops[0][i],loops[0][i+1],[0,0],[1,0],[.5,1]);
    const end=loops[loops.length-1];triangle(end[0],end[i+1],end[i],[0,0],[1,0],[.5,1]);
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.computeVertexNormals();return geo;
}

const canopySections = [
  [-.98, .041, .126, .151], [-.83, .145, .163, .23], [-.64, .23, .199, .345],
  [-.43, .282, .218, .438], [-.21, .293, .228, .464], [-.015, .273, .223, .424],
  [.143, .216, .214, .328], [.232, .149, .215, .246],
];

function canopyPoint(t, angle) {
  const segment = t * (canopySections.length - 1);
  const i = Math.min(Math.floor(segment), canopySections.length - 2);
  const f = segment - i;
  const section = canopySections[i].map((before, axis) => {
    const p = canopySections[Math.max(0, i - 1)][axis];
    const next = canopySections[i + 1][axis];
    const q = canopySections[Math.min(canopySections.length - 1, i + 2)][axis];
    const m = (next - p) * .5;
    const n = (q - before) * .5;
    return before + f * (m + f * (3 * (next - before) - 2 * m - n + f * (2 * (before - next) + m + n)));
  });
  const [z, width, lower, upper] = section;
  return new THREE.Vector3(width * Math.sin(angle), lower + (upper - lower) * Math.cos(angle), z);
}

function canopyGeometry() {
  const vertices = [];
  const uv = [];
  const indices = [];
  const rows = 34;
  const columns = 20;
  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column <= columns; column++) {
      const u = column / columns;
      vertices.push(...canopyPoint(row / rows, (u - .5) * Math.PI).toArray());
      uv.push(u, row / rows);
      if (row === rows || column === columns) continue;
      const a = row * (columns + 1) + column;
      const b = a + columns + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function tube(sample, radius, segments = 24) {
  const points = Array.from({ length: segments + 1 }, (_, i) => sample(i / segments));
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, radius, 6, false);
}

function trimLathe(profile) {
  return new THREE.LatheGeometry(profile.map(([radius, height]) => new THREE.Vector2(radius, height)), 24).rotateX(Math.PI / 2);
}

function paintedText(width, height, paint) {
  const sheet = document.createElement('canvas');
  sheet.width = width;
  sheet.height = height;
  paint(sheet.getContext('2d'));
  const map = new THREE.CanvasTexture(sheet);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

// Merge rigid components once. The canopy and the exhaust keep independent render state.
function combine(parts) {
  const attributes = { position: [], normal: [], uv: [] };
  for (const part of parts) {
    part.updateMatrix();
    const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
    geometry.applyMatrix4(part.matrix);
    for (const [name, values] of Object.entries(attributes)) {
      for (const value of geometry.getAttribute(name).array) values.push(value);
    }
    geometry.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  for (const [name, values] of Object.entries(attributes)) {
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, name === 'uv' ? 2 : 3));
  }
  return geometry;
}

function exhaust(group, nozzleX, nozzleY, nozzleZ) {
  const clock = { value: 0 };
  const flow = { value: .65 };
  const color = { value: new THREE.Color(modes[0]) };
  const plume = new THREE.ShaderMaterial({
    uniforms: { clock, flow, color },
    transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec3 worldPoint;
      varying vec3 source;
      varying vec3 axis;
      varying float radius;
      void main() {
        mat4 launch = modelMatrix * instanceMatrix;
        worldPoint = (launch * vec4(position, 1.0)).xyz;
        source = launch[3].xyz;
        axis = launch[2].xyz;
        radius = length(launch[0].xyz);
        gl_Position = projectionMatrix * viewMatrix * vec4(worldPoint, 1.0);
      }`,
    fragmentShader: `
      uniform float clock;
      uniform float flow;
      uniform vec3 color;
      varying vec3 worldPoint;
      varying vec3 source;
      varying vec3 axis;
      varying float radius;
      void main() {
        float reach = length(axis);
        vec3 direction = axis / reach;
        vec3 ray = normalize(worldPoint - cameraPosition);
        vec3 eye = cameraPosition - source;
        float lean = dot(direction, ray);
        float along = clamp((dot(eye, direction) - lean * dot(eye, ray)) / max(.034, 1.0 - lean * lean), 0.0, reach);
        vec3 fromEye = direction * along - eye;
        float dist = length(fromEye - ray * dot(fromEye, ray));
        float t = along / reach;
        float radial = dist / (radius * mix(1.0, .31, t));
        float edge = 1.0 - smoothstep(.07, .91, radial);
        float tail = (1.0 - t) * (1.0 - t);
        float stream = .77 + .23 * sin(t * 31.0 - clock * 40.0 + radial * 7.0);
        vec3 tint = mix(color, vec3(.80, .93, 1.0), edge * (1.0 - t) * .79);
        gl_FragColor = vec4(tint, edge * edge * tail * flow * stream);
        #include <colorspace_fragment>
      }`,
  });
  const geometry = new THREE.CylinderGeometry(.35, 1, 1, 24, 1, true).rotateX(Math.PI / 2).translate(0, 0, .5);
  const jets = new THREE.InstancedMesh(geometry, plume, 2);
  jets.name = 'Tapered exhaust';
  jets.frustumCulled = false;
  jets.renderOrder = 7;
  jets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(jets);
  const pose = new THREE.Object3D();
  return (phase, boost, brake, time) => {
    clock.value = time;
    flow.value = boost ? 1.06 : brake ? .36 : .68;
    color.value.setHex(modes[phase]);
    for (const [i, side] of [-1, 1].entries()) {
      const surge = 1 + .067 * Math.sin(time * 35 + (i * 1.7));
      pose.position.set(side * nozzleX, nozzleY, nozzleZ);
      pose.scale.set(.105, .105, (boost ? .95 : brake ? .14 : .39) * surge);
      pose.updateMatrix();
      jets.setMatrixAt(i, pose.matrix);
    }
    jets.instanceMatrix.needsUpdate = true;
  };
}

export function createCourierShip() {
  const group = new THREE.Group();
  group.name = 'Night courier';
  const skin = aircraftSkin();
  const standard = options => new THREE.MeshStandardMaterial(options);
  const alloy = standard({ ...skin, color: 0xe4e0cd, metalness: .62, roughness: .71 });
  const chassis = standard({ ...skin, color: 0x435061, metalness: .73, roughness: .78 });
  const ceramic = standard({ color: 0x212a34, roughness: .68, metalness: .34, side: THREE.DoubleSide });
  const steel = standard({ color: 0x9ca5a9, roughness: .33, metalness: .79 });
  const baffle = standard({ color: 0x53616a, roughness: .53, metalness: .62 });
  const recess = standard({ color: 0x111b23, roughness: .94, metalness: .08 });
  const ochre = standard({ ...skin, color: 0xefae4f, metalness: .46, roughness: .62 });
  const copper = standard({ color: 0x946449, roughness: .45, metalness: .73 });
  const upholstery = standard({ color: 0x59433b, roughness: .9, metalness: .03 });
  const hot = standard({ color: 0x6d9fbc, emissive: modes[0], emissiveIntensity: 1.65, roughness: .34, metalness: .18 });
  const runningLight = new THREE.MeshBasicMaterial({ color: 0xdbfdff, toneMapped: false });
  const parts = new Map();
  const box = new THREE.BoxGeometry();
  const fastener = new THREE.CylinderGeometry(.5, .5, 1, 6);
  function add(geometry, material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
    const part = new THREE.Mesh(geometry, material);
    part.position.set(x, y, z);
    part.scale.set(sx, sy, sz);
    if (!parts.has(material)) parts.set(material, []);
    parts.get(material).push(part);
    return part;
  }

  add(loft([[-1.36, .075, .055, -.015], [-1.08, .30, .11, .015], [-.59, .44, .19, .025], [.14, .50, .215, .012], [.71, .43, .19, .0], [1.06, .32, .105, -.036]]), alloy);
  add(loft([[-1.25, .07, .055, -.065], [-.67, .39, .10, -.14], [.30, .45, .095, -.17], [.95, .28, .05, -.09]]), chassis);

  const glass = new THREE.MeshPhysicalMaterial({ color: 0x407789, opacity: .32, transparent: true, depthWrite: false,
    metalness: .24, roughness: .13, clearcoat: 1, clearcoatRoughness: .065, envMapIntensity: 1.35 });
  glass.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      float incidence = 1.0 - abs(dot(normal, normalize(vViewPosition)));
      diffuseColor.a *= .79 + .81 * pow(incidence, 2.7);
      #include <opaque_fragment>`);
  };
  const glazing = new THREE.Mesh(canopyGeometry(), glass);
  glazing.name = 'Curved smoked cockpit glazing';
  glazing.receiveShadow = true;
  glazing.renderOrder = 4;
  group.add(glazing);
  for (const end of [0, 1]) {
    add(tube(s => canopyPoint(end, (s - .5) * Math.PI), .015, 24), ceramic);
  }
  for (const band of [.245, .842]) {
    add(tube(s => canopyPoint(band, (s - .5) * Math.PI), .0115, 26), steel);
  }
  for (const side of [-1, 1]) {
    add(tube(s => canopyPoint(s, side * Math.PI / 2), .018), ceramic);
    add(tube(s => canopyPoint(.21 + s * .69, side * 1.51), .0054), copper);
    add(box, ceramic, side * .203, .24, -.26, .055, .052, .67);
    add(box, steel, side * .198, .269, -.32, .027, .019, .25);
    for (const z of [-.50, -.34, -.12, .048]) add(fastener, steel, side * .224, .258, z, .022, .009, .022);
  }
  add(box, ceramic, 0, .235, -.34, .38, .032, .65);
  add(box, steel, 0, .257, -.066, .174, .035, .248);
  add(box, upholstery, 0, .279, -.114, .161, .046, .226);
  add(box, ceramic, 0, .326, -.018, .164, .151, .050).rotation.x = .24;
  add(box, upholstery, 0, .328, -.041, .132, .134, .041).rotation.x = .24;
  add(box, copper, 0, .381, .017, .104, .039, .041).rotation.x = .23;
  for (const side of [-1, 1]) {
    add(box, ochre, side * .052, .338, -.069, .014, .115, .009).rotation.x = .24;
    add(box, steel, side * .093, .269, -.502, .035, .030, .038).rotation.x = .26;
  }
  add(box, ceramic, 0, .274, -.635, .365, .076, .082).rotation.x = -.67;
  const dash = new THREE.MeshBasicMaterial({ map: paintedText(256, 80, pen => {
    pen.fillStyle = '#092123'; pen.fillRect(0, 0, 256, 80);
    pen.strokeStyle = '#51dec4'; pen.lineWidth = 3;
    pen.strokeRect(10, 8, 82, 64); pen.strokeRect(104, 8, 142, 64);
    pen.strokeStyle = '#37aa9b'; pen.beginPath(); pen.arc(52, 40, 22, 0, Math.PI * 2); pen.stroke();
    pen.strokeStyle = '#a6ffe4'; pen.beginPath();
    [[116, 50], [134, 38], [151, 42], [167, 25], [190, 46], [226, 29]].forEach(([x, y], i) => i ? pen.lineTo(x, y) : pen.moveTo(x, y));
    pen.stroke();
    pen.fillStyle = '#bcffde'; pen.font = 'bold 12px monospace'; pen.fillText('SYS 07', 116, 62);
  }), toneMapped: false });
  add(new THREE.PlaneGeometry(.310, .058), dash, 0, .297, -.604).rotation.x = -.67;

  const nacelle = loft([[-.80, .082, .07, -.06], [-.48, .188, .13, .02], [.08, .236, .195, .03], [.70, .211, .19, .025], [.99, .177, .159, .019]]);
  const upperPanel = loft([[-.57, .06, .025, .15], [-.17, .15, .05, .20], [.55, .15, .04, .20], [.77, .09, .02, .18]]);
  const nozzleShell = trimLathe([[.143, 0], [.176, .026], [.193, .084], [.197, .157], [.183, .236], [.173, .272], [.153, .272], [.158, .232]]);
  const thrustWell = trimLathe([[.154, .258], [.148, .223], [.132, .159], [.113, .128], [.091, .114], [.049, .108]]);
  const seal = new THREE.TorusGeometry(.163, .014, 6, 24);
  const fieldCoil = new THREE.TorusGeometry(.091, .011, 6, 22);
  const emitter = new THREE.TorusGeometry(.039, .008, 6, 16);
  const engineY = .048;
  const engineX = .645;
  for (const side of [-1, 1]) {
    const points = [[.31, -.73], [.56, -.57], [.77, -.10], [1.23, .40], [1.20, .72], [.88, .64], [.67, .37], [.33, .65]];
    const plan = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(side * x, z)));
    const wing = new THREE.ExtrudeGeometry(plan, { depth: .055, bevelEnabled: true, bevelSize: .032, bevelThickness: .029, bevelSegments: 2 });
    add(wing, alloy, 0, .015, 0).rotation.x = Math.PI / 2;
    add(box, ochre, side * .99, .079, .37, .095, .035, .47).rotation.y = side * .77;
    add(box, chassis, side * 1.17, .085, .48, .105, .12, .27).rotation.y = side * .13;
    add(box, hot, side * 1.174, .105, .51, .107, .023, .146);
    add(nacelle, chassis, side * engineX, .025, .08);
    add(upperPanel, ochre, side * .64, .015, .06);
    add(nozzleShell, steel, side * engineX, engineY, 1.0);
    add(thrustWell, ceramic, side * engineX, engineY, 1.0);
    add(seal, copper, side * engineX, engineY, 1.267);
    add(fieldCoil, hot, side * engineX, engineY, 1.148);
    add(emitter, hot, side * engineX, engineY, 1.130);
    add(fastener, ceramic, side * engineX, engineY, 1.108, .153, .021, .153).rotation.x = Math.PI / 2;
    for (let blade = 0; blade < 10; blade++) {
      const angle = blade * Math.PI / 5;
      const x = side * engineX + Math.cos(angle) * .122;
      const y = engineY + Math.sin(angle) * .122;
      add(box, blade % 3 ? steel : copper, x, y, 1.194, .064, .012, .091).rotation.set(0, -.29, angle + .31, 'ZYX');
      if (!(blade % 2)) add(fastener, ceramic, side * engineX + Math.cos(angle + .30) * .174,
        engineY + Math.sin(angle + .30) * .174, 1.249, .020, .014, .020).rotation.x = Math.PI / 2;
    }
    add(box, recess, side * .644, .246, .307, .216, .031, .50);
    for (let slit = 0; slit < 6; slit++) {
      const z = .09 + slit * .087;
      add(box, baffle, side * .644, .269, z, .207, .028, .041).rotation.x = -.16;
      add(box, steel, side * .644, .282, z + .009, .191, .013, .012);
    }
    add(box, steel, side * .91, .027, .075, .035, .052, .78).rotation.y = side * .75;
    const fin = loft([[-.18, .022, .06, .03], [.20, .027, .18, .10], [.43, .025, .16, .090]]);
    add(fin, chassis, side * .662, .18, .52).rotation.z = side * -.29;
    add(box, runningLight, side * .23, .101, -1.035, .074, .04, .021);
    add(box, hot, side * .285, .105, .973, .052, .022, .020);
    for (const z of [.44, .84]) add(fastener, steel, side * .276, .233, z, .037, .019, .037);
  }

  add(box, chassis, 0, .212, .59, .577, .049, .63);
  add(box, recess, 0, .239, .622, .514, .012, .448);
  const louver = loft([[-.025, .227, .010, -.008], [-.011, .235, .016, 0], [.013, .235, .011, .014], [.024, .222, .004, .009]]);
  for (let rung = 0; rung < 6; rung++) {
    const z = .442 + rung * .071;
    add(louver, baffle, 0, .256, z);
    add(box, steel, 0, .278, z + .011, .448, .007, .011);
  }
  add(box, copper, -.251, .251, .664, .013, .019, .326);
  add(box, copper, .251, .251, .664, .013, .019, .326);
  const diagnostics = standard({ map: paintedText(320, 96, pen => {
    pen.fillStyle = '#242d31'; pen.fillRect(0, 0, 320, 96);
    pen.fillStyle = '#ccd2cb'; pen.fillRect(4, 4, 207, 88);
    pen.fillStyle = '#34454b'; pen.font = '900 62px Helvetica, sans-serif'; pen.fillText('TTT', 12, 67);
    pen.font = 'bold 13px monospace'; pen.fillText('COURIER / AFT SERVICE', 12, 84);
    pen.fillStyle = '#c38c43'; pen.fillRect(219, 4, 97, 88);
    pen.fillStyle = '#293333'; pen.font = 'bold 62px monospace'; pen.fillText('07', 230, 69);
  }), roughness: .58, metalness: .20 });
  add(new THREE.PlaneGeometry(.464, .139), diagnostics, 0, .239, .321).rotation.x = -Math.PI / 2;

  for (const [material, components] of parts) {
    const batch = new THREE.Mesh(combine(components), material);
    batch.receiveShadow = material.isMeshStandardMaterial;
    group.add(batch);
  }
  const updateExhaust = exhaust(group, engineX, engineY, 1.264);
  function update(phase, boost, brake, time) {
    hot.emissive.setHex(modes[phase]);
    hot.emissiveIntensity = boost ? 2.75 : brake ? 1.04 : 1.62;
    updateExhaust(phase, boost, brake, time);
  }
  update(0, false, false, 0);
  return { group, update };
}
