/**
 * 브릿지가 학생에게 보여 주는 **모든 한국어 문장과 오류 종류**를 여기 한 곳에 모은다(P4-01 임무 3).
 * 화면·파이썬 흉내 모듈·통로 구현은 문장을 직접 쓰지 않고 이 파일의 함수를 부른다 — 같은 상황에 두 가지 문구가 생기지 않게.
 *
 * 문장 규칙(SPEC §2 초보자 우선)
 * - 고1이 처음 읽어도 아는 낱말로 쓰고, 무엇을 하면 되는지 한 문장을 붙인다.
 * - "대기열"·"큐"·"바이트 스트림" 같은 안쪽 용어 대신 "차례"·"보낼 것"처럼 푼 말을 쓴다(바이트는 수업에서 쓰는 말이라 그대로 둔다).
 * - 통로 이름은 화면에 보이는 한국어 이름(BridgeChannel.label)을 넣는다.
 */
import { withParticle } from '../../lib/korean.ts';
import type { BridgeParty, BridgeWarning, BridgeWarningCode } from './types.ts';
import { partyLabel } from './types.ts';

/**
 * 한 메시지의 최대 길이(끝 문자 포함, 바이트) — PLAN §7.2 규칙 3.
 * MicroPython의 블루투스 GATT 특성 기본 버퍼가 20바이트다(https://docs.micropython.org/en/latest/library/bluetooth.html, 확인됨).
 * 이 값을 넘으면 실물에서 잘리므로 보내기 전에 경고한다.
 */
export const BRIDGE_MAX_BYTES = 20;

/** 보내는 사이 최소 간격(밀리초) — 초당 10회(PLAN §7.2 규칙 4, 원고 187쪽) */
export const BRIDGE_MIN_INTERVAL_MS = 100;

/** 보낼 차례에 쌓아 둘 수 있는 메시지 수(넘으면 오래된 상태 메시지부터 버린다) */
export const BRIDGE_MAX_QUEUE = 64;

/** 글자 하나가 몇 바이트인지 세는 도구(UTF-8) */
const encoder = new TextEncoder();

/** 글의 UTF-8 바이트 수 */
export function byteLengthOf(text: string): number {
  return encoder.encode(text).length;
}

/** 긴 글을 화면에 보일 만큼 자른다(오류 문장 안에 넣을 때) */
export function previewOf(text: string, limit = 24): string {
  const flat = text.replace(/\r/gu, '\\r').replace(/\n/gu, '\\n');
  return flat.length <= limit ? flat : `${flat.slice(0, limit)}…`;
}

/** 한국어 문장 모음. 화면·오류가 모두 여기서 문장을 가져간다. */
export const bridgeText = {
  /** 20바이트를 넘음 */
  tooLong(text: string, byteLength: number, limit = BRIDGE_MAX_BYTES): string {
    return (
      `보내려는 메시지가 ${byteLength}바이트라 한 번에 보낼 수 있는 ${limit}바이트를 넘어요. ` +
      `실제 보드에서는 뒷부분이 잘려요 — 짧게 줄여 보내요. (보내려던 글: ${previewOf(text)})`
    );
  },
  /** 글 가운데에 줄바꿈이 들어감 */
  newlineInside(text: string): string {
    return `메시지 가운데에 줄바꿈이 있어서 받는 쪽에서는 두 줄로 나뉘어요. 한 줄로 만들어 보내요. (보내려던 글: ${previewOf(text)})`;
  },
  /** 빈 메시지 */
  empty(): string {
    return '보낼 내용이 비어 있어요. 보낼 글자를 넣어요.';
  },
  /** 대기열이 가득 참 */
  queueFull(dropped: number): string {
    return `보낼 것이 너무 많이 밀려서 오래된 ${dropped}개를 버렸어요. 보내는 횟수를 줄여 보세요(초당 10번까지 나가요).`;
  },
  /** 닫힌 통로로 보내려 함 */
  closed(channelLabel: string): string {
    return `${withParticle(channelLabel, '이/가')} 닫혀 있어서 보내지 못했어요. 연결을 다시 해 보세요.`;
  },
  /** 받을 상대가 없음 */
  noPeer(channelLabel: string, expected?: BridgeParty): string {
    const who = expected === undefined ? '받을 쪽' : partyLabel(expected);
    return (
      `${channelLabel}에서 ${withParticle(who, '을/를')} 찾지 못했어요. ` +
      '받을 쪽 화면(예: ESP32 실습실)을 다른 탭에 열고 같은 접두어로 연결했는지 확인해요.'
    );
  },
  /** 허용 목록에 없는 메시지를 받음(PD-29) */
  notAllowed(text: string, allow: readonly string[]): string {
    const list = allow.length === 0 ? '없음' : allow.map((item) => `"${item}"`).join(', ');
    return `받은 메시지 "${previewOf(text)}"는 허용한 명령이 아니라서 무시했어요. 허용한 명령: ${list}`;
  },
  /** 받은 메시지가 너무 김 */
  receivedTooLong(byteLength: number, limit = BRIDGE_MAX_BYTES): string {
    return `받은 메시지가 ${byteLength}바이트로 ${limit}바이트를 넘어서 무시했어요.`;
  },
  /** 접두어 모양이 틀림 */
  badPrefix(value: string): string {
    return `통신 접두어 "${previewOf(value)}"는 쓸 수 없어요. 영문 소문자와 숫자 12글자로 만들어요(헷갈리는 l·1·O·0은 빼요).`;
  },
  /** 공개 브로커 경고(§7.4 — 화면에 늘 보인다) */
  publicBrokerNotice(): string {
    return (
      '이 통신은 누구나 보고, 누구나 보낼 수도 있어요. ' +
      '이름·연락처·사진 같은 개인정보를 보내지 말고, 레이저·모터처럼 움직이는 장치는 연결하지 마세요.'
    );
  },
  /** 같은 컴퓨터 탭 통로 안내(PD-17) */
  tabChannelNotice(): string {
    return '같은 컴퓨터의 다른 탭하고만 통해요. 인터넷이 없어도 되고, 내용이 이 컴퓨터 밖으로 나가지 않아요.';
  },
  /** 콘솔에 보이는 보낸 기록(§7.6 규칙 ⑤ — 원본 코드처럼 `Sent: …`) */
  sentLine(text: string): string {
    return `Sent: ${text}`;
  },
} as const;

/** 알림 하나를 만든다 */
export function bridgeWarning(code: BridgeWarningCode, text: string): BridgeWarning {
  return Object.freeze({ code, text });
}

/** 브릿지 오류의 뿌리 — 종류는 name과 code로 가른다(실습실 오류 카드가 name으로 풀이를 찾는다). */
export class BridgeError extends Error {
  override readonly name: string = 'BridgeError';
  readonly code: BridgeWarningCode;
  constructor(code: BridgeWarningCode, message: string) {
    super(message);
    this.code = code;
  }
}

/** 통로가 닫혀 보내지 못함 */
export class BridgeClosedError extends BridgeError {
  override readonly name = 'BridgeClosed';
  constructor(channelLabel: string) {
    super('closed', bridgeText.closed(channelLabel));
  }
}

/** 받을 상대가 없음(같은 컴퓨터 탭 통로에서 ESP32 실습실 탭이 없을 때) */
export class BridgeNoPeerError extends BridgeError {
  override readonly name = 'BridgeNoPeer';
  constructor(channelLabel: string, expected?: BridgeParty) {
    super('no-peer', bridgeText.noPeer(channelLabel, expected));
  }
}

/** 메시지를 만들 수 없음(빈 메시지 등) */
export class BridgeMessageError extends BridgeError {
  override readonly name = 'BridgeMessageError';
  constructor(code: BridgeWarningCode, message: string) {
    super(code, message);
  }
}
