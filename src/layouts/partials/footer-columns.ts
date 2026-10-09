/**
 * 바닥글 사이트 지도의 묶음(판 1.3.0). 머리글 메뉴와 같은 사이트 지도(src/config/nav.ts)에서 만들고, 이름·주소는 거기서만 정한다.
 * 묶음은 다섯: 시작하기 · 배우기 · 실습실 · 도움 · 사이트 정보. 사이트 지도의 모든 쪽(홈 제외)과 대단원 I~IV가 한 번 이상 나온다
 * (tests/unit/footer-columns.test.ts가 빠진 쪽을 잡는다).
 */
import { getPage, learnUnits, type NavPage } from '../../config/nav.ts';

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
  column('learn', getPage('learn'), learnUnits),
  column('labs', getPage('labs'), getPage('labs').children),
  column('help', getPage('help'), [getPage('help-errors'), getPage('glossary'), getPage('search')]),
  {
    id: 'site',
    title: '사이트 정보',
    links: [getPage('teacher'), getPage('settings'), getPage('credits'), getPage('contribute')].map(link),
  },
]);
