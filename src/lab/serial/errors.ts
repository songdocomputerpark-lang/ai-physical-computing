/**
 * 실제 보드 연결(P3-07·P3-08)이 던지는 오류 종류(파일 쓰기 오류 BoardFileError는 board-files.ts). 화면(모듈 real-board)과 실행 대상(board-run-target.ts)이 종류로 나눠 한국어 안내를 고른다.
 * name은 실습실 오류 결과(PythonErrorInfo.type)에도 그대로 쓰는 이름이다 — 오류 사전 항목은 content/help/errors/errors.yaml에(요청으로) 더한다.
 */
import type { AutorunFile } from './board-recovery.ts';

/** 기다린 글이 제때 오지 않음(보드가 대답하지 않거나 다른 글을 보냄) */
export class SerialTimeoutError extends Error {
  override readonly name = 'SerialTimeoutError';
  /** 그때까지 받아 둔 글(0~255 글자, 기록·판별용) */
  readonly received: string;
  constructor(what: string, received: string) {
    super(`${what}을(를) 제때 받지 못했어요.`);
    this.received = received;
  }
}

/** USB 선이 빠지는 등 연결이 끊김(Web Serial NetworkError "The device has been lost.") */
export class BoardDisconnectedError extends Error {
  override readonly name = 'BoardDisconnected';
  constructor(message = '보드 연결이 끊겼어요. USB 선이 빠졌거나 보드 전원이 꺼졌어요.') {
    super(message);
  }
}

/** 이 페이지가 연결을 닫음(연결 끊기·페이지 떠남) */
export class SerialClosedError extends Error {
  override readonly name = 'SerialClosed';
  constructor(message = '보드 연결을 닫았어요.') {
    super(message);
  }
}

/** 보드가 Ctrl-C에도 멈추지 않아 REPL을 쓸 수 없음 */
export class BoardBusyError extends Error {
  override readonly name = 'BoardBusy';
  readonly received: string;
  /** 멈추지 않은 것이 소프트 리셋 뒤의 boot.py였으면 그 파일(P3-08 — [보드 되찾기]·[boot.py 끄기] 안내) */
  readonly autorun: AutorunFile | null;
  constructor(received: string, message = '보드에서 도는 프로그램이 멈추지 않아 코드를 보낼 수 없어요.', autorun: AutorunFile | null = null) {
    super(message);
    this.received = received;
    this.autorun = autorun;
  }
}

/** raw REPL·raw-paste 약속과 다른 글이 옴 */
export class BoardProtocolError extends Error {
  override readonly name = 'BoardProtocolError';
  readonly received: string;
  constructor(detail: string, received = '') {
    super(`보드와 주고받는 약속(raw REPL)이 어긋났어요: ${detail}`);
    this.received = received;
  }
}

/** 연결된 보드가 없음 */
export class BoardNotConnectedError extends Error {
  override readonly name = 'BoardNotConnected';
  constructor(message = '실제 보드가 연결되지 않았어요.') {
    super(message);
  }
}

/** 연결은 됐지만 보드에서 MicroPython을 찾지 못함 */
export class BoardNoMicroPythonError extends Error {
  override readonly name = 'BoardNoMicroPython';
  constructor(message = '보드에서 MicroPython을 찾지 못했어요.') {
    super(message);
  }
}

/** 다른 실행이 아직 끝나지 않음 */
export class BoardInUseError extends Error {
  override readonly name = 'BoardInUse';
  constructor(message = '보드가 아직 다른 일을 하고 있어요.') {
    super(message);
  }
}

/** 도구 명령(파일 쓰기·라이브러리 올리기) 도중 [정지]·[연결 끊기]로 멈춤(P3-08) */
export class ReplStoppedError extends Error {
  override readonly name = 'ReplStopped';
  constructor(message = '보드 작업을 멈췄어요.') {
    super(message);
  }
}

/** DOMException 같은 브라우저 오류의 이름(없으면 빈 글자) */
export function errorName(error: unknown): string {
  return error && typeof error === 'object' && typeof (error as { name?: unknown }).name === 'string' ? (error as { name: string }).name : '';
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
