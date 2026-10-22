// @vitest-environment jsdom
// 판 1.6.0 구역 R5(키보드, DECISIONS C177) — 건너뛰기·홈 차례 그림 링크·초점 도착점·사이드바 요약 글의 원문과 카드 초점 규칙.
// 화면에서 실제로 되는지는 tests/e2e/a11y-keyboard.spec.ts(건너뛰기 → 본문 초점, 홈 Tab 정류장 수, 앵커 도착 위치)가 본다.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CARD_LINK_SELECTOR, installCardFocusScroll, shouldScrollCard } from '../../../src/components/common/card-focus.ts';
import { homeToc } from '../../../src/components/home/home-content.ts';

const baseLayout = readFileSync('src/layouts/BaseLayout.astro', 'utf8');
const homeTocSource = readFileSync('src/components/home/HomeToc.astro', 'utf8');
const sidebarSource = readFileSync('src/components/lesson/LessonSidebar.astro', 'utf8');
const globalCss = readFileSync('src/styles/global.css', 'utf8');

describe('모든 쪽 [본문으로 건너뛰기](BaseLayout)', () => {
  it('<body>의 첫 요소이고 머리글보다 앞이며, 가는 곳(기본 main-content)은 초점을 받을 수 있는 <main>이다', () => {
    const body = baseLayout.slice(baseLayout.indexOf('<body>'));
    const firstTag = body.match(/<body>\s*(<[A-Za-z][^>]*)/u)?.[1] ?? '';
    expect(firstTag).toContain('class="skip-link"');
    expect(firstTag).toContain('href={`#${skipTarget}`}');
    expect(body.indexOf('skip-link')).toBeLessThan(body.indexOf('<SiteHeader'));
    expect(baseLayout).toMatch(/<main id="main-content"[^>]*tabindex="-1"/u);
    expect(baseLayout).toContain('본문으로 건너뛰기');
  });

  it('평소에는 화면 밖, 초점이 오면 나타나고, 임베드(차시 안 실습실)에서는 숨는다', () => {
    expect(globalCss).toMatch(/\.skip-link\s*\{[^}]*transform:\s*translateY\(-200%\)/u);
    expect(globalCss).toMatch(/\.skip-link:focus,\s*\.skip-link:hover\s*\{[^}]*transform:\s*none/u);
    expect(globalCss).toMatch(/:root\[data-embed\] \.skip-link/u);
  });
});

describe('홈 차례(HomeToc)의 키보드 길', () => {
  it('그림 위 투명 링크는 모두 Tab 차례에서 뺀다(tabindex="-1" — 마우스·손가락은 그대로)', () => {
    const spotTag = homeTocSource.match(/<a class="toc-spot" href=[^>]*>/u)?.[0] ?? '';
    expect(spotTag).toContain('tabindex="-1"');
    expect(spotTag).toContain('href={spot.href}');
    // 그림 위 링크가 이 하나의 마크업뿐이다 — 다른 곳에서 tabindex 없이 만들지 않는다
    expect(homeTocSource.match(/<a class="toc-spot" /gu)).toHaveLength(1);
  });

  it('Tab이 그림 자리에서 처음 닿는 안내 한 줄이 있고 절 목록(#toc-list)으로 가며, 목록은 넓은 화면에도 보인다', () => {
    expect(homeTocSource).toMatch(/<a class="toc__kbd" href="#toc-list"/u);
    expect(homeTocSource).toContain('id="toc-list"');
    expect(homeToc.keyboardHint).toBe('키보드로는 아래 절 목록을 써요');
    expect(homeToc.keyboardGo).toBe('절 목록으로');
    // 넓은 화면 규칙 안에서 절 목록을 숨기지 않는다(옛 규칙은 .toc__list를 display:none으로 숨겼다)
    const wide = homeTocSource.slice(homeTocSource.indexOf('@media (min-width: 48rem)'));
    expect(wide.slice(0, wide.indexOf('@media (forced-colors'))).not.toMatch(/\.toc__list\s*[,{]/u);
    // 안내 한 줄은 초점을 받으면 큰 글로 나타난다
    expect(homeTocSource).toMatch(/\.toc__kbd:focus\s*\{[^}]*font-size:\s*var\(--text-lg\)/u);
  });

  it('DOM 순서가 보이는 순서다: 안내 → 그림 → 절 목록 → (좁은 화면의) 접힌 그림', () => {
    const order = ['class="toc__kbd"', 'data-home-toc-figures', 'id="toc-list"', 'data-home-toc-details'].map((needle) => homeTocSource.indexOf(needle, homeTocSource.indexOf('<section')));
    expect(order.every((index) => index > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('#toc 주소의 도착점은 초점을 받을 수 있는 제목 "차례"다(id="toc"·tabindex="-1"·scroll-margin)', () => {
    expect(homeTocSource).toMatch(/<h2 id="toc" class="toc__title" tabindex="-1">/u);
    expect(homeTocSource).toContain('aria-labelledby="toc"');
    expect(homeTocSource).toMatch(/\.toc__title\s*\{[^}]*scroll-margin-block-start:\s*var\(--space-4\)/u);
    // 같은 id가 둘이 되지 않는다
    expect(homeTocSource.match(/<[a-z0-9]+\s[^>]*\bid="toc"/gu)).toHaveLength(1);
  });

  it('판 1.7.0(walk-a11y-keyboard N5): "절 목록으로"의 도착점 절 목록은 초점을 받고(tabindex="-1"), 안내 상자는 커진 뒤 화면 안으로 다시 맞춘다', () => {
    expect(homeTocSource).toMatch(/<nav id="toc-list"[^>]*tabindex="-1"/u);
    // 마우스로 누른 초점에는 테두리를 그리지 않는다(키보드 초점만)
    expect(homeTocSource).toMatch(/\.toc__list:focus:not\(:focus-visible\)\s*\{\s*outline:\s*none/u);
    // 커진 상자 위아래 여유 + 초점 뒤 한 번 더 가장 가까운 만큼(nearest) 옮기기
    expect(homeTocSource).toMatch(/\.toc__kbd:focus\s*\{[^}]*scroll-margin-block:\s*var\(--space-6\)/u);
    expect(homeTocSource).toMatch(/\[data-toc-keyboard\][\s\S]*scrollIntoView\(\{ block: 'nearest'/u);
  });
});

describe('초점 도착점의 여유(global.css)', () => {
  it('#lesson-article에 위 여유, 카드·카드 링크에 위아래 여유(24px)를 둔다', () => {
    expect(globalCss).toMatch(/#lesson-article\s*\{\s*scroll-margin-block-start:\s*var\(--space-4\)/u);
    expect(globalCss).toMatch(/\.card,\s*\.card__link\s*\{\s*scroll-margin-block:\s*var\(--space-6\)/u);
  });

  it('차시·교과서 쪽·키트 장치 쪽의 본문 뿌리는 id="lesson-article"에 tabindex="-1"이다', () => {
    for (const file of ['src/pages/learn/[unit]/[lesson].astro', 'src/pages/book/[id].astro', 'src/pages/labs/esp32/kit/[id].astro']) {
      expect(readFileSync(file, 'utf8'), file).toMatch(/id="lesson-article" tabindex="-1"/u);
    }
  });
});

describe('차시 왼쪽 목록 요약 글(LessonSidebar)', () => {
  it('열리면 "…펼치기"가 "…접기"로 바뀐다 — 두 글을 따로 두고 열림 상태에 따라 하나만 보인다', () => {
    expect(sidebarSource).toContain("summaryLabel.replace(/펼치기$/u, '접기')");
    expect(sidebarSource).toContain('lesson-nav__label-closed');
    expect(sidebarSource).toContain('lesson-nav__label-open');
    expect(sidebarSource).toMatch(/\.lesson-nav\[open\] > summary > \.lesson-nav__label-open\s*\{\s*display:\s*inline/u);
    expect(sidebarSource).toMatch(/\.lesson-nav\[open\] > summary > \.lesson-nav__label-closed\[data-swap\]\s*\{\s*display:\s*none/u);
  });
});

describe('카드 링크 초점 규칙(card-focus.ts)', () => {
  it('shouldScrollCard: 카드 링크이고 키보드 초점이고 카드가 있을 때만', () => {
    expect(shouldScrollCard({ isCardLink: true, focusVisible: true, hasCard: true })).toBe(true);
    expect(shouldScrollCard({ isCardLink: true, focusVisible: false, hasCard: true })).toBe(false);
    expect(shouldScrollCard({ isCardLink: false, focusVisible: true, hasCard: true })).toBe(false);
    expect(shouldScrollCard({ isCardLink: true, focusVisible: true, hasCard: false })).toBe(false);
  });

  describe('문서에 걸었을 때', () => {
    const removers: Array<() => void> = [];
    afterEach(() => {
      while (removers.length > 0) {
        removers.pop()?.();
      }
      document.body.innerHTML = '';
      vi.restoreAllMocks();
    });

    /** jsdom은 :focus-visible을 제대로 흉내 내지 못한다(스크립트로 두 번째 준 초점은 아니라고 답한다) — 키보드 초점인지 여부를 시험이 정한다 */
    function focusVisible(element: HTMLElement, value: boolean): void {
      const original = element.matches.bind(element);
      element.matches = ((selector: string) => (selector === ':focus-visible' ? value : original(selector))) as typeof element.matches;
    }

    function setup(): { link: HTMLAnchorElement; other: HTMLAnchorElement; card: HTMLElement; scroll: ReturnType<typeof vi.fn> } {
      document.body.innerHTML =
        '<div class="card card--link" id="card"><h3><a class="card__link" href="#a">카드 제목</a></h3><p>설명</p></div><p><a id="plain" href="#b">그냥 링크</a></p>';
      const card = document.getElementById('card') as HTMLElement;
      const scroll = vi.fn();
      card.scrollIntoView = scroll as unknown as typeof card.scrollIntoView;
      removers.push(installCardFocusScroll(document));
      return { link: card.querySelector(CARD_LINK_SELECTOR) as HTMLAnchorElement, other: document.getElementById('plain') as HTMLAnchorElement, card, scroll };
    }

    it('카드 링크에 초점이 오면 카드 전체를 가장 가까운 만큼만 화면에 넣는다(block: nearest)', () => {
      const { link, scroll } = setup();
      focusVisible(link, true);
      link.focus();
      expect(scroll).toHaveBeenCalledTimes(1);
      expect(scroll).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
    });

    it('마우스·손가락으로 준 초점(:focus-visible이 아님)은 화면을 움직이지 않는다', () => {
      const { link, scroll } = setup();
      focusVisible(link, false);
      link.focus();
      expect(scroll).not.toHaveBeenCalled();
    });

    it('카드 밖 링크는 건드리지 않고, 두 번 걸어도 한 번만 처리한다', () => {
      const { other, link, scroll } = setup();
      removers.push(installCardFocusScroll(document));
      focusVisible(other, true);
      focusVisible(link, true);
      other.focus();
      expect(scroll).not.toHaveBeenCalled();
      link.focus();
      expect(scroll).toHaveBeenCalledTimes(1);
    });
  });
});
