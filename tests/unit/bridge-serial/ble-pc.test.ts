// 컴퓨터 쪽 bluetooth 흉내(src/lab/modules/ble-pc/index.ts)의 순수 함수 — 판 1.1.0(PROGRESS 미해결 137).
// 두 탭이 실제로 이어지는 흐름은 브라우저 검사 tests/e2e/ble-pc-tab.spec.ts가 본다(진짜 BroadcastChannel·가상 보드).
import { describe, expect, it } from 'vitest';
import { REAL_BOARD_LABEL, TAB_BOARD_LABEL, addressNotice, chooseTarget, noPeerNotice, payloadBytes } from '../../../src/lab/modules/ble-pc/index.ts';

describe('보낼 곳 고르기(chooseTarget) — 같은 문서의 가상 보드 → 실제 보드 → 다른 탭의 ESP32 실습실', () => {
  it('같은 문서에 가상 보드가 있으면 늘 그 보드(4단원 통합 화면)', () => {
    expect(chooseTarget({ present: true, real: true, tab: true })).toBe('virtual');
  });

  it('없으면 이어진 실제 보드, 그것도 없으면 선 건너편에서 돌고 있는 가상 보드', () => {
    expect(chooseTarget({ present: false, real: true, tab: true })).toBe('real');
    expect(chooseTarget({ present: false, real: false, tab: true })).toBe('tab');
  });

  it('아무 데도 없으면 같은 문서 통로(아무 데도 닿지 않음 — 원본처럼 연결 전에는 보내지 않는다)', () => {
    expect(chooseTarget({ present: false, real: false, tab: false })).toBe('virtual');
  });
});

describe('안내 글', () => {
  it('보드가 없는 화면의 안내는 [보내기] 패널로 다른 탭을 여는 길·실제 보드·4단원 통합 실습실을 함께 알린다', () => {
    const text = noPeerNotice(false);
    expect(text).toContain('[ESP32 실습실 새 탭에서 열기]');
    expect(text).toContain('[블루투스 보드 연결]');
    expect(text).toContain('4단원 통합 실습실');
    // 같은 화면에 보드 칸이 있으면 그 칸의 [연결]을 가리킨다
    expect(noPeerNotice(true)).toContain('[연결]');
  });

  it('기기 주소는 쓰지 않는다고 알리고(빈 주소는 조용히), 이어진 곳의 이름은 개인정보가 아닌 자리 이름이다', () => {
    expect(addressNotice('XX:XX:XX:XX:XX:XX')).toContain('기기 주소(XX:XX:XX:XX:XX:XX)로 연결하지 않아요');
    expect(addressNotice('  ')).toBeNull();
    expect(TAB_BOARD_LABEL).toBe('ESP32 실습실의 가상 보드');
    expect(REAL_BOARD_LABEL).toContain('실제 ESP32');
  });

  it('파이썬이 보낸 글·바이트를 그대로 받는다', () => {
    expect(payloadBytes({ text: 'DATA,1,2,0,0' })).toEqual({ bytes: null, text: 'DATA,1,2,0,0' });
    expect(payloadBytes({ bytes: [65, 300, 'x'] }).bytes).toEqual(Uint8Array.from([65, 44, 0]));
    expect(payloadBytes(null)).toEqual({ bytes: null, text: null });
  });
});
