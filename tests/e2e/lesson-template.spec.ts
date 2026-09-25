// 차시 틀(PLAN §8.5 P5-02) — 발표 모드·교사용 접기의 "이 차시의 원고와 자료"·성취기준 표시를 기준 차시 1-1-1에서 키보드로 확인한다.
// 퀴즈 즉시 피드백·교사용 접기 열고 닫기는 learn.spec.ts에 있다. 데스크톱·휴대폰 두 프로젝트 모두에서 돈다.
import { expect, test, type Page } from '@playwright/test';
import { withBase } from '../../src/lib/url.ts';

async function openPresentation(page: Page) {
  const open = page.getByRole('button', { name: '발표 모드' });
  await expect(open).toBeVisible();
  await open.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-presenting', '');
}

function status(page: Page) {
  return page.locator('[data-present-status]');
}

test.describe('발표 모드', () => {
  test('키보드로 열고, →·←·Home·End로 한 단계씩 넘기고, Esc로 끝내면 제자리로 돌아온다', async ({ page }) => {
    await page.goto('./learn/u1/1-1-1/');
    const normalRoot = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
    await openPresentation(page);
    const bar = page.getByRole('toolbar', { name: '발표 모드 조작' });
    await expect(bar).toBeVisible();

    // 머리글·바닥글·차례·이전/다음·뱃지는 숨고, 첫 장은 차시 제목이다.
    await expect(page.locator('.site-header')).toBeHidden();
    await expect(page.locator('.site-footer')).toBeHidden();
    await expect(page.getByRole('navigation', { name: '이 차시의 차례' })).toBeHidden();
    await expect(page.getByRole('navigation', { name: '이전·다음 차시' })).toBeHidden();
    await expect(page.locator('.lesson-meta')).toBeHidden();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(status(page)).toHaveText(/^1 \/ \d+ · 1-1-1 인공지능 응용 프로그램과 에이전트$/u);
    const total = Number(await page.locator('[data-lesson-present]').getAttribute('data-present-total'));
    expect(total).toBeGreaterThan(10);

    // 큰 글씨: 휴대폰은 거의 그대로, 넓은 화면은 뿌리 글자 크기가 커진다.
    const presentingRoot = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
    const width = page.viewportSize()?.width ?? 0;
    if (width >= 1024) {
      expect(presentingRoot).toBeGreaterThan(normalRoot * 1.3);
    } else {
      expect(presentingRoot).toBeGreaterThanOrEqual(normalRoot);
    }

    await page.keyboard.press('ArrowRight');
    await expect(status(page)).toHaveText(`2 / ${total} · 학습목표`);
    await expect(page.getByRole('heading', { level: 2, name: '학습목표' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeHidden();
    await expect(page.getByRole('heading', { level: 2, name: '왜 배울까' })).toBeHidden();

    await page.keyboard.press('ArrowRight');
    await expect(status(page)).toHaveText(`3 / ${total} · 왜 배울까`);
    await page.keyboard.press('ArrowLeft');
    await expect(status(page)).toHaveText(`2 / ${total} · 학습목표`);

    // 핵심 개념은 ### 제목마다 한 단계
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(status(page)).toHaveText(`4 / ${total} · 핵심 개념 — 인공지능과 사람의 지능`);
    await expect(page.getByRole('heading', { level: 3, name: '인공지능과 사람의 지능' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: '에이전트' })).toBeHidden();

    // 용어 풀이 툴팁이 열려 있으면 Esc는 툴팁만 닫고 발표는 이어진다.
    const term = page.locator('.glossary-term__link').first();
    await term.focus();
    await expect(term).toHaveAttribute('data-tooltip', 'open');
    await page.keyboard.press('Escape');
    await expect(term).not.toHaveAttribute('data-tooltip', 'open');
    await expect(page.locator('html')).toHaveAttribute('data-presenting', '');
    await expect(status(page)).toHaveText(`4 / ${total} · 핵심 개념 — 인공지능과 사람의 지능`);

    // 끝 단계는 확인 퀴즈 마지막 문항 — 앞 문항은 숨고, 교사용 칸은 어느 단계에도 나오지 않는다.
    await page.keyboard.press('End');
    await expect(status(page)).toHaveText(`${total} / ${total} · 확인 퀴즈 (3/3)`);
    const items = page.locator('[data-quiz-item]');
    await expect(items.nth(2)).toBeVisible();
    await expect(items.nth(0)).toBeHidden();
    await expect(page.locator('section[data-section="teacher"]')).toBeHidden();
    await expect(page.getByRole('button', { name: '다음 ▶' })).toBeDisabled();

    // 보기(라디오)에 초점이 있으면 ←→는 보기를 고르고 단계는 그대로다.
    const choice = items.nth(2).getByRole('radio', { name: '센서' });
    await choice.focus();
    await page.keyboard.press('Space');
    await expect(choice).toBeChecked();
    // 틀린 답을 확인하면 고른 보기가 오답 색(빨강 바탕 #fdecec)이 된다.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(items.nth(2).getByRole('status')).toContainText('다시 생각해 보세요.');
    await expect(items.nth(2).locator('label', { hasText: '센서' })).toHaveCSS('background-color', 'rgb(253, 236, 236)');
    await page.keyboard.press('Shift+Tab');
    await expect(choice).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(items.nth(2).getByRole('radio', { name: '액추에이터' })).toBeChecked();
    await expect(status(page)).toHaveText(`${total} / ${total} · 확인 퀴즈 (3/3)`);
    // 발표 중에도 퀴즈는 그대로 동작한다.
    await page.keyboard.press('Tab');
    await expect(items.nth(2).getByRole('button', { name: '답 확인하기' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(items.nth(2).getByRole('status')).toContainText('정답이에요!');
    // 채점한 보기는 "고른 보기"의 파란색이 아니라 정답 색(초록 바탕 #e8f6ee)으로 바뀐다(색과 함께 "정답" 글자도).
    await expect(items.nth(2).locator('label', { hasText: '액추에이터' })).toHaveCSS('background-color', 'rgb(232, 246, 238)');

    await page.keyboard.press('Home');
    await expect(status(page)).toHaveText(/^1 \/ /u);
    await page.keyboard.press('End');

    await page.keyboard.press('Escape');
    await expect(page.locator('html')).not.toHaveAttribute('data-presenting');
    await expect(bar).toBeHidden();
    await expect(page.locator('[data-present-off]')).toHaveCount(0);
    await expect(page.locator('.site-header')).toBeVisible();
    await expect(page.getByRole('button', { name: '발표 모드' })).toBeFocused();
    // 마지막으로 본 칸(확인 퀴즈) 쪽으로 돌아온다.
    await expect(page.getByRole('heading', { level: 2, name: '확인 퀴즈' })).toBeInViewport();
  });

  test('막대의 단추로도 넘기고 끝내며, 발표 화면은 옆으로 넘치지 않는다', async ({ page }) => {
    await page.goto('./learn/u1/1-1-1/');
    await openPresentation(page);
    const bar = page.getByRole('toolbar', { name: '발표 모드 조작' });
    const previous = bar.getByRole('button', { name: '◀ 앞' });
    await expect(previous).toBeDisabled();
    const next = bar.getByRole('button', { name: '다음 ▶' });
    for (let step = 0; step < 8; step += 1) {
      await next.click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${step + 2}단계`).toBeLessThanOrEqual(0);
    }
    await expect(status(page)).toHaveText(/^9 \/ /u);
    // 따라하기 예제 단계에서도 [이 자리에서 실습실 열기]를 쓸 수 있다(실습실은 누르기 전에 받지 않는다).
    await expect(page.locator('.lesson-example')).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);
    await previous.click();
    await expect(status(page)).toHaveText(/^8 \/ /u);
    await bar.getByRole('button', { name: '끝내기(Esc)' }).click();
    await expect(page.locator('html')).not.toHaveAttribute('data-presenting');
  });

});

test.describe('발표 모드 — 자바스크립트가 꺼져 있을 때', () => {
  test.use({ javaScriptEnabled: false });

  test('[발표 모드] 단추와 안내가 보이지 않는다(본문은 그대로 읽힌다)', async ({ page }) => {
    await page.goto('./learn/u1/1-1-1/');
    await expect(page.getByRole('button', { name: '발표 모드' })).toBeHidden();
    await expect(page.locator('.lesson__tools')).toBeHidden();
    await expect(page.getByRole('heading', { level: 2, name: '핵심 개념' })).toBeVisible();
  });
});

test.describe('교사용 접기 — 이 차시의 원고와 자료', () => {
  test('원천·성취기준(사이트 요약·원문 링크)·원본 안내가 저절로 붙는다', async ({ page }) => {
    await page.goto('./learn/u1/1-1-1/');
    const details = page.locator('details.box--teacher');
    await details.locator('summary').focus();
    await page.keyboard.press('Enter');
    const info = details.locator('[data-lesson-teacher-info]');
    await expect(info.getByRole('heading', { level: 3, name: '이 차시의 원고와 자료' })).toBeVisible();
    await expect(info.locator('[data-teacher-info="source"]')).toContainText('교과서 원고(008~012쪽)');
    const standards = info.locator('[data-teacher-info="standards"]');
    await expect(standards).toContainText('성취기준(인천광역시교육청 승인 교육과정, 차시 연결은 사이트가 붙임)');
    await expect(standards).toContainText('[12인피01-01] 인공지능 영상인식 — 영상인식 기술의 종류와 원리, 개발 환경 구성(사이트 요약)');
    await expect(standards.getByRole('link', { name: /교육과정 원문 게시물/u })).toHaveAttribute('href', /^https:\/\/www\.ice\.go\.kr\//u);
    const originals = info.locator('[data-teacher-info="originals"]');
    await expect(originals).toContainText('원본 내려받기는 없어요');
    await expect(originals.getByRole('link', { name: '예제 갤러리' })).toHaveAttribute('href', withBase('labs/gallery/'));
    await expect(originals.getByRole('link', { name: '교사용 자료실' })).toHaveAttribute('href', withBase('teacher/'));
    await expect(originals.getByRole('link', { name: '교과서 원고 정정 목록' })).toHaveAttribute('href', withBase('teacher/corrections/'));
    await expect(originals.getByRole('link', { name: '진짜 PC에서 돌리기' })).toHaveAttribute('href', withBase('teacher/real-pc/'));
    // 1-1-1은 이어지는 수업 교안이 없어 편집본 줄이 없다.
    await expect(info.locator('[data-teacher-info="handouts"]')).toHaveCount(0);
    // 교사용 칸의 틀 제목 세 개
    for (const name of [/지도안 요약/u, /평가 포인트/u, /자주 막히는 곳/u]) {
      await expect(details.getByRole('heading', { level: 3, name })).toBeVisible();
    }
  });

  test('성취기준을 일부러 비운 보충 차시는 교사용 접기에 "해당 없음(보충 차시)"·까닭 모음 링크와 보충 표시가 나온다', async ({ page }) => {
    await page.goto('./learn/u1/v4/');
    const details = page.locator('details.box--teacher');
    await details.locator('summary').click();
    const info = details.locator('[data-lesson-teacher-info]');
    await expect(info.locator('[data-teacher-info="source"]')).toContainText('보충 차시');
    const standards = info.locator('[data-teacher-info="standards"]');
    await expect(standards).toContainText('해당 없음(보충 차시)');
    await expect(standards).not.toContainText('성취기준 코드 확인 중');
    await expect(standards.getByRole('link', { name: '교사용 자료실의 성취기준을 비워 둔 차시' })).toHaveAttribute(
      'href',
      withBase('teacher/standards/#std-unmapped-title'),
    );
  });
});
