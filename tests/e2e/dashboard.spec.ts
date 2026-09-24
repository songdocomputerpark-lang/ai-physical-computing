// 대시보드(P4-07) 브라우저 테스트 = **시나리오 D**(SPEC §13·PLAN §8.7) — 구역 D 2차.
// 확인하는 것
//  1. **한 탭**: 대시보드 옆에 연 가상 보드가 보낸 값이 그래프·게이지·로그에 나타나고, 스위치를 누르면 보드의 LED가 켜진다.
//  2. **두 탭**: 다른 탭에서 연 ESP32 실습실과 접두어를 맞추면 같은 일이 탭 사이로 일어난다([친구 접두어]로 맞춘다).
//  3. 위젯을 **키보드로도** 옮기고 크기를 바꾸며, 그 배치가 새로 고쳐도 남는다(localStorage).
//  4. 끌어서도 옮길 수 있고, 위젯을 더하고 지우고 처음 배치로 되돌릴 수 있다.
//  5. 움직임 줄이기(reduced-motion)에서는 게이지 애니메이션 시간이 0이다.
//
// 개발 서버로 시험할 때의 함정(다른 구역도 겪었다): 누군가 저장소 파일을 저장하면 Vite가 페이지를 통째로 새로 고쳐
// 연결이 풀린다. 그래서 [연결]은 connectDashboard로 세 번까지 다시 누른다(공개 브로커가 한 번에 안 붙는 교실에도 도움이 된다).
import { expect, test, type FrameLocator, type Page } from '@playwright/test';
import { withBase } from '../../src/lib/url.ts';
import { labRoot, LOAD_TIMEOUT } from './helpers/lab.ts';

const DASHBOARD_PATH = withBase('labs/iot/dashboard/');
/** 대시보드 실습 예제(통신 템플릿 4 — src/lab/dashboard/demo-code.ts DASHBOARD_DEMO_FILE)의 실습실 예제 id */
const DEMO_EXAMPLE_ID = 'templates-dashboard-demo';
/** 시험용 고정 접두어(PD-29의 글자만 — l·1·O·0 없음) */
const PREFIX = 'dashtest2345';
const FRIEND_PREFIX = 'dashfriend34';
const PREFIX_STORAGE_KEY = 'ai-physical-computing:bridge:prefix';
/** 값이 오갈 때까지 기다리는 시간(가상 보드가 파이썬을 받는 시간을 넉넉히 본다) */
const FLOW_TIMEOUT = 120_000;

function page4(page: Page) {
  return page.locator('[data-dash-page]');
}

function widget(page: Page, id: string) {
  return page.locator(`[data-dash-widget="${id}"]`);
}

function labFrame(page: Page): FrameLocator {
  return page.frameLocator('[data-dash-lab-frame]');
}

/** 대시보드를 연다(위젯 네 개가 그려질 때까지) */
async function openDashboard(page: Page): Promise<void> {
  const response = await page.goto(DASHBOARD_PATH);
  expect(response?.status()).toBe(200);
  await expect(page4(page)).toHaveAttribute('data-dash-ready', 'yes');
  await expect(page.locator('[data-dash-grid]')).toHaveAttribute('data-dash-count', '4');
}

/** [연결]을 누르고 통로가 열릴 때까지 기다린다(세 번까지 다시 누른다) */
async function connectDashboard(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.locator('[data-dash-connect]').click();
    try {
      await expect(page4(page)).toHaveAttribute('data-dash-state', 'open', { timeout: 20_000 });
      return;
    } catch {
      continue;
    }
  }
  await expect(page4(page)).toHaveAttribute('data-dash-state', 'open', { timeout: 20_000 });
}

/** 두 탭이 같은 접두어를 쓰게 미리 적어 둔다(진짜 화면에서는 [친구 접두어]로 맞춘다 — 3번 시험이 그 길을 본다) */
async function fixPrefix(page: Page, prefix: string): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      try {
        window.sessionStorage.setItem(key as string, value as string);
      } catch {
        // 사생활 보호 모드처럼 저장이 막힌 브라우저에서는 화면이 새 접두어를 만든다.
      }
    },
    [PREFIX_STORAGE_KEY, prefix],
  );
}

/** 열린 ESP32 실습실 탭의 가상 보드가 준비될 때까지 기다린다 */
async function waitLab(page: Page): Promise<void> {
  await expect(labRoot(page)).toHaveAttribute('data-state', 'idle', { timeout: LOAD_TIMEOUT });
  await expect(page.locator('[data-board-io]')).toHaveAttribute('data-board-ready', 'yes', { timeout: 60_000 });
}

test.describe('대시보드 — 시나리오 D', () => {
  test.describe.configure({ timeout: 300_000 });

  test('한 탭: 가상 보드 값이 그래프·게이지에 보이고 스위치로 LED를 켠다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openDashboard(page);

    // 통로 안내가 늘 보인다(PD-29). 기본은 인터넷이 필요 없는 같은 컴퓨터 탭이다.
    await expect(page.locator('[data-dash-warning]')).toContainText('같은 컴퓨터의 다른 탭하고만 통해요');
    await expect(page4(page)).toHaveAttribute('data-dash-mode-value', 'tab');
    const prefix = (await page.locator('[data-dash-prefix]').textContent())?.trim() ?? '';
    expect(prefix).toMatch(/^[a-z0-9]{12}$/u);

    await connectDashboard(page);
    await expect(page4(page)).toHaveAttribute('data-dash-via', 'tab');

    // [이 자리에서 가상 보드 열기] — 누르기 전에는 실습실 틀이 없다.
    await expect(page.locator('[data-dash-lab-frame]')).toHaveCount(0);
    await page.locator('[data-dash-open-lab]').click();
    const frame = labFrame(page);
    await expect(frame.locator('[data-lab]')).toHaveAttribute('data-state', 'idle', { timeout: LOAD_TIMEOUT });
    // 틀 안 실습실은 대시보드 예제(통신 템플릿 4)를 예제로 연다 — 예제 이름이 코드와 같다(2026-09-25 검토 반영)
    await expect(frame.locator('[data-lab]')).toHaveAttribute('data-example', DEMO_EXAMPLE_ID);

    // 같은 탭이라 통신 접두어(sessionStorage)가 그대로 이어진다.
    await expect(frame.locator('[data-mqtt-prefix]')).toHaveText(prefix, { timeout: 30_000 });

    await frame.getByRole('button', { name: '실행', exact: true }).click();

    // 보드가 보낸 값이 그래프·게이지·로그에 들어온다.
    await expect(widget(page, 'chart-1')).toHaveAttribute('data-dash-points', /^([3-9]|\d{2,})$/u, { timeout: FLOW_TIMEOUT });
    await expect(widget(page, 'gauge-1').locator('[data-dash-value]')).toHaveText(/^\d+$/u);
    await expect(widget(page, 'chart-1').locator('[data-dash-last]')).toContainText('마지막 값');
    await expect(widget(page, 'log-1').locator('li').first()).toContainText('esp32-01/tx');

    // 스위치 → 보드의 내장 LED(GPIO2)가 켜진다.
    await page.locator('[data-dash-switch]').click();
    await expect(page.locator('[data-dash-switch]')).toHaveAttribute('aria-pressed', 'true');
    await expect(frame.locator('[data-board-part="builtin-led"]')).toHaveAttribute('data-visual-lit', 'true', { timeout: 30_000 });
    await expect(frame.locator('[data-board-pin="2"]')).toHaveAttribute('data-level', '1');

    // 다시 누르면 꺼진다(허용 목록 안의 말만 듣는다).
    await page.locator('[data-dash-switch]').click();
    await expect(frame.locator('[data-board-part="builtin-led"]')).toHaveAttribute('data-visual-lit', 'false', { timeout: 30_000 });

    await frame.getByRole('button', { name: '정지', exact: true }).click();
    expect(errors).toEqual([]);
  });

  test('두 탭: [새 탭에서 ESP32 실습실 열기]가 같은 예제·같은 접두어로 열고, 그 보드 값이 흐르고 스위치가 LED를 켠다', async ({ page }) => {
    await fixPrefix(page, PREFIX);
    await openDashboard(page);
    await expect(page.locator('[data-dash-prefix]')).toHaveText(PREFIX);
    await connectDashboard(page);

    // 링크에 대시보드 예제와 지금 접두어가 실린다 — 학생이 12글자를 옮겨 적지 않는다(2026-09-25 검토 반영)
    const link = page.locator('[data-dash-lab-link]');
    await expect(link).toHaveAttribute('href', new RegExp(`example=esp32%2Ftemplates%2Fdashboard-demo\\.py&prefix=${PREFIX}$`, 'u'));
    await expect(link).toHaveAttribute('target', '_blank');
    const [labTab] = await Promise.all([page.context().waitForEvent('page'), link.click()]);
    await waitLab(labTab);
    await expect(labRoot(labTab)).toHaveAttribute('data-example', DEMO_EXAMPLE_ID);
    await expect(labTab.locator('[data-mqtt-prefix]')).toHaveText(PREFIX, { timeout: 30_000 });

    await labTab.getByRole('button', { name: '실행', exact: true }).click();

    await expect(widget(page, 'chart-1')).toHaveAttribute('data-dash-points', /^([3-9]|\d{2,})$/u, { timeout: FLOW_TIMEOUT });
    await expect(widget(page, 'gauge-1').locator('[data-dash-value]')).toHaveText(/^\d+$/u);

    await page.locator('[data-dash-switch]').click();
    await expect(labTab.locator('[data-board-part="builtin-led"]')).toHaveAttribute('data-visual-lit', 'true', { timeout: 30_000 });

    await labTab.getByRole('button', { name: '정지', exact: true }).click();
    await labTab.close();
  });

  test('[친구 접두어]로 다른 탭과 접두어를 맞춘다', async ({ page }) => {
    await fixPrefix(page, PREFIX);
    await openDashboard(page);
    await expect(page.locator('[data-dash-prefix]')).toHaveText(PREFIX);

    await page.locator('[data-dash-friend]').fill(FRIEND_PREFIX);
    await page.getByRole('button', { name: '맞추기' }).click();
    await expect(page.locator('[data-dash-prefix]')).toHaveText(FRIEND_PREFIX);
    await expect(page.locator('[data-dash-hint]')).toContainText('접두어를 맞췄어요');

    // 모양이 틀리면 한국어 이유를 보이고 접두어를 바꾸지 않는다.
    await page.locator('[data-dash-friend]').fill('짧음');
    await page.getByRole('button', { name: '맞추기' }).click();
    await expect(page.locator('[data-dash-hint]')).toContainText('쓸 수 없어요');
    await expect(page.locator('[data-dash-prefix]')).toHaveText(FRIEND_PREFIX);

    // 공개 중계 서버를 고르면 경고가 경고 상자로 바뀐다(PD-29 — 늘 보인다).
    await page.locator('[data-dash-mode]').selectOption('broker');
    await expect(page.locator('[data-dash-warning]')).toContainText('누구나 보고, 누구나 보낼 수도 있어요');
    await expect(page.locator('[data-dash-warning]')).toHaveAttribute('data-dash-level', 'warn');
  });

  test('브릿지(P4-01)로 온 값도 위젯에 들어온다 — bridge/pc 토픽', async ({ page }) => {
    await fixPrefix(page, PREFIX);
    await openDashboard(page);
    await connectDashboard(page);
    await expect(page4(page)).toHaveAttribute('data-dash-bridge', 'on');

    // 그래프가 영상처리 실습실 쪽 값을 보게 토픽을 바꾼다.
    const chart = widget(page, 'chart-1');
    await chart.locator('[data-dash-settings]').click();
    await chart.locator('[data-dash-field="topic"]').fill('bridge/pc');
    await chart.locator('[data-dash-field="topic"]').blur();

    // 다른 탭이 [보내기] 패널처럼 같은 컴퓨터 탭 브릿지로 값을 보낸다(같은 접두어).
    const sender = await page.context().newPage();
    await sender.goto(DASHBOARD_PATH);
    await sender.evaluate(
      ({ channelName, values }) => {
        const channel = new BroadcastChannel(channelName);
        for (const value of values) {
          channel.postMessage({ v: 1, type: 'bridge.data', from: 'pc', bytes: new TextEncoder().encode(`${value}\n`), at: Date.now() });
        }
        window.setTimeout(() => channel.close(), 500);
      },
      { channelName: `ai-physical-computing:bridge:${PREFIX}`, values: [1, 2, 3, 4] },
    );

    await expect(chart).toHaveAttribute('data-dash-points', '4', { timeout: 20_000 });
    await expect(chart.locator('[data-dash-last]')).toContainText('마지막 값 4');
    await expect(widget(page, 'log-1').locator('li').first()).toContainText('bridge/pc');
    await sender.close();
  });

  test('연결하지 않고 스위치를 누르면 무엇을 할지 알려 주고, 스위치는 켜진 모양이 되지 않는다', async ({ page }) => {
    await openDashboard(page);
    await page.locator('[data-dash-switch]').click();
    await expect(page.locator('[data-dash-hint]')).toContainText('[연결]');
    // 보내지 못했으니 모양을 그대로 두고, 까닭을 스위치 위젯 안에도 적는다(휴대폰에서는 1단계 안내 줄이 화면 밖 — 2026-09-25 검토 반영)
    await expect(page.locator('[data-dash-switch]')).toHaveAttribute('aria-pressed', 'false');
    await expect(widget(page, 'switch-1').locator('[data-dash-switch-problem]')).toContainText('[연결]');
    await expect(widget(page, 'switch-1').locator('[data-dash-switch-problem]')).toBeInViewport();
  });

  test('통로가 같은 컴퓨터 탭이면 [이 자리에서 가상 보드 열기]가 [연결]까지 해 준다', async ({ page }) => {
    await openDashboard(page);
    await expect(page4(page)).toHaveAttribute('data-dash-state', 'idle');
    await page.locator('[data-dash-open-lab]').click();
    await expect(page4(page)).toHaveAttribute('data-dash-state', 'open', { timeout: 20_000 });
    await expect(page4(page)).toHaveAttribute('data-dash-via', 'tab');
    await expect(page.locator('[data-dash-hint]')).toContainText('[연결]도 해 두었어요');
  });

  test('공개 중계 서버를 고르면 [연결] 바로 아래에 경고가 늘 보이고, 막히면 탭으로 몰래 바꾸지 않고 알린다', async ({ page }) => {
    // 공개 서버에는 실제로 나가지 않는다 — WebSocket을 곧바로 닫는 가짜 서버(문서를 열기 전에 건다)
    await page.routeWebSocket(/.*/u, (ws) => {
      ws.close();
    });
    await openDashboard(page);
    await page.locator('[data-dash-mode]').selectOption('broker');
    await expect(page.locator('[data-dash-connect-warning]')).toBeVisible();
    await expect(page.locator('[data-dash-connect-warning]')).toContainText('누구나 보고 보낼 수 있어요');
    // 휴대폰에서도 [연결]을 누르는 자리에서 경고가 함께 보인다(§7.4 "연결 버튼 옆")
    await page.locator('[data-dash-connect]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-dash-connect-warning]')).toBeInViewport();

    await page.locator('[data-dash-connect]').click();
    await expect(page.locator('[data-dash-hint]')).toContainText('연결하지 못했어요', { timeout: 60_000 });
    await expect(page.locator('[data-dash-hint]')).toHaveAttribute('data-dash-level', 'warn');
    await expect(page4(page)).not.toHaveAttribute('data-dash-via', 'tab');
    await expect(page.locator('[data-dash-check-note]')).toBeVisible();
  });

  test('키보드로 위젯을 옮기고 크기를 바꾸면 새로 고쳐도 남는다', async ({ page }) => {
    await openDashboard(page);
    const target = widget(page, 'switch-1');
    await expect(target).toHaveAttribute('data-dash-x', '9');

    await target.locator('[data-dash-grab]').focus();
    // 방향키가 페이지를 스크롤하지 않는지 본다: 위젯이 받은 키는 기본 동작(스크롤)을 막아야 한다.
    // (스크롤 위치를 견주는 방법은 크롬의 스크롤 고정 기능 때문에 흔들려서, 막았는지를 바로 본다.)
    await page.evaluate(() => {
      const marks: { key: string; prevented: boolean }[] = [];
      (window as unknown as { __dashKeyPrevented: { key: string; prevented: boolean }[] }).__dashKeyPrevented = marks;
      window.addEventListener('keydown', (event) => marks.push({ key: event.key, prevented: event.defaultPrevented }));
    });

    await page.keyboard.press('ArrowDown');
    await expect(target).toHaveAttribute('data-dash-y', '1');
    await expect(page.locator('[data-dash-announce]')).toContainText('옮겼어요');
    // 옮긴 뒤에도 손잡이에 초점이 남아 있어야 방향키로 이어서 옮길 수 있다(위젯을 다시 그려도).
    await expect(target.locator('[data-dash-grab]')).toBeFocused();

    await page.keyboard.press('Shift+ArrowLeft');
    await expect(target).toHaveAttribute('data-dash-w', '2');
    await expect(page.locator('[data-dash-announce]')).toContainText('크기를');

    const marks = await page.evaluate(() => (window as unknown as { __dashKeyPrevented: { key: string; prevented: boolean }[] }).__dashKeyPrevented);
    const arrows = marks.filter((mark) => mark.key.startsWith('Arrow'));
    expect(arrows.length).toBeGreaterThanOrEqual(2);
    expect(arrows.every((mark) => mark.prevented)).toBe(true);

    await page.reload();
    await expect(widget(page, 'switch-1')).toHaveAttribute('data-dash-y', '1');
    await expect(widget(page, 'switch-1')).toHaveAttribute('data-dash-w', '2');
  });

  test('끌어서 옮기고, 위젯을 더하고 지우고 처음 배치로 되돌린다', async ({ page, isMobile }) => {
    test.skip(Boolean(isMobile), '좁은 화면은 위젯을 한 줄에 하나씩 쌓아 보여 주므로 끌어 놓기 대신 아래 휴대폰 검사를 본다.');
    await openDashboard(page);
    const gauge = widget(page, 'gauge-1');
    const grab = gauge.locator('[data-dash-grab]');
    // 마우스는 화면 안에서만 움직일 수 있다 — 판이 화면 아래에 있으면 먼저 보이게 한다.
    await page.locator('[data-dash-grid]').scrollIntoViewIfNeeded();
    const box = await grab.boundingBox();
    expect(box).not.toBeNull();
    const chartBox = await widget(page, 'chart-1').boundingBox();
    expect(chartBox).not.toBeNull();
    const cell = (chartBox?.width ?? 600) / 6;

    // 손잡이를 잡고 왼쪽으로 두 칸 끈다.
    await page.mouse.move((box?.x ?? 0) + 10, (box?.y ?? 0) + 10);
    await page.mouse.down();
    await page.mouse.move((box?.x ?? 0) + 10 - cell * 2, (box?.y ?? 0) + 10, { steps: 8 });
    await page.mouse.up();
    await expect(gauge).toHaveAttribute('data-dash-x', '4');

    // 위젯 더하기 → 같은 종류가 하나 늘고, 지우면 줄어든다.
    await page.locator('[data-dash-add="gauge"]').click();
    await expect(page.locator('[data-dash-widget]')).toHaveCount(5);
    await widget(page, 'gauge-2').locator('[data-dash-remove]').click();
    await expect(page.locator('[data-dash-widget]')).toHaveCount(4);

    // 되돌리면 처음 자리로 돌아온다.
    await page.locator('[data-dash-reset]').click();
    await expect(gauge).toHaveAttribute('data-dash-x', '6');
    await expect(page.locator('[data-dash-announce]')).toContainText('처음 모습으로');
  });

  test('위젯 설정에서 토픽을 바꾸면 그 토픽의 값만 받는다', async ({ page }) => {
    await openDashboard(page);
    await connectDashboard(page);

    const gauge = widget(page, 'gauge-1');
    await gauge.locator('[data-dash-settings]').click();
    await gauge.locator('[data-dash-field="topic"]').fill('esp32-09/tx');
    await gauge.locator('[data-dash-field="title"]').fill('친구 보드');
    await gauge.locator('[data-dash-field="title"]').blur();
    await expect(gauge.locator('.dash-widget__title')).toHaveText('친구 보드');

    // 같은 페이지의 스위치로 보낸 말은 게이지 토픽이 아니라 그래프·게이지에 들어가지 않는다.
    await page.locator('[data-dash-switch]').click();
    await expect(page.locator('[data-dash-log] li').first()).toContainText('esp32-01/rx');
    await expect(gauge.locator('[data-dash-value]')).toHaveText('—');
  });
});

test.describe('대시보드 — 휴대폰 화면', () => {
  test('좁은 화면에서는 위젯이 한 줄에 하나씩 쌓이고 옆으로 넘치지 않는다', async ({ page, isMobile }) => {
    test.skip(!isMobile, '휴대폰 프로젝트에서만 본다(데스크톱 배치는 위 검사들).');
    await openDashboard(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    // 위젯이 세로로 쌓인다(같은 가로 자리, 서로 다른 세로 자리).
    const boxes = await page.locator('[data-dash-widget]').evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width) };
      }),
    );
    expect(boxes).toHaveLength(4);
    const lefts = new Set(boxes.map((box) => box.left));
    expect(lefts.size).toBe(1);
    const tops = boxes.map((box) => box.top);
    expect([...tops].sort((a, b) => a - b)).toEqual(tops);

    // 키보드로 옮기는 길은 좁은 화면에서도 그대로 있다(읽는 순서가 바뀐다).
    const target = widget(page, 'switch-1');
    await target.locator('[data-dash-grab]').focus();
    await page.keyboard.press('ArrowDown');
    await expect(target).toHaveAttribute('data-dash-y', '1');
  });
});

/** 게이지 바늘·눈금의 애니메이션 시간(초) */
async function gaugeTransitionSeconds(page: Page): Promise<number> {
  return page.evaluate(() => {
    const path = document.querySelector('.dash-gauge__value');
    return path === null ? -1 : Number.parseFloat(window.getComputedStyle(path).transitionDuration);
  });
}

test.describe('대시보드 — 움직임 줄이기', () => {
  test.use({ reducedMotion: 'reduce' });

  test('움직임 줄이기에서는 게이지 애니메이션이 사실상 사라진다', async ({ page }) => {
    await openDashboard(page);
    // 사이트 공통 규칙(global.css)이 움직임 줄이기에서 모든 전환을 0.01ms로 줄인다 → 0.00001초.
    const seconds = await gaugeTransitionSeconds(page);
    expect(seconds).toBeGreaterThanOrEqual(0);
    expect(seconds).toBeLessThanOrEqual(0.001);
  });
});

test.describe('대시보드 — 보통 움직임', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('보통 때는 게이지 바늘이 부드럽게 움직인다(전환 시간이 있다)', async ({ page }) => {
    await openDashboard(page);
    expect(await gaugeTransitionSeconds(page)).toBeGreaterThan(0.05);
  });
});
