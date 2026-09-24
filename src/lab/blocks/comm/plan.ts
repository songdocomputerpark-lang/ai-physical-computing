/**
 * 통신 블록(P4-10)이 만드는 준비 줄·import·배선 — 순수 데이터와 "이번 생성의 부품 계획에 한 줄 더하기".
 * Blockly를 import하지 않는다(단위 테스트·빌드 어디서나 읽는다). 블록 정의는 blocks.ts, 블록별 코드는 codegen.ts.
 *
 * 왜 여기서 계획에 더하나
 *   P3-06 블록의 부품 표(src/lab/blocks/catalog.ts PART_KINDS)는 보드에 달린 부품 13종만 알고 통신 부품(USB-UART 변환기)은 모른다.
 *   그 표는 여러 구역이 함께 쓰는 공유 파일이라 고치지 않고(src/lab/README.md 5.2), 대신 생성기가 이번 한 번 쓰는 부품 계획(PartPlan)에
 *   같은 모양(PlannedPart)으로 한 줄을 더한다. 그러면 머리말 `# @part`·준비 줄·가상 보드 배선(GeneratedProgram.wiring)이
 *   **기존 길로 그대로** 흐른다(generator.ts formatProgram·generateProgram을 고치지 않는다).
 *   생성기는 한 번 만들 때 화면 코드(display)와 실행판(exec) 두 판을 같은 계획으로 돌리므로, 집안 이름(key)으로 한 번만 더한다.
 *
 * 파이썬 모듈 이름만 쓰는 import(`import ESP32BLE`·`import network`)는 Blockly가 쓰는 자리(definitions_)에 넣는다 —
 * Blockly 기본 블록도 `definitions_['import_random'] = 'import random'`처럼 하고, formatProgram이 그 모양을 알아서 import 줄로 모은다.
 *
 * 값은 통신 템플릿(examples/esp32/templates/*.py)과 같게 맞춘다. 템플릿을 고치면 여기도 함께 고친다
 * (tests/unit/blocks/comm-templates.test.ts가 두 곳이 같은 API·같은 핀을 쓰는지 본다).
 * 라이선스: 사이트 소프트웨어(MIT, PD-26).
 */
import type { ImportNeed, PartPlan, PlannedPart } from '../catalog.ts';
import type { MicroPythonCodeGenerator } from '../generator.ts';
import type { WiringEntry } from '../../modules/board/part-types.ts';

/** 통신 수단(PLAN §7.3 통로와 같은 이름 — 갤러리 태그 comm과도 같다) */
export type CommFamily = 'uart' | 'ble' | 'wifi' | 'mqtt';

/** 블록이 쓸 때만 코드에 넣는 도우미 함수 */
export type CommFeature = 'uart-line' | 'ble-line' | 'ble-send' | 'mqtt-command';

/** 코드에 보이는 이름(학생 변수가 가리지 않게 생성기 예약어로도 넣는다 — index.ts installCommBlocks) */
export const COMM_NAMES = Object.freeze({
  uart: 'uart',
  uartLine: 'uart_line',
  ble: 'ble',
  bleLine: 'ble_line',
  bleSend: 'ble_send',
  bleWarned: 'ble_warned',
  wifiConnect: 'wifi_connect',
  mqttClient: 'client',
  mqttTopic: 'mqtt_topic',
  mqttMessage: 'mqtt_message',
  mqttConnect: 'mqtt_connect',
  mqttCommand: 'mqtt_command',
  mqttOnMessage: 'on_mqtt',
});

/** UART2 핀(PLAN §6.1 "UART2 핀": 사이트판은 보드 tx=17 · rx=16). 배선은 변환기 쪽 이름이라 서로 엇갈린다 */
export const COMM_UART = Object.freeze({ boardTx: 17, boardRx: 16, baud: 9600, timeoutMs: 200, number: 2 });

/** 가상 보드 부품 id(src/lab/modules/board/parts/<id>/) */
export const COMM_UART_PART = 'uart';

/**
 * 블루투스 부품 id와 상태 LED 핀(P4-03 구역의 `src/lab/modules/board/parts/ble/`, 기본 핀 led=12).
 * 보드 라이브러리 `ESP32BLE.py` 원본이 GPIO12를 연결 상태 LED로 쓴다 — 그래서 배선 한 줄은 `# @part ble 12`다.
 */
export const COMM_BLE_PART = 'ble';
export const COMM_BLE_LED_PIN = 12;

/**
 * MQTT 기본값(PLAN §7.4 — 고정 루트 없이 접두어부터 시작한다).
 *
 * **토픽에 접두어를 적지 않는다.** 학생 코드는 `esp32-01/rx`처럼 짧게 쓰고, 우리 반 무작위 접두어 12글자는
 * 통로(`src/lab/mqtt/topics.ts` `withTopicPrefix`)가 앞에 붙여 한 번 알려 준다. 코드에 또 적으면 접두어가 두 번 붙어
 * 대시보드(`deviceRxTopic(접두어, 장치)`)와 토픽이 어긋난다 — 2026-09-18 가상 보드에서 실제로 확인했다.
 */
export const COMM_MQTT = Object.freeze({
  broker: 'broker.emqx.io',
  port: 1883,
  device: 'esp32-01',
  allow: Object.freeze(['on', 'off', 'blink']),
  maxBytes: 20,
});

/** 와이파이 기본값(교실에서 학생이 바꿔 쓰는 자리 글) */
export const COMM_WIFI = Object.freeze({ name: 'my-wifi', password: 'my-password' });

/** 블루투스 광고 이름 기본값(PLAN §7.3 교실 이름 규칙 — 이름·학번 같은 개인정보는 넣지 않는다) */
export const COMM_BLE_NAME = 'ESP32-01';

/** 준비 줄을 내는 차례(블록을 놓은 순서와 상관없이 늘 같은 코드가 되게) */
export const COMM_ORDER: readonly CommFamily[] = Object.freeze(['uart', 'ble', 'wifi', 'mqtt']);

/** 내가 더한 부품인지 알아보는 열쇠 머리말 */
export const COMM_KEY_PREFIX = 'comm:';

/** 파이썬 글자 상수(작은따옴표 — Blockly python 생성기와 같은 모양) */
function quote(text: string): string {
  return `'${text.replace(/\\/gu, '\\\\').replace(/'/gu, "\\'")}'`;
}

/** 통신 수단 하나가 만드는 것 */
interface CommRecipe {
  /** from … import … */
  readonly imports: readonly ImportNeed[];
  /** import … (모듈 이름만) */
  readonly plainImports: readonly string[];
  /** 준비 줄(들여쓰기 없음, ''는 빈 줄) */
  setup(features: ReadonlySet<CommFeature>): string[];
  /** 가상 보드 배선(없으면 null) */
  readonly wiring: WiringEntry | null;
  /** 머리말 `# @part` 뒤의 글(없으면 null) */
  readonly directive: string | null;
  /** 사람이 읽는 이름 */
  readonly label: string;
}

const UART_SETUP = `${COMM_NAMES.uart} = UART(${COMM_UART.number}, baudrate=${COMM_UART.baud}, tx=${COMM_UART.boardTx}, rx=${COMM_UART.boardRx}, timeout=${COMM_UART.timeoutMs})`;

const RECIPES: Readonly<Record<CommFamily, CommRecipe>> = Object.freeze({
  uart: {
    imports: [{ from: 'machine', name: 'UART' }],
    plainImports: [],
    label: 'USB-UART 변환기',
    wiring: { part: COMM_UART_PART, pins: { rx: COMM_UART.boardTx, tx: COMM_UART.boardRx }, label: 'USB-UART 변환기' },
    directive: `${COMM_UART_PART} rx=${COMM_UART.boardTx} tx=${COMM_UART.boardRx}`,
    setup(features) {
      const lines = [UART_SETUP];
      if (features.has('uart-line')) {
        lines.push(
          '',
          `def ${COMM_NAMES.uartLine}():`,
          `    data = ${COMM_NAMES.uart}.readline()`,
          '    if data:',
          "        return data.decode().strip()",
          "    return ''",
        );
      }
      return lines;
    },
  },
  ble: {
    imports: [],
    plainImports: ['ESP32BLE'],
    label: '블루투스(BLE)',
    wiring: { part: COMM_BLE_PART, pin: COMM_BLE_LED_PIN, label: '블루투스(BLE)' },
    directive: `${COMM_BLE_PART} ${COMM_BLE_LED_PIN}`,
    setup(features) {
      const lines = [`${COMM_NAMES.ble} = ESP32BLE.init(${quote(COMM_BLE_NAME)})`];
      if (features.has('ble-send')) {
        lines.push(
          // 연결된 기기가 없으면 gatts_notify가 OSError(ENOTCONN)를 낸다(가상 보드도 실물도). 그대로 두면 [실행]하자마자
          // 영어 트레이스백으로 멈추므로 한국어 한 줄로 알리고 계속 돈다. 1초마다 되풀이되지 않게 **한 번만** 알린다.
          `${COMM_NAMES.bleWarned} = False`,
          '',
          `def ${COMM_NAMES.bleSend}(text):`,
          `    global ${COMM_NAMES.bleWarned}`,
          '    try:',
          `        ${COMM_NAMES.ble}.send(text)`,
          `        ${COMM_NAMES.bleWarned} = False`,
          '    except OSError:',
          `        if not ${COMM_NAMES.bleWarned}:`,
          "            print('아직 연결된 기기가 없어요. 컴퓨터·스마트폰에서 [연결]을 누르면 보내져요.')",
          `            ${COMM_NAMES.bleWarned} = True`,
        );
      }
      if (features.has('ble-line')) {
        lines.push(
          '',
          `def ${COMM_NAMES.bleLine}():`,
          `    data = ${COMM_NAMES.ble}.read()`,
          '    if data:',
          '        return data',
          "    return ''",
        );
      }
      return lines;
    },
  },
  wifi: {
    imports: [{ from: 'time', name: 'sleep' }],
    plainImports: ['network'],
    label: '와이파이',
    wiring: null,
    directive: null,
    setup() {
      return [
        `def ${COMM_NAMES.wifiConnect}(name, password):`,
        '    wlan = network.WLAN(network.STA_IF)',
        '    wlan.active(True)',
        '    if not wlan.isconnected():',
        '        wlan.connect(name, password)',
        '        for _ in range(20):',
        '            if wlan.isconnected():',
        '                break',
        '            sleep(0.5)',
        "    print('와이파이 연결:', wlan.isconnected())",
      ];
    },
  },
  mqtt: {
    imports: [{ from: 'umqtt.simple', name: 'MQTTClient' }],
    plainImports: [],
    label: 'MQTT',
    wiring: null,
    directive: null,
    setup(features) {
      // 파이썬 튜플: 한 개짜리만 끝에 쉼표가 필요하다
      const allow = COMM_MQTT.allow.map((command) => quote(command)).join(', ') + (COMM_MQTT.allow.length === 1 ? ',' : '');
      const lines = [
        `MQTT_BROKER = ${quote(COMM_MQTT.broker)}`,
        // 우리 반 통신 접두어(PD-29, 2026-09-25 Phase 4 검토 반영) — 비어 있으면 가상 보드는 통로가 붙여 주고, 실제 보드로는 보내지 않는다.
        // 실제 보드는 [코드로 바꾸기] 뒤 MQTT 칸의 [코드에 접두어 적기]로 채운다(src/lab/mqtt/real-board-guard.ts).
        '# 실제 보드: [코드로 바꾸기] 뒤 MQTT 칸의 [코드에 접두어 적기]로 채워요(가상 보드는 비워 둬도 돼요)',
        "MQTT_PREFIX = ''",
        `MQTT_ALLOW = (${allow})`,
        `MQTT_MAX_BYTES = ${COMM_MQTT.maxBytes}`,
        `${COMM_NAMES.mqttClient} = None`,
        `${COMM_NAMES.mqttTopic} = ''`,
        `${COMM_NAMES.mqttMessage} = ''`,
        '',
        // 공개 브로커는 누구나 보낼 수 있다(PD-29) — 길이와 허용 목록을 먼저 본다.
        `def ${COMM_NAMES.mqttOnMessage}(topic, payload):`,
        `    global ${COMM_NAMES.mqttMessage}`,
        '    if len(payload) > MQTT_MAX_BYTES:',
        "        print('무시했어요(너무 긴 메시지):', payload)",
        '        return',
        '    try:',
        '        text = payload.decode().strip()',
        '    except Exception:',
        "        print('무시했어요(글자로 바꿀 수 없어요):', payload)",
        '        return',
        '    if text not in MQTT_ALLOW:',
        "        print('무시했어요(허용 목록에 없어요):', text)",
        '        return',
        `    ${COMM_NAMES.mqttMessage} = text`,
        '',
        // 토픽은 접두어가 비었으면 짧게(`esp32-01/rx` — 가상 통로가 접두어를 앞에 붙인다), 채웠으면 `<접두어>/esp32-01/rx`(실제 보드)
        `def ${COMM_NAMES.mqttConnect}(device):`,
        `    global ${COMM_NAMES.mqttClient}, ${COMM_NAMES.mqttTopic}`,
        `    ${COMM_NAMES.mqttTopic} = MQTT_PREFIX + '/' + device if MQTT_PREFIX else device`,
        `    ${COMM_NAMES.mqttClient} = MQTTClient(device, MQTT_BROKER, port=${COMM_MQTT.port})`,
        `    ${COMM_NAMES.mqttClient}.set_callback(${COMM_NAMES.mqttOnMessage})`,
        `    ${COMM_NAMES.mqttClient}.connect()`,
        `    ${COMM_NAMES.mqttClient}.subscribe(${COMM_NAMES.mqttTopic} + '/rx')`,
        `    print('MQTT 연결됨:', ${COMM_NAMES.mqttTopic} + '/tx')`,
      ];
      if (features.has('mqtt-command')) {
        lines.push(
          '',
          `def ${COMM_NAMES.mqttCommand}():`,
          `    global ${COMM_NAMES.mqttMessage}`,
          `    ${COMM_NAMES.mqttClient}.check_msg()`,
          `    text = ${COMM_NAMES.mqttMessage}`,
          `    ${COMM_NAMES.mqttMessage} = ''`,
          '    return text',
        );
      }
      return lines;
    },
  },
});

/** 통신 블록이 쓰는 이름 — 학생 변수가 가리지 않게 생성기 예약어로 넣는다 */
export const COMM_RESERVED_WORDS: readonly string[] = Object.freeze([
  ...Object.values(COMM_NAMES),
  'ESP32BLE',
  'MQTTClient',
  'network',
  'wlan',
  'MQTT_BROKER',
  'MQTT_PREFIX',
  'MQTT_ALLOW',
  'MQTT_MAX_BYTES',
]);

interface CommState {
  readonly features: Map<CommFamily, Set<CommFeature>>;
}

/** 이번 생성(부품 계획 한 개)마다 무엇을 더했는지 */
const states = new WeakMap<PartPlan, CommState>();

/** 생성기가 이번에 쓰는 부품 계획(런타임 값) */
function planOf(generator: MicroPythonCodeGenerator): PartPlan {
  const plan = (generator as unknown as { plan?: PartPlan }).plan;
  if (!plan || !Array.isArray(plan.parts)) {
    throw new Error('통신 블록: 생성기에서 이번 부품 계획(plan)을 찾지 못했어요.');
  }
  return plan;
}

function definitionsOf(generator: MicroPythonCodeGenerator): Record<string, string> {
  const bag = (generator as unknown as { definitions_?: Record<string, string> }).definitions_;
  if (!bag || typeof bag !== 'object') {
    throw new Error('통신 블록: 생성기에서 import를 적을 자리(definitions_)를 찾지 못했어요.');
  }
  return bag;
}

function partOf(family: CommFamily, features: ReadonlySet<CommFeature>, leadingBlank: boolean): PlannedPart {
  const recipe = RECIPES[family];
  const lines = recipe.setup(features);
  return {
    key: `${COMM_KEY_PREFIX}${family}`,
    // 부품 표(PART_KINDS)에 없는 통신 부품이라 kind 자리에는 통신 수단 이름을 넣는다(formatProgram·generateProgram은 kind를 보지 않는다).
    kind: family as unknown as PlannedPart['kind'],
    pins: recipe.wiring?.pins ?? (recipe.wiring?.pin === undefined ? {} : { sig: recipe.wiring.pin }),
    flavor: 'digital',
    name: family,
    label: recipe.label,
    // 준비 줄이 def로 시작하면 앞 줄과 붙지 않게 빈 줄을 하나 둔다(맨 처음이면 두지 않는다)
    setup: leadingBlank ? ['', ...lines] : lines,
    imports: recipe.imports,
    wiring: recipe.wiring,
    directive: recipe.directive,
    blockIds: [],
  };
}

/**
 * 이 통신 수단을 이번 코드에 쓴다고 알린다(블록 코드 함수가 맨 먼저 부른다).
 * 준비 줄·import·배선을 부품 계획에 넣고, 코드에서 부를 이름을 돌려준다. 같은 수단을 여러 블록이 불러도 한 번만 들어간다.
 */
export function useComm(generator: MicroPythonCodeGenerator, family: CommFamily, feature?: CommFeature): typeof COMM_NAMES {
  const plan = planOf(generator);
  let state = states.get(plan);
  if (!state) {
    state = { features: new Map() };
    states.set(plan, state);
  }
  let features = state.features.get(family);
  if (!features) {
    features = new Set();
    state.features.set(family, features);
  }
  if (feature) {
    features.add(feature);
  }
  for (const moduleName of RECIPES[family].plainImports) {
    definitionsOf(generator)[`import_${moduleName}`] = `import ${moduleName}`;
  }
  const parts = plan.parts as PlannedPart[];
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (parts[index]!.key.startsWith(COMM_KEY_PREFIX)) {
      parts.splice(index, 1);
    }
  }
  // 앞에 아무 준비 줄도 없을 때만 빈 줄 없이 시작한다(I2C 버스·보드 부품이 있으면 빈 줄로 띄운다)
  let anythingBefore = plan.sharedSetup.length > 0 || parts.some((part) => part.setup.length > 0);
  for (const item of COMM_ORDER) {
    const chosen = state.features.get(item);
    if (chosen) {
      parts.push(partOf(item, chosen, anythingBefore));
      anythingBefore = true;
    }
  }
  return COMM_NAMES;
}

/** 이번 계획에 들어간 통신 부품(테스트·확인용) */
export function commPartsOf(plan: PartPlan): readonly PlannedPart[] {
  return plan.parts.filter((part) => part.key.startsWith(COMM_KEY_PREFIX));
}
