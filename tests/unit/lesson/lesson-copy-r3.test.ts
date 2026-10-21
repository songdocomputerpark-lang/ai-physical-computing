// R3-004·R3-010·R3-011: 차시 머리 수업 화면 안내(터치·좁은 화면에서 키보드 문구 숨김)와 따라 하기 안내 낱말을 원문으로 본다.
// 판 1.6.0(C173): 안내는 차시 쪽·교과서 쪽이 함께 쓰는 PresentButton.astro로 옮겼고, 키 이름은 기호 대신 글로 쓴다(walk-a11y-keyboard 10·B-87).
// Astro는 줄바꿈 공백을 지우므로 {' '} 없이 두 글이 붙지 않았는지도 함께 본다.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const lessonPage = fs.readFileSync('src/pages/learn/[unit]/[lesson].astro', 'utf8');
const bookPage = fs.readFileSync('src/pages/book/[id].astro', 'utf8');
const presentButton = fs.readFileSync('src/components/lesson/PresentButton.astro', 'utf8');
const examples = fs.readFileSync('src/components/lesson/LessonExamples.astro', 'utf8');

describe('차시·교과서 쪽 머리 수업 화면 안내(R3-004, 판 1.6.0 C173)', () => {
  it('두 쪽 머리가 같은 부품 PresentButton을 쓴다(옛 이름 "발표 모드"·"수업 화면으로" 단추가 따로 없다)', () => {
    expect(lessonPage).toMatch(/<PresentButton[\s/>]/u);
    expect(bookPage).toMatch(/<PresentButton[\s/>]/u);
    expect(lessonPage).not.toContain('data-present-open');
    expect(bookPage).not.toContain('data-present-open');
  });

  it('키보드 문구는 따로 싸 두고(키 이름은 글로), 터치·좁은 화면에서는 숨기고 [앞]·[다음] 안내를 보인다', () => {
    expect(presentButton).toMatch(/<span class="lesson__tools-keys">오른쪽·왼쪽 화살표 키로 넘기고 Esc로 끝내요\.[^<]*<\/span>/u);
    // 화살표 기호(→ ← ↓)만으로 키를 말하지 않는다 — 낭독기·처음 온 학생이 읽기 어렵다
    expect(presentButton.match(/<span class="lesson__tools-keys">([^<]*)<\/span>/u)?.[1] ?? '').not.toMatch(/[→←↓↑]/u);
    expect(presentButton).toMatch(/<span class="lesson__tools-touch">[^<]*\[앞\]·\[다음\][^<]*<\/span>/u);
    expect(presentButton).toMatch(/@media \(pointer: coarse\), \(max-width: 40rem\)\s*\{\s*\.lesson__tools-keys\s*\{\s*display: none;/u);
  });

  it('첫 문장과 키보드 문구 사이에 공백 글자가 있다', () => {
    expect(presentButton).toContain("보여 줘요.{' '}");
  });
});

describe('따라 하기 예제 안내 낱말(R3-010·R3-011)', () => {
  it("사이트 화면을 '쪽'이라 부르지 않고 단추 이름은 '실습실에서 크게 열기'다", () => {
    expect(examples).not.toContain('이 쪽');
    expect(examples).not.toContain('실습실 쪽');
    expect(examples).not.toContain('다른 쪽');
    expect(examples.match(/실습실에서 크게 열기/gu)?.length).toBeGreaterThanOrEqual(4);
  });

  it("안내 문장은 '바꿔 볼 것'으로 띄어 쓴다(주석 머리말 '바꿔볼 것 3가지'는 파서가 글자 그대로 읽으므로 그대로)", () => {
    expect(examples).toContain('(바꿔 볼 것, 왜 이런 결과가 나올까)');
    expect(examples).not.toContain('(바꿔볼 것,');
  });
});
