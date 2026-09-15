// 사이트 검색 색인(Pagefind 1.5.2) 기반 확인(PLAN §8.1 P1-11).
// 검색 화면은 검색 담당이 만든다. 여기서는 빌드 뒤 색인이 생기고, 하위 경로(base)에 올린 사이트에서
// 검색 결과 주소가 base가 붙은 실제 페이지 주소로 나오는지 확인한다.
// 확인한 사실(2026-09-16): Pagefind는 pagefind.js를 불러온 주소(/ai-physical-computing/pagefind/)에서 base를 알아낸다.
// 그래도 검색 화면은 src/config/search.ts의 baseUrl을 넘겨 두면 불러오는 방식이 바뀌어도 안전하다.
import { expect, test } from '@playwright/test';
import { searchConfig } from '../../src/config/search.ts';

type PagefindResult = { data: () => Promise<{ url: string }> };

test.describe('사이트 검색 색인(Pagefind)', () => {
  test.skip(({ isMobile }) => isMobile, '색인은 화면 크기와 상관없어 데스크톱에서 한 번만 확인한다');

  test('baseUrl을 넘기면 검색 결과 주소가 base가 붙은 실제 페이지(200)가 된다', async ({ page, request }) => {
    await page.goto('./');
    const urls = await page.evaluate(
      async ({ bundlePath, baseUrl }) => {
        const pagefind = await import(`${bundlePath}pagefind.js`);
        await pagefind.options({ baseUrl });
        const search = await pagefind.search('라이선스');
        const results: PagefindResult[] = search.results.slice(0, 5);
        return Promise.all(results.map(async (result) => (await result.data()).url));
      },
      { bundlePath: searchConfig.bundlePath, baseUrl: searchConfig.baseUrl },
    );
    expect(urls).toContain(`${searchConfig.baseUrl}credits/`);
    for (const url of urls) {
      expect(url.startsWith(searchConfig.baseUrl), url).toBe(true);
      expect((await request.get(url)).status(), url).toBe(200);
    }
  });

  test('baseUrl을 넘기지 않아도 pagefind.js를 불러온 주소에서 base를 알아내 같은 주소를 준다', async ({ page }) => {
    await page.goto('./');
    const urls = await page.evaluate(async (bundlePath) => {
      const pagefind = await import(`${bundlePath}pagefind.js`);
      const search = await pagefind.search('라이선스');
      const results: PagefindResult[] = search.results.slice(0, 5);
      return Promise.all(results.map(async (result) => (await result.data()).url));
    }, searchConfig.bundlePath);
    expect(urls).toContain(`${searchConfig.baseUrl}credits/`);
  });
});
