// 차시 머리 정보(LessonMeta.astro)의 <dt>와 <dd> 사이에 공백 글자가 있는지 원문으로 본다(R2-026).
// Astro는 줄바꿈 공백을 지우므로 {' '}가 없으면 검색 색인·낭독기가 읽는 글에서 "소요 시간50분"처럼 두 글이 붙는다.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('LessonMeta.astro — dt·dd 사이 공백(R2-026)', () => {
  it('모든 </dt> 바로 뒤에 {\' \'} 공백이 있다', () => {
    const source = fs.readFileSync('src/components/lesson/LessonMeta.astro', 'utf8');
    const closings = source.match(/<\/dt>/gu) ?? [];
    const spaced = source.match(/<\/dt>\{' '\}/gu) ?? [];
    expect(closings.length).toBeGreaterThanOrEqual(7);
    expect(spaced).toHaveLength(closings.length);
  });
});
