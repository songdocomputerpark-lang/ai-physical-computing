// @vitest-environment jsdom
// 부품 sensor-analog(범용 아날로그 센서) 단위 테스트 — README 7.5 "부품 하나 = 테스트 파일 하나", 판 1.5.0 DECISIONS C157.
// 슬라이더 값이 ADC.read()로 정확히 읽히는 전압을 거는지(4096개 전부), 설정 읽기, 조작 칸(슬라이더·숫자 칸)을 확인한다.
// 파이썬 ADC가 같은 전압을 실제로 그 값으로 읽는지는 pyodide-board-generic-parts.test.ts(실제 Pyodide)가 본다.
import { afterEach, describe, expect, it } from 'vitest';
import type { PartControlApi, PartControlHandle, PartInstance } from '../../../src/lab/modules/board/part-types.ts';
import { PART_DEFINITIONS, inputDrives, resolveWiring, wiringValue, withControlDrive } from '../../../src/lab/modules/board/parts.ts';
import sensor from '../../../src/lab/modules/board/parts/sensor-analog/part.ts';
import {
  SENSOR_ANALOG_MAX,
  SLIDER_STEPS,
  analogSensorSettings,
  analogSensorVisual,
  clampRaw,
  exactAnalogDrive,
  exactMillivoltsForRaw12,
  positionOf,
  raw12FromMillivolts,
  sideText,
  valueAt,
  valueText,
} from '../../../src/lab/modules/board/parts/sensor-analog/sensor-analog-model.ts';
import { raw12FromMillivolts as touch4Read } from '../../../src/lab/modules/board/parts/touch-analog-4ch/touch4-model.ts';
import { analogDrive, isAnalogDrive, type PinDrive } from '../../../src/lab/modules/board/state.ts';
import { svgElement } from '../../../src/lab/modules/board/svg.ts';
import { instanceOf, snapshotWith } from './helpers/board-snapshot.ts';

const handles: PartControlHandle[] = [];

afterEach(() => {
  for (const handle of handles.splice(0)) {
    handle.destroy?.();
  }
  document.body.replaceChildren();
});

function openControls(instance: PartInstance) {
  const drives: [string, PinDrive][] = [];
  const api: PartControlApi = {
    instance,
    definition: sensor,
    setDrive: (role, drive) => drives.push([role, drive]),
    sendToDevice: () => undefined,
    storageName: (name) => `module:board:sensor-analog:${name}`,
  };
  const host = document.createElement('section');
  document.body.append(host);
  const handle = sensor.controls?.(host, api);
  if (handle) {
    handles.push(handle);
  }
  return { host, drives, handle };
}

/** 마지막으로 건 전압을 ATTN_11DB·12비트 값으로 읽는다 */
function lastRead(drives: readonly [string, PinDrive][]): number {
  const last = drives.at(-1)?.[1];
  if (!isAnalogDrive(last)) {
    throw new Error('아날로그 전압이 아니에요.');
  }
  return raw12FromMillivolts(last.mv);
}

describe('부품: 범용 아날로그 센서(sensor-analog)', () => {
  it('바깥 입력 부품: 신호(아날로그) 1핀, 기본 핀 없음, 조작 칸 슬라이더 — interaction은 없다', () => {
    expect(sensor.pins).toEqual([{ role: 'sig', label: '신호(아날로그)', direction: 'in' }]);
    expect(sensor.defaultPins).toBeUndefined();
    expect(sensor.interaction).toBeUndefined();
    expect(typeof sensor.controls).toBe('function');
    expect(sensor.title).toBe('아날로그 센서');
    expect(PART_DEFINITIONS.get('sensor-analog')).toBe(sensor);
  });

  it('전압: 0~4095 어느 값이든 ATTN_11DB·12비트 read()가 그 값 그대로 읽는다(4채널 터치의 정수 mV와 달리 +1이 없다)', () => {
    let touch4Offsets = 0;
    for (let raw = 0; raw <= SENSOR_ANALOG_MAX; raw += 1) {
      const mv = exactMillivoltsForRaw12(raw);
      expect(mv).toBeGreaterThanOrEqual(0);
      expect(mv).toBeLessThanOrEqual(3300);
      expect(raw12FromMillivolts(mv)).toBe(raw);
      if (touch4Read(Math.ceil((raw * 3300) / SENSOR_ANALOG_MAX)) !== raw) {
        touch4Offsets += 1;
      }
    }
    // 비교: 정수 mV(analogDrive)로는 몇몇 값이 한 칸 크게 읽힌다 — 이 부품이 소수 mV를 쓰는 까닭
    expect(touch4Offsets).toBeGreaterThan(0);
    expect(exactMillivoltsForRaw12(0)).toBeCloseTo(0.01, 6);
    expect(exactMillivoltsForRaw12(SENSOR_ANALOG_MAX)).toBe(3300);
    expect(exactMillivoltsForRaw12(-5)).toBe(exactMillivoltsForRaw12(0));
    expect(exactMillivoltsForRaw12(99999)).toBe(3300);
    expect(exactAnalogDrive(2048)).toEqual({ mv: exactMillivoltsForRaw12(2048) });
    // 디지털로 읽으면 1.65V 문턱: 값 2048은 1650.4mV라 1, 2047은 1649.6mV라 0
    expect(exactMillivoltsForRaw12(2048)).toBeGreaterThanOrEqual(1650);
    expect(exactMillivoltsForRaw12(2047)).toBeLessThan(1650);
    expect(analogDrive(1649.6)).toEqual({ mv: 1650 });
  });

  it('설정: 기본 0~4095·처음 값 2048, unit·min·max·value·label_low·label_high를 읽고 범위가 틀리면 기본으로 돌려 문제 문장을 낸다', () => {
    expect(analogSensorSettings(undefined)).toEqual({ settings: { unit: '', min: 0, max: 4095, initial: 2048, labelLow: '', labelHigh: '' }, problems: [] });
    const full = analogSensorSettings({ unit: 'lux', min: 500, max: 3500, value: 1000, label_low: '어두움', label_high: '밝음' });
    expect(full).toEqual({ settings: { unit: 'lux', min: 500, max: 3500, initial: 1000, labelLow: '어두움', labelHigh: '밝음' }, problems: [] });
    // 처음 값은 범위 안으로
    expect(analogSensorSettings({ min: 3000 }).settings.initial).toBe(3000);
    expect(analogSensorSettings({ max: 1000 }).settings.initial).toBe(1000);
    expect(analogSensorSettings({ min: 100, max: 200, value: 500 }).problems.join('\n')).toContain('"value" 설정(500)은 min(100)부터 max(200)까지');
    // 틀린 범위
    const reversed = analogSensorSettings({ min: 3000, max: 2000 });
    expect(reversed.settings).toMatchObject({ min: 0, max: 4095 });
    expect(reversed.problems.join('\n')).toContain('"min" 설정(3000)은 "max" 설정(2000)보다 작아야 해요');
    expect(analogSensorSettings({ max: 9999 }).problems[0]).toContain('"max" 설정은 0부터 4095까지예요');
    expect(analogSensorSettings({ unit: 'abcdefgh' })).toMatchObject({ settings: { unit: 'abcdef' } });
    expect(analogSensorSettings({ unit: 'abcdefgh' }).problems[0]).toContain('너무 길어요(6글자까지)');
    expect(analogSensorSettings({ unit: 5 }).problems[0]).toContain('글자로 적어요');
    expect(analogSensorSettings({ lable_low: '어두움' }).problems[0]).toContain('"lable_low" 설정은 이 부품에 없어요');
  });

  it('슬라이더 위치(0~100)와 값: 0은 정확히 min, 100은 정확히 max, 50은 가운데(기본 범위에서 2048), 되돌려도 같은 칸', () => {
    const full = { min: 0, max: 4095 };
    expect([valueAt(0, full), valueAt(50, full), valueAt(100, full)]).toEqual([0, 2048, 4095]);
    expect([positionOf(0, full), positionOf(2048, full), positionOf(4095, full)]).toEqual([0, 50, 100]);
    const narrow = { min: 500, max: 3500 };
    expect([valueAt(0, narrow), valueAt(50, narrow), valueAt(100, narrow)]).toEqual([500, 2000, 3500]);
    for (let position = 0; position <= SLIDER_STEPS; position += 1) {
      expect(positionOf(valueAt(position, narrow), narrow)).toBe(position);
      expect(positionOf(valueAt(position, full), full)).toBe(position);
    }
    expect(valueAt(-5, full)).toBe(0);
    expect(valueAt(500, full)).toBe(4095);
    expect(clampRaw(5000)).toBe(4095);
    expect(clampRaw(-3)).toBe(0);
    expect(clampRaw(Number.NaN, 10, 20)).toBe(10);
  });

  it('모습: 값 글자(단위 붙임)와 양 끝 이름 쪽을 글자로 알린다', () => {
    const lux = analogSensorSettings({ unit: 'lux', label_low: '어두움', label_high: '밝음' }).settings;
    expect(valueText(2048, lux)).toBe('2048 lux');
    expect(valueText(7, analogSensorSettings(undefined).settings)).toBe('7');
    expect(sideText(10, lux)).toBe('어두움 쪽');
    expect(sideText(50, lux)).toBe('가운데');
    expect(sideText(90, lux)).toBe('밝음 쪽');
    expect(sideText(50, analogSensorSettings(undefined).settings)).toBe('');
    expect(analogSensorVisual(300, lux)).toEqual({ value: 300, percent: 7, summary: '값 300 lux · 어두움 쪽' });
    expect(analogSensorVisual(4095, analogSensorSettings(undefined).settings)).toEqual({ value: 4095, percent: 100, summary: '값 4095' });
    // 보드 상태와 상관없이(입력 부품) visual은 슬라이더 값만 본다 — 처음 값은 설정의 value
    const instance = instanceOf('sensor-analog', { sig: 32 }, { options: { value: 1000 } });
    expect(sensor.visual({ snapshot: snapshotWith([]), instance, active: false, reducedMotion: false })).toMatchObject({ value: 1000 });
  });

  it('배선: pin 하나로 적고 label·options가 부품 줄로 온다, 철자 틀린 설정은 주의, 입력 전용 핀(34)에도 이을 수 있다', () => {
    const ok = resolveWiring(
      [{ part: 'sensor-analog', pin: 32, label: '조도 센서', options: { unit: '', label_low: '어두움', label_high: '밝음' } }],
      PART_DEFINITIONS,
    );
    expect(ok.issues).toEqual([]);
    expect(ok.instances.find((item) => item.part === 'sensor-analog')).toMatchObject({ pins: { sig: 32 }, label: '조도 센서', options: { unit: '', label_low: '어두움', label_high: '밝음' } });
    expect(wiringValue(ok.instances).parts.find((item) => item.part === 'sensor-analog')).toMatchObject({ label: '조도 센서', directions: { sig: 'in' } });
    expect(resolveWiring([{ part: 'sensor-analog', pin: 34 }], PART_DEFINITIONS).issues).toEqual([]);
    const typo = resolveWiring([{ part: 'sensor-analog', pin: 32, options: { units: 'lux', min: 3000, max: 100 } }], PART_DEFINITIONS);
    expect(typo.issues.map((issue) => issue.code)).toEqual(['bad-option', 'bad-option']);
    expect(typo.issues.every((issue) => issue.level === 'warning')).toBe(true);
    expect(resolveWiring([{ part: 'sensor-analog' }], PART_DEFINITIONS).issues.map((issue) => issue.code)).toContain('missing-pin');
  });

  it('조작 칸이 정한 값으로 핀을 누른다(아날로그 전압)', () => {
    const instance = instanceOf('sensor-analog', { sig: 32 });
    const controlled = withControlDrive(new Map(), instance.id, 'sig', exactAnalogDrive(1000));
    expect(inputDrives([instance], new Set(), PART_DEFINITIONS, controlled).get(32)).toEqual(exactAnalogDrive(1000));
  });

  it('조작 칸: 처음에 가운데(2048) 전압을 걸고, 슬라이더 한 칸·양 끝·숫자 칸이 값을 바꾼다 — 코드가 읽을 값 그대로', async () => {
    const instance = instanceOf('sensor-analog', { sig: 32 }, { label: '조도 센서', options: { unit: 'lux', label_low: '어두움', label_high: '밝음' } });
    const { host, drives } = openControls(instance);
    await Promise.resolve();
    expect(lastRead(drives)).toBe(2048);
    const slider = host.querySelector<HTMLInputElement>('[data-sensor-analog-slider]') as HTMLInputElement;
    const number = host.querySelector<HTMLInputElement>('[data-sensor-analog-number]') as HTMLInputElement;
    expect([slider.min, slider.max, slider.step, slider.value]).toEqual(['0', '100', '1', '50']);
    expect(number.value).toBe('2048');
    // 슬라이더 이름은 늘 "센서 값"(값이 섞이지 않음), 바뀌는 값은 옆 글자와 aria-valuetext, 양 끝 이름은 눈으로만(aria-hidden)
    const label = host.querySelector<HTMLLabelElement>(`label[for="${slider.id}"]`);
    expect(label?.textContent).toBe('센서 값');
    expect(host.querySelector('[data-sensor-analog-value-text]')?.textContent).toBe('2048 lux — 가운데');
    expect([...host.querySelectorAll('[aria-hidden="true"]')].map((node) => node.textContent)).toEqual(['어두움', '밝음']);
    expect(host.querySelectorAll('output')).toHaveLength(0);
    expect(host.querySelector('[data-sensor-analog-status]')?.textContent).toBe('코드가 읽는 값: 2048');
    // 화살표 키는 range 입력의 한 칸 = value + 1
    slider.value = '51';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(lastRead(drives)).toBe(valueAt(51, { min: 0, max: 4095 }));
    expect(slider.getAttribute('aria-valuetext')).toBe(`값 ${valueAt(51, { min: 0, max: 4095 })} lux, 범위의 51%, 가운데`);
    // Home / End = 양 끝
    slider.value = '0';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(lastRead(drives)).toBe(0);
    expect(host.textContent).toContain('어두움 쪽');
    slider.value = '100';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(lastRead(drives)).toBe(4095);
    expect(host.textContent).toContain('밝음 쪽');
    // 숫자 칸: 정확한 값
    number.value = '3000';
    number.dispatchEvent(new Event('input', { bubbles: true }));
    expect(lastRead(drives)).toBe(3000);
    expect(slider.value).toBe(String(positionOf(3000, { min: 0, max: 4095 })));
    // 범위 밖은 쓰는 도중에는 두고, 값 확정(change)에서 범위 안으로 맞춘다
    number.value = '9000';
    number.dispatchEvent(new Event('input', { bubbles: true }));
    expect(lastRead(drives)).toBe(3000);
    number.dispatchEvent(new Event('change', { bubbles: true }));
    expect(lastRead(drives)).toBe(4095);
    expect(number.value).toBe('4095');
    // 시각 값도 조작 상태를 따른다
    expect(sensor.visual({ snapshot: snapshotWith([]), instance, active: false, reducedMotion: false })).toMatchObject({ value: 4095, percent: 100 });
  });

  it('조작 칸: min·max가 있으면 숫자 칸 범위와 양 끝이 그 값, 처음 값은 value 설정', async () => {
    const instance = instanceOf('sensor-analog', { sig: 33 }, { options: { min: 500, max: 3500, value: 1000 } });
    const { host, drives } = openControls(instance);
    await Promise.resolve();
    expect(lastRead(drives)).toBe(1000);
    const slider = host.querySelector<HTMLInputElement>('[data-sensor-analog-slider]') as HTMLInputElement;
    const number = host.querySelector<HTMLInputElement>('[data-sensor-analog-number]') as HTMLInputElement;
    expect([number.min, number.max]).toEqual(['500', '3500']);
    slider.value = '0';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(lastRead(drives)).toBe(500);
    slider.value = '100';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(lastRead(drives)).toBe(3500);
    number.value = '10';
    number.dispatchEvent(new Event('change', { bubbles: true }));
    expect(lastRead(drives)).toBe(500);
  });

  it('그림: 이름·핀 번호·값 글자·양 끝 이름이 있고 값 막대 길이가 값 위치를 따른다, 낭독 설명에 전체 이름과 범위', () => {
    const instance = instanceOf('sensor-analog', { sig: 32 }, { label: '조도 센서', options: { unit: 'lux', label_low: '어두움', label_high: '밝음' } });
    const root = svgElement('g', { 'data-board-part': 'sensor-analog' });
    const target = svgElement('g');
    root.append(target);
    document.body.append(svgElement('svg', {}, [root]));
    const update = sensor.render(target, { instance, definition: sensor, svg: svgElement });
    const texts = () => [...target.querySelectorAll('text')].map((node) => node.textContent);
    expect(texts()).toEqual(expect.arrayContaining(['IO32', '조도 센서', '어두움', '밝음']));
    const settings = analogSensorSettings(instance.options).settings;
    update(analogSensorVisual(4095, settings), { snapshot: snapshotWith([]), reducedMotion: false });
    expect(texts()).toContain('값 4095 lux');
    const fill = target.querySelectorAll('rect')[3];
    expect(Number(fill?.getAttribute('width'))).toBeCloseTo(106, 6);
    update(analogSensorVisual(0, settings), { snapshot: snapshotWith([]), reducedMotion: false });
    expect(Number(fill?.getAttribute('width'))).toBe(0);
    expect(root.querySelector('desc[data-part-desc]')?.textContent).toBe('조도 센서: 값 0 lux · 어두움 쪽. 값은 0부터 4095까지 바꿀 수 있고, 코드에서 ADC로 읽어요.');
    // 양 끝 이름이 없으면 범위 숫자를 보인다
    const plain = instanceOf('sensor-analog', { sig: 32 }, { options: { min: 100, max: 900 } });
    const plainTarget = svgElement('g');
    sensor.render(plainTarget, { instance: plain, definition: sensor, svg: svgElement });
    expect([...plainTarget.querySelectorAll('text')].map((node) => node.textContent)).toEqual(expect.arrayContaining(['100', '900']));
  });
});
