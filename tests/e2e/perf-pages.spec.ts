// 학습 페이지 성능(Phase 6 P6-02 — 구역 A) 브라우저 측정. 규칙·조건 값·표식은 scripts/perf-rules.mjs 한 곳.
//
// 무엇을 재나
//  1. 무거운 라이브러리는 실습실에서만(늘 돈다, 데스크톱): 실습실 밖 쪽(학습·교사용·갤러리·도움말·시작하기 …)을 캐시 없는 새 브라우저로
//     열고 끝까지 스크롤해, 받은 요청(페이지·서비스 워커 모두 — 문맥 단위) 가운데 Pyodide·MediaPipe·Blockly·MQTT.js·CodeMirror·esptool-js가
//     **0건**인지 요청 목록으로 본다(주소 모양 + 스크립트 본문 표식). 전체 실행(npm run test:e2e)에서는 대표 쪽만, npm run perf:measure에서는
//     목록 전체와 차시 45편을 모두 본다. 알아보는 규칙이 살아 있는지 영상처리 실습실에서 Pyodide·CodeMirror를 알아보는지도 함께 본다(긍정 대조).
//  2. 느린 3G에서 3초 안에 읽히는지는 tests/e2e/perf-timing.spec.ts(perf 무리에서만 — 추적 기록을 끄는 설정이 파일 단위라 나눴다).
//  3. 원고 그림 자리(미해결 190, 늘 돈다): 마크다운으로 넣은 원고 그림이 받기 전에도 가로세로 비율대로 자리를 잡고, 받은 뒤 높이가 그대로다
//     (레이아웃 이동 0). 차시 번호(미해결 174, 두 화면 크기): 좁은 표 칸의 "2-1-3"·"2-1-R"이 한 줄에 있다.
//
// 결과: 콘솔 표 + 테스트 첨부(perf-pages-heavy.json). 보고서는 .cache/phase6-notes/zone-a-perf.md.
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { HEAVY_LIBRARIES, PERF_PAGES, heavyLibraryOf, lessonPagesFromFiles, type PerfPage } from '../../scripts/perf-rules.mjs';
import { withBase } from '../../src/lib/url.ts';
import { labRoot } from './helpers/lab.ts';

const IS_PERF_GROUP = process.env.APC_E2E_GROUP === 'perf';
const ROOT = process.cwd();

/** 초안이 아닌 차시 파일(content/lessons 기준) */
function lessonFiles(): string[] {
  const dir = path.join(ROOT, 'content', 'lessons');
  return fs
    .readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.md'))
    .map((file) => file.split(path.sep).join('/'))
    .filter((file) => !/^draft:\s*true\s*$/mu.test(fs.readFileSync(path.join(dir, file), 'utf8').split(/\n---\s*\n/u)[0] ?? ''));
}

interface RequestRecord {
  readonly url: string;
  readonly type: string;
  readonly bytes: number;
  readonly library: string | null;
}

/** 문맥이 받은 요청(페이지·서비스 워커)을 모으고, 스크립트는 본문 표식까지 본다 */
function trackRequests(context: BrowserContext): { records: RequestRecord[]; settle(): Promise<void> } {
  const records: RequestRecord[] = [];
  const pending: Promise<void>[] = [];
  context.on('requestfinished', (request) => {
    const url = request.url();
    if (!/^https?:/u.test(url)) {
      return;
    }
    pending.push(
      (async () => {
        const sizes = await request.sizes().catch(() => null);
        const response = await request.response().catch(() => null);
        const contentType = (await response?.headerValue('content-type').catch(() => null)) ?? '';
        let body: string | null = null;
        if (/javascript|ecmascript/u.test(contentType) || /\.(?:m?js|ts)(?:[?#]|$)/u.test(url)) {
          body = (await response?.text().catch(() => null)) ?? null;
        }
        records.push({
          url,
          type: request.resourceType(),
          bytes: sizes ? Math.max(0, sizes.responseBodySize) + Math.max(0, sizes.responseHeadersSize) : 0,
          library: heavyLibraryOf(url, body),
        });
      })(),
    );
  });
  return {
    records,
    async settle() {
      await Promise.all(pending.splice(0));
    },
  };
}

/**
 * 개발 서버를 여럿이 함께 쓰는 동안 다른 구역이 파일을 고치면 Vite가 쪽을 다시 불러 검사가 "Execution context was destroyed"로 흔들린다
 * (2026-09-26 겪음). Vite HMR 웹소켓의 다시 부르기 알림만 버린다(구역 B a11y spec과 같은 방법). 빌드 결과·실사이트에는 그 웹소켓이 없어 아무 일도 없다.
 */
async function freezeDevReloads(target: BrowserContext | Page): Promise<void> {
  await target.routeWebSocket(/\/\?token=/u, (socket) => {
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

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(0)}KB`;
}

function attachJson(testInfo: TestInfo, name: string, value: unknown): Promise<void> {
  const file = testInfo.outputPath(name);
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
  return testInfo.attach(name, { path: file, contentType: 'application/json' });
}

/** 쪽 하나를 새 브라우저 문맥으로 열어 끝까지 내리고, 받은 요청을 돌려준다 */
async function visitAndCollect(browser: Browser, baseURL: string, target: PerfPage): Promise<{ records: RequestRecord[]; status: number | null }> {
  const context = await browser.newContext({ baseURL, viewport: { width: 1366, height: 768 }, locale: 'ko-KR' });
  await freezeDevReloads(context);
  const tracker = trackRequests(context);
  const page = await context.newPage();
  const response = await page.goto(withBase(target.path), { waitUntil: 'load', timeout: 120_000 });
  // 늦게 받는 것(보이면 받는 그림·쉴 때 받는 스크립트·서비스 워커 사전 캐시)까지 보려고 끝까지 내리고 조용해질 때까지 기다린다
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += Math.max(400, window.innerHeight)) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(800);
  await tracker.settle();
  const records = [...tracker.records];
  await context.close();
  return { records, status: response?.status() ?? null };
}

test.describe('무거운 라이브러리는 실습실에서만(P6-02)', () => {
  test.describe.configure({ timeout: IS_PERF_GROUP ? 1_800_000 : 300_000 });
  test.skip(({ isMobile }) => Boolean(isMobile), '받는 파일은 화면 크기와 상관없어 데스크톱에서만 본다');

  test('실습실 밖 쪽에서 Pyodide·MediaPipe·Blockly·MQTT.js·CodeMirror·esptool-js 요청이 0건이다', async ({ browser, baseURL }, testInfo) => {
    const pages: PerfPage[] = IS_PERF_GROUP ? [...PERF_PAGES, ...lessonPagesFromFiles(lessonFiles()).filter((item) => !PERF_PAGES.some((known) => known.path === item.path))] : PERF_PAGES.filter((item) => item.quick);
    const rows: { path: string; label: string; status: number | null; requests: number; bytes: number; scriptBytes: number; heavy: string[] }[] = [];
    for (const target of pages) {
      const { records, status } = await visitAndCollect(browser, baseURL ?? '', target);
      const heavy = records.filter((record) => record.library !== null).map((record) => `${record.library}: ${record.url}`);
      const row = {
        path: target.path,
        label: target.label,
        status,
        requests: records.length,
        bytes: records.reduce((sum, record) => sum + record.bytes, 0),
        scriptBytes: records.filter((record) => record.type === 'script').reduce((sum, record) => sum + record.bytes, 0),
        heavy,
      };
      rows.push(row);
      console.log(`[무거운 라이브러리] /${target.path} ${target.label}: 요청 ${row.requests}건·${kb(row.bytes)}(스크립트 ${kb(row.scriptBytes)}) — 무거운 라이브러리 ${heavy.length}건`);
      expect.soft(status, `/${target.path} 응답`).toBe(200);
      expect.soft(heavy, `/${target.path}(${target.label})가 실습실 라이브러리를 받았어요`).toEqual([]);
    }
    await attachJson(testInfo, 'perf-pages-heavy.json', { measuredAt: new Date().toISOString(), baseURL, libraries: HEAVY_LIBRARIES.map((item) => item.id), rows });
    expect(rows.length).toBe(pages.length);
  });

  test('알아보는 규칙이 살아 있다: 영상처리 실습실에서는 Pyodide·CodeMirror를 알아본다(긍정 대조)', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, viewport: { width: 1366, height: 768 }, locale: 'ko-KR' });
    await freezeDevReloads(context);
    const tracker = trackRequests(context);
    const page = await context.newPage();
    await page.goto(withBase('labs/vision/'));
    await expect(labRoot(page)).toHaveAttribute('data-lab-modules', /\bloading\b/u, { timeout: 120_000 });
    await expect
      .poll(
        async () => {
          await tracker.settle();
          return [...new Set(tracker.records.map((record) => record.library).filter((id): id is string => id !== null))].sort();
        },
        { timeout: 180_000, intervals: [1000] },
      )
      .toEqual(expect.arrayContaining(['codemirror', 'pyodide']));
    await context.close();
  });

  test('알아보는 규칙이 살아 있다: ESP32 실습실에서 [블록]을 누르면 Blockly를 알아본다(긍정 대조, perf 무리)', async ({ browser, baseURL }) => {
    test.skip(!IS_PERF_GROUP, 'npm run perf:measure에서만(Blockly 0.8MB를 받는다)');
    const context = await browser.newContext({ baseURL, viewport: { width: 1366, height: 768 }, locale: 'ko-KR' });
    await freezeDevReloads(context);
    const tracker = trackRequests(context);
    const page = await context.newPage();
    await page.goto(withBase('labs/esp32/'));
    await expect(labRoot(page)).toHaveAttribute('data-lab-modules', /\bblocks\b/u, { timeout: 120_000 });
    await tracker.settle();
    expect(tracker.records.some((record) => record.library === 'blockly'), '[블록]을 누르기 전에는 Blockly를 받지 않는다').toBe(false);
    await page.getByRole('button', { name: '블록', exact: true }).first().click();
    await expect
      .poll(
        async () => {
          await tracker.settle();
          return tracker.records.some((record) => record.library === 'blockly');
        },
        { timeout: 120_000, intervals: [1000] },
      )
      .toBe(true);
    await context.close();
  });
});

test.describe('원고 그림 자리와 차시 번호 줄바꿈(미해결 190·174)', () => {
  // 빌드 결과에는 서비스 워커가 있어, 페이지를 맡은 뒤의 그림 요청은 서비스 워커가 받아 page.route로 늦출 수 없다(늦춘 요청이 3장 가운데 2장뿐이었다 —
  // 2026-09-26 통합이 빌드 결과에서 처음 돌려 찾음. 개발 서버에는 서비스 워커가 없다). 이 묶음은 그림 자리만 보므로 서비스 워커를 막는다.
  test.use({ serviceWorkers: 'block' });

  test('마크다운 원고 그림은 받기 전에도 비율대로 자리를 잡고, 받은 뒤 높이가 그대로다(레이아웃 이동 0)', async ({ page, isMobile }) => {
    test.skip(isMobile, '데스크톱 한 번이면 된다(휴대폰은 같은 속성·같은 CSS)');
    await freezeDevReloads(page);
    // 그림 받기를 4초 늦춰, 받기 전·뒤의 자리를 견준다(느린 망에서 그림이 늦게 오는 것과 같다)
    let held = 0;
    await page.route(/\/images\/lessons\/1-1-1\/(?:recognition|learning|reasoning)\.webp$/u, async (route) => {
      held += 1;
      await new Promise((resolve) => setTimeout(resolve, 4000));
      await route.continue().catch(() => undefined);
    });
    await page.goto(withBase('learn/u1/1-1-1/'));
    const images = page.locator('.lesson-body img[src$=".webp"]');
    await expect(images).toHaveCount(3);
    const boxes = async () =>
      images.evaluateAll((elements) =>
        elements.map((element) => {
          const image = element as HTMLImageElement;
          const rect = image.getBoundingClientRect();
          return { src: image.getAttribute('src'), width: image.getAttribute('width'), height: image.getAttribute('height'), w: Math.round(rect.width), h: Math.round(rect.height), complete: image.complete && image.naturalWidth > 0 };
        }),
      );
    // 보이는 곳까지 내려 게으른 받기(loading="lazy")가 시작되게 한다
    await images.first().scrollIntoViewIfNeeded();
    const before = await boxes();
    expect(before.map((item) => [item.width, item.height])).toEqual([
      ['415', '415'],
      ['420', '324'],
      ['420', '416'],
    ]);
    for (const item of before) {
      expect(item.complete, `${item.src}는 아직 받지 않았다`).toBe(false);
      expect(item.h, `${item.src}의 자리 높이(받기 전)`).toBeGreaterThan(20);
      // 자리 비율 = 그림 비율(표 칸에서 폭이 줄어도)
      expect(Math.abs(item.h / item.w - Number(item.height) / Number(item.width)), `${item.src} 비율`).toBeLessThan(0.03);
    }
    // 그림이 도착하는 동안의 레이아웃 이동을 모은다(사용자 입력 직후 것은 뺀다 — CLS 규칙)
    await page.evaluate(() => {
      const box = { total: 0 };
      (window as unknown as { __apcShift: typeof box }).__apcShift = box;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
          if (!entry.hadRecentInput) {
            box.total += entry.value;
          }
        }
      }).observe({ type: 'layout-shift' });
    });
    await expect.poll(async () => (await boxes()).every((item) => item.complete), { timeout: 30_000 }).toBe(true);
    await page.waitForTimeout(500);
    expect(held, '그림 받기를 늦췄다').toBeGreaterThanOrEqual(3);
    const after = await boxes();
    expect(after.map((item) => item.h)).toEqual(before.map((item) => item.h));
    const cls = await page.evaluate(() => (window as unknown as { __apcShift: { total: number } }).__apcShift.total);
    console.log(`[그림 자리] 1-1-1 원고 그림 3장: 받기 전 높이 ${before.map((item) => item.h).join('·')}px = 받은 뒤 ${after.map((item) => item.h).join('·')}px, 그동안 레이아웃 이동 합 ${cls.toFixed(4)}`);
    expect(cls).toBeLessThan(0.01);
  });

  test('좁은 표 칸에서도 차시 번호(2-1-3·2-1-R)가 하이픈 뒤에서 갈리지 않는다', async ({ page }) => {
    await freezeDevReloads(page);
    await page.goto(withBase('learn/u2/review/'));
    const numbers = page.locator('.lesson-body td .nowrap');
    await expect(numbers.first()).toBeAttached();
    const lines = await numbers.evaluateAll((elements) => elements.map((element) => ({ text: element.textContent, lines: element.getClientRects().length, whiteSpace: getComputedStyle(element).whiteSpace })));
    expect(lines.length).toBeGreaterThan(3);
    for (const item of lines) {
      expect(item.whiteSpace, `${item.text}`).toBe('nowrap');
      expect(item.lines, `${item.text}가 두 줄로 갈렸어요`).toBe(1);
    }
    // 링크 주소(/learn/u2/2-1-r/)는 그대로다
    await expect(page.locator('.lesson-body a[href$="/learn/u2/2-1-r/"]').first()).toContainText('2-1-R');
  });
});
