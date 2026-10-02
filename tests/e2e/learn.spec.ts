// 배우기 브라우저 테스트(PLAN §8.1 P1-06): 목록 → 차시 → 퀴즈 정답·오답 피드백 → 교사용 접기 키보드.
// 주소는 baseURL 기준 상대 경로('./learn/')로 연다(앞에 /를 붙이면 base가 빠진다, tests/e2e/smoke.spec.ts 머리말).
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { parse } from 'yaml';
import { learnUnits } from '../../src/config/nav.ts';
import { withBase } from '../../src/lib/url.ts';

/** content/lessons의 md 가운데 draft가 아닌 것과 그 차시 주소 */
function publishedLessonFiles(): { file: string; href: string }[] {
  const walk = (directory: string): string[] =>
    fs.readdirSync(directory, { withFileTypes: true }).flatMap((dirent) => {
      const full = path.join(directory, dirent.name);
      if (dirent.isDirectory()) {
        return walk(full);
      }
      return dirent.name.endsWith('.md') ? [full] : [];
    });
  return walk('content/lessons').flatMap((file) => {
    const match = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(fs.readFileSync(file, 'utf8'));
    const data = (match ? parse(match[1] ?? '') : {}) as { unit?: number; draft?: boolean };
    if (data.draft === true || typeof data.unit !== 'number') {
      return [];
    }
    return [{ file: file.split(path.sep).join('/'), href: withBase(`learn/u${data.unit}/${path.basename(file, '.md')}/`) }];
  });
}

async function expectNoHorizontalScroll(page: import('@playwright/test').Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, label).toBeLessThanOrEqual(0);
}

test.describe('배우기 목록', () => {
  test('대단원 4개 > 묶음 > 차시 카드가 보이고, 차례표의 차시가 모두 공개돼 "준비 중" 카드가 없으며, 원고 없음·보충 표시가 붙는다', async ({ page }) => {
    const response = await page.goto('./learn/');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: '배우기' })).toBeVisible();
    for (const unit of learnUnits) {
      await expect(page.getByRole('heading', { level: 2, name: unit.label })).toBeVisible();
    }
    await expect(page.getByRole('heading', { level: 3, name: '01 인공지능과 인식' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: '보충: 영상 처리 기초' })).toBeVisible();

    await expect(page.getByRole('link', { name: '1-1-1 인공지능 응용 프로그램과 에이전트' })).toHaveAttribute(
      'href',
      withBase('learn/u1/1-1-1/'),
    );
    await expect(page.getByRole('link', { name: 'V4 보충 블러와 에지' })).toHaveAttribute('href', withBase('learn/u1/v4/'));

    // 차례표의 차시 45편이 모두 공개됐다(Phase 5, 2026-09-25) — "준비 중" 카드가 하나라도 있으면 차시 md가 빠졌거나(지움·옮김·이름 바꿈) 초안이다.
    // 전에는 "있으면 그 모양을 보고, 없으면 통과" 두 갈래라 차시가 사라져도 초록이었다(2026-10-02 최종 전수 점검 3바퀴 TD3-01 — DECISIONS C74 ④·C80).
    // "준비 중" 카드·딱지 그리기 자체는 단위 검사(tests/unit/lesson/lesson-data.test.ts)가 지킨다.
    const planned = page.locator('.lesson-card[data-status="planned"]');
    await expect(planned, '차례표의 차시가 모두 공개돼 있어야 해요 — md가 빠졌거나 초안이면 npm run check:lessons -- --complete로 확인해요').toHaveCount(0);
    // 원고 없는 차시(코드만)에는 "원고 없음" 딱지가 붙는다(링크 카드여도).
    await expect(page.locator('#lesson-u1-1-3-1')).toContainText('원고 없음');
    await expect(page.locator('#lesson-u1-1-3-1').getByRole('link')).toHaveAttribute('href', withBase('learn/u1/1-3-1/'));
    await expectNoHorizontalScroll(page, '/learn/');
  });

  test('content/lessons의 md 파일(draft 제외)은 코드 수정 없이 모두 목록에 링크 카드로 나타난다', async ({ page }) => {
    const lessons = publishedLessonFiles();
    expect(lessons.length).toBeGreaterThan(0);
    await page.goto('./learn/');
    for (const lesson of lessons) {
      await expect(page.locator(`a.lesson-card__link[href="${lesson.href}"]`), lesson.file).toHaveCount(1);
    }
  });

  test('카드 표시 풀이는 목록에 있는 딱지만 풀고, 차시가 모두 공개돼 차시 수만 적는다(2026-09-30 최종 점검 C-05)', async ({ page }) => {
    for (const address of ['./learn/', `.${learnUnits[0]!.path}`]) {
      await page.goto(address);
      const legend = page.locator('.lesson-legend');
      await expect(legend).toContainText('원고 없음');
      // 차례표의 차시가 모두 공개됐다 — "준비 중" 카드가 없고(위 검사와 같은 까닭, 3바퀴 TD3-01), 그래서 "준비 중" 풀이와
      // "차시 N개 가운데 M개를 볼 수 있어요" 글도 없다(C66 ⑤ — 둘 다 준비 중 차시가 있을 때만 보인다).
      await expect(
        page.locator('.lesson-card[data-status="planned"]'),
        `${address} — 차례표의 차시가 모두 공개돼 있어야 해요(npm run check:lessons -- --complete로 확인해요)`,
      ).toHaveCount(0);
      await expect(legend.locator('[data-legend="planned"]'), address).toHaveCount(0);
      await expect(legend).not.toContainText('사이트가 글을 쓰는 차시');
      await expect(page.locator('main')).not.toContainText('개를 볼 수 있어요');
      await expect(page.locator('.learn-unit__count, .unit-count').first()).toHaveText(/^차시 \d+개$/u);
    }
  });

  test('휴대폰 폭에서 옆으로 넘치는 표·코드 칸은 오른쪽 안쪽에 그늘이 생기고, 끝까지 밀면 그 그늘이 사라진다(2026-09-30 최종 점검 MA-02)', async ({ page, isMobile }) => {
    test.skip(!isMobile, '휴대폰 폭(375px)에서 본다');
    await page.goto('./learn/u4/project/');
    const table = page.locator('.lesson-body table').first();
    await table.scrollIntoViewIfNeeded();
    expect(await table.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeGreaterThan(1);
    await expect(table).toHaveAttribute('data-scroll-more', 'end');
    expect(await table.evaluate((element) => getComputedStyle(element).boxShadow)).toContain('inset');
    // 끝까지 밀면 오른쪽 그늘은 사라지고 왼쪽에 남는다
    await table.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    await expect(table).toHaveAttribute('data-scroll-more', 'start');
    // 넘치지 않는 표에는 표시가 없다
    const notOverflowing = await page.locator('.lesson-body table').evaluateAll((elements) =>
      elements.filter((element) => element.scrollWidth - element.clientWidth <= 1).map((element) => element.getAttribute('data-scroll-more')),
    );
    expect(notOverflowing.every((value) => value === null)).toBe(true);

    // 코드 칸도 같다(차시 코드 칸은 처음부터 Tab 차례에 있어 초점 규칙은 그대로)
    await page.goto('./learn/u3/3-1-1/');
    const wide = page.locator('.lesson-body pre').filter({ has: page.locator('code') });
    const index = await wide.evaluateAll((elements) => elements.findIndex((element) => element.scrollWidth - element.clientWidth > 1));
    expect(index).toBeGreaterThanOrEqual(0);
    const pre = wide.nth(index);
    await pre.scrollIntoViewIfNeeded();
    await expect(pre).toHaveAttribute('data-scroll-more', 'end');
    await expect(pre).not.toHaveAttribute('data-scroll-focus-added', /.*/u);
  });

  test('대단원 페이지 4개가 열리고 현재 위치가 홈 › 배우기 › 대단원이다', async ({ page }) => {
    for (const unit of learnUnits) {
      const response = await page.goto(`.${unit.path}`);
      expect(response?.status(), unit.path).toBe(200);
      await expect(page.getByRole('heading', { level: 1, name: unit.label })).toBeVisible();
      const breadcrumb = page.getByRole('navigation', { name: '현재 위치' });
      await expect(breadcrumb.getByRole('link', { name: '배우기' })).toHaveAttribute('href', withBase('learn/'));
      await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText(unit.label);
      await expect(page.locator('.lesson-card').first()).toBeVisible();
    }
  });
});

test.describe('차시 페이지', () => {
  test('목록에서 1-1-1로 가면 제목·성취기준·뱃지·8칸·예제·실습실 링크·이전/다음이 보인다', async ({ page }) => {
    await page.goto('./learn/');
    await page.getByRole('link', { name: '1-1-1 인공지능 응용 프로그램과 에이전트' }).click();
    await expect(page).toHaveURL(new RegExp(`${withBase('learn/u1/1-1-1/')}$`, 'u'));
    await expect(page).toHaveTitle(/^1-1-1 인공지능 응용 프로그램과 에이전트 \| /u);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/1-1-1\s+인공지능 응용 프로그램과 에이전트/u);

    const breadcrumb = page.getByRole('navigation', { name: '현재 위치' });
    await expect(breadcrumb.getByRole('link', { name: 'I. 영상 처리 인공지능' })).toHaveAttribute('href', withBase('learn/u1/'));
    await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText('1-1-1 인공지능 응용 프로그램과 에이전트');

    const meta = page.locator('.lesson-meta');
    await expect(meta.locator('[data-meta="standards"]')).toContainText('[12인피01-01]');
    await expect(meta.locator('[data-meta="duration"]')).toContainText('50분');
    await expect(meta.locator('[data-meta="materials"]')).toContainText('따로 준비할 것 없음');
    await expect(meta.locator('[data-meta="difficulty"]')).toContainText('쉬움');
    await expect(meta.locator('[data-meta="pages"]')).toContainText('008~012쪽');
    await expect(meta.locator('[data-meta="lab"]').getByRole('link', { name: '영상처리 실습실' })).toHaveAttribute(
      'href',
      withBase('labs/vision/'),
    );

    for (const title of ['학습목표', '왜 배울까', '핵심 개념', '따라하기', '바꿔보기', '도전 과제', '확인 퀴즈', '교사용']) {
      await expect(page.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible();
    }

    const example = page.locator('.lesson-example');
    await expect(example.locator('.lesson-code')).toContainText('photos = [');
    await expect(example.locator('.lesson-code__line').first()).toHaveText(/^# 1-1-1 체험/u);
    await expect(example.getByRole('region', { name: /코드, \d+줄$/u })).toHaveCount(1);
    await expect(example.getByRole('link', { name: '실습실에서 열기', exact: true })).toHaveAttribute(
      'href',
      `${withBase('labs/vision/')}?example=${encodeURIComponent('vision/u1/1-1-1-sort-vs-group.py')}`,
    );
    // 실습실 임베드(P2-14)는 누르기 전에는 만들어지지 않는다.
    await expect(example.getByRole('button', { name: '이 자리에서 실습실 열기' })).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);

    for (const image of await page.locator('.lesson-body img').all()) {
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
    }
    await expectNoHorizontalScroll(page, '1-1-1');

    const pager = page.getByRole('navigation', { name: '이전·다음 차시' });
    await expect(pager).toContainText('첫 번째 차시예요.');
    await pager.getByRole('link', { name: /다음 차시/u }).click();
    // 차례표 순서대로 1-1-1 다음은 1-1-2다(보충 V1~V5는 1-1-3 뒤, order 3.1~3.5).
    await expect(page).toHaveURL(new RegExp(`${withBase('learn/u1/1-1-2/')}$`, 'u'));
  });

  test('1-1-3 다음은 보충 V1이다(보충 차시는 교과서 차시 사이에 order로 끼운다)', async ({ page }) => {
    await page.goto('./learn/u1/1-1-3/');
    await page.getByRole('navigation', { name: '이전·다음 차시' }).getByRole('link', { name: /다음 차시/u }).click();
    await expect(page).toHaveURL(new RegExp(`${withBase('learn/u1/v1/')}$`, 'u'));
  });

  test('보충 V4: 대응표에서 일부러 비운 성취기준은 "해당 없음(보충 차시)", 제목에 "보충", 이전 차시는 V3', async ({ page }) => {
    await page.goto('./learn/u1/v4/');
    await expect(page).toHaveTitle(/^V4 \(보충\) 블러와 에지 \| /u);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/V4\s+보충\s+블러와 에지/u);
    await expect(page.locator('[data-meta="standards"]')).toHaveText(/성취기준\s*해당 없음\(보충 차시\)/u);
    await expect(page.locator('[data-meta="materials"]')).toContainText('웹캠(없으면 샘플 이미지)');
    await expect(
      page.getByRole('navigation', { name: '이전·다음 차시' }).getByRole('link', { name: /이전 차시.*V3/u }),
    ).toHaveAttribute('href', withBase('learn/u1/v3/'));
  });

  test('확인 퀴즈: 키보드로 오답을 확인하면 "다시 생각해 보세요", 정답이면 "정답이에요!"와 풀이', async ({ page }) => {
    await page.goto('./learn/u1/1-1-1/');
    const item = page.locator('[data-quiz-item]').first();
    const feedback = item.getByRole('status');
    const wrongChoice = item.getByRole('radio', { name: '인식' });
    const checkButton = item.getByRole('button', { name: '답 확인하기' });

    await wrongChoice.focus();
    await page.keyboard.press('Space');
    await expect(wrongChoice).toBeChecked();
    await page.keyboard.press('Tab');
    await expect(checkButton).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(feedback).toContainText('다시 생각해 보세요.');
    await expect(feedback).toContainText('고른 답: ① 인식');
    await expect(item.getByRole('button', { name: '정답과 풀이 보기' })).toBeVisible();
    await expect(item.locator('[data-quiz-explain]')).toBeHidden();

    await page.keyboard.press('Shift+Tab');
    await expect(wrongChoice).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(item.getByRole('radio', { name: '학습' })).toBeChecked();
    await expect(feedback).toBeEmpty();
    await page.keyboard.press('Tab');
    await expect(checkButton).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(feedback).toContainText('정답이에요!');
    await expect(feedback).toContainText('학습은 데이터에서 패턴을 익히는 능력이에요.');
    await expect(item.locator('label', { hasText: '학습' })).toHaveAttribute('data-result', 'correct');
    // 맞히면 풀이는 피드백 칸에만 보인다(같은 풀이를 두 번 보이지 않음).
    await expect(item.locator('[data-quiz-explain]')).toBeHidden();
    await expect(item.getByRole('button', { name: '정답과 풀이 보기' })).toBeHidden();
    await expect(page.locator('[data-quiz-summary]')).toHaveText('3문항 가운데 1문항을 맞혔어요.');
  });

  test('틀린 뒤 [정답과 풀이 보기]를 키보드로 누르면 정답과 풀이가 펼쳐지고 초점이 옮겨진다', async ({ page }) => {
    await page.goto('./learn/u1/1-1-1/');
    const item = page.locator('[data-quiz-item]').nth(2);
    await item.getByRole('radio', { name: '센서' }).check();
    await item.getByRole('button', { name: '답 확인하기' }).click();
    await expect(item.getByRole('status')).toContainText('다시 생각해 보세요.');

    await item.getByRole('button', { name: '답 확인하기' }).focus();
    await page.keyboard.press('Tab');
    const revealButton = item.getByRole('button', { name: '정답과 풀이 보기' });
    await expect(revealButton).toBeFocused();
    await page.keyboard.press('Enter');

    const explain = item.locator('[data-quiz-explain]');
    await expect(explain).toBeVisible();
    await expect(explain).toBeFocused();
    await expect(explain).toContainText('정답: ② 액추에이터');
    await expect(item.locator('label', { hasText: '액추에이터' })).toHaveAttribute('data-result', 'correct');
    await expect(item.locator('label', { hasText: '센서' })).toHaveAttribute('data-result', 'wrong');
  });

  test('교사용 안내는 처음에 접혀 있고 키보드(Enter)로 열고 닫으며, 차례의 "교사용" 링크로 가면 펼쳐진다', async ({ page }) => {
    await page.goto('./learn/u1/1-1-1/');
    const details = page.locator('details.box--teacher');
    const summary = details.locator('summary');
    const heading = details.getByRole('heading', { name: /지도안 요약/u });

    await expect(details).not.toHaveAttribute('open');
    await expect(heading).toBeHidden();
    await summary.focus();
    await expect(summary).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(details).toHaveAttribute('open', '');
    await expect(heading).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(details).not.toHaveAttribute('open');
    await expect(heading).toBeHidden();

    await page.getByRole('navigation', { name: '이 차시의 차례' }).getByRole('link', { name: '교사용', exact: true }).click();
    await expect(details).toHaveAttribute('open', '');
  });
});

test.describe('자바스크립트가 꺼져 있을 때', () => {
  test.use({ javaScriptEnabled: false });

  test('퀴즈는 버튼 대신 "정답과 풀이 보기" 접기 상자를 보인다', async ({ page }) => {
    await page.goto('./learn/u1/1-1-1/');
    const item = page.locator('[data-quiz-item]').first();
    await expect(item.getByRole('button', { name: '답 확인하기' })).toBeHidden();
    const fallback = item.locator('details.quiz__fallback');
    await expect(fallback).toBeVisible();
    await fallback.locator('summary').click();
    await expect(fallback).toContainText('정답: ② 학습');
  });
});
