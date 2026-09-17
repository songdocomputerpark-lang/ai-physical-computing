// 가상 데스크톱 ②(P2-12)의 브라우저 테스트 — 가상 브라우저 창·연습 검색, 스페이스 키 미니게임, 화면 캡처의 '내 파일'·내려받기.
// 확인하는 것: ① 이관한 원본 예제 f023(webbrowser.open)·f024(검색 자동화)·f025(화면 캡처)가 고치지 않고 돈다
// ② f024 마지막 줄 pyautogui.enter는 AttributeError + 한국어 설명으로 끝난다 ③ press('space')가 미니게임에 들어가 점수가 오른다(f121)
// ④ 저장한 그림이 미리보기·[내려받기]로 나온다(f016·f025·f090) ⑤ 사이트·jsDelivr 밖 요청이 0건이다(진짜 인터넷에 가지 않는다).
// P2-11의 기본 동작(커서·클릭·끌기·메모장·FAILSAFE)은 tests/e2e/lab-desktop.spec.ts가 본다.
import { expect, test, type Page } from '@playwright/test';
import { labRoot, runCode, waitDone } from './helpers/lab.ts';
import { collectRequests, openVisionLab } from './helpers/vision.ts';

const DESKTOP = '[data-desktop]';
const CONSOLE = '[data-lab-console]';
const RUN_TIMEOUT = 120_000;

async function run(page: Page, code: string): Promise<string> {
  await runCode(page, code);
  return waitDone(page, RUN_TIMEOUT);
}

/** [예제 불러오기]로 원본 예제를 골라 한 글자도 고치지 않고 실행한다(가상 데스크톱은 [처음 상태로]로 비운 뒤). */
async function runExample(page: Page, exampleId: string, timeout = RUN_TIMEOUT): Promise<string> {
  await page.getByRole('button', { name: '처음 상태로' }).click();
  await page.locator('[data-lab-example-select]').selectOption(exampleId);
  await page.getByRole('button', { name: '예제 불러오기' }).click();
  await expect(labRoot(page)).toHaveAttribute('data-example', exampleId);
  const before = Number((await labRoot(page).getAttribute('data-run-count')) ?? '0');
  await page.getByRole('button', { name: '실행', exact: true }).click();
  await expect(labRoot(page)).toHaveAttribute('data-run-count', String(before + 1));
  return waitDone(page, timeout);
}

test.describe('가상 데스크톱 ②(가상 브라우저·미니게임·내 파일)', () => {
  test.describe.configure({ timeout: 300_000 });

  test('f023·f024: webbrowser.open이 가상 브라우저를 열고, 친 검색어가 사이트 안 결과를 보여 준다', async ({ page }) => {
    const requests = collectRequests(page);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openVisionLab(page, '?example=desktop/07-open-webpage.py');
    const desktop = page.locator(DESKTOP);
    await expect(desktop).toBeVisible();

    // ① f023을 그대로 실행하면 가상 브라우저 창이 열리고 "가상 브라우저에서만 열려요" 안내가 붙는다
    await page.getByRole('button', { name: '실행', exact: true }).click();
    expect(await waitDone(page, RUN_TIMEOUT)).toBe('ok');
    await expect(desktop).toHaveAttribute('data-desktop-windows', /browser/u);
    await expect(desktop).toHaveAttribute('data-desktop-browser', 'practice');
    await expect(desktop).toHaveAttribute('data-desktop-browser-url', 'https://www.naver.com/');
    await expect(desktop).toHaveAttribute('data-desktop-browser-kind', 'outside');
    await expect(page.locator('[data-desktop-action]')).toContainText('가상 브라우저');
    // 우리 사이트 주소가 아니므로 "진짜 브라우저에서 열기" 링크는 숨어 있다
    await expect(page.locator('[data-desktop-browser-link]')).toBeHidden();

    // ② f024를 그대로 실행: 검색어가 연습 검색창에 들어가고 \n(Enter)이 결과를 연다. 마지막 줄은 AttributeError.
    expect(await runExample(page, 'desktop-08-web-search')).toBe('error');
    await expect(desktop).toHaveAttribute('data-desktop-browser-query', 'PYAUTOGUI tutorial');
    await expect(desktop).toHaveAttribute('data-desktop-browser', 'results');
    const results = Number((await desktop.getAttribute('data-desktop-browser-results')) ?? '0');
    expect(results).toBeGreaterThan(0);
    // 검색 결과는 이 사이트 안의 학습 내용이다(가짜 포털 화면이 아니다)
    await expect(page.locator(CONSOLE)).toContainText('AttributeError');
    await expect(page.locator(CONSOLE)).toContainText("pyautogui.press('enter')");
    // 메모장으로 새지 않았다(브라우저 창에 초점이 있었다)
    await expect(desktop).not.toHaveAttribute('data-desktop-windows', /notepad/u);

    // ③ 우리 사이트 주소를 열면 진짜로 볼 수 있는 링크가 함께 나온다
    expect(await run(page, 'import webbrowser\nwebbrowser.open("/ai-physical-computing/labs/vision/")\nprint("열었어요")')).toBe('ok');
    await expect(desktop).toHaveAttribute('data-desktop-browser-kind', 'site');
    const link = page.locator('[data-desktop-browser-href]');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/ai-physical-computing/labs/vision/');

    // ④ 진짜 인터넷에는 가지 않는다: 사이트 자신과 Pyodide CDN 말고는 요청이 없다
    const allowed = new Set([new URL(page.url()).origin, 'https://cdn.jsdelivr.net']);
    expect([...requests.origins].filter((origin) => !allowed.has(origin))).toEqual([]);
    expect(requests.urls.filter((url) => /naver|google/u.test(url))).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("press('space')가 미니게임으로 들어가 점수가 오른다(f121의 pyautogui 쪽)", async ({ page }) => {
    await openVisionLab(page, '?example=desktop/01-screen-size.py');
    const desktop = page.locator(DESKTOP);
    await expect(desktop).toBeVisible();
    await expect(desktop).toHaveAttribute('data-desktop-game', '');

    // 입을 벌리는 동안 press('space')를 연타하는 코드와 같은 모양(카메라·얼굴 인식은 구역 D 몫이라 키만 흉내 낸다)
    expect(
      await run(
        page,
        [
          'import pyautogui as pg',
          'import time',
          'pg.PAUSE = 0',
          'for _ in range(60):',
          '    pg.press("space")',
          '    time.sleep(0.05)',
          'print("게임 끝")',
        ].join('\n'),
      ),
    ).toBe('ok');

    // 게임 창이 저절로 열리고(코드가 보낸 스페이스라서) 누른 횟수가 쌓인다
    await expect(desktop).toHaveAttribute('data-desktop-game', 'balloon');
    await expect(desktop).toHaveAttribute('data-desktop-windows', /game/u);
    expect(Number((await desktop.getAttribute('data-desktop-game-presses')) ?? '0')).toBe(60);
    // 계속 눌러 띠 안에 머물렀으므로 점수가 올랐다
    expect(Number((await desktop.getAttribute('data-desktop-game-score')) ?? '0')).toBeGreaterThan(0);
    await expect(page.locator('[data-desktop-game-text]')).toContainText('점수');

    // 다른 게임으로 바꾸면 점수는 0부터 다시 세고, 스페이스는 그 게임으로 간다
    await page.locator('[data-desktop-game-select]').selectOption('timing');
    await expect(desktop).toHaveAttribute('data-desktop-game', 'timing');
    await expect(desktop).toHaveAttribute('data-desktop-game-score', '0');
    expect(await run(page, 'import pyautogui as pg\npg.PAUSE = 0\npg.press("space")\nprint("눌렀어요")')).toBe('ok');
    expect(Number((await desktop.getAttribute('data-desktop-game-presses')) ?? '0')).toBe(1);
    await expect(page.locator('[data-desktop-action]')).toContainText('미니게임');
  });

  test('움직임 줄이기를 켜도 미니게임이 돌아가고, 학생이 직접 누른 스페이스도 들어간다', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openVisionLab(page, '?example=desktop/01-screen-size.py');
    const desktop = page.locator(DESKTOP);
    await expect(desktop).toBeVisible();
    await page.locator('[data-desktop-game-select]').selectOption('balloon');
    await page.getByRole('button', { name: '미니게임 열기' }).click();
    await expect(desktop).toHaveAttribute('data-desktop-game', 'balloon');

    // 학생이 캔버스에 초점을 두고 직접 스페이스를 누른다(게임 창이 열려 있으므로 게임으로 간다)
    const canvas = page.locator('[data-desktop-canvas]');
    await canvas.click({ position: { x: 5, y: 5 } });
    await canvas.press('Space');
    // 누른 횟수는 키 처리 뒤에 표시가 바뀌므로 기다리며 확인한다(바로 한 번 읽으면 CI 모바일에서 가끔 0이었다 — 2026-09-17 1 flaky의 원인).
    await expect(desktop).toHaveAttribute('data-desktop-game-presses', '1');

    // 코드로 계속 눌러 띠 안에 올려 둔다 — 움직임 줄이기에서는 느리게 움직이므로 더 오래 누른다
    expect(
      await run(
        page,
        [
          'import pyautogui as pg',
          'import time',
          'pg.PAUSE = 0',
          'for _ in range(90):',
          '    pg.press("space")',
          '    time.sleep(0.05)',
          'print("느린 판 끝")',
        ].join('\n'),
      ),
    ).toBe('ok');
    // 시계가 돌았다는 증거: 띠 안에 머문 만큼 점수가 올랐다(움직임 줄이기에서도 게임이 멈추지 않는다)
    expect(Number((await desktop.getAttribute('data-desktop-game-score')) ?? '0')).toBeGreaterThan(0);
  });

  test('f025·f016: 저장한 그림이 미리보기와 [내려받기]로 나온다', async ({ page }) => {
    await openVisionLab(page, '?example=desktop/09-screenshot.py');
    const desktop = page.locator(DESKTOP);
    await expect(desktop).toBeVisible();
    await page.getByRole('button', { name: '실행', exact: true }).click();
    expect(await waitDone(page, 240_000)).toBe('ok');
    await expect(page.locator(CONSOLE)).toContainText('Screenshot saved as screenshot.png!');

    // '내 파일'에 카드가 하나 생긴다(이름·크기·미리보기 그림)
    await expect(desktop).toHaveAttribute('data-desktop-file-count', '1');
    await page.getByText('메모장 글·내 파일 보기').click();
    const card = page.locator('[data-desktop-file="screenshot.png"]');
    await expect(card).toBeVisible();
    await expect(card.locator('img')).toBeVisible();
    await expect(card).toContainText('1920×1080');
    // 미리보기 그림이 정말 그려졌는지(가로 크기 > 0)
    expect(await card.locator('img').evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(100);

    // [내려받기]를 누르면 파일 하나가 내려받아진다(서버를 거치지 않는 Blob)
    const [download] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: '내려받기' }).click()]);
    expect(download.suggestedFilename()).toBe('screenshot.png');

    // f016(2초마다 5장)은 이름이 달라 모두 남는다
    expect(await runExample(page, 'desktop-10-screenshot-loop', 240_000)).toBe('ok');
    await expect(desktop).toHaveAttribute('data-desktop-file-count', '5');
    await expect(page.locator('[data-desktop-file="screenshots/screenshot_5.png"]')).toBeVisible();
  });

  test('f090처럼 같은 이름으로 연달아 저장하면 0.5초에 한 번만 저장하고 한국어로 알린다', async ({ page }) => {
    await openVisionLab(page, '?example=desktop/09-screenshot.py');
    await expect(page.locator(DESKTOP)).toBeVisible();
    expect(
      await run(
        page,
        [
          'import pyautogui, os',
          'pyautogui.PAUSE = 0',
          'for _ in range(10):',
          '    pyautogui.screenshot("screenshot.png")',
          'print("저장 끝", os.path.exists("screenshot.png"))',
        ].join('\n'),
      ),
    ).toBe('ok');
    await expect(page.locator(CONSOLE)).toContainText('저장 끝 True');
    await expect(page.locator(CONSOLE)).toContainText('아주 빠르게 다시 저장');
    await expect(page.locator(DESKTOP)).toHaveAttribute('data-desktop-file-count', '1');
  });

  test('학생이 가상 브라우저를 직접 눌러 검색해 본다(키보드·마우스)', async ({ page }) => {
    await openVisionLab(page, '?example=desktop/01-screen-size.py');
    const desktop = page.locator(DESKTOP);
    await expect(desktop).toBeVisible();
    await page.getByRole('button', { name: '웹 브라우저 열기' }).click();
    await expect(desktop).toHaveAttribute('data-desktop-browser', 'practice');

    // 캔버스에 초점을 두고 글자를 친다(검색창이 처음부터 초점이다).
    // 한글은 키 하나가 아니라 입력기(IME)가 조합해 보내므로 가상 데스크톱에 들어가지 않는다(알려진 한계 — 패널 안내 글 참고).
    const canvas = page.locator('[data-desktop-canvas]');
    await canvas.click({ position: { x: 5, y: 5 } });
    await canvas.pressSequentially('vision');
    await expect(desktop).toHaveAttribute('data-desktop-browser-query', 'vision');
    await canvas.press('Enter');
    await expect(desktop).toHaveAttribute('data-desktop-browser', 'results');
    expect(Number((await desktop.getAttribute('data-desktop-browser-results')) ?? '0')).toBeGreaterThan(0);
    await expect(page.locator('[data-desktop-action]')).toContainText('사이트');
  });
});
