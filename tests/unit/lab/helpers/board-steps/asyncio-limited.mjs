// 가상 보드의 asyncio(src/lab/modules/board/ext/asyncio/apc_board_asyncio.py — 판 1.1.5)를 제한 모드(JSPI 없는 브라우저)에서.
// sleep·sleep_ms는 블록 전용 호환 모드와 같은 wait_ns_async라 맨 바깥 await로 되고, run(main)은 끝날 때까지 기다릴 수 없어
// apc_runtime.LIMITED_MESSAGE를 RuntimeError로 알린다(오류 사전 limited-mode). tests/unit/lab/pyodide-board-asyncio.test.ts가 `--limited`로 돌린다.

export default async function asyncioLimitedSteps({ step }) {
  await step(
    'limited_top_level_sleep',
    ['import asyncio, time', 't0 = time.ticks_ms()', 'await asyncio.sleep_ms(50)', 'time.ticks_diff(time.ticks_ms(), t0)'].join('\n'),
  );
  await step('limited_run', ['import asyncio', 'async def main():', '    return 1', 'asyncio.run(main())'].join('\n'));
}
