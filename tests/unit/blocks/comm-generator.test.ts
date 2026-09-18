// 통신 블록(P4-10) → MicroPython 코드. Node의 Blockly 13.3.0(jsdom판)으로 화면 없는 작업판을 만들어 코드를 확인한다.
// 확인하는 것: 예시 세 개(통신 템플릿과 같은 동작)가 만드는 코드 글자, 화면 코드와 실행판의 줄 수, 파이썬 문법, 배선·머리말,
// 블록 글·툴팁·색, 도구 상자 칸.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import type { BlocklyApi, BlocklyBlocksApi, BlocklyPythonApi } from '../../../src/lab/blocks/blockly-types.ts';
import { COMM_BLOCK_DEFINITIONS, COMM_BLOCK_TYPES, COMM_BLOCK_COLOUR, COMM_BLOCK_STYLE } from '../../../src/lab/blocks/comm/blocks.ts';
import { COMM_BLOCK_PRESETS, commToolboxBlockTypes, commToolboxCategory, findCommPreset, installCommBlocks, withCommCategory } from '../../../src/lab/blocks/comm/index.ts';
import { sameLineCount, type GeneratedProgram } from '../../../src/lab/blocks/generator.ts';
import { createBlocksKit, type BlocksKit } from '../../../src/lab/blocks/kit.ts';
import type { SerializedWorkspace } from '../../../src/lab/blocks/presets.ts';
import { BLOCK_COLOURS, BLOCK_TEXT_COLOUR, contrastRatio } from '../../../src/lab/blocks/theme.ts';
import { buildToolbox } from '../../../src/lab/blocks/toolbox.ts';

const require = createRequire(import.meta.url);
let cached: BlocksKit | null = null;

/**
 * 통신 블록을 붙인 블록 모드 한 벌(Node의 CommonJS Blockly). 통합 뒤에는 kit.ts가 installCommBlocks를 부르므로(요청)
 * 여기서 부르는 것과 같은 상태가 된다 — 두 번 불러도 한 번만 들어간다.
 */
function commKit(): BlocksKit {
  if (cached) {
    return cached;
  }
  const Blockly = require('blockly/core') as BlocklyApi;
  const libraryBlocks = require('blockly/blocks') as BlocklyBlocksApi;
  const python = require('blockly/python') as BlocklyPythonApi;
  Blockly.setLocale(require('blockly/msg/ko') as Record<string, string>);
  const kit = createBlocksKit({ Blockly, libraryBlocks, python });
  installCommBlocks({ Blockly, python, forBlock: kit.generator.forBlock as unknown as Record<string, unknown>, generator: kit.generator });
  cached = kit;
  return kit;
}

/** 작업판 모양 → 코드 */
function generateComm(state: SerializedWorkspace): GeneratedProgram {
  const kit = commKit();
  const workspace = new kit.Blockly.Workspace();
  kit.Blockly.serialization.workspaces.load(state as unknown as Record<string, unknown>, workspace);
  return kit.generate(workspace);
}

/** 파이썬 3(python·python3·py -3)으로 문법 검사. 없으면 null(src/lab/blocks의 generator.test.ts와 같은 방법) */
function pythonSyntaxCheck(sources: Record<string, { code: string; exec: boolean }>): Record<string, string> | null {
  // 코드에 한글 변수 이름이 있으므로 표준 입출력을 UTF-8로 못박는다(윈도우 파이썬의 기본 인코딩은 cp949)
  const script = [
    'import ast, json, sys',
    'data = json.loads(sys.stdin.buffer.read().decode("utf-8"))',
    'out = {}',
    'for name, item in data.items():',
    '    try:',
    '        flags = ast.PyCF_ALLOW_TOP_LEVEL_AWAIT if item["exec"] else 0',
    '        compile(item["code"], name, "exec", flags=flags, dont_inherit=True)',
    '        out[name] = "ok"',
    '    except SyntaxError as error:',
    '        out[name] = f"{error.msg} (line {error.lineno})"',
    'sys.stdout.buffer.write(json.dumps(out).encode("utf-8"))',
  ].join('\n');
  for (const [command, args] of [
    ['python', ['-c', script]],
    ['python3', ['-c', script]],
    ['py', ['-3', '-c', script]],
  ] as const) {
    const result = spawnSync(command, [...args], { input: JSON.stringify(sources), encoding: 'utf8', timeout: 30_000 });
    if (result.status === 0 && result.stdout.trim().startsWith('{')) {
      return JSON.parse(result.stdout.trim()) as Record<string, string>;
    }
  }
  return null;
}

function lines(code: string): string[] {
  return code.replace(/\n$/u, '').split('\n');
}

describe('통신 블록 예시 → 코드', () => {
  it('UART 에코 예시는 템플릿과 같은 UART 설정·읽기·되돌려보내기 코드를 만든다', () => {
    const program = generateComm(findCommPreset('comm-uart-echo')!.state);
    expect(lines(program.code)).toEqual([
      '# 블록으로 만든 코드',
      '# @part uart rx=17 tx=16',
      'from machine import UART',
      'from time import sleep',
      '',
      'uart = UART(2, baudrate=9600, tx=17, rx=16, timeout=200)',
      '',
      'def uart_line():',
      '    data = uart.readline()',
      '    if data:',
      "        return data.decode().strip()",
      "    return ''",
      '',
      '받은줄 = 0',
      '',
      'while True:',
      '    받은줄 = uart_line()',
      "    if 받은줄 != '':",
      '        print(받은줄)',
      "        uart.write(str(받은줄) + '\\n')",
      '    sleep(0.05)',
    ]);
    expect(program.wiring).toEqual([{ part: 'uart', pins: { rx: 17, tx: 16 }, label: 'USB-UART 변환기' }]);
  });

  it('블루투스 예시는 ESP32BLE를 그대로 쓰고(끝의 줄바꿈은 라이브러리가 붙임) 연결 전 안내를 한 번만 한다', () => {
    const program = generateComm(findCommPreset('comm-ble-notify')!.state);
    expect(lines(program.code)).toEqual([
      '# 블록으로 만든 코드',
      // 상태 LED 핀(GPIO12)은 보드 라이브러리 ESP32BLE.py가 쓰는 핀이라 배선 한 줄로 그려진다(템플릿 ble-notify.py와 같다)
      '# @part ble 12',
      'from machine import Pin',
      'from time import sleep',
      'import ESP32BLE',
      '',
      'led = Pin(2, Pin.OUT)',
      '',
      "ble = ESP32BLE.init('ESP32-01')",
      'ble_warned = False',
      '',
      // 연결된 기기가 없으면 gatts_notify가 OSError(ENOTCONN) — 영어 트레이스백으로 멈추지 않고 한국어로 한 번만 알린다
      'def ble_send(text):',
      '    global ble_warned',
      '    try:',
      '        ble.send(text)',
      '        ble_warned = False',
      '    except OSError:',
      '        if not ble_warned:',
      "            print('아직 연결된 기기가 없어요. 컴퓨터·스마트폰에서 [연결]을 누르면 보내져요.')",
      '            ble_warned = True',
      '',
      'def ble_line():',
      '    data = ble.read()',
      '    if data:',
      '        return data',
      "    return ''",
      '',
      '받은글 = 0',
      '횟수 = 0',
      '',
      'while True:',
      '    받은글 = ble_line()',
      "    if 받은글 != '':",
      '        print(받은글)',
      '    횟수 = 횟수 + 1',
      '    ble_send(str(횟수))',
      '    led.value(not led.value())',
      '    sleep(1)',
    ]);
    expect(program.wiring).toEqual([{ part: 'ble', pin: 12, label: '블루투스(BLE)' }]);
  });

  it('MQTT 예시는 허용 목록·길이 검사를 코드에 넣고 표시 장치(LED)만 켠다(PD-29)', () => {
    const program = generateComm(findCommPreset('comm-mqtt-pub-sub')!.state);
    const code = program.code;
    expect(code).toContain("MQTT_ALLOW = ('on', 'off', 'blink')");
    expect(code).toContain('MQTT_MAX_BYTES = 20');
    expect(code).toContain('    if len(payload) > MQTT_MAX_BYTES:');
    expect(code).toContain('    if text not in MQTT_ALLOW:');
    expect(code).toContain("wifi_connect('my-wifi', 'my-password')");
    // 토픽에 접두어를 적지 않는다 — 통로가 붙인다(코드에 또 적으면 두 번 붙어 대시보드와 어긋난다)
    expect(code).toContain("mqtt_connect('esp32-01')");
    expect(code).toContain("    client.subscribe(mqtt_topic + '/rx')");
    expect(code).toContain("    client.publish(mqtt_topic + '/tx', str(횟수))");
    expect(code).not.toContain('xxxxxxxxxxxx');
    expect(code).toContain('    명령 = mqtt_command()');
    // 레이저·모터를 켜는 코드는 만들지 않는다(표시 장치만 — PD-29)
    expect(code).not.toContain('laser');
    expect(code).not.toContain('servo');
  });
});

describe('두 판(화면 코드·실행판)과 파이썬 문법', () => {
  const sources: Record<string, { code: string; exec: boolean }> = {};
  for (const preset of COMM_BLOCK_PRESETS) {
    const program = generateComm(preset.state);
    sources[`${preset.id}.py`] = { code: program.code, exec: false };
    sources[`${preset.id}.exec.py`] = { code: program.execCode, exec: true };
  }

  it('예시마다 화면 코드와 실행판의 줄 수가 같다(오류 줄 번호가 화면과 맞아야 한다)', () => {
    for (const preset of COMM_BLOCK_PRESETS) {
      const program = generateComm(preset.state);
      expect(sameLineCount(program.code, program.execCode), preset.id).toBe(true);
      expect(program.execCode, preset.id).toContain('while await ');
    }
  });

  it('두 판 모두 파이썬 문법에 맞다(이 컴퓨터에 파이썬 3이 있을 때만)', () => {
    const results = pythonSyntaxCheck(sources);
    if (results === null) {
      return; // 파이썬 3이 없는 컴퓨터에서는 건너뛴다(CI·운영자 PC에는 있다)
    }
    expect(results).toEqual(Object.fromEntries(Object.keys(sources).map((name) => [name, 'ok'])));
  });
});

describe('블록 글·색·도구 상자', () => {
  it('블록마다 한국어 글·툴팁·코드 함수가 있고 type은 apc_comm_으로 시작한다', () => {
    const kit = commKit();
    for (const definition of COMM_BLOCK_DEFINITIONS) {
      expect(definition.type.startsWith('apc_comm_'), definition.type).toBe(true);
      expect(String(definition.message0), definition.type).toMatch(/[가-힣]/u);
      expect(String(definition.tooltip), definition.type).toMatch(/[가-힣]/u);
      expect(String(definition.tooltip), definition.type).toContain('코드:');
      expect(typeof kit.generator.forBlock[definition.type], definition.type).toBe('function');
      expect(definition.style, definition.type).toBe(COMM_BLOCK_STYLE);
    }
  });

  it('통신 칸에 블록 9개가 모두 들어 있다(도구 상자 한 칸 + 생성기 — README 7.11)', () => {
    const inCategory = new Set(commToolboxBlockTypes());
    for (const type of COMM_BLOCK_TYPES) {
      expect(inCategory.has(type), type).toBe(true);
    }
    expect(COMM_BLOCK_TYPES.length).toBe(9);
    expect(commToolboxCategory().name).toBe('통신');
  });

  it('통신 칸은 "화면" 다음, "반복·조건" 앞에 들어가고 원래 도구 상자는 그대로다', () => {
    const base = buildToolbox();
    const withComm = withCommCategory(base);
    expect(base.contents.some((category) => category.name === '통신')).toBe(false);
    expect(withComm.contents.map((category) => category.name)).toEqual([
      '보드',
      '센서',
      '빛',
      '소리',
      '움직임',
      '화면',
      '통신',
      '반복·조건',
      '기다리기',
      '계산',
      '변수',
    ]);
    // 두 번 넣어도 한 번만
    expect(withCommCategory(withComm).contents.filter((category) => category.name === '통신').length).toBe(1);
  });

  it('통신 블록 바탕색은 흰 글자와 명도 대비 4.5:1 이상(WCAG AA)', () => {
    expect(contrastRatio(COMM_BLOCK_COLOUR, BLOCK_TEXT_COLOUR)).toBeGreaterThanOrEqual(4.5);
  });

  it('theme.ts에 통신 색이 들어오면 blocks.ts의 값과 같아야 한다(통합 전에는 없어도 통과)', () => {
    const inTheme = BLOCK_COLOURS[COMM_BLOCK_STYLE];
    if (inTheme === undefined) {
      // 아직 theme.ts(공유 파일)에 넣기 전이다 — .cache/phase4-requests/templates.md의 요청 ①
      expect(COMM_BLOCK_COLOUR).toMatch(/^#[0-9a-f]{6}$/u);
      return;
    }
    expect(inTheme).toBe(COMM_BLOCK_COLOUR);
  });
});
