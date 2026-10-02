// 휴대폰 320px(WCAG 2.1 1.4.10 재배치 기준 폭 — https://www.w3.org/WAI/WCAG21/Understanding/reflow.html)에서 쪽이 가로로 넘치지 않는지 보는 도구.
// 2026-10-02 최종 전수 점검 3바퀴 LB3-02: 375px 검사만 있어, 320px에서만 생기는 넘침(조절 패널 "조절 값 쓰는 법"을 펼치면 28px — 조절 막대 오른쪽
// 값이 잘림, 4단원 가상 데스크톱 18px, 실물 점검 도우미 5번 제목 11px)을 놓쳤다. 실습실 칸의 그리드 열은 minmax(0, 1fr), 설명 속 코드 조각은
// 줄바꿈으로 고쳤다(src/components/lab/ParamPanel.astro·src/lab/modules/desktop/panel.astro·src/components/lab/check/BoardCheckHelper.astro).
// 쓰는 곳: lab-esp32·lab-vision·unit4·esp32-board-check spec의 휴대폰 검사.
import { expect, type Page } from '@playwright/test';

/** 재배치 기준 폭(세로는 흔한 휴대폰 높이) */
export const REFLOW_VIEWPORT = { width: 320, height: 760 } as const;

/**
 * 쪽이 가로로 넘치는 만큼(px)과 넘치게 한 요소 몇 개(tests/e2e/a11y-keyboard.spec.ts의 같은 이름 함수와 같은 모양).
 * 화면 안에 있는 스크롤 칸(보드 그림 칸 같은 overflow-x: auto) 속 요소는 쪽을 넘치게 하지 않으므로 범인 목록에서 뺀다.
 */
export async function horizontalOverflow(page: Page): Promise<{ overflow: number; offenders: string[] }> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const overflow = document.documentElement.scrollWidth - width;
    const offenders: string[] = [];
    const insideScrollBox = (element: Element): boolean => {
      for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        if (getComputedStyle(parent).overflowX !== 'visible' && parent.getBoundingClientRect().right <= width + 0.5) {
          return true;
        }
      }
      return false;
    };
    if (overflow > 0) {
      for (const element of document.querySelectorAll('body *')) {
        const rect = element.getBoundingClientRect();
        const deeper = [...element.children].some((child) => child.getBoundingClientRect().right > width + 0.5);
        if (rect.width > 0 && rect.right > width + 0.5 && !deeper && !insideScrollBox(element)) {
          offenders.push(`${element.tagName.toLowerCase()}.${element.getAttribute('class') ?? ''}(오른쪽 끝 ${Math.round(rect.right)}px)`);
        }
        if (offenders.length >= 5) {
          break;
        }
      }
    }
    return { overflow, offenders };
  });
}

/** 지금 쪽이 가로로 넘치지 않는다(넘치면 넘치게 한 요소를 실패 글에 적는다) */
export async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const { overflow, offenders } = await horizontalOverflow(page);
  expect(overflow, `${label} — 쪽이 가로로 ${overflow}px 넘쳐요: ${offenders.join(', ')}`).toBeLessThanOrEqual(0);
}

/** 보이는 조절 패널의 "조절 값 쓰는 법"을 모두 펼친 뒤에도 넘치지 않는다(패널이 하나도 없으면 실패 — 거짓 통과 막기) */
export async function expectParamsHelpReflows(page: Page, label: string): Promise<void> {
  const helps = page.locator('details.params__help').filter({ visible: true });
  const count = await helps.count();
  expect(count, `${label} — 보이는 조절 패널 도움말("조절 값 쓰는 법")이 없어요`).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const help = helps.nth(index);
    const summary = help.locator(':scope > summary');
    await summary.scrollIntoViewIfNeeded();
    await summary.click();
    await expect(help).toHaveJSProperty('open', true);
  }
  await expectNoHorizontalOverflow(page, `${label} — "조절 값 쓰는 법"을 펼친 뒤`);
}
