/**
 * 브릿지 메시지 만들기·검사(PLAN §7.2 규칙 1·2·3·5·7·8, P4-01). 순수 함수라 화면 없이 단위 테스트로 규칙을 하나씩 확인한다.
 *
 * 규칙이 어디에 들어갔나
 * - 규칙 1 모양 세 가지(명령 한 글자 / 값 목록 / 머리말 + 필드) → classifyText
 * - 규칙 2 끝 문자 `\n` 한 개 → textMessage의 terminator(기본 '\n')
 * - 규칙 3 끝 문자까지 20바이트 → inspectBytes (넘으면 경고만 하고 보내는 것은 막지 않는다 — 실물처럼 잘리는 것을 보여 주려고, §7.7)
 * - 규칙 5 상태/이벤트 → classifyText의 category와 mergeKey
 * - 규칙 7 원시 바이트 모드 → rawMessage(끝 문자를 붙이지 않는다)
 * - 규칙 8 원본 PC 코드가 보낸 바이트는 그대로 → rawMessage는 bytes를 복사만 하고 한 바이트도 더하거나 빼지 않는다
 *
 * 상태와 이벤트를 어떻게 가르나(자료 기준 — CODE_MAPPING §6.1)
 * - `DATA,mx,my,d,r`(5필드)에서 4·5번째 클릭 표시가 1이면 **이벤트**다. 윙크 한 번이 사라지면 안 되기 때문이다(§7.6 규칙 ③).
 * - 그 밖의 좌표·개수·명령 한 글자는 **상태**다. 밀리면 최신 값만 남는다.
 * - 새 예제가 `bridge.event(text)`로 보내면 모양과 상관없이 이벤트가 된다.
 */
import { BRIDGE_MAX_BYTES, bridgeText, bridgeWarning } from './messages.ts';
import type { BridgeCategory, BridgeMessage, BridgeShape, BridgeWarning } from './types.ts';

const encoder = new TextEncoder();
/** 깨진 바이트가 있으면 오류를 내는 해독기(글자로 읽을 수 있는지 판단하려고) */
const strictDecoder = new TextDecoder('utf-8', { fatal: true });

/** 기본 끝 문자(§7.2 규칙 2) */
export const BRIDGE_TERMINATOR = '\n';

/** 메시지 모양·갈래 판정 결과 */
export interface BridgeClassification {
  readonly shape: BridgeShape;
  readonly category: BridgeCategory;
  /** 대기열에서 바꿔 끼울 자리 이름(§7.6 ②④). null이면 절대 안 바뀐다 */
  readonly mergeKey: string | null;
  /** 'fields' 모양일 때의 머리말(DATA 등), 아니면 null */
  readonly header: string | null;
  /** 'fields'·'values'일 때 쉼표로 나눈 칸 수 */
  readonly fieldCount: number;
}

/** 명령 한 글자: 눈에 보이는 아스키 한 글자(`a`, `b`, `c`) */
const COMMAND_PATTERN = /^[!-~]$/u;
/** 값 하나: 정수·소수(음수 포함) */
const NUMBER_PATTERN = /^-?\d+(?:\.\d+)?$/u;
/** 머리말: 영문 대문자·숫자·밑줄(DATA 같은 것) */
const HEADER_PATTERN = /^[A-Z][A-Z0-9_]*$/u;
/** 글로 볼 수 없는 제어 문자(줄바꿈·탭은 뺀다) */
const CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

/**
 * 글자 한 줄의 모양·갈래를 정한다(끝 문자는 뺀 글을 넣는다).
 * 판정은 자료의 받는 쪽 코드(CODE_MAPPING §6.1 U1~U4·B2~B5)가 실제로 읽는 방식에 맞췄다.
 */
export function classifyText(text: string): BridgeClassification {
  const parts = text.split(',');
  const first = parts[0] ?? '';
  // ① 값 목록이 먼저다 — 손가락 개수 '3'은 한 글자지만 명령이 아니라 값이라서, 다음 개수 '4'와 바뀌어 끼워져야 한다.
  if (text !== '' && parts.every((part) => part.trim() !== '' && NUMBER_PATTERN.test(part.trim()))) {
    return { shape: 'values', category: 'state', mergeKey: `values:${parts.length}`, header: null, fieldCount: parts.length };
  }
  // ② 명령 한 글자 — 규칙 ④ "직전과 같으면 합친다"라 열쇠에 글자를 넣어 **같은 글자끼리만** 합쳐지게 한다('a'와 'b'는 둘 다 나간다).
  if (COMMAND_PATTERN.test(text)) {
    return { shape: 'command', category: 'state', mergeKey: `command:${text}`, header: null, fieldCount: 1 };
  }
  // ③ 머리말 + 필드 — 받는 쪽이 필드 수로 검사하는 모양(f099의 3필드, f105~f115의 5필드)
  if (parts.length >= 2 && HEADER_PATTERN.test(first)) {
    const clickFlags = parts.slice(3).some((part) => part.trim() === '1');
    const isClickEvent = first === 'DATA' && parts.length === 5 && clickFlags;
    return {
      shape: 'fields',
      // 규칙 ② "머리말·필드 수가 같으면 바꿔 끼운다" / 규칙 ③ 클릭 표시가 1이면 바꾸지 않는다
      category: isClickEvent ? 'event' : 'state',
      mergeKey: isClickEvent ? null : `fields:${first}:${parts.length}`,
      header: first,
      fieldCount: parts.length,
    };
  }
  // ④ 셋 다 아닌 글자 줄 — 보내기는 하되 같은 글끼리만 합친다(§7.2 규칙 1은 새 예제에 세 모양만 권한다).
  return { shape: 'other', category: 'state', mergeKey: `other:${text}`, header: null, fieldCount: parts.length };
}

/** 나가는 바이트를 검사해 알림 목록을 만든다(§7.2 규칙 3). 보내기를 막지는 않는다. */
export function inspectBytes(bytes: Uint8Array, text: string | null, limit = BRIDGE_MAX_BYTES): BridgeWarning[] {
  const warnings: BridgeWarning[] = [];
  if (bytes.length === 0) {
    warnings.push(bridgeWarning('empty', bridgeText.empty()));
    return warnings;
  }
  if (bytes.length > limit) {
    warnings.push(bridgeWarning('too-long', bridgeText.tooLong(text ?? '(바이트)', bytes.length, limit)));
  }
  if (text !== null && text.includes('\n')) {
    warnings.push(bridgeWarning('newline-inside', bridgeText.newlineInside(text)));
  }
  return warnings;
}

/** textMessage에 줄 수 있는 것 */
export interface TextMessageOptions {
  /** 끝에 붙일 글자(기본 '\n'). 붙이지 않으려면 '' */
  readonly terminator?: string;
  /** 모양 판정을 무시하고 갈래를 못 박는다(bridge.event가 쓴다) */
  readonly category?: BridgeCategory;
  /** 길이 한도(기본 20바이트) */
  readonly maxBytes?: number;
}

/**
 * 글자 한 줄을 보낼 메시지로 만든다. 끝 문자 `\n`을 한 개 붙이고(이미 있으면 더 붙이지 않는다) 길이를 검사한다.
 * 새 예제의 `bridge.send(text)`·`bridge.event(text)`가 이 길로 온다.
 */
export function textMessage(text: string, options: TextMessageOptions = {}): BridgeMessage {
  const terminator = options.terminator ?? BRIDGE_TERMINATOR;
  const body = text.endsWith(terminator) && terminator !== '' ? text.slice(0, text.length - terminator.length) : text;
  const wire = `${body}${terminator}`;
  const bytes = encoder.encode(wire);
  const classification = classifyText(body);
  const category = options.category ?? classification.category;
  return Object.freeze({
    bytes,
    text: body,
    category,
    shape: classification.shape,
    // 갈래를 이벤트로 못 박으면 절대 바뀌지 않는다(§7.2 규칙 5)
    mergeKey: category === 'event' ? null : classification.mergeKey,
    warnings: Object.freeze(inspectBytes(bytes, body, options.maxBytes)),
  });
}

/** rawMessage에 줄 수 있는 것 */
export interface RawMessageOptions {
  readonly category?: BridgeCategory;
  readonly maxBytes?: number;
}

/**
 * 바이트를 **그대로** 보낼 메시지로 만든다(§7.2 규칙 7·8). 끝 문자를 붙이지 않는다.
 * 원본 PC 코드(`serial.write(b'a')`, `b.send("355,152")`)가 보낸 바이트가 이 길로 온다 —
 * 글자로 읽히면 모양을 판정해 §7.6 병합 규칙을 적용하고, 못 읽으면 'bytes' 모양이라 절대 합치지 않는다.
 */
export function rawMessage(bytes: Uint8Array, options: RawMessageOptions = {}): BridgeMessage {
  const copy = new Uint8Array(bytes);
  let text: string | null = null;
  try {
    const decoded = strictDecoder.decode(copy);
    // 글자로 읽히더라도 제어 문자가 섞여 있으면 글이 아니라 이진 값이다(f007의 0x01~0x04, MP3 명령의 0x06).
    text = CONTROL_PATTERN.test(decoded) ? null : decoded;
  } catch {
    text = null;
  }
  if (text === null) {
    return Object.freeze({
      bytes: copy,
      text: null,
      category: options.category ?? 'state',
      shape: 'bytes' as BridgeShape,
      mergeKey: null,
      warnings: Object.freeze(inspectBytes(copy, null, options.maxBytes)),
    });
  }
  // 원본 코드가 끝 문자를 붙였을 수도 있다 — 모양 판정은 끝 문자를 뺀 글로 하고, 나가는 바이트는 그대로 둔다.
  const body = text.replace(/\r?\n$/u, '');
  const classification = classifyText(body);
  const category = options.category ?? classification.category;
  return Object.freeze({
    bytes: copy,
    text: body,
    category,
    shape: classification.shape,
    mergeKey: category === 'event' ? null : classification.mergeKey,
    warnings: Object.freeze(inspectBytes(copy, body, options.maxBytes)),
  });
}

/**
 * **바이트 흐름** 조각(보드의 UART가 내보낸 것 → 컴퓨터)을 메시지로 만든다(2026-09-25 Phase 4 검토 반영).
 * 시리얼 선은 글자 줄이 아니라 바이트가 차례로 흐르는 길이라, 모양을 판정해 합치면(§7.6 병합) 줄이 사라진다
 * (보드가 `0\n`…`4\n`을 따로 쓰면 `values:1`로 합쳐져 1·2·3이 없어졌다). 그래서 이 메시지는 **절대 합치지 않고**(이벤트, mergeKey 없음)
 * 20바이트·줄바꿈 알림도 붙이지 않는다(20바이트는 블루투스 특성의 한도이고 UART에는 없다). 조각을 이어 붙이는 일은 보내는 쪽
 * (`BridgeOutbox.replaceTail`)이 한다.
 */
export function streamMessage(bytes: Uint8Array): BridgeMessage {
  return Object.freeze({
    bytes: new Uint8Array(bytes),
    text: null,
    category: 'event' as BridgeCategory,
    shape: 'bytes' as BridgeShape,
    mergeKey: null,
    warnings: Object.freeze([]),
  });
}

/** 메시지를 콘솔 한 줄로(§7.6 규칙 ⑤ — 원본 코드처럼 `Sent: …`) */
export function sentLineOf(message: BridgeMessage): string {
  if (message.text !== null) {
    return bridgeText.sentLine(message.text);
  }
  const hex = Array.from(message.bytes, (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ');
  return bridgeText.sentLine(hex);
}

/** 두 메시지의 바이트가 같은지(합치기 판단) */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }
  return true;
}
