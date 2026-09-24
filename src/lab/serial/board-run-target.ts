/**
 * 실습실 [실행]·[정지]를 실제 보드로 보내는 실행 대상(P3-07 — lab.setRunTarget, 병렬 제작 준비 PD-39·PROGRESS 미해결 59; P3-08 실제 보드 ②).
 * [실제 보드] 탭을 고르면 화면 모듈(src/lab/modules/real-board/)이 이것을 끼운다. 같은 코드 편집칸·콘솔·결과 줄·오류 풀이 카드가 가상 보드와 똑같이 흐른다.
 *
 * 규칙(실행 대상 약속 — src/lab/controls/lab-shell.ts LabRunTarget)
 * - 보드 출력은 context.write(글, 'stdout')로 흘려보낸다. USB 조각마다 콘솔 줄(span)이 생기지 않게 짧게 모아 쓴다(flushMs).
 * - 트레이스백은 쓰지 않고 결과의 error.traceback으로 돌려준다(셸이 콘솔에 한 번 적고 오류 풀이 카드가 "<stdin>" 줄을 학생 코드로 읽는다).
 * - [정지]로 끝나면 outcome 'stopped'(KeyboardInterrupt 트레이스백은 보이지 않음 — 가상 보드와 같다). 코드가 KeyboardInterrupt를 삼키고 끝나도 'stopped'.
 * - 연결이 안 된 채 [실행]을 누르면(클릭 안이라 포트 선택 창을 열 수 있다) 선택 창 → 연결·판별 → 곧바로 실행한다.
 * - 사이트가 만든 오류 종류(PythonErrorInfo.type): BoardUnsupported·BoardNotConnected·BoardNoMicroPython·BoardBusy·BoardInUse·
 *   BoardDisconnected·BoardReset·BoardProtocolError·BoardFileError — 오류 사전 항목은 content/help/errors/errors.yaml에 요청으로 더한다(구역 E).
 * P3-08이 더한 것
 * - input(): 코드가 input()을 부르면 코드가 도는 동안 셸 입력줄을 열어 두고(Thonny 셸처럼 언제든 적을 수 있게), 적은 줄을 보드 stdin으로 보낸다
 *   (영어·숫자·기호만 + '\r' — board-input.ts). 보드가 되울린 줄은 출력에서 걸러 콘솔에 두 번 보이지 않게 한다.
 * - 라이브러리: 코드가 부르는 사이트 라이브러리(i2c_lcd.py 등)가 보드에 없으면 실행 전에 올린다(있으면 건드리지 않고, 사이트판과 다르면 안내만).
 * - 호환 안내: CPython에서만 되는 모양(ljust·[::-1] …)이 있으면 실행 전에 줄 번호와 함께 안내한다(compat.ts).
 * - boot.py가 끝나지 않아 Ctrl-C로 멈춘 뒤 실행했으면 한 번 안내한다.
 */
import { withParticle } from '../../lib/korean.ts';
import type { LabRunContext, LabRunTarget } from '../controls/lab-shell.ts';
import type { RunResult } from '../runtime/client.ts';
import type { PythonErrorInfo } from '../runtime/protocol.ts';
import { VIRTUAL_ONLY_MODULES, librariesNeededBy, virtualOnlyModulesUsedBy, type BoardLibrary } from '../esp32/board-libraries.ts';
import { MQTT_NO_PREFIX_ERROR, REAL_BOARD_MQTT_TEXT, mqttPrefixProblem, usesMqtt } from '../mqtt/index.ts';
import type { BoardConnection } from './board-connection.ts';
import { BoardFileError, provisionLibraries, type LibraryProvision } from './board-files.ts';
import { BOARD_INPUT_LABEL, InputEchoFilter, prepareBoardInputLine } from './board-input.ts';
import { findRealBoardCompatIssues } from './compat.ts';
import {
  BoardBusyError,
  BoardDisconnectedError,
  BoardInUseError,
  BoardNoMicroPythonError,
  BoardNotConnectedError,
  BoardProtocolError,
  SerialClosedError,
  SerialTimeoutError,
  errorMessage,
} from './errors.ts';
import type { ExecResult } from './raw-repl.ts';

/** 실습실 상태 글("실제 보드에서 실행 중이에요.")·'run' 이벤트 target 이름 */
export const REAL_BOARD_TARGET_LABEL = '실제 보드';

/** 되울림인지 모르는 출력을 붙잡아 두는 최대 시간(밀리초) — 넘으면 그대로 콘솔에 */
const ECHO_HOLD_MS = 400;

/** 보드가 멈추지 않을 때·연결이 끊겼을 때 콘솔에 남기는 안내 */
export const RUN_NOTICES = Object.freeze({
  connectFirst: '실제 보드가 아직 연결되지 않아 포트 선택 창을 열어요. 보드를 고르면 연결한 뒤 바로 실행해요.',
  notConnected: '실제 보드가 연결되지 않았어요. 보드를 USB로 꽂고 [보드 연결]을 누른 뒤 다시 [실행]해요. 보드가 없으면 [가상 보드] 탭에서 실행해요.',
  unsupported: '이 브라우저에서는 실제 보드를 연결할 수 없어요(컴퓨터용 Chrome·Edge에서 돼요). [가상 보드] 탭에서 같은 코드를 실행할 수 있어요.',
  noMicroPython: '보드에서 MicroPython을 찾지 못했어요. 위 안내대로 펌웨어를 구운 뒤 [다시 확인]을 눌러요.',
  busy: '보드에서 도는 프로그램이 멈추지 않아 코드를 보내지 못했어요. 입력·출력 칸의 [보드 되찾기]를 누르거나 보드의 EN(RST) 버튼을 한 번 눌러요.',
  busyBootPy:
    '보드의 boot.py가 끝나지 않고 멈춤 신호(Ctrl-C)도 받지 않아 코드를 보내지 못했어요. 입력·출력 칸의 [보드 되찾기]를 누른 뒤 [boot.py 끄기]로 boot.py가 저절로 돌지 않게 해요.',
  inUse: '보드를 연결하거나 확인하는 중이에요. 잠깐 뒤에 다시 [실행]을 눌러요.',
  writing: '보드에 파일을 저장하는 중이에요. 저장이 끝난 뒤 다시 [실행]을 눌러요.',
  recovering: '보드를 되찾는 중이에요. 끝난 뒤 다시 [실행]을 눌러요.',
  disconnected: '실행 중에 보드 연결이 끊겼어요. USB 선을 다시 꽂고 [다시 연결]을 눌러요.',
  closed: '연결을 끊어서 실행을 멈췄어요.',
  stopUnconfirmed: '보드가 [정지]에 대답하지 않았어요. 코드가 KeyboardInterrupt를 삼키고 계속 돌고 있을 수 있어요 — 입력·출력 칸의 [보드 되찾기]를 눌러요.',
  softReboot: '코드가 sys.exit()·machine.soft_reset()으로 끝나 보드가 소프트 리셋됐어요.',
  input: '이 코드는 input()으로 글자를 받아요. 코드가 도는 동안 콘솔 아래 입력줄에 적고 Enter를 누르면 보드로 보내요(보드의 input()은 영어·숫자·기호만 받아요).',
  inputAsciiOnly: '보드의 input()은 영어·숫자·기호만 받아요. 한글 같은 글자는 빼고 보냈어요.',
  inputTruncated: '한 줄이 너무 길어 앞의 250글자만 보냈어요.',
  inputNotSent: '지금은 보드로 글자를 보낼 수 없어요(코드를 보내는 중이거나 멈추는 중이에요). 코드가 돌기 시작한 뒤 다시 적어요.',
  bootLoop:
    '보드의 boot.py가 끝나지 않는 반복이라 멈춤 신호(Ctrl-C)로 멈춘 뒤 코드를 보냈어요. 보드는 켜질 때마다 boot.py를 다시 돌려요 — 이제 쓰지 않는 코드라면 입력·출력 칸의 [boot.py 끄기]로 끌 수 있어요.',
  reset: '실행 중에 보드가 다시 켜졌어요. 코드에 machine.reset()이 없다면 전원이 모자라거나(모터·서보를 여러 개 쓸 때) 보드가 멈춰 다시 켜진 거예요.',
  protocol: '보드와 주고받는 약속이 어긋났어요. [다시 확인]을 누르거나, 안 되면 [연결 끊기] 뒤 다시 연결해요.',
  libraryFailed: '코드가 쓰는 라이브러리 파일을 보드에 올리지 못해 실행하지 않았어요.',
});

/** 라이브러리 파일을 올리기 직전 안내 */
export function libraryUploadNotice(path: string, size: number): string {
  return `코드가 쓰는 라이브러리 파일이 보드에 없어서 먼저 보드에 올려요: ${path}(${size.toLocaleString('ko-KR')}바이트, 한 번만 하면 돼요).`;
}

/** 라이브러리 갖추기 결과 → 콘솔 안내(없으면 null) */
export function libraryNotice(results: readonly LibraryProvision[]): string | null {
  const uploaded = results.filter((item) => item.status === 'uploaded').map((item) => item.path);
  const different = results.filter((item) => item.status === 'different').map((item) => item.path);
  const parts: string[] = [];
  if (uploaded.length > 0) {
    parts.push(`코드가 쓰는 라이브러리 파일이 보드에 없어서 먼저 보드에 올렸어요: ${uploaded.join(', ')} (다음 실행부터는 바로 써요).`);
  }
  if (different.length > 0) {
    parts.push(`보드에 있는 라이브러리 파일이 사이트판과 달라요: ${different.join(', ')}. 보드의 파일을 그대로 써요 — 사이트판으로 바꾸려면 입력·출력 칸의 [보드에 저장]을 눌러요.`);
  }
  return parts.length > 0 ? parts.join(' ') : null;
}

export interface RealBoardRunTargetOptions {
  /** 연결 전 [실행]이 포트 선택 창을 열지(기본 true) */
  readonly connectOnRun?: boolean;
  /** 출력을 모아 쓰는 간격(밀리초, 기본 30) */
  readonly flushMs?: number;
  /** 시각(밀리초, 테스트용) */
  readonly now?: () => number;
  /** 사이트 보드 라이브러리 전체(board-library-files.ts BOARD_LIBRARIES — 코드가 부르는 것이 보드에 없으면 먼저 올린다). 기본 없음 */
  readonly libraries?: readonly BoardLibrary[];
  /** 되울림인지 모르는 출력을 붙잡아 두는 최대 시간(기본 400ms) */
  readonly echoHoldMs?: number;
}

/** 보드 출력 조각을 짧게 모아 콘솔에 쓴다 */
export class OutputBuffer {
  #pending = '';
  #timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly write: (text: string) => void,
    private readonly flushMs = 30,
  ) {}

  push(text: string): void {
    if (text === '') {
      return;
    }
    this.#pending += text;
    if (this.#pending.length >= 4096) {
      this.flush();
      return;
    }
    if (this.#timer === null) {
      this.#timer = setTimeout(() => this.flush(), this.flushMs);
    }
  }

  flush(): void {
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    if (this.#pending !== '') {
      const text = this.#pending;
      this.#pending = '';
      this.write(text);
    }
  }
}

/** 코드가 input()을 부르는 모양인지(주석 줄은 빼고) */
export function usesInput(code: string): boolean {
  return code.split('\n').some((line) => {
    const body = line.replace(/#.*$/u, '');
    return /(?<![\w.])input\s*\(/u.test(body);
  });
}

function siteError(type: string, message: string): PythonErrorInfo {
  return { type, message, traceback: '' };
}

/** 실행 결과 → 실습실 결과(RunResult) */
export function execToRunResult(result: ExecResult, runId: number): RunResult {
  const base = { runId, durationMs: result.durationMs };
  if (result.stopRequested) {
    if (result.outcome === 'error' && result.error && result.error.type !== 'KeyboardInterrupt') {
      return { ...base, outcome: 'error', error: result.error };
    }
    return { ...base, outcome: 'stopped' };
  }
  switch (result.outcome) {
    case 'ok':
      return result.softReboot ? { ...base, outcome: 'ok', exitCode: null } : { ...base, outcome: 'ok' };
    case 'error':
      return { ...base, outcome: 'error', error: result.error ?? siteError('BoardProtocolError', '보드가 알 수 없는 오류를 보냈어요.') };
    case 'interrupted':
      return { ...base, outcome: 'error', error: result.error ?? siteError('KeyboardInterrupt', 'KeyboardInterrupt') };
    case 'reset':
      if (result.resetKind === 'soft') {
        return { ...base, outcome: 'ok', exitCode: null };
      }
      return { ...base, outcome: 'error', error: siteError('BoardReset', '실행 중에 보드가 다시 켜졌어요(machine.reset() 또는 전원 부족).') };
  }
}

/** 연결·실행이 던진 오류 → 실습실 결과와 콘솔 안내 */
export function errorToRunResult(error: unknown, runId: number, durationMs: number): { result: RunResult; notice: string | null } {
  const base = { runId, durationMs };
  if (error instanceof SerialClosedError) {
    return { result: { ...base, outcome: 'stopped' }, notice: RUN_NOTICES.closed };
  }
  if (error instanceof BoardDisconnectedError) {
    return { result: { ...base, outcome: 'error', error: siteError('BoardDisconnected', '실행 중에 보드 연결이 끊겼어요.') }, notice: RUN_NOTICES.disconnected };
  }
  if (error instanceof BoardBusyError) {
    return {
      result: { ...base, outcome: 'error', error: siteError('BoardBusy', '보드에서 도는 프로그램이 멈추지 않아 코드를 보내지 못했어요.') },
      notice: error.autorun === 'boot.py' ? RUN_NOTICES.busyBootPy : RUN_NOTICES.busy,
    };
  }
  if (error instanceof BoardNoMicroPythonError) {
    return { result: { ...base, outcome: 'error', error: siteError('BoardNoMicroPython', '보드에서 MicroPython을 찾지 못했어요.') }, notice: RUN_NOTICES.noMicroPython };
  }
  if (error instanceof BoardNotConnectedError) {
    return { result: { ...base, outcome: 'error', error: siteError('BoardNotConnected', '실제 보드가 연결되지 않았어요.') }, notice: RUN_NOTICES.notConnected };
  }
  if (error instanceof BoardInUseError) {
    return { result: { ...base, outcome: 'error', error: siteError('BoardInUse', '보드가 아직 연결·확인 중이에요.') }, notice: RUN_NOTICES.inUse };
  }
  if (error instanceof BoardFileError) {
    return { result: { ...base, outcome: 'error', error: siteError('BoardFileError', error.message) }, notice: RUN_NOTICES.libraryFailed };
  }
  if (error instanceof BoardProtocolError || error instanceof SerialTimeoutError) {
    return { result: { ...base, outcome: 'error', error: siteError('BoardProtocolError', `보드와 주고받는 약속이 어긋났어요: ${errorMessage(error)}`) }, notice: RUN_NOTICES.protocol };
  }
  return { result: { ...base, outcome: 'error', error: siteError('RunTargetError', `실제 보드에서 실행하지 못했어요: ${errorMessage(error)}`) }, notice: null };
}

/** 사이트가 실물용 파일을 주지 못하는 모듈 안내(가상 보드에만 있는 드라이버 — PROGRESS 미해결 64) */
export function virtualOnlyModuleNotice(name: string): string {
  const file = VIRTUAL_ONLY_MODULES[name] ?? `${name}.py`;
  return `이 코드가 쓰는 ${withParticle(name, '은/는')} 가상 보드에만 있어요. 실제 보드에서 돌리려면 ${file} 파일을 Thonny 같은 도구로 보드에 먼저 올려야 해요(사이트가 아직 이 파일을 주지 않아요). [가상 보드] 탭에서는 그대로 돌아요.`;
}

export function createRealBoardRunTarget(connection: BoardConnection, options: RealBoardRunTargetOptions = {}): LabRunTarget {
  const now = options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const connectOnRun = options.connectOnRun !== false;
  const libraries = options.libraries ?? [];
  const echoHoldMs = options.echoHoldMs ?? ECHO_HOLD_MS;
  let bootLoopNoticed = false;
  return {
    label: REAL_BOARD_TARGET_LABEL,
    async run(code: string, context: LabRunContext): Promise<RunResult> {
      const startedAt = now();
      const runId = context.runCount;
      const output = new OutputBuffer((text) => context.write(text, 'stdout'), options.flushMs ?? 30);
      const notice = (text: string) => {
        output.flush();
        context.write(`[안내] ${text}\n`, 'notice');
      };
      const fail = (type: string, message: string, text: string): RunResult => {
        notice(text);
        return { runId, outcome: 'error', error: siteError(type, message), durationMs: now() - startedAt };
      };
      if (!connection.supported) {
        return fail('BoardUnsupported', '이 브라우저에서는 실제 보드를 연결할 수 없어요.', RUN_NOTICES.unsupported);
      }
      /*
       * MQTT 코드에 통신 접두어가 없으면 보내지 않는다(PLAN §7.4 PD-29 — 2026-09-25 Phase 4 검토 반영). 가상 보드는 통로가 접두어를
       * 붙여 주지만 실제 보드는 코드 글자 그대로 공개 중계 서버에 붙어, 같은 코드를 올린 모든 보드와 한 토픽을 나눠 쓰게 된다.
       * 포트 선택 창을 열기 전에 본다(코드만 보면 알 수 있다).
       */
      const mqttProblem = mqttPrefixProblem(code);
      if (mqttProblem !== null) {
        return fail(MQTT_NO_PREFIX_ERROR, REAL_BOARD_MQTT_TEXT.noPrefixShort(), mqttProblem);
      }
      if (!connection.isOpen && connectOnRun && (connection.state === 'idle' || connection.state === 'lost' || connection.state === 'error')) {
        // 클릭 처리기 안에서 곧바로 선택 창을 연다(requestPort는 사용자 조작 안에서만 된다 — connect()는 await 전에 부른다)
        const connecting = connection.connect();
        notice(RUN_NOTICES.connectFirst);
        // 아직 아무것도 실행되지 않았다 — 상태 줄에 "실행 중"이라고 적으면 선택 창을 못 본 학생이 멈춘 줄 안다(2026-09-18 검토 반영)
        context.setStatus('포트 선택 창에서 보드를 고르는 중이에요.');
        try {
          await connecting;
        } finally {
          context.setStatus(null);
        }
      }
      if (!connection.isOpen) {
        const state = connection.state;
        if (state === 'choosing' || state === 'opening' || state === 'checking') {
          return fail('BoardInUse', '보드가 아직 연결·확인 중이에요.', RUN_NOTICES.inUse);
        }
        return fail('BoardNotConnected', '실제 보드가 연결되지 않았어요.', RUN_NOTICES.notConnected);
      }
      if (connection.state === 'writing') {
        return fail('BoardInUse', '보드에 파일을 저장하는 중이에요.', RUN_NOTICES.writing);
      }
      if (connection.state === 'recovering') {
        return fail('BoardInUse', '보드를 되찾는 중이에요.', RUN_NOTICES.recovering);
      }
      /*
       * 사이트가 실물용 파일을 주지 못하는 모듈(지금은 OLED 드라이버 ssd1306·sh1106 — PROGRESS 미해결 64).
       * 가상 보드에서는 돌고 실제 보드에서는 ImportError로 끝나므로, 그 까닭을 실행 전에 알린다(2026-09-18 검토 반영).
       */
      for (const name of virtualOnlyModulesUsedBy(code, libraries)) {
        notice(virtualOnlyModuleNotice(name));
      }
      for (const issue of findRealBoardCompatIssues(code)) {
        notice(`실물 보드에서는 안 될 수 있어요 — ${issue.line}번째 줄: ${issue.text}`);
      }
      if (usesMqtt(code)) {
        notice(REAL_BOARD_MQTT_TEXT.publicBroker());
      }
      const inputWanted = usesInput(code);
      if (inputWanted) {
        notice(RUN_NOTICES.input);
      }

      // 보드 출력 → 되울림 걸러 내기 → 모아 쓰기
      const echo = new InputEchoFilter();
      let echoTimer: ReturnType<typeof setTimeout> | null = null;
      const releaseEcho = () => {
        if (echoTimer !== null) {
          clearTimeout(echoTimer);
          echoTimer = null;
        }
        output.push(echo.release());
      };
      const onStdout = (text: string) => {
        output.push(echo.push(text));
        if (echo.holding && echoTimer === null) {
          echoTimer = setTimeout(() => {
            echoTimer = null;
            output.push(echo.release());
          }, echoHoldMs);
        } else if (!echo.holding && echoTimer !== null) {
          clearTimeout(echoTimer);
          echoTimer = null;
        }
      };

      // input(): 코드가 도는 동안 입력줄을 열어 두고, 적은 줄을 보드로 보낸다
      let finished = false;
      let inputLoopStarted = false;
      const inputLoop = async () => {
        while (!finished) {
          const value = await context.prompt(BOARD_INPUT_LABEL);
          if (value === null || finished) {
            return;
          }
          const line = prepareBoardInputLine(value);
          if (line.droppedNonAscii) {
            notice(RUN_NOTICES.inputAsciiOnly);
          }
          if (line.truncated) {
            notice(RUN_NOTICES.inputTruncated);
          }
          if (connection.sendInput(line.bytes)) {
            echo.expect(line.text);
          } else if (!finished) {
            notice(RUN_NOTICES.inputNotSent);
          }
        }
      };

      const needed = librariesNeededBy(code, libraries);
      try {
        const result = await connection.run(code, {
          onStdout,
          onStage: (stage) => {
            if (stage === 'running' && inputWanted && !inputLoopStarted) {
              inputLoopStarted = true;
              void inputLoop();
            }
          },
          ...(needed.length > 0
            ? {
                prepare: async (tools) => {
                  const provisioned = await provisionLibraries(tools, needed, {
                    onUpload: (path, size) => notice(libraryUploadNotice(path, size)),
                  });
                  // 올린 파일은 올리기 전에 알렸다 — 남은 안내(사이트판과 다른 파일)만
                  const text = libraryNotice(provisioned.filter((item) => item.status !== 'uploaded'));
                  if (text) {
                    notice(text);
                  }
                },
              }
            : {}),
        });
        finished = true;
        releaseEcho();
        output.flush();
        if (result.bootInterrupted && !bootLoopNoticed) {
          bootLoopNoticed = true;
          notice(RUN_NOTICES.bootLoop);
        }
        if (result.stopUnconfirmed) {
          notice(RUN_NOTICES.stopUnconfirmed);
        } else if (result.softReboot || (result.outcome === 'reset' && result.resetKind === 'soft')) {
          notice(RUN_NOTICES.softReboot);
        } else if (result.outcome === 'reset') {
          notice(RUN_NOTICES.reset);
        }
        return execToRunResult(result, runId);
      } catch (error) {
        finished = true;
        releaseEcho();
        output.flush();
        const mapped = errorToRunResult(error, runId, now() - startedAt);
        if (mapped.notice) {
          notice(mapped.notice);
        }
        return mapped.result;
      }
    },
    stop(): void {
      connection.stop();
    },
  };
}
