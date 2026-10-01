import './styles.css';
import * as THREE from 'three';
import { CITIES, DEFAULT_CITY, LOADING_LINE, SITE_TITLE, type City } from './content';
import { SceneRenderer, type View } from './renderer/renderer';
import { SkyEnvironment } from './renderer/environment';
import { CloudLayers, createSkyUniforms } from './sky/clouds';
import { createBackdrop } from './sky/backdrop';
import { createNearLayers } from './sky/nearLayers';
import { landmarkTexture, MASK_H, MASK_W, DECK_FROM_BOTTOM } from './sky/landmarks';
import { cloneSky, easeSky, skyFor, type Season, type SkyFrame } from './sky/skyState';
import { fetchConditions, placeholderConditions, weatherWords, WEATHER_PRESETS, type Conditions, type WeatherChoice } from './weather/weather';
import { localMinute } from './weather/solar';
import { Letter } from './letter/letter';
import { Keychain, type CharmSetup } from './keychain/keychain';
import { buildStone, createGlassShared } from './keychain/stone';
import { buildKey, buildTag } from './keychain/charms';
import { tagLayer } from './keychain/layers';
import { createCast } from './characters';
import { softLight } from './characters/materials';
import { LoadingScreen } from './ui/loading';
import { WeatherLine } from './ui/weatherLine';
import { clamp, reduceMotion } from './util/math';

if (import.meta.env.DEV) {
  const errors: string[] = [];
  (window as unknown as { __errors: string[] }).__errors = errors;
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(' ').slice(0, 2000));
    original(...args);
  };
  const originalWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    errors.push('[warn] ' + args.map(String).join(' ').slice(0, 500));
    originalWarn(...args);
  };
  addEventListener('error', (e) => errors.push(`[error] ${e.message}`));
  addEventListener('unhandledrejection', (e) => errors.push(`[rejection] ${String(e.reason)}`));
}

document.title = SITE_TITLE;
const query = new URLSearchParams(location.search);
const loading = new LoadingScreen(LOADING_LINE);

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
const renderer = new SceneRenderer(canvas, scene, camera);
const gl = renderer.gl;

const environment = new SkyEnvironment(gl);
scene.environmentIntensity = 0.95;

// ---------------------------------------------------------------- the sky
const sky = createSkyUniforms();
const clouds = new CloudLayers(sky);
const letter = new Letter();
const backdrop = createBackdrop({ sky, clouds: clouds.clouds.texture, letter: letter.target.texture });
scene.add(backdrop.mesh);
const near = createNearLayers(sky, clouds.haze.texture);
scene.add(near.mesh);

const key = new THREE.DirectionalLight(0xffffff, 2);
const fill = new THREE.HemisphereLight(0xbfd7ff, 0xf3e0d0, 0.7);
const rim = new THREE.DirectionalLight(0xc8d9ff, 1.3);
rim.position.set(-2.5, 3, -5);
scene.add(key, fill, rim);

// ---------------------------------------------------------------- the keychain
const glassShared = createGlassShared();
const cast = createCast();
const setups: CharmSetup[] = cast.map((m) => {
  const stone = buildStone(
    { id: m.id, scale: m.scale, tint: m.tint, ground: m.ground, groundAmount: m.groundAmount, bezel: m.bezel, character: m.character, seat: m.seat, seatScale: m.seatScale },
    glassShared,
  );
  return {
    id: m.id,
    body: stone.body,
    picks: [stone.glass],
    hang: stone.hang,
    radius: stone.radius,
    size: stone.size,
    drop: m.drop,
    depth: m.depth,
    glass: stone.glass,
    character: stone.character,
    layer: stone.layer,
  };
});
const brassKey = buildKey(0.62);
const keyLayer = { value: 0.1 };
tagLayer(brassKey.body, keyLayer);
setups.push({ id: 'key', body: brassKey.body, picks: [brassKey.pick], hang: brassKey.hang, radius: brassKey.radius, size: brassKey.size, drop: 0.1, depth: -0.44, staysBack: true, layer: keyLayer });
const tag = buildTag(0.58);
const tagLayerU = { value: 0.4 };
tagLayer(tag.body, tagLayerU);
setups.push({ id: 'tag', body: tag.body, picks: [tag.pick], hang: tag.hang, radius: tag.radius, size: tag.size, drop: 0.27, depth: 0.24, layer: tagLayerU });
const keychain = new Keychain(setups, camera);
scene.add(keychain.group);
if (!reduceMotion) keychain.hideAbove();

// ---------------------------------------------------------------- city, weather, time
const cityById = (id: string | null) => CITIES.find((c) => c.id === id);
let city: City = cityById(query.get('city')) ?? cityById(DEFAULT_CITY) ?? CITIES[0];
const live = new Map<string, Conditions>();
const WEATHER_CHOICES: WeatherChoice[] = ['sunny', 'clear', 'cloudy', 'fog', 'rain', 'snow'];
const asWeather = (v: string | null) => (WEATHER_CHOICES.includes(v as WeatherChoice) ? (v as WeatherChoice) : null);
const SEASONS: Exclude<Season, null>[] = ['spring', 'summer', 'fall', 'winter'];
let chosenWeather: WeatherChoice | null = asWeather(query.get('weather'));
let chosenHour: number | null = query.has('hour') ? clamp(parseFloat(query.get('hour')!) || 0, 0, 23.99) : null;
let season: Season = SEASONS.includes(query.get('season') as Exclude<Season, null>) ? (query.get('season') as Season) : null;

const liveFor = (c: City) => {
  let w = live.get(c.id);
  if (!w) {
    w = placeholderConditions(c);
    live.set(c.id, w);
  }
  return w;
};
const conditionsNow = (): Conditions => ({ ...liveFor(city), ...(chosenWeather ? WEATHER_PRESETS[chosenWeather] : {}) });
const minuteNow = () => (chosenHour !== null ? chosenHour * 60 : localMinute(city.timeZone));

let skyTarget: SkyFrame = skyFor(minuteNow(), conditionsNow(), season);
const skyShown: SkyFrame = cloneSky(skyTarget);

async function checkWeather(c: City) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    live.set(c.id, await fetchConditions(c, ctrl.signal));
    clearTimeout(timer);
  } catch {
    /* keep the estimate; the time of day still shows */
  }
  applySky();
}

const timeText = (minute: number) => {
  const h = Math.floor(minute / 60) % 24;
  const m = Math.floor(minute % 60);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

const weatherLine = new WeatherLine({
  city: {
    options: () => CITIES.map((c) => [c.id, c.name]),
    current: () => city.id,
    pick: (id) => {
      city = cityById(id) ?? city;
      const w = liveFor(city);
      landmarkWanted = city.landmark;
      applySky();
      if (Date.now() - w.checkedAt > 15 * 60 * 1000) checkWeather(city);
    },
  },
  sky: {
    options: () => [
      [null, 'right now'],
      ['sunny', 'sunny'],
      ['cloudy', 'overcast'],
      ['fog', 'foggy'],
      ['rain', 'rain'],
      ['snow', 'snow'],
    ],
    current: () => chosenWeather,
    pick: (v) => {
      chosenWeather = asWeather(v);
      applySky();
    },
  },
  time: {
    options: () => {
      const w = liveFor(city);
      return [
        [null, 'right now'],
        [(w.sunrise - 8) / 60, 'dawn'],
        [12.5, 'midday'],
        [(w.sunset - 40) / 60, 'golden hour'],
        [(w.sunset + 14) / 60, 'dusk'],
        [22, 'night'],
      ];
    },
    current: () => chosenHour,
    pick: (v) => {
      chosenHour = v;
      applySky();
    },
  },
  season: {
    options: () => [[null, 'no season'], ...SEASONS.map((s) => [s, s] as [string, string])],
    current: () => season,
    pick: (v) => {
      season = (v as Season) ?? null;
      applySky();
    },
  },
});

function applySky() {
  skyTarget = skyFor(minuteNow(), conditionsNow(), season);
  const w = conditionsNow();
  const t = liveFor(city).temperatureC;
  weatherLine.write({
    city: city.name,
    temperature: t === null ? '' : city.unit === 'F' ? `${Math.round((t * 9) / 5 + 32)}°F` : `${Math.round(t)}°C`,
    sky: weatherWords(w.code, skyTarget.isDay),
    time: timeText(skyTarget.minute),
    season: season ?? 'season',
  });
}
applySky();
setInterval(applySky, 30 * 1000);
setInterval(() => checkWeather(city), 15 * 60 * 1000);

// ---------------------------------------------------------------- landmark crossfade
let landmarkWanted = city.landmark;
let landmarkShown = city.landmark;
backdrop.uniforms.uBridge.value = landmarkTexture(city.landmark);
backdrop.uniforms.uDeck.value = DECK_FROM_BOTTOM;
backdrop.uniforms.uLandmark.value = 1;
function crossfadeLandmark(dt: number) {
  const u = backdrop.uniforms.uLandmark;
  if (landmarkWanted !== landmarkShown) {
    u.value = Math.max(0, u.value - dt * 2.5);
    if (u.value === 0) {
      landmarkShown = landmarkWanted;
      backdrop.uniforms.uBridge.value = landmarkTexture(landmarkShown);
    }
  } else u.value = Math.min(1, u.value + dt * 2.5);
}

// ---------------------------------------------------------------- layout
let view: View = { width: 1, height: 1, aspect: 1, phone: false };
const LETTER_TEXT = { left: 230 / 1400, right: (230 + 36 * 24) / 1400 };
const FRAME_TAN = Math.tan(THREE.MathUtils.degToRad(15));

function layout() {
  const width = innerWidth;
  const height = innerHeight;
  view = { width, height, aspect: width / height, phone: width / height < 0.8 };
  renderer.setSize(view);
  camera.aspect = view.aspect;
  const d = view.phone ? Math.max(2.75 / (2 * FRAME_TAN * view.aspect), 3.6 / (2 * FRAME_TAN)) : Math.max(3.75 / (2 * FRAME_TAN * view.aspect), 3.95 / (2 * FRAME_TAN));
  const halfH = FRAME_TAN * d;
  camera.position.set(0, view.phone ? 1.26 - halfH * 0.16 : 0.36, d);
  camera.lookAt(camera.position.x, camera.position.y, 0);
  camera.updateProjectionMatrix();
  clouds.setSize(width * renderer.pixelRatio, height * renderer.pixelRatio);
  sky.uAspect.value = view.aspect;

  const letterAspect = letter.width / letter.height;
  const L = backdrop.uniforms.uLetterRect.value;
  if (view.phone) {
    const lw = 0.88 / (LETTER_TEXT.right - LETTER_TEXT.left);
    const lh = (lw * view.aspect) / letterAspect;
    L.set(0.06 - (LETTER_TEXT.left - 0.5) * lw, 1.012 - lh / 2, lw, lh);
    backdrop.uniforms.uFrost.value = 0;
  } else {
    let lh = 0.88;
    let lw = (lh * letterAspect) / view.aspect;
    const maxText = 0.3;
    if ((LETTER_TEXT.right - LETTER_TEXT.left) * lw > maxText) {
      lw = maxText / (LETTER_TEXT.right - LETTER_TEXT.left);
      lh = (lw * view.aspect) / letterAspect;
    }
    const textLeft = Math.max(0.04, 0.315 - (LETTER_TEXT.right - LETTER_TEXT.left) * lw);
    L.set(textLeft - (LETTER_TEXT.left - 0.5) * lw, 0.5, lw, lh);
    backdrop.uniforms.uFrost.value = 1;
  }
  const textCenter = L.x + ((LETTER_TEXT.left + LETTER_TEXT.right) / 2 - 0.5) * L.z;
  backdrop.uniforms.uFrostRect.value.set(textCenter, L.y, ((LETTER_TEXT.right - LETTER_TEXT.left) * L.z) / 2 + 0.03, L.w * 0.47);

  const bh = view.phone ? 0.32 : 0.58;
  backdrop.uniforms.uBridgeRect.value.set(view.phone ? 0.62 : 0.6, -0.03, (bh * (MASK_W / MASK_H)) / view.aspect, bh);

  const captionY = 1 - (L.y + (0.5 - letter.captionTop / letter.height) * L.w);
  const fontPx = (40 / letter.height) * L.w * height;
  const size = view.phone ? Math.max(13, fontPx * 1.25) : Math.max(11, fontPx);
  const left = (L.x + (LETTER_TEXT.left - 0.5) * L.z) * width;
  weatherLine.place(left, Math.min(captionY * height, height - size * 3.4 - 10), size, width - left - 16);
}
addEventListener('resize', layout);
layout();

// ---------------------------------------------------------------- applying the sky
const keyDir = new THREE.Vector3();
const themeMeta = document.getElementById('theme-color') as HTMLMetaElement;
let themeAt = -1;
function showSky(f: SkyFrame, now: number, dt: number) {
  sky.uCover.value = f.cover;
  sky.uFog.value = f.fog;
  sky.uRain.value = f.rain;
  sky.uLit.value.copy(f.cloudLit);
  sky.uShade.value.copy(f.cloudShade);
  sky.uHaze.value.copy(f.haze);
  sky.uHorizon.value.copy(f.horizon);
  sky.uSun.value.copy(f.sun);
  sky.uSunColor.value.copy(f.sunColor);
  const b = backdrop.uniforms;
  b.uTop.value.copy(f.top);
  b.uMid.value.copy(f.mid);
  b.uMoon.value.copy(f.moon);
  b.uStars.value = f.stars;
  b.uBridgeColor.value.copy(f.bridge);
  b.uSkyline.value.copy(f.skyline);
  b.uLights.value = f.lights;
  b.uInk.value.copy(f.ink);
  gl.toneMappingExposure = f.exposure;

  const night = f.sun.z < 0.05 && !f.isDay;
  const lamp = night ? f.moon : f.sun;
  keyDir.set((lamp.x - 0.5) * 4.2, 1.1 + lamp.y * 2.6, 3.6).normalize();
  key.position.copy(keyDir).multiplyScalar(10);
  key.color.copy(f.key);
  key.intensity = f.keyI;
  fill.color.copy(f.fill);
  fill.groundColor.copy(f.haze).multiplyScalar(0.75);
  fill.intensity = f.fillI + 0.12;
  rim.color.copy(f.rim);
  rim.intensity = f.rimI;
  softLight.uRimLight.value.copy(f.fill).multiplyScalar(0.55 + 0.45 * f.fillI).lerp(f.key, 0.25);
  glassShared.uMilk.value.copy(f.haze).lerp(f.cloudLit, 0.5).multiplyScalar(0.75 + 0.25 * f.studio);
  glassShared.uMilkAmount.value = 0.42 + 0.12 * f.fog;

  const built = environment.update(now, {
    top: f.top,
    horizon: f.horizon,
    ground: f.haze.clone().multiplyScalar(0.55),
    sunDir: keyDir,
    sunColor: f.key,
    sun: Math.max(f.sun.z, f.moon.z * 0.3),
    studio: f.studio,
  });
  if (built) scene.environment = environment.texture;

  weatherLine.colour(f.ink.getStyle());
  if (loading.present) loading.paint(f.top, f.mid, f.horizon, f.ink);
  if (now - themeAt > 1) {
    themeAt = now;
    themeMeta.content = `#${f.top.getHexString()}`;
    document.documentElement.style.backgroundColor = f.horizon.getStyle();
  }
  sky.uTime.value += dt * (reduceMotion ? 0 : conditionsNow().drift);
}

showSky(skyShown, 0, 0);

// ---------------------------------------------------------------- pointer
const ndc = new THREE.Vector2();
const toNdc = (e: PointerEvent) => ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
function letterPointer(e: PointerEvent | null) {
  if (!e) {
    letter.pointer = null;
    return;
  }
  const L = backdrop.uniforms.uLetterRect.value;
  const u = e.clientX / innerWidth;
  const v = 1 - e.clientY / innerHeight;
  const lx = (u - L.x) / L.z + 0.5;
  const ly = (v - L.y) / L.w + 0.5;
  letter.pointer = lx > -0.1 && lx < 1.1 && ly > -0.05 && ly < 1.05 ? letter.toLetter(lx, ly) : null;
}
canvas.addEventListener('pointerdown', (e) => {
  weatherLine.close();
  if (keychain.grab(toNdc(e))) {
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('holding');
  }
  letterPointer(e);
});
canvas.addEventListener('pointermove', (e) => {
  toNdc(e);
  if (keychain.holding) keychain.drag(ndc);
  else if (e.pointerType === 'mouse') keychain.hover(ndc);
  letterPointer(e);
});
const release = (e: PointerEvent) => {
  keychain.release();
  canvas.classList.remove('holding');
  if (e.pointerType !== 'mouse') {
    letterPointer(null);
    keychain.hover(null);
  }
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('pointerleave', () => {
  letterPointer(null);
  keychain.hover(null);
});

// ---------------------------------------------------------------- entering
const startedAt = performance.now();
const elapsed = () => (performance.now() - startedAt) / 1000;
let entered = false;
{
  const weatherReady = new Promise<void>((done) => {
    checkWeather(city).then(done);
    setTimeout(done, 4000);
  });
  const compiled = gl.compileAsync(scene, camera).catch(() => undefined);
  const waits: Promise<unknown>[] = [letter.loaded, weatherReady, compiled, document.fonts.ready];
  let settled = 0;
  waits.forEach((w) => w.finally(() => loading.progress(++settled / (waits.length + 1))));
  const timeout = new Promise((done) => setTimeout(done, 12000));
  Promise.all([Promise.race([Promise.allSettled(waits), timeout]), loading.typingDone]).then(async () => {
    loading.progress(1);
    await new Promise((r) => setTimeout(r, 200));
    const now = elapsed();
    keychain.startDrop(now + 0.35, reduceMotion);
    letter.start(now + (reduceMotion ? 0 : 1.2), reduceMotion);
    setTimeout(() => weatherLine.show(), reduceMotion ? 0 : 1500);
    entered = true;
    await loading.finish();
  });
}

// ---------------------------------------------------------------- the loop
let last = performance.now();
let simOffset = 0;
function advance(dt: number, now: number, draw: boolean) {
  const k = reduceMotion ? 1 : 1 - Math.exp(-2.4 * dt);
  easeSky(skyShown, skyTarget, k);
  showSky(skyShown, now, dt);
  crossfadeLandmark(dt);
  keychain.wind = 0.6 + Math.min(1.4, conditionsNow().wind / 18);
  keychain.update(dt, now);
  letter.update(gl, now, dt);
  if (!draw) return;
  clouds.render(gl);
  renderer.render(now);
}
function tick() {
  const nowMs = performance.now();
  const frameMs = nowMs - last;
  last = nowMs;
  advance(Math.min(frameMs / 1000, 0.05), elapsed() + simOffset, true);
  if (entered) renderer.adapt(frameMs, elapsed());
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

if (import.meta.env.DEV) {
  (window as unknown as { __keychain: unknown }).__keychain = {
    keychain,
    scene,
    camera,
    renderer,
    applySky,
    skyShown,
    /** runs the scene forward synchronously (for screenshots when the tab is throttled) */
    run(seconds: number) {
      const steps = Math.ceil(seconds * 60);
      for (let i = 0; i < steps; i++) {
        simOffset += 1 / 60;
        advance(1 / 60, elapsed() + simOffset, i === steps - 1);
      }
      return steps;
    },
  };
}
