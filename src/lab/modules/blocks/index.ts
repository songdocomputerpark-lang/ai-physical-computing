/**
 * 블록 모드 모듈의 화면 쪽(PLAN §8.3 P3-06, src/lab/README.md 4.3) — ESP32 실습실에 붙는다(manifest labs ['esp32']).
 *
 * 실제 일은 src/lab/blocks/mode-ui.ts(블록 ↔ 코드 전환·Blockly 작업판·코드 실시간 만들기·블록 전용 호환 모드)가 한다.
 * Blockly(약 0.8MB)는 학생이 [블록]을 누를 때(또는 ?blocks=1·지난번에 블록 모드였을 때) 처음 받는다 — 이 파일에서는 import하지 않는다.
 * panel.astro의 조각(전환 단추·작업판)을 편집칸 자리로 옮기므로 모듈 패널([data-lab-module-panel="blocks"])은 비어 있는 채로 숨어 있다.
 */
import { mountBlocksMode } from '../../blocks/mode-ui.ts';
import type { LabModule } from '../types.ts';
import manifest from './manifest.ts';

const module: LabModule = {
  manifest,
  mount(context) {
    return mountBlocksMode(context);
  },
};

export default module;
