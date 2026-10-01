import * as THREE from 'three';
import type { Character } from '../characters/types';

/** egg proportions, in egg units (the egg is about 1.8 wide and 2.24 tall) */
export const EGG = { x: 0.9, y: 1.12, z: 0.53, taper: 0.12 };

export function eggPoint(theta: number, phi: number, out = new THREE.Vector3()) {
  const sx = Math.sin(phi) * Math.cos(theta);
  const sy = Math.cos(phi);
  const sz = Math.sin(phi) * Math.sin(theta);
  const t = 1 - EGG.taper * sy;
  return out.set(sx * EGG.x * t, sy * EGG.y, sz * EGG.z * t);
}

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

/** the egg's outline seen from the front, for the bezel */
function outlineCurve(scale = 1) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 128; i++) {
    const a = (i / 128) * Math.PI * 2;
    const y = Math.sin(a);
    const t = 1 - EGG.taper * y;
    pts.push(new THREE.Vector3(Math.cos(a) * EGG.x * t * scale, y * EGG.y * scale, 0));
  }
  return new THREE.CatmullRomCurve3(pts, true, 'centripetal');
}

export interface GlassShared {
  uMilk: { value: THREE.Color };
  uMilkAmount: { value: number };
}

export function createGlassShared(): GlassShared {
  return { uMilk: { value: new THREE.Color(0.95, 0.95, 1) }, uMilkAmount: { value: 0.5 } };
}

function glassMaterial(shared: GlassShared, tint: THREE.Color) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transmission: 1,
    roughness: 0.05,
    thickness: 0.32,
    ior: 1.45,
    attenuationColor: new THREE.Color('#eef2ff'),
    attenuationDistance: 1.6,
    iridescence: 0.55,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [120, 420],
    sheen: 0.35,
    sheenRoughness: 0.35,
    sheenColor: new THREE.Color('#fff0f8'),
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    specularIntensity: 1,
    envMapIntensity: 1.1,
  });
  const uTint = { value: tint };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uMilk = shared.uMilk;
    shader.uniforms.uMilkAmount = shared.uMilkAmount;
    shader.uniforms.uTint = uTint;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uMilk, uTint;\nuniform float uMilkAmount;')
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
        {
          vec3 toEye = normalize(vViewPosition);
          float facing = saturate(dot(normal, toEye));
          float rim = pow(1.0 - facing, 2.4);
          outgoingLight = mix(outgoingLight, uMilk, saturate(rim * uMilkAmount + 0.04 * uMilkAmount));
          outgoingLight += uTint * uMilk * (0.035 + 0.22 * rim) * uMilkAmount;
        }
        #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => 'stone-glass';
  return m;
}

export interface StoneSpec {
  id: string;
  /** world size of the egg */
  scale: number;
  /** pastel tint the glass picks up near its rim */
  tint: string;
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
}

const metal = new THREE.MeshStandardMaterial({ color: 0xe4e6ec, metalness: 1, roughness: 0.2 });
export const chromeMaterial = metal;

export function buildStone(spec: StoneSpec, shared: GlassShared): BuiltStone {
  const s = spec.scale;
  const body = new THREE.Group();
  const inner = new THREE.Group();
  inner.scale.setScalar(s);
  body.add(inner);

  const glass = new THREE.Mesh(getEggGeometry(), glassMaterial(shared, new THREE.Color(spec.tint)));
  inner.add(glass);

  if (spec.bezel) {
    const bezel = new THREE.Mesh(
      new THREE.TubeGeometry(outlineCurve(1.0), 256, 0.026, 10, true),
      new THREE.MeshPhysicalMaterial({ color: spec.bezel, roughness: 0.32, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.12 }),
    );
    inner.add(bezel);
  }

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.12, 0.09, 32, 1), metal);
  cap.position.y = EGG.y - 0.005;
  const capTop = new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), metal);
  capTop.position.y = EGG.y + 0.04;
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 12, 40), metal);
  loop.position.y = EGG.y + 0.16;
  inner.add(cap, capTop, loop);

  const seat = new THREE.Group();
  seat.position.copy(spec.seat ?? new THREE.Vector3(0, -0.06, 0));
  seat.scale.setScalar(spec.seatScale ?? 1);
  seat.add(spec.character.root);
  inner.add(seat);

  const hang = (EGG.y + 0.23) * s;
  inner.position.y = -hang;
  return {
    body,
    glass,
    hang,
    radius: 0.86 * EGG.x * s,
    size: new THREE.Vector3(EGG.x * s, EGG.y * s, EGG.z * s),
    character: spec.character,
  };
}
