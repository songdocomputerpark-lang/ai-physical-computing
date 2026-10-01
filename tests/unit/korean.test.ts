import { describe, expect, it } from 'vitest';
import { particle, withParticle } from '../../src/lib/korean.ts';

describe('한국어 조사 도우미(src/lib/korean.ts)', () => {
  it('받침이 있으면 은·이·을·과, 없으면 는·가·를·와를 붙인다', () => {
    expect(withParticle('픽셀', '은/는')).toBe('픽셀은');
    expect(withParticle('센서', '은/는')).toBe('센서는');
    expect(withParticle('보드', '이/가')).toBe('보드가');
    expect(withParticle('모터', '을/를')).toBe('모터를');
    expect(withParticle('카메라', '과/와')).toBe('카메라와');
    expect(withParticle('영상처리 실습실', '은/는')).toBe('영상처리 실습실은');
  });

  it('으로/로는 ㄹ 받침이나 받침 없는 말 뒤에서 "로"를 붙인다', () => {
    expect(withParticle('파일', '으로/로')).toBe('파일로');
    expect(withParticle('보드', '으로/로')).toBe('보드로');
    expect(withParticle('블록', '으로/로')).toBe('블록으로');
  });

  it('숫자는 읽는 소리로, 끝의 괄호·문장 부호는 건너뛰고 판단한다', () => {
    expect(withParticle('ESP32', '이/가')).toBe('ESP32가');
    expect(withParticle('Phase 1', '은/는')).toBe('Phase 1은');
    expect(withParticle('출처 페이지(자동)', '을/를')).toBe('출처 페이지(자동)을');
  });

  it('영어 글자로 끝나거나 비어 있어 판단할 수 없으면 둘 다 적는다', () => {
    expect(particle('Wi-Fi', '은/는')).toBe('은(는)');
    expect(particle('', '이/가')).toBe('이(가)');
  });

  it('덧붙인 괄호 안이 영어로 끝나 소리를 모르면 괄호 앞 말로 고른다(2026-09-30 최종 점검 E5 — "블루투스(BLE)을(를)")', () => {
    expect(withParticle('블루투스(BLE)', '을/를')).toBe('블루투스(BLE)를');
    expect(withParticle('공개 중계 서버(MQTT)', '이/가')).toBe('공개 중계 서버(MQTT)가');
    expect(withParticle('USB-UART 변환기(CH340 칩 USB)', '은/는')).toBe('USB-UART 변환기(CH340 칩 USB)는');
    expect(withParticle('블루투스 (BLE)', '으로/로')).toBe('블루투스 (BLE)로');
  });

  it('괄호 안이 한글·숫자로 끝나 소리를 알면 지금처럼 그 소리로 고르고, 괄호 앞도 모르면 둘 다 적는다', () => {
    // 괄호 앞("LCD")으로 가면 오히려 "을(를)"이 되므로 괄호 안 끝소리(2 → "이")를 그대로 쓴다
    expect(withParticle('문자 LCD(16×2)', '을/를')).toBe('문자 LCD(16×2)를');
    expect(withParticle('Wi-Fi(무선)', '을/를')).toBe('Wi-Fi(무선)을');
    expect(withParticle('출처 페이지(자동)', '을/를')).toBe('출처 페이지(자동)을');
    expect(withParticle('레이저 모듈(KY-008)', '과/와')).toBe('레이저 모듈(KY-008)과');
    // 괄호 앞도 영어면 판단할 수 없다
    expect(particle('Wi-Fi(WLAN)', '은/는')).toBe('은(는)');
    expect(particle('print()', '을/를')).toBe('을(를)');
    // 괄호만 있거나 닫히지 않은 괄호는 괄호 앞으로 가지 않는다
    expect(particle('(nothing)', '은/는')).toBe('은(는)');
    expect(particle('센서(ABC', '을/를')).toBe('을(를)');
    // 괄호가 중간에서 닫히면(뒤에 글이 더 있으면) 마지막 글자로만 본다
    expect(particle('센서(IR) module', '을/를')).toBe('을(를)');
  });
});
