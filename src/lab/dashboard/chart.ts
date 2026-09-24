/**
 * 실시간 그래프 그리기(P4-07) — 라이브러리를 쓰지 않고 캔버스에 직접 그린다(새 패키지 금지, PLAN §3).
 *
 * 나눠 둔 까닭: **자리 계산(순수 함수)** 과 **붓질(캔버스)** 을 갈라 두면 단위 테스트가 눈금·좌표를 그대로 확인할 수 있다.
 *
 * 움직임 줄이기(reduced-motion): 이 그래프는 **값이 올 때만** 다시 그린다(스스로 흐르는 애니메이션이 없다).
 * 새 값 표시(점이 커지는 효과)는 CSS에서 `--duration-*`로 하고, 그 값은 `tokens.css`가 움직임 줄이기에서 0ms로 만든다.
 */
import type { SamplePoint } from './values.ts';

/** 그릴 칸(CSS 픽셀) */
export interface ChartBox {
  readonly width: number;
  readonly height: number;
  /** 눈금 글자 자리 */
  readonly padLeft: number;
  readonly padRight: number;
  readonly padTop: number;
  readonly padBottom: number;
}

/** 기본 여백(눈금 글자가 들어갈 만큼) */
export const CHART_PADDING = Object.freeze({ padLeft: 38, padRight: 8, padTop: 10, padBottom: 18 });

export interface ChartPoint {
  readonly x: number;
  readonly y: number;
}

/** 값 하나가 그림 어디에 찍히나 */
export function pointAt(index: number, value: number, count: number, box: ChartBox, range: { min: number; max: number }): ChartPoint {
  const innerWidth = Math.max(1, box.width - box.padLeft - box.padRight);
  const innerHeight = Math.max(1, box.height - box.padTop - box.padBottom);
  const span = Math.max(1e-9, range.max - range.min);
  const stepX = count <= 1 ? 0 : innerWidth / (count - 1);
  const x = box.padLeft + (count <= 1 ? innerWidth : index * stepX);
  const ratio = Math.min(1, Math.max(0, (value - range.min) / span));
  const y = box.padTop + innerHeight - ratio * innerHeight;
  return { x, y };
}

/** 점 목록을 그림 좌표로 바꾼다 */
export function chartPointsOf(points: readonly SamplePoint[], box: ChartBox, range: { min: number; max: number }): ChartPoint[] {
  return points.map((point, index) => pointAt(index, point.value, points.length, box, range));
}

/** 눈금 세 칸(아래·가운데·위) */
export function axisTicks(range: { min: number; max: number }): number[] {
  const middle = (range.min + range.max) / 2;
  return [range.max, middle, range.min];
}

/** 눈금 글 (소수점이 지저분해지지 않게) */
export function tickLabel(value: number): string {
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(1);
}

/** 캔버스에 쓸 색(바탕 CSS 변수에서 읽는다 — 캔버스는 CSS 변수를 스스로 못 쓴다) */
export interface ChartColors {
  readonly line: string;
  readonly grid: string;
  readonly text: string;
  readonly fill: string;
}

/** 요소에 걸린 디자인 토큰에서 색을 읽는다(없으면 기본값) */
export function colorsFrom(element: Element | null): ChartColors {
  const fallback: ChartColors = { line: '#1f5bd6', grid: '#d6dde6', text: '#4a5361', fill: 'rgba(31, 91, 214, 0.12)' };
  if (element === null || typeof globalThis.getComputedStyle !== 'function') {
    return fallback;
  }
  const style = globalThis.getComputedStyle(element);
  const read = (name: string, backup: string): string => {
    const value = style.getPropertyValue(name).trim();
    return value === '' ? backup : value;
  };
  return {
    line: read('--color-accent', fallback.line),
    grid: read('--color-border', fallback.grid),
    text: read('--color-text-muted', fallback.text),
    fill: fallback.fill,
  };
}

export interface DrawChartOptions {
  readonly points: readonly SamplePoint[];
  readonly range: { min: number; max: number };
  readonly colors: ChartColors;
  /** 값이 없을 때 가운데에 쓸 글 */
  readonly emptyText: string;
}

/**
 * 캔버스에 그린다. 화면 크기(CSS 픽셀)에 맞춰 캔버스 픽셀을 다시 잡고(선명하게), 눈금 → 선 → 마지막 점 차례로 그린다.
 * 그릴 수 없으면(캔버스가 없거나 크기가 0) false를 돌려준다.
 */
export function drawChart(canvas: HTMLCanvasElement, options: DrawChartOptions): boolean {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width <= 0 || height <= 0) {
    return false;
  }
  const ratio = Math.min(3, Math.max(1, globalThis.devicePixelRatio ?? 1));
  const pixelWidth = Math.round(width * ratio);
  const pixelHeight = Math.round(height * ratio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const context = canvas.getContext('2d');
  if (context === null) {
    return false;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

  const box: ChartBox = { width, height, ...CHART_PADDING };
  const { colors, points, range } = options;

  // 눈금 세 줄과 글자
  context.strokeStyle = colors.grid;
  context.fillStyle = colors.text;
  context.lineWidth = 1;
  context.font = '11px system-ui, sans-serif';
  context.textAlign = 'right';
  context.textBaseline = 'middle';
  for (const tick of axisTicks(range)) {
    const { y } = pointAt(0, tick, 2, box, range);
    context.beginPath();
    context.moveTo(box.padLeft, Math.round(y) + 0.5);
    context.lineTo(width - box.padRight, Math.round(y) + 0.5);
    context.stroke();
    context.fillText(tickLabel(tick), box.padLeft - 6, y);
  }

  if (points.length === 0) {
    context.textAlign = 'center';
    context.fillText(options.emptyText, width / 2, height / 2);
    return true;
  }

  const drawn = chartPointsOf(points, box, range);
  // 선 아래를 옅게 칠해 값이 큰 쪽을 한눈에 알아보게 한다.
  const first = drawn[0];
  const last = drawn[drawn.length - 1];
  if (first !== undefined && last !== undefined && drawn.length > 1) {
    context.beginPath();
    context.moveTo(first.x, height - box.padBottom);
    for (const point of drawn) {
      context.lineTo(point.x, point.y);
    }
    context.lineTo(last.x, height - box.padBottom);
    context.closePath();
    context.fillStyle = colors.fill;
    context.fill();
  }

  context.beginPath();
  drawn.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  });
  context.strokeStyle = colors.line;
  context.lineWidth = 2;
  context.lineJoin = 'round';
  context.stroke();

  if (last !== undefined) {
    context.beginPath();
    context.arc(last.x, last.y, 3.5, 0, Math.PI * 2);
    context.fillStyle = colors.line;
    context.fill();
  }
  return true;
}
