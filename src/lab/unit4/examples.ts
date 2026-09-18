/**
 * 4단원 통합 화면이 처음 고르는 예제 짝(PLAN §8.4 P4-09, CODE_MAPPING §6.4 B5).
 * 목록 자체는 두 실습실의 것을 그대로 쓴다(영상처리 examples/vision + examples/desktop, ESP32 examples/esp32) —
 * 통합 화면에서만 보이는 예제 목록을 따로 만들면 "새 .py 하나면 끝"이라는 원칙 6이 깨진다.
 */
import { esp32ExampleIdFromFile } from '../esp32/examples.ts';
import { exampleIdFromFile } from '../vision/examples.ts';

/** 컴퓨터 쪽 기본 예제 — 4-2-1 최종판(f104). 카메라 + 얼굴 그물 + 가상 데스크톱 + 블루투스가 한꺼번에 도는 가장 무거운 예제다. */
export const DEFAULT_PC_FILE = 'vision/u4/4-2-1-face-mouse-ble-tx.py';

/**
 * 보드 쪽 기본 예제 — 4-2-2 심화의 **사이트판**(f110 site). LCD·서보 2·RGB·레이저·버저를 모두 쓰고,
 * 원본에서 주석 처리돼 있던 "레이저 끄기"가 풀려 있어 눈 보호에 안전하다(PD-23, 구역 B가 만든 파일).
 */
export const DEFAULT_BOARD_FILE = 'esp32/u4/4-2-2-adv-ble-servo-rgb-laser-buzzer-site.py';

/** 짝이 맞는 다른 예제(화면 안내에 적는다 — 학생이 목록에서 골라 바꿔 볼 수 있게) */
export const PAIRS: readonly { readonly label: string; readonly pc: string; readonly board: string }[] = Object.freeze([
  { label: '4-2-1 기본 — 좌표를 LCD에 적기', pc: 'vision/u4/4-2-1-face-mouse-ble-tx.py', board: 'esp32/u4/4-2-1-adv-ble-data-lcd.py' },
  { label: '4-2-1 심화 — 좌표로 서보 두 개 돌리기', pc: 'vision/u4/4-2-1-face-mouse-ble-tx.py', board: 'esp32/u4/4-2-1-adv-ble-servo-lcd.py' },
  { label: '4-2-2 기본 — 서보와 RGB LED', pc: 'vision/u4/4-2-1-face-mouse-ble-tx.py', board: 'esp32/u4/4-2-2-ble-servo-rgb.py' },
  { label: '4-2-2 심화 — 서보·RGB·레이저·버저(사이트판)', pc: DEFAULT_PC_FILE, board: DEFAULT_BOARD_FILE },
  { label: '4-2-3 최종 — bluetooth_lib 이름으로 부르기(사이트판)', pc: 'vision/u4/4-2-3-face-mouse-ble-tx-lib.py', board: 'esp32/u4/4-2-3-ble-servo-rgb-laser-buzzer-site.py' },
]);

/** 컴퓨터 쪽 기본 예제 id(LabShell initialExampleId) */
export function defaultPcExampleId(): string {
  return exampleIdFromFile(DEFAULT_PC_FILE);
}

/** 보드 쪽 기본 예제 id(LabShell initialExampleId) */
export function defaultBoardExampleId(): string {
  return esp32ExampleIdFromFile(DEFAULT_BOARD_FILE);
}
