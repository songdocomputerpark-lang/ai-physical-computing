// 접근성 — 키보드만으로 다니기·확대·움직임 줄이기(PLAN §8.6 P6-03, Phase 6 구역 B). axe(a11y.spec.ts)가 보지 못하는 것을 본다.
//
// 1) Tab 걷기: 대표 쪽에서 Tab만 눌러 끝까지 간다. 누를 때마다 초점이
//    - 새 요소로 옮겨 가고(같은 자리에 갇히지 않음 — WCAG 2.1.2),
//    - 화면에 보이고(크기가 있고 화면 안 — 2.4.7), 다른 요소에 가려지지 않으며(가운데 점을 덮는 요소가 없음 — 2.4.11),
//    - 초점 표시가 있다: 그 요소나 부모 두 단계의 테두리·그림자·바탕 등이 초점을 뺐을 때와 달라야 한다(2.4.7).
//    끝까지 가면(마지막 초점 요소 다음) 초점이 문서 밖(주소창 쪽)으로 나가거나 처음으로 돌아온다.
//    편집칸(CodeMirror)은 "Tab으로 막 들어오면 Tab 한 번으로 지나간다"(src/lab/editor/python-editor.ts)라서 걷기가 그 칸을 지나가야 한다.
// 2) 대화 상자·접기·메뉴: 키보드로 열고 Esc로 닫으면 초점이 연 단추로 돌아온다.
// 3) 확대 200%: 1366×768 창을 200%로 키운 것과 같은 683×384 화면, 글자만 200%(뿌리 글자 크기)로 쪽이 가로로 넘치지 않는다(1.4.4·1.4.10).
// 4) 움직임 줄이기(prefers-reduced-motion): 홈 흐름 그림이 멈춘 완성 그림이고, 도는 애니메이션이 없다(2.3.3).
//
// 개발 서버에서 돌 때는 다른 사람이 파일을 고칠 때마다 Vite가 열린 쪽을 새로 고쳐 걷기가 끊기므로 그 신호만 거른다(a11y.spec.ts와 같은 방법).
//
// 오래 걸리는 것(링크가 수백 개인 쪽의 Tab 걷기, 확대·글자 크기 검사의 나머지 쪽)은 `npm run test:a11y`(APC_E2E_GROUP=a11y)에서만 돈다.
// 전체 브라우저 검사(npm run test:e2e — CI 포함)에서는 대표 쪽만 본다(FULL이 아니면 test.skip). 쪽마다 적힌 full: true가 그 표시다.
import { expect, test, type Page } from '@playwright/test';
import { withBase } from '../../src/lib/url.ts';
import { waitBlocksReady } from './helpers/blocks.ts';

/** 실습실 준비를 기다리는 시간(Pyodide·OpenCV를 jsDelivr에서 받는다) */
const LAB_READY_TIMEOUT = 180_000;
/** npm run test:a11y로 돌 때(scripts/run-e2e-group.mjs가 넣는다) — 오래 걸리는 쪽까지 모두 본다 */
const FULL = process.env.APC_E2E_GROUP === 'a11y';
const FULL_ONLY_REASON = '오래 걸리는 쪽이라 npm run test:a11y에서만 본다(전체 검사에서는 대표 쪽만)';

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

/** Tab 한 번 뒤의 초점 모습 */
interface FocusStep {
  /** 초점이 문서 안 요소에 있는지(없으면 body 또는 문서 밖 — 걷기 끝) */
  readonly inside: boolean;
  /** 사람이 읽을 수 있는 요소 이름(실패 메시지용) */
  readonly label: string;
  /** 요소를 가리키는 열쇠(같은 요소인지 견줄 때) */
  readonly key: string;
  readonly visible: boolean;
  readonly obscuredBy: string | null;
  readonly indicator: boolean;
}

/**
 * 지금 초점 요소를 살핀다. 초점 표시는 "초점이 있을 때와 뺐을 때 모양이 다른가"로 본다 — 요소 자신과 부모 두 단계(와 그 앞뒤 가상 요소)의
 * 테두리(outline)·그림자·테두리 색·바탕색·밑줄·글자색을 견준다(퀴즈 보기처럼 부모 label에 표시를 그리는 것, CodeMirror처럼 바깥 틀에 그리는 것,
 * 카드 링크처럼 ::after에 그리는 것 포함). 초점·흐림 이벤트로 바뀌는 모양은 그 자리에서 바로 바뀌므로 기다리지 않는다 —
 * CodeMirror만 초점 표시(cm-focused)를 다음 화면 그리기 때 바꾸어 두 번 그리기를 기다린 뒤 본다(아래).
 * 잰 뒤 초점을 제자리로 돌려놓는다(다음 Tab이 이어지게).
 */
async function inspectFocus(page: Page): Promise<FocusStep> {
  return page.evaluate(async () => {
    const nextFrames = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    if (document.activeElement?.closest('.cm-editor')) {
      await nextFrames();
    }
    const active = document.activeElement;
    // 개발 서버가 문서 맨 끝에 붙이는 Astro 도구 막대(빌드 결과에는 없다)에 닿으면 쪽 끝으로 본다.
    const devToolbar = active?.tagName.toLowerCase() === 'astro-dev-toolbar';
    if (!(active instanceof HTMLElement || active instanceof SVGElement) || active === document.body || active === document.documentElement || devToolbar) {
      return { inside: false, label: '(문서 밖)', key: '', visible: true, obscuredBy: null, indicator: true };
    }
    const element = active as HTMLElement;
    const describe = (node: Element): string => {
      const name = node.getAttribute('aria-label') ?? (node.textContent ?? '').replace(/\s+/gu, ' ').trim().slice(0, 40);
      const classes = typeof node.className === 'string' ? node.className.split(/\s+/u).filter(Boolean).slice(0, 2).join('.') : '';
      return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${classes ? `.${classes}` : ''}「${name}」`;
    };
    // 같은 요소인지 견줄 열쇠: 처음 만난 차례대로 번호를 준다(DOM은 건드리지 않는다)
    const store = window as unknown as { __a11yWalkIds?: WeakMap<Element, number>; __a11yWalkNext?: number };
    store.__a11yWalkIds ??= new WeakMap();
    if (!store.__a11yWalkIds.has(element)) {
      store.__a11yWalkNext = (store.__a11yWalkNext ?? 0) + 1;
      store.__a11yWalkIds.set(element, store.__a11yWalkNext);
    }
    const key = `${store.__a11yWalkIds.get(element)}:${element.tagName}`;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const width = document.documentElement.clientWidth;
    const height = window.innerHeight;
    const visible =
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < height &&
      rect.left < width &&
      style.visibility !== 'hidden' &&
      Number(style.opacity) > 0;
    // 보이는 부분의 가운데 점을 덮는 요소가 있는지(개발 서버의 Astro 도구 막대는 빌드 결과에 없어 뺀다)
    let obscuredBy: string | null = null;
    if (visible && !(element instanceof HTMLIFrameElement)) {
      const x = (Math.max(rect.left, 0) + Math.min(rect.right, width)) / 2;
      const y = (Math.max(rect.top, 0) + Math.min(rect.bottom, height)) / 2;
      const hit = document.elementFromPoint(x, y);
      if (hit && !element.contains(hit) && !hit.contains(element) && !hit.closest('astro-dev-toolbar')) {
        obscuredBy = describe(hit);
      }
    }
    const chain: Element[] = [element];
    for (let parent = element.parentElement, depth = 0; parent && depth < 2; parent = parent.parentElement, depth += 1) {
      chain.push(parent);
    }
    // 카드 전체를 누르게 만든 링크처럼 초점 테두리를 ::after에 그리는 것도 있어(홈 기능 카드) 앞뒤 가상 요소도 함께 본다.
    // SVG 부품(가상 보드의 BOOT 버튼·터치 센서)은 초점 테두리를 안쪽 도형의 선(stroke)으로 그리므로(src/styles/board-drawing.css) 안쪽 도형도 본다.
    const svgInside = element instanceof SVGElement ? [...element.querySelectorAll('*')].slice(0, 40) : [];
    const snapshot = () =>
      [
        ...chain
          .flatMap((node) => [getComputedStyle(node), getComputedStyle(node, '::before'), getComputedStyle(node, '::after')])
          .map((computed) =>
            [
              computed.outlineStyle,
              computed.outlineWidth,
              computed.outlineColor,
              computed.boxShadow,
              computed.borderTopColor,
              computed.backgroundColor,
              computed.textDecorationLine,
              computed.color,
            ].join('|'),
          ),
        ...svgInside.map((node) => {
          const computed = getComputedStyle(node);
          return [computed.stroke, computed.strokeWidth, computed.fill, computed.opacity, computed.display].join('|');
        }),
      ].join('||');
    // Blockly 작업판(블록 모드): Blockly가 초점 요소에 blocklyActiveFocus 클래스를 붙이고 초점 테두리(노랑·파랑)를 스스로 그린다.
    // 그 테두리는 겹친 SVG 도형(작업판 테두리 사각형·확대 단추 그림)으로 그려져 이 검사의 "가운데 점을 덮는 요소"·"모양 비교"가 맞지 않는다 —
    // 클래스가 붙었는지만 보고 가림 검사는 하지 않는다(보이는 모양은 화면으로 확인: .cache/phase6-b/shots/blockly-tab-*.png, 보고서).
    if (element.closest('.injectionDiv')) {
      // 쓰레기통·확대 단추는 blocklyActiveFocus 없이 안쪽 사각형(.blocklyFocusRing)에 선을 그린다(:focus-visible).
      const ring = element.querySelector(':scope > .blocklyFocusRing');
      const indicator =
        element.closest('.blocklyActiveFocus') !== null ||
        element.querySelector('.blocklyActiveFocus') !== null ||
        (ring !== null && getComputedStyle(ring).stroke !== 'none') ||
        getComputedStyle(element).outlineStyle !== 'none';
      return { inside: true, label: describe(element), key, visible, obscuredBy: null, indicator };
    }
    // CodeMirror 편집칸: 초점을 뺐다 돌려놓으면 "Tab으로 막 들어온 편집칸은 Tab 한 번으로 지나간다"(1초 안)가 풀릴 수 있어,
    // 뺐다 넣지 않고 바깥 틀(.cm-editor)에 초점 표시 클래스와 테두리가 있는지 본다(src/lab/editor/theme.ts '&.cm-focused').
    const editor = element.closest('.cm-editor');
    if (editor) {
      const indicator = editor.classList.contains('cm-focused') && getComputedStyle(editor).outlineStyle !== 'none';
      return { inside: true, label: describe(element), key, visible, obscuredBy, indicator };
    }
    const focused = snapshot();
    element.blur();
    const blurred = snapshot();
    element.focus({ preventScroll: true });
    return { inside: true, label: describe(element), key, visible, obscuredBy, indicator: focused !== blurred };
  });
}

interface WalkResult {
  readonly steps: FocusStep[];
  /** 끝(문서 밖이나 처음 요소)에 닿았는지 */
  readonly finished: boolean;
  readonly problems: string[];
}

/** Tab만 눌러 쪽 끝까지 간다. 같은 요소에 두 번 연달아 머물면 갇힌 것으로 본다 */
async function tabWalk(page: Page, maxTabs: number): Promise<WalkResult> {
  const steps: FocusStep[] = [];
  const problems: string[] = [];
  let finished = false;
  let firstKey = '';
  for (let press = 0; press < maxTabs; press += 1) {
    await page.keyboard.press('Tab');
    const step = await inspectFocus(page);
    if (!step.inside) {
      finished = true;
      break;
    }
    if (press === 0) {
      firstKey = step.key;
    } else if (step.key === firstKey) {
      finished = true; // 한 바퀴 돌아 처음 요소로 돌아왔다
      break;
    }
    const previous = steps[steps.length - 1];
    if (previous && previous.key === step.key) {
      problems.push(`${press + 1}번째 Tab: 초점이 ${step.label}에 머문다(키보드 덫)`);
      break;
    }
    if (!step.visible) {
      problems.push(`${press + 1}번째 Tab: ${step.label}이(가) 화면에 보이지 않는다`);
    } else if (step.obscuredBy) {
      problems.push(`${press + 1}번째 Tab: ${step.label}을(를) ${step.obscuredBy}이(가) 가린다`);
    }
    if (!step.indicator) {
      problems.push(`${press + 1}번째 Tab: ${step.label}에 초점 표시가 없다`);
    }
    steps.push(step);
  }
  return { steps, finished, problems };
}

/** Tab 걷기를 할 쪽(full: npm run test:a11y에서만) */
const WALK_PAGES: readonly { label: string; path: string; maxTabs: number; full?: boolean; ready?: (page: Page) => Promise<void> }[] = [
  { label: '홈', path: '', maxTabs: 120 },
  { label: '차시 1-1-1(퀴즈·교사용·용어·발표 모드 단추)', path: 'learn/u1/1-1-1/', maxTabs: 400 },
  { label: '차시 2-1-1(보드 차시)', path: 'learn/u2/2-1-1/', maxTabs: 400, full: true },
  { label: '용어사전', path: 'glossary/', maxTabs: 900, full: true },
  { label: '교사용 자료실', path: 'teacher/', maxTabs: 150, full: true },
  { label: '예제 갤러리', path: 'labs/gallery/', maxTabs: 800, full: true },
  { label: '대시보드', path: 'labs/iot/dashboard/', maxTabs: 200 },
  { label: '보드 준비', path: 'start/board/', maxTabs: 200, full: true },
  {
    label: '영상처리 실습실(준비 끝)',
    path: 'labs/vision/',
    maxTabs: 250,
    ready: async (page) => {
      await waitLabsIdle(page);
      await expect(page.locator('[data-lab]')).toHaveAttribute('data-vision-packages', 'ready', { timeout: LAB_READY_TIMEOUT });
    },
  },
  {
    label: 'ESP32 실습실(준비 끝)',
    path: 'labs/esp32/',
    maxTabs: 250,
    ready: async (page) => {
      await waitLabsIdle(page);
      await expect(page.locator('[data-board-io]')).toHaveAttribute('data-board-ready', 'yes', { timeout: LAB_READY_TIMEOUT });
    },
  },
];

test.describe('키보드만으로 — Tab으로 끝까지 가며 초점이 보이고 갇히지 않는다', () => {
  test.skip(({ isMobile }) => isMobile, '키보드 걷기는 데스크톱에서 본다(휴대폰은 화면 키보드·터치)');
  // 초점마다 화면 그리기 두 번씩 기다리며 재므로 링크가 많은 쪽(용어사전·갤러리)은 몇 분 걸린다.
  test.describe.configure({ timeout: LAB_READY_TIMEOUT + 300_000 });

  for (const target of WALK_PAGES) {
    test(target.label, async ({ page }) => {
      test.skip(Boolean(target.full) && !FULL, FULL_ONLY_REASON);
      await freezeDevReloads(page);
      await page.goto(withBase(target.path));
      if (target.ready) {
        await target.ready(page);
      }
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
      const walk = await tabWalk(page, target.maxTabs);
      test.info().annotations.push({ type: 'Tab 걷기', description: `${target.label}: 초점 ${walk.steps.length}곳${walk.finished ? '' : '(끝까지 못 감)'}` });
      expect(walk.problems, walk.problems.join('\n')).toEqual([]);
      expect(walk.finished, `${target.label}: Tab ${target.maxTabs}번 안에 끝에 닿지 못했다(마지막: ${walk.steps.at(-1)?.label})`).toBe(true);
      // 첫 Tab은 본문 건너뛰기 링크다(모든 쪽 — BaseLayout).
      expect(walk.steps[0]?.label ?? '').toContain('본문으로 건너뛰기');
    });
  }
});

test.describe('키보드만으로 — 여닫는 것', () => {
  test.skip(({ isMobile }) => isMobile, '키보드 조작은 데스크톱에서 본다');
  test.describe.configure({ timeout: 120_000 });

  test('차시: 교사용 접기·더알아보기를 Enter로 열고 닫으며, 용어 풀이는 초점을 받으면 뜨고 Esc로 닫힌다', async ({ page }) => {
    await freezeDevReloads(page);
    await page.goto(withBase('learn/u1/1-1-2/'));
    const more = page.locator('details.box--more > summary').first();
    await more.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('details.box--more').first()).toHaveAttribute('open', '');
    await page.keyboard.press('Enter');
    await expect(page.locator('details.box--more').first()).not.toHaveAttribute('open', '');

    const teacher = page.locator('details.box--teacher > summary').first();
    await teacher.focus();
    await page.keyboard.press('Space');
    await expect(page.locator('details.box--teacher').first()).toHaveAttribute('open', '');

    const term = page.locator('.glossary-term__link').first();
    await term.focus();
    await expect(term).toHaveAttribute('data-tooltip', 'open');
    const tipId = await term.getAttribute('aria-describedby');
    await expect(page.locator(`[id="${tipId}"]`)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(`[id="${tipId}"]`)).toBeHidden();
    await expect(term).toBeFocused();
  });

  test('휴대폰 폭 메뉴: [메뉴]를 Enter로 열고 Esc로 닫으면 초점이 단추로 돌아온다', async ({ page }) => {
    await freezeDevReloads(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(withBase('learn/'));
    const button = page.locator('[data-menu-button]');
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('navigation', { name: '주 메뉴' })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('navigation', { name: '주 메뉴' }).getByRole('link').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toBeFocused();
  });

  test('실습실: [공유 링크] 대화 상자가 열린 동안 뒤쪽 쪽으로 초점이 가지 않고 Esc로 닫으면 [공유 링크]로 돌아온다, 편집칸은 Tab으로 지나간다', async ({ page }) => {
    test.setTimeout(LAB_READY_TIMEOUT + 60_000);
    await freezeDevReloads(page);
    await page.goto(withBase('labs/esp32/'));
    await waitLabsIdle(page);
    const share = page.locator('[data-lab-share]');
    await share.focus();
    await page.keyboard.press('Enter');
    const dialog = page.locator('[data-lab-share-dialog]');
    await expect(dialog).toHaveAttribute('open', '');
    // 모달 대화 상자: 뒤쪽 쪽 내용으로는 초점이 가지 않는다(끝에서 Tab을 누르면 브라우저 주소창 쪽으로 나갔다가 다시 대화 상자로 온다 — 브라우저 기본).
    let insideCount = 0;
    for (let press = 0; press < 8; press += 1) {
      await page.keyboard.press('Tab');
      const where = await page.evaluate(() => {
        const active = document.activeElement;
        if (!active || active === document.body) {
          return 'outside-document';
        }
        return active.closest('[data-lab-share-dialog]') ? 'dialog' : 'page';
      });
      expect(where, `${press + 1}번째 Tab에 초점이 대화 상자 뒤쪽 쪽 내용으로 갔다`).not.toBe('page');
      insideCount += where === 'dialog' ? 1 : 0;
    }
    expect(insideCount).toBeGreaterThan(3);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toHaveAttribute('open', '');
    await expect(share).toBeFocused();

    // 편집칸: Tab으로 들어오면 Tab 한 번으로 빠져나간다(키보드 덫이 아님)
    const content = page.locator('[data-lab-editor] .cm-content');
    await page.locator('[data-lab-font-larger]').focus();
    let reached = false;
    for (let press = 0; press < 6 && !reached; press += 1) {
      await page.keyboard.press('Tab');
      reached = await content.evaluate((element) => element === document.activeElement);
    }
    expect(reached, '글자 크게 단추 뒤 Tab 몇 번 안에 편집칸에 닿는다').toBe(true);
    await page.keyboard.press('Tab');
    await expect(content).not.toBeFocused();
  });

  test('ESP32 실습실: [블록]을 키보드로 켜고 끄며, 블록 모드에서도 Tab이 작업판을 지나간다', async ({ page }) => {
    test.setTimeout(LAB_READY_TIMEOUT + 120_000);
    await freezeDevReloads(page);
    await page.goto(withBase('labs/esp32/'));
    await waitLabsIdle(page);
    const blocksButton = page.getByRole('button', { name: '블록', exact: true });
    await blocksButton.focus();
    await page.keyboard.press('Enter');
    await waitBlocksReady(page);
    await expect(blocksButton).toHaveAttribute('aria-pressed', 'true');
    const walk = await tabWalk(page, 250);
    expect(walk.problems, walk.problems.join('\n')).toEqual([]);
    const codeButton = page.getByRole('button', { name: '코드', exact: true });
    await codeButton.focus();
    await page.keyboard.press('Enter');
    await expect(codeButton).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('키보드만으로 — 넘치는 표·그림 칸은 넘치는 동안만 Tab으로 들어와 방향키로 민다(scroll-focus)', () => {
  test.skip(({ isMobile }) => isMobile, '화면 폭을 직접 바꿔 가며 본다(데스크톱 프로젝트에서 한 번)');

  test('차시 표: 휴대폰 폭에서 넘치는 표만 초점을 받고, 방향키로 밀리며, 넓은 화면에서는 Tab 차례에서 빠진다', async ({ page }) => {
    await freezeDevReloads(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(withBase('learn/u3/3-1-1/'));
    const table = page.locator('.lesson-body .box--challenge table').first();
    await expect(table).toHaveAttribute('tabindex', '0');
    await expect(table).toHaveAttribute('data-scroll-focus-added', 'tabindex');
    // 표는 역할을 바꾸지 않는다(표로 읽힌다)
    expect(await table.evaluate((element) => element.getAttribute('role'))).toBeNull();
    await table.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => table.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await page.setViewportSize({ width: 1366, height: 768 });
    await expect(table).not.toHaveAttribute('tabindex', /.*/u);
    await expect(table).not.toHaveAttribute('data-scroll-focus-added', /.*/u);
  });

  test('가상 보드 그림: 휴대폰 폭(그림이 칸보다 넓음)에서는 이름 붙은 영역으로 초점을 받고, 넓은 화면에서는 빠진다', async ({ page }) => {
    test.setTimeout(LAB_READY_TIMEOUT + 60_000);
    await freezeDevReloads(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(withBase('labs/esp32/'));
    await expect(page.locator('[data-board-io]')).toHaveAttribute('data-board-ready', 'yes', { timeout: LAB_READY_TIMEOUT });
    const stage = page.locator('[data-board-stage]');
    await expect(stage).toHaveAttribute('tabindex', '0');
    await expect(stage).toHaveAttribute('role', 'region');
    await expect(stage).toHaveAttribute('aria-label', /가상 보드 그림/u);
    await page.setViewportSize({ width: 1366, height: 768 });
    await expect(stage).not.toHaveAttribute('tabindex', /.*/u);
    await expect(stage).not.toHaveAttribute('role', /.*/u);
  });
});

/** 쪽이 가로로 넘치는 만큼(px)과 넘치게 한 요소 몇 개 */
async function horizontalOverflow(page: Page): Promise<{ overflow: number; offenders: string[] }> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const overflow = document.documentElement.scrollWidth - width;
    const offenders: string[] = [];
    if (overflow > 0) {
      for (const element of document.querySelectorAll('body *')) {
        const rect = element.getBoundingClientRect();
        const deeper = [...element.children].some((child) => child.getBoundingClientRect().right > width + 0.5);
        if (rect.width > 0 && rect.right > width + 0.5 && !deeper) {
          offenders.push(`${element.tagName.toLowerCase()}.${element.getAttribute('class') ?? ''}(오른쪽 끝 ${Math.round(rect.right)}px)`);
        }
        if (offenders.length >= 5) {
          break;
        }
      }
    }
    return { overflow, offenders };
  });
}

/** 확대·글자 크기 검사를 할 쪽(글 쪽 + 실습실 틀, full: npm run test:a11y에서만) */
const ZOOM_PAGES: readonly { label: string; path: string; lab?: boolean; full?: boolean }[] = [
  { label: '홈', path: '' },
  { label: '배우기', path: 'learn/', full: true },
  { label: '차시 1-1-1', path: 'learn/u1/1-1-1/' },
  { label: '차시 3-1-1(표·더알아보기)', path: 'learn/u3/3-1-1/' },
  { label: '차시 4-2-1(긴 예제 발췌)', path: 'learn/u4/4-2-1/', full: true },
  { label: '용어사전', path: 'glossary/', full: true },
  { label: '교사용 지도 요약 I', path: 'teacher/guides/u1/', full: true },
  { label: '보드 준비', path: 'start/board/', full: true },
  { label: '점검', path: 'start/check/', full: true },
  { label: '파이썬 오류 사전', path: 'help/errors/', full: true },
  { label: '예제 갤러리', path: 'labs/gallery/', full: true },
  { label: '대시보드', path: 'labs/iot/dashboard/', full: true },
  { label: '영상처리 실습실', path: 'labs/vision/', lab: true, full: true },
  { label: 'ESP32 실습실', path: 'labs/esp32/', lab: true },
];

test.describe('확대 200% — 1366×768 창을 200%로 키운 화면(683×384)에서 쪽이 가로로 넘치지 않는다', () => {
  test.skip(({ isMobile }) => isMobile, '데스크톱 창을 키운 경우를 본다(휴대폰 폭은 모든 검사가 이미 375px로 돈다)');
  test.use({ viewport: { width: 683, height: 384 }, deviceScaleFactor: 2 });

  for (const target of ZOOM_PAGES) {
    test(target.label, async ({ page }) => {
      test.skip(Boolean(target.full) && !FULL, FULL_ONLY_REASON);
      test.setTimeout(target.lab ? LAB_READY_TIMEOUT + 30_000 : 60_000);
      await freezeDevReloads(page);
      await page.goto(withBase(target.path));
      if (target.lab) {
        await waitLabsIdle(page);
      }
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
      // 글꼴 CSS는 첫 그리기를 막지 않고 늦게 붙는다(BaseLayout — 구역 A 요청 A-2) — 글꼴이 다 그려진 모습으로 잰다.
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      const { overflow, offenders } = await horizontalOverflow(page);
      expect(overflow, `${target.label}: 가로 넘침 ${overflow}px — ${offenders.join(', ')}`).toBeLessThanOrEqual(0);
    });
  }
});

test.describe('글자만 200% — 브라우저 글자 크기를 두 배로 키워도 쪽이 가로로 넘치지 않는다', () => {
  test.skip(({ isMobile }) => isMobile, '데스크톱 창(1366×768)에서 본다');

  for (const target of ZOOM_PAGES) {
    test(target.label, async ({ page }) => {
      test.skip(Boolean(target.full) && !FULL, FULL_ONLY_REASON);
      test.setTimeout(target.lab ? LAB_READY_TIMEOUT + 30_000 : 60_000);
      await freezeDevReloads(page);
      // 브라우저 설정의 "글꼴 크기"(기본 16px)를 32px로 — 크롬 개발 도구 규약(Page.setFontSizes)으로 사용자가 설정에서 바꾼 것과 같게 한다.
      // 사이트의 글자·간격은 모두 rem이라 함께 커지고, rem으로 적은 화면 너비 기준(@media)도 사용자 설정처럼 함께 바뀐다
      // (뿌리 글자 크기를 CSS로 키우는 방법은 @media 기준을 16px 그대로 두어 실제와 다르다).
      const client = await page.context().newCDPSession(page);
      await client.send('Page.setFontSizes', { fontSizes: { standard: 32, fixed: 26 } });
      await page.goto(withBase(target.path));
      if (target.lab) {
        await waitLabsIdle(page);
      }
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      const rootSize = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
      expect(rootSize).toBeGreaterThanOrEqual(32);
      const { overflow, offenders } = await horizontalOverflow(page);
      expect(overflow, `${target.label}: 가로 넘침 ${overflow}px — ${offenders.join(', ')}`).toBeLessThanOrEqual(0);
    });
  }
});

test.describe('움직임 줄이기 — 운영체제 설정을 켜면 움직이는 것이 없다', () => {
  test.use({ reducedMotion: 'reduce' });

  /** 지금 돌고 있는 애니메이션(CSS 전환은 뺀다 — 움직임 줄이기에서도 0.01ms로 남는다, PROGRESS 미해결 182) */
  async function runningAnimations(page: Page): Promise<string[]> {
    return page.evaluate(() =>
      document
        .getAnimations()
        .filter((animation) => animation.playState === 'running' && !(typeof CSSTransition !== 'undefined' && animation instanceof CSSTransition))
        .map((animation) => {
          const target = (animation.effect as KeyframeEffect | null)?.target;
          const name = animation instanceof CSSAnimation ? animation.animationName : animation.id || '웹 애니메이션';
          return `${name} @ ${target instanceof Element ? `${target.tagName.toLowerCase()}.${target.getAttribute('class') ?? ''}` : '?'}`;
        }),
    );
  }

  test('홈: 흐름 그림은 멈춘 완성 그림이고 [그림 멈추기] 단추가 없다', async ({ page }) => {
    await freezeDevReloads(page);
    await page.goto(withBase(''));
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    await expect(page.locator('[data-flow]')).toHaveAttribute('data-state', 'static');
    expect(await runningAnimations(page)).toEqual([]);
  });

  test('차시·실습실 준비 화면: 도는 애니메이션이 없다', async ({ page }) => {
    test.setTimeout(LAB_READY_TIMEOUT + 30_000);
    await freezeDevReloads(page);
    await page.goto(withBase('learn/u1/1-1-1/'));
    expect(await runningAnimations(page)).toEqual([]);
    // 실습실은 파이썬을 받는 동안(진행률 막대·준비 단계 표시)과 준비가 끝난 뒤 모두 본다.
    await page.goto(withBase('labs/vision/'));
    await expect(page.locator('[data-lab]')).toHaveAttribute('data-state', /^(loading|idle)$/u, { timeout: 30_000 });
    expect(await runningAnimations(page)).toEqual([]);
    await waitLabsIdle(page);
    expect(await runningAnimations(page)).toEqual([]);
  });
});
