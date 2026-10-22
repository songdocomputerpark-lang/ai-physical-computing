/**
 * 장치 쪽 왼쪽 "키트 장치 목록"(판 1.5.0) — 지금 장치가 든 장의 장치 목록과, 다른 장으로 가는 길을 LessonSidebar가 그리는 모양
 * (src/components/lesson/sidebar-outline.ts)으로 바꾼다. 교과서 쪽의 "교과서 차례"(book-sidebar.ts)와 같은 부품·같은 규칙이라
 * 넓으면 왼쪽에 붙은 목록, 좁으면 본문 위의 <details>로 보인다.
 *
 * 장치가 101개라 모든 장치를 한 목록에 두면 쪽마다 링크가 100개 넘게 붙는다. 그래서 지금 장의 장치만 펼치고, 다른 장은 도감 첫 쪽의 그 장(#ch-N)으로 가는 한 줄씩만 둔다.
 * 순수 함수라 Vitest로 검사한다(tests/unit/kit/kit-sidebar.test.ts).
 */
import type { SidebarGroup, SidebarOutline } from '../lesson/sidebar-outline.ts';
import type { KitData, KitDevice } from './kit-schema.ts';
import { chapterAnchor, kitDeviceHref, kitIndexHref } from './kit-view.ts';

/** 목록에서 지금 쪽을 가리키는 id를 만든다(장치 쪽은 장치 id) */
export function kitSidebarOutline(data: Pick<KitData, 'chapters' | 'devices' | 'intro'>, current: KitDevice): SidebarOutline {
  const chapter = data.chapters.find((candidate) => candidate.n === current.chapter);
  const groups: SidebarGroup[] = [
    {
      key: 'kit-index',
      title: '도감',
      items: [{ id: 'kit-index', href: kitIndexHref(), label: '', title: '키트 장치 도감 첫 쪽' }],
    },
    {
      key: `kit-ch-${current.chapter}`,
      title: `${current.chapter}장 ${chapter?.name ?? ''}`.trim(),
      items: data.devices
        .filter((device) => device.chapter === current.chapter)
        .map((device) => ({ id: device.id, href: kitDeviceHref(device.id), label: device.number, title: device.name })),
    },
    {
      key: 'kit-others',
      title: '다른 장',
      items: data.chapters
        .filter((candidate) => candidate.n !== current.chapter)
        .filter((candidate) => candidate.n !== 1 || data.intro.length > 0)
        .sort((a, b) => a.n - b.n)
        .map((candidate) => ({ id: chapterAnchor(candidate.n), href: kitIndexHref(candidate.n), label: `${candidate.n}장`, title: candidate.name })),
    },
  ];
  return {
    navLabel: '키트 장치 목록',
    summaryLabel: '이 장의 장치 목록 펼치기',
    title: '키트 장치 도감',
    titleHref: kitIndexHref(),
    // 도감은 2단원(피지컬 컴퓨팅)과 같은 초록 계열 — 장식이며 장 이름이 글자로 늘 있다
    unit: 2,
    currentId: current.id,
    groups,
    showProgress: false,
  };
}

// 장치 목록 처음 스크롤 위치는 쪽 스크립트가 함께 쓰려고 의존성 없는 파일로 나눴다(판 1.7.0)
export { kitNavScrollTop, type KitNavScrollInput } from './kit-nav-scroll.ts';
