import * as THREE from 'three';
import type { Character } from './types';
import { mouthMaterial, vinyl, type Spot } from './materials';
import { Blinker, Eye, blob, faceAlong, surfaceAt, taperedTube } from './parts';
import { clamp, damp } from '../util/math';

const ARMS = 7;

/** a coral soft-vinyl baby octopus with short curly arms and freckles */
export function createTako(): Character {
  const root = new THREE.Group();
  const bob = new THREE.Group();
  root.add(bob);

  const head = new THREE.Mesh(
    blob((v) => {
      const narrow = v.y < 0 ? 1 + 0.13 * v.y : 1 - 0.04 * v.y;
      v.set(v.x * 0.345 * narrow, v.y * (v.y > 0 ? 0.37 : 0.27) + 0.07, v.z * 0.315 * narrow);
    }),
  );
  bob.add(head);

  const eyeL = surfaceAt(head, -0.122, 0.045);
  const eyeR = surfaceAt(head, 0.122, 0.045);
  const cheekL = surfaceAt(head, -0.2, -0.045);
  const cheekR = surfaceAt(head, 0.2, -0.045);
  const mouthAt = surfaceAt(head, 0, -0.055);
  const freckles: Spot[] = [];
  for (const [cheek, s] of [[cheekL, -1], [cheekR, 1]] as const) {
    for (const [dx, dy] of [[-0.028, 0.016], [0.004, -0.014], [0.03, 0.018]]) {
      const at = surfaceAt(head, cheek.point.x + dx * s, cheek.point.y + dy);
      freckles.push({ at: at.point, radius: 0.0125, color: '#c9372f', amount: 0.75, soft: 0.35 });
    }
  }
  const skin = vinyl('#ff6b58', {
    scatter: '#e2281f',
    rimColor: '#ffc4b8',
    occluders: [{ at: new THREE.Vector3(0, -0.36, 0), radius: 0.3, strength: 0.55 }],
    spots: [
      { at: cheekL.point, radius: 0.07, color: '#ff9c93', amount: 0.55, soft: 0.85 },
      { at: cheekR.point, radius: 0.07, color: '#ff9c93', amount: 0.55, soft: 0.85 },
      ...freckles,
    ],
  });
  head.material = skin;

  const eyes = [new Eye(0.047, 0.06, 0.034).place(eyeL.point, eyeL.normal), new Eye(0.047, 0.06, 0.034).place(eyeR.point, eyeR.normal)];
  for (const e of eyes) head.add(e.group);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0075, 10, 28), mouthMaterial);
  mouth.position.copy(mouthAt.point).addScaledVector(mouthAt.normal, 0.002);
  faceAlong(mouth, mouthAt.normal, 0.3);
  mouth.scale.set(1, 1.15, 1);
  head.add(mouth);

  const armMat = vinyl('#ff6b58', { scatter: '#e2281f', rimColor: '#ffc4b8', occluders: [{ at: new THREE.Vector3(0, 0.02, 0), radius: 0.3, strength: 0.6 }] });
  const arms: { pivot: THREE.Group; axis: THREE.Vector3; phase: number }[] = [];
  for (let i = 0; i < ARMS; i++) {
    const a = Math.PI / 2 + ((i - 3) * Math.PI * 2) / ARMS;
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const base = out.clone().multiplyScalar(0.17).add(new THREE.Vector3(0, -0.13, 0));
    const pts = [
      [0.0, 0.0],
      [0.09, -0.15],
      [0.18, -0.22],
      [0.27, -0.2],
      [0.3, -0.13],
      [0.255, -0.095],
    ].map(([o, y]) => out.clone().multiplyScalar(o).add(new THREE.Vector3(0, y, 0)));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const arm = new THREE.Mesh(taperedTube(curve, (t) => 0.072 * Math.pow(1 - t, 0.75) + 0.019, 56, 16), armMat);
    const pivot = new THREE.Group();
    pivot.position.copy(base);
    pivot.add(arm);
    bob.add(pivot);
    arms.push({ pivot, axis: new THREE.Vector3(-out.z, 0, out.x), phase: i * 0.9 });
  }

  const blink = new Blinker(37);
  let squish = 0;
  const q = new THREE.Quaternion();
  return {
    name: 'Tako',
    root,
    update(f) {
      const t = f.time;
      squish = damp(squish, f.shake, f.shake > squish ? 10 : 2.2, f.dt);
      bob.position.y = 0.016 * Math.sin(t * 2.2);
      head.scale.set(1 + 0.08 * squish, 1 - 0.1 * squish + 0.012 * Math.sin(t * 2.2 + 0.5), 1 + 0.06 * squish);
      for (const arm of arms) {
        const wave = Math.sin(t * 2.3 + arm.phase) * 0.2 + Math.sin(t * 1.1 + arm.phase * 1.7) * 0.06 - squish * 0.35;
        arm.pivot.quaternion.copy(q.setFromAxisAngle(arm.axis, wave));
      }
      root.rotation.y = damp(root.rotation.y, f.look.x * 0.35, 5, f.dt);
      root.rotation.x = damp(root.rotation.x, -f.look.y * 0.18, 5, f.dt);
      const open = Math.min(blink.open(t + 1.3), 1 - clamp(squish * 1.6));
      for (const e of eyes) e.set(open, f.look.x, f.look.y, 0.015);
    },
  };
}
