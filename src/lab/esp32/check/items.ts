/**
 * 실물 점검 도우미의 항목 목록(PLAN §8.3 P3-11, 부록 B-2 Phase 3 항목). 순수 데이터 — DOM·네트워크 없이 단위 테스트한다.
 *
 * 왜 있나: 가상 보드와 모의 시리얼로 확인한 것은 실물의 증거가 아니다(README 7.8). 키트 보드를 가진 선생님이 항목마다
 * [보드에 보내기]로 시험 코드를 돌리고 눈으로 본 것을 예/아니오로 답하면, [결과 복사]가 PROGRESS.md에 붙일 글을 만든다.
 *
 * 항목 하나 = 이 파일의 CHECK_ITEMS 한 줄. 새 항목은 여기에만 더하면 페이지·복사 글·테스트가 따라온다.
 *   b2      부록 B-2 표의 번호(운영자 할 일 2번과 맞추기 위한 것. 새 항목은 P3-07·P3-08 요청의 17~23번)
 *   minutes 예상 시간(추정 — 부록 B-2 표의 값을 항목 수로 나눈 어림값)
 *   wiring  배선(없으면 빈 배열). 예제 사이드카 parts와 같은 모양(WiringEntry)이라 배선 그림을 그대로 그린다
 *   prepare 보내기 전에 사람이 할 일(선을 꽂고 전원을 켜는 등). 배선이 없으면 생략
 *   code    [보드에 보내기]가 raw REPL로 보낼 코드(실물 MicroPython에서 도는 코드만 — 사이트 흉내 이름을 쓰지 않는다)
 *   seconds 코드가 도는 동안 기다리는 시간(넘으면 [정지]로 멈춘다). 적지 않으면 스스로 끝나는 코드
 *   questions 눈으로 보고 답할 것(예/아니오). 하나라도 '아니오'면 그 항목은 '다름'으로 적힌다
 *   expect  코드가 콘솔에 찍는 값에 대한 기대(글로만 — 사이트가 판정하지 않는다. 실물 값을 그대로 적어 두는 것이 목적)
 *
 * 코드 규칙: 실물 보드에서만 돌리므로 `machine`·`time`·`neopixel` 같은 펌웨어 이름과, 사이트가 보드에 올려 주는 라이브러리
 * (i2c_lcd·servo_library·gorillacell_dcmotors — [보드에 보내기]가 필요하면 먼저 올린다)만 쓴다. 끝없는 반복은 쓰지 않고,
 * 눈으로 볼 시간이 필요한 코드는 seconds로 지켜본 뒤 [정지]한다.
 */
import type { WiringEntry } from '../../modules/board/part-types.ts';

export interface CheckQuestion {
  readonly id: string;
  readonly text: string;
}

export interface CheckItem {
  readonly id: string;
  /** 부록 B-2 표의 번호 */
  readonly b2: number;
  readonly title: string;
  /** 무엇을 확인하는 항목인지 한 문장 */
  readonly why: string;
  readonly minutes: number;
  readonly wiring: readonly WiringEntry[];
  readonly prepare?: string;
  readonly code: string;
  readonly seconds?: number;
  readonly questions: readonly CheckQuestion[];
  /** 콘솔에 나올 값에 대한 안내(사이트가 판정하지 않음) */
  readonly expect?: readonly string[];
  /** 이 항목이 쓰는 사이트 보드 라이브러리(없으면 생략) */
  readonly libraries?: readonly string[];
}

const LCD_WIRING: readonly WiringEntry[] = [{ part: 'lcd-i2c', id: 'lcd', pins: { sda: 21, scl: 22 }, label: '문자 LCD(16×2)' }];
const OLED_WIRING: readonly WiringEntry[] = [{ part: 'oled-i2c', id: 'oled', pins: { sda: 21, scl: 22 }, label: 'OLED(128×64)' }];

export const CHECK_ITEMS: readonly CheckItem[] = Object.freeze([
  {
    id: 'connect',
    b2: 17,
    title: '보드 연결과 포트 이름',
    why: '보드를 꽂으면 포트가 저절로 생기는지, 선택 창에 보이는 이름과 USB 칩이 무엇인지 봐요.',
    minutes: 5,
    wiring: [],
    code: [
      'import sys, os, machine',
      "print('platform:', sys.platform)",
      "print('version:', sys.version)",
      "print('freq(Hz):', machine.freq())",
      "print('files:', os.listdir())",
    ].join('\n'),
    questions: [
      { id: 'port', text: '포트 선택 창에 보드가 보였나요? (Windows는 "USB-SERIAL CH340 (COMx)" 같은 이름)' },
      { id: 'probe', text: '연결 칸에 "MicroPython v1.29.0"과 USB 칩 이름이 2초 안에 나왔나요?' },
      { id: 'reset', text: '포트를 열 때 보드가 다시 켜졌나요?(내장 LED가 한 번 깜빡이거나 콘솔에 부팅 글이 보임)' },
    ],
    expect: ['platform은 esp32, version은 3.4.0, freq는 160000000(또는 240000000)이에요.', 'files에 boot.py·main.py가 있으면 보드에 저장된 코드가 있는 거예요.'],
  },
  {
    id: 'basics',
    b2: 16,
    title: '가상 보드가 흉내 낸 기본 동작(Pin·BOOT·떠 있는 핀)',
    why: '가상 보드가 맞춘 Pin 모양·BOOT 버튼 값·아무것도 잇지 않은 핀의 값이 실물과 같은지 봐요.',
    minutes: 5,
    wiring: [],
    prepare: '마지막 줄을 찍을 때 BOOT 버튼을 누른 채로 기다려요(3초 뒤에 읽어요).',
    code: [
      'from machine import Pin',
      'import time',
      'led = Pin(2, Pin.OUT)',
      "print('repr:', led)",
      'boot = Pin(0, Pin.IN)',
      "print('boot(평소):', boot.value())",
      'floating = Pin(23, Pin.IN)',
      "print('아무것도 안 이은 23번:', floating.value())",
      "print('3초 안에 BOOT를 누르고 있어요')",
      'time.sleep(3)',
      "print('boot(누른 채):', boot.value())",
      'led.on()',
      "print('내장 LED를 켰어요')",
    ].join('\n'),
    questions: [
      { id: 'led', text: '마지막에 내장 LED(IO2)가 켜졌나요?' },
      { id: 'boot', text: 'BOOT 값이 평소 1, 누른 채 0으로 나왔나요?' },
    ],
    expect: ["repr은 Pin(2, mode=Pin.OUT)이에요.", '아무것도 잇지 않은 핀 값은 보드마다 다를 수 있어요(가상 보드는 0으로 읽고 한 번 알려 줘요).'],
  },
  {
    id: 'timer',
    b2: 16,
    title: 'Timer 콜백이 계산 중에도 끼어드는지',
    why: '가상 보드는 기다리는 줄·입력 읽는 줄에서만 콜백을 돌려요. 실물이 계산만 하는 반복문 중에도 콜백을 도는지 봐요.',
    minutes: 5,
    wiring: [],
    code: [
      'from machine import Pin, Timer',
      'import time',
      'led = Pin(2, Pin.OUT)',
      'n = [0]',
      'def tick(t):',
      '    n[0] += 1',
      '    led.value(n[0] % 2)',
      'tm = Timer(0)',
      'tm.init(period=200, mode=Timer.PERIODIC, callback=tick)',
      'total = 0',
      'for i in range(300000):',
      '    total += i',
      "print('계산만 한 동안 콜백 횟수:', n[0])",
      'time.sleep(1)',
      "print('1초 기다린 뒤 콜백 횟수:', n[0])",
      'tm.deinit()',
      'led.off()',
    ].join('\n'),
    questions: [
      { id: 'blink', text: '내장 LED가 코드가 도는 동안 몇 번 깜빡였나요?(깜빡였으면 예)' },
      { id: 'compute', text: '"계산만 한 동안 콜백 횟수"가 0보다 컸나요?' },
    ],
    expect: ['실물은 계산 중에도 콜백이 도니 0보다 큰 값이 나올 거예요(가상 보드는 0이에요 — 알려진 차이).'],
  },
  {
    id: 'float-time',
    b2: 6,
    title: '소수 자릿수와 전원 직후 시각',
    why: 'ESP32는 단정밀도 float라 print(1/3)의 자릿수가 컴퓨터와 달라요. 전원 직후 time.localtime()도 봐요.',
    minutes: 3,
    wiring: [],
    code: [
      'import time',
      "print('1/3 =', 1 / 3)",
      "print('0.1+0.2 =', 0.1 + 0.2)",
      "print('localtime:', time.localtime())",
      "print('time():', time.time())",
      "print('gmtime(0):', time.gmtime(0))",
    ].join('\n'),
    questions: [{ id: 'digits', text: 'print(1/3) 값의 자릿수가 컴퓨터(0.3333333333333333)보다 짧았나요?' }],
    expect: ['1/3은 0.3333333 같은 8자리 안팎이에요.', 'gmtime(0)이 (2000, 1, 1, 0, 0, 0, 5, 1)이면 epoch 2000이 맞아요.'],
  },
  {
    id: 'modules',
    b2: 6,
    title: '펌웨어에 든 모듈(neopixel·ubluetooth·PWM·ADC)',
    why: '사이트가 흉내 낸 이름이 실물 v1.29.0 펌웨어에도 있는지 봐요.',
    minutes: 3,
    wiring: [],
    code: [
      'from machine import Pin, PWM, ADC',
      'import neopixel, ubluetooth',
      "print('neopixel·ubluetooth import 됨')",
      'p = PWM(Pin(2), freq=1000, duty_u16=32768)',
      "print('PWM:', p, 'duty:', p.duty(), 'duty_u16:', p.duty_u16())",
      'p.deinit()',
      'a = ADC(Pin(32))',
      'a.atten(ADC.ATTN_11DB)',
      'a.width(ADC.WIDTH_12BIT)',
      "print('ADC:', a, 'read:', a.read())",
    ].join('\n'),
    questions: [{ id: 'ok', text: '오류 없이 끝까지 찍혔나요?' }],
    expect: ['PWM repr에 freq=998처럼 요청한 1000과 조금 다른 값이 나올 수 있어요(해상도로 되계산).'],
  },
  {
    id: 'input',
    b2: 19,
    title: '실행 중 input() 전달',
    why: '입력줄에 적은 줄이 보드 stdin에 닿는지, 되울림이 한 번만 보이는지, 한글이 빠지는지 봐요.',
    minutes: 5,
    wiring: [],
    prepare: '코드가 물으면 아래 입력줄에 "Kim"을 적고 Enter, 그다음 물음에는 한글 이름을 적어 봐요.',
    code: [
      "name = input('영어 이름? ')",
      "print('영어 이름 =', repr(name))",
      "korean = input('한글 이름? ')",
      "print('한글 이름 =', repr(korean), '길이', len(korean))",
    ].join('\n'),
    questions: [
      { id: 'echo', text: '적은 글자가 콘솔에 한 번만 보였나요?(두 번 보이면 아니오)' },
      { id: 'korean', text: '한글은 빠지고 안내가 나왔나요?(빈 글자 \'\'로 찍힘)' },
    ],
  },
  {
    id: 'bootloop',
    b2: 20,
    title: 'boot.py 무한 반복 뒤 다시 연결',
    why: '멈추지 않는 boot.py가 있는 보드에서도 [실행]이 코드를 보낼 수 있는지, [boot.py 끄기]가 되는지 봐요.',
    minutes: 5,
    wiring: [],
    prepare: 'Thonny로 boot.py에 `import time` + `while True: time.sleep(0.2)`를 저장해 둔 보드로 해요. 확인이 끝나면 [boot.py 끄기]를 누르거나 Thonny로 지워요.',
    code: ["print('boot.py가 도는 보드에서도 코드가 왔어요')"].join('\n'),
    questions: [
      { id: 'first', text: '첫 [보드에 보내기]가 6초쯤 뒤에 성공하고 콘솔에 안내가 나왔나요?' },
      { id: 'second', text: '두 번째 [보드에 보내기]는 더 빨랐나요?' },
      { id: 'off', text: '입력·출력 칸의 [boot.py 끄기]를 누르면 boot_off.py로 이름이 바뀌었나요?' },
    ],
  },
  {
    id: 'save',
    b2: 18,
    title: '[보드에 저장]과 전원만 넣어 실행',
    why: '보드에 main.py로 저장하면 컴퓨터 없이 전원만 넣어도 도는지 봐요.',
    minutes: 8,
    wiring: [],
    prepare: 'ESP32 실습실 [실제 보드] 탭에서 첫 예제(01-first-blink)를 [보드에 저장]한 뒤, USB를 뽑아 보조배터리나 다른 USB 전원에 꽂아 봐요.',
    code: [
      'import os',
      "print('files:', os.listdir())",
      "print('main.py 크기:', os.stat('main.py')[6] if 'main.py' in os.listdir() else '없음')",
    ].join('\n'),
    questions: [
      { id: 'saved', text: '보드에 main.py가 저장됐나요?(위 목록에 보임)' },
      { id: 'autorun', text: '전원만 넣었을 때 내장 LED가 깜빡였나요?' },
      { id: 'same', text: '같은 코드를 다시 저장하면 "이미 같은 파일"이라고 나왔나요?' },
    ],
  },
  {
    id: 'touch',
    b2: 10,
    title: '터치 센서(디지털 GPIO17)',
    why: '교과서 배선대로 꽂았을 때 누르는 동안 1이 읽히는지 봐요.',
    minutes: 5,
    wiring: [{ part: 'touch-digital', pin: 17 }],
    prepare: '터치 센서의 신호선을 GPIO17, GND는 GND, VCC는 3V3에 꽂아요. 코드가 도는 5초 동안 패드를 눌러 봐요.',
    code: [
      'from machine import Pin',
      'import time',
      'touch = Pin(17, Pin.IN)',
      'led = Pin(2, Pin.OUT)',
      'for i in range(25):',
      '    v = touch.value()',
      '    led.value(v)',
      "    print('touch:', v)",
      '    time.sleep(0.2)',
      'led.off()',
    ].join('\n'),
    questions: [
      { id: 'press', text: '패드를 누르는 동안 touch 값이 1이 되고 내장 LED가 켜졌나요?' },
      { id: 'release', text: '떼면 0으로 돌아왔나요?' },
    ],
  },
  {
    id: 'touch4',
    b2: 10,
    title: '4채널 터치 센서 값(GPIO32, ADC)',
    why: '사이트가 쓰는 판정 값(688·1535·2381·3263)과 실물 값이 얼마나 다른지 봐요.',
    minutes: 5,
    wiring: [{ part: 'touch-analog-4ch', pin: 32 }],
    prepare: '4채널 터치 센서의 신호선을 GPIO32에 꽂아요. 코드가 도는 동안 패드 1 → 2 → 3 → 4를 차례로 눌러요.',
    code: [
      'from machine import Pin, ADC',
      'import time',
      'adc = ADC(Pin(32))',
      'adc.atten(ADC.ATTN_11DB)',
      'adc.width(ADC.WIDTH_12BIT)',
      'for i in range(40):',
      "    print('값:', adc.read())",
      '    time.sleep(0.25)',
    ].join('\n'),
    questions: [
      { id: 'rest', text: '누르지 않을 때 값이 0에 가까웠나요?' },
      { id: 'pads', text: '패드 1~4를 누를 때 값이 커지는 네 구간으로 나뉘었나요?' },
    ],
    expect: ['사이트는 688·1535·2381·3263을 쓰고 원고 152쪽 구간(500~800·1000~1700·2000~2500·3000~3500)으로 판정해요.', '실물 값을 콘솔에서 읽어 그대로 적어 주세요.'],
  },
  {
    id: 'buzzer-vibration',
    b2: 12,
    title: '버저와 진동 모터(GPIO19 사이트 배정)',
    why: '수동 버저에 켜기만 줄 때 소리가 나는지, 사이트가 정한 진동 모터 핀(GPIO19)에서 실제로 떨리는지 봐요.',
    minutes: 8,
    wiring: [
      { part: 'buzzer', pin: 15 },
      { part: 'vibration-motor', pin: 19 },
    ],
    prepare: '버저 신호선을 GPIO15, 진동 모터 신호선을 GPIO19에 꽂아요(확장 보드의 3색 헤더).',
    code: [
      'from machine import Pin, PWM',
      'import time',
      'buz = Pin(15, Pin.OUT)',
      "print('버저에 켜기(1)만 줘요')",
      'buz.on()',
      'time.sleep(1)',
      'buz.off()',
      "print('버저에 PWM 262Hz를 줘요')",
      'tone = PWM(Pin(15), freq=262, duty=512)',
      'time.sleep(1)',
      'tone.deinit()',
      'buz.off()',
      "print('진동 모터(19)를 두 번 떨어요')",
      'motor = Pin(19, Pin.OUT)',
      'for i in range(2):',
      '    motor.on()',
      '    time.sleep(0.4)',
      '    motor.off()',
      '    time.sleep(0.3)',
    ].join('\n'),
    questions: [
      { id: 'digital', text: '켜기(1)만 줬을 때 소리가 났나요?(능동 버저면 예, 수동 버저면 아니오)' },
      { id: 'pwm', text: 'PWM 262Hz에서 "도" 소리가 났나요?' },
      { id: 'motor', text: 'GPIO19에 꽂은 진동 모터가 두 번 떨렸나요?' },
    ],
  },
  {
    id: 'rgb-laser',
    b2: 14,
    title: 'RGB LED 극성과 레이저',
    why: '교과서 코드처럼 1이면 켜지는지(공통 음극), 레이저가 켜지는지 봐요.',
    minutes: 5,
    wiring: [
      { part: 'rgb-led', pins: { r: 27, g: 32, b: 33 } },
      { part: 'laser', pin: 21 },
    ],
    prepare: 'RGB LED를 R 27·G 32·B 33, 레이저를 GPIO21에 꽂아요. 레이저는 눈에 비추지 않아요.',
    code: [
      'from machine import Pin',
      'import time',
      'r, g, b = Pin(27, Pin.OUT), Pin(32, Pin.OUT), Pin(33, Pin.OUT)',
      'laser = Pin(21, Pin.OUT)',
      "for name, pin in (('빨강', r), ('초록', g), ('파랑', b)):",
      '    print(name)',
      '    pin.on()',
      '    time.sleep(0.8)',
      '    pin.off()',
      "print('레이저')",
      'laser.on()',
      'time.sleep(0.8)',
      'laser.off()',
    ].join('\n'),
    questions: [
      { id: 'polarity', text: '값을 1로 줄 때 불이 켜졌나요?(0에서 켜지면 아니오 — 공통 양극)' },
      { id: 'colors', text: '빨강 → 초록 → 파랑 순서로 색이 맞았나요?' },
      { id: 'laser', text: '레이저가 켜졌나요?' },
    ],
  },
  {
    id: 'servo',
    b2: 14,
    title: '서보모터 duty와 각도',
    why: '사이트가 쓰는 두 프로필(23/73/124와 40/77/115)이 실제로 몇 도를 가리키는지 봐요.',
    minutes: 8,
    wiring: [{ part: 'servo', pin: 13 }],
    prepare: '서보모터 신호선을 GPIO13에 꽂고, 서보 팔이 움직일 공간을 비워 둔 뒤, 팔이 가리키는 각도를 종이 눈금과 비교해요.',
    code: [
      'from machine import Pin, PWM',
      'import time',
      'servo = PWM(Pin(13), freq=50)',
      'for duty in (23, 73, 124, 40, 77, 115):',
      "    print('duty:', duty)",
      '    servo.duty(duty)',
      '    time.sleep(1.2)',
      'servo.deinit()',
    ].join('\n'),
    questions: [
      { id: 'mg90s', text: 'duty 23·73·124가 0°·90°·180° 근처였나요?' },
      { id: 'servo40', text: 'duty 40·77·115가 0°·90°·180° 근처였나요?' },
    ],
    expect: ['사이트는 라이브러리를 부르면 40/77/115(servo40), 직접 PWM을 쓰면 23/73/124(mg90s)로 그려요.'],
  },
  {
    id: 'lcd',
    b2: 9,
    title: '문자 LCD(주소 0x20, 글자 ROM)',
    why: 'i2c.scan()이 0x20을 찾는지, 글자와 사용자 정의 글자가 제대로 나오는지 봐요.',
    minutes: 8,
    wiring: LCD_WIRING,
    prepare: 'LCD의 SDA를 GPIO21, SCL을 GPIO22, VCC를 5V, GND를 GND에 꽂아요.',
    libraries: ['i2c_lcd'],
    code: [
      'from machine import Pin, SoftI2C',
      'from i2c_lcd import I2cLcd',
      'i2c = SoftI2C(scl=Pin(22), sda=Pin(21))',
      "print('scan:', i2c.scan())",
      'lcd = I2cLcd(i2c, 0x20, 2, 16)',
      'lcd.clear()',
      "lcd.putstr('Hello LCD!')",
      'lcd.move_to(0, 1)',
      "lcd.putstr('0123456789ABCDEF')",
      "print('LCD에 두 줄을 적었어요')",
    ].join('\n'),
    questions: [
      { id: 'scan', text: 'scan 결과에 32(0x20)가 있었나요?' },
      { id: 'text', text: '첫 줄 "Hello LCD!", 둘째 줄 "0123456789ABCDEF"가 보였나요?' },
      { id: 'backlight', text: '백라이트가 켜져 있었나요?' },
    ],
  },
  {
    id: 'oled',
    b2: 9,
    title: 'OLED 컨트롤러(ssd1306 드라이버)',
    why: '키트 OLED가 SSD1306인지 SH1106인지(ssd1306 드라이버로 글자가 제대로 나오는지) 봐요.',
    minutes: 8,
    wiring: OLED_WIRING,
    prepare: 'OLED의 SDA를 GPIO21, SCL을 GPIO22, VCC를 3V3, GND를 GND에 꽂아요. 교과서가 주는 ssd1306.py를 Thonny로 보드에 올려 두어야 해요.',
    code: [
      'from machine import Pin, SoftI2C',
      'from ssd1306 import SSD1306_I2C',
      'i2c = SoftI2C(scl=Pin(22), sda=Pin(21))',
      "print('scan:', i2c.scan())",
      'oled = SSD1306_I2C(128, 64, i2c)',
      'oled.fill(0)',
      "oled.text('Hello OLED', 0, 0)",
      "oled.text('0123456789', 0, 20)",
      'for x in range(0, 128, 4):',
      '    oled.pixel(x, 60, 1)',
      'oled.show()',
      "print('OLED에 글자와 점을 그렸어요')",
    ].join('\n'),
    questions: [
      { id: 'scan', text: 'scan 결과에 60(0x3C)이 있었나요?' },
      { id: 'text', text: '글자가 왼쪽 끝에서 잘리지 않고 제대로 보였나요?(가로로 밀렸으면 아니오 — SH1106)' },
      { id: 'pixels', text: '아래쪽 점 줄이 화면 끝까지 그려졌나요?' },
    ],
  },
  {
    id: 'neopixel',
    b2: 6,
    title: '네오픽셀 링(색 차례 GRB)',
    why: '펌웨어에 든 neopixel로 (255, 0, 0)이 빨강으로 보이는지 봐요.',
    minutes: 5,
    wiring: [{ part: 'neopixel', pin: 23 }],
    prepare: '네오픽셀 링의 DIN을 GPIO23, VCC를 5V, GND를 GND에 꽂아요.',
    code: [
      'from machine import Pin',
      'from neopixel import NeoPixel',
      'import time',
      'np = NeoPixel(Pin(23), 16)',
      "for name, color in (('빨강', (255, 0, 0)), ('초록', (0, 255, 0)), ('파랑', (0, 0, 255))):",
      '    print(name)',
      '    for i in range(16):',
      '        np[i] = color',
      '    np.write()',
      '    time.sleep(0.8)',
      'for i in range(16):',
      '    np[i] = (0, 0, 0)',
      'np.write()',
    ].join('\n'),
    questions: [
      { id: 'order', text: '(255, 0, 0)이 빨강으로 보였나요?(초록으로 보이면 아니오)' },
      { id: 'count', text: '링의 LED 16개가 모두 켜졌나요?' },
    ],
  },
  {
    id: 'mp3',
    b2: 11,
    title: 'MP3 모듈(체크섬 없는 프레임)',
    why: '교과서가 쓰는 8바이트 프레임(체크섬 없음)으로 실물 모듈이 곡을 트는지 봐요.',
    minutes: 10,
    wiring: [{ part: 'mp3', id: 'mp3', pins: { rx: 17, tx: 16 } }],
    prepare: '음원이 든 microSD를 꽂은 MP3 모듈을 RX ← GPIO17, TX → GPIO16, VCC·GND에 꽂고 스피커를 이어요.',
    code: [
      'from machine import UART',
      'import time',
      'uart = UART(2, baudrate=9600, tx=17, rx=16)',
      "print('볼륨 20으로')",
      'uart.write(bytearray([0x7E, 0xFF, 0x06, 0x06, 0x00, 0x00, 0x14, 0xEF]))',
      'time.sleep(1)',
      "print('1번 곡 재생')",
      'uart.write(bytearray([0x7E, 0xFF, 0x06, 0x03, 0x00, 0x00, 0x01, 0xEF]))',
      'time.sleep(5)',
      "print('정지')",
      'uart.write(bytearray([0x7E, 0xFF, 0x06, 0x16, 0x00, 0x00, 0x00, 0xEF]))',
    ].join('\n'),
    questions: [
      { id: 'play', text: '1번 곡이 스피커에서 들렸나요?' },
      { id: 'volume', text: '볼륨 명령이 먹혔나요?(소리 크기가 달라짐)' },
      { id: 'stop', text: '정지 명령으로 멈췄나요?' },
    ],
  },
  {
    id: 'fan',
    b2: 12,
    title: '팬 모터 방향과 속도',
    why: '두 입력 핀(25·26)으로 정회전·역회전·멈춤이 되는지, 속도 30%에서도 도는지 봐요.',
    minutes: 5,
    wiring: [{ part: 'fan-motor', pins: { ina: 25, inb: 26 } }],
    prepare: '팬 모터 모듈의 INA를 GPIO25, INB를 GPIO26에 꽂고 모듈 전원을 켜요. 팬이 도는 동안 날개에 손대지 않고, 프로펠러 주변을 비워 둬요.',
    libraries: ['gorillacell_dcmotors'],
    code: [
      'from gorillacell_dcmotors import GORILLACELL_DCMOTORS',
      'import time',
      'fan = GORILLACELL_DCMOTORS(25, 26)',
      "print('정회전 100%')",
      "fan.rotate('cw')",
      'time.sleep(2)',
      "print('정회전 30%')",
      "fan.rotate('cw', 30)",
      'time.sleep(2)',
      "print('역회전 100%')",
      "fan.rotate('ccw')",
      'time.sleep(2)',
      "print('정지')",
      'fan.stop()',
    ].join('\n'),
    questions: [
      { id: 'cw', text: '정회전에서 팬이 돌았나요?' },
      { id: 'slow', text: '속도 30%에서도 돌았나요?' },
      { id: 'ccw', text: '역회전에서 반대로 돌았나요?' },
    ],
  },
  {
    id: 'strapping',
    b2: 13,
    title: '스트래핑 핀에 부품을 달고 전원 넣기',
    why: 'GPIO 12·5·15·2에 부품을 달아 두면 보드가 켜지지 않을 수 있어요. 키트 부품으로 실제로 그런지 봐요.',
    minutes: 8,
    wiring: [
      { part: 'rgb-led', pins: { r: 27, g: 32, b: 33 } },
      { part: 'buzzer', pin: 15 },
    ],
    prepare: 'GPIO15에 버저를 달아 둔 채 USB를 뽑았다 다시 꽂아요(전원을 새로 넣어요).',
    code: ["print('스트래핑 핀에 부품이 달린 채로도 보드가 켜졌어요')"].join('\n'),
    questions: [
      { id: 'boot', text: '부품을 달아 둔 채로 전원을 넣었을 때 보드가 정상으로 켜졌나요?' },
      { id: 'connect', text: '켜진 뒤 [보드 연결]이 곧바로 됐나요?' },
    ],
  },
  {
    id: 'libraries',
    b2: 22,
    title: '사이트 라이브러리 자동 올리기',
    why: '[실행]이 코드가 부르는 사이트 라이브러리를 보드에 없을 때만 올리는지, 교과서판이 있으면 덮지 않는지 봐요.',
    minutes: 5,
    wiring: LCD_WIRING,
    prepare: 'i2c_lcd.py가 없는 보드(또는 교과서판이 든 보드)로 해요. 콘솔의 안내 줄을 읽어요.',
    libraries: ['i2c_lcd'],
    code: [
      'import os',
      "print('files:', os.listdir())",
      'from i2c_lcd import I2cLcd',
      "print('i2c_lcd import 됨:', hasattr(I2cLcd, 'move_to'))",
    ].join('\n'),
    questions: [
      { id: 'upload', text: '없던 보드에서 "먼저 보드에 올려요: i2c_lcd.py"가 콘솔에 나왔나요?' },
      { id: 'keep', text: '교과서판이 있던 보드에서는 "사이트판과 달라요" 안내만 나오고 덮어쓰지 않았나요?' },
      { id: 'moveto', text: 'move_to가 True로 찍혔나요?(교과서판이면 False)' },
    ],
  },
  {
    id: 'compat',
    b2: 23,
    title: '실물에서 안 되는 코드 모양(호환 안내)',
    why: '[실행] 전 안내가 알려 주는 여섯 가지가 실제로 실물에서 오류인지 봐요.',
    minutes: 3,
    wiring: [],
    code: [
      'for label, code in (',
      "    ('슬라이스 [::-1]', \"print('abc'[::-1])\"),",
      "    ('ljust', \"print('a'.ljust(5))\"),",
      "    ('bit_length', 'print((5).bit_length())'),",
      "    ('keys() 집합', \"print({'a': 1}.keys() | {'b'})\"),",
      '):',
      '    try:',
      '        exec(code)',
      '    except Exception as e:',
      "        print(label, '→', type(e).__name__, e)",
    ].join('\n'),
    questions: [{ id: 'errors', text: '네 가지가 모두 오류로 찍혔나요?' }],
    expect: ['실물은 NotImplementedError·AttributeError 같은 오류를 내요. 컴퓨터(가상 보드)에서는 모두 돌아요.'],
  },
  {
    id: 'recover',
    b2: 21,
    title: '[보드 되찾기](멈춤 신호를 삼키는 코드)',
    why: 'KeyboardInterrupt를 삼키는 코드가 main.py에 있을 때 사이트가 보드를 되찾는지 봐요.',
    minutes: 10,
    wiring: [],
    prepare:
      'Thonny로 main.py에 `import time` + `while True:` + `    try:` + `        time.sleep(0.1)` + `    except:` + `        pass`를 저장하고 보드를 다시 켜요. 확인이 끝나면 [main.py 끄기]를 눌러요.',
    code: ["print('되찾은 뒤에는 코드가 들어와요')"].join('\n'),
    questions: [
      { id: 'verdict', text: '연결했을 때 "대답하지 않아요" 또는 "멈추지 않아요"가 나왔나요?' },
      { id: 'recover', text: '[보드 되찾기]로 되찾았나요?(어느 단계에서 됐는지 메모에 적어 주세요)' },
      { id: 'off', text: '[main.py 끄기] 뒤 [보드에 보내기]가 됐나요?' },
    ],
  },
]);

/** 예상 시간 합계(분) */
export function totalMinutes(items: readonly CheckItem[] = CHECK_ITEMS): number {
  return items.reduce((sum, item) => sum + item.minutes, 0);
}

/** 배선이 있는 항목만 */
export function wiringItems(items: readonly CheckItem[] = CHECK_ITEMS): readonly CheckItem[] {
  return items.filter((item) => item.wiring.length > 0);
}
