/**
 * 4단원 통합 화면의 성능 재기(PLAN §8.4 P4-09 "성능 측정(메모리·fps)", 예상 위험 25번 "두 워커 + MediaPipe + 가상 데스크톱").
 * DOM을 모르는 순수 계산만 둔다 — 값을 읽어 오는 일은 unit4-page.ts가 한다.
 *
 * 재는 것(0.5초마다 한 번)
 *   · 입력 fps   영상처리 실습실이 파이썬에 카메라 장을 건네는 빈도([data-vision-input-status]의 data-fps).
 *                사이트가 일부러 15fps로 제한한다(src/lab/vision/frame.ts MAX_READ_FPS) — 그래서 15에 가까울수록 여유가 있다는 뜻이다.
 *   · 출력 fps   cv2.imshow 창이 실제로 다시 그려진 빈도(창 상태 줄의 data-fps).
 *   · 메모리     performance.memory.usedJSHeapSize(크로뮴 계열에만 있다. 없으면 null — 파이어폭스·사파리).
 *                워커(파이썬 두 벌)의 메모리는 여기에 들어오지 않는다. 브라우저 작업 관리자로만 볼 수 있어 보고에 따로 적는다.
 */

/** 한 번 잰 값 */
export interface PerfSample {
  /** performance.now() 기준 시각(ms) */
  readonly at: number;
  /** 카메라 → 파이썬 전달 fps(모르면 null) */
  readonly inputFps: number | null;
  /** cv2.imshow 창 다시 그리기 fps(모르면 null) */
  readonly outputFps: number | null;
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
  readonly heapMb: PerfRange | null;
  /** 마지막으로 잰 힙(MB) */
  readonly heapLastMb: number | null;
}

/** 사이트가 카메라 장을 파이썬에 주는 최대 빈도(src/lab/vision/frame.ts와 같은 값 — 보고에 "몇 분의 몇"인지 적으려고 둔다) */
export const TARGET_INPUT_FPS = 15;

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

/** 잰 값들을 요약한다(0은 "아직 안 돌고 있음"이라 fps 요약에서 뺀다 — 평균이 거짓말을 하지 않게). */
export function summarize(samples: readonly PerfSample[]): PerfSummary {
  const inputs: number[] = [];
  const outputs: number[] = [];
  const heaps: number[] = [];
  for (const sample of samples) {
    if (typeof sample.inputFps === 'number' && sample.inputFps > 0) {
      inputs.push(sample.inputFps);
    }
    if (typeof sample.outputFps === 'number' && sample.outputFps > 0) {
      outputs.push(sample.outputFps);
    }
    if (typeof sample.heapMb === 'number' && sample.heapMb > 0) {
      heaps.push(sample.heapMb);
    }
  }
  const first = samples[0];
  const last = samples[samples.length - 1];
  const seconds = first && last && last.at > first.at ? (last.at - first.at) / 1000 : 0;
  const heapLast = heaps.length > 0 ? heaps[heaps.length - 1]! : null;
  return {
    samples: samples.length,
    seconds,
    inputFps: rangeOf(inputs),
    outputFps: rangeOf(outputs),
    heapMb: rangeOf(heaps),
    heapLastMb: heapLast,
  };
}

function oneDecimal(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1);
}

/** 한 줄로 읽는 요약(화면 표시용) */
export function summaryText(summary: PerfSummary): string {
  if (summary.samples === 0) {
    return '아직 잰 값이 없어요. [함께 실행]을 누르면 재기 시작해요.';
  }
  const parts: string[] = [];
  parts.push(
    summary.inputFps
      ? `입력 ${oneDecimal(summary.inputFps.avg)}fps(최저 ${oneDecimal(summary.inputFps.min)} · 목표 ${TARGET_INPUT_FPS})`
      : '입력 fps 아직 없음',
  );
  parts.push(summary.outputFps ? `출력 ${oneDecimal(summary.outputFps.avg)}fps` : '출력 fps 아직 없음');
  parts.push(
    summary.heapMb
      ? `메모리 ${oneDecimal(summary.heapLastMb ?? summary.heapMb.avg)}MB(최대 ${oneDecimal(summary.heapMb.max)}MB)`
      : '메모리는 이 브라우저에서 잴 수 없어요',
  );
  parts.push(`${oneDecimal(summary.seconds)}초 동안 ${summary.samples}번 잼`);
  return parts.join(' · ');
}

/** 보고·PROGRESS에 붙일 마크다운 표(P3-11 점검 도우미의 [결과 복사]와 같은 방식) */
export function reportMarkdown(summary: PerfSummary, meta: { readonly where: string; readonly note?: string } = { where: '알 수 없음' }): string {
  const lines: string[] = [];
  lines.push(`### 4단원 통합 화면 성능 측정 (${meta.where})`);
  lines.push('');
  lines.push('| 잰 것 | 최저 | 평균 | 최대 | 표본 |');
  lines.push('|---|---|---|---|---|');
  const row = (label: string, range: PerfRange | null, unit: string) =>
    range
      ? `| ${label} | ${oneDecimal(range.min)}${unit} | ${oneDecimal(range.avg)}${unit} | ${oneDecimal(range.max)}${unit} | ${range.count} |`
      : `| ${label} | — | — | — | 0 |`;
  lines.push(row(`카메라 → 파이썬 입력 fps (목표 ${TARGET_INPUT_FPS})`, summary.inputFps, ''));
  lines.push(row('출력 창 fps', summary.outputFps, ''));
  lines.push(row('탭 자바스크립트 힙', summary.heapMb, 'MB'));
  lines.push('');
  lines.push(`- 잰 시간: ${oneDecimal(summary.seconds)}초 · 표본 ${summary.samples}개(0.5초 간격)`);
  lines.push('- 힙은 이 탭의 자바스크립트만이에요. 파이썬 워커 두 벌의 메모리는 브라우저 작업 관리자로 따로 봐요.');
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
