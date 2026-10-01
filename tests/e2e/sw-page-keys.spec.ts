// 서비스 워커의 쪽(HTML)·사이트 검색 파일 캐시 열쇠 — 2026-09-30 최종 점검 SP-01(+ 같은 때 찾은 연결 없을 때 검색).
// 학생이 친 검색어(/search/?q=…)와 통신 접두어(?bridge=·?prefix=)가 Cache Storage 열쇠에 남아 [이 컴퓨터에서 내 기록 지우기] 뒤에도
// 공용 PC에 남았다. 이제 쪽은 검색어를 뗀 주소로 넣고, 연결이 없을 때는 검색어만 다른 주소로 열어도 저장해 둔 쪽을 준다.
// Pagefind가 방문마다 붙이는 pagefind-entry.json?ts=<지금 시각>도 떼어, 한 번 해 본 검색은 연결이 없어도 결과가 나온다.
// 서비스 워커는 빌드 결과에만 있어(scripts/build-sw.mjs) 개발 서버에서는 건너뛴다. 가짜 환경의 단위 검사는
// tests/unit/loading/sw-page-cache-keys.test.ts.
import { expect, test, type Page } from '@playwright/test';
import { getPage } from '../../src/config/nav.ts';
import { PAGES_CACHE, SEARCH_CACHE } from '../../src/lab/loader/constants.ts';
import { withBase } from '../../src/lib/url.ts';

const SW_PATH = withBase('sw.js');

async function hasServiceWorkerFile(page: Page): Promise<boolean> {
  const response = await page.request.get(SW_PATH, { failOnStatusCode: false });
  if (!response.ok()) {
    return false;
  }
  return (await response.text()).includes('apc-precache');
}

/** 쪽 캐시의 열쇠(주소) 목록 */
async function pageCacheKeys(page: Page): Promise<string[]> {
  return page.evaluate(async (name) => (await (await window.caches.open(name)).keys()).map((request) => request.url), PAGES_CACHE);
}

test.describe('서비스 워커 — 쪽 캐시 열쇠에 검색어를 남기지 않는다', () => {
  test.skip(({ isMobile }) => isMobile, '서비스 워커 동작은 화면 폭과 상관없어 데스크톱에서 한 번 본다');

  test('검색어·통신 접두어가 붙은 주소를 열어도 열쇠에는 검색어가 없고, 연결이 없을 때 검색어만 다른 주소로 다시 열린다', async ({ page, context }) => {
    test.skip(!(await hasServiceWorkerFile(page)), '개발 서버에는 sw.js가 없어요(빌드 뒤에 만들어져요).');
    test.slow();

    await page.goto(withBase(''));
    // 첫 방문에서 설치·활성화(clients.claim)되면 이 쪽을 맡는다 — 그다음 탐색부터 서비스 워커를 거친다.
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 30_000 }).toBe(true);

    const secret = '우리반비밀검색어';
    await page.goto(`${withBase('search/')}?q=${encodeURIComponent(secret)}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(getPage('search').title);
    await page.goto(`${withBase('labs/iot/dashboard/')}?prefix=PQRSTUVWXYZ2`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // 쪽을 받은 뒤 캐시에 넣는 일은 조금 늦게 끝난다.
    await expect
      .poll(() => pageCacheKeys(page), { timeout: 15_000 })
      .toEqual(expect.arrayContaining([expect.stringMatching(/\/search\/$/u), expect.stringMatching(/\/labs\/iot\/dashboard\/$/u)]));
    const keys = await pageCacheKeys(page);
    expect(keys.filter((key) => key.includes('?')), `검색어가 남은 열쇠: ${keys.join(', ')}`).toEqual([]);
    expect(keys.join(' ')).not.toContain(encodeURIComponent(secret));
    expect(keys.join(' ')).not.toContain('PQRSTUVWXYZ2');

    // 연결이 없을 때: 검색어만 다른 주소도 저장해 둔 쪽으로 열린다("인터넷 연결이 없어요" 안내 쪽이 아니라).
    await context.setOffline(true);
    try {
      await page.goto(`${withBase('search/')}?q=${encodeURIComponent('다른 낱말')}`);
      await expect(page.locator('[data-apc-offline-page]')).toHaveCount(0);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(getPage('search').title);
    } finally {
      await context.setOffline(false);
    }
  });

  test('한 번 해 본 사이트 검색은 연결이 없을 때도 결과가 나온다(Pagefind의 ?ts= 열쇠가 쌓이지 않는다)', async ({ page, context }) => {
    test.skip(!(await hasServiceWorkerFile(page)), '개발 서버에는 sw.js가 없어요(빌드 뒤에 만들어져요).');
    test.slow();

    await page.goto(withBase(''));
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 30_000 }).toBe(true);
    const address = `${withBase('search/')}?q=${encodeURIComponent('카메라')}`;
    const root = page.locator('[data-search-root]');
    await page.goto(address);
    await expect(root).toHaveAttribute('data-state', 'results', { timeout: 30_000 });
    // Pagefind가 방문마다 붙이는 ?ts=<지금 시각>은 검색 파일 캐시 열쇠에 남지 않는다
    const searchKeys = await page.evaluate(
      async (name) => (await (await window.caches.open(name)).keys()).map((request) => request.url),
      SEARCH_CACHE,
    );
    expect(searchKeys.filter((key) => key.includes('?')), searchKeys.join(', ')).toEqual([]);

    await context.setOffline(true);
    try {
      await page.goto(address);
      await expect(root).toHaveAttribute('data-state', 'results', { timeout: 30_000 });
    } finally {
      await context.setOffline(false);
    }
  });
});
