import * as THREE from 'three';
import { NOISE_GLSL } from './glsl';
import type { SkyUniforms } from './clouds';

export interface BackdropInputs {
  sky: SkyUniforms;
  clouds: THREE.Texture;
  letter: THREE.Texture;
}

/**
 * Everything behind the keychain in one opaque full-screen draw, so the glass refracts all of it: the sky, the
 * sun or moon and stars, the clouds, the landmark, the letter and far rain.
 */
export function createBackdrop({ sky, clouds, letter }: BackdropInputs) {
  const uniforms = {
    ...sky,
    uTop: { value: new THREE.Color() },
    uMid: { value: new THREE.Color() },
    uMoon: { value: new THREE.Vector3() },
    uMoonPhase: { value: 0.5 },
    uStars: { value: 0 },
    uClouds: { value: clouds },
    uBridge: { value: null as THREE.Texture | null },
    uBridgeRect: { value: new THREE.Vector4(0.6, -0.03, 1.3, 0.58) },
    uBridgeColor: { value: new THREE.Color() },
    uSkyline: { value: new THREE.Color() },
    uLights: { value: 0 },
    uLandmark: { value: 0 },
    uLetter: { value: letter },
    uLetterRect: { value: new THREE.Vector4(0.2, 0.5, 0.3, 0.9) },
    uFrostRect: { value: new THREE.Vector4(0.2, 0.5, 0.2, 0.45) },
    uFrost: { value: 1 },
    uInk: { value: new THREE.Color() },
    uDeck: { value: 0.135 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    depthTest: false,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = position.xy * 0.5 + 0.5;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uAspect, uCover, uFog, uRain, uStars, uLights, uLandmark, uFrost, uMoonPhase, uDeck;
      uniform vec3 uTop, uMid, uHorizon, uLit, uShade, uHaze, uSun, uSunColor, uMoon, uBridgeColor, uSkyline, uInk;
      uniform vec4 uBridgeRect, uLetterRect, uFrostRect;
      uniform sampler2D uClouds, uBridge, uLetter;
      varying vec2 vUv;
      ${NOISE_GLSL}

      float segment(vec2 p, vec2 a, vec2 b) {
        vec2 pa = p - a, ba = b - a;
        return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
      }

      float rainLayer(vec2 uv, float scale, float speed, float len, float density, float seed) {
        vec2 p = uv * vec2(uAspect, 1.0) * scale;
        p.x += p.y * 0.16;
        p.y += uTime * speed;
        vec2 q = vec2(p.x, p.y / len);
        vec2 cell = floor(q), f = fract(q);
        if (hash21(cell + seed) > density) return 0.0;
        float x = abs(f.x - 0.5 - (hash21(cell + seed + 1.3) - 0.5) * 0.7);
        return (1.0 - smoothstep(0.03, 0.07, x)) * smoothstep(0.0, 0.7, f.y) * (1.0 - smoothstep(0.9, 1.0, f.y)) * (0.4 + 0.6 * hash21(cell + seed + 4.1));
      }

      void main() {
        vec2 uv = vUv;
        float y = uv.y;

        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.56, y));
        col = mix(col, uTop, smoothstep(0.46, 1.08, y));
        float sunSide = exp(-abs(uv.x - uSun.x) * 2.0) * (1.0 - smoothstep(0.0, 0.62, y));
        col = mix(col, uHorizon * 1.06 + uSunColor * 0.05, sunSide * 0.32 * clamp(uSun.z + 0.35, 0.0, 1.0));
        float corners = smoothstep(0.55, 1.0, y) * smoothstep(0.18, 0.5, abs(uv.x - 0.5));
        col *= 1.0 - 0.16 * corners;

        vec2 fq = (uv - uFrostRect.xy) / uFrostRect.zw;
        float frost = 1.0 - smoothstep(0.72, 1.38, pow(pow(abs(fq.x), 4.0) + pow(abs(fq.y), 4.0), 0.25));
        frost = frost * frost * (3.0 - 2.0 * frost) * uFrost;

        vec2 sp = uv * vec2(uAspect, 1.0) * 190.0;
        vec2 cell = floor(sp);
        float h = hash21(cell);
        vec2 jitter = vec2(hash21(cell + 3.1), hash21(cell + 5.7)) - 0.5;
        float star = step(0.9968, h) * (1.0 - smoothstep(0.0, 0.28, length(fract(sp) - 0.5 - jitter * 0.4)));
        star *= 0.55 + 0.45 * sin(uTime * (0.8 + 2.2 * hash21(cell + 9.2)) + h * 60.0);
        col += vec3(0.86, 0.9, 1.0) * star * uStars * 1.4 * smoothstep(0.22, 0.7, y) * (1.0 - frost);

        vec2 toSun = (uv - uSun.xy) * vec2(uAspect, 1.0);
        float ds = length(toSun);
        col += uSunColor * uSun.z * ((1.0 - smoothstep(0.027, 0.032, ds)) * 1.7 + exp(-ds * 11.0) * 0.42 + exp(-ds * 3.2) * 0.15);

        vec2 mq = (uv - uMoon.xy) * vec2(uAspect, 1.0) / 0.02;
        float dm = length(mq);
        if (uMoon.z > 0.001) {
          float disc = 1.0 - smoothstep(0.92, 1.05, dm);
          float tx = sqrt(max(0.0, 1.0 - mq.y * mq.y));
          float side = uMoonPhase < 0.5 ? mq.x : -mq.x;
          float lit = smoothstep(-0.08, 0.08, side - tx * cos(6.2832 * uMoonPhase));
          float maria = 0.9 + 0.1 * vnoise(mq * 2.5 + 3.0);
          col += vec3(0.96, 0.94, 0.86) * disc * (lit * maria * 1.25 + 0.05) * uMoon.z;
          col += vec3(0.55, 0.65, 0.9) * exp(-dm * 0.28) * 0.1 * uMoon.z;
        }

        float dayBirds = uSun.z * (1.0 - uLights) * (1.0 - uRain);
        if (dayBirds > 0.01) {
          for (int i = 0; i < 3; i++) {
            float n = float(i);
            vec2 at = vec2(fract(0.31 + n * 0.29 + uTime * (0.009 + n * 0.003)) * 1.4 - 0.2, 0.64 + n * 0.08 + sin(uTime * 0.35 + n * 2.0) * 0.02);
            vec2 q = (uv - at) * vec2(uAspect, 1.0) / (0.0095 - n * 0.0018);
            float flap = 0.2 + 0.45 * sin(uTime * (4.5 + n) + n * 3.0);
            float wings = min(segment(q, vec2(0.0), vec2(-1.0, flap)), segment(q, vec2(0.0), vec2(1.0, flap)));
            col = mix(col, mix(vec3(0.14, 0.15, 0.2), col, 0.4), (1.0 - smoothstep(0.07, 0.17, wings)) * dayBirds * (1.0 - frost));
          }
        }

        vec2 g = vec2((uv.x - uBridgeRect.x) / uBridgeRect.z + 0.5, (uv.y - uBridgeRect.y) / uBridgeRect.w);
        vec4 m = textureLod(uBridge, clamp(g, 0.0, 1.0), frost * 4.0);
        float inside = step(0.0, g.x) * step(g.x, 1.0) * step(0.0, g.y) * step(g.y, 1.0);
        float a = m.a * inside * uLandmark;
        if (a > 0.001) {
          float near = smoothstep(0.55, 0.95, m.r);
          float hill = 1.0 - smoothstep(0.2, 0.35, m.r);
          vec3 structure = mix(uSkyline * (1.0 - 0.2 * m.b), uBridgeColor * (1.0 - 0.36 * m.b), near);
          float fade = mix(0.55, 0.2, near);
          fade = mix(fade, 0.78, hill);
          fade = mix(fade, 0.93, uFog * (1.0 - 0.25 * near));
          fade = mix(fade, 0.7, uRain * 0.6);
          col = mix(col, mix(structure, col, fade), a);
          float beacon = step(0.75, m.g);
          vec3 lamp = mix(vec3(1.0, 0.74, 0.42), vec3(1.0, 0.16, 0.1), beacon);
          col += lamp * m.g * a * uLights * mix(0.7, 1.7, near) * (1.0 - uFog * 0.6);

          float deckV = (g.y - uDeck) / 0.018;
          if (deckV > 0.0 && deckV < 1.0 && near > 0.5) {
            float lane = step(0.5, deckV);
            float way = lane > 0.5 ? -1.0 : 1.0;
            float along = g.x * 90.0 - uTime * 0.35 * way + lane * 13.7;
            float slot = floor(along);
            float u = (fract(along) - 0.15) / (0.35 + 0.2 * hash21(vec2(slot, 7.0 + lane)));
            if (u > 0.0 && u < 1.0 && hash21(vec2(slot, lane)) > 0.5) {
              float pick = hash21(vec2(slot, 3.0 + lane));
              vec3 paint = pick < 0.3 ? vec3(0.92) : pick < 0.5 ? vec3(0.55, 0.58, 0.62) : pick < 0.7 ? vec3(0.12) : pick < 0.85 ? vec3(0.7, 0.14, 0.12) : vec3(0.16, 0.3, 0.6);
              vec3 car = mix(paint, col, 0.35) * (1.0 - 0.85 * uLights);
              float front = way > 0.0 ? u : 1.0 - u;
              car += (step(0.8, front) * vec3(1.0, 0.92, 0.75) + step(front, 0.15) * vec3(1.0, 0.12, 0.08)) * uLights * 2.2;
              col = mix(col, car, (1.0 - frost) * (1.0 - uFog * 0.7) * uLandmark);
            }
          }
        }

        vec4 cl = textureLod(uClouds, uv, frost * 3.2);
        col = col * (1.0 - cl.a) + cl.rgb;

        float inkLight = dot(uInk, vec3(0.3, 0.59, 0.11));
        col = mix(col, inkLight < 0.5 ? mix(col, uHaze, 0.22) : col * 0.8, frost * 0.9);

        if (uRain > 0.0) {
          float falling = rainLayer(uv, 120.0, 1.2, 9.0, 0.22, 0.0) * 0.22 + rainLayer(uv, 70.0, 1.7, 7.0, 0.18, 7.0) * 0.3;
          col = mix(col, mix(uHaze, vec3(1.0), 0.35), falling * uRain * (1.0 - frost * 0.9));
        }

        vec2 l = (uv - uLetterRect.xy) / uLetterRect.zw + 0.5;
        float onLetter = step(0.0, l.x) * step(l.x, 1.0) * step(0.0, l.y) * step(l.y, 1.0);
        float ink = texture2D(uLetter, clamp(l, 0.0, 1.0)).a * onLetter;
        col = mix(col, uInk, ink * 0.88);

        gl_FragColor = vec4(col, 1.0);
      }`,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  return { mesh, uniforms };
}

export type Backdrop = ReturnType<typeof createBackdrop>;
