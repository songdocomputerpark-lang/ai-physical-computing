/**
 * 실제 기기와의 블루투스 연결 하나(P4-04) — 선택 창 → GATT 연결 → Nordic UART 서비스 → 응답 있는 쓰기·알림 받기.
 * 화면(`src/lab/modules/web-bluetooth/index.ts`)은 이 객체만 보고, 이 파일은 DOM을 모른다(단위 테스트가 가짜
 * `navigator.bluetooth`로 그대로 돌린다 — `src/lab/ble/mock/`).
 *
 * 지켜야 하는 것
 * 1. **`requestDevice()`는 사용자 조작(클릭) 안에서 첫 await 앞에 부른다.** 그래서 `connect()`는 `async` 함수가 아니고,
 *    맨 처음 줄에서 곧바로 `requestDevice`를 부른 뒤에야 상태를 바꾸고 약속을 잇는다(MDN·Chrome 문서: 사용자 조작 필요).
 * 2. **쓰기는 한 번에 하나씩**(write-queue.ts) — 동시 쓰기 오류 조건이 공식 문서에 없다(PLAN §8.4 예상 위험).
 * 3. **기기 주소를 다루지 않는다.** 브라우저는 주소를 주지 않고(MDN BluetoothDevice.id는 사이트마다 다른 값),
 *    화면·기록·저장에도 이름만 쓴다(PLAN §10, README 9.7).
 * 4. 20바이트가 넘는 값도 **막지 않고 그대로 보낸다** — 실물에서 잘리는 것을 학생이 보게 한다(PLAN §7.7, P4-03 결정 2와 같은 결).
 */
import { bytesText, hexText, logLine } from '../modules/board/parts/ble/ble-state.ts';
import { describeBleError, type BleStage } from './errors.ts';
import { normalizePrefix } from './names.ts';
import { bleProblem, bleText, type BleConnectionState, type BleProblem } from './text.ts';
import { bluetoothApi } from './support.ts';
import { BLE_VALUE_BYTES, DEFAULT_NAME_PREFIX, NUS_RX_CHARACTERISTIC_UUID, NUS_SERVICE_UUID, NUS_TX_CHARACTERISTIC_UUID, chooserOptions } from './uuids.ts';
import { BleQueueFullError, BleWriteCancelledError, BleWriteQueue } from './write-queue.ts';

/** 기록 칸에 남기는 줄 수 */
const LOG_LINES = 40;

export interface BleConnectionOptions {
  /** 테스트가 가짜 navigator.bluetooth를 넣는 자리(기본은 이 브라우저의 것) */
  readonly bluetooth?: Bluetooth | null;
  /** 선택 창에서 거를 이름 앞부분 */
  readonly namePrefix?: string;
  /** 이름을 모를 때 가까운 기기 모두 보기 */
  readonly acceptAll?: boolean;
}

export interface BleSnapshot {
  readonly state: BleConnectionState;
  readonly supported: boolean;
  /** 고른 기기의 광고 이름(주소가 아니다) */
  readonly deviceName: string;
  readonly namePrefix: string;
  readonly acceptAll: boolean;
  readonly problem: BleProblem | null;
  /** 보낸 바이트 수 */
  readonly sent: number;
  /** 받은 바이트 수 */
  readonly received: number;
  /** 아직 못 보내고 기다리는 수 */
  readonly queued: number;
  /** 보드가 보내는 값(알림)을 켰나 */
  readonly notifying: boolean;
  /** 주고받은 기록(최근 줄) */
  readonly lines: readonly string[];
  /** 마지막으로 받은 값의 16진수 */
  readonly lastHex: string;
  /** 한 번이라도 기기를 고른 적이 있나([다시 연결]을 보일지) */
  readonly hasDevice: boolean;
}

type Listener = (snapshot: BleSnapshot) => void;
type DataListener = (bytes: Uint8Array) => void;

export class BleConnection {
  readonly #listeners = new Set<Listener>();
  readonly #dataListeners = new Set<DataListener>();
  readonly #lines: string[] = [];
  readonly #api: Bluetooth | null;
  #device: BluetoothDevice | null = null;
  #server: BluetoothRemoteGATTServer | null = null;
  #rx: BluetoothRemoteGATTCharacteristic | null = null;
  #tx: BluetoothRemoteGATTCharacteristic | null = null;
  #queue: BleWriteQueue | null = null;
  #state: BleConnectionState;
  #problem: BleProblem | null = null;
  #deviceName = '';
  #namePrefix: string;
  #acceptAll: boolean;
  #sent = 0;
  #received = 0;
  #notifying = false;
  #lastHex = '';
  #disposed = false;
  readonly #onDisconnected = (): void => this.#handleDisconnected();
  readonly #onValueChanged = (event: Event): void => this.#handleValue(event);

  constructor(options: BleConnectionOptions = {}) {
    this.#api = options.bluetooth === undefined ? bluetoothApi() : options.bluetooth;
    this.#namePrefix = normalizePrefix(options.namePrefix ?? DEFAULT_NAME_PREFIX);
    this.#acceptAll = options.acceptAll === true;
    this.#state = this.#api === null ? 'unsupported' : 'idle';
    if (this.#api === null) {
      this.#problem = bleProblem('unsupported', '이 브라우저에는 블루투스로 기기를 연결하는 기능이 없어요.', '컴퓨터용 Chrome이나 Edge에서 열어 주세요.');
    }
  }

  /** 이 브라우저에서 쓸 수 있나 */
  get supported(): boolean {
    return this.#api !== null;
  }

  get isOpen(): boolean {
    return this.#state === 'open' && this.#server?.connected === true;
  }

  get snapshot(): BleSnapshot {
    return Object.freeze({
      state: this.#state,
      supported: this.supported,
      deviceName: this.#deviceName,
      namePrefix: this.#namePrefix,
      acceptAll: this.#acceptAll,
      problem: this.#problem,
      sent: this.#sent,
      received: this.#received,
      queued: this.#queue?.size ?? 0,
      notifying: this.#notifying,
      lines: Object.freeze([...this.#lines]),
      lastHex: this.#lastHex,
      hasDevice: this.#device !== null,
    });
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** 보드가 보낸 바이트(알림) */
  onData(listener: DataListener): () => void {
    this.#dataListeners.add(listener);
    return () => {
      this.#dataListeners.delete(listener);
    };
  }

  setNamePrefix(value: string): void {
    this.#namePrefix = normalizePrefix(value);
    this.#emit();
  }

  setAcceptAll(value: boolean): void {
    this.#acceptAll = value;
    this.#emit();
  }

  /**
   * 선택 창을 열고 보드를 고른다. **클릭 처리기 안에서 바로 부른다**(`void connection.connect()`).
   * 일부러 `async`로 만들지 않았다 — `async`면 첫 줄이라도 마이크로태스크 뒤에 돌 수 있어 사용자 조작이 풀릴 수 있다.
   */
  connect(): Promise<void> {
    if (this.#disposed) {
      return Promise.resolve();
    }
    const api = this.#api;
    if (api === null) {
      this.#fail('unsupported', bleProblem('unsupported', '이 브라우저에는 블루투스로 기기를 연결하는 기능이 없어요.', '컴퓨터용 Chrome이나 Edge에서 열어 주세요.'));
      return Promise.resolve();
    }
    if (this.#state === 'choosing' || this.#state === 'connecting') {
      return Promise.resolve();
    }
    let request: Promise<BluetoothDevice>;
    try {
      // ⚠ 첫 await 앞 — 사용자 조작(클릭) 안에서 곧바로 부른다.
      request = api.requestDevice(chooserOptions({ namePrefix: this.#namePrefix, acceptAll: this.#acceptAll }));
    } catch (error) {
      this.#fail('error', describeBleError(error, 'choose'));
      return Promise.resolve();
    }
    this.#problem = null;
    this.#state = 'choosing';
    this.#emit();
    return this.#afterChooser(request);
  }

  /** 이미 고른 보드에 다시 잇는다(선택 창 없이 — 브라우저가 이 기기의 허락을 기억한다) */
  reconnect(): Promise<void> {
    if (this.#disposed || this.#device === null) {
      return this.connect();
    }
    if (this.#state === 'choosing' || this.#state === 'connecting') {
      return Promise.resolve();
    }
    this.#problem = null;
    this.#state = 'connecting';
    this.#emit();
    return this.#openDevice(this.#device);
  }

  /** 연결을 끊는다(포트와 달리 브라우저의 허락은 남아 있어 [다시 연결]로 바로 잇는다) */
  disconnect(): Promise<void> {
    const server = this.#server;
    this.#teardown('연결을 끊었어요.');
    try {
      server?.disconnect();
    } catch {
      // 이미 끊겨 있으면 그만
    }
    if (this.#state !== 'unsupported') {
      this.#state = 'idle';
      this.#problem = null;
      this.#emit();
    }
    return Promise.resolve();
  }

  /**
   * 값을 보낸다(응답 있는 쓰기). 차례에 넣고 **앞의 것이 끝난 뒤** 나간다.
   * 20바이트가 넘어도 막지 않는다 — 실물에서 잘리는 것을 보여 주려고(§7.7). 화면이 미리 경고를 띄운다.
   */
  async write(bytes: Uint8Array): Promise<void> {
    if (this.#queue === null || this.#rx === null || !this.isOpen) {
      throw new Error('블루투스 보드와 이어져 있지 않아요. [블루투스 보드 연결]을 먼저 눌러요.');
    }
    const copy = new Uint8Array(bytes);
    try {
      await this.#queue.push(copy);
    } catch (error) {
      // 차례가 가득 찼을 때·끊겨서 버렸을 때는 이미 안내 줄을 남겼다(중복해서 적지 않는다).
      if (!(error instanceof BleQueueFullError) && !(error instanceof BleWriteCancelledError)) {
        this.#appendLine(`[안내] ${describeBleError(error, 'write').text}`);
        this.#emit();
      }
      throw error;
    }
  }

  /** 기록만 지운다(연결은 그대로) */
  clearLog(): void {
    this.#lines.splice(0, this.#lines.length);
    this.#lastHex = '';
    this.#emit();
  }

  dispose(): void {
    this.#disposed = true;
    const server = this.#server;
    this.#device?.removeEventListener('gattserverdisconnected', this.#onDisconnected);
    this.#teardown('화면을 닫았어요.');
    try {
      server?.disconnect();
    } catch {
      // 이미 끊겼으면 그만
    }
    this.#listeners.clear();
    this.#dataListeners.clear();
  }

  // ── 안쪽 ──

  async #afterChooser(request: Promise<BluetoothDevice>): Promise<void> {
    let device: BluetoothDevice;
    try {
      device = await request;
    } catch (error) {
      this.#fail('error', describeBleError(error, 'choose'));
      return;
    }
    this.#device = device;
    this.#deviceName = typeof device.name === 'string' ? device.name : '';
    device.addEventListener('gattserverdisconnected', this.#onDisconnected);
    this.#state = 'connecting';
    this.#emit();
    await this.#openDevice(device);
  }

  async #openDevice(device: BluetoothDevice): Promise<void> {
    const gatt = device.gatt;
    if (gatt === undefined || gatt === null) {
      this.#fail('error', describeBleError(new Error('gatt 없음'), 'connect'));
      return;
    }
    let stage: BleStage = 'connect';
    try {
      const server = await gatt.connect();
      this.#server = server;
      stage = 'service';
      const service = await server.getPrimaryService(NUS_SERVICE_UUID);
      this.#rx = await service.getCharacteristic(NUS_RX_CHARACTERISTIC_UUID);
      this.#tx = await service.getCharacteristic(NUS_TX_CHARACTERISTIC_UUID);
    } catch (error) {
      this.#teardown('');
      try {
        gatt.disconnect();
      } catch {
        // 연결되기 전이면 그만
      }
      this.#fail('error', describeBleError(error, stage));
      return;
    }
    const rx = this.#rx;
    this.#queue = new BleWriteQueue({
      write: async (bytes) => {
        // 기록은 **차례에서 실제로 나가는 순간** 남긴다 — 보드가 곧바로 답(알림)을 보내도 기록 순서가 뒤집히지 않게.
        this.#sent += bytes.length;
        this.#lastHex = hexText([...bytes]);
        this.#appendLine(logLine('send', [...bytes]));
        this.#emit();
        // 기다리는 쪽에서 오류를 받도록 그대로 던진다(화면이 한국어 풀이로 바꾼다).
        await rx.writeValueWithResponse(bytes);
      },
      onWarning: (text) => {
        this.#appendLine(`[안내] ${text}`);
        this.#emit();
      },
    });
    this.#state = 'open';
    this.#problem = null;
    this.#emit();
    await this.#startNotifications();
  }

  async #startNotifications(): Promise<void> {
    const tx = this.#tx;
    if (tx === null) {
      return;
    }
    try {
      tx.addEventListener('characteristicvaluechanged', this.#onValueChanged);
      await tx.startNotifications();
      this.#notifying = true;
    } catch (error) {
      this.#notifying = false;
      tx.removeEventListener('characteristicvaluechanged', this.#onValueChanged);
      this.#problem = describeBleError(error, 'notify');
      this.#appendLine(`[안내] ${bleText.notifyFailed()}`);
    }
    this.#emit();
  }

  #handleValue(event: Event): void {
    const target = event.target as BluetoothRemoteGATTCharacteristic | null;
    const view = target?.value;
    if (view === undefined || view === null) {
      return;
    }
    const bytes = new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
    if (bytes.length === 0) {
      return;
    }
    this.#received += bytes.length;
    this.#lastHex = hexText([...bytes]);
    this.#appendLine(logLine('receive', [...bytes]));
    for (const listener of Array.from(this.#dataListeners)) {
      try {
        listener(bytes);
      } catch {
        // 듣는 쪽 잘못으로 연결이 멈추지 않게
      }
    }
    this.#emit();
  }

  #handleDisconnected(): void {
    const dropped = this.#queue?.cancelAll('연결이 끊겨서 보내지 못했어요.') ?? 0;
    this.#teardown('');
    if (dropped > 0) {
      this.#appendLine(`[안내] ${bleText.queueDropped(dropped)}`);
    }
    this.#appendLine('[안내] 보드와 연결이 끊겼어요.');
    this.#state = 'error';
    this.#problem = bleProblem(
      'disconnected',
      '보드와 연결이 끊겼어요.',
      '보드에 전원이 들어와 있는지, 너무 멀어지지 않았는지 보고 [다시 연결]을 눌러요.',
    );
    this.#emit();
  }

  /** 특성·차례·알림을 정리한다(기기와 허락은 남긴다 — [다시 연결]을 쓰려고) */
  #teardown(reason: string): void {
    if (this.#tx !== null) {
      this.#tx.removeEventListener('characteristicvaluechanged', this.#onValueChanged);
      if (this.#notifying) {
        // 이미 끊긴 뒤면 실패하지만 그대로 두면 다음 연결에서 두 번 오게 된다.
        void Promise.resolve(this.#tx.stopNotifications()).catch(() => undefined);
      }
    }
    this.#queue?.close(reason === '' ? '연결이 닫혔어요.' : reason);
    this.#queue = null;
    this.#tx = null;
    this.#rx = null;
    this.#server = null;
    this.#notifying = false;
  }

  #fail(state: BleConnectionState, problem: BleProblem): void {
    this.#state = state;
    this.#problem = problem;
    this.#emit();
  }

  #appendLine(line: string): void {
    this.#lines.push(line);
    if (this.#lines.length > LOG_LINES) {
      this.#lines.splice(0, this.#lines.length - LOG_LINES);
    }
  }

  #emit(): void {
    const snapshot = this.snapshot;
    for (const listener of Array.from(this.#listeners)) {
      try {
        listener(snapshot);
      } catch {
        // 화면 잘못으로 연결이 멈추지 않게
      }
    }
  }
}

/** 보낼 값이 한 번에 들어가는 크기를 넘었는지(화면이 미리 경고할 때) */
export function tooLongForOneWrite(bytes: ArrayLike<number>): boolean {
  return bytes.length > BLE_VALUE_BYTES;
}

/** 기록 줄 만들기(화면·콘솔이 같은 글을 쓰게) */
export function readableBytes(bytes: ArrayLike<number>): string {
  return bytesText(Array.from(bytes));
}
