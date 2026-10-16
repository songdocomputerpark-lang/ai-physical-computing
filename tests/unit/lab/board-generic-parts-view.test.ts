// @vitest-environment jsdom
// 범용 부품 4종(sensor-digital·sensor-analog·joystick·output-digital, 판 1.5.0)을 진짜 보드 화면(view.ts)에 올려 본다: 배선도 계획·부품 그림·낭독 이름·조작 칸이
// 오류 없이 한 화면에 모이고, 조작 칸이 건 값이 inputDrives를 거쳐 핀 값이 되는지(화면 → 파이썬 입력의 앞부분)를 확인한다.
// 개별 부품의 모습·조작은 board-part-*.test.ts, 파이썬이 읽는 값은 pyodide-board-generic-parts.test.ts가 본다.
import { afterEach, describe, expect, it } from 'vitest';
import type { PartControlApi, PartDefinition, PartInstance, WiringEntry } from '../../../src/lab/modules/board/part-types.ts';
import { PART_DEFINITIONS, inputDrives, onboardWiring, resolveWiring, withControlDrive, type ControlDrives } from '../../../src/lab/modules/board/parts.ts';
import { raw12FromMillivolts } from '../../../src/lab/modules/board/parts/sensor-analog/sensor-analog-model.ts';
import { isAnalogDrive, type PinDrive } from '../../../src/lab/modules/board/state.ts';
import { createBoardView, type BoardView } from '../../../src/lab/modules/board/view.ts';
import { snapshotWith } from './helpers/board-snapshot.ts';

let view: BoardView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
  document.body.replaceChildren();
});

const WIRING: WiringEntry[] = [
  { part: 'sensor-digital', id: 'motion', pin: 23, label: '움직임 센서', options: { active_low: true } },
  { part: 'sensor-analog', id: 'light', pin: 32, label: '조도 센서', options: { unit: '', label_low: '어두움', label_high: '밝음' } },
  { part: 'joystick', id: 'stick', label: '조이스틱', pins: { x: 33, y: 34, sw: 27 } },
  { part: 'output-digital', id: 'lamp', pin: 4, label: '빨강 LED', options: { color: 'red' } },
  { part: 'output-digital', id: 'relay', pin: 25, label: '릴레이', options: { kind: 'relay' } },
];

function mountBoard() {
  const stage = document.createElement('div');
  const controls = document.createElement('div');
  const list = document.createElement('div');
  list.dataset.boardControlsList = '';
  controls.append(list);
  document.body.append(stage, controls);
  let controlDrives: ControlDrives = new Map();
  let instances: readonly PartInstance[] = [];
  let snapshot = snapshotWith([{ id: 4, mode: 'out', out: 1, level: 1, driven: true }]);
  const drivesNow = () => inputDrives(instances, new Set(), PART_DEFINITIONS, controlDrives);
  const controlApi = (instance: PartInstance, definition: PartDefinition): PartControlApi => ({
    instance,
    definition,
    setDrive(role, drive) {
      controlDrives = withControlDrive(controlDrives, instance.id, role, drive);
      view?.update(snapshot);
    },
    sendToDevice: () => undefined,
    storageName: (name) => `module:board:${definition.id}:${name}`,
  });
  view = createBoardView(
    { stage, pinRows: null, pinsEmpty: null, phaseText: null, problems: null, controls },
    { definitions: PART_DEFINITIONS, onActiveChange: () => undefined, controlApi, reducedMotion: () => false },
  );
  const resolved = resolveWiring([...onboardWiring(PART_DEFINITIONS), ...WIRING], PART_DEFINITIONS);
  instances = resolved.instances;
  view.setWiring(resolved.instances, resolved.issues);
  view.update(snapshot);
  return {
    stage,
    controls,
    list,
    resolved,
    drivesNow,
    setSnapshot(next: typeof snapshot) {
      snapshot = next;
      view?.update(snapshot);
    },
  };
}

describe('범용 부품 4종을 보드 화면에 올리기', () => {
  it('배선 검사: 바깥 입력 전용 핀 34에 이은 조이스틱 Y는 입력이라 오류가 아니고, 부품 다섯이 모두 그려진다', () => {
    const { resolved, stage } = mountBoard();
    expect(resolved.issues.filter((issue) => issue.level === 'error')).toEqual([]);
    expect(resolved.instances.map((instance) => instance.id)).toEqual(expect.arrayContaining(['motion', 'light', 'stick', 'lamp', 'relay']));
    for (const id of ['motion', 'light', 'stick', 'lamp', 'relay']) {
      expect(stage.querySelector(`[data-board-part="${id}"]`), id).not.toBeNull();
    }
    expect(stage.querySelector('[data-board-part="stick"]')?.getAttribute('data-part')).toBe('joystick');
  });

  it('부품 요소: 낭독 이름에 화면 이름·핀·상태가 있고(role img), 모습 값이 data-visual-*로 나온다', () => {
    const { stage } = mountBoard();
    const lamp = stage.querySelector('[data-board-part="lamp"]') as Element;
    expect(lamp.getAttribute('role')).toBe('img');
    expect(lamp.getAttribute('aria-label')).toBe('빨강 LED(GPIO4): 켜짐 — 신호 핀이 1(HIGH)이면 켜지는 LED·릴레이 같은 디지털 출력 장치예요. 소리는 내지 않아요.');
    expect(lamp.getAttribute('data-visual-lit')).toBe('true');
    expect(lamp.querySelector('desc[data-part-desc]')?.textContent).toBe('빨강 LED: 켜짐. 신호 핀이 1이면 켜져요.');
    const relay = stage.querySelector('[data-board-part="relay"]') as Element;
    expect(relay.getAttribute('data-visual-lit')).toBe('false');
    expect(relay.getAttribute('aria-label')).toContain('릴레이(GPIO25): 꺼짐 · 접점이 떨어졌어요');
    const motion = stage.querySelector('[data-board-part="motion"]') as Element;
    expect(motion.getAttribute('aria-label')).toContain('움직임 센서(GPIO23): 감지 없음 · 신호 1');
    expect(motion.getAttribute('data-visual-level')).toBe('1');
    const light = stage.querySelector('[data-board-part="light"]') as Element;
    expect(light.getAttribute('aria-label')).toContain('조도 센서(GPIO32): 값 2048 · 가운데');
    expect(light.getAttribute('data-visual-value')).toBe('2048');
    const stick = stage.querySelector('[data-board-part="stick"]') as Element;
    expect(stick.getAttribute('aria-label')).toContain('조이스틱(GPIO33·GPIO34·GPIO27): X 2048 · Y 2048 · 중앙 · 버튼 뗌');
    expect(stick.getAttribute('data-visual-direction')).toBe('중앙');
  });

  it('조작 칸: 입력 부품 셋만 칸이 생기고(출력 표시등은 없음) 제목은 "<화면 이름> 조작", 처음 값이 핀을 누른다', async () => {
    const { list, drivesNow } = mountBoard();
    await Promise.resolve();
    const headings = [...list.querySelectorAll('section[data-board-part-controls] > h4')].map((node) => node.textContent);
    expect(headings).toEqual(expect.arrayContaining(['움직임 센서 조작', '조도 센서 조작', '조이스틱 조작']));
    expect(headings).toHaveLength(3);
    const drives = drivesNow();
    // active_low 센서는 감지 없음 = 1, 아날로그는 가운데(2048), 조이스틱 X·Y는 가운데에 버튼은 떼어 둔 풀업
    expect(drives.get(23)).toBe(1);
    const read = (gpio: number) => {
      const drive = drives.get(gpio) as PinDrive;
      return isAnalogDrive(drive) ? raw12FromMillivolts(drive.mv) : drive;
    };
    expect([read(32), read(33), read(34), drives.get(27)]).toEqual([2048, 2048, 2048, 'pullup']);
  });

  it('조작 칸을 누르면 핀 값과 부품 모습이 함께 바뀐다(Space로 감지, 슬라이더로 값)', async () => {
    const { list, stage, drivesNow } = mountBoard();
    await Promise.resolve();
    const motionControls = list.querySelector('[data-board-part-controls="motion"]') as HTMLElement;
    const hold = motionControls.querySelector('[data-sensor-digital-hold]') as HTMLButtonElement;
    hold.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(drivesNow().get(23)).toBe(0);
    expect(stage.querySelector('[data-board-part="motion"]')?.getAttribute('data-visual-pressed')).toBe('true');
    expect(stage.querySelector('[data-board-part="motion"]')?.getAttribute('aria-label')).toContain('감지됨 · 신호 0');
    hold.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }));
    expect(drivesNow().get(23)).toBe(1);

    const slider = list.querySelector('[data-board-part-controls="light"] [data-sensor-analog-slider]') as HTMLInputElement;
    slider.value = '100';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    const light = drivesNow().get(32) as PinDrive;
    expect(isAnalogDrive(light) ? raw12FromMillivolts(light.mv) : null).toBe(4095);
    expect(stage.querySelector('[data-board-part="light"]')?.getAttribute('data-visual-value')).toBe('4095');
    expect(stage.querySelector('[data-board-part="light"]')?.getAttribute('data-visual-percent')).toBe('100');
  });

  it('출력 표시등은 보드 상태를 따라 켜지고 꺼진다(board.state → 모습)', () => {
    const { stage, setSnapshot } = mountBoard();
    setSnapshot(snapshotWith([{ id: 4, mode: 'out', out: 0, level: 0, driven: true }, { id: 25, mode: 'out', out: 1, level: 1, driven: true }]));
    expect(stage.querySelector('[data-board-part="lamp"]')?.getAttribute('data-visual-lit')).toBe('false');
    expect(stage.querySelector('[data-board-part="relay"]')?.getAttribute('data-visual-lit')).toBe('true');
    expect(stage.querySelector('[data-board-part="relay"]')?.getAttribute('aria-label')).toContain('켜짐 · 접점이 붙었어요');
  });
});
