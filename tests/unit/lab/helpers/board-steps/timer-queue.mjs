// 가상 보드 콜백 대기열과 Timer.deinit — 실제 Pyodide로 확인하는 단계들(2026-09-25, PROGRESS 미해결 181).
// tests/unit/lab/pyodide-board-timer-queue.test.ts가 `node --experimental-wasm-jspi pyodide-board-run.mjs <뿌리> --steps=이 파일`로 돌린다.
//
// 가상 보드는 콜백을 입력 확인 지점에서 몰아서 돌린다. 그래서 "연결 콜백이 상태 LED Timer를 멈추고 LED를 켬" 뒤에
// 그 Timer의 깜빡임 콜백이 이미 대기열에 쌓여 있으면 LED가 다시 꺼졌다(실물은 콜백을 곧바로 돌려 거의 없는 일).
// 대기열 모양을 직접 만들어(연결 콜백 → 깜빡임 콜백 차례) 결과가 흔들리지 않게 본다.

export default async function timerQueueSteps({ step }) {
  // ① 콜백 안에서 deinit하면 그 Timer가 쌓아 둔 콜백은 돌지 않는다. 다른 콜백(여기서는 핀 인터럽트 흉내)은 그대로 돈다.
  await step(
    'deinit_in_callback_drops_queued',
    [
      'import apc_board',
      'from machine import Pin, Timer',
      'led = Pin(12, Pin.OUT)',
      'led.value(0)',
      'other = []',
      't = Timer(0)',
      't.init(period=100, mode=Timer.PERIODIC, callback=lambda _t: led.value(not led.value()))',
      'def on_connect(_arg):',
      '    led.value(1)',
      '    t.deinit()',
      'B = apc_board.BOARD',
      'B.schedule(on_connect, None)',
      'B.schedule(t._core.callback, t)',
      "B.schedule(other.append, 'irq')",
      'B.run_pending()',
      '[led.value(), other, len(B.pending), t.value() >= 0]',
    ].join('\n'),
  );

  // ② 학생 코드(콜백 밖)에서 deinit하면 대기열을 건드리지 않는다 — 이미 울린 콜백은 다음 확인 지점에서 돈다(실물에서는 그 전에 돌았을 콜백).
  await step(
    'deinit_outside_callback_keeps_queue',
    [
      'import apc_board',
      'from machine import Pin, Timer',
      'count = []',
      't = Timer(1)',
      't.init(period=100, mode=Timer.PERIODIC, callback=lambda _t: count.append(1))',
      'B = apc_board.BOARD',
      'B.schedule(t._core.callback, t)',
      't.deinit()',
      'before = len(B.pending)',
      'B.run_pending()',
      '[before, len(count)]',
    ].join('\n'),
  );

  // ③ 보드 라이브러리 ESP32BLE.py 원본 모양: 연결(connected — LED 켜고 Timer 멈춤)이 깜빡임 콜백보다 먼저 쌓여도 LED는 켜진 채다.
  await step(
    'esp32ble_connected_keeps_led_on',
    [
      'import apc_board, time',
      'from machine import Pin, Timer',
      'class Status:',
      '    def __init__(self):',
      '        self.led = Pin(12, Pin.OUT)',
      '        self.timer = Timer(0)',
      '        self.timer.init(period=100, mode=Timer.PERIODIC, callback=lambda t: self.led.value(not self.led.value()))',
      '    def connected(self):',
      '        self.led.value(1)',
      '        self.timer.deinit()',
      's = Status()',
      'B = apc_board.BOARD',
      'B.schedule(lambda _a: s.connected(), None)',
      'B.schedule(s.timer._core.callback, s.timer)',
      'B.run_pending()',
      'first = s.led.value()',
      'time.sleep_ms(350)',
      '[first, s.led.value()]',
    ].join('\n'),
  );
}
