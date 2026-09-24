// ESP32 실습실 블록 모드(PLAN §8.3 P3-06, SPEC §6.2 "블록 ↔ 텍스트", PD-27 블록 전용 호환 모드) 브라우저 테스트.
// 시나리오 B 전체 흐름(블록 끌어 놓기 → 가상 터치 → 코드 한 줄 수정)은 scenario-b.spec.ts에 있다. 여기서는 모드 전환·저장·안내·접근성·호환 모드를 본다.
//  1. 처음은 코드 모드: [블록]·[코드] 전환 단추만 보이고 Blockly(압축 전 약 0.8MB, gzip 약 0.2MB)를 받지 않는다. [블록]을 누르면 그때 받는다.
//  2. 블록 모드: 한국어 도구 상자 11칸(Phase 4 통합에서 "통신" 칸이 "화면" 다음에 들어옴), 처음 예시(내장 LED 깜빡이기)의 코드가 편집칸에 보이고, 편집칸은 읽기 전용(고치려 하면 안내).
//  3. 블록의 드롭다운(켜기 → 끄기)을 바꾸면 코드가 바로 바뀐다(블록 = 코드).
//  4. 새로고침해도 블록 모드·작업판이 그대로, ?example= 주소로 열면 코드 모드. [코드로 바꾸기]는 예제 칸에 고쳐 둔 코드가 있으면 먼저 묻는다.
//  5. 한 핀을 두 부품이 쓰면(레이저 21 + LCD SDA 21) 한국어 주의가 보인다.
//  6. 블록 전용 호환 모드(?limited=1 — JSPI가 없는 브라우저와 같은 파이썬 쪽): 블록이 만든 코드는 실행판으로 돌아 LED가 깜빡이고 터치 입력·[정지]를 받는다.
//     고친 코드는 "edited" 안내. WebKit 프로젝트가 있으면(공유 요청 — playwright.config.ts) 진짜 JSPI 없는 브라우저로 같은 것을 본다.
//  7. 키보드만으로 [블록] → 도구 상자(T·화살표) → 블록 넣기(Enter). 8. 가상 보드 배선 알림(블록 → 코드 머리말 → 다른 예제면 거둠).
//  9. 휴대폰 375px에서 가로 넘침 없음·도구 상자는 위. 10. [이 컴퓨터에서 내 기록 지우기].
// 보드 그림의 부품 확인은 보드 모듈이 알린 배선을 그리는 판(.cache/phase3-requests/blockly.md 1번 반영 뒤)에서만 한다 — 그 전에는 알림 속성만 본다.
import { expect, test, type Page } from '@playwright/test';
import {
  BLOCKS_LOAD_TIMEOUT,
  blocksRoot,
  boardPart,
  editorCode,
  labRoot,
  loadPreset,
  loadWorkspaceState,
  openEsp32Lab,
  pressPart,
  recordAttribute,
  runLab,
  switchToBlocks,
  waitBlocksReady,
  workspaceHost,
  ESP32_LAB_PATH,
} from './helpers/blocks.ts';

const BLINK_CODE = [
  '# 블록으로 만든 코드',
  'from machine import Pin',
  'from time import sleep',
  '',
  'led = Pin(2, Pin.OUT)',
  '',
  'while True:',
  '    led.on()',
  '    sleep(0.5)',
  '    led.off()',
  '    sleep(0.5)',
].join('\n');

/** 시나리오 B 작업판(직렬화 모양) — 끌어 놓기 검사는 scenario-b.spec.ts */
const TOUCH_LED_STATE = {
  blocks: {
    languageVersion: 0,
    blocks: [
      {
        type: 'apc_forever',
        x: 40,
        y: 40,
        inputs: {
          DO: {
            block: {
              type: 'controls_if',
              extraState: { hasElse: true },
              inputs: {
                IF0: { block: { type: 'apc_touch_pressed', fields: { PIN: '17' } } },
                DO0: { block: { type: 'apc_builtin_led', fields: { STATE: 'on' } } },
                ELSE: { block: { type: 'apc_builtin_led', fields: { STATE: 'off' } } },
              },
            },
          },
        },
      },
    ],
  },
};

async function ourBlocksKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => Object.keys(window.localStorage).filter((key) => key.startsWith('ai-physical-computing:module:blocks:')));
}

test.describe('ESP32 실습실 블록 모드', () => {
  test.describe.configure({ timeout: 300_000 });

  test('처음은 코드 모드이고 Blockly를 받지 않는다 — [블록]을 누르면 한국어 도구 상자와 블록이 만든 코드(읽기 전용)가 보인다', async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', '데스크톱에서 한 번 본다(휴대폰 배치는 따로).');
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const blocklyRequests: string[] = [];
    page.on('request', (request) => {
      if (/blockly/iu.test(request.url())) {
        blocklyRequests.push(request.url());
      }
    });
    await openEsp32Lab(page);
    await expect(labRoot(page)).toHaveAttribute('data-lab-modules', /\bblocks\b/u);
    await expect(labRoot(page)).toHaveAttribute('data-block-mode', 'code');
    // 전환 단추는 코드 칸 제목 바로 아래(편집칸과 같은 칸)
    const switcher = page.locator('.lab__editor [data-blocks-bar]');
    await expect(switcher).toBeVisible();
    await expect(switcher.getByRole('button', { name: '블록', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(switcher.getByRole('button', { name: '코드', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-blocks-area]')).toBeHidden();
    expect(blocklyRequests, '코드 모드에서는 Blockly를 받지 않아요').toEqual([]);

    await switchToBlocks(page);
    expect(blocklyRequests.length).toBeGreaterThan(0);
    await expect(page.locator('[data-blocks-workspace] .blocklyToolboxCategory')).toHaveText(['보드', '센서', '빛', '소리', '움직임', '화면', '통신', '반복·조건', '기다리기', '계산', '변수']);
    await expect.poll(() => editorCode(page)).toBe(BLINK_CODE);
    await expect(blocksRoot(page)).toHaveAttribute('data-blocks-block-count', '5');
    await expect(page.locator('[data-blocks-area]')).toContainText('블록이 만든 코드');

    // 편집칸은 읽기 전용: 글자를 쳐도 코드가 그대로이고 안내가 나온다
    await page.locator('[data-lab-editor] .cm-content').click();
    await page.keyboard.type('x');
    await expect(page.locator('[data-lab-message]')).toContainText('코드로 바꾸기');
    expect(await editorCode(page)).toBe(BLINK_CODE);
    expect(errors).toEqual([]);
  });

  test('블록의 드롭다운을 바꾸면 코드가 바로 바뀌고, 새로고침해도 블록 모드·작업판이 그대로다. ?example= 주소는 코드 모드로 연다', async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', '데스크톱에서 한 번 본다.');
    await openEsp32Lab(page);
    await switchToBlocks(page);
    // 첫 "내장 LED 켜기" 블록의 드롭다운(켜기)을 눌러 끄기를 고른다
    const field = page.locator('[data-blocks-workspace] .blocklyDropdownText', { hasText: '켜기' }).first();
    await field.click();
    await page.locator('.blocklyDropDownDiv .blocklyMenuItem', { hasText: '끄기' }).click();
    await expect.poll(() => editorCode(page)).toBe(BLINK_CODE.replace('    led.on()', '    led.off()'));

    await page.waitForTimeout(700); // 작업판 저장(0.4초 뒤)
    await page.reload();
    await waitBlocksReady(page);
    await expect.poll(() => editorCode(page)).toBe(BLINK_CODE.replace('    led.on()', '    led.off()'));
    expect(await ourBlocksKeys(page)).toEqual(
      expect.arrayContaining(['ai-physical-computing:module:blocks:workspace', 'ai-physical-computing:module:blocks:mode', 'ai-physical-computing:module:blocks:generated']),
    );

    await page.goto(`${ESP32_LAB_PATH}?example=${encodeURIComponent('esp32/02-boot-button-led.py')}`);
    await expect(labRoot(page)).toHaveAttribute('data-example', '02-boot-button-led', { timeout: BLOCKS_LOAD_TIMEOUT });
    await expect(labRoot(page)).toHaveAttribute('data-block-mode', 'code');
    await expect.poll(() => editorCode(page)).toContain('button = Pin(0, Pin.IN)');
  });

  test('[코드로 바꾸기]: 예제 칸에 고쳐 둔 코드가 있으면 먼저 묻고, 바꾸면 그 칸에 저장돼 새로고침해도 남는다', async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', '데스크톱에서 한 번 본다.');
    await openEsp32Lab(page);
    // 코드 모드에서 예제 코드를 조금 고쳐 둔다(자동 저장)
    await page.locator('[data-lab-editor] .cm-content').click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText('\n# 내가 고친 줄\n');
    await expect(labRoot(page)).toHaveAttribute('data-save-state', 'saved', { timeout: 10_000 });

    await switchToBlocks(page);
    await expect.poll(() => editorCode(page)).toBe(BLINK_CODE);
    await page.getByRole('button', { name: '코드로 바꾸기', exact: true }).click();
    const dialog = page.locator('[data-blocks-dialog]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('고쳐 둔 코드');
    await dialog.getByRole('button', { name: '취소', exact: true }).click();
    await expect(labRoot(page)).toHaveAttribute('data-block-mode', 'blocks');

    await page.getByRole('button', { name: '코드', exact: true }).click();
    await dialog.getByRole('button', { name: '블록 코드로 바꾸기', exact: true }).click();
    await expect(labRoot(page)).toHaveAttribute('data-block-mode', 'code');
    await expect(page.locator('[data-lab-message]')).toContainText('편집칸으로 옮겼어요');
    // 자동 저장(잠시 뒤)이 이 예제 칸에 블록 코드를 쓴 뒤에 새로고침한다
    await expect
      .poll(() =>
        page.evaluate(
          (code) =>
            Object.entries(window.localStorage).some(
              ([key, value]) =>
                key.startsWith('ai-physical-computing:editor:esp32:') && !key.endsWith(':last-example') && value.replace(/\n+$/u, '') === code,
            ),
          BLINK_CODE,
        ),
      )
      .toBe(true);
    await page.reload();
    await expect(labRoot(page)).toHaveAttribute('data-block-mode', 'code', { timeout: BLOCKS_LOAD_TIMEOUT });
    await expect.poll(() => editorCode(page), { timeout: 30_000 }).toBe(BLINK_CODE);
  });

  test('한 핀을 두 부품이 쓰면(레이저 21 + 문자 LCD SDA 21) 작업판 아래에 한국어 주의가 보인다', async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', '데스크톱에서 한 번 본다.');
    await openEsp32Lab(page, '?blocks=1');
    await waitBlocksReady(page);
    await loadWorkspaceState(page, {
      blocks: {
        languageVersion: 0,
        blocks: [
          {
            type: 'apc_laser',
            x: 40,
            y: 40,
            fields: { PIN: '21', STATE: 'on' },
            next: { block: { type: 'apc_lcd_clear' } },
          },
        ],
      },
    });
    await expect(blocksRoot(page)).toHaveAttribute('data-blocks-conflicts', '1');
    const warnings = page.locator('[data-blocks-warnings]');
    await expect(warnings).toBeVisible();
    await expect(warnings.locator('li')).toHaveText(/주의: 21번 핀을 레이저·문자 LCD SDA이\(가\) 함께 써요/u);
    await expect.poll(() => editorCode(page)).toContain('# @part laser 21');
  });

  test('블록 전용 호환 모드(?limited=1): 블록이 만든 코드는 실행판으로 돌아 깜빡이고, 터치 입력과 [정지]를 받는다 — 고친 코드는 안내만', async ({ page, browserName }) => {
    test.skip(test.info().project.name === 'mobile' || browserName === 'webkit', '데스크톱 Chromium 계열에서 JSPI를 끈 설정으로 본다(WebKit은 아래 검사).');
    await openEsp32Lab(page, '?limited=1&blocks=1');
    await expect(labRoot(page)).toHaveAttribute('data-limited', 'yes');
    await waitBlocksReady(page);
    await expect(page.locator('[data-blocks-compat-note]')).toBeVisible();

    // 1) 깜빡이기 예시: 실행판(exec)으로 LED가 켜졌다 꺼졌다 한다
    const lit = await recordAttribute(page, '[data-board-part="builtin-led"]', 'data-visual-lit');
    await runLab(page);
    await expect(blocksRoot(page)).toHaveAttribute('data-blocks-compat', 'exec');
    await expect(page.locator('[data-lab-message]')).toContainText('블록 전용 호환 모드');
    await expect.poll(lit, { timeout: 20_000 }).toContain('false,true,false,true');
    // [정지]가 기다리는 곳(await)에서 곧바로 먹는다(정지 2단계 — 파이썬 다시 시작 — 가 아님)
    await page.getByRole('button', { name: '정지', exact: true }).click();
    await expect(labRoot(page)).toHaveAttribute('data-outcome', 'stopped', { timeout: 30_000 });
    const stopMs = Number(await labRoot(page).getAttribute('data-stop-ms'));
    test.info().annotations.push({ type: '호환 모드 정지 시간(ms)', description: String(stopMs) });
    expect(stopMs).toBeLessThan(1000);

    // 2) 시나리오 B 작업판: 기다리는 블록이 없는 반복문도 터치 입력을 받는다
    await loadWorkspaceState(page, TOUCH_LED_STATE);
    await expect.poll(() => editorCode(page)).toContain('    if touch.value() == 1:');
    await runLab(page);
    await expect(blocksRoot(page)).toHaveAttribute('data-blocks-compat', 'exec');
    await expect(boardPart(page, 'builtin-led')).toHaveAttribute('data-visual-lit', 'false');
    // 터치 센서가 배선도에 없으면(보드 모듈이 배선 알림을 아직 받지 않는 판) 이 부분은 건너뛴다 — 공유 요청 1번
    if ((await boardPart(page, 'touch-digital').count()) > 0) {
      const release = await pressPart(page, 'touch-digital');
      await expect(boardPart(page, 'builtin-led')).toHaveAttribute('data-visual-lit', 'true', { timeout: 15_000 });
      await release();
      await expect(boardPart(page, 'builtin-led')).toHaveAttribute('data-visual-lit', 'false', { timeout: 15_000 });
    }
    await page.getByRole('button', { name: '정지', exact: true }).click();
    await expect(labRoot(page)).toHaveAttribute('data-outcome', 'stopped', { timeout: 30_000 });

    // 3) 코드로 바꿔 고치면 실행판을 쓰지 않고 안내한다
    await page.getByRole('button', { name: '코드로 바꾸기', exact: true }).click();
    await expect(labRoot(page)).toHaveAttribute('data-block-mode', 'code');
    await page.locator('[data-lab-editor] .cm-content').click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.insertText('# 블록으로 만든 코드\nprint("고친 코드")\n');
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(labRoot(page)).toHaveAttribute('data-outcome', 'ok', { timeout: 60_000 });
    await expect(blocksRoot(page)).toHaveAttribute('data-blocks-compat', 'edited');
    await expect(page.locator('[data-lab-message]')).toContainText('고치지 않았을 때');
  });

  test('WebKit(JSPI 없는 브라우저): 블록 전용 호환 모드로 깜빡이기 예시가 돌고 [정지]로 멈춘다', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'Playwright WebKit 프로젝트에서만(공유 요청 — playwright.config.ts에 webkit 프로젝트).');
    await openEsp32Lab(page, '?blocks=1');
    const jspi = await labRoot(page).getAttribute('data-jspi');
    test.info().annotations.push({ type: 'WebKit JSPI', description: String(jspi) });
    if (jspi !== 'no') {
      // 이 WebKit 빌드에 JSPI가 생겼으면 제한 모드를 주소로 켜서 같은 실행판 경로를 본다(결과는 주석으로 남는다)
      await openEsp32Lab(page, '?limited=1&blocks=1');
    }
    await expect(labRoot(page)).toHaveAttribute('data-limited', 'yes');
    await waitBlocksReady(page);
    const lit = await recordAttribute(page, '[data-board-part="builtin-led"]', 'data-visual-lit');
    await runLab(page);
    await expect(blocksRoot(page)).toHaveAttribute('data-blocks-compat', 'exec');
    await expect.poll(lit, { timeout: 30_000 }).toContain('false,true,false,true');
    await page.getByRole('button', { name: '정지', exact: true }).click();
    await expect(labRoot(page)).toHaveAttribute('data-outcome', 'stopped', { timeout: 30_000 });
    test.info().annotations.push({ type: 'WebKit 정지 시간(ms)', description: String(await labRoot(page).getAttribute('data-stop-ms')) });
  });

  test('키보드만으로: [블록] 단추(Enter) → Tab으로 도구 상자 → 화살표로 "센서" → 블록을 Enter로 넣는다', async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', '키보드 검사는 데스크톱에서.');
    await openEsp32Lab(page);
    await page.getByRole('button', { name: '블록', exact: true }).focus();
    await page.keyboard.press('Enter');
    await waitBlocksReady(page);
    await loadPreset(page, 'empty');
    await expect(blocksRoot(page)).toHaveAttribute('data-blocks-block-count', '0');
    // [블록] → [코드] → 블록 예시 → [예시 불러오기] → [코드로 바꾸기] → 도구 상자
    await page.getByRole('button', { name: '코드로 바꾸기', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect.poll(() => page.evaluate(() => document.activeElement?.id ?? '')).toMatch(/^blocks-cat-/u);
    await page.keyboard.press('ArrowDown'); // 센서
    await expect.poll(() => page.evaluate(() => document.activeElement?.id ?? '')).toBe('blocks-cat-sensor');
    await page.keyboard.press('ArrowRight'); // 펼친 목록의 첫 줄(설명 글)
    await page.keyboard.press('ArrowDown'); // 첫 블록: 터치 센서 누르고 있나요?
    await page.keyboard.press('Enter'); // 작업판에 넣기
    await expect(blocksRoot(page)).toHaveAttribute('data-blocks-block-count', '1', { timeout: 10_000 });
    await page.keyboard.press('Enter'); // 그 자리에 놓기
    await expect.poll(() => editorCode(page)).toContain('touch.value() == 1');
    await expect(blocksRoot(page)).toHaveAttribute('data-blocks-block-count', '1');
  });

  test('가상 보드 배선: 블록이 쓰는 부품을 알리고, [코드로 바꾸기] 뒤에도 코드 머리말(# @part)로 이어 알리며, 다른 예제를 불러오면 거둔다', async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', '데스크톱에서 한 번 본다.');
    await openEsp32Lab(page, '?blocks=1');
    await waitBlocksReady(page);
    await loadWorkspaceState(page, TOUCH_LED_STATE);
    await expect(labRoot(page)).toHaveAttribute('data-board-wiring-override', /"touch-digital"/u);
    await expect(blocksRoot(page)).toHaveAttribute('data-blocks-parts', 'builtin-led:2 touch-digital:17');
    // 보드 모듈이 알린 배선을 그리는 판(공유 요청 1번 반영 뒤)이면 터치 센서가 보드 아래에 나타난다
    const drawsAnnounced = await boardPart(page, 'touch-digital')
      .waitFor({ state: 'attached', timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    test.info().annotations.push({ type: '보드가 알린 배선을 그림', description: String(drawsAnnounced) });

    await page.getByRole('button', { name: '코드로 바꾸기', exact: true }).click();
    await expect(labRoot(page)).toHaveAttribute('data-block-mode', 'code');
    await expect(labRoot(page)).toHaveAttribute('data-board-wiring-override', /"touch-digital"/u);
    if (drawsAnnounced) {
      await expect(boardPart(page, 'touch-digital')).toBeAttached();
    }

    await page.locator('[data-lab-example-select]').selectOption('02-boot-button-led');
    await page.locator('[data-lab-example-load]').click();
    await expect(labRoot(page)).toHaveAttribute('data-example', '02-boot-button-led');
    await expect.poll(() => labRoot(page).getAttribute('data-board-wiring-override')).toBeNull();
    if (drawsAnnounced) {
      await expect(boardPart(page, 'touch-digital')).toHaveCount(0);
    }
  });

  test('휴대폰 375px: 블록 모드에서 페이지가 옆으로 넘치지 않고 도구 상자가 작업판 위에 있다', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile', '휴대폰 화면에서만.');
    await openEsp32Lab(page, '?blocks=1');
    await waitBlocksReady(page);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    const host = await workspaceHost(page).boundingBox();
    const toolbox = await page.locator('[data-blocks-workspace] .blocklyToolbox').first().boundingBox();
    expect(host && toolbox).toBeTruthy();
    expect(toolbox!.width).toBeGreaterThan(toolbox!.height);
    expect(toolbox!.y).toBeLessThan(host!.y + 40);
    await expect(page.getByRole('button', { name: '코드로 바꾸기', exact: true })).toBeVisible();
    // 모든 조작 단추가 화면 폭 안에 있다
    for (const name of ['블록', '코드', '예시 불러오기', '코드로 바꾸기']) {
      const box = await page.getByRole('button', { name, exact: true }).first().boundingBox();
      expect(box!.x + box!.width, name).toBeLessThanOrEqual(375);
    }
  });

  test('[이 컴퓨터에서 내 기록 지우기]를 누르면 코드 모드로 돌아가고 블록 모드 저장값이 모두 지워진다', async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', '데스크톱에서 한 번 본다.');
    await openEsp32Lab(page, '?blocks=1');
    await waitBlocksReady(page);
    await expect.poll(() => ourBlocksKeys(page)).toEqual(expect.arrayContaining(['ai-physical-computing:module:blocks:mode']));
    const records = page.locator('[data-lab] [data-clear-records]');
    await records.getByRole('button', { name: '이 컴퓨터에서 내 기록 지우기' }).click();
    await records.locator('[data-clear-records-confirm]').click();
    await expect(labRoot(page)).toHaveAttribute('data-block-mode', 'code');
    await expect(page.locator('[data-blocks-area]')).toBeHidden();
    await expect.poll(() => ourBlocksKeys(page)).toEqual([]);
    expect(await labRoot(page).getAttribute('data-board-wiring-override')).toBeNull();
  });
});
