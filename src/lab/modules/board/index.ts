/**
 * 가상 ESP32 보드 모듈의 화면 쪽(PLAN §8.3 P3-01·P3-02, src/lab/README.md 7절). 파이썬 쪽은 같은 폴더의 machine.py·apc_board.py.
 *
 * 하는 일
 * 1. ESP32 실습실의 io 슬롯(src/components/lab/BoardIo.astro의 [data-board-io])에 보드 그림·배선도·부품·핀 표를 그린다(view.ts).
 * 2. 배선: 보드에 붙은 부품(내장 LED·BOOT 버튼) + 지금 예제의 parts(LabExample.parts — 차시 md·사이드카·머리말 `# @part`)를 검사해
 *    (parts.ts resolveWiring) 부품을 놓고 선을 긋고, 찾은 것(오류·주의·참고)을 그림 아래 목록에 보인다. [실행] 직전에 'board.wiring'으로
 *    파이썬에 알린다(파이썬은 코드가 배선과 맞지 않게 핀을 쓰면 콘솔에 한국어로 알린다 — apc_board.py).
 * 3. 입력: 학생이 입력 부품을 누르거나 부품 조작 칸(controls)을 움직이면 핀을 누르는 값 표를 다시 계산해 'board.inputs'(최신 값 — 실행 시작 때
 *    파이썬이 읽음)를 고치고, 바뀐 핀을 'board.input'(쌓이는 값 — 실행 중 입력 확인 지점에서 반영)으로 보낸다. 실행 전에 누르고 있던 것도 [실행] 때 전해진다.
 * 4. 출력: 파이썬의 'board.state' 이벤트(핀 상태 묶음)와 'board.device' 이벤트(부품 장치 상태 — 문자 LCD 글자 등)를 받아 부품 모습·핀 머리 강조·핀 표를
 *    고친다. [정지]·다시 시작으로 끝나면 부품을 꺼진 모습으로 되돌리고(코드가 스스로 끝나면 마지막 모습 유지 — 실물과 같음), 다음 [실행]의 'reset'에서 새로 그린다.
 * 5. (병렬 제작 준비 2026-09-17) 보드 라이브러리: examples/esp32/lib/의 .py(i2c_lcd.py 등 — board-library-files.ts)를 파이썬이 준비될 때마다
 *    워커의 /board/lib/에 써 넣어 학생 코드가 `from i2c_lcd import I2cLcd`처럼 import하게 한다(실물 보드에 파일을 올린 것과 같게).
 * 6. (병렬 제작 준비 2026-09-17) 소리: 배선에 소리 부품(정의 sound: true)이 있으면 [소리 켜기/끄기] 단추를 보이고, [실행] 때 AudioContext를 깨운다(board-audio.ts).
 * 영상처리 실습실에는 붙지 않는다(manifest labs ['esp32']). io 슬롯이 없는 페이지(차시 임베드 등)에서는 조용히 아무것도 하지 않는다.
 */
import { BOARD_LIBRARIES, BOARD_LIBRARY_DIR } from '../../esp32/board-library-files.ts';
import type { RunResult } from '../../runtime/client.ts';
import type { LabModule, LabModuleContext, LabModuleHandle } from '../types.ts';
import { getBoardAudio } from './board-audio.ts';
import manifest from './manifest.ts';
import type { PartControlApi, PartDefinition, PartInstance, UnknownPartEntry, WiringEntry } from './part-types.ts';
import { PART_DEFINITIONS, inputDrives, onboardWiring, resolveWiring, wiringValue, withControlDrive, type ControlDrives } from './parts.ts';
import {
  BOARD_CHANNEL_DEVICE_INPUT,
  BOARD_CHANNEL_INPUT,
  BOARD_CHANNEL_INPUTS,
  BOARD_CHANNEL_WIRING,
  BOARD_EVENT_DEVICE,
  BOARD_EVENT_STATE,
  EMPTY_SNAPSHOT,
  applyDeviceEvent,
  applyStateEvent,
  inputChanges,
  inputsValue,
  parseDeviceEvent,
  parseStateEvent,
  stoppedSnapshot,
  type BoardSnapshot,
  type PartDeviceState,
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

/** 배선에 소리 부품(정의 sound: true)이 있는지 */
export function wiringHasSound(instances: readonly PartInstance[], definitions: ReadonlyMap<string, PartDefinition> = PART_DEFINITIONS): boolean {
  return instances.some((instance) => definitions.get(instance.part)?.sound === true);
}

function mount(context: LabModuleContext): LabModuleHandle | void {
  const io = context.root.querySelector<HTMLElement>('[data-board-io]');
  const stage = io?.querySelector<HTMLElement>('[data-board-stage]') ?? null;
  if (!io || !stage) {
    return;
  }
  let snapshot: BoardSnapshot = EMPTY_SNAPSHOT;
  let devices: ReadonlyMap<string, PartDeviceState> = new Map();
  let instances: readonly PartInstance[] = [];
  let unknown: readonly UnknownPartEntry[] = [];
  let drives: Map<number, PinDrive> = new Map();
  let controlDrives: ControlDrives = new Map();
  const cleanups: (() => void)[] = [];

  const sendInputs = (changes: readonly { pin: number; drive: PinDrive }[]) => {
    context.setValue(BOARD_CHANNEL_INPUTS, inputsValue(drives));
    for (const change of changes) {
      context.pushEvent(BOARD_CHANNEL_INPUT, change);
    }
  };

  /** 누르는 값 표를 다시 계산해 바뀐 핀만 파이썬에 알린다(입력 부품 누르기·부품 조작 칸) */
  const refreshDrives = () => {
    const next = inputDrives(instances, view.activeIds, PART_DEFINITIONS, controlDrives);
    const changes = inputChanges(drives, next);
    drives = next;
    if (changes.length > 0) {
      sendInputs(changes);
    }
  };

  const controlApi = (instance: PartInstance, definition: PartDefinition): PartControlApi => ({
    instance,
    definition,
    setDrive(role, drive) {
      if (!definition.pins.some((pin) => pin.role === role && pin.direction === 'in')) {
        throw new Error(`${definition.id} 부품에는 입력 핀 역할 "${role}"이(가) 없어요.`);
      }
      controlDrives = withControlDrive(controlDrives, instance.id, role, drive);
      refreshDrives();
      view.update(snapshot, devices);
    },
    sendToDevice(data) {
      context.pushEvent(BOARD_CHANNEL_DEVICE_INPUT, { id: instance.id, data });
    },
    storageName(name) {
      return `module:${manifest.id}:${definition.id}:${name}`;
    },
  });

  const view = createBoardView(
    {
      stage,
      pinRows: io.querySelector<HTMLElement>('[data-board-pin-rows]'),
      pinsEmpty: io.querySelector<HTMLElement>('[data-board-pins-empty]'),
      phaseText: io.querySelector<HTMLElement>('[data-board-phase-text]'),
      problems: io.querySelector<HTMLElement>('[data-board-problems]'),
      zoomButton: io.querySelector<HTMLButtonElement>('[data-board-zoom]'),
      wiringEmpty: io.querySelector<HTMLElement>('[data-board-wiring-empty]'),
      controls: io.querySelector<HTMLElement>('[data-board-controls]'),
    },
    {
      definitions: PART_DEFINITIONS,
      zoomStorageName: ZOOM_STORAGE_NAME,
      controlApi,
      onActiveChange() {
        refreshDrives();
        view.update(snapshot, devices);
      },
    },
  );

  // 소리 켜기·끄기(소리 부품이 배선에 있을 때만 보인다)
  const audio = getBoardAudio();
  const soundButton = io.querySelector<HTMLButtonElement>('[data-board-sound]');
  const renderSound = () => {
    if (!soundButton) {
      return;
    }
    soundButton.setAttribute('aria-pressed', String(audio.enabled));
    soundButton.textContent = audio.enabled ? '소리 켜짐' : '소리 꺼짐';
    // 단추의 data-board-sound와 겹치지 않게 상태는 다른 이름으로 적는다(부품 테스트가 [data-board-sound-state="on"]으로 본다)
    io.dataset.boardSoundState = audio.enabled ? 'on' : 'off';
  };
  if (soundButton) {
    const onSound = () => audio.setEnabled(!audio.enabled);
    soundButton.addEventListener('click', onSound);
    cleanups.push(() => soundButton.removeEventListener('click', onSound));
  }
  cleanups.push(audio.onChange(renderSound));
  renderSound();

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
    const liveIds = new Set(instances.map((instance) => instance.id));
    controlDrives = new Map([...controlDrives.entries()].filter(([id]) => liveIds.has(id)));
    view.setWiring(instances, resolved.issues);
    drives = inputDrives(instances, view.activeIds, PART_DEFINITIONS, controlDrives);
    context.setValue(BOARD_CHANNEL_WIRING, wiringValue(instances, unknown, PART_DEFINITIONS));
    context.setValue(BOARD_CHANNEL_INPUTS, inputsValue(drives));
    io.dataset.boardIssues = String(resolved.issues.length);
    if (soundButton) {
      soundButton.hidden = !wiringHasSound(instances);
    }
    renderPractice();
    view.update(snapshot, devices);
  };

  context.onEvent(BOARD_EVENT_STATE, (payload) => {
    const event = parseStateEvent(payload);
    if (!event) {
      return;
    }
    if (event.reason === 'reset') {
      // 보드를 새로 켰다: 지난 실행의 부품 장치 상태(LCD 글자 등)를 지운다.
      devices = new Map();
      io.dataset.boardDevices = '0';
    }
    snapshot = applyStateEvent(snapshot, event);
    io.dataset.boardPhase = snapshot.phase;
    // 테스트가 읽는 값: 마지막으로 받은 상태 메시지의 순서 번호와 까닭(reset·change·idle·end)
    io.dataset.boardSeq = String(snapshot.seq);
    io.dataset.boardReason = event.reason;
    view.update(snapshot, devices);
  });

  context.onEvent(BOARD_EVENT_DEVICE, (payload) => {
    const event = parseDeviceEvent(payload);
    if (!event) {
      return;
    }
    devices = applyDeviceEvent(devices, event);
    // 테스트가 읽는 값: 상태를 받은 부품 장치 수와 마지막으로 받은 배선 id
    io.dataset.boardDevices = String(devices.size);
    io.dataset.boardDeviceLast = event.id;
    view.update(snapshot, devices);
  });

  // 보드 라이브러리를 워커의 /board/lib/에 넣는다(파이썬이 준비될 때마다 — 정지 2단계로 워커가 새로 떠도 다시 넣는다).
  const runtime = context.runtime;
  const writeLibraries = async () => {
    let written = 0;
    for (const library of BOARD_LIBRARIES) {
      try {
        await runtime.writeFile(`${BOARD_LIBRARY_DIR}/${library.fileName}`, library.source);
        written += 1;
      } catch (error) {
        context.notice(`보드 라이브러리 ${library.fileName}을(를) 가상 보드에 넣지 못했어요: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    io.dataset.boardLibraries = String(written);
  };
  cleanups.push(runtime.on('ready', () => void writeLibraries()));
  if (runtime.state === 'idle') {
    void writeLibraries();
  }

  // [실행] 직전: 배선과 지금 누르고 있는 입력을 다시 넣는다(정지 2단계로 워커가 새로 뜨면 최신 값이 사라지므로 — README 4.3).
  // 사용자가 [실행]을 누른 순간이라 멈춰 있던 소리(AudioContext)도 깨운다(자동 재생 정책).
  context.onLab('run', () => {
    context.setValue(BOARD_CHANNEL_WIRING, wiringValue(instances, unknown, PART_DEFINITIONS));
    context.setValue(BOARD_CHANNEL_INPUTS, inputsValue(drives));
    audio.resume();
  });
  context.onLab('done', (result) => {
    snapshot = snapshotAfterRun(snapshot, result);
    io.dataset.boardPhase = snapshot.phase;
    view.update(snapshot, devices);
  });
  context.onLab('example', () => applyWiring());

  applyWiring();
  io.dataset.boardReady = 'yes';
  return {
    dispose() {
      for (const cleanup of cleanups.splice(0)) {
        cleanup();
      }
      view.destroy();
    },
  };
}

const module: LabModule = { manifest, mount };
export default module;
