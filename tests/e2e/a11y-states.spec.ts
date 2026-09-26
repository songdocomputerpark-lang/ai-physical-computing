// 접근성 자동 검사 — 누르거나 실행한 뒤의 화면(PLAN §8.6 P6-03, Phase 6 구역 B). a11y.spec.ts는 쪽을 연 그대로를 보고, 여기서는
// 학생이 실제로 만나는 다음 화면을 axe로 훑는다: 퀴즈 채점·교사용 접기·더알아보기·용어 풀이·발표 모드·차시 안 실습실(iframe)·휴대폰 메뉴,
// 실습실의 실행 결과(출력 창·조절 막대·핀 표·배선도·부품 조작 칸)·오류 풀이 카드·대화 상자·블록 모드·[실제 보드] 탭·[보내기] 패널·흉내 모듈 패널.
//
// 판정은 a11y.spec.ts와 같다: axe 기본 규칙 전부, 영향도 critical·serious 0. 도구 오판(CodeMirror 스크롤 칸)만 그 규칙·그 요소에서 뺀다.
// 실습실 화면은 데스크톱에서만 본다(다른 실습실 검사와 같다 — 휴대폰 폭의 실습실 첫 화면은 a11y.spec.ts가 본다).
// ESP32 부품 예제는 전체 검사(npm run test:e2e)에서 세 개, npm run test:a11y(APC_E2E_GROUP=a11y)에서 일곱 개를 돌린다(시간).
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { searchConfig } from '../../src/config/search.ts';
import { withBase } from '../../src/lib/url.ts';
import { switchToBlocks, waitBlocksReady } from './helpers/blocks.ts';
import { labRoot, setEditorCode, waitDone } from './helpers/lab.ts';

type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>;
type AxeViolation = AxeResults['violations'][number];
type AxeNode = AxeViolation['nodes'][number];

const SEVERE_IMPACTS = new Set(['critical', 'serious']);
/** 실습실 준비를 기다리는 시간(Pyodide·OpenCV를 jsDelivr에서 받는다) */
const LAB_READY_TIMEOUT = 180_000;
/** npm run test:a11y로 돌 때(scripts/run-e2e-group.mjs가 넣는다) — 오래 걸리는 화면까지 모두 본다 */
const FULL = process.env.APC_E2E_GROUP === 'a11y';

/** 도구가 오판하는 곳 — a11y.spec.ts 머리말과 같은 까닭(CodeMirror 편집 영역은 contenteditable이라 Tab으로 초점을 받는다) */
const KNOWN_FALSE_POSITIVES: readonly { rule: string; target: RegExp }[] = [{ rule: 'scrollable-region-focusable', target: /\.cm-scroller/u }];

/** 개발 서버의 Vite 새로 고침 신호(full-reload·update)를 거른다. 빌드 결과에는 이 연결이 없다 */
async function freezeDevReloads(page: Page): Promise<void> {
  await page.routeWebSocket(/\/\?token=/u, (socket) => {
    const server = socket.connectToServer();
    server.onMessage((message) => {
      if (typeof message === 'string' && /"type":"(?:full-reload|update|prune)"/u.test(message)) {
        return;
      }
      socket.send(message);
    });
    socket.onMessage((message) => server.send(message));
  });
}

function targetText(node: AxeNode): string {
  return node.target.map((part) => (Array.isArray(part) ? part.join(' >>> ') : String(part))).join(' | ');
}

/** 지금 화면을 훑어 심각 위반(도구 오판 제외)을 모은다. 결과는 첨부하고, 실패는 테스트 끝에 한꺼번에 알린다 */
async function scanState(page: Page, testInfo: TestInfo, label: string, found: string[]): Promise<void> {
  // 늦게 그려지는 조각(모듈 패널·보드 그림)이 자리를 잡게 잠깐 둔다.
  await page.waitForTimeout(300);
  const results = await new AxeBuilder({ page }).exclude('astro-dev-toolbar').analyze();
  const violations = results.violations.flatMap((violation) => {
    const known = KNOWN_FALSE_POSITIVES.filter((entry) => entry.rule === violation.id);
    const nodes = violation.nodes.filter((node) => !known.some((entry) => entry.target.test(targetText(node))));
    return nodes.length === 0 ? [] : [{ ...violation, nodes }];
  });
  for (const violation of violations) {
    const line = `${label}: ${violation.id}(${violation.impact}) ${violation.nodes.length}곳 — ${violation.nodes
      .slice(0, 3)
      .map((node) => `${targetText(node)} ${node.html.slice(0, 160)}`)
      .join(' / ')}`;
    if (SEVERE_IMPACTS.has(violation.impact ?? '')) {
      found.push(`${line}\n    ${(violation.nodes[0]?.failureSummary ?? '').replace(/\s+/gu, ' ').slice(0, 300)}`);
    } else {
      testInfo.annotations.push({ type: `axe ${violation.impact}`, description: line });
    }
  }
  await testInfo.attach(`axe-${label}.json`, {
    body: JSON.stringify({ label, passes: results.passes.length, violations: violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(targetText) })) }, null, 2),
    contentType: 'application/json',
  });
}

async function waitLabsIdle(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const labs = [...document.querySelectorAll('[data-lab]')];
          return labs.length > 0 && labs.every((lab) => lab.getAttribute('data-state') === 'idle');
        }),
      { timeout: LAB_READY_TIMEOUT, intervals: [500, 1000] },
    )
    .toBe(true);
}

async function openEsp32Example(page: Page, file: string): Promise<void> {
  const response = await page.goto(withBase(`labs/esp32/?example=${encodeURIComponent(file)}`));
  expect(response?.status()).toBe(200);
  await waitLabsIdle(page);
  await expect(page.locator('[data-board-io]')).toHaveAttribute('data-board-ready', 'yes', { timeout: 60_000 });
}

async function runAndWaitBoard(page: Page): Promise<void> {
  await page.getByRole('button', { name: '실행', exact: true }).click();
  // 짧게 돌고 끝나는 예제(점검용)는 "run"을 지나 곧바로 "end"가 된다 — 보드가 한 번 돈 뒤의 화면이면 된다.
  await expect(page.locator('[data-board-io]')).toHaveAttribute('data-board-phase', /^(run|idle|end)$/u, { timeout: 60_000 });
}

async function stopRun(page: Page): Promise<void> {
  const stop = page.getByRole('button', { name: '정지', exact: true });
  if (await stop.isEnabled()) {
    await stop.click();
    await waitDone(page, 30_000);
  }
}

test.describe('차시 화면 — 누른 뒤', () => {
  // 한 검사에서 axe를 여러 번 돌린다(화면마다 몇 초) — 기본 30초로는 느린 컴퓨터에서 모자란다.
  test.describe.configure({ timeout: 180_000 });

  test('1-1-1: 퀴즈 채점·교사용 접기·용어 풀이·발표 모드', async ({ page }, testInfo) => {
    const found: string[] = [];
    await freezeDevReloads(page);
    await page.goto(withBase('learn/u1/1-1-1/'));

    // 퀴즈: 첫 문항은 틀린 보기, 둘째 문항은 정답을 골라 채점한다(정답·오답 색과 "정답"·"고른 답" 표시, 풀이 칸).
    const items = page.locator('[data-quiz-item]');
    const first = items.nth(0);
    const answer = Number(await first.getAttribute('data-answer'));
    await first.locator('input[type="radio"]').nth(answer === 0 ? 1 : 0).check();
    await first.locator('[data-quiz-check]').click();
    const second = items.nth(1);
    await second.locator('input[type="radio"]').nth(Number(await second.getAttribute('data-answer'))).check();
    await second.locator('[data-quiz-check]').click();
    await expect(second.locator('[data-quiz-feedback]')).not.toBeEmpty();
    await scanState(page, testInfo, '퀴즈 채점', found);

    // 교사용 접기 열기(이 차시의 원고와 자료 포함)
    await page.locator('details.box--teacher > summary').first().click();
    await scanState(page, testInfo, '교사용 접기', found);

    // 용어 풀이 말풍선(키보드 초점)
    const term = page.locator('.glossary-term__link').first();
    await term.focus();
    await expect(term).toHaveAttribute('data-tooltip', 'open');
    await scanState(page, testInfo, '용어 풀이', found);
    await page.keyboard.press('Escape');

    // 발표 모드(첫 장·둘째 장)
    const open = page.getByRole('button', { name: '발표 모드' });
    await open.click();
    await expect(page.locator('html')).toHaveAttribute('data-presenting', '');
    await scanState(page, testInfo, '발표 모드 첫 장', found);
    await page.keyboard.press('ArrowRight');
    await scanState(page, testInfo, '발표 모드 둘째 장', found);
    await page.keyboard.press('End');
    await scanState(page, testInfo, '발표 모드 마지막 장(퀴즈)', found);
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).not.toHaveAttribute('data-presenting', '');

    expect(found, found.join('\n')).toEqual([]);
  });

  test('1-1-2: 더알아보기를 펼친 화면, 휴대폰 폭이면 [그림 크게 보기]가 보이는 화면', async ({ page }, testInfo) => {
    const found: string[] = [];
    await freezeDevReloads(page);
    await page.goto(withBase('learn/u1/1-1-2/'));
    for (const summary of await page.locator('details.box--more > summary').all()) {
      await summary.click();
    }
    await scanState(page, testInfo, '더알아보기 펼침', found);
    expect(found, found.join('\n')).toEqual([]);
  });

  test('2-1-1: [이 자리에서 실습실 열기]로 연 차시 안 ESP32 실습실(iframe 안까지)', async ({ page }, testInfo) => {
    test.setTimeout(LAB_READY_TIMEOUT + 90_000);
    const found: string[] = [];
    await freezeDevReloads(page);
    await page.goto(withBase('learn/u2/2-1-1/'));
    const openButton = page.locator('[data-lesson-lab-open]').first();
    await openButton.click();
    await expect(openButton).toHaveAttribute('aria-expanded', 'true');
    const frame = page.locator('.lesson-example__frame').first().contentFrame();
    await expect(frame.locator('[data-lab]')).toHaveAttribute('data-state', 'idle', { timeout: LAB_READY_TIMEOUT });
    await expect(frame.locator('[data-board-io]')).toHaveAttribute('data-board-ready', 'yes', { timeout: 60_000 });
    await scanState(page, testInfo, '차시 안 실습실', found);
    expect(found, found.join('\n')).toEqual([]);
  });

  test('사이트 검색: 결과가 나온 화면(개발 서버처럼 검색 색인이 없으면 그 안내 화면)', async ({ page }, testInfo) => {
    const found: string[] = [];
    await freezeDevReloads(page);
    await page.goto(withBase(`search/?${searchConfig.queryParam}=${encodeURIComponent('픽셀')}`));
    const root = page.locator('[data-search-root]');
    await expect(root).toHaveAttribute('data-state', /^(results|empty|error)$/u, { timeout: 30_000 });
    const state = (await root.getAttribute('data-state')) ?? '';
    if (state === 'results' && (await page.getByRole('button', { name: '결과 더 보기' }).isVisible())) {
      await page.getByRole('button', { name: '결과 더 보기' }).click();
    }
    await scanState(page, testInfo, `검색 ${state}`, found);
    expect(found, found.join('\n')).toEqual([]);
  });

  test('휴대폰 폭: [메뉴]를 연 머리글', async ({ page }, testInfo) => {
    const found: string[] = [];
    await freezeDevReloads(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(withBase('learn/u1/1-1-1/'));
    await page.locator('[data-menu-button]').click();
    await expect(page.locator('[data-menu-button]')).toHaveAttribute('aria-expanded', 'true');
    await scanState(page, testInfo, '메뉴 열림', found);
    expect(found, found.join('\n')).toEqual([]);
  });
});

test.describe('실습실 — 실행한 뒤', () => {
  test.skip(({ isMobile }) => isMobile, '실습실 동작 화면은 데스크톱에서 본다(휴대폰 폭 첫 화면은 a11y.spec.ts)');
  // 예제 카드가 150개 넘는 갤러리는 axe 한 번에 수십 초 걸린다(실습실 검사는 저마다 더 길게 잡는다).
  test.describe.configure({ timeout: 180_000 });

  test('영상처리 실습실: 에지 예제 실행(출력 창·조절 막대) → 대화 상자 → 오류 풀이 카드 → [보내기] 패널·재생 입력·음성 패널', async ({ page }, testInfo) => {
    test.setTimeout(LAB_READY_TIMEOUT * 2 + 180_000);
    const found: string[] = [];
    await freezeDevReloads(page);
    await page.goto(withBase('labs/vision/'));
    await waitLabsIdle(page);
    await expect(labRoot(page)).toHaveAttribute('data-vision-packages', 'ready', { timeout: LAB_READY_TIMEOUT });

    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(page.locator('canvas[data-vision-window="edges"]')).toBeVisible({ timeout: 60_000 });
    await scanState(page, testInfo, '에지 예제 실행 중', found);
    await stopRun(page);

    await page.locator('[data-lab-share]').click();
    await expect(page.locator('[data-lab-share-dialog]')).toHaveAttribute('open', '');
    await scanState(page, testInfo, '공유 링크 대화 상자', found);
    await page.keyboard.press('Escape');

    await setEditorCode(page, 'print("시작")\nprint(아직_없는_이름)\n');
    await page.getByRole('button', { name: '실행', exact: true }).click();
    expect(await waitDone(page, 60_000)).toBe('error');
    await expect(page.locator('[data-lab-module-panel="errors"]')).toBeVisible();
    await scanState(page, testInfo, '오류 풀이 카드', found);

    // [초기화] 대화 상자는 코드를 고친 뒤에만 묻는다(고친 것이 없으면 바로 되돌림) — 위에서 코드를 바꿨다.
    await page.locator('[data-lab-reset]').click();
    await expect(page.locator('[data-lab-reset-dialog]')).toHaveAttribute('open', '');
    await scanState(page, testInfo, '초기화 대화 상자', found);
    await page.keyboard.press('Escape');

    // [보내기] 패널(통신 예제) — 코드가 serial을 쓰면 열린다
    await page.goto(withBase(`labs/vision/?example=${encodeURIComponent('vision/u3/3-1-2-uart-key-send.py')}`));
    await waitLabsIdle(page);
    await expect(page.locator('[data-lab-module-panel="vision-bridge"]')).toBeVisible({ timeout: 30_000 });
    await scanState(page, testInfo, '보내기 패널', found);

    // 손 인식(재생 입력 — 카메라 없이)
    await page.goto(withBase(`labs/vision/?example=${encodeURIComponent('vision/opmp/03-hands-model.py')}`));
    await waitLabsIdle(page);
    await expect(page.locator('[data-lab-module-panel="mediapipe"]')).toBeVisible({ timeout: 30_000 });
    await scanState(page, testInfo, '손 인식 패널', found);

    // 음성 인식(글자 입력 방식)
    await page.goto(withBase(`labs/vision/?example=${encodeURIComponent('vision/u1/1-4-3-speech-once.py')}`));
    await waitLabsIdle(page);
    await expect(page.locator('[data-lab-module-panel="speech"]')).toBeVisible({ timeout: 30_000 });
    await scanState(page, testInfo, '음성 패널', found);

    expect(found, found.join('\n')).toEqual([]);
  });

  test('영상처리 실습실: 가상 데스크톱(pyautogui) 예제', async ({ page }, testInfo) => {
    test.setTimeout(LAB_READY_TIMEOUT + 120_000);
    const found: string[] = [];
    await freezeDevReloads(page);
    await page.goto(withBase(`labs/vision/?example=${encodeURIComponent('desktop/02-mouse-move-click.py')}`));
    await waitLabsIdle(page);
    await expect(page.locator('[data-lab-module-panel="desktop"]')).toBeVisible({ timeout: 30_000 });
    await scanState(page, testInfo, '가상 데스크톱', found);
    expect(found, found.join('\n')).toEqual([]);
  });

  test('ESP32 실습실: 부품 예제 실행(배선도·핀 표·부품 조작 칸) → 블록 모드 → [실제 보드] 탭', async ({ page }, testInfo) => {
    test.setTimeout(LAB_READY_TIMEOUT * 2 + 300_000);
    const found: string[] = [];
    await freezeDevReloads(page);
    // 전체 검사(npm run test:e2e)에서는 앞의 세 예제(입력 부품·조작 칸·통신 창이 모두 나옴)만, npm run test:a11y에서는 모두 본다.
    const examples: readonly [string, string][] = [
      ['esp32/04-touch-vibration-alert.py', '터치·진동 모터'],
      ['esp32/u2/2-1-3-adv-touch4-oled-rgb-site.py', '4채널 터치·OLED·RGB LED'],
      ['esp32/u3/3-1-2-uart-laser-boot.py', 'USB-UART·레이저'],
      ['esp32/u2/2-1-5-neopixel-check-site.py', '네오픽셀'],
      ['esp32/u2/2-2-2-adv-touch4-mp3-player.py', 'MP3'],
      ['esp32/bt/b7-finger-lcd.py', '문자 LCD'],
      ['esp32/u3/3-1-3-ble-xy-rgb.py', '블루투스·RGB LED'],
    ];
    for (const [file, label] of FULL ? examples : examples.slice(0, 3)) {
      await openEsp32Example(page, file);
      await runAndWaitBoard(page);
      await page.waitForTimeout(800);
      await scanState(page, testInfo, `실행 중 — ${label}`, found);
      await stopRun(page);
    }

    await switchToBlocks(page);
    await waitBlocksReady(page);
    await scanState(page, testInfo, '블록 모드', found);
    await page.getByRole('button', { name: '코드', exact: true }).click();

    const realTab = page.getByRole('tab', { name: /실제 보드/u });
    if ((await realTab.count()) > 0) {
      await realTab.click();
      await scanState(page, testInfo, '실제 보드 탭', found);
    }

    expect(found, found.join('\n')).toEqual([]);
  });

  test('대시보드: [연결]한 뒤와 가상 보드를 연 뒤', async ({ page }, testInfo) => {
    test.setTimeout(LAB_READY_TIMEOUT + 120_000);
    const found: string[] = [];
    await freezeDevReloads(page);
    await page.goto(withBase('labs/iot/dashboard/'));
    const connect = page.getByRole('button', { name: '연결', exact: true });
    if (await connect.isVisible()) {
      await connect.click();
    }
    await scanState(page, testInfo, '대시보드 연결', found);
    const openBoard = page.getByRole('button', { name: /이 자리에서 가상 보드 열기/u });
    if ((await openBoard.count()) > 0) {
      await openBoard.click();
      const frame = page.locator('iframe').first().contentFrame();
      await expect(frame.locator('[data-lab]')).toHaveAttribute('data-state', 'idle', { timeout: LAB_READY_TIMEOUT });
      await scanState(page, testInfo, '대시보드 + 가상 보드', found);
    }
    expect(found, found.join('\n')).toEqual([]);
  });

  test('예제 갤러리: 거르기를 고른 화면', async ({ page }, testInfo) => {
    const found: string[] = [];
    await freezeDevReloads(page);
    await page.goto(withBase('labs/gallery/'));
    const firstFilter = page.locator('[data-gallery] input[type="checkbox"], [data-gallery] input[type="radio"]').first();
    if ((await firstFilter.count()) > 0) {
      await firstFilter.check();
    }
    await scanState(page, testInfo, '갤러리 거르기', found);
    expect(found, found.join('\n')).toEqual([]);
  });
});
