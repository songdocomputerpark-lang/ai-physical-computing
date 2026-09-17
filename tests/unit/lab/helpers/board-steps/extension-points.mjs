// 가상 보드 부품 단계 확장 자리(병렬 제작 준비 2026-09-17) — PWM·아날로그 입력·부품 장치·아직 없는 모듈·보드 라이브러리 폴더를 실제 Pyodide로 확인하는 단계들.
// tests/unit/lab/pyodide-board-extension-points.test.ts가 `node --experimental-wasm-jspi pyodide-board-run.mjs <뿌리> --steps=이 파일`로 돌린다.
// 부품 구역(P3-03~P3-05)의 본보기: 공유 도우미(pyodide-board-run.mjs)를 고치지 않고 이 폴더에 자기 단계 파일을 새로 만들고,
// tests/unit/lab/pyodide-board-<부품 또는 기능>.test.ts에서 runBoardSteps('<이 폴더>/<파일>.mjs')로 결과를 읽는다(src/lab/README.md 7.9).
// 받는 도구: step(이름, 코드, { inputs, wiring, during, onMark, stopAfterMs, idle }) — 워커와 같은 순서로 한 번 실행하고 out.steps[이름]에 기록,
// bridge(pushEvent·setValue·requestStop — 화면 흉내), pyodide, out(결과 전체), rootDir.

export default async function extensionPointSteps({ step, bridge }) {
  // PWM: set_pwm → 핀 항목 mode 'pwm'·duty·freq, 켜진 비율이 있으면 1로 읽힘, 평균 전압, Pin(…, 인자)로 다시 정하면 끊김, clear_pwm.
  await step(
    'pwm_core',
    [
      'import apc_board, time',
      'from machine import Pin',
      'B = apc_board.BOARD',
      'B.set_pwm(15, 0.5, 262)',
      'a = list(B.pwm_of(15))',
      'time.sleep_ms(20)',
      'B.set_pwm(15, duty=0.25)',
      'b = list(B.pwm_of(15))',
      'level = Pin(15).value()',
      'mv = B.read_millivolts(15)',
      'Pin(15, Pin.OUT)',
      'c = B.pwm_of(15)',
      'B.set_pwm(4, 0, 1000)',
      'd = Pin(4).value()',
      'B.set_pwm(4, 2.5)',
      'd2 = list(B.pwm_of(4))',
      'B.clear_pwm(4)',
      'e = B.pwm_of(4)',
      'time.sleep_ms(20)',
      '[a, b, level, mv, c, d, d2, e]',
    ].join('\n'),
  );

  // 아날로그 입력: 화면이 {'mv': …}를 걸면 read_millivolts가 그 값, 디지털로는 1.65V 문턱. 실행 중에 바꾼 값은 입력 확인 지점에서 들어온다.
  await step(
    'analog_inputs',
    [
      'import apc_board, apc_runtime, time',
      'from machine import Pin',
      'B = apc_board.BOARD',
      'a = B.read_millivolts(32)',
      'b = Pin(32, Pin.IN).value()',
      'c = Pin(33, Pin.IN).value()',
      "apc_runtime.emit('board.device', {'mark': 'analog'})",
      'time.sleep_ms(30)',
      'd = B.read_millivolts(32)',
      'e = Pin(32).value()',
      'p = Pin(26, Pin.IN, Pin.PULL_UP)',
      '[a, b, c, d, e, B.read_millivolts(25), B.read_millivolts(26)]',
    ].join('\n'),
    {
      inputs: { pins: { 32: { mv: 2381 }, 33: { mv: 1000 } } },
      onMark: () => bridge.pushEvent('board.input', { pin: 32, drive: { mv: 100 } }),
    },
  );

  // 부품 장치: register_part의 factory는 배선의 그 부품마다 실행에 한 번, set_device_state는 16ms로 합쳐 board.device로, 화면 조작은 on_device_input으로.
  await step(
    'device_core',
    [
      'import apc_board, apc_runtime, time',
      'made = []',
      'class Fake:',
      '    def __init__(self, entry):',
      '        self.entry = entry',
      '        self.got = []',
      "        apc_board.on_device_input(entry['id'], self.got.append)",
      'def factory(entry):',
      "    made.append(entry['id'])",
      '    return Fake(entry)',
      "apc_board.register_part('fake-part', factory)",
      "devs = apc_board.wired_devices('fake-part')",
      'devs_all = apc_board.wired_devices()',
      'dev = devs[0][1]',
      'for i in range(5):',
      "    apc_board.set_device_state('f1', 'fake-part', {'n': i, 'lines': ['Hello', str(i)]})",
      'time.sleep_ms(30)',
      "apc_runtime.emit('board.device', {'mark': 'send'})",
      'time.sleep_ms(30)',
      "[made, len(devs), len(devs_all), dev.got, devs[0][0]['pins']]",
    ].join('\n'),
    {
      wiring: { parts: [{ part: 'fake-part', id: 'f1', label: '가짜 부품', pins: { sig: 5 }, directions: { sig: 'out' }, known: true }] },
      onMark: () => bridge.pushEvent('board.device.input', { id: 'f1', data: { text: 'hi' } }),
    },
  );

  // 다음 실행은 장치를 새로 만든다(실행마다 보드를 새로 켬). 실행 전에 보낸 화면 조작은 버린다.
  bridge.pushEvent('board.device.input', { id: 'f1', data: { text: 'before run' } });
  await step(
    'device_new_run',
    ['import apc_board', "devs = apc_board.wired_devices('fake-part')", '[len(devs), devs[0][1].got]'].join('\n'),
    { wiring: { parts: [{ part: 'fake-part', id: 'f1', label: '가짜 부품', pins: { sig: 5 }, directions: { sig: 'out' }, known: true }] } },
  );

  // 아직 없는 모듈은 한국어 안내가 든 ModuleNotFoundError, 파일이 생기면(/board/lib — 화면이 넣는 보드 라이브러리 폴더) 그 파일이 import되고,
  // /board/lib의 라이브러리가 import하는 time은 MicroPython판이다.
  await step(
    'not_yet_and_board_lib',
    [
      // 표에 있는 실제 이름(neopixel·servo_library 등)은 부품 구역이 파일을 더하면 import가 되므로, 시험용 이름을 표에 잠깐 더해 규칙만 본다
      'import importlib, os, apc_board',
      'out = [sorted(apc_board.NOT_YET_MODULES.items())]',
      "apc_board.NOT_YET_MODULES['zz_demo_firmware'] = 'firmware'",
      "apc_board.NOT_YET_MODULES['zz_demo_library'] = 'library'",
      'try:',
      '    import zz_demo_firmware',
      'except ModuleNotFoundError as error:',
      '    out.append([type(error).__name__, error.name, str(error)])',
      'try:',
      '    from zz_demo_library import Thing',
      'except ImportError as error:',
      '    out.append([type(error).__name__, error.name, str(error)])',
      "with open('/board/lib/zz_demo_library.py', 'w') as f:",
      "    f.write('VALUE = 42\\n')",
      "with open('/board/lib/lib_probe.py', 'w') as f:",
      "    f.write('import time\\nHAS_TICKS = hasattr(time, \"ticks_ms\")\\n')",
      'importlib.invalidate_caches()',
      'import zz_demo_library, lib_probe',
      'out.append(zz_demo_library.VALUE)',
      'out.append(lib_probe.HAS_TICKS)',
      "os.remove('/board/lib/zz_demo_library.py')",
      "os.remove('/board/lib/lib_probe.py')",
      "del apc_board.NOT_YET_MODULES['zz_demo_firmware']",
      "del apc_board.NOT_YET_MODULES['zz_demo_library']",
      'out',
    ].join('\n'),
  );
}
