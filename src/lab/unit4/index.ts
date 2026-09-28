/**
 * 4단원 통합 화면(/labs/unit4/, PLAN §8.4 P4-09)의 공개 자리 — 페이지·부품·테스트는 여기서 가져다 쓴다.
 * (브릿지 `src/lab/bridge/index.ts`·데이터 포트 `src/lab/serial/data-port/index.ts`와 같은 규칙)
 *
 * 빌드(.astro 프런트매터)에서는 DOM을 만지지 않는 `config.ts`·`examples.ts`만 쓰고, 화면 논리(`unit4-page.ts`)는
 * 페이지 아래 <script>에서만 부른다. `perf.ts`는 순수 함수라 브라우저 테스트가 Node에서 바로 시험한다.
 * (판 1.1.0, PROGRESS 미해결 138: 한 문서에 틀이 둘이라 두던 우회 `address.ts`(주소 맡기기)·`dom.ts`(겹친 id 풀기)는 실습실 틀로 옮겨 지웠다 —
 * src/lab/controls/lab-shell.ts의 scopeLabIds·share-link.ts의 pickShareLab·pickExampleLab.)
 */
export {
  BOARD_START_MS,
  CONNECT_MS,
  DESKTOP_SCREEN_STORAGE_NAME,
  PAIR_QUERY_NAME,
  POLL_MS,
  PYTHON_READY_MS,
  SAMPLE_MS,
  UNIT4_SCREEN,
  UNIT4_SCREEN_VALUE,
} from './config.ts';
export {
  DEFAULT_BOARD_FILE,
  DEFAULT_PC_FILE,
  PAIRS,
  UNIT4_BOARD_DIR,
  UNIT4_BOARD_GLOB,
  UNIT4_EXTRA_BOARD_FILES,
  UNIT4_EXTRA_PC_FILES,
  UNIT4_PC_DIR,
  UNIT4_PC_GLOB,
  boardExampleId,
  defaultBoardExampleId,
  defaultPcExampleId,
  isUnit4BoardFile,
  isUnit4PcFile,
  pairViews,
  pcExampleId,
  type Unit4Pair,
  type Unit4PairView,
} from './examples.ts';
export {
  FrameMeter,
  LongTaskMeter,
  TARGET_INPUT_FPS,
  TARGET_SEND_PER_SEC,
  ratePerSec,
  readCount,
  readFps,
  readHeapMb,
  reportMarkdown,
  summarize,
  summaryText,
  type PerfRange,
  type PerfSample,
  type PerfSummary,
  type ReportMeta,
} from './perf.ts';
export { MAX_SAMPLES, UNIT4_TEXT, bleConnected, bleHost, mountUnit4Page, type Unit4Page, type Unit4Phase } from './unit4-page.ts';
