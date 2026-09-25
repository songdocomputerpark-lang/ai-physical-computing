// 교사용 자료실(PLAN §8.5 P5-14)의 순수 함수 — 차시 교사용 접기 꺼내기(teacher-guides.ts), 데이터 파일 검사(teacher-data-schema.ts),
// 뱃지·주소 도우미(teacher-lessons.ts). 브라우저를 쓰지 않는 검사다 — 구역 G가 tests/e2e/teacher-guides.spec.ts로 만든 것을
// Phase 5 통합(2026-09-25)에서 Vitest로 옮겼다(npm test에 들어간다).
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatInline, parseAssessment, parseCorrections, unmappedReasonFor } from '../../../src/components/teacher/teacher-data-schema.ts';
import {
  extractTeacherGuide,
  genAiTasks,
  guideIdPrefix,
  headingIdBefore,
  isChangeSection,
  resolveRelativeUrls,
  teacherBoxBodies,
} from '../../../src/components/teacher/teacher-guides.ts';
import { sourceBadge, standardAnchor } from '../../../src/components/teacher/teacher-lessons.ts';
import { allPlannedLessons } from '../../../src/components/lesson/curriculum.ts';
import { STANDARDS, UNMAPPED_REASONS } from '../../../src/config/standards.ts';
import { withBase } from '../../../src/lib/url.ts';

/** remark-boxes.mjs가 만드는 모양을 따른 차시 본문(entry.rendered.html) 조각 */
const LESSON_HTML = [
  '<h2 id="핵심-개념">핵심 개념</h2>',
  '<p>본문</p>',
  '<h2 id="도전-과제">도전 과제</h2>',
  '<div class="box box--challenge" data-box="challenge" role="note"><p class="box__title">도전</p><p>표를 채워요.</p></div>',
  '<h3 id="더-해-보기">더 해 보기</h3>',
  '<div class="box box--genai" data-box="genai" role="note"><p class="box__title">생성형 AI와 함께 만들기</p><p>규칙을 물어봐요.</p><p class="box__note">생성형 AI의 도움을 받은 부분을 표시해요.</p></div>',
  '<h2 id="교사용">교사용</h2>',
  '<details class="box box--teacher" data-box="teacher" data-pagefind-ignore><summary class="box__title">교사용 안내</summary>',
  '<p>들머리 글</p>',
  '<h3 id="지도안-요약50분">지도안 요약(50분)</h3>',
  '<ol><li>도입: <a href="#도전-과제">도전 과제</a>를 보여 줘요.</li><li>정리: <a href="#평가-포인트">평가 포인트</a>로 돌아봐요.</li></ol>',
  '<p><a href="main.py">잘못 이어진 링크</a>, <a href="../1-1-2/">다음 차시</a>, <a href="/learn/u1/1-1-3/">뿌리 주소</a>, <a href="https://example.org/a">사이트 밖</a></p>',
  '<h3 id="평가-포인트">평가 포인트</h3>',
  '<p><label for="q1">자기 평가</label><input id="q1" aria-describedby="q1-help"><span id="q1-help">도움말</span></p>',
  '<h3 id="원고에서-바꾼-곳">원고에서 바꾼 곳</h3>',
  '<ul><li>017쪽 <code>img_rgb</code></li></ul>',
  '</details>',
].join('\n');

const OPTIONS = { idPrefix: guideIdPrefix(1, '1-1-1'), lessonHref: withBase('/learn/u1/1-1-1/') };

describe('차시 교사용 접기 꺼내기(teacher-guides.ts)', () => {
  it('교사용 칸의 상자 안만 꺼내고, ### 제목마다 나눈다', () => {
    const bodies = teacherBoxBodies(LESSON_HTML);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).not.toContain('<summary');
    expect(bodies[0]).not.toContain('핵심 개념');

    const guide = extractTeacherGuide(LESSON_HTML, OPTIONS);
    expect(guide).toBeDefined();
    expect(guide?.intro).toContain('들머리 글');
    expect(guide?.sections.map((section) => section.title)).toEqual(['지도안 요약(50분)', '평가 포인트', '원고에서 바꾼 곳']);
    expect(guide?.sections.map((section) => section.sourceId)).toEqual(['지도안-요약50분', '평가-포인트', '원고에서-바꾼-곳']);
    expect(guide?.sections[1]?.id).toBe(`${OPTIONS.idPrefix}평가-포인트`);
  });

  it('id에 차시 앞머리를 붙이고, #링크는 꺼낸 글 안이면 새 id로·밖이면 차시 주소로 보낸다', () => {
    const html = extractTeacherGuide(LESSON_HTML, OPTIONS)?.html ?? '';
    expect(html).toContain(`id="${OPTIONS.idPrefix}지도안-요약50분"`);
    expect(html).toContain(`href="#${OPTIONS.idPrefix}평가-포인트"`);
    expect(html).toContain(`href="${OPTIONS.lessonHref}#도전-과제"`);
    // for·aria-describedby도 같은 새 id로
    expect(html).toContain(`for="${OPTIONS.idPrefix}q1"`);
    expect(html).toContain(`aria-describedby="${OPTIONS.idPrefix}q1-help"`);
    expect(html).not.toMatch(/\sid="(?!guide-u1-1-1-1-)/u);
  });

  it('상대 주소는 차시 주소 기준으로, 뿌리 주소에는 base를 붙이고, 사이트 밖 주소는 그대로 둔다', () => {
    const html = extractTeacherGuide(LESSON_HTML, OPTIONS)?.html ?? '';
    expect(html).toContain(`href="${OPTIONS.lessonHref}main.py"`);
    expect(html).toContain(`href="${withBase('/learn/u1/1-1-2/')}"`);
    expect(html).toContain(`href="${withBase('/learn/u1/1-1-3/')}"`);
    expect(html).toContain('href="https://example.org/a"');
    expect(resolveRelativeUrls('<img src="a.png"><a href="#x">x</a><a href="https://example.org/x">m</a>', '/base/learn/u1/1-1-1/')).toBe(
      '<img src="/base/learn/u1/1-1-1/a.png"><a href="#x">x</a><a href="https://example.org/x">m</a>',
    );
  });

  it('교사용 칸이나 상자가 없으면 꺼내지 않는다', () => {
    expect(extractTeacherGuide('<h2 id="핵심-개념">핵심 개념</h2><p>본문</p>', OPTIONS)).toBeUndefined();
    expect(extractTeacherGuide('<h2 id="교사용">교사용</h2><p>상자 없이 쓴 글</p>', OPTIONS)).toBeUndefined();
    expect(teacherBoxBodies('<p>제목 없음</p>')).toEqual([]);
  });

  it('모음 페이지 id 앞머리는 대단원 번호와 주소 끝 이름으로 만든다', () => {
    expect(guideIdPrefix(1, '1-1-1')).toBe('guide-u1-1-1-1-');
    expect(guideIdPrefix(2, 'review')).toBe('guide-u2-review-');
    expect(guideIdPrefix(3, 'review')).not.toBe(guideIdPrefix(2, 'review'));
    expect(guideIdPrefix(4, 'Project_A')).toBe('guide-u4-project-a-');
  });

  it('원고와 달라진 곳·쓴 근거를 적은 부분을 제목으로 알아본다(2026-09-25 모든 차시의 제목)', () => {
    for (const title of ['원고에서 바꾼 곳', '수업 슬라이드에서 바꾼 곳', '본문을 쓴 근거와 바꾼 곳', '원고와 코드 파일', '원고와 코드 파일, 사이트판', '코드 파일과 사이트판', '선택 차시 운영과 코드 파일', '이 안내를 쓴 근거']) {
      expect(isChangeSection(title), title).toBe(true);
    }
    for (const title of ['지도안 요약(50분, 사이트가 제안하는 흐름)', '평가 포인트', '자주 막히는 곳', '보충 차시를 둔 까닭', '함께 쓰는 교안 예제', '정답 한눈에 보기', '이 차시의 예제 파일 한눈에']) {
      expect(isChangeSection(title), title).toBe(false);
    }
  });

  it('생성형 AI 상자는 제목·글과 바로 앞 제목의 id를 돌려준다', () => {
    expect(genAiTasks(LESSON_HTML)).toEqual([{ title: '생성형 AI와 함께 만들기', text: '규칙을 물어봐요.', anchor: '더-해-보기' }]);
    const noHeading = '<div class="box box--genai" data-box="genai"><p class="box__title">생성형 AI 활용 탐구</p><p>글</p></div>';
    expect(genAiTasks(noHeading)).toEqual([{ title: '생성형 AI 활용 탐구', text: '글', anchor: undefined }]);
    expect(headingIdBefore('<h2 id="a">A</h2><h3 id="b">B</h3><p>x</p><h2 id="c">C</h2>', 40)).toBe('b');
    expect(headingIdBefore('<p>x</p>', 5)).toBeUndefined();
  });
});

describe('교사용 자료실 데이터 파일(teacher-data-schema.ts)', () => {
  it('content/teacher/assessment.yaml: 성취기준 15개마다 볼 것과 모을 자료가 있다', () => {
    const assessment = parseAssessment(fs.readFileSync('content/teacher/assessment.yaml', 'utf8'));
    for (const standard of STANDARDS) {
      expect(assessment.standards[standard.code]?.look, standard.code).toBeTruthy();
      expect(assessment.standards[standard.code]?.evidence, standard.code).toBeTruthy();
    }
    expect(Object.keys(assessment.standards).sort()).toEqual(STANDARDS.map((standard) => standard.code).sort());
    expect(assessment.methods.length).toBeGreaterThanOrEqual(3);
    expect(assessment.subjectList.url).toMatch(/^https:\/\//u);
    expect(unmappedReasonFor(assessment.unmapped, 'v1', 'supplement')).toBeTruthy();
  });

  it('성취기준을 일부러 비운 차시(UNMAPPED_REASONS)마다 자료실의 긴 까닭(assessment.yaml unmapped)이 있다', () => {
    // 차시 머리의 "해당 없음(보충 차시)" 링크가 자료실 #std-unmapped-title로 가므로, 거기에 그 차시의 까닭이 꼭 있어야 한다.
    const assessment = parseAssessment(fs.readFileSync('content/teacher/assessment.yaml', 'utf8'));
    const planned = allPlannedLessons();
    for (const label of Object.keys(UNMAPPED_REASONS)) {
      const lesson = planned.find((entry) => entry.lesson.label === label)?.lesson;
      expect(lesson, `${label}이 차례표에 없어요`).toBeDefined();
      expect(unmappedReasonFor(assessment.unmapped, label, lesson?.kind ?? ''), `${label}의 까닭이 assessment.yaml unmapped에 없어요`).toBeTruthy();
    }
  });

  it('content/teacher/corrections.yaml: 묶음 id가 겹치지 않고 항목마다 쪽·종류·원고·바르게가 있다', () => {
    const corrections = parseCorrections(fs.readFileSync('content/teacher/corrections.yaml', 'utf8'));
    expect(corrections.parts.length).toBeGreaterThan(0);
    expect(new Set(corrections.parts.map((part) => part.id)).size).toBe(corrections.parts.length);
    for (const item of corrections.parts.flatMap((part) => part.items)) {
      expect(item.page).not.toBe('');
      expect(item.original).not.toBe('');
      expect(item.fix).not.toBe('');
    }
    expect(corrections.codeFiles.length).toBeGreaterThan(0);
  });

  it('모양이 틀리면 파일과 자리를 적은 한국어 오류로 멈춘다', () => {
    expect(() => parseCorrections('parts:\n  - id: u1\n    title: 원고\n    items:\n      - page: "017"\n        original: a\n        fix: b\n')).toThrow(
      /\[교사용 자료실\] content\/teacher\/corrections\.yaml: parts 1번째\(u1\) items 1번째 kind/u,
    );
    expect(() => parseCorrections('parts:\n  - id: u1\n    title: 가\n    items: []\n  - id: u1\n    title: 나\n    items: []\n')).toThrow(/두 번 있어요/u);
    expect(() => parseAssessment('course: []\nsubject_list: { title: 목록, url: "http://a" }\nmethods: []\nconsiderations: []\nstandards: {}\n')).toThrow(
      /https:\/\/로 시작하는 주소/u,
    );
    expect(() =>
      parseAssessment('course: []\nsubject_list: { title: 목록, url: "https://a" }\nmethods: []\nconsiderations: []\nstandards:\n  12인피05-01: { look: a, evidence: b }\n'),
    ).toThrow(/12인피01-01 모양/u);
  });

  it('글의 `…`만 코드 글꼴로 바꾸고 HTML 특수 문자는 바꿔 적는다', () => {
    expect(formatInline('`<b>`와 a<b & "c"')).toBe('<code>&lt;b&gt;</code>와 a&lt;b &amp; &quot;c&quot;');
    expect(formatInline('따옴표 하나 ` 만')).toBe('따옴표 하나 ` 만');
  });
});

describe('뱃지·주소 도우미(teacher-lessons.ts)', () => {
  it('원천 뱃지와 성취기준 자리 이름', () => {
    expect(sourceBadge('manuscript-code', '014~018')).toEqual({ text: '원고와 코드 · 교과서 014~018쪽', tone: 'manuscript' });
    expect(sourceBadge('code-only', '파일명 p216')).toEqual({ text: '원고 없음(코드 기준) · 파일명 p216', tone: 'no-manuscript' });
    expect(sourceBadge('supplement', undefined).tone).toBe('supplement');
    expect(sourceBadge(undefined, undefined).tone).toBe('unknown');
    expect(standardAnchor('12인피01-02')).toBe('std-01-02');
    expect(new Set(STANDARDS.map((standard) => standardAnchor(standard.code))).size).toBe(STANDARDS.length);
  });
});
