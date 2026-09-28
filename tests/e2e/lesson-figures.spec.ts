// 차시 그림의 글자 크기(PROGRESS 미해결 209 — 판 1.1.0 구역 D).
// 사이트가 그린 SVG는 폭 640에 글자 16px라 휴대폰 375 폭(본문 343px)에서 약 8.6px로 보였다. 글이 많은 그림은 옆에 좁은 화면용 그림
// (x.narrow.svg — 폭 360 안팎, 글자 13px 이상)을 두면 마크다운 출력 다듬기(src/lib/rehype-lesson-polish.mjs 3번)가 <picture>로 감싸
// 휴대폰은 좁은 그림을 받는다. 이 검사는 실제 차시 쪽에서
//  ① 휴대폰(375×812): 고친 차시의 사이트 그림 글자가 **보이는 크기로 11px 이상**인지(그림 파일을 같은 폭으로 그려 글자마다 잼),
//     좁은 그림이 있는 그림은 좁은 그림을 받는지, 가로 넘침이 없는지
//  ② 데스크톱(1366×768): 원래 그림을 받고, <source>에 좁은 그림의 가로·세로가 있는지, [그림 크게 보기]는 원래 그림을 여는지
//  ③ 휴대폰에서 [그림 크게 보기]를 누르면 SVG 그림은 이 쪽 안의 크게 보기 창이 열려 본문 그림(좁은 그림)이 본문보다 크게 보이는지,
//     Esc로 닫으면 링크로 초점이 돌아오는지(1.1.0 교실 사용성 검토 사소 4 — 전에는 SVG 파일이 휴대폰 기본 창 폭으로 열려 본문보다 작았다)
// 를 본다. 단위 테스트(tests/unit/lesson/narrow-figures.test.ts)는 차시 45편 출력과 좁은 그림 파일 규칙을 본다.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { stripBase } from '../../src/lib/url.ts';

/**
 * 그림을 다 고친 차시(휴대폰에서 사이트 그림 글자가 모두 11px 이상) — 그림을 더 고치면 여기에 차시를 더한다.
 * u1/review(I단원 마무리)는 처음부터 11px 이상이라 고친 것 없이 지키기만 한다.
 * 남은 차시는 .cache/v110-notes/zone-d-svg.md의 "남은 그림" 표.
 */
const CHECKED_LESSONS = [
  'u1/1-1-1',
  'u1/1-1-2',
  'u1/1-1-3',
  'u1/1-2-1',
  'u1/1-2-2',
  'u1/1-2-3',
  'u1/v1',
  'u1/v2',
  'u1/v3',
  'u1/v4',
  'u1/v5',
  'u1/review',
  'u2/2-1-1',
  'u2/2-1-2',
  'u2/2-1-3',
  'u2/2-1-r',
];

/** 휴대폰에서 이보다 작게 보이는 그림 글자는 고칠 대상(MAINTENANCE.md 1-4 "핵심 이름표 20px 이상 — 휴대폰에서 약 11px") */
const MIN_PHONE_TEXT_PX = 11;

interface FigureInfo {
  src: string;
  currentSrc: string;
  width: number;
  narrow: string | null;
  sourceWidth: string | null;
  sourceHeight: string | null;
  zoomHref: string | null;
  loaded: boolean;
}

/**
 * 개발 서버의 Vite 새로 고침 신호(full-reload·update)를 거른다 — 개발 서버를 여럿이 함께 쓰는 동안 다른 구역이 파일을 고치면 쪽이
 * 다시 불려 "Execution context was destroyed"로 흔들린다(2026-09-28 겪음, a11y·perf spec과 같은 방법). 빌드 결과에는 이 연결이 없다.
 * page.goto 전에 건다.
 */
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

/** 본문 그림(<figure> 안 사이트 SVG)을 모두 받게 하고, 고른 그림·보이는 폭을 읽는다 */
async function readFigures(page: Page): Promise<FigureInfo[]> {
  await page.evaluate(() => {
    for (const image of document.querySelectorAll<HTMLImageElement>('.lesson-body figure img')) {
      image.loading = 'eager';
    }
  });
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('.lesson-body figure img')].every((image) => image.complete));
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLImageElement>('.lesson-body figure img')]
      .filter((image) => /\.svg(?:$|[?#])/u.test(image.getAttribute('src') ?? ''))
      .map((image) => {
        const source = image.closest('picture')?.querySelector('source') ?? null;
        return {
          src: image.getAttribute('src') ?? '',
          currentSrc: image.currentSrc,
          width: image.getBoundingClientRect().width,
          narrow: source?.getAttribute('srcset') ?? null,
          sourceWidth: source?.getAttribute('width') ?? null,
          sourceHeight: source?.getAttribute('height') ?? null,
          zoomHref: image.closest('figure')?.querySelector('a.figure-zoom')?.getAttribute('href') ?? null,
          loaded: image.naturalWidth > 0,
        };
      }),
  );
}

/** 그림 파일을 보이는 폭 그대로 그려(글자 조각마다) 보이는 글자 크기를 잰다 — 가장 작은 것과 그 글자 */
async function smallestText(page: Page, url: string, width: number): Promise<{ size: number; text: string; count: number }> {
  const svg = await (await page.request.get(url)).text();
  const measure = await page.context().newPage();
  try {
    await measure.setContent(
      `<!doctype html><html><head><style>body{margin:0} #w svg{width:100%;height:auto;display:block}</style></head><body><div id="w" style="width:${width}px">${svg.replace(/^<\?xml[^>]*>\s*/u, '')}</div></body></html>`,
    );
    return await measure.evaluate(() => {
      let size = Number.POSITIVE_INFINITY;
      let text = '';
      let count = 0;
      for (const element of document.querySelectorAll<SVGTextContentElement>('#w text, #w tspan')) {
        const own = [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '');
        if (own.length === 0) {
          continue;
        }
        const matrix = element.getScreenCTM();
        const scale = matrix ? Math.sqrt(Math.abs(matrix.a * matrix.d - matrix.b * matrix.c)) : 1;
        const shown = Number.parseFloat(getComputedStyle(element).fontSize) * scale;
        count += 1;
        if (shown < size) {
          size = shown;
          text = own.map((node) => node.textContent).join('').trim();
        }
      }
      return { size, text, count };
    });
  } finally {
    await measure.close();
  }
}

test.describe('차시 그림 — 휴대폰에서 글자가 읽히는 크기(미해결 209)', () => {
  test.beforeEach(async ({ page }) => {
    await freezeDevReloads(page);
  });

  for (const lesson of CHECKED_LESSONS) {
    test(`${lesson}: 사이트 그림의 글자가 휴대폰(375 폭)에서 ${MIN_PHONE_TEXT_PX}px 이상이고, 좁은 그림을 받는다`, async ({ page, isMobile }) => {
      test.skip(!isMobile, '휴대폰 폭에서 본다(데스크톱은 아래 검사)');
      await page.goto(`./learn/${lesson}/`);
      const figures = await readFigures(page);
      expect(figures.length, '사이트 그림 수').toBeGreaterThan(0);
      for (const figure of figures) {
        expect(figure.loaded, `${figure.src} 받음`).toBe(true);
        if (figure.narrow) {
          expect(stripBase(new URL(figure.currentSrc).pathname), `${figure.src}: 휴대폰은 좁은 그림`).toBe(stripBase(figure.narrow));
        }
        const smallest = await smallestText(page, figure.currentSrc, figure.width);
        expect(smallest.count, `${figure.currentSrc} 글자 조각 수`).toBeGreaterThan(0);
        expect(smallest.size, `${figure.currentSrc}: 가장 작은 글자 "${smallest.text}"`).toBeGreaterThanOrEqual(MIN_PHONE_TEXT_PX);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, '가로 넘침').toBeLessThanOrEqual(0);
    });
  }

  test('휴대폰 [그림 크게 보기]: 크게 보기 창이 열려 본문에 보이던 좁은 그림을 본문보다 크게 보이고, Esc로 닫으면 링크로 초점', async ({ page, isMobile }) => {
    test.skip(!isMobile, '휴대폰 폭에서 본다([그림 크게 보기]는 좁은 화면에서만 보인다)');
    await page.goto(`./learn/${CHECKED_LESSONS[0]}/`);
    const figure = page.locator('.lesson-body figure').filter({ has: page.locator('picture') }).first();
    await figure.scrollIntoViewIfNeeded();
    const image = figure.locator('img');
    await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0)).toBe(true);
    const inPage = await image.evaluate((element) => ({ src: (element as HTMLImageElement).currentSrc, width: element.getBoundingClientRect().width }));
    expect(inPage.src).toMatch(/\.narrow\.svg$/u);
    const link = figure.locator('a.figure-zoom');
    await link.click();
    const dialog = page.locator('dialog[data-figure-zoom]');
    await expect(dialog).toBeVisible();
    // 파일로 넘어가지 않고 이 쪽에 머문다
    expect(new URL(page.url()).pathname).toMatch(/\/learn\/u1\/1-1-1\/$/u);
    const zoomed = dialog.locator('img');
    await expect.poll(() => zoomed.evaluate((element) => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0)).toBe(true);
    const shown = await zoomed.evaluate((element) => ({ src: (element as HTMLImageElement).currentSrc, width: element.getBoundingClientRect().width, alt: (element as HTMLImageElement).alt }));
    // 본문에 보이던 그 그림(좁은 그림)을 본문보다 1.5배 넘게
    expect(shown.src).toBe(inPage.src);
    expect(shown.width).toBeGreaterThan(inPage.width * 1.5);
    expect(shown.alt.length).toBeGreaterThan(0);
    await expect(dialog.getByRole('button', { name: '닫기' })).toBeFocused();
    const severe = (await new AxeBuilder({ page }).include('dialog[data-figure-zoom]').analyze()).violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    );
    expect(severe.map((violation) => violation.id)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(link).toBeFocused();
  });

  test('데스크톱은 원래 그림을 받고, <source>에 좁은 그림의 가로·세로가 있고, [그림 크게 보기]는 원래 그림을 연다', async ({ page, isMobile }) => {
    test.skip(isMobile, '넓은 화면에서 본다');
    await page.goto(`./learn/${CHECKED_LESSONS[0]}/`);
    const figures = await readFigures(page);
    const wrapped = figures.filter((figure) => figure.narrow);
    expect(wrapped.length, '좁은 그림이 있는 그림').toBeGreaterThan(0);
    for (const figure of wrapped) {
      expect(figure.loaded).toBe(true);
      expect(new URL(figure.currentSrc).pathname, `${figure.src}: 넓은 화면은 원래 그림`).toBe(figure.src);
      expect(Number(figure.sourceWidth)).toBeGreaterThanOrEqual(300);
      expect(Number(figure.sourceHeight)).toBeGreaterThan(0);
      expect(figure.zoomHref, `${figure.src}: [그림 크게 보기]`).toBe(figure.src);
    }
  });
});
