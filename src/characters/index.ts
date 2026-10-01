import * as THREE from 'three';
import type { Character } from './types';
import { createMochi } from './mochi';
import { createPom } from './pom';
import { createNimbus } from './nimbus';
import { createTako } from './tako';
import { createShroom } from './shroom';

export interface CastMember {
  id: string;
  character: Character;
  /** glass tint near the rim */
  tint: string;
  bezel: string | null;
  scale: number;
  drop: number;
  depth: number;
  seat?: THREE.Vector3;
  seatScale?: number;
}

export function createCast(): CastMember[] {
  return [
    { id: 'mochi', character: createMochi(), tint: '#ffb9ad', bezel: null, scale: 0.6, drop: 0.3, depth: 0.3, seat: new THREE.Vector3(0, -0.1, 0.02), seatScale: 1.05 },
    { id: 'pom', character: createPom(), tint: '#ffe485', bezel: '#bcaaf0', scale: 0.62, drop: 0.62, depth: 0.46, seat: new THREE.Vector3(0, -0.05, 0.0), seatScale: 1.0 },
    { id: 'nimbus', character: createNimbus(), tint: '#c4dcff', bezel: null, scale: 0.6, drop: 0.44, depth: 0.04, seat: new THREE.Vector3(0, -0.02, 0.0), seatScale: 1.0 },
    { id: 'tako', character: createTako(), tint: '#ffb4a3', bezel: '#a5dcc8', scale: 0.58, drop: 0.16, depth: -0.3, seat: new THREE.Vector3(0, 0.02, 0.0), seatScale: 1.0 },
    { id: 'shroom', character: createShroom(), tint: '#ffd3b6', bezel: null, scale: 0.6, drop: 0.5, depth: 0.18, seat: new THREE.Vector3(0, 0.02, 0.0), seatScale: 0.98 },
  ];
}
