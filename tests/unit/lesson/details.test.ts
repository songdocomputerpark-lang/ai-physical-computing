import { describe, expect, it } from 'vitest';
import { openDetailsFor, openForPrint, type NodeLike } from '../../../src/components/lesson/details.ts';

interface FakeNode extends NodeLike {
  parentElement: FakeNode | null;
  nextElementSibling: FakeNode | null;
}

function fakeNode(tagName: string, open?: boolean): FakeNode {
  return { tagName, open, parentElement: null, nextElementSibling: null };
}

describe('접기 상자 도우미(src/components/lesson/details.ts)', () => {
  it('인쇄 전에는 닫힌 상자만 펼치고, 인쇄 뒤에는 그 상자만 다시 닫는다', () => {
    const closedHint = { open: false };
    const openTeacher = { open: true };
    const closedAnswer = { open: false };

    const restore = openForPrint([closedHint, openTeacher, closedAnswer]);
    expect([closedHint.open, openTeacher.open, closedAnswer.open]).toEqual([true, true, true]);

    restore();
    expect([closedHint.open, openTeacher.open, closedAnswer.open]).toEqual([false, true, false]);
  });

  it('주소 #위치가 접힌 상자 안(상자 안의 상자 포함)을 가리키면 바깥 상자까지 모두 펼친다', () => {
    const outer = fakeNode('DETAILS', false);
    const inner = fakeNode('details', false);
    const paragraph = fakeNode('P');
    inner.parentElement = outer;
    paragraph.parentElement = inner;

    expect(openDetailsFor(paragraph)).toBe(2);
    expect(outer.open).toBe(true);
    expect(inner.open).toBe(true);
    expect(openDetailsFor(paragraph)).toBe(0);
  });

  it('제목(#교사용 등) 바로 뒤에 접기 상자가 있으면 그 상자를 펼친다', () => {
    const heading = fakeNode('H2');
    const teacherBox = fakeNode('DETAILS', false);
    heading.nextElementSibling = teacherBox;

    expect(openDetailsFor(heading)).toBe(1);
    expect(teacherBox.open).toBe(true);
  });

  it('제목이 아니거나 바로 뒤가 상자가 아니면 아무것도 펼치지 않는다', () => {
    const paragraph = fakeNode('P');
    const nextBox = fakeNode('DETAILS', false);
    paragraph.nextElementSibling = nextBox;
    expect(openDetailsFor(paragraph)).toBe(0);
    expect(nextBox.open).toBe(false);

    const heading = fakeNode('H2');
    heading.nextElementSibling = fakeNode('DIV');
    expect(openDetailsFor(heading)).toBe(0);
    expect(openDetailsFor(null)).toBe(0);
  });
});
