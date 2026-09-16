// 가상 데스크톱(pyautogui 흉내, P2-11)의 브라우저 테스트 — 영상처리 실습실(/labs/vision/)에 붙는 모듈 desktop.
// 확인하는 것: ① 코드에 pyautogui가 보이면 가상 모니터가 열린다 ② 이관한 원본 예제(f017·f022·f025)가 고치지 않고 돈다
// ③ 커서 이동·더블 클릭으로 메모장이 열리고 typewrite 글자가 들어간다 ④ 끌기로 그림판 캔버스에 실제 픽셀이 찍힌다
// ⑤ 모니터 크기를 바꾸면 파이썬 size()가 따라가고 [모서리로]가 FAILSAFE를 걸어 준다 ⑥ 사이트·jsDelivr 밖 요청이 없다.
import { expect, test, type Page } from '@playwright/test';
import { labRoot, runCode, waitDone } from './helpers/lab.ts';
import { collectRequests, openVisionLab } from './helpers/vision.ts';

const DESKTOP = '[data-desktop]';
const CONSOLE = '[data-lab-console]';
const RUN_TIMEOUT = 120_000;

/** 파이썬 실행이 끝날 때까지 기다렸다가 결과를 돌려준다(코드는 에디터에 넣는다). */
async function run(page: Page, code: string): Promise<string> {
  await runCode(page, code);
  return waitDone(page, RUN_TIMEOUT);
}

/**
 * [예제 불러오기]로 원본 예제를 골라 한 글자도 고치지 않고 실행한다(가상 데스크톱은 [처음 상태로] 눌러 비운 뒤).
 * 실행이 정말 새로 시작했는지는 data-run-count가 하나 늘어난 것으로 본다(앞 실행의 data-outcome이 남아 있을 수 있어서).
 */
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

/**
 * 그림판에서 실제로 그려지는 영역(data-desktop-paint-rect, 캔버스 픽셀)의 어두운 픽셀 비율.
 * 그림판 캔버스는 흰 바탕이라 선을 그리기 전에는 0이다.
 */
async function paintInkRatio(page: Page): Promise<number> {
  const rect = await page.locator(DESKTOP).getAttribute('data-desktop-paint-rect');
  expect(rect, '그림판이 열려 있어야 해요(data-desktop-paint-rect)').toMatch(/^\d+,\d+,\d+,\d+$/u);
  const box = (rect ?? '').split(',').map((value) => Number(value)) as [number, number, number, number];
  return page.locator('[data-desktop-canvas]').evaluate((element, [x, y, width, height]) => {
    const canvas = element as HTMLCanvasElement;
    const context = canvas.getContext('2d');
    const pad = 4;
    const w = Math.max(1, width - pad * 2);
    const h = Math.max(1, height - pad * 2);
    if (!context || canvas.width === 0) {
      return -1;
    }
    const { data } = context.getImageData(x + pad, y + pad, w, h);
    let ink = 0;
    for (let at = 0; at < data.length; at += 4) {
      if ((data[at] ?? 255) + (data[at + 1] ?? 255) + (data[at + 2] ?? 255) < 400) {
        ink += 1;
      }
    }
    return ink / (w * h);
  }, box);
}

test.describe('가상 데스크톱(pyautogui)', () => {
  test.describe.configure({ timeout: 300_000 });

  test('예제 f017이 그대로 돌고, 커서·더블 클릭으로 메모장이 열려 글자가 들어간다', async ({ page }) => {
    const requests = collectRequests(page);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openVisionLab(page, '?example=desktop/01-screen-size.py');

    // ① 코드에 pyautogui가 보이므로 가상 모니터가 열려 있다(카메라 예제에서는 숨어 있다)
    await expect(labRoot(page)).toHaveAttribute('data-lab-modules', /\bdesktop\b/u);
    const desktop = page.locator(DESKTOP);
    await expect(desktop).toBeVisible();
    await expect(desktop).toHaveAttribute('data-desktop-width', '1920');
    await expect(desktop).toHaveAttribute('data-desktop-windows', 'paint');

    // ② 이관한 원본 예제(f017)를 한 글자도 고치지 않고 실행한다
    await page.getByRole('button', { name: '실행', exact: true }).click();
    expect(await waitDone(page, RUN_TIMEOUT)).toBe('ok');
    await expect(page.locator(CONSOLE)).toContainText('Screen size:Size(width=1920, height=1080)');
    await expect(page.locator(CONSOLE)).toContainText('Mouse Position :Point(x=960, y=540)');

    // ③ 커서를 메모장 아이콘으로 옮겨 두 번 누르고 글자를 친다(f018·f020의 짧은 판)
    expect(
      await run(
        page,
        [
          'import pyautogui',
          'pyautogui.PAUSE = 0.02',
          'pyautogui.moveTo(100, 255, duration=0.2)',
          'pyautogui.doubleClick()',
          "pyautogui.typewrite('hi there!', interval=0.01)",
          "print('cursor', pyautogui.position())",
        ].join('\n'),
      ),
    ).toBe('ok');
    await expect(desktop).toHaveAttribute('data-desktop-windows', /notepad/u);
    await expect(page.locator('[data-desktop-notepad]')).toHaveText('hi there!');
    await expect(desktop).toHaveAttribute('data-desktop-x', '100');
    await expect(desktop).toHaveAttribute('data-desktop-y', '255');
    await expect(page.locator(CONSOLE)).toContainText('cursor Point(x=100, y=255)');
    await expect(page.locator('[data-desktop-action]')).toContainText('메모장');

    // ⑥ 학생 화면은 밖으로 나가지 않는다: 사이트 자신과 Pyodide CDN 말고는 요청이 없다
    const allowed = new Set([new URL(page.url()).origin, 'https://cdn.jsdelivr.net']);
    expect([...requests.origins].filter((origin) => !allowed.has(origin))).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('버튼을 누른 채 커서를 돌리면 그림판 캔버스에 실제로 선이 그려진다', async ({ page }) => {
    await openVisionLab(page, '?example=desktop/03-mouse-drag.py');
    const desktop = page.locator(DESKTOP);
    await expect(desktop).toBeVisible();
    // 그리기 전에는 거의 흰 바탕이다(커서 화살표만 조금 어둡다 — 화살표는 표시 픽셀 크기라 좁은 화면에서 비율이 커진다)
    const before = await paintInkRatio(page);
    expect(before).toBeLessThan(0.01);

    expect(
      await run(
        page,
        [
          'import pyautogui, math',
          'pyautogui.PAUSE = 0',
          'pyautogui.moveTo(1100, 620)',
          'pyautogui.mouseDown()',
          'for angle in range(0, 361, 10):',
          '    x = 900 + 200 * math.cos(math.radians(angle))',
          '    y = 620 + 200 * math.sin(math.radians(angle))',
          '    pyautogui.moveTo(x, y)',
          'pyautogui.mouseUp()',
          "print('원을 그렸어요')",
        ].join('\n'),
      ),
    ).toBe('ok');

    await expect(desktop).toHaveAttribute('data-desktop-strokes', '1'); // 누른 채 옮겼으니 선 하나
    const ink = await paintInkRatio(page);
    expect(ink, '그림판에 원이 보여야 해요').toBeGreaterThan(before + 0.002);
  });

  test('이관한 별 그리기 예제(f022)가 그대로 돌아 끌기 15번이 남는다', async ({ page }) => {
    await openVisionLab(page, '?example=desktop/06-draw-star.py');
    await expect(page.locator(DESKTOP)).toBeVisible();
    await page.getByRole('button', { name: '실행', exact: true }).click();
    expect(await waitDone(page, RUN_TIMEOUT)).toBe('ok');
    // dragRel 세 번 × 다섯 번 = 선 15개(같은 삼각형을 다섯 번 겹쳐 그린다 — "왜 별이 안 될까" 탐구)
    await expect(page.locator(DESKTOP)).toHaveAttribute('data-desktop-strokes', '15');
    expect(await paintInkRatio(page)).toBeGreaterThan(0.001);
  });

  test('모니터 크기를 바꾸면 size()가 따라가고, [모서리로]는 FailSafeException을 만든다', async ({ page }) => {
    await openVisionLab(page, '?example=desktop/01-screen-size.py');
    const desktop = page.locator(DESKTOP);
    await expect(desktop).toBeVisible();

    await page.locator('[data-desktop-screen]').selectOption('1280x720');
    await expect(desktop).toHaveAttribute('data-desktop-width', '1280');
    expect(await run(page, 'import pyautogui\nprint(pyautogui.size())')).toBe('ok');
    await expect(page.locator(CONSOLE)).toContainText('Size(width=1280, height=720)');

    await page.getByRole('button', { name: '모서리로(안전장치)' }).click();
    await expect(desktop).toHaveAttribute('data-desktop-x', '0');
    await expect(desktop).toHaveAttribute('data-desktop-y', '0');
    expect(await run(page, 'import pyautogui\npyautogui.moveTo(500, 500)\nprint("여기는 오지 않아요")')).toBe('error');
    await expect(page.locator(CONSOLE)).toContainText('FailSafeException');
    await expect(page.locator(CONSOLE)).toContainText('왼쪽 위 모서리');
    await expect(page.locator(CONSOLE)).not.toContainText('여기는 오지 않아요');
  });

  test('이관한 원본 예제 f018·f019·f020·f021·f016이 고치지 않고 끝까지 돈다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openVisionLab(page, '?example=desktop/01-screen-size.py');
    const desktop = page.locator(DESKTOP);
    await expect(desktop).toBeVisible();

    // f018 마우스 이동·클릭: 커서가 (300, 300)에 서고 오른쪽 클릭으로 바탕 화면 메뉴가 열린다
    expect(await runExample(page, 'desktop-02-mouse-move-click')).toBe('ok');
    await expect(desktop).toHaveAttribute('data-desktop-x', '300');
    await expect(desktop).toHaveAttribute('data-desktop-y', '300');
    await expect(desktop).toHaveAttribute('data-desktop-menu', 'desktop');
    await expect(page.locator('[data-desktop-action]')).toContainText('메뉴');

    // f019 드래그: 가운데(그림판 안)에서 (400, 400)까지 끌어 선 하나가 남는다
    expect(await runExample(page, 'desktop-03-mouse-drag')).toBe('ok');
    await expect(desktop).toHaveAttribute('data-desktop-strokes', '1');
    expect(await paintInkRatio(page)).toBeGreaterThan(0.0005);

    // f020 키 입력(약 30초): 메모장에 hello, world!가 10줄 들어가고 Ctrl+S로 저장 대화상자가 열린다
    expect(await runExample(page, 'desktop-04-typewrite', 180_000)).toBe('ok');
    await expect(desktop).toHaveAttribute('data-desktop-windows', /notepad/u);
    const notepad = await page.locator('[data-desktop-notepad]').textContent();
    expect((notepad ?? '').split('hello, world!').length - 1).toBe(10);
    // 마지막 hotkey('ctrl', 's')가 저장 대화상자를 열고, 안내 글이 조합키 떼기에 덮이지 않는다
    await expect(desktop).toHaveAttribute('data-desktop-dialog', 'save');
    await expect(page.locator('[data-desktop-action]')).toContainText('저장 대화상자');
    await expect(page.locator('[data-desktop-action]')).toContainText('ctrl+s');

    // f021 원 그리기: moveTo만 쓰므로 선은 하나도 안 생긴다(진짜 그림판과 같음 — 궤적만 보인다)
    expect(await runExample(page, 'desktop-05-draw-circle')).toBe('ok');
    await expect(desktop).toHaveAttribute('data-desktop-strokes', '0');

    // f016 주기적 캡처: 가상 파일시스템에 5장이 저장된다
    expect(await runExample(page, 'desktop-10-screenshot-loop', 240_000)).toBe('ok');
    await expect(page.locator(CONSOLE)).toContainText('Saved: screenshots/screenshot_5.png');
    await expect(page.locator(CONSOLE)).toContainText('All screenshots captured!');

    expect(errors).toEqual([]);
  });

  test('화면 캡처 예제(f025)가 가상 모니터를 Pillow 그림으로 저장한다', async ({ page }) => {
    await openVisionLab(page, '?example=desktop/09-screenshot.py');
    await expect(page.locator(DESKTOP)).toBeVisible();
    await page.getByRole('button', { name: '실행', exact: true }).click();
    expect(await waitDone(page, 240_000)).toBe('ok');
    await expect(page.locator(CONSOLE)).toContainText('Screenshot saved as screenshot.png!');
    // 찍은 그림이 가상 모니터 논리 해상도와 같은지 파이썬에서 확인한다
    expect(await run(page, 'from PIL import Image\nimport os\nprint(Image.open("screenshot.png").size, os.path.getsize("screenshot.png") > 0)')).toBe('ok');
    await expect(page.locator(CONSOLE)).toContainText('(1920, 1080) True');
  });
});
