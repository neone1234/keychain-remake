import type * as THREE from 'three';

export interface CharacterFrame {
  time: number;
  dt: number;
  /** pointer direction from the character, in its own space (x right, y up), length 0..1 */
  look: THREE.Vector2;
  /** 0 calm .. 1 being shaken hard */
  shake: number;
  /** the stone's acceleration in the character's space (for fur and wobble) */
  accel: THREE.Vector3;
  /** gravity direction in the character's space */
  down: THREE.Vector3;
}

export interface Character {
  name: string;
  root: THREE.Group;
  update(f: CharacterFrame): void;
}
