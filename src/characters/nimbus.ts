import * as THREE from 'three';
import type { Character } from './types';
import { addFuzz, felt, type SoftOptions } from './materials';
import { blob, faceAlong, puffUnion, smile, surfaceAt } from './parts';
import { clamp, damp, rng } from '../util/math';

/** a white puffy cloud of merged spheres in soft plush; sleepy closed eyes; now and then a glassy raindrop */
export function createNimbus(): Character {
  const root = new THREE.Group();
  const floater = new THREE.Group();
  root.add(floater);

  const geometry = puffUnion(
    [
      { c: new THREE.Vector3(0, 0.02, 0), r: 0.33 },
      { c: new THREE.Vector3(-0.3, -0.07, 0), r: 0.25 },
      { c: new THREE.Vector3(0.31, -0.06, 0), r: 0.255 },
      { c: new THREE.Vector3(-0.13, 0.19, -0.02), r: 0.25 },
      { c: new THREE.Vector3(0.16, 0.2, -0.02), r: 0.23 },
      { c: new THREE.Vector3(-0.5, -0.15, 0), r: 0.155 },
      { c: new THREE.Vector3(0.52, -0.14, 0), r: 0.155 },
      { c: new THREE.Vector3(0, -0.09, 0.07), r: 0.29 },
    ],
    26,
    0.8,
  );
  const p = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < -0.22) p.setY(i, -0.22 + (y + 0.22) * 0.4);
  }
  geometry.computeVertexNormals();
  const body = new THREE.Mesh(geometry);
  floater.add(body);

  const eyeL = surfaceAt(body, -0.135, 0.02);
  const eyeR = surfaceAt(body, 0.135, 0.02);
  const cheekL = surfaceAt(body, -0.245, -0.06);
  const cheekR = surfaceAt(body, 0.245, -0.06);
  const mouthAt = surfaceAt(body, 0, -0.055);
  const plush: SoftOptions = {
    color: '#e9e6e0',
    sheenColor: '#f4f2ee',
    scatter: '#f2b9a6',
    rimColor: '#ffffff',
    rim: 0.26,
    wrap: 0.62,
    detailStrength: 0.5,
    spots: [
      { at: cheekL.point, radius: 0.085, color: '#ff9b96', amount: 0.7, soft: 0.85 },
      { at: cheekR.point, radius: 0.085, color: '#ff9b96', amount: 0.7, soft: 0.85 },
    ],
    occluders: [{ at: new THREE.Vector3(0, -0.6, 0.05), radius: 0.45, strength: 0.4 }],
  };
  body.material = felt(plush.color, plush);
  addFuzz(body, plush, {
    length: 0.02,
    density: 85,
    shells: 6,
    clear: [
      { at: eyeL.point, radius: 0.085 },
      { at: eyeR.point, radius: 0.085 },
      { at: mouthAt.point, radius: 0.05 },
    ],
  });

  const lids: THREE.Mesh[] = [];
  for (const at of [eyeL, eyeR]) {
    const lid = smile(0.11, 0.032, 0.017);
    lid.position.copy(at.point).addScaledVector(at.normal, 0.012);
    faceAlong(lid, at.normal, 0.6);
    body.add(lid);
    lids.push(lid);
  }
  const mouth = smile(0.042, 0.013, 0.009);
  mouth.position.copy(mouthAt.point).addScaledVector(mouthAt.normal, 0.002);
  faceAlong(mouth, mouthAt.normal, 0.3);
  body.add(mouth);

  const dropGeometry = blob((v) => {
    const pinch = 1 - 0.78 * Math.pow(Math.max(0, v.y), 1.6);
    v.set(v.x * pinch, v.y * 1.25, v.z * pinch);
  }, 24, 18);
  const dropMaterial = new THREE.MeshPhysicalMaterial({
    color: '#a9dbff',
    roughness: 0.06,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    emissive: new THREE.Color('#3f9bff'),
    emissiveIntensity: 0.16,
    envMapIntensity: 1.6,
  });
  const drop = new THREE.Mesh(dropGeometry, dropMaterial);
  drop.visible = false;
  root.add(drop);

  const random = rng(5);
  let nextDrop = 2 + random() * 3;
  let dropT = -1;
  let dropX = 0;
  let squish = 0;
  return {
    name: 'Nimbus',
    root,
    update(f) {
      const t = f.time;
      floater.position.y = 0.032 * Math.sin(t * 1.25);
      floater.rotation.z = 0.045 * Math.sin(t * 0.8);
      squish = damp(squish, f.shake, f.shake > squish ? 10 : 2.2, f.dt);
      const breathe = Math.sin(t * 1.25 + 0.6);
      floater.scale.set(1 + 0.015 * breathe + 0.08 * squish, 1 - 0.02 * breathe - 0.12 * squish, 1);
      root.rotation.y = damp(root.rotation.y, f.look.x * 0.28, 4, f.dt);
      root.rotation.x = damp(root.rotation.x, -f.look.y * 0.14, 4, f.dt);
      const sleepy = 1 + 0.25 * clamp(squish * 2);
      for (const lid of lids) lid.scale.set(1, sleepy * (1 + 0.08 * Math.sin(t * 1.25)), 1);

      if (dropT < 0 && t > nextDrop) {
        dropT = 0;
        dropX = (random() - 0.5) * 0.28;
      }
      if (dropT >= 0) {
        dropT += f.dt;
        const fall = 0.5 * 2.2 * dropT * dropT;
        const grow = clamp(dropT / 0.25);
        const fade = 1 - clamp((dropT - 0.55) / 0.2);
        drop.visible = fade > 0;
        drop.position.set(dropX, floater.position.y - 0.2 - fall, 0.04);
        drop.scale.setScalar(0.042 * grow * fade);
        if (fade <= 0) {
          dropT = -1;
          nextDrop = t + 2.5 + random() * 4;
        }
      }
    },
  };
}
