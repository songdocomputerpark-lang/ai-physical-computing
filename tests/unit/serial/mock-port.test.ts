// 모의 SerialPort·navigator.serial(src/lab/serial/mock/mock-port.ts·fake-serial.ts)이 Web Serial 명세의 오류·스트림 규칙대로 움직이는지 확인한다(병렬 제작 준비 2026-09-17).
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEVICE_LOST_MESSAGE,
  EchoDevice,
  FakeSerial,
  MicroPythonDevice,
  MockSerialPort,
  SilentDevice,
  TextDevice,
  USB_IDS,
  createSerialMock,
  createSerialMockController,
  installFakeSerial,
  latin1,
} from '../../../src/lab/serial/mock/index.ts';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function rejection(promise: Promise<unknown>): Promise<{ name: string; message: string }> {
  try {
    await promise;
  } catch (error) {
    return { name: (error as Error).name, message: (error as Error).message };
  }
  throw new Error('거부되지 않았어요');
}

const created: MockSerialPort[] = [];
function portWith(device: ConstructorParameters<typeof MockSerialPort>[0] = {}): MockSerialPort {
  const port = new MockSerialPort(device);
  created.push(port);
  return port;
}

afterEach(() => {
  for (const port of created.splice(0)) {
    port.unplug();
  }
  vi.unstubAllGlobals();
});

describe('MockSerialPort — 명세의 오류', () => {
  it('open 인자 검사(TypeError)와 두 번 열기(InvalidStateError)', async () => {
    const port = portWith();
    expect((await rejection(port.open({} as SerialOptions))).name).toBe('TypeError');
    expect((await rejection(port.open({ baudRate: 0 }))).name).toBe('TypeError');
    expect((await rejection(port.open({ baudRate: 115200, dataBits: 9 } as unknown as SerialOptions))).name).toBe('TypeError');
    expect((await rejection(port.open({ baudRate: 115200, stopBits: 3 } as unknown as SerialOptions))).name).toBe('TypeError');
    expect((await rejection(port.open({ baudRate: 115200, bufferSize: 0 }))).name).toBe('TypeError');
    // esptool-js Transport.connect처럼 나머지를 undefined로 넘기면 기본값
    await port.open({ baudRate: 115200, dataBits: undefined, stopBits: undefined, bufferSize: undefined, parity: undefined, flowControl: undefined });
    expect(port.isOpen).toBe(true);
    expect((await rejection(port.open({ baudRate: 115200 }))).name).toBe('InvalidStateError');
    const second = portWith();
    const first = second.open({ baudRate: 9600 });
    expect((await rejection(second.open({ baudRate: 9600 }))).name).toBe('InvalidStateError');
    await first;
  });

  it('닫힌 포트의 close·setSignals·getSignals는 InvalidStateError, 빈 신호는 TypeError', async () => {
    const port = portWith();
    expect(port.readable).toBeNull();
    expect(port.writable).toBeNull();
    expect((await rejection(port.close())).name).toBe('InvalidStateError');
    expect((await rejection(port.setSignals({ dataTerminalReady: true }))).name).toBe('InvalidStateError');
    expect((await rejection(port.getSignals())).name).toBe('InvalidStateError');
    await port.open({ baudRate: 115200 });
    expect((await rejection(port.setSignals({}))).name).toBe('TypeError');
    expect(await port.getSignals()).toEqual({ dataCarrierDetect: false, clearToSend: false, ringIndicator: false, dataSetReady: false });
  });

  it('잠긴 스트림이 있으면 close는 TypeError, 풀면 닫히고 DTR·RTS가 꺼진다', async () => {
    const port = portWith({ device: new EchoDevice() });
    await port.open({ baudRate: 115200 });
    expect(port.signalLog.at(-1)).toEqual({ dataTerminalReady: true, requestToSend: true, break: false });
    const reader = port.readable!.getReader();
    expect((await rejection(port.close())).name).toBe('TypeError');
    await reader.cancel();
    reader.releaseLock();
    const writer = port.writable!.getWriter();
    expect((await rejection(port.close())).name).toBe('TypeError');
    writer.releaseLock();
    await port.close();
    expect(port.isOpen).toBe(false);
    expect(port.signalLog.at(-1)).toEqual({ dataTerminalReady: false, requestToSend: false, break: false });
  });

  it('while (port.readable) 모양: cancel한 뒤 다시 읽으면 새 스트림, 쓴 것은 장치가 받는다', async () => {
    const port = portWith({ device: new EchoDevice(), chunkSize: 2 });
    await port.open({ baudRate: 115200 });
    const writer = port.writable!.getWriter();
    await writer.write(new TextEncoder().encode('hello'));
    writer.releaseLock();
    const reader = port.readable!.getReader();
    let text = '';
    while (text.length < 5) {
      const { value } = await reader.read();
      expect(value!.length).toBeLessThanOrEqual(2);
      text += latin1(value!);
    }
    expect(text).toBe('hello');
    const firstStream = port.readable;
    await reader.cancel();
    reader.releaseLock();
    expect(port.readable).not.toBe(firstStream);
    expect(port.writtenText()).toBe('hello');
    expect(port.deliveredText()).toBe('hello');
  });

  it('USB 선이 빠지면 읽기는 NetworkError, readable은 null, 다음 쓰기도 NetworkError, close는 성공', async () => {
    const port = portWith({ device: new MicroPythonDevice() });
    const disconnects: Event[] = [];
    port.addEventListener('disconnect', (event) => disconnects.push(event));
    await port.open({ baudRate: 115200 });
    const reader = port.readable!.getReader();
    const pending = reader.read();
    const writable = port.writable!;
    port.unplug();
    const lost = await rejection(pending);
    expect(lost).toEqual({ name: 'NetworkError', message: DEVICE_LOST_MESSAGE });
    reader.releaseLock();
    expect(port.readable).toBeNull();
    expect(port.connected).toBe(false);
    const writer = writable.getWriter();
    expect((await rejection(writer.write(Uint8Array.of(1)))).name).toBe('NetworkError');
    writer.releaseLock();
    expect(port.writable).toBeNull();
    expect(disconnects).toHaveLength(1);
    await port.close();
    expect((await rejection(port.open({ baudRate: 115200 })))).toEqual({ name: 'NetworkError', message: 'Failed to open serial port.' });
    port.plug();
    await port.open({ baudRate: 115200 });
    expect((port.device as MicroPythonDevice).mode).toBe('friendly');
    expect((port.device as MicroPythonDevice).hardResets).toBe(2);
  });

  it('openError로 다른 프로그램이 쓰는 포트를 흉내 낸다', async () => {
    const port = portWith({ openError: 'NetworkError' });
    expect(await rejection(port.open({ baudRate: 115200 }))).toEqual({ name: 'NetworkError', message: 'Failed to open serial port.' });
    expect(port.isOpen).toBe(false);
  });

  it('포트가 열리기 전(같은 작업 차례)에 장치가 낸 출력은 사라진다', async () => {
    const device = new TextDevice('ping\r\n');
    const port = portWith({ device });
    const opening = port.open({ baudRate: 115200 });
    device.receive(Uint8Array.of(0x0d));
    await opening;
    device.receive(Uint8Array.of(0x0d));
    expect(port.deliveredText()).toBe('ping\r\n');
  });
});

describe('FakeSerial(navigator.serial)', () => {
  function twoPorts() {
    const cp = portWith({ info: USB_IDS.cp2102, device: new SilentDevice(), label: 'cp' });
    const ch = portWith({ info: USB_IDS.ch340, device: new SilentDevice(), label: 'ch' });
    const serial = new FakeSerial({ ports: [cp, ch], requireUserActivation: false });
    return { serial, cp, ch };
  }

  it('필터 검사는 명세대로(TypeError), 맞는 포트를 고르고 getPorts에 남긴다', async () => {
    const { serial, ch } = twoPorts();
    expect((await rejection(serial.requestPort({ filters: [{}] }))).name).toBe('TypeError');
    expect((await rejection(serial.requestPort({ filters: [{ usbProductId: 0x7523 }] }))).name).toBe('TypeError');
    expect((await rejection(serial.requestPort({ filters: [{ bluetoothServiceClassId: 0x1101, usbVendorId: 0x1a86 }] }))).name).toBe('TypeError');
    expect(await serial.getPorts()).toEqual([]);
    const chosen = await serial.requestPort({ filters: [{ usbVendorId: 0x1a86, usbProductId: 0x7523 }] });
    expect(chosen).toBe(ch);
    expect(chosen.getInfo()).toEqual({ usbVendorId: 0x1a86, usbProductId: 0x7523 });
    expect(await serial.getPorts()).toEqual([ch]);
    expect(serial.requests).toHaveLength(4);
  });

  it('학생이 선택 창을 닫으면 NotFoundError, 맞는 포트가 없어도 NotFoundError', async () => {
    const { serial } = twoPorts();
    serial.chooseNext(null);
    expect((await rejection(serial.requestPort())).name).toBe('NotFoundError');
    expect((await rejection(serial.requestPort({ filters: [{ usbVendorId: 0x2341 }] }))).name).toBe('NotFoundError');
    const port = await serial.requestPort();
    expect(port.label).toBe('cp');
  });

  it('사용자 조작이 없으면 SecurityError(브라우저의 navigator.userActivation이 있을 때)', async () => {
    vi.stubGlobal('navigator', { userActivation: { isActive: false } });
    const port = portWith();
    const serial = new FakeSerial({ ports: [port] });
    expect(serial.requireUserActivation).toBe(true);
    expect((await rejection(serial.requestPort())).name).toBe('SecurityError');
    vi.stubGlobal('navigator', { userActivation: { isActive: true } });
    expect(await serial.requestPort()).toBe(port);
  });

  it('forget하면 getPorts에서 빠지고 open은 InvalidStateError, 다시 고르면 쓸 수 있다', async () => {
    const { serial, cp } = twoPorts();
    const port = await serial.requestPort();
    expect(port).toBe(cp);
    await port.open({ baudRate: 115200 });
    await port.forget();
    expect(await serial.getPorts()).toEqual([]);
    expect((await rejection(port.open({ baudRate: 115200 }))).name).toBe('InvalidStateError');
    const again = await serial.requestPort();
    await again.open({ baudRate: 115200 });
    expect(again.isOpen).toBe(true);
  });

  it('connect·disconnect 이벤트는 허락한 포트만, event.target은 그 포트', async () => {
    const { serial, cp, ch } = twoPorts();
    await serial.requestPort({ filters: [{ usbVendorId: 0x10c4 }] });
    const seen: { type: string; target: EventTarget | null }[] = [];
    serial.addEventListener('disconnect', (event) => seen.push({ type: event.type, target: event.target }));
    serial.onconnect = (event) => seen.push({ type: event.type, target: event.target });
    ch.unplug();
    cp.unplug();
    cp.plug();
    expect(seen).toEqual([
      { type: 'disconnect', target: cp },
      { type: 'connect', target: cp },
    ]);
  });

  it('installFakeSerial은 navigator.serial 자리에 끼우고 되돌린다', () => {
    const target: { serial?: unknown } = {};
    const serial = new FakeSerial({ requireUserActivation: false });
    const restore = installFakeSerial(serial, target);
    expect(target.serial).toBe(serial);
    restore();
    expect('serial' in target).toBe(false);
  });
});

describe('설정(JSON)으로 한 벌 만들기와 조작 도구', () => {
  it('기본 설정은 MicroPython이 든 CH340 보드 하나', async () => {
    const kit = createSerialMock();
    const port = kit.ports.get('board')!;
    created.push(port);
    expect(port.getInfo()).toEqual({ usbVendorId: 0x1a86, usbProductId: 0x7523 });
    expect(kit.devices.get('board')).toBeInstanceOf(MicroPythonDevice);
    expect(await kit.serial.getPorts()).toEqual([]);
  });

  it('포트 여러 개·허락·꽂힘·장치 종류와 조작 도구', async () => {
    const kit = createSerialMock({
      requireUserActivation: false,
      ports: [
        { id: 'board', granted: true, micropython: { files: { 'main.py': "print('hi')\n" } } },
        { id: 'blank', usb: 'cp2102', device: 'silent' },
        { id: 'arduino', usb: { usbVendorId: 0x2341, usbProductId: 0x0043 }, device: 'text', text: 'arduino\r\n', plugged: false },
      ],
    });
    created.push(...kit.ports.values());
    const mock = createSerialMockController(kit);
    expect(mock.portIds()).toEqual(['board', 'blank', 'arduino']);
    // 전원이 들어오면 main.py가 비동기로 돈다 — 한 작업 차례 뒤에는 보통 REPL
    expect(mock.mode('board')).toBe('running');
    await sleep(10);
    expect(mock.mode('board')).toBe('friendly');
    expect(mock.mode('blank')).toBe('custom');
    expect(mock.files('board')).toEqual({ 'main.py': "print('hi')\n" });
    expect(mock.executed('board')).toEqual([{ via: 'main.py', code: "print('hi')\n" }]);
    expect(await kit.serial.getPorts()).toEqual([kit.ports.get('board')]);
    mock.chooseNext('blank');
    const chosen = await kit.serial.requestPort();
    expect(chosen.getInfo().usbVendorId).toBe(0x10c4);
    expect(kit.serial.allPorts().filter((port) => port.connected)).toHaveLength(2);
    mock.plug('arduino');
    expect(kit.ports.get('arduino')!.connected).toBe(true);
    expect(() => mock.files('blank')).toThrow('MicroPython이 아니에요');
    expect(() => mock.mode('nope')).toThrow('있는 포트: board, blank, arduino');

    const board = kit.ports.get('board')!;
    await board.open({ baudRate: 115200 });
    mock.addScript('board', { match: '^probe$', output: 'probed\n' });
    const writer = board.writable!.getWriter();
    await writer.write(new TextEncoder().encode('\x01probe\x04'));
    writer.releaseLock();
    await sleep(30);
    expect(mock.deliveredText('board')).toContain('OKprobed\r\n\x04\x04>');
    expect(mock.writtenText('board')).toBe('\x01probe\x04');
    expect(mock.openLog('board')).toEqual([{ baudRate: 115200 }]);
    expect(mock.signals('board').at(-1)).toEqual({ dataTerminalReady: true, requestToSend: true, break: false });
    expect(mock.isOpen('board')).toBe(true);
    expect(mock.requests()).toEqual([{}]);
    mock.setFile('board', 'lib/i2c_lcd.py', '# lcd\n');
    expect(Object.keys(mock.files('board'))).toEqual(['lib/i2c_lcd.py', 'main.py']);
    await mock.reset('board', 'soft');
    expect(mock.softResets('board')).toBe(1);
    expect(mock.hardResets('board')).toBe(1);
    expect(mock.flowControlOverrun('board')).toBe(0);
  });

  it('id가 겹치면 알려 준다', () => {
    expect(() => createSerialMock({ ports: [{ id: 'a', device: 'none' }, { id: 'a', device: 'none' }] })).toThrow('겹쳐요');
  });
});
