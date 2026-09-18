/**
 * 가짜 `navigator.bluetooth` — 실제 보드 없이 연결 흐름을 시험하는 도구(P4-04).
 * 모의 시리얼(`src/lab/serial/mock/`, README 8절)과 같은 생각이다: **브라우저 API 모양만** 흉내 내고,
 * 진짜 기기의 증거가 되지는 않는다(실물 송수신은 운영자 확인 — 부록 B).
 *
 * 무엇을 흉내 내나
 * - `requestDevice(options)`: 설정한 기기 목록에서 `filters[].namePrefix`·`acceptAllDevices`로 고르고,
 *   맞는 것이 없거나 `chooser: 'cancel'`이면 **NotFoundError**를 던진다(MDN 그대로).
 *   부른 순간의 사용자 조작 여부(`navigator.userActivation.isActive`)를 기록해 두어, 브라우저 테스트가
 *   "권한 요청이 클릭 안에서 났는지"를 확인할 수 있다.
 * - GATT: `connect`·`getPrimaryService`·`getCharacteristic`·`writeValueWithResponse`·`startNotifications`·`disconnect`.
 *   서비스가 없는 기기(`services: []`)는 `getPrimaryService`에서 NotFoundError,
 *   `connectFails: true`면 `connect`에서 NetworkError를 던진다.
 * - 보드 흉내: `echoNewline`을 켜면 받은 값을 그대로 알림으로 돌려보낸다(실물 `ESP32BLE.send()`처럼 끝에 \n).
 *   테스트에서 `notify(bytes)`·`disconnectDevice()`를 직접 불러 보드 쪽 사건을 만들 수도 있다.
 * - `truncateBytes`(기본 20): 받은 값을 실물 MicroPython 버퍼처럼 잘라서 기억한다(§7.7).
 *
 * 파이썬·배포 번들에는 들어가지 않는다(테스트에서만 import한다).
 */

export interface MockCharacteristicConfig {
  readonly uuid: string;
  readonly notify?: boolean;
  readonly write?: boolean;
}

export interface MockDeviceConfig {
  readonly id?: string;
  readonly name?: string;
  /** 이 기기가 가진 서비스 UUID 목록(비우면 getPrimaryService가 NotFoundError) */
  readonly services?: readonly string[];
  /** gatt.connect()가 실패하게 */
  readonly connectFails?: boolean;
  /** 알림 켜기가 실패하게 */
  readonly notifyFails?: boolean;
  /** 쓰기가 실패하게 */
  readonly writeFails?: boolean;
  /** 받은 값을 그대로 알림으로 돌려보내기(끝에 \n) */
  readonly echo?: boolean;
  /** 한 번에 받아 두는 바이트 수(실물 MicroPython 특성 버퍼) */
  readonly truncateBytes?: number;
  /** 쓰기 한 번에 걸리는 시간(밀리초, 기본 0) — 직렬 대기열을 시험할 때 쓴다 */
  readonly writeDelayMs?: number;
}

export interface MockBluetoothConfig {
  readonly devices?: readonly MockDeviceConfig[];
  /** 선택 창에서 무엇을 할까: 'first'(첫 기기 고르기) · 'cancel'(닫기) */
  readonly chooser?: 'first' | 'cancel';
  /** getAvailability() 결과 */
  readonly available?: boolean;
}

const NUS_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const NUS_RX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const NUS_TX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

/** DOMException이 없는 환경(Node)에서도 같은 모양의 오류를 만든다 */
export function domError(name: string, message: string): Error {
  const Ctor = (globalThis as { DOMException?: new (message: string, name: string) => Error }).DOMException;
  if (typeof Ctor === 'function') {
    return new Ctor(message, name);
  }
  const error = new Error(message);
  error.name = name;
  return error;
}

function delay(ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));
}

/** 아주 작은 EventTarget(Node 20+·브라우저 모두 전역 EventTarget이 있어 그것을 쓴다) */
class MockEventTarget extends EventTarget {}

export class MockCharacteristic extends MockEventTarget {
  readonly uuid: string;
  readonly properties: { notify: boolean; write: boolean; writeWithoutResponse: boolean; read: boolean };
  value: DataView | undefined;
  readonly device: MockDevice;

  constructor(device: MockDevice, config: MockCharacteristicConfig) {
    super();
    this.device = device;
    this.uuid = config.uuid;
    this.properties = { notify: config.notify === true, write: config.write === true, writeWithoutResponse: false, read: true };
  }

  async writeValueWithResponse(value: ArrayBufferView | ArrayBufferLike): Promise<void> {
    const bytes = toBytes(value);
    this.device.writeCount += 1;
    this.device.concurrentWrites += 1;
    this.device.maxConcurrentWrites = Math.max(this.device.maxConcurrentWrites, this.device.concurrentWrites);
    try {
      await delay(this.device.config.writeDelayMs ?? 0);
      if (this.device.config.writeFails === true) {
        throw domError('NetworkError', 'GATT operation failed for unknown reason.');
      }
      const limit = this.device.config.truncateBytes ?? 20;
      const stored = bytes.slice(0, limit);
      this.device.written.push(Array.from(bytes));
      this.device.received.push(Array.from(stored));
      this.value = new DataView(bytes.buffer.slice(0));
      if (this.device.config.echo === true) {
        const text = new TextDecoder().decode(stored);
        this.device.notifyText(`${text}\n`);
      }
    } finally {
      this.device.concurrentWrites -= 1;
    }
  }

  async writeValueWithoutResponse(value: ArrayBufferView | ArrayBufferLike): Promise<void> {
    await this.writeValueWithResponse(value);
  }

  async readValue(): Promise<DataView> {
    return this.value ?? new DataView(new ArrayBuffer(0));
  }

  async startNotifications(): Promise<MockCharacteristic> {
    if (this.device.config.notifyFails === true) {
      throw domError('NotSupportedError', 'GATT Error: Not supported.');
    }
    this.device.notifying = true;
    return this;
  }

  async stopNotifications(): Promise<MockCharacteristic> {
    this.device.notifying = false;
    return this;
  }
}

export class MockService {
  readonly uuid: string;
  readonly #characteristics: Map<string, MockCharacteristic>;

  constructor(uuid: string, characteristics: readonly MockCharacteristic[]) {
    this.uuid = uuid;
    this.#characteristics = new Map(characteristics.map((item) => [item.uuid.toLowerCase(), item]));
  }

  async getCharacteristic(uuid: string): Promise<MockCharacteristic> {
    const found = this.#characteristics.get(String(uuid).toLowerCase());
    if (found === undefined) {
      throw domError('NotFoundError', `No Characteristic matching UUID ${String(uuid)} found in Service.`);
    }
    return found;
  }
}

export class MockGattServer {
  readonly device: MockDevice;
  connected = false;

  constructor(device: MockDevice) {
    this.device = device;
  }

  async connect(): Promise<MockGattServer> {
    if (this.device.config.connectFails === true) {
      throw domError('NetworkError', 'Connection failed for unknown reason.');
    }
    this.connected = true;
    this.device.connectCount += 1;
    return this;
  }

  disconnect(): void {
    if (!this.connected) {
      return;
    }
    this.connected = false;
    this.device.notifying = false;
    this.device.dispatchEvent(new Event('gattserverdisconnected'));
  }

  async getPrimaryService(uuid: string): Promise<MockService> {
    if (!this.connected) {
      throw domError('NetworkError', 'GATT Server is disconnected.');
    }
    const wanted = String(uuid).toLowerCase();
    const services = this.device.config.services ?? [NUS_SERVICE];
    if (!services.map((item) => item.toLowerCase()).includes(wanted)) {
      throw domError('NotFoundError', 'No Services matching UUID found in Device.');
    }
    return this.device.service;
  }
}

export class MockDevice extends MockEventTarget {
  readonly id: string;
  readonly name: string | undefined;
  readonly config: MockDeviceConfig;
  readonly gatt: MockGattServer;
  readonly service: MockService;
  readonly rx: MockCharacteristic;
  readonly tx: MockCharacteristic;
  /** 사이트가 보낸 바이트 그대로 */
  readonly written: number[][] = [];
  /** 실물처럼 잘라서 보드가 받아 둔 값 */
  readonly received: number[][] = [];
  writeCount = 0;
  connectCount = 0;
  concurrentWrites = 0;
  maxConcurrentWrites = 0;
  notifying = false;

  constructor(config: MockDeviceConfig) {
    super();
    this.config = config;
    this.id = config.id ?? 'mock-device';
    this.name = config.name;
    this.gatt = new MockGattServer(this);
    this.rx = new MockCharacteristic(this, { uuid: NUS_RX, write: true });
    this.tx = new MockCharacteristic(this, { uuid: NUS_TX, notify: true });
    this.service = new MockService(NUS_SERVICE, [this.rx, this.tx]);
  }

  /** 보드가 값을 보낸 것처럼 알림을 낸다 */
  notify(bytes: readonly number[]): void {
    if (!this.notifying) {
      return;
    }
    const data = Uint8Array.from(bytes);
    this.tx.value = new DataView(data.buffer);
    this.tx.dispatchEvent(new Event('characteristicvaluechanged'));
  }

  notifyText(text: string): void {
    this.notify(Array.from(new TextEncoder().encode(text)));
  }

  /** 보드가 꺼진 것처럼 연결을 끊는다 */
  drop(): void {
    this.gatt.disconnect();
  }
}

export interface ChooserCall {
  readonly options: RequestDeviceOptions;
  /** 부른 순간 사용자 조작(클릭) 안이었나. 알 수 없으면 null */
  readonly gesture: boolean | null;
}

export class MockBluetooth extends MockEventTarget {
  readonly devices: MockDevice[];
  readonly calls: ChooserCall[] = [];
  chooser: 'first' | 'cancel';
  available: boolean;

  constructor(config: MockBluetoothConfig = {}) {
    super();
    const list = config.devices ?? [{ name: 'ESP32-07', echo: true }];
    this.devices = list.map((item) => new MockDevice(item));
    this.chooser = config.chooser ?? 'first';
    this.available = config.available ?? true;
  }

  async getAvailability(): Promise<boolean> {
    return this.available;
  }

  async requestDevice(options: RequestDeviceOptions = {}): Promise<MockDevice> {
    this.calls.push({ options, gesture: readUserActivation() });
    if (this.chooser === 'cancel') {
      throw domError('NotFoundError', 'User cancelled the requestDevice() chooser.');
    }
    if (options.filters !== undefined && options.acceptAllDevices === true) {
      throw new TypeError('Cannot specify filters and acceptAllDevices.');
    }
    const matched = this.devices.filter((device) => matches(device, options));
    const chosen = matched[0];
    if (chosen === undefined) {
      throw domError('NotFoundError', 'User cancelled the requestDevice() chooser.');
    }
    return chosen;
  }

  /** 첫 기기(테스트가 보드 노릇을 할 때) */
  get first(): MockDevice {
    const device = this.devices[0];
    if (device === undefined) {
      throw new Error('모의 블루투스에 기기가 없어요.');
    }
    return device;
  }
}

function matches(device: MockDevice, options: RequestDeviceOptions): boolean {
  if (options.acceptAllDevices === true || options.filters === undefined) {
    return true;
  }
  return options.filters.some((filter) => {
    if (filter.namePrefix !== undefined && !(device.name ?? '').startsWith(filter.namePrefix)) {
      return false;
    }
    if (filter.name !== undefined && device.name !== filter.name) {
      return false;
    }
    if (filter.services !== undefined) {
      const services = (device.config.services ?? [NUS_SERVICE]).map((item) => item.toLowerCase());
      return filter.services.every((wanted) => services.includes(String(wanted).toLowerCase()));
    }
    return true;
  });
}

function readUserActivation(): boolean | null {
  const activation = (globalThis as { navigator?: { userActivation?: { isActive?: boolean } } }).navigator?.userActivation;
  return typeof activation?.isActive === 'boolean' ? activation.isActive : null;
}

function toBytes(value: ArrayBufferView | ArrayBufferLike): Uint8Array {
  if (ArrayBuffer.isView(value)) {
    const view = value;
    return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer);
  }
  return new Uint8Array((value as ArrayBuffer).slice(0));
}

/** 가짜 블루투스를 만든다(테스트가 쓰는 입구) */
export function createMockBluetooth(config: MockBluetoothConfig = {}): MockBluetooth {
  return new MockBluetooth(config);
}
