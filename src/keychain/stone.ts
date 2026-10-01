import * as THREE from 'three';
import type { Character } from '../characters/types';
import { markShared, tagLayer, type LayerUniform } from './layers';

/** egg proportions, in egg units (the egg is about 1.8 wide and 2.24 tall) */
export const EGG = { x: 0.9, y: 1.12, z: 0.53, taper: 0.12 };

let eggGeometry: THREE.BufferGeometry | null = null;
export function getEggGeometry() {
  if (eggGeometry) return eggGeometry;
  const g = new THREE.SphereGeometry(1, 112, 84);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = 1 - EGG.taper * v.y;
    p.setXYZ(i, v.x * EGG.x * t, v.y * EGG.y, v.z * EGG.z * t);
  }
  g.computeVertexNormals();
  eggGeometry = g;
  return g;
}

export interface GlassShared {
  /** the light the glass's milky rim and the pastel grounds take from the sky */
  uMilk: { value: THREE.Color };
  uMilkAmount: { value: number };
}

export function createGlassShared(): GlassShared {
  return { uMilk: { value: new THREE.Color(0.95, 0.95, 1) }, uMilkAmount: { value: 0.5 } };
}

function glassMaterial(shared: GlassShared, tint: THREE.Color, ground: THREE.Color, groundAmount: number, bezel: THREE.Color | null, layer: LayerUniform) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transmission: 1,
    roughness: 0.045,
    thickness: 0.42,
    ior: 1.45,
    attenuationColor: new THREE.Color('#f0f3ff'),
    attenuationDistance: 2.2,
    iridescence: 0.55,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [140, 440],
    sheen: 0.2,
    sheenRoughness: 0.35,
    sheenColor: new THREE.Color('#fff0f8'),
    clearcoat: 0.8,
    clearcoatRoughness: 0.05,
    specularIntensity: 0.85,
    envMapIntensity: 1.0,
  });
  const uniforms = {
    uTint: { value: tint },
    uGround: { value: ground },
    uGroundAmount: { value: groundAmount },
    uBezel: { value: bezel ?? new THREE.Color(1, 1, 1) },
    uBezelAmount: { value: bezel ? 1 : 0 },
  };
  const hook = 'material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );';
  if (!THREE.ShaderChunk.transmission_fragment.includes(hook)) console.warn('stone glass: ground hook not found');
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, { uMilk: shared.uMilk, uMilkAmount: shared.uMilkAmount, uLayer: layer });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEgg;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEgg = position;');
    const transmission = THREE.ShaderChunk.transmission_fragment.replace(
      hook,
      /* glsl */ `
        {
          vec3 ray = getVolumeTransmissionRay( n, v, material.thickness, material.ior, modelMatrix );
          vec4 ndcPos = projectionMatrix * viewMatrix * vec4( pos + ray, 1.0 );
          vec2 rc = ( ndcPos.xy / ndcPos.w ) * 0.5 + 0.5;
          float seen = textureLod( transmissionSamplerMap, rc, 0.0 ).a;
          float behind = 1.0 - smoothstep( uLayer - 0.035, uLayer - 0.012, seen );
          vec2 e = vEgg.xy / vec2( ${EGG.x.toFixed(3)}, ${EGG.y.toFixed(3)} );
          float r = length( vec2( e.x, e.y * 0.94 + 0.04 ) );
          float mask = ( 1.0 - smoothstep( 0.2, 1.04, r ) ) * uGroundAmount;
          vec3 groundCol = uGround * uMilk * ( 1.0 + 0.1 * e.y - 0.12 * r * r );
          transmitted.rgb = mix( transmitted.rgb, groundCol, behind * mask );
        }
        material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );`,
    );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uMilk, uTint, uGround, uBezel;\nuniform float uMilkAmount, uGroundAmount, uLayer, uBezelAmount;\nvarying vec3 vEgg;')
      .replace('#include <transmission_fragment>', transmission)
      .replace(
        '#include <lights_fragment_end>',
        /* glsl */ `#include <lights_fragment_end>
        reflectedLight.directSpecular *= 0.3;
        #ifdef USE_CLEARCOAT
          clearcoatSpecularDirect *= 0.3;
        #endif
        #ifdef USE_SHEEN
          sheenSpecularDirect *= 0.5;
        #endif`,
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
        {
          vec3 toEye = normalize( vViewPosition );
          float facing = saturate( dot( normal, toEye ) );
          float rim = pow( 1.0 - facing, 2.6 );
          outgoingLight = mix( outgoingLight, uMilk, saturate( rim * uMilkAmount ) );
          outgoingLight += uTint * uMilk * ( 0.02 + 0.2 * rim ) * uMilkAmount;
          float band = smoothstep( 0.78, 0.9, 1.0 - facing ) * ( 1.0 - smoothstep( 0.975, 1.0, 1.0 - facing ) );
          outgoingLight = mix( outgoingLight, uBezel * ( uMilk * 0.95 + 0.08 ), band * uBezelAmount * 0.9 );
        }
        #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => 'stone-glass-ground';
  return m;
}

export interface StoneSpec {
  id: string;
  /** world size of the egg */
  scale: number;
  /** pastel tint the glass picks up near its rim */
  tint: string;
  /** soft pastel colour behind the character */
  ground: string;
  groundAmount?: number;
  /** colour of a thin enamel rim, or null */
  bezel: string | null;
  character: Character;
  /** where the character sits inside, in egg units */
  seat?: THREE.Vector3;
  seatScale?: number;
}

export interface BuiltStone {
  body: THREE.Group;
  glass: THREE.Mesh;
  hang: number;
  radius: number;
  size: THREE.Vector3;
  character: Character;
  layer: LayerUniform;
}

export const chromeMaterial = new THREE.MeshStandardMaterial({ color: 0xe6e8ee, metalness: 1, roughness: 0.18 });
markShared(chromeMaterial);

export function buildStone(spec: StoneSpec, shared: GlassShared): BuiltStone {
  const s = spec.scale;
  const layer: LayerUniform = { value: 0.5 };
  const body = new THREE.Group();
  const inner = new THREE.Group();
  inner.scale.setScalar(s);
  body.add(inner);

  const contents = new THREE.Group();
  inner.add(contents);

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.12, 0.09, 32, 1), chromeMaterial);
  cap.position.y = EGG.y - 0.005;
  const capTop = new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), chromeMaterial);
  capTop.position.y = EGG.y + 0.04;
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 12, 40), chromeMaterial);
  loop.position.y = EGG.y + 0.16;
  contents.add(cap, capTop, loop);

  const seat = new THREE.Group();
  seat.position.copy(spec.seat ?? new THREE.Vector3(0, -0.06, 0));
  seat.scale.setScalar(spec.seatScale ?? 1);
  seat.add(spec.character.root);
  contents.add(seat);
  tagLayer(contents, layer);

  const glass = new THREE.Mesh(
    getEggGeometry(),
    glassMaterial(shared, new THREE.Color(spec.tint), new THREE.Color(spec.ground), spec.groundAmount ?? 0.9, spec.bezel ? new THREE.Color(spec.bezel) : null, layer),
  );
  inner.add(glass);

  const hang = (EGG.y + 0.23) * s;
  inner.position.y = -hang;
  return {
    body,
    glass,
    hang,
    radius: 0.86 * EGG.x * s,
    size: new THREE.Vector3(EGG.x * s, EGG.y * s, EGG.z * s),
    character: spec.character,
    layer,
  };
}
