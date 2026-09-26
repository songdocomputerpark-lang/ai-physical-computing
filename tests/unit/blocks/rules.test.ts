// 블록 모드의 순수 규칙(PLAN §8.3 P3-06): 부품 표·import 순서·코드 머리말 배선·블록 전용 호환 모드 고르기·모드 규칙·색 대비·도구 상자·모듈 등록.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BLOCK_DEFINITIONS } from '../../../src/lab/blocks/blocks.ts';
import { BLOCKS_CODE_MARKER, INPUT_PINS, OUTPUT_PINS, PART_KINDS, importLines, isBlocksCode, planParts } from '../../../src/lab/blocks/catalog.ts';
import { wiringFromBlocksCode } from '../../../src/lab/blocks/code-wiring.ts';
import { chooseRunCode, compatMessage, installRunCodeTransform } from '../../../src/lab/blocks/compat.ts';
import { BLOCKS_STORAGE, initialMode, isEditingKey, modeFromLocation, needsConvertConfirm } from '../../../src/lab/blocks/mode-rules.ts';
import { chain, numberShadow } from '../../../src/lab/blocks/presets.ts';
import { BLOCK_COLOURS, BLOCK_TEXT_COLOUR, contrastRatio } from '../../../src/lab/blocks/theme.ts';
import { TOOLBOX_CATEGORY_IDS, buildToolbox } from '../../../src/lab/blocks/toolbox.ts';
import { HEADER_PINS } from '../../../src/lab/modules/board/layout.ts';
import { MODULE_MANIFESTS } from '../../../src/lab/modules/manifests.ts';
import type { PythonRuntime, RunResult } from '../../../src/lab/runtime/client.ts';
import { pythonModulesForLab } from '../../../src/lab/python/modules.ts';
import { isValidStorageName } from '../../../src/lib/storage.ts';
import { nodeBlocksKit, stateOf, workspaceFrom } from './helpers/blockly-node.ts';
import { TOUCH_LED_STATE } from './helpers/programs.ts';

const REPO = process.cwd();

describe('부품 표(catalog)', () => {
  it('핀 선택지는 30핀 보드에 핀 머리가 있는 GPIO만: 출력은 1·3(UART0)·34~39(입력 전용) 제외, 입력은 34·35·36·39 포함', () => {
    const header = new Set(HEADER_PINS.flatMap((pin) => (pin.gpio === null ? [] : [pin.gpio])));
    for (const pin of INPUT_PINS) {
      expect(header.has(pin), `GPIO${pin}`).toBe(true);
    }
    expect(OUTPUT_PINS.some((pin) => pin === 1 || pin === 3 || pin >= 34)).toBe(false);
    expect(INPUT_PINS).toEqual(expect.arrayContaining([34, 35, 36, 39]));
    expect(INPUT_PINS).not.toContain(0);
  });

  it('가상 보드 부품 id는 부품 폴더(src/lab/modules/board/parts/<id>/)와 같다 — 이름이 바뀌면 배선이 "아직 없는 부품"으로 보인다', () => {
    for (const info of PART_KINDS) {
      if (info.boardPart) {
        expect(fs.existsSync(path.join(REPO, 'src', 'lab', 'modules', 'board', 'parts', info.boardPart)), `parts/${info.boardPart}/`).toBe(true);
      }
    }
  });

  it('같은 종류·같은 핀은 하나로 합치고, 표 순서 → 핀 순서로 준비 줄을 낸다', () => {
    const plan = planParts([
      { kind: 'touch', pins: { sig: 18 }, blockId: 'b' },
      { kind: 'builtin-led', blockId: 'a' },
      { kind: 'touch', pins: { sig: 18 }, blockId: 'c' },
      { kind: 'boot-button' },
    ]);
    expect(plan.parts.map((part) => part.name)).toEqual(['led', 'button', 'touch']);
    expect(plan.parts[2]!.blockIds).toEqual(['b', 'c']);
    expect(plan.parts[2]!.setup).toEqual(['touch = Pin(18, Pin.IN)']);
    expect(plan.find('touch', { sig: 18 })?.name).toBe('touch');
    expect(plan.find('touch', { sig: 19 })).toBeNull();
  });

  it('고정 핀 부품(내장 LED·LCD)은 블록이 다른 핀을 알려도 표의 핀을 쓴다', () => {
    const plan = planParts([{ kind: 'builtin-led', pins: { led: 5 } }, { kind: 'lcd', pins: { sda: 4, scl: 5 } }]);
    expect(plan.parts[0]!.pins).toEqual({ led: 2 });
    expect(plan.parts[1]!.pins).toEqual({ sda: 21, scl: 22 });
  });

  it('import 줄은 machine → time → 라이브러리 → import 순서, 이름도 교과서 순서로 합친다', () => {
    expect(
      importLines(
        [
          { from: 'machine', name: 'UART' },
          { from: 'time', name: 'sleep_ms' },
          { from: 'ssd1306', name: 'SSD1306_I2C' },
          { from: 'machine', name: 'Pin' },
          { from: 'time', name: 'sleep' },
          { from: 'machine', name: 'PWM' },
          { from: 'machine', name: 'Pin' },
        ],
        ['random'],
      ),
    ).toEqual(['from machine import Pin, PWM, UART', 'from time import sleep, sleep_ms', 'from ssd1306 import SSD1306_I2C', 'import random']);
  });

  it('블록 코드 표시(첫 줄)로 블록에서 온 코드인지 안다', () => {
    expect(isBlocksCode(`${BLOCKS_CODE_MARKER}\nprint(1)`)).toBe(true);
    expect(isBlocksCode('# 첫 실습: 내장 LED 깜빡이기\nfrom machine import Pin')).toBe(false);
  });
});

describe('코드 머리말 → 가상 보드 배선(code-wiring)', () => {
  it('블록이 만든 코드의 # @part를 읽으면 블록 모드가 알린 배선과 같다(코드 모드로 바꾸거나 새로고침해도 배선도가 그대로)', () => {
    const kit = nodeBlocksKit();
    const program = kit.generate(
      workspaceFrom(
        stateOf(
          chain([
            { type: 'apc_rgb_color', fields: { PINS: '12,5,4', COLOR: 'red' } },
            { type: 'apc_lcd_clear' },
            { type: 'apc_mp3_play', inputs: { TRACK: numberShadow(2) } },
            { type: 'apc_servo', fields: { PIN: '26' }, inputs: { ANGLE: numberShadow(90) } },
            { type: 'apc_fan', fields: { INA: '32', INB: '33', DIRECTION: 'cw' } },
            { type: 'apc_neopixel_write', fields: { PIN: '23' } },
            { type: 'text_print', inputs: { TEXT: { block: { type: 'apc_touch_value', fields: { PIN: '34' } } } } },
            { type: 'apc_vibration', fields: { PIN: '19', STATE: 'on' } },
          ])!,
        ),
      ),
    );
    expect(program.wiring.length).toBe(8);
    expect(wiringFromBlocksCode(program.code)).toEqual(program.wiring);
    expect(wiringFromBlocksCode(kit.generate(workspaceFrom(TOUCH_LED_STATE)).code)).toEqual([{ part: 'touch-digital', pin: 17, label: '터치 센서' }]);
    // 이 파일의 첫 nodeBlocksKit()이 Node에서 Blockly를 처음 띄운다 — 컴퓨터가 바쁠 때(npm test 전체·다른 검사와 함께) 기본 5초를 넘은 적이 있어
    // (2026-09-26 Phase 6 구역 A 실측: 한 번 56초, 제한을 늘리면 3.6초로 통과) 제한 시간을 60초로 둔다(요청 A-7).
  }, 60_000);

  it('학생이 코드 모드에서 # @part 핀을 고치면 배선도 따라간다. 블록 코드가 아니면 null', () => {
    const code = `${BLOCKS_CODE_MARKER}\n# @part touch-digital 18\nfrom machine import Pin\n`;
    expect(wiringFromBlocksCode(code)).toEqual([{ part: 'touch-digital', pin: 18, label: '터치 센서' }]);
    expect(wiringFromBlocksCode('# @part touch-digital 18\nfrom machine import Pin\n')).toBeNull();
    expect(wiringFromBlocksCode(`${BLOCKS_CODE_MARKER}\nfrom machine import Pin\n`)).toEqual([]);
  });
});

describe('블록 전용 호환 모드 고르기(compat, PD-27)', () => {
  const pair = { code: `${BLOCKS_CODE_MARKER}\nwhile True:\n    sleep(1)\n`, execCode: `${BLOCKS_CODE_MARKER}\nwhile await t(True):\n    await s(1)\n` };

  it('JSPI가 있으면 늘 보이는 코드 그대로', () => {
    expect(chooseRunCode(pair.code, false, pair)).toEqual({ code: pair.code, decision: 'off' });
  });

  it('JSPI가 없고 편집칸이 블록이 만든 코드와 같으면 실행판', () => {
    expect(chooseRunCode(pair.code, true, pair)).toEqual({ code: pair.execCode, decision: 'exec' });
  });

  it('블록 코드를 고쳤으면 고친 코드 그대로(edited), 블록 코드가 아니면 off', () => {
    const edited = pair.code.replace('sleep(1)', 'sleep(2)');
    expect(chooseRunCode(edited, true, pair)).toEqual({ code: edited, decision: 'edited' });
    expect(chooseRunCode("print('안녕')\n", true, pair)).toEqual({ code: "print('안녕')\n", decision: 'off' });
    expect(chooseRunCode(pair.code, true, null)).toEqual({ code: pair.code, decision: 'edited' });
  });

  it('줄 수가 다른 실행판은 쓰지 않는다(오류 줄 번호가 어긋나므로)', () => {
    expect(chooseRunCode(pair.code, true, { code: pair.code, execCode: 'x\n' }).decision).toBe('edited');
  });

  it('안내 문장은 한국어이고 off면 없다', () => {
    expect(compatMessage('exec')).toMatch(/블록 전용 호환 모드/u);
    expect(compatMessage('edited')).toMatch(/Chrome이나 Edge/u);
    expect(compatMessage('off')).toBeNull();
  });

  it('실행기 run을 감싸 보낼 코드를 바꾸고, 떼면 원래 run으로 돌아간다', async () => {
    const sent: string[] = [];
    class FakeRuntime {
      async run(code: string): Promise<RunResult> {
        sent.push(code);
        return { runId: sent.length, outcome: 'ok', durationMs: 1 };
      }
    }
    const runtime = new FakeRuntime() as unknown as PythonRuntime;
    const uninstall = installRunCodeTransform(runtime, (code) => (code === 'a' ? 'b' : null));
    await runtime.run('a');
    await runtime.run('c');
    expect(sent).toEqual(['b', 'c']);
    uninstall();
    expect(Object.prototype.hasOwnProperty.call(runtime, 'run')).toBe(false);
    await runtime.run('a');
    expect(sent).toEqual(['b', 'c', 'a']);
  });
});

describe('모드 규칙(mode-rules)', () => {
  it('주소: ?blocks=1이면 블록, ?example=·공유 링크(#code=)면 코드, 아니면 저장된 모드', () => {
    expect(modeFromLocation('?blocks=1', '')).toBe('blocks');
    expect(modeFromLocation('?example=esp32/01-first-blink.py', '')).toBe('code');
    expect(modeFromLocation('', '#code=abc&ex=1')).toBe('code');
    expect(modeFromLocation('', '')).toBeNull();
    expect(initialMode('', '', 'blocks')).toBe('blocks');
    expect(initialMode('?example=a.py', '', 'blocks')).toBe('code');
    expect(initialMode('', '', 'something')).toBe('code');
  });

  it('[코드로 바꾸기] 전에 묻는 때: 예제 칸에 학생이 고쳐 둔 다른 코드가 있을 때만', () => {
    expect(needsConvertConfirm(null, 'ex', 'gen', null)).toBe(false);
    expect(needsConvertConfirm('ex', 'ex', 'gen', null)).toBe(false);
    expect(needsConvertConfirm('gen', 'ex', 'gen', null)).toBe(false);
    expect(needsConvertConfirm('old-gen', 'ex', 'gen', 'old-gen')).toBe(false);
    expect(needsConvertConfirm('my edits', 'ex', 'gen', 'old-gen')).toBe(true);
    expect(needsConvertConfirm('  ', 'ex', 'gen', null)).toBe(false);
  });

  it('읽기 전용 편집칸에서 안내를 띄울 키: 글자·지우기·줄바꿈(화살표·Ctrl 조합은 아님)', () => {
    const none = { ctrl: false, meta: false, alt: false };
    expect(isEditingKey('a', none)).toBe(true);
    expect(isEditingKey('Backspace', none)).toBe(true);
    expect(isEditingKey('ArrowDown', none)).toBe(false);
    expect(isEditingKey('c', { ...none, ctrl: true })).toBe(false);
  });

  it('저장 이름은 사이트 규칙(머리말 없이, [이 컴퓨터에서 내 기록 지우기]가 지움)에 맞다', () => {
    for (const name of Object.values(BLOCKS_STORAGE)) {
      expect(isValidStorageName(name), name).toBe(true);
      expect(name.startsWith('module:blocks:')).toBe(true);
    }
  });
});

describe('색·도구 상자', () => {
  it('블록 바탕색은 모두 흰 글자와 명도 대비 4.5:1 이상(WCAG AA)', () => {
    for (const [style, colour] of Object.entries(BLOCK_COLOURS)) {
      expect(contrastRatio(colour, BLOCK_TEXT_COLOUR), style).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });

  it('블록 정의의 style은 모두 색이 정해져 있다', () => {
    for (const definition of BLOCK_DEFINITIONS) {
      expect(BLOCK_COLOURS[String(definition.style)], definition.type).toBeDefined();
    }
  });

  it('도구 상자 카테고리 10개: 한국어 이름, 겹치지 않는 id(페이지의 다른 id와 겹치지 않게 blocks-cat- 머리말), 색 이름이 있음', () => {
    const toolbox = buildToolbox();
    expect(toolbox.contents.map((category) => category.name)).toEqual(['보드', '센서', '빛', '소리', '움직임', '화면', '반복·조건', '기다리기', '계산', '변수']);
    expect(toolbox.contents.map((category) => category.toolboxitemid)).toEqual([...TOOLBOX_CATEGORY_IDS]);
    for (const category of toolbox.contents) {
      expect(BLOCK_COLOURS[category.categorystyle.replace(/_category$/u, '_blocks')], category.name).toBeDefined();
    }
  });
});

describe('흉내 모듈 폴더 등록(src/lab/modules/blocks/)', () => {
  it('ESP32 실습실에만 붙고, 실행판 도우미 apc_blocks.py는 ESP32 실습실 워커에만 들어간다', () => {
    const manifest = MODULE_MANIFESTS.find((item) => item.id === 'blocks');
    expect(manifest?.labs).toEqual(['esp32']);
    expect(manifest?.requestKinds ?? []).toEqual([]);
    expect(Object.keys(pythonModulesForLab('esp32'))).toContain('apc_blocks.py');
    expect(Object.keys(pythonModulesForLab('vision'))).not.toContain('apc_blocks.py');
    expect(Object.keys(pythonModulesForLab('dev'))).not.toContain('apc_blocks.py');
  });
});
