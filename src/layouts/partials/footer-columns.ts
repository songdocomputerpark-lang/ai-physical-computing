/**
 * 바닥글 사이트 지도의 묶음(판 1.3.0). 머리글 메뉴와 같은 사이트 지도(src/config/nav.ts)에서 만들고, 이름·주소는 거기서만 정한다.
 * 묶음은 다섯: 시작하기 · 배우기 · 실습실 · 도움 · 사이트 정보. 사이트 지도의 모든 쪽(홈 제외)과 대단원 I~IV가 한 번 이상 나온다
 * (tests/unit/footer-columns.test.ts가 빠진 쪽을 잡는다).
 */
import { getPage, learnUnits, type NavPage } from '../../config/nav.ts';
import { siteConfig } from '../../config/site.ts';

export interface FooterLink {
  label: string;
  href: string;
}

export interface FooterColumn {
  id: string;
  /** 묶음 제목. 주소가 있으면 링크로 그린다. */
  title: string;
  href?: string;
  links: readonly FooterLink[];
}

function link(page: NavPage): FooterLink {
  return { label: page.label, href: page.href };
}

function column(id: string, head: NavPage, links: readonly NavPage[]): FooterColumn {
  return { id, title: head.label, href: head.href, links: links.map(link) };
}

export const footerColumns: readonly FooterColumn[] = Object.freeze([
  column('start', getPage('start'), getPage('start').children),
  // 교과서(판 1.4.0)는 배우기 묶음 맨 앞 — 출판본을 그대로 읽는 곳이고, 아래 대단원 링크는 풀이·실습으로 간다
  column('learn', getPage('learn'), [getPage('book'), ...learnUnits]),
  column('labs', getPage('labs'), getPage('labs').children),
  column('help', getPage('help'), [getPage('help-errors'), getPage('glossary'), getPage('search')]),
  {
    id: 'site',
    title: '사이트 정보',
    links: [getPage('teacher'), getPage('settings'), getPage('credits'), getPage('contribute')].map(link),
  },
]);

/**
 * 모든 쪽 바닥글의 출처 줄(판 1.4.0 — DECISIONS C132·C136, 판 1.5.0에서 키트 장치 도감의 예제 코드를 더함 — O19). 교과서와 부품 사진·회로 그림·키트 예제 코드의 출처를 한 줄로 알린다.
 * 값은 src/config/site.ts(textbook·partsProviderWithRole)에서 온다. 문장은 tests/unit/footer-columns.test.ts가 글자까지 지킨다.
 * 판 1.6.0 R6: 업체 이름에 "실습 키트 제조사"를 붙였다(걷기 보고 B-57 — 어떤 회사인지 몰라 출처를 알아보지 못했다).
 */
export function footerCreditText(): string {
  const { title, publisher, authors } = siteConfig.textbook;
  return `교과서: 「${title}」(${publisher}, ${authors.join('·')}). 부품 사진·회로 그림·키트 예제 코드: ${siteConfig.partsProviderWithRole} 제공, 허락받아 사용.`;
}
