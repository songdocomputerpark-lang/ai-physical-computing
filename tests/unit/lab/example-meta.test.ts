// 예제 파일 머리말 메타데이터·안내 상자 읽기(src/lab/controls/example-meta.ts) 단위 테스트(PLAN §8.2 P2-04, src/lab/README.md 규약).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRACTICE_SECTION_TITLE, TRY_SECTION_TITLE, WHY_SECTION_TITLE, hasGuideBoxes, readExampleMeta } from '../../../src/lab/controls/example-meta.ts';
import { parseParams } from '../../../src/lab/params/parse.ts';

const ROOT = process.cwd();

describe('예제 머리말 메타데이터', () => {
  it('첫 주석 줄이 제목, 둘째가 설명, @lesson·@tags는 따로 읽고 규약 줄은 제목·설명이 아니다', () => {
    const meta = readExampleMeta(['# 첫 실습: 테두리 찾기', '# @lesson v4', '# 영상을 회색으로 바꿔요.', '# @tags 에지, 회색 , Canny, 에지', '# 셋째 줄은 버려요.', 'import cv2', ''].join('\n'));
    expect(meta).toEqual({
      title: '첫 실습: 테두리 찾기',
      description: '영상을 회색으로 바꿔요.',
      lesson: 'v4',
      tags: ['에지', '회색', 'Canny'],
      parts: [],
      tryIdeas: [],
      why: [],
      practice: [],
    });
  });

  it('머리말이 없으면(원본에서 옮긴 예제) 모두 비어 있고, 첫 코드 줄 뒤의 주석은 머리말이 아니다', () => {
    expect(readExampleMeta('import cv2\n# 나중 주석\n# @lesson v4\n')).toEqual({ title: null, description: null, lesson: null, tags: [], parts: [], tryIdeas: [], why: [], practice: [] });
    expect(readExampleMeta('')).toMatchObject({ title: null, description: null });
  });

  it('@lesson 값이 slug 모양(영문 소문자·숫자·하이픈)이 아니면 null', () => {
    expect(readExampleMeta('# 제목\n# @lesson V4\n').lesson).toBeNull();
    expect(readExampleMeta('# 제목\n# @lesson 1-2-1\n').lesson).toBe('1-2-1');
    expect(readExampleMeta('# 제목\n# @lesson\n').lesson).toBeNull();
  });

  it('ESP32 예제의 # @part 줄마다 배선 한 줄을 읽고(모양 검사 전), 읽지 못한 줄은 뺀다 — 제목·설명으로도 쓰지 않는다', () => {
    const meta = readExampleMeta(['# 진동 알림', '# @part touch-digital 17', '# @part vibration-motor 19', '# @part rgb-led r=27 g=32 b=33 as rgb', '# @part 17 틀림 틀림', '# 설명', 'from machine import Pin', '# @part laser 18'].join('\n'));
    expect(meta.title).toBe('진동 알림');
    expect(meta.description).toBe('설명');
    expect(meta.parts).toEqual([
      { part: 'touch-digital', pin: '17' },
      { part: 'vibration-motor', pin: '19' },
      { part: 'rgb-led', pins: { r: '27', g: '32', b: '33' }, id: 'rgb' },
    ]);
  });

  it('CRLF 줄 끝과 앞쪽 빈 줄이 있어도 같다', () => {
    expect(readExampleMeta('\r\n# 제목\r\n# 설명\r\nx = 1\r\n')).toMatchObject({ title: '제목', description: '설명' });
  });
});

describe('안내 상자(바꿔볼 것 3가지·왜 이런 결과가 나올까)', () => {
  it('제목 줄로 시작하는 주석 묶음을 읽고 번호를 뗀다. 장식(─)이 없어도 되고 코드 줄에서 끝난다', () => {
    const meta = readExampleMeta(
      [
        '# 제목',
        'x = 1',
        '',
        `# ── ${TRY_SECTION_TITLE} ──`,
        '# 1. 첫째를 바꿔요.',
        '# 2) 둘째를 바꿔요.',
        '#',
        '# 3. 셋째를 바꿔요.',
        `# ${WHY_SECTION_TITLE}`,
        '# 첫 문장.',
        '# 둘째 문장.',
        'y = 2',
        '# 상자 밖 주석',
        '',
      ].join('\n'),
    );
    expect(meta.tryIdeas).toEqual(['첫째를 바꿔요.', '둘째를 바꿔요.', '셋째를 바꿔요.']);
    expect(meta.why).toEqual(['첫 문장.', '둘째 문장.']);
    expect(hasGuideBoxes(meta)).toBe(true);
    expect(hasGuideBoxes(readExampleMeta('# 제목\n'))).toBe(false);
  });

  it('"실습 방법" 상자(P3-02)는 단계마다 한 줄, 번호를 떼고 다음 상자 제목에서 끝난다', () => {
    const meta = readExampleMeta(
      ['# 제목', 'x = 1', `# ── ${PRACTICE_SECTION_TITLE} ──`, '# 1. [실행]을 눌러요.', '# 2) 터치 센서를 누르고 있어요.', `# ── ${TRY_SECTION_TITLE} ──`, '# 1. 바꿔요.', ''].join('\n'),
    );
    expect(meta.practice).toEqual(['[실행]을 눌러요.', '터치 센서를 누르고 있어요.']);
    expect(meta.tryIdeas).toEqual(['바꿔요.']);
  });

  it('상자가 머리말 바로 뒤에 오면 머리말은 그 앞에서 끝난다', () => {
    const meta = readExampleMeta(['# 제목', `# ── ${WHY_SECTION_TITLE} ──`, '# 까닭.', 'x = 1', ''].join('\n'));
    expect(meta.title).toBe('제목');
    expect(meta.description).toBeNull();
    expect(meta.why).toEqual(['까닭.']);
  });
});

describe('저장소의 자체 제작 영상처리 예제', () => {
  const read = (file: string) => fs.readFileSync(path.join(ROOT, 'examples', 'vision', file), 'utf8');

  it('첫 실습(first-edge.py)은 제목·설명·태그·상자 두 개·슬라이더 두 개를 갖춘다', () => {
    const source = read('first-edge.py');
    const meta = readExampleMeta(source);
    expect(meta.title).toContain('테두리(에지)');
    expect(meta.description).toBeTruthy();
    expect(meta.tags).toContain('Canny');
    expect(meta.tryIdeas).toHaveLength(3);
    expect(meta.why.length).toBeGreaterThanOrEqual(2);
    expect(hasGuideBoxes(meta)).toBe(true);
    const { params, warnings } = parseParams(source);
    expect(warnings).toEqual([]);
    expect(params.map((param) => param.name)).toEqual(['threshold', 'blur_size']);
    // 안내 상자의 문장은 실제 조절 값 이름을 가리킨다.
    expect(meta.tryIdeas.join(' ')).toContain('threshold');
    expect(meta.tryIdeas.join(' ')).toContain('blur_size');
  });

  it('보충 V4 예제는 @lesson v4로 차시에 붙고 상자 두 개와 슬라이더 세 개가 있다', () => {
    const source = read('supplement/v4-blur-edge.py');
    const meta = readExampleMeta(source);
    expect(meta.lesson).toBe('v4');
    expect(hasGuideBoxes(meta)).toBe(true);
    expect(parseParams(source).params.map((param) => param.name)).toEqual(['blur_size', 'low', 'high']);
    expect(readExampleMeta(read('u1/1-1-1-sort-vs-group.py')).lesson).toBe('1-1-1');
  });
});
