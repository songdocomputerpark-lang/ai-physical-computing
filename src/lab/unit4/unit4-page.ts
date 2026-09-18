/**
 * 4단원 통합 화면(/labs/unit4/)의 화면 논리 — PLAN §8.4 P4-09.
 *
 * 한 문서에 실습실 틀(LabShell)이 **두 개** 있다: 왼쪽은 영상처리(labId "vision" — 카메라·얼굴 그물·가상 데스크톱),
 * 오른쪽은 ESP32(labId "esp32" — 가상 보드의 LCD·서보 2·RGB·레이저·버저·블루투스). 둘은 각자 파이썬 워커를 쓴다(워커 두 벌).
 * LabShell.astro의 스크립트가 `[data-lab]`을 모두 찾아 따로 붙이므로 둘이 서로를 건드리지 않는다.
 *
 * 이 파일이 하는 일
 *  1. 가상 데스크톱 논리 해상도를 **3840×2160**으로 맞춘다(PD-22 — 4-2 예제의 보드 코드가 `map(x, 0, 3840, …)`을 쓴다).
 *     가상 데스크톱 칸의 해상도 선택 상자를 바꿔 주는 방식이라, 학생이 직접 다른 값으로 바꿀 수도 있다.
 *  2. [함께 실행] — ① 보드 코드를 먼저 돌리고 ② 블루투스 [연결]을 누른 뒤 ③ 컴퓨터 코드를 돌린다.
 *     순서가 중요하다: 컴퓨터 코드의 `bluetooth.init(...)`이 불릴 때 보드가 이미 광고 중이어야 좌표가 첫 프레임부터 나간다.
 *  3. [함께 정지] — 두 실습실을 함께 멈춘다.
 *  4. 성능 재기(perf.ts) — 0.5초마다 입력 fps·출력 fps·힙을 모아 요약을 보이고 [측정 기록 복사]로 마크다운 표를 만든다.
 *
 * 값을 넣고 빼는 자리(다른 구역이 만든 것을 **읽기만** 한다)
 *  · 가상 데스크톱: `[data-desktop-screen]`(P2-11 구역이 만든 선택 상자)
 *  · 가상 보드 블루투스: `[data-ble-connect]`·`[data-ble-connected]`(P4-03 구역 B)
 *  · 컴퓨터 쪽 블루투스 흉내: 실습실 뿌리의 `data-ble-pc-*`(ble-pc 모듈)
 *
 * 테스트가 읽는 값: `[data-unit4]`의 data-unit4-phase(idle·board·link·pc·running·stopping), data-unit4-samples,
 * data-unit4-screen(3840x2160), data-unit4-connected.
 */
import { getLabController, type LabController } from '../controls/lab-shell.ts';
import { BOARD_READY_MS, CONNECT_MS, SAMPLE_MS, UNIT4_SCREEN, UNIT4_SCREEN_VALUE } from './config.ts';
import { readFps, readHeapMb, reportMarkdown, summarize, summaryText, type PerfSample } from './perf.ts';

export type Unit4Phase = 'idle' | 'board' | 'link' | 'pc' | 'running' | 'stopping';

function waitFor(check: () => boolean, timeoutMs: number, stepMs = 100): Promise<boolean> {
  return new Promise((resolve) => {
    if (check()) {
      resolve(true);
      return;
    }
    const started = performance.now();
    const timer = window.setInterval(() => {
      if (check()) {
        window.clearInterval(timer);
        resolve(true);
      } else if (performance.now() - started > timeoutMs) {
        window.clearInterval(timer);
        resolve(false);
      }
    }, stepMs);
  });
}

/** 가상 데스크톱 해상도를 3840×2160으로 맞춘다. 선택 상자를 못 찾으면 거짓. */
export function applyScreenPreset(visionRoot: HTMLElement, value: string = UNIT4_SCREEN_VALUE): boolean {
  const select = visionRoot.querySelector<HTMLSelectElement>('[data-desktop-screen]');
  if (!select) {
    return false;
  }
  const has = [...select.options].some((option) => option.value === value);
  if (!has) {
    return false;
  }
  if (select.value !== value) {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return true;
}

/** 가상 보드의 블루투스가 이어져 있나(구역 B가 적어 두는 값) */
export function bleConnected(): boolean {
  return document.querySelector<HTMLElement>('[data-ble-connected]')?.dataset.bleConnected === 'true';
}

export interface Unit4Page {
  readonly root: HTMLElement;
  readonly pc: LabController;
  readonly board: LabController;
  runTogether(): Promise<void>;
  stopTogether(): Promise<void>;
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
  const [pc, board] = await Promise.all([getLabController(visionRoot), getLabController(boardRoot)]);

  const elements = {
    run: root.querySelector<HTMLButtonElement>('[data-unit4-run]'),
    stop: root.querySelector<HTMLButtonElement>('[data-unit4-stop]'),
    status: root.querySelector<HTMLElement>('[data-unit4-status]'),
    perf: root.querySelector<HTMLElement>('[data-unit4-perf]'),
    copy: root.querySelector<HTMLButtonElement>('[data-unit4-copy]'),
    copied: root.querySelector<HTMLElement>('[data-unit4-copied]'),
    screen: root.querySelector<HTMLElement>('[data-unit4-screen-note]'),
  };

  const samples: PerfSample[] = [];
  let phase: Unit4Phase = 'idle';
  let timer: number | null = null;
  let disposed = false;

  const setPhase = (next: Unit4Phase, text: string) => {
    phase = next;
    root.dataset.unit4Phase = next;
    if (elements.status) {
      elements.status.textContent = text;
    }
    if (elements.run) {
      elements.run.disabled = next !== 'idle' && next !== 'running';
    }
    if (elements.stop) {
      elements.stop.disabled = next === 'idle';
    }
  };

  const sample = () => {
    const inputFps = readFps(visionRoot.querySelector<HTMLElement>('[data-vision-input-status]'));
    const outputFps = readFps(visionRoot.querySelector<HTMLElement>('[data-vision-output-status]'));
    samples.push({ at: performance.now(), inputFps, outputFps, heapMb: readHeapMb() });
    root.dataset.unit4Samples = String(samples.length);
    root.dataset.unit4Connected = String(bleConnected());
    if (elements.perf) {
      elements.perf.textContent = summaryText(summarize(samples));
    }
  };

  const startSampling = () => {
    if (timer !== null) {
      return;
    }
    timer = window.setInterval(sample, SAMPLE_MS);
  };
  const stopSampling = () => {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };

  const applyScreen = () => {
    const ok = applyScreenPreset(visionRoot);
    root.dataset.unit4Screen = ok ? UNIT4_SCREEN_VALUE : '';
    if (elements.screen) {
      elements.screen.textContent = ok
        ? `가상 모니터를 ${UNIT4_SCREEN.width}×${UNIT4_SCREEN.height}로 맞췄어요. 보드 코드가 이 크기를 가정해서 각도를 계산해요.`
        : '가상 데스크톱 칸을 아직 찾지 못했어요. 코드에 pyautogui가 보이면 칸이 열려요.';
    }
    return ok;
  };

  // 가상 데스크톱 칸은 코드가 pyautogui를 쓸 때만 열린다(showPanelWhenUsed) — 열리는 때를 놓치지 않게 예제·코드가 바뀔 때마다 맞춘다.
  applyScreen();
  const offCode = pc.on('code', () => {
    window.setTimeout(applyScreen, 0);
  });
  const offRun = pc.on('run', () => {
    window.setTimeout(applyScreen, 0);
  });
  visionRoot.addEventListener('apc:lab-modules-ready', applyScreen);

  const runTogether = async () => {
    if (phase !== 'idle' && phase !== 'running') {
      return;
    }
    samples.length = 0;
    root.dataset.unit4Samples = '0';

    setPhase('board', '가상 보드 코드를 실행하는 중이에요…');
    void board.run();
    const advertising = await waitFor(() => document.querySelector<HTMLElement>('[data-ble-connect]') !== null && boardRoot.dataset.state === 'running', BOARD_READY_MS);

    setPhase('link', '가상 보드의 블루투스를 잇는 중이에요…');
    if (advertising) {
      const connect = document.querySelector<HTMLButtonElement>('[data-ble-connect]');
      connect?.click();
      await waitFor(bleConnected, CONNECT_MS);
    }

    setPhase('pc', '컴퓨터 코드를 실행하는 중이에요…');
    applyScreen();
    startSampling();
    const done = pc.run();
    setPhase('running', bleConnected() ? '둘 다 돌고 있어요. 카메라 앞에서 코를 움직여 보세요.' : '컴퓨터 코드가 돌고 있어요(보드와 아직 이어지지 않았어요).');
    await done;
    stopSampling();
    sample();
    setPhase('idle', '컴퓨터 코드가 끝났어요. 아래 측정값을 보세요.');
  };

  const stopTogether = async () => {
    setPhase('stopping', '두 실습실을 멈추는 중이에요…');
    stopSampling();
    await Promise.all([pc.stop(), board.stop()]);
    setPhase('idle', '멈췄어요.');
  };

  elements.run?.addEventListener('click', () => {
    void runTogether();
  });
  elements.stop?.addEventListener('click', () => {
    void stopTogether();
  });
  elements.copy?.addEventListener('click', () => {
    const text = reportMarkdown(summarize(samples), { where: `${navigator.userAgent.includes('Edg/') ? 'Edge' : '브라우저'} · ${window.innerWidth}×${window.innerHeight}` });
    void navigator.clipboard
      ?.writeText(text)
      .then(() => {
        if (elements.copied) {
          elements.copied.textContent = '측정 기록을 복사했어요. PROGRESS.md에 붙여 넣어요.';
        }
      })
      .catch(() => {
        if (elements.copied) {
          elements.copied.textContent = '복사가 막혔어요. 아래 글을 직접 끌어서 복사해요.';
        }
      });
  });

  setPhase('idle', '[함께 실행]을 누르면 보드 → 블루투스 연결 → 컴퓨터 코드 차례로 돌아가요.');
  root.dataset.unit4Samples = '0';
  root.dataset.unit4Connected = String(bleConnected());

  return {
    root,
    pc,
    board,
    runTogether,
    stopTogether,
    get samples() {
      return samples;
    },
    report() {
      return reportMarkdown(summarize(samples), { where: '브라우저' });
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      stopSampling();
      offCode();
      offRun();
      visionRoot.removeEventListener('apc:lab-modules-ready', applyScreen);
    },
  };
}
