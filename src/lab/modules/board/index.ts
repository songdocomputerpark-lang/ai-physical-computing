/**
 * 가상 ESP32 보드 모듈의 화면 쪽(PLAN §8.3 P3-01·P3-02, src/lab/README.md 7절). 파이썬 쪽은 같은 폴더의 machine.py·apc_board.py.
 *
 * 하는 일
 * 1. ESP32 실습실의 io 슬롯(src/components/lab/BoardIo.astro의 [data-board-io])에 보드 그림·배선도·부품·핀 표를 그린다(view.ts).
 * 2. 배선: 보드에 붙은 부품(내장 LED·BOOT 버튼) + 지금 예제의 parts(LabExample.parts — 차시 md·사이드카·머리말 `# @part`)를 검사해
 *    (parts.ts resolveWiring) 부품을 놓고 선을 긋고, 찾은 것(오류·주의·참고)을 그림 아래 목록에 보인다. [실행] 직전에 'board.wiring'으로
 *    파이썬에 알린다(파이썬은 코드가 배선과 맞지 않게 핀을 쓰면 콘솔에 한국어로 알린다 — apc_board.py).
 * 3. 입력: 학생이 입력 부품을 누르면 핀을 누르는 값 표를 다시 계산해 'board.inputs'(최신 값 — 실행 시작 때 파이썬이 읽음)를 고치고,
 *    바뀐 핀을 'board.input'(쌓이는 값 — 실행 중 입력 확인 지점에서 반영)으로 보낸다. 실행 전에 누르고 있던 것도 [실행] 때 전해진다.
 * 4. 출력: 파이썬의 'board.state' 이벤트(핀 상태 묶음)를 받아 부품 모습·핀 머리 강조·핀 표를 고친다. [정지]·다시 시작으로 끝나면 부품을
 *    꺼진 모습으로 되돌리고(코드가 스스로 끝나면 마지막 모습 유지 — 실물과 같음), 다음 [실행]의 'reset'에서 새로 그린다.
 * 영상처리 실습실에는 붙지 않는다(manifest labs ['esp32']). io 슬롯이 없는 페이지(차시 임베드 등)에서는 조용히 아무것도 하지 않는다.
 */
import type { RunResult } from '../../runtime/client.ts';
import type { LabModule, LabModuleContext, LabModuleHandle } from '../types.ts';
import manifest from './manifest.ts';
import type { PartInstance, UnknownPartEntry, WiringEntry } from './part-types.ts';
import { PART_DEFINITIONS, inputDrives, onboardWiring, resolveWiring, wiringValue } from './parts.ts';
import {
  BOARD_CHANNEL_INPUT,
  BOARD_CHANNEL_INPUTS,
  BOARD_CHANNEL_WIRING,
  BOARD_EVENT_STATE,
  EMPTY_SNAPSHOT,
  applyStateEvent,
  inputChanges,
  inputsValue,
  parseStateEvent,
  stoppedSnapshot,
  type BoardSnapshot,
  type PinDrive,
} from './state.ts';
import { createBoardView } from './view.ts';

/** [그림 크게 보기] 선택을 기억하는 저장 이름(ctx.storageName('zoom')과 같은 열쇠 — [이 컴퓨터에서 내 기록 지우기]가 함께 지운다) */
export const ZOOM_STORAGE_NAME = `module:${manifest.id}:zoom`;

/** 예제의 실습 방법 단계(없으면 빈 목록) */
export function examplePractice(example: { readonly practice?: readonly string[] } | null | undefined): string[] {
  return Array.isArray(example?.practice) ? example.practice.filter((step) => typeof step === 'string' && step.trim() !== '') : [];
}

/** 예제의 배선 표(없으면 빈 목록 — 보드에 붙은 부품은 resolveWiring이 늘 더한다) */
export function exampleWiring(example: { readonly parts?: readonly WiringEntry[] } | null | undefined): WiringEntry[] {
  return Array.isArray(example?.parts) ? [...example.parts] : [];
}

/** 실행 결과에 따라 보드 모습을 어떻게 둘지: [정지]·다시 시작이면 꺼진 모습, 스스로 끝남·오류면 마지막 모습 */
export function snapshotAfterRun(snapshot: BoardSnapshot, result: Pick<RunResult, 'outcome'>): BoardSnapshot {
  return result.outcome === 'stopped' || result.outcome === 'killed' ? stoppedSnapshot(snapshot) : snapshot;
}

function mount(context: LabModuleContext): LabModuleHandle | void {
  const io = context.root.querySelector<HTMLElement>('[data-board-io]');
  const stage = io?.querySelector<HTMLElement>('[data-board-stage]') ?? null;
  if (!io || !stage) {
    return;
  }
  let snapshot: BoardSnapshot = EMPTY_SNAPSHOT;
  let instances: readonly PartInstance[] = [];
  let unknown: readonly UnknownPartEntry[] = [];
  let drives: Map<number, PinDrive> = new Map();

  const sendInputs = (changes: readonly { pin: number; drive: PinDrive }[]) => {
    context.setValue(BOARD_CHANNEL_INPUTS, inputsValue(drives));
    for (const change of changes) {
      context.pushEvent(BOARD_CHANNEL_INPUT, change);
    }
  };

  const view = createBoardView(
    {
      stage,
      pinRows: io.querySelector<HTMLElement>('[data-board-pin-rows]'),
      pinsEmpty: io.querySelector<HTMLElement>('[data-board-pins-empty]'),
      phaseText: io.querySelector<HTMLElement>('[data-board-phase-text]'),
      problems: io.querySelector<HTMLElement>('[data-board-problems]'),
      zoomButton: io.querySelector<HTMLButtonElement>('[data-board-zoom]'),
      wiringEmpty: io.querySelector<HTMLElement>('[data-board-wiring-empty]'),
    },
    {
      definitions: PART_DEFINITIONS,
      zoomStorageName: ZOOM_STORAGE_NAME,
      onActiveChange(activeIds) {
        const next = inputDrives(instances, activeIds, PART_DEFINITIONS);
        const changes = inputChanges(drives, next);
        drives = next;
        sendInputs(changes);
        view.update(snapshot);
      },
    },
  );

  const practiceBox = io.querySelector<HTMLElement>('[data-board-practice]');
  const practiceSteps = io.querySelector<HTMLElement>('[data-board-practice-steps]');
  const renderPractice = () => {
    if (!practiceBox || !practiceSteps) {
      return;
    }
    const steps = examplePractice(context.lab.currentExample);
    practiceSteps.replaceChildren(
      ...steps.map((step) => {
        const item = document.createElement('li');
        item.textContent = step;
        return item;
      }),
    );
    practiceBox.hidden = steps.length === 0;
  };

  const applyWiring = () => {
    const resolved = resolveWiring([...onboardWiring(PART_DEFINITIONS), ...exampleWiring(context.lab.currentExample)], PART_DEFINITIONS);
    instances = resolved.instances;
    unknown = resolved.unknown;
    view.setWiring(instances, resolved.issues);
    drives = inputDrives(instances, view.activeIds, PART_DEFINITIONS);
    context.setValue(BOARD_CHANNEL_WIRING, wiringValue(instances, unknown, PART_DEFINITIONS));
    context.setValue(BOARD_CHANNEL_INPUTS, inputsValue(drives));
    io.dataset.boardIssues = String(resolved.issues.length);
    renderPractice();
    view.update(snapshot);
  };

  context.onEvent(BOARD_EVENT_STATE, (payload) => {
    const event = parseStateEvent(payload);
    if (!event) {
      return;
    }
    snapshot = applyStateEvent(snapshot, event);
    io.dataset.boardPhase = snapshot.phase;
    // 테스트가 읽는 값: 마지막으로 받은 상태 메시지의 순서 번호와 까닭(reset·change·idle·end)
    io.dataset.boardSeq = String(snapshot.seq);
    io.dataset.boardReason = event.reason;
    view.update(snapshot);
  });

  // [실행] 직전: 배선과 지금 누르고 있는 입력을 다시 넣는다(정지 2단계로 워커가 새로 뜨면 최신 값이 사라지므로 — README 4.3).
  context.onLab('run', () => {
    context.setValue(BOARD_CHANNEL_WIRING, wiringValue(instances, unknown, PART_DEFINITIONS));
    context.setValue(BOARD_CHANNEL_INPUTS, inputsValue(drives));
  });
  context.onLab('done', (result) => {
    snapshot = snapshotAfterRun(snapshot, result);
    io.dataset.boardPhase = snapshot.phase;
    view.update(snapshot);
  });
  context.onLab('example', () => applyWiring());

  applyWiring();
  io.dataset.boardReady = 'yes';
  return {
    dispose() {
      view.destroy();
    },
  };
}

const module: LabModule = { manifest, mount };
export default module;
