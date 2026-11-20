import * as THREE from './vendor/three.module.js';

const size = 512;
const profiles = {
  asphalt: { seed: 17077, base: [73, 76, 83], coarse: 30, micro: 32, rough: 191, joint: 0 },
  concrete: { seed: 61813, base: [109, 114, 125], coarse: 25, micro: 27, rough: 210, joint: 35 },
  pavers: { seed: 34841, base: [93, 97, 111], coarse: 21, micro: 29, rough: 219, joint: 39 },
};

function fraction(x, y, seed) {
  let value = Math.imul(x + seed, 374761393) + Math.imul(y + seed, 668265263);
  value = Math.imul(value ^ value >>> 13, 1274126177);
  return ((value ^ value >>> 16) >>> 0) / 4294967295;
}

function field(x, y, step, seed) {
  const ix = Math.floor(x / step);
  const iy = Math.floor(y / step);
  const count = size / step;
  const tx = x / step - ix;
  const ty = y / step - iy;
  const nextX = (ix + 1) % count;
  const nextY = (iy + 1) % count;
  const u = tx * tx * (3 - 2 * tx);
  const v = ty * ty * (3 - 2 * ty);
  const north = fraction(ix, iy, seed) * (1 - u) + fraction(nextX, iy, seed) * u;
  const south = fraction(ix, nextY, seed) * (1 - u) + fraction(nextX, nextY, seed) * u;
  return north * (1 - v) + south * v;
}

function canvasLayer(colorSpace = THREE.NoColorSpace) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = colorSpace;
  texture.anisotropy = 8;
  return { context, texture, pixels: context.createImageData(size, size) };
}

function materialLayers(kind) {
  const profile = profiles[kind];
  const { seed, base, coarse, micro, rough, joint } = profile;
  const map = canvasLayer(THREE.SRGBColorSpace);
  const bumpMap = canvasLayer();
  const roughnessMap = canvasLayer();
  const color = map.pixels.data;
  const height = bumpMap.pixels.data;
  const scatter = roughnessMap.pixels.data;
  const width = kind === 'pavers' ? 64 : 128;
  const depth = kind === 'pavers' ? 32 : 128;
  for (let y = 0; y < size; y++) {
    const row = Math.floor(y / depth);
    const rowOffset = row % 2 ? width / 2 : 0;
    const rowY = y % depth;
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      const course = (x + rowOffset) % size;
      const column = Math.floor(course / width);
      const columnX = course % width;
      const panel = fraction(column, row, seed + 7) - .5;
      const aggregate = field(x, y, 2, seed + 31) - .5;
      const broad = field(x, y, 64, seed + 20) - .5;
      const speckle = fraction(x, y, seed) - .5;
      const mineral = field(x, y, 8, seed + 43) - .5;
      const stain = Math.max(0, field(x, y, 32, seed + 53) - .55);
      const edgeX = Math.min(columnX, width - columnX);
      const edgeY = Math.min(rowY, depth - rowY);
      const brokenEdge = Math.max(0, mineral * 2.4 + speckle * 1.6);
      const distance = Math.min(edgeX, edgeY) - brokenEdge;
      const seam = joint ? Math.max(0, 1 - distance / (kind === 'pavers' ? 3.75 : 2.8)) : 0;
      const bevel = joint && distance > 1 && distance < 5 ? (5 - distance) / 4 : 0;
      const shade = broad * coarse + mineral * 18 + aggregate * micro + speckle * 16
        + (joint ? panel * 22 : 0) - stain * 39 - seam * joint + bevel * 10;
      const pebbles = Math.max(0, aggregate * .7 + speckle - .36) * 66;
      const albedo = shade + pebbles;
      const variation = mineral * 9 + broad * 9;
      const z = 155 + aggregate * 37 + speckle * 15 + mineral * 10 + pebbles * .7 - seam * 78 - bevel * 5;
      const gloss = rough + broad * 26 + speckle * 18 + pebbles * .4 - stain * 129 + seam * 24;
      color[offset] = base[0] + albedo + variation;
      color[offset + 1] = base[1] + albedo + variation * .29;
      color[offset + 2] = base[2] + albedo - variation * .68;
      height[offset] = height[offset + 1] = height[offset + 2] = z;
      scatter[offset] = scatter[offset + 1] = scatter[offset + 2] = gloss;
      color[offset + 3] = height[offset + 3] = scatter[offset + 3] = 255;
    }
  }
  for (const layer of [map, bumpMap, roughnessMap]) layer.context.putImageData(layer.pixels, 0, 0);
  return { map, bumpMap, roughnessMap };
}

function seeded(seed) {
  let i = 0;
  return () => fraction(i++, seed, seed + 17);
}

function paint(layer, points, { fill, line, width = 1, opacity = 1 }) {
  const { context } = layer;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const padding = width / 2 + 1;
  const across = [0];
  const down = [0];
  if (Math.min(...xs) < padding) across.push(size);
  if (Math.max(...xs) > size - padding) across.push(-size);
  if (Math.min(...ys) < padding) down.push(size);
  if (Math.max(...ys) > size - padding) down.push(-size);
  context.save();
  context.globalAlpha = opacity;
  context.lineCap = context.lineJoin = 'round';
  if (fill) context.fillStyle = fill;
  if (line) {
    context.strokeStyle = line;
    context.lineWidth = width;
  }
  for (const dx of across) {
    for (const dy of down) {
      context.beginPath();
      context.moveTo(points[0][0] + dx, points[0][1] + dy);
      for (const [x, y] of points.slice(1)) context.lineTo(x + dx, y + dy);
      if (fill) {
        context.closePath();
        context.fill();
      }
      if (line) context.stroke();
    }
  }
  context.restore();
}

function island(random, x, y, rx, ry, sides = 13) {
  const yaw = random() * Math.PI;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return Array.from({ length: sides }, (_, point) => {
    const angle = point * Math.PI * 2 / sides;
    const jagged = .7 + random() * .38;
    const a = Math.cos(angle) * rx * jagged;
    const b = Math.sin(angle) * ry * jagged;
    return [x + a * cos - b * sin, y + a * sin + b * cos];
  });
}

function crack(random, x, y, length, bearing, steps = 7) {
  const points = [[x, y]];
  for (let step = 0; step < steps; step++) {
    const angle = bearing + (random() - .5) * 1.25;
    const distance = length / steps * (.7 + random() * .65);
    x += Math.cos(angle) * distance;
    y += Math.sin(angle) * distance;
    points.push([x, y]);
  }
  return points;
}

function asphaltMarks(layers, random) {
  const { map, bumpMap, roughnessMap } = layers;
  // A rolling cold joint from two adjacent asphalt passes. Ends meet at the tile boundary.
  const seam = Array.from({ length: 17 }, (_, i) => [159 + Math.sin(i / 16 * Math.PI * 4) * 3.8 + (i % 4 === 0 ? 0 : random() * 2), i * size / 16]);
  paint(map, seam, { line: '#575258', width: 12, opacity: .23 });
  paint(map, seam, { line: '#282b37', width: 3.4, opacity: .87 });
  paint(bumpMap, seam, { line: '#494949', width: 3, opacity: .65 });
  paint(roughnessMap, seam, { line: '#888888', width: 7.4, opacity: .52 });

  for (let i = 0; i < 13; i++) {
    const x = random() * size;
    const y = random() * size;
    const major = i % 5 === 0;
    const area = island(random, x, y, (major ? 35 : 10) + random() * (major ? 35 : 21), 8 + random() * (major ? 22 : 12));
    paint(map, area, { fill: i % 3 === 1 ? '#5d626d' : '#262a34', line: '#2c2b33', width: 1.9, opacity: .62 });
    paint(bumpMap, area, { fill: '#878787', line: '#575757', width: 2, opacity: .65 });
    paint(roughnessMap, area, { fill: i % 3 === 1 ? '#d4d4d4' : '#8b8b8b', opacity: .71 });
    if (major) {
      const fault = crack(random, x, y, 33 + random() * 75, random() * Math.PI * 2, 8);
      paint(map, fault, { line: '#242633', width: 2.2, opacity: .74 });
      paint(bumpMap, fault, { line: '#575757', width: 2.5, opacity: .68 });
    }
  }
}

function slabMarks(layers, random, kind) {
  const { map, bumpMap, roughnessMap } = layers;
  const paving = kind === 'pavers';
  for (let i = 0; i < (paving ? 19 : 24); i++) {
    const x = random() * size;
    const y = random() * size;
    const dirty = island(random, x, y, 7 + random() * 23, 4 + random() * 15, 16);
    paint(map, dirty, { fill: i % 3 === 0 ? '#45444c' : '#514345', opacity: .16 + random() * .19 });
    paint(roughnessMap, dirty, { fill: '#848484', opacity: .47 });
    if (paving || i % 3 !== 0) continue;
    const bearing = random() * Math.PI * 2;
    const fault = crack(random, x, y, 30 + random() * 57, bearing);
    for (const line of [fault, crack(random, ...fault[3], 14 + random() * 20, bearing + .78, 4)]) {
      paint(map, line, { line: '#343944', width: 1.9, opacity: .66 });
      paint(bumpMap, line, { line: '#474747', width: 1.8, opacity: .67 });
    }
  }
}

function scatterChips(layers, random, kind) {
  const { map, bumpMap } = layers;
  for (let i = 0; i < 110; i++) {
    const x = random() * size;
    const y = random() * size;
    const w = 1.4 + random() * 2.1;
    const chip = island(random, x, y, w, w * (.42 + random() * .41), 5);
    paint(map, chip, { fill: kind === 'asphalt' ? '#9b9390' : '#b6afae', opacity: .3 + random() * .3 });
    paint(bumpMap, chip, { fill: '#c8c8c8', opacity: .43 });
  }
}

export function createStreetSurfaces() {
  const surfaces = {};
  for (const [kind, { seed }] of Object.entries(profiles)) {
    const layers = materialLayers(kind);
    const random = seeded(seed);
    if (kind === 'asphalt') asphaltMarks(layers, random);
    else slabMarks(layers, random, kind);
    scatterChips(layers, random, kind);
    surfaces[kind] = Object.fromEntries(Object.entries(layers).map(([name, layer]) => {
      layer.texture.needsUpdate = true;
      return [name, layer.texture];
    }));
  }
  return surfaces;
}
