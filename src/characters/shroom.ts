import * as THREE from 'three';
import type { Character } from './types';
import { addFuzz, felt, type SoftOptions } from './materials';
import { Blinker, Eye, faceAlong, smile, surfaceAt } from './parts';
import { clamp, damp, rng } from '../util/math';

function lathe(points: [number, number][], segments = 96) {
  const spline = new THREE.SplineCurve(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.LatheGeometry(spline.getPoints(72), segments);
  g.computeVertexNormals();
  return g;
}

/** a felt toadstool: red cap with appliqué dots, a chubby cream body, tiny arms, waves now and then */
export function createShroom(): Character {
  const root = new THREE.Group();
  const lift = new THREE.Group();
  lift.position.y = 0.06;
  root.add(lift);

  const cap = new THREE.Group();
  cap.position.y = -0.02;
  lift.add(cap);
  const capFelt: SoftOptions = { color: '#e4463b', sheenColor: '#ff8f80', scatter: '#a8161b', rimColor: '#ffb0a2', rim: 0.24 };
  const capTop = new THREE.Mesh(
    lathe([
      [0.47, -0.048],
      [0.485, -0.012],
      [0.475, 0.04],
      [0.43, 0.13],
      [0.35, 0.225],
      [0.25, 0.3],
      [0.13, 0.34],
      [0.0008, 0.35],
    ]),
    felt(capFelt.color, capFelt),
  );
  cap.add(capTop);
  addFuzz(capTop, capFelt, { length: 0.014, density: 100 });
  const gills: SoftOptions = {
    color: '#f0d9bd',
    sheenColor: '#fff3e2',
    scatter: '#d79a72',
    detailScale: 3,
    occluders: [{ at: new THREE.Vector3(0, -0.3, 0), radius: 0.3, strength: 0.75 }],
  };
  const under = new THREE.Mesh(
    lathe([
      [0.0008, -0.05],
      [0.2, -0.058],
      [0.33, -0.07],
      [0.43, -0.068],
      [0.47, -0.048],
    ]),
    felt(gills.color, gills),
  );
  cap.add(under);

  const dotMat = felt('#fbf6ec', { sheenColor: '#ffffff', scatter: '#efcdb6', rimColor: '#ffffff', detailScale: 4 });
  const dots: [number, number, number, number][] = [
    [0.0, 0.96, 0.28, 0.072],
    [-0.56, 0.6, 0.57, 0.086],
    [0.6, 0.55, 0.58, 0.078],
    [-0.88, 0.36, 0.1, 0.062],
    [0.88, 0.3, 0.22, 0.066],
    [0.18, 0.42, 0.89, 0.058],
    [-0.3, 0.84, -0.45, 0.07],
    [0.52, 0.72, -0.46, 0.062],
  ];
  const ray = new THREE.Raycaster();
  capTop.updateMatrixWorld(true);
  for (const [x, y, z, r] of dots) {
    const dir = new THREE.Vector3(x, y, z).normalize();
    const centre = new THREE.Vector3(0, 0.05, 0);
    ray.set(centre.clone().addScaledVector(dir, 2), dir.clone().negate());
    const hit = ray.intersectObject(capTop, false)[0];
    if (!hit?.face) continue;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16), dotMat);
    dot.scale.set(r, r, r * 0.3);
    const n = hit.face.normal.clone();
    dot.position.copy(hit.point).addScaledVector(n, r * 0.06);
    faceAlong(dot, n, 0);
    cap.add(dot);
  }

  const stem = new THREE.Mesh(
    lathe([
      [0.0008, -0.57],
      [0.17, -0.565],
      [0.245, -0.53],
      [0.28, -0.45],
      [0.29, -0.33],
      [0.275, -0.19],
      [0.245, -0.1],
      [0.2, -0.055],
      [0.0008, -0.045],
    ]),
  );
  lift.add(stem);
  const eyeL = surfaceAt(stem, -0.088, -0.225);
  const eyeR = surfaceAt(stem, 0.088, -0.225);
  const cheekL = surfaceAt(stem, -0.165, -0.285);
  const cheekR = surfaceAt(stem, 0.165, -0.285);
  const mouthAt = surfaceAt(stem, 0, -0.27);
  const creamFelt: SoftOptions = {
    color: '#ecdcc3',
    sheenColor: '#f7ead6',
    scatter: '#e9a98c',
    rimColor: '#fff6ea',
    spots: [
      { at: cheekL.point, radius: 0.058, color: '#ff9f93', amount: 0.6, soft: 0.85 },
      { at: cheekR.point, radius: 0.058, color: '#ff9f93', amount: 0.6, soft: 0.85 },
    ],
    occluders: [{ at: new THREE.Vector3(0, 0.1, 0), radius: 0.43, strength: 0.7 }],
  };
  const cream = felt(creamFelt.color, creamFelt);
  stem.material = cream;
  addFuzz(stem, creamFelt, {
    length: 0.013,
    density: 105,
    clear: [
      { at: eyeL.point, radius: 0.058 },
      { at: eyeR.point, radius: 0.058 },
      { at: mouthAt.point, radius: 0.045 },
    ],
  });
  const eyes = [new Eye(0.031, 0.044, 0.026).place(eyeL.point, eyeL.normal), new Eye(0.031, 0.044, 0.026).place(eyeR.point, eyeR.normal)];
  for (const e of eyes) stem.add(e.group);
  const mouth = smile(0.046, 0.015, 0.0068);
  mouth.position.copy(mouthAt.point).addScaledVector(mouthAt.normal, 0.002);
  faceAlong(mouth, mouthAt.normal, 0.3);
  stem.add(mouth);

  const armGeo = new THREE.CapsuleGeometry(0.042, 0.085, 8, 16);
  const shoulders: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.255, -0.31, 0.03);
    const arm = new THREE.Mesh(armGeo, cream);
    arm.position.y = -0.062;
    shoulder.add(arm);
    shoulder.rotation.z = s * 0.55;
    lift.add(shoulder);
    shoulders.push(shoulder);
  }

  const blink = new Blinker(51);
  const random = rng(9);
  let nextWave = 2.5 + random() * 2;
  let waveT = -1;
  let squish = 0;
  let wobble = 0;
  let wobbleVel = 0;
  return {
    name: 'Shroom',
    root,
    update(f) {
      const t = f.time;
      squish = damp(squish, f.shake, f.shake > squish ? 10 : 2.2, f.dt);
      lift.scale.set(1 + 0.07 * squish, 1 - 0.1 * squish + 0.012 * Math.sin(t * 1.9), 1 + 0.07 * squish);
      wobbleVel += (-40 * wobble - 3.2 * wobbleVel - f.accel.x * 0.05) * f.dt;
      wobble = clamp(wobble + wobbleVel * f.dt, -0.35, 0.35);
      cap.rotation.z = wobble + Math.sin(t * 1.3) * 0.025;

      if (waveT < 0 && t > nextWave) waveT = 0;
      let raise = 0;
      let flap = 0;
      if (waveT >= 0) {
        waveT += f.dt;
        raise = Math.sin(Math.PI * clamp(waveT / 1.9)) ** 0.6;
        flap = Math.sin(waveT * 13) * 0.32 * raise;
        if (waveT > 1.9) {
          waveT = -1;
          nextWave = t + 3.5 + random() * 4;
        }
      }
      shoulders[1].rotation.z = 0.55 + raise * 1.95 + flap - squish * 0.4;
      shoulders[0].rotation.z = -0.55 - Math.sin(t * 1.6) * 0.06 + squish * 0.4;

      root.rotation.y = damp(root.rotation.y, f.look.x * 0.32, 5, f.dt);
      root.rotation.x = damp(root.rotation.x, -f.look.y * 0.16, 5, f.dt);
      const open = Math.min(blink.open(t + 2.1), 1 - clamp(squish * 1.6));
      for (const e of eyes) e.set(open, f.look.x, f.look.y, 0.012);
    },
  };
}
