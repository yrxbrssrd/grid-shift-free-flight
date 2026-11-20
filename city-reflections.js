import * as THREE from './vendor/three.module.js';

const reflectionLayer = 1;

// Layer 1 is the physical city. Waypoints, labels and flight aids stay in the main view.
export function reflectCity(object) {
  object.traverse(child => {
    if (child.isInstancedMesh && child.count > 2400) return;
    child.layers.enable(reflectionLayer);
  });
}

function createStreetProbe(renderer, scene) {
  const halfFloat = renderer.capabilities.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float');
  const cube = new THREE.WebGLCubeRenderTarget(64, { generateMipmaps: false,
    type: halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType });
  const probe = new THREE.CubeCamera(.29, 220, cube);
  probe.layers.set(reflectionLayer);
  probe.coordinateSystem = renderer.coordinateSystem;
  probe.updateCoordinateSystem();
  const generator = new THREE.PMREMGenerator(renderer);
  const position = new THREE.Vector3();
  const excluded = [];
  let environment = null;
  let lastFrame;
  let face = -1;

  function captureFace(body) {
    // Keep the vehicle's lamps in the capture, but exclude its own visible surfaces.
    body?.traverse(child => {
      if (!child.isMesh || !child.layers.isEnabled(reflectionLayer)) return;
      child.layers.disable(reflectionLayer);
      excluded.push(child);
    });
    const target = renderer.getRenderTarget();
    const activeFace = renderer.getActiveCubeFace();
    const activeMip = renderer.getActiveMipmapLevel();
    const oldEnvironment = scene.environment;
    const shadowMap = renderer.shadowMap;
    const automaticShadows = shadowMap.autoUpdate;
    const shadowRequested = shadowMap.needsUpdate;
    const xr = renderer.xr.enabled;
    try {
      scene.environment = null;
      shadowMap.autoUpdate = false;
      shadowMap.needsUpdate = false;
      renderer.xr.enabled = false;
      renderer.setRenderTarget(cube, face);
      renderer.render(scene, probe.children[face]);
    } finally {
      renderer.setRenderTarget(target, activeFace, activeMip);
      renderer.xr.enabled = xr;
      shadowMap.autoUpdate = automaticShadows;
      shadowMap.needsUpdate = shadowRequested;
      scene.environment = oldEnvironment;
      for (const child of excluded) child.layers.enable(reflectionLayer);
      excluded.length = 0;
    }
  }

  return function updateProbe(camera, time, body) {
    if (time === lastFrame) return false;
    lastFrame = time;

    // Keep sampling the previous complete environment until all six faces are ready.
    if (face === 6) {
      environment = generator.fromCubemap(cube.texture, environment);
      scene.environment = environment.texture;
      face = -1;
      return true;
    }

    if (face < 0) {
      if (body) body.getWorldPosition(position);
      else position.copy(camera.position);
      if (environment && Math.hypot(position.x - probe.position.x, position.z - probe.position.z) < 21 &&
          Math.abs(position.y - probe.position.y) < 8) return false;
      probe.position.copy(position);
      probe.updateMatrixWorld(true);
      face = 0;
    }
    captureFace(body);
    face++;
    return false;
  };
}

export function createCityReflections(renderer, scene) {
  const target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true, stencilBuffer: false });
  const mirror = new THREE.PerspectiveCamera();
  mirror.layers.set(reflectionLayer);
  const aim = new THREE.Vector3();
  const clip = new THREE.Plane();
  const normal = new THREE.Vector3(0, 1, 0);
  const coeff = new THREE.Vector4();
  const corner = new THREE.Vector4();
  const transform = new THREE.Matrix4();
  const uniforms = { cityMirror: { value: target.texture }, cityProjection: { value: transform } };
  const surfaceHeight = .25;
  const updateProbe = createStreetProbe(renderer, scene);
  let lastTime = -Infinity;

  function update(camera, time, width, height, body) {
    const filteredProbe = updateProbe(camera, time, body);
    const w = Math.max(96, Math.min(720, Math.ceil(width * (width < 650 ? .42 : .52))));
    const h = Math.max(96, Math.round(w * height / width));
    const resized = w !== target.width || h !== target.height;
    if (!resized && (filteredProbe || time - lastTime < 1 / (width < 650 ? 12 : 18))) return;
    if (resized) target.setSize(w, h);
    lastTime = time;
    mirror.position.copy(camera.position);
    mirror.position.y = 2 * surfaceHeight - mirror.position.y;
    camera.getWorldDirection(aim);
    aim.y *= -1;
    aim.add(mirror.position);
    mirror.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    mirror.up.y *= -1;
    mirror.lookAt(aim);
    mirror.updateMatrixWorld();
    mirror.projectionMatrix.copy(camera.projectionMatrix);
    transform.multiplyMatrices(mirror.projectionMatrix, mirror.matrixWorldInverse);

    // Move the reflected camera's near plane onto the road to hide everything underneath it.
    clip.set(normal, -surfaceHeight).applyMatrix4(mirror.matrixWorldInverse);
    coeff.set(clip.normal.x, clip.normal.y, clip.normal.z, clip.constant);
    const e = mirror.projectionMatrix.elements;
    corner.set((Math.sign(coeff.x) + e[8]) / e[0], (Math.sign(coeff.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    coeff.multiplyScalar(2 / coeff.dot(corner));
    e[2] = coeff.x;
    e[6] = coeff.y;
    e[10] = coeff.z + 1;
    e[14] = coeff.w;
    const previous = renderer.getRenderTarget();
    const activeFace = renderer.getActiveCubeFace();
    const activeMip = renderer.getActiveMipmapLevel();
    renderer.setRenderTarget(target);
    try {
      renderer.render(scene, mirror);
    } finally {
      renderer.setRenderTarget(previous, activeFace, activeMip);
    }
  }
  return { uniforms, update };
}
