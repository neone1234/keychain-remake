import * as THREE from 'three';

/**
 * A small studio made from the current sky, prefiltered for reflections: a dome in the sky's colours,
 * two big soft boxes for the glossy product-shot highlights and a warm panel where the sun is.
 * Rebuilt (throttled) whenever the light changes noticeably.
 */
export class SkyEnvironment {
  private pmrem: THREE.PMREMGenerator;
  private scene = new THREE.Scene();
  private dome: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private sun: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private boxes: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private target: THREE.WebGLRenderTarget | null = null;
  private builtAt = -Infinity;
  private signature = '';

  constructor(renderer: THREE.WebGLRenderer) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(10, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          uTop: { value: new THREE.Color() },
          uHorizon: { value: new THREE.Color() },
          uGround: { value: new THREE.Color() },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uTop, uHorizon, uGround;
          varying vec3 vDir;
          void main() {
            float y = vDir.y;
            vec3 c = y > 0.0 ? mix(uHorizon, uTop, pow(y, 0.6)) : mix(uHorizon, uGround, pow(-y, 0.5));
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    );
    this.scene.add(this.dome);

    const box = (w: number, h: number, pos: THREE.Vector3) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
      m.position.copy(pos);
      m.lookAt(0, 0, 0);
      this.scene.add(m);
      this.boxes.push(m);
      return m;
    };
    box(5.5, 3.6, new THREE.Vector3(-4.6, 4.6, 5.2));
    box(2.4, 6.5, new THREE.Vector3(6.8, 1.0, 2.6));
    box(9, 1.6, new THREE.Vector3(0, 7.6, -1.5));
    box(3, 2, new THREE.Vector3(-6.5, -1.5, 3));
    this.sun = new THREE.Mesh(new THREE.CircleGeometry(1.5, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    this.scene.add(this.sun);
  }

  get texture() {
    return this.target?.texture ?? null;
  }

  update(
    now: number,
    opts: { top: THREE.Color; horizon: THREE.Color; ground: THREE.Color; sunDir: THREE.Vector3; sunColor: THREE.Color; sun: number; studio: number },
    force = false,
  ) {
    const sig = [opts.top.getHex(), opts.horizon.getHex(), opts.sunColor.getHex(), Math.round(opts.sun * 40), Math.round(opts.studio * 40), Math.round(opts.sunDir.x * 20), Math.round(opts.sunDir.y * 20)].join(',');
    if (!force && (sig === this.signature || now - this.builtAt < 0.6)) return false;
    this.signature = sig;
    this.builtAt = now;

    const u = this.dome.material.uniforms;
    const grey = (c: THREE.Color, k: number) => {
      const l = c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
      return c.clone().lerp(new THREE.Color(l, l, l), 0.6).multiplyScalar(k);
    };
    u.uTop.value.copy(grey(opts.top, 0.45));
    u.uHorizon.value.copy(grey(opts.horizon, 0.5));
    u.uGround.value.copy(grey(opts.ground, 0.35));
    const studio = opts.studio;
    this.boxes[0].material.color.setScalar(3.4 * studio);
    this.boxes[1].material.color.copy(opts.horizon).lerp(new THREE.Color(1, 1, 1), 0.75).multiplyScalar(1.7 * studio);
    this.boxes[2].material.color.copy(opts.top).lerp(new THREE.Color(1, 1, 1), 0.75).multiplyScalar(1.9 * studio);
    this.boxes[3].material.color.copy(opts.horizon).lerp(new THREE.Color(1, 1, 1), 0.5).multiplyScalar(0.9 * studio);
    this.sun.position.copy(opts.sunDir).normalize().multiplyScalar(8);
    this.sun.lookAt(0, 0, 0);
    this.sun.material.color.copy(opts.sunColor).multiplyScalar(1.3 * opts.sun);
    this.sun.visible = opts.sun > 0.01;

    const next = this.pmrem.fromScene(this.scene, 0.035, 0.1, 50);
    this.target?.dispose();
    this.target = next;
    return true;
  }

  dispose() {
    this.target?.dispose();
    this.pmrem.dispose();
  }
}
