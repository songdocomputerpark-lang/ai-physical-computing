/**
 * 통신 블록 묶음의 공개 자리(P4-10) — 쓰는 쪽은 이 파일에서만 가져온다.
 *
 * 붙이는 방법(공유 파일 한 곳만 고친다 — 요청 .cache/phase4-requests/templates.md):
 *
 *   // src/lab/blocks/kit.ts
 *   import { installCommBlocks, withCommCategory } from './comm/index.ts';
 *   …
 *   Object.assign(table, standardBlockOverrides(python), customBlockCode(python.Order));
 *   installCommBlocks({ Blockly, python, forBlock: table, generator });   // 통신 블록(P4-10)
 *   const kit: BlocksKit = { …, toolbox: withCommCategory(buildToolbox()), … };
 *
 * 이렇게 하면 blocks.ts·codegen.ts·toolbox.ts·catalog.ts를 고치지 않아도 블록·코드·도구 상자 칸이 모두 들어간다
 * (그 파일들을 보는 공유 테스트 tests/unit/blocks/rules.test.ts·generator.test.ts도 그대로 통과한다).
 * 색 이름(apc_comm_blocks)만 theme.ts에 있어야 한다.
 */
import type { BlocklyApi, BlocklyPythonApi } from '../blockly-types.ts';
import { COMM_BLOCK_DEFINITIONS } from './blocks.ts';
import { commBlockCode } from './codegen.ts';
import { COMM_RESERVED_WORDS } from './plan.ts';

export { COMM_BLOCK_COLOUR, COMM_BLOCK_DEFINITIONS, COMM_BLOCK_STYLE, COMM_BLOCK_TYPES } from './blocks.ts';
export { commBlockCode } from './codegen.ts';
export {
  COMM_BLE_NAME,
  COMM_BLE_PART,
  COMM_MQTT,
  COMM_NAMES,
  COMM_ORDER,
  COMM_RESERVED_WORDS,
  COMM_UART,
  COMM_UART_PART,
  COMM_WIFI,
  commPartsOf,
  useComm,
  type CommFamily,
  type CommFeature,
} from './plan.ts';
export { COMM_BLOCK_PRESETS, findCommPreset } from './presets.ts';
export {
  COMM_TOOLBOX_BROKER_NOTE,
  COMM_TOOLBOX_CATEGORY_ID,
  COMM_TOOLBOX_CATEGORY_NAME,
  commToolboxBlockTypes,
  commToolboxCategory,
  withCommCategory,
} from './toolbox.ts';

/** installCommBlocks가 받는 것(kit.ts가 이미 들고 있는 것들) */
export interface CommInstallTarget {
  readonly Blockly: BlocklyApi;
  readonly python: BlocklyPythonApi;
  /** 생성기의 블록 코드 표(kit.ts의 generator.forBlock) */
  readonly forBlock: Record<string, unknown>;
  /** 예약어를 넣을 생성기(없으면 넣지 않는다) */
  readonly generator?: { addReservedWords(words: string): void };
}

const registered = new WeakSet<object>();

/** 통신 블록 정의를 Blockly에 등록한다(같은 Blockly 모듈에 두 번 불러도 한 번만) */
export function registerCommBlocks(Blockly: BlocklyApi): void {
  if (registered.has(Blockly.Blocks)) {
    return;
  }
  Blockly.common.defineBlocks(
    Blockly.common.createBlockDefinitionsFromJsonArray(COMM_BLOCK_DEFINITIONS as unknown as Parameters<typeof Blockly.common.createBlockDefinitionsFromJsonArray>[0]),
  );
  registered.add(Blockly.Blocks);
}

/** 블록 정의 + 코드 함수 + 예약어를 한 번에 붙인다 */
export function installCommBlocks(target: CommInstallTarget): void {
  registerCommBlocks(target.Blockly);
  Object.assign(target.forBlock, commBlockCode(target.python.Order));
  target.generator?.addReservedWords(COMM_RESERVED_WORDS.join(','));
}
