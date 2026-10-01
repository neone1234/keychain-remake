import * as THREE from 'three';
import { LETTER, LETTER_COLUMNS } from '../content';
import { rng } from '../util/math';

const W = 1400;
const LEFT = 230;
const TOP = 170;
const LINE = 52;
const TYPE_PX = 40;
const PEN_PX = 74;
const TYPE_FONT = `400 ${TYPE_PX}px "Courier Prime", "Courier New", monospace`;
const PEN_FONT = `400 ${PEN_PX}px "Homemade Apple", "Segoe Script", cursive`;
const PAD = 5;

interface Line {
  text: string;
  x: number;
  baseline: number;
}

interface Word {
  home: THREE.Vector4;
  typedBefore: number;
  /** 0 for typed words, n for the n-th handwritten line */
  pen: number;
  offset: THREE.Vector2;
  speed: THREE.Vector2;
  tilt: number;
}

const TYPING = { perSecond: 95, lineEnd: 2.5, blank: 9 };

function wrap(text: string, columns: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (!line) line = word;
    else if (line.length + 1 + word.length <= columns) line += ' ' + word;
    else {
      out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  return out;
}

function dateText() {
  if (LETTER.date !== 'today') return LETTER.date;
  return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export class Letter {
  readonly target: THREE.WebGLRenderTarget;
  readonly width = W;
  readonly height: number;
  private canvas = document.createElement('canvas');
  private texture: THREE.CanvasTexture;
  private lines: Line[] = [];
  private words: Word[] = [];
  private tiles!: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private uniforms = { uText: { value: null as THREE.Texture | null }, uTyped: { value: 0 }, uSigned: { value: 0 }, uAdvance: { value: 24 } };
  private typedTotal = 0;
  private dirty = true;
  private ready = false;
  private startedAt: number | null = null;
  private signLines = 0;
  private signTop = 0;
  /** where the weather caption goes, in letter pixels */
  captionTop = 0;
  pointer: THREE.Vector2 | null = null;
  readonly loaded: Promise<void>;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private z = new THREE.Vector3(0, 0, 1);
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor() {
    const date = dateText();
    const rows: { text: string; pen?: boolean }[] = [];
    for (const a of LETTER.address) rows.push({ text: a });
    rows.push({ text: '' }, { text: LETTER.greeting }, { text: '' });
    LETTER.paragraphs.forEach((para, i) => {
      for (const l of wrap(para, LETTER_COLUMNS)) rows.push({ text: l });
      if (i < LETTER.paragraphs.length - 1) rows.push({ text: '' });
    });
    const firstRow = TOP + 128;
    this.lines.push({ text: date, x: -1, baseline: TOP });
    rows.forEach((r, i) => this.lines.push({ text: r.text, x: LEFT, baseline: firstRow + i * LINE }));
    this.signTop = firstRow + (rows.length + 1.6) * LINE;
    this.signLines = 2;
    this.captionTop = this.signTop + 110 * 2 + 40;
    this.height = Math.ceil(this.captionTop + 40);
    this.canvas.width = W;
    this.canvas.height = this.height;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.premultiplyAlpha = true;
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
    this.uniforms.uText.value = this.texture;

    this.target = new THREE.WebGLRenderTarget(W, this.height, {
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      depthBuffer: false,
    });
    this.target.texture.anisotropy = 8;
    this.camera = new THREE.OrthographicCamera(0, W, 0, -this.height, -1, 1);

    const timeout = new Promise<void>((done) => setTimeout(done, 3500));
    this.loaded = Promise.race([Promise.allSettled([document.fonts.load(TYPE_FONT), document.fonts.load(PEN_FONT)]), timeout]).then(() => this.draw());
  }

  private draw() {
    const x = this.canvas.getContext('2d')!;
    x.clearRect(0, 0, W, this.height);
    x.fillStyle = '#ffffff';
    x.textBaseline = 'alphabetic';
    x.font = TYPE_FONT;
    const advance = x.measureText('M').width;
    this.uniforms.uAdvance.value = advance;
    const date = this.lines[0];
    date.x = LEFT + (LETTER_COLUMNS - date.text.length) * advance;

    const random = rng(7);
    x.filter = 'blur(0.4px)';
    let typed = 0;
    for (const line of this.lines) {
      [...line.text].forEach((ch, i) => {
        x.globalAlpha = 0.74 + random() * 0.26;
        const cx = line.x + i * advance + (random() - 0.5) * 1.3;
        const cy = line.baseline + (random() - 0.5) * 1.8;
        x.fillText(ch, cx, cy);
        x.globalAlpha *= 0.55;
        x.fillText(ch, cx + 0.8, cy + 0.3);
      });
      for (const m of line.text.matchAll(/\S+/g)) {
        this.words.push({
          home: new THREE.Vector4(line.x + (m.index ?? 0) * advance - PAD, line.baseline - TYPE_PX * 0.92, m[0].length * advance + PAD * 2, TYPE_PX * 1.32),
          typedBefore: typed + (m.index ?? 0),
          pen: 0,
          offset: new THREE.Vector2(),
          speed: new THREE.Vector2(),
          tilt: 0,
        });
      }
      typed += line.text.length + (line.text ? TYPING.lineEnd : TYPING.blank);
    }
    this.typedTotal = typed;

    x.globalAlpha = 1;
    x.filter = 'blur(0.3px)';
    x.font = PEN_FONT;
    const pen = [LETTER.signOff, LETTER.signature];
    pen.forEach((text, i) => {
      const left = LEFT + 30 + i * 140;
      const base = this.signTop + i * 110;
      const width = x.measureText(text).width;
      x.save();
      x.translate(left, base);
      x.rotate(-0.055);
      x.fillText(text, 0, 0);
      x.restore();
      this.words.push({
        home: new THREE.Vector4(left - 20, base - PEN_PX * 1.25 - width * 0.06, width + 50, PEN_PX * 1.9 + width * 0.06),
        typedBefore: 0,
        pen: i + 1,
        offset: new THREE.Vector2(),
        speed: new THREE.Vector2(),
        tilt: 0,
      });
    });
    x.filter = 'none';
    this.texture.needsUpdate = true;
    this.buildTiles();
    this.ready = true;
    this.dirty = true;
  }

  private buildTiles() {
    const n = this.words.length;
    const geometry = new THREE.PlaneGeometry(1, 1);
    const home = new Float32Array(n * 4);
    const reveal = new Float32Array(n * 2);
    this.words.forEach((w, i) => {
      home.set(w.home.toArray(), i * 4);
      reveal.set([w.typedBefore, w.pen], i * 2);
    });
    geometry.setAttribute('aHome', new THREE.InstancedBufferAttribute(home, 4));
    geometry.setAttribute('aReveal', new THREE.InstancedBufferAttribute(reveal, 2));
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      premultipliedAlpha: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      depthTest: false,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec4 aHome;
        attribute vec2 aReveal;
        varying vec2 vPx;
        varying vec4 vHome;
        varying vec2 vReveal;
        void main() {
          vHome = aHome;
          vReveal = aReveal;
          vPx = vec2(aHome.x + uv.x * aHome.z, aHome.y + (1.0 - uv.y) * aHome.w);
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uText;
        uniform float uTyped, uSigned, uAdvance;
        varying vec2 vPx;
        varying vec4 vHome;
        varying vec2 vReveal;
        void main() {
          vec4 t = texture2D(uText, vec2(vPx.x / ${W}.0, 1.0 - vPx.y / ${this.height}.0));
          float shown;
          if (vReveal.y < 0.5) {
            float ch = floor((vPx.x - vHome.x - ${PAD}.0) / uAdvance);
            shown = step(vReveal.x + ch + 1.0, uTyped);
          } else {
            float progress = clamp(uSigned - (vReveal.y - 1.0), 0.0, 1.0);
            shown = smoothstep(0.0, 36.0, vHome.x + vHome.z * progress - vPx.x);
          }
          gl_FragColor = t * shown;
        }`,
    });
    this.tiles = new THREE.InstancedMesh(geometry, material, n);
    this.tiles.frustumCulled = false;
    this.scene.add(this.tiles);
  }

  start(now: number, instant = false) {
    this.startedAt = instant ? now - 1000 : now;
    this.dirty = true;
  }

  get started() {
    return this.startedAt !== null;
  }

  /** letter pixels for a point given as a fraction of the letter's rectangle (0..1, y up) */
  toLetter(lx: number, ly: number) {
    return new THREE.Vector2(lx * W, (1 - ly) * this.height);
  }

  update(renderer: THREE.WebGLRenderer, now: number, dt: number) {
    if (!this.ready) return;
    let moving = this.dirty;
    if (this.startedAt !== null) {
      const seconds = now - this.startedAt;
      const typed = seconds * TYPING.perSecond;
      const signed = Math.max(0, (seconds - this.typedTotal / TYPING.perSecond - 0.4) / 0.85);
      if (this.uniforms.uTyped.value < this.typedTotal + 1 || this.uniforms.uSigned.value < this.signLines + 0.2) moving = true;
      this.uniforms.uTyped.value = Math.min(typed, this.typedTotal + 2);
      this.uniforms.uSigned.value = Math.min(signed, this.signLines + 0.5);
    }
    const reach = 210;
    this.words.forEach((w, i) => {
      const [x, y, width, height] = w.home.toArray();
      if (this.pointer) {
        const dx = x + width / 2 + w.offset.x - this.pointer.x;
        const dy = y + height / 2 + w.offset.y - this.pointer.y;
        const d = Math.hypot(dx, dy);
        if (d < reach) {
          const push = 5400 * (1 - d / reach) ** 2 * dt;
          w.speed.x += (dx / (d || 1)) * push;
          w.speed.y += (dy / (d || 1)) * push * 0.75;
        }
      }
      w.speed.addScaledVector(w.offset, -24 * dt).multiplyScalar(Math.exp(-7.5 * dt));
      w.offset.addScaledVector(w.speed, dt);
      w.tilt += (w.offset.x * 0.0022 + w.speed.y * 0.0004 - w.tilt) * (1 - Math.exp(-10 * dt));
      if (w.offset.lengthSq() + w.speed.lengthSq() > 0.02) moving = true;
      else {
        w.offset.set(0, 0);
        w.speed.set(0, 0);
        w.tilt = 0;
      }
      this.p.set(x + width / 2 + w.offset.x, -(y + height / 2 + w.offset.y), 0);
      this.q.setFromAxisAngle(this.z, -w.tilt);
      this.s.set(width, height, 1);
      this.tiles.setMatrixAt(i, this.m4.compose(this.p, this.q, this.s));
    });
    if (!moving) return;
    this.dirty = false;
    this.tiles.instanceMatrix.needsUpdate = true;
    const prev = renderer.getRenderTarget();
    const clearAlpha = renderer.getClearAlpha();
    const clearColor = renderer.getClearColor(new THREE.Color());
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(prev);
    renderer.setClearColor(clearColor, clearAlpha);
  }

  get typingDone() {
    return this.uniforms.uSigned.value >= this.signLines;
  }
}
