/**
 * 실제 보드로 보내는 MQTT 코드의 **통신 접두어 검사**(PLAN §7.4 PD-29 — 2026-09-25 Phase 4 검토 반영).
 *
 * 왜 필요한가: 가상 보드는 통로(`topics.ts` `withTopicPrefix`)가 짧은 토픽 앞에 이 수업의 무작위 접두어를 붙여 준다. 실제 보드는
 * 코드 글자 그대로 공개 중계 서버에 붙으므로, 접두어 없이 `esp32-01/rx`로 올리면 **같은 템플릿을 올린 전국의 보드가 한 토픽을 나눠 쓴다**
 * (공개 저장소라 토픽을 아는 누구나 on·off를 보내 남의 LED를 움직이고, 모든 보드가 보낸 값을 본다). [보드에 저장]하면 main.py로 남아
 * 수업 뒤에도 전원만 넣으면 그 토픽에 붙는다. 그래서 [실제 보드]의 [실행]·[보드에 저장] 앞에서 이 검사로 멈추고 한국어로 알린다.
 *
 * 무엇을 "접두어가 있다"로 보나(정확한 증명이 아니라 안전망 — 모르면 막는다)
 * - `PREFIX = "7kq2m9xd4hpt"`처럼 이름에 PREFIX가 든 변수에 12글자 접두어를 넣은 줄(템플릿·통신 블록이 쓰는 모양), 또는
 * - `"7kq2m9xd4hpt/esp32-01/rx"`처럼 12글자 접두어로 시작하는 토픽 글자.
 * 접두어 글자는 브릿지가 만드는 글자(`PREFIX_ALPHABET` — l·o·0·1 없음)로만 본다.
 *
 * 이 파일은 순수 함수만 둔다(단위 테스트 `tests/unit/mqtt/real-board-guard.test.ts`).
 */
import { PREFIX_ALPHABET, PREFIX_LENGTH } from '../bridge/index.ts';

/** 코드가 MQTT(umqtt)를 쓰나 — import 줄이나 MQTTClient(…) 만들기 */
const MQTT_USE_PATTERN = /^[ \t]*(?:from[ \t]+umqtt(?:\.\w+)?[ \t]+import\b|import[ \t]+umqtt\b)|\bMQTTClient[ \t]*\(/mu;

const PREFIX_CHARS = `[${PREFIX_ALPHABET}]{${PREFIX_LENGTH}}`;
/** `PREFIX = "…"`·`MQTT_PREFIX = '…'` — 이름에 PREFIX가 든 변수에 12글자 접두어 */
const PREFIX_ASSIGN_PATTERN = new RegExp(`\\b\\w*PREFIX\\w*[ \\t]*=[ \\t]*(["'])${PREFIX_CHARS}\\1`, 'u');
/** `"7kq2m9xd4hpt/esp32-01/rx"` — 12글자 접두어로 시작하는 토픽 글자 */
const PREFIX_TOPIC_PATTERN = new RegExp(`(["'])${PREFIX_CHARS}/`, 'u');

/** 코드의 `PREFIX = "…"` 줄(값을 바꿔 쓸 자리). 들여쓰기 없는 줄만 본다 — 함수 안의 같은 이름은 건드리지 않는다. */
const PREFIX_LINE_PATTERN = /^(\w*PREFIX\w*)[ \t]*=[ \t]*(["'])([^"'\n]*)\2/mu;

/** 주석 줄을 빼고 본다(주석 속 `import umqtt` 설명에 걸리지 않게) */
function withoutComments(code: string): string {
  return code
    .split('\n')
    .map((line) => (/^[ \t]*#/u.test(line) ? '' : line))
    .join('\n');
}

/** 코드가 MQTT를 쓰나 */
export function usesMqtt(code: string): boolean {
  return MQTT_USE_PATTERN.test(withoutComments(code));
}

/** 코드에 통신 접두어가 적혀 있나(변수 또는 토픽 글자) */
export function hasTopicPrefix(code: string): boolean {
  const body = withoutComments(code);
  return PREFIX_ASSIGN_PATTERN.test(body) || PREFIX_TOPIC_PATTERN.test(body);
}

/** 실제 보드로 보내면 안 되는 모양이면 까닭(한국어), 괜찮으면 null */
export function mqttPrefixProblem(code: string): string | null {
  if (!usesMqtt(code) || hasTopicPrefix(code)) {
    return null;
  }
  return REAL_BOARD_MQTT_TEXT.noPrefix();
}

/** `PREFIX = "…"` 줄의 값 자리(바꿔 쓸 범위). 없으면 null */
export function findPrefixValue(code: string): { from: number; to: number; name: string; value: string } | null {
  const match = PREFIX_LINE_PATTERN.exec(code);
  if (!match || match.index === undefined) {
    return null;
  }
  const name = match[1] ?? '';
  const quote = match[2] ?? '"';
  const value = match[3] ?? '';
  // 값 자리 = 여는 따옴표 바로 뒤부터 닫는 따옴표 앞까지
  const opening = match.index + match[0].indexOf(quote);
  return { from: opening + 1, to: opening + 1 + value.length, name, value };
}

/** 이 파일이 학생에게 보이는 문장(실제 보드 [실행]·[보드에 저장] 앞 — 한 곳에 모은다) */
export const REAL_BOARD_MQTT_TEXT = {
  /** 접두어 없이 실제 보드로 보내려 할 때 */
  noPrefix(): string {
    return (
      '이 코드는 MQTT로 공개 중계 서버에 붙는데 토픽 앞에 우리 반 통신 접두어(12글자)가 없어서 실제 보드로 보내지 않았어요. ' +
      '그대로 올리면 같은 코드를 쓰는 모든 보드와 한 토픽을 나눠 써서, 누구나 내 보드에 명령을 보낼 수 있어요. ' +
      '입력·출력 칸 아래 MQTT 칸의 [코드에 접두어 적기]를 누르거나, PREFIX = "…" 줄에 MQTT 칸의 통신 접두어를 적은 뒤 다시 눌러요.'
    );
  },
  /** 오류 결과의 한 줄 요약(실습실 결과 줄·오류 풀이 카드가 읽는다) */
  noPrefixShort(): string {
    return '토픽 앞에 통신 접두어가 없어서 실제 보드로 보내지 않았어요.';
  },
  /** 접두어가 있어 실제 보드로 보낼 때 한 번 — 실물은 코드에 적은 중계 서버에 직접 붙는다(§7.4 경고) */
  publicBroker(): string {
    return (
      '이 코드는 실제 보드에서 보드의 와이파이로 코드에 적은 중계 서버에 직접 붙어요(화면의 MQTT 칸 통로와 상관없어요). ' +
      '공개 중계 서버는 누구나 보고 보낼 수 있어요 — 개인정보를 보내지 말고, 받은 명령으로는 LED·LCD 같은 표시 장치만 움직여요.'
    );
  },
} as const;

/** 오류 결과의 종류 이름(오류 사전 comm 묶음 `comm-mqtt-real-no-prefix`) */
export const MQTT_NO_PREFIX_ERROR = 'MqttNoPrefix';
