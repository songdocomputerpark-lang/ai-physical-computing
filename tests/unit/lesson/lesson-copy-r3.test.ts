// R3-004·R3-010·R3-011: 차시 머리 발표 모드 안내(터치·좁은 화면에서 키보드 문구 숨김)와 따라 하기 안내 낱말을 원문으로 본다.
// Astro는 줄바꿈 공백을 지우므로 {' '} 없이 두 글이 붙지 않았는지도 함께 본다.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const lessonPage = fs.readFileSync('src/pages/learn/[unit]/[lesson].astro', 'utf8');
const examples = fs.readFileSync('src/components/lesson/LessonExamples.astro', 'utf8');

describe('차시 머리 발표 모드 안내(R3-004)', () => {
  it('키보드 문구는 따로 싸 두고, 터치·좁은 화면에서는 숨기고 [앞]·[다음] 안내를 보인다', () => {
    expect(lessonPage).toMatch(/<span class="lesson__tools-keys">키보드 → ←로 넘기고 Esc로 끝내요\.<\/span>/u);
    expect(lessonPage).toMatch(/<span class="lesson__tools-touch">[^<]*\[앞\]·\[다음\][^<]*<\/span>/u);
    expect(lessonPage).toMatch(/@media \(pointer: coarse\), \(max-width: 40rem\)\s*\{\s*\.lesson__tools-keys\s*\{\s*display: none;/u);
  });

  it('첫 문장과 키보드 문구 사이에 공백 글자가 있다', () => {
    expect(lessonPage).toContain("보여 줘요.{' '}");
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
