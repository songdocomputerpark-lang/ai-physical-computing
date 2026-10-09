// 예제 선택 상자의 이름을 학생 말로 다듬는 함수(판 1.3.0 검수 R1-100).
import { describe, expect, it } from 'vitest';
import { studentExampleTitle } from '../../../src/lab/controls/example-names.ts';

describe('studentExampleTitle', () => {
  it('"(사이트판)"은 "(이 사이트용)", "원본 파일"은 "교과서 그대로"로 바꾼다', () => {
    expect(studentExampleTitle('1-1-2 기본 실습(사이트판)')).toBe('1-1-2 기본 실습(이 사이트용)');
    expect(studentExampleTitle('1-1-2 기본 실습(원본 파일)')).toBe('1-1-2 기본 실습(교과서 그대로)');
    expect(studentExampleTitle('3-1-2 기본 — UART로 받은 a·b로 레이저 켜고 끄기(사이트판 — sleep·핀 고침)')).toBe(
      '3-1-2 기본 — UART로 받은 a·b로 레이저 켜고 끄기(이 사이트용 — sleep·핀 고침)',
    );
    expect(studentExampleTitle('3-1-2 기본 — 원본 파일(f082, a를 받으면 12번 줄에서 NameError)')).toBe(
      '3-1-2 기본 — 교과서 그대로(f082, a를 받으면 12번 줄에서 NameError)',
    );
  });

  it('"계단"은 "단계"로 바꾼다(묶음 이름 포함)', () => {
    expect(studentExampleTitle('보충 계단 V1~V5(사진은 숫자다 → 윤곽선)')).toBe('보충 단계 V1~V5(사진은 숫자다 → 윤곽선)');
    expect(studentExampleTitle('OpenCV·MediaPipe 계단(교안)')).toBe('OpenCV·MediaPipe 단계(교안)');
    expect(studentExampleTitle('계단 5 손 인식')).toBe('단계 5 손 인식');
  });

  it('바꿀 것이 없으면 같은 글이다', () => {
    expect(studentExampleTitle('첫 실습: 웹캠 영상에서 테두리(에지) 찾기')).toBe('첫 실습: 웹캠 영상에서 테두리(에지) 찾기');
    expect(studentExampleTitle('')).toBe('');
  });
});
