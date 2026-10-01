import * as THREE from 'three';

/**
 * Each charm hangs in its own depth layer. Everything that belongs to a charm writes its layer code into the
 * alpha channel, so a stone's glass can read (from three's transmission buffer) whether what it sees belongs to
 * itself or lies behind it, and give only the latter its pastel ground. The sky writes 0; untagged objects 1.
 */
export const layerCode = (z: number) => 0.3 + z * 0.5;

export type LayerUniform = { value: number };

const SHARED = new WeakSet<THREE.Material>();
export function markShared(...materials: THREE.Material[]) {
  for (const m of materials) SHARED.add(m);
}

function writeLayer(m: THREE.Material, u: LayerUniform) {
  if (m.userData.layer) return;
  m.userData.layer = u;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = function (shader, renderer) {
    prev.call(this, shader, renderer);
    shader.uniforms.uLayer = u;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uLayer;')
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.a = uLayer;');
  };
  const prevKey = m.customProgramCacheKey;
  m.customProgramCacheKey = function () {
    return prevKey.call(this) + '|layer';
  };
  m.needsUpdate = true;
}

/** tags every opaque material under a root with a layer; shared materials are cloned for this charm */
export function tagLayer(root: THREE.Object3D, u: LayerUniform) {
  const clones = new Map<THREE.Material, THREE.Material>();
  const own = (m: THREE.Material) => {
    if (m.transparent || (m as THREE.MeshPhysicalMaterial).transmission > 0) return m;
    if (SHARED.has(m)) {
      let c = clones.get(m);
      if (!c) {
        c = m.clone();
        clones.set(m, c);
      }
      m = c;
    }
    writeLayer(m, u);
    return m;
  };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material);
  });
}
