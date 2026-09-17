/**
 * 블록 모드 한 벌(블록 정의·코드 생성기·도구 상자·색 테마)을 Blockly 모듈에 붙여 만든다. DOM을 쓰지 않는다 — 브라우저(mode-ui.ts)와
 * Node 단위 테스트(tests/unit/blocks/)가 같은 한 벌을 쓴다.
 *
 *   const kit = createBlocksKit({ Blockly, libraryBlocks, python });     // loader.ts의 loadBlocksKit()이 브라우저에서 부른다
 *   const program = kit.generate(workspace);                            // { code, execCode, wiring, plan, … }
 */
import type { BlocklyModules, Workspace } from './blockly-types.ts';
import { STANDARD_BLOCK_TYPES, registerBlocks } from './blocks.ts';
import { customBlockCode, standardBlockOverrides } from './codegen.ts';
import { createGeneratorClass, type GeneratedProgram, type MicroPythonGenerator } from './generator.ts';
import { defineBlocksTheme } from './theme.ts';
import { buildToolbox, type ToolboxDefinitionJson } from './toolbox.ts';

export interface BlocksKit extends BlocklyModules {
  readonly generator: MicroPythonGenerator;
  readonly toolbox: ToolboxDefinitionJson;
  readonly theme: ReturnType<typeof defineBlocksTheme>;
  generate(workspace: Workspace): GeneratedProgram;
}

const kits = new WeakMap<object, BlocksKit>();

export function createBlocksKit(modules: BlocklyModules): BlocksKit {
  const cached = kits.get(modules.Blockly);
  if (cached) {
    return cached;
  }
  const { Blockly, libraryBlocks, python } = modules;
  registerBlocks(Blockly);
  // "계속 반복하기" 안에서도 "반복 멈추기(break)" 블록을 쓸 수 있게 반복 블록 목록에 넣는다(blocks/loops.ts loopTypes — 공식 확장 방법)
  (libraryBlocks.loops as { loopTypes?: Set<string> } | undefined)?.loopTypes?.add('apc_forever');

  const GeneratorClass = createGeneratorClass(python);
  const generator = new GeneratorClass();
  // forBlock의 함수 타입이 생성기 자신(this)을 받게 적혀 있어 PythonGenerator용 함수를 하위 클래스 표에 바로 넣으면 타입이 맞지 않는다
  // (Blockly 13.3.0 d.ts의 this 타입). 실행에서는 하위 클래스가 PythonGenerator의 모든 것을 가지므로 표를 넓혀 넣는다.
  const table = generator.forBlock as Record<string, unknown>;
  for (const type of STANDARD_BLOCK_TYPES) {
    const code = python.pythonGenerator.forBlock[type];
    if (typeof code !== 'function') {
      throw new Error(`Blockly python 생성기에 기본 블록 "${type}"이(가) 없어요.`);
    }
    table[type] = code;
  }
  Object.assign(table, standardBlockOverrides(python), customBlockCode(python.Order));

  const kit: BlocksKit = {
    Blockly,
    libraryBlocks,
    python,
    generator,
    toolbox: buildToolbox(),
    theme: defineBlocksTheme(Blockly),
    generate: (workspace) => generator.generateProgram(workspace),
  };
  kits.set(Blockly, kit);
  return kit;
}
