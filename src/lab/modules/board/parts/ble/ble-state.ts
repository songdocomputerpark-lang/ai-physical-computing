/**
 * 가상 블루투스(BLE) 부품의 순수 논리 — 파이썬이 보낸 상태 읽기, 보낼 값 만들기, 화면 글 만들기(DOM 없음).
 * 단위 테스트 tests/unit/board-ble/ble-state.test.ts. 화면은 같은 폴더의 part.ts, 파이썬은 apc_part_ble.py·ext/ble/apc_board_ble.py.
 *
 * PLAN §6.2(BLE 주변기기), §7.2 PD-06(메시지 규칙 — 모양 세 가지·끝 문자·20바이트), §7.5(자료의 실제 메시지), §8.4 P4-03.
 * 보내는 값의 모양은 자료의 PC 쪽 코드가 실제로 보내는 것과 같다(docs/CODE_MAPPING.md §6.1):
 *   명령 한 글자 `a`(f140 → f147~f149) · 좌표 `355,152`(f089 → f086) · `DATA,x,y`(f100 → f099) · `DATA,mx,my,d,r`(f104 → f105~f115)
 *   · 스마트폰 앱의 이진 프레임 `FF 02 01 01 …`(앱 → f002).
 */

/** 블루투스 특성 값 한 칸의 기본 최대 길이(바이트) — 공식 MicroPython 문서 "default maximum size of 20 bytes" */
export const BLE_MAX_VALUE_BYTES = 20;

export interface BleCharacteristic {
  readonly handle: number;
  readonly write: boolean;
  readonly notify: boolean;
  readonly max: number;
}

/** 파이썬(apc_board_ble.RADIO.state())이 보낸 상태 — 모양이 바뀌면 두 파일을 함께 고친다 */
export interface BleDeviceState {
  readonly active: boolean;
  readonly advertising: boolean;
  readonly connectable: boolean;
  readonly intervalUs: number | null;
  /** 광고 데이터에서 읽은 기기 이름(없으면 null) */
  readonly name: string | null;
  /** 가상 기기 주소(실물 보드의 주소가 아니다) */
  readonly mac: string | null;
  readonly connections: readonly number[];
  readonly mtu: number;
  readonly chars: readonly BleCharacteristic[];
  /** 보드가 받은 횟수와 마지막 값 */
  readonly rxTotal: number;
  readonly rxLast: readonly number[];
  /** 20바이트를 넘어 잘린 횟수 */
  readonly rxTruncated: number;
  /** 보드가 알림으로 보낸 횟수와 마지막 값 */
  readonly txTotal: number;
  readonly txLast: readonly number[];
}

function numberOf(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function byteList(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item)).map((item) => Math.trunc(item) & 0xff);
}

/** 파이썬이 보낸 'board.device' 상태를 읽는다. 모양이 아니면 null(화면이 깨지지 않게 그 메시지만 버린다). */
export function parseBleState(value: unknown): BleDeviceState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (numberOf(raw.v, 0) !== 1) {
    return null;
  }
  const chars = Array.isArray(raw.chars)
    ? raw.chars
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .map((item) => ({ handle: numberOf(item.handle), write: item.write === true, notify: item.notify === true, max: numberOf(item.max, BLE_MAX_VALUE_BYTES) }))
    : [];
  return {
    active: raw.active === true,
    advertising: raw.advertising === true,
    connectable: raw.connectable !== false,
    intervalUs: typeof raw.intervalUs === 'number' && Number.isFinite(raw.intervalUs) ? raw.intervalUs : null,
    name: typeof raw.name === 'string' && raw.name !== '' ? raw.name : null,
    mac: typeof raw.mac === 'string' && raw.mac !== '' ? raw.mac : null,
    connections: Array.isArray(raw.connections) ? raw.connections.filter((item): item is number => typeof item === 'number') : [],
    mtu: numberOf(raw.mtu, 23),
    chars,
    rxTotal: numberOf(raw.rxTotal),
    rxLast: byteList(raw.rxLast),
    rxTruncated: numberOf(raw.rxTruncated),
    txTotal: numberOf(raw.txTotal),
    txLast: byteList(raw.txLast),
  };
}

/** 지금 상대 기기가 이어져 있나 */
export function isConnected(state: BleDeviceState | null): boolean {
  return state !== null && state.connections.length > 0;
}

/** 상태 줄 한 문장(색만으로 알리지 않게 글로도 적는다) */
export function bleStatusText(state: BleDeviceState | null, running: boolean): string {
  if (!running) {
    return '멈춤 — [실행]을 누르면 보드의 블루투스가 켜져요.';
  }
  if (state === null || !state.active) {
    return '블루투스 꺼짐 — 코드가 ble.active(True)를 하면 켜져요.';
  }
  if (state.connections.length > 0) {
    return `연결됨${state.name === null ? '' : `(${state.name})`} — 아래에서 값을 보내면 보드가 받아요.`;
  }
  if (state.advertising) {
    return `광고 중${state.name === null ? '' : `(이름 ${state.name})`} — [연결]을 누르면 상대 기기가 이어져요.`;
  }
  return '블루투스 켜짐 — 아직 광고를 시작하지 않았어요.';
}

/** 주고받은 수 한 줄(자주 바뀌므로 상태 줄과 따로 둔다 — 화면 낭독기가 매번 읽지 않게) */
export function bleCountsText(state: BleDeviceState | null): string {
  if (state === null) {
    return '';
  }
  const parts = [`보드가 받은 값 ${state.rxTotal}개`, `보드가 보낸 값 ${state.txTotal}개`];
  if (state.rxTruncated > 0) {
    parts.push(`20바이트가 넘어 잘린 값 ${state.rxTruncated}개`);
  }
  return parts.join(' · ');
}

/**
 * 보드가 실제로 받아 둔 마지막 값 한 줄. **보낸 값과 다를 수 있다** — 20바이트를 넘으면 앞부분만 남기 때문이다(§7.7).
 * 그 차이를 학생이 눈으로 보게 하려고 보낸 기록과 따로 보인다.
 */
export function bleLastReceivedText(state: BleDeviceState | null): string {
  if (state === null || state.rxTotal === 0) {
    return '';
  }
  return `보드가 받아 둔 값: ${bytesText(state.rxLast)}`;
}

/** 바이트 목록을 사람이 읽을 글로(읽을 수 없는 바이트는 16진수로) */
export function bytesText(bytes: readonly number[]): string {
  if (bytes.length === 0) {
    return '';
  }
  let text = '';
  for (const byte of bytes) {
    if (byte === 0x0a) {
      text += '\\n';
    } else if (byte === 0x0d) {
      text += '\\r';
    } else if (byte >= 0x20 && byte < 0x7f) {
      text += String.fromCharCode(byte);
    } else {
      text += `\\x${byte.toString(16).padStart(2, '0')}`;
    }
  }
  return text;
}

/** 바이트 목록을 16진수로: "ff 02 01" */
export function hexText(bytes: readonly number[]): string {
  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join(' ');
}

export type LineEnding = 'none' | 'lf';

/** 글자를 보낼 바이트로(UTF-8 + 끝 문자). 규칙은 PLAN §7.2-2(끝 문자는 \n 한 개). */
export function encodeText(text: string, ending: LineEnding): number[] {
  const body = ending === 'lf' && !text.endsWith('\n') ? `${text}\n` : text;
  return [...new TextEncoder().encode(body)];
}

/** 좌표를 보내는 모양(자료의 실제 메시지 — CODE_MAPPING §6.1) */
export type CoordinateShape = 'plain' | 'data3' | 'data5';

export const COORDINATE_SHAPES: readonly (readonly [CoordinateShape, string])[] = Object.freeze([
  ['plain', 'x,y  (3-1-3 예제)'],
  ['data3', 'DATA,x,y  (4-1-4 예제)'],
  ['data5', 'DATA,x,y,클릭,오른쪽  (4-2-1 예제)'],
]);

/** 좌표 범위(보내는 쪽이 카메라 픽셀인지 화면 좌표인지 — PLAN §7.5) */
export interface CoordinateRange {
  readonly id: string;
  readonly label: string;
  readonly width: number;
  readonly height: number;
}

export const COORDINATE_RANGES: readonly CoordinateRange[] = Object.freeze([
  { id: 'camera', label: '카메라 픽셀(640×480)', width: 640, height: 480 },
  { id: 'screen', label: '화면 좌표(3840×2160)', width: 3840, height: 2160 },
]);

export function rangeById(id: string | null): CoordinateRange {
  return COORDINATE_RANGES.find((range) => range.id === id) ?? COORDINATE_RANGES[0];
}

/** 좌표 메시지 한 줄(끝 문자 없이) — click은 4·5번째 칸(클릭·오른쪽 클릭) */
export function coordinateMessage(shape: CoordinateShape, x: number, y: number, click: 0 | 1 = 0, right: 0 | 1 = 0): string {
  const px = Math.round(x);
  const py = Math.round(y);
  if (shape === 'plain') {
    return `${px},${py}`;
  }
  if (shape === 'data3') {
    return `DATA,${px},${py}`;
  }
  return `DATA,${px},${py},${click},${right}`;
}

/**
 * 가상 스마트폰 앱이 보내는 이진 프레임(CODE_MAPPING §6.1 B6, f002).
 * 앞 네 바이트 `FF 02 01 01`만 앱과 같게 쓰고(규격 상수), 받는 코드는 `[5:-1]`을 글자로 읽어 '1'·'2'·'3'을 찾는다.
 * 앱 라이브러리 코드는 옮기지 않았고 상표·화면도 흉내 내지 않는다(SPEC §8).
 */
export function phoneAppFrame(digit: '1' | '2' | '3'): number[] {
  return [0xff, 0x02, 0x01, 0x01, 0x01, digit.charCodeAt(0), 0x00];
}

export interface SendPreview {
  /** 보낼 바이트 */
  readonly bytes: number[];
  /** 미리 보기 글 */
  readonly text: string;
  /** 20바이트를 넘으면 한국어 경고(보내기는 막지 않는다 — PLAN §7.7 "실물처럼 잘리는 것을 보여 준다") */
  readonly warning: string | null;
}

/** 보낼 바이트 하나를 미리 보기로 다듬는다 */
export function previewOf(bytes: readonly number[]): SendPreview {
  const list = [...bytes];
  const warning =
    list.length > BLE_MAX_VALUE_BYTES
      ? `${list.length}바이트예요. 블루투스 특성 한 칸은 기본 ${BLE_MAX_VALUE_BYTES}바이트라 보드에서는 앞 ${BLE_MAX_VALUE_BYTES}바이트만 남아요(실물도 같아요).`
      : null;
  return { bytes: list, text: bytesText(list), warning };
}

/** 보낸·받은 기록 한 줄 */
export function logLine(direction: 'send' | 'receive', bytes: readonly number[]): string {
  const arrow = direction === 'send' ? '→ 보냄' : '← 보드가 보냄';
  return `${arrow}  ${bytesText(bytes)}`;
}
