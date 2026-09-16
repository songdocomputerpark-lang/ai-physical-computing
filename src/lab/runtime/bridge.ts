/**
 * 파이썬 ↔ JS 다리(PLAN §4.4 "입력 전달"·"입력 확인 지점"·"정지 1단계", CODE_MAPPING §3.0 규칙 1~4).
 *
 * 워커(worker.ts)가 createBridge()로 만들어 bridge.api를 Pyodide에 `_apc_bridge` 모듈로 등록하고,
 * 파이썬 도우미(apc_runtime.py)가 그 함수들을 부른다. 화면에서 온 값(set·push·reply)은 워커가 bridge의 메서드로 넣는다.
 *
 * 동작 원리
 * - 파이썬이 기다릴 때는 apc_runtime.block_on(promise)이 api.raceStop(promise)을 run_sync로 기다린다(JSPI).
 *   raceStop은 그 약속과 "정지 신호" 약속을 경주시킨다. [정지]가 오면(requestStop) 기다리던 모든 곳이 즉시 STOP_SIGNAL을 받고,
 *   파이썬 쪽에서 KeyboardInterrupt가 난다. 그래서 sleep·input·카메라 대기 어디서든 1초 안에 멈춘다.
 * - 값은 기다리지 않고 읽는다: set으로 온 최신 값은 get(name), push로 온 값은 poll(channel)이 쌓인 순서대로 돌려준다.
 * - 화면에서만 되는 일은 request(kind, payload)로 부탁한다. 화면이 reply로 답하면 약속이 끝난다.
 * - 답이 필요 없는 알림(cv2.imshow의 영상)은 emit(kind, payload, transfer)로 보낸다. 기다리지 않으므로 제한 모드에서도 된다(P2-03).
 *
 * 워커 전역(self·postMessage·setTimeout)을 직접 쓰지 않고 host로 받는다. 그래서 Node.js 단위 테스트가 같은 코드를
 * 실제 Pyodide와 함께 돌릴 수 있다(tests/unit/lab/). Node.js가 타입만 지우고 실행하므로 타입 표기만 지우면 도는 문법만 쓴다.
 */
import type { FromWorkerMessage, NoticeLevel } from './protocol.ts';

/** 정지 신호. raceStop이 이 객체를 돌려주면 파이썬 도우미가 KeyboardInterrupt를 낸다(같은 객체인지로 판단). */
export const STOP_SIGNAL: Readonly<{ apcStop: true }> = Object.freeze({ apcStop: true as const });

/** 다리가 바깥(워커)에 기대는 것 */
export interface BridgeHost {
  /** 화면으로 메시지 보내기. transfer에 넣은 ArrayBuffer는 복사하지 않고 옮긴다(옮긴 뒤 워커 쪽에서는 비어 있다). */
  post(message: FromWorkerMessage, transfer?: readonly ArrayBuffer[]): void;
  /** 지금 시각(밀리초, performance.now()처럼 단조 증가) */
  now(): number;
  /** 파이썬이 기다릴 수 있는지(JSPI, pyodide.ffi.can_run_sync()) */
  canRunSync(): boolean;
  /** ms 뒤에 fn을 부른다(기본 setTimeout) */
  schedule?(fn: () => void, ms: number): void;
}

/** 파이썬(apc_runtime.py)이 부르는 함수. 이름은 JS 규칙(camelCase)이고 파이썬 쪽이 감싸서 쓴다. */
export interface BridgeApi {
  /** 기다리기(block_on)를 쓸 수 있는지: JSPI가 있고 제한 모드가 아님 */
  canWait(): boolean;
  /** [정지]가 눌렸는지 */
  stopRequested(): boolean;
  /** promise와 정지 신호를 경주시킨다. 정지가 오면 STOP_SIGNAL로 끝난다. */
  raceStop(promise: Promise<unknown> | unknown): Promise<unknown>;
  isStopSignal(value: unknown): boolean;
  /** ms 뒤에 끝나는 약속(양보 지점). 0이어도 이벤트 루프에 한 번 양보한다. */
  sleep(ms: number): Promise<void>;
  /** 마지막으로 양보한 뒤 지난 시간(밀리초). sleep 없는 반복문이 16ms마다 양보하는 데 쓴다. */
  msSinceYield(): number;
  /** 화면에 부탁하고 답을 기다리는 약속을 돌려준다(payload는 구조화 복제가 되는 값). */
  request(kind: string, payload: unknown): Promise<unknown>;
  /** set으로 온 최신 값. 없으면 undefined(파이썬에서는 None). */
  get(name: string): unknown;
  /** push로 쌓인 값을 순서대로 꺼내고 비운다. */
  poll(channel: string): unknown[];
  /** 콘솔에 사이트 안내(파이썬 출력이 아닌 것)를 보낸다. */
  notice(text: string, level?: NoticeLevel): void;
  /**
   * 답을 기다리지 않고 화면에 알린다(cv2.imshow의 영상 등). 제한 모드에서도 된다.
   * transfer에 넣은 ArrayBuffer(예: payload.data.buffer)는 복사 없이 옮겨진다.
   */
  emit(kind: string, payload: unknown, transfer?: readonly ArrayBuffer[] | null): void;
}

export interface Bridge {
  readonly api: BridgeApi;
  /** 실행을 시작할 때: 정지 표시·대기 목록과 실행 전에 쌓인 값(push 채널)을 비우고 양보 시각을 지금으로 맞춘다. 최신 값(set)은 남긴다. */
  beginRun(): void;
  /** 실행이 끝날 때: 남은 요청을 취소하고 정지 표시를 지운다. 이번 실행에 [정지]가 눌렸었는지 돌려준다. */
  endRun(): { stopped: boolean };
  /** [정지]: 정지 표시를 켜고 기다리던 곳을 모두 깨운다. 실행 중이 아니면 false. */
  requestStop(): boolean;
  /** 실행 중인지(beginRun과 endRun 사이) */
  isRunning(): boolean;
  /** 제한 모드로 바꾼다(JSPI가 없거나 시험용 강제). */
  setLimited(limited: boolean): void;
  isLimited(): boolean;
  /** 화면의 답을 요청에 전달한다. 모르는 요청 번호면 false. */
  resolveRequest(requestId: number, value: unknown): boolean;
  rejectRequest(requestId: number, message: string): boolean;
  setValue(name: string, value: unknown): void;
  pushEvent(channel: string, value: unknown): void;
  /** 답을 기다리는 요청 수(테스트용) */
  pendingRequestCount(): number;
}

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
}

const RUN_ENDED_MESSAGE = '실행이 끝나서 화면에 부탁한 일을 취소했어요.';

export function createBridge(host: BridgeHost): Bridge {
  const schedule = host.schedule ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  let running = false;
  let stopRequested = false;
  let limited = false;
  let lastYieldAt = host.now();
  let nextRequestId = 1;
  const stopWaiters = new Set<() => void>();
  const pendingRequests = new Map<number, PendingRequest>();
  const values = new Map<string, unknown>();
  const queues = new Map<string, unknown[]>();

  function markYield(): void {
    lastYieldAt = host.now();
  }

  function cancelPendingRequests(message: string): void {
    for (const pending of pendingRequests.values()) {
      pending.reject(new Error(message));
    }
    pendingRequests.clear();
  }

  const api: BridgeApi = {
    canWait: () => host.canRunSync() && !limited,
    stopRequested: () => stopRequested,
    raceStop(promise) {
      if (stopRequested) {
        return Promise.resolve(STOP_SIGNAL);
      }
      return new Promise<unknown>((resolve, reject) => {
        const waiter = () => resolve(STOP_SIGNAL);
        stopWaiters.add(waiter);
        Promise.resolve(promise).then(
          (value) => {
            stopWaiters.delete(waiter);
            markYield();
            resolve(value);
          },
          (error: unknown) => {
            stopWaiters.delete(waiter);
            markYield();
            reject(error instanceof Error ? error : new Error(String(error)));
          },
        );
      });
    },
    isStopSignal: (value) => value === STOP_SIGNAL,
    sleep: (ms) =>
      new Promise<void>((resolve) => {
        schedule(resolve, Number.isFinite(ms) && ms > 0 ? ms : 0);
      }),
    msSinceYield: () => host.now() - lastYieldAt,
    request(kind, payload) {
      return new Promise<unknown>((resolve, reject) => {
        const requestId = nextRequestId;
        nextRequestId += 1;
        pendingRequests.set(requestId, { resolve, reject });
        host.post({ type: 'request', requestId, kind: String(kind), payload });
      });
    },
    get: (name) => values.get(String(name)),
    poll(channel) {
      const key = String(channel);
      const queued = queues.get(key) ?? [];
      queues.delete(key);
      return queued;
    },
    notice(text, level = 'info') {
      host.post({ type: 'notice', level, text: String(text) });
    },
    emit(kind, payload, transfer) {
      const buffers = Array.isArray(transfer) ? transfer.filter((item) => item instanceof ArrayBuffer) : [];
      host.post({ type: 'event', kind: String(kind), payload }, buffers);
    },
  };

  return {
    api,
    beginRun() {
      running = true;
      stopRequested = false;
      stopWaiters.clear();
      cancelPendingRequests(RUN_ENDED_MESSAGE);
      // 실행 전에 쌓인 값(push)은 모두 버린다: 이전 실행의 키 입력·조절 값·모듈 채널이 새 실행에 새지 않게. 최신 값(set — camera.info 같은
      // 실행 직전 준비 값)은 남긴다. 흉내 모듈의 초기화 함수(register_reset_hook)의 drain은 이중 안전장치가 된다 — 학생 코드가 처음 import하는
      // 모듈은 첫 실행의 reset_for_run 뒤에야 초기화 함수를 등록하므로, 여기서 비우지 않으면 실행 전 값이 첫 실행에 들어간다(2026-09-16 hello 모듈 브라우저 테스트에서 발견).
      queues.clear();
      markYield();
    },
    endRun() {
      const stopped = stopRequested;
      running = false;
      stopRequested = false;
      stopWaiters.clear();
      cancelPendingRequests(RUN_ENDED_MESSAGE);
      return { stopped };
    },
    requestStop() {
      if (!running) {
        return false;
      }
      stopRequested = true;
      const waiters = [...stopWaiters];
      stopWaiters.clear();
      for (const waiter of waiters) {
        waiter();
      }
      return true;
    },
    isRunning: () => running,
    setLimited(value) {
      limited = Boolean(value);
    },
    isLimited: () => limited,
    resolveRequest(requestId, value) {
      const pending = pendingRequests.get(requestId);
      if (!pending) {
        return false;
      }
      pendingRequests.delete(requestId);
      pending.resolve(value);
      return true;
    },
    rejectRequest(requestId, message) {
      const pending = pendingRequests.get(requestId);
      if (!pending) {
        return false;
      }
      pendingRequests.delete(requestId);
      pending.reject(new Error(String(message)));
      return true;
    },
    setValue(name, value) {
      values.set(String(name), value);
    },
    pushEvent(channel, value) {
      const key = String(channel);
      const queued = queues.get(key);
      if (queued) {
        queued.push(value);
      } else {
        queues.set(key, [value]);
      }
    },
    pendingRequestCount: () => pendingRequests.size,
  };
}
