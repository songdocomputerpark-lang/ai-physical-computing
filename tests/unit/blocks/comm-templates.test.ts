// 통신 템플릿 세 개(examples/esp32/templates/*.py, P4-10)와 통신 블록이 만든 코드가 같은 규칙을 지키는지.
//
// 가장 중요한 것: **허용 목록 밖 MQTT 메시지는 무시된다**(PLAN §7.4 PD-29). 글로만 적어 두면 지켜지지 않으므로,
// 템플릿 파일과 블록이 만든 코드에서 **실제 파이썬 함수를 꺼내 돌려** 확인한다(이 컴퓨터에 파이썬 3이 있을 때. CI 우분투에는 있다).
// 꺼내는 방법: 파일을 ast로 읽어 맨 바깥의 함수 정의와 "값이 상수인" 대입만 남겨 실행한다(import·연결·while True는 빼고).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BlocklyApi, BlocklyBlocksApi, BlocklyPythonApi } from '../../../src/lab/blocks/blockly-types.ts';
import { COMM_BLE_NAME, COMM_MQTT, COMM_UART, findCommPreset, installCommBlocks } from '../../../src/lab/blocks/comm/index.ts';
import { createBlocksKit } from '../../../src/lab/blocks/kit.ts';
import { readExampleMeta } from '../../../src/lab/controls/example-meta.ts';
import { parseExampleSidecar } from '../../../src/lab/controls/example-sidecar.ts';
import { esp32ExampleIdFromFile } from '../../../src/lab/esp32/examples.ts';
import { normalizeWiringSpecs } from '../../../src/lab/modules/board/wiring-spec.ts';

const REPO = process.cwd();
const TEMPLATE_DIR = path.join(REPO, 'examples', 'esp32', 'templates');
const TEMPLATES = { uart: 'uart-echo.py', ble: 'ble-notify.py', mqtt: 'mqtt-pub-sub.py' } as const;

function templateSource(file: string): string {
  return fs.readFileSync(path.join(TEMPLATE_DIR, file), 'utf8');
}

/** 주석을 뺀 코드 줄만(설명 글에 나오는 낱말이 검사에 걸리지 않게) */
function codeLines(source: string): string {
  return source
    .split(/\r?\n/u)
    .map((line) => line.replace(/\s*#.*$/u, ''))
    .filter((line) => line.trim() !== '')
    .join('\n');
}

function sidecarOf(file: string): ReturnType<typeof parseExampleSidecar> {
  return parseExampleSidecar(fs.readFileSync(path.join(TEMPLATE_DIR, file.replace(/\.py$/u, '.meta.yaml')), 'utf8'));
}

const require = createRequire(import.meta.url);

/** 통신 블록을 붙인 블록 모드 한 벌로 예시 작업판의 코드를 만든다 */
function generatedCode(presetId: string): string {
  const Blockly = require('blockly/core') as BlocklyApi;
  const libraryBlocks = require('blockly/blocks') as BlocklyBlocksApi;
  const python = require('blockly/python') as BlocklyPythonApi;
  Blockly.setLocale(require('blockly/msg/ko') as Record<string, string>);
  const kit = createBlocksKit({ Blockly, libraryBlocks, python });
  installCommBlocks({ Blockly, python, forBlock: kit.generator.forBlock as unknown as Record<string, unknown>, generator: kit.generator });
  const workspace = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(findCommPreset(presetId)!.state as unknown as Record<string, unknown>, workspace);
  return kit.generate(workspace).code;
}

interface GuardRequest {
  readonly code: string;
  /** 메시지가 왔을 때 불리는 함수 이름 */
  readonly handler: string;
  /** 받은 명령이 들어가는 전역 변수 이름 */
  readonly state: string;
  /** 보낼 메시지(16진수) */
  readonly cases: readonly string[];
}

interface GuardResult {
  readonly syntax: string;
  readonly states: readonly string[];
  readonly printed: readonly string[];
}

// 주고받는 글에 한글이 있으므로 표준 입출력을 UTF-8로 못박는다(윈도우 파이썬의 기본 인코딩은 cp949라 글자가 깨진다).
const PYTHON_GUARD = [
  'import ast, contextlib, io, json, sys',
  'data = json.loads(sys.stdin.buffer.read().decode("utf-8"))',
  'out = {}',
  'for name, item in data.items():',
  '    try:',
  '        tree = ast.parse(item["code"])',
  '    except SyntaxError as error:',
  '        out[name] = {"syntax": f"{error.msg} (line {error.lineno})", "states": [], "printed": []}',
  '        continue',
  '    kept = []',
  '    for node in tree.body:',
  '        if isinstance(node, ast.FunctionDef):',
  '            kept.append(node)',
  '        elif isinstance(node, ast.Assign) and isinstance(node.value, (ast.Constant, ast.Tuple, ast.List)):',
  '            kept.append(node)',
  '    namespace = {}',
  '    exec(compile(ast.Module(body=kept, type_ignores=[]), name, "exec"), namespace)',
  '    handler = namespace[item["handler"]]',
  '    states = []',
  '    printed = []',
  '    for payload in item["cases"]:',
  '        namespace[item["state"]] = ""',
  '        buffer = io.StringIO()',
  '        with contextlib.redirect_stdout(buffer):',
  '            handler("topic", bytes.fromhex(payload))',
  '        states.append(namespace[item["state"]])',
  '        printed.append(buffer.getvalue().strip())',
  '    out[name] = {"syntax": "ok", "states": states, "printed": printed}',
  'sys.stdout.buffer.write(json.dumps(out, ensure_ascii=False).encode("utf-8"))',
].join('\n');

/** 파이썬 3으로 거르기 함수를 돌린다. 파이썬이 없으면 null */
function runGuards(requests: Record<string, GuardRequest>): Record<string, GuardResult> | null {
  for (const [command, args] of [
    ['python', ['-c', PYTHON_GUARD]],
    ['python3', ['-c', PYTHON_GUARD]],
    ['py', ['-3', '-c', PYTHON_GUARD]],
  ] as const) {
    const result = spawnSync(command, [...args], { input: JSON.stringify(requests), encoding: 'utf8', timeout: 30_000 });
    if (result.status === 0 && result.stdout.trim().startsWith('{')) {
      return JSON.parse(result.stdout.trim()) as Record<string, GuardResult>;
    }
  }
  return null;
}

/** 보내 볼 메시지(16진수)와 기대하는 결과 */
const CASES: readonly { readonly what: string; readonly hex: string; readonly becomes: string }[] = [
  { what: '허용 명령 on', hex: '6f6e', becomes: 'on' },
  { what: '허용 명령 off', hex: '6f6666', becomes: 'off' },
  { what: '앞뒤 공백·줄바꿈이 붙은 on', hex: '206f6e0a', becomes: 'on' },
  { what: '허용 목록에 없는 laser-on', hex: '6c617365722d6f6e', becomes: '' },
  { what: '대소문자가 다른 ON', hex: '4f4e', becomes: '' },
  { what: '21바이트(20바이트를 넘음)', hex: '78'.repeat(21), becomes: '' },
  { what: '글자로 바꿀 수 없는 바이트', hex: 'fffe', becomes: '' },
  { what: '빈 메시지', hex: '', becomes: '' },
];

describe('통신 템플릿 파일', () => {
  it('세 개가 모두 있고 줄 끝은 LF, 머리말에 제목·설명·태그가 있다', () => {
    for (const file of Object.values(TEMPLATES)) {
      const source = templateSource(file);
      expect(source.includes('\r'), file).toBe(false);
      const meta = readExampleMeta(source);
      expect(meta.title, file).toMatch(/^통신 템플릿 \d:/u);
      expect(meta.description, file).toMatch(/[가-힣]/u);
      expect(meta.tags, file).toContain('템플릿');
      expect(meta.practice.length, file).toBeGreaterThanOrEqual(3);
      expect(meta.tryIdeas.length, file).toBe(3);
      expect(meta.why.length, file).toBeGreaterThanOrEqual(2);
    }
  });

  it('실습실 예제 id는 templates-…이고 갤러리 태그(사이드카)는 통신 방식까지 적혀 있다', () => {
    expect(esp32ExampleIdFromFile('esp32/templates/uart-echo.py')).toBe('templates-uart-echo');
    expect(sidecarOf(TEMPLATES.uart)).toMatchObject({ unit: 3, comm: ['uart'], virtualOk: true });
    expect(sidecarOf(TEMPLATES.ble)).toMatchObject({ unit: 3, comm: ['ble'] });
    expect(sidecarOf(TEMPLATES.mqtt)).toMatchObject({ unit: 3, comm: ['wifi', 'mqtt'] });
    // 가상 보드에서 아직 확인하지 못한 것은 적지 않는다("모르면 적지 않는다" — 갤러리 태그 규약)
    expect(sidecarOf(TEMPLATES.ble).virtualOk).toBeNull();
    expect(sidecarOf(TEMPLATES.mqtt).virtualOk).toBeNull();
  });

  it('UART 에코는 통신 블록과 같은 UART 설정·배선을 쓴다', () => {
    const source = templateSource(TEMPLATES.uart);
    expect(source).toContain(`uart = UART(${COMM_UART.number}, baudrate=${COMM_UART.baud}, tx=${COMM_UART.boardTx}, rx=${COMM_UART.boardRx}, timeout=${COMM_UART.timeoutMs})`);
    expect(source).toContain('uart.readline()');
    expect(source).toContain('uart.write(text + "\\n")');
    // 머리말 `# @part` → 실습실이 쓰는 배선 한 줄(가상 보드가 USB-UART 변환기를 그린다)
    expect(normalizeWiringSpecs(readExampleMeta(source).parts, '템플릿').entries).toEqual([
      { part: 'uart', pins: { rx: COMM_UART.boardTx, tx: COMM_UART.boardRx } },
    ]);
  });

  it('블루투스 알림은 ESP32BLE 원본 라이브러리를 그대로 쓰고 이름에 개인정보가 없다', () => {
    const source = templateSource(TEMPLATES.ble);
    expect(source).toContain('import ESP32BLE');
    expect(source).toContain(`BLE_NAME = "${COMM_BLE_NAME}"`);
    expect(source).toContain(`ble = ESP32BLE.init(BLE_NAME)`);
    expect(source).toContain('ble.send(');
    expect(source).toContain('ble.read()');
    // 기기 주소(MAC)를 적지 않는다(PLAN §10)
    expect(source).not.toMatch(/([0-9a-f]{2}:){5}[0-9a-f]{2}/iu);
  });

  it('블루투스 템플릿과 블록 코드는 "연결 전에는 한 번만 알린다"를 같은 방식으로 한다(템플릿 = 블록)', () => {
    // 연결된 기기가 없으면 ESP32BLE.send() 안의 gatts_notify가 OSError(ENOTCONN)를 낸다.
    // 그대로 두면 [실행]하자마자 영어 트레이스백으로 멈추고, 매번 알리면 1초마다 같은 줄이 쌓인다.
    const notice = '아직 연결된 기기가 없어요. 컴퓨터·스마트폰에서 [연결]을 누르면 보내져요.';
    const template = codeLines(templateSource(TEMPLATES.ble));
    const generated = generatedCode('comm-ble-notify');
    for (const [name, code] of [
      ['템플릿', template],
      ['블록이 만든 코드', generated],
    ] as const) {
      expect(code, name).toContain('except OSError:');
      expect(code, name).toContain(notice);
      // 한 번만 — 기억해 두는 깃발이 있고, 보내기에 성공하면 다시 알릴 수 있게 되돌린다
      expect(code, name).toMatch(/^\s*(?:global )?(?:warned|ble_warned)\b/mu);
      expect(code, name).toMatch(/(?:warned|ble_warned) = False/u);
      expect(code, name).toMatch(/(?:warned|ble_warned) = True/u);
    }
  });

  it('MQTT 템플릿은 고정 루트 없이 짧은 토픽을 쓰고, 받은 명령으로는 표시 장치(LED)만 켠다(PD-29)', () => {
    const source = templateSource(TEMPLATES.mqtt);
    expect(source).toContain(`BROKER = "${COMM_MQTT.broker}"`);
    expect(source).toContain(`port=${COMM_MQTT.port}`);
    expect(source).toContain(`ALLOW = ("${COMM_MQTT.allow.join('", "')}")`);
    expect(source).toContain(`MAX_BYTES = ${COMM_MQTT.maxBytes}`);
    // 토픽은 `esp32-01/rx`처럼 짧게 — 우리 반 접두어는 통로(src/lab/mqtt/topics.ts)가 붙인다.
    // 코드에 또 적으면 접두어가 두 번 붙어 대시보드(deviceRxTopic)와 어긋난다(2026-09-18 가상 보드에서 확인).
    expect(source).toContain('TOPIC_RX = DEVICE + "/rx"');
    expect(source).toContain('TOPIC_TX = DEVICE + "/tx"');
    expect(source).toContain('client.subscribe(TOPIC_RX)');
    expect(source).toContain('client.publish(TOPIC_TX');
    expect(codeLines(source)).not.toMatch(/PREFIX|xxxxxxxxxxxx/u);
    // 사이트 이름 같은 고정 루트를 앞에 붙이지 않는다
    expect(source).not.toMatch(/"apc\/|'apc\//u);
    // 움직이거나 위험한 장치는 공개 브로커 통로에 잇지 않는다(주석 설명은 빼고 코드 줄만 본다)
    expect(codeLines(source)).not.toMatch(/laser|servo|PWM|fan|motor/u);
    // 실제 와이파이 이름·비밀번호를 적어 두지 않는다(자리 글만)
    expect(source).toContain('WIFI_NAME = "my-wifi"');
    expect(source).toContain('WIFI_PASSWORD = "my-password"');
  });
});

describe('허용 목록 밖 메시지는 무시된다(PD-29) — 실제 파이썬으로 확인', () => {
  const requests: Record<string, GuardRequest> = {
    'templates/mqtt-pub-sub.py': { code: templateSource(TEMPLATES.mqtt), handler: 'on_message', state: 'command', cases: CASES.map((item) => item.hex) },
    '블록이 만든 코드': { code: generatedCode('comm-mqtt-pub-sub'), handler: 'on_mqtt', state: 'mqtt_message', cases: CASES.map((item) => item.hex) },
  };
  const results = runGuards(requests);

  it.skipIf(results === null)('템플릿과 블록 코드 모두 허용 목록·길이·글자 검사를 지난 명령만 받아들인다', () => {
    expect(results).not.toBeNull();
    for (const [name, result] of Object.entries(results!)) {
      expect(result.syntax, name).toBe('ok');
      expect(
        CASES.map((item, index) => `${item.what} → ${JSON.stringify(result.states[index])}`),
        name,
      ).toEqual(CASES.map((item) => `${item.what} → ${JSON.stringify(item.becomes)}`));
    }
  });

  it.skipIf(results === null)('무시할 때는 콘솔에 한국어로 까닭을 알린다(학생이 왜 안 되는지 알 수 있게)', () => {
    for (const [name, result] of Object.entries(results!)) {
      const ignored = CASES.map((item, index) => (item.becomes === '' ? result.printed[index] ?? '' : ''));
      for (const [index, text] of ignored.entries()) {
        if (CASES[index]!.becomes === '') {
          expect(text, `${name} / ${CASES[index]!.what}`).toMatch(/무시했어요/u);
        }
      }
    }
  });

  it('파이썬 3이 없으면 이 검사는 건너뛴다(CI 우분투에는 있다)', () => {
    expect(results === null || Object.keys(results).length === 2).toBe(true);
  });
});
