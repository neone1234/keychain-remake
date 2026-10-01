import * as THREE from 'three';
import type { Character } from './types';
import { felt, furMaterial, vinyl } from './materials';
import { Blinker, Eye, cubeSphere, faceAlong, smile } from './parts';
import { clamp, damp } from '../util/math';

const R = 0.33;
const SHELLS = 30;

/** a round lemon pom-pom: shell fur that jiggles when shaken, big glossy eyes, stubby feet, little hops */
export function createPom(): Character {
  const root = new THREE.Group();
  const hopper = new THREE.Group();
  root.add(hopper);
  const squash = new THREE.Group();
  squash.position.y = -R - 0.04;
  hopper.add(squash);
  const body = new THREE.Group();
  body.position.y = R + 0.04;
  squash.add(body);

  const faceDir = new THREE.Vector3(0, 0.14, 1).normalize();
  const geometry = cubeSphere(R, 28);
  const shell = new Float32Array(SHELLS);
  for (let i = 0; i < SHELLS; i++) shell[i] = i / (SHELLS - 1);
  geometry.setAttribute('aShell', new THREE.InstancedBufferAttribute(shell, 1));
  const fur = furMaterial({
    color: '#ffd338',
    root: '#d88a1c',
    tip: '#fff4b8',
    length: 0.15,
    density: 34,
    face: new THREE.Vector4(faceDir.x, faceDir.y, faceDir.z, 0.9),
    wrap: 0.65,
    rim: 0.5,
  });
  const shells = new THREE.InstancedMesh(geometry, fur.material, SHELLS);
  const identity = new THREE.Matrix4();
  for (let i = 0; i < SHELLS; i++) shells.setMatrixAt(i, identity);
  shells.frustumCulled = false;
  body.add(shells);

  const onSurface = (x: number, y: number, lift: number) => {
    const z = Math.sqrt(Math.max(0, R * R - x * x - y * y));
    const n = new THREE.Vector3(x, y, z).normalize();
    return { point: n.clone().multiplyScalar(R + lift), normal: n };
  };
  const eyes = [-1, 1].map((s) => {
    const at = onSurface(s * 0.115, 0.065, 0.012);
    const e = new Eye(0.056, 0.07, 0.04).place(at.point, at.normal, 0);
    body.add(e.group);
    return e;
  });
  const cheek = felt('#ff9d8e', { sheenColor: '#ffd9d0', scatter: '#ff5a50', detailScale: 5 });
  for (const s of [-1, 1]) {
    const at = onSurface(s * 0.2, -0.035, 0.02);
    const pad = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), cheek);
    pad.scale.set(0.045, 0.03, 0.014);
    pad.position.copy(at.point);
    faceAlong(pad, at.normal, 0.2);
    body.add(pad);
  }
  const mouthAt = onSurface(0, -0.02, 0.026);
  const mouth = smile(0.06, 0.018, 0.008);
  mouth.position.copy(mouthAt.point);
  faceAlong(mouth, mouthAt.normal, 0.2);
  body.add(mouth);

  const footMat = vinyl('#ff9b45', { scatter: '#e2561f', rimColor: '#ffd0a0' });
  const feet: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), footMat);
    foot.scale.set(0.078, 0.048, 0.1);
    foot.position.set(s * 0.13, -R - 0.012, 0.07);
    foot.rotation.y = s * -0.25;
    root.add(foot);
    feet.push(foot);
  }

  const blink = new Blinker(23);
  const force = new THREE.Vector3();
  const lag = new THREE.Vector3();
  let squish = 0;
  return {
    name: 'Pom',
    root,
    update(f) {
      const t = f.time;
      const cycle = t % 3.6;
      let hop = 0;
      let stretch = 0;
      if (cycle < 0.92) {
        const ph = (cycle / 0.46) % 1;
        hop = 0.07 * Math.sin(Math.PI * ph);
        stretch = 0.06 * Math.sin(Math.PI * ph) - 0.09 * Math.exp(-((Math.min(ph, 1 - ph) * 9) ** 2));
      }
      squish = damp(squish, f.shake, f.shake > squish ? 10 : 2.2, f.dt);
      hopper.position.y = hop;
      const sy = 1 + stretch - 0.15 * squish + 0.012 * Math.sin(t * 2.1);
      const sxz = 1 - stretch * 0.6 + 0.09 * squish;
      squash.scale.set(sxz, sy, sxz);
      for (const foot of feet) foot.position.y = -R - 0.012 - hop * 0.15;

      lag.lerp(f.accel, 1 - Math.exp(-6 * f.dt));
      force.copy(f.down).multiplyScalar(0.3).addScaledVector(lag, -0.006);
      if (cycle < 0.92) force.y -= Math.cos(Math.PI * ((cycle / 0.46) % 1)) * 0.25;
      force.clampLength(0, 0.9);
      fur.uniforms.uFurForce.value.lerp(force, 1 - Math.exp(-14 * f.dt));

      root.rotation.y = damp(root.rotation.y, f.look.x * 0.4, 5, f.dt);
      root.rotation.x = damp(root.rotation.x, -f.look.y * 0.2, 5, f.dt);
      const open = Math.min(blink.open(t + 0.7), 1 - clamp(squish * 1.6));
      for (const e of eyes) e.set(open, f.look.x, f.look.y, 0.014);
    },
  };
}
