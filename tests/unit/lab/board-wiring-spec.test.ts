// 예제 배선 글 맞추기(src/lab/modules/board/wiring-spec.ts) 단위 테스트 — P3-02.
// 차시 md frontmatter(PLAN §2.6 type·밑줄)·사이드카(part·pins)·머리말 `# @part` 세 모양이 같은 WiringEntry가 되는지 본다.
import { describe, expect, it } from 'vitest';
import { gpioFromSpec, normalizeWiringItem, normalizeWiringSpecs, parsePartDirective, partIdFromSpec } from '../../../src/lab/modules/board/wiring-spec.ts';

describe('배선 한 줄 맞추기', () => {
  it('PLAN §2.6 예시(type·밑줄)와 사이드카 모양(part·pins·id·label)을 같은 모양으로', () => {
    expect(normalizeWiringSpecs([{ type: 'builtin_led', pin: 2 }, { type: 'touch_digital', pin: 17 }], 'md')).toEqual({
      entries: [
        { part: 'builtin-led', pin: 2 },
        { part: 'touch-digital', pin: 17 },
      ],
      errors: [],
    });
    expect(normalizeWiringSpecs([{ part: 'lcd-i2c', id: 'lcd', pins: { sda: 21, scl: '22' }, label: ' 문자 LCD ' }], '사이드카')).toEqual({
      entries: [{ part: 'lcd-i2c', id: 'lcd', pins: { sda: 21, scl: 22 }, label: '문자 LCD' }],
      errors: [],
    });
    expect(partIdFromSpec(' Touch_Digital ')).toBe('touch-digital');
  });

  it('핀 번호 글: 17·"17"·"GPIO17"·"IO17"·"D17"을 받고 음수·소수·글자는 받지 않는다', () => {
    expect([17, '17', 'GPIO17', 'io17', 'D17', ' 5 '].map(gpioFromSpec)).toEqual([17, 17, 17, 17, 17, 5]);
    expect([-1, 1.5, 'x', '123', null, true].map(gpioFromSpec)).toEqual([null, null, null, null, null, null]);
  });

  it('틀린 줄은 빼고 까닭을 한국어로 모은다(빌드 경고)', () => {
    const result = normalizeWiringSpecs(
      [
        'touch-digital',
        { pin: 17 },
        { part: 'Touch Sensor', pin: 17 },
        { part: 'touch-digital', pin: 'x' },
        { part: 'rgb-led', pins: [27, 32] },
        { part: 'rgb-led', pins: { R: 27 } },
        { part: 'touch-digital', id: 'Bad Id', pin: 17 },
      ],
      '사이드카',
    );
    expect(result.entries).toEqual([{ part: 'touch-digital', pin: 17 }]);
    expect(result.errors).toHaveLength(7);
    expect(result.errors[0]).toContain('사이드카 parts 1번째: 배선 한 줄은');
    expect(result.errors[1]).toContain('부품 이름(part)을 적어요');
    expect(result.errors[2]).toContain('"Touch Sensor"은(는) 영문 소문자');
    expect(result.errors[3]).toContain('핀 번호(pin) "x"');
    expect(result.errors[4]).toContain('pins는 { 역할: 핀 번호 }');
    expect(result.errors[5]).toContain('"R: 27"');
    expect(result.errors[6]).toContain('배선 이름(id) "Bad Id"');
    expect(normalizeWiringSpecs('touch', 'md').errors[0]).toContain('parts는 목록으로');
    expect(normalizeWiringSpecs(undefined, 'md')).toEqual({ entries: [], errors: [] });
    expect(normalizeWiringItem({ part: 'x' }, 'here').entry).toEqual({ part: 'x' });
  });
});

describe('머리말 # @part 한 줄', () => {
  it('부품 이름 + 핀 번호 / 역할=핀 / as 이름', () => {
    expect(parsePartDirective('touch-digital 17')).toEqual({ part: 'touch-digital', pin: '17' });
    expect(parsePartDirective('rgb-led r=27 g=32 b=33 as rgb')).toEqual({ part: 'rgb-led', pins: { r: '27', g: '32', b: '33' }, id: 'rgb' });
    expect(parsePartDirective('vibration-motor')).toEqual({ part: 'vibration-motor' });
    expect(normalizeWiringItem(parsePartDirective('rgb-led r=27 g=32 b=33 as rgb'), '머리말').entry).toEqual({ part: 'rgb-led', id: 'rgb', pins: { r: 27, g: 32, b: 33 } });
  });

  it('읽지 못하는 낱말이 있으면 그 줄을 버린다', () => {
    expect(parsePartDirective('')).toBeNull();
    expect(parsePartDirective('touch-digital 17 18')).toBeNull();
    expect(parsePartDirective('touch-digital pin 17')).toBeNull();
    expect(parsePartDirective('touch-digital 17 as')).toBeNull();
  });
});
