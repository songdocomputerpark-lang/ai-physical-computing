// machine.RTC(내장 실시간 시계)를 실제 Pyodide로 확인하는 단계들 — PLAN §8.3 P3-04, CODE_MAPPING §3.8.1(f051).
// tests/unit/board-i2c/pyodide-rtc.test.ts가 공유 도우미(tests/unit/lab/helpers/pyodide-board-run.mjs --steps=이 파일)로 돌린다.
import fs from 'node:fs';
import path from 'node:path';

const LCD_ENTRY = { part: 'lcd-i2c', id: 'lcd', label: '문자 LCD(16×2)', pins: { sda: 21, scl: 22 }, directions: { sda: 'out', scl: 'out' }, known: true };

export default async function rtcSteps({ step, pyodide, rootDir }) {
  const read = (file) => fs.readFileSync(path.join(rootDir, file), 'utf8');
  pyodide.FS.mkdirTree('/board/lib');
  pyodide.FS.writeFile('/board/lib/i2c_lcd.py', read('examples/esp32/lib/third-party/i2c_lcd.py'));

  // ── 맞추기·읽기: 요일 칸은 쓰지 않음, time과 같은 시계, 가상 시계로 흐름, init의 칸 순서, 넘친 시각, 사용자 메모리 ──
  await step(
    'rtc_basics',
    [
      'from machine import RTC',
      'import time',
      'rtc = RTC()',
      'out = [rtc is RTC(), len(rtc.datetime())]',
      'rtc.datetime((2025, 6, 21, 6, 11, 0, 0, 0))',
      't = rtc.datetime()',
      'out.append(list(t[:7]))',
      'out.append(0 <= t[7] < 500000)',
      'out.append(list(time.localtime()[:7]))',
      'out.append(time.time())',
      'time.sleep(2)',
      'out.append(list(rtc.datetime()[4:7]))',
      // init은 (년, 월, 일, 시, 분, 초, …) 순서이고 마이크로초는 8번째 칸(소스 그대로) — 윤년 2월 29일 밤에서 3월 1일로 넘어간다
      'rtc.init((2024, 2, 29, 23, 59, 58, 0, 900000))',
      't = rtc.datetime()',
      'out.append([list(t[:7]), t[7] >= 900000])',
      'time.sleep_ms(1200)',
      'out.append(list(rtc.datetime()[:7]))',
      'rtc.datetime((2025, 1, 1, 0, 25, 61, 0, 0))',
      'out.append(list(rtc.datetime()[:7]))',
      "out.append([rtc.memory(), rtc.memory(b'hello'), rtc.memory(), rtc.memory(bytearray(2048)) , len(rtc.memory())])",
      'out',
    ].join('\n'),
  );

  // ── 인자 오류는 MicroPython v1.29.0과 같은 종류·문구, 달이 1~12 밖이면 한국어 안내 ──
  await step(
    'rtc_errors',
    [
      'from machine import RTC',
      'rtc = RTC()',
      'def catch(fn):',
      '    try:',
      '        return ["ok", repr(fn())]',
      '    except Exception as error:',
      '        return [type(error).__name__, str(error)]',
      'out = []',
      'out.append(catch(lambda: RTC(0)))',
      'out.append(catch(lambda: rtc.datetime(5)))',
      'out.append(catch(lambda: rtc.datetime((2025, 6, 21))))',
      'out.append(catch(lambda: rtc.datetime((2025.0, 6, 21, 6, 11, 0, 0, 0))))',
      'out.append(catch(lambda: rtc.datetime((2025, 6, 21, 6, 11, 0, 0, 0), 1)))',
      'out.append(catch(lambda: rtc.datetime(date=(2025, 6, 21, 6, 11, 0, 0, 0))))',
      'out.append(catch(lambda: rtc.init()))',
      'out.append(catch(lambda: rtc.memory(bytes(2049))))',
      'out.append(catch(lambda: rtc.memory(5)))',
      'out.append(catch(lambda: rtc.datetime([2025, 13, 1, 0, 0, 0, 0, 0])))',
      'out.append(list(rtc.datetime()[:7]))',
      'rtc.datetime((2025, 0, 1, 0, 0, 0, 0, 0))',
      'out.append(rtc.datetime()[0])',
      'out',
    ].join('\n'),
  );

  // ── 다음 [실행]은 보드를 새로 켠 것 — 맞춘 시각·메모리는 처음으로(이 컴퓨터의 현지 시각에서 출발) ──
  await step('rtc_next_run', ['from machine import RTC', 'import time', '[RTC().memory(), RTC().datetime()[0], time.localtime()[0]]'].join('\n'));

  // ── f051 교과서 코드 그대로: 11:00:00부터 1초마다 LCD에 시각 — 약 4.2초 뒤 [정지](Node에서 LCD 초기화·글자 쓰기에 드는 실제 시간만큼 여유) ──
  await step('f051_lcd_clock', read('examples/esp32/u2/2-1-2-lcd-rtc-clock.py'), { wiring: { parts: [LCD_ENTRY] }, stopAfterMs: 4200 });
}
