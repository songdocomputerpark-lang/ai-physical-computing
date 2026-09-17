// 모의 시리얼 도구(tests/e2e/helpers/serial.ts + src/lab/serial/mock/) 브라우저 확인(병렬 제작 준비 2026-09-17).
// 실제 보드 연결·펌웨어 굽기 구역이 이 도구를 믿고 쓸 수 있도록, 진짜 브라우저(Edge·Chromium)의 스트림·사용자 조작 규칙 위에서 도는지 본다.
//  1. navigator.serial이 가짜로 바뀌고, 클릭 없이 requestPort하면 SecurityError, 클릭 안에서는 CH340 포트를 고른다.
//  2. 페이지 코드가 port.readable·writable로 raw REPL·raw-paste 규약대로 코드를 보내 출력을 받는다(한글 포함) — 조작 도구로 보드 상태를 본다.
//  3. 선을 뽑으면 읽기가 NetworkError로 끝나고 navigator.serial의 disconnect 이벤트 target이 그 포트다.
//  4. granted 포트는 getPorts로 바로 나오고, 새로 고치면 새 보드가 된다. 플러그인(다운로드 모드 처리기)이 묶여 들어간다.
import { expect, test, type Page } from '@playwright/test';
import { withBase } from '../../src/lib/url.ts';
import { ESP32_USB_FILTERS, describeControl, installSerialMock, serialMock, utf8Text } from './helpers/serial.ts';

const HOME = withBase('');

/** 페이지 안에 사이트 코드 흉내(연결 단추 + 읽기 반복)를 만든다 */
async function installProbe(page: Page, filters: SerialPortFilter[]): Promise<void> {
  await page.evaluate((portFilters) => {
    const probe = {
      text: '',
      readError: '',
      events: [] as string[],
      port: null as SerialPort | null,
      reader: null as ReadableStreamDefaultReader<Uint8Array> | null,
      connectResult: null as Promise<string> | null,
      async write(data: string) {
        const writer = probe.port!.writable!.getWriter();
        await writer.write(new TextEncoder().encode(data));
        writer.releaseLock();
      },
      async take(count: number, timeoutMs = 5000) {
        const started = Date.now();
        while (probe.text.length < count) {
          if (Date.now() - started > timeoutMs) {
            throw new Error(`${count}바이트가 오지 않았어요 / 받은 것 ${JSON.stringify(probe.text)}`);
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        const head = probe.text.slice(0, count);
        probe.text = probe.text.slice(count);
        return head;
      },
      async waitFor(ending: string, timeoutMs = 5000) {
        const started = Date.now();
        while (!probe.text.includes(ending)) {
          if (Date.now() - started > timeoutMs) {
            throw new Error(`기다린 글이 오지 않았어요: ${JSON.stringify(ending)} / 받은 것 ${JSON.stringify(probe.text)}`);
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        const end = probe.text.indexOf(ending) + ending.length;
        const head = probe.text.slice(0, end);
        probe.text = probe.text.slice(end);
        return head;
      },
    };
    navigator.serial.addEventListener('disconnect', (event) => {
      probe.events.push(`disconnect:${event.target === probe.port ? 'same-port' : 'other'}`);
    });
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '모의 보드 연결';
    button.dataset.serialProbe = '';
    button.style.cssText = 'position:fixed;top:0;left:0;z-index:99999';
    button.addEventListener('click', () => {
      probe.connectResult = (async () => {
        try {
          const port = await navigator.serial.requestPort({ filters: portFilters });
          probe.port = port;
          await port.open({ baudRate: 115200 });
          void (async () => {
            while (port.readable) {
              const reader = port.readable.getReader();
              probe.reader = reader;
              try {
                for (;;) {
                  const { value, done } = await reader.read();
                  if (done) {
                    break;
                  }
                  for (const byte of value) {
                    probe.text += String.fromCharCode(byte);
                  }
                }
              } catch (error) {
                probe.readError = `${(error as Error).name}: ${(error as Error).message}`;
              } finally {
                reader.releaseLock();
              }
            }
          })();
          const info = port.getInfo();
          return `ok ${info.usbVendorId?.toString(16)}:${info.usbProductId?.toString(16)}`;
        } catch (error) {
          return `${(error as Error).name}`;
        }
      })();
    });
    document.body.prepend(button);
    (globalThis as unknown as { __serialProbe: typeof probe }).__serialProbe = probe;
  }, filters);
}

test.describe('모의 시리얼(navigator.serial 대역)', () => {
  test.describe.configure({ timeout: 60_000 });
  test.skip(({ isMobile }) => Boolean(isMobile), '시험 도구 자체의 확인이라 데스크톱에서 한 번 돌린다.');

  test('클릭 안에서 포트를 고르고 raw REPL·raw-paste로 코드를 돌리며, 선을 뽑으면 NetworkError', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await installSerialMock(page, {
      ports: [
        { id: 'uno', usb: { usbVendorId: 0x2341, usbProductId: 0x0043 }, device: 'text', text: 'not micropython\r\n' },
        { id: 'board', label: 'ESP32(CH340)', micropython: { files: { 'boot.py': '# boot\n' } } },
      ],
    });
    // 1. 사용자 조작 없이 부르면 SecurityError(진짜 브라우저의 navigator.userActivation으로 판단).
    //    page.evaluate는 Playwright가 사용자 조작(userGesture)이 있는 것으로 돌리므로, 문서가 열릴 때 도는 init script에서 부른다.
    await page.addInitScript(() => {
      (globalThis as unknown as { __withoutClick: Promise<string> }).__withoutClick = navigator.serial.requestPort().then(
        () => 'resolved',
        (error: Error) => error.name,
      );
    });
    await page.goto(HOME);
    const board = serialMock(page);
    expect(await board.portIds()).toEqual(['uno', 'board']);
    expect(await page.evaluate(() => (globalThis as unknown as { __withoutClick: Promise<string> }).__withoutClick)).toBe('SecurityError');

    await installProbe(page, ESP32_USB_FILTERS);
    await page.locator('[data-serial-probe]').click();
    expect(await page.evaluate(() => (globalThis as unknown as { __serialProbe: { connectResult: Promise<string> } }).__serialProbe.connectResult)).toBe('ok 1a86:7523');
    expect(await board.requests()).toEqual([{}, { filters: [{ usbVendorId: 0x1a86, usbProductId: 0x7523 }, { usbVendorId: 0x10c4, usbProductId: 0xea60 }] }]);
    expect(await board.isOpen()).toBe(true);
    expect(await board.openLog()).toEqual([{ baudRate: 115200 }]);

    // 2. raw REPL 들어가기(pyboard.enter_raw_repl 순서) → raw-paste로 한글 출력 코드 실행
    const transcript = await page.evaluate(async () => {
      const probe = (globalThis as unknown as { __serialProbe: { write(data: string): Promise<void>; take(count: number): Promise<string>; waitFor(ending: string, timeoutMs?: number): Promise<string>; text: string } }).__serialProbe;
      const bytes = (text: string) => Array.from(new TextEncoder().encode(text), (byte) => String.fromCharCode(byte)).join('');
      await probe.write('\r\x03\x03');
      await new Promise((resolve) => setTimeout(resolve, 50));
      probe.text = '';
      await probe.write('\r\x01');
      await probe.waitFor('raw REPL; CTRL-B to exit\r\n>');
      await probe.write('\x04');
      await probe.waitFor('soft reboot\r\n');
      await probe.waitFor('raw REPL; CTRL-B to exit\r\n>');
      await probe.write('\x05A\x01');
      const header = await probe.take(5);
      const code = "print('안녕, 모의 보드')\nfor i in range(3):\n    print(i * i)\n";
      await probe.write(code);
      await probe.write('\x04');
      await probe.waitFor('\x04');
      const output = await probe.waitFor('\x04');
      const error = await probe.waitFor('\x04');
      await probe.waitFor('>');
      return { header, output, error, expectedOutput: bytes('안녕, 모의 보드\r\n0\r\n1\r\n4\r\n\x04') };
    });
    expect(describeControl(transcript.header)).toBe(describeControl('R\x01\x80\x00\x01'));
    expect(transcript.output).toBe(transcript.expectedOutput);
    expect(utf8Text(transcript.output)).toBe('안녕, 모의 보드\r\n0\r\n1\r\n4\r\n\x04');
    expect(transcript.error).toBe('\x04');
    expect(await board.mode()).toBe('raw');
    expect(await board.executed()).toEqual([
      { via: 'boot.py', code: '# boot\n' },
      { via: 'boot.py', code: '# boot\n' },
      { via: 'raw-paste', code: "print('안녕, 모의 보드')\nfor i in range(3):\n    print(i * i)\n" },
    ]);
    expect(await board.writtenText()).toContain('\r\x01');
    expect(await board.flowControlOverrun()).toBe(0);

    // 3. 선 뽑기: 읽기 반복이 NetworkError로 끝나고 disconnect 이벤트의 target이 고른 포트
    await board.unplug();
    await expect
      .poll(() => page.evaluate(() => (globalThis as unknown as { __serialProbe: { readError: string; events: string[] } }).__serialProbe))
      .toMatchObject({ readError: 'NetworkError: The device has been lost.', events: ['disconnect:same-port'] });
    expect(await page.evaluate(() => (globalThis as unknown as { __serialProbe: { port: SerialPort } }).__serialProbe.port.readable)).toBeNull();
    expect(await board.mode()).toBe('off');
    expect(errors).toEqual([]);
  });

  test('허락된 포트는 getPorts로 바로 나오고, 새로 고치면 새 보드 — 플러그인이 다운로드 모드 처리기를 붙인다', async ({ page }) => {
    await installSerialMock(page, { ports: [{ id: 'board', granted: true, usb: 'cp2102' }] }, { plugins: ['tests/e2e/helpers/serial-plugins/bootloader-echo.ts'] });
    await page.goto(HOME);
    const board = serialMock(page);
    const result = await page.evaluate(async () => {
      const [port] = await navigator.serial.getPorts();
      if (!port) {
        return { error: 'no port' };
      }
      await port.open({ baudRate: 115200 });
      const chunks: number[] = [];
      const reader = port.readable!.getReader();
      const collecting = (async () => {
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) {
              break;
            }
            chunks.push(...value);
          }
        } catch {
          // 닫힘
        }
      })();
      const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      // esptool-js ClassicReset: D0|R1|W100|D1|R0|W50|D0
      await port.setSignals({ dataTerminalReady: false });
      await port.setSignals({ requestToSend: true });
      await pause(100);
      await port.setSignals({ dataTerminalReady: true });
      await port.setSignals({ requestToSend: false });
      await pause(50);
      await port.setSignals({ dataTerminalReady: false });
      await pause(50);
      const writer = port.writable!.getWriter();
      await writer.write(Uint8Array.of(0xc0, 0x00, 0x08, 0xc0));
      writer.releaseLock();
      await pause(50);
      await reader.cancel();
      await collecting;
      reader.releaseLock();
      await port.close();
      return { info: port.getInfo(), text: String.fromCharCode(...chunks) };
    });
    expect(result).toMatchObject({ info: { usbVendorId: 0x10c4, usbProductId: 0xea60 } });
    const received = result.text ?? '';
    expect(received).toContain('waiting for download\r\n');
    expect(received.endsWith('\xc0\x00\x08\xc0')).toBe(true);
    expect(await board.mode()).toBe('bootloader');
    expect(await board.hardResets()).toBe(2);
    expect((await board.signals()).at(-1)).toEqual({ dataTerminalReady: false, requestToSend: false, break: false });

    await page.reload();
    const fresh = serialMock(page);
    expect(await fresh.mode()).toBe('friendly');
    expect(await fresh.hardResets()).toBe(1);
  });
});
