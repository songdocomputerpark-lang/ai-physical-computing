/**
 * 4단원 통합 화면(/labs/unit4/)의 화면 논리 — PLAN §8.4 P4-09.
 *
 * 한 문서에 실습실 틀(LabShell)이 **두 개** 있다: 왼쪽(좁은 화면은 위)은 영상처리(labId "vision" — 카메라·얼굴 그물·가상 데스크톱),
 * 오른쪽(아래)은 ESP32(labId "esp32" — 가상 보드의 LCD·서보 2·RGB·레이저·버저·블루투스). 둘은 각자 파이썬 워커를 쓴다(워커 두 벌).
 * LabShell.astro의 스크립트가 `[data-lab]`을 모두 찾아 따로 붙이므로 둘이 서로를 건드리지 않는다.
 *
 * 컴퓨터 → 보드 길(이 파일은 길을 만들지 않고 **순서만** 맞춘다)
 *   학생 코드 `bluetooth.init(주소).send("DATA,x,y,d,r")` → 흉내 모듈 ble-pc(src/lab/modules/ble-pc/) → P4-01 브릿지 보내는 차례
 *   (초당 10회·상태 병합·클릭 이벤트 보존) → 창 이벤트 `apc:ble-write` → 가상 보드 블루투스 조작 칸(P4-03) → 보드 코드 `ESP32BLE.read()`.
 *
 * 이 파일이 하는 일
 *  1. 두 번째 실습실 안의 **겹친 id**를 푼다(dom.ts — 두 실습실에 함께 붙는 모듈 패널의 고정 id).
 *  2. 주소의 공유 링크·?example=을 맞는 칸에 넣는다(address.ts — index.astro 인라인 스크립트가 틀보다 먼저 맡겨 둔 값).
 *  3. 가상 데스크톱 논리 해상도를 **3840×2160**으로 맞춘다(PD-22 — 4-2 보드 코드가 `map(x, 0, 3840, …)`을 쓴다). 가상 데스크톱 칸의
 *     해상도 선택 상자를 고르는 방식이라 모듈을 고치지 않고, 그 모듈이 기억하는 값은 되돌려 둔다(config.ts DESKTOP_SCREEN_STORAGE_NAME).
 *     한 번만 맞춘다 — 그 뒤 학생이 고른 값은 그대로 둔다([기록 지우기] 뒤에는 다시 맞춘다).
 *  4. [함께 실행] — ① 두 파이썬이 준비될 때까지 ② 보드 코드를 먼저 돌려 블루투스 광고를 기다리고 ③ [연결]을 누른 뒤 ④ 컴퓨터 코드를 돌린다.
 *     순서가 중요하다: 자료의 컴퓨터 코드(f104)는 `ble_device.connected`가 참일 때만 보내므로, 보드가 먼저 이어져 있어야 첫 프레임부터 나간다.
 *     [함께 정지] — 두 칸을 함께 멈춘다. 짝 예제 [이 짝 불러오기] — 두 칸의 예제를 한 번에 바꾼다.
 *  5. 입력 소스 고르기를 조작 줄에도 둔다(영상처리 칸의 선택 상자와 같은 값 — 한쪽을 바꾸면 다른 쪽도 따라간다).
 *  6. 성능 재기(perf.ts) — 컴퓨터 코드가 도는 동안 0.5초마다 입력·출력·화면 fps, 긴 작업, 보낸 줄, 힙을 모으고 [측정 기록 복사]로 마크다운 표.
 *
 * 테스트가 읽는 값: `[data-unit4]`의 data-unit4-phase(idle·prepare·board·link·pc·running·stopping), data-unit4-samples,
 * data-unit4-screen(3840x2160), data-unit4-connected, data-unit4-ids(푼 id 수), data-unit4-address(주소 값을 넣은 칸), data-unit4-ready.
 */
import { findExample, findExampleByFile } from '../controls/examples.ts';
import { getLabController, type LabController } from '../controls/lab-shell.ts';
import { parseShareHash } from '../controls/share-link.ts';
import { getMountedModules } from '../modules/host.ts';
import { readItem, removeItem, writeItem } from '../../lib/storage.ts';
import { guessSideFromCode, sideForExampleId, sideForFile, takeAddressStash, type Unit4Side } from './address.ts';
import {
  BOARD_START_MS,
  CONNECT_MS,
  DESKTOP_SCREEN_STORAGE_NAME,
  POLL_MS,
  PYTHON_READY_MS,
  SAMPLE_MS,
  UNIT4_SCREEN,
  UNIT4_SCREEN_VALUE,
} from './config.ts';
import { dedupeIdsWithin } from './dom.ts';
import {
  FrameMeter,
  LongTaskMeter,
  ratePerSec,
  readCount,
  readFps,
  readHeapMb,
  reportMarkdown,
  summarize,
  summaryText,
  type PerfSample,
} from './perf.ts';

export type Unit4Phase = 'idle' | 'prepare' | 'board' | 'link' | 'pc' | 'running' | 'stopping';

/** 성능 기록을 남겨 두는 최대 개수(0.5초 간격이면 30분) */
export const MAX_SAMPLES = 3600;

/** 학생이 읽는 상태 글(한 곳) */
export const UNIT4_TEXT = Object.freeze({
  idle: '[함께 실행]을 누르면 보드 코드 → 블루투스 연결 → 컴퓨터 코드 차례로 돌아가요.',
  prepare: '파이썬을 준비하고 있어요(컴퓨터 칸·보드 칸 두 곳). 준비가 끝나면 바로 시작해요…',
  board: '보드 코드를 실행하고 있어요…',
  link: '가상 보드와 블루투스로 잇고 있어요…',
  pc: '컴퓨터 코드를 실행하고 있어요…',
  running: '두 칸이 함께 돌고 있어요. 얼굴이 움직이면 가상 모니터의 커서와 보드의 서보·LCD가 따라 움직여요.',
  runningNoLink: '컴퓨터 코드는 돌지만 보드와 아직 이어지지 않았어요. 보드 칸의 블루투스 조작 칸에서 [연결]을 눌러요.',
  boardStopped: '보드가 멈췄어요. 좌표가 보드에 닿지 않아요 — [함께 정지]를 누른 뒤 [함께 실행]을 다시 눌러요.',
  noBle: '이 보드 예제는 블루투스를 쓰지 않아서 잇지 않고 컴퓨터 코드만 이어서 돌려요.',
  linkFailed: '블루투스가 아직 이어지지 않았어요. 보드 칸의 블루투스 조작 칸에서 [연결]을 눌러요.',
  pcDoneBoardRunning: '컴퓨터 코드가 끝났어요. 보드는 아직 돌고 있어요 — [함께 정지]로 멈춰요.',
  pcDone: '컴퓨터 코드가 끝났어요. 아래 성능 칸에서 잰 값을 볼 수 있어요.',
  pcError: '컴퓨터 코드가 오류로 멈췄어요. 컴퓨터 칸의 콘솔과 풀이 카드를 봐요.',
  boardError: '보드 코드가 오류로 멈췄어요. 보드 칸의 콘솔과 풀이 카드를 봐요.',
  boardSlow: '보드 코드가 시작하지 않았어요. 보드 칸의 [실행]을 직접 눌러 보고, 콘솔에 오류가 있는지 봐요.',
  pythonFailed: '파이썬을 준비하지 못했어요. 점검 페이지에서 브라우저와 네트워크를 확인해요.',
  pythonSlow: '파이썬 준비가 오래 걸려요. 네트워크가 느리면 몇 분 걸릴 수 있어요 — 기다렸다가 [함께 실행]을 다시 눌러요.',
  stopping: '두 칸을 멈추고 있어요…',
  stopped: '멈췄어요.',
  busy: '지금은 바꿀 수 없어요. 먼저 [함께 정지]를 눌러 두 칸을 멈춰요.',
  pcRunning: '컴퓨터 칸이 이미 돌고 있어요. [함께 정지]를 누른 뒤 [함께 실행]을 눌러요.',
  noDesktop: '가상 모니터 칸은 컴퓨터 칸의 코드가 pyautogui를 쓸 때 열려요.',
  realBoardTarget:
    '보드 칸이 [실제 보드]로 되어 있어요. 이 화면의 컴퓨터 코드는 같은 화면의 가상 보드와만 이어져요 — 보드 칸 입력·출력 위에서 [가상 보드]를 골라요.',
});

/** [바로 가기] 단추가 옮겨 갈 자리(없으면 null) */
function jumpTarget(kind: string, visionRoot: HTMLElement, boardRoot: HTMLElement): HTMLElement | null {
  if (kind === 'output') {
    return visionRoot.querySelector<HTMLElement>('[data-vision-output-stage]');
  }
  if (kind === 'desktop') {
    const panel = visionRoot.querySelector<HTMLElement>('[data-lab-module-panel="desktop"]');
    if (!panel || panel.hidden) {
      return null;
    }
    return panel.querySelector<HTMLElement>('[data-desktop-canvas]') ?? panel;
  }
  if (kind === 'board') {
    return boardRoot.querySelector<HTMLElement>('[data-board-stage-wrap]') ?? boardRoot.querySelector<HTMLElement>('[data-board-io]');
  }
  return null;
}

/** 가상 보드 블루투스 조작 칸(구역 B — src/lab/modules/board/parts/ble/part.ts). 보드 예제에 블루투스가 없으면 null */
export function bleHost(boardRoot: HTMLElement): HTMLElement | null {
  return boardRoot.querySelector<HTMLElement>('[data-board-part-controls][data-part="ble"]');
}

/** 가상 보드의 블루투스가 이어져 있나(구역 B가 조작 칸에 적어 두는 값) */
export function bleConnected(boardRoot: HTMLElement): boolean {
  return bleHost(boardRoot)?.dataset.bleConnected === 'true';
}

/** 실습실 뿌리가 지금 실행 중인가(실제 보드 실행 대상 포함 — data-state가 둘 다 나타낸다) */
function isRunning(root: HTMLElement): boolean {
  return root.dataset.state === 'running' || root.dataset.state === 'stopping';
}

/** 파이썬이 [실행]을 받을 수 있나 */
function isReady(lab: LabController): boolean {
  return lab.runtime.state === 'idle' || lab.runtime.state === 'running' || lab.runtime.state === 'stopping';
}

function waitFor(check: () => boolean, timeoutMs: number, cancelled: () => boolean = () => false): Promise<boolean> {
  return new Promise((resolve) => {
    if (check()) {
      resolve(true);
      return;
    }
    const started = performance.now();
    const timer = window.setInterval(() => {
      if (cancelled()) {
        window.clearInterval(timer);
        resolve(false);
      } else if (check()) {
        window.clearInterval(timer);
        resolve(true);
      } else if (performance.now() - started > timeoutMs) {
        window.clearInterval(timer);
        resolve(false);
      }
    }, POLL_MS);
  });
}

/**
 * 가상 데스크톱 해상도를 value로 맞춘다. 선택 상자·선택지를 못 찾으면 거짓.
 * 모듈이 그 값을 기억하지 않게 바꾸기 전 기억값을 되돌린다(학생이 직접 고른 값만 모듈이 기억하게).
 */
export function applyScreenPreset(visionRoot: HTMLElement, value: string = UNIT4_SCREEN_VALUE): boolean {
  const select = visionRoot.querySelector<HTMLSelectElement>('[data-desktop-screen]');
  if (!select || ![...select.options].some((option) => option.value === value)) {
    return false;
  }
  if (select.value !== value) {
    const remembered = readItem(DESKTOP_SCREEN_STORAGE_NAME);
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    if (remembered === null) {
      removeItem(DESKTOP_SCREEN_STORAGE_NAME);
    } else {
      writeItem(DESKTOP_SCREEN_STORAGE_NAME, remembered);
    }
  }
  return true;
}

export interface Unit4Page {
  readonly root: HTMLElement;
  readonly pc: LabController;
  readonly board: LabController;
  readonly phase: Unit4Phase;
  runTogether(): Promise<void>;
  stopTogether(): Promise<void>;
  loadPair(pcId: string, boardId: string): boolean;
  readonly samples: readonly PerfSample[];
  report(): string;
  dispose(): void;
}

export async function mountUnit4Page(root: HTMLElement | null): Promise<Unit4Page | null> {
  if (!root) {
    return null;
  }
  const visionRoot = document.querySelector<HTMLElement>('[data-lab][data-lab-id="vision"]');
  const boardRoot = document.querySelector<HTMLElement>('[data-lab][data-lab-id="esp32"]');
  if (!visionRoot || !boardRoot) {
    return null;
  }

  // 1. 겹친 id 풀기 — 모듈이 붙기 전에(패널 HTML은 LabShell이 이미 그려 두었다)
  const renamed = dedupeIdsWithin(boardRoot, 'esp32');
  root.dataset.unit4Ids = String(renamed.length);

  const [pc, board] = await Promise.all([getLabController(visionRoot), getLabController(boardRoot)]);

  const elements = {
    run: root.querySelector<HTMLButtonElement>('[data-unit4-run]'),
    stop: root.querySelector<HTMLButtonElement>('[data-unit4-stop]'),
    status: root.querySelector<HTMLElement>('[data-unit4-status]'),
    input: root.querySelector<HTMLSelectElement>('[data-unit4-input]'),
    screen: root.querySelector<HTMLElement>('[data-unit4-screen-note]'),
    pairStatus: root.querySelector<HTMLElement>('[data-unit4-pair-status]'),
    perf: root.querySelector<HTMLElement>('[data-unit4-perf]'),
    copy: root.querySelector<HTMLButtonElement>('[data-unit4-copy]'),
    copied: root.querySelector<HTMLElement>('[data-unit4-copied]'),
    report: root.querySelector<HTMLTextAreaElement>('[data-unit4-report]'),
  };
  const visionSelect = visionRoot.querySelector<HTMLSelectElement>('[data-vision-source-select]');

  const cleanups: (() => void)[] = [];
  const listen = (target: EventTarget | null, type: string, handler: (event: Event) => void) => {
    if (!target) {
      return;
    }
    target.addEventListener(type, handler);
    cleanups.push(() => target.removeEventListener(type, handler));
  };

  const samples: PerfSample[] = [];
  const frameMeter = new FrameMeter();
  const longTasks = new LongTaskMeter();
  let lastSent: { count: number; at: number } | null = null;
  let sampleTimer: number | null = null;
  let phase: Unit4Phase = 'idle';
  /** [함께 정지]를 누르면 올라간다 — 기다리던 [함께 실행] 단계가 이 값을 보고 그만둔다 */
  let generation = 0;
  let statusOverride: string | null = null;
  let disposed = false;

  // ── 상태 글·단추 ──

  const describeRunning = (): string => {
    if (!isRunning(boardRoot)) {
      return UNIT4_TEXT.boardStopped;
    }
    const host = bleHost(boardRoot);
    if (host && !bleConnected(boardRoot)) {
      return UNIT4_TEXT.runningNoLink;
    }
    return host ? UNIT4_TEXT.running : UNIT4_TEXT.noBle;
  };

  const render = () => {
    const pcRunning = isRunning(visionRoot);
    const boardRunning = isRunning(boardRoot);
    root.dataset.unit4Phase = phase;
    root.dataset.unit4Connected = String(bleConnected(boardRoot));
    if (elements.run) {
      elements.run.disabled = phase !== 'idle' || pcRunning;
    }
    if (elements.stop) {
      elements.stop.disabled = phase === 'stopping' || (phase === 'idle' && !pcRunning && !boardRunning);
    }
    if (elements.input) {
      elements.input.disabled = pcRunning;
    }
    let text: string;
    if (statusOverride !== null) {
      text = statusOverride;
    } else if (phase === 'running') {
      text = describeRunning();
    } else {
      text = UNIT4_TEXT[phase];
    }
    if (elements.status && elements.status.textContent !== text) {
      elements.status.textContent = text;
    }
  };

  const setPhase = (next: Unit4Phase, override: string | null = null) => {
    phase = next;
    statusOverride = override;
    render();
  };

  // ── 성능 재기 ──

  const sample = () => {
    const now = performance.now();
    const sentCount = readCount(visionRoot, 'blePcSent');
    const sentPerSec = sentCount === null ? null : ratePerSec(lastSent, { count: sentCount, at: now });
    if (sentCount !== null) {
      lastSent = { count: sentCount, at: now };
    }
    samples.push({
      at: now,
      inputFps: readFps(visionRoot.querySelector<HTMLElement>('[data-vision-input-status]')),
      outputFps: readFps(visionRoot.querySelector<HTMLElement>('[data-vision-output-status]')),
      pageFps: frameMeter.take(),
      longTaskMsPerSec: longTasks.take(),
      sentPerSec,
      heapMb: readHeapMb(),
    });
    // 수업 내내 켜 두어도 기록이 끝없이 늘지 않게 최근 MAX_SAMPLES개(0.5초 간격 30분)만 둔다
    if (samples.length > MAX_SAMPLES) {
      samples.splice(0, samples.length - MAX_SAMPLES);
    }
    root.dataset.unit4Samples = String(samples.length);
    const summary = summarize(samples);
    // 브라우저 테스트가 성능 기록을 읽는 자리(tests/e2e/unit4.spec.ts — 화면 글을 다시 읽어 숫자를 뽑지 않게)
    root.dataset.unit4Summary = JSON.stringify(summary);
    if (elements.perf) {
      elements.perf.textContent = summaryText(summary);
    }
    if (elements.report) {
      elements.report.value = reportText();
    }
    render();
  };

  const startSampling = () => {
    if (sampleTimer !== null) {
      return;
    }
    samples.length = 0;
    lastSent = null;
    root.dataset.unit4Samples = '0';
    delete root.dataset.unit4Summary;
    frameMeter.start();
    longTasks.start();
    frameMeter.take();
    longTasks.take();
    sampleTimer = window.setInterval(sample, SAMPLE_MS);
  };

  const stopSampling = () => {
    if (sampleTimer === null) {
      return;
    }
    window.clearInterval(sampleTimer);
    sampleTimer = null;
    sample();
    frameMeter.stop();
    longTasks.stop();
  };

  const inputLabel = (): string => {
    const option = visionSelect?.selectedOptions[0];
    return option?.textContent?.trim() || visionSelect?.value || '알 수 없음';
  };

  const reportText = (): string => {
    const agent = navigator.userAgent;
    const browser = agent.includes('Edg/') ? 'Edge' : agent.includes('Chrome/') ? 'Chrome' : agent.includes('Firefox/') ? 'Firefox' : '브라우저';
    return reportMarkdown(summarize(samples), {
      where: `${browser} · 창 ${window.innerWidth}×${window.innerHeight}`,
      input: inputLabel(),
      examples: `${pc.currentExample?.title ?? '(편집칸 코드)'} → ${board.currentExample?.title ?? '(편집칸 코드)'}`,
    });
  };

  // 컴퓨터 칸이 돌면 잰다 — [함께 실행]이든 칸의 [실행]이든 같다.
  cleanups.push(
    pc.on('run', () => {
      startSampling();
      render();
    }),
  );
  cleanups.push(
    pc.on('done', () => {
      stopSampling();
      render();
    }),
  );
  cleanups.push(pc.on('state', () => render()));
  cleanups.push(board.on('state', () => render()));
  cleanups.push(
    board.on('done', () => {
      // "보드는 아직 돌고 있어요"라고 적어 둔 뒤 학생이 보드 칸의 [정지]를 누르면 그 글이 거짓말이 된다.
      if (phase === 'idle' && statusOverride === UNIT4_TEXT.pcDoneBoardRunning) {
        statusOverride = UNIT4_TEXT.stopped;
      }
      render();
    }),
  );

  // ── 가상 모니터 3840×2160 ──

  let screenApplied = false;
  const renderScreen = () => {
    const select = visionRoot.querySelector<HTMLSelectElement>('[data-desktop-screen]');
    const value = select?.value ?? '';
    root.dataset.unit4Screen = value;
    if (elements.screen) {
      elements.screen.textContent =
        value === UNIT4_SCREEN_VALUE
          ? `가상 모니터를 ${UNIT4_SCREEN.width}×${UNIT4_SCREEN.height}로 맞췄어요. 4단원 보드 코드가 이 크기를 가정하고 서보 각도를 계산해요.`
          : `가상 모니터가 ${value.replace('x', '×') || '알 수 없는 크기'}예요. 4단원 보드 코드는 ${UNIT4_SCREEN.width}×${UNIT4_SCREEN.height}를 가정해서 서보가 덜 움직여요(가상 데스크톱 칸의 [모니터 크기]에서 바꿔요).`;
    }
  };
  const applyScreenOnce = (force = false) => {
    if (screenApplied && !force) {
      return;
    }
    if ((visionRoot.dataset.labModules ?? '').split(' ').includes('desktop') && applyScreenPreset(visionRoot)) {
      screenApplied = true;
    }
    renderScreen();
  };
  void getMountedModules(visionRoot)
    .then(() => {
      if (!disposed) {
        applyScreenOnce();
        listen(visionRoot.querySelector('[data-desktop-screen]'), 'change', renderScreen);
      }
    })
    .catch(() => undefined);
  // [이 컴퓨터에서 내 기록 지우기]는 가상 데스크톱을 1920×1080으로 되돌린다 — 이 화면의 전제로 다시 맞춘다.
  cleanups.push(pc.on('records-cleared', () => window.setTimeout(() => applyScreenOnce(true), 0)));

  // ── 입력 소스 고르기(조작 줄) ──

  const syncInputOptions = () => {
    const mirror = elements.input;
    if (!mirror || !visionSelect) {
      return;
    }
    const wanted = [...visionSelect.options].map((option) => ({ value: option.value, label: option.textContent ?? option.value, disabled: option.disabled }));
    const current = [...mirror.options].map((option) => ({ value: option.value, label: option.textContent ?? option.value, disabled: option.disabled }));
    if (JSON.stringify(wanted) !== JSON.stringify(current)) {
      mirror.replaceChildren(
        ...wanted.map((item) => {
          const option = document.createElement('option');
          option.value = item.value;
          option.textContent = item.label;
          option.disabled = item.disabled;
          return option;
        }),
      );
    }
    if (mirror.value !== visionSelect.value) {
      mirror.value = visionSelect.value;
    }
  };
  if (elements.input && visionSelect) {
    syncInputOptions();
    // 재생 입력 선택지는 mediapipe 모듈이 붙을 때 더해지고(ensureReplayOption), 코드가 스스로 입력을 바꾸기도 한다(재생 입력 자동 전환).
    const observer = new MutationObserver(syncInputOptions);
    observer.observe(visionSelect, { childList: true, subtree: true, attributes: true });
    observer.observe(visionRoot, { attributes: true, attributeFilter: ['data-vision-source'] });
    cleanups.push(() => observer.disconnect());
    listen(visionSelect, 'change', syncInputOptions);
    listen(elements.input, 'change', () => {
      if (!visionSelect || !elements.input) {
        return;
      }
      visionSelect.value = elements.input.value;
      visionSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  // ── 주소의 공유 링크·?example=을 맞는 칸에 ──

  const labOf = (side: Unit4Side): LabController => (side === 'board' ? board : pc);
  const applyAddress = () => {
    const stash = takeAddressStash(window as unknown as Record<string, unknown>);
    if (!stash) {
      return;
    }
    const placed: string[] = [];
    if (stash.hash !== undefined) {
      const share = parseShareHash(stash.hash);
      const pcIds = new Set(pc.examples.map((example) => example.id));
      const boardIds = new Set(board.examples.map((example) => example.id));
      const side = sideForExampleId(share.example, pcIds, boardIds) ?? (share.code !== undefined ? guessSideFromCode(share.code) : 'pc');
      const lab = labOf(side);
      if (share.code !== undefined) {
        if (share.example !== undefined && findExample(lab.examples, share.example)) {
          lab.loadExample(share.example);
        }
        lab.setCode(share.code, { save: false });
        lab.root.dataset.shareLoaded = 'yes';
        lab.showMessage('공유 링크의 코드를 불러왔어요. 고치면 이 컴퓨터에 자동 저장돼요.');
      } else {
        lab.root.dataset.shareLoaded = 'broken';
        lab.showMessage('공유 링크가 망가져 있어서 코드를 읽지 못했어요. 링크를 보낸 사람에게 다시 받아 주세요.');
      }
      placed.push(`share:${side}`);
    }
    if (stash.example !== undefined) {
      const side = sideForFile(stash.example);
      const lab = side ? labOf(side) : null;
      const found = lab ? findExampleByFile(lab.examples, stash.example) : undefined;
      if (lab && found) {
        lab.loadExample(found.id);
        placed.push(`example:${side}`);
      } else {
        const where = side === 'board' ? 'ESP32 실습실' : '영상처리 실습실';
        pc.showMessage(`링크에 적힌 예제(${stash.example})는 이 화면에 없어요. 이 화면에는 4단원 예제만 있어요 — ${where}에서 열어요.`);
        placed.push('example:missing');
      }
    }
    root.dataset.unit4Address = placed.join(' ');
  };
  applyAddress();

  // ── [함께 실행]·[함께 정지]·짝 예제 ──

  const runTogether = async () => {
    if (phase !== 'idle' || isRunning(visionRoot)) {
      if (isRunning(visionRoot)) {
        setPhase(phase, UNIT4_TEXT.pcRunning);
      }
      return;
    }
    const mine = ++generation;
    const cancelled = () => mine !== generation || disposed;

    // ① 두 파이썬 준비
    if (!isReady(pc) || !isReady(board)) {
      setPhase('prepare');
      const failed = () => pc.runtime.state === 'failed' || board.runtime.state === 'failed';
      const ready = await waitFor(() => (isReady(pc) && isReady(board)) || failed(), PYTHON_READY_MS, cancelled);
      if (cancelled()) {
        return;
      }
      if (!ready || failed()) {
        setPhase('idle', failed() ? UNIT4_TEXT.pythonFailed : UNIT4_TEXT.pythonSlow);
        return;
      }
    }

    // ② 보드 먼저(이미 돌고 있으면 그대로 둔다). 보드 칸이 실제 보드로 실행하게 돼 있으면 가상 블루투스가 없어 이어지지 않는다.
    if ((boardRoot.dataset.runTarget ?? '') !== '') {
      setPhase('idle', UNIT4_TEXT.realBoardTarget);
      return;
    }
    setPhase('board');
    let boardEnded = false;
    const offBoardDone = board.on('done', () => {
      boardEnded = true;
    });
    try {
      if (!isRunning(boardRoot)) {
        void board.run();
      }
      const started = await waitFor(() => isRunning(boardRoot) || boardEnded, BOARD_START_MS, cancelled);
      if (cancelled()) {
        return;
      }
      if (boardEnded || !started) {
        setPhase('idle', boardEnded && boardRoot.dataset.outcome === 'error' ? UNIT4_TEXT.boardError : UNIT4_TEXT.boardSlow);
        return;
      }

      // ③ 블루투스 잇기(보드 예제에 블루투스가 있을 때만). 잇지 못해도 컴퓨터 코드는 돌린다 — 상태 글이 [연결]을 누르라고 알린다.
      // 부품 조작 칸은 보드 그림이 그려진 뒤에 생긴다 — 잠깐 기다려 본다.
      await waitFor(() => bleHost(boardRoot) !== null, 2_000, cancelled);
      const host = bleHost(boardRoot);
      if (host) {
        setPhase('link');
        const advertising = await waitFor(
          () => host.dataset.bleRunning === 'true' && (host.dataset.bleAdvertising === 'true' || bleConnected(boardRoot)),
          BOARD_START_MS,
          () => cancelled() || boardEnded,
        );
        if (cancelled()) {
          return;
        }
        if (boardEnded) {
          setPhase('idle', boardRoot.dataset.outcome === 'error' ? UNIT4_TEXT.boardError : UNIT4_TEXT.boardSlow);
          return;
        }
        if (advertising && !bleConnected(boardRoot)) {
          host.querySelector<HTMLButtonElement>('[data-ble-connect]')?.click();
        }
        const linked = advertising && (await waitFor(() => bleConnected(boardRoot), CONNECT_MS, cancelled));
        if (cancelled()) {
          return;
        }
        setPhase('pc', linked ? null : UNIT4_TEXT.linkFailed);
      } else {
        setPhase('pc', UNIT4_TEXT.noBle);
      }

      // ④ 컴퓨터 코드
      applyScreenOnce();
      const done = pc.run();
      setPhase('running', null);
      const result = await done;
      if (cancelled()) {
        return;
      }
      if (result && result.outcome === 'error') {
        setPhase('idle', UNIT4_TEXT.pcError);
      } else {
        setPhase('idle', isRunning(boardRoot) ? UNIT4_TEXT.pcDoneBoardRunning : UNIT4_TEXT.pcDone);
      }
    } finally {
      offBoardDone();
    }
  };

  const stopTogether = async () => {
    generation += 1;
    setPhase('stopping');
    const jobs: Promise<unknown>[] = [];
    if (isRunning(visionRoot)) {
      jobs.push(pc.stop().catch(() => undefined));
    }
    if (isRunning(boardRoot)) {
      jobs.push(board.stop().catch(() => undefined));
    }
    await Promise.all(jobs);
    stopSampling();
    setPhase('idle', UNIT4_TEXT.stopped);
  };

  const loadPair = (pcId: string, boardId: string): boolean => {
    if (phase !== 'idle' || isRunning(visionRoot) || isRunning(boardRoot)) {
      if (elements.pairStatus) {
        elements.pairStatus.textContent = UNIT4_TEXT.busy;
      }
      return false;
    }
    const pcOk = findExample(pc.examples, pcId) ? pc.loadExample(pcId) : false;
    const boardOk = findExample(board.examples, boardId) ? board.loadExample(boardId) : false;
    if (elements.pairStatus) {
      elements.pairStatus.textContent =
        pcOk && boardOk
          ? `"${pc.currentExample?.title ?? pcId}"과(와) "${board.currentExample?.title ?? boardId}"을(를) 불러왔어요. [함께 실행]을 눌러요.`
          : '이 짝의 예제를 찾지 못했어요. 두 칸의 [예제 불러오기]에서 직접 골라요.';
    }
    return pcOk && boardOk;
  };

  listen(elements.run, 'click', () => {
    void runTogether();
  });
  listen(elements.stop, 'click', () => {
    void stopTogether();
  });
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-unit4-pair]')) {
    listen(button, 'click', () => {
      loadPair(button.dataset.unit4PairPc ?? '', button.dataset.unit4PairBoard ?? '');
    });
  }
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-unit4-jump]')) {
    listen(button, 'click', () => {
      const target = jumpTarget(button.dataset.unit4Jump ?? '', visionRoot, boardRoot);
      if (!target) {
        setPhase(phase, UNIT4_TEXT.noDesktop);
        return;
      }
      // 움직임 줄이기 설정이면 부드럽게 넘기지 않는다(src/lab/controls/reveal.ts와 같은 규칙)
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      target.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
      if (target.tabIndex < 0 && !target.hasAttribute('tabindex')) {
        target.setAttribute('tabindex', '-1');
      }
      target.focus({ preventScroll: true });
    });
  }
  listen(elements.copy, 'click', () => {
    const text = reportText();
    if (elements.report) {
      elements.report.value = text;
    }
    const done = (message: string) => {
      if (elements.copied) {
        elements.copied.textContent = message;
      }
    };
    if (!navigator.clipboard?.writeText) {
      done('이 브라우저는 복사를 막았어요. 아래 칸의 글을 직접 골라 복사해요.');
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => done('측정 기록을 복사했어요. 알려 줄 곳에 붙여 넣어요.'),
      () => done('이 브라우저는 복사를 막았어요. 아래 칸의 글을 직접 골라 복사해요.'),
    );
  });

  setPhase('idle');
  root.dataset.unit4Samples = '0';
  root.dataset.unit4Ready = 'yes';

  return {
    root,
    pc,
    board,
    get phase() {
      return phase;
    },
    runTogether,
    stopTogether,
    loadPair,
    get samples() {
      return samples;
    },
    report: reportText,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      generation += 1;
      if (sampleTimer !== null) {
        window.clearInterval(sampleTimer);
        sampleTimer = null;
      }
      frameMeter.stop();
      longTasks.stop();
      for (const cleanup of cleanups.splice(0)) {
        cleanup();
      }
    },
  };
}
