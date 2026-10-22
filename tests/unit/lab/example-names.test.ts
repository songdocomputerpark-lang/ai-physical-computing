// 예제 선택 상자의 이름을 학생 말로 다듬는 함수(판 1.3.0 검수 R1-100).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import {
  exampleTitleInLab,
  exampleTitleInLesson,
  exampleVersionNote,
  lessonExampleNumbers,
  numberedExampleTitle,
  studentExampleTitle,
  withLessonExampleTitles,
} from '../../../src/lab/controls/example-names.ts';

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

// 예제 번호 한 벌(판 1.6.0 C173·C128 ⑥ 확장 — walk-teacher-new B1·A-10): 교과서 쪽 "예제 2" = 따라 하기 쪽 "예제 2" = 수업 화면 막대 "예제 2".
describe('lessonExampleNumbers', () => {
  const lesson = ['esp32/u2/a.py', 'esp32/u2/b.py', 'esp32/u2/c.py'];

  it('따라 하기 쪽: 차시 frontmatter 차례가 번호다(1부터)', () => {
    expect(lessonExampleNumbers(lesson)).toEqual([1, 2, 3]);
  });

  it('교과서 쪽: 보이는 차례가 달라도 짝 차시의 번호를 쓰고, 차시 목록에 없는 확인 코드는 번호가 없다', () => {
    expect(lessonExampleNumbers(lesson, ['esp32/u2/a.py', 'esp32/u2/check.py', 'esp32/u2/c.py', 'esp32/u2/b.py'])).toEqual([
      1,
      undefined,
      3,
      2,
    ]);
  });

  it('차시 예제가 하나뿐이면 번호를 붙이지 않는다("따라 하기 예제"로만)', () => {
    expect(lessonExampleNumbers(['vision/u1/a.py'])).toEqual([undefined]);
    expect(lessonExampleNumbers(['vision/u1/a.py'], ['vision/u1/a.py', 'vision/u1/b.py'])).toEqual([undefined, undefined]);
    expect(lessonExampleNumbers([], ['vision/u1/a.py'])).toEqual([undefined]);
  });
});

describe('numberedExampleTitle', () => {
  it('번호가 있으면 "예제 n: 이름", 없으면 이름만', () => {
    expect(numberedExampleTitle(2, '기본 실습 1: 0부터 5까지 세기')).toBe('예제 2: 기본 실습 1: 0부터 5까지 세기');
    expect(numberedExampleTitle(undefined, 'LCD 숫자 확인')).toBe('LCD 숫자 확인');
  });
});

// 예제 이름 한 벌(판 1.7.0, PROGRESS 미해결 271 B-44): 차시에 실린 예제의 이름은 차시 frontmatter 제목 — 차시 안 카드 = 실습실 고르기 칸에서 차시 번호를 뗀 것.
describe('studentExampleTitle: 쪽 번호 앞 0과 괄호 가운데 "사이트판"(판 1.7.0)', () => {
  it('쪽 번호의 앞 0을 뗀다(화면 쪽 표기 한 벌 — C181)', () => {
    expect(studentExampleTitle('MediaPipe로 손 관절 점 그리기(교과서 017쪽 코드)')).toBe('MediaPipe로 손 관절 점 그리기(교과서 17쪽 코드)');
    expect(studentExampleTitle('기본 실습(교과서 008~012쪽)')).toBe('기본 실습(교과서 8~12쪽)');
    expect(studentExampleTitle('심화 실습(교과서 137 ~ 139쪽)')).toBe('심화 실습(교과서 137~139쪽)');
    // 쪽이 아닌 숫자는 그대로
    expect(studentExampleTitle('2-1-2 기본 1: 문자 LCD에 0부터 5까지 세기')).toBe('2-1-2 기본 실습 1: 문자 LCD에 0부터 5까지 세기');
    expect(studentExampleTitle('기본 실습 — 얼굴에 점 468개 찍기(파일명 p55)')).toBe('기본 실습 — 얼굴에 점 468개 찍기(파일명 p55)');
  });

  it('"(교과서 137쪽, 사이트판)"처럼 괄호 가운데에 있는 "사이트판"도 바꾼다', () => {
    expect(studentExampleTitle('심화 실습 1단계: 4채널 터치 센서 값 읽기(교과서 137쪽, 사이트판)')).toBe(
      '심화 실습 1단계: 4채널 터치 센서 값 읽기(교과서 137쪽, 바로 실행 버전)',
    );
  });
});

describe('exampleTitleInLesson·exampleTitleInLab: 예제 이름 한 벌(판 1.7.0)', () => {
  it('차시 안 이름은 frontmatter 제목을 다듬은 것이고, 실습실 이름은 그 앞에 차시 번호를 붙인 것이다', () => {
    const lesson = { label: '2-1-2', title: '출력 테스트: LCD에 글자 쓰기(교과서 127쪽)' };
    expect(exampleTitleInLesson(lesson.title, lesson.label)).toBe('출력 테스트: LCD에 글자 쓰기(교과서 127쪽)');
    expect(exampleTitleInLab('2-1-2 출력 테스트: 문자 LCD에 글자 쓰기', lesson)).toBe('2-1-2 출력 테스트: LCD에 글자 쓰기(교과서 127쪽)');
  });

  it('두 이름은 같은 다듬기를 거친다 — "기본"·"기본 과제"는 둘 다 "기본 실습"(실습실 칸이 studentExampleTitle을 한 번 더 걸어도 바뀌지 않는다)', () => {
    const lesson = { label: '4-2-2', title: '기본 — 클릭하면 RGB LED로 알려 주기' };
    const inLesson = exampleTitleInLesson(lesson.title, lesson.label);
    const inLab = exampleTitleInLab('4-2-2 기본: 서보 2개와 RGB LED로 클릭 알려 주기', lesson);
    expect(inLesson).toBe('기본 실습 — 클릭하면 RGB LED로 알려 주기');
    expect(inLab).toBe(`4-2-2 ${inLesson}`);
    expect(studentExampleTitle(inLab)).toBe(inLab);
    expect(exampleTitleInLesson('기본 과제 — 입 둘레 점 6개 찍기(파일명 p65)', '1-3-2')).toBe('기본 실습 — 입 둘레 점 6개 찍기(파일명 p65)');
  });

  it('frontmatter 제목이 없으면 실습실 제목(사이드카·머리말)에서 이 차시 번호를 뗀 것이 차시 안 이름이다', () => {
    expect(exampleTitleInLesson('2-1-2 출력 테스트: 문자 LCD에 숫자 쓰기', '2-1-2')).toBe('출력 테스트: 문자 LCD에 숫자 쓰기');
    expect(exampleTitleInLesson('1-1-1 체험: 규칙대로 정렬하기와 예시에서 배워 묶기를 비교해요.', '1-1-1')).toBe(
      '체험: 규칙대로 정렬하기와 예시에서 배워 묶기를 비교해요.',
    );
    // 다른 차시 번호(2-1-20)나 번호가 없는 이름은 그대로
    expect(exampleTitleInLesson('2-1-20 무엇', '2-1-2')).toBe('2-1-20 무엇');
    expect(exampleTitleInLesson('보충 V1: 사진은 숫자다', 'V1')).toBe('보충 V1: 사진은 숫자다');
    expect(exampleTitleInLesson('V1: 사진은 숫자다', 'V1')).toBe('사진은 숫자다');
    // 차시 번호를 모르면(교과서 쪽 머리말 등) 다듬기만
    expect(exampleTitleInLesson('LCD 숫자 확인(사이트판)')).toBe('LCD 숫자 확인(바로 실행 버전)');
  });

  it('차시에 실리지 않은 예제(사이트 예제·교안·키트 도감)는 실습실 제목 그대로다', () => {
    expect(exampleTitleInLab('첫 실습: 웹캠 영상에서 테두리(에지) 찾기')).toBe('첫 실습: 웹캠 영상에서 테두리(에지) 찾기');
    expect(exampleTitleInLab('2-1-2 출력 테스트: 문자 LCD에 숫자 쓰기', { label: '2-1-2' })).toBe('2-1-2 출력 테스트: 문자 LCD에 숫자 쓰기');
    expect(exampleTitleInLab('키트 3.11 초음파', { label: '2-1-4', title: '  ' })).toBe('키트 3.11 초음파');
  });

  it('withLessonExampleTitles: 실습실 목록에서 차시에 실린 예제만 이름을 바꾸고 나머지는 같은 객체 그대로 돌려준다', () => {
    const examples = [
      { id: 'a', file: 'esp32/u2/2-1-2-lcd-text-check.py', title: '2-1-2 출력 테스트: 문자 LCD에 글자 쓰기' },
      { id: 'b', file: 'esp32/u2/2-1-2-lcd-number-check.py', title: '2-1-2 출력 테스트: 문자 LCD에 숫자 쓰기' },
      { id: 'c', title: '파일 없는 예제' },
    ];
    const named = withLessonExampleTitles(examples, {
      'esp32/u2/2-1-2-lcd-text-check.py': { label: '2-1-2', title: '출력 테스트: LCD에 글자 쓰기(교과서 127쪽)' },
    });
    expect(named.map((example) => example.title)).toEqual([
      '2-1-2 출력 테스트: LCD에 글자 쓰기(교과서 127쪽)',
      '2-1-2 출력 테스트: 문자 LCD에 숫자 쓰기',
      '파일 없는 예제',
    ]);
    expect(named[0]).toMatchObject({ id: 'a', file: 'esp32/u2/2-1-2-lcd-text-check.py' });
    expect(named[1]).toBe(examples[1]);
    expect(named[2]).toBe(examples[2]);
  });
});

/** content/lessons/**.md frontmatter의 examples[].title(있는 것만)과 차시 번호 */
function readLessonExampleTitles(): { label: string; title: string }[] {
  const root = path.resolve('content/lessons');
  const found: { label: string; title: string }[] = [];
  for (const unit of fs.readdirSync(root)) {
    const dir = path.join(root, unit);
    if (!fs.statSync(dir).isDirectory()) {
      continue;
    }
    for (const name of fs.readdirSync(dir).filter((file) => file.endsWith('.md'))) {
      const text = fs.readFileSync(path.join(dir, name), 'utf8');
      const front = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(text)?.[1];
      if (!front) {
        continue;
      }
      const data = parseYaml(front) as { label?: string; draft?: boolean; examples?: { title?: string }[] } | null;
      if (!data || data.draft) {
        continue;
      }
      const label = data.label ?? name.replace(/\.md$/u, '').toUpperCase();
      for (const example of data.examples ?? []) {
        if (typeof example.title === 'string' && example.title.trim() !== '') {
          found.push({ label, title: example.title });
        }
      }
    }
  }
  return found;
}

describe('예제 이름 한 벌 — 실제 차시의 frontmatter 예제 제목(판 1.7.0)', () => {
  const lessons = readLessonExampleTitles();

  it('차시에 실린 예제가 있다(차시 md를 읽었다)', () => {
    expect(lessons.length).toBeGreaterThan(80);
  });

  it('실습실 이름은 "차시 번호 + 카드 이름"이고, 실습실 칸이 다듬기를 한 번 더 걸어도 그대로다', () => {
    for (const { label, title } of lessons) {
      const inLesson = exampleTitleInLesson(title, label);
      const inLab = exampleTitleInLab('사이드카 제목', { label, title });
      expect(inLab, `${label} ${title}`).toBe(`${label} ${inLesson}`);
      expect(studentExampleTitle(inLab), `${label} ${title}`).toBe(inLab);
    }
  });

  it('카드 이름에 만드는 사람 말("사이트판"·"이 사이트용")과 앞 0 쪽 번호가 남지 않는다', () => {
    for (const { label, title } of lessons) {
      expect(exampleTitleInLesson(title, label), `${label} ${title}`).not.toMatch(/사이트판|이 사이트용|(?<!\d)0\d+(?:~\d+)?쪽/u);
    }
  });
});
