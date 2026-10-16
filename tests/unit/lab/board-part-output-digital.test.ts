// @vitest-environment jsdom
// 부품 output-digital(범용 디지털 출력 표시등) 단위 테스트 — README 7.5 "부품 하나 = 테스트 파일 하나", 판 1.5.0 DECISIONS C157.
// 파이썬 Pin(n, Pin.OUT).on()이 이 부품을 켜는지는 pyodide-board-generic-parts.test.ts(실제 Pyodide)가 본다.
import { afterEach, describe, expect, it } from 'vitest';
import { snapshotAfterRun } from '../../../src/lab/modules/board/index.ts';
import { PART_DEFINITIONS, resolveWiring, wiringValue } from '../../../src/lab/modules/board/parts.ts';
import output from '../../../src/lab/modules/board/parts/output-digital/part.ts';
import {
  OUTPUT_COLORS,
  OUTPUT_COLOR_NAMES,
  OUTPUT_COLOR_PALETTE,
  OUTPUT_KINDS,
  outputDigitalSettings,
  outputKindName,
} from '../../../src/lab/modules/board/parts/output-digital/output-digital-model.ts';
import { svgElement } from '../../../src/lab/modules/board/svg.ts';
import { instanceOf, snapshotWith } from './helpers/board-snapshot.ts';

afterEach(() => {
  document.body.replaceChildren();
});

const on = snapshotWith([{ id: 4, mode: 'out', out: 1, level: 1, driven: true }]);
const off = snapshotWith([{ id: 4, mode: 'out', out: 0, level: 0, driven: true }]);
const pwm = snapshotWith([{ id: 4, mode: 'pwm', out: 0, level: 1, driven: true, duty: 0.4, freq: 1000 }]);
const input = snapshotWith([{ id: 4, mode: 'in', out: 0, level: 1, driven: false }]);

function visualOf(snapshot: ReturnType<typeof snapshotWith>, options?: Record<string, string | number | boolean>, gpio = 4) {
  const instance = instanceOf('output-digital', { sig: gpio }, options === undefined ? {} : { options });
  return output.visual({ snapshot, instance, active: false, reducedMotion: false });
}

describe('부품: 범용 디지털 출력 표시등(output-digital)', () => {
  it('바깥 출력 부품: 신호 1핀(out), 기본 핀 없음, 조작 칸·interaction 없음 — 소리 부품이 아니다', () => {
    expect(output.pins).toEqual([{ role: 'sig', label: '신호', direction: 'out' }]);
    expect(output.defaultPins).toBeUndefined();
    expect(output.interaction).toBeUndefined();
    expect(output.controls).toBeUndefined();
    expect(output.sound).toBeUndefined();
    expect(output.title).toBe('디지털 출력 장치');
    expect(output.description).toContain('소리는 내지 않아요');
    expect(PART_DEFINITIONS.get('output-digital')).toBe(output);
  });

  it('핀이 1이면 켜짐(밝기 100), PWM이면 켜진 비율, 0·입력·핀 없음·[정지]면 꺼짐', () => {
    expect(visualOf(on)).toEqual({ lit: true, brightness: 100, kind: 'led', color: 'red', summary: '켜짐' });
    expect(visualOf(pwm)).toMatchObject({ lit: true, brightness: 40, summary: '켜짐(세기 40%)' });
    expect(visualOf(off)).toMatchObject({ lit: false, brightness: 0, summary: '꺼짐' });
    expect(visualOf(input)).toMatchObject({ lit: false });
    expect(visualOf(on, undefined, 5)).toMatchObject({ lit: false });
    expect(visualOf(snapshotAfterRun(on, { outcome: 'killed' }))).toMatchObject({ lit: false, summary: '꺼짐' });
    expect(visualOf(snapshotAfterRun(on, { outcome: 'ok' }))).toMatchObject({ lit: true });
  });

  it('종류와 색: led(색 다섯 가지)·relay·load, 색 이름·종류 이름이 글자로 있고 릴레이는 접점 얘기를 한다', () => {
    expect([...OUTPUT_KINDS]).toEqual(['led', 'relay', 'load']);
    expect([...OUTPUT_COLORS]).toEqual(['red', 'yellow', 'green', 'blue', 'white']);
    for (const color of OUTPUT_COLORS) {
      expect(OUTPUT_COLOR_NAMES[color]).not.toBe('');
      expect(OUTPUT_COLOR_PALETTE[color].on).toMatch(/^#[0-9a-f]{6}$/u);
      expect(OUTPUT_COLOR_PALETTE[color].on).not.toBe(OUTPUT_COLOR_PALETTE[color].off);
    }
    expect(outputKindName(outputDigitalSettings({ color: 'green' }).settings)).toBe('초록 LED');
    expect(outputKindName(outputDigitalSettings({ kind: 'relay' }).settings)).toBe('릴레이');
    expect(outputKindName(outputDigitalSettings({ kind: 'load' }).settings)).toBe('출력 장치');
    expect(visualOf(on, { color: 'blue' })).toMatchObject({ kind: 'led', color: 'blue', summary: '켜짐' });
    expect(visualOf(on, { kind: 'relay' })).toMatchObject({ kind: 'relay', lit: true, summary: '켜짐 · 접점이 붙었어요' });
    expect(visualOf(off, { kind: 'relay' })).toMatchObject({ lit: false, summary: '꺼짐 · 접점이 떨어졌어요' });
    expect(visualOf(pwm, { kind: 'relay' }).summary).toBe('켜짐(세기 40%) · 접점이 붙었어요');
    expect(visualOf(on, { kind: 'load' })).toMatchObject({ kind: 'load', summary: '켜짐' });
  });

  it('설정: kind·color만 받고, 철자 틀린 이름·없는 값은 기본으로 돌려 문제 문장을 낸다', () => {
    expect(outputDigitalSettings(undefined)).toEqual({ settings: { kind: 'led', color: 'red' }, problems: [] });
    const bad = outputDigitalSettings({ color: 'purple', kind: 'buzzer', colour: 'red' });
    expect(bad.settings).toEqual({ kind: 'led', color: 'red' });
    expect(bad.problems).toHaveLength(3);
    expect(bad.problems.join('\n')).toContain('"colour" 설정은 이 부품에 없어요');
    expect(bad.problems.join('\n')).toContain('"color" 설정은 red·yellow·green·blue·white 가운데 하나예요');
    expect(bad.problems.join('\n')).toContain('"kind" 설정은 led·relay·load 가운데 하나예요');
  });

  it('배선: 입력 전용 핀(34~39)은 오류, 같은 핀의 입력 부품과는 오류, 출력 둘은 참고, 설정이 틀리면 주의 — pin 하나로 적는다', () => {
    const ok = resolveWiring([{ part: 'output-digital', pin: 4, label: '빨강 LED', options: { color: 'red' } }], PART_DEFINITIONS);
    expect(ok.issues).toEqual([]);
    expect(ok.instances.find((item) => item.part === 'output-digital')).toMatchObject({ pins: { sig: 4 }, label: '빨강 LED', options: { color: 'red' } });
    expect(wiringValue(ok.instances).parts.find((item) => item.part === 'output-digital')).toMatchObject({ directions: { sig: 'out' }, label: '빨강 LED' });
    expect(resolveWiring([{ part: 'output-digital', pin: 34 }], PART_DEFINITIONS).issues.map((issue) => issue.code)).toContain('input-only-output');
    expect(resolveWiring([{ part: 'output-digital' }], PART_DEFINITIONS).issues.map((issue) => issue.code)).toContain('missing-pin');
    const clash = resolveWiring([{ part: 'sensor-digital', pin: 23 }, { part: 'output-digital', pin: 23 }], PART_DEFINITIONS);
    expect(clash.issues.map((issue) => issue.code)).toContain('input-output-same-pin');
    const twin = resolveWiring([{ part: 'output-digital', pin: 4 }, { part: 'output-digital', id: 'relay', pin: 4, options: { kind: 'relay' } }], PART_DEFINITIONS);
    expect(twin.issues.map((issue) => issue.code)).toEqual(['shared-output']);
    const typo = resolveWiring([{ part: 'output-digital', pin: 4, options: { color: 'purple' } }], PART_DEFINITIONS);
    expect(typo.issues.map((issue) => [issue.level, issue.code])).toEqual([['warning', 'bad-option']]);
    // 스트래핑 핀(12)에 바깥 출력 부품을 이으면 주의
    expect(resolveWiring([{ part: 'output-digital', pin: 12 }], PART_DEFINITIONS).issues.map((issue) => issue.code)).toEqual(['strapping']);
  });

  it('그림: LED는 색 이름·켜짐/꺼짐 글자, 이름이 없으면 종류 이름이 제목, 릴레이는 접점 막대가 움직인다, 낭독 설명에 전체 이름', () => {
    const make = (options: Record<string, string | number | boolean> | undefined, label?: string) => {
      const instance = instanceOf('output-digital', { sig: 4 }, { ...(options === undefined ? {} : { options }), label: label ?? output.title });
      const root = svgElement('g', { 'data-board-part': instance.id });
      const target = svgElement('g');
      root.append(target);
      document.body.append(svgElement('svg', {}, [root]));
      const update = output.render(target, { instance, definition: output, svg: svgElement });
      return { instance, root, target, update };
    };
    const texts = (target: Element) => [...target.querySelectorAll('text')].map((node) => node.textContent);
    const extra = { snapshot: on, reducedMotion: false };

    const led = make({ color: 'yellow' });
    expect(texts(led.target)).toEqual(expect.arrayContaining(['IO4', '노랑 LED', '꺼짐']));
    led.update(visualOf(on, { color: 'yellow' }), extra);
    expect(texts(led.target)).toContain('켜짐');
    expect(led.target.querySelectorAll('circle')[1]?.getAttribute('fill')).toBe(OUTPUT_COLOR_PALETTE.yellow.on);
    led.update(visualOf(pwm, { color: 'yellow' }), extra);
    expect(texts(led.target)).toContain('켜짐 40%');
    led.update(visualOf(off, { color: 'yellow' }), extra);
    expect(led.target.querySelectorAll('circle')[1]?.getAttribute('fill')).toBe(OUTPUT_COLOR_PALETTE.yellow.off);
    expect(led.root.querySelector('desc[data-part-desc]')?.textContent).toBe('노랑 LED: 꺼짐. 신호 핀이 1이면 켜져요.');

    const named = make({ color: 'green' }, '초록 불빛 아주아주아주 긴 이름');
    const title = named.target.querySelector('.board-part__title')?.textContent ?? '';
    expect(title.endsWith('…')).toBe(true);
    expect(texts(named.target)).toContain('초록 LED');
    named.update(visualOf(on, { color: 'green' }), extra);
    expect(named.root.querySelector('desc[data-part-desc]')?.textContent).toBe('초록 불빛 아주아주아주 긴 이름(초록 LED): 켜짐. 신호 핀이 1이면 켜져요.');

    const relay = make({ kind: 'relay' }, '릴레이');
    expect(texts(relay.target)).toEqual(expect.arrayContaining(['릴레이', '꺼짐']));
    const arm = relay.target.querySelector('line') as SVGLineElement;
    relay.update(visualOf(off, { kind: 'relay' }), extra);
    expect(arm.getAttribute('y2')).toBe('38');
    relay.update(visualOf(on, { kind: 'relay' }), extra);
    expect(arm.getAttribute('y2')).toBe('46');
    expect(texts(relay.target)).toContain('켜짐');
    expect(relay.root.querySelector('desc[data-part-desc]')?.textContent).toBe('릴레이: 켜짐 · 접점이 붙었어요. 신호 핀이 1이면 켜져요.');

    const load = make({ kind: 'load' }, '전자석');
    load.update(visualOf(on, { kind: 'load' }), extra);
    expect(texts(load.target)).toEqual(expect.arrayContaining(['전자석', '출력 장치', '켜짐']));
  });
});
