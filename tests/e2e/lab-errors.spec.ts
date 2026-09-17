// 한국어 오류 사전(P2-06) 브라우저 테스트 — 실습실에서 오류가 나면 콘솔 위에 한국어 풀이 카드가 열리고,
// 오류가 난 줄이 편집칸에 표시되며, 콘솔의 긴 트레이스백이 짧게 정리되는지 확인한다.
// 사전 페이지(/help/errors/)가 같은 데이터로 만들어지고 카드의 링크가 그 항목으로 가는지도 본다.
//
// 개발용 시험 페이지(/labs/dev/runtime/)에서 돌린다 — 카메라 없이 파이썬만 있으면 되기 때문이다.
// 이 페이지에는 다른 흉내 모듈(hello 등)도 붙으므로, 페이지 오류 검사는 이 모듈(src/lab/modules/errors/) 것만 본다.
import { expect, test, type Page } from '@playwright/test';
import { editorContent, editorText, labRoot, openLabAndWaitReady, waitDone } from './helpers/lab.ts';
import { withBase } from '../../src/lib/url.ts';

const NAME_ERROR_CODE = ["print('시작')", 'print(total)'].join('\n');

function card(page: Page) {
  return page.locator('[data-errors-card]');
}

function consoleText(page: Page) {
  return page.locator('[data-lab-console]');
}

/**
 * 코드를 통째로 바꾼다.
 *
 * 공용 도구의 setEditorCode(contenteditable에 fill)는 모바일(Pixel 5 흉내, isMobile)에서 앞 코드를 지우지 못하고 **뒤에 붙이는** 일이 잦았다
 * (2026-09-16 실측: 같은 코드가 세 번 이어 붙음 → 엉뚱한 SyntaxError). 브라우저가 고른 선택 영역이 CodeMirror 안쪽 상태와 어긋나기 때문으로,
 * 대신 CodeMirror가 스스로 처리하는 키(Ctrl+A → Backspace)로 비운 뒤 insertText로 넣으면 데스크톱·모바일 모두 한 번에 들어간다
 * (붙여넣기와 같은 방식이라 자동 들여쓰기도 끼어들지 않는다). 이 spec은 코드와 오류 종류가 정확히 맞아야 하는 검사라서 넣은 뒤 확인한다.
 */
async function setCode(page: Page, code: string): Promise<void> {
  const content = editorContent(page);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await content.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.insertText(code);
    if ((await editorText(page)).replace(/\n+$/u, '') === code) {
      return;
    }
  }
  expect((await editorText(page)).replace(/\n+$/u, ''), '편집칸에 코드를 넣지 못했어요').toBe(code);
}

/** 코드를 넣고 [실행]을 누른다(공용 runCode와 같지만 위의 확인이 붙는다). */
async function runCode(page: Page, code: string): Promise<void> {
  await setCode(page, code);
  await page.getByRole('button', { name: '실행', exact: true }).click();
}

test.describe('오류 풀이 카드', () => {
  // Pyodide를 CDN에서 받는 시간(첫 실행 약 6MB)이 걸려 기본 30초로는 모자란다(lab-runtime.spec.ts와 같은 값).
  test.describe.configure({ timeout: 180_000 });

  test('NameError 코드를 실행하면 한국어 풀이와 줄 표시가 나온다', async ({ page }) => {
    const moduleErrors: string[] = [];
    page.on('pageerror', (error) => {
      if (`${error.message}\n${error.stack ?? ''}`.includes('modules/errors')) {
        moduleErrors.push(error.message);
      }
    });
    await openLabAndWaitReady(page);

    // 모듈이 붙었지만 카드는 오류가 나기 전까지 보이지 않는다.
    await expect(labRoot(page)).toHaveAttribute('data-lab-modules', /\berrors\b/u);
    await expect(card(page)).toBeHidden();

    await runCode(page, NAME_ERROR_CODE);
    expect(await waitDone(page)).toBe('error');

    // ① 카드가 열리고 사전의 name-error 항목이 붙는다. 조작 줄 아래 안내 줄에도 "오류로 끝났다"가 적히고,
    //    카드가 첫 화면 밖이면 화면이 카드로 내려간다(2026-09-17 검토 반영 — 전에는 카드가 문서 y≈2,900px에 열려 보이지 않았다).
    await expect(card(page)).toBeVisible();
    await expect(page.locator('[data-lab-message]')).toContainText('오류로 끝났어요: NameError');
    await expect(page.locator('[data-lab-message]')).toContainText('2번째 줄');
    await expect(card(page)).toBeInViewport();
    await expect(card(page)).toHaveAttribute('data-errors-entry', 'name-error');
    await expect(card(page)).toHaveAttribute('data-errors-kind', 'error');
    await expect(card(page)).toHaveAttribute('data-errors-line', '2');
    await expect(page.locator('[data-errors-type]')).toHaveText('NameError');
    await expect(page.locator('[data-errors-title]')).toHaveText('정해 준 적이 없는 이름을 썼어요');
    await expect(page.locator('[data-errors-meaning]')).toContainText("'total'");
    await expect(page.locator('[data-errors-where-text]')).toHaveText('내 코드 2번째 줄');
    await expect(page.locator('[data-errors-fix] li').first()).toContainText('2번째 줄');
    await expect(page.locator('[data-errors-mistakes] li').first()).toBeVisible();

    // ② 편집칸의 2번째 줄이 표시된다
    const highlighted = page.locator('[data-lab-editor] .cm-apc-error-line');
    await expect(highlighted).toHaveCount(1);
    await expect(highlighted).toContainText('print(total)');

    // ③ 콘솔: 한 줄 요약 + 파이썬 안쪽 단계를 뺀 짧은 트레이스백(원문은 카드 접기 안에)
    await expect(consoleText(page)).toContainText('[오류 풀이] NameError — 정해 준 적이 없는 이름을 썼어요');
    const text = (await consoleText(page).textContent()) ?? '';
    expect(text).toContain('시작'); // 오류 전에 찍은 출력은 그대로
    expect(text).toContain('File "main.py", line 2, in <module>');
    expect(text).not.toContain('_pyodide');
    expect(text).toContain("NameError: name 'total' is not defined");
    const raw = (await page.locator('[data-errors-traceback]').textContent()) ?? '';
    expect(raw).toContain('_pyodide');
    await expect(page.locator('[data-errors-hidden-note]')).toContainText('짧은 내용');

    // ④ 사전 링크가 그 항목으로 간다
    await expect(page.locator('[data-errors-link]')).toHaveAttribute('href', `${withBase('help/errors/')}#name-error`);

    // ⑤ 카드 단추가 실제로 꾸며져 있다(모듈 패널에는 LabShell의 범위 스타일이 닿지 않아, 클래스를 잘못 쓰면 기본 단추로 보인다)
    const goto = page.locator('[data-errors-goto]');
    const gotoBox = await goto.boundingBox();
    expect(gotoBox?.height ?? 0, '[그 줄로 가기] 단추가 손가락 기준 높이(44px)보다 낮아요').toBeGreaterThanOrEqual(40);
    const borderWidth = await goto.evaluate((element) => getComputedStyle(element).borderTopWidth);
    expect(borderWidth, '단추에 사이트 스타일(.button)이 걸리지 않았어요').not.toBe('0px');
    expect(moduleErrors).toEqual([]);
  });

  test('[그 줄로 가기]를 누르면 편집칸의 그 줄로 커서가 간다', async ({ page }) => {
    await openLabAndWaitReady(page);
    await runCode(page, ['def show():', '    return total + 1', '', '', 'show()'].join('\n'));
    expect(await waitDone(page)).toBe('error');
    await expect(card(page)).toHaveAttribute('data-errors-line', '2');
    await expect(page.locator('[data-errors-where-text]')).toHaveText('내 코드 2번째 줄(함수 show 안)');

    await page.locator('[data-errors-goto]').click();
    const focusedInEditor = await page.evaluate(() => Boolean(document.activeElement?.closest('[data-lab-editor]')));
    expect(focusedInEditor).toBe(true);
    await expect(page.locator('[data-lab-editor] .cm-activeLine')).toContainText('return total + 1');
  });

  test('다음 실행을 시작하면 카드와 줄 표시가 사라진다', async ({ page }) => {
    await openLabAndWaitReady(page);
    await runCode(page, NAME_ERROR_CODE);
    expect(await waitDone(page)).toBe('error');
    await expect(card(page)).toBeVisible();

    await runCode(page, "print('이번엔 잘 돌아요')");
    expect(await waitDone(page)).toBe('ok');
    await expect(card(page)).toBeHidden();
    await expect(page.locator('[data-lab-editor] .cm-apc-error-line')).toHaveCount(0);
  });

  test('[정지]로 멈추면 오류가 아니라고 알려 준다', async ({ page }) => {
    await openLabAndWaitReady(page);
    await runCode(page, ['import time', '', 'while True:', "    print('돌고 있어요')", '    time.sleep(0.2)'].join('\n'));
    await expect(labRoot(page)).toHaveAttribute('data-state', 'running');
    await page.getByRole('button', { name: '정지', exact: true }).click();
    expect(await waitDone(page)).toBe('stopped');

    await expect(card(page)).toBeVisible();
    await expect(card(page)).toHaveAttribute('data-errors-entry', 'keyboard-interrupt');
    await expect(card(page)).toHaveAttribute('data-errors-kind', 'stopped');
    await expect(page.locator('[data-errors-type]')).toHaveText('정지');
    await expect(page.locator('[data-errors-title]')).toContainText('오류가 아니에요');
    await expect(page.locator('[data-errors-details]')).toBeHidden();

    // [닫기]로 접을 수 있다
    await page.locator('[data-errors-close]').click();
    await expect(card(page)).toBeHidden();
  });

  test('사전에 있는 다른 오류들도 각각 다른 풀이가 붙는다', async ({ page }) => {
    await openLabAndWaitReady(page);
    const cases: [string, string, string][] = [
      ['x = 1\nif x = 1:\n    print(1)', 'syntax-assign-compare', 'SyntaxError'],
      ["nums = [1, 2, 3]\nprint(nums[5])", 'index-error', 'IndexError'],
      ["print('개수: ' + 3)", 'type-error-str-int', 'TypeError'],
      ['print(10 / 0)', 'zero-division', 'ZeroDivisionError'],
      ['import cv3', 'module-not-found', 'ModuleNotFoundError'],
    ];
    for (const [code, entryId, typeLabel] of cases) {
      await runCode(page, code);
      expect(await waitDone(page), code).toBe('error');
      await expect(card(page), code).toHaveAttribute('data-errors-entry', entryId);
      await expect(page.locator('[data-errors-type]'), code).toHaveText(typeLabel);
      await expect(page.locator('[data-errors-fix] li').first(), code).not.toBeEmpty();
    }
  });

  test('모바일 폭에서도 카드가 넘치지 않는다', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', '모바일 프로젝트에서만 본다');
    await openLabAndWaitReady(page);
    await runCode(page, NAME_ERROR_CODE);
    expect(await waitDone(page)).toBe('error');
    await expect(card(page)).toBeVisible();
    const overflow = async () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);
    const box = await card(page).boundingBox();
    expect(box?.width ?? 0).toBeLessThanOrEqual(375);

    // 긴 트레이스백을 펼쳐도 화면이 옆으로 밀리지 않는다(글상자 안에서만 좌우로 스크롤된다)
    await page.locator('[data-errors-details] summary').click();
    await expect(page.locator('[data-errors-traceback]')).toBeVisible();
    expect(await overflow(), '트레이스백을 펼치면 화면이 옆으로 넘쳐요').toBeLessThanOrEqual(0);
    const pre = await page.locator('[data-errors-traceback]').evaluate((element) => ({
      width: element.getBoundingClientRect().width,
      scrollWidth: element.scrollWidth,
    }));
    expect(pre.width).toBeLessThanOrEqual(375);
    expect(pre.scrollWidth).toBeGreaterThan(pre.width);
  });
});

test.describe('오류 사전 페이지', () => {
  test.describe.configure({ timeout: 180_000 });

  test('실습실과 같은 데이터로 만들어지고 항목으로 바로 갈 수 있다', async ({ page }) => {
    const response = await page.goto(withBase('help/errors/'));
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('파이썬 오류 사전');
    await expect(page.locator('h3#name-error')).toHaveText('정해 준 적이 없는 이름을 썼어요');
    await expect(page.locator('h3#cv2-empty-image')).toBeVisible();
    await expect(page.locator('h3#keyboard-interrupt')).toBeVisible();
    // 항목 수(묶음 목차의 안내 글)와 실제 항목 수가 같다
    const count = await page.locator('article.errors-entry').count();
    expect(count).toBeGreaterThanOrEqual(15);
    await expect(page.locator('.errors-index__count')).toHaveText(`오류 풀이 ${count}개`);
    // 긴 오류 메시지·보기 코드가 있어도 페이지가 옆으로 넘치지 않는다(코드 상자 안에서만 좌우 스크롤)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    // 실습실 카드가 보내는 주소로 열면 그 항목이 화면에 보이고, 그 항목의 설명(왜·고치는 법)이 펼쳐져 있다
    await page.goto(`${withBase('help/errors/')}#index-error`);
    await expect(page.locator('h3#index-error')).toBeInViewport();
    await expect(page.locator('[data-errors-entry-item="index-error"] [data-errors-more]')).toHaveAttribute('open', '');
  });

  test('항목 설명은 접혀 있고, 찾기 칸으로 오류 이름·낱말을 거를 수 있다(2026-09-17 검토 반영)', async ({ page }) => {
    await page.goto(withBase('help/errors/'));
    const entries = page.locator('article.errors-entry');
    const total = await entries.count();
    // 처음에는 모든 항목의 설명이 접혀 있어 쪽이 짧다(47항목을 다 펼치면 데스크톱 38,899px이었다).
    await expect(page.locator('[data-errors-more][open]')).toHaveCount(0);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(height, '쪽 높이').toBeLessThan(test.info().project.name === 'mobile' ? 30_000 : 20_000);

    // 오류 이름으로 찾으면 그 항목만 남고, 하나뿐이면 설명이 펼쳐진다.
    const finder = page.getByRole('searchbox', { name: '오류 이름이나 낱말로 찾기' });
    await expect(finder).toBeVisible();
    await finder.fill('ZeroDivisionError');
    await expect(page.locator('article.errors-entry:visible')).toHaveCount(1);
    await expect(page.locator('article.errors-entry:visible [data-errors-more]')).toHaveAttribute('open', '');
    await expect(page.locator('[data-errors-find-count]')).toHaveText(`${total}개 가운데 1개를 찾았어요.`);

    // 한국어 낱말로도 찾고, 없으면 한국어로 알린다. 칸을 비우면 모두 돌아온다.
    await finder.fill('들여쓰기');
    expect(await page.locator('article.errors-entry:visible').count()).toBeGreaterThanOrEqual(1);
    await finder.fill('zzzz없는낱말');
    await expect(page.locator('article.errors-entry:visible')).toHaveCount(0);
    await expect(page.locator('[data-errors-find-count]')).toContainText('맞는 풀이가 없어요');
    await finder.fill('');
    await expect(page.locator('article.errors-entry:visible')).toHaveCount(total);

    // 접힌 설명은 눌러서 펼친다(자바스크립트 없이도 되는 <details>).
    const nameError = page.locator('[data-errors-entry-item="name-error"]');
    await nameError.getByText('왜 났는지와 고치는 법 보기').click();
    await expect(nameError.locator('[data-errors-more]')).toHaveAttribute('open', '');
    await expect(nameError).toContainText('이렇게 고쳐요');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('실습실 카드의 링크로 사전 항목까지 이어진다', async ({ page }) => {
    await openLabAndWaitReady(page);
    await runCode(page, NAME_ERROR_CODE);
    expect(await waitDone(page)).toBe('error');
    await page.locator('[data-errors-link]').click();
    await expect(page).toHaveURL(new RegExp(`${withBase('help/errors/')}#name-error$`, 'u'));
    await expect(page.locator('h3#name-error')).toBeInViewport();
  });
});

test.describe('화면 확인용 스크린숏', () => {
  test.describe.configure({ timeout: 180_000 });

  test('카드가 열린 실습실을 찍어 둔다', async ({ page }, testInfo) => {
    await openLabAndWaitReady(page);
    await runCode(page, NAME_ERROR_CODE);
    expect(await waitDone(page)).toBe('error');
    await expect(card(page)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`errors-card-${testInfo.project.name}.png`), fullPage: true });
    await page.goto(withBase('help/errors/'));
    await page.screenshot({ path: testInfo.outputPath(`errors-dictionary-${testInfo.project.name}.png`), fullPage: false });
  });
});
