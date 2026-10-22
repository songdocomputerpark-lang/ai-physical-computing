// 차시 틀(PLAN §8.5 P5-02) — 수업 화면(옛 이름 "발표 모드" — 판 1.6.0 C173)·교사용 접기의 "이 차시의 원고와 자료"·성취기준 표시를 기준 차시 1-1-1에서 키보드로 확인한다.
// 판 1.6.0: 첫 장은 제목 + 학습 목표, 막대 글은 가장 가까운 이름 20글자 안(전체 이름은 낭독 칸 data-present-announce), 마지막 단계는 aria-disabled + "Esc로 끝내기".
// 퀴즈 즉시 피드백·교사용 접기 열고 닫기는 learn.spec.ts에 있다. 데스크톱·휴대폰 두 프로젝트 모두에서 돈다.
import { expect, test, type Page } from '@playwright/test';
import { withBase } from '../../src/lib/url.ts';
import { ZOOM_150, openPresentationByButton, walkAllSteps } from './helpers/present.ts';

async function openPresentation(page: Page) {
  // 개발 서버에만 있는 Astro 개발 도구 막대(astro-dev-toolbar)가 휴대폰 폭에서 발표 막대의 [다음 ▶]를 가려 클릭이 막힌다
  // (PW_BASE_URL로 개발 서버를 시험할 때 — 2026-09-28 겪음). 빌드 결과에는 이 막대가 없어 아무 일도 없다(a11y spec이 axe에서 빼는 것과 같은 까닭).
  await page.addStyleTag({ content: 'astro-dev-toolbar { display: none !important; }' });
  const open = page.getByRole('button', { name: '수업 화면', exact: true });
  await expect(open).toBeVisible();
  await open.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-presenting', '');
  // 발표를 시작하면 차시 그림을 모두 받고, 다 받은 높이로 단계를 한 번 더 나눈다(0.2초 모아서) — 그 뒤의 단계 수로 본다.
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('.lesson-body img')].every((image) => image.complete));
  await page.waitForTimeout(500);
}

function status(page: Page) {
  return page.locator('[data-present-status]');
}

/** 막대 글(20글자 안)과 달리 줄이지 않은 단계 이름 — 낭독기가 듣는 칸 */
function announce(page: Page) {
  return page.locator('[data-present-announce]');
}

test.describe('수업 화면', () => {
  test('키보드로 열고, →·←·Home·End로 한 단계씩 넘기고, Esc로 끝내면 제자리로 돌아온다', async ({ page }) => {
    await page.goto('./learn/u1/1-1-1/');
    const normalRoot = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
    await openPresentation(page);
    const bar = page.getByRole('toolbar', { name: '수업 화면 조작' });
    await expect(bar).toBeVisible();
    // R2-023: 시작 초점은 보이지 않는 main이 아니라 막대의 [다음 단계]이고, 단추 이름에 ◀ ▶ 기호가 없다
    await expect(bar.getByRole('button', { name: '다음 단계', exact: true })).toBeFocused();
    for (const name of await bar.getByRole('button').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label') ?? button.textContent ?? ''))) {
      expect(name, '단추 이름에 기호 없음').not.toMatch(/[◀▶]/u);
    }

    // 머리글·바닥글·차례·이전/다음·뱃지는 숨고, 첫 장은 차시 제목(+ 한 화면에 들어가면 학습 목표 — 판 1.6.0)이다.
    await expect(page.locator('.site-header')).toBeHidden();
    await expect(page.locator('.site-footer')).toBeHidden();
    await expect(page.getByRole('navigation', { name: '이 차시의 차례' })).toBeHidden();
    await expect(page.getByRole('navigation', { name: '이전·다음 차시' })).toBeHidden();
    await expect(page.locator('.lesson-meta')).toBeHidden();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // 막대 글은 20글자 안으로 줄이고(…), 낭독 칸은 줄이지 않은 이름이다(walk-teacher-new A5).
    // 막대가 좁으면(휴대폰) 16·12·8글자로 더 줄인다(판 1.7.0 — present.ts STATUS_LABEL_LENGTHS)
    await expect(status(page)).toHaveText(/^1 \/ \d+ · 1-1-1 인공지능[^·]*…$/u);
    await expect(announce(page)).toContainText('1-1-1 인공지능 응용 프로그램과 에이전트');
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

    // 첫 장에 학습 목표가 함께 보이면(제목만 있는 빈 첫 장 금지 — walk-teacher-new A8) 둘째 장은 "왜 배울까"다.
    // 제목과 학습 목표가 한 화면에 안 들어가는 화면이면 예전처럼 둘째 장이 학습목표다(fitToBar가 되돌린다).
    const goalHeading = page.getByRole('heading', { level: 2, name: '학습목표' });
    const goalsOnTitle = await goalHeading.isVisible();
    if (goalsOnTitle) {
      await expect(page.locator('html')).toHaveAttribute('data-present-title', 'goals');
    } else {
      await page.keyboard.press('ArrowRight');
      await expect(status(page)).toHaveText(`2 / ${total} · 학습목표`);
      await expect(goalHeading).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toBeHidden();
    }
    const whyStep = goalsOnTitle ? 2 : 3;
    await expect(page.getByRole('heading', { level: 2, name: '왜 배울까' })).toBeHidden();

    await page.keyboard.press('ArrowRight');
    await expect(status(page)).toHaveText(`${whyStep} / ${total} · 왜 배울까`);
    await expect(page.getByRole('heading', { level: 1 })).toBeHidden();
    await expect(goalHeading).toBeHidden();
    await page.keyboard.press('ArrowLeft');
    await expect(status(page)).toHaveText(new RegExp(`^${whyStep - 1} \\/ ${total} · `, 'u'));
    await expect(goalHeading).toBeVisible();
    // 단계 주소: 지금 단계가 주소 끝 #slide=N에 적힌다(판 1.6.0)
    await expect.poll(() => new URL(page.url()).hash).toBe(`#slide=${whyStep - 1}`);

    // 핵심 개념은 ### 제목마다 한 단계. 한 화면보다 긴 칸(왜 배울까의 문단 + 그림 등)은 화면 크기에 따라 "(이어서)" 단계로 더 나뉘므로
    // (2026-09-25 Phase 5 검토 중요 5) 단계 번호를 적지 않고 그 단계가 나올 때까지 넘긴다.
    // 막대 글은 가장 가까운 이름(### 제목)만 — 전체 "핵심 개념 — 인공지능과 사람의 지능"은 낭독 칸에
    const conceptLabel = /^\d+ \/ \d+ · 인공지능과 사람의 지능$/u;
    for (let press = 0; press < 6 && !conceptLabel.test((await status(page).textContent()) ?? ''); press += 1) {
      await page.keyboard.press('ArrowRight');
    }
    await expect(status(page)).toHaveText(conceptLabel);
    const conceptStatus = (await status(page).textContent()) ?? '';
    await expect(page.getByRole('heading', { level: 3, name: '인공지능과 사람의 지능' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: '에이전트' })).toBeHidden();
    await expect(announce(page)).toContainText('핵심 개념 — 인공지능과 사람의 지능');

    // 용어 풀이 툴팁이 열려 있으면 Esc는 툴팁만 닫고 발표는 이어진다.
    // 지금 단계에 보이는 용어(학습목표 칸의 "성취기준" 같은 앞 단계 용어는 숨어 있다 — R2-048)
    const term = page.locator('.glossary-term__link:visible').first();
    await term.focus();
    await expect(term).toHaveAttribute('data-tooltip', 'open');
    await page.keyboard.press('Escape');
    await expect(term).not.toHaveAttribute('data-tooltip', 'open');
    await expect(page.locator('html')).toHaveAttribute('data-presenting', '');
    await expect(status(page)).toHaveText(conceptStatus);

    // 끝 단계는 확인 퀴즈 마지막 문항 — 앞 문항은 숨고, 교사용 칸은 어느 단계에도 나오지 않는다.
    await page.keyboard.press('End');
    await expect(status(page)).toHaveText(`${total} / ${total} · 확인 퀴즈 (3/3)`);
    const items = page.locator('[data-quiz-item]');
    await expect(items.nth(2)).toBeVisible();
    await expect(items.nth(0)).toBeHidden();
    await expect(page.locator('section[data-section="teacher"]')).toBeHidden();
    // 끝 단계의 [다음 단계]는 disabled가 아니라 aria-disabled — 초점이 남는다(walk-a11y-keyboard 5). 막대에 "마지막 단계예요"(A-21)
    await expect(page.getByRole('button', { name: '다음 단계' })).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('[data-present-end]')).toBeVisible();
    await expect(page.locator('[data-present-end]')).toContainText('마지막 단계예요');

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
    // 마지막으로 본 칸(확인 퀴즈) 쪽으로 돌아오고, 초점도 그 칸 제목에 있다 — 쪽 맨 위 [수업 화면]으로 돌리면 초점이 화면 밖이라 보이지 않고
    // 다음 Tab이 쪽 위로 뛰었다(2026-09-26 Phase 6 사용성 검토 지적 10).
    const quizHeading = page.getByRole('heading', { level: 2, name: '확인 퀴즈' });
    await expect(quizHeading).toBeInViewport();
    await expect(quizHeading).toBeFocused();
    // 제목의 초점 테두리가 화면 맨 위에 걸려 잘리지 않는다(scroll-margin — R1-077)
    expect(await quizHeading.evaluate((element) => element.getBoundingClientRect().top)).toBeGreaterThanOrEqual(8);
    await page.keyboard.press('Tab');
    const after = await page.evaluate(() => document.activeElement?.closest('section[data-section]')?.getAttribute('data-section') ?? 'none');
    expect(after, '다음 Tab은 확인 퀴즈 칸 안의 조작으로 간다').toBe('quiz');
    await expect(quizHeading).not.toHaveAttribute('tabindex');
    // 끝내면 주소의 #slide=N이 지워진다(새로 고쳐도 읽기 화면)
    expect(new URL(page.url()).hash).toBe('');
  });

  test('마지막 단계: [다음 단계]를 눌러도 초점이 그 단추에 남고, 막대 둘째 줄이 "마지막 단계예요 · Esc로 끝내기"다(A-21)', async ({ page, isMobile }) => {
    test.skip(isMobile, '키보드 조작은 데스크톱에서 본다(휴대폰은 [끝내기] 안내)');
    await page.goto('./learn/u1/1-1-1/');
    await openPresentation(page);
    const bar = page.getByRole('toolbar', { name: '수업 화면 조작' });
    const next = bar.getByRole('button', { name: '다음 단계', exact: true });
    const present = page.locator('[data-lesson-present]');
    const total = (await present.getAttribute('data-present-total')) ?? '';
    await expect(page.locator('[data-present-end]')).toBeHidden();
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowLeft');
    await next.focus();
    await page.keyboard.press('Enter');
    await expect(present).toHaveAttribute('data-present-step', total);
    await expect(next).toHaveAttribute('aria-disabled', 'true');
    await expect(next).toBeFocused();
    await expect(page.locator('[data-present-end]')).toContainText('마지막 단계예요 · Esc로 끝내기');
    // 한 번 더 눌러도 단계는 그대로, 초점도 그대로(BODY로 사라지지 않는다)
    await page.keyboard.press('Enter');
    await expect(present).toHaveAttribute('data-present-step', total);
    await expect(next).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).not.toHaveAttribute('data-presenting');
  });

  // 2026-09-26 Phase 6 사용성 검토 지적 2: 1366×768에서 1-1-1 31단계 가운데 10, 1-1-2 45단계 가운데 12에서 그림 설명·문단 둘째 줄·
  // 코드 아래 줄이 아래 막대 밑으로 들어갔다(한 단계에 쓸 높이를 셀 때 단계 내용이 시작하는 자리를 빼지 않았다).
  // 블록 하나가 화면보다 큰 단계(제목 + 내용 블록 하나)는 스크롤하는 것이 규칙이라 뺀다.
  test('단계마다 보이는 글·그림·코드가 아래 막대에 가려지지 않는다(1366×768·1280×720)', async ({ page, isMobile }) => {
    test.skip(isMobile, '교실 프로젝터 크기(데스크톱)에서 본다');
    test.setTimeout(180_000);
    for (const size of [
      { width: 1366, height: 768 },
      { width: 1280, height: 720 },
    ]) {
      for (const lesson of ['./learn/u1/1-1-1/', './learn/u1/1-1-2/']) {
        await page.setViewportSize(size);
        await page.goto(lesson);
        await openPresentation(page);
        const total = Number(await page.locator('[data-lesson-present]').getAttribute('data-present-total'));
        expect(total).toBeGreaterThan(5);
        for (let step = 1; step <= total; step += 1) {
          await expect(page.locator('[data-lesson-present]')).toHaveAttribute('data-present-step', String(step));
          const report = await page.evaluate(() => {
            const bar = document.querySelector('.lesson-present__bar');
            const barTop = bar?.getBoundingClientRect().top ?? window.innerHeight;
            const section = [...document.querySelectorAll('.lesson-body > section.lesson-section')].find((element) => !element.hasAttribute('data-present-off'));
            if (!section) {
              return { hidden: [] as string[], single: true };
            }
            const blocks = [...section.children].filter(
              (child): child is HTMLElement =>
                child instanceof HTMLElement && !child.hasAttribute('data-present-off') && getComputedStyle(child).display !== 'none' && child.getBoundingClientRect().height > 0,
            );
            const content = blocks.filter((block) => !/^H[23]$/u.test(block.tagName));
            // 퀴즈 문항 단계(data-present-split)는 보이는 문항의 글·보기·단추 아래 끝을 본다(채점 결과 칸은 채점할 때 보이는 곳으로 옮겨 온다)
            const bottomOf = (block: HTMLElement) => {
              if (!block.hasAttribute('data-present-split')) {
                return block.getBoundingClientRect().bottom;
              }
              const item = [...block.querySelectorAll<HTMLElement>('[data-present-item]')].find((element) => !element.hasAttribute('data-present-off'));
              const parts = item ? [...item.querySelectorAll<HTMLElement>('legend, label, button, p')].filter((element) => !element.closest('[data-quiz-feedback]')) : [];
              return Math.max(0, ...parts.map((element) => element.getBoundingClientRect().bottom));
            };
            const hidden = blocks
              .filter((block) => bottomOf(block) > barTop + 1)
              .map((block) => `${block.tagName.toLowerCase()} "${(block.textContent ?? '').replace(/\s+/gu, ' ').trim().slice(0, 30)}"`);
            // 퀴즈 문항은 한 블록이어도 본다(문항·보기·단추가 막대 위에서 끝나야 채점할 수 있다)
            return { hidden, single: content.length < 2 && !content.some((block) => block.hasAttribute('data-present-split')) };
          });
          if (!report.single) {
            expect(report.hidden, `${lesson} ${size.width}×${size.height} ${step}/${total}단계에서 막대에 가려진 블록`).toEqual([]);
          }
          if (step < total) {
            await page.keyboard.press('ArrowRight');
          }
        }
        await page.keyboard.press('Escape');
        await expect(page.locator('html')).not.toHaveAttribute('data-presenting');
      }
    }
  });

  // 판 1.3.0 검수 R1-073·R1-074·R1-076: 화면보다 긴 단계는 "아래에 더 있어요" 띠를 보이고, Space·PageDown이 한 화면 스크롤한 뒤 끝에서 다음 단계로 넘긴다.
  // 막대 높이(상태 글 2줄 높이를 늘 잡음)는 단계마다 같다. 1024×768(교실 프로젝터)에서 1-2-1을 한 단계씩 돌며 본다.
  test('긴 단계는 "아래에 더 있어요" 띠와 Space 스크롤이 있고, 막대 높이는 모든 단계에서 같다(1024×768)', async ({ page, isMobile }) => {
    test.skip(isMobile, '교실 프로젝터 크기(데스크톱)에서 본다');
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('./learn/u1/1-2-1/');
    await openPresentation(page);
    const total = Number(await page.locator('[data-lesson-present]').getAttribute('data-present-total'));
    expect(total).toBeGreaterThan(5);
    const more = page.locator('[data-present-more]');
    const barHeights = new Set<number>();
    let scrolledSteps = 0;
    for (let step = 1; step <= total; step += 1) {
      await expect(page.locator('[data-lesson-present]')).toHaveAttribute('data-present-step', String(step));
      barHeights.add(await page.locator('.lesson-present__bar').evaluate((element) => Math.round(element.getBoundingClientRect().height)));
      let advanced = false;
      if (await more.isVisible()) {
        scrolledSteps += 1;
        const label = (await status(page).textContent()) ?? '';
        const before = await page.evaluate(() => window.scrollY);
        await page.keyboard.press('Space');
        // Space는 다음 단계가 아니라 한 화면 스크롤이다
        expect(await page.evaluate(() => window.scrollY), `${step}/${total}단계에서 Space가 스크롤하지 않았다`).toBeGreaterThan(before);
        await expect(status(page)).toHaveText(label);
        for (let guard = 0; guard < 12 && (await more.isVisible()); guard += 1) {
          await page.keyboard.press('PageDown');
        }
        // 끝까지 내리면 띠가 사라지고, 한 번 더 누르면 다음 단계다
        await expect(more).toBeHidden();
        if (step < total) {
          await page.keyboard.press('Space');
          advanced = true;
        }
      }
      if (!advanced && step < total) {
        await page.keyboard.press('ArrowRight');
      }
    }
    test.info().annotations.push({ type: '아래에 더 있는 단계(Space로 스크롤)', description: String(scrolledSteps) });
    expect([...barHeights], '막대 높이는 단계마다 같다').toHaveLength(1);
  });

  // R1-078: 발표 중 Tab은 막대의 단추만 돌고, 쪽 맨 위의 [본문으로 건너뛰기]로 새지 않는다.
  test('수업 화면 중에는 [본문으로 건너뛰기]가 숨고 Tab이 슬라이드 밖으로 새지 않는다', async ({ page, isMobile }) => {
    test.skip(isMobile, '키보드 조작은 데스크톱에서 본다');
    await page.goto('./learn/u1/1-1-1/');
    await openPresentation(page);
    await expect(page.locator('.skip-link')).toBeHidden();
    for (let press = 0; press < 10; press += 1) {
      await page.keyboard.press('Tab');
      const where = await page.evaluate(() => {
        const active = document.activeElement;
        return { skip: active?.classList.contains('skip-link') ?? false, inSlide: Boolean(active?.closest('.lesson-present, .lesson-body, #main-content')) || active === document.body };
      });
      expect(where.skip, `${press + 1}번째 Tab이 건너뛰기 링크로 샜다`).toBe(false);
      expect(where.inSlide, `${press + 1}번째 Tab이 슬라이드 밖에 있다`).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).not.toHaveAttribute('data-presenting');
    await expect(page.locator('.skip-link')).toBeAttached();
  });

  test('막대의 단추로도 넘기고 끝내며, 수업 화면은 옆으로 넘치지 않는다', async ({ page }) => {
    await page.goto('./learn/u1/1-1-1/');
    await openPresentation(page);
    const bar = page.getByRole('toolbar', { name: '수업 화면 조작' });
    // 접근 이름은 기호 없이 "앞 단계"·"다음 단계"(R2-023). 첫 단계의 [앞 단계]는 aria-disabled(판 1.6.0 — 초점을 잃지 않게)
    const previous = bar.getByRole('button', { name: '앞 단계', exact: true });
    await expect(previous).toHaveAttribute('aria-disabled', 'true');
    const next = bar.getByRole('button', { name: '다음 단계', exact: true });
    // 따라하기 예제 단계가 나올 때까지 넘기며 단계마다 옆 넘침이 없는지 본다(단계 수는 화면 크기에 따라 달라진다 — 긴 칸을 더 나눔).
    let reached = 0;
    for (let step = 0; step < 30; step += 1) {
      await next.click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${step + 2}단계`).toBeLessThanOrEqual(0);
      if (await page.locator('.lesson-example').isVisible()) {
        reached = step + 2;
        break;
      }
    }
    expect(reached, '따라하기 예제 단계').toBeGreaterThan(2);
    // 막대 글에 어느 예제인지(예제 제목 — 20글자 안으로 줄임)가 보이고, 낭독 칸에는 칸·소제목까지 줄이지 않은 이름이 있다.
    // 막대가 좁으면(휴대폰) 이름을 더 줄인다(판 1.7.0 — STATUS_LABEL_LENGTHS)
    await expect(status(page)).toHaveText(new RegExp(`^${reached} \\/ \\d+ · 규칙대로[^·]*…$`, 'u'));
    await expect(announce(page)).toContainText('따라 하기 — 코드 읽기 · 규칙대로 정렬하기와 예시에서 배워 묶기');
    // 따라하기 예제 단계에서도 [이 자리에서 실습실 열기]를 쓸 수 있다(실습실은 누르기 전에 받지 않는다).
    await expect(page.locator('.lesson-example')).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);
    await previous.click();
    await expect(status(page)).toHaveText(new RegExp(`^${reached - 1} \\/ `, 'u'));
    await bar.getByRole('button', { name: '끝내기(Esc)' }).click();
    await expect(page.locator('html')).not.toHaveAttribute('data-presenting');
  });

});

test.describe('수업 화면 — 자바스크립트가 꺼져 있을 때', () => {
  test.use({ javaScriptEnabled: false });

  test('[수업 화면] 단추와 안내가 보이지 않는다(본문은 그대로 읽힌다)', async ({ page }) => {
    await page.goto('./learn/u1/1-1-1/');
    await expect(page.getByRole('button', { name: '수업 화면', exact: true })).toBeHidden();
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
    // 쪽 범위는 앞 0 없이(판 1.6.0 — display-names.ts)
    await expect(info.locator('[data-teacher-info="source"]')).toContainText('교과서 원고(8~12쪽)');
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

// 웹 차시의 "실제 키트 배선 보기"(판 1.4.0 C5): 그 차시의 회로 그림을 기본 닫힘 접기로. 배선이 없는 차시에는 없다.
test.describe('실제 키트 배선 보기', () => {
  test('2-1-2: 준비물 사진 줄 뒤에 닫힌 접기가 있고, 열면 회로 그림 두 장이 보인다', async ({ page }) => {
    await page.goto('./learn/u2/2-1-2/');
    await page.addStyleTag({ content: 'astro-dev-toolbar { display: none !important; }' });
    const details = page.locator('details.circuit-details');
    await expect(details).toHaveCount(1);
    await expect(details).not.toHaveAttribute('open', /.*/u);
    const summary = details.locator('summary');
    await expect(summary).toContainText('실제 키트 배선 보기');
    await expect(summary).toContainText('(2장)');
    // 닫혀 있는 동안 그림은 보이지 않는다
    await expect(details.locator('figure.book-circuit').first()).toBeHidden();
    // 키보드로 연다
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(details).toHaveAttribute('open', '');
    const figures = details.locator('figure.book-circuit');
    await expect(figures).toHaveCount(2);
    await figures.first().scrollIntoViewIfNeeded();
    await expect.poll(() => figures.first().locator('img').evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(figures.first().locator('figcaption')).toContainText('LCD를 21번(SDA)·22번(SCL) 핀에 연결해요.');
    await expect(figures.first().getByRole('link', { name: /그림 크게 보기/u })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('배선이 없는 차시(1-1-1·2-1-1)에는 접기가 없다', async ({ page }) => {
    for (const path of ['./learn/u1/1-1-1/', './learn/u2/2-1-1/']) {
      await page.goto(path);
      await expect(page.locator('details.circuit-details'), path).toHaveCount(0);
    }
  });
});

// 판 1.6.0(C174·C175) — 차시 머리 "이 차시에서 할 일" 카드, 긴 핵심 개념 접기, [선생님용] 단추와 교사용 접기 요약 줄·채점 기준, 수업 화면 속 실습실 한 화면.
test.describe('차시 첫 화면 — 이 차시에서 할 일 카드(C174)', () => {
  test('제목 바로 아래에 읽기·따라 하기·확인 세 칸이 있고, 누르면 그 칸으로 간다', async ({ page }) => {
    await page.goto('./learn/u1/1-1-1/');
    const tasks = page.getByRole('navigation', { name: '이 차시에서 할 일' });
    await expect(tasks).toBeVisible();
    await expect(tasks).toContainText('약 50분');
    const links = tasks.getByRole('link');
    await expect(links).toHaveCount(3);
    // 번호의 마침표는 CSS(::after)가 그려서 글자에는 번호·제목·설명이 띄어 이어진다
    await expect(links.nth(0)).toHaveText(/^1\s*읽기\s*개념 3가지$/u);
    await expect(links.nth(1)).toHaveText(/^2\s*따라 하기\s*예제 1개$/u);
    await expect(links.nth(2)).toHaveText(/^3\s*확인\s*퀴즈 3문제$/u);
    // 누를 곳은 손가락 크기(높이 44px 안팎 이상)
    for (const height of await links.evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height))) {
      expect(height).toBeGreaterThanOrEqual(43.5);
    }

    // 주소의 #위치는 한글이 %로 인코딩되어 보이므로 풀어서 본다
    const hash = () => decodeURIComponent(new URL(page.url()).hash);
    await links.nth(1).click();
    await expect.poll(hash).toBe('#따라-하기');
    await expect(page.getByRole('heading', { level: 2, name: '따라 하기' })).toBeInViewport();
    await tasks.scrollIntoViewIfNeeded();
    await links.nth(2).click();
    await expect.poll(hash).toBe('#확인-퀴즈');
    await expect(page.getByRole('heading', { level: 2, name: '확인 퀴즈' })).toBeInViewport();
  });

  test('휴대폰(375×812) 첫 화면에 제목과 세 칸이 함께 보인다', async ({ page, isMobile }) => {
    test.skip(!isMobile, '휴대폰 화면 시험');
    await page.goto('./learn/u1/1-1-1/');
    const viewportHeight = page.viewportSize()?.height ?? 812;
    await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
    const tasks = page.getByRole('navigation', { name: '이 차시에서 할 일' });
    const box = await tasks.boundingBox();
    expect(box, '카드 상자').not.toBeNull();
    expect((box?.y ?? 0) + (box?.height ?? 0), '카드 아래 끝이 첫 화면 안').toBeLessThanOrEqual(viewportHeight);
    // 세 칸이 한 줄에 나란히(줄바꿈 없이)
    const tops = await tasks.getByRole('link').evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(1);
  });

  test('수업 화면(발표 모드)과 실습실 임베드에서는 보이지 않는다', async ({ page }) => {
    await page.goto('./learn/u1/1-1-1/?embed=1');
    await expect(page.getByRole('navigation', { name: '이 차시에서 할 일' })).toBeHidden();
    await page.goto('./learn/u1/1-1-1/');
    await openPresentation(page);
    await expect(page.getByRole('navigation', { name: '이 차시에서 할 일' })).toBeHidden();
  });

  test('읽기 자료·대단원 마무리처럼 8칸 틀이 아닌 차시에는 카드가 없다', async ({ page }) => {
    await page.goto('./learn/u1/review/');
    await expect(page.getByRole('navigation', { name: '이 차시에서 할 일' })).toHaveCount(0);
  });
});

test.describe('긴 핵심 개념 접기(C174)', () => {
  test('소제목이 셋인 1-1-1은 첫 소제목만 펴 보이고, 나머지 둘은 접힌 상자 안에 있다 — 열면 보이고, #링크로 오면 저절로 열린다', async ({ page }) => {
    await page.goto('./learn/u1/1-1-1/');
    const fold = page.locator('details[data-concepts-fold]');
    await expect(fold).toHaveCount(1);
    await expect(fold).not.toHaveAttribute('open', /.*/u);
    await expect(fold.locator('summary')).toHaveText('개념 2가지 더 읽기: 기존 응용 프로그램과 인공지능 응용 프로그램 · 에이전트');
    await expect(page.getByRole('heading', { level: 3, name: '인공지능과 사람의 지능' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: '에이전트' })).toBeHidden();

    await fold.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(fold).toHaveAttribute('open', '');
    await expect(page.getByRole('heading', { level: 3, name: '에이전트' })).toBeVisible();

    // 주소의 #위치가 접힌 상자 안의 제목이면 상자를 열고 그 자리로 간다
    await page.goto('./learn/u1/1-1-1/#에이전트');
    await expect(page.locator('details[data-concepts-fold]')).toHaveAttribute('open', '');
    await expect(page.getByRole('heading', { level: 3, name: '에이전트' })).toBeInViewport();
  });

  test('수업 화면은 접기를 펼친 채 ### 제목마다 한 장씩 보이고, 끝내면 읽던 자리가 접기 안이라 연 채로 둔다', async ({ page }) => {
    await page.goto('./learn/u1/1-1-1/');
    const fold = page.locator('details[data-concepts-fold]');
    await expect(fold).not.toHaveAttribute('open', /.*/u);
    await openPresentation(page);
    await expect(fold).toHaveAttribute('open', '');
    // 앞 단계의 끝과 합쳐지면 "(이어서)"가 붙는다(수업 화면이 한 화면에 맞추며 나눈다)
    // 막대 글은 가장 가까운 이름(### 제목)만(판 1.6.0 R2 — shortStepLabel)
    const agent = /^\d+ \/ \d+ · 에이전트( \(이어서\))?$/u;
    for (let press = 0; press < 20 && !agent.test((await status(page).textContent()) ?? ''); press += 1) {
      await page.keyboard.press('ArrowRight');
    }
    await expect(status(page)).toHaveText(agent);
    await expect(page.getByRole('heading', { level: 3, name: '에이전트' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: '인공지능과 사람의 지능' })).toBeHidden();
    // 접기 제목 줄은 슬라이드에 나오지 않는다
    await expect(fold.locator('summary')).toBeHidden();

    await page.keyboard.press('Escape');
    await expect(page.locator('html')).not.toHaveAttribute('data-presenting', /.*/u);
    // 읽던 자리가 접기 안이라 닫으면 그 자리로 돌아갈 수 없으므로 연 채 둔다
    await expect(fold).toHaveAttribute('open', '');
    await expect(page.getByRole('heading', { level: 3, name: '에이전트' })).toBeInViewport();
  });

  test('수업 화면을 끝낼 때 읽던 자리가 접기 밖이면 처음처럼 닫는다', async ({ page }) => {
    await page.goto('./learn/u1/1-1-1/');
    await openPresentation(page);
    await expect(page.locator('details[data-concepts-fold]')).toHaveAttribute('open', '');
    await page.keyboard.press('Home');
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).not.toHaveAttribute('data-presenting', /.*/u);
    await expect(page.locator('details[data-concepts-fold]')).not.toHaveAttribute('open', /.*/u);
  });
});

test.describe('[선생님용] 단추와 교사용 접기 요약 줄(C175)', () => {
  test('차시 쪽: [선생님용]을 누르면 교사용 접기가 열리고 요약 줄(퀴즈 정답·평가 포인트·채점 기준·지도 요약)이 맨 위에 보인다', async ({ page }) => {
    await page.goto('./learn/u1/1-1-1/');
    const button = page.getByRole('link', { name: '선생님용' });
    await expect(button).toBeVisible();
    const details = page.locator('details.box--teacher');
    await expect(details).not.toHaveAttribute('open', /.*/u);
    await button.click();
    await expect(details).toHaveAttribute('open', '');
    await expect(details.locator('summary')).toBeFocused();
    await expect(details.locator('summary')).toBeInViewport();

    const summary = details.locator('[data-lesson-teacher-summary]');
    await expect(summary).toBeVisible();
    // 요약 줄은 접기 제목 줄 바로 아래(첫 내용)에 있다
    const firstIsSummary = await details.evaluate((element) => element.querySelector(':scope > summary + *')?.hasAttribute('data-lesson-teacher-summary'));
    expect(firstIsSummary).toBe(true);
    await expect(summary).toContainText('퀴즈 정답 3개');
    await expect(summary).toContainText('1번 ② 학습');
    await expect(summary).toContainText('3번 ② 액추에이터');
    for (const name of ['평가 포인트', '채점 기준', '지도 요약', '자주 막히는 곳']) {
      await expect(summary.getByRole('link', { name }), name).toBeVisible();
    }
    // 채점 기준 바로 가기 → 표(잘함·보통·노력 요함)
    await summary.getByRole('link', { name: '채점 기준' }).click();
    await expect(details.getByRole('heading', { level: 3, name: '채점 기준' })).toBeInViewport();
    const table = details.locator('table').filter({ hasText: '관찰 항목' });
    await expect(table.getByRole('columnheader')).toHaveText(['관찰 항목', '잘함', '보통', '노력 요함']);
    expect(await table.locator('tbody tr').count()).toBeGreaterThanOrEqual(2);
    expect(await table.locator('tbody tr').count()).toBeLessThanOrEqual(3);
  });

  test('교사용 접기가 있는 차시에는 짝 교과서 쪽이 없는 보충 차시에도 [선생님용]이 있다', async ({ page }) => {
    for (const path of ['./learn/u2/2-1-2/', './learn/u1/v4/']) {
      await page.goto(path);
      await expect(page.getByRole('link', { name: '선생님용' }), path).toHaveCount(1);
    }
  });

  test('교과서 쪽: [선생님용]이 짝 차시의 교사용 접기로 곧바로 가고, 짝 차시가 없는 쪽에는 단추가 없다', async ({ page }) => {
    await page.goto('./book/2-1-2/');
    const button = page.getByRole('link', { name: '선생님용' });
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute('href', withBase('learn/u2/2-1-2/#교사용'));
    await button.click();
    await expect(page).toHaveURL(/\/learn\/u2\/2-1-2\/#(교사용|%EA%B5%90%EC%82%AC%EC%9A%A9)$/u);
    await expect(page.locator('details.box--teacher')).toHaveAttribute('open', '');
    await expect(page.locator('[data-lesson-teacher-summary]')).toBeVisible();

    // 짝 웹 차시가 없는 교과서 쪽(표지·머리말)에는 단추가 없다
    await page.goto('./book/front/');
    await expect(page.getByRole('link', { name: '선생님용' })).toHaveCount(0);
  });

  test('수업 화면(발표 모드)에서는 [선생님용]도 교사용 접기도 보이지 않는다', async ({ page }) => {
    await page.goto('./learn/u1/1-1-1/');
    await openPresentation(page);
    await expect(page.getByRole('link', { name: '선생님용' })).toBeHidden();
    await expect(page.locator('details.box--teacher')).toBeHidden();
  });
});

test.describe('수업 화면 속 실습실 — [실행]과 결과가 한 화면(C175)', () => {
  test('발표 중에 연 실습실은 compact 모양이고, [실행]과 가상 보드 그림이 틀 안 한 화면에 들어온다 — 끝내면 compact가 풀린다', async ({ page, isMobile }) => {
    test.skip(isMobile, '프로젝터(넓은 화면) 시험');
    test.setTimeout(240_000);
    await page.goto('./learn/u2/2-1-2/');
    await openPresentation(page);
    const openButton = page.locator('[data-lesson-lab-open]').first();
    for (let press = 0; press < 80 && !(await openButton.isVisible()); press += 1) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(120);
    }
    await expect(openButton).toBeVisible();
    await openButton.click();

    const frameElement = page.locator('iframe.lesson-example__frame').first();
    await expect(frameElement).toBeVisible();
    const frame = page.frameLocator('iframe.lesson-example__frame').first();
    const run = frame.locator('[data-lab-run]').first();
    await expect(run).toBeVisible({ timeout: 90_000 });
    await expect(frame.locator('html')).toHaveAttribute('data-embed-compact', '');
    // 파이썬 엔진을 받는 동안에는 틀 위에 준비 패널이 더 보이므로, 준비가 끝난 뒤의 모습으로 잰다
    await expect(frame.locator('[data-lab-status]')).toContainText('준비됐어요', { timeout: 120_000 });
    // 준비가 끝나면 몇 초 뒤 준비 패널이 접힌다(1분 개념 카드가 있던 자리가 줄어든다)
    await expect(frame.locator('[data-loading-panel]')).toHaveAttribute('data-collapsed', 'true', { timeout: 30_000 });
    // 틀의 윗선이 화면 맨 위 근처이고, 틀의 아래 끝은 아래 막대 위다
    const viewport = page.viewportSize()?.height ?? 768;
    await expect.poll(async () => (await frameElement.boundingBox())?.y ?? 9999, { timeout: 10_000 }).toBeLessThan(60);
    const frameBox = await frameElement.boundingBox();
    const barTop = await page.locator('.lesson-present__bar').evaluate((element) => element.getBoundingClientRect().top);
    expect((frameBox?.y ?? 0) + (frameBox?.height ?? 0)).toBeLessThanOrEqual(barTop + 1);
    expect(frameBox?.height ?? 0).toBeLessThanOrEqual(viewport);

    // [실행]도 가상 보드 그림의 아래 끝도 틀(=화면) 안에 있다 — 한 화면에 [실행]과 결과(LCD)가 함께 보인다
    const runBox = await run.boundingBox();
    const stageBox = await frame.locator('[data-board-stage]').boundingBox();
    expect(runBox, '[실행] 자리').not.toBeNull();
    expect(stageBox, '가상 보드 그림 자리').not.toBeNull();
    expect(runBox?.y ?? 0).toBeGreaterThanOrEqual(frameBox?.y ?? 0);
    expect((stageBox?.y ?? 0) + (stageBox?.height ?? 0), '보드 그림 아래 끝이 틀 안').toBeLessThanOrEqual((frameBox?.y ?? 0) + (frameBox?.height ?? 0) + 1);
    // compact에서 줄인 안내(실습 방법 상자)는 틀 안에서 보이지 않는다
    await expect(frame.locator('[data-board-practice]')).toBeHidden();

    // 판 1.7.0(미해결 259): 가상 보드 그림(가상 LCD) 아래 끝이 아래 막대 위다 — 다시 걷기에서 LCD 아래 약 25px가 막대에 가렸다
    const svgBox = await frame.locator('[data-board-stage] svg.board-stage__svg').boundingBox();
    expect(svgBox, '가상 보드 그림').not.toBeNull();
    expect((svgBox?.y ?? 0) + (svgBox?.height ?? 0), '가상 보드 그림 아래 끝이 막대 위').toBeLessThanOrEqual(barTop + 1);
    // 틀이 화면 안이면 "아래에 더 있어요"는 뜨지 않는다(틀 아래 [실습실 접기] 줄은 세지 않는다 — 예전에는 알림이 보드 그림을 덮었다)
    await expect(page.locator('[data-present-more]')).toBeHidden();
    // compact에서는 예제 고르기·도구 단추를 접어 조작 줄이 [실행][정지][초기화] + 상태 줄이고, "입력과 출력" 칸 제목은 낭독기에만
    await expect(frame.locator('[data-lab-example-select]')).toBeHidden();
    await expect(frame.locator('[data-lab-share]')).toBeHidden();
    // 틀 안 문서를 내려도 [실행]이 틀 맨 위에 붙어 남는다(예전에는 화면 밖으로 사라졌다)
    expect(await frame.locator('[data-lab-bar]').evaluate((element) => getComputedStyle(element).position)).toBe('sticky');
    await frame.locator('html').evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' as ScrollBehavior }));
    await expect
      .poll(async () => {
        const box = await run.boundingBox();
        return box ? box.y >= (frameBox?.y ?? 0) - 1 && box.y + box.height <= (frameBox?.y ?? 0) + (frameBox?.height ?? 0) : false;
      })
      .toBe(true);
    await frame.locator('html').evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }));
    // 다른 단계에 갔다가 돌아와도 틀의 윗선이 화면 맨 위에 다시 맞춰진다(예전에는 단계를 다시 그리면 틀이 예제 제목 아래로 내려가 아래가 막대에 가렸다)
    await page.locator('[data-present-next]').click();
    await page.locator('[data-present-previous]').click();
    await expect.poll(async () => (await frameElement.boundingBox())?.y ?? 9999, { timeout: 10_000 }).toBeLessThan(60);
    const again = await frameElement.boundingBox();
    expect((again?.y ?? 0) + (again?.height ?? 0)).toBeLessThanOrEqual(barTop + 1);

    await page.keyboard.press('Escape');
    await expect(page.locator('html')).not.toHaveAttribute('data-presenting', /.*/u);
    await expect(frame.locator('html')).not.toHaveAttribute('data-embed-compact', /.*/u);
  });
});

// 판 1.7.0(PROGRESS 미해결 259·260·270·271 — 다시 걷기 walk-a11y-keyboard N1~N5·walk-teacher-new A2·N3)
test.describe('[수업 화면] 단추 자리(미해결 259)', () => {
  test('전환 줄 바로 아래 — 보드 차시(2-1-2)도 1366×768 첫 화면 안이고, 칩 줄·준비물 사진보다 앞이다', async ({ page, isMobile }) => {
    test.skip(isMobile, '교실 컴퓨터(1366×768) 첫 화면을 본다');
    await page.setViewportSize({ width: 1366, height: 768 });
    for (const path of ['./learn/u2/2-1-2/', './book/2-1-2/', './learn/u1/1-1-1/']) {
      await page.goto(path);
      const button = page.getByRole('button', { name: '수업 화면', exact: true });
      await expect(button, path).toBeVisible();
      const box = await button.boundingBox();
      expect((box?.y ?? 9999) + (box?.height ?? 0), `${path} [수업 화면] 아래 끝(예전 2-1-2는 y≈985)`).toBeLessThanOrEqual(768);
      const order = await page.evaluate(() => {
        const tools = document.querySelector('.lesson__tools');
        return [...document.querySelectorAll('.lesson-meta, .part-strip')].every(
          (later) => Boolean(tools && tools.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING),
        );
      });
      expect(order, `${path}: [수업 화면]이 칩 줄·준비물 사진 앞`).toBe(true);
    }
  });
});

test.describe('수업 화면 — 150% 확대(911×512)에서 넘치는 단계 0(미해결 260·270)', () => {
  test.skip(({ isMobile }) => isMobile, '데스크톱 창을 150%로 키운 화면을 본다(휴대폰은 다른 시험)');
  test.use(ZOOM_150);

  test('1-1-1 따라 하기: 모든 단계가 막대 위에서 끝나고 "아래에 더 있어요"가 없으며, 막대 글·마지막 단계 둘째 줄이 잘리지 않는다', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto('./learn/u1/1-1-1/');
    await openPresentationByButton(page);
    // 첫 장: 차시 제목이 보이고(학습 목표가 함께 들어가면 함께, 아니면 둘째 장이 학습 목표 — 어느 쪽이든 넘치지 않는다)
    await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
    const reports = await walkAllSteps(page, '/learn/u1/1-1-1/ 150%');
    test.info().annotations.push({ type: '단계 수', description: String(reports.length) });
  });

  test('슬라이드 안 단추(퀴즈 [답 확인하기])에 초점이 있을 때 →로 넘기면 초점이 새 단계의 첫 제목에 놓인다(N4 — 예전에는 보이지 않는 MAIN)', async ({ page }) => {
    await page.goto('./learn/u1/1-1-1/');
    await openPresentationByButton(page);
    const status = page.locator('[data-present-status]');
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowLeft');
    await expect(status).toHaveText(/확인 퀴즈 \(2\/3\)$/u);
    const check = page.locator('[data-quiz-item]:not([data-present-off]) [data-quiz-check]');
    await check.focus();
    await page.keyboard.press('ArrowRight');
    await expect(status).toHaveText(/확인 퀴즈 \(3\/3\)$/u);
    const heading = page.getByRole('heading', { level: 2, name: '확인 퀴즈' });
    await expect(heading).toBeFocused();
    await expect(heading).toBeInViewport();
    expect(await page.evaluate(() => document.activeElement?.matches(':focus-visible') ?? false), '초점 테두리가 보인다').toBe(true);
    // 제목에서는 ←·→가 그대로 단계를 넘기고, 같은 제목이 보이는 단계면 초점도 그대로다
    await page.keyboard.press('ArrowLeft');
    await expect(status).toHaveText(/확인 퀴즈 \(2\/3\)$/u);
    await expect(heading).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(status).toHaveText(/확인 퀴즈 \(3\/3\)$/u);
    // 다음 Tab은 새 문항 안(첫 보기)으로 간다
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[data-quiz-item]:not([data-present-off])')))).toBe(true);
  });
});

test.describe('수업 화면 — 단계 목록(미해결 271: 절 이름으로 건너뛰기)', () => {
  test('막대의 단계 이름을 누르면 칸 이름 목록이 열리고, 고르면 그 칸의 첫 단계·첫 제목으로 간다 — Esc는 목록만 닫는다', async ({ page, isMobile }) => {
    test.skip(isMobile, '키보드 조작은 데스크톱에서 본다');
    await page.goto('./learn/u1/1-1-1/');
    await openPresentationByButton(page);
    const present = page.locator('[data-lesson-present]');
    const toggle = page.getByRole('button', { name: /단계 목록 열기/u });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.focus();
    await page.keyboard.press('Enter');
    const list = page.getByRole('navigation', { name: /단계 목록/u });
    await expect(list).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const items = list.getByRole('button');
    // 지금 단계(1)가 든 항목에 초점, 표시는 aria-current="step"
    await expect(items.first()).toBeFocused();
    await expect(items.first()).toHaveAttribute('aria-current', 'step');
    const names = await items.evaluateAll((buttons) => buttons.map((button) => button.querySelector('span')?.textContent?.trim() ?? ''));
    for (const name of ['왜 배울까', '핵심 개념', '따라 하기', '확인 퀴즈']) {
      expect(names, name).toContain(name);
    }
    // 소제목(###)·퀴즈 문항은 따로 나오지 않는다 — 칸마다 하나
    expect(new Set(names).size).toBe(names.length);
    // ↓로 이웃 항목, 목록 안에서 →는 단계를 넘기지 않는다
    await page.keyboard.press('ArrowDown');
    await expect(items.nth(1)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(present).toHaveAttribute('data-present-step', '1');
    // Esc는 목록만 닫고 수업 화면은 그대로, 초점은 단계 이름 단추로
    await page.keyboard.press('Escape');
    await expect(list).toBeHidden();
    await expect(page.locator('html')).toHaveAttribute('data-presenting', '');
    await expect(toggle).toBeFocused();
    // 다시 열어 "확인 퀴즈"를 고르면 그 칸의 첫 단계로 가고, 초점은 그 칸 제목
    await toggle.click();
    await list.getByRole('button', { name: /^확인 퀴즈/u }).click();
    await expect(list).toBeHidden();
    await expect(page.locator('[data-present-status]')).toHaveText(/· 확인 퀴즈( \(1\/3\))?$/u);
    await expect(page.getByRole('heading', { level: 2, name: '확인 퀴즈' })).toBeFocused();
    // 목록 밖을 누르면 닫힌다. 목록은 막대 위 가운데에 슬라이드를 덮고 뜨므로(프로젝터용 큰 목록) 덮이지 않는 왼쪽 위 빈자리를 누른다
    // (통합 시험에서 슬라이드 제목을 눌렀더니 목록 항목이 그 자리를 덮어 클릭이 막혔다 — 덮는 것이 맞는 모습이라 시험을 고침)
    await toggle.click();
    await expect(list).toBeVisible();
    await page.mouse.click(8, 8);
    await expect(list).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).not.toHaveAttribute('data-presenting');
  });
});
