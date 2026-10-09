/**
 * 컴퓨터 쪽 실습실의 asyncio [정지](판 1.2.0 — PROGRESS 미해결 223, src/lab/python/apc_asyncio.py).
 *
 * 전에는 영상처리 실습실에서 `asyncio.run(main())` + `while True: … await asyncio.sleep(0.3)` 반복의 [정지]가 1초 안에 먹지 않아
 * "계산만 하는 반복문" 안내와 함께 파이썬을 다시 시작했다(실사이트 1.1.5 — [정지] 뒤 1,063ms에 killed). 이제는 학생 코드의 asyncio.sleep이
 * [정지]와 경주해 KeyboardInterrupt('stopped')로 1초 안에 멈추고, 정지 안내 카드는 "[정지] 단추로 멈췄어요 — 오류가 아니에요", 다시 [실행]이 된다.
 * 실측 정지 시간(data-stop-ms — [정지]를 누른 때부터 실행이 끝날 때까지)을 기록에 남긴다.
 * 컴퓨터 쪽 실습실 셋(영상처리·4단원 컴퓨터 칸·개발용 시험 페이지 — labId vision·dev)에서 본다. 워커·JSPI 동작이라 데스크톱만.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { STOP_GRACE_MS } from '../../src/lab/runtime/config.ts';
import { withBase } from '../../src/lib/url.ts';
import { LOAD_TIMEOUT, labRoot, openLabAndWaitReady, runCode, waitDone } from './helpers/lab.ts';
import { PACKAGES_TIMEOUT, VISION_PATH } from './helpers/vision.ts';

/** 미해결 223 재현 코드 그대로 */
const REPRO_223 = [
  'import asyncio',
  '',
  'async def main():',
  '    n = 0',
  '    while True:',
  '        n += 1',
  "        print('tick', n)",
  '        await asyncio.sleep(0.3)',
  '',
  'asyncio.run(main())',
  '',
].join('\n');

/** 파이썬을 다시 시작했다는 안내(client.ts KILLED_NOTICE의 앞부분) */
const RESTART_TEXT = '파이썬을 다시 시작했어요';

/** 이 실습실 틀(root) 안에서 코드를 넣고 [실행] — 한 쪽에 틀이 둘인 4단원 화면에서도 그 칸만 쓴다(helpers/lab.ts setEditorCode와 같은 길) */
async function runIn(page: Page, lab: Locator, code: string): Promise<void> {
  const content = lab.locator('[data-lab-editor] .cm-content');
  await content.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.insertText(code);
  await expect(lab.locator('[data-lab-editor] .cm-content')).toContainText('asyncio');
  await lab.getByRole('button', { name: '실행', exact: true }).click();
}

/** [정지]를 누르고 결과를 확인한다 — 'stopped'·정지 시간 1초 안·다시 시작 안내 없음. 정지 시간(ms)을 돌려준다. */
async function stopAndCheck(lab: Locator, label: string): Promise<number> {
  await lab.getByRole('button', { name: '정지', exact: true }).click();
  await expect(lab).toHaveAttribute('data-outcome', /^(ok|error|stopped|killed)$/u, { timeout: 10_000 });
  expect(await lab.getAttribute('data-outcome')).toBe('stopped');
  const stopMs = Number(await lab.getAttribute('data-stop-ms'));
  expect(stopMs).toBeLessThan(STOP_GRACE_MS);
  console.log(`[lab-stop-asyncio] ${label}: [정지]부터 멈출 때까지 ${stopMs}ms`);
  test.info().annotations.push({ type: `stop-ms ${label}`, description: String(stopMs) });
  await expect(lab.locator('[data-lab-result]')).toHaveText('[정지]를 눌러 멈췄어요(KeyboardInterrupt).');
  await expect(lab.locator('[data-lab-console]')).not.toContainText(RESTART_TEXT);
  await expect(lab).toHaveAttribute('data-state', 'idle');
  return stopMs;
}

test.describe('컴퓨터 쪽 asyncio [정지](미해결 223)', () => {
  test.skip(({ isMobile }) => isMobile, '워커·JSPI 동작은 데스크톱에서 확인한다');
  test.describe.configure({ timeout: 240_000 });

  test('영상처리 실습실: asyncio.run + await asyncio.sleep 반복이 [정지] 1초 안에 KeyboardInterrupt로 멈추고, 안내 카드가 맞고, 다시 [실행]된다', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(VISION_PATH);
    const lab = labRoot(page);
    await expect(lab).toHaveAttribute('data-state', 'idle', { timeout: LOAD_TIMEOUT });
    // 기본 예제(첫 에지)는 OpenCV를 쓰는 예제라 미리 받기가 끝난 뒤에 본다(받는 동안의 실행은 lab-vision-package-wait.spec.ts)
    await expect(lab).toHaveAttribute('data-vision-packages', 'ready', { timeout: PACKAGES_TIMEOUT });

    await runIn(page, lab, REPRO_223);
    await expect(lab).toHaveAttribute('data-state', 'running');
    const consoleBox = lab.locator('[data-lab-console]');
    await expect(consoleBox).toContainText('tick 2', { timeout: 30_000 });
    await stopAndCheck(lab, '영상처리 실습실');
    // 정지 안내 카드: 오류가 아니라는 [정지] 카드(파란 안내) — "계산만 하는 반복문"(파이썬 다시 시작) 카드가 아니다
    const card = lab.locator('[data-errors-card]');
    await expect(card).toBeVisible();
    await expect(card.locator('[data-errors-title]')).toHaveText('[정지] 단추로 멈췄어요 — 오류가 아니에요');
    await expect(card).not.toContainText('계산만');
    // 실행이 끝난 뒤 뒤에서 더 돌지 않는다(tick이 늘지 않음 — 0.3초 간격의 세 배를 기다려 본다)
    const ticksAtStop = ((await consoleBox.textContent()) ?? '').match(/tick \d+/gu)?.length ?? 0;
    await page.waitForTimeout(900);
    expect(((await consoleBox.textContent()) ?? '').match(/tick \d+/gu)?.length ?? 0).toBe(ticksAtStop);

    // 다시 [실행] — 평범한 asyncio 코드(gather·Event)가 끝까지 돈다
    await runIn(
      page,
      lab,
      [
        'import asyncio',
        'async def worker(name, ev):',
        '    await ev.wait()',
        '    return name * 2',
        'async def main():',
        '    ev = asyncio.Event()',
        "    tasks = [asyncio.create_task(worker(n, ev)) for n in ('가', '나')]",
        '    await asyncio.sleep(0.05)',
        '    ev.set()',
        '    return await asyncio.gather(*tasks)',
        "print('다시', asyncio.run(main()))",
        '',
      ].join('\n'),
    );
    expect(await waitDone(page, 30_000)).toBe('ok');
    await expect(consoleBox).toContainText("다시 ['가가', '나나']");
    expect(pageErrors).toEqual([]);
  });

  test('영상처리 실습실: Event만 기다리는 asyncio.run도 [정지]가 곧바로 먹는다(지켜보는 작업)', async ({ page }) => {
    await page.goto(VISION_PATH);
    const lab = labRoot(page);
    await expect(lab).toHaveAttribute('data-state', 'idle', { timeout: LOAD_TIMEOUT });
    // 기본 예제(첫 에지)는 OpenCV를 쓰는 예제라 미리 받기가 끝난 뒤에 본다(받는 동안의 실행은 lab-vision-package-wait.spec.ts)
    await expect(lab).toHaveAttribute('data-vision-packages', 'ready', { timeout: PACKAGES_TIMEOUT });
    await runIn(page, lab, ['import asyncio', 'async def main():', "    print('기다리는 중')", '    await asyncio.Event().wait()', 'asyncio.run(main())', ''].join('\n'));
    await expect(lab.locator('[data-lab-console]')).toContainText('기다리는 중', { timeout: 30_000 });
    await stopAndCheck(lab, '영상처리 실습실 Event');
  });

  test('4단원 통합 화면의 컴퓨터 칸에서도 [정지] 1초 안 — 보드 칸은 그대로', async ({ page }) => {
    await page.goto(withBase('labs/unit4/'));
    const pc = page.locator('[data-lab][data-lab-id="vision"]');
    const board = page.locator('[data-lab][data-lab-id="esp32"]');
    await expect(pc).toHaveAttribute('data-state', 'idle', { timeout: 180_000 });
    await expect(pc).toHaveAttribute('data-vision-packages', 'ready', { timeout: PACKAGES_TIMEOUT });
    await runIn(page, pc, REPRO_223);
    await expect(pc.locator('[data-lab-console]')).toContainText('tick 2', { timeout: 30_000 });
    await stopAndCheck(pc, '4단원 컴퓨터 칸');
    await expect(board).not.toHaveAttribute('data-state', 'running');
  });

  test('개발용 시험 페이지(labId dev)에서도 [정지] 1초 안, 맨 바깥 await 반복도 멈춘다', async ({ page }) => {
    await openLabAndWaitReady(page);
    const lab = labRoot(page);
    await runCode(page, REPRO_223);
    await expect(lab.locator('[data-lab-console]')).toContainText('tick 2', { timeout: 30_000 });
    await stopAndCheck(lab, '개발용 시험 페이지');
    await runCode(page, ['import asyncio', 'n = 0', 'while True:', '    n += 1', "    print('바깥', n)", '    await asyncio.sleep(0.1)', ''].join('\n'));
    await expect(lab.locator('[data-lab-console]')).toContainText('바깥 3', { timeout: 30_000 });
    await stopAndCheck(lab, '개발용 맨 바깥 await');
  });
});
