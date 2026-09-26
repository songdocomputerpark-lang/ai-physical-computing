// 부품 rgb-led(RGB LED 모듈) 단위 테스트 — README 7.5 "부품 하나 = 테스트 파일 하나", PLAN §6.2·§8.3 P3-03.
import { describe, expect, it } from 'vitest';
import { snapshotAfterRun } from '../../../src/lab/modules/board/index.ts';
import { partAnchors } from '../../../src/lab/modules/board/layout.ts';
import { PART_DEFINITIONS, resolveWiring } from '../../../src/lab/modules/board/parts.ts';
import rgb from '../../../src/lab/modules/board/parts/rgb-led/part.ts';
import { colorName, hueOf, mixedColor, percentOf, rgbVisual } from '../../../src/lab/modules/board/parts/rgb-led/rgb-model.ts';
import { instanceOf, snapshotWith } from './helpers/board-snapshot.ts';

const instance = instanceOf('rgb-led', { r: 27, g: 32, b: 33 }, { usesDefaultPins: false });

function visualOf(pins: Record<string, unknown>[], phase = 'run') {
  return rgb.visual({ snapshot: snapshotWith(pins, phase), instance, active: false, reducedMotion: false });
}

describe('부품: RGB LED(rgb-led)', () => {
  it('바깥 출력 부품: 역할 r·g·b(빨강·초록·파랑), 기본 핀 없음(예제마다 핀이 다름 — PD-05), 신호 자리는 윗변 9·27·45', () => {
    expect(rgb.pins).toEqual([
      { role: 'r', label: '빨강', direction: 'out' },
      { role: 'g', label: '초록', direction: 'out' },
      { role: 'b', label: '파랑', direction: 'out' },
    ]);
    expect(rgb.defaultPins).toBeUndefined();
    expect(rgb.onboard).toBeUndefined();
    expect(partAnchors(rgb)).toEqual({ r: { x: 9, y: 0 }, g: { x: 27, y: 0 }, b: { x: 45, y: 0 } });
  });

  it('출력 1(HIGH)이면 그 색 100 %, PWM이면 duty만큼, 아주 작은 duty도 1 %, 입력·[정지]면 꺼짐', () => {
    expect(visualOf([{ id: 27, mode: 'out', out: 1, level: 1, driven: true }])).toMatchObject({ r: 100, g: 0, b: 0, lit: true, brightness: 100, color: '#ff0000', name: '빨강' });
    expect(visualOf([{ id: 32, mode: 'pwm', out: 0, level: 1, driven: true, duty: 0.5, freq: 1000 }])).toMatchObject({ r: 0, g: 50, b: 0, brightness: 50, name: '초록' });
    expect(visualOf([{ id: 33, mode: 'pwm', out: 0, level: 1, driven: true, duty: 0.000977, freq: 5000 }])).toMatchObject({ b: 1, lit: true });
    expect(visualOf([{ id: 27, mode: 'in', out: 1, level: 0, driven: false }])).toMatchObject({ r: 0, lit: false, name: '꺼짐' });
    const on = snapshotWith([{ id: 27, mode: 'out', out: 1, level: 1, driven: true }]);
    expect(rgb.visual({ snapshot: snapshotAfterRun(on, { outcome: 'stopped' }), instance, active: false, reducedMotion: false })).toMatchObject({ lit: false });
    // 스스로 끝나면 마지막 모습(실물과 같음)
    expect(visualOf([{ id: 27, mode: 'out', out: 1, level: 1, driven: true }], 'end')).toMatchObject({ lit: true });
  });

  it('교과서 f058 set_color(255, 255, 255)(duty 1020) → 흰색, 두 색 → 노랑·자홍·청록, 세기는 글자로도(summary)', () => {
    const white = visualOf([12, 5, 4].map((id) => ({ id, mode: 'pwm', out: 0, level: 1, driven: true, duty: 1020 / 1024, freq: 998 })));
    // 배선 핀이 27/32/33이라 이 스냅샷에서는 꺼짐 — f058 배선(12/5/4)으로 다시 본다
    expect(white.lit).toBe(false);
    const f058 = instanceOf('rgb-led', { r: 12, g: 5, b: 4 }, { usesDefaultPins: false });
    const mixed = rgb.visual({
      snapshot: snapshotWith([12, 5, 4].map((id) => ({ id, mode: 'pwm', out: 0, level: 1, driven: true, duty: 1020 / 1024, freq: 998 }))),
      instance: f058,
      active: false,
      reducedMotion: false,
    });
    expect(mixed).toMatchObject({ r: 100, g: 100, b: 100, name: '흰색', color: '#ffffff' });
    // 같은 세기로 둘씩 섞으면 노랑·자홍·청록(2-1-4 빛의 삼원색 그림·퀴즈와 같은 이름)
    expect(colorName({ r: 100, g: 100, b: 0 })).toBe('노랑');
    expect(colorName({ r: 10, g: 0, b: 10 })).toBe('자홍');
    expect(colorName({ r: 0, g: 10, b: 10 })).toBe('청록');
    expect(rgbVisual({ r: 100, g: 0, b: 60 }).summary).toBe('자홍 — 빨강 100% · 초록 0% · 파랑 60%');
    expect(mixedColor({ r: 25, g: 0, b: 0 })).toBe('#800000');
  });

  it('색 이름은 켜졌는지가 아니라 세 색의 비율로 정한다 — 2-1-5 무지개 표(원고 150쪽)의 일곱 색(미해결 176)', () => {
    // set_color(r, g, b)는 0~255 값에 4를 곱해 duty(0~1023)로 넣는다(2-1-3 예제 4, 2-1-4 도전 과제 2) → 세기 % = duty ÷ 1024
    const namedAs = (r: number, g: number, b: number) => {
      const levels = [r, g, b].map((value) => percentOf((value * 4) / 1024));
      return colorName({ r: levels[0]!, g: levels[1]!, b: levels[2]! });
    };
    expect(namedAs(255, 0, 0)).toBe('빨강');
    expect(namedAs(255, 94, 0)).toBe('주황');
    expect(namedAs(255, 228, 0)).toBe('노랑');
    expect(namedAs(0, 255, 0)).toBe('초록');
    expect(namedAs(0, 0, 255)).toBe('파랑');
    // 남색 (0, 0, 75)은 파랑만 약하게 켠 것 — 이름은 비율만 보고(파랑), 어둡다는 것은 세기 글이 알린다
    expect(namedAs(0, 0, 75)).toBe('파랑');
    expect(rgbVisual({ r: 0, g: 0, b: percentOf((75 * 4) / 1024) }).summary).toBe('파랑 — 빨강 0% · 초록 0% · 파랑 29%');
    expect(namedAs(95, 0, 255)).toBe('보라');
    // 주황의 세기 글은 교사용 안내(2-1-4)와 같다
    expect(rgbVisual({ r: percentOf(1020 / 1024), g: percentOf(376 / 1024), b: 0 }).summary).toBe('주황 — 빨강 100% · 초록 37% · 파랑 0%');
    // 밝기만 다르면 같은 이름, 연두·붉은빛이 도는 자홍 쪽 경계, 세 색이 거의 같으면 흰색, 모두 꺼지면 꺼짐
    expect(colorName({ r: 12, g: 0, b: 0 })).toBe('빨강');
    expect(colorName({ r: 50, g: 100, b: 0 })).toBe('연두');
    expect(colorName({ r: 100, g: 0, b: 25 })).toBe('빨강');
    expect(colorName({ r: 100, g: 0, b: 40 })).toBe('자홍');
    expect(colorName({ r: 100, g: 90, b: 80 })).toBe('흰색');
    expect(colorName({ r: 100, g: 100, b: 70 })).toBe('노랑');
    expect(colorName({ r: 0, g: 0, b: 0 })).toBe('꺼짐');
    expect(hueOf({ r: 100, g: 37, b: 0 })).toBeCloseTo(22.2, 1);
    expect(hueOf({ r: 40, g: 40, b: 40 })).toBeNull();
    expect(percentOf(0)).toBe(0);
    expect(percentOf(0.004)).toBe(1);
    expect(percentOf(1)).toBe(100);
  });

  it('예제 배선: 원고 2-1-4(27·32·33)는 문제 없음, f058(12·5·4)은 스트래핑 핀 12·5 "주의"(원고 그대로), 핀 하나 줄임 표기는 오류', () => {
    const f061 = resolveWiring([{ part: 'rgb-led', pins: { r: 27, g: 32, b: 33 } }], PART_DEFINITIONS);
    expect(f061.issues.filter((issue) => issue.level !== 'info')).toEqual([]);
    expect(f061.instances.find((item) => item.part === 'rgb-led')?.pins).toEqual({ r: 27, g: 32, b: 33 });
    const f058 = resolveWiring([{ part: 'rgb-led', pins: { r: 12, g: 5, b: 4 } }], PART_DEFINITIONS);
    expect(f058.issues.filter((issue) => issue.code === 'strapping').map((issue) => issue.gpio)).toEqual([5, 12]);
    const shorthand = resolveWiring([{ part: 'rgb-led', pin: 27 }], PART_DEFINITIONS);
    expect(shorthand.issues.map((issue) => issue.code)).toContain('pin-shorthand');
  });
});
