import * as THREE from 'three';

/**
 * Runs after the OutputPass, so it works on display-referred colour: a soft pastel lift of the shadows,
 * a gentle vignette, film grain and dithering.
 */
export const finishShader = {
  name: 'FinishShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uLift: { value: new THREE.Color(0.018, 0.014, 0.03) },
    uVignette: { value: 0.12 },
    uGrain: { value: 0.028 },
    uWarmth: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uTime, uVignette, uGrain, uWarmth;
    uniform vec3 uLift;
    varying vec2 vUv;

    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      if (any(isnan(col))) col = vec3(0.0);
      col = clamp(col, 0.0, 1.0);
      col += uLift * (1.0 - col);
      col *= mix(vec3(1.0), vec3(1.03, 1.0, 0.95), uWarmth);

      vec2 q = vUv - 0.5;
      q.x *= uResolution.x / uResolution.y;
      float vig = smoothstep(1.05, 0.28, length(q));
      col *= mix(1.0 - uVignette, 1.0, vig);

      vec2 px = vUv * uResolution;
      float n = hash12(px + fract(uTime * 7.31) * 517.0) + hash12(px * 1.37 + fract(uTime * 3.17) * 211.0) - 1.0;
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col += n * uGrain * (0.55 + 0.45 * (1.0 - lum));
      col += (hash12(px + 0.5) - 0.5) / 255.0;

      gl_FragColor = vec4(col, 1.0);
    }`,
};
