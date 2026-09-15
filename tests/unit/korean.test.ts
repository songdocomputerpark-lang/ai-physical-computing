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
});
