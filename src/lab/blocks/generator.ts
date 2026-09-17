/**
 * 블록 → MicroPython 코드 생성기(PLAN §8.3 P3-06 "블록 → MicroPython 코드 실시간 보기", PD-27 블록 전용 호환 모드).
 *
 * Blockly 13.3.0의 PythonGenerator를 이어받아 두 가지 코드를 **같은 줄 수로** 만든다.
 *   code      화면(편집칸)·실제 보드·[공유 링크]·[.py 내려받기]에 쓰는 보통 MicroPython 코드(교과서 예제 모양, 들여쓰기 4칸)
 *   execCode  JSPI가 없는 브라우저(iPad Safari·Android Chrome 등)에서 가상 보드가 돌리는 실행판 — 기다리는 줄과 반복문 머리만 다르다:
 *               sleep(0.5)            → await __import__('apc_blocks').sleep(0.5)
 *               while True:           → while await __import__('apc_blocks').tick(True):
 *               for count in range(3): → async for count in __import__('apc_blocks').each(range(3)):
 *             워커가 학생 코드를 runPythonAsync로 돌리므로 맨 바깥의 await가 JSPI 없이 된다(Pyodide 최상위 await). 기다리는 동안 워커가
 *             화면 메시지(터치 센서 누름·[정지])를 받는다. 도우미는 src/lab/modules/blocks/apc_blocks.py(가상 시계는 apc_board.wait_ns_async).
 *             줄 수가 같아서 오류가 나도 트레이스백의 줄 번호가 화면 코드와 맞는다(오류 풀이 카드의 "N번째 줄"이 그대로 맞음).
 *
 * 만드는 순서(generateProgram): ① 부품 모으기(collect) — 블록 코드 함수가 generator.part()로 쓰는 부품을 알려 준다 → catalog.planParts
 * ② 화면 코드(display) ③ 실행판(exec). 코드 모양: 첫 줄 표시(BLOCKS_CODE_MARKER) → 머리말 `# @part`(바깥 부품 배선, README 7.4) →
 * import → 부품 준비 줄 → 변수(0으로 시작) → 함수(MP3 명령·Blockly 도우미) → 블록 코드.
 *
 * 금지: 여기서 DOM을 쓰지 않는다(Node 단위 테스트가 jsdom판 Blockly로 돌린다). 블록 정의는 blocks.ts, 블록별 코드는 codegen.ts.
 * 라이선스: 사이트 소프트웨어(MIT). Blockly(Apache-2.0)의 generators/python/loops.ts(v13.3.0)를 참고해 반복문 코드만 다시 썼다.
 */
import type { WiringEntry } from '../modules/board/part-types.ts';
import type { Names } from 'blockly/core';
import type { Block, BlocklyModules, BlocklyPythonApi, Workspace } from './blockly-types.ts';
import {
  BLOCKS_CODE_MARKER,
  importLines,
  planParts,
  type ImportNeed,
  type PartFlavor,
  type PartKind,
  type PartPlan,
  type PartUsage,
  type PlannedPart,
} from './catalog.ts';

/** 실행판이 부르는 도우미 모듈(src/lab/modules/blocks/apc_blocks.py). 학생 코드의 import 훅(apc_board)을 거치지 않게 __import__로 부른다. */
export const EXEC_HELPER = "__import__('apc_blocks')";

/** 빈 작업판일 때의 코드(주석뿐이라 실행해도 아무 일도 없다) */
export const EMPTY_PROGRAM_NOTE = '# 블록을 끌어다 놓으면 여기에 코드가 생겨요.';

/** 들여쓰기(교과서 예제·편집칸과 같은 4칸) */
export const INDENT = '    ';

export type GeneratorMode = 'collect' | 'display' | 'exec';

/** 기다리기 함수(time 모듈 이름 그대로) */
export type WaitFunction = 'sleep' | 'sleep_ms' | 'sleep_us';

export interface GeneratedProgram {
  /** 화면·실제 보드용 코드 */
  readonly code: string;
  /** 블록 전용 호환 모드 실행판(code와 줄 수가 같다) */
  readonly execCode: string;
  readonly plan: PartPlan;
  /** 가상 보드 배선(보드에 붙은 부품 빼고) */
  readonly wiring: readonly WiringEntry[];
  /** 기다리는 블록이 있는지 */
  readonly usesWait: boolean;
  /** 코드로 바뀐 블록 수(꺼진 블록·값 칸에 끼워 둔 기본 블록(shadow) 뺌 — 학생이 놓은 블록 수) */
  readonly blockCount: number;
}

/** 블록 코드 함수가 부품을 부탁할 때 넘기는 값 */
export interface PartRequest {
  readonly pins?: Readonly<Record<string, number>>;
  readonly flavor?: PartFlavor;
}

/** 생성기 인스턴스가 블록 코드 함수(codegen.ts)에 주는 것 */
export interface MicroPythonCodeGenerator {
  readonly mode: GeneratorMode;
  readonly INDENT: string;
  readonly PASS: string;
  /** 이 블록이 쓰는 부품(이름·방식이 정해진 것). 모으기 단계에서는 임시 이름을 돌려준다. */
  part(block: Block, kind: PartKind, request?: PartRequest): PlannedPart;
  /** 기다리는 한 줄(끝 줄바꿈 포함): 화면 코드 `sleep(x)`, 실행판 `await …sleep(x)` */
  waitLine(fn: WaitFunction, argument: string): string;
  /** while 반복문 머리(끝 콜론 포함, 줄바꿈 없음) */
  whileHeader(condition: string): string;
  /** for 반복문 머리(끝 콜론 포함, 줄바꿈 없음) */
  forHeader(variable: string, iterable: string): string;
  valueToCode(block: Block, name: string, order: number): string;
  statementToCode(block: Block, name: string): string;
  addLoopTrap(branch: string, block: Block): string;
  getVariableName(nameOrId: string): string;
  /** 학생 변수와 겹치지 않는 반복 변수 이름(count, count2 …) — Blockly 기본 반복 블록과 같은 규칙 */
  distinctVariableName(base: string): string;
  quote_(text: string): string;
}

/** 정수만 받는 MicroPython 함수 인자(duty·freq·색 값·좌표): 정수 글자면 그대로, 아니면 int(…)로 감싼다 */
export function intArgument(code: string): string {
  const trimmed = code.trim();
  return /^-?\d+$/u.test(trimmed) ? trimmed : `int(${trimmed})`;
}

/** 글자를 받는 함수 인자(LCD·OLED): 따옴표 글자면 그대로, 아니면 str(…) */
export function textArgument(code: string): string {
  const trimmed = code.trim();
  return /^(['"]).*\1$/su.test(trimmed) ? trimmed : `str(${trimmed})`;
}

/** 화면 코드와 실행판의 줄 수가 같은지(단위 테스트·실행 전 확인) */
export function sameLineCount(code: string, execCode: string): boolean {
  return code.split('\n').length === execCode.split('\n').length;
}

/**
 * Blockly 모듈을 받아 MicroPython 생성기 클래스를 만든다(Blockly의 PythonGenerator를 이어받는다).
 * blocks.ts의 블록 정의와 codegen.ts의 블록 코드 함수는 kit.ts가 붙인다.
 */
export function createGeneratorClass(python: BlocklyPythonApi) {
  const { PythonGenerator } = python;

  class MicroPythonGenerator extends PythonGenerator implements MicroPythonCodeGenerator {
    mode: GeneratorMode = 'display';
    plan: PartPlan = planParts([]);
    #usages: PartUsage[] = [];
    #timeFunctions = new Set<WaitFunction>();
    #blockCount = 0;
    #workspace: Workspace | null = null;
    /** Blockly가 만든 이름(escape) → 한글을 살린 코드 이름(이번 생성에서만) */
    #variableNames = new Map<string, string>();

    constructor() {
      super('MicroPython');
      this.INDENT = INDENT;
      // 부품 이름·도우미 이름을 학생 변수 이름이 가리지 않게(겹치면 Blockly가 변수 이름을 led2처럼 바꾼다)
      this.addReservedWords(
        'led,button,touch,motor,laser,rgb,np,buzzer,uart,servo,fan,lcd,oled,i2c,mp3_send,Pin,PWM,SoftI2C,UART,NeoPixel,I2cLcd,SSD1306_I2C,ServoMotor,GORILLACELL_DCMOTORS,sleep,sleep_ms,sleep_us,machine,time,neopixel,apc_blocks',
      );
    }

    part(block: Block, kind: PartKind, request: PartRequest = {}): PlannedPart {
      if (this.mode === 'collect') {
        const usage: PartUsage = { kind, blockId: block.id, ...(request.pins ? { pins: request.pins } : {}), ...(request.flavor ? { flavor: request.flavor } : {}) };
        this.#usages.push(usage);
        // 모으기 단계의 코드는 버리므로 임시 이름이면 된다
        return planParts([usage]).parts[0]!;
      }
      const found = this.plan.find(kind, request.pins);
      if (found) {
        return found;
      }
      // 모으기 단계에서 못 본 부품(생기면 안 됨): 그 자리에서 계획을 만든다
      return planParts([{ kind, blockId: block.id, ...(request.pins ? { pins: request.pins } : {}), ...(request.flavor ? { flavor: request.flavor } : {}) }]).parts[0]!;
    }

    waitLine(fn: WaitFunction, argument: string): string {
      this.#timeFunctions.add(fn);
      return this.mode === 'exec' ? `await ${EXEC_HELPER}.${fn}(${argument})\n` : `${fn}(${argument})\n`;
    }

    distinctVariableName(base: string): string {
      // NameType.VARIABLE의 값은 'VARIABLE'(blockly core names.ts). 이 파일은 core 모듈을 받지 않아 값으로 적는다.
      return this.nameDB_!.getDistinctName(base, 'VARIABLE' as Parameters<Names['getDistinctName']>[1]);
    }

    whileHeader(condition: string): string {
      return this.mode === 'exec' ? `while await ${EXEC_HELPER}.tick(${condition}):` : `while ${condition}:`;
    }

    forHeader(variable: string, iterable: string): string {
      return this.mode === 'exec' ? `async for ${variable} in ${EXEC_HELPER}.each(${iterable}):` : `for ${variable} in ${iterable}:`;
    }

    override init(workspace: Workspace): void {
      this.#workspace = workspace;
      this.#variableNames = new Map();
      // PythonGenerator.init이 변수 줄(`이름 = None`)을 만들 때 getVariableName을 부르므로 이름표를 먼저 비운다
      super.init(workspace);
      this.#timeFunctions = new Set();
      this.#blockCount = 0;
    }

    /**
     * 학생 변수 이름을 코드 이름으로. Blockly는 한글 이름을 `_ED_95_AD_EB_AA_A9`처럼 바꾸지만(Names.safeName — 영문만 허용),
     * 파이썬(CPython)과 MicroPython(v1.29.0 py/lexer.c: 0x80 이상 바이트를 이름 글자로 받음)은 한글 이름을 그대로 받으므로
     * "블록 = 코드"가 읽히게 한글을 살린다. 영문만인 이름은 Blockly 규칙 그대로(예약어와 겹치면 led2).
     */
    override getVariableName(nameOrId: string): string {
      const escaped = super.getVariableName(nameOrId);
      const variable = this.#workspace?.getVariableMap().getVariable(nameOrId) ?? this.#workspace?.getVariableMap().getVariableById(nameOrId) ?? null;
      const original = variable ? variable.getName() : nameOrId;
      if (!/[^\u0000-\u007f]/u.test(original)) {
        return escaped;
      }
      const cached = this.#variableNames.get(escaped);
      if (cached) {
        return cached;
      }
      let readable = original.trim().replace(/\s+/gu, '_').replace(/[^\p{L}\p{N}_]/gu, '_');
      if (readable === '' || /^\p{N}/u.test(readable)) {
        readable = `변수_${readable}`;
      }
      const taken = new Set(this.#variableNames.values());
      let candidate = readable;
      for (let suffix = 2; taken.has(candidate); suffix += 1) {
        candidate = `${readable}${suffix}`;
      }
      this.#variableNames.set(escaped, candidate);
      return candidate;
    }

    override blockToCode(block: Block | null, thisOnly?: boolean): string | [string, number] {
      if (block && block.isEnabled() && !block.isInsertionMarker() && !block.isShadow()) {
        this.#blockCount += 1;
      }
      return super.blockToCode(block, thisOnly);
    }

    override finish(code: string): string {
      const definitions = { ...this.definitions_ };
      // PythonGenerator.finish가 정리(정의 사전 비우기·이름표 초기화)를 맡는다. 돌려주는 모양은 쓰지 않는다.
      super.finish('');
      return formatProgram(this.plan, definitions, [...this.#timeFunctions], code);
    }

    /** 부품 모으기 → 화면 코드 → 실행판 */
    generateProgram(workspace: Workspace): GeneratedProgram {
      this.mode = 'collect';
      this.#usages = [];
      this.plan = planParts([]);
      this.workspaceToCode(workspace);
      this.plan = planParts(this.#usages);
      this.mode = 'display';
      const code = this.workspaceToCode(workspace);
      const usesWait = this.#timeFunctions.size > 0;
      const blockCount = this.#blockCount;
      this.mode = 'exec';
      const execCode = this.workspaceToCode(workspace);
      this.mode = 'display';
      return {
        code,
        execCode,
        plan: this.plan,
        wiring: this.plan.parts.flatMap((part) => (part.wiring ? [part.wiring] : [])),
        usesWait,
        blockCount,
      };
    }
  }

  return MicroPythonGenerator;
}

export type MicroPythonGeneratorClass = ReturnType<typeof createGeneratorClass>;
export type MicroPythonGenerator = InstanceType<MicroPythonGeneratorClass>;

/**
 * 코드 모양을 정한다(순수 함수 — 단위 테스트가 직접 부른다).
 * definitions는 Blockly가 모은 정의(variables = 변수 줄, import_random 같은 import, upRange 같은 도우미 함수).
 */
export function formatProgram(plan: PartPlan, definitions: Readonly<Record<string, string>>, timeFunctions: readonly WaitFunction[], body: string): string {
  const needs: ImportNeed[] = [...plan.sharedImports, ...plan.parts.flatMap((part) => part.imports)];
  const plainModules: string[] = [];
  const helperDefinitions: string[] = [];
  let variableLines: string[] = [];
  for (const [name, definition] of Object.entries(definitions)) {
    const text = definition.trim();
    if (text === '') {
      continue;
    }
    if (name === 'variables') {
      // Blockly는 변수를 None으로 시작하지만, 보드 코드의 변수는 대개 수(횟수·값)라 0으로 시작한다(`count = count + 1`이 바로 된다).
      variableLines = text.split('\n').map((line) => line.replace(/ = None$/u, ' = 0'));
      continue;
    }
    const plain = /^import\s+([A-Za-z_][\w.]*)$/u.exec(text);
    if (plain) {
      plainModules.push(plain[1]!);
      continue;
    }
    const from = /^from\s+(\S+)\s+import\s+(.+)$/u.exec(text);
    if (from) {
      for (const imported of from[2]!.split(',')) {
        needs.push({ from: from[1]!, name: imported.trim() });
      }
      continue;
    }
    helperDefinitions.push(text);
  }
  for (const fn of timeFunctions) {
    needs.push({ from: 'time', name: fn });
  }

  const head = [BLOCKS_CODE_MARKER, ...plan.parts.flatMap((part) => (part.directive ? [`# @part ${part.directive}`] : [])), ...importLines(needs, plainModules)];
  const sections = [head.join('\n')];
  const setup = [...plan.sharedSetup, ...plan.parts.flatMap((part) => part.setup)];
  if (setup.length > 0) {
    sections.push(setup.join('\n'));
  }
  if (variableLines.length > 0) {
    sections.push(variableLines.join('\n'));
  }
  if (plan.helpers.length > 0) {
    sections.push(plan.helpers.join('\n'));
  }
  sections.push(...helperDefinitions);
  const trimmedBody = body.replace(/\s+$/u, '');
  sections.push(trimmedBody === '' ? EMPTY_PROGRAM_NOTE : trimmedBody);
  return `${sections.join('\n\n')}\n`;
}

/** kit이 만든 생성기에 붙는 묶음 */
export type GeneratorFactory = (modules: BlocklyModules) => MicroPythonGenerator;
