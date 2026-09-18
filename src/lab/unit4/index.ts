/**
 * 4단원 통합 화면(/labs/unit4/, PLAN §8.4 P4-09)의 공개 자리 — 페이지·부품은 여기서만 가져다 쓴다.
 * (브릿지 `src/lab/bridge/index.ts`·데이터 포트 `src/lab/serial/data-port/index.ts`와 같은 규칙)
 *
 * 빌드(.astro 프런트매터)에서는 DOM을 만지지 않는 `config.ts`·`examples.ts`만 쓰고, 화면 논리(`unit4-page.ts`)는
 * 페이지 아래 <script>에서만 부른다.
 */
export { BOARD_READY_MS, CONNECT_MS, SAMPLE_MS, UNIT4_SCREEN, UNIT4_SCREEN_VALUE } from './config.ts';
export { DEFAULT_BOARD_FILE, DEFAULT_PC_FILE, PAIRS, defaultBoardExampleId, defaultPcExampleId } from './examples.ts';
export {
  TARGET_INPUT_FPS,
  readFps,
  readHeapMb,
  reportMarkdown,
  summarize,
  summaryText,
  type PerfRange,
  type PerfSample,
  type PerfSummary,
} from './perf.ts';
export { applyScreenPreset, bleConnected, mountUnit4Page, type Unit4Page, type Unit4Phase } from './unit4-page.ts';
