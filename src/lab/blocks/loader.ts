/**
 * Blockly 13.3.0을 브라우저에서 늦게 받는다(PLAN §5.2 "Blockly는 실제로 쓸 때 받는 런타임 캐시", README 5.1 "반드시 동적 import()").
 * 블록 모드를 처음 열 때 한 번만 받고(약 0.8MB), 실패하면 다음에 다시 시도할 수 있게 약속을 지운다.
 * 한국어 메시지(blockly/msg/ko)를 넣은 뒤 블록 모드 한 벌(kit.ts)을 만든다.
 */
import { createBlocksKit, type BlocksKit } from './kit.ts';

let pending: Promise<BlocksKit> | null = null;

export function loadBlocksKit(): Promise<BlocksKit> {
  if (!pending) {
    pending = (async () => {
      const [Blockly, libraryBlocks, python, ko] = await Promise.all([
        import('blockly/core'),
        import('blockly/blocks'),
        import('blockly/python'),
        import('blockly/msg/ko'),
      ]);
      Blockly.setLocale(ko as unknown as Record<string, string>);
      return createBlocksKit({ Blockly, libraryBlocks, python });
    })();
    pending.catch(() => {
      pending = null;
    });
  }
  return pending;
}
