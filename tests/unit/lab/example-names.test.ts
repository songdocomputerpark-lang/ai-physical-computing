// 예제 선택 상자의 이름을 학생 말로 다듬는 함수(판 1.3.0 검수 R1-100).
import { describe, expect, it } from 'vitest';
import { exampleVersionNote, studentExampleTitle } from '../../../src/lab/controls/example-names.ts';

describe('studentExampleTitle', () => {
  it('"(사이트판)"은 "(바로 실행 버전)", "원본 파일"은 "교과서 그대로"로 바꾼다', () => {
    expect(studentExampleTitle('1-1-2 기본 실습(사이트판)')).toBe('1-1-2 기본 실습(바로 실행 버전)');
    expect(studentExampleTitle('1-1-2 기본 실습(원본 파일)')).toBe('1-1-2 기본 실습(교과서 그대로)');
    expect(studentExampleTitle('3-1-2 기본 — UART로 받은 a·b로 레이저 켜고 끄기(사이트판 — sleep·핀 고침)')).toBe(
      '3-1-2 기본 실습 — UART로 받은 a·b로 레이저 켜고 끄기(바로 실행 버전 — sleep·핀 고침)',
    );
    expect(studentExampleTitle('3-1-2 기본 — 원본 파일(f082, a를 받으면 12번 줄에서 NameError)')).toBe(
      '3-1-2 기본 실습 — 교과서 그대로(f082, a를 받으면 12번 줄에서 NameError)',
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

describe('studentExampleTitle: 기본·심화 이름 통일과 바로 실행 버전(R3-014)', () => {
  it('"(이 사이트용)"·"사이트판"은 둘 다 "바로 실행 버전"으로 쓴다', () => {
    expect(studentExampleTitle('1-1-2 기본 실습(이 사이트용): 손 관절 점 그리기')).toBe('1-1-2 기본 실습(바로 실행 버전): 손 관절 점 그리기');
    expect(studentExampleTitle('2-1-4 기본 2: 레이저 작동 알림 시스템(레이저와 RGB LED 번갈아 켜기, 이 사이트용)')).toBe(
      '2-1-4 기본 실습 2: 레이저 작동 알림 시스템(레이저와 RGB LED 번갈아 켜기, 바로 실행 버전)',
    );
    expect(studentExampleTitle('드래그로 진짜 별 그리기(이 사이트용)')).not.toContain('이 사이트용');
  });

  it('차시 번호 뒤 "기본"·"심화"는 "기본 실습"·"심화 실습"으로 통일한다', () => {
    expect(studentExampleTitle('1-3-2 기본 과제: 입 둘레 점 6개 찍기')).toBe('1-3-2 기본 실습: 입 둘레 점 6개 찍기');
    expect(studentExampleTitle('4-1-1 심화 과제: 눈과 코에 점 찍기')).toBe('4-1-1 심화 실습: 눈과 코에 점 찍기');
    expect(studentExampleTitle('2-2-1 기본: 버저로 도레미파솔라시도 연주하기')).toBe('2-2-1 기본 실습: 버저로 도레미파솔라시도 연주하기');
    expect(studentExampleTitle('2-1-2 기본 1: 문자 LCD에 0부터 5까지 세기')).toBe('2-1-2 기본 실습 1: 문자 LCD에 0부터 5까지 세기');
    expect(studentExampleTitle('2-1-2 심화 동작 테스트: 터치 센서 값 읽기')).toBe('2-1-2 심화 실습: 동작 테스트 — 터치 센서 값 읽기');
    expect(studentExampleTitle('1-2-1 기본 실습: 웹캠 영상 좌우 반전')).toBe('1-2-1 기본 실습: 웹캠 영상 좌우 반전');
  });

  it('번호가 없거나 기본·심화로 시작하지 않는 이름은 건드리지 않고, 두 번 불러도 같다', () => {
    expect(studentExampleTitle('115200 bps — 교과서 3-1-2 UART 실습')).toBe('115200 bps — 교과서 3-1-2 UART 실습');
    expect(studentExampleTitle('1-1-1 체험: 규칙대로 정렬하기')).toBe('1-1-1 체험: 규칙대로 정렬하기');
    const once = studentExampleTitle('2-1-3 심화 동작 테스트: 4채널 터치 센서 값 읽기(이 사이트용)');
    expect(once).toBe('2-1-3 심화 실습: 동작 테스트 — 4채널 터치 센서 값 읽기(바로 실행 버전)');
    expect(studentExampleTitle(once)).toBe(once);
  });
});

describe('exampleVersionNote', () => {
  it('바로 실행 버전과 교과서 그대로에만 한 줄 설명을 준다', () => {
    expect(exampleVersionNote('1-1-2 기본 실습(이 사이트용): 손 관절')).toContain('바로 실행 버전');
    expect(exampleVersionNote('1-1-2 기본 실습(사이트판)')).toContain('막힘없이');
    expect(exampleVersionNote('3-1-2 기본: 레이저(교과서 그대로)')).toContain('고치지 않은');
    expect(exampleVersionNote('1-1-2 기본 실습: 손 관절')).toBe('');
  });
});
