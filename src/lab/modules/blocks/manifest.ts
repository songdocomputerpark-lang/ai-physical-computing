/**
 * 블록 모드(Blockly) 모듈의 manifest(PLAN §8.3 P3-06, src/lab/README.md 4.2·5.1 구역 D) — 순수 데이터(워커 번들에도 들어간다).
 *
 * 이 폴더는 ESP32 실습실에 블록 모드를 붙이는 얇은 자리다(등록 파일 수정 없이 자동 발견):
 *   panel.astro   화면 조각 — src/components/lab/blocks/BlocksPanel.astro를 그린다(LabShell이 hidden으로 그려 두고 index.ts가 편집칸 자리로 옮긴다)
 *   index.ts      화면 쪽 — src/lab/blocks/mode-ui.ts의 mountBlocksMode(ctx)를 부른다
 *   apc_blocks.py 파이썬 쪽 — 블록 전용 호환 모드(PD-27) 실행판이 부르는 비동기 기다리기(ESP32 실습실 워커의 /apc에만 들어간다)
 * 블록 정의·코드 생성·화면 논리는 src/lab/blocks/, 화면 HTML·CSS는 src/components/lab/blocks/.
 *
 * 요청·이벤트·채널 이름은 쓰지 않는다: 블록 모드는 파이썬과 직접 말하지 않고, 만든 코드를 실습실 편집칸에 넣어 보통 [실행]으로 돌린다.
 * 가상 보드 배선은 뿌리 요소의 DOM 이벤트(apc:board-wiring — src/lab/blocks/board-link.ts)로 알린다.
 */
import type { LabModuleManifest } from '../types.ts';

const manifest: LabModuleManifest = {
  id: 'blocks',
  title: '블록 모드(Blockly)',
  labs: ['esp32'],
  shims: {},
  packages: [],
  requestKinds: [],
  eventKinds: [],
  channels: [],
  placement: 'panel',
};

export default manifest;
