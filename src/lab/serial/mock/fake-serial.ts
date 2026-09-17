/**
 * navigator.serial의 테스트 대역(병렬 제작 준비 2026-09-17, src/lab/README.md 8절).
 * requestPort(선택 창)·getPorts(이미 허락한 포트)·connect/disconnect 이벤트를 흉내 내고, installFakeSerial로 navigator.serial 자리에 끼운다.
 *
 * 진짜 동작에 맞춘 것(WICG Web Serial 명세 requestPort() 알고리즘 — 2026-09-17 원문 확인)
 * - 사용자 조작(클릭 같은 transient activation)이 없으면 SecurityError — 브라우저(navigator.userActivation이 있는 곳)에서만 검사한다.
 *   requireUserActivation: false로 끌 수 있다. 검사 순서도 명세대로 사용자 조작 → 필터.
 * - 필터마다: bluetoothServiceClassId와 usbVendorId·usbProductId를 함께 적거나, usbVendorId가 없으면(빈 필터 {}·usbProductId만) TypeError.
 * - 고른 포트가 없거나 학생이 창을 닫으면 NotFoundError("No port selected by the user.").
 * - 한 번 고른 포트는 getPorts()가 돌려준다(forget() 전까지). connect·disconnect 이벤트는 허락한 포트만, event.target은 그 포트.
 * 흉내 모델: 선택 창은 chooser(없으면 조건에 맞는 첫 포트)가 대신 고른다. 잊은(forget) 포트를 다시 고르면 같은 객체를 돌려준다(실물은 새 객체).
 * 테스트 도구다(배포 번들에 들어가지 않음).
 */
import { MockSerialPort } from './mock-port.ts';

export interface FakeSerialOptions {
  /** 컴퓨터에 꽂힌 포트(선택 창 후보) */
  readonly ports?: readonly MockSerialPort[];
  /** 처음부터 허락된 포트(getPorts가 돌려줌) */
  readonly granted?: readonly MockSerialPort[];
  /** requestPort가 사용자 조작을 요구하는지(기본: navigator.userActivation이 있으면 true) */
  readonly requireUserActivation?: boolean;
}

export type PortChooser = (candidates: readonly MockSerialPort[], options: SerialPortRequestOptions) => MockSerialPort | null | undefined;

function domError(name: string, message: string): Error {
  if (typeof DOMException === 'function') {
    return new DOMException(message, name);
  }
  const error = new Error(message);
  error.name = name;
  return error;
}

function matchesFilter(port: MockSerialPort, filter: SerialPortFilter): boolean {
  const info = port.getInfo();
  if (filter.bluetoothServiceClassId !== undefined) {
    return info.bluetoothServiceClassId === filter.bluetoothServiceClassId;
  }
  if (filter.usbVendorId !== undefined && info.usbVendorId !== filter.usbVendorId) {
    return false;
  }
  if (filter.usbProductId !== undefined && info.usbProductId !== filter.usbProductId) {
    return false;
  }
  return true;
}

function forwardedEvent(type: string, port: MockSerialPort): Event {
  const event = new Event(type, { bubbles: true });
  // 명세: 이벤트는 포트에서 일어나 navigator.serial로 올라간다 — 듣는 쪽이 event.target으로 어느 포트인지 안다
  Object.defineProperty(event, 'target', { configurable: true, get: () => port });
  return event;
}

export class FakeSerial extends EventTarget {
  onconnect: ((this: FakeSerial, event: Event) => void) | null = null;
  ondisconnect: ((this: FakeSerial, event: Event) => void) | null = null;

  /** requestPort에 넘긴 값 기록 */
  readonly requests: SerialPortRequestOptions[] = [];
  /** 선택 창 흉내: 없으면 조건에 맞는 첫 포트, null을 돌려주면 학생이 창을 닫은 것 */
  chooser: PortChooser | null = null;
  requireUserActivation: boolean;

  private readonly ports: MockSerialPort[] = [];
  private readonly granted = new Set<MockSerialPort>();

  constructor(options: FakeSerialOptions = {}) {
    super();
    this.requireUserActivation = options.requireUserActivation ?? FakeSerial.hasUserActivationApi();
    for (const port of options.ports ?? []) {
      this.addPort(port);
    }
    for (const port of options.granted ?? []) {
      this.addPort(port, { granted: true });
    }
    this.addEventListener('connect', (event) => this.onconnect?.call(this, event));
    this.addEventListener('disconnect', (event) => this.ondisconnect?.call(this, event));
  }

  static hasUserActivationApi(): boolean {
    const navigatorLike = (globalThis as { navigator?: { userActivation?: { isActive: boolean } } }).navigator;
    return typeof navigatorLike?.userActivation?.isActive === 'boolean';
  }

  /** 포트를 컴퓨터에 둔다(granted면 이미 허락한 포트) */
  addPort(port: MockSerialPort, options: { granted?: boolean } = {}): MockSerialPort {
    if (!this.ports.includes(port)) {
      this.ports.push(port);
      for (const type of ['connect', 'disconnect']) {
        port.addEventListener(type, () => {
          if (this.granted.has(port) && !port.forgotten) {
            this.dispatchEvent(forwardedEvent(type, port));
          }
        });
      }
    }
    if (options.granted) {
      this.granted.add(port);
    }
    return port;
  }

  /** 다음 requestPort 한 번의 선택: 포트, null(창 닫음) */
  chooseNext(choice: MockSerialPort | null): void {
    const previous = this.chooser;
    this.chooser = () => {
      this.chooser = previous;
      return choice;
    };
  }

  async requestPort(options: SerialPortRequestOptions = {}): Promise<MockSerialPort> {
    this.requests.push(options);
    if (this.requireUserActivation) {
      const activation = (globalThis as { navigator?: { userActivation?: { isActive: boolean } } }).navigator?.userActivation;
      if (activation && !activation.isActive) {
        throw domError('SecurityError', "Failed to execute 'requestPort' on 'Serial': Must be handling a user gesture to show a permission request.");
      }
    }
    const filters = options.filters ?? [];
    for (const filter of filters) {
      if (filter.bluetoothServiceClassId !== undefined) {
        if (filter.usbVendorId !== undefined || filter.usbProductId !== undefined) {
          throw new TypeError("Failed to execute 'requestPort' on 'Serial': A filter cannot specify both bluetoothServiceClassId and usbVendorId or usbProductId.");
        }
      } else if (filter.usbVendorId === undefined) {
        throw new TypeError(
          filter.usbProductId === undefined
            ? "Failed to execute 'requestPort' on 'Serial': A filter must provide a property to filter by."
            : "Failed to execute 'requestPort' on 'Serial': A filter containing a usbProductId must also specify a usbVendorId.",
        );
      }
    }
    const candidates = this.ports.filter((port) => port.connected && (filters.length === 0 || filters.some((filter) => matchesFilter(port, filter))));
    const choice = this.chooser ? this.chooser(candidates, options) : candidates[0];
    if (!choice) {
      throw domError('NotFoundError', "Failed to execute 'requestPort' on 'Serial': No port selected by the user.");
    }
    choice.restorePermission();
    this.granted.add(choice);
    return choice;
  }

  async getPorts(): Promise<MockSerialPort[]> {
    return this.ports.filter((port) => this.granted.has(port) && !port.forgotten);
  }

  /** 테스트용: 둔 포트 전체 */
  allPorts(): readonly MockSerialPort[] {
    return [...this.ports];
  }
}

/**
 * navigator.serial 자리에 가짜를 끼운다(돌려준 함수를 부르면 원래대로). 브라우저·Node 모두에서 된다(Node 22+에는 navigator가 있다).
 * Playwright에서는 tests/e2e/helpers/serial.ts의 installSerialMock(page, 설정)이 이 도구를 묶어 페이지보다 먼저 실행한다.
 */
export function installFakeSerial(serial: FakeSerial, target: object = (globalThis as { navigator?: object }).navigator ?? globalThis): () => void {
  const own = Object.getOwnPropertyDescriptor(target, 'serial');
  Object.defineProperty(target, 'serial', { configurable: true, enumerable: true, get: () => serial });
  return () => {
    if (own) {
      Object.defineProperty(target, 'serial', own);
    } else {
      delete (target as { serial?: unknown }).serial;
    }
  };
}
