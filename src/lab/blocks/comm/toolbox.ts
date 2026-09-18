/**
 * 도구 상자의 "통신" 칸 한 개(P4-10 — src/lab/README.md 7.11 "도구 상자 한 칸 + 생성기").
 * 순수 데이터라 Blockly를 import하지 않는다. 칸 차례는 개념 계단(유선 → 블루투스 → 와이파이·MQTT, SPEC §6.3)을 따른다.
 *
 * 붙이는 곳: src/lab/blocks/kit.ts가 buildToolbox()를 부를 때 withCommCategory()로 감싼다(공유 파일 — 요청 .cache/phase4-requests/templates.md).
 * 공유 파일 src/lab/blocks/toolbox.ts는 고치지 않는다(그 파일의 TOOLBOX_CATEGORY_IDS를 보는 공유 테스트가 흔들리지 않게).
 */
import type { ToolboxCategory, ToolboxDefinitionJson, ToolboxItem } from '../toolbox.ts';
import { COMM_BLOCK_STYLE } from './blocks.ts';
import { COMM_MQTT } from './plan.ts';

/** 카테고리 줄 요소의 HTML id(브라우저 테스트가 `#blocks-cat-comm`으로 누른다) */
export const COMM_TOOLBOX_CATEGORY_ID = 'blocks-cat-comm';

/** 카테고리 이름(도구 상자에 보이는 글) */
export const COMM_TOOLBOX_CATEGORY_NAME = '통신';

function textInput(value: string): Record<string, unknown> {
  return { shadow: { type: 'text', fields: { TEXT: value } } };
}

const block = (type: string, extra: Omit<ToolboxItem, 'kind' | 'type'> = {}): ToolboxItem => ({ kind: 'block', type, ...extra });
const label = (text: string): ToolboxItem => ({ kind: 'label', text });

/** 통신 칸(도구 상자 카테고리 한 개) */
export function commToolboxCategory(): ToolboxCategory {
  return {
    kind: 'category',
    name: COMM_TOOLBOX_CATEGORY_NAME,
    toolboxitemid: COMM_TOOLBOX_CATEGORY_ID,
    categorystyle: COMM_BLOCK_STYLE.replace(/_blocks$/u, '_category'),
    contents: [
      label('유선 — USB-UART 변환기(보드 TX 17 · RX 16)'),
      block('apc_comm_uart_send', { inputs: { TEXT: textInput('hello') } }),
      block('apc_comm_uart_has_data'),
      block('apc_comm_uart_line'),
      label('무선 가까이 — 블루투스(BLE)'),
      block('apc_comm_ble_send', { inputs: { TEXT: textInput('COUNT,1') } }),
      block('apc_comm_ble_received'),
      label('무선 멀리 — 와이파이와 MQTT(누구나 보고 보낼 수 있어요)'),
      block('apc_comm_wifi_connect'),
      block('apc_comm_mqtt_connect'),
      block('apc_comm_mqtt_publish', { inputs: { VALUE: textInput('1') } }),
      block('apc_comm_mqtt_command'),
    ],
  };
}

/**
 * 도구 상자에 통신 칸을 넣은 새 도구 상자를 돌려준다(원래 것은 고치지 않는다).
 * 자리: "화면" 다음(보드 → 센서 → 빛 → 소리 → 움직임 → 화면 → **통신** → 반복·조건 …) — 부품 칸 뒤, 흐름 칸 앞.
 */
export function withCommCategory(toolbox: ToolboxDefinitionJson): ToolboxDefinitionJson {
  if (toolbox.contents.some((category) => category.toolboxitemid === COMM_TOOLBOX_CATEGORY_ID)) {
    return toolbox;
  }
  const contents = [...toolbox.contents];
  const at = contents.findIndex((category) => category.name === '반복·조건');
  contents.splice(at < 0 ? contents.length : at, 0, commToolboxCategory());
  return { ...toolbox, contents };
}

/** 통신 칸에 들어 있는 블록 type(중복 없음 — 기본 블록 shadow 포함) */
export function commToolboxBlockTypes(): string[] {
  const types = new Set<string>();
  for (const item of commToolboxCategory().contents ?? []) {
    if (item.kind === 'block' && item.type) {
      types.add(item.type);
    }
    for (const input of Object.values(item.inputs ?? {})) {
      const shadow = (input as { shadow?: { type?: string } }).shadow;
      if (shadow?.type) {
        types.add(shadow.type);
      }
    }
  }
  return [...types];
}

/** 공개 브로커 경고를 화면 어디에 적는지 확인하는 글(요청 문서·차시에서 같은 문장을 쓴다, PD-29) */
export const COMM_TOOLBOX_BROKER_NOTE = `공개 브로커(${COMM_MQTT.broker})는 누구나 보고, 누구나 보낼 수도 있어요. 허용한 명령(${COMM_MQTT.allow.join(' · ')})만 받고, 레이저·모터처럼 움직이는 장치는 잇지 않아요.`;
