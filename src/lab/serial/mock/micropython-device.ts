/**
 * 모의 MicroPython ESP32 보드(병렬 제작 준비 2026-09-17, src/lab/README.md 8절) — 실제 보드 연결(P3-07·P3-08)·펌웨어 굽기(P3-09)·
 * 실물 점검 도우미(P3-11)가 실제 보드 없이 테스트하도록 USB 시리얼 너머의 MicroPython REPL을 바이트 단위로 흉내 낸다.
 *
 * 근거(2026-09-17 확인): MicroPython docs/reference/repl.rst("Raw mode and raw-paste mode")와 소스 shared/runtime/pyexec.c
 * (mp_reader_new_stdin·do_reader_stdin·pyexec_raw_repl·parse_compile_execute), ports/esp32/main.c, tools/pyboard.py가 쓰는 순서.
 *   보통 REPL(friendly): 배너 "MicroPython v1.29.0 on 2026-08-24; Generic ESP32 module with ESP32\r\nType "help()" for more information.\r\n>>> ",
 *     글자 되울림(echo), Enter(\r) → "\r\n" + 실행 + ">>> ", 콜론으로 끝난 줄은 "... "(빈 줄로 끝), Ctrl-C → "\r\n>>> ",
 *     Ctrl-A → "\r\n" + raw REPL, Ctrl-B → "\r\n" + 배너, Ctrl-D(빈 줄) → "\r\n" + 소프트 리셋,
 *     Ctrl-E → "\r\npaste mode; Ctrl-C to cancel, Ctrl-D to finish\r\n=== "
 *   raw REPL: 들어가면 "raw REPL; CTRL-B to exit\r\n>" · 코드 + Ctrl-D → "OK" + 실행 출력 + "\x04" + (오류 트레이스백) + "\x04" + ">"
 *     · 빈 줄 + Ctrl-D → "OK\r\n" + 소프트 리셋(raw REPL 그대로) · Ctrl-C → 받던 줄 지움 · Ctrl-B → "\r\n" + 보통 REPL 배너
 *   raw-paste: raw REPL에서 "\x05A\x01" → "R\x01" + 창 크기 2바이트(little endian, 버퍼 256의 절반 = 128) + "\x01",
 *     창만큼 받을 때마다 "\x01", 호스트의 Ctrl-D → "\x04"(받음) → 실행 출력 + "\x04" + 오류 + "\x04" + ">".
 *     "\x05" 뒤가 'A'가 아니면 "R\x00" + ">". rawPaste: false면 raw-paste를 모르는 옛 펌웨어처럼 raw REPL을 다시 알린다.
 *   SystemExit(sys.exit())는 트레이스백 없이 끝난다. 실행 중 받은 바이트는(Ctrl-C 제외) 실물의 stdin 버퍼처럼 남았다가 실행이 끝나면 REPL이 읽는다.
 *   소프트 리셋(ESP32): "MPY: soft reboot\r\n" → boot.py → (보통 REPL일 때만) main.py → 배너 또는 raw 프롬프트.
 *   하드 리셋(전원·EN·machine.reset()): ROM 부팅 글(줄임) → (bootDelayMs 동안 받은 바이트는 사라짐) → boot.py → main.py → 배너.
 *   개발 보드 자동 리셋 회로(esptool 방식): EN = !(RTS && !DTR), IO0 = !(DTR && !RTS). EN이 올라온 뒤 bootSampleDelayMs에 IO0가 낮으면
 *     다운로드 모드("rst:0x1 (POWERON_RESET),boot:0x3 (DOWNLOAD_BOOT(UART0/UART1/SDIO_REI_REO_V2))\r\nwaiting for download\r\n").
 *     다운로드 모드에서 받은 바이트는 setBootloaderHandler로 붙인 처리기가 받는다(없으면 응답 없음 — ROM 부트로더 규약은 흉내 내지 않는다).
 * 흉내 내지 않는 것: 보통 REPL의 자동 들여쓰기·탭 완성·기록, raw-paste 중 구문 오류로 일찍 끝내기(코드를 다 받은 뒤 검사), 실제 부팅 글 전체.
 * 코드 "실행"은 scripts(테스트가 정한 응답) → mini-python.ts(작은 부분집합) 순서로 한다. 실물 결과의 증거가 아니다(실물은 부록 B-2).
 * 테스트 도구다(배포 번들에 들어가지 않음).
 */
import { CTRL_A, CTRL_B, CTRL_C, CTRL_D, CTRL_E, cooked, fromLatin1, toBytes, utf8 } from './bytes.ts';
import type { SerialDevice, SerialDeviceIO, SerialLineSignals } from './device.ts';
import { MockFileSystem } from './mock-fs.ts';
import { Interpreter, PyException, ResetSignal, formatTraceback, parseMiniPython, pyRepr, type MiniPythonHost } from './mini-python.ts';

/** 프로그램이 쓰는 도구(scripts의 run) */
export interface ProgramContext {
  /** 글 출력(\n → \r\n) */
  print(text: string): void;
  /** 바이트·글 그대로 출력 */
  write(data: Uint8Array | string): void;
  /** input() — 호스트가 한 줄을 보낼 때까지(되울림 포함). Ctrl-C면 KeyboardInterrupt PyException */
  input(prompt?: string): Promise<string>;
  /** 기다리기. Ctrl-C면 KeyboardInterrupt PyException */
  sleep(ms: number): Promise<void>;
  readonly files: MockFileSystem;
  readonly device: MicroPythonDevice;
}

/** 받은 코드가 맞으면 mini-python 대신 도는 응답(테스트가 정함). JSON으로 넘길 수 있는 칸만 쓰면 브라우저 설정(__APC_SERIAL_MOCK_CONFIG__)에도 된다 */
export interface MockScript {
  /** 코드 전체에 맞출 정규식 글자(또는 RegExp·함수 — 함수는 Node 테스트·페이지 안 evaluate에서만) */
  readonly match: string | RegExp | ((code: string) => boolean);
  readonly flags?: string;
  /** 출력할 글(\n → \r\n) */
  readonly output?: string;
  /** 오류로 끝낼 때 트레이스백 마지막 줄(예: "OSError: [Errno 19] ENODEV") */
  readonly error?: string;
  /** 출력한 뒤 기다리는 밀리초(그 사이 Ctrl-C면 KeyboardInterrupt) */
  readonly delayMs?: number;
  /** true면 출력한 뒤 Ctrl-C가 올 때까지 끝나지 않는다(끝없는 반복) */
  readonly untilInterrupt?: boolean;
  /** 자유로운 동작(Node 테스트·페이지 안 evaluate에서만) */
  run?(context: ProgramContext, code: string): Promise<void> | void;
}

/** 다운로드 모드에서 받은 바이트 처리기(ROM 부트로더 흉내 — 펌웨어 굽기 구역이 테스트 도구로 붙인다) */
export type BootloaderHandler = (bytes: Uint8Array, io: SerialDeviceIO, device: MicroPythonDevice) => void;

export interface MicroPythonDeviceOptions {
  /** 기본 v1.29.0 */
  readonly version?: string;
  /** 기본 2026-08-24(ESP32_GENERIC-20260824-v1.29.0.bin) */
  readonly buildDate?: string;
  /** 기본 "Generic ESP32 module with ESP32" */
  readonly machine?: string;
  /** 처음 파일(boot.py·main.py·lib/…) */
  readonly files?: Readonly<Record<string, string>>;
  /** raw-paste 지원(기본 true — v1.13 이후) */
  readonly rawPaste?: boolean;
  /** raw-paste 버퍼 크기(기본 256 = MICROPY_REPL_STDIN_BUFFER_MAX → 창 128) */
  readonly rawPasteBufferMax?: number;
  readonly scripts?: readonly MockScript[];
  /** mini-python이 모르는 문장: 'error'(기본, NotImplementedError) | 'ignore' */
  readonly unknownStatement?: 'error' | 'ignore';
  /** 기다리는 시간 배율(기본 1, 0.01이면 100배 빠르게) */
  readonly timeScale?: number;
  /** 하드 리셋 때 ROM 부팅 글(기본 true) */
  readonly romBootLog?: boolean;
  /** 하드 리셋 뒤 MicroPython이 뜨기까지 밀리초(기본 0 — 실물은 1초 안팎). 이 동안 받은 바이트는 실물처럼 사라진다 */
  readonly bootDelayMs?: number;
  /** DTR·RTS 자동 리셋 회로(기본 true) */
  readonly autoResetCircuit?: boolean;
  /** EN이 올라온 뒤 IO0를 읽기까지 밀리초(실물 RC 지연 흉내, 기본 10) */
  readonly bootSampleDelayMs?: number;
  /** 다운로드 모드에서 받은 바이트(Node 테스트에서만 — 브라우저는 setBootloaderHandler) */
  readonly onBootloader?: BootloaderHandler;
}

export type MicroPythonMode = 'off' | 'reset-held' | 'booting' | 'friendly' | 'paste' | 'raw' | 'raw-paste' | 'running' | 'bootloader';

export type ExecutedVia = 'friendly' | 'paste' | 'raw' | 'raw-paste' | 'boot.py' | 'main.py';

const ROM_BOOT_LOG = 'ets Jul 29 2019 12:21:46\r\n\r\nrst:0x1 (POWERON_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)\r\n';
const ROM_SOFTWARE_RESET_LOG = 'ets Jul 29 2019 12:21:46\r\n\r\nrst:0xc (SW_CPU_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)\r\n';
const ROM_DOWNLOAD_LOG = 'ets Jul 29 2019 12:21:46\r\n\r\nrst:0x1 (POWERON_RESET),boot:0x3 (DOWNLOAD_BOOT(UART0/UART1/SDIO_REI_REO_V2))\r\nwaiting for download\r\n';
const RAW_REPL_BANNER = 'raw REPL; CTRL-B to exit\r\n>';

interface Waiter {
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
}

export class MicroPythonDevice implements SerialDevice {
  readonly files: MockFileSystem;
  readonly options: MicroPythonDeviceOptions;
  /** 코드가 Pin으로 쓴 값(machine.Pin — GPIO → 0·1) */
  readonly pins = new Map<number, number>();
  /** 실행한 코드 기록(보통 REPL 줄·붙여넣기·raw·raw-paste·boot.py·main.py) */
  readonly executed: { readonly via: ExecutedVia; readonly code: string }[] = [];
  /** raw-paste에서 호스트가 받을 수 있다고 알린 양보다 많이 보낸 바이트 수(흐름 제어를 어겼는지) */
  flowControlOverrun = 0;
  /** 하드 리셋(전원·EN·machine.reset()·다운로드 모드 진입) 횟수·소프트 리셋 횟수 */
  hardResets = 0;
  softResets = 0;

  private io: SerialDeviceIO | null = null;
  private modeValue: MicroPythonMode = 'off';
  private replKind: 'friendly' | 'raw' = 'friendly';
  private interpreter: Interpreter;
  private bootTime = Date.now();
  private generation = 0;
  private scripts: MockScript[];
  private bootloaderHandler: BootloaderHandler | null;

  // 보통 REPL
  private lineBytes: number[] = [];
  private continuation: string[] = [];
  private escape = 0;
  // 붙여넣기·raw
  private paste: number[] = [];
  private raw: number[] = [];
  private rawPasteData: number[] = [];
  private readonly windowMax: number;
  private windowRemain = 0;
  private hostWindow = 0;
  // 실행 중 입력
  private interruptPending = false;
  /** 실행 중에 받은 바이트(실물 stdin 링버퍼 — 실행이 끝나면 REPL이 읽는다) */
  private stdin: number[] = [];
  private inputWaiter: { resolve: (line: string) => void; reject: (error: unknown) => void; buffer: number[] } | null = null;
  private lastInputEnd = 0;
  private readonly sleepers = new Set<Waiter>();
  // 부팅·선 신호
  private romBooting = false;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private enHigh = true;
  private dtr = false;
  private rts = false;
  private bootTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: MicroPythonDeviceOptions = {}) {
    this.options = options;
    this.files = new MockFileSystem(options.files ?? {});
    this.scripts = [...(options.scripts ?? [])];
    this.bootloaderHandler = options.onBootloader ?? null;
    this.interpreter = this.createInterpreter();
    this.windowMax = Math.max(1, Math.floor((options.rawPasteBufferMax ?? 256) / 2));
  }

  get mode(): MicroPythonMode {
    return this.modeValue;
  }

  get banner(): string {
    const version = this.options.version ?? 'v1.29.0';
    const date = this.options.buildDate ?? '2026-08-24';
    const machine = this.options.machine ?? 'Generic ESP32 module with ESP32';
    return `MicroPython ${version} on ${date}; ${machine}\r\nType "help()" for more information.\r\n`;
  }

  /** 테스트가 응답을 더한다(앞에 더한 것이 먼저 맞춰진다) */
  addScript(script: MockScript): void {
    this.scripts.push(script);
  }

  clearScripts(): void {
    this.scripts = [];
  }

  /** 다운로드 모드에서 받은 바이트 처리기(null이면 응답 없음) */
  setBootloaderHandler(handler: BootloaderHandler | null): void {
    this.bootloaderHandler = handler;
  }

  // ───────────── 포트와 연결 ─────────────

  /** USB 전원이 들어온다(포트에 붙을 때·다시 꽂을 때) */
  attach(io: SerialDeviceIO): void {
    this.io = io;
    this.enHigh = true;
    this.dtr = false;
    this.rts = false;
    void this.hardReset('power');
  }

  /** USB 선이 빠져 전원이 꺼진다 */
  detach(): void {
    this.resetState();
    this.clearTimers();
    this.modeValue = 'off';
    this.io = null;
  }

  opened(): void {}

  closed(): void {}

  inputSignals(): SerialInputSignals {
    return { dataCarrierDetect: false, clearToSend: false, ringIndicator: false, dataSetReady: false };
  }

  // ───────────── 출력 ─────────────

  private emit(data: string | Uint8Array): void {
    if (this.modeValue === 'off' || this.modeValue === 'reset-held') {
      return;
    }
    this.io?.emit(typeof data === 'string' ? toBytes(data) : data);
  }

  /** 테스트가 장치 쪽에서 바로 바이트를 보낼 때(모드와 상관없이) */
  send(data: string | Uint8Array): void {
    this.io?.emit(typeof data === 'string' ? toBytes(data) : data);
  }

  // ───────────── 리셋 ─────────────

  private createInterpreter(): Interpreter {
    const host: MiniPythonHost = {
      write: (text) => this.emit(cooked(text)),
      input: (prompt) => this.readInputLine(prompt),
      sleepMs: (ms) => this.sleep(ms),
      poll: () => this.poll(),
      ticksMs: () => Date.now() - this.bootTime,
      files: this.files,
      pinWrite: (gpio, value) => {
        this.pins.set(gpio, value);
      },
      unknownStatement: this.options.unknownStatement ?? 'error',
      version: this.options.version ?? 'v1.29.0',
      machine: this.options.machine ?? 'Generic ESP32 module with ESP32',
    };
    return new Interpreter(host);
  }

  private later(callback: () => void, ms: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      callback();
    }, ms);
    this.timers.add(timer);
  }

  private clearTimers(): void {
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();
    if (this.bootTimer) {
      clearTimeout(this.bootTimer);
      this.bootTimer = null;
    }
  }

  private abortWaiters(): void {
    const error = new PyException('KeyboardInterrupt', '');
    for (const sleeper of [...this.sleepers]) {
      sleeper.reject(error);
    }
    this.sleepers.clear();
    if (this.inputWaiter) {
      this.inputWaiter.reject(error);
      this.inputWaiter = null;
    }
  }

  private resetState(): void {
    this.generation += 1;
    this.abortWaiters();
    this.lineBytes = [];
    this.continuation = [];
    this.escape = 0;
    this.paste = [];
    this.raw = [];
    this.rawPasteData = [];
    this.stdin = [];
    this.interruptPending = false;
    this.romBooting = false;
    this.pins.clear();
    this.interpreter = this.createInterpreter();
  }

  /** 하드 리셋(전원·EN 핀·machine.reset()): ROM 부팅 글 → boot.py → main.py → 보통 REPL 배너 */
  async hardReset(cause: 'power' | 'pin' | 'software' = 'pin'): Promise<void> {
    this.resetState();
    this.clearTimers();
    this.hardResets += 1;
    this.bootTime = Date.now();
    this.replKind = 'friendly';
    this.modeValue = 'booting';
    if (this.options.romBootLog !== false) {
      this.emit(cause === 'software' ? ROM_SOFTWARE_RESET_LOG : ROM_BOOT_LOG);
    }
    const generation = this.generation;
    const delay = Math.max(0, this.options.bootDelayMs ?? 0);
    if (delay > 0) {
      this.romBooting = true;
      await new Promise<void>((resolve) => this.later(resolve, delay));
      if (generation !== this.generation) {
        return;
      }
      this.romBooting = false;
    }
    await this.startScripts(generation);
  }

  /** 소프트 리셋(Ctrl-D·machine.soft_reset()): "MPY: soft reboot" → boot.py → (보통 REPL이면) main.py → 프롬프트 */
  async softReset(): Promise<void> {
    const kind = this.replKind;
    this.resetState();
    this.softResets += 1;
    this.modeValue = 'booting';
    this.emit('MPY: soft reboot\r\n');
    this.replKind = kind;
    await this.startScripts(this.generation);
  }

  private async startScripts(generation: number): Promise<void> {
    let bootOk = true;
    const boot = this.files.readText('boot.py');
    if (boot !== null) {
      bootOk = await this.execute(boot, 'boot.py', generation);
    }
    if (generation !== this.generation) {
      return;
    }
    const main = this.files.readText('main.py');
    if (this.replKind === 'friendly' && bootOk && main !== null) {
      await this.execute(main, 'main.py', generation);
    }
    if (generation !== this.generation) {
      return;
    }
    this.enterRepl();
  }

  private enterRepl(): void {
    if (this.replKind === 'raw') {
      this.modeValue = 'raw';
      this.raw = [];
      this.emit(RAW_REPL_BANNER);
    } else {
      this.modeValue = 'friendly';
      this.lineBytes = [];
      this.continuation = [];
      this.emit(`${this.banner}>>> `);
    }
    this.replayStdin();
  }

  /** 실행 중에 받아 둔 바이트를 지금 모드에서 읽는다(실물 REPL이 stdin 버퍼를 읽는 것과 같다) */
  private replayStdin(): void {
    if (this.stdin.length === 0 || this.modeValue === 'running' || this.modeValue === 'booting') {
      return;
    }
    const pending = this.stdin.splice(0);
    for (const byte of pending) {
      this.receiveByte(byte);
    }
  }

  // ───────────── 기다리기·입력 ─────────────

  private sleep(ms: number): Promise<void> {
    if (this.interruptPending) {
      this.interruptPending = false;
      return Promise.reject(new PyException('KeyboardInterrupt', ''));
    }
    const scaled = Math.max(0, ms * (this.options.timeScale ?? 1));
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.sleepers.delete(waiter);
        resolve();
      }, scaled);
      const waiter: Waiter = {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      };
      this.sleepers.add(waiter);
    });
  }

  private async poll(): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (this.interruptPending) {
      this.interruptPending = false;
      throw new PyException('KeyboardInterrupt', '');
    }
  }

  private readInputLine(prompt: string): Promise<string> {
    if (prompt) {
      this.emit(cooked(prompt));
    }
    if (this.interruptPending) {
      this.interruptPending = false;
      return Promise.reject(new PyException('KeyboardInterrupt', ''));
    }
    return new Promise<string>((resolve, reject) => {
      this.inputWaiter = { resolve, reject, buffer: [] };
      // 먼저 받아 둔 입력을 흘려 넣는다(한 줄이 끝나면 나머지는 다시 쌓인다)
      const pending = this.stdin.splice(0);
      for (const byte of pending) {
        this.feedInput(byte);
      }
    });
  }

  /** 실행 중에 받은 바이트: input()을 기다리면 readline(되울림, \r·\n에서 끝), 아니면 stdin 버퍼에 쌓는다 */
  private feedInput(byte: number): void {
    const waiter = this.inputWaiter;
    if (!waiter) {
      this.stdin.push(byte);
      return;
    }
    if (byte === 0x0d || byte === 0x0a) {
      if (byte === 0x0a && waiter.buffer.length === 0 && this.lastInputEnd === 0x0d) {
        this.lastInputEnd = byte;
        return;
      }
      this.lastInputEnd = byte;
      this.emit('\r\n');
      this.inputWaiter = null;
      waiter.resolve(utf8(Uint8Array.from(waiter.buffer)));
      return;
    }
    if (byte === 0x08 || byte === 0x7f) {
      if (waiter.buffer.length > 0) {
        waiter.buffer.pop();
        this.emit('\b \b');
      }
      return;
    }
    /*
     * (P3-11) 실물 readline(v1.29.0 shared/readline/readline.c)은 32~126 글자만 줄에 넣고 되울린다 — 그 밖(0x80 이상의 한글 바이트,
     * 제어 글자)은 버리고 되울리지도 않는다. 그래서 실물 보드에서는 한글 input()이 빈 글자가 된다(사이트가 보내기 전에 걸러 안내).
     * Tab(9)은 자동 완성이라 줄에 들어가지 않는다.
     */
    if (byte < 0x20 || byte > 0x7e) {
      return;
    }
    this.lastInputEnd = 0;
    waiter.buffer.push(byte);
    this.emit(Uint8Array.of(byte));
  }

  // ───────────── 실행 ─────────────

  private findScript(code: string): MockScript | undefined {
    return this.scripts.find((script) => {
      if (typeof script.match === 'function') {
        return script.match(code);
      }
      const pattern = script.match instanceof RegExp ? script.match : new RegExp(script.match, script.flags ?? '');
      pattern.lastIndex = 0;
      return pattern.test(code);
    });
  }

  private context(): ProgramContext {
    return {
      print: (text) => this.emit(cooked(text)),
      write: (data) => this.emit(data),
      input: (prompt = '') => this.readInputLine(prompt),
      sleep: (ms) => this.sleep(ms),
      files: this.files,
      device: this,
    };
  }

  /**
   * 코드를 실행하고 출력한다. 오류면 트레이스백을 내보내고 false. raw 모드의 \x04 구분은 rawFraming일 때 여기서 붙인다.
   * 리셋 신호면 리셋을 시작하고 false(generation이 바뀐다).
   */
  private async execute(code: string, via: ExecutedVia, generation: number, options: { echoExpression?: boolean; rawFraming?: boolean } = {}): Promise<boolean> {
    this.executed.push({ via, code });
    const previousMode = this.modeValue;
    this.modeValue = 'running';
    this.interruptPending = false;
    const filename = via === 'boot.py' || via === 'main.py' ? via : '<stdin>';
    let traceback = '';
    let ok = true;
    try {
      const script = this.findScript(code);
      if (script) {
        await this.runScript(script, code);
      } else {
        const statements = parseMiniPython(code);
        const only = statements.length === 1 ? statements[0] : undefined;
        if (options.echoExpression && only?.kind === 'expr') {
          const value = await this.interpreter.evaluate(only.expr);
          if (value !== null) {
            this.emit(`${pyRepr(value)}\r\n`);
          }
        } else {
          await this.interpreter.run(statements);
        }
      }
    } catch (error) {
      if (generation !== this.generation) {
        return false;
      }
      if (error instanceof ResetSignal) {
        /*
         * (P3-11) 실물 순서: machine.soft_reset()은 raw 모드의 끝 표시 두 개(\x04\x04)를 먼저 보내고 나서 리셋한다
         * (shared/runtime/pyexec.c parse_compile_execute의 EXEC_FLAG_PRINT_EOF 두 자리 → ports/esp32/main.c의 소프트 리셋).
         * 하드 리셋은 보드가 곧바로 다시 켜져 끝 표시를 보내지 못한다 — 호스트는 부팅 글·배너로 알아챈다.
         */
        if (options.rawFraming && error.kind === 'soft') {
          this.emit('\x04\x04');
        }
        void (error.kind === 'hard' ? this.hardReset('software') : this.softReset());
        return false;
      }
      if (error instanceof PyException && error.type === 'SystemExit') {
        /*
         * parse_compile_execute: SystemExit는 트레이스백 없이 끝나고 PYEXEC_FORCED_EXIT를 돌려준다 → raw REPL 고리가 끝나
         * ESP32 main.c가 소프트 리셋한다(Thonny에서 sys.exit()을 하면 "MPY: soft reboot"이 보이는 까닭).
         */
        if (options.rawFraming) {
          this.emit('\x04\x04');
          void this.softReset();
          return false;
        }
        ok = true;
      } else if (error instanceof PyException) {
        ok = false;
        if (error.line === 0) {
          error.line = 1;
        }
        traceback = cooked(formatTraceback(error, filename));
      } else {
        ok = false;
        traceback = cooked(`Traceback (most recent call last):\n  File "${filename}", line 1, in <module>\nRuntimeError: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    }
    if (generation !== this.generation) {
      return false;
    }
    this.modeValue = previousMode === 'running' ? 'friendly' : previousMode;
    if (options.rawFraming) {
      this.emit('\x04');
      if (traceback) {
        this.emit(traceback);
      }
      this.emit('\x04');
    } else if (traceback) {
      this.emit(traceback);
    }
    this.inputWaiter = null;
    return ok;
  }

  private async runScript(script: MockScript, code: string): Promise<void> {
    const context = this.context();
    if (script.output) {
      context.print(script.output);
    }
    if (script.run) {
      await script.run(context, code);
    }
    if (script.delayMs) {
      await this.sleep(script.delayMs);
    }
    if (script.untilInterrupt) {
      for (;;) {
        await this.sleep(50);
      }
    }
    if (script.error) {
      const match = /^([A-Za-z_][\w.]*)(?::\s?([\s\S]*))?$/u.exec(script.error);
      const error = new PyException(match?.[1] ?? 'Exception', match?.[2] ?? '');
      error.line = 1;
      throw error;
    }
  }

  // ───────────── 받은 바이트 ─────────────

  receive(bytes: Uint8Array): void {
    // raw-paste 창: 이 조각을 읽다가 보낸 "\x01"은 호스트가 이 조각을 보낸 뒤에야 볼 수 있으므로, 조각이 끝난 뒤에 몫으로 더한다
    this.receiving = true;
    try {
      for (const byte of bytes) {
        this.receiveByte(byte);
      }
    } finally {
      this.receiving = false;
      this.hostWindow += this.creditLater;
      this.creditLater = 0;
    }
  }

  private receiving = false;
  private creditLater = 0;

  private receiveByte(byte: number): void {
    switch (this.modeValue) {
      case 'off':
      case 'reset-held':
        return;
      case 'bootloader':
        this.bootloaderHandler?.(Uint8Array.of(byte), { emit: (data) => this.send(data) }, this);
        return;
      case 'booting':
        if (this.romBooting) {
          return;
        }
        this.receiveWhileRunning(byte);
        return;
      case 'running':
        this.receiveWhileRunning(byte);
        return;
      case 'friendly':
        this.receiveFriendly(byte);
        return;
      case 'paste':
        this.receivePaste(byte);
        return;
      case 'raw':
        this.receiveRaw(byte);
        return;
      case 'raw-paste':
        this.receiveRawPaste(byte);
        return;
    }
  }

  private receiveWhileRunning(byte: number): void {
    if (byte === CTRL_C) {
      // 실물: 실행 중에는 Ctrl-C가 stdin 버퍼에 들어가지 않고 KeyboardInterrupt를 예약한다
      if (this.sleepers.size > 0 || this.inputWaiter) {
        this.abortWaiters();
      } else {
        this.interruptPending = true;
      }
      return;
    }
    this.feedInput(byte);
  }

  private receiveFriendly(byte: number): void {
    if (this.escape > 0) {
      // ESC [ X — 화살표 키 같은 조합은 버린다
      this.escape = byte === 0x5b && this.escape === 1 ? 2 : 0;
      return;
    }
    switch (byte) {
      case 0x1b:
        this.escape = 1;
        return;
      case CTRL_A:
        this.emit('\r\n');
        this.replKind = 'raw';
        this.modeValue = 'raw';
        this.raw = [];
        this.emit(RAW_REPL_BANNER);
        return;
      case CTRL_B:
        this.emit('\r\n');
        this.lineBytes = [];
        this.continuation = [];
        this.emit(`${this.banner}>>> `);
        return;
      case CTRL_C:
        this.lineBytes = [];
        this.continuation = [];
        this.emit('\r\n>>> ');
        return;
      case CTRL_D:
        if (this.lineBytes.length === 0 && this.continuation.length === 0) {
          this.emit('\r\n');
          void this.softReset();
        }
        return;
      case CTRL_E:
        this.emit('\r\npaste mode; Ctrl-C to cancel, Ctrl-D to finish\r\n=== ');
        this.modeValue = 'paste';
        this.paste = [];
        return;
      case 0x0d: {
        this.emit('\r\n');
        const text = utf8(Uint8Array.from(this.lineBytes));
        this.lineBytes = [];
        this.runFriendlyLine(text);
        return;
      }
      case 0x0a:
        return;
      case 0x08:
      case 0x7f:
        if (this.lineBytes.length > 0) {
          this.lineBytes.pop();
          this.emit('\b \b');
        }
        return;
      default:
        this.lineBytes.push(byte);
        this.emit(Uint8Array.of(byte));
    }
  }

  private runFriendlyLine(text: string): void {
    if (this.continuation.length > 0) {
      if (text.trim() === '') {
        const code = this.continuation.join('\n');
        this.continuation = [];
        this.runFriendlyCode(code, 'friendly');
        return;
      }
      this.continuation.push(text);
      this.emit('... ');
      return;
    }
    if (text.trim() === '') {
      this.emit('>>> ');
      return;
    }
    if (/:\s*(#.*)?$/u.test(text)) {
      this.continuation = [text];
      this.emit('... ');
      return;
    }
    this.runFriendlyCode(text, 'friendly');
  }

  private runFriendlyCode(code: string, via: 'friendly' | 'paste'): void {
    const generation = this.generation;
    void this.execute(code, via, generation, { echoExpression: via === 'friendly' }).then(() => {
      if (generation === this.generation && this.modeValue === 'friendly') {
        this.emit('>>> ');
        this.replayStdin();
      }
    });
  }

  private receivePaste(byte: number): void {
    if (byte === CTRL_C) {
      this.modeValue = 'friendly';
      this.paste = [];
      this.emit('\r\n>>> ');
      return;
    }
    if (byte === CTRL_D) {
      this.emit('\r\n');
      const code = utf8(Uint8Array.from(this.paste)).replace(/\r\n?/gu, '\n');
      this.paste = [];
      this.modeValue = 'friendly';
      this.runFriendlyCode(code, 'paste');
      return;
    }
    if (byte === 0x0d) {
      this.paste.push(0x0a);
      this.emit('\r\n=== ');
      return;
    }
    if (byte === 0x0a) {
      return;
    }
    this.paste.push(byte);
    this.emit(Uint8Array.of(byte));
  }

  private receiveRaw(byte: number): void {
    if (byte === CTRL_A) {
      if (this.raw.length === 2 && this.raw[0] === CTRL_E && this.options.rawPaste !== false) {
        const command = this.raw[1];
        this.raw = [];
        if (command !== 0x41) {
          this.emit(fromLatin1('R\x00'));
          this.emit('>');
          return;
        }
        this.emit(fromLatin1('R\x01'));
        this.emit(Uint8Array.of(this.windowMax & 0xff, (this.windowMax >> 8) & 0xff, 0x01));
        this.windowRemain = this.windowMax;
        // 창 크기 알림 + 첫 \x01 = 호스트는 창 두 개만큼 보낼 수 있다(pyboard.raw_paste_write)
        this.hostWindow = this.windowMax * 2;
        this.rawPasteData = [];
        this.modeValue = 'raw-paste';
        return;
      }
      this.raw = [];
      this.emit(RAW_REPL_BANNER);
      return;
    }
    if (byte === CTRL_B) {
      this.raw = [];
      this.emit('\r\n');
      this.replKind = 'friendly';
      this.modeValue = 'friendly';
      this.lineBytes = [];
      this.continuation = [];
      this.emit(`${this.banner}>>> `);
      return;
    }
    if (byte === CTRL_C) {
      this.raw = [];
      return;
    }
    if (byte === CTRL_D) {
      this.emit('OK');
      const code = utf8(Uint8Array.from(this.raw));
      this.raw = [];
      if (code.length === 0) {
        this.emit('\r\n');
        void this.softReset();
        return;
      }
      this.runRawCode(code, 'raw');
      return;
    }
    this.raw.push(byte);
  }

  private runRawCode(code: string, via: 'raw' | 'raw-paste'): void {
    const generation = this.generation;
    this.modeValue = 'raw';
    void this.execute(code, via, generation, { rawFraming: true }).then(() => {
      if (generation === this.generation && this.modeValue === 'raw') {
        this.emit('>');
        this.replayStdin();
      }
    });
  }

  private receiveRawPaste(byte: number): void {
    if (byte === CTRL_D) {
      this.emit(Uint8Array.of(0x04));
      const code = utf8(Uint8Array.from(this.rawPasteData));
      this.rawPasteData = [];
      this.runRawCode(code, 'raw-paste');
      return;
    }
    if (byte === CTRL_C) {
      // mp_reader_stdin_readbyte: \x04를 보내고 KeyboardInterrupt(트레이스백 없음) → \x04 + 오류 + \x04 + ">"
      this.emit(Uint8Array.of(0x04));
      this.rawPasteData = [];
      this.modeValue = 'raw';
      this.emit('\x04KeyboardInterrupt: \r\n\x04>');
      this.replayStdin();
      return;
    }
    this.rawPasteData.push(byte);
    this.hostWindow -= 1;
    if (this.hostWindow < 0) {
      this.flowControlOverrun += 1;
    }
    this.windowRemain -= 1;
    if (this.windowRemain === 0) {
      this.emit(Uint8Array.of(0x01));
      this.windowRemain = this.windowMax;
      if (this.receiving) {
        this.creditLater += this.windowMax;
      } else {
        this.hostWindow += this.windowMax;
      }
    }
  }

  // ───────────── 선 신호(자동 리셋 회로) ─────────────

  signals(signals: SerialLineSignals): void {
    this.dtr = signals.dataTerminalReady;
    this.rts = signals.requestToSend;
    if (this.options.autoResetCircuit === false || this.modeValue === 'off') {
      return;
    }
    const en = !(this.rts && !this.dtr);
    if (!en && this.enHigh) {
      this.enHigh = false;
      this.clearTimers();
      this.resetState();
      this.modeValue = 'reset-held';
      return;
    }
    if (en && !this.enHigh) {
      this.enHigh = true;
      const delay = Math.max(0, this.options.bootSampleDelayMs ?? 10);
      this.bootTimer = setTimeout(() => {
        this.bootTimer = null;
        if (!this.enHigh || this.modeValue === 'off') {
          return;
        }
        const io0Low = this.dtr && !this.rts;
        if (io0Low) {
          this.resetState();
          this.hardResets += 1;
          this.modeValue = 'bootloader';
          this.emit(ROM_DOWNLOAD_LOG);
        } else {
          void this.hardReset('pin');
        }
      }, delay);
    }
  }
}
