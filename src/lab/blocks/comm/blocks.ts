/**
 * 통신 블록의 모양·글(P4-10 "Blockly 블록(UART 쓰기·읽기, BLE 받기·보내기, Wi-Fi 연결, MQTT 발행·구독)과 Python 생성기").
 * Blockly JSON 정의라 모양·글자만 있고, 코드는 codegen.ts가 만든다. 규칙은 src/lab/blocks/blocks.ts 머리말과 같다:
 *
 * - 글은 고1이 처음 읽어도 되는 한국어. 툴팁에 "무엇을 하는지 + 코드 한 줄"을 적어 블록 = 코드를 익히게 한다.
 * - 블록 type 이름은 apc_comm_으로 시작한다(저장된 작업판 JSON에 들어가므로 바꾸면 옛 저장본을 못 읽는다).
 * - 색은 style 이름 하나(apc_comm_blocks)로만 정한다. 값은 theme.ts에 있어야 한다(공유 파일 — 요청 .cache/phase4-requests/templates.md).
 *   흰 글자와 명도 대비 4.5:1 이상인지는 tests/unit/blocks/comm-generator.test.ts가 확인한다.
 * - 핀은 고르게 하지 않는다: UART2는 사이트판 배선(보드 TX 17 · RX 16) 한 가지이고(PLAN §6.1), 블루투스·와이파이·MQTT는 핀이 없다.
 * 라이선스: 사이트 소프트웨어(MIT, PD-26).
 */
import type { BlockJson } from '../blocks.ts';
import { COMM_BLE_NAME, COMM_MQTT, COMM_UART, COMM_WIFI } from './plan.ts';

/** 통신 블록 색 이름(theme.ts BLOCK_COLOURS에 이 이름으로 값이 있어야 한다) */
export const COMM_BLOCK_STYLE = 'apc_comm_blocks';

/** 통신 블록 바탕색(요청한 theme.ts 값과 같아야 한다 — 흰 글자와 대비 4.5:1 이상) */
export const COMM_BLOCK_COLOUR = '#155e9c';

const ALLOW_TEXT = COMM_MQTT.allow.join(' · ');

export const COMM_BLOCK_DEFINITIONS: readonly BlockJson[] = Object.freeze([
  // ── 유선(UART) ──
  {
    type: 'apc_comm_uart_send',
    message0: 'UART로 %1 보내기',
    args0: [{ type: 'input_value', name: 'TEXT', check: ['String', 'Number'] }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: COMM_BLOCK_STYLE,
    tooltip: `USB-UART 변환기(보드 TX ${COMM_UART.boardTx} · RX ${COMM_UART.boardRx})로 글자 한 줄을 보내요. 끝에는 줄바꿈이 한 개 붙어요. 코드: uart.write('hello' + '\\n')`,
  },
  {
    type: 'apc_comm_uart_has_data',
    message0: 'UART로 온 글이 있나요?',
    output: 'Boolean',
    style: COMM_BLOCK_STYLE,
    tooltip: '컴퓨터가 보낸 글자가 보드에 와 있으면 참이에요. 코드: uart.any() > 0',
  },
  {
    type: 'apc_comm_uart_line',
    message0: 'UART로 온 한 줄',
    output: 'String',
    style: COMM_BLOCK_STYLE,
    tooltip: `줄바꿈까지 한 줄을 읽어 글자로 돌려줘요(${COMM_UART.timeoutMs}밀리초 안에 안 오면 빈 글자). 코드: uart_line()`,
  },

  // ── 무선 가까이(블루투스 BLE) ──
  {
    type: 'apc_comm_ble_send',
    message0: '블루투스로 %1 보내기',
    args0: [{ type: 'input_value', name: 'TEXT', check: ['String', 'Number'] }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: COMM_BLOCK_STYLE,
    tooltip: `보드가 컴퓨터로 글자 한 줄을 보내요(알림). 끝의 줄바꿈은 라이브러리가 붙여 줘요. 한 번에 20바이트까지예요. 아직 연결된 기기가 없으면 한국어로 알려 줘요. 코드: ble_send('COUNT,1')`,
  },
  {
    type: 'apc_comm_ble_received',
    message0: '블루투스로 받은 글',
    output: 'String',
    style: COMM_BLOCK_STYLE,
    tooltip: `컴퓨터가 보낸 한 줄을 돌려줘요(없으면 빈 글자). 한 번 읽으면 그 값은 사라져요. 보드 이름은 ${COMM_BLE_NAME}이에요. 코드: ble_line()`,
  },

  // ── 무선 멀리(와이파이 + MQTT) ──
  {
    type: 'apc_comm_wifi_connect',
    message0: '와이파이 %1 에 연결하기 (비밀번호 %2)',
    args0: [
      { type: 'field_input', name: 'NAME', text: COMM_WIFI.name, spellcheck: false },
      { type: 'field_input', name: 'PASSWORD', text: COMM_WIFI.password, spellcheck: false },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: COMM_BLOCK_STYLE,
    tooltip: '교실 와이파이에 연결해요(최대 10초 기다려요). 비밀번호는 다른 사람에게 알려 주지 않아요. 코드: wifi_connect(\'my-wifi\', \'my-password\')',
  },
  {
    type: 'apc_comm_mqtt_connect',
    message0: 'MQTT 브로커에 연결하기 (보드 %1)',
    args0: [{ type: 'field_input', name: 'DEVICE', text: COMM_MQTT.device, spellcheck: false }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: COMM_BLOCK_STYLE,
    tooltip: `공개 브로커(${COMM_MQTT.broker})에 이어 <보드>/rx 토픽을 구독해요. 우리 반 접두어 12글자는 사이트가 앞에 붙여 줘요. 보드 이름에 이름·학번 같은 개인정보는 넣지 않아요. 코드: mqtt_connect('${COMM_MQTT.device}')`,
  },
  {
    type: 'apc_comm_mqtt_publish',
    message0: 'MQTT로 %1 보내기',
    args0: [{ type: 'input_value', name: 'VALUE', check: ['String', 'Number'] }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: COMM_BLOCK_STYLE,
    tooltip: '값을 <접두어>/<보드>/tx 토픽으로 보내요(발행). 대시보드나 다른 탭이 그 토픽을 구독하면 값을 받아요. 코드: client.publish(mqtt_topic + \'/tx\', str(1))',
  },
  {
    type: 'apc_comm_mqtt_command',
    message0: 'MQTT로 받은 명령',
    output: 'String',
    style: COMM_BLOCK_STYLE,
    tooltip: `받은 명령을 돌려줘요(없으면 빈 글자). 허용한 명령(${ALLOW_TEXT})이 아니거나 ${COMM_MQTT.maxBytes}바이트를 넘으면 무시해요 — 공개 브로커는 누구나 보낼 수 있어요. 코드: mqtt_command()`,
  },
] satisfies BlockJson[]);

/** 통신 블록 type 목록 */
export const COMM_BLOCK_TYPES: readonly string[] = Object.freeze(COMM_BLOCK_DEFINITIONS.map((definition) => definition.type));
