import * as THREE from './vendor/three.module.js';

function wheelCenters(parts) {
  const tires = parts.filter(part => part.kind === 1);
  const matched = tires.length ? tires : parts.filter(({ matrix }) => {
    const m = matrix.elements;
    return Math.hypot(m[0], m[1], m[2]) > .21 && Math.hypot(m[4], m[5], m[6]) > .13;
  });
  return matched.map(({ actor, matrix }) => {
    const m = matrix.elements;
    return {
      actor,
      center: new THREE.Vector3().setFromMatrixPosition(matrix),
      radius: Math.hypot(m[0], m[1], m[2]),
      world: new THREE.Matrix4(),
    };
  });
}

export function addRoadSpray(parent, parts) {
  const hubs = wheelCenters(parts);
  const wheels = new Map();
  for (const part of parts) {
    const m = part.matrix.elements;
    const hub = hubs.find(({ actor, center }) =>
      actor === part.actor && Math.sign(center.x) === Math.sign(m[12]) && Math.abs(center.z - m[14]) < .26);
    if (hub) wheels.set(part, hub.world);
  }

  const geometry = new THREE.InstancedBufferGeometry();
  const droplets = 25;
  const seeds = Float32Array.from({ length: droplets }, (_, i) => (i + .5) / droplets);
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(droplets * 3), 3));
  geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
  const source = new THREE.InstancedBufferAttribute(new Float32Array(hubs.length * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const axle = new THREE.InstancedBufferAttribute(new Float32Array(hubs.length * 3), 3);
  hubs.forEach(({ actor, center }, index) => axle.setXYZ(index, Math.sign(center.x), actor.speed, .5 + .5 * Math.sign(center.z)));
  geometry.setAttribute('source', source);
  geometry.setAttribute('axle', axle);
  geometry.instanceCount = hubs.length;

  const elapsed = { value: 0 };
  const material = new THREE.ShaderMaterial({
    uniforms: { elapsed },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    vertexShader: `
      uniform float elapsed;
      attribute float seed;
      attribute vec4 source;
      attribute vec3 axle;
      varying float density;
      varying float streak;
      varying vec3 tint;
      float hash(float n) { return fract(sin(n * 127.1 + 13.17) * 43758.5453); }
      void main() {
        vec2 forward = vec2(sin(source.w), cos(source.w));
        vec2 side = vec2(forward.y, -forward.x);
        float id = seed + dot(source.xz, vec2(.010, .017));
        float age = fract(elapsed * (2.80 + hash(seed * 19.8) * 1.29) + seed * 17.3 + axle.x * .24);
        float spread = hash(seed * 31.6);
        float drift = .08 + age * (.18 + spread * .76);
        float trail = age * (.56 + axle.y * .16) * (.73 + hash(seed * 41.7) * .52);
        vec2 sprayXZ = source.xz + side * axle.x * drift - forward * trail;
        float height = .018 + sin(age * 3.14159) * (.047 + hash(seed * 52.3) * .187);
        vec4 viewPoint = modelViewMatrix * vec4(sprayXZ.x, source.y + height, sprayXZ.y, 1.);
        gl_Position = projectionMatrix * viewPoint;
        float distance = max(1., -viewPoint.z);
        float pool = .45 * sin(sprayXZ.x * .53 + sprayXZ.y * .18)
          + .40 * cos(sprayXZ.y * .62 + 1.7 * sin(sprayXZ.x * .4)) + .2 * sin(sprayXZ.x * 1.57 - sprayXZ.y * .86);
        float wet = .46 + .54 * smoothstep(-.63, .58, pool);
        float glint = hash(floor(elapsed * 26. + seed * 83.) + id) * .48 + .52;
        density = smoothstep(0., .10, age) * pow(1. - age, 1.35) * wet
          * (1. - smoothstep(19., 61., distance)) * glint * .51;
        tint = mix(vec3(.57, .35, .45), vec3(.55, .76, .93), axle.z) * .54
          + vec3(.18, .23, .25);
        streak = .52 + spread * .43;
        gl_PointSize = clamp((24. + spread * 19.) / distance, 1., 3.2);
      }`,
    fragmentShader: `
      varying float density;
      varying float streak;
      varying vec3 tint;
      void main() {
        vec2 point = (gl_PointCoord - .5) * vec2(1. / streak, 1.) * 2.;
        float disk = 1. - smoothstep(.11, 1., length(point));
        gl_FragColor = vec4(tint, density * disk * disk);
        #include <colorspace_fragment>
      }`,
  });
  const spray = new THREE.Points(geometry, material);
  spray.name = 'Fine water from wet tyres';
  spray.frustumCulled = false;
  spray.renderOrder = 3;
  parent.add(spray);
  const worldPoint = new THREE.Vector3();
  const rotatedCenter = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const pivot = new THREE.Matrix4();

  return {
    wheels,
    update(time, enabled) {
      elapsed.value = time;
      spray.visible = enabled && hubs.length > 0;
      hubs.forEach(({ actor, center, radius, world }, index) => {
        const transform = actor.transform;
        worldPoint.copy(center).applyMatrix4(transform.matrix);
        source.setXYZW(index, worldPoint.x, actor.y + .014, worldPoint.z, transform.rotation.y);
        pivot.makeRotationX((actor.start + time * actor.speed) / radius);
        rotatedCenter.copy(center).applyMatrix4(pivot);
        pivot.setPosition(offset.subVectors(center, rotatedCenter));
        world.multiplyMatrices(transform.matrix, pivot);
      });
      source.needsUpdate = true;
    },
  };
}
