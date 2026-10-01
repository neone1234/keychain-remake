import * as THREE from 'three';
import { clamp, smoothstep } from '../util/math';
import type { Conditions } from '../weather/weather';

export type Season = 'spring' | 'summer' | 'fall' | 'winter' | null;
type LightName = 'night' | 'dawn' | 'day' | 'golden' | 'dusk';

interface Palette {
  top: string;
  mid: string;
  horizon: string;
  cloudLit: string;
  cloudShade: string;
  haze: string;
  ink: string;
  bridge: string;
  skyline: string;
  key: string;
  fill: string;
  rim: string;
  exposure: number;
  studio: number;
  stars: number;
  lights: number;
  keyI: number;
  fillI: number;
  rimI: number;
}

const PALETTES: Record<LightName, Palette> = {
  night: {
    top: '#0c1634', mid: '#1a2b52', horizon: '#33456d', cloudLit: '#8c98b8', cloudShade: '#384666', haze: '#6e7b9a', ink: '#e1e7f3',
    bridge: '#1b2031', skyline: '#141a2b', key: '#a9bbff', fill: '#3b4d7c', rim: '#8197dc',
    exposure: 0.86, studio: 0.38, stars: 1, lights: 1, keyI: 0.55, fillI: 0.55, rimI: 1.0,
  },
  dawn: {
    top: '#45629b', mid: '#cc9db4', horizon: '#f6c39c', cloudLit: '#ffe6d7', cloudShade: '#b59dba', haze: '#f3ddd7', ink: '#1f2638',
    bridge: '#ae5747', skyline: '#8b839b', key: '#ffcaa5', fill: '#b9b6d9', rim: '#ffd0e2',
    exposure: 0.98, studio: 0.78, stars: 0.12, lights: 0.35, keyI: 1.7, fillI: 0.6, rimI: 1.2,
  },
  day: {
    top: '#5187b6', mid: '#7cb1d1', horizon: '#d1e7ef', cloudLit: '#ffffff', cloudShade: '#d4deee', haze: '#f8fbff', ink: '#1f2638',
    bridge: '#c9472c', skyline: '#808ea4', key: '#fff3e4', fill: '#bfd7ff', rim: '#c8d9ff',
    exposure: 1.0, studio: 1, stars: 0, lights: 0, keyI: 1.85, fillI: 0.6, rimI: 1.1,
  },
  golden: {
    top: '#5a80ab', mid: '#d5b096', horizon: '#f5c58f', cloudLit: '#fff0dc', cloudShade: '#c7b0c1', haze: '#f7e5d6', ink: '#1f2638',
    bridge: '#d6623d', skyline: '#908597', key: '#ffd3a3', fill: '#c3bad7', rim: '#ffc8b4',
    exposure: 1.0, studio: 0.92, stars: 0, lights: 0.1, keyI: 1.9, fillI: 0.55, rimI: 1.3,
  },
  dusk: {
    top: '#2b3664', mid: '#7f5e8b', horizon: '#e49072', cloudLit: '#f2baa8', cloudShade: '#6c5883', haze: '#c9a4aa', ink: '#f0e7f0',
    bridge: '#55313f', skyline: '#3d3753', key: '#ffa07e', fill: '#6c6ea1', rim: '#f1a5c2',
    exposure: 0.9, studio: 0.6, stars: 0.35, lights: 0.7, keyI: 1.15, fillI: 0.5, rimI: 1.1,
  },
};

/** [minutes from sunrise or sunset, which, light] */
const KEYS: [number, 'sunrise' | 'sunset', LightName][] = [
  [-80, 'sunrise', 'night'],
  [-14, 'sunrise', 'dawn'],
  [55, 'sunrise', 'day'],
  [-110, 'sunset', 'day'],
  [-38, 'sunset', 'golden'],
  [12, 'sunset', 'dusk'],
  [62, 'sunset', 'night'],
];

const SEASON_TINT: Record<Exclude<Season, null>, [string, number]> = {
  spring: ['#ffc4d8', 0.07],
  summer: ['#ffe2a0', 0.06],
  fall: ['#f2a65a', 0.1],
  winter: ['#cddfff', 0.1],
};

export interface SkyFrame {
  minute: number;
  isDay: boolean;
  cover: number;
  fog: number;
  rain: number;
  snow: number;
  top: THREE.Color;
  mid: THREE.Color;
  horizon: THREE.Color;
  cloudLit: THREE.Color;
  cloudShade: THREE.Color;
  haze: THREE.Color;
  ink: THREE.Color;
  bridge: THREE.Color;
  skyline: THREE.Color;
  key: THREE.Color;
  fill: THREE.Color;
  rim: THREE.Color;
  sunColor: THREE.Color;
  /** x, y on screen (0..1), visibility */
  sun: THREE.Vector3;
  moon: THREE.Vector3;
  exposure: number;
  studio: number;
  stars: number;
  lights: number;
  keyI: number;
  fillI: number;
  rimI: number;
}

const COLOR_KEYS = ['top', 'mid', 'horizon', 'cloudLit', 'cloudShade', 'haze', 'ink', 'bridge', 'skyline', 'key', 'fill', 'rim'] as const;
const NUMBER_KEYS = ['exposure', 'studio', 'stars', 'lights', 'keyI', 'fillI', 'rimI'] as const;

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();

/** the sky that should show for a minute of the day under some conditions */
export function skyFor(minute: number, w: Conditions, season: Season): SkyFrame {
  const times = KEYS.map(([offset, from, light]) => [(((w[from] + offset) % 1440) + 1440) % 1440, light] as [number, LightName]).sort((a, b) => a[0] - b[0]);
  let next = times.findIndex(([at]) => at > minute);
  if (next < 0) next = 0;
  const [fromAt, a] = times[(next - 1 + times.length) % times.length];
  const [toAt, b] = times[next];
  const span = (toAt - fromAt + 1440) % 1440 || 1440;
  const k = smoothstep(0, 1, ((minute - fromAt + 1440) % 1440) / span);
  const pa = PALETTES[a];
  const pb = PALETTES[b];

  const grey = clamp(Math.max(w.fog * 0.7, smoothstep(0.55, 1, w.cover) * 0.6) + w.rain * 0.35 + w.snow * 0.2);
  const tint = season ? SEASON_TINT[season] : null;
  const frame = { minute, cover: w.cover, fog: w.fog, rain: w.rain, snow: w.snow } as SkyFrame;

  for (const key of COLOR_KEYS) {
    const c = new THREE.Color(pa[key]).lerp(tmpB.set(pb[key]), k);
    if (key !== 'ink' && key !== 'bridge') {
      if (tint) c.lerp(tmpA.set(tint[0]), key === 'top' ? tint[1] * 0.5 : tint[1]);
      const l = c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
      c.lerp(tmpA.setRGB(l, l, l * 1.05), grey).multiplyScalar(1 - w.rain * 0.22);
    }
    frame[key] = c;
  }
  for (const key of NUMBER_KEYS) frame[key] = pa[key] + (pb[key] - pa[key]) * k;

  const dayLength = (w.sunset - w.sunrise + 1440) % 1440 || 720;
  const day = ((minute - w.sunrise + 1440) % 1440) / dayLength;
  const isDay = day > 0 && day < 1;
  frame.isDay = isDay;
  const dayClamped = clamp(day);
  const height = Math.sin(Math.PI * dayClamped);
  const sunShows =
    smoothstep(-0.02, 0.035, day) * (1 - smoothstep(0.965, 1.02, day)) * (isDay || day < 1.05 ? 1 : 0) *
    (1 - smoothstep(0.35, 0.85, w.cover)) * (1 - w.fog) * (1 - w.rain) * (1 - w.snow * 0.8);
  frame.sun = new THREE.Vector3(0.1 + 0.8 * dayClamped, 0.47 + 0.43 * height, sunShows);
  frame.sunColor = new THREE.Color('#ffb06a').lerp(tmpB.set('#fff5df'), smoothstep(0.08, 0.6, height));

  const nightLength = 1440 - dayLength;
  const night = ((minute - w.sunset + 1440) % 1440) / nightLength;
  const moonShows = (isDay ? 0 : smoothstep(0.03, 0.12, night) * (1 - smoothstep(0.88, 0.97, night))) * (1 - smoothstep(0.4, 0.9, w.cover)) * (1 - w.fog * 0.8) * (1 - w.rain);
  frame.moon = new THREE.Vector3(0.12 + 0.76 * clamp(night), 0.55 + 0.33 * Math.sin(Math.PI * clamp(night)), moonShows);

  frame.stars *= 1 - smoothstep(0.2, 0.8, w.cover);
  frame.studio *= 1 - grey * 0.35;
  frame.keyI *= 1 - 0.55 * smoothstep(0.45, 1, w.cover) - 0.25 * w.fog;
  return frame;
}

/** eases one frame toward another, in place; returns whether anything is still moving */
export function easeSky(shown: SkyFrame, target: SkyFrame, k: number): boolean {
  let moving = false;
  for (const key of COLOR_KEYS) {
    const a = shown[key];
    const b = target[key];
    const gap = Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
    if (gap < 1e-4) a.copy(b);
    else {
      a.lerp(b, k);
      moving = true;
    }
  }
  for (const key of ['sunColor'] as const) shown[key].lerp(target[key], k);
  for (const key of ['sun', 'moon'] as const) {
    if (shown[key].distanceTo(target[key]) > 1e-4) moving = true;
    shown[key].lerp(target[key], k);
  }
  for (const key of [...NUMBER_KEYS, 'cover', 'fog', 'rain', 'snow'] as const) {
    const gap = target[key] - shown[key];
    if (Math.abs(gap) < 1e-4) shown[key] = target[key];
    else {
      shown[key] += gap * k;
      moving = true;
    }
  }
  shown.minute = target.minute;
  shown.isDay = target.isDay;
  return moving;
}

export function cloneSky(f: SkyFrame): SkyFrame {
  const out = { ...f } as SkyFrame;
  for (const key of COLOR_KEYS) out[key] = f[key].clone();
  out.sunColor = f.sunColor.clone();
  out.sun = f.sun.clone();
  out.moon = f.moon.clone();
  return out;
}
