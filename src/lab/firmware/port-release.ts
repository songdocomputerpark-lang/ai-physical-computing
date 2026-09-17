/**
 * 한 페이지 안에서 보드 포트를 넘겨주는 약속(PLAN §8.3 P3-10 보드 준비 페이지).
 *
 * 왜: 보드 포트는 한 번에 한 곳만 열 수 있다(Web Serial open()이 이미 열린 포트면 InvalidStateError). 보드 준비 페이지에는
 * [보드 연결](연결 확인, src/components/start/board/)과 [펌웨어 굽기 시작](src/lab/firmware/controller.ts)이 함께 있어,
 * 연결 확인이 포트를 연 채로 굽기를 누르면 굽기가 "다른 프로그램이 포트를 쓰고 있어요"로 멈춘다 — 같은 페이지인데도.
 * 그래서 포트를 새로 열 쪽이 열기 직전에 "포트를 놓아 주세요"를 알리고, 포트를 쥔 쪽은 닫은 뒤에 끝난다.
 *
 *   // 포트를 쥐는 쪽(연결 확인): 열려 있는 동안만 듣는다
 *   const stop = onSerialPortReleaseRequest(() => session.release());
 *   // 포트를 새로 여는 쪽(굽기): 포트를 고른 뒤, 열기 전에
 *   await requestSerialPortRelease('firmware');
 *
 * 창(window)의 이벤트 하나로 주고받아, 두 쪽이 서로 import하지 않고 따로 묶인 스크립트여도 된다.
 * 닫기가 오래 걸려도 여는 쪽이 끝없이 기다리지 않게 기다리는 시간에 한도가 있다(넘으면 그대로 열어 보고, 실패하면 원래 오류 풀이가 뜬다).
 */

export const SERIAL_PORT_RELEASE_EVENT = 'apc:serial-port-release';

/** 닫기를 기다리는 최대 시간(밀리초) — ESP32 실습실 연결 끊기(raw REPL 나가기 + 신호 + 닫기)가 보통 1초 안에 끝난다 */
export const DEFAULT_RELEASE_TIMEOUT_MS = 3000;

export interface SerialPortReleaseDetail {
  /** 누가 포트를 쓰려는지(기록용, 예: 'firmware') */
  readonly reason: string;
  /** 포트를 쥔 쪽이 닫기 약속을 넘긴다 */
  waitUntil(promise: Promise<unknown>): void;
}

function defaultTarget(): EventTarget | null {
  return typeof globalThis.addEventListener === 'function' ? (globalThis as unknown as EventTarget) : null;
}

/**
 * 포트를 쥔 곳에 놓아 달라고 알리고, 닫기가 끝날 때까지(최대 timeoutMs) 기다린다.
 * 돌려주는 값: 닫기 약속을 넘긴 곳의 수(아무도 없으면 0 — 곧바로 끝난다).
 */
export async function requestSerialPortRelease(
  reason: string,
  options: { readonly timeoutMs?: number; readonly target?: EventTarget | null } = {},
): Promise<number> {
  const target = options.target === undefined ? defaultTarget() : options.target;
  if (!target || typeof CustomEvent !== 'function') {
    return 0;
  }
  const pending: Promise<unknown>[] = [];
  const detail: SerialPortReleaseDetail = {
    reason,
    waitUntil(promise) {
      pending.push(Promise.resolve(promise).catch(() => undefined));
    },
  };
  target.dispatchEvent(new CustomEvent<SerialPortReleaseDetail>(SERIAL_PORT_RELEASE_EVENT, { detail }));
  if (pending.length === 0) {
    return 0;
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_RELEASE_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.all(pending),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    }),
  ]);
  if (timer !== undefined) {
    clearTimeout(timer);
  }
  return pending.length;
}

/**
 * 포트를 쥔 쪽이 "놓아 주세요"를 듣는다. handler가 돌려준 약속(닫기)을 여는 쪽이 기다린다.
 * 돌려주는 함수를 부르면 더 듣지 않는다(포트를 닫은 뒤 부른다).
 */
export function onSerialPortReleaseRequest(
  handler: (detail: SerialPortReleaseDetail) => Promise<unknown> | void,
  target: EventTarget | null = defaultTarget(),
): () => void {
  if (!target) {
    return () => undefined;
  }
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<SerialPortReleaseDetail>).detail;
    if (!detail || typeof detail.waitUntil !== 'function') {
      return;
    }
    try {
      const result = handler(detail);
      if (result) {
        detail.waitUntil(result);
      }
    } catch {
      // 놓아 주다 난 오류는 여는 쪽을 막지 않는다
    }
  };
  target.addEventListener(SERIAL_PORT_RELEASE_EVENT, listener);
  return () => target.removeEventListener(SERIAL_PORT_RELEASE_EVENT, listener);
}
