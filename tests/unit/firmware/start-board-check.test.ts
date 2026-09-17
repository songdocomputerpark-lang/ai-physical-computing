// 보드 준비 페이지 [보드 연결](연결 확인)의 순서(src/components/start/board/board-check.ts)를 모의 시리얼로 확인한다(PLAN §8.3 P3-10).
// 열기 → MicroPython 판별 → 내장 LED 세 번 → 닫기, 대답 없는 보드·다른 프로그램이 쓰는 포트·선 뽑기·펌웨어 굽기에 포트 넘겨주기.
// 모의 보드에서 된 것은 실물의 증거가 아니다(PLAN 부록 B-2, 운영자 할 일 2번).
import { afterEach, describe, expect, it } from 'vitest';
import { BLINK_TEST_CODE, BLINK_TEST_DONE_TEXT, BoardCheck, type BoardCheckStep } from '../../../src/components/start/board/board-check.ts';
import { requestSerialPortRelease } from '../../../src/lab/firmware/port-release.ts';
import type { ReplTiming } from '../../../src/lab/serial/raw-repl.ts';
import { FakeSerial, MicroPythonDevice, MockSerialPort, SilentDevice, USB_IDS, type SerialDevice } from '../../../src/lab/serial/mock/index.ts';

/** 모의 보드는 몇 밀리초 안에 답한다 — 실물 기준 기본값을 줄이되, 느린 러너에서도 흔들리지 않게 넉넉히(구역 E 테스트와 같은 생각) */
const FAST_TIMING: Partial<ReplTiming> = Object.freeze({
  quietMs: 40,
  settleMaxMs: 400,
  bannerTimeoutMs: 1000,
  enterRawTimeoutMs: 1000,
  softRebootTimeoutMs: 2000,
  bootTimeoutMs: 1200,
  pasteReplyTimeoutMs: 2000,
  windowTimeoutMs: 3000,
  ackTimeoutMs: 3000,
  promptTimeoutMs: 3000,
  rawChunkDelayMs: 1,
  stopRetryMs: 150,
  stopAttempts: 4,
});

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const cleanups: (() => Promise<void> | void)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

function setup(device: SerialDevice | null, portOptions: { info?: SerialPortInfo; openError?: string } = {}) {
  const port = new MockSerialPort({ device, ...(portOptions.info ? { info: portOptions.info } : {}), ...(portOptions.openError ? { openError: portOptions.openError } : {}) });
  const serial = new FakeSerial({ ports: [port], requireUserActivation: false });
  const releaseTarget = new EventTarget();
  const steps: BoardCheckStep[] = [];
  const check = new BoardCheck({ serial, timing: FAST_TIMING, releaseTarget, onStep: (step) => steps.push(step) });
  cleanups.push(async () => {
    check.dispose();
    await sleep(20);
    port.unplug();
  });
  return { port, serial, check, steps, releaseTarget };
}

async function waitFor(condition: () => boolean, timeoutMs = 10_000): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('기다리던 상태가 오지 않았어요.');
    }
    await sleep(10);
  }
}

describe('BoardCheck — 보드 준비 페이지 연결 확인', () => {
  it('MicroPython 보드: 열기 → 판별 → 내장 LED(GPIO2) 세 번 → 닫기, 결과에 배너·USB 칩', async () => {
    const device = new MicroPythonDevice();
    const { port, serial, check, steps } = setup(device);
    const chosen = await serial.requestPort();
    const result = await check.check(chosen);
    expect(result).toMatchObject({
      kind: 'ready',
      port: { kind: 'usb', chip: 'CH340', usbId: '1a86:7523', text: 'CH340(WCH) · USB 1a86:7523' },
      banner: { version: 'v1.29.0', machine: 'Generic ESP32 module with ESP32' },
      firmware: 'same',
      esp32: true,
      blink: { outcome: 'ok', errorLine: null },
    });
    expect(result.kind === 'ready' && result.blink.stdout).toContain(BLINK_TEST_DONE_TEXT);
    expect(steps).toEqual(['opening', 'checking', 'blinking', 'closing']);
    // 시험 코드가 보드에서 돌았고(보드에 저장하지 않음), LED는 꺼진 채 끝났다
    expect(device.executed.some((item) => item.code.includes('led = Pin(2, Pin.OUT)'))).toBe(true);
    expect(device.pins.get(2)).toBe(0);
    expect(device.files.snapshot()['main.py'] ?? null).toBeNull();
    // 확인이 끝나면 포트를 닫는다(펌웨어 굽기·실습실이 곧바로 열 수 있게)
    expect(port.isOpen).toBe(false);
    expect(check.running).toBe(false);
    // 포트 선택 창을 거르지 않는다(PLAN P3-10 "VID·PID는 보조 정보로만")
    expect(serial.requests).toEqual([{}]);
  }, 30_000);

  it('시험 코드는 끝나는 코드이고 GPIO2만 쓴다', () => {
    expect(BLINK_TEST_CODE).toContain('Pin(2, Pin.OUT)');
    expect(BLINK_TEST_CODE).not.toMatch(/while\s+True/u);
    expect(BLINK_TEST_CODE).toContain('time.sleep_ms(300)');
    expect(BLINK_TEST_CODE).toContain(`print('${BLINK_TEST_DONE_TEXT}')`);
    expect(BLINK_TEST_CODE).not.toMatch(/open\(|os\.|main\.py/u);
  });

  it('옛 펌웨어·ESP32가 아닌 보드·CP210x는 결과에 보조 정보로 담는다', async () => {
    const { serial, check } = setup(new MicroPythonDevice({ version: 'v1.22.2', machine: 'Generic ESP32 module with ESP32' }), { info: { ...USB_IDS.cp2102 } });
    const result = await check.check(await serial.requestPort());
    expect(result).toMatchObject({ kind: 'ready', firmware: 'older', esp32: true, port: { chip: 'CP210x' }, blink: { outcome: 'ok' } });

    const other = setup(new MicroPythonDevice({ machine: 'Raspberry Pi Pico with RP2040' }));
    expect(await other.check.check(await other.serial.requestPort())).toMatchObject({ kind: 'ready', esp32: false });
  }, 40_000);

  it('대답 없는 보드(펌웨어 없음·다른 포트) → no-micropython(silent), LED 시험 없이 닫는다', async () => {
    const { port, serial, check, steps } = setup(new SilentDevice());
    const result = await check.check(await serial.requestPort());
    expect(result).toMatchObject({ kind: 'no-micropython', verdict: { kind: 'silent' }, port: { chip: 'CH340' } });
    expect(steps).not.toContain('blinking');
    expect(port.isOpen).toBe(false);
  }, 30_000);

  it('다른 프로그램이 포트를 쓰는 중(열기 NetworkError) → port-in-use', async () => {
    const { serial, check } = setup(new MicroPythonDevice(), { openError: 'NetworkError' });
    expect(await check.check(await serial.requestPort())).toMatchObject({ kind: 'port-in-use' });
    expect(check.running).toBe(false);
  });

  it('LED 시험 도중 USB 선이 빠지면 lost', async () => {
    const { port, serial, check, steps } = setup(new MicroPythonDevice());
    const pending = check.check(await serial.requestPort());
    await waitFor(() => steps.includes('blinking'));
    await sleep(150);
    port.unplug();
    expect(await pending).toMatchObject({ kind: 'lost' });
    expect(check.running).toBe(false);
  }, 30_000);

  it('확인하는 도중 같은 페이지의 펌웨어 굽기가 포트를 달라고 하면 멈추고 닫은 뒤 released', async () => {
    const { port, serial, check, steps, releaseTarget } = setup(new MicroPythonDevice());
    const pending = check.check(await serial.requestPort());
    await waitFor(() => steps.includes('blinking'));
    const released = await requestSerialPortRelease('firmware', { target: releaseTarget, timeoutMs: 5000 });
    expect(released).toBe(1);
    // 굽기가 기다리기를 마친 때에는 포트가 닫혀 있다
    expect(port.isOpen).toBe(false);
    expect(await pending).toMatchObject({ kind: 'released' });
    // 확인이 끝나면 더 듣지 않는다
    expect(await requestSerialPortRelease('firmware', { target: releaseTarget })).toBe(0);
  }, 30_000);

  it('판별하는 도중에 포트를 달라고 해도 released로 끝나고 포트가 닫힌다', async () => {
    const { port, serial, check, steps, releaseTarget } = setup(new SilentDevice());
    const pending = check.check(await serial.requestPort());
    await waitFor(() => steps.includes('checking'));
    await requestSerialPortRelease('firmware', { target: releaseTarget, timeoutMs: 5000 });
    expect(port.isOpen).toBe(false);
    expect(await pending).toMatchObject({ kind: 'released' });
  }, 30_000);

  it('확인하는 중에 한 번 더 부르면 거절한다', async () => {
    const { serial, check } = setup(new MicroPythonDevice());
    const port = await serial.requestPort();
    const first = check.check(port);
    await expect(check.check(port)).rejects.toThrow('확인하는 중');
    await first;
  }, 30_000);
});
