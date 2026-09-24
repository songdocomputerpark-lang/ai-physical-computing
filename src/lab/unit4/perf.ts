/**
 * 4단원 통합 화면의 성능 재기(PLAN §8.4 P4-09 "성능 측정(메모리·fps)", PLAN §11 위험 25번 "두 워커 + MediaPipe + 가상 데스크톱").
 * DOM을 모르는 순수 계산만 둔다 — 값을 읽어 오는 일은 unit4-page.ts가 한다.
 *
 * 재는 것(0.5초마다 한 번 — SAMPLE_MS)
 *   · 입력 fps    영상처리 실습실이 파이썬에 카메라 장을 건네는 빈도([data-vision-input-status]의 data-fps).
 *                 사이트가 일부러 15fps로 막는다(src/lab/vision/frame.ts) — 15에 가까울수록 여유가 있다는 뜻이다.
 *   · 출력 fps    cv2.imshow 창이 실제로 다시 그려진 빈도(창 상태 줄의 data-fps) ≈ 학생 코드 while 루프가 한 바퀴 도는 빈도.
 *   · 화면 fps    이 탭의 화면 그리기(requestAnimationFrame) 빈도. 60에 가까우면 버튼·그림이 부드럽다. 메인 스레드가 바쁘면 떨어진다
 *                 (얼굴 그물 추론·가상 데스크톱 캔버스·보드 그림이 모두 메인 스레드에서 돈다 — 파이썬 두 벌은 워커라 여기에 안 든다).
 *   · 긴 작업     50ms를 넘긴 메인 스레드 작업의 1초당 합(ms/s, PerformanceObserver 'longtask'). 클수록 클릭이 늦게 먹는다.
 *   · 보낸 줄     컴퓨터 쪽 bluetooth.send가 실제로 보드에 닿은 줄의 1초당 수(브릿지가 초당 10회로 막는다 — PLAN §7.2 규칙 4).
 *   · 메모리      performance.memory.usedJSHeapSize(크로뮴 계열에만 있다. 없으면 null — 파이어폭스·사파리).
 *                 워커(파이썬 두 벌)와 WebAssembly 메모리는 여기에 안 든다 → 브라우저 테스트가 운영체제의 프로세스 메모리를 따로 잰다
 *                 (tests/e2e/unit4.spec.ts, 보고 `.cache/phase4-notes/zone-h-unit4.md`).
 */

/** 한 번 잰 값 */
export interface PerfSample {
  /** performance.now() 기준 시각(ms) */
  readonly at: number;
  /** 카메라 → 파이썬 전달 fps(모르면 null) */
  readonly inputFps: number | null;
  /** cv2.imshow 창 다시 그리기 fps(모르면 null) */
  readonly outputFps: number | null;
  /** 이 탭의 화면 그리기 fps(모르면 null) */
  readonly pageFps?: number | null;
  /** 긴 작업 합(1초당 ms, 모르면 null) */
  readonly longTaskMsPerSec?: number | null;
  /** 보드에 닿은 줄(1초당, 모르면 null) */
  readonly sentPerSec?: number | null;
  /** 이 탭의 자바스크립트 힙 사용량(MB, 모르면 null) */
  readonly heapMb: number | null;
}

/** 값 하나의 요약 */
export interface PerfRange {
  readonly min: number;
  readonly avg: number;
  readonly max: number;
  readonly count: number;
}

export interface PerfSummary {
  readonly samples: number;
  readonly seconds: number;
  readonly inputFps: PerfRange | null;
  readonly outputFps: PerfRange | null;
  readonly pageFps: PerfRange | null;
  readonly longTaskMsPerSec: PerfRange | null;
  readonly sentPerSec: PerfRange | null;
  readonly heapMb: PerfRange | null;
  /** 마지막으로 잰 힙(MB) */
  readonly heapLastMb: number | null;
}

/** 사이트가 카메라 장을 파이썬에 주는 최대 빈도(src/lab/vision/frame.ts와 같은 값 — "몇 분의 몇"인지 적으려고 둔다) */
export const TARGET_INPUT_FPS = 15;
/** 브릿지가 한 통로로 내보내는 최대 빈도(PLAN §7.2 규칙 4 — src/lab/bridge/messages.ts BRIDGE_MIN_INTERVAL_MS 100과 같은 뜻) */
export const TARGET_SEND_PER_SEC = 10;

function rangeOf(values: readonly number[]): PerfRange | null {
  if (values.length === 0) {
    return null;
  }
  let min = values[0]!;
  let max = values[0]!;
  let total = 0;
  for (const value of values) {
    min = Math.min(min, value);
    max = Math.max(max, value);
    total += value;
  }
  return { min, avg: total / values.length, max, count: values.length };
}

function numbers(samples: readonly PerfSample[], pick: (sample: PerfSample) => number | null | undefined, positiveOnly: boolean): number[] {
  const values: number[] = [];
  for (const sample of samples) {
    const value = pick(sample);
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      continue;
    }
    if (positiveOnly && value <= 0) {
      continue;
    }
    values.push(value);
  }
  return values;
}

/**
 * 잰 값들을 요약한다. fps와 보낸 줄은 0을 뺀다("아직 안 돌고 있음"이라 평균이 거짓말을 하지 않게).
 * 긴 작업은 0도 뜻이 있어(한가함) 그대로 넣는다.
 */
export function summarize(samples: readonly PerfSample[]): PerfSummary {
  const heaps = numbers(samples, (sample) => sample.heapMb, true);
  const first = samples[0];
  const last = samples[samples.length - 1];
  const seconds = first && last && last.at > first.at ? (last.at - first.at) / 1000 : 0;
  return {
    samples: samples.length,
    seconds,
    inputFps: rangeOf(numbers(samples, (sample) => sample.inputFps, true)),
    outputFps: rangeOf(numbers(samples, (sample) => sample.outputFps, true)),
    pageFps: rangeOf(numbers(samples, (sample) => sample.pageFps, true)),
    longTaskMsPerSec: rangeOf(numbers(samples, (sample) => sample.longTaskMsPerSec, false)),
    sentPerSec: rangeOf(numbers(samples, (sample) => sample.sentPerSec, true)),
    heapMb: rangeOf(heaps),
    heapLastMb: heaps.length > 0 ? heaps[heaps.length - 1]! : null,
  };
}

function oneDecimal(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1);
}

/** 한 줄로 읽는 요약(화면 표시용 — 고1이 읽는 말로) */
export function summaryText(summary: PerfSummary): string {
  if (summary.samples === 0) {
    return '아직 잰 값이 없어요. [함께 실행]을 누르면 재기 시작해요.';
  }
  const parts: string[] = [];
  parts.push(
    summary.inputFps
      ? `카메라 → 파이썬 ${oneDecimal(summary.inputFps.avg)}장/초(가장 많이 ${TARGET_INPUT_FPS})`
      : '카메라 → 파이썬 아직 없음',
  );
  if (summary.pageFps) {
    parts.push(`화면 ${oneDecimal(summary.pageFps.avg)}장/초(가장 느릴 때 ${oneDecimal(summary.pageFps.min)})`);
  }
  if (summary.sentPerSec) {
    parts.push(`보드로 ${oneDecimal(summary.sentPerSec.avg)}줄/초`);
  }
  // 힙은 이 탭의 자바스크립트만이다(파이썬 두 벌·WebAssembly는 빠진다) — 작업 관리자 숫자와 헷갈리지 않게 이름을 밝힌다.
  parts.push(
    summary.heapMb
      ? `탭 자바스크립트 메모리 ${oneDecimal(summary.heapLastMb ?? summary.heapMb.avg)}MB(가장 많이 ${oneDecimal(summary.heapMb.max)}MB)`
      : '메모리는 이 브라우저에서 잴 수 없어요',
  );
  parts.push(`${oneDecimal(summary.seconds)}초 동안 ${summary.samples}번 잼`);
  return parts.join(' · ');
}

export interface ReportMeta {
  /** 어디서 쟀나(브라우저·화면 크기) */
  readonly where: string;
  /** 입력 소스(재생 입력·웹캠 등) */
  readonly input?: string;
  /** 돌린 예제(컴퓨터 → 보드) */
  readonly examples?: string;
  /** 덧붙일 한 줄 */
  readonly note?: string;
}

/** 보고·PROGRESS에 붙일 마크다운 표(P3-11 점검 도우미의 [결과 복사]와 같은 방식) */
export function reportMarkdown(summary: PerfSummary, meta: ReportMeta = { where: '알 수 없음' }): string {
  const lines: string[] = [];
  lines.push(`### 4단원 통합 화면 성능 측정 (${meta.where})`);
  lines.push('');
  if (meta.input || meta.examples) {
    lines.push(`- 입력: ${meta.input ?? '알 수 없음'} · 예제: ${meta.examples ?? '알 수 없음'}`);
    lines.push('');
  }
  lines.push('| 잰 것 | 최저 | 평균 | 최대 | 표본 |');
  lines.push('|---|---|---|---|---|');
  const row = (label: string, range: PerfRange | null, unit: string) =>
    range
      ? `| ${label} | ${oneDecimal(range.min)}${unit} | ${oneDecimal(range.avg)}${unit} | ${oneDecimal(range.max)}${unit} | ${range.count} |`
      : `| ${label} | — | — | — | 0 |`;
  lines.push(row(`카메라 → 파이썬 입력 fps (최대 ${TARGET_INPUT_FPS})`, summary.inputFps, ''));
  lines.push(row('출력 창(cv2.imshow) fps', summary.outputFps, ''));
  lines.push(row('화면 그리기 fps(requestAnimationFrame)', summary.pageFps, ''));
  lines.push(row('긴 작업(50ms 넘는 일) 1초당 합', summary.longTaskMsPerSec, 'ms'));
  lines.push(row(`보드에 닿은 줄 1초당 (최대 ${TARGET_SEND_PER_SEC})`, summary.sentPerSec, ''));
  lines.push(row('탭 자바스크립트 힙', summary.heapMb, 'MB'));
  lines.push('');
  lines.push(`- 잰 시간: ${oneDecimal(summary.seconds)}초 · 표본 ${summary.samples}개(0.5초 간격)`);
  lines.push('- 힙은 이 탭의 자바스크립트만이에요. 파이썬 워커 두 벌과 WebAssembly 메모리는 브라우저 작업 관리자(Shift+Esc)로 따로 봐요.');
  if (meta.note) {
    lines.push(`- ${meta.note}`);
  }
  return lines.join('\n');
}

/** 이 브라우저에서 잴 수 있는 힙 사용량(MB). 크로뮴 계열이 아니면 null */
export function readHeapMb(perf: Performance = performance): number | null {
  const memory = (perf as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
  const used = memory?.usedJSHeapSize;
  return typeof used === 'number' && used > 0 ? used / (1024 * 1024) : null;
}

/** 요소의 data-fps를 숫자로(없거나 숫자가 아니면 null) */
export function readFps(element: HTMLElement | null): number | null {
  const raw = element?.dataset.fps;
  if (raw === undefined || raw === '') {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** 요소의 data-* 셈(정수)을 읽는다(없으면 null) */
export function readCount(element: HTMLElement | null, key: string): number | null {
  const raw = element?.dataset[key];
  if (raw === undefined || raw === '') {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * 셈이 늘어난 속도(1초당). 앞 값이 없거나 셈이 줄었으면(실행을 새로 시작해 0으로 돌아감) null.
 * 시간이 0이면 나눌 수 없어 null.
 */
export function ratePerSec(previous: { count: number; at: number } | null, current: { count: number; at: number }): number | null {
  if (!previous || current.count < previous.count || current.at <= previous.at) {
    return null;
  }
  return ((current.count - previous.count) * 1000) / (current.at - previous.at);
}

/**
 * 화면 그리기 빈도를 재는 작은 도구 — requestAnimationFrame을 세다가 take()할 때 지난번 뒤 1초당 몇 번이었는지 돌려준다.
 * 탭이 숨으면 브라우저가 그리기를 멈추므로(0이 나온다) 요약에서 0은 빠진다.
 */
export class FrameMeter {
  #frames = 0;
  #since: number;
  #handle: number | null = null;
  readonly #raf: (callback: FrameRequestCallback) => number;
  readonly #cancel: (handle: number) => void;
  readonly #now: () => number;

  constructor(
    options: {
      raf?: (callback: FrameRequestCallback) => number;
      cancel?: (handle: number) => void;
      now?: () => number;
    } = {},
  ) {
    this.#raf = options.raf ?? ((callback) => requestAnimationFrame(callback));
    this.#cancel = options.cancel ?? ((handle) => cancelAnimationFrame(handle));
    this.#now = options.now ?? (() => performance.now());
    this.#since = this.#now();
  }

  start(): void {
    if (this.#handle !== null) {
      return;
    }
    this.#frames = 0;
    this.#since = this.#now();
    const tick = () => {
      this.#frames += 1;
      this.#handle = this.#raf(tick);
    };
    this.#handle = this.#raf(tick);
  }

  stop(): void {
    if (this.#handle !== null) {
      this.#cancel(this.#handle);
      this.#handle = null;
    }
  }

  /** 지난번 take() 뒤(처음이면 start() 뒤) 1초당 그리기 횟수 */
  take(): number | null {
    const now = this.#now();
    const elapsed = now - this.#since;
    const frames = this.#frames;
    this.#frames = 0;
    this.#since = now;
    return elapsed > 0 ? (frames * 1000) / elapsed : null;
  }
}

/**
 * 긴 작업(50ms 넘는 메인 스레드 작업)을 모으는 도구. 브라우저가 'longtask'를 모르면(파이어폭스·사파리) take()가 늘 null이다.
 */
export class LongTaskMeter {
  #total = 0;
  #since: number;
  #observer: PerformanceObserver | null = null;
  readonly #now: () => number;

  constructor(options: { now?: () => number } = {}) {
    this.#now = options.now ?? (() => performance.now());
    this.#since = this.#now();
  }

  get supported(): boolean {
    return typeof PerformanceObserver !== 'undefined' && (PerformanceObserver.supportedEntryTypes ?? []).includes('longtask');
  }

  start(): void {
    if (this.#observer || !this.supported) {
      return;
    }
    this.#total = 0;
    this.#since = this.#now();
    this.#observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.#total += entry.duration;
      }
    });
    this.#observer.observe({ type: 'longtask', buffered: false });
  }

  stop(): void {
    this.#observer?.disconnect();
    this.#observer = null;
  }

  /** 지난번 take() 뒤 1초당 긴 작업 합(ms). 잴 수 없으면 null */
  take(): number | null {
    if (!this.#observer) {
      return null;
    }
    const now = this.#now();
    const elapsed = now - this.#since;
    const total = this.#total;
    this.#total = 0;
    this.#since = now;
    return elapsed > 0 ? (total * 1000) / elapsed : null;
  }
}
