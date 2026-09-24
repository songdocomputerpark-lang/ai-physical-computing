// 받은 글에서 숫자 꺼내기·최근 값 모으기(P4-07) — 구역 D 2차.
// 지키는 것: PLAN §7.2 규칙 1의 메시지 모양 세 가지(값 하나 / 쉼표로 나눈 값 / 머리말 + 필드)를 위젯이 그대로 읽는다.
import { describe, expect, it } from 'vitest';
import { Series, axisRange, formatValue, logLine, parseNumber, widgetWants } from '../../../src/lab/dashboard/values.ts';
import { newWidgetSpec } from '../../../src/lab/dashboard/defaults.ts';
import type { SourceMessage } from '../../../src/lab/dashboard/types.ts';

function message(topic: string, text: string, at = 1_700_000_000_000): SourceMessage {
  return { topic, text, at };
}

describe('숫자 꺼내기(§7.2 규칙 1)', () => {
  it('값 하나는 그대로 읽는다', () => {
    expect(parseNumber('3')).toBe(3);
    expect(parseNumber(' 42 \n')).toBe(42);
    expect(parseNumber('-1.5')).toBe(-1.5);
  });

  it('쉼표로 나눈 값은 몇 번째인지 골라 읽는다', () => {
    expect(parseNumber('355,152', 0)).toBe(355);
    expect(parseNumber('355,152', 1)).toBe(152);
    expect(parseNumber('355,152', 2)).toBeNull();
  });

  it('머리말이 있으면 머리말은 세지 않는다', () => {
    expect(parseNumber('DATA,120,80', 0)).toBe(120);
    expect(parseNumber('DATA,120,80', 1)).toBe(80);
    expect(parseNumber('COUNT,7', 0)).toBe(7);
  });

  it('숫자가 아니면 null이다(그래프가 그리지 않고 까닭을 보여 준다)', () => {
    expect(parseNumber('on')).toBeNull();
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('DATA,x,y', 0)).toBeNull();
  });
});

describe('토픽 고르기', () => {
  it('같은 토픽만 받는다', () => {
    const spec = { ...newWidgetSpec('chart', 'c1'), topic: 'esp32-01/tx' };
    expect(widgetWants(spec, message('esp32-01/tx', '1'))).toBe(true);
    expect(widgetWants(spec, message('esp32-02/tx', '1'))).toBe(false);
  });

  it('와일드카드(+·#)도 쓸 수 있다', () => {
    const one = { ...newWidgetSpec('log', 'l1'), topic: '#' };
    expect(widgetWants(one, message('esp32-01/tx', '1'))).toBe(true);
    const plus = { ...newWidgetSpec('log', 'l2'), topic: '+/tx' };
    expect(widgetWants(plus, message('esp32-01/tx', '1'))).toBe(true);
    expect(widgetWants(plus, message('esp32-01/rx', '1'))).toBe(false);
  });

  it('토픽이 비어 있으면 아무것도 받지 않는다', () => {
    const spec = { ...newWidgetSpec('gauge', 'g1'), topic: '  ' };
    expect(widgetWants(spec, message('esp32-01/tx', '1'))).toBe(false);
  });
});

describe('최근 값 모으기', () => {
  it('정해진 개수만 들고 있는다(오래된 것부터 버린다)', () => {
    const series = new Series(3);
    for (let index = 0; index < 5; index += 1) {
      series.push(index, index);
    }
    expect(series.length).toBe(3);
    expect(series.points.map((point) => point.value)).toEqual([2, 3, 4]);
    expect(series.last?.value).toBe(4);
  });

  it('숫자가 아닌 값은 넣지 않는다', () => {
    const series = new Series();
    series.push(Number.NaN, 1);
    expect(series.length).toBe(0);
  });

  it('눈금은 설정값을 쓰되 값이 넘으면 넓힌다', () => {
    const series = new Series();
    series.push(150, 1);
    expect(axisRange({ min: 0, max: 100 }, series)).toEqual({ min: 0, max: 150 });
  });

  it('값이 모두 같아도 선이 보이게 위아래를 벌린다', () => {
    const series = new Series();
    series.push(7, 1);
    expect(axisRange({ min: 7, max: 7 }, series)).toEqual({ min: 6, max: 8 });
  });
});

describe('화면 글', () => {
  it('값은 짧게 보여 주고 단위를 붙인다', () => {
    expect(formatValue(23.456, '℃')).toBe('23.5℃');
    expect(formatValue(120)).toBe('120');
  });

  it('로그 한 줄은 시:분:초와 토픽, 글이다', () => {
    const line = logLine(message('esp32-01/tx', '42'));
    expect(line).toMatch(/^\d{2}:\d{2}:\d{2} esp32-01\/tx → 42$/u);
  });
});
