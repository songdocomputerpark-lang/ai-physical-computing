// 블록 모드 단위 테스트 도구: Node에서 Blockly 13.3.0(CommonJS판 — core-node.js가 jsdom으로 XML을 처리)을 불러 블록 모드 한 벌을 만든다.
// 브라우저는 src/lab/blocks/loader.ts가 ES 모듈판을 늦게 받는다. 두 곳이 같은 kit.ts·generator.ts·codegen.ts를 쓴다.
import { createRequire } from 'node:module';
import type { BlocklyApi, BlocklyBlocksApi, BlocklyPythonApi, Workspace } from '../../../../src/lab/blocks/blockly-types.ts';
import { createBlocksKit, type BlocksKit } from '../../../../src/lab/blocks/kit.ts';
import type { SerializedBlock, SerializedWorkspace } from '../../../../src/lab/blocks/presets.ts';

const require = createRequire(import.meta.url);

let cached: BlocksKit | null = null;

export function nodeBlocksKit(): BlocksKit {
  if (cached) {
    return cached;
  }
  const Blockly = require('blockly/core') as BlocklyApi;
  const libraryBlocks = require('blockly/blocks') as BlocklyBlocksApi;
  const python = require('blockly/python') as BlocklyPythonApi;
  const ko = require('blockly/msg/ko') as Record<string, string>;
  Blockly.setLocale(ko);
  cached = createBlocksKit({ Blockly, libraryBlocks, python });
  return cached;
}

/** 직렬화 모양으로 새 작업판을 만든다(화면 없는 Workspace) */
export function workspaceFrom(state: SerializedWorkspace): Workspace {
  const { Blockly } = nodeBlocksKit();
  const workspace = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(state as unknown as Record<string, unknown>, workspace);
  return workspace;
}

/** 맨 위 블록 몇 개로 작업판 모양을 만든다 */
export function stateOf(...blocks: SerializedBlock[]): SerializedWorkspace {
  return { blocks: { languageVersion: 0, blocks: blocks.map((block, index) => ({ x: 20, y: 20 + index * 200, ...block })) } };
}

/** "계속 반복하기" 안에 블록 줄기를 넣은 한 개 */
export function forever(body: SerializedBlock | undefined): SerializedBlock {
  return { type: 'apc_forever', ...(body ? { inputs: { DO: { block: body } } } : {}) };
}
