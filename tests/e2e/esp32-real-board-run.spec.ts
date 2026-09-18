// ESP32 실습실 [실제 보드] 실행·저장 브라우저 테스트(PLAN §8.3 P3-08 실제 보드 ② 실행·저장). 실제 보드 대신 모의 시리얼(tests/e2e/helpers/serial.ts)을 쓴다 —
// 모의 보드에서 된다는 것은 실물의 증거가 아니다(부록 B-2 19번·운영자 할 일 2번).
// 확인하는 것
//  1. [보드에 저장]: 편집칸 코드를 main.py로(mpremote fs_writefile 방식 — 256바이트씩 w(b'…')), 코드가 부르는 사이트 라이브러리를 보드 뿌리에 함께, 결과 상자·콘솔 안내.
//     보드에 이미 있는 파일을 바꿔 쓸 때는 먼저 물어보고, "아니요"면 파일이 그대로 남는다(2026-09-18 검토 반영).
//  2. 실행 중 input(): 코드가 도는 동안 셸 입력줄에 적은 줄이 보드 input()으로 가고, 보드의 되울림은 콘솔에 두 번 보이지 않는다. 한글은 빼고 알린다.
//  3. boot.py가 끝나지 않는 반복인 보드: [실행]의 소프트 리셋에서 기다려도 끝나지 않으면 Ctrl-C로 멈추고 코드를 보낸다 → 안내와 [boot.py 끄기],
//     두 번째 실행은 곧바로 멈춘다, 끄면 boot_off.py.
//  4. 멈춤 신호를 삼키는 main.py가 도는 보드: 대답 없음 → [보드 되찾기](Ctrl-C 되풀이 → RTS로 다시 켜며 되풀이) → ready와 [main.py 끄기].
//  5. 휴대폰 폭: 저장 결과 상자까지 가로 넘침 없음.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { withBase } from '../../src/lib/url.ts';
import { labRoot, setEditorCode } from './helpers/lab.ts';
import { installSerialMock, serialMock, type SerialMockConfig } from './helpers/serial.ts';

const ESP32_PATH = withBase('labs/esp32/');
/** 개발 서버가 실습실 페이지를 처음 옮기는 시간까지(Vite 변환) 넉넉히 */
const MODULE_TIMEOUT = 120_000;
/** 판별·실행·저장(모의 보드는 명령마다 raw-paste를 주고받는다) */
const BOARD_TIMEOUT = 30_000;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * 저장소의 보드 라이브러리 하나(examples/esp32/lib/** — 부품 구역이 더한다). 다른 사이트 라이브러리를 부르지 않는 것을 고른다(저장 목록이 [그 파일, main.py]가 되게).
 * 없으면 null(라이브러리 부분은 건너뛴다).
 */
function firstBoardLibrary(): { name: string; fileName: string; source: string } | null {
  const files: string[] = [];
  const walk = (dir: string) => {
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries.sort()) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (/^[a-z][a-z0-9_]*\.py$/u.test(entry)) {
        files.push(full);
      }
    }
  };
  walk(path.join(ROOT, 'examples/esp32/lib'));
  const names = new Set(files.map((file) => path.basename(file, '.py')));
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const imports = [...source.matchAll(/^\s*(?:from\s+(\w+)|import\s+(\w+))/gmu)].map((match) => match[1] ?? match[2] ?? '');
    if (!imports.some((name) => names.has(name))) {
      const fileName = path.basename(file);
      return { name: fileName.replace(/\.py$/u, ''), fileName, source };
    }
  }
  return null;
}

function realPanel(page: Page) {
  return page.locator('[data-real-board]');
}

function consoleBox(page: Page) {
  return page.locator('[data-lab-console]');
}

async function openLab(page: Page, config?: SerialMockConfig): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // 보드에 있던 파일을 바꿔 쓰기 전 확인 창(2026-09-18 검토 반영) — Playwright는 기본으로 창을 닫아 "아니요"가 되므로 여기서 "예"를 누른다.
  // 아래 "바꾸기 전에 물어본다" 검사는 이 처리기를 제 것으로 바꿔 무엇을 묻는지 본다.
  page.on('dialog', (dialog) => void dialog.accept());
  await installSerialMock(page, config ?? {});
  const response = await page.goto(ESP32_PATH);
  expect(response?.status()).toBe(200);
  await expect(labRoot(page)).toHaveAttribute('data-lab-modules', /(^|\s)real-board(\s|$)/u, { timeout: MODULE_TIMEOUT });
  await expect(page.locator('[data-lab-module-panel="real-board"]')).toHaveAttribute('data-real-board-placement', 'io');
  return errors;
}

async function chooseRealAndConnect(page: Page, state = 'ready'): Promise<void> {
  await page.getByRole('tab', { name: '실제 보드' }).click();
  await expect(labRoot(page)).toHaveAttribute('data-run-target', '실제 보드');
  await realPanel(page).getByRole('button', { name: '보드 연결' }).click();
  await expect(realPanel(page)).toHaveAttribute('data-real-board-state', state, { timeout: BOARD_TIMEOUT });
}

async function run(page: Page, code: string, outcome: string): Promise<void> {
  await setEditorCode(page, code);
  await page.getByRole('button', { name: '실행', exact: true }).click();
  await expect(labRoot(page)).toHaveAttribute('data-outcome', outcome, { timeout: BOARD_TIMEOUT });
}

test.describe('ESP32 실습실 — 실제 보드 ② 실행·저장(모의 시리얼)', () => {
  test.describe.configure({ timeout: 240_000 });

  test('[보드에 저장]: main.py와 코드가 부르는 사이트 라이브러리를 보드에, 결과 상자·콘솔 안내', async ({ page, isMobile }) => {
    test.skip(isMobile, '저장 흐름은 데스크톱에서 본다(휴대폰 폭 배치는 아래 검사).');
    const library = firstBoardLibrary();
    const errors = await openLab(page);
    await chooseRealAndConnect(page);
    const code = library ? `import ${library.name}\nprint('저장한 코드')\n` : "print('저장한 코드')\n";
    await setEditorCode(page, code);

    const saveButton = realPanel(page).getByRole('button', { name: '보드에 저장' });
    await expect(saveButton).toBeVisible();
    await saveButton.click();
    await expect(realPanel(page)).toHaveAttribute('data-real-board-saved-state', 'ok', { timeout: BOARD_TIMEOUT });
    await expect(realPanel(page)).toHaveAttribute('data-real-board-state', 'ready');

    const board = serialMock(page);
    const files = await board.files();
    expect(files['main.py']).toBe(code);
    const saved = realPanel(page).locator('[data-real-board-saved]');
    await expect(saved).toBeVisible();
    await expect(saved.locator('[data-real-board-saved-title]')).toHaveText('보드에 저장했어요');
    await expect(saved.locator('[data-real-board-saved-items] li').last()).toContainText('main.py — 새로 저장했어요');
    if (library) {
      // 라이브러리는 보드 뿌리에(교과서 Thonny "MicroPython 장치" 저장 자리), 파일 그대로
      expect(files[library.fileName]).toBe(library.source);
      await expect(saved.locator('[data-real-board-saved-items] li').first()).toContainText(`${library.fileName} — 코드가 쓰는 라이브러리를 함께 올렸어요`);
    }
    await expect(saved).toContainText('EN(RST) 버튼');
    await expect(consoleBox(page)).toContainText('보드에 저장했어요: ');
    // mpremote fs_writefile 모양 명령 — 임시 이름에 쓰고 제자리로 옮긴다
    const commands = (await board.executed()).map((item) => item.code);
    expect(commands).toContain("f=open('main.py.part','wb')\nw=f.write");
    expect(commands.some((item) => item.startsWith("w(b'"))).toBe(true);
    expect(Object.keys(files).some((name) => name.endsWith('.part'))).toBe(false);
    expect(await board.flowControlOverrun()).toBe(0);

    // 두 번째 저장: 보드 main.py를 바꿔 쓴다(모의 보드는 hashlib이 없어 늘 쓴다) — "바꿨어요"
    await setEditorCode(page, "print('고친 코드')\n");
    await saveButton.click();
    await expect(saved.locator('[data-real-board-saved-items] li').last()).toContainText('main.py — 보드에 있던 파일을 이 코드로 바꿨어요', { timeout: BOARD_TIMEOUT });
    expect((await board.files())['main.py']).toBe("print('고친 코드')\n");

    // 저장한 뒤에도 같은 [실행]이 된다
    await run(page, "print('run after save')", 'ok');
    await expect(consoleBox(page)).toContainText('run after save');
    expect(errors).toEqual([]);
  });

  test('[보드에 저장]: 보드에 있던 main.py를 바꾸기 전에 물어보고, "아니요"면 그대로 둔다', async ({ page, isMobile }) => {
    test.skip(isMobile, '저장 흐름은 데스크톱에서 본다.');
    const errors = await openLab(page);
    await chooseRealAndConnect(page);
    const saveButton = realPanel(page).getByRole('button', { name: '보드에 저장' });
    // 1) 보드가 비어 있으면 묻지 않는다
    const asked: string[] = [];
    page.removeAllListeners('dialog');
    page.on('dialog', (dialog) => {
      asked.push(dialog.message());
      void dialog.dismiss();
    });
    await setEditorCode(page, "print('처음 저장')\n");
    await saveButton.click();
    await expect(realPanel(page)).toHaveAttribute('data-real-board-saved-state', 'ok', { timeout: BOARD_TIMEOUT });
    expect(asked).toEqual([]);
    const board = serialMock(page);
    expect((await board.files())['main.py']).toBe("print('처음 저장')\n");

    // 2) 이미 있는 main.py를 바꿀 때는 묻고, 닫으면(=아니요) 보드 파일이 그대로다
    await setEditorCode(page, "print('바꾼 코드')\n");
    await saveButton.click();
    await expect(realPanel(page)).toHaveAttribute('data-real-board-saved-state', 'cancelled', { timeout: BOARD_TIMEOUT });
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain('보드에 이미 main.py');
    expect(asked[0]).toContain('되돌릴 수 없어요');
    expect((await board.files())['main.py']).toBe("print('처음 저장')\n");
    await expect(realPanel(page)).toHaveAttribute('data-real-board-state', 'ready');
    expect(errors).toEqual([]);
  });

  test('실행 중 input(): 입력줄에 적은 줄이 보드로 가고 되울림은 한 번만, 한글은 빼고 알린다', async ({ page, isMobile }) => {
    test.skip(isMobile, '데스크톱에서 본다.');
    const errors = await openLab(page);
    await chooseRealAndConnect(page);
    await setEditorCode(page, "name = input('이름? ')\nprint('안녕', name)");
    await page.getByRole('button', { name: '실행', exact: true }).click();
    const form = page.locator('[data-lab-input-form]');
    await expect(form).toBeVisible({ timeout: BOARD_TIMEOUT });
    await expect(page.locator('[data-lab-input-label]')).toHaveText('보드로 보낼 한 줄(input)');
    await expect(consoleBox(page)).toContainText('이름? ', { timeout: BOARD_TIMEOUT });
    await expect(page.locator('[data-lab-input]')).toBeFocused();
    await page.locator('[data-lab-input]').fill('Kim');
    await page.keyboard.press('Enter');
    await expect(labRoot(page)).toHaveAttribute('data-outcome', 'ok', { timeout: BOARD_TIMEOUT });
    await expect(consoleBox(page)).toContainText('안녕 Kim');
    const text = (await consoleBox(page).textContent()) ?? '';
    // 셸이 적은 입력 줄 한 번 + 프로그램 출력 한 번 — 보드 되울림("Kim\r\n")은 걸러졌다
    expect(text.split('Kim').length - 1).toBe(2);
    await expect(consoleBox(page)).toContainText('콘솔 아래 입력줄에 적고 Enter');
    await expect(form).toBeHidden();
    expect((await serialMock(page).writtenText()).endsWith('Kim\r')).toBe(true);

    // 한글은 보드 input()이 받지 못해 빼고 보낸다
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(form).toBeVisible({ timeout: BOARD_TIMEOUT });
    await page.locator('[data-lab-input]').fill('김철수 lee');
    await page.keyboard.press('Enter');
    await expect(labRoot(page)).toHaveAttribute('data-outcome', 'ok', { timeout: BOARD_TIMEOUT });
    await expect(consoleBox(page)).toContainText('안녕  lee');
    await expect(consoleBox(page)).toContainText('영어·숫자·기호만 받아요');

    // 입력을 기다리는 동안 [정지]
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(form).toBeVisible({ timeout: BOARD_TIMEOUT });
    await page.getByRole('button', { name: '정지', exact: true }).click();
    await expect(labRoot(page)).toHaveAttribute('data-outcome', 'stopped', { timeout: BOARD_TIMEOUT });
    await expect(form).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('boot.py가 끝나지 않는 보드: 안내와 [boot.py 끄기], [실행]은 멈추고 보낸다, 끄면 boot_off.py', async ({ page, isMobile }) => {
    test.skip(isMobile, '데스크톱에서 본다.');
    const errors = await openLab(page, {
      ports: [{ id: 'board', micropython: { files: { 'boot.py': 'import time\nwhile True:\n    time.sleep(0.05)\n' } } }],
    });
    await chooseRealAndConnect(page);
    // 연결 판별이 boot.py를 멈춰도 아직 "반복"으로 정하지 않는다(오래 걸리는 boot.py일 수 있음) — [실행]의 소프트 리셋에서 기다려도 끝나지 않을 때
    await expect(realPanel(page)).toHaveAttribute('data-real-board-autorun', '');

    const firstStarted = Date.now();
    await run(page, "print('boot 반복을 멈추고 실행')", 'ok');
    const firstMs = Date.now() - firstStarted;
    await expect(consoleBox(page)).toContainText('boot 반복을 멈추고 실행');
    await expect(consoleBox(page)).toContainText('boot.py가 끝나지 않는 반복이라 멈춤 신호(Ctrl-C)로 멈춘 뒤 코드를 보냈어요');
    await expect(realPanel(page)).toHaveAttribute('data-real-board-autorun', 'boot.py');
    await expect(realPanel(page).locator('[data-real-board-notes]')).toContainText('boot.py가 끝나지 않는 반복');
    const disable = realPanel(page).getByRole('button', { name: 'boot.py 끄기' });
    await expect(disable).toBeVisible();
    // 일부러 둔 반복일 수 있어 강조하지 않고 [연결 끊기] 앞에 둔다
    await expect(disable).not.toHaveClass(/button--primary/u);
    await expect(realPanel(page).locator('[data-real-board-actions] > button:not([hidden])').last()).toHaveText('연결 끊기');

    // 두 번째 실행은 오래 기다리지 않는다(boot.py를 곧바로 멈춤 — 첫 실행은 boot.py가 끝나기를 6초 기다렸다)
    const secondStarted = Date.now();
    await run(page, "print('두 번째')", 'ok');
    expect(Date.now() - secondStarted).toBeLessThan(firstMs);

    await disable.click();
    await expect(realPanel(page).locator('[data-real-board-notes]')).toContainText('boot.py → boot_off.py', { timeout: BOARD_TIMEOUT });
    await expect(realPanel(page)).toHaveAttribute('data-real-board-autorun', '');
    const files = await serialMock(page).files();
    expect(Object.keys(files)).toEqual(['boot_off.py']);
    await run(page, "print('끈 뒤 실행')", 'ok');
    await expect(consoleBox(page)).toContainText('끈 뒤 실행');
    expect(errors).toEqual([]);
  });

  test('멈춤 신호를 삼키는 main.py: 대답 없음 → [보드 되찾기] → ready와 [main.py 끄기]', async ({ page, isMobile }) => {
    test.skip(isMobile, '데스크톱에서 본다.');
    const errors = await openLab(page);
    // 모의 보드에 "맨 except로 KeyboardInterrupt까지 삼키는 main.py"를 넣고 다시 켠다(함수는 페이지 안에서만 붙일 수 있다 — README 8.3)
    await page.evaluate(() => {
      type Device = {
        addScript(script: unknown): void;
        files: { write(path: string, text: string): void };
        hardReset(cause: string): Promise<void>;
        hardResets: number;
        softResets: number;
        mode: string;
      };
      const mock = (window as unknown as { __apcSerialMock: { device(id: string): Device } }).__apcSerialMock;
      const device = mock.device('board');
      device.addScript({
        match: '^# swallow',
        async run(context: { sleep(ms: number): Promise<void>; device: Device }) {
          const resets = context.device.hardResets + context.device.softResets;
          await context.sleep(400);
          while (context.device.mode !== 'off' && context.device.hardResets + context.device.softResets === resets) {
            try {
              await context.sleep(40);
            } catch {
              // 맨 except
            }
          }
        },
      });
      device.files.write('main.py', '# swallow\n');
      void device.hardReset('pin');
    });
    await page.waitForTimeout(700);
    await chooseRealAndConnect(page, 'no-micropython');
    await expect(realPanel(page)).toHaveAttribute('data-real-board-verdict', 'silent');
    const recover = realPanel(page).getByRole('button', { name: '보드 되찾기' });
    await expect(recover).toBeVisible();
    await recover.click();
    await expect(realPanel(page)).toHaveAttribute('data-real-board-state', 'recovering');
    await expect(realPanel(page)).toHaveAttribute('data-real-board-state', 'ready', { timeout: BOARD_TIMEOUT });
    await expect(realPanel(page)).toHaveAttribute('data-real-board-autorun', 'main.py');
    const disable = realPanel(page).getByRole('button', { name: 'main.py 끄기' });
    await expect(disable).toHaveClass(/button--primary/u);
    await expect(realPanel(page).locator('[data-real-board-actions] > button:not([hidden])').first()).toHaveText('main.py 끄기');
    await expect(consoleBox(page)).toContainText('보드를 되찾았어요');
    const board = serialMock(page);
    expect(await board.hardResets()).toBeGreaterThanOrEqual(2);

    await disable.click();
    await expect(realPanel(page).locator('[data-real-board-notes]')).toContainText('main.py → main_off.py', { timeout: BOARD_TIMEOUT });
    expect(Object.keys(await board.files())).toEqual(['main_off.py']);
    await run(page, "print('되찾은 보드')", 'ok');
    await expect(consoleBox(page)).toContainText('되찾은 보드');
    expect(errors).toEqual([]);
  });

  test('휴대폰 폭: 저장 결과 상자까지 넘치지 않는다', async ({ page, isMobile }) => {
    test.skip(!isMobile, '휴대폰 폭에서 본다.');
    const errors = await openLab(page);
    await chooseRealAndConnect(page);
    await setEditorCode(page, "print('mobile save')\n");
    await realPanel(page).getByRole('button', { name: '보드에 저장' }).click();
    await expect(realPanel(page)).toHaveAttribute('data-real-board-saved-state', 'ok', { timeout: BOARD_TIMEOUT });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const box = await realPanel(page).locator('[data-real-board-saved]').boundingBox();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375);
    expect(errors).toEqual([]);
  });
});
