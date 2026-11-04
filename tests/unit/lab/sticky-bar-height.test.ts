// @vitest-environment jsdom
// 붙은 조작 줄 높이를 문서 뿌리 CSS 변수로 알리기(판 1.9.3, DECISIONS C245 — WCAG 2.4.11).
// scroll-padding을 6rem(96px)으로 고정했더니 ESP32 실습실의 두 줄 조작 줄(약 120px) 밑에 Tab으로 옮긴 [코드] 단추가 24px 가렸다
// (tests/e2e/a11y-keyboard.spec.ts "[블록]을 키보드로 켜고 끄며"가 이 컨테이너에서 8번 중 2번 실패). 화면 위치는 그 브라우저 시험이 본다.
import { afterEach, describe, expect, it } from 'vitest';
import { STICKY_BAR_HEIGHT_VAR, stickyBarsHeight, syncStickyBarHeight } from '../../../src/lab/controls/reveal.ts';

function addBar(position: 'sticky' | 'static', height: number): HTMLElement {
  const bar = document.createElement('div');
  bar.setAttribute('data-lab-bar', '');
  bar.style.position = position;
  bar.getBoundingClientRect = () => ({ top: 0, bottom: height, height, width: 800, left: 0, right: 800, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  document.body.append(bar);
  return bar;
}

describe('붙은 조작 줄 높이(reveal.ts syncStickyBarHeight)', () => {
  afterEach(() => {
    document.body.replaceChildren();
    document.documentElement.style.removeProperty(STICKY_BAR_HEIGHT_VAR);
  });

  it('붙은 줄이 있으면 그 높이(올림)를 문서 뿌리 변수로 알린다', () => {
    addBar('sticky', 119.4);
    expect(syncStickyBarHeight(document)).toBe(120);
    expect(document.documentElement.style.getPropertyValue(STICKY_BAR_HEIGHT_VAR)).toBe('120px');
  });

  it('붙지 않은 줄뿐이면 변수를 지워 CSS 기본값(6rem)으로 돌아간다', () => {
    document.documentElement.style.setProperty(STICKY_BAR_HEIGHT_VAR, '120px');
    addBar('static', 120);
    expect(syncStickyBarHeight(document)).toBe(0);
    expect(document.documentElement.style.getPropertyValue(STICKY_BAR_HEIGHT_VAR)).toBe('');
  });

  it('한 쪽에 실습실 틀이 둘이면 붙은 줄 가운데 가장 높은 것을 쓴다(붙지 않은 틀이 지우지 않는다)', () => {
    addBar('static', 200);
    addBar('sticky', 96);
    addBar('sticky', 130);
    expect(stickyBarsHeight(document)).toBe(130);
    expect(syncStickyBarHeight(document)).toBe(130);
    expect(document.documentElement.style.getPropertyValue(STICKY_BAR_HEIGHT_VAR)).toBe('130px');
  });
});
