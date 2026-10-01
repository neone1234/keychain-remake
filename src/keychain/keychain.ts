import * as THREE from 'three';
import { integrate, point, solve, type Link, type PPoint } from './physics';
import { chromeMaterial, EGG } from './stone';
import { clamp, damp, smoothstep } from '../util/math';
import type { Character, CharacterFrame } from '../characters/types';

export interface CharmSetup {
  id: string;
  body: THREE.Group;
  picks: THREE.Mesh[];
  hang: number;
  radius: number;
  /** half extents in world units, for landing on the floor */
  size: THREE.Vector3;
  /** chain length below the split ring */
  drop: number;
  /** resting depth */
  depth: number;
  staysBack?: boolean;
  /** stones let clicks on their clear rim through to what is behind */
  glass?: THREE.Mesh;
  character?: Character;
}

interface Charm extends CharmSetup {
  pivot: THREE.Group;
  jumpRing: THREE.Mesh;
  chain: PPoint[];
  ringPoint: PPoint;
  top: PPoint;
  center: PPoint;
  link: Link;
  reach: number;
  z: number;
  zPlace: number;
  loose: boolean;
  yaw: number;
  yawVel: number;
  vel: THREE.Vector2;
  acc: THREE.Vector2;
  shake: number;
  landedAt: number;
}

const SEG = 0.07;
const TOP = 2.85;
const RING_Y = 1.24;
const RING_R = 0.15;
const BALL_R = 0.0185;
const STEP = 1 / 120;
const MAX_BALLS = 520;

function helixRing(radius: number, tube: number) {
  class Helix extends THREE.Curve<THREE.Vector3> {
    constructor() {
      super();
    }
    getPoint(t: number, target = new THREE.Vector3()) {
      const a = t * Math.PI * 2 * 1.92 + 0.6;
      return target.set(Math.cos(a) * radius, Math.sin(a) * radius, (t - 0.5) * tube * 2.3);
    }
  }
  return new THREE.TubeGeometry(new Helix(), 260, tube, 10, false);
}

export interface KeychainEvents {
  onKnock?: (strength: number, pan: number, kind: 'glass' | 'metal' | 'enamel') => void;
}

export class Keychain {
  readonly group = new THREE.Group();
  readonly charms: Charm[] = [];
  private points: PPoint[] = [];
  private links: Link[] = [];
  private topChain: PPoint[] = [];
  private ring!: PPoint;
  private anchor!: PPoint;
  private anchorHome = new THREE.Vector2();
  private held: PPoint | null = null;
  private heldInv = 0;
  private heldCharm: Charm | null = null;
  private heldOffset = new THREE.Vector2();
  private heldZ = 0;
  private places: number[] = [];
  private order: Charm[] = [];
  private balls: THREE.InstancedMesh;
  private splitRing: THREE.Mesh;
  private raycaster = new THREE.Raycaster();
  private acc = 0;
  private time = 0;
  private dropStart: number | null = null;
  private dropDone = false;
  private plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private hit = new THREE.Vector3();
  private m4 = new THREE.Matrix4();
  private v3 = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private lookTarget: THREE.Vector3 | null = null;
  private frame: CharacterFrame = {
    time: 0,
    dt: 0,
    look: new THREE.Vector2(),
    shake: 0,
    accel: new THREE.Vector3(),
    down: new THREE.Vector3(0, -1, 0),
  };
  wind = 1;
  events: KeychainEvents = {};
  readonly camera: THREE.PerspectiveCamera;

  constructor(setups: CharmSetup[], camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.balls = new THREE.InstancedMesh(new THREE.SphereGeometry(BALL_R, 12, 8), chromeMaterial, MAX_BALLS);
    this.balls.frustumCulled = false;
    this.group.add(this.balls);
    this.splitRing = new THREE.Mesh(helixRing(RING_R, 0.019), chromeMaterial);
    this.group.add(this.splitRing);

    const n = Math.round((TOP - RING_Y) / SEG);
    for (let i = 0; i <= n; i++) {
      const p = this.add(point(0, TOP - i * SEG, i ? 1 : 0));
      if (i) this.links.push({ a: this.topChain[i - 1], b: p, length: SEG });
      this.topChain.push(p);
    }
    this.anchor = this.topChain[0];
    this.anchorHome.set(this.anchor.x, this.anchor.y);
    this.ring = this.topChain[n];
    this.ring.inv = 0.45;

    setups.forEach((s, k) => {
      const m = Math.max(1, Math.round(s.drop / SEG));
      const fan = (k - (setups.length - 1) / 2) * 0.14;
      const along = (d: number) => point(this.ring.x + Math.sin(fan) * d, this.ring.y - Math.cos(fan) * d, 1);
      const chain = [this.ring];
      for (let i = 1; i <= m; i++) {
        const p = this.add(along(i * SEG));
        this.links.push({ a: chain[i - 1], b: p, length: SEG });
        chain.push(p);
      }
      const ringPoint = chain[m];
      const center = this.add(along(m * SEG + s.hang));
      center.inv = 0.32;
      const link = { a: ringPoint, b: center, length: s.hang };
      this.links.push(link);

      const pivot = new THREE.Group();
      pivot.add(s.body);
      const jumpRing = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.0085, 10, 32), chromeMaterial);
      jumpRing.rotation.y = Math.PI / 2;
      pivot.add(jumpRing);
      this.group.add(pivot);

      this.charms.push({
        ...s,
        pivot,
        jumpRing,
        chain,
        ringPoint,
        top: ringPoint,
        center,
        link,
        reach: (n + m) * SEG + s.hang,
        z: s.depth,
        zPlace: s.depth,
        loose: false,
        yaw: 0,
        yawVel: 0,
        vel: new THREE.Vector2(),
        acc: new THREE.Vector2(),
        shake: 0,
        landedAt: -1,
      });
    });
    this.places = this.charms.map((c) => c.depth).sort((a, b) => a - b);
    this.order = [...this.charms].sort((a, b) => a.depth - b.depth);

    for (let i = 0; i < 480; i++) this.step(STEP, i * STEP);
  }

  private add(p: PPoint) {
    this.points.push(p);
    return p;
  }

  /** lift the settled bunch above the frame; it drops in when start() is called */
  hideAbove(height = 4.4, sideways = 0.45) {
    for (const p of this.points) {
      p.x += sideways;
      p.px += sideways;
      p.y += height;
      p.py += height;
    }
  }

  startDrop(now: number, instant = false) {
    if (instant) {
      const dx = this.anchorHome.x - this.anchor.x;
      const dy = this.anchorHome.y - this.anchor.y;
      for (const p of this.points) {
        p.x += dx;
        p.px += dx;
        p.y += dy;
        p.py += dy;
      }
      this.dropDone = true;
      return;
    }
    this.dropStart = now;
  }

  private reorder(order: Charm[]) {
    this.order = order;
    order.forEach((c, i) => (c.zPlace = this.places[i]));
  }

  private contact(a: Charm, b: Charm) {
    const level = 1 - smoothstep(0.1, 0.3, Math.abs(a.z - b.z));
    return { reach: (a.radius + b.radius) * 0.5 * (0.9 + 0.2 * level), level };
  }

  private breeze(t: number) {
    return (0.28 * Math.sin(t * 0.63) + 0.17 * Math.sin(t * 1.71 + 1.3) + 0.08 * Math.sin(t * 3.9 + 0.4)) * this.wind;
  }

  private step(dt: number, t: number) {
    integrate(this.points, this.held, { dt, gravity: -9.8, wind: this.breeze(t), keep: 0.988 });
    const h = this.heldCharm;
    if (h && !h.loose && Math.hypot(h.center.x - this.anchor.x, h.center.y - this.anchor.y) > h.reach + 0.38) this.breakOff(h);
    for (let it = 0; it < 14; it++) {
      for (const l of this.links) solve(l.a, l.b, l.length);
      for (let i = 0; i < this.charms.length; i++)
        for (let j = i + 1; j < this.charms.length; j++) {
          const a = this.charms[i];
          const b = this.charms[j];
          const { reach, level } = this.contact(a, b);
          solve(a.center, b.center, reach, 0.05 + 0.95 * level, true);
        }
    }
    for (const c of this.charms) if (c.loose) this.keepInFrame(c);
  }

  private breakOff(c: Charm) {
    const dx = c.top.x - c.center.x;
    const dy = c.top.y - c.center.y;
    const d = Math.hypot(dx, dy) || 1;
    const top = this.add(point(c.center.x + (dx / d) * c.hang, c.center.y + (dy / d) * c.hang, 1));
    c.link.a = top;
    c.top = top;
    c.loose = true;
    if (this.held === c.center) {
      c.center.inv = this.heldInv;
      const target = c.center.target;
      c.center.target = null;
      this.held = top;
      this.heldInv = 1;
      top.inv = 0;
      top.target = target ? { x: target.x + (top.x - c.center.x), y: target.y + (top.y - c.center.y) } : { x: top.x, y: top.y };
      this.heldOffset.set(this.heldOffset.x + (top.x - c.center.x), this.heldOffset.y + (top.y - c.center.y));
    }
    this.events.onKnock?.(0.8, clamp(c.center.x / 2, -0.8, 0.8), 'metal');
  }

  private hookBack(c: Charm) {
    const i = this.points.indexOf(c.top);
    if (i >= 0) this.points.splice(i, 1);
    c.top = c.ringPoint;
    c.link.a = c.ringPoint;
    c.loose = false;
    this.events.onKnock?.(0.5, clamp(c.center.x / 2, -0.8, 0.8), 'metal');
  }

  private frameAt(z: number) {
    const halfH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * (this.camera.position.z - z);
    return { floor: this.camera.position.y - halfH + 0.05, wall: halfH * this.camera.aspect, cx: this.camera.position.x };
  }

  private keepInFrame(c: Charm) {
    const { floor, wall, cx } = this.frameAt(c.z);
    const ax = c.top.x - c.center.x;
    const ay = c.top.y - c.center.y;
    const al = Math.hypot(ax, ay) || 1;
    const nx = ax / al;
    const ny = ay / al;
    const lowest = Math.hypot(c.size.x * nx, c.size.y * ny);
    const lying = Math.abs(nx);
    const bound = (p: PPoint, below: number, side: number, grip: number) => {
      p.x = clamp(p.x, cx - wall + side, cx + wall - side);
      if (p.y >= floor + below) return 0;
      const fall = p.py - p.y;
      p.y = floor + below;
      p.py = p.y - fall * 0.28;
      p.px = p.x - (p.x - p.px) * (1 - grip);
      return fall;
    };
    const landing = Math.max(bound(c.center, lowest, c.size.x, 0.03 + 0.1 * lying), bound(c.top, 0.04, 0.04, 0.12));
    if (c.center.y <= floor + lowest + 0.003) {
      if (lying < 0.1) c.top.x += Math.sign(nx || 1) * 0.002;
      else if (c.top.y < c.center.y) c.top.y += (c.center.y - c.top.y) * 0.03;
    }
    if (landing > 0.012 && this.time - c.landedAt > 0.12) {
      c.landedAt = this.time;
      this.events.onKnock?.(Math.min(1, landing * 16), clamp(c.center.x / 2, -0.8, 0.8), c.glass ? 'glass' : 'metal');
    }
  }

  /** world point under the pointer on the plane at depth z */
  private pointerAt(ndc: THREE.Vector2, z: number) {
    this.raycaster.setFromCamera(ndc, this.camera);
    this.plane.constant = -z;
    return this.raycaster.ray.intersectPlane(this.plane, this.hit);
  }

  /** what is under the pointer, without grabbing it */
  probe(ndc: THREE.Vector2) {
    return this.pick(ndc) !== null;
  }

  private pick(ndc: THREE.Vector2): { charm: Charm | null; point: PPoint } | null {
    this.raycaster.setFromCamera(ndc, this.camera);
    const meshes = this.charms.flatMap((c) => c.picks);
    const hits = this.raycaster.intersectObjects(meshes, false);
    const owner = (o: THREE.Object3D) => this.charms.find((c) => c.picks.includes(o as THREE.Mesh))!;
    const solid = hits.find((h) => {
      const c = owner(h.object);
      if (!c.glass) return true;
      const p = c.glass.worldToLocal(h.point.clone());
      return (p.x / EGG.x) ** 2 + ((p.y + 0.05) / EGG.y) ** 2 < 0.62;
    });
    const chosen = solid ?? hits[0];
    if (chosen) {
      const c = owner(chosen.object);
      return { charm: c, point: c.loose ? c.top : c.center };
    }
    const at = this.pointerAt(ndc, 0);
    if (!at) return null;
    let best: PPoint | null = null;
    let bestD = 0.24;
    for (const p of this.points) {
      if (!p.inv) continue;
      if (this.charms.some((c) => c.center === p)) continue;
      const d = Math.hypot(p.x - at.x, p.y - at.y);
      if (d < bestD) {
        best = p;
        bestD = d;
      }
    }
    return best ? { charm: null, point: best } : null;
  }

  grab(ndc: THREE.Vector2): boolean {
    const found = this.pick(ndc);
    if (!found) return false;
    const { charm, point: p } = found;
    this.heldZ = charm ? charm.zPlace : 0;
    if (charm) {
      this.reorder([...this.order.filter((c) => c !== charm), charm]);
      this.heldZ = charm.zPlace;
    }
    const at = this.pointerAt(ndc, this.heldZ);
    if (!at) return false;
    this.heldCharm = charm;
    this.held = p;
    this.heldInv = p.inv;
    p.inv = 0;
    this.heldOffset.set(p.x - at.x, p.y - at.y);
    p.target = { x: p.x, y: p.y };
    return true;
  }

  drag(ndc: THREE.Vector2) {
    const at = this.pointerAt(ndc, this.heldZ);
    if (this.held && at) this.held.target = { x: at.x + this.heldOffset.x, y: at.y + this.heldOffset.y };
    const look = this.pointerAt(ndc, 0.9);
    this.lookTarget = look ? (this.lookTarget ?? new THREE.Vector3()).copy(look) : null;
  }

  hover(ndc: THREE.Vector2 | null) {
    if (!ndc) {
      this.lookTarget = null;
      return;
    }
    const look = this.pointerAt(ndc, 0.9);
    this.lookTarget = look ? (this.lookTarget ?? new THREE.Vector3()).copy(look) : null;
  }

  release() {
    if (!this.held) return;
    this.held.inv = this.heldInv;
    this.held.target = null;
    this.held = null;
    const c = this.heldCharm;
    this.heldCharm = null;
    if (!c) return;
    if (c.staysBack) this.reorder([c, ...this.order.filter((o) => o !== c)]);
    if (c.loose && Math.hypot(c.top.x - c.ringPoint.x, c.top.y - c.ringPoint.y) < 0.4) this.hookBack(c);
  }

  get holding() {
    return this.held !== null;
  }

  update(dt: number, now: number) {
    this.time = now;
    if (this.dropStart !== null && !this.dropDone) {
      const k = Math.min(1, (now - this.dropStart) / 1.55);
      const s = 1.25;
      const eased = 1 + (s + 1) * (k - 1) ** 3 + s * (k - 1) ** 2;
      this.anchor.x = this.anchorHome.x + 0.45 * (1 - eased);
      this.anchor.y = this.anchorHome.y + 4.4 * (1 - eased);
      if (k >= 1) this.dropDone = true;
    }
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < 8) {
      this.step(STEP, now);
      this.acc -= STEP;
      steps++;
    }
    if (steps >= 8) this.acc = 0;
    this.sync(dt, now);
  }

  private sync(dt: number, now: number) {
    for (const c of this.charms) {
      c.z = damp(c.z, c.zPlace, 7, dt);
      const vx = (c.center.x - c.center.px) / STEP;
      const vy = (c.center.y - c.center.py) / STEP;
      if (dt > 0) {
        c.acc.set((vx - c.vel.x) / dt, (vy - c.vel.y) / dt).clampLength(0, 80);
      }
      c.vel.set(vx, vy);
      const target = clamp(c.acc.length() / 30);
      c.shake = target > c.shake ? damp(c.shake, target, 12, dt) : damp(c.shake, target, 1.4, dt);

      const drive = -c.acc.x * 0.05 + Math.sin(now * 0.9 + c.depth * 9) * 0.12 * this.wind;
      c.yawVel += (-26 * c.yaw - 2.6 * c.yawVel + drive * 6) * dt;
      c.yaw = clamp(c.yaw + c.yawVel * dt, -0.75, 0.75);

      const angle = Math.atan2(c.center.x - c.top.x, c.top.y - c.center.y);
      c.pivot.position.set(c.top.x, c.top.y, c.z);
      c.pivot.rotation.set(0, 0, angle);
      c.body.rotation.y = c.yaw;
    }

    const toRing = Math.atan2(this.ring.x - this.topChain[this.topChain.length - 2].x, this.topChain[this.topChain.length - 2].y - this.ring.y);
    this.splitRing.position.set(this.ring.x, this.ring.y, 0);
    this.splitRing.rotation.set(0.32, 0, toRing);

    let n = 0;
    const place = (x: number, y: number, z: number) => {
      if (n >= MAX_BALLS) return;
      if (Math.hypot(x - this.ring.x, y - this.ring.y) < RING_R * 0.92) return;
      this.balls.setMatrixAt(n++, this.m4.makeTranslation(x, y, z));
    };
    const top = this.topChain;
    for (let i = 0; i < top.length; i++) {
      place(top[i].x, top[i].y, 0);
      if (i < top.length - 1) place((top[i].x + top[i + 1].x) / 2, (top[i].y + top[i + 1].y) / 2, 0);
    }
    for (const c of this.charms) {
      const ch = c.chain;
      const endZ = c.loose ? 0 : c.z;
      for (let i = 1; i < ch.length; i++) {
        const z0 = (endZ * (i - 1)) / (ch.length - 1);
        const z1 = (endZ * i) / (ch.length - 1);
        place((ch[i - 1].x + ch[i].x) / 2, (ch[i - 1].y + ch[i].y) / 2, (z0 + z1) / 2);
        if (i < ch.length - 1 || c.loose) place(ch[i].x, ch[i].y, z1);
      }
    }
    for (let i = n; i < MAX_BALLS; i++) this.balls.setMatrixAt(i, this.m4.makeScale(0, 0, 0));
    this.balls.instanceMatrix.needsUpdate = true;
    this.balls.count = Math.max(n, 1);

    this.group.updateMatrixWorld(true);
    const f = this.frame;
    f.time = now;
    f.dt = dt;
    for (const c of this.charms) {
      if (!c.character) continue;
      const root = c.character.root;
      root.getWorldPosition(this.v3);
      root.getWorldQuaternion(this.q);
      const inv = this.q.invert();
      if (this.lookTarget) {
        const d = this.lookTarget.clone().sub(this.v3).applyQuaternion(inv);
        f.look.set(clamp(d.x / 1.6, -1, 1), clamp(d.y / 1.6, -1, 1));
      } else f.look.set(0, 0);
      f.shake = c.shake;
      f.accel.set(c.acc.x, c.acc.y, 0).applyQuaternion(inv);
      f.down.set(0, -1, 0).applyQuaternion(inv);
      c.character.update(f);
    }
  }
}
