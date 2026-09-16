/**
 * 영상처리 실습실의 순수 논리(PLAN §8.2 P2-03, CODE_MAPPING §3.1) — 화면 요소 없이 계산만 하는 부분을 모았다.
 * DOM·카메라·워커는 sources.ts·windows.ts·vision-lab.ts가 맡고, 이 파일은 Node 단위 테스트(tests/unit/lab/vision.test.ts)로 검사한다.
 *
 * - 프레임 모양(VisionFrame): 파이썬으로 보내는 RGBA 바이트(width·height·data). apc_cv2.py의 _frame_to_bgr가 읽는 모양과 같다.
 * - 초당 프레임 제한(FrameThrottle): cap.read() 요청에 답하는 간격을 초당 15장(config)으로 제한한다.
 * - 초당 프레임 재기(FpsMeter): 입력·출력 fps 표시.
 * - 키 코드(keyCodeForEvent): 출력 화면에서 누른 키를 cv2.waitKey가 돌려주는 정수(0~255, ESC=27)로 바꾼다.
 * - 합성 샘플 장면(SampleScene): 카메라가 없을 때 쓰는 "직접 그린" 입력 — 움직이는 도형·글자·그라데이션(사진 아님, PD-30).
 */

/** 파이썬으로 보내는 한 장(RGBA, 위→아래·왼쪽→오른쪽) */
export interface VisionFrame {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/** cap.read()에 답하는 최대 빈도(초당). SPEC §6.1 "프레임 스로틀(10~15fps)", CODE_MAPPING §3.1 Claude 결정 15fps. */
export const MAX_READ_FPS = 15;

/** 기본으로 부탁하는 카메라 크기(CODE_MAPPING §3.1 "기본 640×480 요청") */
export const DEFAULT_FRAME_WIDTH = 640;
export const DEFAULT_FRAME_HEIGHT = 480;

/** 파이썬이 주는 프레임 크기 상한(cap.set으로도 이보다 크게는 못 잡는다 — 워커로 옮기는 바이트를 제한) */
export const MAX_FRAME_WIDTH = 1920;
export const MAX_FRAME_HEIGHT = 1080;

/** 크기 값을 8~상한 사이 정수로 다듬는다. */
export function clampFrameSize(value: number, max: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(max, Math.max(8, Math.round(value)));
}

/** 빈 RGBA 프레임(투명도는 255) */
export function createFrame(width: number, height: number): VisionFrame {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 3; index < data.length; index += 4) {
    data[index] = 255;
  }
  return { width, height, data };
}

/**
 * 읽기 요청에 답하는 간격을 제한한다. 앞 장을 준 뒤 1000/fps ms가 지나야 다음 장을 준다.
 * nextDelay(now) → 지금 바로 줄 수 있으면 0, 아니면 기다릴 ms.
 */
export class FrameThrottle {
  readonly #intervalMs: number;
  #lastAt: number | null = null;

  constructor(fps: number = MAX_READ_FPS) {
    this.#intervalMs = fps > 0 ? 1000 / fps : 0;
  }

  get intervalMs(): number {
    return this.#intervalMs;
  }

  /** 지금(now, ms) 답하려면 얼마나 기다려야 하는지 */
  nextDelay(now: number): number {
    if (this.#lastAt === null) {
      return 0;
    }
    const elapsed = now - this.#lastAt;
    return elapsed >= this.#intervalMs ? 0 : Math.ceil(this.#intervalMs - elapsed);
  }

  /** 한 장을 준 시각을 적는다. */
  mark(now: number): void {
    this.#lastAt = now;
  }

  reset(): void {
    this.#lastAt = null;
  }
}

/** 초당 몇 장인지 잰다(최근 1초 창). */
export class FpsMeter {
  readonly #windowMs: number;
  #stamps: number[] = [];

  constructor(windowMs = 1000) {
    this.#windowMs = windowMs;
  }

  tick(now: number): void {
    this.#stamps.push(now);
    this.#trim(now);
  }

  /** 최근 1초 동안의 장수(소수 첫째 자리까지) */
  fps(now: number): number {
    this.#trim(now);
    if (this.#stamps.length < 2) {
      return this.#stamps.length;
    }
    const span = now - (this.#stamps[0] ?? now);
    if (span <= 0) {
      return this.#stamps.length;
    }
    return Math.round(((this.#stamps.length - 1) / span) * 1000 * 10) / 10;
  }

  reset(): void {
    this.#stamps = [];
  }

  #trim(now: number): void {
    const cutoff = now - this.#windowMs;
    while (this.#stamps.length > 0 && (this.#stamps[0] ?? 0) < cutoff) {
      this.#stamps.shift();
    }
  }
}

/** 키보드 이벤트 가운데 이 함수가 보는 것 */
export interface KeyEventLike {
  readonly key: string;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly metaKey?: boolean;
}

/** 이름이 있는 키의 cv2.waitKey 값(OpenCV의 highgui가 돌려주는 값과 같다: ESC 27, Enter 13, Backspace 8, Space 32) */
const NAMED_KEY_CODES: Readonly<Record<string, number>> = Object.freeze({
  Escape: 27,
  Enter: 13,
  Backspace: 8,
  Delete: 127,
  ' ': 32,
});

/**
 * 출력 화면에서 누른 키 → cv2.waitKey 값. 글자 한 개(a, q, 1, 한글 아님)와 ESC·Enter·Backspace·Delete·Space만 다루고
 * Tab·화살표·기능키·조합키(Ctrl 등)는 null(브라우저 동작을 막지 않는다 — 키보드 접근성).
 */
export function keyCodeForEvent(event: KeyEventLike): number | null {
  if (event.ctrlKey || event.altKey || event.metaKey) {
    return null;
  }
  const named = NAMED_KEY_CODES[event.key];
  if (named !== undefined) {
    return named;
  }
  if (event.key.length === 1) {
    const code = event.key.charCodeAt(0);
    return code >= 32 && code <= 126 ? code : null;
  }
  return null;
}

/** 화면 키 버튼(터치 기기용, CODE_MAPPING §3.1 "[q][d][r][ESC]") */
export const SCREEN_KEYS: readonly { readonly label: string; readonly code: number; readonly hint: string }[] = Object.freeze([
  { label: 'q', code: 113, hint: '끝내기(q)' },
  { label: 'd', code: 100, hint: 'd 키' },
  { label: 'r', code: 114, hint: 'r 키' },
  { label: 'ESC', code: 27, hint: 'ESC 키' },
]);

/** 합성 샘플 장면에서 움직이는 도형 */
export interface SampleShape {
  readonly kind: 'circle' | 'rect' | 'triangle';
  /** 중심 x·y(장면 크기 대비 0~1) */
  x: number;
  y: number;
  /** 크기(장면 짧은 변 대비) */
  readonly size: number;
  /** 속도(초당, 0~1 좌표계) */
  vx: number;
  vy: number;
  readonly fill: string;
}

/**
 * 카메라가 없을 때 쓰는 샘플 장면. 사진이 아니라 코드로 그리는 도형·글자·그라데이션이다(PD-30, SPEC §6.1 "직접 제작").
 * 도형이 천천히 튀어 다니고 밝기 그라데이션 바탕이 있어 회색 변환·임계값·에지·블러 예제의 결과가 눈에 보인다.
 * 시간(초)만 넣으면 모양이 정해지므로(advance) Node에서도 계산을 검사할 수 있다.
 */
export class SampleScene {
  readonly shapes: SampleShape[];
  #time = 0;

  constructor() {
    this.shapes = [
      { kind: 'circle', x: 0.3, y: 0.4, size: 0.22, vx: 0.12, vy: 0.08, fill: '#f2f2f2' },
      { kind: 'rect', x: 0.68, y: 0.6, size: 0.26, vx: -0.09, vy: 0.11, fill: '#1f5bd6' },
      { kind: 'triangle', x: 0.55, y: 0.25, size: 0.2, vx: 0.07, vy: -0.1, fill: '#f2b705' },
    ];
  }

  get time(): number {
    return this.#time;
  }

  /** 시간을 앞으로 보내며 도형을 움직인다(벽에 닿으면 튕긴다). */
  advance(seconds: number): void {
    const dt = Math.max(0, Math.min(seconds, 0.5));
    this.#time += dt;
    for (const shape of this.shapes) {
      shape.x += shape.vx * dt;
      shape.y += shape.vy * dt;
      const half = shape.size / 2;
      if (shape.x < half) {
        shape.x = half;
        shape.vx = Math.abs(shape.vx);
      } else if (shape.x > 1 - half) {
        shape.x = 1 - half;
        shape.vx = -Math.abs(shape.vx);
      }
      if (shape.y < half) {
        shape.y = half;
        shape.vy = Math.abs(shape.vy);
      } else if (shape.y > 1 - half) {
        shape.y = 1 - half;
        shape.vy = -Math.abs(shape.vy);
      }
    }
  }

  /** 2D 캔버스에 장면을 그린다(width×height). 글자는 사이트 글꼴이 아니라 브라우저 기본 sans-serif라 어느 기기에서도 그려진다. */
  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#2b2f36');
    gradient.addColorStop(1, '#8a929e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const short = Math.min(width, height);
    for (const shape of this.shapes) {
      const cx = shape.x * width;
      const cy = shape.y * height;
      const size = shape.size * short;
      ctx.fillStyle = shape.fill;
      ctx.beginPath();
      if (shape.kind === 'circle') {
        ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
      } else if (shape.kind === 'rect') {
        ctx.rect(cx - size / 2, cy - size / 2, size, size);
      } else {
        ctx.moveTo(cx, cy - size / 2);
        ctx.lineTo(cx + size / 2, cy + size / 2);
        ctx.lineTo(cx - size / 2, cy + size / 2);
        ctx.closePath();
      }
      ctx.fill();
    }

    // 굵은 글자(에지가 뚜렷하게 생긴다). 왼쪽 위에 "샘플 입력", 시각을 함께 적어 장마다 다르게 한다.
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(short * 0.09)}px sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText('샘플 입력', Math.round(width * 0.04), Math.round(height * 0.05));
    ctx.font = `${Math.round(short * 0.06)}px sans-serif`;
    ctx.fillText(`${this.#time.toFixed(1)}초`, Math.round(width * 0.04), Math.round(height * 0.05 + short * 0.11));
  }
}
