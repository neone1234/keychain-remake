import * as THREE from 'three';
import { eyeMaterial, mouthMaterial, sparkleMaterial } from './materials';
import { rng } from '../util/math';

/** a sphere made from a subdivided cube: even texel density everywhere (good for fur strands) */
export function cubeSphere(radius: number, segments = 24) {
  const g = new THREE.BoxGeometry(2, 2, 2, segments, segments, segments);
  const p = g.attributes.position as THREE.BufferAttribute;
  const n = g.attributes.normal as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const x2 = v.x * v.x;
    const y2 = v.y * v.y;
    const z2 = v.z * v.z;
    v.set(v.x * Math.sqrt(1 - y2 / 2 - z2 / 2 + (y2 * z2) / 3), v.y * Math.sqrt(1 - z2 / 2 - x2 / 2 + (z2 * x2) / 3), v.z * Math.sqrt(1 - x2 / 2 - y2 / 2 + (x2 * y2) / 3));
    n.setXYZ(i, v.x, v.y, v.z);
    p.setXYZ(i, v.x * radius, v.y * radius, v.z * radius);
  }
  return g;
}

/** a smooth sphere pushed around by a function of each point (point given on the unit sphere) */
export function blob(deform: (v: THREE.Vector3) => void, widthSegments = 96, heightSegments = 72) {
  const g = new THREE.SphereGeometry(1, widthSegments, heightSegments);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    deform(v);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export interface Puff {
  c: THREE.Vector3;
  r: number;
}

/** a star-shaped union of spheres with smooth creases (a puffy cloud), seen from its origin */
export function puffUnion(puffs: Puff[], smooth = 22, squashZ = 1) {
  const dir = new THREE.Vector3();
  return blob(
    (v) => {
      dir.copy(v).normalize();
      let sum = 0;
      for (const { c, r } of puffs) {
        const b = dir.dot(c);
        const disc = b * b - c.lengthSq() + r * r;
        if (disc <= 0) continue;
        const t = b + Math.sqrt(disc);
        if (t <= 0) continue;
        sum += Math.exp(smooth * t);
      }
      const t = sum > 0 ? Math.log(sum) / smooth : 0.1;
      v.copy(dir).multiplyScalar(t);
      v.z *= squashZ;
    },
    128,
    96,
  );
}

/** a tube along a curve whose radius follows a function of t (0 root .. 1 tip), capped at both ends */
export function taperedTube(curve: THREE.Curve<THREE.Vector3>, radius: (t: number) => number, segments = 48, radial = 16) {
  const frames = curve.computeFrenetFrames(segments, false);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPointAt(t, p);
    const r = radius(t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      n.copy(frames.normals[i]).multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i], Math.sin(a)).normalize();
      positions.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r);
      normals.push(n.x, n.y, n.z);
      uvs.push(t, j / radial);
    }
  }
  for (let i = 0; i < segments; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = (i + 1) * (radial + 1) + j;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const capAt = (i: number, flip: boolean) => {
    const t = i / segments;
    curve.getPointAt(t, p);
    const tan = curve.getTangentAt(t).multiplyScalar(flip ? -1 : 1);
    const centre = positions.length / 3;
    positions.push(p.x + tan.x * radius(t) * 0.6, p.y + tan.y * radius(t) * 0.6, p.z + tan.z * radius(t) * 0.6);
    normals.push(tan.x, tan.y, tan.z);
    uvs.push(t, 0.5);
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      if (flip) indices.push(centre, a + 1, a);
      else indices.push(centre, a, a + 1);
    }
  };
  capAt(0, true);
  capAt(segments, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

const ray = new THREE.Raycaster();
/** where a line straight into the screen at (x, y) meets a mesh, in the mesh's own space */
export function surfaceAt(mesh: THREE.Mesh, x: number, y: number, from = new THREE.Vector3(0, 0, 1)) {
  mesh.updateMatrixWorld(true);
  const origin = new THREE.Vector3(x, y, 0).addScaledVector(from, 5).applyMatrix4(mesh.matrixWorld);
  const dir = from.clone().negate().transformDirection(mesh.matrixWorld);
  ray.set(origin, dir);
  const hit = ray.intersectObject(mesh, false)[0];
  if (!hit) return { point: new THREE.Vector3(x, y, 0), normal: new THREE.Vector3(0, 0, 1) };
  const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
  const point = hit.point.clone().applyMatrix4(inv);
  const normal = (hit.face?.normal ?? new THREE.Vector3(0, 0, 1)).clone();
  return { point, normal };
}

/** orient an object so its +z follows a normal (eased toward the viewer for a flatter, friendlier face) */
export function faceAlong(obj: THREE.Object3D, normal: THREE.Vector3, towardViewer = 0.35) {
  const n = normal.clone().lerp(new THREE.Vector3(0, 0, 1), towardViewer).normalize();
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
}

let sphere: THREE.SphereGeometry | null = null;
const unitSphere = () => (sphere ??= new THREE.SphereGeometry(1, 32, 24));

/** a glossy bean eye with two catchlights; blinks and glances */
export class Eye {
  readonly group = new THREE.Group();
  readonly ball: THREE.Mesh;
  private lid = new THREE.Group();
  private sparkles: THREE.Mesh[] = [];
  private home = new THREE.Vector3();
  constructor(rx: number, ry: number, rz: number) {
    this.ball = new THREE.Mesh(unitSphere(), eyeMaterial);
    this.ball.scale.set(rx, ry, rz);
    this.lid.add(this.ball);
    const s1 = new THREE.Mesh(unitSphere(), sparkleMaterial);
    s1.scale.set(rx * 0.32, ry * 0.26, rz * 0.2);
    s1.position.set(-rx * 0.32, ry * 0.38, rz * 0.88);
    const s2 = new THREE.Mesh(unitSphere(), sparkleMaterial);
    s2.scale.set(rx * 0.15, ry * 0.12, rz * 0.12);
    s2.position.set(rx * 0.34, -ry * 0.3, rz * 0.9);
    this.sparkles.push(s1, s2);
    this.lid.add(s1, s2);
    this.group.add(this.lid);
  }
  place(point: THREE.Vector3, normal: THREE.Vector3, sink = 0.45) {
    faceAlong(this.group, normal, 0.4);
    const rz = this.ball.scale.z;
    this.group.position.copy(point).addScaledVector(normal, -rz * sink);
    this.home.copy(this.group.position);
    return this;
  }
  /** open: 1 open .. 0 shut; look: small offset in the face plane */
  set(open: number, lookX: number, lookY: number, reach: number) {
    this.lid.scale.y = Math.max(0.08, open);
    this.group.position.copy(this.home);
    this.group.position.x += lookX * reach;
    this.group.position.y += lookY * reach;
    for (const s of this.sparkles) s.visible = open > 0.35;
  }
}

/** random natural blinking, with an occasional double blink */
export class Blinker {
  private next: number;
  private start = -10;
  private double = false;
  private random: () => number;
  constructor(seed: number) {
    this.random = rng(seed);
    this.next = 1 + this.random() * 3;
  }
  open(t: number) {
    if (t > this.next) {
      this.start = t;
      this.double = this.random() < 0.2;
      this.next = t + 2.2 + this.random() * 4;
    }
    const d = t - this.start;
    const blink = (u: number) => (u < 0 || u > 0.16 ? 1 : 1 - Math.sin((u / 0.16) * Math.PI));
    return Math.min(blink(d), this.double ? blink(d - 0.24) : 1);
  }
}

/** a thin rounded stroke through points (mouths, sleepy eyes, brows) */
export function stroke(points: THREE.Vector3[], radius: number, material: THREE.Material = mouthMaterial) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  return new THREE.Mesh(taperedTube(curve, (t) => radius * (0.75 + 0.25 * Math.sin(t * Math.PI)), 24, 10), material);
}

/** a small smile laid onto a surface at a point, facing along its normal */
export function smile(width: number, depth: number, radius: number) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) {
    const u = i / 8 - 0.5;
    pts.push(new THREE.Vector3(u * width, -depth * (1 - 4 * u * u), 0));
  }
  return stroke(pts, radius);
}

/** a cat mouth, like a small w */
export function catMouth(width: number, depth: number, radius: number) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 16; i++) {
    const u = i / 16;
    const x = (u - 0.5) * width;
    const y = -depth * Math.abs(Math.sin(u * Math.PI * 2));
    pts.push(new THREE.Vector3(x, y, 0));
  }
  return stroke(pts, radius);
}
