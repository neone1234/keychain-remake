import * as THREE from 'three';
import type { LandmarkKind } from '../content';
import { rng } from '../util/math';

/**
 * Landmarks are drawn once into a mask the sky shader colours for the light: red is structure (full for the
 * landmark, about 40% for the city far behind it), blue marks the shaded side, green marks lights (full for red
 * aviation beacons, half for warm lamps and windows).
 */
export const MASK_W = 3072;
export const MASK_H = 768;
const DECK = 664;

const INK = {
  lit: 'rgb(255,0,0)',
  shade: 'rgb(255,0,170)',
  far: 'rgb(105,0,0)',
  farShade: 'rgb(105,0,150)',
  hill: 'rgb(60,0,60)',
  lamp: 'rgb(255,128,0)',
  beacon: 'rgb(255,255,0)',
  window: 'rgb(105,128,0)',
};
type Ink = keyof typeof INK;

class Painter {
  readonly c = document.createElement('canvas');
  readonly x: CanvasRenderingContext2D;
  constructor() {
    this.c.width = MASK_W;
    this.c.height = MASK_H;
    this.x = this.c.getContext('2d')!;
  }
  ink(i: Ink) {
    this.x.fillStyle = INK[i];
    this.x.strokeStyle = INK[i];
    return this.x;
  }
  rect(i: Ink, x: number, y: number, w: number, h: number) {
    this.ink(i).fillRect(x, y, w, h);
  }
  poly(i: Ink, pts: number[]) {
    const x = this.ink(i);
    x.beginPath();
    x.moveTo(pts[0], pts[1]);
    for (let k = 2; k < pts.length; k += 2) x.lineTo(pts[k], pts[k + 1]);
    x.closePath();
    x.fill();
  }
  line(i: Ink, w: number, pts: number[]) {
    const x = this.ink(i);
    x.lineWidth = w;
    x.beginPath();
    x.moveTo(pts[0], pts[1]);
    for (let k = 2; k < pts.length; k += 2) x.lineTo(pts[k], pts[k + 1]);
    x.stroke();
  }
  dot(i: Ink, cx: number, cy: number, r: number) {
    const x = this.ink(i);
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.fill();
  }
  /** a lit-left / shaded-right block, used for towers and buildings */
  block(x: number, y: number, w: number, h: number, far = false, shaded = 0.4) {
    this.rect(far ? 'far' : 'lit', x, y, w, h);
    this.rect(far ? 'farShade' : 'shade', x + w * (1 - shaded), y, w * shaded, h);
  }
  windows(x: number, y: number, w: number, h: number, random: () => number, density = 0.28) {
    for (let wy = y + 10; wy < y + h - 10; wy += 16)
      for (let wx = x + 5; wx < x + w - 7; wx += 12) if (random() < density) this.rect('window', wx, wy, 4, 6);
  }
  texture() {
    const t = new THREE.CanvasTexture(this.c);
    t.anisotropy = 8;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  }
}

function hills(p: Painter, seed: number, base: number, amp: number) {
  const x = p.ink('hill');
  x.beginPath();
  x.moveTo(0, DECK + 30);
  for (let at = 0; at <= MASK_W; at += 16) {
    const h = base + amp * (0.5 + 0.3 * Math.sin(at * 0.0021 + seed) + 0.2 * Math.sin(at * 0.0057 + seed * 2.3));
    x.lineTo(at, DECK - h);
  }
  x.lineTo(MASK_W, DECK + 30);
  x.closePath();
  x.fill();
}

function skyline(p: Painter, seed: number, opts: { from?: number; to?: number; base?: number; downtown?: number; spread?: number; tall?: number } = {}) {
  const random = rng(seed);
  const { from = 0, to = MASK_W, base = 70, downtown = MASK_W * 0.5, spread = 650, tall = 230 } = opts;
  for (let at = from; at < to; ) {
    const w = 46 + random() * 90;
    const near = Math.exp(-(((at - downtown) / spread) ** 2));
    const h = base + random() * 90 + near * (tall * (0.4 + random() * 0.8));
    p.block(at, DECK - h, w, h, true, 0.35);
    p.windows(at, DECK - h, w, h, random);
    if (random() < 0.25) {
      const sw = w * 0.55;
      const sh = 20 + random() * 50;
      p.block(at + (w - sw) / 2, DECK - h - sh, sw, sh, true, 0.4);
    }
    at += w + random() * 10;
  }
}

function water(p: Painter) {
  p.rect('shade', 0, DECK + 34, MASK_W, MASK_H - DECK - 34);
}

/** a suspension bridge in the Golden Gate's spirit: stepped Art Deco towers, sweeping cables, a trussed deck */
function goldenGate(p: Painter) {
  hills(p, 1.3, 40, 120);
  const towers = [1036, 2036];
  const top = 236;
  const apart = 46;
  const mid = (towers[0] + towers[1]) / 2;
  const half = (towers[1] - towers[0]) / 2;
  const cableTop = top + 22;
  const cableLow = DECK - 44;
  const cableY = (at: number) => {
    if (at > towers[0] && at < towers[1]) return cableLow + (cableTop - cableLow) * ((at - mid) / half) ** 2;
    const out = at <= towers[0] ? at / towers[0] : (MASK_W - at) / (MASK_W - towers[1]);
    return DECK - 14 + (cableTop - DECK + 14) * Math.pow(Math.max(0, out), 1.6);
  };
  for (let at = 12; at < MASK_W; at += 19) {
    if (towers.some((t) => Math.abs(at - t) < 70)) continue;
    p.line('lit', 2.2, [at, cableY(at), at, DECK]);
  }
  for (const [dy, w, ink] of [[-6, 4, 'shade'], [0, 8, 'lit']] as const) {
    const pts: number[] = [];
    for (let at = 0; at <= MASK_W; at += 6) pts.push(at, cableY(at) + dy);
    p.line(ink, w, pts);
  }
  p.rect('lit', 0, DECK, MASK_W, 22);
  p.rect('shade', 0, DECK + 22, MASK_W, 4);
  p.rect('shade', 0, DECK + 38, MASK_W, 4);
  for (let at = 0; at < MASK_W; at += 28) {
    p.line('shade', 2.6, [at, DECK + 24, at + 28, DECK + 40]);
    p.line('shade', 2.6, [at + 28, DECK + 24, at, DECK + 40]);
  }
  for (const t of towers) {
    p.rect('shade', t - 88, DECK + 40, 176, MASK_H);
    for (const side of [-1, 1]) {
      const leg = t + side * apart;
      const steps: [number, number][] = [[MASK_H, 44], [DECK - 140, 40], [DECK - 270, 36], [DECK - 370, 32], [top, 28]];
      for (let i = 1; i < steps.length; i++) {
        const [below] = steps[i - 1];
        const [from, w] = steps[i];
        p.rect('lit', leg - w / 2, from, w / 2, below - from);
        p.rect('shade', leg, from, w / 2, below - from);
      }
      p.rect('lit', leg - 11, top - 10, 22, 10);
      p.rect('lit', leg - 6, top - 18, 12, 8);
      p.dot('beacon', leg, top - 24, 5);
    }
    for (const [at, depth] of [[DECK - 40, 26], [DECK - 190, 22], [DECK - 320, 20], [top + 4, 40]] as const) p.rect('lit', t - apart, at, apart * 2, depth);
    for (let rib = t - apart + 13; rib < t + apart - 8; rib += 11) p.rect('shade', rib, top + 10, 3, 30);
  }
  for (let at = 30; at < MASK_W; at += 64) {
    p.rect('lit', at - 1.5, DECK - 15, 3, 15);
    p.dot('lamp', at, DECK - 17, 3.2);
  }
  water(p);
}

function cableStayed(p: Painter, x0: number, x1: number, pylonAt: number, pylonTop: number, far = false) {
  const deckY = DECK - 6;
  p.rect(far ? 'far' : 'lit', x0, deckY, x1 - x0, 14);
  const lean = 40;
  p.poly(far ? 'far' : 'lit', [pylonAt - 12, deckY + 14, pylonAt + 12, deckY + 14, pylonAt + lean + 6, pylonTop, pylonAt + lean - 6, pylonTop]);
  for (let k = 1; k <= 12; k++) {
    const y = pylonTop + 20 + k * 9;
    const tx = pylonAt + lean * (1 - (y - pylonTop) / (deckY - pylonTop));
    p.line(far ? 'far' : 'lit', 1.6, [tx, y, pylonAt - 30 - k * 42, deckY]);
    p.line(far ? 'far' : 'lit', 1.6, [tx, y, pylonAt + 30 + k * 42, deckY]);
  }
  p.dot('beacon', pylonAt + lean, pylonTop - 6, 4);
  for (let at = x0 + 20; at < x1; at += 70) p.dot('lamp', at, deckY - 3, 2.6);
}

function shanghai(p: Painter) {
  skyline(p, 7, { downtown: 1700, spread: 700, tall: 200 });
  const random = rng(11);
  const pearl = 1180;
  p.block(pearl - 9, 150, 18, DECK - 150);
  for (const s of [-1, 1]) p.line('lit', 7, [pearl + s * 70, DECK, pearl + s * 6, 470]);
  p.dot('lit', pearl, 470, 62);
  p.dot('shade', pearl + 22, 474, 40);
  p.dot('lit', pearl, 268, 40);
  p.dot('shade', pearl + 14, 272, 24);
  p.dot('lit', pearl, 190, 13);
  p.rect('lit', pearl - 2, 40, 4, 150);
  p.dot('beacon', pearl, 36, 5);
  const tower = 1790;
  const x = p.ink('lit');
  x.beginPath();
  x.moveTo(tower - 70, DECK);
  x.bezierCurveTo(tower - 66, 400, tower - 40, 160, tower - 18, 40);
  x.lineTo(tower + 22, 52);
  x.bezierCurveTo(tower + 40, 180, tower + 64, 420, tower + 70, DECK);
  x.closePath();
  x.fill();
  p.poly('shade', [tower + 10, DECK, tower + 70, DECK, tower + 22, 52, tower + 6, 60]);
  p.dot('beacon', tower, 46, 5);
  const bottle = 2000;
  p.poly('lit', [bottle - 62, DECK, bottle + 62, DECK, bottle + 34, 118, bottle - 34, 118]);
  p.poly('shade', [bottle + 18, DECK, bottle + 62, DECK, bottle + 34, 118, bottle + 12, 118]);
  p.x.globalCompositeOperation = 'destination-out';
  p.poly('lit', [bottle - 20, 132, bottle + 20, 132, bottle + 16, 170, bottle - 16, 170]);
  p.x.globalCompositeOperation = 'source-over';
  const jin = 1560;
  for (let k = 0; k < 9; k++) {
    const w = 84 - k * 8;
    const y = DECK - 110 - k * 42;
    p.block(jin - w / 2, y, w, k === 0 ? 110 + 42 : 42);
  }
  p.rect('lit', jin - 3, 160, 6, 120);
  p.windows(jin - 40, DECK - 300, 80, 280, random, 0.18);
  water(p);
}

function beijing(p: Painter) {
  hills(p, 4.1, 70, 150);
  skyline(p, 21, { downtown: 1900, spread: 600, tall: 160 });
  const gate = 1060;
  p.block(gate - 260, DECK - 110, 520, 110, false, 0.3);
  p.x.globalCompositeOperation = 'destination-out';
  p.x.beginPath();
  p.x.ellipse(gate, DECK, 46, 70, 0, Math.PI, 0);
  p.x.fill();
  p.x.globalCompositeOperation = 'source-over';
  const roof = (y: number, w: number, h: number) => {
    const x = p.ink('lit');
    x.beginPath();
    x.moveTo(gate - w / 2 - 30, y);
    x.quadraticCurveTo(gate - w / 2 + 20, y + 4, gate - w / 2 + 40, y - h);
    x.lineTo(gate + w / 2 - 40, y - h);
    x.quadraticCurveTo(gate + w / 2 - 20, y + 4, gate + w / 2 + 30, y);
    x.closePath();
    x.fill();
  };
  p.block(gate - 190, DECK - 200, 380, 90, false, 0.35);
  roof(DECK - 196, 440, 46);
  p.block(gate - 150, DECK - 290, 300, 60, false, 0.35);
  roof(DECK - 286, 360, 50);
  for (let k = -3; k <= 3; k++) p.dot('lamp', gate + k * 46, DECK - 214, 4);
  const cctv = 1650;
  p.poly('lit', [cctv - 120, DECK, cctv - 60, DECK, cctv - 40, 260, cctv - 100, 260]);
  p.poly('lit', [cctv + 40, DECK, cctv + 100, DECK, cctv + 120, 230, cctv + 60, 230]);
  p.poly('lit', [cctv - 100, 260, cctv + 120, 230, cctv + 120, 300, cctv - 100, 330]);
  p.poly('shade', [cctv + 70, DECK, cctv + 100, DECK, cctv + 120, 230, cctv + 95, 232]);
  const zun = 2130;
  const x = p.ink('lit');
  x.beginPath();
  x.moveTo(zun - 66, DECK);
  x.quadraticCurveTo(zun - 36, 330, zun - 62, 70);
  x.lineTo(zun + 62, 70);
  x.quadraticCurveTo(zun + 36, 330, zun + 66, DECK);
  x.closePath();
  x.fill();
  p.poly('shade', [zun + 20, DECK, zun + 66, DECK, zun + 62, 70, zun + 22, 70]);
  p.dot('beacon', zun, 64, 5);
}

function shenzhen(p: Painter) {
  hills(p, 2.2, 60, 170);
  skyline(p, 33, { downtown: 1500, spread: 800, tall: 260 });
  const pingan = 1420;
  p.block(pingan - 62, 140, 124, DECK - 140);
  for (let k = 0; k < 4; k++) p.block(pingan - 52 + k * 13, 140 - (k + 1) * 22, 104 - k * 26, 22);
  p.rect('lit', pingan - 3, 10, 6, 52);
  for (const s of [-1, 1]) p.line('shade', 3, [pingan + s * 56, DECK, pingan + s * 40, 140]);
  p.dot('beacon', pingan, 10, 5);
  const bamboo = 1750;
  const x = p.ink('lit');
  x.beginPath();
  x.moveTo(bamboo - 58, DECK);
  x.bezierCurveTo(bamboo - 60, 300, bamboo - 30, 170, bamboo, 120);
  x.bezierCurveTo(bamboo + 30, 170, bamboo + 60, 300, bamboo + 58, DECK);
  x.closePath();
  x.fill();
  for (let k = -2; k <= 2; k++) p.line('shade', 2.5, [bamboo + k * 22, DECK, bamboo + k * 8, 150]);
  cableStayed(p, 1900, MASK_W, 2400, 300);
  water(p);
}

function tokyo(p: Painter) {
  const fuji = p.ink('hill');
  fuji.beginPath();
  fuji.moveTo(300, DECK);
  fuji.lineTo(760, 330);
  fuji.quadraticCurveTo(800, 300, 840, 330);
  fuji.lineTo(1320, DECK);
  fuji.closePath();
  fuji.fill();
  skyline(p, 45, { downtown: 1800, spread: 900, tall: 170 });
  const tt = 1150;
  const legs = (y: number) => 6 + 120 * Math.pow(Math.max(0, 1 - (DECK - y) / (DECK - 100)), 2.2);
  for (let y = DECK; y > 120; y -= 6) {
    const w = legs(y);
    p.rect('lit', tt - w, y - 6, 6, 6);
    p.rect('shade', tt + w - 6, y - 6, 6, 6);
  }
  for (let y = DECK - 20; y > 140; y -= 34) {
    const w0 = legs(y);
    const w1 = legs(y - 34);
    p.line('lit', 2, [tt - w0, y, tt + w1, y - 34]);
    p.line('lit', 2, [tt + w0, y, tt - w1, y - 34]);
  }
  p.block(tt - 70, DECK - 260, 140, 26);
  p.block(tt - 30, DECK - 420, 60, 18);
  p.rect('lit', tt - 3, 40, 6, 90);
  p.dot('beacon', tt, 38, 5);
  for (let k = -3; k <= 3; k++) p.dot('lamp', tt + k * 18, DECK - 248, 3);
  const sky = 2300;
  p.block(sky - 18, 60, 36, DECK - 60, true);
  p.block(sky - 30, 300, 60, 22, true);
  p.block(sky - 24, 200, 48, 16, true);
  p.rect('far', sky - 2, 0, 4, 60);
  p.dot('beacon', sky, 6, 4);
  water(p);
}

function london(p: Painter) {
  skyline(p, 57, { downtown: 2100, spread: 700, tall: 150 });
  const shard = 2250;
  p.poly('far', [shard - 80, DECK, shard + 80, DECK, shard + 8, 60, shard - 4, 40]);
  p.poly('farShade', [shard + 10, DECK, shard + 80, DECK, shard + 8, 60]);
  const ben = 620;
  p.block(ben - 30, 230, 60, DECK - 230, true);
  p.block(ben - 38, 230, 76, 70, true);
  p.dot('window', ben, 266, 22);
  p.poly('far', [ben - 32, 230, ben + 32, 230, ben, 120]);
  p.rect('far', ben - 2, 90, 4, 32);
  const towers = [1150, 1700];
  for (const t of towers) {
    p.block(t - 70, 250, 140, DECK - 250);
    p.poly('lit', [t - 74, 252, t + 74, 252, t, 150]);
    p.poly('shade', [t + 10, 252, t + 74, 252, t, 150]);
    for (const s of [-1, 1]) {
      p.rect('lit', t + s * 66 - 6, 200, 12, 60);
      p.poly('lit', [t + s * 66 - 8, 202, t + s * 66 + 8, 202, t + s * 66, 160]);
    }
    p.x.globalCompositeOperation = 'destination-out';
    p.x.beginPath();
    p.x.moveTo(t - 34, DECK);
    p.x.lineTo(t - 34, DECK - 120);
    p.x.quadraticCurveTo(t, DECK - 170, t + 34, DECK - 120);
    p.x.lineTo(t + 34, DECK);
    p.x.fill();
    p.x.globalCompositeOperation = 'source-over';
    for (let k = 0; k < 3; k++) p.dot('lamp', t - 30 + k * 30, 330, 4);
  }
  p.rect('lit', towers[0] + 70, 290, towers[1] - towers[0] - 140, 26);
  p.rect('shade', towers[0] + 70, 312, towers[1] - towers[0] - 140, 6);
  p.rect('lit', 0, DECK - 6, MASK_W, 18);
  const mid = (towers[0] + towers[1]) / 2;
  for (const t of towers) {
    const out = t < mid ? -1 : 1;
    const pts: number[] = [];
    for (let k = 0; k <= 20; k++) {
      const at = t + out * (70 + k * 22);
      pts.push(at, 300 + (DECK - 300) * Math.pow(k / 20, 0.7));
    }
    p.line('lit', 6, pts);
    for (let k = 1; k < 20; k += 1) p.line('lit', 2, [pts[k * 2], pts[k * 2 + 1], pts[k * 2], DECK]);
  }
  for (let at = 30; at < MASK_W; at += 80) p.dot('lamp', at, DECK - 10, 3);
  water(p);
}

const PAINTERS: Record<LandmarkKind, (p: Painter) => void> = { goldenGate, shanghai, beijing, shenzhen, tokyo, london };
const cache = new Map<LandmarkKind, THREE.Texture>();

export function landmarkTexture(kind: LandmarkKind): THREE.Texture {
  let t = cache.get(kind);
  if (!t) {
    const p = new Painter();
    PAINTERS[kind](p);
    t = p.texture();
    cache.set(kind, t);
  }
  return t;
}

/** the deck line, as a fraction of the mask's height from its bottom (traffic runs along it) */
export const DECK_FROM_BOTTOM = (MASK_H - DECK) / MASK_H;
