/**
 * 실제 ESP32 보드 연결 하나의 상태 기계(P3-07 — SPEC §6.2 "실제 보드: 1. [연결] → 포트 선택 창 → 연결 상태 표시 2. 펌웨어 확인",
 * P3-08 — "3. [실행]·[정지]·[보드에 저장]", PLAN §8.3 "boot.py 무한 반복에 막혔을 때 Ctrl-C 반복으로 되찾기").
 * 화면(src/lab/modules/real-board/)과 실습실 실행 대상(board-run-target.ts)이 이 객체 하나를 함께 쓴다. DOM을 쓰지 않아 Node 테스트가 모의 시리얼로 검사한다.
 *
 * 상태
 *   unsupported   이 브라우저에 Web Serial(navigator.serial)이 없음
 *   idle          연결 전·[연결 끊기] 뒤
 *   choosing      포트 선택 창이 열려 있음(requestPort — 클릭 같은 사용자 조작 안에서만 된다)
 *   opening       포트를 여는 중(115200bps — MicroPython ESP32 REPL 기본 속도)
 *   checking      Ctrl-C·Enter·Ctrl-B로 MicroPython 배너를 받는 중(raw-repl.ts probe)
 *   ready         MicroPython 확인 — [실행]·[보드에 저장]을 보낼 수 있음
 *   running       코드 실행 중([정지] = Ctrl-C, input() 글 보내기 = sendInput)
 *   writing       보드 파일을 쓰는 중([보드에 저장] — task.kind save, [boot.py 끄기] — task.kind disable-autorun)
 *   recovering    [보드 되찾기] 중(recoveryStage: interrupt → reset → press-button)
 *   no-micropython 대답이 없거나 MicroPython이 아님 → [펌웨어 굽기] 안내(판별 결과는 verdict)
 *   busy          보드 프로그램이 Ctrl-C에도 멈추지 않음 → [보드 되찾기]·[보드 다시 시작]·EN 버튼 안내
 *   lost          USB 선이 빠짐(Web Serial NetworkError·disconnect 이벤트) → 다시 꽂고 [다시 연결]
 *   error         포트를 열지 못함(다른 프로그램이 쓰는 중)·선택 창을 열 수 없음·약속 어긋남(problem)
 * 포트 선택 창은 거르지 않는다(filters 없음 — CH340 말고 CH9102·CP210x 보드도 보이게, PLAN P3-10 "VID·PID는 보조 정보로만").
 * 연결을 끊을 때는 RTS를 먼저, DTR을 나중에 내린다 — Windows에서 DTR이 먼저 내려가면 자동 리셋 회로가 보드를 리셋할 수 있다
 * (MicroPython tools/mpremote transport_serial.py close()의 "ESP Windows quirk" 주석, 2026-09-17 확인).
 *
 * [보드 되찾기](recover — 머리말 근거는 board-recovery.ts)
 *   1. interrupt: 리셋 없이 Ctrl-C를 짧은 간격으로 되풀이(맨 except로 KeyboardInterrupt를 삼키는 반복도 try 바깥에 떨어지면 멈춘다)
 *   2. reset: RTS로 보드를 다시 켜면서 계속 되풀이(반복에 들어가기 전의 import·첫 sleep에서 멈추게) — 자동 리셋 회로가 있는 개발 보드
 *   3. press-button: 보드의 EN(RST) 버튼을 눌러 달라고 안내하며 계속 되풀이(자동 리셋 회로가 없거나 RTS가 듣지 않는 보드)
 *   되찾으면 판별(Ctrl-B 배너)로 ready. 멈춘 트레이스백이 boot.py·main.py 것이면 autorun으로 알려 [boot.py 끄기](이름 바꾸기)를 보인다.
 */
import { compareWithSiteFirmware, isEsp32Machine, type MicroPythonBanner, type ProbeVerdict } from './banner.ts';
import {
  BoardFileError,
  BoardSaveCancelled,
  planBoardSave,
  saveFilesToBoard,
  type BoardOverwriteRequest,
  type BoardSaveProgress,
  type BoardSaveResult,
} from './board-files.ts';
import { disableAutorunCommand, parseRenamed, type AutorunFile } from './board-recovery.ts';
import {
  BoardBusyError,
  BoardDisconnectedError,
  BoardInUseError,
  BoardNoMicroPythonError,
  BoardNotConnectedError,
  BoardProtocolError,
  ReplStoppedError,
  SerialClosedError,
  SerialTimeoutError,
  errorMessage,
  errorName,
} from './errors.ts';
import { MicroPythonRepl, type ExecHandlers, type ExecOptions, type ExecResult, type ExecStage, type ReplTiming } from './raw-repl.ts';
import { SerialChannel, type SerialLike, type SerialPortLike } from './serial-channel.ts';
import { navigatorSerial } from './support.ts';
import { describePortInfo, type PortDescription } from './usb-chips.ts';
import type { BoardLibrary } from '../esp32/board-libraries.ts';

export type BoardConnectionState =
  | 'unsupported'
  | 'idle'
  | 'choosing'
  | 'opening'
  | 'checking'
  | 'ready'
  | 'running'
  | 'writing'
  | 'recovering'
  | 'no-micropython'
  | 'busy'
  | 'lost'
  | 'error';

export type ConnectionProblemCode =
  /** 포트 선택 창을 닫았거나 고른 포트가 없음(NotFoundError) */
  | 'not-selected'
  /** 선택 창을 열 수 없음(SecurityError — 클릭 밖·차시 안 작은 실습실(iframe)·브라우저 정책) */
  | 'security'
  /** 포트를 열지 못함(NetworkError·InvalidStateError — 다른 프로그램이나 다른 탭이 쓰는 중) */
  | 'port-in-use'
  /** 그 밖의 여는 오류 */
  | 'open-failed'
  /** 연결이 끊김 */
  | 'lost'
  /** raw REPL 약속과 다른 글이 옴 */
  | 'protocol'
  /** Web Serial이 없음 */
  | 'unsupported'
  /** [보드 되찾기]를 끝까지 했지만 프롬프트를 되찾지 못함 */
  | 'recover-failed';

export interface ConnectionProblem {
  readonly code: ConnectionProblemCode;
  /** 브라우저가 준 원문(기록용 — 화면 글은 한국어로 따로 만든다) */
  readonly detail: string;
}

/** [보드 되찾기] 단계 */
export type RecoveryStage = 'interrupt' | 'reset' | 'press-button';

/** 보드가 켜질 때 저절로 도는 파일에 대해 알게 된 것 */
export interface AutorunInfo {
  readonly file: AutorunFile;
  /**
   * true = Ctrl-C를 삼켜 [보드 되찾기]로만 멈췄음(그대로 두면 다시 막힌다),
   * false = 끝나지 않는 반복이지만 Ctrl-C로 멈춤(교과서처럼 전원만 넣으면 돌게 일부러 저장한 코드일 수 있다)
   */
  readonly stuck: boolean;
  /** [끄기]로 바꾼 새 이름(아직이면 null) */
  readonly disabledAs: string | null;
}

export type BoardTask =
  | { readonly kind: 'save'; readonly progress: BoardSaveProgress | null }
  | { readonly kind: 'disable-autorun'; readonly file: AutorunFile };

/** 마지막 [보드에 저장] 결과 */
export type BoardSaveReport =
  | { readonly ok: true; readonly result: BoardSaveResult }
  | { readonly ok: false; readonly error: { readonly name: string; readonly code: string | null; readonly path: string | null; readonly message: string } };

export interface BoardConnectionSnapshot {
  readonly state: BoardConnectionState;
  /** 지금(또는 마지막으로) 연 포트 */
  readonly port: PortDescription | null;
  readonly banner: MicroPythonBanner | null;
  readonly verdict: ProbeVerdict | null;
  /** 보드 펌웨어와 사이트 기준판(v1.29.0) 비교 */
  readonly firmware: 'same' | 'older' | 'newer' | 'unknown' | null;
  /** 배너의 보드 이름에 ESP32가 있는지(모르면 null) */
  readonly esp32: boolean | null;
  readonly problem: ConnectionProblem | null;
  /** 끊긴 뒤 같은 포트가 다시 꽂힘(선택 창 없이 [다시 연결]할 수 있음) */
  readonly replugged: boolean;
  /** 지난번에 연 포트가 있음([다시 연결]) */
  readonly hasLastPort: boolean;
  readonly runStage: ExecStage | null;
  /** 파일 쓰기 중인 일(state writing) */
  readonly task?: BoardTask | null;
  /** 마지막 [보드에 저장] 결과(이 연결에서) */
  readonly lastSave?: BoardSaveReport | null;
  /** 켜질 때 도는 파일(boot.py·main.py)에 대해 알게 된 것(이 연결에서) */
  readonly autorun?: AutorunInfo | null;
  /** [보드 되찾기] 단계(state recovering) */
  readonly recoveryStage?: RecoveryStage | null;
}

export interface BoardConnectionOptions {
  /** navigator.serial 대신 쓸 것(테스트). 적지 않으면 navigator.serial, null이면 지원하지 않는 브라우저로 본다 */
  readonly serial?: SerialLike | null;
  readonly baudRate?: number;
  readonly timing?: Partial<ReplTiming>;
}

export interface RunHandlers extends ExecHandlers {
  /** 코드를 보내기 전에(소프트 리셋 앞) 할 도구 명령 — 라이브러리 갖추기(board-run-target.ts) */
  readonly prepare?: ExecOptions['prepare'];
}

export interface SaveOptions {
  /** 사이트 보드 라이브러리 전체(코드가 부르는 것만 함께 올린다 — board-library-files.ts BOARD_LIBRARIES) */
  readonly libraries?: readonly BoardLibrary[];
  /** main.py가 input()을 기다리는 코드인지(저장 결과 안내용) */
  readonly usesInput?: boolean;
  /**
   * 보드에 이미 있는 **다른 내용의** 파일을 바꿔 쓰기 직전에 부른다. false를 돌려주면 그 파일부터 저장을 멈춘다(BoardSaveCancelled).
   * 화면이 확인 창을 띄우는 자리다(2026-09-18 검토 반영 — main.py를 확인 없이 덮어썼고 되돌릴 방법이 없었다).
   */
  readonly confirmOverwrite?: (request: BoardOverwriteRequest) => boolean | Promise<boolean>;
}

export const DEFAULT_BAUD_RATE = 115200;
/**
 * 읽기·쓰기 버퍼(바이트). 명세 기본값 255는 115200bps(초당 약 11.5KB)에서 화면이 잠깐 바쁠 때(편집칸·보드 그림 그리기) 넘치기 쉬워 넉넉히 둔다
 * (넘치면 BufferOverrunError로 바이트를 잃고, 읽기 반복은 이어진다 — serial-channel.ts). raw-paste 흐름 제어는 규약 단계라 이 값과 상관없다.
 */
export const DEFAULT_BUFFER_SIZE = 4096;

type Listener = (snapshot: BoardConnectionSnapshot) => void;

interface PortWithConnected extends SerialPortLike {
  readonly connected?: boolean;
}

function sameUsbDevice(a: SerialPortInfo | null, b: SerialPortInfo | null): boolean {
  return Boolean(a && b && typeof a.usbVendorId === 'number' && a.usbVendorId === b.usbVendorId && a.usbProductId === b.usbProductId);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class BoardConnection {
  readonly #serial: SerialLike | null;
  readonly #baudRate: number;
  readonly #timing: Partial<ReplTiming>;
  readonly #listeners = new Set<Listener>();
  #state: BoardConnectionState;
  #port: SerialPortLike | null = null;
  #portInfo: SerialPortInfo | null = null;
  #channel: SerialChannel | null = null;
  #repl: MicroPythonRepl | null = null;
  #banner: MicroPythonBanner | null = null;
  #verdict: ProbeVerdict | null = null;
  #problem: ConnectionProblem | null = null;
  #replugged = false;
  #runStage: ExecStage | null = null;
  #task: BoardTask | null = null;
  #lastSave: BoardSaveReport | null = null;
  #autorun: AutorunInfo | null = null;
  #recoveryStage: RecoveryStage | null = null;
  #closing: Promise<void> = Promise.resolve();
  #dtr = true;
  readonly #onSerialConnect = (event: Event) => this.#handlePlug(event);
  readonly #onSerialDisconnect = (event: Event) => this.#handleUnplug(event);
  #disposed = false;

  constructor(options: BoardConnectionOptions = {}) {
    this.#serial = options.serial === undefined ? (navigatorSerial() as SerialLike | null) : options.serial;
    this.#baudRate = options.baudRate ?? DEFAULT_BAUD_RATE;
    this.#timing = options.timing ?? {};
    this.#state = this.#serial ? 'idle' : 'unsupported';
    if (!this.#serial) {
      this.#problem = { code: 'unsupported', detail: 'navigator.serial is not available' };
    }
    this.#serial?.addEventListener('connect', this.#onSerialConnect);
    this.#serial?.addEventListener('disconnect', this.#onSerialDisconnect);
  }

  get supported(): boolean {
    return this.#serial !== null;
  }

  get state(): BoardConnectionState {
    return this.#state;
  }

  get snapshot(): BoardConnectionSnapshot {
    const banner = this.#banner;
    return Object.freeze({
      state: this.#state,
      port: this.#portInfo ? describePortInfo(this.#portInfo) : null,
      banner,
      verdict: this.#verdict,
      firmware: banner ? compareWithSiteFirmware(banner.version) : null,
      esp32: banner ? isEsp32Machine(banner.machine) : null,
      problem: this.#problem,
      replugged: this.#replugged,
      hasLastPort: this.#port !== null,
      runStage: this.#runStage,
      task: this.#task,
      lastSave: this.#lastSave,
      autorun: this.#autorun,
      recoveryStage: this.#recoveryStage,
    });
  }

  /** 상태가 바뀔 때마다 부른다. 해제 함수를 돌려준다 */
  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** 보드에 명령을 보낼 수 있는 연결이 열려 있는지(ready·busy·no-micropython·error 중 포트가 열린 경우) */
  get isOpen(): boolean {
    return this.#channel?.isOpen === true;
  }

  /** [보드 연결]: 포트 선택 창 → 열기 → MicroPython 판별. 클릭 처리기 안에서 곧바로 부른다(await 전에 requestPort) */
  async connect(): Promise<BoardConnectionSnapshot> {
    const serial = this.#serial;
    if (!serial) {
      this.#set('unsupported', { problem: { code: 'unsupported', detail: 'navigator.serial is not available' } });
      return this.snapshot;
    }
    if (this.#isBusyState()) {
      return this.snapshot;
    }
    const previous = this.#state;
    this.#set('choosing', { problem: null });
    let port: SerialPortLike;
    try {
      port = await serial.requestPort();
    } catch (error) {
      const name = errorName(error);
      if (name === 'NotFoundError') {
        // 선택 창을 닫음: 열려 있던 연결은 그대로 두고(이전 상태로), 없으면 연결 전(끊겼던 보드면 끊김 그대로)
        const back: BoardConnectionState = this.#channel?.isOpen ? previous : previous === 'lost' ? 'lost' : 'idle';
        this.#set(back, { problem: { code: 'not-selected', detail: errorMessage(error) } });
        return this.snapshot;
      }
      this.#set('error', { problem: { code: name === 'SecurityError' ? 'security' : 'open-failed', detail: `${name}: ${errorMessage(error)}` } });
      return this.snapshot;
    }
    if (port === this.#port && this.#channel?.isOpen) {
      return this.check();
    }
    return this.openPort(port);
  }

  /** [다시 연결]: 지난 포트가 허락된 채 꽂혀 있으면 선택 창 없이 열고, 없으면 선택 창 */
  async reconnect(): Promise<BoardConnectionSnapshot> {
    const serial = this.#serial;
    if (!serial) {
      return this.connect();
    }
    if (this.#isBusyState()) {
      return this.snapshot;
    }
    const lastPort = this.#port;
    const lastInfo = this.#portInfo;
    let candidate: SerialPortLike | null = null;
    if (lastPort) {
      try {
        const ports = (await serial.getPorts()) as PortWithConnected[];
        const same = ports.find((port) => port === lastPort);
        const byInfo = ports.filter((port) => sameUsbDevice(port.getInfo(), lastInfo));
        candidate = same ?? (byInfo.length === 1 ? byInfo[0]! : null);
        if (candidate && (candidate as PortWithConnected).connected === false) {
          candidate = null;
        }
      } catch {
        candidate = null;
      }
    }
    if (!candidate) {
      return this.connect();
    }
    return this.openPort(candidate);
  }

  /** 이미 고른 포트를 연다(선택 창 없이) */
  async openPort(port: SerialPortLike): Promise<BoardConnectionSnapshot> {
    if (this.#isBusyState() && this.#state !== 'choosing') {
      return this.snapshot;
    }
    await this.#closeChannel({ courtesy: port !== this.#port });
    await this.#closing;
    this.#port = port;
    this.#portInfo = safeInfo(port);
    this.#banner = null;
    this.#verdict = null;
    this.#replugged = false;
    this.#lastSave = null;
    this.#autorun = null;
    this.#set('opening', { problem: null });
    let channel: SerialChannel;
    try {
      channel = await SerialChannel.open(port, { baudRate: this.#baudRate, bufferSize: DEFAULT_BUFFER_SIZE });
    } catch (error) {
      const name = errorName(error);
      const code: ConnectionProblemCode = name === 'NetworkError' || name === 'InvalidStateError' ? 'port-in-use' : 'open-failed';
      this.#set('error', { problem: { code, detail: `${name}: ${errorMessage(error)}` } });
      return this.snapshot;
    }
    if (this.#disposed) {
      await channel.close();
      return this.snapshot;
    }
    this.#channel = channel;
    this.#dtr = true;
    this.#repl = new MicroPythonRepl(channel, this.#timing);
    channel.onEnd((end) => {
      if (end.reason === 'lost' && this.#channel === channel) {
        this.#markLost(end.error);
      }
    });
    return this.check();
  }

  /** [다시 확인]: 열린 포트에서 MicroPython을 다시 판별한다 */
  async check(): Promise<BoardConnectionSnapshot> {
    const repl = this.#repl;
    const channel = this.#channel;
    if (!repl || !channel?.isOpen) {
      return this.snapshot;
    }
    if (this.#state === 'running' || this.#state === 'writing' || repl.isBusy) {
      return this.snapshot;
    }
    this.#set('checking', { problem: null });
    try {
      const result = await repl.probe();
      if (this.#channel !== channel) {
        return this.snapshot;
      }
      this.#verdict = result.verdict;
      if (result.verdict.kind === 'micropython') {
        this.#banner = result.verdict.banner ?? this.#banner;
        this.#set('ready');
      } else {
        this.#banner = null;
        this.#set(result.verdict.kind === 'busy' ? 'busy' : 'no-micropython');
      }
    } catch (error) {
      this.#handleCommandError(channel, error);
    }
    return this.snapshot;
  }

  /**
   * [보드 다시 시작]: 개발 보드의 자동 리셋 회로(RTS → EN)로 보드를 다시 켜고 판별한다. DTR은 내린 채라 IO0가 높아 보통 부팅(다운로드 모드 아님).
   * 순서는 esptool-js 0.6.1 HardReset(RTS 켬 → 100ms → RTS 끔)과 같고, RTS를 바꾼 뒤 DTR을 한 번 더 적는다(esptool-js webserial.js setRTS — Windows usbser.sys 우회).
   * 자동 리셋 회로가 없는 보드는 아무 일도 없다(화면 안내: 보드의 EN 버튼).
   */
  async restartBoard(): Promise<BoardConnectionSnapshot> {
    const channel = this.#channel;
    if (!channel?.isOpen || this.#state === 'running' || this.#state === 'writing' || this.#state === 'recovering' || this.#repl?.isBusy) {
      return this.snapshot;
    }
    this.#set('checking', { problem: null });
    try {
      await this.#pulseReset(channel);
    } catch (error) {
      this.#handleCommandError(channel, error);
      return this.snapshot;
    }
    // 보드가 부팅 글을 보내는 동안 조금 기다렸다가 판별한다(판별이 Ctrl-C를 되풀이하므로 부팅이 길어도 된다)
    await sleep(150);
    return this.check();
  }

  /** 코드 실행(raw REPL). 출력은 handlers.onStdout. 연결이 없으면 BoardNotConnectedError, MicroPython이 없으면 BoardNoMicroPythonError */
  async run(code: string, handlers: RunHandlers = {}): Promise<ExecResult> {
    const { repl, channel } = await this.#readyForCommand();
    this.#set('running', { problem: null });
    try {
      const result = await repl.exec(
        code,
        {
          ...(handlers.onStdout ? { onStdout: handlers.onStdout } : {}),
          onStage: (stage) => {
            this.#runStage = stage;
            handlers.onStage?.(stage);
            this.#emit();
          },
        },
        handlers.prepare ? { prepare: handlers.prepare } : {},
      );
      this.#runStage = null;
      this.#noteSoftReset(repl, result.bootInterrupted ?? null);
      if (this.#channel === channel) {
        this.#set(result.stopUnconfirmed ? 'busy' : 'ready');
      }
      return result;
    } catch (error) {
      this.#runStage = null;
      this.#handleCommandError(channel, error);
      throw error;
    }
  }

  /** [정지]: 실행·파일 쓰기 중이면 Ctrl-C(끝날 때까지 되풀이 — raw-repl.ts) */
  stop(): void {
    this.#repl?.requestStop();
  }

  /** 실행 중인 코드의 input()으로 바이트를 보낸다(board-input.ts prepareBoardInputLine의 bytes). 보낼 수 없으면 false */
  sendInput(bytes: Uint8Array): boolean {
    return this.#state === 'running' && this.#repl !== null ? this.#repl.sendInput(bytes) : false;
  }

  /**
   * [보드에 저장]: 소프트 리셋(mpremote처럼) → 코드가 부르는 사이트 라이브러리 → main.py(board-files.ts). 같은 파일은 건너뛴다.
   * 성공·실패 모두 lastSave에 남기고 ready로 돌아온다(연결이 끊기면 lost). 실패는 오류를 그대로 던진다.
   */
  async save(code: string, options: SaveOptions = {}): Promise<BoardSaveResult> {
    const { repl, channel } = await this.#readyForCommand();
    const plan = planBoardSave(code, options.libraries ?? []);
    this.#task = { kind: 'save', progress: null };
    this.#set('writing', { problem: null });
    try {
      const result = await repl.session(
        (tools) =>
          saveFilesToBoard(tools, plan, {
            mainUsesInput: options.usesInput === true,
            ...(options.confirmOverwrite ? { confirmOverwrite: options.confirmOverwrite } : {}),
            onProgress: (progress) => {
              this.#task = { kind: 'save', progress };
              this.#emit();
            },
          }),
        { softReset: true },
      );
      this.#noteSoftReset(repl, repl.lastBootInterrupt);
      this.#lastSave = { ok: true, result };
      this.#task = null;
      if (this.#channel === channel) {
        this.#set('ready');
      }
      return result;
    } catch (error) {
      this.#task = null;
      this.#lastSave = {
        ok: false,
        error: {
          name: errorName(error) || 'Error',
          code: error instanceof BoardFileError ? error.code : null,
          path: error instanceof BoardFileError ? error.path : null,
          message: errorMessage(error),
        },
      };
      if (error instanceof BoardFileError || error instanceof BoardSaveCancelled || error instanceof ReplStoppedError) {
        if (this.#channel === channel) {
          this.#set('ready');
        }
      } else {
        this.#handleCommandError(channel, error);
      }
      throw error;
    }
  }

  /**
   * [boot.py 끄기]·[main.py 끄기]: 켜질 때 도는 파일의 이름을 비어 있는 _off 이름으로 바꾼다(지우지 않음). 소프트 리셋하지 않는다
   * (그 파일이 다시 돌면 안 되므로). 새 이름은 autorun.disabledAs.
   */
  async disableAutorun(file: AutorunFile | null = this.#autorun?.file ?? null): Promise<BoardConnectionSnapshot> {
    if (!file) {
      return this.snapshot;
    }
    const { repl, channel } = await this.#readyForCommand();
    this.#task = { kind: 'disable-autorun', file };
    this.#set('writing', { problem: null });
    try {
      const renamed = await repl.session(async (tools) => {
        const output = await tools.command(disableAutorunCommand(file));
        if (output.error) {
          const missing = /ENOENT|\[Errno 2\]/u.test(output.error.message);
          throw new BoardFileError(
            'board-error',
            file,
            missing ? `보드에 ${file} 파일이 없어요(이미 이름을 바꿨거나 지웠어요).` : `보드의 ${file} 이름을 바꾸지 못했어요: ${output.error.message}`,
            output.error.message,
          );
        }
        const name = parseRenamed(output.stdout);
        if (!name) {
          throw new BoardFileError('protocol', file, `보드의 ${file} 이름을 바꾼 결과를 읽지 못했어요.`, output.stdout.slice(-200));
        }
        return name;
      });
      if (file === 'boot.py') {
        repl.forgetBootLoop();
      }
      this.#autorun = { file, stuck: this.#autorun?.file === file ? this.#autorun.stuck : false, disabledAs: renamed };
      this.#task = null;
      if (this.#channel === channel) {
        this.#set('ready');
      }
    } catch (error) {
      this.#task = null;
      if (error instanceof BoardFileError || error instanceof ReplStoppedError) {
        if (this.#channel === channel) {
          this.#set('ready', { problem: null });
        }
        throw error;
      }
      this.#handleCommandError(channel, error);
      throw error;
    }
    return this.snapshot;
  }

  /** [보드 되찾기]: Ctrl-C 되풀이 → 보드를 다시 켜며 되풀이 → EN 버튼 안내와 되풀이(머리말). 되찾으면 판별해 ready */
  async recover(): Promise<BoardConnectionSnapshot> {
    const repl = this.#repl;
    const channel = this.#channel;
    if (!repl || !channel?.isOpen || this.#isBusyState() || repl.isBusy) {
      return this.snapshot;
    }
    const timing = repl.timing;
    this.#recoveryStage = 'interrupt';
    this.#set('recovering', { problem: null });
    try {
      let result = await repl.interruptUntilPrompt({ durationMs: timing.recoverInterruptMs });
      if (!result.ok && this.#channel === channel) {
        this.#recoveryStage = 'reset';
        this.#emit();
        let pulsed = false;
        try {
          pulsed = await this.#pulseReset(channel);
        } catch (error) {
          if (error instanceof BoardDisconnectedError) {
            throw error;
          }
        }
        if (pulsed) {
          result = await repl.interruptUntilPrompt({ durationMs: timing.recoverAfterResetMs });
        }
      }
      if (!result.ok && this.#channel === channel) {
        this.#recoveryStage = 'press-button';
        this.#emit();
        result = await repl.interruptUntilPrompt({ durationMs: timing.recoverPressButtonMs });
      }
      this.#recoveryStage = null;
      if (this.#channel !== channel) {
        return this.snapshot;
      }
      if (!result.ok) {
        this.#set('busy', { problem: { code: 'recover-failed', detail: result.transcript.slice(-200) } });
        return this.snapshot;
      }
      if (result.interrupted) {
        this.#noteAutorun(result.interrupted, true);
      }
      return this.check();
    } catch (error) {
      this.#recoveryStage = null;
      this.#handleCommandError(channel, error);
      return this.snapshot;
    }
  }

  /** [연결 끊기]: 실행 중이면 멈추고, 보통 REPL로 돌려놓고, RTS → DTR 순서로 내린 뒤 포트를 닫는다 */
  async disconnect(): Promise<BoardConnectionSnapshot> {
    await this.#closeChannel({ courtesy: true });
    await this.#closing;
    this.#banner = null;
    this.#verdict = null;
    this.#replugged = false;
    this.#task = null;
    this.#recoveryStage = null;
    this.#set(this.#serial ? 'idle' : 'unsupported', { problem: this.#serial ? null : this.#problem });
    return this.snapshot;
  }

  /** 페이지를 떠날 때: 듣기를 풀고 포트를 닫는다(기다리지 않음) */
  dispose(): void {
    this.#disposed = true;
    this.#serial?.removeEventListener('connect', this.#onSerialConnect);
    this.#serial?.removeEventListener('disconnect', this.#onSerialDisconnect);
    void this.#closeChannel({ courtesy: false });
    this.#listeners.clear();
  }

  // ───────────── 안쪽 ─────────────

  #isBusyState(): boolean {
    return (
      this.#state === 'choosing' ||
      this.#state === 'opening' ||
      this.#state === 'checking' ||
      this.#state === 'running' ||
      this.#state === 'writing' ||
      this.#state === 'recovering'
    );
  }

  /** 실행·저장처럼 보드에 명령을 보내기 전: 연결·겹침을 확인하고, MicroPython이 없다던 보드는 한 번 더 판별한다 */
  async #readyForCommand(): Promise<{ repl: MicroPythonRepl; channel: SerialChannel }> {
    const repl = this.#repl;
    const channel = this.#channel;
    if (!repl || !channel?.isOpen) {
      throw new BoardNotConnectedError();
    }
    if (this.#isBusyState() || repl.isBusy) {
      throw new BoardInUseError();
    }
    if (this.#state === 'no-micropython') {
      // 펌웨어를 구운 뒤 곧바로 [실행]했을 수 있어 한 번 더 판별한다
      const rechecked = await this.check();
      if (rechecked.state === 'lost') {
        throw new BoardDisconnectedError();
      }
      if (rechecked.state === 'busy') {
        throw new BoardBusyError('');
      }
      if (rechecked.state !== 'ready') {
        throw new BoardNoMicroPythonError();
      }
    }
    return { repl, channel };
  }

  /** 소프트 리셋(실행·저장)을 지난 뒤: boot.py를 멈췄으면 알리고, 제때 끝났으면(고쳐짐) "끝나지 않는 반복" 안내를 지운다 */
  #noteSoftReset(repl: MicroPythonRepl, interrupted: AutorunFile | null): void {
    if (interrupted) {
      this.#noteAutorun(interrupted, false);
      return;
    }
    const autorun = this.#autorun;
    if (autorun && autorun.file === 'boot.py' && !autorun.stuck && !autorun.disabledAs && repl.bootLoopFile === null) {
      this.#autorun = null;
    }
  }

  #noteAutorun(file: AutorunFile, stuck: boolean): void {
    const previous = this.#autorun;
    if (previous && previous.file === file && previous.disabledAs === null) {
      this.#autorun = { file, stuck: previous.stuck || stuck, disabledAs: null };
      return;
    }
    this.#autorun = { file, stuck, disabledAs: null };
  }

  #set(state: BoardConnectionState, changes: { problem?: ConnectionProblem | null } = {}): void {
    this.#state = state;
    if (changes.problem !== undefined) {
      this.#problem = changes.problem;
    }
    this.#emit();
  }

  #emit(): void {
    const snapshot = this.snapshot;
    for (const listener of [...this.#listeners]) {
      try {
        listener(snapshot);
      } catch (error) {
        console.error('실제 보드 상태를 그리다 오류가 났어요.', error);
      }
    }
  }

  #handleCommandError(channel: SerialChannel, error: unknown): void {
    if (this.#channel !== channel) {
      return;
    }
    if (error instanceof BoardDisconnectedError || channel.state === 'lost') {
      this.#markLost(error);
      return;
    }
    if (error instanceof SerialClosedError) {
      return; // 연결 끊기·페이지 떠남이 닫았다
    }
    if (error instanceof BoardFileError || error instanceof ReplStoppedError) {
      // 파일 오류(공간 부족 등)·멈춤은 연결 문제가 아니다 — 보드는 raw 프롬프트에서 다음 명령을 받는다
      this.#set('ready', { problem: null });
      return;
    }
    if (error instanceof BoardBusyError) {
      if (error.autorun) {
        this.#noteAutorun(error.autorun, true);
      }
      this.#set('busy', { problem: null });
      return;
    }
    if (error instanceof BoardProtocolError || error instanceof SerialTimeoutError) {
      this.#set('error', { problem: { code: 'protocol', detail: errorMessage(error) } });
      return;
    }
    if (error instanceof BoardInUseError) {
      return;
    }
    this.#set('error', { problem: { code: 'protocol', detail: `${errorName(error)}: ${errorMessage(error)}` } });
  }

  #markLost(error: unknown): void {
    if (this.#state === 'lost' && this.#channel === null) {
      return;
    }
    const channel = this.#channel;
    this.#channel = null;
    this.#repl = null;
    this.#runStage = null;
    this.#task = null;
    this.#recoveryStage = null;
    this.#replugged = false;
    // 명세: 장치를 잃어도 포트는 opened라 닫아야 다시 열 수 있다 — 기다리던 읽기를 "끊김"으로 끝낸 뒤 잠금을 풀고 닫는다
    if (channel) {
      channel.markLost(error);
      this.#closing = channel.close().catch(() => undefined);
    }
    this.#set('lost', { problem: { code: 'lost', detail: error ? `${errorName(error)}: ${errorMessage(error)}` : 'disconnect' } });
  }

  #handleUnplug(event: Event): void {
    if (this.#port && event.target === this.#port && this.#channel) {
      this.#markLost(null);
    }
  }

  #handlePlug(event: Event): void {
    if (this.#state !== 'lost') {
      return;
    }
    const target = event.target as SerialPortLike | null;
    if (target && (target === this.#port || sameUsbDevice(safeInfo(target), this.#portInfo))) {
      this.#replugged = true;
      this.#emit();
    }
  }

  async #closeChannel(options: { courtesy: boolean }): Promise<void> {
    const channel = this.#channel;
    const repl = this.#repl;
    if (!channel) {
      return;
    }
    this.#channel = null;
    this.#repl = null;
    this.#runStage = null;
    const close = (async () => {
      if (channel.isOpen) {
        if (repl?.isBusy) {
          repl.requestStop();
          await sleep(Math.min(600, repl.timing.stopRetryMs * 2));
        }
        if (options.courtesy && repl && !repl.isBusy) {
          await repl.exitRawRepl();
        }
        try {
          // RTS를 먼저, DTR을 나중에(Windows 자동 리셋 회로 우회 — 머리말)
          await this.#setRts(channel, false);
          await this.#setDtr(channel, false);
        } catch {
          // 끊겼거나 신호를 못 바꾸는 포트
        }
      }
      await channel.close();
    })();
    this.#closing = close.catch(() => undefined);
    await this.#closing;
  }

  /** EN을 RTS로 눌렀다 놓는다(DTR 거짓 — 보통 부팅). 신호를 바꿀 수 없는 포트면 false */
  async #pulseReset(channel: SerialChannel): Promise<boolean> {
    const dtrChanged = await this.#setDtr(channel, false);
    const rtsOn = await this.#setRts(channel, true);
    await sleep(100);
    const rtsOff = await this.#setRts(channel, false);
    return dtrChanged && rtsOn && rtsOff;
  }

  async #setRts(channel: SerialChannel, value: boolean): Promise<boolean> {
    const changed = await channel.setSignals({ requestToSend: value });
    await channel.setSignals({ dataTerminalReady: this.#dtr });
    return changed;
  }

  async #setDtr(channel: SerialChannel, value: boolean): Promise<boolean> {
    this.#dtr = value;
    return channel.setSignals({ dataTerminalReady: value });
  }
}

function safeInfo(port: SerialPortLike): SerialPortInfo | null {
  try {
    return port.getInfo();
  } catch {
    return null;
  }
}
