/**
 * 보드 콘솔 input() 모듈의 manifest(PLAN §6.2 "보드 콘솔 입력", §8.3 P3-05) — 순수 데이터(src/lab/README.md 4.2). 워커 번들에도 들어간다.
 *
 * 파이썬 쪽: 같은 폴더의 apc_board_console.py(가상 보드가 첫 실행 직전에 불러와 ESP32 실습실 워커의 builtins.input을 바꾼다).
 * 이름(모두 "board-console."으로 시작)
 * - 이벤트(파이썬 → 화면) board-console.prompt {id, prompt}: input()이 한 줄을 기다리기 시작함 — 화면이 실습실 입력줄을 연다.
 * - 채널(화면 → 파이썬) board-console.line {id, value: 글자} 또는 {id, cancelled: true}: 입력줄에 적은 한 줄(쌓이는 값), cancelled = 입력줄이 닫힘.
 * - 채널(화면 → 파이썬) board-console.ready true: 화면이 입력줄을 열 수 있다(실습실 틀의 lab.prompt — 없으면 러너 공통 input()을 그대로 쓴다).
 */
import type { LabModuleManifest } from '../types.ts';

const manifest: LabModuleManifest = {
  id: 'board-console',
  title: '보드 콘솔 입력(input — 기다리는 동안에도 가상 보드가 돈다)',
  labs: ['esp32'],
  eventKinds: ['board-console.prompt'],
  channels: ['board-console.line', 'board-console.ready'],
};

export default manifest;
