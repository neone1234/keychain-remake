import * as THREE from 'three';
import { clayMap, fibreMap } from './textures';
import { markShared } from '../keychain/layers';

/** scene-wide light the soft materials use for their fuzzy rim (set from the sky every frame) */
export const softLight = { uRimLight: { value: new THREE.Color(1, 1, 1) } };

export interface Spot {
  at: THREE.Vector3;
  radius: number;
  color: THREE.ColorRepresentation;
  amount?: number;
  /** 0 hard edge .. 1 fully soft */
  soft?: number;
}

/** a sphere that darkens what faces it (cheap analytic ambient occlusion for crevices) */
export interface Occluder {
  at: THREE.Vector3;
  radius: number;
  strength?: number;
}

export interface SoftOptions {
  color: THREE.ColorRepresentation;
  occluders?: Occluder[];
  roughness?: number;
  sheen?: number;
  sheenRoughness?: number;
  sheenColor?: THREE.ColorRepresentation;
  clearcoat?: number;
  clearcoatRoughness?: number;
  /** detail normal map: 'fibre' for felt, 'clay' for vinyl, or none */
  detail?: 'fibre' | 'clay' | null;
  detailStrength?: number;
  detailScale?: number;
  /** how far light wraps past the terminator (0..1) */
  wrap?: number;
  /** colour the light picks up where it wraps round, like light through felt or soft vinyl */
  scatter?: THREE.ColorRepresentation;
  rim?: number;
  rimPower?: number;
  rimColor?: THREE.ColorRepresentation;
  spots?: Spot[];
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
}

const WRAP_FROM = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );';
const WRAP_TO = /* glsl */ `
  {
    float ndl = dot( geometryNormal, directLight.direction );
    float wrapped = saturate( ( ndl + uWrap ) / ( 1.0 + uWrap ) );
    vec3 scatterTint = mix( uScatter, vec3( 1.0 ), smoothstep( -0.1, 0.65, ndl ) );
    reflectedLight.directDiffuse += wrapped * directLight.color * scatterTint * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );
  }`;

let warned = false;
function wrapChunk() {
  const chunk = THREE.ShaderChunk.lights_physical_pars_fragment;
  if (!chunk.includes(WRAP_FROM)) {
    if (!warned) console.warn('soft materials: wrap lighting hook not found, using plain lighting');
    warned = true;
    return chunk;
  }
  return chunk.replace(WRAP_FROM, WRAP_TO);
}

const DETAIL_GLSL = /* glsl */ `
  vec3 triplanarDetail(vec3 p, vec3 n) {
    vec3 w = pow(abs(n), vec3(4.0));
    w /= (w.x + w.y + w.z + 1e-5);
    vec3 tx = texture2D(uDetail, p.zy * uDetailScale + vec2(0.31, 0.17)).xyz * 2.0 - 1.0;
    vec3 ty = texture2D(uDetail, p.xz * uDetailScale + vec2(0.73, 0.41)).xyz * 2.0 - 1.0;
    vec3 tz = texture2D(uDetail, p.xy * uDetailScale).xyz * 2.0 - 1.0;
    tx.xy *= uDetailStrength; ty.xy *= uDetailStrength; tz.xy *= uDetailStrength;
    tx = vec3(tx.xy + n.zy, abs(tx.z) * n.x);
    ty = vec3(ty.xy + n.xz, abs(ty.z) * n.y);
    tz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);
    return normalize(tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z);
  }`;

export interface SoftPatch {
  uniforms: Record<string, THREE.IUniform>;
  defines: Record<string, string | number>;
}

/** writes a loop out in full (some GPU compilers warn about loops that run once) */
const unroll = (n: number, body: (i: number) => string) => Array.from({ length: n }, (_, i) => body(i)).join('\n');

/** shared shader surgery for felt, plush, fur and vinyl: wrap lighting, scatter tint, fuzz rim, detail normals, painted spots */
export function patchSoft(shader: THREE.WebGLProgramParametersWithUniforms, patch: SoftPatch, extra?: { vertexHead?: string; vertexBody?: string; fragmentHead?: string; fragmentStart?: string; afterColor?: string }) {
  Object.assign(shader.uniforms, patch.uniforms, softLight);
  const defines = Object.entries(patch.defines)
    .map(([k, v]) => `#define ${k} ${v}`)
    .join('\n');
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${defines}\nvarying vec3 vObjPos;\nvarying vec3 vObjNormal;\n${extra?.vertexHead ?? ''}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>\nvObjPos = position;\nvObjNormal = objectNormal;\n${extra?.vertexBody ?? ''}`);
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      /* glsl */ `#include <common>
      ${defines}
      varying vec3 vObjPos;
      varying vec3 vObjNormal;
      uniform float uWrap, uRim, uRimPower;
      uniform vec3 uScatter, uRimColor, uRimLight;
      #ifdef USE_DETAIL
        uniform sampler2D uDetail;
        uniform float uDetailScale, uDetailStrength;
        uniform mat3 normalMatrix;
        ${DETAIL_GLSL}
      #endif
      #if SPOTS > 0
        uniform vec4 uSpotPos[SPOTS];
        uniform vec4 uSpotCol[SPOTS];
        uniform float uSpotSoft[SPOTS];
      #endif
      #if OCCLUDERS > 0
        uniform vec4 uOccPos[OCCLUDERS];
        uniform float uOccStrength[OCCLUDERS];
      #endif
      ${extra?.fragmentHead ?? ''}`,
    )
    .replace('#include <lights_physical_pars_fragment>', wrapChunk())
    .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${extra?.fragmentStart ?? ''}`)
    .replace(
      '#include <color_fragment>',
      /* glsl */ `#include <color_fragment>
      ${unroll(
        Number(patch.defines.SPOTS),
        (i) => `{
          float d = distance(vObjPos, uSpotPos[${i}].xyz);
          float k = 1.0 - smoothstep(uSpotPos[${i}].w * (1.0 - uSpotSoft[${i}]), uSpotPos[${i}].w, d);
          diffuseColor.rgb = mix(diffuseColor.rgb, uSpotCol[${i}].rgb, k * uSpotCol[${i}].a);
        }`,
      )}
      ${extra?.afterColor ?? ''}
      #if OCCLUDERS > 0
        {
          vec3 on = normalize(vObjNormal);
          float ao = 1.0;
          ${unroll(
            Number(patch.defines.OCCLUDERS),
            (i) => `{
            vec3 d = uOccPos[${i}].xyz - vObjPos;
            float dist = max(length(d), 1e-3);
            float r = uOccPos[${i}].w;
            ao *= 1.0 - uOccStrength[${i}] * clamp(dot(on, d / dist), 0.0, 1.0) * clamp((r * r) / (dist * dist), 0.0, 1.0);
          }`,
          )}
          ao = clamp(ao, 0.0, 1.0);
          float l = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
          diffuseColor.rgb = mix(vec3(l), diffuseColor.rgb, 1.0 + 0.35 * (1.0 - ao)) * mix(0.42, 1.0, ao);
        }
      #endif`,
    )
    .replace(
      '#include <normal_fragment_maps>',
      /* glsl */ `#include <normal_fragment_maps>
      #ifdef USE_DETAIL
        normal = normalize(normalMatrix * triplanarDetail(vObjPos, normalize(vObjNormal)));
      #endif`,
    )
    .replace(
      '#include <clearcoat_normal_fragment_begin>',
      /* glsl */ `#include <clearcoat_normal_fragment_begin>
      #if defined(USE_CLEARCOAT) && defined(USE_DETAIL)
        clearcoatNormal = normal;
      #endif`,
    )
    .replace(
      '#include <opaque_fragment>',
      /* glsl */ `{
        float fres = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
        outgoingLight += uRimColor * uRimLight * pow(fres, uRimPower) * uRim;
      }
      #include <opaque_fragment>`,
    );
}

export function softMaterial(o: SoftOptions): THREE.MeshPhysicalMaterial {
  const color = new THREE.Color(o.color);
  const m = new THREE.MeshPhysicalMaterial({
    color,
    roughness: o.roughness ?? 0.9,
    metalness: 0,
    sheen: o.sheen ?? 0,
    sheenRoughness: o.sheenRoughness ?? 0.5,
    sheenColor: new THREE.Color(o.sheenColor ?? color.clone().lerp(new THREE.Color(1, 1, 1), 0.35)),
    clearcoat: o.clearcoat ?? 0,
    clearcoatRoughness: o.clearcoatRoughness ?? 0.3,
    emissive: new THREE.Color(o.emissive ?? 0x000000),
    emissiveIntensity: o.emissiveIntensity ?? 1,
  });
  const detail = o.detail === undefined ? null : o.detail;
  const patch = softPatch(o, color, detail);
  m.onBeforeCompile = (shader) => patchSoft(shader, patch);
  m.customProgramCacheKey = () => `soft-${patch.defines.SPOTS}-${patch.defines.OCCLUDERS}-${detail ?? 'none'}`;
  m.userData.patch = patch;
  return m;
}

function softPatch(o: Partial<SoftOptions>, color: THREE.Color, detail: 'fibre' | 'clay' | null): SoftPatch {
  const spots = o.spots ?? [];
  const occ = o.occluders ?? [];
  return {
    uniforms: {
      uWrap: { value: o.wrap ?? 0.4 },
      uScatter: { value: new THREE.Color(o.scatter ?? color.clone().multiplyScalar(0.8)) },
      uRim: { value: o.rim ?? 0.3 },
      uRimPower: { value: o.rimPower ?? 2.6 },
      uRimColor: { value: new THREE.Color(o.rimColor ?? color.clone().lerp(new THREE.Color(1, 1, 1), 0.5)) },
      uDetail: { value: detail === 'fibre' ? fibreMap() : detail === 'clay' ? clayMap() : null },
      uDetailScale: { value: o.detailScale ?? 1.6 },
      uDetailStrength: { value: o.detailStrength ?? 0.5 },
      uSpotPos: { value: spots.map((s) => new THREE.Vector4(s.at.x, s.at.y, s.at.z, s.radius)) },
      uSpotCol: { value: spots.map((s) => { const c = new THREE.Color(s.color); return new THREE.Vector4(c.r, c.g, c.b, s.amount ?? 1); }) },
      uSpotSoft: { value: spots.map((s) => s.soft ?? 0.5) },
      uOccPos: { value: occ.map((s) => new THREE.Vector4(s.at.x, s.at.y, s.at.z, s.radius)) },
      uOccStrength: { value: occ.map((s) => s.strength ?? 0.6) },
    },
    defines: { SPOTS: spots.length, OCCLUDERS: occ.length, ...(detail ? { USE_DETAIL: 1 } : {}) },
  };
}

export interface FuzzOptions {
  length?: number;
  shells?: number;
  density?: number;
  /** places (in the body's space) kept bare, so eyes and stitched mouths stay crisp */
  clear?: { at: THREE.Vector3; radius: number }[];
}

/**
 * Peach fuzz for felt and plush: a few short shells over a body, cut into fine fibres with a 3D hash so it works
 * on any shape. Opaque (discard), so the glass sees it. Copies the body's colour, spots and occluders.
 */
export function addFuzz(body: THREE.Mesh, o: SoftOptions, fuzz: FuzzOptions = {}) {
  const shells = fuzz.shells ?? 5;
  const color = new THREE.Color(o.color);
  const m = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 1,
    sheen: 0.6,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(o.sheenColor ?? color.clone().lerp(new THREE.Color(1, 1, 1), 0.45)),
  });
  const patch = softPatch({ ...o, rim: (o.rim ?? 0.3) * 1.15, wrap: Math.min(1, (o.wrap ?? 0.5) + 0.1) }, color, null);
  const clear = fuzz.clear ?? [];
  patch.uniforms.uFuzzLength = { value: fuzz.length ?? 0.016 };
  patch.uniforms.uFuzzDensity = { value: fuzz.density ?? 95 };
  patch.uniforms.uClear = { value: clear.map((c) => new THREE.Vector4(c.at.x, c.at.y, c.at.z, c.radius)) };
  patch.defines.CLEAR = clear.length;
  m.onBeforeCompile = (shader) =>
    patchSoft(shader, patch, {
      vertexHead: 'attribute float aShell;\nuniform float uFuzzLength;\nvarying float vShell;',
      vertexBody: 'transformed += normalize(objectNormal) * (0.0015 + aShell * uFuzzLength);\nvShell = aShell;',
      fragmentHead: /* glsl */ `
        uniform float uFuzzDensity;
        varying float vShell;
        #if CLEAR > 0
          uniform vec4 uClear[CLEAR];
        #endif
        float fuzzHash(vec3 p) {
          p = fract(p * 0.3183099 + 0.1);
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }`,
      fragmentStart: /* glsl */ `
        {
          vec3 q = vObjPos * uFuzzDensity;
          float h = max(fuzzHash(floor(q)), fuzzHash(floor(q * 0.77 + 13.1)));
          float keep = 0.38 + 0.56 * vShell;
          ${unroll(clear.length, (i) => `keep += 1.0 - smoothstep(uClear[${i}].w * 0.75, uClear[${i}].w, distance(vObjPos, uClear[${i}].xyz));`)}
          if (h < keep) discard;
        }`,
      afterColor: 'diffuseColor.rgb *= mix(0.86, 1.08, vShell);',
    });
  m.customProgramCacheKey = () => `fuzz-${patch.defines.SPOTS}-${patch.defines.OCCLUDERS}-${clear.length}`;
  const geometry = body.geometry.clone();
  const shell = new Float32Array(shells);
  for (let i = 0; i < shells; i++) shell[i] = (i + 1) / shells;
  geometry.setAttribute('aShell', new THREE.InstancedBufferAttribute(shell, 1));
  const mesh = new THREE.InstancedMesh(geometry, m, shells);
  const identity = new THREE.Matrix4();
  for (let i = 0; i < shells; i++) mesh.setMatrixAt(i, identity);
  mesh.frustumCulled = false;
  body.add(mesh);
  return mesh;
}

export const felt = (color: THREE.ColorRepresentation, o: Partial<SoftOptions> = {}) =>
  softMaterial({
    color,
    roughness: 0.96,
    sheen: 0.7,
    sheenRoughness: 0.45,
    detail: 'fibre',
    detailStrength: 0.42,
    detailScale: 2.4,
    wrap: 0.55,
    rim: 0.28,
    rimPower: 2.2,
    ...o,
  });

export const vinyl = (color: THREE.ColorRepresentation, o: Partial<SoftOptions> = {}) =>
  softMaterial({
    color,
    roughness: 0.42,
    sheen: 0.25,
    sheenRoughness: 0.3,
    clearcoat: 0.5,
    clearcoatRoughness: 0.32,
    detail: 'clay',
    detailStrength: 0.22,
    detailScale: 1.1,
    wrap: 0.3,
    rim: 0.14,
    rimPower: 3,
    ...o,
  });

/** glossy black for eyes: dark body, small crisp highlights */
export const eyeMaterial = new THREE.MeshPhysicalMaterial({
  color: '#0c0a10',
  roughness: 0.1,
  metalness: 0,
  specularIntensity: 0.5,
  envMapIntensity: 0.55,
});

export const sparkleMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.2) });

export const mouthMaterial = new THREE.MeshPhysicalMaterial({ color: '#33201f', roughness: 0.5, specularIntensity: 0.4, envMapIntensity: 0.5 });

markShared(eyeMaterial, sparkleMaterial, mouthMaterial);

export interface FurOptions {
  color: THREE.ColorRepresentation;
  root: THREE.ColorRepresentation;
  tip?: THREE.ColorRepresentation;
  length: number;
  density: number;
  /** direction (object space) and cosine where the fur is short, so a face shows */
  face?: THREE.Vector4;
  wrap?: number;
  rim?: number;
}

/** shell-textured fur: opaque strands cut with discard, so the glass can see them */
export function furMaterial(o: FurOptions) {
  const color = new THREE.Color(o.color);
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.92,
    sheen: 1,
    sheenRoughness: 0.55,
    sheenColor: color.clone().lerp(new THREE.Color(1, 1, 1), 0.55),
  });
  const uniforms = {
    uFurLength: { value: o.length },
    uFurForce: { value: new THREE.Vector3(0, -0.25, 0) },
    uFurDensity: { value: o.density },
    uFurFace: { value: o.face ?? new THREE.Vector4(0, 0, 1, 2) },
    uFurColor: { value: color },
    uFurRoot: { value: new THREE.Color(o.root) },
    uFurTip: { value: new THREE.Color(o.tip ?? color.clone().lerp(new THREE.Color(1, 1, 1), 0.25)) },
  };
  const patch: SoftPatch = {
    uniforms: {
      ...uniforms,
      uWrap: { value: o.wrap ?? 0.6 },
      uScatter: { value: color.clone().multiplyScalar(0.85) },
      uRim: { value: o.rim ?? 0.45 },
      uRimPower: { value: 2.0 },
      uRimColor: { value: color.clone().lerp(new THREE.Color(1, 1, 1), 0.5) },
      uSpotPos: { value: [] },
      uSpotCol: { value: [] },
      uSpotSoft: { value: [] },
    },
    defines: { SPOTS: 0, OCCLUDERS: 0 },
  };
  m.onBeforeCompile = (shader) =>
    patchSoft(shader, patch, {
      vertexHead: /* glsl */ `
        attribute float aShell;
        uniform float uFurLength;
        uniform vec3 uFurForce;
        uniform vec4 uFurFace;
        varying float vShell;
        varying vec3 vFurBase;
        varying vec2 vFurUv;`,
      vertexBody: /* glsl */ `
        {
          vec3 baseN = normalize(objectNormal);
          float faceDot = dot(normalize(position), uFurFace.xyz);
          float shortFur = smoothstep(uFurFace.w - 0.1, uFurFace.w + 0.04, faceDot);
          float len = uFurLength * mix(1.0, 0.22, shortFur);
          transformed += baseN * (aShell * len) + uFurForce * (aShell * aShell) * len;
          vShell = aShell;
          vFurBase = baseN;
          vFurUv = uv;
        }`,
      fragmentHead: /* glsl */ `
        uniform float uFurDensity;
        uniform vec3 uFurColor, uFurRoot, uFurTip;
        varying float vShell;
        varying vec3 vFurBase;
        varying vec2 vFurUv;
        float furHash(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }
        float furStrand(vec2 st, float t, float seed) {
          vec2 cell = floor(st);
          vec2 f = fract(st);
          float h1 = furHash(cell + seed);
          float h2 = furHash(cell + seed + 17.3);
          float h3 = furHash(cell + seed + 41.7);
          vec2 c = vec2(h1, h2) * 0.56 + 0.22;
          float len = 0.55 + 0.45 * h3;
          if (t > len) return 0.0;
          float r = 0.52 * (1.0 - t / len) + 0.05;
          return step(length(f - c), r);
        }`,
      fragmentStart: /* glsl */ `
        if (vShell > 0.001) {
          vec3 an = abs(vFurBase);
          float face = an.x > an.y && an.x > an.z ? (vFurBase.x > 0.0 ? 0.0 : 1.0) : an.y > an.z ? (vFurBase.y > 0.0 ? 2.0 : 3.0) : (vFurBase.z > 0.0 ? 4.0 : 5.0);
          vec2 st = vFurUv * uFurDensity;
          float cover = max(furStrand(st, vShell, face * 7.13), furStrand(st * 1.37 + 0.41, vShell, face * 3.71 + 19.0));
          cover = max(cover, furStrand(st * 0.83 + 0.13, vShell * 1.08, face * 5.3 + 47.0));
          if (cover < 0.5) discard;
        }`,
      afterColor: /* glsl */ `
        {
          float t = smoothstep(0.0, 0.95, vShell);
          diffuseColor.rgb = mix(uFurRoot, uFurColor, smoothstep(0.0, 0.55, t));
          diffuseColor.rgb = mix(diffuseColor.rgb, uFurTip, smoothstep(0.6, 1.0, t) * 0.6);
        }`,
    });
  m.customProgramCacheKey = () => 'fur-shells';
  return { material: m, uniforms };
}
