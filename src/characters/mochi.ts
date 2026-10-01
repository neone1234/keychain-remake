import * as THREE from 'three';
import type { Character } from './types';
import { addFuzz, felt, type SoftOptions } from './materials';
import { Blinker, catMouth, Eye, blob, faceAlong, surfaceAt, taperedTube } from './parts';
import { clamp, damp } from '../util/math';

/** a squishy peach rice-cake blob in felt, with bean eyes, rosy cheeks and a sprout that sways */
export function createMochi(): Character {
  const root = new THREE.Group();
  const squash = new THREE.Group();
  squash.position.y = -0.27;
  root.add(squash);

  const geometry = blob((v) => {
    const y = v.y >= 0 ? v.y * 0.43 : v.y * 0.25;
    const widen = 1 + 0.07 * -v.y;
    const lump = 1 + 0.025 * Math.sin(v.x * 5.3 + v.z * 3.1) * Math.cos(v.y * 4.1);
    v.set(v.x * 0.56 * widen * lump, y, v.z * 0.47 * widen * lump);
  });
  const body = new THREE.Mesh(geometry);
  body.position.y = 0.27;
  squash.add(body);

  const eyeL = surfaceAt(body, -0.155, 0.06);
  const eyeR = surfaceAt(body, 0.155, 0.06);
  const cheekL = surfaceAt(body, -0.275, -0.035);
  const cheekR = surfaceAt(body, 0.275, -0.035);
  const mouthAt = surfaceAt(body, 0, -0.012);

  const skin: SoftOptions = {
    color: '#f7aea1',
    sheenColor: '#ffd3ca',
    scatter: '#ff6a62',
    rimColor: '#ffd9d2',
    spots: [
      { at: cheekL.point, radius: 0.088, color: '#ff8579', amount: 0.62, soft: 0.85 },
      { at: cheekR.point, radius: 0.088, color: '#ff8579', amount: 0.62, soft: 0.85 },
    ],
    occluders: [{ at: new THREE.Vector3(0, -0.62, 0), radius: 0.5, strength: 0.45 }],
  };
  body.material = felt(skin.color, skin);
  addFuzz(body, skin, {
    length: 0.016,
    density: 95,
    clear: [
      { at: eyeL.point, radius: 0.07 },
      { at: eyeR.point, radius: 0.07 },
      { at: mouthAt.point.clone().add(new THREE.Vector3(0, -0.01, 0)), radius: 0.06 },
    ],
  });

  const eyes = [new Eye(0.036, 0.052, 0.03).place(eyeL.point, eyeL.normal), new Eye(0.036, 0.052, 0.03).place(eyeR.point, eyeR.normal)];
  for (const e of eyes) body.add(e.group);
  const mouth = catMouth(0.07, 0.02, 0.0075);
  mouth.position.copy(mouthAt.point).addScaledVector(mouthAt.normal, 0.002);
  faceAlong(mouth, mouthAt.normal, 0.3);
  body.add(mouth);

  const sprout = new THREE.Group();
  sprout.position.set(0.0, 0.41, -0.02);
  body.add(sprout);
  const green = felt('#86c76c', { sheenColor: '#d8f5c2', scatter: '#2f8a3a', rimColor: '#c9f0b0', detailScale: 4 });
  const stem = new THREE.Mesh(
    taperedTube(new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.04, 0), new THREE.Vector3(0.012, 0.06, 0), new THREE.Vector3(-0.008, 0.15, 0.01)]), (t) => 0.021 - t * 0.006, 24, 12),
    green,
  );
  sprout.add(stem);
  const leafGeometry = blob((v) => {
    const u = (v.x + 1) / 2;
    const taper = Math.sin(Math.PI * Math.pow(u, 0.8));
    v.set(u * 0.15, v.y * 0.018 * taper + Math.sin(u * Math.PI) * 0.018, v.z * 0.062 * taper);
  }, 32, 16);
  for (const side of [-1, 1]) {
    const leaf = new THREE.Mesh(leafGeometry, green);
    leaf.position.set(-0.008, 0.15, 0.01);
    leaf.rotation.set(0, side < 0 ? Math.PI : 0, 0.55);
    sprout.add(leaf);
  }

  const blink = new Blinker(11);
  let sway = 0;
  let swayVel = 0;
  let squish = 0;
  return {
    name: 'Mochi',
    root,
    update(f) {
      const t = f.time;
      const breathe = Math.sin(t * 1.7);
      squish = damp(squish, f.shake, f.shake > squish ? 10 : 2.5, f.dt);
      const sy = 1 + 0.04 * breathe - 0.16 * squish;
      const sxz = 1 - 0.022 * breathe + 0.1 * squish;
      squash.scale.set(sxz, sy, sxz);
      root.rotation.y = damp(root.rotation.y, f.look.x * 0.32, 5, f.dt);
      root.rotation.x = damp(root.rotation.x, -f.look.y * 0.18, 5, f.dt);
      const open = Math.min(blink.open(t), 1 - clamp(squish * 1.6));
      for (const e of eyes) e.set(open, f.look.x, f.look.y, 0.018);
      swayVel += (-30 * sway - 3 * swayVel - f.accel.x * 0.06) * f.dt;
      sway = clamp(sway + swayVel * f.dt, -0.7, 0.7);
      sprout.rotation.z = sway + Math.sin(t * 1.3) * 0.08;
      sprout.rotation.x = Math.sin(t * 0.9 + 1) * 0.06;
    },
  };
}
