// 블록 모드 단위 테스트가 함께 쓰는 작업판(직렬화 모양).
import { chain } from '../../../../src/lab/blocks/presets.ts';
import { forever, stateOf } from './blockly-node.ts';

/** 시나리오 B: 계속 반복하기 — 만약 터치 센서(17) 누르고 있나요? 이면 내장 LED 켜기, 아니면 끄기 */
export const TOUCH_LED_STATE = stateOf(
  forever(
    chain([
      {
        type: 'controls_if',
        extraState: { hasElse: true },
        inputs: {
          IF0: { block: { type: 'apc_touch_pressed', fields: { PIN: '17' } } },
          DO0: { block: { type: 'apc_builtin_led', fields: { STATE: 'on' } } },
          ELSE: { block: { type: 'apc_builtin_led', fields: { STATE: 'off' } } },
        },
      },
    ]),
  ),
);
