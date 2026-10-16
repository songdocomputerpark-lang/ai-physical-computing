// @vitest-environment jsdom
// 부품 sensor-digital(범용 디지털 센서) 단위 테스트 — README 7.5 "부품 하나 = 테스트 파일 하나", 판 1.5.0 DECISIONS C157.
// 순수 논리(model)·배선 검사는 DOM 없이, 그림(render)과 조작 칸(controls)은 jsdom에서 가짜 PartControlApi로 확인한다.
// 파이썬이 Pin(n, Pin.IN).value()로 이 부품의 값을 읽는지는 pyodide-board-generic-parts.test.ts(실제 Pyodide)가 본다.
import { afterEach, describe, expect, it } from 'vitest';
import type { PartControlApi, PartControlHandle, PartInstance } from '../../../src/lab/modules/board/part-types.ts';
import { PART_DEFINITIONS, inputDrives, resolveWiring, wiringValue, withControlDrive } from '../../../src/lab/modules/board/parts.ts';
import sensor from '../../../src/lab/modules/board/parts/sensor-digital/part.ts';
import {
  SENSOR_DIGITAL_IDLE,
  digitalSensorLevelText,
  digitalSensorSettings,
  digitalSensorStateText,
  digitalSensorVisual,
  isDetecting,
  sensorLevel,
} from '../../../src/lab/modules/board/parts/sensor-digital/sensor-digital-model.ts';
import type { PinDrive } from '../../../src/lab/modules/board/state.ts';
import { svgElement } from '../../../src/lab/modules/board/svg.ts';
import { instanceOf, snapshotWith } from './helpers/board-snapshot.ts';

const handles: PartControlHandle[] = [];

afterEach(() => {
  for (const handle of handles.splice(0)) {
    handle.destroy?.();
  }
  document.body.replaceChildren();
});

/** 조작 칸을 가짜 도구로 연다: 핀을 누른 값의 차례를 모은다 */
function openControls(instance: PartInstance) {
  const drives: [string, PinDrive][] = [];
  const api: PartControlApi = {
    instance,
    definition: sensor,
    setDrive: (role, drive) => drives.push([role, drive]),
    sendToDevice: () => undefined,
    storageName: (name) => `module:board:sensor-digital:${name}`,
  };
  const host = document.createElement('section');
  document.body.append(host);
  const handle = sensor.controls?.(host, api);
  if (handle) {
    handles.push(handle);
  }
  return { host, drives, handle };
}

function keyPress(element: Element, key: string, type: 'keydown' | 'keyup') {
  element.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true, cancelable: true }));
}

describe('부품: 범용 디지털 센서(sensor-digital)', () => {
  it('바깥 입력 부품: 신호 1핀, 기본 핀 없음(예제마다 다름), 조작은 조작 칸(controls) — interaction은 없다', () => {
    expect(sensor.pins).toEqual([{ role: 'sig', label: '신호', direction: 'in' }]);
    expect(sensor.defaultPins).toBeUndefined();
    expect(sensor.interaction).toBeUndefined();
    expect(typeof sensor.controls).toBe('function');
    expect(sensor.title).toBe('디지털 센서');
    expect(PART_DEFINITIONS.get('sensor-digital')).toBe(sensor);
  });

  it('신호 값: 감지 중이면 1(active_low면 0), 아니면 그 반대 — 누르고 있기와 켜 두기 둘 다 감지 중', () => {
    expect([sensorLevel(true, false), sensorLevel(false, false)]).toEqual([1, 0]);
    expect([sensorLevel(true, true), sensorLevel(false, true)]).toEqual([0, 1]);
    expect(isDetecting(SENSOR_DIGITAL_IDLE)).toBe(false);
    expect(isDetecting({ held: true, latched: false })).toBe(true);
    expect(isDetecting({ held: false, latched: true })).toBe(true);
    expect(isDetecting({ held: true, latched: true })).toBe(true);
  });

  it('모습: 감지됨·없음과 신호 값을 글자로 알린다(색만으로 알리지 않음)', () => {
    const normal = digitalSensorSettings(undefined).settings;
    expect(digitalSensorVisual(SENSOR_DIGITAL_IDLE, normal)).toEqual({ pressed: false, latched: false, level: 0, summary: '감지 없음 · 신호 0' });
    expect(digitalSensorVisual({ held: true, latched: false }, normal)).toEqual({ pressed: true, latched: false, level: 1, summary: '감지됨 · 신호 1' });
    expect(digitalSensorVisual({ held: false, latched: true }, normal)).toEqual({ pressed: true, latched: true, level: 1, summary: '감지됨 · 신호 1 · 켜 둠' });
    const low = digitalSensorSettings({ active_low: true }).settings;
    expect(digitalSensorVisual(SENSOR_DIGITAL_IDLE, low)).toMatchObject({ pressed: false, level: 1, summary: '감지 없음 · 신호 1' });
    expect(digitalSensorVisual({ held: true, latched: false }, low)).toMatchObject({ pressed: true, level: 0, summary: '감지됨 · 신호 0' });
    expect([digitalSensorStateText(true), digitalSensorStateText(false)]).toEqual(['감지됨', '없음']);
    expect([digitalSensorLevelText(1), digitalSensorLevelText(0)]).toEqual(['신호 1 (HIGH)', '신호 0 (LOW)']);
    // 보드 상태와 상관없이(입력 부품) visual은 조작 상태만 본다
    const snapshot = snapshotWith([{ id: 23, mode: 'in', out: 0, level: 0, driven: false }]);
    expect(sensor.visual({ snapshot, instance: instanceOf('sensor-digital', { sig: 23 }), active: false, reducedMotion: false })).toMatchObject({ pressed: false, level: 0 });
  });

  it('설정: active_low만 받고, 철자 틀린 이름·참거짓이 아닌 값은 문제 문장으로 알린다', () => {
    expect(digitalSensorSettings(undefined)).toEqual({ settings: { activeLow: false }, problems: [] });
    expect(digitalSensorSettings({ active_low: true }).settings.activeLow).toBe(true);
    const typo = digitalSensorSettings({ activeLow: true });
    expect(typo.settings.activeLow).toBe(false);
    expect(typo.problems.join('\n')).toContain('"activeLow" 설정은 이 부품에 없어요');
    expect(typo.problems.join('\n')).toContain('active_low');
    const text = digitalSensorSettings({ active_low: 'yes' });
    expect(text.settings.activeLow).toBe(false);
    expect(text.problems[0]).toContain('true나 false');
  });

  it('배선: pin 하나로 적고 화면 이름(label)·설정(options)이 부품 줄로 온다, 설정이 틀리면 주의 bad-option, 핀을 안 적으면 오류', () => {
    const ok = resolveWiring([{ part: 'sensor-digital', pin: 23, label: '움직임 센서', options: { active_low: true } }], PART_DEFINITIONS);
    expect(ok.issues).toEqual([]);
    const found = ok.instances.find((item) => item.part === 'sensor-digital');
    expect(found).toMatchObject({ id: 'sensor-digital', pins: { sig: 23 }, label: '움직임 센서', options: { active_low: true }, usesDefaultPins: false });
    expect(wiringValue(ok.instances).parts.find((item) => item.part === 'sensor-digital')).toMatchObject({ label: '움직임 센서', pins: { sig: 23 }, directions: { sig: 'in' }, known: true });
    // 이름을 안 적으면 부품 이름
    expect(resolveWiring([{ part: 'sensor-digital', pin: 23 }], PART_DEFINITIONS).instances.find((item) => item.part === 'sensor-digital')?.label).toBe('디지털 센서');
    const typo = resolveWiring([{ part: 'sensor-digital', pin: 23, options: { activelow: true } }], PART_DEFINITIONS);
    expect(typo.issues.map((issue) => [issue.level, issue.code])).toEqual([['warning', 'bad-option']]);
    expect(typo.issues[0]?.text).toContain('디지털 센서(sensor-digital)의 설정(options)');
    expect(resolveWiring([{ part: 'sensor-digital' }], PART_DEFINITIONS).issues.map((issue) => issue.code)).toContain('missing-pin');
    // 입력 부품이라 입력 전용 핀(34~39)에 이어도 된다, 같은 핀에 입력 부품 둘은 오류
    expect(resolveWiring([{ part: 'sensor-digital', pin: 34 }], PART_DEFINITIONS).issues).toEqual([]);
    expect(resolveWiring([{ part: 'sensor-digital', pin: 23 }, { part: 'sensor-digital', id: 'second', pin: 23 }], PART_DEFINITIONS).issues.map((issue) => issue.code)).toContain('shared-input');
  });

  it('조작 칸이 정한 값으로 핀을 누른다: 조작 칸이 없으면 누르지 않고, 있으면 inputDrives가 그 값을 쓴다', () => {
    const instance = instanceOf('sensor-digital', { sig: 23 });
    expect(inputDrives([instance], new Set(), PART_DEFINITIONS, new Map())).toEqual(new Map());
    const controlled = withControlDrive(new Map(), instance.id, 'sig', 1);
    expect(inputDrives([instance], new Set(), PART_DEFINITIONS, controlled).get(23)).toBe(1);
  });

  it('조작 칸: 처음엔 감지 없음 신호를 걸고, [누르고 있는 동안 감지]는 Space를 누르는 동안만, [켜 두기]는 체크하는 동안 계속', async () => {
    const instance = instanceOf('sensor-digital', { sig: 23 }, { label: '움직임 센서' });
    const { host, drives } = openControls(instance);
    await Promise.resolve();
    expect(drives.at(-1)).toEqual(['sig', 0]);
    const hold = host.querySelector<HTMLButtonElement>('[data-sensor-digital-hold]');
    const latch = host.querySelector<HTMLInputElement>('[data-sensor-digital-latch]');
    expect(hold?.textContent).toBe('누르고 있는 동안 감지 (신호 1)');
    expect(hold?.getAttribute('aria-pressed')).toBe('false');
    expect(latch?.closest('label')?.textContent).toContain('켜 두기');
    expect(host.querySelector('[data-sensor-digital-status]')?.textContent).toBe('지금: 감지 없음 · 신호 0');

    keyPress(hold as Element, ' ', 'keydown');
    expect(drives.at(-1)).toEqual(['sig', 1]);
    expect(hold?.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[data-sensor-digital-status]')?.textContent).toBe('지금: 감지됨 · 신호 1');
    expect(sensor.visual({ snapshot: snapshotWith([]), instance, active: false, reducedMotion: false })).toMatchObject({ pressed: true, level: 1 });
    keyPress(hold as Element, ' ', 'keyup');
    expect(drives.at(-1)).toEqual(['sig', 0]);
    expect(hold?.getAttribute('aria-pressed')).toBe('false');

    (latch as HTMLInputElement).checked = true;
    latch?.dispatchEvent(new Event('change', { bubbles: true }));
    expect(drives.at(-1)).toEqual(['sig', 1]);
    expect(sensor.visual({ snapshot: snapshotWith([]), instance, active: false, reducedMotion: false })).toMatchObject({ pressed: true, latched: true, summary: '감지됨 · 신호 1 · 켜 둠' });
    // 켜 둔 동안 누르기를 떼도 계속 감지
    keyPress(hold as Element, 'Enter', 'keydown');
    keyPress(hold as Element, 'Enter', 'keyup');
    expect(drives.at(-1)).toEqual(['sig', 1]);
    (latch as HTMLInputElement).checked = false;
    latch?.dispatchEvent(new Event('change', { bubbles: true }));
    expect(drives.at(-1)).toEqual(['sig', 0]);
  });

  it('조작 칸: active_low면 처음 신호가 1이고 누르면 0, 단추 이름도 신호 0', async () => {
    const instance = instanceOf('sensor-digital', { sig: 23 }, { options: { active_low: true } });
    const { host, drives } = openControls(instance);
    await Promise.resolve();
    expect(drives.at(-1)).toEqual(['sig', 1]);
    const hold = host.querySelector<HTMLButtonElement>('[data-sensor-digital-hold]');
    expect(hold?.textContent).toBe('누르고 있는 동안 감지 (신호 0)');
    keyPress(hold as Element, ' ', 'keydown');
    expect(drives.at(-1)).toEqual(['sig', 0]);
    keyPress(hold as Element, ' ', 'keyup');
    expect(drives.at(-1)).toEqual(['sig', 1]);
  });

  it('조작 칸을 없애면 조작 상태도 지워진다(다시 그리면 감지 없음에서 시작)', () => {
    const instance = instanceOf('sensor-digital', { sig: 23 });
    const { host, handle } = openControls(instance);
    keyPress(host.querySelector('[data-sensor-digital-hold]') as Element, ' ', 'keydown');
    expect(sensor.visual({ snapshot: snapshotWith([]), instance, active: false, reducedMotion: false })).toMatchObject({ pressed: true });
    handle?.destroy?.();
    expect(sensor.visual({ snapshot: snapshotWith([]), instance, active: false, reducedMotion: false })).toMatchObject({ pressed: false });
  });

  it('그림: 이름·핀 번호·감지됨/없음·신호 값이 글자로 있고, 모습 값에 따라 바뀐다, 긴 이름은 …로 줄고 낭독 설명에 전체 이름', () => {
    const instance = instanceOf('sensor-digital', { sig: 25 }, { label: '아주아주아주아주 긴 이름의 센서', options: { active_low: true } });
    const root = svgElement('g', { 'data-board-part': 'sensor-digital' });
    const target = svgElement('g');
    root.append(target);
    document.body.append(svgElement('svg', {}, [root]));
    const update = sensor.render(target, { instance, definition: sensor, svg: svgElement });
    const texts = () => [...target.querySelectorAll('text')].map((node) => node.textContent);
    expect(texts()).toContain('IO25');
    expect(texts()).toContain('없음');
    expect(texts()).toContain('신호 1 (HIGH)');
    const title = target.querySelector('.board-part__title')?.textContent ?? '';
    expect(title.endsWith('…')).toBe(true);
    expect(title.length).toBeLessThan(instance.label.length);
    const extra = { snapshot: snapshotWith([]), reducedMotion: false };
    update(digitalSensorVisual({ held: true, latched: false }, digitalSensorSettings({ active_low: true }).settings), extra);
    expect(texts()).toContain('감지됨');
    expect(texts()).toContain('신호 0 (LOW)');
    expect(root.querySelector('desc[data-part-desc]')?.textContent).toBe(
      '아주아주아주아주 긴 이름의 센서: 감지됨 · 신호 0. 감지하면 신호가 0이 되는 모듈이에요.',
    );
    // 마우스·손가락으로 모듈을 누르고 있기(조작 칸이 없으면 핀에 닿지 않지만 그림은 그대로 둔다)
    expect(target.querySelector('[data-sensor-digital-hit]')?.getAttribute('aria-hidden')).toBe('true');
  });
});
