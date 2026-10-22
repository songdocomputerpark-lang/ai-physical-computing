// 수업 화면(src/components/lesson/present.ts) 시험 도구 — 판 1.7.0(PROGRESS 미해결 259·260·270): 단계마다 "막대 위에서 끝나는지"를 잰다.
// lesson-template.spec.ts(따라 하기 쪽)와 book.spec.ts(교과서 원문 쪽)가 함께 쓴다.
import { expect, type Page } from '@playwright/test';

/** 1366×768 창을 150%로 키운 화면(walk-a11y-keyboard가 흉내 낸 크기 — CSS 화소 911×512, 기기 화소비 1.5) */
export const ZOOM_150 = { viewport: { width: 911, height: 512 }, deviceScaleFactor: 1.5 } as const;

/** 개발 서버에만 있는 Astro 개발 도구 막대가 아래쪽 막대를 가리지 않게(빌드 결과에는 없다) */
export async function hideDevToolbar(page: Page): Promise<void> {
  await page.addStyleTag({ content: 'astro-dev-toolbar { display: none !important; }' });
}

/** 수업 화면을 [수업 화면] 단추(키보드)로 열고, 그림을 다 받은 뒤 단계가 자리 잡을 때까지 기다린다 */
export async function openPresentationByButton(page: Page): Promise<void> {
  await hideDevToolbar(page);
  const open = page.getByRole('button', { name: '수업 화면', exact: true });
  await expect(open).toBeVisible();
  await open.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-presenting', '');
  await expect(page.locator('[data-lesson-present]')).not.toHaveAttribute('data-present-settling', /.*/u);
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('.lesson-body img')].every((image) => image.complete));
  await page.waitForTimeout(500);
}

export interface StepFitReport {
  readonly step: number;
  readonly total: number;
  /** 막대 위 끝 밑으로 들어간 블록(태그와 글 앞 30자) */
  readonly hidden: readonly string[];
  /** 가장 많이 넘친 만큼(px, 0 이하면 넘침 없음) */
  readonly overflow: number;
  /** "▼ 아래에 더 있어요"가 보이는가 */
  readonly more: boolean;
  /** 막대 첫 줄(단계 이름) 글이 말줄임표로 잘렸는가 */
  readonly statusClipped: boolean;
  /** 막대 둘째 줄 "마지막 단계예요…"가 보이는가 · 잘렸는가 */
  readonly endVisible: boolean;
  readonly endClipped: boolean;
  /** 지금 단계 막대 글 */
  readonly status: string;
}

/**
 * 지금 단계에 보이는 블록(차시 머리·머리 상자·칸 안 블록)이 모두 아래 막대 위에서 끝나는지 잰다(스크롤 맨 위 기준 — 단계를 그리면 맨 위로 온다).
 * 퀴즈 문항은 문제·보기·단추 아래 끝을 본다(채점 결과 칸은 채점할 때 보이는 곳으로 옮겨 온다). 펼친 실습실 틀은 틀 아래 끝까지.
 */
export async function stepFitReport(page: Page): Promise<StepFitReport> {
  return page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-lesson-present]');
    const bar = document.querySelector('.lesson-present__bar');
    const barTop = bar?.getBoundingClientRect().top ?? window.innerHeight;
    const visible = (element: Element) =>
      element instanceof HTMLElement &&
      !element.closest('[data-present-off]') &&
      getComputedStyle(element).display !== 'none' &&
      element.getBoundingClientRect().height > 0;
    const article = document.querySelector('article.lesson');
    const blocks: HTMLElement[] = [];
    const header = article?.querySelector<HTMLElement>('.lesson__header');
    if (header && visible(header)) {
      blocks.push(...[...header.children].filter(visible).map((element) => element as HTMLElement));
    }
    for (const child of article?.querySelector('.lesson-body')?.children ?? []) {
      if (!visible(child)) {
        continue;
      }
      if (child.matches('section.lesson-section')) {
        blocks.push(...[...child.children].filter(visible).map((element) => element as HTMLElement));
      } else {
        blocks.push(child as HTMLElement);
      }
    }
    const bottomOf = (block: HTMLElement) => {
      const frame = block.querySelector('.lesson-example__lab:not([hidden]) > iframe');
      if (frame) {
        return frame.getBoundingClientRect().bottom;
      }
      if (!block.hasAttribute('data-present-split')) {
        return block.getBoundingClientRect().bottom;
      }
      const item = [...block.querySelectorAll<HTMLElement>('[data-present-item]')].find((element) => !element.hasAttribute('data-present-off'));
      const parts = item ? [...item.querySelectorAll<HTMLElement>('legend, label, button, p')].filter((element) => !element.closest('[data-quiz-feedback]')) : [];
      return Math.max(0, ...parts.map((element) => element.getBoundingClientRect().bottom));
    };
    const bottoms = blocks.map((block) => ({ block, bottom: bottomOf(block) }));
    const hidden = bottoms
      .filter(({ bottom }) => bottom > barTop + 1)
      .map(({ block }) => `${block.tagName.toLowerCase()}.${block.className || '-'} "${(block.textContent ?? '').replace(/\s+/gu, ' ').trim().slice(0, 30)}"`);
    const status = document.querySelector<HTMLElement>('[data-present-status]');
    const end = document.querySelector<HTMLElement>('[data-present-end]');
    const more = document.querySelector<HTMLElement>('[data-present-more]');
    const shown = (element: HTMLElement | null) => Boolean(element && !element.hidden && getComputedStyle(element).display !== 'none' && element.getClientRects().length > 0);
    const clipped = (element: HTMLElement | null) => Boolean(element && shown(element) && element.scrollWidth > element.clientWidth + 1);
    return {
      step: Number(root?.dataset.presentStep ?? 0),
      total: Number(root?.dataset.presentTotal ?? 0),
      hidden,
      overflow: Math.round(Math.max(0, ...bottoms.map(({ bottom }) => bottom)) - barTop),
      more: shown(more),
      statusClipped: clipped(status),
      endVisible: shown(end),
      endClipped: clipped(end),
      status: status?.textContent ?? '',
    };
  });
}

/**
 * 첫 단계부터 끝 단계까지 →로 넘기며 단계마다 맞춤을 확인한다(넘치는 단계 0 — 판 1.7.0 미해결 260). 그린 뒤 맞추기(글꼴 등)가 끝날 시간을 준다.
 * 돌려주는 값: 단계마다의 보고(실패 메시지에 넘친 블록을 적는다).
 */
export async function walkAllSteps(page: Page, where: string): Promise<StepFitReport[]> {
  const present = page.locator('[data-lesson-present]');
  const total = Number(await present.getAttribute('data-present-total'));
  expect(total, `${where}: 단계 수`).toBeGreaterThan(3);
  await page.keyboard.press('Home');
  const reports: StepFitReport[] = [];
  for (let step = 1; step <= total; step += 1) {
    await expect(present).toHaveAttribute('data-present-step', String(step));
    let report = await stepFitReport(page);
    // 그린 직후(1.5초 안) 늦게 받은 글꼴·그림으로 한 번 더 맞출 수 있다 — 넘쳤으면 잠깐 기다려 다시 잰다
    for (let wait = 0; wait < 6 && (report.hidden.length > 0 || report.more); wait += 1) {
      await page.waitForTimeout(300);
      report = await stepFitReport(page);
    }
    reports.push(report);
    expect(report.hidden, `${where} ${step}/${total}단계 「${report.status}」 막대 밑으로 ${report.overflow}px`).toEqual([]);
    expect(report.more, `${where} ${step}/${total}단계 「${report.status}」에 "아래에 더 있어요"`).toBe(false);
    expect(report.statusClipped, `${where} ${step}/${total}단계 막대 글 「${report.status}」이 잘렸다`).toBe(false);
    if (step === total) {
      expect(report.endVisible, `${where} 마지막 단계 둘째 줄`).toBe(true);
      expect(report.endClipped, `${where} 마지막 단계 둘째 줄이 잘렸다`).toBe(false);
    }
    if (step < total) {
      await page.keyboard.press('ArrowRight');
    }
  }
  return reports;
}
