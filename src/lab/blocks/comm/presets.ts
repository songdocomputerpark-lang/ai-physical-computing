/**
 * 통신 블록 예시 작업판(P4-10) — 통신 템플릿 세 개(examples/esp32/templates/*.py)와 같은 일을 하는 블록 짜임.
 * 순수 데이터(Blockly.serialization.workspaces.load가 읽는 모양). 모양 규칙은 src/lab/blocks/presets.ts와 같다.
 *
 * 쓰는 곳: ① 단위 테스트(tests/unit/blocks/comm-generator.test.ts)가 "블록 → 코드"를 글자까지 본다.
 * ② 브라우저 테스트(tests/e2e/esp32-comm-blocks.spec.ts)가 이 코드를 실습실에 넣고 가상 보드에서 돌린다.
 * ③ [예시 불러오기] 목록에 넣으려면 src/lab/blocks/presets.ts의 BLOCK_PRESETS에 펼쳐 넣는다(공유 파일 — 요청에 적었다).
 */
import { chain, numberShadow, type BlocksPreset, type SerializedBlock, type SerializedWorkspace } from '../presets.ts';

function workspace(top: SerializedBlock | undefined): SerializedWorkspace {
  return { blocks: { languageVersion: 0, blocks: top ? [{ ...top, x: 32, y: 32 }] : [] } };
}

function textShadow(value: string): { shadow: SerializedBlock } {
  return { shadow: { type: 'text', fields: { TEXT: value } } };
}

function variable(name: string): SerializedBlock {
  return { type: 'variables_get', fields: { VAR: { name } } };
}

/** 변수 != '' 인지 */
function isNotEmpty(name: string): SerializedBlock {
  return {
    type: 'logic_compare',
    fields: { OP: 'NEQ' },
    inputs: { A: { block: variable(name) }, B: textShadow('') },
  };
}

/** 변수 == 값인지 */
function equalsText(name: string, value: string): SerializedBlock {
  return {
    type: 'logic_compare',
    fields: { OP: 'EQ' },
    inputs: { A: { block: variable(name) }, B: textShadow(value) },
  };
}

export const COMM_BLOCK_PRESETS: readonly BlocksPreset[] = Object.freeze([
  {
    id: 'comm-uart-echo',
    title: '통신 1: UART 에코(받은 줄 돌려보내기)',
    description: 'USB-UART 변환기로 온 한 줄을 그대로 돌려보내요. 통신 템플릿 examples/esp32/templates/uart-echo.py와 같은 동작이에요.',
    state: workspace({
      type: 'apc_forever',
      inputs: {
        DO: {
          block: chain([
            { type: 'variables_set', fields: { VAR: { name: '받은줄' } }, inputs: { VALUE: { block: { type: 'apc_comm_uart_line' } } } },
            {
              type: 'controls_if',
              inputs: {
                IF0: { block: isNotEmpty('받은줄') },
                DO0: {
                  block: chain([
                    { type: 'text_print', inputs: { TEXT: { block: variable('받은줄') } } },
                    { type: 'apc_comm_uart_send', inputs: { TEXT: { block: variable('받은줄') } } },
                  ])!,
                },
              },
            },
            { type: 'apc_wait_seconds', inputs: { SECONDS: numberShadow(0.05) } },
          ])!,
        },
      },
    }),
  },
  {
    id: 'comm-ble-notify',
    title: '통신 2: 블루투스로 숫자 보내기',
    description: '1초마다 센 숫자를 블루투스로 보내고, 컴퓨터가 보낸 글도 받아요. 통신 템플릿 examples/esp32/templates/ble-notify.py와 같은 동작이에요.',
    state: workspace(
      chain([
        {
          type: 'apc_forever',
          inputs: {
            DO: {
              block: chain([
                { type: 'variables_set', fields: { VAR: { name: '받은글' } }, inputs: { VALUE: { block: { type: 'apc_comm_ble_received' } } } },
                {
                  type: 'controls_if',
                  inputs: { IF0: { block: isNotEmpty('받은글') }, DO0: { block: { type: 'text_print', inputs: { TEXT: { block: variable('받은글') } } } } },
                },
                { type: 'math_change', fields: { VAR: { name: '횟수' } }, inputs: { DELTA: numberShadow(1) } },
                { type: 'apc_comm_ble_send', inputs: { TEXT: { block: variable('횟수') } } },
                { type: 'apc_builtin_led_toggle' },
                { type: 'apc_wait_seconds', inputs: { SECONDS: numberShadow(1) } },
              ])!,
            },
          },
        },
      ]),
    ),
  },
  {
    id: 'comm-mqtt-pub-sub',
    title: '통신 3: MQTT로 값 보내고 명령 받기',
    description:
      '와이파이에 연결해 값을 1초마다 보내고(발행), 허용한 명령(on·off·blink)만 받아 LED를 켜요(구독). 통신 템플릿 examples/esp32/templates/mqtt-pub-sub.py와 같은 동작이에요.',
    state: workspace(
      chain([
        { type: 'apc_comm_wifi_connect' },
        { type: 'apc_comm_mqtt_connect' },
        {
          type: 'apc_forever',
          inputs: {
            DO: {
              block: chain([
                { type: 'variables_set', fields: { VAR: { name: '명령' } }, inputs: { VALUE: { block: { type: 'apc_comm_mqtt_command' } } } },
                {
                  type: 'controls_if',
                  inputs: { IF0: { block: equalsText('명령', 'on') }, DO0: { block: { type: 'apc_builtin_led', fields: { STATE: 'on' } } } },
                },
                {
                  type: 'controls_if',
                  inputs: { IF0: { block: equalsText('명령', 'off') }, DO0: { block: { type: 'apc_builtin_led', fields: { STATE: 'off' } } } },
                },
                { type: 'math_change', fields: { VAR: { name: '횟수' } }, inputs: { DELTA: numberShadow(1) } },
                { type: 'apc_comm_mqtt_publish', inputs: { VALUE: { block: variable('횟수') } } },
                { type: 'apc_wait_seconds', inputs: { SECONDS: numberShadow(1) } },
              ])!,
            },
          },
        },
      ]),
    ),
  },
]);

export function findCommPreset(id: string | null | undefined): BlocksPreset | null {
  return COMM_BLOCK_PRESETS.find((preset) => preset.id === id) ?? null;
}
