/**
 * MicroPython 보드와 raw REPL·raw-paste 규약으로 이야기한다(P3-07 실제 보드 ① — SPEC §6.2 "[실행]: 코드를 raw REPL로 전송·실행, 출력 스트리밍,
 * [정지]는 Ctrl-C 전송", SPEC §12 "raw REPL 프로토콜은 단위 테스트"). 통로는 serial-channel.ts, 출력 읽기는 raw-repl-follow.ts.
 * P3-08(실제 보드 ②)이 더한 것: 도구 명령(session·command — 파일 쓰기, board-files.ts), 실행 중 input()에 글 보내기(sendInput),
 * boot.py 반복에 막힌 소프트 리셋의 Ctrl-C 되풀이, 멈추지 않는 보드에 Ctrl-C를 되풀이해 프롬프트를 되찾기(interruptUntilPrompt).
 *
 * 순서의 근거(2026-09-17·18 MicroPython v1.29.0 원문 확인 — docs/reference/repl.rst, shared/runtime/pyexec.c, tools/pyboard.py,
 * tools/mpremote/mpremote/transport_serial.py·transport.py, ports/esp32/main.c)
 * 1. 판별(probe): Ctrl-C 두 번(돌던 프로그램 멈추기) → Enter → 조용해질 때까지 받기 → Ctrl-B.
 *    보통 REPL에서 Ctrl-B는 리셋 없이 배너를 다시 찍고, raw REPL에서는 보통 REPL로 나오며 배너를 찍는다(pyexec.c friendly_repl_reset).
 *    Ctrl-C·Enter만으로는 ">>> " 프롬프트만 오고 버전이 든 배너는 오지 않아서 Ctrl-B를 더했다(PLAN §8.3 P3-07 "Ctrl-C·Enter로 받은 REPL 배너").
 *    Enter를 Ctrl-C 뒤에 보내는 까닭: input()을 기다리던 main.py에 빈 줄을 먼저 넣지 않고 멈추게(pyboard.py는 "\r\x03" 순서).
 *    대답이 없으면(부팅 중이었을 수 있음) 한 번 더, 글이 계속 오면(멈추지 않는 프로그램) 한 번 더 한다.
 *    이때 멈춘 트레이스백의 파일(boot.py·main.py)을 결과로 알려 주지만, "끝나지 않는 반복"으로 정하지는 않는다(아래 3에서 기다려도 끝나지 않을 때만).
 * 2. raw REPL 들어가기: "\r\x03\x03" → 조용해질 때까지 버림 → "\r\x01" → "raw REPL; CTRL-B to exit\r\n>" (mpremote enter_raw_repl과 같음).
 *    이미 raw 프롬프트에 있으면(지난 명령이 ">"로 끝남) Ctrl-C 하나로 받던 줄만 지우고 곧바로 보낸다(pyexec.c: raw REPL의 Ctrl-C = 줄 지우기, 출력 없음).
 *    그사이 보드가 다시 켜진 흔적(">>> "·부팅 글·배너)이 버퍼에 있거나 raw-paste 답이 어긋나면 전체 순서로 다시 들어간다.
 * 3. 실행마다 소프트 리셋(기본): raw 프롬프트에서 Ctrl-C(받던 줄 지우기) + 빈 줄 Ctrl-D → "OK\r\nMPY: soft reboot\r\n" + boot.py 출력 +
 *    "raw REPL; CTRL-B to exit\r\n>". 가상 보드가 [실행]마다 보드를 새로 켜는 것(PROGRESS 미해결 47)과 같게 — 지난 실행의 Timer·PWM·핀이 남지 않는다.
 *    raw 모드라 main.py는 돌지 않지만 boot.py는 돈다(ports/esp32/main.c). boot.py가 끝나지 않으면(교과서 3단원·블루투스 교안은 받는 코드를 boot.py에
 *    저장한다) bootTimeoutMs를 기다린 뒤 Ctrl-C를 짧은 간격으로 되풀이해 raw 프롬프트를 되찾고(boot.py의 KeyboardInterrupt 뒤 raw REPL), 그 보드는
 *    다음 소프트 리셋부터 오래 기다리지 않고 곧바로 멈춘다(bootLoopGraceMs — 제때 끝나면 다시 잊는다). Ctrl-C를 삼키는 boot.py면 BoardBusyError →
 *    화면의 [보드 되찾기](board-connection.ts recover). 판별·되찾기에서 멈춘 boot.py는 "반복"으로 치지 않는다(와이파이 연결처럼 오래 걸리는
 *    boot.py를 [실행]마다 끊지 않게 — 기다려도 끝나지 않은 것만).
 *    그사이 보드가 리셋돼 보통 REPL(">>> ")로 돌아와 있었으면 소프트 리셋 뒤 ">>> "가 오므로, 곧바로 2번의 전체 순서로 다시 들어간다.
 * 4. raw-paste: "\x05A\x01" → 2바이트
 *    - "R\x01": 창 크기 2바이트(LE, v1.29.0 = 128) — 처음에 창 두 개(알림 + 첫 \x01)만큼 보낼 수 있다. 창이 0이거나 받을 바이트가 있으면 1바이트 읽기:
 *      \x01 = 창 하나 더, \x04 = 보드가 받기를 먼저 끝냄(구문 오류 등) → \x04로 답하고 더 보내지 않음. 다 보내면 \x04 → 보드의 \x04(받음)까지 읽기.
 *    - "R\x00": raw-paste를 알지만 쓰지 않음 → ">" 뒤 보통 raw로. 그 밖("ra"): 모르는 옛 펌웨어 → "w REPL; CTRL-B to exit\r\n>" 뒤 보통 raw로.
 *    보통 raw: 256바이트씩 10ms 간격 → \x04 → "OK".
 * 5. 출력: [출력] \x04 [트레이스백] \x04 ">" (raw-repl-follow.ts). SystemExit이면 ">" 대신 소프트 리셋 글.
 *    실행 중(받기 끝 \x04 뒤)에 보낸 글자는 보드 stdin 링버퍼에 쌓였다가 input()이 읽는다(sendInput — board-input.ts 머리말).
 * 6. 정지: Ctrl-C. 코드를 받는(컴파일 전) 사이에 온 Ctrl-C는 인터럽트 문자가 아직 안 켜져 흘려질 수 있어(pyexec.c: 실행 직전에 mp_hal_set_interrupt_char)
 *    끝날 때까지 stopRetryMs마다 다시 보낸다(최대 stopAttempts번). raw-paste로 보내는 도중이면 더 보내지 않고 Ctrl-C만 보낸다 —
 *    보드는 \x04(받기 끝) + KeyboardInterrupt를 보내는데, 이 \x04에 \x04로 답하면 raw 프롬프트에 빈 코드가 들어가 소프트 리셋되므로 답하지 않는다
 *    (mp_reader_stdin_readbyte가 eof를 먼저 켜서 close가 더 읽지 않음).
 * 7. 도구 명령(session): 파일 쓰기처럼 짧은 명령을 여러 번 — mpremote처럼 처음에 한 번 소프트 리셋하고(선택), 명령마다 raw-paste로 보내 출력을 모은다.
 *    명령이 commandTimeoutMs 안에 끝나지 않으면 Ctrl-C로 멈추고 SerialTimeoutError.
 * 한 번에 일 하나만 한다(판별·실행·도구·되찾기가 겹치면 BoardInUseError).
 */
import {
  BoardTextDecoder,
  CR,
  CTRL_A,
  CTRL_B,
  CTRL_C,
  CTRL_D,
  FRIENDLY_PROMPT,
  RAW_PASTE_REQUEST,
  RAW_REPL_READY,
  RAW_REPL_READY_TAIL,
  SOFT_REBOOT_TEXT,
  latin1,
} from './control-bytes.ts';
import { classifyProbeTranscript, endsWithFriendlyPrompt, endsWithRawPrompt, isReplAnswerComplete, type ProbeVerdict } from './banner.ts';
import type { ReplCommandOutput, ReplCommandRunner } from './board-files.ts';
import { findInterruptedAutorun, type AutorunFile } from './board-recovery.ts';
import { BoardBusyError, BoardInUseError, BoardProtocolError, ReplStoppedError, SerialTimeoutError } from './errors.ts';
import { RawReplFollower, parseBoardTraceback } from './raw-repl-follow.ts';
import type { SerialChannel } from './serial-channel.ts';
import type { PythonErrorInfo } from '../runtime/protocol.ts';

export interface ReplTiming {
  /** Ctrl-C 뒤 조용해졌다고 볼 시간 */
  readonly quietMs: number;
  /** Ctrl-C 뒤 트레이스백·프롬프트를 모으는 최대 시간 */
  readonly settleMaxMs: number;
  /** Ctrl-B 뒤 배너·프롬프트를 기다리는 시간 */
  readonly bannerTimeoutMs: number;
  /** 판별을 되풀이하는 최대 횟수(글이 계속 올 때) */
  readonly probeAttempts: number;
  /** "\r\x01" 뒤 raw REPL 알림을 기다리는 시간(한 번) */
  readonly enterRawTimeoutMs: number;
  /** raw REPL 들어가기를 되풀이하는 횟수 */
  readonly enterRawAttempts: number;
  /** 소프트 리셋 알림("soft reboot")을 기다리는 시간 */
  readonly softRebootTimeoutMs: number;
  /** 소프트 리셋 뒤 boot.py가 끝나 raw 프롬프트가 오기를 기다리는 시간(처음 — 넘으면 Ctrl-C) */
  readonly bootTimeoutMs: number;
  /** boot.py가 끝나지 않는 보드로 알려진 뒤: 소프트 리셋 뒤 이만큼만 기다리고 Ctrl-C */
  readonly bootLoopGraceMs: number;
  /** boot.py에 Ctrl-C를 보낸 뒤 raw 프롬프트를 기다리는 시간(한 번 — 넘으면 Ctrl-C를 다시) */
  readonly bootInterruptRetryMs: number;
  /** 소프트 리셋 한 번에 boot.py로 보내는 Ctrl-C 최대 횟수(넘으면 BoardBusyError) */
  readonly bootInterruptAttempts: number;
  /** "\x05A\x01"의 답을 기다리는 시간 */
  readonly pasteReplyTimeoutMs: number;
  /** raw-paste 창이 0일 때 \x01을 기다리는 시간 */
  readonly windowTimeoutMs: number;
  /** 다 보낸 뒤 \x04(받음) 또는 "OK"를 기다리는 시간 */
  readonly ackTimeoutMs: number;
  /** 끝(\x04 \x04) 뒤 ">"를 기다리는 시간(소프트 리셋이면 boot.py 포함) */
  readonly promptTimeoutMs: number;
  /** 보통 raw 모드에서 256바이트마다 쉬는 시간(pyboard.py 10ms) */
  readonly rawChunkDelayMs: number;
  /** [정지] 뒤 끝나지 않으면 Ctrl-C를 다시 보내는 간격 */
  readonly stopRetryMs: number;
  /** [정지]에 보내는 Ctrl-C 최대 횟수(넘으면 "보드가 멈추지 않음") */
  readonly stopAttempts: number;
  /** 도구 명령(파일 쓰기·확인) 하나를 기다리는 최대 시간(넘으면 Ctrl-C로 멈추고 SerialTimeoutError) */
  readonly commandTimeoutMs: number;
  /** [보드 되찾기]: Ctrl-C를 되풀이해 보내는 간격 */
  readonly recoverIntervalMs: number;
  /** [보드 되찾기] 1단계(리셋 없이 Ctrl-C 되풀이) 시간 */
  readonly recoverInterruptMs: number;
  /** [보드 되찾기] 2단계(RTS로 보드를 다시 켜며 Ctrl-C 되풀이) 시간 — 실물 부팅(ROM·펌웨어·boot.py) 1초 안팎을 넉넉히 덮는다 */
  readonly recoverAfterResetMs: number;
  /** [보드 되찾기] 3단계(보드의 EN 버튼을 눌러 달라고 한 뒤 Ctrl-C 되풀이) 시간 */
  readonly recoverPressButtonMs: number;
}

/** 실물 ESP32(115200bps, CH340)를 기준으로 한 기본값 — 보드 부팅(약 1초)·boot.py를 넉넉히 기다린다(실물 확인 전 추정 — 부록 B-2) */
export const DEFAULT_REPL_TIMING: ReplTiming = Object.freeze({
  quietMs: 150,
  settleMaxMs: 1200,
  bannerTimeoutMs: 1500,
  probeAttempts: 3,
  enterRawTimeoutMs: 1500,
  enterRawAttempts: 3,
  softRebootTimeoutMs: 3000,
  bootTimeoutMs: 6000,
  bootLoopGraceMs: 500,
  bootInterruptRetryMs: 600,
  bootInterruptAttempts: 6,
  pasteReplyTimeoutMs: 2000,
  windowTimeoutMs: 5000,
  ackTimeoutMs: 10000,
  promptTimeoutMs: 8000,
  rawChunkDelayMs: 10,
  stopRetryMs: 500,
  stopAttempts: 6,
  commandTimeoutMs: 15000,
  recoverIntervalMs: 50,
  recoverInterruptMs: 2000,
  recoverAfterResetMs: 6000,
  recoverPressButtonMs: 15000,
});

/** 보드가 조용히 도는 동안에도 정지 요청을 알아채려고 읽기를 이 간격으로 깨운다 */
const FOLLOW_POLL_MS = 250;
/** 판별·되찾기·소프트 리셋에서 모아 두는 글의 뒷부분(글자 수) — 계속 찍는 프로그램이 글을 끝없이 늘리지 않게 */
const TRANSCRIPT_LIMIT = 16_384;

export type ReplMode = 'unknown' | 'friendly' | 'raw' | 'busy';

export interface ProbeResult {
  readonly verdict: ProbeVerdict;
  /** 판별 동안 받은 글(0~255 글자) */
  readonly transcript: string;
  readonly attempts: number;
  /** 판별의 Ctrl-C로 멈춘 자동 실행 파일(boot.py·main.py, 없으면 null) */
  readonly interrupted: AutorunFile | null;
}

export type ExecStage = 'prepare' | 'soft-reset' | 'upload' | 'running' | 'stopping';

export interface ExecHandlers {
  /** 보드 출력(UTF-8을 이어 풀고 \r\n → \n) */
  onStdout?(text: string): void;
  onStage?(stage: ExecStage): void;
}

/** 도구 명령을 보내는 쪽(board-files.ts의 ReplCommandRunner) */
export interface ReplTools extends ReplCommandRunner {
  /** [정지]·[연결 끊기]가 멈추라고 했는지 */
  readonly stopRequested: boolean;
}

export interface ExecOptions {
  /** 실행 전에 소프트 리셋(기본 true — 가상 보드처럼 보드를 새로 켠 상태에서 시작) */
  readonly softReset?: boolean;
  /**
   * 코드를 보내기 전에(소프트 리셋 앞) 도구 명령으로 할 일 — 코드가 부르는 라이브러리를 보드에 갖추기(board-files.ts provisionLibraries).
   * 소프트 리셋 앞이라 도구 명령이 남긴 이름(f·w·_s …)은 학생 코드가 돌 때 사라져 있다.
   */
  readonly prepare?: (tools: ReplTools) => Promise<void>;
}

/**
 * ok = 끝까지 돎(SystemExit 포함), error = 잡히지 않은 예외, interrupted = KeyboardInterrupt·정지,
 * reset = 실행 중에 보드가 다시 시작함(machine.reset()·전원 부족 등, \x04 없이 부팅 글)
 */
export type ExecOutcome = 'ok' | 'error' | 'interrupted' | 'reset';

export interface ExecResult {
  readonly outcome: ExecOutcome;
  /** 보드 출력 전체(\n 줄 끝) */
  readonly stdout: string;
  /** 트레이스백 원문(\r\n 그대로) */
  readonly stderr: string;
  readonly error: PythonErrorInfo | null;
  readonly transfer: 'raw-paste' | 'raw' | null;
  /** 끝난 뒤 보드가 소프트 리셋됨(sys.exit()·machine.soft_reset()) */
  readonly softReboot: boolean;
  readonly resetKind: 'soft' | 'hard' | null;
  readonly stopRequested: boolean;
  /** [정지]를 여러 번 보내도 보드가 끝을 알리지 않음(보드는 아직 돌고 있을 수 있음) */
  readonly stopUnconfirmed: boolean;
  readonly durationMs: number;
  /** 이번 소프트 리셋에서 끝나지 않는 boot.py를 Ctrl-C로 멈췄는지(멈춘 파일, 없으면 null) */
  readonly bootInterrupted?: AutorunFile | null;
}

/** [보드 되찾기] 한 단계의 결과 */
export interface InterruptResult {
  /** 보통 REPL(">>> ")이나 raw REPL 프롬프트를 되찾음 */
  readonly ok: boolean;
  readonly prompt: 'friendly' | 'raw' | null;
  /** 받은 글(뒷부분) */
  readonly transcript: string;
  /** 멈춘 자동 실행 파일(트레이스백 — 없으면 null) */
  readonly interrupted: AutorunFile | null;
  /** 보낸 Ctrl-C 묶음 수 */
  readonly attempts: number;
}

interface StopState {
  requestedAt: number;
  sent: number;
  lastSentAt: number;
}

/** 소프트 리셋 뒤 raw 프롬프트가 아니라 보통 REPL 프롬프트가 옴(그사이 보드가 리셋돼 보통 REPL이었음) */
class NotInRawReplError extends Error {
  override readonly name = 'NotInRawRepl';
  readonly received: string;
  constructor(received: string) {
    super('보드가 raw REPL이 아니었어요.');
    this.received = received;
  }
}

/** 코드 바이트를 하나도 보내기 전에 raw-paste 요청의 답이 어긋남(보드가 raw 프롬프트가 아니었음) — 다시 들어가 한 번 더 보내도 두 번 돌지 않는다 */
class UploadNotStartedError extends BoardProtocolError {}

type FollowEnd =
  | { readonly kind: 'done'; readonly stderr: string; readonly softReboot: boolean; readonly timedOut: boolean }
  | { readonly kind: 'reset'; readonly resetKind: 'soft' | 'hard'; readonly prompt: 'raw' | 'friendly' }
  | { readonly kind: 'unconfirmed' };

type BusyKind = 'probe' | 'exec' | 'enter' | 'session' | 'recover';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function keepTail(text: string): string {
  return text.length > TRANSCRIPT_LIMIT ? text.slice(-TRANSCRIPT_LIMIT) : text;
}

/** raw 프롬프트에 머문 줄 알았던 보드가 그사이 다시 켜졌다는 흔적(보통 REPL 프롬프트·ROM 부팅 글·배너·소프트 리셋 글) */
function looksRebooted(text: string): boolean {
  return text.includes(FRIENDLY_PROMPT) || /rst:0x[0-9a-f]+ \(|MicroPython v\d|MPY: soft reboot/u.test(text);
}

export class MicroPythonRepl {
  readonly channel: SerialChannel;
  readonly timing: ReplTiming;
  #mode: ReplMode = 'unknown';
  /** 보드가 raw-paste를 지원하는지(모르면 null — 처음 실행 때 알게 된다) */
  #rawPaste: boolean | null = null;
  #busy: BusyKind | null = null;
  #stop: StopState | null = null;
  #stage: ExecStage | null = null;
  /** 끝나지 않는 반복이라 Ctrl-C로 멈춰 본 boot.py(소프트 리셋마다 곧바로 멈춘다) */
  #bootLoop: AutorunFile | null = null;
  /** 마지막 소프트 리셋에서 Ctrl-C로 멈춘 파일 */
  #lastBootInterrupt: AutorunFile | null = null;
  readonly #tools: ReplTools;

  constructor(channel: SerialChannel, timing: Partial<ReplTiming> = {}) {
    this.channel = channel;
    this.timing = Object.freeze({ ...DEFAULT_REPL_TIMING, ...timing });
    const isStopRequested = () => this.#stop !== null;
    this.#tools = Object.freeze({
      command: (code: string) => this.#command(code),
      get stopRequested() {
        return isStopRequested();
      },
    });
  }

  /** 보드가 지금 어느 REPL에 있다고 보는지 */
  get mode(): ReplMode {
    return this.#mode;
  }

  get rawPasteSupported(): boolean | null {
    return this.#rawPaste;
  }

  get isBusy(): boolean {
    return this.#busy !== null;
  }

  get stage(): ExecStage | null {
    return this.#stage;
  }

  /** 끝나지 않는 반복이라 소프트 리셋마다 멈추는 파일(boot.py — 없으면 null) */
  get bootLoopFile(): AutorunFile | null {
    return this.#bootLoop;
  }

  /** boot.py를 끄는 등으로 반복이 없어졌을 때 잊는다(다음 소프트 리셋은 다시 넉넉히 기다린다) */
  forgetBootLoop(): void {
    this.#bootLoop = null;
  }

  /** 연결 직후·[다시 확인]: 보드에 MicroPython REPL이 있는지 가른다. MicroPython이면 보통 REPL(friendly)에 둔다 */
  async probe(): Promise<ProbeResult> {
    this.#claim('probe');
    const timing = this.timing;
    let transcript = latin1(this.channel.take());
    let attempts = 0;
    // 판별이 멈춘 파일은 알려 주기만 한다: 포트를 열 때 보드가 리셋되면(자동 리셋 회로) 제대로 끝날 boot.py도 도는 중에 멈출 수 있어,
    // "끝나지 않는 반복"은 소프트 리셋에서 기다려도 끝나지 않을 때만 정한다(#softReset)
    const result = (verdict: ProbeVerdict): ProbeResult => ({ verdict, transcript, attempts, interrupted: findInterruptedAutorun(transcript) });
    try {
      while (attempts < timing.probeAttempts) {
        attempts += 1;
        const before = transcript.length;
        await this.channel.write(Uint8Array.of(CTRL_C));
        await sleep(20);
        await this.channel.write(Uint8Array.of(CTRL_C, CR));
        transcript = keepTail(transcript + latin1(await this.channel.readQuiet(timing.quietMs, timing.settleMaxMs)));
        await this.channel.write(Uint8Array.of(CTRL_B));
        const complete = await this.channel.waitForText(isReplAnswerComplete, timing.bannerTimeoutMs);
        // 프롬프트 뒤에 붙어 오는 글(느린 USB 조각)까지 잠깐 더 모은다
        transcript = keepTail(transcript + latin1(await this.channel.readQuiet(complete ? Math.min(60, timing.quietMs) : 0, timing.quietMs)));
        const verdict = classifyProbeTranscript(transcript);
        if (verdict.kind === 'micropython') {
          this.#mode = verdict.prompt;
          return result(verdict);
        }
        if (verdict.kind === 'other-python') {
          this.#mode = 'unknown';
          return result(verdict);
        }
        if (transcript.length === before && attempts >= 2) {
          break; // 두 번 모두 아무 대답이 없으면 더 기다리지 않는다
        }
      }
      const verdict = classifyProbeTranscript(transcript);
      this.#mode = verdict.kind === 'busy' ? 'busy' : 'unknown';
      return result(verdict);
    } finally {
      this.#release('probe');
    }
  }

  /**
   * raw REPL로 들어간다(프롬프트 ">"까지 읽음). softReset이면 이어서 소프트 리셋하고 raw 프롬프트를 다시 받는다.
   * 들어가지 못하면 BoardBusyError. 돌려주는 글은 그동안 받은 글(boot.py 출력 등).
   */
  async enterRawRepl(options: { readonly softReset?: boolean } = {}): Promise<string> {
    this.#claim('enter');
    try {
      return await this.#enterRawRepl(options.softReset === true);
    } finally {
      this.#release('enter');
    }
  }

  /** 코드를 실행하고 끝날 때까지 기다린다(출력은 onStdout로 흘려보냄). 도중에 requestStop()하면 Ctrl-C */
  async exec(code: string, handlers: ExecHandlers = {}, options: ExecOptions = {}): Promise<ExecResult> {
    this.#claim('exec');
    const startedAt = Date.now();
    this.#stop = null;
    this.#lastBootInterrupt = null;
    const decoder = new BoardTextDecoder();
    let stdout = '';
    const emit = (text: string) => {
      if (text !== '') {
        stdout += text;
        handlers.onStdout?.(text);
      }
    };
    const setStage = (stage: ExecStage) => {
      this.#stage = stage;
      handlers.onStage?.(stage);
    };
    const finish = (partial: Partial<ExecResult> & Pick<ExecResult, 'outcome'>): ExecResult => {
      emit(decoder.flush());
      return Object.freeze({
        stdout,
        stderr: '',
        error: null,
        transfer: null,
        softReboot: false,
        resetKind: null,
        stopRequested: this.#stop !== null,
        stopUnconfirmed: false,
        durationMs: Date.now() - startedAt,
        bootInterrupted: this.#lastBootInterrupt,
        ...partial,
      });
    };
    try {
      const softReset = options.softReset !== false;
      if (options.prepare) {
        setStage('prepare');
        try {
          await options.prepare(this.#tools);
        } catch (error) {
          if (error instanceof ReplStoppedError) {
            return finish({ outcome: 'interrupted' });
          }
          throw error;
        }
        if (this.#stop) {
          return finish({ outcome: 'interrupted' });
        }
      }
      setStage(softReset ? 'soft-reset' : 'prepare');
      await this.#enterRawRepl(softReset);
      if (this.#stop) {
        return finish({ outcome: 'interrupted' });
      }
      setStage('upload');
      const upload = await this.#uploadAtPrompt(code);
      if (upload.cancelled) {
        // 보통 raw 모드에서 보내는 도중 멈춤: Ctrl-C가 받던 줄을 지웠고 보드는 raw 프롬프트에서 기다린다(출력 없음)
        return finish({ outcome: 'interrupted', transfer: upload.transfer });
      }
      setStage(this.#stop ? 'stopping' : 'running');
      const end = await this.#follow((bytes) => emit(decoder.push(bytes)));
      if (end.kind === 'reset') {
        this.#mode = end.prompt;
        return finish({ outcome: 'reset', transfer: upload.transfer, resetKind: end.resetKind });
      }
      if (end.kind === 'unconfirmed') {
        this.#mode = 'busy';
        return finish({ outcome: 'interrupted', transfer: upload.transfer, stopUnconfirmed: true });
      }
      const error = parseBoardTraceback(end.stderr);
      const outcome: ExecOutcome = error === null ? 'ok' : error.type === 'KeyboardInterrupt' ? 'interrupted' : 'error';
      return finish({ outcome, stderr: end.stderr, error, transfer: upload.transfer, softReboot: end.softReboot });
    } catch (error) {
      if (this.#mode !== 'busy') {
        this.#mode = 'unknown';
      }
      throw error;
    } finally {
      this.#stage = null;
      this.#release('exec');
    }
  }

  /**
   * 도구 명령 묶음(파일 쓰기 등): raw REPL에 들어가(softReset이면 mpremote처럼 먼저 소프트 리셋) fn(도구)을 부른다.
   * 도구의 command(코드)는 명령 하나를 raw-paste로 보내 출력·오류를 모아 돌려준다. [정지]·[연결 끊기]면 ReplStoppedError.
   */
  async session<T>(fn: (tools: ReplTools) => Promise<T>, options: { readonly softReset?: boolean } = {}): Promise<T> {
    this.#claim('session');
    this.#stop = null;
    this.#lastBootInterrupt = null;
    try {
      await this.#enterRawRepl(options.softReset === true);
      if (this.#stop) {
        throw new ReplStoppedError();
      }
      return await fn(this.#tools);
    } finally {
      this.#release('session');
      this.#stop = null;
    }
  }

  /** 마지막 소프트 리셋(실행·도구 묶음)에서 Ctrl-C로 멈춘 자동 실행 파일 */
  get lastBootInterrupt(): AutorunFile | null {
    return this.#lastBootInterrupt;
  }

  /** 실행 중이면 멈추게 한다(Ctrl-C, 끝날 때까지 되풀이). 도구 묶음이면 지금 명령을 멈추고 다음 명령을 보내지 않는다 */
  requestStop(): void {
    if ((this.#busy !== 'exec' && this.#busy !== 'session') || this.#stop) {
      return;
    }
    this.#stop = { requestedAt: Date.now(), sent: 0, lastSentAt: 0 };
    if (this.#busy === 'exec' && this.#stage === 'running') {
      // 코드가 돌고 있으면 바로 Ctrl-C(읽기 반복은 되풀이만 맡는다). 준비·보내는 중이면 그 단계가 알아채고 멈춘다.
      this.#stage = 'stopping';
      void this.#sendInterrupt(this.#stop);
    }
  }

  get stopRequested(): boolean {
    return this.#stop !== null;
  }

  /**
   * 실행 중인 코드의 표준 입력으로 바이트를 보낸다(input() — board-input.ts). 코드가 도는 중(받기가 끝난 뒤)에만 되고, 아니면 false.
   * 보드가 아직 input()을 부르지 않았으면 stdin 링버퍼에 쌓였다가 읽힌다.
   */
  sendInput(bytes: Uint8Array): boolean {
    if (this.#busy !== 'exec' || this.#stage !== 'running' || this.#stop !== null || !this.channel.isOpen) {
      return false;
    }
    void this.channel.write(bytes).catch(() => undefined);
    return true;
  }

  /**
   * [보드 되찾기] 한 단계: durationMs 동안 intervalMs마다 Ctrl-C를 보내며(열 번에 한 번은 Ctrl-B도 — 할 일 없이 raw REPL에 머문 보드는
   * Ctrl-C에 아무 글도 보내지 않으므로 보통 REPL 배너를 받아 본다) 프롬프트가 오고 조용해지기를 기다린다.
   * KeyboardInterrupt를 삼키는 반복도 Ctrl-C가 try 바깥에 떨어지는 순간 멈춘다. 보드를 다시 켜는 일은 부른 쪽(board-connection.ts)이 한다.
   */
  async interruptUntilPrompt(options: { readonly durationMs: number; readonly intervalMs?: number }): Promise<InterruptResult> {
    this.#claim('recover');
    const timing = this.timing;
    const interval = Math.max(10, options.intervalMs ?? timing.recoverIntervalMs);
    const deadline = Date.now() + Math.max(0, options.durationMs);
    let transcript = keepTail(latin1(this.channel.take()));
    let attempts = 0;
    try {
      while (Date.now() < deadline) {
        attempts += 1;
        await this.channel.write(attempts % 10 === 0 ? Uint8Array.of(CTRL_C, CTRL_B) : Uint8Array.of(CTRL_C));
        const prompted = await this.channel.waitForText((text) => endsWithFriendlyPrompt(text) || endsWithRawPrompt(text), interval);
        transcript = keepTail(transcript + latin1(this.channel.take()));
        if (!prompted) {
          continue;
        }
        // 프롬프트가 왔다: 보내기를 멈추고 조용한지 본다(계속 찍는 프로그램의 글이 우연히 프롬프트 모양으로 끝난 게 아닌지)
        const after = latin1(await this.channel.readQuiet(timing.quietMs, timing.settleMaxMs));
        transcript = keepTail(transcript + after);
        if (after === '' || endsWithFriendlyPrompt(after) || endsWithRawPrompt(after)) {
          const prompt = endsWithRawPrompt(transcript) ? 'raw' : 'friendly';
          this.#mode = prompt;
          return { ok: true, prompt, transcript, interrupted: findInterruptedAutorun(transcript), attempts };
        }
      }
      this.#mode = 'busy';
      return { ok: false, prompt: null, transcript, interrupted: findInterruptedAutorun(transcript), attempts };
    } finally {
      this.#release('recover');
    }
  }

  /** 연결을 끊기 전에 보통 REPL로 돌려놓는다(Thonny 같은 다른 도구가 쓰기 좋게). 실패해도 조용히 넘어간다 */
  async exitRawRepl(): Promise<void> {
    if (this.#busy !== null || this.#mode !== 'raw' || !this.channel.isOpen) {
      return;
    }
    try {
      await this.channel.write(Uint8Array.of(CR, CTRL_B));
      await this.channel.readQuiet(Math.min(80, this.timing.quietMs), this.timing.quietMs * 2);
      this.#mode = 'friendly';
    } catch {
      // 끊겼거나 닫힘
    }
  }

  // ───────────── 안쪽 ─────────────

  #claim(kind: BusyKind): void {
    if (this.#busy !== null) {
      throw new BoardInUseError();
    }
    this.#busy = kind;
  }

  #release(kind: BusyKind): void {
    if (this.#busy === kind) {
      this.#busy = null;
    }
  }

  async #sendInterrupt(state: StopState): Promise<void> {
    state.sent += 1;
    state.lastSentAt = Date.now();
    try {
      await this.channel.write(Uint8Array.of(CTRL_C));
    } catch {
      // 끊긴 경우는 읽는 쪽이 알아챈다
    }
  }

  async #enterRawRepl(softReset: boolean): Promise<string> {
    const timing = this.timing;
    let transcript = '';
    // 빠른 길: 지난 명령이 raw 프롬프트에서 끝났으면 곧바로(보드가 그사이 다시 켜진 흔적이 있으면 아래 전체 순서로)
    if (this.#mode === 'raw') {
      const pending = latin1(this.channel.take());
      transcript += pending;
      if (looksRebooted(pending)) {
        this.#mode = 'unknown';
      } else if (!softReset) {
        // raw 프롬프트에서 Ctrl-C는 받던 줄만 지운다(출력 없음) — 지난 실행 중에 보낸 input 글자가 줄에 남아 있을 수 있다
        await this.channel.write(Uint8Array.of(CTRL_C));
        return transcript;
      } else {
        try {
          return transcript + (await this.#softReset());
        } catch (error) {
          if (error instanceof NotInRawReplError || error instanceof SerialTimeoutError) {
            transcript += error.received;
            this.#mode = 'unknown';
          } else {
            throw error;
          }
        }
      }
    }
    let entered = false;
    for (let attempt = 1; attempt <= timing.enterRawAttempts && !entered; attempt += 1) {
      if (this.#stop) {
        return transcript;
      }
      await this.channel.write(Uint8Array.of(CR, CTRL_C, CTRL_C));
      transcript = keepTail(transcript + latin1(await this.channel.readQuiet(timing.quietMs, timing.settleMaxMs)));
      await this.channel.write(Uint8Array.of(CR, CTRL_A));
      try {
        transcript = keepTail(transcript + latin1(await this.channel.readUntil(RAW_REPL_READY, { timeoutMs: timing.enterRawTimeoutMs, what: 'raw REPL 알림' })));
        entered = true;
      } catch (error) {
        if (!(error instanceof SerialTimeoutError)) {
          throw error;
        }
      }
    }
    if (!entered) {
      this.#mode = 'busy';
      throw new BoardBusyError(keepTail(transcript + latin1(this.channel.take())));
    }
    this.#mode = 'raw';
    if (!softReset || this.#stop) {
      return transcript;
    }
    try {
      return transcript + (await this.#softReset());
    } catch (error) {
      if (error instanceof NotInRawReplError) {
        this.#mode = 'friendly';
        throw new BoardProtocolError('소프트 리셋 뒤 raw REPL로 돌아오지 않았어요', error.received);
      }
      throw error;
    }
  }

  /**
   * raw 프롬프트에서 소프트 리셋: Ctrl-C + \x04 → "OK\r\nMPY: soft reboot\r\n" … "raw REPL; CTRL-B to exit\r\n>".
   * boot.py가 끝나지 않으면 Ctrl-C를 되풀이해 raw 프롬프트를 되찾는다(머리말 3).
   */
  async #softReset(): Promise<string> {
    const timing = this.timing;
    this.#lastBootInterrupt = null;
    await this.channel.write(Uint8Array.of(CTRL_C, CTRL_D));
    let text = latin1(await this.channel.readUntil(SOFT_REBOOT_TEXT, { timeoutMs: timing.softRebootTimeoutMs, what: '소프트 리셋 알림' }));
    let interrupts = 0;
    for (;;) {
      const wait = interrupts > 0 ? timing.bootInterruptRetryMs : this.#bootLoop ? timing.bootLoopGraceMs : timing.bootTimeoutMs;
      const settled = await this.channel.waitForText((buffer) => endsWithRawPrompt(buffer) || endsWithFriendlyPrompt(buffer), wait);
      const received = latin1(this.channel.take());
      text = keepTail(text + received);
      if (settled && endsWithRawPrompt(received)) {
        this.#mode = 'raw';
        if (interrupts > 0) {
          // raw 모드 소프트 리셋에서는 boot.py만 돈다(main.py는 건너뜀)
          const file = findInterruptedAutorun(text) ?? 'boot.py';
          this.#bootLoop = file;
          this.#lastBootInterrupt = file;
        } else if (this.#bootLoop) {
          // 이번에는 boot.py가 제때 끝났다(고쳐졌다) — 다음부터 다시 넉넉히 기다린다
          this.#bootLoop = null;
        }
        return text;
      }
      if (settled) {
        // 보통 REPL에서 소프트 리셋됐다(main.py까지 돌고 ">>> ") — 부른 쪽이 전체 순서로 raw REPL에 다시 들어간다
        this.#mode = 'friendly';
        throw new NotInRawReplError(text);
      }
      if (interrupts >= timing.bootInterruptAttempts) {
        this.#mode = 'busy';
        throw new BoardBusyError(text, '보드의 boot.py가 끝나지 않고 멈춤 신호(Ctrl-C)도 받지 않아 코드를 보낼 수 없어요.', 'boot.py');
      }
      // boot.py가 끝나지 않는다(끝없는 반복): Ctrl-C로 멈추면 raw REPL로 온다
      await this.channel.write(Uint8Array.of(CTRL_C));
      interrupts += 1;
    }
  }

  /**
   * raw 프롬프트에서 코드를 보낸다. 빠른 길로 들어왔는데 코드를 보내기 전에 raw-paste 답이 어긋나면(보드가 raw 프롬프트가 아니었음)
   * 전체 순서로 다시 들어가 한 번 더 보낸다(코드 바이트를 보낸 뒤의 오류는 두 번 돌 수 있어 되풀이하지 않는다).
   */
  async #uploadAtPrompt(code: string): Promise<{ transfer: 'raw-paste' | 'raw'; cancelled: boolean }> {
    try {
      return await this.#upload(code);
    } catch (error) {
      if (!(error instanceof UploadNotStartedError) || this.#stop || !this.channel.isOpen) {
        throw error;
      }
      this.#mode = 'unknown';
      await this.#enterRawRepl(false);
      if (this.#stop) {
        return { transfer: 'raw-paste', cancelled: true };
      }
      return this.#upload(code);
    }
  }

  async #upload(code: string): Promise<{ transfer: 'raw-paste' | 'raw'; cancelled: boolean }> {
    const timing = this.timing;
    const bytes = new TextEncoder().encode(code);
    if (this.#rawPaste !== false) {
      await this.channel.write(RAW_PASTE_REQUEST);
      const reply = latin1(await this.#beforeCode(() => this.channel.readExactly(2, { timeoutMs: timing.pasteReplyTimeoutMs, what: 'raw-paste 답' })));
      if (reply === 'R\x01') {
        this.#rawPaste = true;
        await this.#rawPasteWrite(bytes);
        return { transfer: 'raw-paste', cancelled: false };
      }
      if (reply === 'R\x00') {
        // 알지만 쓰지 않는 보드: pyexec.c가 ">"를 다시 찍는다
        await this.#beforeCode(() => this.channel.readUntil('>', { timeoutMs: timing.pasteReplyTimeoutMs, what: 'raw 프롬프트' }));
      } else if (reply === 'ra') {
        await this.#beforeCode(() => this.channel.readUntil(RAW_REPL_READY_TAIL, { timeoutMs: timing.pasteReplyTimeoutMs, what: 'raw REPL 알림' }));
      } else {
        this.#mode = 'unknown';
        throw new UploadNotStartedError(`raw-paste 요청에 뜻밖의 답 ${JSON.stringify(reply)}`, reply + this.channel.peekText());
      }
      this.#rawPaste = false;
    }
    // 보통 raw: 256바이트씩(pyboard.py) → \x04 → "OK"
    for (let offset = 0; offset < bytes.length; offset += 256) {
      if (this.#stop) {
        await this.channel.write(Uint8Array.of(CTRL_C));
        return { transfer: 'raw', cancelled: true };
      }
      await this.channel.write(bytes.subarray(offset, Math.min(offset + 256, bytes.length)));
      if (offset + 256 < bytes.length) {
        await sleep(timing.rawChunkDelayMs);
      }
    }
    if (this.#stop) {
      await this.channel.write(Uint8Array.of(CTRL_C));
      return { transfer: 'raw', cancelled: true };
    }
    await this.channel.write(Uint8Array.of(CTRL_D));
    const ok = latin1(await this.channel.readExactly(2, { timeoutMs: timing.ackTimeoutMs, what: '"OK"' }));
    if (ok !== 'OK') {
      this.#mode = 'unknown';
      throw new BoardProtocolError(`코드를 보냈지만 "OK" 대신 ${JSON.stringify(ok)}`, ok + this.channel.peekText());
    }
    return { transfer: 'raw', cancelled: false };
  }

  /** 코드 바이트를 보내기 전의 기다림: 시간이 다 되면 UploadNotStartedError(한 번 더 보내도 되는 오류)로 바꾼다 */
  async #beforeCode<T>(read: () => Promise<T>): Promise<T> {
    try {
      return await read();
    } catch (error) {
      if (error instanceof SerialTimeoutError) {
        this.#mode = 'unknown';
        throw new UploadNotStartedError(error.message, error.received);
      }
      throw error;
    }
  }

  /** repl.rst raw-paste 5~8단계. 끝나면 보드의 "받기 끝" \x04까지 읽은 상태다 */
  async #rawPasteWrite(bytes: Uint8Array): Promise<void> {
    const timing = this.timing;
    const header = await this.channel.readExactly(2, { timeoutMs: timing.pasteReplyTimeoutMs, what: 'raw-paste 창 크기' });
    const windowSize = header[0]! | (header[1]! << 8);
    if (windowSize <= 0) {
      throw new BoardProtocolError('raw-paste 창 크기가 0이에요', latin1(header));
    }
    let windowRemain = windowSize;
    let index = 0;
    while (index < bytes.length && !this.#stop) {
      while ((windowRemain === 0 || this.channel.buffered > 0) && !this.#stop) {
        const flag = this.channel.buffered > 0 ? this.channel.take(1)[0]! : await this.#readFlag();
        if (flag === null) {
          continue; // 정지 요청을 보려고 깨어남
        }
        if (flag === CTRL_A) {
          windowRemain += windowSize;
        } else if (flag === CTRL_D) {
          // 보드가 받기를 먼저 끝냈다(구문 오류 등): \x04로 답하고 더 보내지 않는다(보드의 close가 \x04까지 버림). 이 \x04가 "받기 끝"이다.
          await this.channel.write(Uint8Array.of(CTRL_D));
          return;
        } else {
          this.#mode = 'unknown';
          throw new BoardProtocolError(`raw-paste 중에 뜻밖의 바이트 ${JSON.stringify(String.fromCharCode(flag))}`, String.fromCharCode(flag) + this.channel.peekText());
        }
      }
      if (this.#stop) {
        break;
      }
      const part = bytes.subarray(index, Math.min(index + windowRemain, bytes.length));
      await this.channel.write(part);
      windowRemain -= part.length;
      index += part.length;
    }
    if (this.#stop) {
      // 더 보내지 않고 Ctrl-C만 — 보드는 \x04(받기 끝) + \x04 + KeyboardInterrupt + \x04 + ">"로 끝낸다(\x04로 답하지 않는다)
      await this.#sendInterrupt(this.#stop);
    } else {
      await this.channel.write(Uint8Array.of(CTRL_D));
    }
    // 보드의 "받기 끝" \x04까지(그 앞의 \x01 창 알림은 버린다)
    const ack = latin1(await this.channel.readUntil(Uint8Array.of(CTRL_D), { timeoutMs: timing.ackTimeoutMs, what: 'raw-paste 받기 끝(\\x04)' }));
    const extra = ack.slice(0, -1).replace(/\x01/gu, '');
    if (extra !== '') {
      this.#mode = 'unknown';
      throw new BoardProtocolError(`raw-paste 받기 끝 앞에 뜻밖의 글 ${JSON.stringify(extra)}`, ack);
    }
  }

  /** raw-paste 창 알림 1바이트. 정지 요청을 알아채려고 짧게 나눠 기다리다가 창 시간이 다 되면 오류, 정지 요청이면 null */
  async #readFlag(): Promise<number | null> {
    const deadline = Date.now() + this.timing.windowTimeoutMs;
    while (!this.#stop) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new SerialTimeoutError('raw-paste 창(\\x01)', this.channel.peekText());
      }
      if (await this.channel.waitForText((text) => text.length > 0, Math.min(remaining, FOLLOW_POLL_MS))) {
        return this.channel.take(1)[0]!;
      }
    }
    return null;
  }

  /** 도구 명령 하나: raw 프롬프트에서 보내고 출력·오류를 모은다(소프트 리셋 없음) */
  async #command(code: string): Promise<ReplCommandOutput> {
    if (this.#busy !== 'session' && this.#busy !== 'exec') {
      throw new BoardInUseError('도구 명령은 보드 작업 안에서만 보낼 수 있어요.');
    }
    if (this.#stop) {
      throw new ReplStoppedError();
    }
    await this.#enterRawRepl(false);
    if (this.#stop) {
      throw new ReplStoppedError();
    }
    const upload = await this.#uploadAtPrompt(code);
    if (upload.cancelled) {
      throw new ReplStoppedError();
    }
    const decoder = new BoardTextDecoder();
    let stdout = '';
    const end = await this.#follow((bytes) => {
      stdout += decoder.push(bytes);
    }, this.timing.commandTimeoutMs);
    stdout += decoder.flush();
    if (end.kind === 'reset') {
      this.#mode = end.prompt;
      throw new BoardProtocolError('명령을 보내는 동안 보드가 다시 켜졌어요', stdout.slice(-200));
    }
    if (end.kind === 'unconfirmed') {
      this.#mode = 'busy';
      throw new BoardBusyError(stdout.slice(-200), '보드가 명령을 끝내지 않고 멈춤 신호(Ctrl-C)도 받지 않아요.');
    }
    const error = parseBoardTraceback(end.stderr);
    if (this.#stop && (error === null || error.type === 'KeyboardInterrupt')) {
      throw new ReplStoppedError();
    }
    if (end.timedOut) {
      throw new SerialTimeoutError('보드 명령의 끝', stdout.slice(-200));
    }
    return { stdout, stderr: end.stderr, error };
  }

  /**
   * 출력·오류·프롬프트를 읽는다. 정지 요청이 있으면 끝날 때까지 Ctrl-C를 되풀이한다.
   * timeoutMs를 주면(도구 명령) 그 시간이 지나도록 출력 칸이 끝나지 않을 때 스스로 Ctrl-C를 되풀이해 멈추고 timedOut으로 알린다.
   */
  async #follow(onBytes: (bytes: Uint8Array) => void, timeoutMs?: number): Promise<FollowEnd> {
    const timing = this.timing;
    const follower = new RawReplFollower();
    let stderr = '';
    let promptDeadline: number | null = null;
    const deadline = timeoutMs === undefined ? null : Date.now() + timeoutMs;
    let timeoutStop: StopState | null = null;
    for (;;) {
      if (deadline !== null && timeoutStop === null && follower.phase === 'stdout' && Date.now() >= deadline) {
        timeoutStop = { requestedAt: Date.now(), sent: 0, lastSentAt: 0 };
      }
      const stop = this.#stop ?? timeoutStop;
      let wait = FOLLOW_POLL_MS;
      if (deadline !== null && timeoutStop === null) {
        wait = Math.min(wait, Math.max(1, deadline - Date.now()));
      }
      if (stop && follower.phase === 'stdout') {
        const sinceLast = Date.now() - stop.lastSentAt;
        if (stop.sent === 0 || sinceLast >= timing.stopRetryMs) {
          if (stop.sent >= timing.stopAttempts) {
            return { kind: 'unconfirmed' };
          }
          if (this.#busy === 'exec') {
            this.#stage = 'stopping';
          }
          await this.#sendInterrupt(stop);
          wait = Math.min(wait, timing.stopRetryMs);
        } else {
          wait = Math.min(wait, timing.stopRetryMs - sinceLast);
        }
      }
      if (promptDeadline !== null) {
        const remaining = promptDeadline - Date.now();
        if (remaining <= 0) {
          // 끝(\x04 \x04)은 왔는데 프롬프트가 없다: 실행 결과는 그대로 두고 다음 명령이 raw REPL을 새로 연다
          this.#mode = 'unknown';
          return { kind: 'done', stderr, softReboot: /soft reboot/u.test(follower.pendingPromptText), timedOut: timeoutStop !== null };
        }
        wait = Math.min(wait, remaining);
      }
      const chunk = await this.channel.nextChunk(Math.max(0, wait));
      if (!chunk) {
        continue;
      }
      const step = follower.push(chunk);
      for (const event of step.events) {
        switch (event.type) {
          case 'stdout':
            onBytes(event.bytes);
            break;
          case 'stdout-end':
            break;
          case 'stderr-end':
            stderr = event.stderr;
            promptDeadline = Date.now() + timing.promptTimeoutMs;
            break;
          case 'prompt':
            this.#mode = 'raw';
            this.channel.unshift(step.rest);
            return { kind: 'done', stderr, softReboot: event.softReboot, timedOut: timeoutStop !== null };
          case 'reset':
            this.channel.unshift(step.rest);
            return { kind: 'reset', resetKind: event.kind, prompt: event.text.endsWith('>>> ') ? 'friendly' : 'raw' };
        }
      }
    }
  }
}
