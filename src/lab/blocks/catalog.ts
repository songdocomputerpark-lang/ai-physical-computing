/**
 * 블록 모드(PLAN §8.3 P3-06, SPEC §6.2 "블록 ↔ 텍스트")가 쓰는 부품 표와 "어떤 부품을 어떤 이름·핀으로 준비할지" 계산 — 순수 모듈.
 * Blockly를 import하지 않는다(단위 테스트·빌드 어디서나 읽는다). 블록 정의는 blocks.ts, 코드 만들기는 generator.ts.
 *
 * 흐름
 *   블록 하나하나가 "이 부품을 이 핀으로 써요"(PartUsage)를 알려 준다 → planParts(usages)가 부품마다 코드 이름(led·touch·touch_17…),
 *   준비 줄(`touch = Pin(17, Pin.IN)`), import, 가상 보드 배선(WiringEntry — src/lab/README.md 7.4·7.5의 부품 id), 머리말 `# @part` 줄,
 *   한 핀을 두 부품이 함께 쓰는 곳(PinConflict)을 정한다. 순서는 블록 위치와 상관없이 PART_KINDS 표 순서 → 핀 번호 순서라 코드가 흔들리지 않는다.
 *
 * 만드는 코드는 교과서 예제와 같은 MicroPython 모양이다(실제 보드에 그대로 보내도 돈다 — SPEC §6.2 "같은 코드가 두 곳에서").
 *   내장 LED·BOOT·터치·진동·레이저   machine.Pin (원고 2-1-1·2-1-2·2-1-4, 사이트 예제 01·02·04)
 *   RGB LED                           Pin(켜기·끄기) 또는 PWM(밝기 0~1023 — f060·f058). 같은 핀에 밝기 블록이 하나라도 있으면 PWM으로 만든다.
 *   버저                              PWM(Pin(n), freq=1000, duty=0) — 처음에는 소리가 나지 않게(f068은 PWM(Pin(15)) 뒤 freq·duty)
 *   네오픽셀                          neopixel.NeoPixel(Pin(23), 16), np[i] = (r, g, b), np.fill(…), np.write() (f064·f065, MicroPython v1.29.0 neopixel 문서)
 *   MP3(DFPlayer)                     UART(2, baudrate=9600, tx=Pin(17), rx=Pin(16)) + 8바이트 명령(f070·f071과 같은 모양)
 *   서보모터                          servo_library.ServoMotor(signal_pin=25).rotate(각도) (f078~f080, 사이트 제공 라이브러리 — 구역 A가 복원)
 *   팬 모터                           Pin 두 개(INA·INB 진리표, f073) 또는 gorillacell_dcmotors.GORILLACELL_DCMOTORS(25, 26)(속도, f075 — 구역 C가 복원)
 *   문자 LCD                          SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000) + i2c_lcd.I2cLcd(i2c, 0x20, 2, 16) (f047·f050 — 구역 B)
 *   OLED                              같은 I2C 버스 + ssd1306.SSD1306_I2C(128, 64, i2c) (f054·f055 — 구역 B)
 *
 * 라이선스: 사이트 소프트웨어(MIT, PD-26).
 */
import type { WiringEntry } from '../modules/board/part-types.ts';

/** 30핀 개발 보드에서 핀 머리가 있고 출력으로 쓸 수 있는 GPIO(UART0 1·3, 입력 전용 34~39, 보드 안 BOOT 0 제외 — layout.ts HEADER_PINS) */
export const OUTPUT_PINS: readonly number[] = Object.freeze([2, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33]);

/** 입력으로 쓸 수 있는 GPIO(출력 가능 핀 + 입력 전용 34·35·36·39) */
export const INPUT_PINS: readonly number[] = Object.freeze([...OUTPUT_PINS, 34, 35, 36, 39].sort((a, b) => a - b));

/** 블록이 쓰는 부품 종류(표 순서 = 준비 줄 순서) */
export type PartKind = 'builtin-led' | 'boot-button' | 'touch' | 'vibration' | 'laser' | 'rgb' | 'neopixel' | 'buzzer' | 'mp3' | 'servo' | 'fan' | 'lcd' | 'oled';

/** 같은 부품을 만드는 방식: RGB LED(digital = Pin 켜기·끄기, pwm = 밝기), 팬(digital = INA·INB 진리표, library = 속도 라이브러리) */
export type PartFlavor = 'digital' | 'pwm' | 'library';

/** 블록 하나가 알려 주는 부품 사용 */
export interface PartUsage {
  readonly kind: PartKind;
  /** 역할 → GPIO(보드에 붙은 부품·고정 핀 부품은 비워도 된다 — 표의 기본 핀) */
  readonly pins?: Readonly<Record<string, number>>;
  /** 이 블록이 바라는 방식(없으면 표의 기본) */
  readonly flavor?: PartFlavor;
  /** 블록 id(핀 겹침 경고를 그 블록에 붙일 때) */
  readonly blockId?: string;
}

/** import 한 줄의 재료: from 모듈 import 이름 */
export interface ImportNeed {
  readonly from: string;
  readonly name: string;
}

export interface PartKindInfo {
  readonly kind: PartKind;
  /** 사람이 읽는 이름(경고 문장) */
  readonly label: string;
  /** 코드 이름의 뿌리 */
  readonly baseName: string;
  /** 역할과 기본 핀(보드에 붙은 부품·고정 핀 부품은 여기 값만 쓴다) */
  readonly defaultPins: Readonly<Record<string, number>>;
  /** 블록이 핀을 바꿀 수 있는지 */
  readonly pinsEditable: boolean;
  /** 가상 보드 부품 id(README 7.5 약속 id). 보드에 붙은 부품이면 null(배선에 적지 않는다) */
  readonly boardPart: string | null;
  /** 기본 방식 */
  readonly defaultFlavor: PartFlavor;
}

const PART_KIND_LIST: PartKindInfo[] = [
  { kind: 'builtin-led', label: '내장 LED', baseName: 'led', defaultPins: { led: 2 }, pinsEditable: false, boardPart: null, defaultFlavor: 'digital' },
  { kind: 'boot-button', label: 'BOOT 버튼', baseName: 'button', defaultPins: { btn: 0 }, pinsEditable: false, boardPart: null, defaultFlavor: 'digital' },
  { kind: 'touch', label: '터치 센서', baseName: 'touch', defaultPins: { sig: 17 }, pinsEditable: true, boardPart: 'touch-digital', defaultFlavor: 'digital' },
  { kind: 'vibration', label: '진동 모터', baseName: 'motor', defaultPins: { sig: 19 }, pinsEditable: true, boardPart: 'vibration-motor', defaultFlavor: 'digital' },
  { kind: 'laser', label: '레이저', baseName: 'laser', defaultPins: { sig: 21 }, pinsEditable: true, boardPart: 'laser', defaultFlavor: 'digital' },
  { kind: 'rgb', label: 'RGB LED', baseName: 'rgb', defaultPins: { r: 27, g: 32, b: 33 }, pinsEditable: true, boardPart: 'rgb-led', defaultFlavor: 'digital' },
  { kind: 'neopixel', label: '네오픽셀', baseName: 'np', defaultPins: { din: 23 }, pinsEditable: true, boardPart: 'neopixel', defaultFlavor: 'digital' },
  { kind: 'buzzer', label: '버저', baseName: 'buzzer', defaultPins: { sig: 15 }, pinsEditable: true, boardPart: 'buzzer', defaultFlavor: 'pwm' },
  // MP3 모듈 쪽 이름(tx·rx): 모듈 TX → 보드 RX(GPIO16), 모듈 RX → 보드 TX(GPIO17) — 원고 2-2-2 배선과 PLAN §6.1 UART2 핀(tx=17, rx=16)
  { kind: 'mp3', label: 'MP3 모듈', baseName: 'uart', defaultPins: { tx: 16, rx: 17 }, pinsEditable: false, boardPart: 'mp3', defaultFlavor: 'digital' },
  { kind: 'servo', label: '서보모터', baseName: 'servo', defaultPins: { sig: 25 }, pinsEditable: true, boardPart: 'servo', defaultFlavor: 'library' },
  { kind: 'fan', label: '팬 모터', baseName: 'fan', defaultPins: { ina: 25, inb: 26 }, pinsEditable: true, boardPart: 'fan-motor', defaultFlavor: 'digital' },
  { kind: 'lcd', label: '문자 LCD', baseName: 'lcd', defaultPins: { sda: 21, scl: 22 }, pinsEditable: false, boardPart: 'lcd-i2c', defaultFlavor: 'digital' },
  { kind: 'oled', label: 'OLED', baseName: 'oled', defaultPins: { sda: 21, scl: 22 }, pinsEditable: false, boardPart: 'oled-i2c', defaultFlavor: 'digital' },
];

/** 부품 표(PLAN §6.2 1차 부품 가운데 P3-06 블록 목록) */
export const PART_KINDS: readonly PartKindInfo[] = Object.freeze(PART_KIND_LIST);

const KIND_INDEX = new Map(PART_KINDS.map((info, index) => [info.kind, index]));

export function partKindInfo(kind: PartKind): PartKindInfo {
  const info = PART_KINDS.find((item) => item.kind === kind);
  if (!info) {
    throw new Error(`블록 부품 표에 "${kind}"이(가) 없어요.`);
  }
  return info;
}

/** RGB LED 핀 묶음 선택지(원고 예제의 세 가지: 2-1-4 f061 27·32·33, 2-1-3 f058 12·5·4, HW f001 23·25·26) */
export const RGB_PIN_SETS: readonly { readonly value: string; readonly label: string; readonly pins: { r: number; g: number; b: number } }[] = Object.freeze([
  { value: '27,32,33', label: '빨강 27 · 초록 32 · 파랑 33', pins: { r: 27, g: 32, b: 33 } },
  { value: '12,5,4', label: '빨강 12 · 초록 5 · 파랑 4', pins: { r: 12, g: 5, b: 4 } },
  { value: '23,25,26', label: '빨강 23 · 초록 25 · 파랑 26', pins: { r: 23, g: 25, b: 26 } },
]);

/** '27,32,33' → { r: 27, g: 32, b: 33 } (모르는 값이면 첫 묶음) */
export function rgbPinsFromValue(value: string): { r: number; g: number; b: number } {
  return (RGB_PIN_SETS.find((set) => set.value === value) ?? RGB_PIN_SETS[0]!).pins;
}

/** RGB LED 색 선택지: 켜기(1)·끄기(0) */
export const RGB_COLORS: readonly { readonly value: string; readonly label: string; readonly rgb: readonly [0 | 1, 0 | 1, 0 | 1] }[] = Object.freeze([
  { value: 'red', label: '빨강', rgb: [1, 0, 0] },
  { value: 'green', label: '초록', rgb: [0, 1, 0] },
  { value: 'blue', label: '파랑', rgb: [0, 0, 1] },
  { value: 'yellow', label: '노랑', rgb: [1, 1, 0] },
  { value: 'cyan', label: '하늘색', rgb: [0, 1, 1] },
  { value: 'magenta', label: '보라', rgb: [1, 0, 1] },
  { value: 'white', label: '흰색', rgb: [1, 1, 1] },
  { value: 'off', label: '끄기', rgb: [0, 0, 0] },
]);

/** 버저 음 선택지(원고 2-2-1 f068의 도레미파솔라시도 주파수, Hz) */
export const BUZZER_NOTES: readonly { readonly value: string; readonly label: string }[] = Object.freeze([
  { value: '262', label: '도' },
  { value: '294', label: '레' },
  { value: '330', label: '미' },
  { value: '349', label: '파' },
  { value: '392', label: '솔' },
  { value: '440', label: '라' },
  { value: '494', label: '시' },
  { value: '523', label: '높은 도' },
]);

/** 버저 음량(PWM duty — f068의 512 = 켜진 시간 절반) */
export const BUZZER_DUTY = 512;

/** MP3(DFPlayer) 조작 선택지: 명령 바이트(원고 2-2-2 f070·f071, PLAN §6.2 MP3 행) */
export const MP3_COMMANDS: readonly { readonly value: string; readonly label: string }[] = Object.freeze([
  { value: '0x16', label: '멈추기' },
  { value: '0x0E', label: '잠깐 멈추기' },
  { value: '0x0D', label: '이어서 재생' },
  { value: '0x01', label: '다음 곡' },
  { value: '0x02', label: '이전 곡' },
]);

/** 네오픽셀 링의 LED 수(원고 2-1-5 f064·f065 NUM_OF_LED = 16) */
export const NEOPIXEL_COUNT = 16;

/** 문자 LCD I2C 주소(원고 f047~f052의 0x20)와 크기 */
export const LCD_ADDRESS = '0x20';

/** 핀 하나를 여러 부품이 함께 쓰는 곳 */
export interface PinConflict {
  readonly gpio: number;
  /** 함께 쓰는 부품 이름(예: ['터치 센서', 'MP3 모듈(보드 TX)']) */
  readonly labels: readonly string[];
  /** 관련 블록 id */
  readonly blockIds: readonly string[];
  /** 한국어 한 문장 */
  readonly text: string;
}

/** 준비할 부품 하나 */
export interface PlannedPart {
  /** kind + 핀으로 만든 열쇠(같은 부품·같은 핀이면 같은 열쇠) */
  readonly key: string;
  readonly kind: PartKind;
  readonly pins: Readonly<Record<string, number>>;
  readonly flavor: PartFlavor;
  /** 코드에서 부르는 이름: led, touch, touch_17, rgb(→ rgb_r·rgb_g·rgb_b), fan(→ fan 또는 fan_ina·fan_inb), np, lcd … */
  readonly name: string;
  /** 사람이 읽는 이름(핀 포함): '터치 센서(GPIO17)' */
  readonly label: string;
  /** 준비 줄(들여쓰기 없음) */
  readonly setup: readonly string[];
  readonly imports: readonly ImportNeed[];
  /** 가상 보드 배선 한 줄(보드에 붙은 부품이면 null) */
  readonly wiring: WiringEntry | null;
  /** 머리말 `# @part` 뒤의 글(보드에 붙은 부품이면 null) — src/lab/modules/board/wiring-spec.ts parsePartDirective가 읽는 모양 */
  readonly directive: string | null;
  readonly blockIds: readonly string[];
}

export interface PartPlan {
  readonly parts: readonly PlannedPart[];
  readonly conflicts: readonly PinConflict[];
  /** 공유 준비 줄(I2C 버스·MP3 명령 함수)과 그 import */
  readonly sharedSetup: readonly string[];
  readonly sharedImports: readonly ImportNeed[];
  /** 블록 코드 만들기에서 쓰는 함수(없으면 빈 목록): MP3 명령을 보내는 함수 정의 줄 */
  readonly helpers: readonly string[];
  /** 부품 사용 → 준비한 부품 */
  find(kind: PartKind, pins?: Readonly<Record<string, number>>): PlannedPart | null;
}

/** MP3 명령 함수 이름(코드에 보인다) */
export const MP3_SEND_NAME = 'mp3_send';

/** I2C 버스 이름(LCD·OLED가 함께 쓴다) */
export const I2C_NAME = 'i2c';

function pinsOf(usage: PartUsage, info: PartKindInfo): Record<string, number> {
  const pins: Record<string, number> = { ...info.defaultPins };
  if (info.pinsEditable && usage.pins) {
    for (const [role, gpio] of Object.entries(usage.pins)) {
      if (role in pins && Number.isInteger(gpio) && gpio >= 0) {
        pins[role] = gpio;
      }
    }
  }
  return pins;
}

/** 역할 순서대로 핀을 이은 서명: 'r27-g32-b33' */
function pinSignature(info: PartKindInfo, pins: Readonly<Record<string, number>>): string {
  return Object.keys(info.defaultPins)
    .map((role) => `${role}${pins[role]}`)
    .join('-');
}

function partKey(info: PartKindInfo, pins: Readonly<Record<string, number>>): string {
  return `${info.kind}:${pinSignature(info, pins)}`;
}

function firstPin(info: PartKindInfo, pins: Readonly<Record<string, number>>): number {
  const role = Object.keys(info.defaultPins)[0] ?? '';
  return pins[role] ?? 0;
}

function pinLabel(info: PartKindInfo, pins: Readonly<Record<string, number>>): string {
  switch (info.kind) {
    case 'rgb':
      return `${info.label}(GPIO${pins.r}·${pins.g}·${pins.b})`;
    case 'fan':
      return `${info.label}(INA GPIO${pins.ina}·INB GPIO${pins.inb})`;
    case 'lcd':
    case 'oled':
      return `${info.label}(SDA GPIO${pins.sda}·SCL GPIO${pins.scl})`;
    case 'mp3':
      return `${info.label}(보드 TX GPIO${pins.rx}·RX GPIO${pins.tx})`;
    default:
      return `${info.label}(GPIO${firstPin(info, pins)})`;
  }
}

/** 배선 id: 한 종류에 하나면 부품 id 그대로(가상 보드가 정하는 기본값과 같음), 여럿이면 부품 id-첫 핀. LCD·OLED는 사이드카(f052)와 같은 lcd·oled */
function wiringId(info: PartKindInfo, pins: Readonly<Record<string, number>>, single: boolean): string | null {
  if (info.kind === 'lcd' || info.kind === 'oled') {
    return info.kind;
  }
  if (single || !info.boardPart) {
    return null;
  }
  return `${info.boardPart}-${firstPin(info, pins)}`;
}

/** 배선 한 줄과 머리말 `# @part` 글을 함께 만든다(label은 가상 보드가 아직 모르는 부품의 안내 문장에 쓴다) */
function wiringOf(info: PartKindInfo, pins: Readonly<Record<string, number>>, single: boolean): { wiring: WiringEntry | null; directive: string | null } {
  if (!info.boardPart) {
    return { wiring: null, directive: null };
  }
  const id = wiringId(info, pins, single);
  const roles = Object.keys(info.defaultPins);
  const onePin = roles.length === 1;
  const wiring: WiringEntry = {
    part: info.boardPart,
    ...(id === null ? {} : { id }),
    ...(onePin ? { pin: pins[roles[0]!]! } : { pins: Object.fromEntries(roles.map((role) => [role, pins[role]!])) }),
    label: info.label,
  };
  const pinText = onePin ? String(pins[roles[0]!]) : roles.map((role) => `${role}=${pins[role]}`).join(' ');
  const directive = `${info.boardPart} ${pinText}${id === null ? '' : ` as ${id}`}`;
  return { wiring, directive };
}

/** 부품 하나의 준비 줄·import·배선 */
function describePart(
  info: PartKindInfo,
  pins: Readonly<Record<string, number>>,
  flavor: PartFlavor,
  name: string,
  single: boolean,
): Pick<PlannedPart, 'setup' | 'imports' | 'wiring' | 'directive'> {
  const pin = firstPin(info, pins);
  const PIN: ImportNeed = { from: 'machine', name: 'Pin' };
  const PWM: ImportNeed = { from: 'machine', name: 'PWM' };
  const wired = wiringOf(info, pins, single);
  switch (info.kind) {
    case 'builtin-led':
    case 'vibration':
    case 'laser':
      return { setup: [`${name} = Pin(${pin}, Pin.OUT)`], imports: [PIN], ...wired };
    case 'boot-button':
    case 'touch':
      return { setup: [`${name} = Pin(${pin}, Pin.IN)`], imports: [PIN], ...wired };
    case 'rgb':
      return {
        setup:
          flavor === 'pwm'
            ? (['r', 'g', 'b'] as const).map((role) => `${name}_${role} = PWM(Pin(${pins[role]}), freq=1000, duty=0)`)
            : (['r', 'g', 'b'] as const).map((role) => `${name}_${role} = Pin(${pins[role]}, Pin.OUT)`),
        imports: flavor === 'pwm' ? [PIN, PWM] : [PIN],
        ...wired,
      };
    case 'neopixel':
      return { setup: [`${name} = NeoPixel(Pin(${pin}), ${NEOPIXEL_COUNT})`], imports: [PIN, { from: 'neopixel', name: 'NeoPixel' }], ...wired };
    case 'buzzer':
      return { setup: [`${name} = PWM(Pin(${pin}), freq=1000, duty=0)`], imports: [PIN, PWM], ...wired };
    case 'mp3':
      return { setup: [`${name} = UART(2, baudrate=9600, tx=Pin(${pins.rx}), rx=Pin(${pins.tx}))`], imports: [PIN, { from: 'machine', name: 'UART' }], ...wired };
    case 'servo':
      return { setup: [`${name} = ServoMotor(signal_pin=${pin})`], imports: [{ from: 'servo_library', name: 'ServoMotor' }], ...wired };
    case 'fan':
      return {
        setup:
          flavor === 'library'
            ? [`${name} = GORILLACELL_DCMOTORS(${pins.ina}, ${pins.inb})`]
            : [`${name}_ina = Pin(${pins.ina}, Pin.OUT)`, `${name}_inb = Pin(${pins.inb}, Pin.OUT)`],
        imports: flavor === 'library' ? [{ from: 'gorillacell_dcmotors', name: 'GORILLACELL_DCMOTORS' }] : [PIN],
        ...wired,
      };
    case 'lcd':
      return { setup: [`${name} = I2cLcd(${I2C_NAME}, ${LCD_ADDRESS}, 2, 16)`], imports: [{ from: 'i2c_lcd', name: 'I2cLcd' }], ...wired };
    case 'oled':
      return { setup: [`${name} = SSD1306_I2C(128, 64, ${I2C_NAME})`], imports: [{ from: 'ssd1306', name: 'SSD1306_I2C' }], ...wired };
  }
}

/** MP3 명령 함수(원고 f071과 같은 8바이트 모양 — 시작 0x7E·버전 0xFF·길이 0x06·명령·피드백 0·인자 2개·끝 0xEF) */
export function mp3HelperLines(uartName: string): string[] {
  return [
    `def ${MP3_SEND_NAME}(cmd, p1=0, p2=0):`,
    `    ${uartName}.write(bytearray([0x7E, 0xFF, 0x06, cmd, 0x00, p1, p2, 0xEF]))`,
  ];
}

/**
 * 블록들이 알려 준 부품 사용을 모아 준비할 부품을 정한다(순수 함수).
 * - 같은 종류·같은 핀은 하나로 합친다. 한 종류에 핀이 여러 가지면 이름 뒤에 첫 핀 번호를 붙인다(touch_17, touch_18).
 * - RGB LED는 같은 핀 묶음에 밝기(pwm) 블록이 하나라도 있으면 PWM, 팬은 속도(library) 블록이 하나라도 있으면 라이브러리.
 * - LCD·OLED는 I2C 버스 하나(i2c)를 함께 쓰고, 둘 다 SDA 21·SCL 22라 겹침으로 보지 않는다(버스).
 */
export function planParts(usages: readonly PartUsage[]): PartPlan {
  interface Draft {
    info: PartKindInfo;
    pins: Record<string, number>;
    flavors: Set<PartFlavor>;
    blockIds: string[];
  }
  const drafts = new Map<string, Draft>();
  for (const usage of usages) {
    const info = partKindInfo(usage.kind);
    const pins = pinsOf(usage, info);
    const key = partKey(info, pins);
    let draft = drafts.get(key);
    if (!draft) {
      draft = { info, pins, flavors: new Set(), blockIds: [] };
      drafts.set(key, draft);
    }
    if (usage.flavor) {
      draft.flavors.add(usage.flavor);
    }
    if (usage.blockId && !draft.blockIds.includes(usage.blockId)) {
      draft.blockIds.push(usage.blockId);
    }
  }
  const ordered = [...drafts.entries()].sort(([, a], [, b]) => {
    const kind = (KIND_INDEX.get(a.info.kind) ?? 0) - (KIND_INDEX.get(b.info.kind) ?? 0);
    return kind !== 0 ? kind : firstPin(a.info, a.pins) - firstPin(b.info, b.pins) || pinSignature(a.info, a.pins).localeCompare(pinSignature(b.info, b.pins), 'en');
  });
  const countByKind = new Map<PartKind, number>();
  for (const [, draft] of ordered) {
    countByKind.set(draft.info.kind, (countByKind.get(draft.info.kind) ?? 0) + 1);
  }
  const parts: PlannedPart[] = ordered.map(([key, draft]) => {
    const { info } = draft;
    const single = (countByKind.get(info.kind) ?? 0) <= 1;
    const name = single ? info.baseName : `${info.baseName}_${firstPin(info, draft.pins)}`;
    let flavor: PartFlavor = info.defaultFlavor;
    if (info.kind === 'rgb' && draft.flavors.has('pwm')) {
      flavor = 'pwm';
    }
    if (info.kind === 'fan' && draft.flavors.has('library')) {
      flavor = 'library';
    }
    const described = describePart(info, draft.pins, flavor, name, single);
    return { key, kind: info.kind, pins: draft.pins, flavor, name, label: pinLabel(info, draft.pins), blockIds: draft.blockIds, ...described };
  });

  const sharedSetup: string[] = [];
  const sharedImports: ImportNeed[] = [];
  const helpers: string[] = [];
  const i2cPart = parts.find((part) => part.kind === 'lcd' || part.kind === 'oled');
  if (i2cPart) {
    sharedSetup.push(`${I2C_NAME} = SoftI2C(scl=Pin(${i2cPart.pins.scl}), sda=Pin(${i2cPart.pins.sda}), freq=400000)`);
    sharedImports.push({ from: 'machine', name: 'Pin' }, { from: 'machine', name: 'SoftI2C' });
  }
  const mp3Part = parts.find((part) => part.kind === 'mp3');
  if (mp3Part) {
    helpers.push(...mp3HelperLines(mp3Part.name));
  }

  return {
    parts,
    conflicts: findPinConflicts(parts),
    sharedSetup,
    sharedImports,
    helpers,
    find(kind, pins) {
      const info = partKindInfo(kind);
      const key = partKey(info, pinsOf({ kind, ...(pins ? { pins } : {}) }, info));
      return parts.find((part) => part.key === key) ?? null;
    },
  };
}

/** 부품이 쓰는 핀(역할 이름 포함) */
function pinUses(part: PlannedPart): { gpio: number; label: string; bus: string | null }[] {
  const info = partKindInfo(part.kind);
  switch (part.kind) {
    case 'rgb':
      return (['r', 'g', 'b'] as const).map((role) => ({ gpio: part.pins[role]!, label: `${info.label} ${role.toUpperCase()}`, bus: null }));
    case 'fan':
      return [
        { gpio: part.pins.ina!, label: `${info.label} INA`, bus: null },
        { gpio: part.pins.inb!, label: `${info.label} INB`, bus: null },
      ];
    case 'lcd':
    case 'oled':
      return [
        { gpio: part.pins.sda!, label: `${info.label} SDA`, bus: 'i2c' },
        { gpio: part.pins.scl!, label: `${info.label} SCL`, bus: 'i2c' },
      ];
    case 'mp3':
      return [
        { gpio: part.pins.rx!, label: `${info.label}(보드 TX)`, bus: null },
        { gpio: part.pins.tx!, label: `${info.label}(보드 RX)`, bus: null },
      ];
    default:
      return Object.values(part.pins).map((gpio) => ({ gpio, label: info.label, bus: null }));
  }
}

/** 한 핀을 두 부품 이상이 함께 쓰는 곳을 찾는다(같은 I2C 버스의 LCD·OLED는 겹침이 아니다). */
export function findPinConflicts(parts: readonly PlannedPart[]): PinConflict[] {
  const byGpio = new Map<number, { labels: string[]; blockIds: Set<string>; keys: Set<string>; buses: Set<string | null> }>();
  for (const part of parts) {
    for (const use of pinUses(part)) {
      let entry = byGpio.get(use.gpio);
      if (!entry) {
        entry = { labels: [], blockIds: new Set(), keys: new Set(), buses: new Set() };
        byGpio.set(use.gpio, entry);
      }
      entry.keys.add(part.key);
      entry.buses.add(use.bus);
      if (!entry.labels.includes(use.label)) {
        entry.labels.push(use.label);
      }
      for (const id of part.blockIds) {
        entry.blockIds.add(id);
      }
    }
  }
  const conflicts: PinConflict[] = [];
  for (const [gpio, entry] of [...byGpio.entries()].sort(([a], [b]) => a - b)) {
    if (entry.keys.size < 2) {
      continue;
    }
    if (entry.buses.size === 1 && entry.buses.has('i2c')) {
      continue; // LCD와 OLED가 같은 I2C 버스(SDA·SCL)를 함께 쓰는 것은 정상
    }
    const joined = entry.labels.join('·');
    conflicts.push({
      gpio,
      labels: entry.labels,
      blockIds: [...entry.blockIds],
      text: `${gpio}번 핀을 ${joined}이(가) 함께 써요. 실물에서는 한 핀에 부품 하나만 이어요 — 블록의 핀 번호를 서로 다르게 바꿔요.`,
    });
  }
  return conflicts;
}

/** import 재료를 교과서 예제 순서의 줄로 만든다: from machine … → from time … → 라이브러리 → import random */
export function importLines(needs: readonly ImportNeed[], plainModules: readonly string[] = []): string[] {
  const MODULE_ORDER = ['machine', 'time', 'neopixel', 'i2c_lcd', 'ssd1306', 'servo_library', 'gorillacell_dcmotors'];
  const NAME_ORDER: Record<string, readonly string[]> = {
    machine: ['Pin', 'PWM', 'SoftI2C', 'UART'],
    time: ['sleep', 'sleep_ms', 'sleep_us'],
  };
  const byModule = new Map<string, Set<string>>();
  for (const need of needs) {
    let names = byModule.get(need.from);
    if (!names) {
      names = new Set();
      byModule.set(need.from, names);
    }
    names.add(need.name);
  }
  const modules = [...byModule.keys()].sort((a, b) => {
    const ia = MODULE_ORDER.indexOf(a);
    const ib = MODULE_ORDER.indexOf(b);
    return (ia < 0 ? MODULE_ORDER.length : ia) - (ib < 0 ? MODULE_ORDER.length : ib) || a.localeCompare(b, 'en');
  });
  const lines = modules.map((module) => {
    const order = NAME_ORDER[module] ?? [];
    const names = [...(byModule.get(module) ?? [])].sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia < 0 ? order.length : ia) - (ib < 0 ? order.length : ib) || a.localeCompare(b, 'en');
    });
    return `from ${module} import ${names.join(', ')}`;
  });
  for (const module of [...new Set(plainModules)].sort((a, b) => a.localeCompare(b, 'en'))) {
    lines.push(`import ${module}`);
  }
  return lines;
}

/** 블록으로 만든 코드의 첫 줄(블록 모드가 "블록에서 온 코드"인지 알아보는 표시 — 바꾸면 저장된 코드를 못 알아본다) */
export const BLOCKS_CODE_MARKER = '# 블록으로 만든 코드';

/** 코드가 블록에서 왔는지(첫 줄이 표시로 시작) */
export function isBlocksCode(code: string): boolean {
  return code.startsWith(BLOCKS_CODE_MARKER);
}
