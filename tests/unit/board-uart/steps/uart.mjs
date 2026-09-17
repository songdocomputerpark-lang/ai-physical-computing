// 가상 보드 machine.UART와 USB-UART 변환기(시리얼 창) 흉내를 실제 Pyodide로 확인하는 단계들(P3-05 구역 C).
// tests/unit/board-uart/pyodide-uart.test.ts가 공유 도우미(tests/unit/lab/helpers/pyodide-board-run.mjs --steps=이 파일)로 돌린다.
// 받는 도구: step(이름, 코드, { inputs, wiring, during, onMark, stopAfterMs, idle }), bridge(pushEvent·setValue·requestStop), out(모든 이벤트).
import fs from 'node:fs';
import path from 'node:path';

/** 배선: USB-UART 변환기(변환기 RX ← 보드 TX 17, 변환기 TX → 보드 RX 16) — 화면 parts.ts wiringValue와 같은 모양 */
export const TERMINAL_WIRING = {
  parts: [{ part: 'uart', id: 'uart', label: 'USB-UART 변환기', pins: { rx: 17, tx: 16 }, directions: { rx: 'out', tx: 'in' }, known: true }],
};

function sendFromPanel(bridge, bytes, baud = 'auto') {
  bridge.pushEvent('board.device.input', { id: 'uart', data: { kind: 'send', bytes, baud } });
}

/** 파일 그대로 실행하는 예제에서, 변환기 장치가 생긴 뒤(= 코드의 UART가 만들어짐)에 한 번 보낸다 — 시간 창에 기대지 않는다(README 4.6) */
function sendWhenDeviceReady(out, bridge, bytes, eventsBefore) {
  let sent = false;
  const timer = setInterval(() => {
    if (sent) {
      return;
    }
    const ready = out.events.slice(eventsBefore).some((event) => event.kind === 'board.device' && event.payload && event.payload.id === 'uart');
    if (ready) {
      sent = true;
      setTimeout(() => sendFromPanel(bridge, bytes), 30);
    }
  }, 10);
  return () => clearInterval(timer);
}

export default async function uartSteps({ step, bridge, out, rootDir }) {
  // 1. 만들기·기본값·repr·오류 문구(MicroPython v1.29.0 machine_uart.c)
  await step(
    'uart_basics',
    [
      'from machine import UART, Pin',
      'r = []',
      'u = UART(2, baudrate=9600, tx=17, rx=16)',
      'r.append(repr(u))',
      'r.append(UART(2) is u)',
      'r.append(repr(u))',
      'r.append(repr(UART(1)))',
      'u.init(115200, bits=7, parity=1, stop=2)',
      'r.append(repr(u))',
      'u.init(9600, bits=8, parity=None, stop=1)',
      'r.append(repr(u))',
      'r.append(repr(UART(2, tx=Pin(17), rx=Pin(16))))',
      'r.append([UART.IRQ_RX, UART.IRQ_RXIDLE, UART.IRQ_BREAK, UART.INV_TX, UART.INV_RX, UART.RTS, UART.CTS])',
      'for make in [lambda: UART(3), lambda: UART(2, bits=9), lambda: UART(2, stop=3), lambda: UART(2, tx=24), lambda: UART(2, tx=34), lambda: UART(2, rxbuf=100),',
      '             lambda: UART(0, rxbuf=512), lambda: UART(0).irq(handler=print), lambda: UART(2, 9600, 8, None, 1, 5), lambda: UART(2, baudrate=9600.0),',
      '             lambda: UART(2, invert=1), lambda: UART(), lambda: u.write(5), lambda: u.irq(handler=5), lambda: u.irq(handler=print, trigger=8)]:',
      '    try:',
      '        make()',
      '        r.append("no error")',
      '    except Exception as e:',
      '        r.append(type(e).__name__ + ": " + str(e))',
      'u = UART(2, baudrate=9600, tx=17, rx=16)',
      'r.append([u.write("hello"), u.write(b"ab"), u.write(bytearray([1, 2, 3])), u.write("한글"), u.write(b"abcdef", 2), u.write(b"abcdef", 1, 3)])',
      'r.append([u.any(), u.read(), u.read(4), u.readline(), u.txdone()])',
      'import time',
      'time.sleep_ms(50)',
      'r.append(u.txdone())',
      'u.deinit()',
      'r.append([u.write(b"x"), u.read(), u.txdone()])',
      'try:',
      '    u.any()',
      'except OSError as e:',
      '    r.append([type(e).__name__, list(e.args)])',
      'r',
    ].join('\n'),
    { wiring: TERMINAL_WIRING },
  );

  // 2. 시리얼 창 → 보드: 바이트가 선을 지나는 시간(9600bps에서 1바이트 약 1.04ms)만큼 차례로 받을 칸에 쌓인다.
  //    40바이트(약 42ms)를 보내 곧바로 센 수는 40보다 작고, 기다리면 40이 되며 read()는 한꺼번에 준다(부하가 커도 흔들리지 않게 길게 보낸다).
  const burst = [...Buffer.from('0123456789abcdefghijklmnopqrstuvwxyzABCD')];
  await step(
    'uart_receive_spacing',
    [
      'from machine import UART',
      'import apc_runtime, time',
      'u = UART(2, baudrate=9600, tx=17, rx=16)',
      "apc_runtime.emit('board.device', {'mark': 'ready'})",
      'first = u.any()',
      'time.sleep_ms(80)',
      'later = u.any()',
      'data = u.read()',
      '[first, later, data, u.read(), u.any()]',
    ].join('\n'),
    { wiring: TERMINAL_WIRING, onMark: () => sendFromPanel(bridge, burst) },
  );

  // 3. readline: 줄바꿈까지 → 나머지는 줄바꿈이 없어도 받은 만큼. read(n)·readinto는 한 번에 "지금 도착한 만큼"(timeout_char 0 — 다음 바이트는 약 1ms 뒤라
  //    한 바이트), read()는 timeout(가상 시계)만큼 더 기다리며 모두. 받을 것이 없으면 timeout만큼 기다린 뒤 None.
  await step(
    'uart_readline_timeout',
    [
      'from machine import UART',
      'import apc_runtime, time',
      'u = UART(2, baudrate=9600, tx=17, rx=16, timeout=300)',
      "apc_runtime.emit('board.device', {'mark': 'ready'})",
      'first = u.readline()',
      'second = u.readline()',
      'buf = bytearray(4)',
      "apc_runtime.emit('board.device', {'mark': 'more'})",
      'got = u.readinto(buf)',
      'one = u.read(10)',
      'rest = u.read()',
      't0 = time.ticks_ms()',
      'none = u.read(1)',
      'waited = time.ticks_diff(time.ticks_ms(), t0)',
      '[first, second, got, bytes(buf), one, rest, none, waited >= 300, waited < 1000]',
    ].join('\n'),
    {
      wiring: TERMINAL_WIRING,
      onMark: (mark) => {
        if (mark === 'ready') {
          sendFromPanel(bridge, [...Buffer.from('ab\ncd')]);
        } else {
          sendFromPanel(bridge, [...Buffer.from('WXYZ12')]);
        }
      },
    },
  );

  // 4. 속도가 다르면 비트 단위로 깨진다(보드 115200bps, 시리얼 창 9600bps — 느린 글자 하나가 빠른 받는 쪽에는 여러 바이트로 읽힌다)
  await step(
    'uart_baud_mismatch',
    [
      'from machine import UART',
      'import apc_runtime, time',
      'u = UART(2, baudrate=115200, tx=17, rx=16)',
      "apc_runtime.emit('board.device', {'mark': 'ready'})",
      't0 = time.ticks_ms()',
      'while u.any() == 0 and time.ticks_diff(time.ticks_ms(), t0) < 3000:',
      '    time.sleep_ms(10)',
      'time.sleep_ms(30)',
      'data = u.read()',
      "u.write('hi')",
      'time.sleep_ms(30)',
      '[data, data != b"1"]',
    ].join('\n'),
    { wiring: TERMINAL_WIRING, onMark: () => sendFromPanel(bridge, [...Buffer.from('1')], 9600) },
  );

  // 5. 보드 → 시리얼 창: write가 변환기의 "받은 글자"(rxTail)에 쌓인다. UART 핀을 Pin()으로 다시 정하면 끊기고 한 번 알린다.
  await step(
    'uart_tx_and_takeover',
    [
      'from machine import UART, Pin',
      'import time',
      'u = UART(2, baudrate=9600, tx=17, rx=16)',
      "u.write('hello world')",
      'time.sleep_ms(30)',
      'Pin(17, Pin.OUT)',
      "u.write('lost')",
      'time.sleep_ms(30)',
      '"done"',
    ].join('\n'),
    { wiring: TERMINAL_WIRING },
  );

  // 6. 핀을 엇갈리게 적음(tx=16, rx=17 — 3단원 원본의 방향): UART 전용 한국어 안내 한 번, 보낸 글자는 변환기에 닿지 않음
  await step(
    'uart_crossed_pins',
    ['from machine import UART', 'import time', 'u = UART(2, baudrate=115200, tx=16, rx=17)', "u.write('a')", 'time.sleep_ms(20)', '"done"'].join('\n'),
    { wiring: TERMINAL_WIRING },
  );

  // 7. irq(IRQ_RX): 바이트가 들어오면 콜백(입력 확인 지점에서)
  await step(
    'uart_irq',
    [
      'from machine import UART',
      'import apc_runtime, time',
      'hits = []',
      'u = UART(2, baudrate=9600, tx=17, rx=16)',
      'irq = u.irq(handler=lambda uart: hits.append(uart is u), trigger=UART.IRQ_RX)',
      "apc_runtime.emit('board.device', {'mark': 'ready'})",
      't0 = time.ticks_ms()',
      'while not hits and time.ticks_diff(time.ticks_ms(), t0) < 3000:',
      '    time.sleep_ms(10)',
      '[hits[:1], irq.trigger(), repr(u).endswith("irq=1)")]',
    ].join('\n'),
    { wiring: TERMINAL_WIRING, onMark: () => sendFromPanel(bridge, [65]) },
  );

  // 8·9. 원본 f001(글자 '2' → 빨강)·f007(바이트 3 → 초록)을 파일 그대로. PWM은 import만 하므로(구역 A 전) 시험용 PWM 자리를 잠깐 더한다.
  const fakePwm = [
    'import apc_board',
    'if "PWM" not in apc_board.machine_exports():',
    '    class _TestPwm:',
    '        def __init__(self, *a, **k): pass',
    "    apc_board.register_machine_export('PWM', _TestPwm)",
    '"ok"',
  ].join('\n');
  await step('fake_pwm_for_import', fakePwm);
  for (const [name, file, bytes] of [
    ['f001_text_2', 'examples/esp32/hw/uart2-rgb-text.py', [50]],
    ['f007_bytes_3', 'examples/esp32/hw/uart2-rgb-bytes.py', [3]],
  ]) {
    const code = fs.readFileSync(path.join(rootDir, file), 'utf8');
    const eventsBefore = out.events.length;
    const stopSending = sendWhenDeviceReady(out, bridge, bytes, eventsBefore);
    await step(name, code, {
      wiring: {
        parts: [
          ...TERMINAL_WIRING.parts,
          { part: 'rgb-led', id: 'rgb', label: 'RGB LED', pins: { r: 23, g: 25, b: 26 }, known: false },
        ],
      },
      stopAfterMs: 2500,
    });
    stopSending();
  }
}
