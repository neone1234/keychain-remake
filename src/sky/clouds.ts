import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { NOISE_GLSL } from './glsl';

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/** clouds and the near haze are soft, so they are worked out at a third of the screen's size */
const DETAIL = 1 / 3;

export interface SkyUniforms {
  uTime: { value: number };
  uAspect: { value: number };
  uCover: { value: number };
  uFog: { value: number };
  uRain: { value: number };
  uLit: { value: THREE.Color };
  uShade: { value: THREE.Color };
  uHaze: { value: THREE.Color };
  uHorizon: { value: THREE.Color };
  uSun: { value: THREE.Vector3 };
  uSunColor: { value: THREE.Color };
}

export function createSkyUniforms(): SkyUniforms {
  return {
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uCover: { value: 0.3 },
    uFog: { value: 0 },
    uRain: { value: 0 },
    uLit: { value: new THREE.Color(1, 1, 1) },
    uShade: { value: new THREE.Color(0.7, 0.75, 0.85) },
    uHaze: { value: new THREE.Color(0.95, 0.95, 1) },
    uHorizon: { value: new THREE.Color(0.8, 0.9, 0.95) },
    uSun: { value: new THREE.Vector3(0.8, 0.6, 1) },
    uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
  };
}

export class CloudLayers {
  readonly clouds = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    depthBuffer: false,
  });
  readonly haze = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  private cloudQuad: FullScreenQuad;
  private hazeQuad: FullScreenQuad;

  constructor(uniforms: SkyUniforms) {
    const material = (body: string) =>
      new THREE.ShaderMaterial({
        uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
        vertexShader: VERT,
        fragmentShader: /* glsl */ `
          uniform float uTime, uAspect, uCover, uFog, uRain;
          uniform vec3 uLit, uShade, uHaze, uHorizon, uSunColor, uSun;
          varying vec2 vUv;
          ${NOISE_GLSL}
          vec4 over(vec4 below, vec3 c, float a) { return vec4(c * a, a) + below * (1.0 - a); }
          ${body}`,
        depthTest: false,
        depthWrite: false,
      });

    this.cloudQuad = new FullScreenQuad(
      material(/* glsl */ `
        void main() {
          vec2 p = vec2(vUv.x * uAspect, vUv.y);
          vec4 acc = vec4(0.0);

          float bankFrom = mix(0.63, 0.38, uCover);
          float bank = billow(p * vec2(1.7, 4.2) + vec2(0.0, 3.0), uTime * 0.004);
          acc = over(acc, mix(uLit, uHorizon, 0.5), smoothstep(bankFrom, bankFrom + 0.26, bank) * (1.0 - smoothstep(0.06, 0.42, vUv.y)) * 0.75);

          float heave = (fbm3(p * vec2(1.3, 2.4) + vec2(uTime * 0.018, 0.0)) - 0.5) * 0.24;
          acc = over(acc, uHaze, uFog * (1.0 - smoothstep(0.02, 0.36, vUv.y + heave)) * 0.94);

          vec2 mp = p * 1.45 + vec2(0.0, 0.7);
          float d = billow(mp, uTime * 0.01);
          float above = billow(mp + vec2(0.0, 0.045), uTime * 0.01);
          float lit = clamp((d - above) * 6.0 + 0.5, 0.0, 1.0);
          vec3 c = mix(uShade, uLit, lit);
          float toSun = exp(-length((vUv - uSun.xy) * vec2(uAspect, 1.0)) * 3.2) * uSun.z;
          c += uSunColor * toSun * 0.3 * (1.0 - lit * 0.5);
          float midFrom = mix(0.67, 0.34, uCover);
          acc = over(acc, c, smoothstep(midFrom, midFrom + 0.24, d) * smoothstep(0.05, 0.38, vUv.y) * 0.92);

          float highFrom = mix(0.64, 0.5, uCover);
          float streak = billow(p * vec2(0.7, 5.5) + vec2(4.0, 0.0), uTime * 0.016);
          acc = over(acc, uLit, smoothstep(highFrom, highFrom + 0.27, streak) * smoothstep(0.52, 0.95, vUv.y) * 0.42);

          float veil = smoothstep(0.72, 1.0, uCover) * 0.5 * smoothstep(0.08, 0.6, vUv.y);
          acc = over(acc, mix(uShade, uLit, 0.45 + 0.3 * fbm3(p * 0.8 + uTime * 0.01)), veil);

          gl_FragColor = acc;
        }`),
    );

    this.hazeQuad = new FullScreenQuad(
      material(/* glsl */ `
        void main() {
          vec2 p = vec2(vUv.x * uAspect, vUv.y);
          float n = fbm3(p * 1.15 + vec2(uTime * 0.028, uTime * 0.004));
          float low = 1.0 - smoothstep(0.0, 0.33 + 0.12 * uFog, vUv.y);
          float corners = 0.55 * smoothstep(0.7, 1.0, vUv.y) * (1.0 - smoothstep(0.0, 0.3, min(vUv.x, 1.0 - vUv.x)));
          float a = clamp(smoothstep(0.3, 0.76, n) * (low + corners) * (0.7 + 0.22 * uFog) + uFog * 0.12 + uRain * 0.05, 0.0, 1.0);
          gl_FragColor = vec4(uHaze * a, a);
        }`),
    );
  }

  setSize(pixelWidth: number, pixelHeight: number) {
    const w = Math.max(2, Math.ceil(pixelWidth * DETAIL));
    const h = Math.max(2, Math.ceil(pixelHeight * DETAIL));
    this.clouds.setSize(w, h);
    this.haze.setSize(w, h);
  }

  render(renderer: THREE.WebGLRenderer) {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.clouds);
    this.cloudQuad.render(renderer);
    renderer.setRenderTarget(this.haze);
    this.hazeQuad.render(renderer);
    renderer.setRenderTarget(prev);
  }
}
