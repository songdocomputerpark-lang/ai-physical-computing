/**
 * 가려진 탭에서도 제때 도는 시계(미해결 220 — 판 1.1.5 뒤). 탭 통로(`tab.ts`)의 heartbeat·상대 기다리기 타이머가 쓴다.
 *
 * 왜 필요한가
 * - 크롬·엣지는 가려진 탭의 주 스레드 타이머를 1초에 한 번 몰아서 돌리고, 다 불러온 쪽이 **1분** 넘게 가려지면 사슬 타이머
 *   (setTimeout 콜백 안에서 다시 건 setTimeout — 5번째부터)를 **1분에 한 번**으로 줄인다(intensive wake up throttling).
 *   소리가 30초 넘게 없고 WebRTC를 쓰지 않을 때다(https://developer.chrome.com/blog/timer-throttling-in-chrome-88 — 그 글의 "5분"은
 *   2021년 값이고, 지금 Chromium은 다 불러온 쪽이 60초: third_party/blink/renderer/platform/scheduler/common/features.h
 *   `kIntensiveWakeUpThrottling_GracePeriodSecondsLoaded_Default = 60`, 같은 폴더 features.cc `GetIntensiveWakeUpThrottlingGracePeriod`).
 * - 탭 통로는 2초마다 "여기 있어요"(bridge.here)를 보내고 6초 동안 소식이 없는 상대를 목록에서 뺀다. 주 스레드 setTimeout 사슬이면
 *   가려진 보드 탭이 1분에 한 번만 알려 상대 탭의 목록에서 빠졌다 들어왔다 했다(PROGRESS 미해결 220 — 2026-10-06 크롬 154 실측:
 *   가린 지 약 65초에 처음 빠지고 0.5초 표본의 46%가 빠짐. 엣지 154는 새 프로필 기본값에서는 강한 조절이 없었고, 그 기능을 켜면 같았다).
 *
 * 어떻게 피하나
 * - 전용 워커의 타이머는 이 조절을 받지 않는다: 워커 조절(`kDedicatedWorkerThrottling` "BlinkSchedulerWorkerThrottling")은
 *   `FEATURE_DISABLED_BY_DEFAULT`(common/features.h, worker/worker_thread_scheduler.cc), 강한 조절은 쪽(frame) 스케줄러의
 *   `kJavascriptTimerDelayedHighNesting` 줄에만 걸린다(main_thread/frame_scheduler_impl.cc).
 * - 워커가 보낸 메시지(`kPostedMessage`)는 주 스레드에서 조절되지 않는 줄(`PausableTaskQueueTraits`)로 온다(같은 파일).
 * - 그래서 시간은 워커가 재고, 때가 되면 주 스레드가 알림을 받아 일한다. **일은 주 스레드가 한다** — 주 스레드가 멈춘 탭(바쁜 탭·
 *   얼린 탭)은 여전히 알리지 못하므로 "살아 있음"의 뜻은 그대로다(LB-08 상태 묻기 — DECISIONS C70 ⑤도 그대로).
 * - 워커를 만들 수 없는 곳(Node 단위 검사·워커를 막은 브라우저)이나 워커가 오류로 멈추면 주 스레드 타이머(systemScheduler)로 돈다.
 *
 * 워커는 문서마다 하나를 함께 쓰고(backgroundScheduler), 걸린 타이머가 하나도 없으면 닫는다(다음에 걸 때 다시 띄운다).
 *
 * 라이선스: 사이트 소프트웨어(MIT, PD-26).
 */
import { systemScheduler, type BridgeScheduler } from '../outbox.ts';

/** 시계 워커에서 쓰는 부분(테스트가 가짜를 넣는다) */
export interface ClockWorkerLike {
  postMessage(data: unknown): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  addEventListener(type: 'error', listener: (event: { preventDefault?: () => void }) => void): void;
  terminate(): void;
}

export interface WorkerSchedulerOptions {
  /** 시계 워커를 만드는 함수(테스트가 가짜를 넣는다). 던지면 주 스레드 타이머로 돈다 */
  readonly createWorker?: () => ClockWorkerLike;
  /** 워커를 못 쓸 때의 타이머(기본 systemScheduler) */
  readonly fallback?: BridgeScheduler;
}

/** 워커 시계 — BridgeScheduler 모양 그대로 + 지금 어떻게 도는지(검사·화면 기록용) */
export interface WorkerScheduler extends BridgeScheduler {
  /** 'worker' = 워커가 시간을 잼, 'fallback' = 주 스레드 타이머(워커를 못 씀), 'idle' = 아직 워커를 띄우지 않음(걸린 타이머 없음) */
  readonly mode: 'worker' | 'fallback' | 'idle';
  /** 걸려 있는 타이머 수 */
  readonly pending: number;
}

interface PendingTimer {
  readonly handler: () => void;
  readonly dueAt: number;
  /** 주 스레드 타이머로 걸었으면 그 손잡이 */
  fallbackHandle: unknown;
}

class BackgroundClock implements WorkerScheduler {
  readonly #createWorker: (() => ClockWorkerLike) | null;
  readonly #fallback: BridgeScheduler;
  readonly #timers = new Map<number, PendingTimer>();
  #worker: ClockWorkerLike | null = null;
  #broken = false;
  #nextId = 1;

  constructor(options: WorkerSchedulerOptions) {
    this.#createWorker = options.createWorker ?? null;
    this.#fallback = options.fallback ?? systemScheduler;
    if (this.#createWorker === null) {
      this.#broken = true;
    }
  }

  get mode(): 'worker' | 'fallback' | 'idle' {
    if (this.#broken) {
      return 'fallback';
    }
    return this.#worker === null ? 'idle' : 'worker';
  }

  get pending(): number {
    return this.#timers.size;
  }

  now(): number {
    return this.#fallback.now();
  }

  setTimeout(handler: () => void, ms: number): unknown {
    const id = this.#nextId;
    this.#nextId += 1;
    const wait = Number.isFinite(ms) ? Math.max(0, ms) : 0;
    const timer: PendingTimer = { handler, dueAt: this.now() + wait, fallbackHandle: null };
    this.#timers.set(id, timer);
    const worker = this.#ensureWorker();
    if (worker !== null) {
      worker.postMessage({ set: id, ms: wait });
    } else {
      this.#armFallback(id, timer, wait);
    }
    return id;
  }

  clearTimeout(handle: unknown): void {
    if (typeof handle !== 'number') {
      return;
    }
    const timer = this.#timers.get(handle);
    if (timer === undefined) {
      return;
    }
    this.#timers.delete(handle);
    if (timer.fallbackHandle !== null) {
      this.#fallback.clearTimeout(timer.fallbackHandle);
    } else if (this.#worker !== null) {
      this.#worker.postMessage({ clear: handle });
    }
    this.#closeWhenIdle();
  }

  #ensureWorker(): ClockWorkerLike | null {
    if (this.#broken) {
      return null;
    }
    if (this.#worker !== null) {
      return this.#worker;
    }
    let worker: ClockWorkerLike;
    try {
      worker = (this.#createWorker as () => ClockWorkerLike)();
    } catch {
      // 워커를 막은 브라우저·설정 — 주 스레드 타이머로 돈다(가려진 탭에서는 전처럼 느려질 수 있다)
      this.#broken = true;
      return null;
    }
    worker.addEventListener('message', (event) => {
      if (this.#worker !== worker) {
        return;
      }
      const fired = (event.data as { fired?: unknown } | null)?.fired;
      if (typeof fired === 'number') {
        this.#fire(fired);
      }
    });
    worker.addEventListener('error', (event) => {
      event.preventDefault?.();
      if (this.#worker === worker) {
        this.#giveUpWorker();
      }
    });
    this.#worker = worker;
    return worker;
  }

  #fire(id: number): void {
    const timer = this.#timers.get(id);
    if (timer === undefined) {
      return;
    }
    this.#timers.delete(id);
    try {
      timer.handler();
    } finally {
      this.#closeWhenIdle();
    }
  }

  #armFallback(id: number, timer: PendingTimer, wait: number): void {
    timer.fallbackHandle = this.#fallback.setTimeout(() => {
      timer.fallbackHandle = null;
      this.#fire(id);
    }, wait);
  }

  /** 워커가 오류로 멈췄다(스크립트를 못 받음 등) — 남은 타이머를 주 스레드로 옮기고 다시는 워커를 띄우지 않는다 */
  #giveUpWorker(): void {
    const worker = this.#worker;
    this.#worker = null;
    this.#broken = true;
    try {
      worker?.terminate();
    } catch {
      // 이미 멈춤
    }
    const now = this.now();
    for (const [id, timer] of this.#timers) {
      if (timer.fallbackHandle === null) {
        this.#armFallback(id, timer, Math.max(0, timer.dueAt - now));
      }
    }
  }

  /** 걸린 타이머가 없으면 워커를 닫는다(탭 통로를 모두 닫은 화면에 워커가 남지 않게) */
  #closeWhenIdle(): void {
    if (this.#timers.size > 0 || this.#worker === null) {
      return;
    }
    const worker = this.#worker;
    this.#worker = null;
    try {
      worker.terminate();
    } catch {
      // 이미 멈춤
    }
  }
}

/** 워커 시계를 만든다(테스트·특별한 쓰임). 보통은 문서 하나가 함께 쓰는 backgroundScheduler()를 쓴다 */
export function createWorkerScheduler(options: WorkerSchedulerOptions = {}): WorkerScheduler {
  return new BackgroundClock(options);
}

/** 이 브라우저에서 모듈 워커를 띄울 수 있나(Node 단위 검사에는 Worker가 없다) */
function canUseWorker(): boolean {
  return typeof (globalThis as { Worker?: unknown }).Worker === 'function';
}

function createClockWorker(): ClockWorkerLike {
  return new Worker(new URL('./background-clock.worker.ts', import.meta.url), { type: 'module', name: 'bridge-clock' }) as unknown as ClockWorkerLike;
}

let shared: WorkerScheduler | null = null;

/**
 * 문서 하나가 함께 쓰는 시계 — 워커를 띄울 수 있으면 워커 시계, 아니면 주 스레드 타이머(systemScheduler와 같음).
 * 탭 통로가 scheduler를 받지 않았을 때의 기본값이다(tab.ts).
 */
export function backgroundScheduler(): WorkerScheduler {
  if (shared === null) {
    shared = createWorkerScheduler(canUseWorker() ? { createWorker: createClockWorker } : {});
  }
  return shared;
}
