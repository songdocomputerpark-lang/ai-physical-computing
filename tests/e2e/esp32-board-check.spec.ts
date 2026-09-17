// 실물 점검 도우미 브라우저 테스트(PLAN §8.3 P3-11 — 완료 기준 "도우미가 모의 시리얼로 모든 항목을 끝까지 진행한다").
// 실제 보드 대신 모의 시리얼(tests/e2e/helpers/serial.ts)을 쓴다 — 모의 보드에서 된다는 것은 실물의 증거가 아니다(운영자 할 일 2번).
// 확인하는 것
//  1. 처음 화면: 항목 카드가 모두 그려지고(배선 그림·보낼 코드·질문), 판정이 "아직"으로 시작한다.
//  2. 모든 항목을 끝까지: [보드 연결] 한 번 → 항목마다 [보드에 보내기] → 코드가 보드에서 돌고(executed) → 질문에 예로 답 → 판정 "예(같음)".
//  3. 라이브러리가 필요한 항목은 보드에 파일을 먼저 올린다(보드 파일 목록에 생김).
//  4. input()을 쓰는 항목은 실행 중에 입력줄이 열리고, 적은 줄이 보드로 가며 되울림이 한 번만 보인다.
//  5. [결과 복사]가 PROGRESS.md에 붙일 표를 만들고, 답은 새로고침 뒤에도 남는다. [이 컴퓨터에서 내 기록 지우기]로 지워진다.
//  6. 휴대폰 폭(375px)에서 가로 넘침이 없다.
import { expect, test, type Page } from '@playwright/test';
import { CHECK_ITEMS, wiringItems } from '../../src/lab/esp32/check/items.ts';
import { withBase } from '../../src/lib/url.ts';
import { installSerialMock, serialMock, utf8Text } from './helpers/serial.ts';

const CHECK_PATH = withBase('labs/esp32/check/');
/** 개발 서버가 페이지를 처음 옮기는 시간까지(Vite 변환) 넉넉히 */
const PAGE_TIMEOUT = 120_000;
/** 판별·실행(모의 보드는 명령마다 raw-paste를 주고받는다) */
const BOARD_TIMEOUT = 30_000;

/** 항목 코드가 스스로 끝나게: time.sleep을 건너뛰는 보드 흉내(모의 보드의 mini-python은 sleep을 실제로 기다린다) */
async function openCheckPage(page: Page): Promise<void> {
  await installSerialMock(page, { ports: [{ id: 'board', usb: 'ch340', device: 'micropython', granted: false }] });
  await page.goto(CHECK_PATH);
  await expect(page.locator('[data-board-check]')).toHaveAttribute('data-check-ready', 'yes', { timeout: PAGE_TIMEOUT });
}

function card(page: Page, id: string) {
  return page.locator(`[data-check-item="${id}"]`);
}

async function connect(page: Page): Promise<void> {
  const board = serialMock(page);
  await board.chooseNext('board');
  await page.getByRole('button', { name: '보드 연결' }).click();
  await expect(page.locator('[data-board-check]')).toHaveAttribute('data-check-state', 'ready', { timeout: BOARD_TIMEOUT });
}

test.describe('실물 점검 도우미', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 900, '데스크톱 폭에서만 보는 검사');

  test('항목 카드가 모두 그려지고, 배선이 있는 항목에는 배선 그림과 핀 목록이 보인다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openCheckPage(page);

    await expect(page.locator('[data-check-item]')).toHaveCount(CHECK_ITEMS.length);
    await expect(page.locator('[data-check-progress]')).toContainText(`${CHECK_ITEMS.length}개 항목 가운데 0개에 답했어요`);

    for (const item of CHECK_ITEMS) {
      const box = card(page, item.id);
      await expect(box).toHaveAttribute('data-verdict', 'todo');
      await expect(box.locator('[data-check-verdict]')).toHaveText('아직');
      await expect(box).toContainText(item.title);
      await expect(box).toContainText(`예상 ${item.minutes}분(추정)`);
      await expect(box.locator('[data-check-code]')).toContainText(item.code.split('\n')[0]!);
      await expect(box.locator('.board-check__question')).toHaveCount(item.questions.length);
    }

    // 배선이 있는 항목: 보드 그림(SVG)과 부품·핀 목록
    const wired = wiringItems();
    expect(wired.length).toBeGreaterThan(5);
    for (const item of wired) {
      const figure = card(page, item.id).locator('[data-check-figure]');
      await expect(figure.locator('svg')).toHaveCount(1);
      // 그림 안에 그 부품이 놓였다(배선 id로)
      for (const entry of item.wiring) {
        const partId = entry.id ?? entry.part;
        await expect(figure.locator(`[data-board-part="${partId}"]`)).toHaveCount(1);
      }
      await expect(figure.locator('.board-check__pins li').first()).toContainText('GPIO');
    }
    // 배선이 없는 항목에는 그림이 없다
    await expect(card(page, 'float-time').locator('[data-check-figure]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('모의 보드로 모든 항목을 끝까지 진행하고 [결과 복사]가 표를 만든다', async ({ page }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openCheckPage(page);
    const board = serialMock(page);
    await connect(page);
    await expect(page.locator('[data-check-info]')).toContainText('MicroPython v1.29.0');

    for (const item of CHECK_ITEMS) {
      const box = card(page, item.id);
      await box.scrollIntoViewIfNeeded();
      const send = box.locator('[data-check-send]');
      await expect(send).toBeEnabled({ timeout: BOARD_TIMEOUT });
      await send.click();

      if (item.code.includes('input(')) {
        // 실행 중에 입력줄이 열린다 — 두 물음에 답한다
        const field = page.locator('[data-check-input-field]');
        await expect(field).toBeVisible({ timeout: BOARD_TIMEOUT });
        await field.fill('Kim');
        await field.press('Enter');
        await expect(field).toBeVisible();
        await field.fill('철수');
        await field.press('Enter');
      }

      await expect(box.locator('[data-check-result]')).not.toHaveText('', { timeout: BOARD_TIMEOUT });
      await expect(box.locator('[data-check-result]')).not.toContainText('보내는 중', { timeout: BOARD_TIMEOUT });

      // 질문에 모두 "예"로 답하면 판정이 예(같음)
      for (const question of item.questions) {
        await box.locator(`input[data-check-answer="${item.id}:${question.id}"][value="yes"]`).check();
      }
      await expect(box).toHaveAttribute('data-verdict', 'yes');
      await box.locator('[data-check-note]').fill(`${item.id} 메모`);
      await box.locator('[data-check-note]').blur();
    }

    // 모든 항목의 코드가 보드에서 돌았다
    const executed = await board.executed();
    const sent = executed.filter((entry) => entry.via === 'raw-paste' || entry.via === 'raw').map((entry) => entry.code);
    for (const item of CHECK_ITEMS) {
      const firstLine = item.code.split('\n')[0]!;
      expect(sent.some((code) => code.includes(firstLine)), `${item.id}의 코드가 보드에 가지 않았어요`).toBe(true);
    }

    // 라이브러리가 필요한 항목은 보드 뿌리에 파일을 먼저 올렸다
    const files = await board.files();
    for (const name of new Set(CHECK_ITEMS.flatMap((item) => item.libraries ?? []))) {
      expect(Object.keys(files), `${name}.py를 보드에 올리지 않았어요`).toContain(`${name}.py`);
    }

    // input() 항목: 보드로 간 글자는 영어만(한글은 빠짐), 콘솔 되울림은 한 번
    const written = utf8Text(await board.writtenText());
    expect(written).toContain('Kim\r');
    expect(written).not.toContain('철수');
    const consoleText = (await page.locator('[data-check-console]').textContent()) ?? '';
    expect(consoleText.split('Kim').length - 1).toBeGreaterThanOrEqual(1);
    expect(consoleText).toContain('영어·숫자·기호만 받아요');

    await expect(page.locator('[data-board-check]')).toHaveAttribute('data-check-answered', String(CHECK_ITEMS.length));
    await expect(page.locator('[data-check-progress]')).toContainText(`${CHECK_ITEMS.length}개에 답했어요`);

    // [결과 복사]: 붙일 글이 보인다
    await page.locator('[data-check-copy]').click();
    const report = page.locator('[data-check-report]');
    await expect(report).toBeVisible();
    const text = await report.inputValue();
    expect(text).toContain('### 실물 점검 도우미 결과');
    expect(text).toContain('| 부록 B-2 | 항목 | 판정 | 메모 |');
    for (const item of CHECK_ITEMS) {
      expect(text).toContain(`| ${item.b2} | ${item.title} | 예(같음) | ${item.id} 메모 |`);
    }
    expect(errors).toEqual([]);
  });

  test('답은 새로고침 뒤에도 남고 [이 컴퓨터에서 내 기록 지우기]로 지워진다', async ({ page }) => {
    await openCheckPage(page);
    const item = CHECK_ITEMS[0]!;
    const box = card(page, item.id);
    await box.locator(`input[data-check-answer="${item.id}:${item.questions[0]!.id}"][value="no"]`).check();
    await box.locator('[data-check-note]').fill('실물에서는 달랐어요');
    await box.locator('[data-check-note]').blur();
    await expect(box).toHaveAttribute('data-verdict', 'different');

    await page.reload();
    await expect(page.locator('[data-board-check]')).toHaveAttribute('data-check-ready', 'yes', { timeout: PAGE_TIMEOUT });
    const again = card(page, item.id);
    await expect(again).toHaveAttribute('data-verdict', 'different');
    await expect(again.locator('[data-check-note]')).toHaveValue('실물에서는 달랐어요');

    await page.locator('[data-clear-records-open]').first().click();
    await page.locator('[data-clear-records-confirm]').click();
    await expect(again).toHaveAttribute('data-verdict', 'todo', { timeout: 10_000 });
    await expect(again.locator('[data-check-note]')).toHaveValue('');
    await expect(page.locator('[data-board-check]')).toHaveAttribute('data-check-answered', '0');
  });
});

test.describe('실물 점검 도우미(휴대폰 폭)', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 900, '좁은 화면에서만 보는 검사');

  test('375px에서 가로 넘침이 없다', async ({ page }) => {
    await openCheckPage(page);
    await card(page, 'touch').scrollIntoViewIfNeeded();
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    await expect(card(page, 'touch').locator('[data-check-figure] svg')).toBeVisible();
  });
});
