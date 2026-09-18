// 구역 A(P3-03 PWM·ADC 부품)의 파이썬 쪽 — machine.PWM(ext/pwm/apc_board_pwm.py)·machine.ADC(ext/adc/apc_board_adc.py)·서보 라이브러리(examples/esp32/lib/servo_library.py)·
// 서보 프로필 알림(parts/servo/apc_part_servo.py)을 Node의 실제 Pyodide(JSPI)로 확인한다. 단계는 helpers/board-steps/pwm-adc.mjs.
// 기대값의 근거: MicroPython v1.29.0 ports/esp32/machine_pwm.c·machine_adc.c·py/argcheck.c, ESP-IDF v5.5 ledc.c(2026-09-18 원문 확인), 교과서 원고 139·147·152·174쪽.
// 사이트판(PLAN PD-10) f058·f059(판정 구간)·f062(g 핀 줄)도 원본과 나란히 돌려 본다.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOUCH4_PADS, millivoltsForRaw12, raw12FromMillivolts } from '../../../src/lab/modules/board/parts/touch-analog-4ch/touch4-model.ts';
import { boardPyodideReady, runBoardSteps, stepOf, type BoardStateEvent, type BoardStepRecord } from './helpers/pyodide-board.ts';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

/** PWM()을 주파수 없이 만들었을 때의 기본 주파수(Hz) — src/lab/modules/board/ext/pwm/apc_board_pwm.py의 PWM_FREQ와 같다 */
const PWM_DEFAULT_FREQ = 5000;

/** 단계의 board.state에서 한 핀의 항목 차례(없는 이벤트는 뺌) */
function pinTrail(events: readonly BoardStateEvent[], gpio: number) {
  return events.flatMap((event) => event.pins.filter((pin) => pin.id === gpio).map((pin) => ({ ...pin, reason: event.reason, tMs: Math.round(event.t_us / 1000) })));
}

/** 이어서 같은 값은 한 번만 */
function collapse<T>(values: readonly T[]): T[] {
  return values.filter((value, index) => index === 0 || value !== values[index - 1]);
}

/** f058: OLED 셋째 줄(y=40)의 버튼 글 차례 */
function oledButtons(record: BoardStepRecord): string[] {
  const lines = (record.devices ?? [])
    .filter((device) => device.part === 'oled-i2c')
    .map((device) => ((device.state as { texts?: { y: number; text: string }[] } | undefined)?.texts ?? []).find((item) => item.y === 40)?.text ?? '');
  return collapse(lines.filter((line) => line !== ''));
}

/** f058: RGB LED 핀 12·5·4의 켜짐 차례('100' = 빨강). PWM을 만든 직후의 기본 50%처럼 0도 100%도 아닌 순간은 뺀다 */
function rgbTrail(record: BoardStepRecord): string[] {
  const states = record.events.flatMap((event) => {
    const duties = [12, 5, 4].map((gpio) => event.pins.find((pin) => pin.id === gpio && pin.mode === 'pwm')?.duty);
    if (duties.some((duty) => duty === undefined || (duty > 0 && duty < 0.99))) {
      return [];
    }
    return [duties.map((duty) => (duty! > 0 ? '1' : '0')).join('')];
  });
  return collapse(states);
}

describe.skipIf(!boardPyodideReady)('가상 ESP32 보드 — machine.PWM·machine.ADC·서보 라이브러리(실제 Pyodide, JSPI)', () => {
  const out = runBoardSteps('tests/unit/lab/helpers/board-steps/pwm-adc.mjs');

  it('확장 파일이 ESP32 실습실 파이썬 파일로 들어가고 이름이 겹치지 않는다', () => {
    expect(out.jspi).toBe(true);
    expect(out.duplicate).toBeUndefined();
    expect(out.files).toEqual(expect.arrayContaining(['apc_board_pwm.py', 'apc_board_adc.py', 'apc_part_servo.py', 'machine.py']));
  });

  it('PWM 기본값·읽기 값: 새 PWM은 5000Hz·50%, 주파수는 LEDC 나눗수로 되계산한 값, duty(1023)·duty_u16(65535)은 100%, repr은 실물 모양', () => {
    const record = stepOf(out, 'pwm_basics');
    expect(record.errorType).toBeUndefined();
    const value = record.value as unknown[];
    expect(value[0]).toEqual(['PWM(Pin(15), freq=5000, duty_u16=32768)', 5000, 512, 32768]);
    // 262Hz(16비트 해상도, 나눗수 1193) → 262. duty_ns = 512/1024 × (1/262초)
    expect(value[1]).toEqual(['PWM(Pin(15), freq=262, duty=512)', 262, 512, 32768, 1908397]);
    expect(value[2]).toEqual([1023, 65535]);
    expect(value[3]).toEqual([65535, 'PWM(Pin(15), freq=262, duty_u16=65535)']);
    expect(value[4]).toBe(0);
    // 번호만·위치 인자 주파수: 1000Hz는 16비트 해상도에서 나눗수 313이라 998Hz(ESP-IDF ledc_get_freq)
    expect(value[5]).toEqual(['PWM(Pin(27), freq=998, duty=40)', 998]);
    expect(value[6]).toEqual(['PWM(Pin(27), freq=50, duty=40)', 40, 781250]);
    expect(value[7]).toEqual(['PWM(Pin(27), freq=50, duty_ns=1499939)', 4915]);
    // 100kHz는 해상도가 9비트라 duty(1)이 0으로 읽힌다, 10Hz 미만은 1MHz 클럭
    expect(value[8]).toEqual(['PWM(Pin(4), freq=100000, duty=0)', 0]);
    expect(value[9]).toEqual(['PWM(Pin(5), freq=5, duty=512)', 5]);
    expect(value[10]).toBe('PWM(Pin(15))');
    expect(value.slice(11, 16)).toEqual(Array(5).fill('RuntimeError: PWM is inactive'));
    expect(value[16]).toEqual(['PWM(Pin(15), freq=5000, duty=100)', true]);
    // 화면에 가는 핀 항목: mode pwm·켜진 비율·실제 주파수
    const last = record.events.at(-1);
    expect(last?.pins.find((pin) => pin.id === 15)).toMatchObject({ mode: 'pwm', duty: 0.097656, freq: 5000, driven: true, level: 1 });
    expect(last?.pins.find((pin) => pin.id === 27)).toMatchObject({ mode: 'pwm', freq: 50, duty: 0.074997 });
    expect(last?.pins.find((pin) => pin.id === 4)).toMatchObject({ mode: 'pwm', duty: 0, level: 0 });
  });

  it('PWM 오류는 실물과 같은 종류·문구(범위 밖 duty·주파수, 형, 인자 수, 입력 전용 핀, 새 PWM의 duty_ns)', () => {
    const record = stepOf(out, 'pwm_errors');
    expect(record.errorType).toBeUndefined();
    const value = record.value as unknown[];
    const errors = value.slice(0, -1).map((item) => (Array.isArray(item) ? `${item[0]}: ${item[1]}` : item));
    expect(errors).toEqual([
      'ValueError: duty must be from 0 to 1023',
      'ValueError: duty must be from 0 to 1023',
      'ValueError: duty_u16 must be from 0 to 65536',
      'ValueError: duty_u16 must be from 0 to 65536',
      'ValueError: duty_ns must be from 0 to 1000000 ns',
      'ValueError: frequency must be from 1Hz to 40MHz',
      'ValueError: frequency must be from 1Hz to 40MHz',
      "TypeError: can't convert float to int",
      "TypeError: can't convert str to int",
      'OverflowError: overflow converting long int to machine word',
      'TypeError: function expected at most 2 arguments, got 3',
      "TypeError: function doesn't take keyword arguments",
      'TypeError: function takes 1 positional arguments but 2 were given',
      'TypeError: function missing 1 required positional arguments',
      'TypeError: function expected at most 2 arguments, got 3',
      'ValueError: invalid pin',
      'ValueError: duty must be from 0 to 1023',
      'TypeError: extra keyword arguments given',
      'TypeError: extra keyword arguments given',
      "OSError: (-258, 'ESP_ERR_INVALID_ARG')",
      'RuntimeError: PWM is inactive',
      'TypeError: extra positional arguments given',
    ]);
    // OSError의 args는 실물처럼 (-258, 'ESP_ERR_INVALID_ARG')
    expect((value[19] as unknown[])[2]).toEqual([-258, 'ESP_ERR_INVALID_ARG']);
    // 오류가 난 호출은 PWM을 바꾸지 않는다. duty(True)는 1
    expect(value.at(-1)).toEqual(['PWM(Pin(2), freq=998, duty=0)', 0, 998, null, 1]);
    expect(record.notices.join('\n')).toContain('34번 핀은 입력 전용');
  });

  it('LEDC 채널 16개·타이머 8개: 17번째 핀과 9번째 주파수는 실물 소스와 같은 RuntimeError, 같은 주파수는 타이머를 함께 쓴다', () => {
    const channels = stepOf(out, 'pwm_channels_limit');
    expect(channels.errorType).toBeUndefined();
    expect(channels.value).toEqual([[26, 'RuntimeError', 'out of PWM channels:16'], 16]);
    const timers = stepOf(out, 'pwm_timers_limit');
    expect(timers.errorType).toBeUndefined();
    expect(timers.value).toEqual([
      [100, 200, 300, 400, 500, 600, 701, 799],
      'out of PWM channels:16',
      'PWM(Pin(18), freq=100, duty=100)',
      'out of PWM timers:8',
      950,
      'PWM(Pin(17), freq=974, duty=20)',
    ]);
  });

  it('PWM이 켜진 핀을 Pin(…)으로 다시 정하면 신호가 끊기고 같은 객체로는 이어지지 않으며(콘솔 안내 한 번), deinit 뒤 새 PWM은 다시 이어진다. invert는 비율을 뒤집는다', () => {
    const record = stepOf(out, 'pwm_pin_reinit');
    expect(record.errorType).toBeUndefined();
    expect(record.value).toEqual([[0.5, 998], null, [null, 100], [0.25, 1997], [[0.75, 998], 'PWM(Pin(4), freq=998, duty=256, invert=True)'], 1]);
    expect(record.notices.filter((text) => text.includes('PWM 신호가 이 핀에서 끊겼어요'))).toHaveLength(1);
  });

  it('지난 실행에서 만든 PWM 객체는 새 실행(보드를 새로 켬)에서 멈춘 것으로 본다', () => {
    expect(stepOf(out, 'pwm_generation_first').value).toBe('PWM(Pin(15), freq=440, duty_u16=32768)');
    expect(stepOf(out, 'pwm_generation_second').value).toEqual(['PWM(Pin(15))', null, 'PWM is inactive']);
  });

  it('교과서 f060(원본 그대로): 빨강 핀 27의 duty가 0부터 1023까지 한 칸씩 올라 100%에 닿는다(가상 시계로 약 1초에 한 번)', () => {
    const record = stepOf(out, 'textbook_f060_fade');
    expect(record.errorType).toBe('KeyboardInterrupt');
    const duties = pinTrail(record.events, 27).map((pin) => pin.duty as number);
    /*
     * board.state는 16ms 안의 변화를 합쳐 보내므로(P3-11 apc_board.wait_ns) 값이 한 칸씩 다 오지는 않는다 —
     * "줄지 않고 올라가 100%에 거의 닿은 뒤 내려간다"와 "한 칸이 1/1024"만 본다.
     *
     * 원본은 `while True`라 [정지]까지 오르내림을 여러 번 되풀이한다. 그래서 **첫 오름 구간**만 보고 판단한다 —
     * 가장 큰 값을 통째로 찾으면(`indexOf(max)`) 그 값이 첫 회차에서 병합에 삼켜졌을 때 둘째 회차를 가리켜
     * "오름 구간"에 내림이 섞이고, 어느 회차에서 잡히느냐는 컴퓨터가 얼마나 바쁜지에 달려 CI에서 재현 가능하게 실패했다
     * (2026-09-18 P4-01에서 고침 — 같은 파일 f068이 이미 적어 둔 "16ms 병합은 CPU 여유에 달렸다"와 같은 까닭).
     */
    let top = 0;
    while (top + 1 < duties.length && (duties[top + 1] ?? 0) >= (duties[top] ?? 0)) {
      top += 1;
    }
    const peak = duties[top] ?? 0;
    expect(peak).toBeGreaterThan(0.9);
    expect(top).toBeGreaterThan(0);
    const rising = duties.slice(0, top + 1);
    expect(rising.every((duty, index) => index === 0 || duty >= (rising[index - 1] ?? 0))).toBe(true);
    expect(new Set(rising).size).toBeGreaterThan(20);
    expect(rising.every((duty) => Math.abs(duty * 1024 - Math.round(duty * 1024)) < 0.01 || duty === 1)).toBe(true);
    /*
     * 꼭대기(1023 → 100%) 뒤에는 내려간다. [정지]가 꼭대기에서 바로 걸리면 뒤 상태가 없을 수 있으므로(실제 시간에 달림)
     * "뒤 상태가 있으면 내려간다"로 본다 — 단계의 stopAfterMs를 넉넉히 두어 보통은 내림 구간이 들어온다(2026-09-18 검토 반영).
     */
    const after = duties.slice(top + 1);
    expect(after.length === 0 || after.some((duty) => duty < peak)).toBe(true);
    expect(pinTrail(record.events, 32).every((pin) => pin.duty === 0 && pin.freq === 5000)).toBe(true);
  });

  it('교과서 f068(원본 그대로): 버저 핀 15가 262·294·330·349·392·440·494·523Hz를 50%로 내고 deinit으로 끝난다', () => {
    const record = stepOf(out, 'textbook_f068_scale');
    expect(record.errorType).toBeUndefined();
    expect(record.stdout).toBe('도\n레\n미\n파\n솔\n라\n시\n도(높은)\n');
    const tones = pinTrail(record.events, 15)
      .filter((pin) => pin.mode === 'pwm')
      .map((pin) => [pin.freq, pin.duty]);
    /*
     * PWM(Pin(15))을 만든 순간의 기본값(5000Hz·50% — 실물 MicroPython과 같다)이 freq(262) 앞에 한 번 실려 올 수 있다.
     * board.state는 16ms 안의 변화를 합쳐 보내므로 그 상태가 삼켜지느냐가 컴퓨터가 얼마나 바쁜지에 달려 있다
     * (2026-09-18 검토 반영 — 같은 파일 f060 검사가 적어 둔 16ms 병합 규칙을 여기에도 똑같이 적용한다). 있어도 없어도 통과시킨다.
     */
    const played = tones[0]?.[0] === PWM_DEFAULT_FREQ ? tones.slice(1) : tones;
    expect(played).toEqual([262, 294, 330, 349, 392, 440, 494, 523].map((freq) => [freq, 0.5]));
    const end = record.events.at(-1)?.pins.find((pin) => pin.id === 15);
    expect(end?.mode ?? null).toBeNull();
    expect(end).toMatchObject({ driven: false, level: 0 });
    expect(end?.duty).toBeUndefined();
  });

  it('ADC: 기본 감쇠 11dB·12비트, 4채널 터치 패드 전압이 원고 측정값 688·1535·2381·3263으로 읽히고, 해상도·감쇠·read_u16·read_uv가 규칙대로', () => {
    // 화면 부품의 식과 파이썬 ADC의 식이 같다(패드 값 → 전압 → 값)
    expect(TOUCH4_PADS.map((pad) => raw12FromMillivolts(millivoltsForRaw12(pad.raw)))).toEqual([688, 1535, 2381, 3263]);
    const record = stepOf(out, 'adc_basics');
    expect(record.errorType).toBeUndefined();
    const [identity, first, pads, widths, attens, other, reinit, errors] = record.value as unknown[];
    expect(identity).toEqual(['ADC(Pin(32), atten=3)', 0, 1, 2, 3, 9, 12, true, true]);
    expect(first).toEqual([1535, 24565, 1237000]);
    expect(pads).toEqual([688, 1535, 2381, 3263, 0]);
    expect(widths).toEqual([
      [191, 24495],
      [383, 24535],
      [767, 24555],
      [1535, 24565],
    ]);
    expect(attens).toEqual([
      [4095, 950000, 'ADC(Pin(32), atten=0)'],
      [4052, 1237000, 'ADC(Pin(32), atten=1)'],
      [2894, 1237000, 'ADC(Pin(32), atten=2)'],
      [1535, 1237000, 'ADC(Pin(32), atten=3)'],
    ]);
    expect(other).toEqual(['ADC(Pin(33), atten=0)', 4095]);
    expect(reinit).toBe('ADC(Pin(33), atten=3)');
    expect((errors as string[]).slice(0, 10)).toEqual([
      'ValueError: invalid pin',
      'ValueError: invalid pin',
      'ValueError: invalid attenuation',
      'ValueError: invalid bit-width',
      'ValueError: invalid bit-width',
      'TypeError: function missing 1 required positional arguments',
      'TypeError: extra positional arguments given',
      'TypeError: extra keyword arguments given',
      'TypeError: function takes 1 positional arguments but 2 were given',
      'TypeError: function takes 2 positional arguments but 1 were given',
    ]);
    expect((errors as string[])[10]).toMatch(/^ImportError: .*가상 보드에 아직 없어요/u);
    expect((errors as string[])[11]).toBe("TypeError: can't convert float to int");
  });

  it('ADC: 배선에 부품이 없는 핀을 읽으면 0이고 콘솔에 한 번 알린다', () => {
    const record = stepOf(out, 'adc_unwired');
    expect(record.value).toEqual([0, 0]);
    expect(record.notices.filter((text) => text.includes('34번 핀의 아날로그 값을 읽었지만'))).toHaveLength(1);
  });

  it('교과서 f059(원본 그대로): 패드 1·2는 Button 1·2, 원본의 겹친 판정 구간 때문에 패드 3은 Button 2·패드 4는 Button 3으로 나온다', () => {
    const record = stepOf(out, 'textbook_f059_touch4');
    expect(record.errorType).toBe('KeyboardInterrupt');
    const lines = [...new Set(record.stdout.trim().split('\n'))];
    expect(lines).toEqual(['ADC: 0 → No touch', 'ADC: 688 → Button 1', 'ADC: 1535 → Button 2', 'ADC: 2381 → Button 2', 'ADC: 3263 → Button 3']);
  });

  it('사이트판 f059(판정 구간 네 줄만 원고 152쪽 구간으로 고침): 패드 1~4가 Button 1~4로 나오고, 원본과 줄 수가 같다', () => {
    const record = stepOf(out, 'site_f059_touch4');
    expect(record.errorType).toBe('KeyboardInterrupt');
    const lines = [...new Set(record.stdout.trim().split('\n'))];
    expect(lines).toEqual(['ADC: 0 → No touch', 'ADC: 688 → Button 1', 'ADC: 1535 → Button 2', 'ADC: 2381 → Button 3', 'ADC: 3263 → Button 4']);
    const read = (name: string) => fs.readFileSync(path.join(ROOT, 'examples', 'esp32', 'u2', name), 'utf8').split('\n');
    for (const [original, site] of [
      ['2-1-3-adv-touch4-check.py', '2-1-3-adv-touch4-check-site.py'],
      ['2-1-3-adv-touch4-oled-rgb.py', '2-1-3-adv-touch4-oled-rgb-site.py'],
    ]) {
      const [before, after] = [read(original!), read(site!)];
      expect(after.length, site).toBe(before.length);
      const changed = after.flatMap((line, index) => (line === before[index] ? [] : [index]));
      expect(changed.length, site).toBe(4);
      expect(changed.every((index) => after[index]!.includes('# [사이트판]')), site).toBe(true);
    }
  });

  it('교과서 f062: 원본은 첫 반복에서 TypeError(원본 결함), 사이트판(원고 147쪽처럼 g 핀 줄·값 3개)은 레이저 21번과 빨강 27·파랑 33이 1초마다 번갈아 켜진다', () => {
    const original = stepOf(out, 'textbook_f062_laser');
    expect([original.errorType, original.errorMessage]).toEqual(['TypeError', 'TypeError: set_color() takes 2 positional arguments but 3 were given']);
    const site = stepOf(out, 'site_f062_laser');
    expect(site.errorType).toBe('KeyboardInterrupt');
    // 1초 칸마다 마지막으로 보인 [레이저 21, 빨강 27, 초록 32, 파랑 33](바뀌는 도중의 한 순간은 뺀다)
    const bySecond = new Map<number, (number | undefined)[]>();
    for (const event of site.events.filter((item) => item.reason === 'change')) {
      bySecond.set(Math.floor(event.t_us / 1_000_000), [21, 27, 32, 33].map((gpio) => event.pins.find((pin) => pin.id === gpio)?.level));
    }
    expect([...bySecond.entries()].slice(0, 3)).toEqual([
      [0, [1, 1, 0, 0]],
      [1, [0, 0, 0, 1]],
      [2, [1, 1, 0, 0]],
    ]);
  });

  it('교과서 f058(4채널 터치 + OLED + RGB LED PWM): OLED(구역 B)가 있으면 원본은 패드 3만 Button 2(초록), 사이트판은 패드 1~4가 Button 1~4와 빨강·초록·파랑·흰색', () => {
    const original = stepOf(out, 'textbook_f058_touch4_oled');
    const site = stepOf(out, 'site_f058_touch4_oled');
    // 병렬 제작(2026-09-18): OLED 드라이버(구역 B 부품 폴더의 ssd1306.py)가 없으면 실물에 파일이 없을 때처럼 import 줄에서 멈춘다
    if (!fs.existsSync(path.join(ROOT, 'src', 'lab', 'modules', 'board', 'parts', 'oled-i2c', 'ssd1306.py'))) {
      expect(original.errorType).toMatch(/ImportError|ModuleNotFoundError/u);
      expect(site.errorType).toMatch(/ImportError|ModuleNotFoundError/u);
      return;
    }
    expect(original.errorType).toBe('KeyboardInterrupt');
    expect(oledButtons(original)).toEqual(['No touch', 'Button 2', 'No touch']);
    expect(rgbTrail(original)).toEqual(['000', '010', '000']);
    expect(site.errorType).toBe('KeyboardInterrupt');
    expect(oledButtons(site)).toEqual(['No touch', 'Button 1', 'Button 2', 'Button 3', 'Button 4', 'No touch']);
    expect(rgbTrail(site)).toEqual(['000', '100', '010', '001', '111', '000']);
  });

  it('서보 라이브러리(원고 174쪽 복원본)로 f078 원본 그대로: 25번 핀 50Hz에 duty 40·77·115를 1.5초 간격으로, 화면에 프로필 servo40을 알린다', () => {
    const record = stepOf(out, 'servo_library_f078');
    expect(record.errorType).toBeUndefined();
    const trail = pinTrail(record.events, 25).filter((pin) => pin.reason === 'change');
    expect(trail.map((pin) => [pin.freq, Math.round((pin.duty as number) * 1024)])).toEqual([
      [50, 40],
      [50, 77],
      [50, 115],
    ]);
    const gaps = trail.slice(1).map((pin, index) => pin.tMs - (trail[index]?.tMs ?? 0));
    expect(gaps.every((gap) => gap >= 1490 && gap <= 1600)).toBe(true);
    expect(record.devices).toEqual([{ v: 1, id: 'servo', part: 'servo', state: { profile: 'servo40', library: 'servo_library' } }]);
  });

  it('서보 2개(f080): 두 핀이 함께 0°↔180° duty를 내고 두 서보 모두 프로필을 받는다', () => {
    const record = stepOf(out, 'servo_library_f080');
    expect(record.errorType).toBe('KeyboardInterrupt');
    const pairs = record.events.map((event) => [25, 26].map((gpio) => Math.round((event.pins.find((pin) => pin.id === gpio)?.duty ?? -1) * 1024)).join(','));
    expect(pairs).toContain('40,40');
    expect(pairs).toContain('115,115');
    expect(record.devices?.map((device) => device.id)).toEqual(['servo-1', 'servo-2']);
  });

  it('라이브러리 없이 PWM을 쓰면 프로필 알림이 없고(화면 기본 mg90s), mg90s_servo는 mg90s, 파일이 없으면 한국어 안내가 든 ModuleNotFoundError', () => {
    const profiles = stepOf(out, 'servo_profiles');
    expect(profiles.errorType).toBeUndefined();
    expect(profiles.value).toEqual([
      [null, null],
      ['mg90s', 'mg90s_servo'],
    ]);
    const missing = stepOf(out, 'servo_library_missing');
    expect(missing.errorType).toBeUndefined();
    const [type, name, message] = missing.value as string[];
    expect([type, name]).toEqual(['ModuleNotFoundError', 'servo_library']);
    expect(message).toContain('가상 보드에 아직 없어요');
  });

  it('교과서 f073(원본 그대로): 팬 INA·INB가 (1,0) → (0,1) → (0,0)으로 2초씩 바뀐다', () => {
    const record = stepOf(out, 'textbook_f073_fan');
    expect(record.errorType).toBe('KeyboardInterrupt');
    const states = record.events
      .filter((event) => event.reason === 'change')
      .map((event) => [event.pins.find((pin) => pin.id === 25)?.level, event.pins.find((pin) => pin.id === 26)?.level, Math.round(event.t_us / 1_000_000)]);
    const settled = states.filter((state, index) => index === states.length - 1 || states[index + 1]?.[2] !== state[2]);
    expect(settled.slice(0, 3)).toEqual([
      [1, 0, 0],
      [0, 1, 2],
      [0, 0, 4],
    ]);
  });

  it('동기 진입점(reset_for_run — 확장의 초기화 훅 포함)에서 양보하지 않고, 보드 라이브러리에 servo_library.py가 있다', () => {
    const [reset, libraries] = stepOf(out, 'sync_reset_result').value as [string, string[]];
    expect(reset).toBe('ok');
    expect(libraries).toContain('servo_library.py');
  });
});
