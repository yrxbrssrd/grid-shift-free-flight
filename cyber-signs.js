import * as THREE from './vendor/three.module.js';

const signDesigns = {
  lumen: { title: 'LUMEN', caption: 'NIGHT MARKET', color: '#62fbdc', aspect: 3.45, shape: 'ticket', mark: 'bars' },
  halo: { title: 'HALO', caption: 'NIGHT CLUB', color: '#ff58bb', accent: '#ff916a', aspect: 1, shape: 'circle', mark: 'orbit' },
  kite: { title: 'KITE', caption: 'REPAIR', color: '#ffc46b', aspect: .44, shape: 'blade', mark: 'bolt' },
  splice: { title: 'SPLICE', caption: 'SIGNAL WORKS', color: '#ac91ff', aspect: 2.75, shape: 'slant', mark: 'wave' },
  ember: { title: 'EMBER', caption: 'HOT NOODLES', color: '#ff734f', accent: '#ffd084', aspect: 1.9, shape: 'capsule', mark: 'steam' },
  iris: { title: 'IRIS', caption: 'OPTICS', color: '#8de6ff', accent: '#b3a2ff', aspect: 1.15, shape: 'diamond', mark: 'lens' },
  echo: { title: 'ECHO', caption: 'FM 90.6', color: '#78d9ff', aspect: .53, shape: 'blade', mark: 'wave' },
  volts: { title: 'VOLT', caption: 'ARCADE', color: '#bfef76', accent: '#72daba', aspect: 2.55, shape: 'ticket', mark: 'bolt' },
  shift: { title: 'SHIFT', caption: 'TRANSIT', color: '#91a8ff', aspect: 3.1, shape: 'slant', mark: 'arrow' },
  mono: { title: 'MONO', caption: 'SYNTH CAFE', color: '#ffc37f', aspect: 2.18, shape: 'capsule', mark: 'bars' },
  prism: { title: 'PRISM', caption: 'DATA EXCHANGE', color: '#ee88ff', accent: '#8fb8ff', aspect: 3.08, shape: 'ticket', mark: 'prism' },
  dalia: { title: 'DALIA', caption: 'TEA HOUSE', color: '#ff8e9d', aspect: 1, shape: 'circle', mark: 'flower' },
  static: { title: 'STATIC', caption: 'VINYLS', color: '#a2fff5', aspect: .51, shape: 'blade', mark: 'orbit' },
  nexus: { title: 'NEXUS', caption: 'ACCESS LAB', color: '#9f9afa', aspect: 2.8, shape: 'slant', mark: 'prism' },
  buoy: { title: 'BUOY', caption: 'FREIGHT', color: '#ffd273', aspect: 1, shape: 'diamond', mark: 'arrow' },
  soda: { title: 'FIZZ', caption: 'SODA BAR', color: '#ff6e88', accent: '#fff187', aspect: 2.25, shape: 'capsule', mark: 'flower' },
};

const storefronts = [
  ['ember', 'kite', 'mono', 'buoy', 'soda', 'dalia', 'volts'],
  ['nexus', 'echo', 'shift', 'static', 'volts', 'iris', 'mono'],
  ['splice', 'halo', 'nexus', 'prism', 'dalia', 'iris', 'soda'],
];

// Framed around the main flight route, with a few stronger silhouettes at its entrances.
const landmarks = new Map([
  ['79.5,1.2', { art: 'buoy', face: 'east', height: 3.1, level: .62 }],
  ['98.8,13.2', { art: 'soda', face: 'west', height: 2.8, level: .57 }],
  ['126.4,54.2', { art: 'prism', face: 'west', height: 3.45, level: .62 }],
  ['111.1,103.6', { art: 'splice', face: 'south', height: 2.95, level: .65 }],
  ['13.7,97.1', { art: 'kite', face: 'south', height: 4.2, level: .62 }],
  ['-22.8,77.9', { art: 'ember', face: 'east', height: 3.3, level: .60 }],
  ['-15,17', { art: 'ember', face: 'south', height: 2.85, level: .62 }],
  ['18,17', { art: 'halo', face: 'west', height: 5.15, level: .57 }],
  ['-14,-9', { art: 'lumen', face: 'south', height: 2.14, level: .74 }],
  ['12,-8', { art: 'volts', face: 'west', height: 2.1, level: .63 }],
  ['-43,-12', { art: 'kite', face: 'east', height: 6.85, level: .54 }],
  ['45,-28', { art: 'prism', face: 'south', height: 2.1, level: .72 }],
]);

const faces = {
  south: { yaw: 0, nx: 0, nz: 1, tx: 1, tz: 0 },
  west: { yaw: -Math.PI / 2, nx: -1, nz: 0, tx: 0, tz: 1 },
  east: { yaw: Math.PI / 2, nx: 1, nz: 0, tx: 0, tz: -1 },
};

let atlas;

function outline(ctx, shape, width, height) {
  const x = -width / 2;
  const y = -height / 2;
  ctx.beginPath();
  if (shape === 'circle') {
    ctx.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2);
  } else if (shape === 'capsule') {
    ctx.roundRect(x, y, width, height, height / 2);
  } else if (shape === 'blade') {
    ctx.roundRect(x, y, width, height, width * .2);
  } else {
    const points = shape === 'slant'
      ? [[.13, 0], [1, 0], [.88, 1], [0, 1]]
      : shape === 'diamond'
        ? [[.5, 0], [1, .5], [.5, 1], [0, .5]]
        : [[.045, 0], [.91, 0], [1, .22], [1, .83], [.956, 1], [.045, 1], [0, .83], [0, .19]];
    points.forEach(([px, py], index) => {
      if (index === 0) ctx.moveTo(x + px * width, y + py * height);
      else ctx.lineTo(x + px * width, y + py * height);
    });
    ctx.closePath();
  }
}

function neonStroke(ctx, color, width) {
  ctx.save();
  ctx.globalAlpha = .23;
  ctx.shadowBlur = 20;
  ctx.shadowColor = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = width * 3;
  ctx.stroke();
  ctx.restore();
  ctx.shadowBlur = 12;
  ctx.shadowColor = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = width + 2;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = .56;
  ctx.strokeStyle = '#f8fcff';
  ctx.lineWidth = Math.max(.8, width * .33);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawMark(ctx, mark, color, x, y, radius) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(radius, radius);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  switch (mark) {
    case 'bars':
      ctx.moveTo(-.65, .46); ctx.lineTo(-.65, -.05);
      ctx.moveTo(-.34, .46); ctx.lineTo(-.34, -.42);
      ctx.moveTo(-.03, .46); ctx.lineTo(-.03, -.68);
      ctx.moveTo(.28, .46); ctx.lineTo(.28, -.37);
      ctx.moveTo(.59, .46); ctx.lineTo(.59, -.07);
      break;
    case 'orbit':
      ctx.ellipse(0, 0, .67, .34, -.53, 0, Math.PI * 2);
      ctx.moveTo(.43, 0);
      ctx.arc(0, 0, .43, 0, Math.PI * 2);
      break;
    case 'bolt':
      ctx.moveTo(.22, -.7); ctx.lineTo(-.52, .13); ctx.lineTo(.03, .13);
      ctx.lineTo(-.18, .71); ctx.lineTo(.57, -.15); ctx.lineTo(.02, -.15); ctx.closePath();
      break;
    case 'wave':
      ctx.moveTo(-.71, .21); ctx.quadraticCurveTo(-.5, -.34, -.29, .02);
      ctx.quadraticCurveTo(-.08, .38, .12, -.02); ctx.quadraticCurveTo(.32, -.5, .69, -.21);
      ctx.moveTo(-.71, .52); ctx.quadraticCurveTo(-.5, -.03, -.29, .33);
      ctx.quadraticCurveTo(-.08, .69, .12, .29); ctx.quadraticCurveTo(.32, -.19, .69, .1);
      break;
    case 'steam':
      ctx.moveTo(-.65, .12); ctx.quadraticCurveTo(-.54, .69, 0, .69);
      ctx.quadraticCurveTo(.54, .69, .65, .12); ctx.closePath();
      ctx.moveTo(-.28, -.1); ctx.quadraticCurveTo(-.08, -.24, -.3, -.43);
      ctx.moveTo(0, -.1); ctx.quadraticCurveTo(.2, -.32, 0, -.59);
      ctx.moveTo(.28, -.1); ctx.quadraticCurveTo(.48, -.24, .26, -.43);
      break;
    case 'lens':
      ctx.moveTo(-.78, 0); ctx.quadraticCurveTo(0, -.88, .78, 0);
      ctx.quadraticCurveTo(0, .88, -.78, 0);
      ctx.moveTo(.25, 0); ctx.arc(0, 0, .25, 0, Math.PI * 2);
      break;
    case 'flower':
      for (let petal = 0; petal < 5; petal++) {
        const angle = petal * Math.PI * .4;
        const cx = Math.cos(angle) * .38;
        const cy = Math.sin(angle) * .38;
        ctx.moveTo(cx + Math.cos(angle) * .27, cy + Math.sin(angle) * .27);
        ctx.ellipse(cx, cy, .27, .12, angle, 0, Math.PI * 2);
      }
      break;
    case 'prism':
      ctx.moveTo(0, -.71); ctx.lineTo(.65, .48); ctx.lineTo(-.65, .48); ctx.closePath();
      ctx.moveTo(0, -.71); ctx.lineTo(0, .48);
      ctx.moveTo(-.83, .68); ctx.lineTo(.83, .68);
      break;
    default:
      ctx.moveTo(-.65, .29); ctx.lineTo(.05, .29); ctx.lineTo(.05, .57);
      ctx.lineTo(.6, 0); ctx.lineTo(.05, -.57); ctx.lineTo(.05, -.29); ctx.lineTo(-.65, -.29); ctx.closePath();
  }
  ctx.shadowBlur = 9;
  ctx.shadowColor = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = .09;
  ctx.stroke();
  ctx.restore();
}

function drawText(ctx, title, x, y, width, height, color, font, weight, glow) {
  ctx.font = `${weight} ${Math.max(8, Math.floor(height))}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const scale = Math.min(1, width / ctx.measureText(title).width);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, 1);
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  ctx.fillText(title, 0, 0);
  ctx.restore();
}

function paintSign(ctx, sign, width, height) {
  const { title, caption, color, shape, mark } = sign;
  const accent = sign.accent || color;
  const face = ctx.createLinearGradient(0, -height / 2, 0, height / 2);
  face.addColorStop(0, '#151524');
  face.addColorStop(.53, '#11111e');
  face.addColorStop(1, '#0b1020');
  outline(ctx, shape, width, height);
  ctx.fillStyle = face;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = `${color}13`;
  for (let line = -height / 2; line < height / 2; line += 4) {
    ctx.fillRect(-width / 2, line, width, 1);
  }
  ctx.restore();
  neonStroke(ctx, color, 3.3);

  if (shape === 'blade') {
    const start = -.15 * height;
    const spacing = Math.min(.45 * height / Math.max(title.length - 1, 1), width * .49);
    drawMark(ctx, mark, accent, 0, -.33 * height, width * .35);
    [...title].forEach((letter, index) => {
      drawText(ctx, letter, 0, start + index * spacing, width * .67, width * .47,
        '#f7f9ff', 'monospace', 800, 6);
    });
    drawText(ctx, caption, 0, height * .414, width * .77, width * .157, color, 'monospace', 800, 2);
    return;
  }

  if (shape === 'circle' || shape === 'diamond') {
    if (shape === 'circle') {
      outline(ctx, shape, width * .86, height * .86);
      ctx.strokeStyle = `${accent}68`;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    drawMark(ctx, mark, accent, 0, -height * .16, height * .16);
    drawText(ctx, title, 0, height * .113, width * .67, height * .2, '#f7f9ff', 'sans-serif', 900, 9);
    drawText(ctx, caption, 0, height * .258, width * .57, height * .065, color, 'monospace', 800, 2);
    return;
  }

  const inset = shape === 'slant' ? .31 : .34;
  drawMark(ctx, mark, accent, -width * inset, 0, height * .32);
  ctx.strokeStyle = `${accent}65`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-width * .19, -.26 * height);
  ctx.lineTo(-width * .19, .26 * height);
  ctx.stroke();
  drawText(ctx, title, width * .128, -height * .096, width * .55, height * .38, '#f7f9ff', 'sans-serif', 900, 9);
  drawText(ctx, caption, width * .128, height * .235, width * .47, height * .108, color, 'monospace', 800, 3);
}

function createAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  const tiles = {};
  Object.entries(signDesigns).forEach(([key, sign], index) => {
    const cx = (index % 4) * 512 + 256;
    const cy = Math.floor(index / 4) * 256 + 128;
    const height = 2 * Math.floor(Math.min(102, 224 / sign.aspect));
    const width = 2 * Math.floor(height * sign.aspect / 2);
    const padding = 22;
    ctx.save();
    ctx.translate(cx, cy);
    paintSign(ctx, sign, width, height);
    ctx.restore();
    tiles[key] = {
      u: (cx - width / 2 - padding) / canvas.width,
      v: 1 - (cy + height / 2 + padding) / canvas.height,
      du: (width + 2 * padding) / canvas.width,
      dv: (height + 2 * padding) / canvas.height,
      scaleX: 1 + 2 * padding / width,
      scaleY: 1 + 2 * padding / height,
    };
  });
  return { canvas, tiles };
}

function wallLevel(building, faceName) {
  const levels = building.levels;
  const wing = levels?.find((part, index) => index > 0 && part.bottom === 0);
  return (faceName === 'east' && wing) || levels?.[0] || building;
}

function signPlacement(building, art, faceName, height, level, offset = 0) {
  const { x, z, w, d, h } = wallLevel(building, faceName);
  const face = faces[faceName];
  const span = face.nx ? d : w;
  const depth = face.nx ? w : d;
  const aspect = signDesigns[art].aspect;
  const signHeight = Math.min(height, (span - 1.22) / aspect, h * .68);
  const width = signHeight * aspect;
  const horizontal = (span / 2 - .52 - width / 2) * offset;
  return {
    art, face, width, height: signHeight,
    x: x + face.nx * (depth / 2 + .245) + face.tx * horizontal,
    y: THREE.MathUtils.clamp(h * level, .5 + signHeight / 2, h - .36 - signHeight / 2),
    z: z + face.nz * (depth / 2 + .245) + face.tz * horizontal,
  };
}

function placementsFor(buildings) {
  const placements = [];
  const lights = [];
  buildings.forEach((building, index) => {
    const { x, z } = building;
    const pool = storefronts[x < -18 ? 0 : x < 13 ? 1 : 2];
    const side = x < 0 ? 'east' : 'west';
    const landmark = landmarks.get(`${x},${z}`);
    const art = pool[(index * 5 + Math.floor(Math.abs(x))) % pool.length];
    const level = .26 + .1 * (index % 4);
    const height = 1.38 + .36 * (index % 5);
    if (landmark) {
      const hero = signPlacement(building, landmark.art, landmark.face, landmark.height, landmark.level);
      placements.push(hero);
      lights.push({ x: hero.x + hero.face.nx * 1.7, y: hero.y, z: hero.z + hero.face.nz * 1.7, color: signDesigns[hero.art].color });
      const secondFace = landmark.face === 'south' ? side : 'south';
      placements.push(signPlacement(building, art, secondFace, height * .72, .29, .55));
      return;
    }
    placements.push(signPlacement(building, art, 'south', height, level, index % 2 ? -.46 : .62));
    if (index % 4 !== 0) {
      const sideIndex = (index + 2) % pool.length;
      const sideArt = pool[sideIndex] === art ? pool[(sideIndex + 1) % pool.length] : pool[sideIndex];
      const tall = signDesigns[sideArt].shape === 'blade';
      placements.push(signPlacement(building, sideArt, side, tall ? 4.25 : height * .76, tall ? .68 : .31, -.64));
    }
  });
  return { placements, lights };
}

function addTubeFixtures(parent, buildings, time) {
  const tubes = [];
  const casings = [];

  function wall({ x, z, w, d }, faceName) {
    const face = faces[faceName];
    const depth = face.nx ? w : d;
    const anchor = (across, y, relief) => ({
      x: x + face.nx * (depth / 2 + relief) + face.tx * across,
      y,
      z: z + face.nz * (depth / 2 + relief) + face.tz * across,
      yaw: face.yaw,
    });
    return {
      span: face.nx ? d : w,
      tube(x1, y1, x2, y2, width, color, chase = 0) {
        const length = Math.hypot(x2 - x1, y2 - y1);
        const turn = Math.atan2(x1 - x2, y2 - y1);
        tubes.push({ ...anchor((x1 + x2) / 2, (y1 + y2) / 2, .213), length, turn, width, color, chase });
      },
      casing(across, y, width, length) {
        casings.push({ ...anchor(across, y, .108), width, length, turn: 0 });
      },
    };
  }

  buildings.forEach((building, index) => {
    const key = `${building.x},${building.z}`;
    const hero = landmarks.get(key);
    const zone = building.x < -12 ? ['#ff925a', '#ffd68d'] : building.x > 12 ? ['#df62fa', '#707aff'] : ['#45f4bf', '#79a2ff'];
    const [main, accent] = hero ? [signDesigns[hero.art].color, signDesigns[hero.art].accent || zone[1]] : zone;
    const facingStreet = building.x < 0 ? 'east' : 'west';
    const south = wallLevel(building, 'south');
    const canopy = wall(south, 'south');
    if (hero || index % 3 === 1) {
      const half = canopy.span * (hero ? .418 : .34);
      const line = 2.63;
      canopy.casing(0, line, 2 * half + .05, .25);
      canopy.tube(-half, line + .07, half, line + .07, .044, accent);
      for (let section = 0; section < 13; section++) {
        const start = -half + section * (2 * half / 13);
        canopy.tube(start + .02, line - .05, start + 2 * half / 13 - .044, line - .05, .052, main, 1 + section * .65 + index * .41);
      }
    }

    // Tall light boxes sit to each side of the shopfront, above street-level doors.
    if (hero || index % 4 === 1) {
      const face = hero?.face || facingStreet;
      const level = wallLevel(building, face);
      const facade = wall(level, face);
      const edge = index % 2 ? -1 : 1;
      for (const side of [edge, -edge]) {
        const column = side * facade.span * .412;
        const tall = side === edge;
        const low = tall ? .56 : 2.92;
        const high = Math.min(level.h - .36, tall ? 9.35 : 6.63);
        if (high - low < .5) continue;
        facade.casing(column, (low + high) / 2, .36, high - low + .12);
        facade.tube(column, low, column, high, .09, tall ? main : accent);
        const flank = column - side * .114;
        facade.tube(flank, low + .17, flank, high - .17, .036, accent);
        for (const y of [low + .11, high - .11]) {
          facade.tube(column - .125, y, column + .125, y, .029, main);
        }
      }
    }

    if ((hero || index % 6 === 3) && building.levels?.length > 1) {
      const upper = building.levels.at(-1);
      const landmarkWall = wall(upper, hero ? hero.face : 'south');
      const height = upper.h - upper.bottom;
      const center = upper.bottom + height * .5;
      const r = Math.min(1.32, height * .4);
      const ring = r * (key === '18,17' ? 1.32 : .91);
      if (key === '18,17') {
        const segments = 24;
        for (let i = 0; i < segments; i++) {
          const a = i * Math.PI * 2 / segments;
          const b = (i + 1) * Math.PI * 2 / segments;
          landmarkWall.tube(Math.cos(a) * ring, center + Math.sin(a) * r,
            Math.cos(b) * ring, center + Math.sin(b) * r, .068, main);
        }
        landmarkWall.tube(-ring * .83, center - r * .47, ring * .83, center + r * .47, .07, accent);
      } else {
        const hexagon = [[0, -r], [ring, -r * .48], [ring, r * .48], [0, r], [-ring, r * .48], [-ring, -r * .48]];
        hexagon.forEach(([x, y], i) => {
          const [nx, ny] = hexagon[(i + 1) % hexagon.length];
          landmarkWall.tube(x, center + y, nx, center + ny, .062, i % 2 ? accent : main);
        });
      }
    }
  });

  const color = new THREE.Color();
  const transform = new THREE.Object3D();
  transform.rotation.order = 'YXZ';
  const resources = [];
  const paint = (name, records, geometry, material, scale) => {
    const mesh = new THREE.InstancedMesh(geometry, material, records.length);
    mesh.name = name;
    records.forEach((record, index) => {
      const { x, y, z, yaw, turn, color: hue } = record;
      transform.position.set(x, y, z);
      transform.rotation.set(0, yaw, turn);
      scale(transform, record);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
      if (hue) mesh.setColorAt(index, color.set(hue));
    });
    parent.add(mesh);
    resources.push(mesh);
    return mesh;
  };

  paint('Aluminium neon housings', casings, new THREE.BoxGeometry(),
    new THREE.MeshStandardMaterial({ color: 0x1a2533, metalness: .75, roughness: .41 }),
    (pose, { width, length }) => pose.scale.set(width, length, .21));
  const stripGeometry = new THREE.BoxGeometry();
  stripGeometry.setAttribute('chasePhase', new THREE.InstancedBufferAttribute(Float32Array.from(tubes, tube => tube.chase), 1));
  const stripMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });
  stripMaterial.onBeforeCompile = shader => {
    shader.uniforms.stripTime = time;
    shader.vertexShader = `attribute float chasePhase; varying float vChasePhase;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvChasePhase = chasePhase;');
    shader.fragmentShader = `varying float vChasePhase; uniform float stripTime;\n${shader.fragmentShader}`
      .replace('#include <color_fragment>', `#include <color_fragment>
        float lightSweep = pow(.5 + .5 * sin(vChasePhase - stripTime * 2.4), 5.);
        float lightLevel = .28 + .72 * lightSweep;
        diffuseColor.rgb *= mix(1., lightLevel, step(.1, vChasePhase));`);
  };
  paint('Physical neon tubes', tubes, stripGeometry, stripMaterial,
    (pose, { width, length }) => pose.scale.set(width, length + width * .24, width * .72));

  const glowMaterial = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, depthWrite: false, opacity: .19, blending: THREE.AdditiveBlending, fog: false });
  glowMaterial.onBeforeCompile = shader => {
    shader.vertexShader = `varying vec2 vTubePosition;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTubePosition = position.xy;');
    shader.fragmentShader = `varying vec2 vTubePosition;\n${shader.fragmentShader}`
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.a *= exp(-16. * abs(vTubePosition.x)) * (1. - smoothstep(.34, .50, abs(vTubePosition.y)));`);
  };
  paint('Neon halos', tubes, new THREE.PlaneGeometry(), glowMaterial,
    (pose, { width, length }) => pose.scale.set(width * 11, length + .16, 1));

  return () => resources.forEach(mesh => {
    parent.remove(mesh);
    mesh.dispose();
    mesh.geometry.dispose();
    mesh.material.dispose();
  });
}

export function addCyberSigns(parent, buildings) {
  const { placements, lights } = placementsFor(buildings);
  atlas ||= createAtlas();
  const texture = new THREE.CanvasTexture(atlas.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const geometry = new THREE.PlaneGeometry();
  const uvRects = new Float32Array(placements.length * 4);
  const phases = new Float32Array(placements.length);
  geometry.setAttribute('signRect', new THREE.InstancedBufferAttribute(uvRects, 4));
  geometry.setAttribute('signPhase', new THREE.InstancedBufferAttribute(phases, 1));

  const time = { value: 0 };
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false });
  material.onBeforeCompile = shader => {
    shader.uniforms.signTime = time;
    shader.vertexShader = `attribute vec4 signRect; attribute float signPhase; varying float displayPhase;\n${shader.vertexShader}`
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = signRect.xy + vMapUv * signRect.zw; displayPhase = signPhase;');
    shader.fragmentShader = `uniform float signTime; varying float displayPhase;\n${shader.fragmentShader}`
      .replace('#include <map_fragment>', `#include <map_fragment>
        float dim = .16 * step(.1, displayPhase) * pow(max(0., sin(signTime * 1.25 + displayPhase)), 18.);
        diffuseColor.rgb *= 1. - dim;`);
  };

  const boards = new THREE.InstancedMesh(geometry, material, placements.length);
  boards.name = 'Neon storefronts';
  const bracketGeometry = new THREE.BoxGeometry();
  const bracketMaterial = new THREE.MeshStandardMaterial({ color: 0x17222e, metalness: .65, roughness: .7 });
  const brackets = new THREE.InstancedMesh(bracketGeometry, bracketMaterial, placements.length * 2);
  brackets.name = 'Sign wall brackets';
  const pose = new THREE.Object3D();
  placements.forEach(({ art, face, x, y, z, width, height }, index) => {
    const tile = atlas.tiles[art];
    uvRects.set([tile.u, tile.v, tile.du, tile.dv], index * 4);
    phases[index] = index % 5 === 2 ? 2.3 + index * .78 : 0;
    pose.position.set(x, y, z);
    pose.rotation.y = face.yaw;
    pose.scale.set(width * tile.scaleX, height * tile.scaleY, 1);
    pose.updateMatrix();
    boards.setMatrixAt(index, pose.matrix);

    const vertical = height > width;
    for (const side of [-1, 1]) {
      const spread = vertical ? 0 : width * .29 * side;
      pose.position.set(x - face.nx * .125 + face.tx * spread,
        y + (vertical ? height * .3 * side : -height * .34),
        z - face.nz * .125 + face.tz * spread);
      pose.scale.set(.145, vertical ? .16 : .35, .223);
      pose.updateMatrix();
      brackets.setMatrixAt(index * 2 + (side + 1) / 2, pose.matrix);
    }
  });
  parent.add(boards, brackets);
  const disposeTubeFixtures = addTubeFixtures(parent, buildings, time);
  return {
    boards,
    lights,
    update(elapsed) { time.value = elapsed; },
    dispose() {
      disposeTubeFixtures();
      parent.remove(boards, brackets);
      boards.dispose();
      brackets.dispose();
      geometry.dispose();
      bracketGeometry.dispose();
      material.dispose();
      bracketMaterial.dispose();
      texture.dispose();
    },
  };
}
