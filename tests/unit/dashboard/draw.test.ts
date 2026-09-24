// 그래프·게이지 자리 계산(P4-07) — 구역 D 2차.
// 라이브러리 없이 직접 그리므로(새 패키지 금지) 좌표 계산이 맞는지를 여기서 지킨다.
import { describe, expect, it } from 'vitest';
import { CHART_PADDING, axisTicks, chartPointsOf, pointAt, tickLabel, type ChartBox } from '../../../src/lab/dashboard/chart.ts';
import { GAUGE_END_DEG, GAUGE_START_DEG, arcPath, gaugeAngle, gaugeRatio, needleTip, polar, trackPath, valuePath } from '../../../src/lab/dashboard/gauge.ts';

const box: ChartBox = { width: 300, height: 150, ...CHART_PADDING };
const range = { min: 0, max: 100 };

describe('그래프 자리', () => {
  it('가장 작은 값은 아래, 가장 큰 값은 위에 찍힌다', () => {
    const low = pointAt(0, 0, 2, box, range);
    const high = pointAt(1, 100, 2, box, range);
    expect(low.y).toBeCloseTo(box.height - box.padBottom, 5);
    expect(high.y).toBeCloseTo(box.padTop, 5);
    expect(high.x).toBeCloseTo(box.width - box.padRight, 5);
  });

  it('눈금 밖의 값도 그림 안에 머문다(선이 칸 밖으로 나가지 않게)', () => {
    const over = pointAt(0, 999, 2, box, range);
    expect(over.y).toBeGreaterThanOrEqual(box.padTop - 0.001);
  });

  it('점이 하나면 오른쪽 끝에 찍는다(가장 최근 값)', () => {
    const only = chartPointsOf([{ at: 1, value: 50 }], box, range);
    expect(only).toHaveLength(1);
    expect(only[0]?.x).toBeCloseTo(box.width - box.padRight, 5);
  });

  it('점은 왼쪽부터 오른쪽으로 고르게 놓인다', () => {
    const points = chartPointsOf(
      [
        { at: 1, value: 0 },
        { at: 2, value: 50 },
        { at: 3, value: 100 },
      ],
      box,
      range,
    );
    expect(points.map((point) => Math.round(point.x))).toEqual([38, 165, 292]);
  });

  it('눈금 글은 셋(위·가운데·아래)이다', () => {
    expect(axisTicks({ min: 0, max: 10 })).toEqual([10, 5, 0]);
    expect(tickLabel(12.34)).toBe('12');
    expect(tickLabel(1.25)).toBe('1.3');
  });
});

describe('게이지 자리', () => {
  it('눈금 밖의 값은 끝에 붙인다', () => {
    expect(gaugeRatio(-5, 0, 100)).toBe(0);
    expect(gaugeRatio(150, 0, 100)).toBe(1);
    expect(gaugeRatio(25, 0, 100)).toBeCloseTo(0.25, 5);
  });

  it('0은 왼쪽 아래에서, 1은 오른쪽 아래에서 끝난다', () => {
    expect(gaugeAngle(0)).toBe(GAUGE_START_DEG);
    expect(gaugeAngle(1)).toBe(GAUGE_END_DEG);
    expect(gaugeAngle(0.5)).toBe(0);
  });

  it('12시가 0도이고 시계 방향으로 잰다', () => {
    const up = polar(0, 0, 10, 0);
    expect(up.x).toBeCloseTo(0, 5);
    expect(up.y).toBeCloseTo(-10, 5);
    const right = polar(0, 0, 10, 90);
    expect(right.x).toBeCloseTo(10, 5);
    expect(right.y).toBeCloseTo(0, 5);
  });

  it('원호 경로는 숫자만 든 SVG 경로다', () => {
    const path = arcPath(60, 62, 44, GAUGE_START_DEG, 0);
    expect(path).toMatch(/^M -?[\d.]+ -?[\d.]+ A 44 44 0 [01] [01] -?[\d.]+ -?[\d.]+$/u);
    expect(path).not.toContain('NaN');
    expect(trackPath(60, 62, 44)).not.toContain('NaN');
    expect(valuePath(60, 62, 44, 0.5)).not.toContain('NaN');
  });

  it('바늘 끝은 값이 커질수록 오른쪽으로 간다', () => {
    const low = needleTip(60, 62, 36, 0.1);
    const high = needleTip(60, 62, 36, 0.9);
    expect(high.x).toBeGreaterThan(low.x);
  });
});
