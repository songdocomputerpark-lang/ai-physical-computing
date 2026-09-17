// 실제 보드 연결(P3-07·P3-08) 단위 테스트가 함께 쓰는 기다림 — 모의 보드는 몇 밀리초 안에 답하므로 실물 기준 기본값(DEFAULT_REPL_TIMING)을 줄인다.
// 다만 CI(느린 러너·여러 테스트 파일 동시 실행)에서 흔들리지 않게, "시간이 다 되는 경우"를 시험하지 않는 값은 모의 보드 응답보다 넉넉히(수백 ms 이상) 둔다.
import type { ReplTiming } from '../../../../src/lab/serial/raw-repl.ts';

export const FAST_TIMING: Partial<ReplTiming> = Object.freeze({
  quietMs: 40,
  settleMaxMs: 400,
  bannerTimeoutMs: 1000,
  enterRawTimeoutMs: 1000,
  softRebootTimeoutMs: 2000,
  bootTimeoutMs: 1200,
  bootLoopGraceMs: 200,
  bootInterruptRetryMs: 200,
  bootInterruptAttempts: 4,
  pasteReplyTimeoutMs: 2000,
  windowTimeoutMs: 3000,
  ackTimeoutMs: 3000,
  promptTimeoutMs: 2000,
  rawChunkDelayMs: 1,
  stopRetryMs: 150,
  stopAttempts: 4,
  commandTimeoutMs: 3000,
  recoverIntervalMs: 20,
  recoverInterruptMs: 600,
  recoverAfterResetMs: 3000,
  recoverPressButtonMs: 800,
});

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
