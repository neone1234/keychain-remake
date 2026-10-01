export interface ChoicePart<T> {
  options: () => [T, string][];
  current: () => T;
  pick: (value: T) => void;
}

export interface WeatherLineParts {
  city: ChoicePart<string>;
  sky: ChoicePart<string | null>;
  time: ChoicePart<number | null>;
  season: ChoicePart<string | null>;
}

export interface WeatherLineText {
  city: string;
  temperature: string;
  sky: string;
  time: string;
  season: string;
}

/** the faint typed line under the letter; each part opens a small frosted list of other choices */
export class WeatherLine {
  private el = document.getElementById('weather')!;
  private menu = document.getElementById('choices')!;
  private buttons: Record<keyof WeatherLineParts, HTMLButtonElement> = {
    city: document.getElementById('w-city') as HTMLButtonElement,
    sky: document.getElementById('w-sky') as HTMLButtonElement,
    time: document.getElementById('w-time') as HTMLButtonElement,
    season: document.getElementById('w-season') as HTMLButtonElement,
  };
  private temp = document.getElementById('w-temp')!;
  private openFor: HTMLButtonElement | null = null;
  private placed = '';

  constructor(parts: WeatherLineParts) {
    for (const key of Object.keys(this.buttons) as (keyof WeatherLineParts)[]) {
      const button = this.buttons[key];
      const part = parts[key] as ChoicePart<unknown>;
      button.setAttribute('aria-haspopup', 'menu');
      button.setAttribute('aria-expanded', 'false');
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.openFor === button) return this.close();
        this.close();
        this.open(button, part);
      });
    }
    addEventListener('pointerdown', (e) => {
      if (this.openFor && !this.menu.contains(e.target as Node) && e.target !== this.openFor) this.close();
    });
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
    this.menu.addEventListener('keydown', (e) => {
      const items = [...this.menu.querySelectorAll('button')];
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === 'ArrowDown') items[(i + 1) % items.length]?.focus();
      else if (e.key === 'ArrowUp') items[(i - 1 + items.length) % items.length]?.focus();
      else return;
      e.preventDefault();
    });
  }

  private open(button: HTMLButtonElement, part: ChoicePart<unknown>) {
    const current = part.current();
    this.menu.replaceChildren(
      ...part.options().map(([value, label]) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.setAttribute('role', 'menuitem');
        item.textContent = label;
        item.setAttribute('aria-current', String(value === current));
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          part.pick(value);
          this.close();
          button.focus({ preventScroll: true });
        });
        return item;
      }),
    );
    const r = button.getBoundingClientRect();
    Object.assign(this.menu.style, {
      left: `${Math.max(8, r.left - 12)}px`,
      bottom: `${innerHeight - r.top + 8}px`,
      fontSize: this.el.style.fontSize,
      color: this.el.style.color,
    });
    this.menu.hidden = false;
    this.openFor = button;
    button.setAttribute('aria-expanded', 'true');
    (this.menu.querySelector('[aria-current="true"]') as HTMLButtonElement | null)?.focus({ preventScroll: true });
  }

  close() {
    this.menu.hidden = true;
    this.openFor?.setAttribute('aria-expanded', 'false');
    this.openFor = null;
  }

  write(text: WeatherLineText) {
    this.buttons.city.textContent = text.city;
    this.temp.textContent = text.temperature ? `${text.temperature}, ` : '';
    this.buttons.sky.textContent = text.sky;
    this.buttons.time.textContent = text.time;
    this.buttons.season.textContent = text.season;
  }

  place(left: number, top: number, fontSize: number, maxWidth: number) {
    const key = `${left.toFixed(1)}|${top.toFixed(1)}|${fontSize.toFixed(2)}|${maxWidth.toFixed(0)}`;
    if (key === this.placed) return;
    this.placed = key;
    Object.assign(this.el.style, {
      transform: `translate(${left}px, ${top}px)`,
      fontSize: `${fontSize}px`,
      maxWidth: `${maxWidth}px`,
    });
  }

  colour(css: string) {
    this.el.style.color = css;
  }

  show() {
    this.el.classList.add('shown');
  }
}
