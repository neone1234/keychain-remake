/** A point mass in the plane of the keychain (depth is handled per charm, not simulated). */
export interface PPoint {
  x: number;
  y: number;
  px: number;
  py: number;
  /** inverse mass; 0 pins the point */
  inv: number;
  /** while held: where the finger wants it */
  target: { x: number; y: number } | null;
}

export interface Link {
  a: PPoint;
  b: PPoint;
  length: number;
}

export function point(x: number, y: number, inv = 1): PPoint {
  return { x, y, px: x, py: y, inv, target: null };
}

/** pulls two points to a distance; with onlyApart it only pushes */
export function solve(a: PPoint, b: PPoint, length: number, strength = 1, onlyApart = false) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1e-6;
  const w = a.inv + b.inv;
  if (!w || (onlyApart && d >= length)) return;
  const k = ((d - length) / d / w) * strength;
  a.x += dx * k * a.inv;
  a.y += dy * k * a.inv;
  b.x -= dx * k * b.inv;
  b.y -= dy * k * b.inv;
}

export interface StepForces {
  dt: number;
  gravity: number;
  wind: number;
  /** velocity kept per step (air drag) */
  keep: number;
}

/** Verlet integration for every free point; the held one eases toward the finger with a capped step */
export function integrate(points: PPoint[], held: PPoint | null, f: StepForces) {
  const dt2 = f.dt * f.dt;
  for (const p of points) {
    if (p === held && p.target) {
      p.px = p.x;
      p.py = p.y;
      let mx = (p.target.x - p.x) * 0.38;
      let my = (p.target.y - p.y) * 0.38;
      const m = Math.hypot(mx, my);
      if (m > 0.075) {
        mx *= 0.075 / m;
        my *= 0.075 / m;
      }
      p.x += mx;
      p.y += my;
      continue;
    }
    if (!p.inv) continue;
    const vx = (p.x - p.px) * f.keep;
    const vy = (p.y - p.py) * f.keep;
    p.px = p.x;
    p.py = p.y;
    p.x += vx + f.wind * (p.inv < 1 ? 1 : 0.25) * dt2;
    p.y += vy + f.gravity * dt2;
  }
}
