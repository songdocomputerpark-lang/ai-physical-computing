// 사이트 검색 화면 확인(PLAN §8.1 P1-11). 검색 색인은 빌드 뒤 Pagefind 1.5.2가 만든다(npm run build의 postbuild).
// 화면 상태는 [data-search-root]의 data-state(idle·loading·results·empty·error)로 기다린다.
//
// 브라우저에서 확인한 한국어 검색 동작(2026-09-16) — 테스트가 이 사실에 기대고 있다.
// - 낱말의 앞부분으로 찾는다: '서보'는 '서보모터'를, '로그인'은 '로그인이'를 찾는다. 조사를 떼어 주지는 않는다.
// - 가운뎃점(·)으로 이은 낱말('버저·서보모터')은 한 낱말로 묶인다 → 사이트 글의 나열은 쉼표로 쓴다.
// - 어떤 낱말과도 맞지 않는 한국어 검색어는 앞부분이 맞는 결과를 보여 주기도 해서, "결과 없음"은 영문 검색어로 시험한다.
// 검색 결과에는 다른 담당의 페이지도 섞이므로, 이 담당 페이지가 "들어 있는지"만 확인한다(결과 전체를 펼쳐서).
import { expect, test, type Page } from '@playwright/test';
import { getPage } from '../../src/config/nav.ts';
import { searchConfig } from '../../src/config/search.ts';
import { withBase } from '../../src/lib/url.ts';

const searchRoot = (page: Page) => page.locator('[data-search-root]');
const pageSearchbox = (page: Page) => page.getByRole('searchbox', { name: '검색어', exact: true });
const resultItems = (page: Page) => page.locator('[data-search-results] > li');
const searchUrl = (term: string) => `./search/?${searchConfig.queryParam}=${encodeURIComponent(term)}`;

/** [결과 더 보기]를 끝까지 눌러 결과 링크 주소를 모두 모은다. */
async function collectResultHrefs(page: Page): Promise<string[]> {
  const moreButton = page.getByRole('button', { name: '결과 더 보기' });
  for (let round = 0; round < 20 && (await moreButton.isVisible()); round += 1) {
    const before = await resultItems(page).count();
    await moreButton.click();
    await expect.poll(async () => (await resultItems(page).count()) > before).toBe(true);
  }
  return resultItems(page)
    .locator('h3 a')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
}

test.describe('사이트 검색(색인과 결과)', () => {
  test.skip(({ isMobile }) => isMobile, '검색 결과 내용은 화면 크기와 상관없어 데스크톱에서 확인한다');

  test('주소의 검색어("픽셀")로 바로 찾고, 결과 주소는 base가 붙은 실제 페이지다', async ({ page, request }) => {
    await page.goto(searchUrl('픽셀'));
    await expect(pageSearchbox(page)).toHaveValue('픽셀');
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'results');
    await expect(page.getByRole('status')).toContainText('"픽셀" 검색 결과');
    await expect(resultItems(page).locator('mark').first()).toContainText('픽셀');

    const hrefs = await collectResultHrefs(page);
    expect(hrefs).toContain(getPage('labs-vision').href);
    // P1-11 완료 기준: 한글 검색어로 그 낱말을 다루는 차시가 나온다(보충 V4 블러와 에지).
    expect(hrefs).toContain(withBase('learn/u1/v4/'));
    for (const href of hrefs) {
      expect(href.startsWith(searchConfig.baseUrl), href).toBe(true);
      expect((await request.get(href)).status(), href).toBe(200);
    }
  });

  test('낱말의 앞부분으로도 찾는다: "서보"로 찾으면 "서보모터"가 든 ESP32 실습실이 나온다', async ({ page }) => {
    await page.goto(searchUrl('서보'));
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'results');
    expect(await collectResultHrefs(page)).toContain(getPage('labs-esp32').href);
  });

  test('조사가 붙은 낱말도 찾는다: "로그인"으로 찾으면 "로그인이"만 있는 문제 해결 페이지가 나온다', async ({ page }) => {
    const help = getPage('help');
    await page.goto(searchUrl('로그인'));
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'results');
    expect(await collectResultHrefs(page)).toContain(help.href);
    const helpResult = resultItems(page).filter({ has: page.locator(`h3 a[href="${help.href}"]`) });
    await expect(helpResult.locator('mark').first()).toHaveText('로그인이');
    await expect(helpResult.locator('.search-result__title')).toHaveText(help.title);
  });

  test('준비 중 상자의 판에 박힌 문장("생겨요")으로는 자리 페이지가 나오지 않는다', async ({ page }) => {
    await page.goto(searchUrl('생겨요'));
    await expect(searchRoot(page)).toHaveAttribute('data-state', /^(?:results|empty)$/u);
    const hrefs = (await searchRoot(page).getAttribute('data-state')) === 'results' ? await collectResultHrefs(page) : [];
    // 실습실·교사용 자료실·문제 해결은 페이지 쪽 감싸기로, 시작하기 페이지는 ComingSoon 컴포넌트의 data-pagefind-ignore로 빠진다.
    // 교사용 시작하기(start-teacher)는 준비 중 상자 밖 안내 문장에도 "생겨요"가 있어 목록에서 뺐다.
    const ids = ['labs', 'labs-vision', 'labs-esp32', 'labs-esp32-check', 'labs-iot', 'labs-gallery', 'teacher', 'help'];
    for (const id of [...ids, 'start', 'start-student', 'start-board', 'start-check']) {
      expect(hrefs, id).not.toContain(getPage(id).href);
    }
  });

  test('교사용 접기 상자 안에만 있는 글("헷갈려요")로는 차시가 나오지 않고, 본문 낱말("라이다")로는 나온다', async ({ page }) => {
    const lessonHref = withBase('learn/u1/1-1-1/');
    await page.goto(searchUrl('헷갈려요'));
    await expect(searchRoot(page)).toHaveAttribute('data-state', /^(?:results|empty)$/u);
    const teacherOnly = (await searchRoot(page).getAttribute('data-state')) === 'results' ? await collectResultHrefs(page) : [];
    expect(teacherOnly).not.toContain(lessonHref);

    await page.goto(searchUrl('라이다'));
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'results');
    expect(await collectResultHrefs(page)).toContain(lessonHref);
  });

  test('문장 가운데 끼인 용어 툴팁 글("행동하면서")은 차시 결과에 들어가지 않고, 용어사전에서만 찾힌다', async ({ page }) => {
    // "행동하면서"는 용어사전 에이전트 항목의 한 줄 풀이에만 있는 낱말이다. 1-1-1 본문에는 그 풀이가 툴팁(data-pagefind-ignore)으로만 들어간다.
    await page.goto(searchUrl('행동하면서'));
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'results');
    const hrefs = await collectResultHrefs(page);
    expect(hrefs).toContain(getPage('glossary').href);
    expect(hrefs).not.toContain(withBase('learn/u1/1-1-1/'));
  });

  test('검색·404 페이지는 결과에 나오지 않는다', async ({ page }) => {
    await page.goto(searchUrl('검색'));
    await expect(searchRoot(page)).toHaveAttribute('data-state', /^(?:results|empty)$/u);
    const hrefs = (await searchRoot(page).getAttribute('data-state')) === 'results' ? await collectResultHrefs(page) : [];
    expect(hrefs).not.toContain(searchConfig.pageHref);
    expect(hrefs.some((href) => href.includes('404'))).toBe(false);
  });
});

test.describe('사이트 검색 화면', () => {
  test.skip(({ isMobile }) => isMobile, '화면 조작은 데스크톱에서 확인하고, 모바일은 머리글 검색만 확인한다');

  test('입력을 멈추면 찾고, 주소의 검색어도 바뀐다. 지우면 처음 화면으로 돌아간다', async ({ page }) => {
    await page.goto('./search/');
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'idle');
    await pageSearchbox(page).fill('카메라');
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'results');
    await expect.poll(() => new URL(page.url()).searchParams.get(searchConfig.queryParam)).toBe('카메라');
    expect(await collectResultHrefs(page)).toContain(getPage('help').href);

    await pageSearchbox(page).fill('');
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'idle');
    await expect.poll(() => new URL(page.url()).searchParams.has(searchConfig.queryParam)).toBe(false);
    await expect(page.getByRole('link', { name: '픽셀', exact: true })).toBeVisible();
  });

  test('맞는 글이 없으면 그렇다고 알리고 바꿔 찾는 방법을 보여 준다', async ({ page }) => {
    await page.goto(searchUrl('zqxwvu'));
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'empty');
    await expect(page.getByRole('status')).toHaveText('"zqxwvu"에 맞는 글을 찾지 못했어요.');
    await expect(page.getByText('조사를 빼고 낱말만 넣어요.', { exact: false })).toBeVisible();
    await expect(page.locator('[data-search-results-section]')).toBeHidden();
  });

  test('처음 화면의 예시 낱말을 누르면 그 낱말로 찾는다', async ({ page }) => {
    await page.goto('./search/');
    const example = page.getByRole('link', { name: '픽셀', exact: true });
    await expect(example).toHaveAttribute('href', withBase(`search/?${searchConfig.queryParam}=${encodeURIComponent('픽셀')}`));
    await example.click();
    await expect(pageSearchbox(page)).toHaveValue('픽셀');
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'results');
  });

  test('키보드만으로 검색하고 첫 결과로 이동한다', async ({ page }) => {
    await page.goto('./search/');
    await pageSearchbox(page).focus();
    await page.keyboard.type('라이선스');
    await page.keyboard.press('Enter');
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'results');

    await page.keyboard.press('Tab');
    await expect(page.getByRole('search', { name: '검색어로 찾기' }).getByRole('button', { name: '검색' })).toBeFocused();
    await page.keyboard.press('Tab');
    const firstLink = resultItems(page).first().locator('h3 a');
    await expect(firstLink).toBeFocused();
    const href = await firstLink.getAttribute('href');
    await page.keyboard.press('Enter');
    await expect.poll(() => new URL(page.url()).pathname).toBe(href);
  });
});

test.describe('머리글 검색 상자', () => {
  test('머리글 검색 상자로 찾으면 검색 페이지가 결과를 보여 준다(좁은 화면은 메뉴를 열고)', async ({ page, isMobile }) => {
    await page.goto('./help/');
    if (isMobile) {
      await page.getByRole('button', { name: '메뉴' }).click();
    }
    const headerForm = page.getByRole('search', { name: '사이트 검색', exact: true });
    const headerSearchbox = headerForm.getByRole('searchbox', { name: '사이트 검색어' });
    await headerSearchbox.fill('서보');
    await headerSearchbox.press('Enter');

    await expect(page.getByRole('heading', { level: 1, name: getPage('search').title })).toBeVisible();
    await expect(pageSearchbox(page)).toHaveValue('서보');
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'results');
    await expect(resultItems(page).first()).toBeVisible();
  });
});
