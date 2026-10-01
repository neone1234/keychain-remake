import * as THREE from 'three';
import { rng } from '../util/math';

const SIZE = 512;

/** draws something four times across the edges so the tile repeats seamlessly */
function wrapped(draw: (ox: number, oy: number) => void, cx: number, cy: number, reach: number) {
  for (const ox of [0, -SIZE, SIZE])
    for (const oy of [0, -SIZE, SIZE]) {
      if (cx + ox < -reach || cx + ox > SIZE + reach || cy + oy < -reach || cy + oy > SIZE + reach) continue;
      draw(ox, oy);
    }
}

function heightToNormal(height: Float32Array, strength: number): THREE.DataTexture {
  const data = new Uint8Array(SIZE * SIZE * 4);
  const at = (x: number, y: number) => height[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)];
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * SIZE + x) * 4;
      data[i] = Math.round((-dx / l) * 127.5 + 127.5);
      data[i + 1] = Math.round((dy / l) * 127.5 + 127.5);
      data[i + 2] = Math.round((1 / l) * 127.5 + 127.5);
      data[i + 3] = 255;
    }
  const t = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

function readHeight(c: HTMLCanvasElement): Float32Array {
  const img = c.getContext('2d')!.getImageData(0, 0, SIZE, SIZE).data;
  const h = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < h.length; i++) h[i] = img[i * 4] / 255;
  return h;
}

function canvas() {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.fillStyle = 'rgb(128,128,128)';
  x.fillRect(0, 0, SIZE, SIZE);
  return { c, x };
}

function lumps(x: CanvasRenderingContext2D, random: () => number, count: number, rMin: number, rMax: number, alpha: number) {
  for (let i = 0; i < count; i++) {
    const cx = random() * SIZE;
    const cy = random() * SIZE;
    const r = rMin + random() * (rMax - rMin);
    const v = random() < 0.5 ? 255 : 0;
    wrapped(
      (ox, oy) => {
        const g = x.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, r);
        g.addColorStop(0, `rgba(${v},${v},${v},${alpha})`);
        g.addColorStop(1, `rgba(${v},${v},${v},0)`);
        x.fillStyle = g;
        x.fillRect(cx + ox - r, cy + oy - r, r * 2, r * 2);
      },
      cx,
      cy,
      r,
    );
  }
}

let fibre: THREE.DataTexture | null = null;
/** felt: matted fibres lying every which way over gentle lumps */
export function fibreMap() {
  if (fibre) return fibre;
  const random = rng(42);
  const { c, x } = canvas();
  lumps(x, random, 260, 10, 46, 0.12);
  x.lineCap = 'round';
  for (let i = 0; i < 9000; i++) {
    const cx = random() * SIZE;
    const cy = random() * SIZE;
    const a = random() * Math.PI * 2;
    const len = 5 + random() * 16;
    const bend = (random() - 0.5) * len * 0.6;
    const v = random() < 0.55 ? 255 : 0;
    x.strokeStyle = `rgba(${v},${v},${v},${0.18 + random() * 0.22})`;
    x.lineWidth = 0.8 + random() * 1.1;
    const dx = Math.cos(a) * len * 0.5;
    const dy = Math.sin(a) * len * 0.5;
    wrapped(
      (ox, oy) => {
        x.beginPath();
        x.moveTo(cx - dx + ox, cy - dy + oy);
        x.quadraticCurveTo(cx + ox - dy * (bend / len), cy + oy + dx * (bend / len), cx + dx + ox, cy + dy + oy);
        x.stroke();
      },
      cx,
      cy,
      len,
    );
  }
  const blurred = document.createElement('canvas');
  blurred.width = blurred.height = SIZE;
  const bx = blurred.getContext('2d', { willReadFrequently: true })!;
  bx.filter = 'blur(0.6px)';
  for (const ox of [0, -SIZE, SIZE]) for (const oy of [0, -SIZE, SIZE]) bx.drawImage(c, ox, oy);
  fibre = heightToNormal(readHeight(blurred), 2.6);
  return fibre;
}

let clay: THREE.DataTexture | null = null;
/** soft vinyl / clay: broad thumb-pressed undulation with a few tiny pores */
export function clayMap() {
  if (clay) return clay;
  const random = rng(7);
  const { c, x } = canvas();
  lumps(x, random, 120, 30, 90, 0.16);
  lumps(x, random, 500, 3, 9, 0.18);
  const blurred = document.createElement('canvas');
  blurred.width = blurred.height = SIZE;
  const bx = blurred.getContext('2d', { willReadFrequently: true })!;
  bx.filter = 'blur(1.5px)';
  for (const ox of [0, -SIZE, SIZE]) for (const oy of [0, -SIZE, SIZE]) bx.drawImage(c, ox, oy);
  clay = heightToNormal(readHeight(blurred), 3.2);
  return clay;
}
