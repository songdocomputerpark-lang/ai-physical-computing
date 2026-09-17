/**
 * 실제 ESP32 보드 연결 모듈의 manifest(PLAN §8.3 P3-07 실제 보드 ① — 순수 데이터, src/lab/README.md 4.2).
 * 워커 번들에도 들어가므로 DOM·다른 모듈을 import하지 않는다.
 *
 * 파이썬 쪽 파일이 없다: 실제 보드는 이 페이지의 파이썬(Pyodide)이 아니라 USB로 연결한 보드의 MicroPython이 코드를 돌린다.
 * 그래서 요청·이벤트·채널 이름도 없다 — 실습실과는 lab.setRunTarget(실행 대상, src/lab/serial/board-run-target.ts)으로만 잇는다.
 * 화면: panel.astro(탭 + 실제 보드 칸)를 index.ts가 입력·출력 칸의 가상 보드 위로 옮겨 [가상 보드]/[실제 보드] 탭으로 쓴다.
 */
import type { LabModuleManifest } from '../types.ts';

const manifest: LabModuleManifest = {
  id: 'real-board',
  title: '코드를 실행할 보드(가상 보드·실제 보드)',
  labs: ['esp32'],
  shims: {},
  packages: [],
  requestKinds: [],
  eventKinds: [],
  channels: [],
  placement: 'panel',
};

export default manifest;
