/**
 * 탭 통로 시계 워커(미해결 220 — 판 1.1.5 뒤). 화면 쪽 `background-clock.ts`가 띄운다 — 다른 코드는 이 파일을 직접 쓰지 않는다.
 *
 * 하는 일은 하나: 받은 `{ set: id, ms }`마다 ms 뒤에 `{ fired: id }`를 돌려보내고, `{ clear: id }`면 그 타이머를 지운다.
 * 전용 워커의 타이머는 가려진 탭에서도 강한 조절(1분에 한 번)을 받지 않는다(근거는 `background-clock.ts` 머리말).
 * 탭이 살아 있는지(주 스레드가 도는지)는 화면 쪽이 이 알림을 받아 처리할 때 정해진다 — 워커는 시간만 잰다.
 *
 * 라이선스: 사이트 소프트웨어(MIT, PD-26).
 */

/** 이 워커에서 쓰는 전역(브라우저 전용 워커 범위 가운데 쓰는 것만) */
interface ClockWorkerScope {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
}

const scope = self as unknown as ClockWorkerScope;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function stop(id: number): void {
  const handle = timers.get(id);
  if (handle !== undefined) {
    clearTimeout(handle);
    timers.delete(id);
  }
}

scope.addEventListener('message', (event) => {
  const data = event.data as { set?: unknown; ms?: unknown; clear?: unknown } | null;
  if (data === null || typeof data !== 'object') {
    return;
  }
  if (typeof data.set === 'number') {
    const id = data.set;
    const ms = typeof data.ms === 'number' && Number.isFinite(data.ms) ? Math.max(0, data.ms) : 0;
    stop(id);
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id);
        scope.postMessage({ fired: id });
      }, ms),
    );
    return;
  }
  if (typeof data.clear === 'number') {
    stop(data.clear);
  }
});
