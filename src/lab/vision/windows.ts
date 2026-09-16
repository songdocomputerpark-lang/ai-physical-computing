/**
 * 출력 창(cv2.imshow) 화면 관리(PLAN §8.2 P2-03, CODE_MAPPING §3.1 "출력 캔버스(창 이름마다 탭)").
 *
 * 파이썬의 cv2.imshow('이름', img)는 워커에서 'window.show' 이벤트(RGBA 바이트, protocol.ts 머리말)로 오고,
 * 이 클래스가 창 이름마다 <canvas>를 만들어 putImageData로 그린다. 창이 둘 이상이면 탭으로 고른다.
 * cv2.namedWindow는 'window.open', cv2.destroyWindow·destroyAllWindows는 'window.close'로 오는데, 창은 결과 확인용으로 남긴다
 * (CODE_MAPPING §3.1). 새 실행이 시작되면(clear) 이전 실행의 창을 모두 지운다.
 *
 * 키 입력: 출력 화면(stage)에 초점이 있을 때 누른 키를 cv2.waitKey 값으로 바꿔(frame.ts keyCodeForEvent) onKey로 알린다.
 * Tab·화살표·조합키는 브라우저에 그대로 둔다(키보드 접근성). 터치 기기용 화면 키 버튼도 같은 onKey를 부른다.
 * 학생이 탭의 [창 닫기]를 누르면 onClose(이름)으로 알려 파이썬의 cv2.getWindowProperty가 0.0을 돌려주게 한다.
 *
 * 화면 요소는 src/components/lab/VisionIo.astro가 그리고, 여기서는 data-vision-* 표시로 찾는다.
 */
import { FpsMeter, keyCodeForEvent } from './frame.ts';

export interface WindowShowPayload {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array | Uint8ClampedArray;
}

export interface OutputWindowsOptions {
  /** 탭 줄(role=tablist를 넣을 곳) */
  readonly tabs: HTMLElement;
  /** 캔버스들이 들어갈 곳(초점을 받아 키 입력을 듣는다) */
  readonly stage: HTMLElement;
  /** "아직 출력이 없어요" 안내 */
  readonly empty: HTMLElement | null;
  /** 창 크기·fps 표시 */
  readonly status: HTMLElement | null;
  /** [창 닫기] 버튼 */
  readonly closeButton: HTMLButtonElement | null;
  /** 키 코드를 받는다(실행 중일 때만 파이썬에 전달하는 것은 부르는 쪽이 정한다) */
  readonly onKey: (code: number) => void;
  /** 학생이 창(탭)을 닫았을 때 */
  readonly onClose: (name: string) => void;
  /** 시각(테스트용). 기본 performance.now */
  readonly now?: () => number;
}

interface WindowEntry {
  readonly name: string;
  readonly canvas: HTMLCanvasElement;
  readonly tab: HTMLButtonElement;
  readonly meter: FpsMeter;
  width: number;
  height: number;
  frames: number;
  closed: boolean;
}

/** 이름이 들어가는 id에 쓸 수 있게 다듬는다(id 충돌은 순번으로 막는다). */
function slug(name: string, index: number): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '');
  return `${base || 'window'}-${index}`;
}

export class OutputWindows {
  readonly #options: OutputWindowsOptions;
  readonly #windows = new Map<string, WindowEntry>();
  readonly #now: () => number;
  readonly #cleanups: (() => void)[] = [];
  #active: string | null = null;
  #serial = 0;
  #statusTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: OutputWindowsOptions) {
    this.#options = options;
    this.#now = options.now ?? (() => performance.now());
    const { stage, tabs, closeButton } = options;
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', '출력 창');
    const onKeyDown = (event: KeyboardEvent) => {
      const code = keyCodeForEvent(event);
      if (code === null) {
        return;
      }
      // 스페이스(화면 스크롤)·Backspace(뒤로 가기) 같은 기본 동작만 막는다. 글자 키는 초점이 출력 화면에 있으면 페이지가 아무 일도 하지 않는다.
      if (event.key === ' ' || event.key === 'Backspace') {
        event.preventDefault();
      }
      options.onKey(code);
    };
    stage.addEventListener('keydown', onKeyDown);
    this.#cleanups.push(() => stage.removeEventListener('keydown', onKeyDown));
    if (closeButton) {
      const onClose = () => this.closeActive();
      closeButton.addEventListener('click', onClose);
      this.#cleanups.push(() => closeButton.removeEventListener('click', onClose));
    }
    this.#statusTimer = setInterval(() => this.#renderStatus(), 500);
    this.#render();
  }

  get names(): string[] {
    return [...this.#windows.keys()];
  }

  get activeName(): string | null {
    return this.#active;
  }

  /** 이름의 창 캔버스(테스트·내려받기용) */
  canvasOf(name: string): HTMLCanvasElement | null {
    return this.#windows.get(name)?.canvas ?? null;
  }

  /** cv2.namedWindow: 빈 창(탭)을 만든다. */
  open(name: string): void {
    this.#ensure(name);
    this.#render();
  }

  /** cv2.imshow: 창에 한 장을 그린다. 바이트 수가 크기와 맞지 않으면 무시하고 false. */
  show(payload: WindowShowPayload): boolean {
    const { name, width, height, data } = payload;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || data.byteLength !== width * height * 4) {
      return false;
    }
    const entry = this.#ensure(name);
    const canvas = entry.canvas;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      entry.width = width;
      entry.height = height;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return false;
    }
    // 워커가 transfer로 옮긴 바이트를 복사 없이 ImageData로 감싼다(ImageData는 보통 ArrayBuffer 위의 Uint8ClampedArray만 받는다).
    const pixels = new Uint8ClampedArray(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength);
    ctx.putImageData(new ImageData(pixels, width, height), 0, 0);
    entry.frames += 1;
    entry.closed = false;
    entry.meter.tick(this.#now());
    if (this.#active === null) {
      this.select(name);
    } else {
      this.#render();
    }
    return true;
  }

  /** cv2.destroyWindow(이름)·destroyAllWindows(null): 파이썬 쪽 목록만 비우고 화면의 창은 남긴다(결과 확인용). 표시만 바꾼다. */
  markDestroyed(name: string | null): void {
    for (const entry of this.#windows.values()) {
      if (name === null || entry.name === name) {
        entry.closed = true;
      }
    }
    this.#render();
  }

  /** 탭을 고른다. */
  select(name: string): void {
    if (!this.#windows.has(name)) {
      return;
    }
    this.#active = name;
    this.#render();
  }

  /** 학생이 [창 닫기]를 누름: 화면에서 지우고 파이썬에 알린다. */
  closeActive(): void {
    const name = this.#active;
    if (name === null) {
      return;
    }
    const entry = this.#windows.get(name);
    if (!entry) {
      return;
    }
    entry.canvas.remove();
    entry.tab.remove();
    this.#windows.delete(name);
    const remaining = this.names;
    this.#active = remaining[remaining.length - 1] ?? null;
    this.#render();
    this.#options.onClose(name);
  }

  /** 새 실행이 시작될 때 모든 창을 지운다. */
  clear(): void {
    for (const entry of this.#windows.values()) {
      entry.canvas.remove();
      entry.tab.remove();
    }
    this.#windows.clear();
    this.#active = null;
    this.#render();
  }

  /** 지금 보이는 창의 크기·fps(화면 표시용) */
  activeStats(): { name: string; width: number; height: number; fps: number; frames: number } | null {
    const name = this.#active;
    const entry = name === null ? undefined : this.#windows.get(name);
    if (!entry) {
      return null;
    }
    return { name: entry.name, width: entry.width, height: entry.height, fps: entry.meter.fps(this.#now()), frames: entry.frames };
  }

  dispose(): void {
    if (this.#statusTimer !== null) {
      clearInterval(this.#statusTimer);
      this.#statusTimer = null;
    }
    for (const cleanup of this.#cleanups.splice(0)) {
      cleanup();
    }
    this.clear();
  }

  #ensure(name: string): WindowEntry {
    const existing = this.#windows.get(name);
    if (existing) {
      return existing;
    }
    this.#serial += 1;
    const id = slug(name, this.#serial);
    const canvas = document.createElement('canvas');
    canvas.className = 'vision-window';
    canvas.id = `vision-window-${id}`;
    canvas.dataset.visionWindow = name;
    canvas.setAttribute('role', 'tabpanel');
    canvas.setAttribute('aria-label', `출력 창 ${name}`);
    canvas.hidden = true;
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'vision-tab';
    tab.dataset.visionTab = name;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', canvas.id);
    tab.textContent = name;
    tab.addEventListener('click', () => this.select(name));
    this.#options.tabs.append(tab);
    this.#options.stage.append(canvas);
    const entry: WindowEntry = { name, canvas, tab, meter: new FpsMeter(), width: 0, height: 0, frames: 0, closed: false };
    this.#windows.set(name, entry);
    return entry;
  }

  #render(): void {
    const { empty, closeButton, tabs } = this.#options;
    const count = this.#windows.size;
    if (empty) {
      empty.hidden = count > 0;
    }
    tabs.hidden = count === 0;
    for (const entry of this.#windows.values()) {
      const active = entry.name === this.#active;
      entry.canvas.hidden = !active;
      entry.tab.setAttribute('aria-selected', active ? 'true' : 'false');
      entry.tab.tabIndex = active ? 0 : -1;
      entry.tab.classList.toggle('vision-tab--active', active);
      entry.tab.classList.toggle('vision-tab--closed', entry.closed);
      entry.tab.textContent = entry.closed ? `${entry.name} (끝남)` : entry.name;
    }
    if (closeButton) {
      closeButton.hidden = count === 0;
    }
    this.#renderStatus();
  }

  #renderStatus(): void {
    const { status } = this.#options;
    if (!status) {
      return;
    }
    const stats = this.activeStats();
    if (!stats) {
      status.textContent = '';
      status.dataset.fps = '';
      return;
    }
    const size = stats.width > 0 ? `${stats.width}×${stats.height}` : '크기 없음';
    status.textContent = `${stats.name} ${size} · ${stats.fps.toFixed(0)}fps · ${stats.frames}장`;
    status.dataset.fps = String(stats.fps);
    status.dataset.width = String(stats.width);
    status.dataset.height = String(stats.height);
  }
}
