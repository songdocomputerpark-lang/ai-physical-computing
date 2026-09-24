/**
 * 예제 갤러리(P4-11)가 **파일 자리와 코드에서 저절로 읽어 내는** 태그 — `facets.ts`의 "차시 md → 사이드카" 뒤에 오는 마지막 차례다.
 *
 * 왜 필요한가: 태그 규약(`facets.ts`)은 사람이 적는 값이고 "모르면 적지 않는다"가 원칙이다. 그런데 옮겨 온 예제 100여 개에는
 * 아직 단원·통신 방식을 적은 곳이 없어서, 사람이 다 적기 전까지 갤러리의 단원·통신 필터가 텅 비어 버린다.
 * 여기 있는 두 가지는 **추측이 아니라 사이트가 이미 지키고 있는 규칙**이라 적지 않아도 확실하다.
 *
 * 1. 단원 — `examples/<실습실>/u2/…` 처럼 폴더 이름이 곧 대단원이다(PLAN §2.5 실습실별 예제 배치, `EXAMPLE_GROUPS`가 쓰는 규칙과 같다).
 *    `u1`~`u4` 폴더가 아니면(보충·교안·부품 시험 코드) 단원을 붙이지 않는다.
 * 2. 통신 방식 — **코드가 실제로 부르는 모듈**로 정한다(docs/CODE_MAPPING.md §2·§3.6·§3.7·§3.9의 대체물 표와 같은 이름).
 *    import 줄이 없으면 붙이지 않는다. 그래서 통신을 쓰지 않는 예제에 `none` 같은 값이 생기지 않는다(facets.ts 규칙).
 *
 * 사람이 사이드카·차시 md에 적으면 **적은 값이 언제나 이긴다**(cards.ts에서 이 함수들은 맨 마지막에만 불린다).
 * 이 파일은 순수 함수뿐이고 브라우저 번들에도 들어갈 수 있으니 빌드 전용 패키지를 import하지 않는다.
 */
import { EXAMPLE_COMM_KINDS } from './facets.ts';
import type { GalleryLabId } from './filters.ts';

/** `examples/` 뒤 경로에서 대단원 번호(1~4)를 읽는다. 폴더에 u1~u4가 없으면 null(= 아직 모름). */
export function unitFromExampleFile(file: string): number | null {
  const segments = file.split('/');
  // 마지막 칸은 파일 이름이라 보지 않는다(파일 이름이 u2-…로 시작해도 단원으로 읽지 않게).
  for (const segment of segments.slice(0, -1)) {
    const matched = /^u([1-4])$/u.exec(segment);
    if (matched) {
      return Number(matched[1]);
    }
  }
  return null;
}

/**
 * 통신 방식 하나를 알아보는 규칙. `test`가 코드 전체에서 한 번이라도 맞으면 그 방식으로 본다.
 * 규칙은 **줄 맨 앞의 import 줄**이나 **그 모듈만 쓰는 함수 이름**처럼 헷갈릴 수 없는 것만 쓴다(주석 안의 낱말에 걸리지 않게).
 */
interface CommRule {
  readonly kind: (typeof EXAMPLE_COMM_KINDS)[number];
  readonly test: RegExp;
  /** 왜 이 규칙이 확실한지(코드에 남기는 근거) */
  readonly why: string;
}

/**
 * "이 모듈을 import하는 줄"을 찾는 규칙을 만든다. 파이썬이 쓰는 두 가지 모양을 모두 본다.
 *   import a, bluetooth      ← 한 줄에 여러 개(자료의 `import time, bluetooth`)
 *   from umqtt.simple import MQTTClient
 * 줄 맨 앞(들여쓰기까지만 허용)에서만 찾아서 주석·글자 안의 같은 낱말에는 걸리지 않는다.
 */
function importRule(names: readonly string[]): RegExp {
  const module = `(?:${names.join('|')})`;
  // from 쪽의 (?:\.[\w.]+)? 는 umqtt.simple 같은 아래 모듈까지 받되 serialx 같은 다른 이름에는 걸리지 않게 하는 부분이다.
  return new RegExp(`^[ \\t]*(?:import[ \\t]+(?:[\\w.]+[ \\t]*,[ \\t]*)*${module}\\b|from[ \\t]+${module}(?:\\.[\\w.]+)?[ \\t]+import\\b)`, 'mu');
}

const COMM_RULES: readonly CommRule[] = Object.freeze([
  {
    kind: 'uart',
    // 컴퓨터 쪽 pyserial(`import serial`)과 보드 쪽 `machine.UART` — CODE_MAPPING §3.6 SER, §2.3 f082~f085
    test: new RegExp(`${importRule(['serial']).source}|^[ \\t]*from[ \\t]+machine[ \\t]+import[^\\n#]*\\bUART\\b`, 'mu'),
    why: 'pyserial(import serial) 또는 machine.UART',
  },
  {
    kind: 'ble',
    // 컴퓨터 쪽 bleak 래퍼(bluetooth·bluetooth_lib)와 보드 쪽 ubluetooth·ESP32BLE 계열 — CODE_MAPPING §3.7 BTPC, §3.9 VB-BLE
    test: importRule(['ubluetooth', 'bluetooth', 'bluetooth_lib', 'bleak', 'ESP32BLE', 'ESP32BLE_LIB', 'esp32_ble_util']),
    why: 'ubluetooth·bluetooth·bleak·ESP32BLE 가운데 하나를 import',
  },
  {
    kind: 'wifi',
    // MicroPython의 network.WLAN — PLAN §6.3 2차 기능
    test: importRule(['network']),
    why: 'network(WLAN) 모듈을 import',
  },
  {
    kind: 'mqtt',
    // umqtt.simple(보드)과 paho·mqtt(컴퓨터) — PLAN §7.4
    test: importRule(['umqtt', 'mqtt', 'paho']),
    why: 'umqtt·mqtt 모듈을 import',
  },
  {
    kind: 'tab',
    // 사이트가 만든 새 예제용 bridge 모듈(PLAN §7.6) — 같은 컴퓨터 탭 통로
    test: importRule(['bridge']),
    why: '사이트 bridge 모듈을 import',
  },
]);

/** 코드에서 알아낸 통신 방식(EXAMPLE_COMM_KINDS 순서, 중복 없음). 아무 규칙에도 맞지 않으면 빈 목록. */
export function commKindsFromCode(code: string): string[] {
  const found = new Set<string>();
  for (const rule of COMM_RULES) {
    if (rule.test.test(code)) {
      found.add(rule.kind);
    }
  }
  return EXAMPLE_COMM_KINDS.filter((kind) => found.has(kind));
}

/**
 * 3. 하드웨어 없이 끝까지 되나(virtual_ok) — 사이드카·차시 md에 적지 않았을 때의 사이트 규칙(2026-09-25 Phase 4 검토 반영).
 *    두 실습실의 예제는 **모두** 하드웨어 없이 된다: 영상처리 실습실은 샘플 영상·재생 입력·가상 데스크톱으로, ESP32 실습실은
 *    가상 보드로(절대 원칙 3 "하드웨어 없어도 100%"). 옮겨 온 ESP32 예제는 예제 스모크(tests/e2e/examples-smoke.spec.ts)가 가상
 *    보드에서 한 번씩 돌려 기대 결과(원본 그대로의 오류 포함 — 실물에서도 같다)를 확인한다. 전에는 적은 예제만 세어 "하드웨어 없이
 *    되는 예제 37개"(152개 가운데)로 보여, 하드웨어 없는 학교가 나머지는 못 한다고 읽었다.
 *    실물에서만 되는 예제가 생기면 그 사이드카에 `virtual_ok: false`를 적는다(적은 값이 이긴다).
 */
export function virtualOkByRule(lab: GalleryLabId): boolean {
  return lab === 'vision' || lab === 'esp32';
}

/** 규칙 설명(문서·테스트가 읽는다). 화면에는 쓰지 않는다. */
export function commRuleReasons(): Readonly<Record<string, string>> {
  return Object.fromEntries(COMM_RULES.map((rule) => [rule.kind, rule.why]));
}
