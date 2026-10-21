/**
 * 키트 장치 도감의 화면 값 만들기(판 1.5.0, DECISIONS C155) — 장 묶기·이전/다음·가상 표시 말·연결 방식 말·배선표·회로 그림 설명·주소.
 * Astro 없이도 도는 순수 함수라 Vitest로 검사한다(tests/unit/kit/kit-view.test.ts). 파일을 열지 않고 yaml도 쓰지 않아 브라우저 번들에 들어가도 된다.
 *
 * 쓰는 곳: 도감 첫 쪽 src/pages/labs/esp32/kit/index.astro, 장치 쪽 src/pages/labs/esp32/kit/[id].astro, 부품 사전 카드(PartCard.astro).
 * 학생이 보는 모든 문장은 고1이 처음 읽어도 이해되는지를 기준으로 쓴다. 코드와 브릭셀 글(이름·설명·점검 요점·배선 줄)은 그대로 둔다.
 */
import type { IconName } from '../common/icons.ts';
import { withBase } from '../../lib/url.ts';
import { labLink } from '../lesson/lesson-data.ts';
import { KIT_CIRCUIT_PATH, KIT_PAGE_PATH, type KitChapter, type KitData, type KitDevice, type KitVirtual } from './kit-schema.ts';

/** 장(2~8) 소개 한 줄 — 도감 첫 쪽의 장 제목 아래와 장치 쪽 빵부스러기·옆 차례의 장 이름 옆에 쓴다 */
export const KIT_CHAPTER_DESCRIPTIONS: Readonly<Record<number, string>> = Object.freeze({
  1: '키트를 처음 쓸 때 해 보는 기본 코드예요. LED 켜기, 값 읽기, 통신 같은 ESP32의 기본 기능을 하나씩 해 봐요.',
  2: '빛과 글자로 보여 주는 장치예요. LED, 화면, 불빛 판이 있어요.',
  3: '켜짐(1)과 꺼짐(0)처럼 두 가지 값으로 읽는 센서와 스위치예요. 선 하나로 값을 주고받는 센서도 있어요.',
  4: '값이 0부터 4095까지 연속으로 바뀌어 읽히는 센서예요.',
  5: '선 두 개(SDA, SCL)로 보드와 이야기하는 센서예요.',
  6: '움직임을 만드는 모터와, 모터를 움직이게 도와주는 부품이에요.',
  7: '소리를 내거나 전기를 켜고 끄는 장치예요.',
  8: '리모컨, 무선 통신, 위치(GPS), 저장 카드처럼 다른 기기와 정보를 주고받는 장치예요.',
});

/** 가상 보드 표시 하나: 아이콘 + 글자(색에만 기대지 않는다) + 한 줄 풀이 */
export interface KitVirtualInfo {
  readonly value: KitVirtual;
  /** 카드·장치 쪽에 보이는 짧은 글 */
  readonly label: string;
  /** 범례에 보이는 풀이 */
  readonly explain: string;
  readonly icon: IconName;
}

/** 가상 보드에서 되는 정도의 이름. 차례는 범례에 보이는 차례다. */
export const KIT_VIRTUAL_INFO: Readonly<Record<KitVirtual, KitVirtualInfo>> = Object.freeze({
  full: {
    value: 'full',
    label: '가상 보드로 바로',
    explain: '보드가 없어도 실습실의 가상 보드에서 끝까지 돌려 볼 수 있어요.',
    icon: 'check-circle',
  },
  partial: {
    value: 'partial',
    label: '일부만 가상',
    explain: '가상 보드에서 코드는 돌지만, 그림으로 보이는 모습이 실제와 조금 달라요.',
    icon: 'info',
  },
  'real-only': {
    value: 'real-only',
    // "실제 보드에서"만 쓰면 문장이 끝나지 않아 "실제 보드에서 …무엇을?"로 읽혔다(판 1.6.0 C176, 걷기 보고 walk-kit-user 2)
    label: '실제 보드에서 해 보세요',
    explain: '가상 보드에는 아직 이 장치를 흉내 내는 부분이 없어요. 키트 보드를 연결해서 해 봐요.',
    icon: 'plug',
  },
});

export const KIT_VIRTUAL_ORDER: readonly KitVirtual[] = ['full', 'partial', 'real-only'];

/**
 * 브릭셀 카드의 연결 방식 글(영어)을 고1이 읽는 말로. 표에 없는 글은 그대로 둔다(새 글이 생겨도 깨지지 않는다 —
 * 새 글은 tests/unit/kit/kit-view.test.ts가 표에 더하라고 알려 준다).
 */
const CONNECTION_LABELS: Readonly<Record<string, string>> = Object.freeze({
  'Digital / PWM': '디지털 / PWM(밝기·세기 조절)',
  'Digital + PWM': '디지털 + PWM(밝기·세기 조절)',
  PWM: 'PWM(밝기·세기 조절)',
  Digital: '디지털(켜짐·꺼짐)',
  'Digital (1-Wire)': '디지털(선 하나로 통신, 1-Wire)',
  'Digital (UART)': 'UART 통신(글자를 주고받아요)',
  Analog: '아날로그(0~4095 값)',
  UART: 'UART 통신(글자를 주고받아요)',
  'Serial UART': 'UART 통신(글자를 주고받아요)',
  I2C: 'I2C 통신(선 두 개로 통신)',
  'Serial I2C': 'I2C 통신(선 두 개로 통신)',
  'Serial I2C-like': 'I2C와 비슷한 선 두 개 통신',
  'I2C (주소 0x63, 100kHz)': 'I2C 통신(주소 0x63, 100kHz)',
  SPI: 'SPI 통신(선 네 개로 통신)',
  'Serial SPI': 'SPI 통신(선 네 개로 통신)',
});

/** 연결 방식 글 → 학생 말. 표에 없으면 브릭셀 글 그대로 */
export function connectionLabel(interfaceText: string): string {
  return CONNECTION_LABELS[interfaceText.trim()] ?? interfaceText;
}

/**
 * 장치 쪽 "연결 방식" 글. 브릭셀 글이 그냥 "Digital"이면 켜짐·꺼짐 하나만 말하는 것처럼 읽힌다 — 부품 사전이 부품마다 더 알맞게 적어 둔 글
 * (예: 초음파 센서 "디지털 입출력(TRIG 보내기·ECHO 받기)")이 "디지털"로 시작하면 그 글을 쓴다. 두 쪽이 같은 부품을 같은 말로 부르게 한다
 * (판 1.6.0 C176, 걷기 보고 walk-kit-user 15·B-69). 그 밖의 글(PWM·I2C·UART …)은 connectionLabel 그대로.
 */
export function deviceConnectionLabel(interfaceText: string, partConnection?: string): string {
  const dictionary = partConnection?.trim() ?? '';
  if (interfaceText.trim() === 'Digital' && dictionary.startsWith('디지털')) {
    return dictionary;
  }
  return connectionLabel(interfaceText);
}

/** 표에 있는 연결 방식 글(시험이 데이터와 대조한다) */
export function knownConnectionTexts(): string[] {
  return Object.keys(CONNECTION_LABELS);
}

/** 카드·장치 쪽 제목 글: "3.11 초음파 센서 V2"(번호 + 부품 사전과 같은 이름 — 브릭셀의 원래 이름 "초음파 센서 (HC-SR04)"는 장치 쪽 부제) */
export function deviceTitle(device: Pick<KitDevice, 'number' | 'name'>): string {
  return `${device.number} ${device.name}`;
}

/** 도감 첫 쪽에서 장 묶음으로 가는 #위치 이름 */
export function chapterAnchor(chapter: number): string {
  return `ch-${chapter}`;
}

/** 도감 첫 쪽 링크 */
export function kitIndexHref(chapter?: number): string {
  return withBase(chapter === undefined ? KIT_PAGE_PATH : `${KIT_PAGE_PATH}#${chapterAnchor(chapter)}`);
}

/** 장치 쪽 경로(base 없음) */
export function kitDevicePath(id: string): string {
  return `${KIT_PAGE_PATH}${id}/`;
}

/** 장치 쪽 링크 */
export function kitDeviceHref(id: string): string {
  return withBase(kitDevicePath(id));
}

/** 회로 그림 주소(base 붙음) */
export function circuitHref(device: Pick<KitDevice, 'circuit'>): string {
  return withBase(`${KIT_CIRCUIT_PATH}/${device.circuit}`);
}

/** 장 한 묶음 */
export interface KitChapterGroup {
  readonly chapter: KitChapter;
  readonly description: string;
  readonly devices: readonly KitDevice[];
}

/** 2~8장의 장치를 장 차례대로 묶는다(장치가 없는 장은 건너뛴다 — 1장은 intro라 따로 다룬다) */
export function chapterGroups(data: Pick<KitData, 'chapters' | 'devices'>): KitChapterGroup[] {
  return data.chapters
    .filter((chapter) => chapter.n >= 2)
    .sort((a, b) => a.n - b.n)
    .map((chapter) => ({
      chapter,
      description: KIT_CHAPTER_DESCRIPTIONS[chapter.n] ?? '',
      devices: data.devices.filter((device) => device.chapter === chapter.n),
    }))
    .filter((group) => group.devices.length > 0);
}

/** 이전·다음 장치(장을 넘어서도 이어진다). 첫 장치의 이전·마지막 장치의 다음은 undefined */
export function deviceNeighbors(devices: readonly KitDevice[], id: string): { previous?: KitDevice; next?: KitDevice } {
  const index = devices.findIndex((device) => device.id === id);
  if (index < 0) {
    return {};
  }
  const previous = devices[index - 1];
  const next = devices[index + 1];
  return { ...(previous ? { previous } : {}), ...(next ? { next } : {}) };
}

/**
 * 핀 이름 풀이 한 문장 — 장치의 핀 글에 G·V·S(또는 GND·VCC)가 있을 때만. 틀릴 수 있는 풀이(TX·RX 방향 등)는 하지 않는다.
 * 예: "3 pins (G, V, S)" → "G는 접지(GND), V는 전원, S는 신호선이에요." 없으면 undefined.
 */
export function pinNameHint(pins: string): string | undefined {
  const tokens = new Set(pins.match(/\b[A-Z][A-Z0-9]*\b/gu) ?? []);
  const parts: string[] = [];
  if (tokens.has('G')) parts.push('G는 접지(GND)');
  if (tokens.has('V')) parts.push('V는 전원');
  if (tokens.has('S')) parts.push('S는 신호선');
  if (tokens.has('GND')) parts.push('GND는 접지');
  if (tokens.has('VCC')) parts.push('VCC는 전원');
  return parts.length === 0 ? undefined : `${parts.join(', ')}이에요.`;
}

/** 배선 줄 "G → GND"를 장치 쪽과 보드 쪽으로 나눈다. 화살표가 없으면 줄 전체를 보드 쪽 칸에 둔다 */
export function splitWiring(line: string): { readonly device: string; readonly board: string } {
  const at = line.indexOf('→');
  if (at < 0) {
    return { device: '', board: line.trim() };
  }
  return { device: line.slice(0, at).trim(), board: line.slice(at + 1).trim() };
}

/** 회로 그림의 대체 글 — 그림을 못 보는 사람도 어디에 꽂는지 알도록 배선표를 한 문장으로 */
export function circuitAlt(device: Pick<KitDevice, 'number' | 'name' | 'wiring'>): string {
  const links = device.wiring.map((line) => {
    const { device: from, board } = splitWiring(line);
    return from === '' ? board : `${from}는 ${board}`;
  });
  return `${device.number} ${device.name} 회로 그림. 연결: ${links.join(', ')}.`;
}

/** 회로 그림 캡션(한 줄) — 이름이 괄호로 끝나는 장치가 많아 조사를 붙이지 않는다 */
export function circuitCaption(device: Pick<KitDevice, 'number' | 'name'>): string {
  return `${device.number} ${device.name} 연결 모습(ESP32 보드에 꽂는 방법)`;
}

/** 라이브러리 한 줄의 상태 글 — 이 사이트가 싣고 있는지 */
export function libraryStatus(library: { readonly site: boolean }): string {
  return library.site ? '이 사이트가 싣고 있어요' : '이 사이트에는 없어요';
}

/** 라이브러리 풀이(목록 아래 한 번씩) — 사이트가 싣는 파일과 싣지 않는 파일 */
export const LIBRARY_HELP = Object.freeze({
  site: '이 사이트가 싣고 있는 파일은 실습실이 저절로 가져다 써요. 실제 보드에서 [실행]하거나 [보드에 저장]할 때도 사이트가 보드에 함께 올려 줘요.',
  external: '이 사이트가 싣지 않는 파일은 브릭셀에서 받아 실제 보드에 올려야 해요.',
});

/** 부품 사진 id로 이 사진을 쓰는 장치를 찾는다(부품 사전 카드의 "예제 보기") — 대표 사진과 같은 코드로 도는 다른 색·크기 사진 모두 */
export function devicesForPart(devices: readonly KitDevice[], partId: string): KitDevice[] {
  return devices.filter((device) => device.part === partId || device.partVariants.some((variant) => variant.part === partId));
}

/** 부품 사진 id → 그 사진을 쓰는 장치 목록(부품 사전 쪽이 한 번 만들어 둔다) */
export function deviceIndexByPart(devices: readonly KitDevice[]): Map<string, KitDevice[]> {
  const index = new Map<string, KitDevice[]>();
  for (const device of devices) {
    for (const partId of [device.part, ...device.partVariants.map((variant) => variant.part)]) {
      const list = index.get(partId) ?? [];
      if (!list.includes(device)) {
        list.push(device);
      }
      index.set(partId, list);
    }
  }
  return index;
}

/**
 * 부품 번호 글: 부품 사진 id의 앞 두 토막("d-009-ultrasonic-sensor-v2" → "d-009") — 포장지의 부품 번호와 맞춰 보는 용도.
 * 판 1.6.0 C176부터 장치 쪽의 "장치 정보"에는 보이지 않는다(학생 눈에는 내부 번호 "dis-004"가 개발자 말 — 걷기 보고 walk-kit-user 17). 다시 보일 때 쓴다.
 */
export function partNumberOf(partId: string): string {
  return partId.split('-').slice(0, 2).join('-');
}

/** 코드가 문자 LCD(I2cLcd)를 쓰는지 — 장치 쪽의 "LCD도 필요해요" 줄을 코드 글에서 판단한다(판 1.6.0 C176) */
export function usesLcd(code: string): boolean {
  return /\bI2cLcd\b/u.test(code);
}

/**
 * 이 장치로 실제 보드에서 할 때 문자 LCD도 꽂아야 하는지: 코드(단계마다 usesLcd)가 I2cLcd를 쓰고, 장치 자신이 LCD가 아닐 때.
 * 64개 장치가 값을 LCD에도 보여 주는데, 그 줄은 LCD가 없으면 `I2cLcd(...)`에서 멈춘다(걷기 보고 walk-kit-user 6).
 */
export function deviceNeedsLcd(device: Pick<KitDevice, 'name' | 'brixelName'>, stepUsesLcd: readonly boolean[]): boolean {
  if (/LCD/iu.test(device.name) || /LCD/iu.test(device.brixelName ?? '')) {
    return false;
  }
  return stepUsesLcd.some(Boolean);
}

/** "LCD도 필요해요" 줄의 굵은 말과 풀이(한 줄) */
export const LCD_NEEDED = Object.freeze({
  title: 'LCD도 필요해요.',
  text: '이 코드는 값을 문자 LCD(16×2)에도 보여 줘요. 실제 보드에서는 LCD를 꽂지 않으면 I2cLcd 줄에서 멈춰요. 꽂는 방법은 배선표의 "LCD" 줄이고, 가상 보드에는 LCD가 저절로 그려져요.',
});

/** 회로 그림 아래 선 색 범례(글자) — 키트 회로 도구가 그린 그림의 선 색 규칙(검정·빨강·노랑·초록) */
export const CIRCUIT_COLOR_LEGEND = '선 색: 검정 = GND(접지) · 빨강 = VCC(전원) · 노랑·초록 = 신호선';

/** examples/esp32/kit/ch3/3-11-ultrasonic-1.py → 3-11-ultrasonic-1.py (코드 위에 보이는 파일 이름) */
export function fileNameOf(file: string): string {
  const at = file.lastIndexOf('/');
  return at < 0 ? file : file.slice(at + 1);
}

/** 코드 한 단계의 [실습실에서 열기] 주소(차시의 [실습실에서 열기]와 같은 규칙 — 예제 파일은 examples/ 뒤 경로) */
export function stepLabHref(file: string): string {
  return labLink('esp32', file).href;
}

/** 카드의 짧은 연결 방식 글: 학생 말에서 괄호 풀이를 뗀다("디지털 / PWM(밝기·세기 조절)" → "디지털 / PWM") */
export function connectionShort(interfaceText: string): string {
  return connectionLabel(interfaceText)
    .replace(/\([^)]*\)/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** 핀 수 글: "3 pins (G, V, S)" → "핀 3개 (G, V, S)". 모르는 모양은 그대로 둔다 */
export function pinsLabel(pins: string): string {
  return pins.replace(/(\d+)\s*pins?\b/giu, '핀 $1개');
}

/** 코드 글자를 줄로 나눈다(줄 끝 CRLF·끝 줄바꿈 하나만 다듬는다 — 코드 글자는 그대로) */
export function kitCodeLines(code: string): string[] {
  return code.replace(/\r\n?/gu, '\n').replace(/\n$/u, '').split('\n');
}
