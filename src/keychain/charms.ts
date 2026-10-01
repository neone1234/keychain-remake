import * as THREE from 'three';
import { OWNER } from '../content';

export interface BuiltCharm {
  body: THREE.Group;
  pick: THREE.Mesh;
  hang: number;
  radius: number;
  size: THREE.Vector3;
}

/** a brass key with a scalloped flower bow, cut teeth and a milled groove down the blade */
export function buildKey(scale = 0.62): BuiltCharm {
  const shape = new THREE.Shape();
  const bowR = 0.25;
  const petals = 8;
  const bowCenterY = 0.0;
  const neckHalf = 0.075;
  const startA = -Math.PI / 2 + Math.asin(neckHalf / bowR);
  const endA = -Math.PI / 2 - Math.asin(neckHalf / bowR) + Math.PI * 2;
  const steps = 160;
  for (let i = 0; i <= steps; i++) {
    const a = startA + ((endA - startA) * i) / steps;
    const r = bowR * (1 + 0.075 * Math.cos(petals * (a + Math.PI / 2)));
    const x = Math.cos(a) * r;
    const y = bowCenterY + Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const pts: [number, number][] = [
    [-0.075, -0.27],
    [-0.105, -0.3],
    [-0.105, -0.35],
    [-0.072, -0.375],
    [-0.072, -1.02],
    [0.0, -1.1],
    [0.072, -1.04],
    [0.072, -0.98],
    [0.035, -0.95],
    [0.072, -0.9],
    [0.072, -0.85],
    [0.03, -0.81],
    [0.03, -0.76],
    [0.072, -0.72],
    [0.072, -0.66],
    [0.042, -0.62],
    [0.072, -0.58],
    [0.072, -0.375],
    [0.105, -0.35],
    [0.105, -0.3],
    [0.075, -0.27],
  ];
  for (const [x, y] of pts) shape.lineTo(x, y);
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0.115, 0.055, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const heart = new THREE.Path();
  const hx = 0;
  const hy = -0.065;
  const hs = 0.07;
  heart.moveTo(hx, hy - hs * 0.9);
  heart.bezierCurveTo(hx + hs * 1.25, hy - hs * 0.1, hx + hs * 0.75, hy + hs * 0.95, hx, hy + hs * 0.35);
  heart.bezierCurveTo(hx - hs * 0.75, hy + hs * 0.95, hx - hs * 1.25, hy - hs * 0.1, hx, hy - hs * 0.9);
  shape.holes.push(heart);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.032,
    bevelEnabled: true,
    bevelThickness: 0.013,
    bevelSize: 0.012,
    bevelSegments: 4,
    curveSegments: 40,
  });
  geometry.translate(0, 0, -0.016);
  geometry.computeVertexNormals();
  const brass = new THREE.MeshPhysicalMaterial({ color: '#d8b46c', metalness: 1, roughness: 0.27, clearcoat: 0.5, clearcoatRoughness: 0.22 });
  const key = new THREE.Mesh(geometry, brass);

  const groove = new THREE.Shape();
  groove.moveTo(-0.045, -0.41);
  groove.lineTo(-0.012, -0.41);
  groove.lineTo(-0.012, -0.96);
  groove.lineTo(-0.045, -0.99);
  groove.closePath();
  const grooveMat = new THREE.MeshPhysicalMaterial({ color: '#8d6c35', metalness: 1, roughness: 0.48 });
  for (const side of [1, -1]) {
    const g = new THREE.Mesh(new THREE.ShapeGeometry(groove), grooveMat);
    g.position.z = side * 0.0295;
    if (side < 0) g.rotation.y = Math.PI;
    if (side < 0) g.scale.x = -1;
    key.add(g);
  }

  const holder = new THREE.Group();
  holder.scale.setScalar(scale);
  holder.add(key);
  holder.rotation.y = 0.3;
  holder.position.y = -0.02 - 0.115 * scale;
  const body = new THREE.Group();
  body.add(holder);
  const hang = 0.02 + 0.5 * scale;
  return { body, pick: key, hang, radius: 0.27, size: new THREE.Vector3(0.27 * scale, 0.69 * scale, 0.03) };
}

function tagPrint() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 700;
  const x = c.getContext('2d')!;
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, c.width, c.height);
  const ink = '#24365e';
  x.fillStyle = ink;
  x.textAlign = 'center';
  x.textBaseline = 'alphabetic';
  const rounded = '"Arial Rounded MT Bold", "Nunito", "Segoe UI", system-ui, sans-serif';
  x.font = `800 92px ${rounded}`;
  x.fillText('IF', 256, 380);
  x.fillText('FOUND', 256, 470);
  x.font = `600 34px ${rounded}`;
  x.globalAlpha = 0.8;
  x.fillText('please return to', 256, 540);
  x.globalAlpha = 1;
  x.font = `800 46px ${rounded}`;
  x.fillText(OWNER.toUpperCase(), 256, 596);
  x.fillStyle = '#ef6f62';
  const hx = 256;
  const hy = 640;
  const hs = 16;
  x.beginPath();
  x.moveTo(hx, hy + hs * 0.9);
  x.bezierCurveTo(hx + hs * 1.3, hy + hs * 0.1, hx + hs * 0.8, hy - hs * 0.95, hx, hy - hs * 0.35);
  x.bezierCurveTo(hx - hs * 0.8, hy - hs * 0.95, hx - hs * 1.3, hy + hs * 0.1, hx, hy + hs * 0.9);
  x.fill();
  x.strokeStyle = ink;
  x.globalAlpha = 0.3;
  x.lineWidth = 5;
  x.beginPath();
  x.roundRect(36, 36, 440, 628, 56);
  x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** a glossy white enamel tag stamped IF FOUND, with a brass eyelet */
export function buildTag(scale = 0.55): BuiltCharm {
  const w = 0.44;
  const h = 0.6;
  const r = 0.11;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2);
  shape.absarc(w / 2 - r, -h / 2 + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(w / 2, h / 2 - r);
  shape.absarc(w / 2 - r, h / 2 - r, r, 0, Math.PI / 2, false);
  shape.lineTo(-w / 2 + r, h / 2);
  shape.absarc(-w / 2 + r, h / 2 - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-w / 2, -h / 2 + r);
  shape.absarc(-w / 2 + r, -h / 2 + r, r, Math.PI, Math.PI * 1.5, false);
  const holeY = h / 2 - 0.085;
  const hole = new THREE.Path();
  hole.absarc(0, holeY, 0.042, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.036, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.016, bevelSegments: 5, curveSegments: 32 });
  geometry.translate(0, 0, -0.018);
  const print = tagPrint();
  print.repeat.set(1 / w, 1 / h);
  print.offset.set(0.5, 0.5);
  const enamel = new THREE.MeshPhysicalMaterial({ color: '#fbfaf6', map: print, roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.04, sheen: 0.2, sheenColor: new THREE.Color('#ffffff') });
  const edge = new THREE.MeshPhysicalMaterial({ color: '#f4f2ec', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 });
  const tag = new THREE.Mesh(geometry, [enamel, edge]);
  for (const side of [1, -1]) {
    const eyelet = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 12, 36), new THREE.MeshPhysicalMaterial({ color: '#d8b46c', metalness: 1, roughness: 0.3 }));
    eyelet.position.set(0, holeY, side * 0.036);
    tag.add(eyelet);
  }
  const holder = new THREE.Group();
  holder.scale.setScalar(scale);
  holder.position.y = -(h / 2 - 0.085) * scale - 0.035;
  holder.rotation.y = -0.25;
  holder.add(tag);
  const body = new THREE.Group();
  body.add(holder);
  return { body, pick: tag, hang: holeY * scale + 0.035, radius: 0.26, size: new THREE.Vector3((w / 2) * scale, (h / 2) * scale, 0.03) };
}
