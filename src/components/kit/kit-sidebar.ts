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

/** 장치 목록 스크롤 칸의 길이들(px). 모두 칸 안쪽 맨 위를 0으로 잰 값이다. */
export interface KitNavScrollInput {
  /** 지금 장치가 든 장(章) 묶음의 위 */
  readonly groupTop: number;
  /** 지금 장치 항목의 위·아래 */
  readonly currentTop: number;
  readonly currentBottom: number;
  /** 스크롤 칸이 보여 주는 높이 */
  readonly viewport: number;
}

/**
 * 장치 목록을 처음 열 때의 스크롤 위치(판 1.7.0, 미해결 264 #20 — 걷기 보고 walk-kit-user 20).
 * 지금 장치를 칸 가운데로 맞추면 위쪽의 "키트 장치 도감 첫 쪽"·장 제목이 반쯤 잘려 처음 온 학생이 위에 더 있는지 몰랐다.
 *   1) 지금 장치가 처음 한 화면 안에 있으면 맨 위(0)부터 — 아무것도 잘리지 않는다.
 *   2) 아니면 장 제목부터 지금 장치까지가 한 화면에 들어오면 장 제목이 맨 위에 오게 — 잘리는 곳이 장 경계라 깨끗하다.
 *   3) 그것도 안 되면(장이 길고 지금 장치가 깊음) 지금 장치가 위에서 40% 자리에 오게 — 위아래 모두 이어짐이 보인다.
 */
export function kitNavScrollTop(input: KitNavScrollInput): number {
  const { groupTop, currentTop, currentBottom, viewport } = input;
  if (viewport <= 0) {
    return 0;
  }
  if (currentBottom <= viewport) {
    return 0;
  }
  if (currentBottom - groupTop <= viewport) {
    return Math.max(0, Math.round(groupTop));
  }
  return Math.max(0, Math.round(currentTop - viewport * 0.4));
}
