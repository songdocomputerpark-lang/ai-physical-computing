/**
 * 블록 모드가 쓰는 Blockly 13.3.0 모듈의 모양(타입만 — 실행 코드 없음, PLAN §3.1 "Blockly 13.3.0 + 한국어 메시지 + Python 코드 생성기").
 *
 * 왜 import 대신 넘겨받나: 브라우저는 `import('blockly/core')`로 ES 모듈(blockly.mjs, 이름 있는 내보내기)을 받고, Node 단위 테스트는
 * package.json exports의 "node" 조건으로 CommonJS판(core-node.js — jsdom으로 XML 처리)을 받는다. 같은 파일에서 `import * as Blockly`를 쓰면
 * Node에서는 이름 있는 내보내기가 비어 있어서, 블록 정의·코드 생성 모듈은 Blockly 모듈 객체를 인자로 받는다(loader.ts가 브라우저에서 넘긴다).
 * 큰 묶음(약 0.8MB)이라 실습실 페이지에서도 블록 모드를 처음 열 때만 받는다(first-visit 전송량 검사에 들어가지 않게).
 */
import type * as BlocklyBlocks from 'blockly/blocks';
import type * as BlocklyCore from 'blockly/core';
import type * as BlocklyPython from 'blockly/python';

/** blockly/core 모듈(Blockly 네임스페이스) */
export type BlocklyApi = typeof BlocklyCore;

/** blockly/python 모듈({ Order, PythonGenerator, pythonGenerator }) */
export type BlocklyPythonApi = typeof BlocklyPython;

/** blockly/blocks 모듈(기본 블록 묶음 — loops.loopTypes에 "계속 반복" 블록을 더한다) */
export type BlocklyBlocksApi = typeof BlocklyBlocks;

export type Block = BlocklyCore.Block;
export type Workspace = BlocklyCore.Workspace;
export type WorkspaceSvg = BlocklyCore.WorkspaceSvg;

/** Blockly와 기본 블록·Python 생성기를 한 번에 넘기는 묶음 */
export interface BlocklyModules {
  readonly Blockly: BlocklyApi;
  readonly libraryBlocks: BlocklyBlocksApi;
  readonly python: BlocklyPythonApi;
}
