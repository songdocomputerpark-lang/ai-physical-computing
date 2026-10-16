// @vitest-environment jsdom
// 부품 joystick(조이스틱) 단위 테스트 — README 7.5 "부품 하나 = 테스트 파일 하나", 판 1.5.0 DECISIONS C157.
// 파이썬 ADC·Pin이 이 부품의 값을 읽는지는 pyodide-board-generic-parts.test.ts(실제 Pyodide)가 본다.
import { afterEach, describe, expect, it } from 'vitest';
import type { PartControlApi, PartControlHandle, PartInstance } from '../../../src/lab/modules/board/part-types.ts';
import { PART_DEFINITIONS, inputDrives, resolveWiring, wiringValue } from '../../../src/lab/modules/board/parts.ts';
import joystick from '../../../src/lab/modules/board/parts/joystick/part.ts';
import {
  JOYSTICK_CENTER,
  JOYSTICK_DIRECTION_GAP,
  JOYSTICK_IDLE,
  JOYSTICK_MAX,
  joystickButtonDrive,
  joystickDirection,
  joystickVisual,
  padToRaw,
  rawToPad,
} from '../../../src/lab/modules/board/parts/joystick/joystick-model.ts';
import { exactMillivoltsForRaw12, raw12FromMillivolts, valueAt } from '../../../src/lab/modules/board/parts/sensor-analog/sensor-analog-model.ts';
import { isAnalogDrive, type PinDrive } from '../../../src/lab/modules/board/state.ts';
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
    definition: joystick,
    setDrive: (role, drive) => drives.push([role, drive]),
    sendToDevice: () => undefined,
    storageName: (name) => `module:board:joystick:${name}`,
  };
  const host = document.createElement('section');
  document.body.append(host);
  const handle = joystick.controls?.(host, api);
  if (handle) {
    handles.push(handle);
  }
  return { host, drives, handle };
}

/** role별로 마지막에 건 값 */
function lastBy(drives: readonly [string, PinDrive][], role: string): PinDrive | undefined {
  return [...drives].reverse().find(([name]) => name === role)?.[1];
}

function readAxis(drives: readonly [string, PinDrive][], role: string): number {
  const drive = lastBy(drives, role);
  if (!isAnalogDrive(drive)) {
    throw new Error(`${role}에 아날로그 전압이 없어요.`);
  }
  return raw12FromMillivolts(drive.mv);
}

function keyPress(element: Element, key: string, type: 'keydown' | 'keyup') {
  element.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true, cancelable: true }));
}

function slide(host: HTMLElement, axis: 'x' | 'y', position: number) {
  const slider = host.querySelector<HTMLInputElement>(`[data-joystick-slider="${axis}"]`) as HTMLInputElement;
  slider.value = String(position);
  slider.dispatchEvent(new Event('input', { bubbles: true }));
}

const WITH_BUTTON = { x: 32, y: 33, sw: 27 };

describe('부품: 조이스틱(joystick)', () => {
  it('바깥 입력 부품: x·y(아날로그)·sw(버튼, 안 적어도 됨) 세 핀, 기본 핀 없음, 조작은 조작 칸', () => {
    expect(joystick.pins).toEqual([
      { role: 'x', label: 'X(좌우, 아날로그)', direction: 'in' },
      { role: 'y', label: 'Y(위아래, 아날로그)', direction: 'in' },
      { role: 'sw', label: '버튼', direction: 'in', optional: true },
    ]);
    expect(joystick.defaultPins).toBeUndefined();
    expect(joystick.interaction).toBeUndefined();
    expect(typeof joystick.controls).toBe('function');
    expect(joystick.title).toBe('조이스틱');
    expect(PART_DEFINITIONS.get('joystick')).toBe(joystick);
  });

  it('밀린 방향: 가운데에서 더 많이 벗어난 축을 보고 GAP(800)을 넘을 때만 — 오른쪽이 X 큼, 위쪽이 Y 큼', () => {
    expect(JOYSTICK_DIRECTION_GAP).toBe(800);
    expect(joystickDirection(2048, 2048)).toBe('중앙');
    expect(joystickDirection(2048 + 800, 2048)).toBe('중앙');
    expect(joystickDirection(2048 + 801, 2048)).toBe('오른쪽');
    expect(joystickDirection(2048 - 801, 2048)).toBe('왼쪽');
    expect(joystickDirection(2048, 2048 + 801)).toBe('위쪽');
    expect(joystickDirection(2048, 2048 - 801)).toBe('아래쪽');
    // 두 축 모두 벗어나면 더 많이 벗어난 쪽(같으면 좌우)
    expect(joystickDirection(4095, 3000)).toBe('오른쪽');
    expect(joystickDirection(3000, 4095)).toBe('위쪽');
    expect(joystickDirection(3000, 3000)).toBe('오른쪽');
  });

  it('버튼: 누르면 0, 떼면 모듈의 풀업이 올려 두어 1 — 버튼 핀이 없으면 버튼 얘기를 모습에서 뺀다', () => {
    expect(joystickButtonDrive(true)).toBe(0);
    expect(joystickButtonDrive(false)).toBe('pullup');
    expect(joystickVisual(JOYSTICK_IDLE, true)).toEqual({ x: 2048, y: 2048, pressed: false, direction: '중앙', summary: 'X 2048 · Y 2048 · 중앙 · 버튼 뗌' });
    expect(joystickVisual({ x: 4095, y: 0, pressed: true }, true)).toEqual({ x: 4095, y: 0, pressed: true, direction: '아래쪽', summary: 'X 4095 · Y 0 · 아래쪽 · 버튼 누름' });
    expect(joystickVisual({ x: 4095, y: 0, pressed: true }, false)).toMatchObject({ pressed: false, summary: 'X 4095 · Y 0 · 아래쪽' });
    expect(joystickVisual({ x: 9999, y: -4, pressed: false }, false)).toMatchObject({ x: 4095, y: 0 });
  });

  it('패드 위치 ↔ 값: 오른쪽 끝 X=4095, 위쪽 끝 Y=4095, 가운데는 2048(반올림), 되돌려도 같은 자리', () => {
    expect(padToRaw(0, 0)).toEqual({ x: 0, y: 4095 });
    expect(padToRaw(1, 1)).toEqual({ x: 4095, y: 0 });
    expect(padToRaw(0.5, 0.5)).toEqual({ x: 2048, y: 2048 });
    expect(padToRaw(-3, 9)).toEqual({ x: 0, y: 0 });
    expect(rawToPad(4095, 4095)).toEqual({ fractionX: 1, fractionY: 0 });
    expect(rawToPad(0, 0)).toEqual({ fractionX: 0, fractionY: 1 });
    const back = padToRaw(rawToPad(1234, 3210).fractionX, rawToPad(1234, 3210).fractionY);
    expect(back).toEqual({ x: 1234, y: 3210 });
    expect(JOYSTICK_MAX).toBe(4095);
    expect(JOYSTICK_CENTER).toBe(2048);
  });

  it('배선: pins x·y만 적으면 버튼 없이 오류 없음, sw까지 적으면 세 핀, pin 하나로는 안 되고 x나 y가 빠지면 오류', () => {
    const noButton = resolveWiring([{ part: 'joystick', pins: { x: 32, y: 33 } }], PART_DEFINITIONS);
    expect(noButton.issues).toEqual([]);
    expect(noButton.instances.find((item) => item.part === 'joystick')?.pins).toEqual({ x: 32, y: 33 });
    expect(wiringValue(noButton.instances).parts.find((item) => item.part === 'joystick')).toMatchObject({ pins: { x: 32, y: 33 }, directions: { x: 'in', y: 'in' } });
    const withButton = resolveWiring([{ part: 'joystick', label: '조이스틱', pins: WITH_BUTTON }], PART_DEFINITIONS);
    expect(withButton.issues).toEqual([]);
    expect(withButton.instances.find((item) => item.part === 'joystick')).toMatchObject({ pins: WITH_BUTTON, label: '조이스틱' });
    expect(resolveWiring([{ part: 'joystick', pin: 32 }], PART_DEFINITIONS).issues.map((issue) => issue.code)).toContain('pin-shorthand');
    const missing = resolveWiring([{ part: 'joystick', pins: { x: 32 } }], PART_DEFINITIONS);
    expect(missing.issues.map((issue) => issue.code)).toContain('missing-pin');
    expect(missing.instances.find((item) => item.part === 'joystick')).toBeUndefined();
    // 설정은 없는 부품이라 적으면 주의
    const options = resolveWiring([{ part: 'joystick', pins: { x: 32, y: 33 }, options: { deadzone: 100 } }], PART_DEFINITIONS);
    expect(options.issues.map((issue) => [issue.level, issue.code])).toEqual([['warning', 'bad-option']]);
  });

  it('조작 칸(버튼 핀 있음): 처음에 가운데·버튼 뗌(풀업)을 걸고, 슬라이더 양 끝·가운데로 단추·버튼 누르고 있기가 핀 값을 바꾼다', async () => {
    const instance = instanceOf('joystick', WITH_BUTTON);
    const { host, drives } = openControls(instance);
    await Promise.resolve();
    expect([readAxis(drives, 'x'), readAxis(drives, 'y'), lastBy(drives, 'sw')]).toEqual([2048, 2048, 'pullup']);
    expect(host.querySelector('[data-joystick-status]')?.textContent).toBe('지금: X 2048 · Y 2048 · 중앙 · 버튼 뗌');
    // 슬라이더 이름은 늘 같은 제목, 바뀌는 값은 옆 글자(이름에 섞이지 않음)
    const sliderX = host.querySelector<HTMLInputElement>('[data-joystick-slider="x"]') as HTMLInputElement;
    expect(host.querySelector(`label[for="${sliderX.id}"]`)?.textContent).toBe('X(좌우)');
    expect(host.querySelector('[data-joystick-value-text="x"]')?.textContent).toBe('2048');
    slide(host, 'x', 100);
    expect(host.querySelector('[data-joystick-value-text="x"]')?.textContent).toBe('4095');
    slide(host, 'y', 0);
    expect([readAxis(drives, 'x'), readAxis(drives, 'y')]).toEqual([4095, 0]);
    expect(host.querySelector('[data-joystick-status]')?.textContent).toBe('지금: X 4095 · Y 0 · 아래쪽 · 버튼 뗌');
    expect(host.querySelector<HTMLInputElement>('[data-joystick-slider="x"]')?.getAttribute('aria-valuetext')).toBe('X(좌우) 4095, 범위의 100%');
    slide(host, 'x', 51);
    expect(readAxis(drives, 'x')).toBe(valueAt(51, { min: 0, max: 4095 }));
    host.querySelector<HTMLButtonElement>('[data-joystick-center]')?.click();
    expect([readAxis(drives, 'x'), readAxis(drives, 'y')]).toEqual([2048, 2048]);
    expect(host.querySelector<HTMLInputElement>('[data-joystick-slider="x"]')?.value).toBe('50');
    // 버튼: Space를 누르고 있는 동안 0, 떼면 1(풀업)
    const hold = host.querySelector<HTMLButtonElement>('[data-joystick-hold]') as HTMLButtonElement;
    expect(hold.getAttribute('aria-pressed')).toBe('false');
    keyPress(hold, ' ', 'keydown');
    expect(lastBy(drives, 'sw')).toBe(0);
    expect(hold.getAttribute('aria-pressed')).toBe('true');
    expect(joystick.visual({ snapshot: snapshotWith([]), instance, active: false, reducedMotion: false })).toMatchObject({ pressed: true });
    keyPress(hold, ' ', 'keyup');
    expect(lastBy(drives, 'sw')).toBe('pullup');
    // 입력 부품이라 inputDrives도 조작 칸이 정한 값을 쓴다(x·y는 정한 전압, sw 없음은 누르지 않음)
    expect(host.dataset.joystickX).toBe('2048');
  });

  it('조작 칸(버튼 핀 없음): 버튼 단추가 없고 sw 핀은 건드리지 않는다', async () => {
    const instance = instanceOf('joystick', { x: 32, y: 33 });
    const { host, drives } = openControls(instance);
    await Promise.resolve();
    expect(host.querySelector('[data-joystick-hold]')).toBeNull();
    expect(drives.some(([role]) => role === 'sw')).toBe(false);
    expect(host.textContent).not.toContain('버튼은 단추를');
    slide(host, 'y', 100);
    expect(readAxis(drives, 'y')).toBe(4095);
    expect(host.querySelector('[data-joystick-status]')?.textContent).toBe('지금: X 2048 · Y 4095 · 위쪽');
  });

  it('조작 칸: 패드를 끌면 따라가고 놓으면 가운데로 돌아온다(마우스·손가락용, 낭독기에는 숨김)', async () => {
    const instance = instanceOf('joystick', WITH_BUTTON);
    const { host, drives } = openControls(instance);
    await Promise.resolve();
    const pad = host.querySelector<HTMLElement>('[data-joystick-pad]') as HTMLElement;
    expect(pad.getAttribute('aria-hidden')).toBe('true');
    pad.getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0, toJSON: () => ({}) });
    const fire = (type: string, x: number, y: number) =>
      pad.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true }));
    fire('pointerdown', 100, 0);
    expect([readAxis(drives, 'x'), readAxis(drives, 'y')]).toEqual([4095, 4095]);
    fire('pointermove', 50, 100);
    expect([readAxis(drives, 'x'), readAxis(drives, 'y')]).toEqual([2048, 0]);
    expect(host.querySelector('[data-joystick-status]')?.textContent).toContain('아래쪽');
    fire('pointerup', 50, 100);
    expect([readAxis(drives, 'x'), readAxis(drives, 'y')]).toEqual([2048, 2048]);
    expect(host.querySelector<HTMLInputElement>('[data-joystick-slider="y"]')?.value).toBe('50');
  });

  it('입력 부품이라 inputDrives가 조작 칸이 정한 전압·버튼 값을 쓴다(버튼 핀 없으면 sw는 없음)', () => {
    const instance = instanceOf('joystick', { x: 32, y: 33 });
    const drives = inputDrives(
      [instance],
      new Set(),
      PART_DEFINITIONS,
      new Map([[instance.id, new Map<string, PinDrive>([['x', { mv: exactMillivoltsForRaw12(100) }], ['y', { mv: exactMillivoltsForRaw12(200) }]])]]),
    );
    expect([...drives.keys()]).toEqual([32, 33]);
  });

  it('그림: 핀 표시(X32 Y33 B27)·값 글자·방향·버튼 글자가 있고 막대 점이 값을 따른다, 버튼 핀이 없으면 버튼 글자가 없다', () => {
    const make = (pins: Record<string, number>) => {
      const instance = instanceOf('joystick', pins, { label: '조이스틱' });
      const root = svgElement('g', { 'data-board-part': 'joystick' });
      const target = svgElement('g');
      root.append(target);
      document.body.append(svgElement('svg', {}, [root]));
      const update = joystick.render(target, { instance, definition: joystick, svg: svgElement });
      return { instance, root, target, update };
    };
    const texts = (target: Element) => [...target.querySelectorAll('text')].map((node) => node.textContent);
    const full = make(WITH_BUTTON);
    expect(texts(full.target)).toEqual(expect.arrayContaining(['X32 Y33 B27', '조이스틱', '중앙', '버튼 뗌']));
    const knob = full.target.querySelectorAll('circle')[1] as SVGCircleElement;
    const centerX = Number(knob.getAttribute('cx'));
    const centerY = Number(knob.getAttribute('cy'));
    full.update(joystickVisual({ x: 4095, y: 4095, pressed: true }, true), { snapshot: snapshotWith([]), reducedMotion: false });
    expect(Number(knob.getAttribute('cx'))).toBeGreaterThan(centerX);
    expect(Number(knob.getAttribute('cy'))).toBeLessThan(centerY);
    expect(texts(full.target)).toEqual(expect.arrayContaining(['X4095 Y4095', '버튼 누름']));
    expect(full.root.querySelector('desc[data-part-desc]')?.textContent).toBe('조이스틱: X 4095 · Y 4095 · 오른쪽 · 버튼 누름. 오른쪽으로 밀면 X가, 위로 밀면 Y가 커져요.');
    const plain = make({ x: 32, y: 33 });
    expect(texts(plain.target)).toContain('X32 Y33');
    expect(texts(plain.target)).not.toContain('버튼 뗌');
  });
});
