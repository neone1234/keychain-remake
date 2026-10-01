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
  /** soft pastel colour behind the character */
  ground: string;
  groundAmount?: number;
  bezel: string | null;
  scale: number;
  drop: number;
  depth: number;
  seat?: THREE.Vector3;
  seatScale?: number;
}

export function createCast(): CastMember[] {
  return [
    { id: 'mochi', character: createMochi(), tint: '#ffb9ad', ground: '#c5ead8', bezel: null, scale: 0.65, drop: 0.3, depth: 0.3, seat: new THREE.Vector3(0, -0.12, 0.06), seatScale: 1.14 },
    { id: 'pom', character: createPom(), tint: '#ffe485', ground: '#d9cffc', bezel: '#a993ec', scale: 0.66, drop: 0.62, depth: 0.46, seat: new THREE.Vector3(0, -0.06, 0.04), seatScale: 1.1 },
    { id: 'nimbus', character: createNimbus(), tint: '#c4dcff', ground: '#9fc9f5', bezel: null, scale: 0.64, drop: 0.44, depth: 0.04, seat: new THREE.Vector3(0, -0.04, 0.05), seatScale: 1.08 },
    { id: 'tako', character: createTako(), tint: '#ffb4a3', ground: '#bfe8de', bezel: '#7fcdb5', scale: 0.62, drop: 0.16, depth: -0.3, seat: new THREE.Vector3(0, 0.0, 0.05), seatScale: 1.12 },
    { id: 'shroom', character: createShroom(), tint: '#ffd3b6', ground: '#fbe3b8', bezel: '#f2a48d', scale: 0.64, drop: 0.5, depth: 0.18, seat: new THREE.Vector3(0, 0.02, 0.05), seatScale: 1.06 },
  ];
}
