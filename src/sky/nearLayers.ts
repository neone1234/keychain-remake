import * as THREE from 'three';
import { NOISE_GLSL } from './glsl';
import type { SkyUniforms } from './clouds';

/** the drifting haze and close rain in front of the keychain (screen-space, drawn last) */
export function createNearLayers(sky: SkyUniforms, haze: THREE.Texture) {
  const material = new THREE.ShaderMaterial({
    uniforms: { ...sky, uHazeTex: { value: haze }, uHazeAmount: { value: 0.85 } },
    transparent: true,
    premultipliedAlpha: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    depthTest: false,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uHazeTex;
      uniform float uTime, uAspect, uRain, uHazeAmount;
      uniform vec3 uHaze;
      varying vec2 vUv;
      ${NOISE_GLSL}
      float streaks(vec2 uv, float scale, float speed, float len, float density, float seed) {
        vec2 p = uv * vec2(uAspect, 1.0) * scale;
        p.x += p.y * 0.16;
        p.y += uTime * speed;
        vec2 q = vec2(p.x, p.y / len);
        vec2 cell = floor(q), f = fract(q);
        if (hash21(cell + seed) > density) return 0.0;
        float x = abs(f.x - 0.5 - (hash21(cell + seed + 1.3) - 0.5) * 0.7);
        return (1.0 - smoothstep(0.02, 0.06, x)) * smoothstep(0.0, 0.8, f.y) * (1.0 - smoothstep(0.92, 1.0, f.y));
      }
      void main() {
        vec4 hz = texture2D(uHazeTex, vUv) * uHazeAmount;
        if (uRain > 0.0) {
          float r = (streaks(vUv, 26.0, 2.6, 6.0, 0.14, 13.0) * 0.2 + streaks(vUv, 40.0, 2.1, 6.0, 0.16, 21.0) * 0.16) * uRain;
          vec3 c = mix(uHaze, vec3(1.0), 0.45);
          hz = vec4(c * r, r) + hz * (1.0 - r);
        }
        gl_FragColor = hz;
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1000;
  return { mesh, uniforms: material.uniforms };
}
