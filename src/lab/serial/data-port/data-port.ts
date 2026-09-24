/**
 * 데이터 포트 연결(P4-05, PLAN §8.4 "USB-UART 변환기 포트를 **두 번째 포트**로 열기").
 *
 * 무엇인가: 교과서 3-1-2 실습은 USB 선이 두 개다.
 *   ① 보드 REPL 포트 — 코드를 보내고 결과를 받는 곳. P3-07의 `BoardConnection`(src/lab/serial/board-connection.ts)이 쓴다.
 *   ② USB-UART 변환기 포트 — **데이터**가 오가는 곳(컴퓨터 → 변환기 → ESP32의 UART2). 이 파일이 쓴다.
 * 둘은 서로 다른 `SerialPort`라 **나란히 열려 있어도 된다**(Web Serial은 포트마다 따로 허락·열기를 한다).
 * 이 파일은 ①을 한 줄도 건드리지 않는다 — 같은 `SerialChannel`(바이트 통로)만 함께 쓴다.
 *
 * 하는 일(이 파일이 전부)
 * - [데이터 포트 연결] → `requestPort()`(클릭 안에서만 됨) → `open({ baudRate })` → 받은 바이트를 듣는다.
 * - 속도 바꾸기(열려 있으면 닫았다 같은 포트를 새 속도로 다시 연다 — Web Serial은 연 뒤에 속도를 못 바꾼다).
 * - 쓰기(브릿지 통로·시험 보내기), 끊기, 선이 빠졌을 때 알림.
 * - 고른 포트가 **보드 REPL 포트**였는지 알아채기: 열 때 `InvalidStateError`(이 페이지가 이미 씀) 또는
 *   받은 글에 MicroPython 자국(port-labels.ts `looksLikeBoardRepl`).
 *
 * Web Serial 근거(2026-09-17·18 WICG 명세 원문 확인, mock 8.1절과 같은 근거)
 * - `requestPort()`는 사용자 조작(클릭) 안에서만 되고, 창을 닫으면 `NotFoundError`, 조작이 없으면 `SecurityError`.
 * - 이미 열린 포트를 다시 열면 `InvalidStateError`, 운영체제가 못 열면 `NetworkError`(다른 프로그램이 쓰는 중).
 * - 선이 빠지면 읽기가 `NetworkError`("The device has been lost.")로 끝나고 포트는 opened 그대로라 `close()`가 된다.
 *
 * 실제 송수신(변환기에 물린 ESP32가 글자를 받는지)은 운영자 확인이다(부록 B-2 8번) — 모의 포트로는 화면 흐름까지만 본다.
 */
import { BYTE_LOG_LIMIT, ByteLog, decodeUtf8, type ByteLogView } from './byte-log.ts';
import { DEFAULT_DATA_PORT_BAUD, normalizeBaud } from './baud-rates.ts';
import { identifyPort, looksLikeBoardRepl, portLabelText, sanitizeLabel, type DataPortIdentity } from './port-labels.ts';
import { errorMessage, errorName } from '../errors.ts';
import { SerialChannel, type SerialLike, type SerialPortLike } from '../serial-channel.ts';
import { navigatorSerial } from '../support.ts';

export type DataPortState =
  /** 이 브라우저에 Web Serial이 없다 */
  | 'unsupported'
  /** 아직 연결하지 않음 */
  | 'idle'
  /** 포트 선택 창이 열려 있음 */
  | 'choosing'
  /** 포트를 여는 중 */
  | 'opening'
  /** 열려서 주고받을 수 있음 */
  | 'open'
  /** 닫는 중 */
  | 'closing'
  /** 문제가 있어 멈춤(problem에 까닭) */
  | 'error';

export type DataPortProblemCode =
  /** 브라우저가 Web Serial을 지원하지 않음 */
  | 'unsupported'
  /** 학생이 선택 창을 닫음 */
  | 'not-selected'
  /** 이 페이지(실제 보드 탭)가 이미 쓰는 포트 */
  | 'port-in-use'
  /** 다른 프로그램(Thonny 등)이 쓰는 포트 */
  | 'port-busy'
  /** 그 밖의 열기 실패 */
  | 'open-failed'
  /** 클릭 없이 불렀음 */
  | 'security'
  /** 선이 빠짐 */
  | 'lost'
  /** 보내지 못함 */
  | 'write-failed';

export interface DataPortProblem {
  readonly code: DataPortProblemCode;
  /** 학생이 읽는 한국어 한 줄 */
  readonly text: string;
  /** 무엇을 하면 되는지(없으면 빈 글) */
  readonly advice: string;
  /** 기록용 원문(화면에는 작게) */
  readonly detail: string;
}

export interface DataPortSnapshot {
  readonly state: DataPortState;
  readonly baudRate: number;
  /** 사람이 붙인 이름표(없으면 빈 글) */
  readonly label: string;
  /** 화면에 보일 이름(이름표가 없으면 기본 이름) */
  readonly labelText: string;
  readonly identity: DataPortIdentity | null;
  readonly problem: DataPortProblem | null;
  /** 받은 바이트 수·보낸 바이트 수(연결한 뒤 누적) */
  readonly received: number;
  readonly sent: number;
  /** 받은 글에 MicroPython REPL 자국이 보임(= 보드 REPL 포트를 고른 것 같음) */
  readonly boardReplSuspect: boolean;
  readonly rx: ByteLogView;
  readonly tx: ByteLogView;
}

const PROBLEM_TEXT: Readonly<Record<DataPortProblemCode, { text: string; advice: string }>> = Object.freeze({
  unsupported: {
    text: '이 브라우저는 USB 포트를 열 수 없어요.',
    // 지원 범위는 PLAN §7.3 "USB 시리얼" 줄과 같게 적는다(컴퓨터용 크롬·엣지, 파이어폭스 151 이상)
    advice: '컴퓨터용 크롬·엣지·파이어폭스(151 이상)에서 열거나, 변환기 없이 가상 보드로 실습해요.',
  },
  'not-selected': {
    text: '포트를 고르지 않았어요.',
    advice: '[데이터 포트 연결]을 다시 누르고 목록에서 USB-UART 변환기를 골라요.',
  },
  'port-in-use': {
    text: '그 포트는 이 페이지가 이미 쓰고 있어요(코드를 보내는 보드 포트일 거예요).',
    advice: '데이터 포트는 보드 포트와 다른 포트예요. 변환기를 꽂은 쪽을 골라요. 포트가 하나뿐이면 [실제 보드] 탭에서 [연결 끊기]를 먼저 눌러요.',
  },
  'port-busy': {
    text: '다른 프로그램이 그 포트를 쓰고 있어요.',
    advice: 'Thonny·아두이노 IDE·시리얼 모니터를 닫고 다시 눌러요.',
  },
  'open-failed': {
    text: '포트를 열지 못했어요.',
    advice: 'USB 선을 뽑았다 꽂고 다시 눌러요.',
  },
  security: {
    text: '포트 선택 창은 단추를 누를 때만 열 수 있어요.',
    advice: '[데이터 포트 연결]을 눌러서 열어요.',
  },
  lost: {
    text: '데이터 포트 연결이 끊겼어요. USB 선이 빠졌거나 변환기 전원이 꺼졌어요.',
    advice: '선을 다시 꽂고 [데이터 포트 연결]을 눌러요.',
  },
  'write-failed': {
    // 보내기가 실패하면 연결을 믿을 수 없어 '문제 있음'으로 둔다 — 화면의 단추도 [다시 연결]로 바뀐다
    text: '데이터를 보내지 못했어요.',
    advice: 'USB 선이 꽂혀 있는지 보고 [다시 연결]을 눌러요.',
  },
});

function problemOf(code: DataPortProblemCode, detail = ''): DataPortProblem {
  const text = PROBLEM_TEXT[code];
  return Object.freeze({ code, text: text.text, advice: text.advice, detail });
}

/** 열기 실패 오류 이름 → 문제 종류 */
export function openProblemCode(name: string): DataPortProblemCode {
  if (name === 'InvalidStateError') {
    return 'port-in-use';
  }
  if (name === 'NetworkError') {
    return 'port-busy';
  }
  if (name === 'SecurityError') {
    return 'security';
  }
  return 'open-failed';
}

export interface DataPortOptions {
  /** navigator.serial 자리(테스트가 모의 시리얼을 넣는다). 주지 않으면 이 브라우저의 것 */
  readonly serial?: SerialLike | null;
  readonly baudRate?: number;
  /** 화면에 남길 바이트 수 */
  readonly logLimit?: number;
  /** 읽기 버퍼 크기(Web Serial open 옵션) */
  readonly bufferSize?: number;
}

/** 포트를 하나 열고 바이트를 주고받는 연결. 화면(modules/data-port)·브릿지 통로(channel.ts)가 함께 쓴다 */
export class DataPortConnection {
  readonly #serial: SerialLike | null;
  readonly #bufferSize: number;
  readonly #listeners = new Set<(snapshot: DataPortSnapshot) => void>();
  readonly #dataListeners = new Set<(bytes: Uint8Array) => void>();
  readonly #rx: ByteLog;
  readonly #tx: ByteLog;
  #state: DataPortState;
  #baudRate: number;
  #label = '';
  #identity: DataPortIdentity | null = null;
  #problem: DataPortProblem | null = null;
  #port: SerialPortLike | null = null;
  #channel: SerialChannel | null = null;
  #boardReplSuspect = false;
  #replSniff = '';
  #disposed = false;

  constructor(options: DataPortOptions = {}) {
    this.#serial = options.serial === undefined ? (navigatorSerial() as SerialLike | null) : options.serial;
    this.#bufferSize = options.bufferSize ?? 4096;
    this.#baudRate = normalizeBaud(options.baudRate ?? DEFAULT_DATA_PORT_BAUD);
    this.#rx = new ByteLog(options.logLimit ?? BYTE_LOG_LIMIT);
    this.#tx = new ByteLog(options.logLimit ?? BYTE_LOG_LIMIT);
    this.#state = this.#serial ? 'idle' : 'unsupported';
    this.#problem = this.#serial ? null : problemOf('unsupported');
  }

  get snapshot(): DataPortSnapshot {
    return Object.freeze({
      state: this.#state,
      baudRate: this.#baudRate,
      label: this.#label,
      labelText: portLabelText(this.#label, this.#identity),
      identity: this.#identity,
      problem: this.#problem,
      received: this.#rx.total,
      sent: this.#tx.total,
      boardReplSuspect: this.#boardReplSuspect,
      rx: this.#rx.view(),
      tx: this.#tx.view(),
    });
  }

  get isOpen(): boolean {
    return this.#state === 'open' && this.#channel?.isOpen === true;
  }

  get baudRate(): number {
    return this.#baudRate;
  }

  /** 지금 열려 있는 포트(다른 곳에서 같은 포트인지 견줄 때만 쓴다) */
  get port(): SerialPortLike | null {
    return this.#port;
  }

  get supported(): boolean {
    return this.#serial !== null;
  }

  subscribe(listener: (snapshot: DataPortSnapshot) => void): () => void {
    this.#listeners.add(listener);
    listener(this.snapshot);
    return () => this.#listeners.delete(listener);
  }

  /** 받은 바이트를 듣는다(브릿지 통로가 쓴다). 돌려주는 함수를 부르면 그만 듣는다 */
  onData(listener: (bytes: Uint8Array) => void): () => void {
    this.#dataListeners.add(listener);
    return () => this.#dataListeners.delete(listener);
  }

  /** [데이터 포트 연결] — 클릭 처리기 안에서 곧바로 부른다(await 앞에 requestPort) */
  async connect(): Promise<DataPortSnapshot> {
    const serial = this.#serial;
    if (!serial) {
      this.#set('unsupported', problemOf('unsupported'));
      return this.snapshot;
    }
    if (this.#state === 'choosing' || this.#state === 'opening' || this.#state === 'closing') {
      return this.snapshot;
    }
    const previous = this.#state === 'open' ? 'open' : 'idle';
    this.#set('choosing', null);
    let port: SerialPortLike;
    try {
      // 거르지 않는다(P3-07 보드 연결과 같은 규칙). 변환기 칩은 학교마다 달라서 filters를 주면 쓰는 변환기가 목록에서 사라진다.
      port = await serial.requestPort();
    } catch (error) {
      const name = errorName(error);
      const code = name === 'NotFoundError' ? 'not-selected' : name === 'SecurityError' ? 'security' : 'open-failed';
      // 창을 닫았을 뿐이면 열려 있던 연결은 그대로 둔다
      this.#set(code === 'not-selected' ? previous : 'error', problemOf(code, `${name}: ${errorMessage(error)}`));
      return this.snapshot;
    }
    return this.openPort(port);
  }

  /** 이미 고른 포트를 연다(선택 창 없이 — 지난번 허락한 포트를 getPorts()로 찾았을 때) */
  async openPort(port: SerialPortLike): Promise<DataPortSnapshot> {
    if (this.#disposed) {
      return this.snapshot;
    }
    await this.#closeChannel();
    const previousKey = this.#identity?.key ?? '';
    this.#port = port;
    this.#identity = identifyPort(safeInfo(port));
    if (this.#identity.key !== previousKey) {
      // 다른 포트를 골랐다 — 앞 포트에 붙였던 이름표를 그대로 두면 엉뚱한 선에 붙는다.
      // 새 포트에 저장해 둔 이름표가 있으면 화면(modules/data-port)이 열쇠를 보고 다시 넣는다.
      this.#label = '';
    }
    this.#boardReplSuspect = false;
    this.#replSniff = '';
    this.#rx.clear();
    this.#tx.clear();
    this.#set('opening', null);
    let channel: SerialChannel;
    try {
      channel = await SerialChannel.open(port, { baudRate: this.#baudRate, bufferSize: this.#bufferSize });
    } catch (error) {
      const name = errorName(error);
      this.#port = null;
      this.#set('error', problemOf(openProblemCode(name), `${name}: ${errorMessage(error)}`));
      return this.snapshot;
    }
    if (this.#disposed) {
      await channel.close();
      return this.snapshot;
    }
    this.#channel = channel;
    channel.onData((bytes) => this.#receive(bytes));
    channel.onEnd((end) => {
      if (this.#channel !== channel) {
        return;
      }
      if (end.reason === 'lost') {
        this.#channel = null;
        this.#set('error', problemOf('lost', errorMessage(end.error)));
      }
    });
    this.#set('open', null);
    return this.snapshot;
  }

  /** 지난번에 허락한 포트가 아직 꽂혀 있으면 선택 창 없이 연다(없으면 선택 창) */
  async reconnect(): Promise<DataPortSnapshot> {
    const serial = this.#serial;
    if (!serial) {
      return this.connect();
    }
    const last = this.#port;
    if (last) {
      try {
        const ports = await serial.getPorts();
        if (ports.includes(last)) {
          return this.openPort(last);
        }
      } catch {
        // getPorts를 못 읽으면 선택 창으로
      }
    }
    return this.connect();
  }

  /** 통신 속도를 바꾼다. 열려 있으면 같은 포트를 닫았다 새 속도로 다시 연다 */
  async setBaudRate(rate: number): Promise<DataPortSnapshot> {
    const next = normalizeBaud(rate);
    if (next === this.#baudRate) {
      return this.snapshot;
    }
    this.#baudRate = next;
    const port = this.#port;
    if (this.isOpen && port) {
      return this.openPort(port);
    }
    this.#emit();
    return this.snapshot;
  }

  /** 이름표를 바꾼다(저장은 화면 쪽이 한다 — 이 객체는 값만 들고 있다) */
  setLabel(label: string): DataPortSnapshot {
    this.#label = sanitizeLabel(label);
    this.#emit();
    return this.snapshot;
  }

  /** 바이트를 보낸다. 열려 있지 않으면 오류를 던진다(부른 쪽이 한국어로 알린다) */
  async write(bytes: Uint8Array): Promise<void> {
    const channel = this.#channel;
    if (!channel || !this.isOpen) {
      throw new DataPortClosedError();
    }
    try {
      await channel.write(bytes);
    } catch (error) {
      this.#set('error', problemOf(this.#channel === null ? 'lost' : 'write-failed', errorMessage(error)));
      throw error;
    }
    this.#tx.push(bytes);
    this.#emit();
  }

  /** 연결을 닫는다(포트 허락은 남는다 — 다음에 선택 창 없이 열 수 있다) */
  async disconnect(): Promise<DataPortSnapshot> {
    if (this.#channel) {
      this.#set('closing', null);
    }
    await this.#closeChannel();
    this.#set('idle', null);
    return this.snapshot;
  }

  /** 화면에 쌓인 바이트 기록만 지운다 */
  clearLog(): void {
    this.#rx.clear();
    this.#tx.clear();
    this.#boardReplSuspect = false;
    this.#replSniff = '';
    this.#emit();
  }

  async dispose(): Promise<void> {
    this.#disposed = true;
    await this.#closeChannel();
    this.#listeners.clear();
    this.#dataListeners.clear();
  }

  // ───────────── 안쪽 ─────────────

  #receive(bytes: Uint8Array): void {
    this.#rx.push(bytes);
    if (!this.#boardReplSuspect) {
      // 새로 온 바이트만 붙여 마지막 512글자를 본다(자국이 두 덩어리에 걸쳐 와도 잡히고, 쌓인 기록을 다시 읽지 않는다)
      this.#replSniff = (this.#replSniff + decodeUtf8(bytes)).slice(-512);
      if (looksLikeBoardRepl(this.#replSniff)) {
        this.#boardReplSuspect = true;
      }
    }
    for (const listener of [...this.#dataListeners]) {
      try {
        listener(bytes);
      } catch {
        // 듣는 쪽의 오류가 통로를 멈추지 않게
      }
    }
    this.#emit();
  }

  async #closeChannel(): Promise<void> {
    const channel = this.#channel;
    this.#channel = null;
    if (channel) {
      await channel.close().catch(() => undefined);
    }
  }

  #set(state: DataPortState, problem: DataPortProblem | null): void {
    this.#state = state;
    this.#problem = problem;
    this.#emit();
  }

  #emit(): void {
    const snapshot = this.snapshot;
    for (const listener of [...this.#listeners]) {
      try {
        listener(snapshot);
      } catch {
        // 화면 쪽 오류가 연결을 멈추지 않게
      }
    }
  }
}

/** 데이터 포트가 열려 있지 않은데 보내려 했을 때 */
export class DataPortClosedError extends Error {
  override readonly name = 'DataPortClosed';
  constructor(message = '데이터 포트가 열려 있지 않아요. [데이터 포트 연결]을 먼저 눌러요.') {
    super(message);
  }
}

function safeInfo(port: SerialPortLike): Partial<SerialPortInfo> | null {
  try {
    return port.getInfo();
  } catch {
    return null;
  }
}
