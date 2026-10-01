import type * as THREE from 'three';

export class LoadingScreen {
  private el = document.getElementById('loading')!;
  private line = document.getElementById('loading-line')!;
  private count = document.getElementById('loading-count')!;
  private shown = 0;
  private typed: Promise<void>;

  constructor(text: string) {
    this.typed = new Promise((done) => {
      const chars = [...text];
      chars.forEach((_, i) =>
        setTimeout(() => {
          this.line.textContent = chars.slice(0, i + 1).join('');
          if (i === chars.length - 1) setTimeout(done, 250);
        }, 260 + i * 48),
      );
      if (!chars.length) done();
    });
  }

  /** a fraction 0..1; the counter only ever goes up */
  progress(fraction: number) {
    const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
    if (pct <= this.shown) return;
    this.shown = pct;
    this.count.textContent = `[${pct}%]`;
  }

  paint(top: THREE.Color, mid: THREE.Color, horizon: THREE.Color, ink: THREE.Color) {
    this.el.style.background = `linear-gradient(${top.getStyle()}, ${mid.getStyle()} 48%, ${horizon.getStyle()})`;
    this.el.style.color = ink.getStyle();
  }

  get typingDone() {
    return this.typed;
  }

  get present() {
    return this.el.isConnected;
  }

  finish(): Promise<void> {
    this.progress(1);
    return new Promise((done) => {
      this.el.classList.add('done');
      setTimeout(() => {
        this.el.remove();
        done();
      }, 950);
    });
  }
}
