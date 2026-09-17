// 코드 에디터와 실습실 공통 조작 브라우저 테스트(PLAN §8.2 P2-02 완료 기준): 개발용 시험 페이지(/labs/dev/runtime/)에서
// 입력 → 새로고침 복원, 공유 링크를 새 탭에서 열면 같은 코드, 기록 지우기 뒤 이 사이트 이름의 저장값 0개,
// 키보드만으로 [실행]·[정지](Tab·Enter, Esc 뒤 Tab으로 편집칸 나가기), 글자 크기, [초기화], [예제 불러오기], [.py 내려받기]를 확인한다.
// 실행: npx playwright test tests/e2e/lab-editor.spec.ts — 키보드 실행·정지 테스트만 Pyodide(jsDelivr)를 받는다.
import { expect, test } from '@playwright/test';
import { STORAGE_KEY_PREFIX } from '../../src/lib/storage.ts';
import { DEV_LAB_PATH, editorContent, editorText, labRoot, openLabAndWaitReady, ourStorageKeys, setEditorCode, waitDone } from './helpers/lab.ts';

const HELLO_CODE = "print('안녕')\n";
const SAVE_TIMEOUT = 5_000;

test.describe('코드 에디터(개발용 시험 페이지)', () => {
  test.skip(({ isMobile }) => isMobile, '편집·저장 동작은 데스크톱 화면에서 확인한다(좁은 화면은 lab-runtime.spec.ts)');

  test('CodeMirror 편집칸이 뜨고 첫 예제 코드·줄 번호·구문 색이 보이며, 자리 글은 코드를 비웠을 때만 보인다', async ({ page }) => {
    const response = await page.goto(DEV_LAB_PATH);
    expect(response?.status()).toBe(200);
    await expect(editorContent(page)).toBeVisible();
    await expect(editorContent(page)).toHaveAttribute('aria-label', '파이썬 코드');
    await expect(labRoot(page)).toHaveAttribute('data-example', 'hello');
    expect(await editorText(page)).toBe(HELLO_CODE);
    await expect(page.locator('[data-lab-editor] .cm-lineNumbers .cm-gutterElement').filter({ hasText: '1' }).first()).toBeVisible();
    // print 는 함수 이름 색, '안녕' 은 문자열 색(theme.ts)으로 칠해진다.
    const colors = await page.locator('[data-lab-editor] .cm-line').first().locator('span').evaluateAll((spans) =>
      spans.map((span) => `${span.textContent}=${getComputedStyle(span).color}`),
    );
    expect(colors.some((item) => item.startsWith('print=rgb(98, 44, 188)'))).toBe(true);
    expect(colors.some((item) => item.includes("'안녕'=rgb(3, 37, 99)"))).toBe(true);

    await expect(page.locator('[data-lab-editor] .cm-placeholder')).toHaveCount(0);
    await setEditorCode(page, '');
    await expect(page.locator('[data-lab-editor] .cm-placeholder')).toBeVisible();
  });

  test('입력한 코드가 자동 저장되어 새로고침해도 남고, 저장 이름은 이 사이트 머리말 + 예제 id다', async ({ page }) => {
    await page.goto(DEV_LAB_PATH);
    const code = `print('자동 저장 ${Date.now()}')\nfor i in range(3):\n    print(i)\n`;
    await setEditorCode(page, code);
    await expect(labRoot(page)).toHaveAttribute('data-save-state', 'saved', { timeout: SAVE_TIMEOUT });
    await expect(page.locator('[data-lab-save]')).toHaveText('저장됨');
    const keys = await ourStorageKeys(page, STORAGE_KEY_PREFIX);
    expect(keys.local).toContain(`${STORAGE_KEY_PREFIX}editor:dev:hello`);

    await page.reload();
    await expect(editorContent(page)).toBeVisible();
    expect(await editorText(page)).toBe(code);
    await expect(labRoot(page)).toHaveAttribute('data-save-state', 'saved');
  });

  test('[공유 링크]가 주소 # 뒤에 코드를 담고, 새 탭에서 열면 같은 코드가 들어가며 #은 지워진다', async ({ page, context }) => {
    await page.goto(DEV_LAB_PATH);
    const code = "import time\n# 공유 링크 시험 ++\nfor i in range(3):\n    print('공유', i)\n";
    await setEditorCode(page, code);
    await page.getByRole('button', { name: '공유 링크', exact: true }).click();
    const dialog = page.locator('[data-lab-share-dialog]');
    await expect(dialog).toBeVisible();
    const url = await page.locator('[data-lab-share-url]').inputValue();
    const pageUrl = new URL(page.url());
    expect(url.startsWith(`${pageUrl.origin}${pageUrl.pathname}#code=`)).toBe(true);
    expect(url).toContain('&ex=hello');
    await expect(page.locator('[data-lab-share-note]')).toContainText('자.');
    // 코드에 적은 개인정보는 링크를 받는 사람에게 모두 보인다는 주의가 창 안에 있다(2026-09-17 검토 반영).
    await expect(dialog).toContainText('코드에 적은 이름·학번·비밀번호는 링크를 받는 사람이 모두 볼 수 있어요');
    await page.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(dialog).toBeHidden();

    const other = await context.newPage();
    await other.goto(url);
    await expect(editorContent(other)).toBeVisible();
    await expect(labRoot(other)).toHaveAttribute('data-share-loaded', 'yes');
    expect(await editorText(other)).toBe(code);
    expect(other.url()).not.toContain('#');
    await expect(other.locator('[data-lab-message]')).toContainText('공유 링크의 코드를 불러왔어요');
    await expect(labRoot(other)).toHaveAttribute('data-example', 'hello');
    await other.close();
  });

  test('[이 컴퓨터에서 내 기록 지우기] 뒤에는 이 사이트 머리말의 저장값이 0개이고 편집칸이 예제 원래 코드로 돌아간다', async ({ page }) => {
    await page.goto(DEV_LAB_PATH);
    await page.getByRole('button', { name: '글자 크게', exact: true }).click();
    await setEditorCode(page, "print('지울 코드')\n");
    await expect(labRoot(page)).toHaveAttribute('data-save-state', 'saved', { timeout: SAVE_TIMEOUT });
    await page.evaluate((prefix) => window.sessionStorage.setItem(`${prefix}mqtt:prefix`, 'abc'), STORAGE_KEY_PREFIX);
    const before = await ourStorageKeys(page, STORAGE_KEY_PREFIX);
    expect(before.local.length).toBeGreaterThanOrEqual(2);
    expect(before.session).toHaveLength(1);

    const records = page.locator('[data-lab] [data-clear-records]');
    await records.getByRole('button', { name: '이 컴퓨터에서 내 기록 지우기' }).click();
    await expect(records).toHaveAttribute('data-state', 'confirming');
    await expect(records.locator('[data-clear-records-dialog]')).toBeVisible();
    await records.getByRole('button', { name: '지우기', exact: true }).click();
    await expect(records).toHaveAttribute('data-state', 'done');
    await expect(records.locator('[data-clear-records-status]')).toContainText(/기록 \d+개를 지웠어요/u);

    const after = await ourStorageKeys(page, STORAGE_KEY_PREFIX);
    expect(after.local).toEqual([]);
    expect(after.session).toEqual([]);
    expect(await editorText(page)).toBe(HELLO_CODE);
    await expect(labRoot(page)).toHaveAttribute('data-font-size', '15');
    await expect(page.locator('[data-lab-message]')).toContainText('기록을 지웠어요');
  });

  test('글자 크기 단계가 저장되고, [초기화]는 확인 뒤 예제 원래 코드로, [예제 불러오기]는 고른 예제로 바꾼다', async ({ page }) => {
    await page.goto(DEV_LAB_PATH);
    const editor = page.locator('[data-lab-editor] .cm-editor');
    await expect(labRoot(page)).toHaveAttribute('data-font-size', '15');
    await page.getByRole('button', { name: '글자 크게', exact: true }).click();
    await expect(labRoot(page)).toHaveAttribute('data-font-size', '17');
    expect(await editor.evaluate((element) => getComputedStyle(element).fontSize)).toBe('17px');
    await page.reload();
    await expect(labRoot(page)).toHaveAttribute('data-font-size', '17');
    await page.getByRole('button', { name: '글자 작게', exact: true }).click();
    await expect(labRoot(page)).toHaveAttribute('data-font-size', '15');

    await setEditorCode(page, "print('고친 코드')\n");
    await page.getByRole('button', { name: '초기화', exact: true }).click();
    await expect(page.locator('[data-lab-reset-dialog]')).toBeVisible();
    await page.getByRole('button', { name: '되돌리기', exact: true }).click();
    expect(await editorText(page)).toBe(HELLO_CODE);
    await expect(page.locator('[data-lab-message]')).toContainText('예제 원래 코드로 되돌렸어요');

    await page.locator('[data-lab-example-select]').selectOption('error');
    await page.getByRole('button', { name: '예제 불러오기', exact: true }).click();
    await expect(labRoot(page)).toHaveAttribute('data-example', 'error');
    expect(await editorText(page)).toBe('print(undefined_name)\n');
    await page.reload();
    await expect(labRoot(page)).toHaveAttribute('data-example', 'error');
    await expect(page.locator('[data-lab-example-select]')).toHaveValue('error');
  });

  test('[.py 내려받기]가 예제 이름의 파일로 지금 코드를 내려받는다', async ({ page }) => {
    await page.goto(DEV_LAB_PATH);
    const code = "print('내려받기')\n";
    await setEditorCode(page, code);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '.py 내려받기', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('hello.py');
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    expect(Buffer.concat(chunks).toString('utf8')).toBe(code);
  });

  test('키보드만으로: Tab은 들여쓰기, Esc 뒤 Tab은 편집칸 밖으로, Tab·Enter로 [실행]과 [정지]', async ({ page }) => {
    test.setTimeout(180_000);
    await openLabAndWaitReady(page);
    const KEYBOARD_CODE = "import time\nwhile True:\n    print('키보드')\n    time.sleep(0.1)\n";
    await setEditorCode(page, KEYBOARD_CODE);

    // 편집칸 끝에서 Tab → 4칸 들여쓰기가 들어간다(초점은 그대로).
    await editorContent(page).click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Tab');
    expect((await editorText(page)).endsWith('\n    ')).toBe(true);
    await expect(editorContent(page)).toBeFocused();
    // Esc 뒤 Tab → 편집칸을 벗어나 다음 요소로 간다.
    await page.keyboard.press('Escape');
    await page.keyboard.press('Tab');
    await expect(editorContent(page)).not.toBeFocused();
    const focusedOutside = await page.evaluate(() => !document.activeElement?.closest('.cm-editor'));
    expect(focusedOutside).toBe(true);

    // 키보드로 지나가는 학생: 앞 칸에서 Tab으로 편집칸에 **막 들어왔을 때**는 Tab 한 번으로 그대로 지나가고 코드가 바뀌지 않는다
    // (2026-09-17 검토 반영 — 전에는 Tab을 누를 때마다 첫 줄에 공백 4칸이 조용히 들어갔다).
    const before = await editorText(page);
    await page.locator('[data-lab-font-larger]').focus();
    await page.keyboard.press('Tab');
    await expect(editorContent(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(editorContent(page)).not.toBeFocused();
    expect(await editorText(page)).toBe(before);
    // 들어온 뒤 글을 쓰기 시작하면(다른 키를 누르면) Tab은 다시 들여쓰기다.
    await page.locator('[data-lab-font-larger]').focus();
    await page.keyboard.press('Tab');
    await expect(editorContent(page)).toBeFocused();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Tab');
    await expect(editorContent(page)).toBeFocused();
    const afterTyping = await editorText(page);
    expect(afterTyping.length).toBeGreaterThan(before.length);
    // Tab으로 들어온 뒤 마우스로 편집칸을 누르고 Tab을 치면 들여쓰기다(지나가기는 마우스·떠남에서 꺼진다).
    await page.keyboard.press('Escape');
    await page.keyboard.press('Tab');
    await page.locator('[data-lab-font-larger]').focus();
    await page.keyboard.press('Tab');
    await expect(editorContent(page)).toBeFocused();
    await editorContent(page).locator('.cm-line').first().click();
    await page.keyboard.press('Tab');
    await expect(editorContent(page)).toBeFocused();
    expect((await editorText(page)).length).toBeGreaterThan(afterTyping.length);
    // 방금 첫 줄을 들여 써서 실행하면 IndentationError가 나므로, 실행 단계 전에 코드를 처음 것으로 되돌린다.
    await setEditorCode(page, KEYBOARD_CODE);
    // 다음 단계는 편집칸 밖에서 Tab으로 [실행]을 찾으므로 Esc 뒤 Tab으로 편집칸에서 나온다(안에 있으면 Tab이 들여쓰기라 영영 못 나간다).
    await page.keyboard.press('Escape');
    await page.keyboard.press('Tab');
    await expect(editorContent(page)).not.toBeFocused();

    // 페이지 맨 앞부터 Tab만 눌러 [실행]에 닿아 Enter.
    await page.keyboard.press('Control+Home');
    await page.locator('body').evaluate((body) => (body as HTMLElement).focus());
    const focusButton = async (name: string) => {
      for (let press = 0; press < 80; press += 1) {
        await page.keyboard.press('Tab');
        const label = await page.evaluate(() => {
          const element = document.activeElement;
          return element instanceof HTMLButtonElement ? element.textContent?.trim() : null;
        });
        if (label === name) return true;
      }
      return false;
    };
    expect(await focusButton('실행')).toBe(true);
    await page.keyboard.press('Enter');
    await expect(labRoot(page)).toHaveAttribute('data-state', 'running');
    await expect(page.locator('[data-lab-console]')).toContainText('키보드', { timeout: 10_000 });

    // [실행] 바로 다음이 [정지]다(실행 중에만 눌린다).
    expect(await focusButton('정지')).toBe(true);
    await page.keyboard.press('Enter');
    expect(await waitDone(page, 5_000)).toBe('stopped');
  });
});
