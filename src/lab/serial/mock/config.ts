/**
 * 모의 시리얼 한 벌을 설정(JSON)으로 만든다 — Node 테스트와 Playwright(브라우저에 끼우는 스크립트)가 같은 모양을 쓴다(병렬 제작 준비 2026-09-17).
 *
 *   const kit = createSerialMock({ ports: [{ id: 'board', device: 'micropython', micropython: { files: { 'main.py': '…' } } }] });
 *   installFakeSerial(kit.serial);                // navigator.serial 자리에
 *   const port = await navigator.serial.requestPort();
 *
 * 설정은 JSON으로 넘길 수 있는 값만 쓴다(브라우저로 보내야 해서). 함수(MockScript.run·처리기)는 Node 테스트에서 kit.devices의 장치에 직접,
 * 브라우저에서는 page.evaluate 안에서 window.__apcSerialMock.device(id)로 붙인다.
 * 테스트 도구다(배포 번들에 들어가지 않음).
 */
import { EchoDevice, SilentDevice, TextDevice, type SerialDevice, type SerialLineSignals } from './device.ts';
import { FakeSerial } from './fake-serial.ts';
import { MicroPythonDevice, type BootloaderHandler, type MicroPythonDeviceOptions, type MockScript } from './micropython-device.ts';
import { MockSerialPort, USB_IDS } from './mock-port.ts';

export interface SerialMockPortConfig {
  /** 테스트가 부르는 이름 */
  readonly id: string;
  readonly label?: string;
  /** 기본 CH340(1a86:7523). 'ch340' | 'cp2102' | 직접 { usbVendorId, usbProductId } */
  readonly usb?: 'ch340' | 'cp2102' | SerialPortInfo;
  /** 처음부터 허락된 포트(getPorts가 돌려줌, 기본 false) */
  readonly granted?: boolean;
  /** 컴퓨터에 꽂혀 있는지(기본 true) */
  readonly plugged?: boolean;
  /** 장치: micropython(기본) | silent(응답 없음 — 펌웨어 없음) | text(다른 펌웨어) | echo | none */
  readonly device?: 'micropython' | 'silent' | 'text' | 'echo' | 'none';
  /** device 'text'가 보낼 글 */
  readonly text?: string;
  readonly micropython?: Omit<MicroPythonDeviceOptions, 'onBootloader'>;
  /** open()이 실패할 DOMException 이름(예: 'NetworkError' — 다른 프로그램이 쓰는 중) */
  readonly openError?: string;
  readonly chunkSize?: number;
  readonly deliveryDelayMs?: number;
}

export interface SerialMockConfig {
  /** 포트들(없으면 MicroPython이 든 CH340 보드 하나, id 'board') */
  readonly ports?: readonly SerialMockPortConfig[];
  /** requestPort가 클릭 같은 사용자 조작을 요구하는지(기본: 브라우저면 true) */
  readonly requireUserActivation?: boolean;
}

export interface SerialMockKit {
  readonly serial: FakeSerial;
  readonly ports: ReadonlyMap<string, MockSerialPort>;
  readonly devices: ReadonlyMap<string, SerialDevice | null>;
}

export const DEFAULT_SERIAL_MOCK_CONFIG: SerialMockConfig = Object.freeze({
  ports: Object.freeze([Object.freeze({ id: 'board', label: 'ESP32(CH340)', device: 'micropython' as const })]),
});

function deviceFor(config: SerialMockPortConfig): SerialDevice | null {
  switch (config.device ?? 'micropython') {
    case 'silent':
      return new SilentDevice();
    case 'text':
      return new TextDevice(config.text ?? 'Hello from another firmware\r\n');
    case 'echo':
      return new EchoDevice();
    case 'none':
      return null;
    default:
      return new MicroPythonDevice(config.micropython ?? {});
  }
}

function usbInfo(config: SerialMockPortConfig): SerialPortInfo {
  if (config.usb === 'cp2102') {
    return { ...USB_IDS.cp2102 };
  }
  if (config.usb && typeof config.usb === 'object') {
    return { ...config.usb };
  }
  return { ...USB_IDS.ch340 };
}

export function createSerialMock(config: SerialMockConfig = DEFAULT_SERIAL_MOCK_CONFIG): SerialMockKit {
  const serial = new FakeSerial(config.requireUserActivation === undefined ? {} : { requireUserActivation: config.requireUserActivation });
  const ports = new Map<string, MockSerialPort>();
  const devices = new Map<string, SerialDevice | null>();
  for (const portConfig of config.ports ?? DEFAULT_SERIAL_MOCK_CONFIG.ports ?? []) {
    if (ports.has(portConfig.id)) {
      throw new Error(`모의 시리얼 포트 id "${portConfig.id}"이(가) 겹쳐요.`);
    }
    const device = deviceFor(portConfig);
    const port = new MockSerialPort({
      info: usbInfo(portConfig),
      device,
      label: portConfig.label ?? portConfig.id,
      openError: portConfig.openError ?? null,
      ...(portConfig.chunkSize === undefined ? {} : { chunkSize: portConfig.chunkSize }),
      ...(portConfig.deliveryDelayMs === undefined ? {} : { deliveryDelayMs: portConfig.deliveryDelayMs }),
    });
    serial.addPort(port, { granted: portConfig.granted === true });
    if (portConfig.plugged === false) {
      port.unplug();
    }
    ports.set(portConfig.id, port);
    devices.set(portConfig.id, device);
  }
  return { serial, ports, devices };
}

/** 브라우저 테스트가 page.evaluate로 부르는 조작·관찰 도구(window.__apcSerialMock) — 돌려주는 값은 모두 JSON으로 옮길 수 있다 */
export interface SerialMockController {
  portIds(): string[];
  /** 호스트(사이트)가 그 포트에 쓴 바이트 전체(0~255 글자 — \x03 같은 제어 글자 그대로) */
  writtenText(id: string): string;
  /** 장치가 호스트에게 보낸 바이트 전체(0~255 글자) */
  deliveredText(id: string): string;
  /** 보드 파일 { 경로: 글자 } */
  files(id: string): Record<string, string>;
  setFile(id: string, path: string, text: string): void;
  /** 보드 상태(MicroPython: off·reset-held·booting·friendly·paste·raw·raw-paste·running·bootloader, 그 밖 장치는 custom, 없으면 none) */
  mode(id: string): string;
  /** 보드가 실행한 코드 기록 */
  executed(id: string): { via: string; code: string }[];
  /** machine.Pin으로 쓴 값 { GPIO: 0|1 } */
  pins(id: string): Record<string, number>;
  /** 선 상태 기록(open·setSignals·close마다) */
  signals(id: string): SerialLineSignals[];
  openLog(id: string): SerialOptions[];
  isOpen(id: string): boolean;
  requests(): SerialPortRequestOptions[];
  /** 다음 선택 창: 포트 id 또는 null(학생이 창을 닫음) */
  chooseNext(id: string | null): void;
  plug(id: string): void;
  unplug(id: string): void;
  /** 장치 → 호스트로 글을 바로 보낸다 */
  send(id: string, text: string): void;
  reset(id: string, kind: 'hard' | 'soft'): Promise<void>;
  /** JSON 모양 응답을 더한다(match는 정규식 글자) */
  addScript(id: string, script: MockScript): void;
  flowControlOverrun(id: string): number;
  hardResets(id: string): number;
  softResets(id: string): number;
  /** 페이지 안 evaluate에서만: 장치 객체(MicroPythonDevice면 addScript·setBootloaderHandler에 함수를 넘길 수 있다) */
  device(id: string): SerialDevice | null;
  port(id: string): MockSerialPort;
  /** 페이지 안 evaluate에서만: 다운로드 모드 바이트 처리기 */
  setBootloaderHandler(id: string, handler: BootloaderHandler | null): void;
}

export function createSerialMockController(kit: SerialMockKit): SerialMockController {
  const port = (id: string): MockSerialPort => {
    const found = kit.ports.get(id);
    if (!found) {
      throw new Error(`모의 시리얼 포트 "${id}"이(가) 없어요. 있는 포트: ${[...kit.ports.keys()].join(', ')}`);
    }
    return found;
  };
  const micropython = (id: string): MicroPythonDevice => {
    const device = kit.devices.get(id);
    if (!(device instanceof MicroPythonDevice)) {
      throw new Error(`모의 시리얼 포트 "${id}"의 장치가 MicroPython이 아니에요.`);
    }
    return device;
  };
  return {
    portIds: () => [...kit.ports.keys()],
    writtenText: (id) => port(id).writtenText(),
    deliveredText: (id) => port(id).deliveredText(),
    files: (id) => micropython(id).files.snapshot(),
    setFile: (id, path, text) => micropython(id).files.write(path, text),
    mode: (id) => {
      port(id);
      const device = kit.devices.get(id);
      return device instanceof MicroPythonDevice ? device.mode : device ? 'custom' : 'none';
    },
    executed: (id) => micropython(id).executed.map((item) => ({ via: item.via, code: item.code })),
    pins: (id) => Object.fromEntries([...micropython(id).pins.entries()].map(([gpio, value]) => [String(gpio), value])),
    signals: (id) => port(id).signalLog.map((item) => ({ ...item })),
    openLog: (id) => port(id).openLog.map((item) => ({ ...item })),
    isOpen: (id) => port(id).isOpen,
    requests: () => kit.serial.requests.map((item) => JSON.parse(JSON.stringify(item)) as SerialPortRequestOptions),
    chooseNext: (id) => kit.serial.chooseNext(id === null ? null : port(id)),
    plug: (id) => port(id).plug(),
    unplug: (id) => port(id).unplug(),
    send: (id, text) => micropython(id).send(text),
    reset: async (id, kind) => {
      const device = micropython(id);
      await (kind === 'hard' ? device.hardReset('pin') : device.softReset());
    },
    addScript: (id, script) => micropython(id).addScript(script),
    flowControlOverrun: (id) => micropython(id).flowControlOverrun,
    hardResets: (id) => micropython(id).hardResets,
    softResets: (id) => micropython(id).softResets,
    device: (id) => {
      port(id);
      return kit.devices.get(id) ?? null;
    },
    port,
    setBootloaderHandler: (id, handler) => micropython(id).setBootloaderHandler(handler),
  };
}
