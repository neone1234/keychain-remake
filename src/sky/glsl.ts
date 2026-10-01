export const NOISE_GLSL = /* glsl */ `
  float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = r * p * 2.02 + vec2(3.1, 1.7); a *= 0.5; }
    return v;
  }
  float fbm3(vec2 p) {
    float v = 0.0, a = 0.5;
    mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 3; i++) { v += a * vnoise(p); p = r * p * 2.03 + vec2(1.3, 7.1); a *= 0.5; }
    return v;
  }
  // billowing cloud density: fbm warped by a slower fbm so edges curl
  float billow(vec2 p, float t) {
    vec2 q = p + vec2(t, 0.0);
    vec2 w = vec2(fbm3(q * 0.55 + vec2(0.0, t * 0.3)), fbm3(q * 0.55 + vec2(5.2, 1.3)));
    return fbm(q + 0.85 * w);
  }
`;
