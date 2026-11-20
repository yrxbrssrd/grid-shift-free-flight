import * as THREE from './vendor/three.module.js';

// Refine the broad street environment reflection with the actual nearby illuminated signs.
// Their ray / plane intersection retains the lettering as the vehicle passes the shop.
export function addVehicleSignReflections(traffic) {
  const capacity = 8;
  const centers = Array.from({length:capacity}, () => new THREE.Vector3());
  const planes = Array.from({length:capacity}, () => new THREE.Vector4());
  const tiles = Array.from({length:capacity}, () => new THREE.Vector4());
  const uniforms = {
    vehicleSigns: {value:null}, signCount: {value:0},
    signCenters: {value:centers}, signPlanes: {value:planes}, signTiles: {value:tiles},
  };
  const finishes = new Set();
  traffic.traverse(part => {
    if (part.material?.isMeshPhysicalMaterial && part.material.clearcoat > .55) finishes.add(part.material);
  });
  for (const finish of finishes) {
    const prepare = finish.onBeforeCompile.bind(finish);
    const key = finish.customProgramCacheKey();
    finish.customProgramCacheKey = () => key + '/local-signs';
    finish.onBeforeCompile = (shader, renderer) => {
      prepare(shader,renderer);
      Object.assign(shader.uniforms, uniforms, { signReflectance: {value:finish.transparent ? 1.35 : .43} });
      shader.vertexShader = 'varying vec3 vehicleSurface;\n'+shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
        vec4 roadVehiclePoint = vec4(transformed,1.);
        #ifdef USE_INSTANCING
          roadVehiclePoint = instanceMatrix * roadVehiclePoint;
        #endif
        vehicleSurface = (modelMatrix * roadVehiclePoint).xyz;`);
      shader.fragmentShader = `varying vec3 vehicleSurface;
        uniform sampler2D vehicleSigns;
        uniform int signCount;
        uniform vec3 signCenters[${capacity}];
        uniform vec4 signPlanes[${capacity}], signTiles[${capacity}];
        uniform float signReflectance;
        ` + shader.fragmentShader.replace('#include <opaque_fragment>', `
          vec3 signRay = inverseTransformDirection(reflect(-normalize(vViewPosition),normal),viewMatrix);
          vec3 shopReflection=vec3(0.);
          float closestShop=23.;
          for (int i=0;i<${capacity};i++) {
            if (i>=signCount) break;
            vec4 plane=signPlanes[i];
            float alignment=dot(signRay.xz,plane.xy);
            if (alignment>-.025) continue;
            float travel=dot(signCenters[i].xz-vehicleSurface.xz,plane.xy)/alignment;
            if (travel<=.06 || travel>=closestShop) continue;
            vec3 hit=vehicleSurface+signRay*travel-signCenters[i];
            vec2 board=.5+vec2(dot(hit.xz,vec2(plane.y,-plane.x)),hit.y)/plane.zw;
            if(any(lessThan(board,vec2(0.))) || any(greaterThan(board,vec2(1.)))) continue;
            vec4 tile=signTiles[i];
            vec4 neon=texture2D(vehicleSigns,tile.xy+board*tile.zw,1.);
            if(neon.a<.15) continue;
            closestShop=travel;
            shopReflection=neon.rgb*neon.a*(1.-smoothstep(10.,23.,travel));
          }
          float glazingAngle=1.-clamp(abs(dot(normal,normalize(vViewPosition))),0.,1.);
          outgoingLight += signReflectance*(.50+.50*glazingAngle)*shopReflection;
          #include <opaque_fragment>`);
    };
  }

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  let sources = [];
  function setBoards(boards) {
    const regions = boards.geometry.getAttribute('signRect');
    uniforms.vehicleSigns.value = boards.material.map;
    sources = [];
    for(let i=0;i<boards.count;i++) {
      boards.getMatrixAt(i,matrix);
      matrix.decompose(position,rotation,scale);
      const direction = new THREE.Vector3(0,0,1).applyQuaternion(rotation);
      sources.push({
        center:position.clone(),
        plane:new THREE.Vector4(direction.x,direction.z,scale.x,scale.y),
        tile:new THREE.Vector4(regions.getX(i),regions.getY(i),regions.getZ(i),regions.getW(i)),
      });
    }
  }
  let nextCheck = -1;
  function update(player,time) {
    if (time<nextCheck) return;
    nextCheck=time+.18;
    const nearest=[];
    for(const s of sources) {
      const dx=player.x-s.center.x, dy=player.y-s.center.y, dz=player.z-s.center.z;
      const range=dx*dx+dy*dy+dz*dz;
      if (range>38*38 || dx*s.plane.x+dz*s.plane.y < -2.5) continue;
      s.distance=range/(1+Math.min(s.plane.z*s.plane.w,20)*.035);
      nearest.push(s);
    }
    nearest.sort((a,b)=>a.distance-b.distance);
    uniforms.signCount.value=Math.min(capacity,nearest.length);
    for(let i=0;i<uniforms.signCount.value;i++) {
      centers[i].copy(nearest[i].center); planes[i].copy(nearest[i].plane); tiles[i].copy(nearest[i].tile);
    }
  }
  return {setBoards,update};
}
