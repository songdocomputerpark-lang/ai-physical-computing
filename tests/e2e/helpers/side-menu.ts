/**
 * 왼쪽 메뉴판(판 1.9.0, DECISIONS C238) 시험 도우미.
 * 넓은 화면(75rem 이상)에서 메뉴판이 펴져 있으면 차시·교과서·키트 장치 쪽의 본문 칸 차례(LessonSidebar inMenu)는 숨고 메뉴판 안에 같은 차례가 보인다.
 * 본문 칸 차례 자체(펼침·스크롤·[목록 건너뛰기])를 보는 시험은 메뉴판을 접은 브라우저(사람이 [메뉴]로 접은 것과 같다)로 연다.
 */
import type { Page } from '@playwright/test';

/** BaseLayout의 첫 그리기 전 스크립트가 읽는 저장 키(src/layouts/partials/side-menu.ts SIDE_MENU_STORAGE_NAME + 머리말) */
export const SIDE_MENU_KEY = 'ai-physical-computing:ui:side-menu';

/** 이 쪽을 열기 전에 부른다 — 앞으로 여는 쪽은 메뉴판이 접힌 채로 그려진다(같은 문맥의 다른 쪽에도). */
export async function closeSideMenuBeforeLoad(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    try {
      localStorage.setItem(key, 'closed');
    } catch {
      // 저장 공간이 막힌 문맥이면 메뉴판이 펴진 채로 그려진다.
    }
  }, SIDE_MENU_KEY);
}

/** 메뉴판 안의 "이 쪽의 차례"(SideMenuOutline.astro) */
export function menuOutline(page: Page) {
  return page.locator('#site-menu [data-side-menu-outline]');
}
