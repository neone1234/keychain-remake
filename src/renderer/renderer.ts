import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { finishShader } from './finishPass';

export interface View {
  width: number;
  height: number;
  aspect: number;
  phone: boolean;
}

const query = new URLSearchParams(location.search);
const MAX_DPR = 2;

export class SceneRenderer {
  readonly gl: THREE.WebGLRenderer;
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  readonly finish: ShaderPass;
  private dpr: number;
  private dprCap: number;
  private frameTimes: number[] = [];
  private judgedAt = 0;
  private lastSize = new THREE.Vector2();

  constructor(canvas: HTMLCanvasElement, scene: THREE.Scene, camera: THREE.Camera) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
    this.dprCap = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    if (query.has('dpr')) this.dprCap = Math.min(MAX_DPR, Math.max(0.5, parseFloat(query.get('dpr')!)));
    this.dpr = this.dprCap;
    this.gl.setPixelRatio(this.dpr);
    const tone = query.get('tone');
    this.gl.toneMapping = tone === 'agx' ? THREE.AgXToneMapping : tone === 'neutral' ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.05;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;

    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: this.samplesFor(this.dpr) });
    this.composer = new EffectComposer(this.gl, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.24, 0.45, 1.05);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.finish = new ShaderPass(finishShader);
    this.composer.addPass(this.finish);
  }

  private samplesFor(dpr: number) {
    return dpr >= 1.75 ? 0 : 4;
  }

  get pixelRatio() {
    return this.dpr;
  }

  setSize(view: View) {
    this.lastSize.set(view.width, view.height);
    this.gl.setPixelRatio(this.dpr);
    this.gl.setSize(view.width, view.height, false);
    this.composer.setPixelRatio(this.dpr);
    this.composer.setSize(view.width, view.height);
    const w = Math.round(view.width * this.dpr);
    const h = Math.round(view.height * this.dpr);
    this.bloom.resolution.set(w, h);
    (this.finish.uniforms.uResolution.value as THREE.Vector2).set(w, h);
  }

  private setDpr(dpr: number) {
    if (Math.abs(dpr - this.dpr) < 0.01) return;
    this.dpr = dpr;
    const samples = this.samplesFor(dpr);
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      if (rt.samples !== samples) {
        rt.samples = samples;
        rt.dispose();
      }
    }
    this.setSize({ width: this.lastSize.x, height: this.lastSize.y, aspect: 1, phone: false });
  }

  /** drops resolution when frames are slow, and slowly climbs back when there is headroom */
  adapt(frameMs: number, now: number) {
    if (query.has('dpr')) return;
    this.frameTimes.push(frameMs);
    if (this.frameTimes.length > 90) this.frameTimes.shift();
    if (now - this.judgedAt < 2.5 || this.frameTimes.length < 60) return;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (median > 24 && this.dpr > 1) {
      this.setDpr(Math.max(1, this.dpr - 0.25));
      this.judgedAt = now;
      this.frameTimes.length = 0;
    } else if (median > 30 && this.dpr > 0.75) {
      this.setDpr(Math.max(0.75, this.dpr - 0.25));
      this.judgedAt = now;
      this.frameTimes.length = 0;
    } else if (median < 12 && this.dpr < this.dprCap && now - this.judgedAt > 8) {
      this.setDpr(Math.min(this.dprCap, this.dpr + 0.25));
      this.judgedAt = now;
      this.frameTimes.length = 0;
    }
  }

  render(time: number) {
    this.finish.uniforms.uTime.value = time;
    this.composer.render();
  }
}
