/**
 * 교실 블루투스 이름 규칙(PLAN §7.3 "교실 블루투스 이름 규칙", §10 개인정보, P4-04) — 순수 논리(DOM 없음).
 *
 * 왜 필요한가: 자료의 보드 코드는 모두 `ESP32BLE.init()` 기본값 `"ESP32"`로 광고한다. 한 교실에서 30대가 같은 이름으로
 * 광고하면 **선택 창에서 내 보드를 고를 수 없다**(브라우저는 기기 주소를 보여 주지 않는다 — MDN BluetoothDevice.id는
 * 사이트마다 다른 값이라 주소가 아니다). 그래서 사이트판 예제·안내는 `ESP32BLE.init("ESP32-07")`처럼 자리 번호를 붙이게 한다.
 *
 * 개인정보: 광고 이름은 주변 누구에게나 보인다. 이름·학번·전화번호가 들어가면 경고한다(PLAN §10, 과목 교육과정의
 * "다른 학생의 네트워크에 연결하지 않도록 지도한다"와 같은 결).
 *
 * 길이: `ESP32BLE.py`의 광고 데이터는 `b'\x02\x01\x02'`(3바이트) + 길이·형식 2바이트 + 이름이다. BLE 레거시 광고 한 줄이
 * 31바이트라 이름은 **26바이트까지** 들어간다. 그보다 길면 실물에서 어떻게 되는지는 확인하지 못해 "경고"로만 알린다(실기기 확인 목록).
 */

/** 광고 이름에 들어갈 수 있는 바이트(위 머리말 계산) */
export const NAME_MAX_BYTES = 26;

/** 알림 수준 — error는 고쳐야 하고, warn은 그대로 둬도 되지만 알려 준다 */
export type NameIssueLevel = 'error' | 'warn';

export interface NameIssue {
  readonly level: NameIssueLevel;
  readonly code: 'empty' | 'too-long' | 'personal' | 'hangul' | 'space' | 'default-name';
  readonly text: string;
}

const encoder = new TextEncoder();

/** 한글 음절·자모가 들어 있나 */
function hasHangul(text: string): boolean {
  return /[ㄱ-ㆎ가-힣]/u.test(text);
}

/** 학번처럼 보이는 숫자 덩어리(네 자리 이상)가 들어 있나 */
function hasStudentNumber(text: string): boolean {
  return /(?<!\d)\d{4,}(?!\d)/u.test(text.replace(/ESP32/giu, ''));
}

/** 전화번호처럼 보이나 */
function hasPhoneNumber(text: string): boolean {
  return /01[016789][-\s]?\d{3,4}[-\s]?\d{4}/u.test(text);
}

/**
 * 보드 광고 이름을 검사한다. 돌려주는 목록이 비어 있으면 그대로 써도 되는 이름이다.
 * 화면은 error면 빨강, warn이면 노랑으로 보여 주고 어느 쪽이든 막지는 않는다(학생 코드를 사이트가 고치지 않는다 — PD-10).
 */
export function checkBoardName(name: string): readonly NameIssue[] {
  const issues: NameIssue[] = [];
  const trimmed = name.trim();
  if (trimmed === '') {
    return [{ level: 'error', code: 'empty', text: '보드 이름이 비어 있어요. ESP32-07처럼 자리 번호를 붙여요.' }];
  }
  if (trimmed === 'ESP32') {
    issues.push({
      level: 'warn',
      code: 'default-name',
      text: '기본 이름 그대로예요. 교실에 보드가 여럿이면 모두 같은 이름으로 보여서 내 보드를 고를 수 없어요 — ESP32-07처럼 자리 번호를 붙여요.',
    });
  }
  const bytes = encoder.encode(trimmed).length;
  if (bytes > NAME_MAX_BYTES) {
    issues.push({
      level: 'warn',
      code: 'too-long',
      text: `이름이 ${bytes}바이트예요. 광고에 실리는 이름은 ${NAME_MAX_BYTES}바이트까지라 뒷부분이 안 보일 수 있어요.`,
    });
  }
  if (hasPhoneNumber(trimmed) || hasStudentNumber(trimmed)) {
    issues.push({
      level: 'error',
      code: 'personal',
      text: '이름에 전화번호나 학번처럼 보이는 숫자가 있어요. 광고 이름은 주변 누구에게나 보이니 자리 번호만 써요.',
    });
  }
  if (hasHangul(trimmed)) {
    issues.push({
      level: 'warn',
      code: 'hangul',
      text: '한글 이름은 기기·앱에 따라 깨져 보일 수 있고, 사람 이름이 들어가기 쉬워요. 영문과 숫자로 지어요(예: ESP32-07).',
    });
  }
  if (/\s/u.test(trimmed)) {
    issues.push({ level: 'warn', code: 'space', text: '이름에 띄어쓰기가 있으면 선택 창에서 찾기 어려워요. 붙임표(-)로 이어요.' });
  }
  return issues;
}

/** 자리 번호로 권하는 이름(예: 7 → ESP32-07) */
export function suggestBoardName(seat: number, prefix = 'ESP32'): string {
  const number = Math.max(1, Math.min(99, Math.trunc(seat)));
  return `${prefix}-${String(number).padStart(2, '0')}`;
}

/** 보드 코드에 넣을 한 줄(학생이 그대로 복사한다) */
export function initLineFor(name: string): string {
  return `ble = ESP32BLE.init("${name}")`;
}

/**
 * 선택 창의 이름 앞부분을 다듬는다 — 앞뒤 공백을 없애고 길이를 자른다.
 * 비우면 "가까운 기기 모두 보기"가 되므로 빈 글자를 그대로 돌려준다(막지 않는다).
 */
export function normalizePrefix(value: string | null | undefined): string {
  return (value ?? '').trim().slice(0, NAME_MAX_BYTES);
}

/** 이름 앞부분에 개인정보가 들어갔는지(선택 창 칸에도 같은 규칙) */
export function checkPrefix(value: string): readonly NameIssue[] {
  const prefix = normalizePrefix(value);
  if (prefix === '') {
    return [];
  }
  return checkBoardName(prefix).filter((issue) => issue.code !== 'default-name' && issue.code !== 'empty');
}
