// @vitest-environment jsdom
// 가상 보드의 "누르는 법" 안내(판 1.6.0 R6, 걷기 보고 B-79)가 이 예제의 그림에 있는 부품만 말하는지 본다.
// 전에는 초음파 센서 예제에도 "누를 수 있는 부품(BOOT 버튼·터치 센서)… 4채널 터치 센서는…"이 늘 보였다.
import { afterEach, describe, expect, it } from 'vitest';
import type { WiringEntry } from '../../../src/lab/modules/board/part-types.ts';
import { PART_DEFINITIONS, onboardWiring, resolveWiring } from '../../../src/lab/modules/board/parts.ts';
import { createBoardView, type BoardView } from '../../../src/lab/modules/board/view.ts';
import { snapshotWith } from './helpers/board-snapshot.ts';

let view: BoardView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
  document.body.replaceChildren();
});

/** BoardIo.astro의 안내 문단과 같은 모양(글자는 BOOT 버튼 기준으로 미리 적혀 있다) */
function hintMarkup() {
  const hint = document.createElement('p');
  hint.innerHTML =
    '<span data-board-hint-press>누를 수 있는 부품(<span data-board-hint-names>BOOT 버튼</span>)은 눌러요.</span> <span data-board-hint-controls hidden>"부품 조작" 칸 안내</span>';
  document.body.append(hint);
  return {
    press: hint.querySelector<HTMLElement>('[data-board-hint-press]')!,
    names: hint.querySelector<HTMLElement>('[data-board-hint-names]')!,
    controls: hint.querySelector<HTMLElement>('[data-board-hint-controls]')!,
  };
}

function mount(wiring: WiringEntry[]) {
  const stage = document.createElement('div');
  const controls = document.createElement('div');
  const list = document.createElement('div');
  list.dataset.boardControlsList = '';
  controls.append(list);
  document.body.append(stage, controls);
  const hint = hintMarkup();
  view = createBoardView(
    {
      stage,
      pinRows: null,
      pinsEmpty: null,
      phaseText: null,
      problems: null,
      controls,
      hintPress: hint.press,
      hintNames: hint.names,
      hintControls: hint.controls,
    },
    {
      definitions: PART_DEFINITIONS,
      onActiveChange: () => undefined,
      controlApi: (instance, definition) => ({
        instance,
        definition,
        setDrive: () => undefined,
        sendToDevice: () => undefined,
        storageName: (name) => `module:board:${definition.id}:${name}`,
      }),
      reducedMotion: () => false,
    },
  );
  const resolved = resolveWiring([...onboardWiring(PART_DEFINITIONS), ...wiring], PART_DEFINITIONS);
  view.setWiring(resolved.instances, resolved.issues);
  view.update(snapshotWith([]));
  return hint;
}

describe('가상 보드 누르는 법 안내', () => {
  it('바깥 부품이 없으면 보드에 붙은 BOOT 버튼만 말하고, 터치 센서와 "부품 조작" 칸 이야기는 숨는다', () => {
    const hint = mount([]);
    expect(hint.press.hidden).toBe(false);
    expect(hint.names.textContent).toBe('BOOT 버튼');
    expect(hint.controls.hidden).toBe(true);
  });

  it('누를 수 있는 터치 센서(touch-digital)를 이으면 이름이 더해진다', () => {
    const hint = mount([{ part: 'touch-digital', pin: 17 }]);
    expect(hint.names.textContent).toBe('BOOT 버튼·터치 센서');
    expect(hint.controls.hidden).toBe(true);
  });

  it('"부품 조작" 칸이 생기는 부품(움직임 센서 등)이 있을 때만 둘째 문장이 보인다', () => {
    const hint = mount([{ part: 'sensor-digital', id: 'motion', pin: 23, label: '움직임 센서', options: { active_low: true } }]);
    expect(hint.controls.hidden).toBe(false);
    // 누르는 부품은 그대로 BOOT 버튼뿐이라 터치 센서 이름은 나오지 않는다
    expect(hint.names.textContent).toBe('BOOT 버튼');
  });
});
