/**
 * 통신 블록 하나하나가 만드는 MicroPython 코드(P4-10). 블록 모양은 blocks.ts, 준비 줄·import·배선은 plan.ts.
 *
 * 규칙(src/lab/blocks/codegen.ts와 같다)
 * - 블록 하나가 만드는 줄 수는 화면 코드와 실행판(블록 전용 호환 모드)에서 같아야 한다 — 여기서는 mode를 보지 않으므로 저절로 같다.
 * - 글자를 받는 곳은 textArgument(따옴표 글자면 그대로, 아니면 str(…)), 필드 값은 generator.quote_로 감싼다.
 * - 만드는 코드는 통신 템플릿(examples/esp32/templates/*.py)과 같은 API·같은 핀을 쓴다.
 * 라이선스: 사이트 소프트웨어(MIT, PD-26).
 */
import type { Block } from '../blockly-types.ts';
import type { BlockCode, OrderValues } from '../codegen.ts';
import { textArgument, type MicroPythonCodeGenerator } from '../generator.ts';
import { useComm } from './plan.ts';

/** 필드 글자를 파이썬 글자 상수로(따옴표·역슬래시는 생성기가 처리한다) */
function fieldText(block: Block, generator: MicroPythonCodeGenerator, name: string, fallback: string): string {
  const raw = block.getFieldValue(name);
  const text = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : fallback;
  return generator.quote_(text);
}

/** 통신 블록의 코드 함수(customBlockCode와 같은 모양 — 생성기 표에 그대로 합친다) */
export function commBlockCode(Order: OrderValues): Record<string, BlockCode> {
  const value = (block: Block, generator: MicroPythonCodeGenerator, name: string, fallback: string): string =>
    generator.valueToCode(block, name, Order.NONE) || fallback;

  return {
    apc_comm_uart_send(block, generator) {
      const names = useComm(generator, 'uart');
      return `${names.uart}.write(${textArgument(value(block, generator, 'TEXT', "''"))} + '\\n')\n`;
    },
    apc_comm_uart_has_data(_block, generator) {
      const names = useComm(generator, 'uart');
      return [`${names.uart}.any() > 0`, Order.RELATIONAL];
    },
    apc_comm_uart_line(_block, generator) {
      const names = useComm(generator, 'uart', 'uart-line');
      return [`${names.uartLine}()`, Order.FUNCTION_CALL];
    },
    apc_comm_ble_send(block, generator) {
      const names = useComm(generator, 'ble', 'ble-send');
      return `${names.bleSend}(${textArgument(value(block, generator, 'TEXT', "''"))})\n`;
    },
    apc_comm_ble_received(_block, generator) {
      const names = useComm(generator, 'ble', 'ble-line');
      return [`${names.bleLine}()`, Order.FUNCTION_CALL];
    },
    apc_comm_wifi_connect(block, generator) {
      const names = useComm(generator, 'wifi');
      const name = fieldText(block, generator, 'NAME', 'my-wifi');
      const password = fieldText(block, generator, 'PASSWORD', 'my-password');
      return `${names.wifiConnect}(${name}, ${password})\n`;
    },
    apc_comm_mqtt_connect(block, generator) {
      const names = useComm(generator, 'mqtt');
      const device = fieldText(block, generator, 'DEVICE', 'esp32-01');
      return `${names.mqttConnect}(${device})\n`;
    },
    apc_comm_mqtt_publish(block, generator) {
      const names = useComm(generator, 'mqtt');
      return `${names.mqttClient}.publish(${names.mqttTopic} + '/tx', ${textArgument(value(block, generator, 'VALUE', "''"))})\n`;
    },
    apc_comm_mqtt_command(_block, generator) {
      const names = useComm(generator, 'mqtt', 'mqtt-command');
      return [`${names.mqttCommand}()`, Order.FUNCTION_CALL];
    },
  };
}
