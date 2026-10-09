// 사이트 검색 화면 확인(PLAN §8.1 P1-11). 검색 색인은 빌드 뒤 Pagefind 1.5.2가 만든다(npm run build의 postbuild).
// 화면 상태는 [data-search-root]의 data-state(idle·loading·results·empty·error)로 기다린다.
//
// 브라우저에서 확인한 한국어 검색 동작(2026-09-16) — 테스트가 이 사실에 기대고 있다.
// - 낱말의 앞부분으로 찾는다: '서보'는 '서보모터'를, '로그인'은 '로그인이'를 찾는다. 조사를 떼어 주지는 않는다.
// - 가운뎃점(·)으로 이은 낱말('버저·서보모터')은 한 낱말로 묶인다 → 사이트 글의 나열은 쉼표로 쓴다.
// - 어떤 낱말과도 맞지 않는 검색어는 Pagefind(쪽 언어 ko)가 검색어를 조각내 그 조각으로 찾은 결과를 보여 주기도 한다 — 한국어뿐 아니라
//   영문도 그렇다(2026-10-02 실사이트: asyncio → 결과 23개 모두 'as' 표시). 그래서 "결과 없음"은 조각도 맞지 않는 한글 '뷁쿍퓽'으로 시험한다.
// 검색 결과에는 다른 담당의 페이지도 섞이므로, 이 담당 페이지가 "들어 있는지"만 확인한다(결과 전체를 펼쳐서).
import { expect, test, type Page } from '@playwright/test';
import { getPage } from '../../src/config/nav.ts';
import { searchConfig } from '../../src/config/search.ts';
import { withBase } from '../../src/lib/url.ts';
import { ensureSearchIndex } from './helpers/search-index.ts';

// 개발 서버(PW_BASE_URL)에는 검색 색인이 없어서, 저장소 안 이전 빌드의 dist/pagefind가 있으면 그것을 대신 쓴다(미리 보기에서는 아무것도 하지 않는다).
test.beforeEach(async ({ page }) => {
  await ensureSearchIndex(page);
});

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

  test('낱말의 앞부분으로도 찾는다: "서보"로 찾으면 "서보모터"가 든 차시와 예제 카드가 나온다', async ({ page }) => {
    // 판 1.3.0: ESP32 실습실 첫 화면의 긴 소개 문단이 줄면서 그 쪽 본문에서 "서보모터"가 빠졌다(구역 X). 앞부분 검색은 차시·예제로 확인한다.
    await page.goto(searchUrl('서보'));
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'results');
    const hrefs = await collectResultHrefs(page);
    expect(hrefs).toContain(withBase('learn/u2/2-2-4/'));
    expect(hrefs).toContain(`${getPage('labs-gallery').href}#ex-esp32-u2-2-2-4-servo-angles`);
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
    // 용어사전 결과는 항목 위치(#id)가 붙은 주소로 나온다.
    expect(hrefs).toContain(`${getPage('glossary').href}#agent`);
    expect(hrefs).not.toContain(withBase('learn/u1/1-1-1/'));
  });

  test('차시 결과 설명에 그림 설명과 칸 이름이 섞이지 않는다("손", R3-013)', async ({ page }) => {
    // 색인에서 차시의 <figcaption>과 8칸 <h2>를 빼므로(scripts/search-index.mjs) "…사이트가 직접 그린 그림이에요. 핵심 개념. 손"처럼 이어 붙지 않는다.
    await page.goto(searchUrl('손'));
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'results');
    await collectResultHrefs(page);
    const lessonResults = resultItems(page).filter({ has: page.locator(`h3 a[href*="${withBase('learn/')}"]`) });
    expect(await lessonResults.count()).toBeGreaterThan(0);
    for (const text of await lessonResults.locator('.search-result__excerpt').allTextContents()) {
      expect(text).not.toContain('사이트가 직접 그린 그림');
      expect(text).not.toContain('핵심 개념');
    }
  });

  test('용어사전 결과는 그 낱말의 항목으로 바로 이어지고("픽셀 — 용어사전" → #pixel), 요약에 "함께 보면 좋은 낱말" 같은 라벨이 섞이지 않는다', async ({ page }) => {
    await page.goto(searchUrl('픽셀'));
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'results');
    await collectResultHrefs(page);
    const glossaryHref = `${getPage('glossary').href}#pixel`;
    const result = resultItems(page).filter({ has: page.locator(`h3 a[href="${glossaryHref}"]`) });
    await expect(result).toHaveCount(1);
    await expect(result.locator('.search-result__title')).toHaveText(/^픽셀 .*— 용어사전$/u);
    await expect(result.locator('.search-result__excerpt')).not.toContainText('함께 보면 좋은 낱말');
    await expect(result.locator('.search-result__excerpt')).not.toContainText('나오는 차시');
    await expect(resultItems(page).locator('h3 a', { hasText: '출처와 라이선스' })).toHaveCount(0);

    await result.locator('h3 a').click();
    await expect(page).toHaveURL(/\/glossary\/#pixel$/u);
    await expect(page.locator('h3#pixel')).toBeInViewport();
  });

  test('예제 갤러리 결과는 그 예제 카드로 바로 이어진다("… — 예제 갤러리" → #ex-…, 2026-09-24 Phase 4 통합)', async ({ page }) => {
    await page.goto(searchUrl('손가락 개수'));
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'results');
    await collectResultHrefs(page);
    const cardHref = `${getPage('labs-gallery').href}#ex-vision-u4-c3-finger-count-send`;
    const result = resultItems(page).filter({ has: page.locator(`h3 a[href="${cardHref}"]`) });
    await expect(result).toHaveCount(1);
    await expect(result.locator('.search-result__title')).toHaveText(/— 예제 갤러리$/u);
    await result.locator('h3 a').click();
    await expect(page).toHaveURL(/\/labs\/gallery\/#ex-vision-u4-c3-finger-count-send$/u);
    await expect(page.locator('h3#ex-vision-u4-c3-finger-count-send')).toBeInViewport();
  });

  test('용어사전의 가나다·ABC 색인 묶음 머리("U"·"숫자·기호")로는 이어 주지 않는다(2026-10-02 최종 전수 점검 3바퀴 ST3-02)', async ({ page }) => {
    // 전에는 uasyncio → "U — 용어사전"(#index-u, 요약 "U."), 숫자 → 용어사전 결과가 "숫자·기호"(#index-etc)였다. 묶음 머리 글자는 색인에서
    // 빠졌고(data-pagefind-ignore), 고르는 규칙도 머리를 뺀다(search-page.ts isGlossaryGroupAnchor). 결과 개수는 엔진 결과라 보지 않는다.
    const groupHead = `${getPage('glossary').href}#index-`;
    for (const term of ['uasyncio', '숫자']) {
      await page.goto(searchUrl(term));
      await expect(searchRoot(page)).toHaveAttribute('data-state', /^(?:results|empty)$/u);
      const hrefs = (await searchRoot(page).getAttribute('data-state')) === 'results' ? await collectResultHrefs(page) : [];
      expect(
        hrefs.filter((href) => href.startsWith(groupHead)),
        `${term} — 용어사전 결과가 색인 묶음 머리로 가요`,
      ).toEqual([]);
    }
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
    // 없는 낱말은 한글로 고른다. 영어 한 글자(x·y·z·q)로 시작하는 말은 Pagefind가 그 한 글자 낱말(예제 갤러리의 "x, y, z 값", 키 [q])에
    // 앞부분으로 맞춰 결과가 생긴다(2026-09-24 Phase 4 통합에서 갤러리가 들어오며 "zqxwvu"가 갤러리에 걸리는 것을 확인).
    await page.goto(searchUrl('뷁쿍퓽'));
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'empty');
    await expect(page.getByRole('status')).toHaveText('"뷁쿍퓽"에 맞는 글을 찾지 못했어요.');
    await expect(page.getByText('"을/를/이/가" 같은 말은 빼고 낱말만 넣어요.', { exact: false })).toBeVisible();
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
    // 판 1.3.0: 결과 위의 종류 칩(라디오 모임)이 Tab 정지점 하나로 끼었다(화살표로 옮긴다)
    await page.keyboard.press('Tab');
    await expect(page.getByRole('radiogroup', { name: '결과 종류' }).getByRole('radio', { name: '전체' })).toBeFocused();
    await page.keyboard.press('Tab');
    const firstLink = resultItems(page).first().locator('h3 a');
    await expect(firstLink).toBeFocused();
    const href = await firstLink.getAttribute('href');
    await page.keyboard.press('Enter');
    await expect.poll(() => new URL(page.url()).pathname).toBe(href);
  });
});

// 판 1.3.0 검수 R1-011~014·019~021·022·024: 엉뚱한 낱말·오타·뜻 묻기·증상 문장, 빈 검색 초점, 뒤로 가기, 느린 망·실패 안내
test.describe('검색 결과의 알맞음', () => {
  test.skip(({ isMobile }) => isMobile, '검색 결과 내용은 화면 크기와 상관없어 데스크톱에서 확인한다');

  for (const term of ['asdfgh', 'asdfqwer', 'qwertyuiop', 'zzqqxx', 'zzzz']) {
    test(`엉뚱한 낱말 "${term}"은 "검색 결과 N개"가 아니라 "찾지 못했어요"이다 (R1-011)`, async ({ page }) => {
      await page.goto(searchUrl(term));
      await expect(searchRoot(page)).toHaveAttribute('data-state', 'empty', { timeout: 15_000 });
      await expect(page.getByRole('status')).toHaveText(`"${term}"에 맞는 글을 찾지 못했어요.`);
      await expect(resultItems(page)).toHaveCount(0);
    });
  }

  test('오타 "임게값"은 "혹시 이 낱말인가요?"로 "임계값"을 제안하고, 누르면 알맞은 글이 나온다 (R1-012)', async ({ page }) => {
    await page.goto(searchUrl('임게값'));
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'empty', { timeout: 15_000 });
    const suggestion = page.getByRole('list', { name: '혹시 이 낱말인가요?' }).getByRole('link', { name: '임계값', exact: true });
    await expect(suggestion).toBeVisible();
    await suggestion.click();
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'results', { timeout: 15_000 });
    await expect(resultItems(page).first().locator('h3 a')).toContainText('임계값');
  });

  test('"임계값 뜻"은 용어사전의 "임계값 Threshold" 항목이 맨 앞이다 (R1-013)', async ({ page }) => {
    await page.goto(searchUrl('임계값 뜻'));
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'results', { timeout: 15_000 });
    const first = resultItems(page).first().locator('h3 a');
    await expect(first).toHaveAttribute('href', /\/glossary\/#threshold$/u);
  });

  test('"NameError"는 오류 사전의 NameError 항목이 맨 앞이다(원고 정정 목록이 아니라) (R1-013)', async ({ page }) => {
    await page.goto(searchUrl('NameError'));
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'results', { timeout: 15_000 });
    await expect(resultItems(page).first().locator('h3 a')).toHaveAttribute('href', /\/help\/errors\/#name-error$/u);
  });

  test('추천 낱말 "카메라가 안 켜져요"는 문제 해결 쪽이 맨 앞이다 (R1-014)', async ({ page }) => {
    await page.goto(searchUrl('카메라가 안 켜져요'));
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'results', { timeout: 15_000 });
    await expect(resultItems(page).first().locator('h3 a')).toHaveAttribute('href', getPage('help').href);
  });

  test('추천 낱말은 모두 알맞은 쪽이 맨 앞이다: 임계값→용어사전, NameError→오류 사전 (R1-014)', async ({ page }) => {
    const expectations: Record<string, RegExp> = { 임계값: /\/glossary\/#threshold$/u, NameError: /\/help\/errors\/#name-error$/u };
    for (const [term, href] of Object.entries(expectations)) {
      expect(searchConfig.popularWords as readonly string[]).toContain(term);
      await page.goto(searchUrl(term));
      await expect(searchRoot(page)).toHaveAttribute('data-state', 'results', { timeout: 15_000 });
      await expect(resultItems(page).first().locator('h3 a'), term).toHaveAttribute('href', href);
    }
  });

  test('"수행평가"는 성취기준과 평가 방향 쪽이 나온다 (R1-013)', async ({ page }) => {
    await page.goto(searchUrl('수행평가'));
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'results', { timeout: 15_000 });
    expect(await collectResultHrefs(page)).toContain(withBase('teacher/standards/'));
  });

  test('한글+영어 증상 문장 "웹캠 permission denied"도 카메라 허용 풀이가 나온다 (R1-021)', async ({ page }) => {
    await page.goto(searchUrl('웹캠 permission denied'));
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'results', { timeout: 15_000 });
    expect(await collectResultHrefs(page)).toContain(getPage('help').href);
  });

  test('/search/?q= (빈 검색)으로 열면 입력칸에 초점이 있다 (R1-019)', async ({ page }) => {
    await page.goto('./search/?q=');
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'idle');
    await expect(pageSearchbox(page)).toBeFocused();
  });

  test('[결과 더 보기] 뒤 15번째 결과를 열었다가 뒤로 오면 펼친 만큼(20개) 그대로이다 (R1-020)', async ({ page }) => {
    await page.goto(searchUrl('LED'));
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'results', { timeout: 15_000 });
    await page.getByRole('button', { name: '결과 더 보기' }).click();
    await expect(resultItems(page)).toHaveCount(20);
    const link = resultItems(page).nth(14).locator('h3 a');
    await link.scrollIntoViewIfNeeded();
    await link.click();
    await page.waitForLoadState('load');
    await page.goBack();
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'results', { timeout: 15_000 });
    await expect(resultItems(page)).toHaveCount(20);
  });
});

test.describe('느린 인터넷과 불러오기 실패 안내', () => {
  test.skip(({ isMobile }) => isMobile, '안내 글은 화면 크기와 상관없어 데스크톱에서 확인한다');

  test('검색 도구가 늦게 오면 쪽을 열자마자 "찾는 중이에요"가 보이고 추천 낱말은 숨는다 (R1-022)', async ({ page }) => {
    await page.route('**/pagefind/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.fallback();
    });
    await page.goto(searchUrl('모터'), { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('status')).toContainText('찾는 중이에요');
    await expect(pageSearchbox(page)).toHaveValue('모터');
    await expect(page.locator('[data-search-suggestions]')).toBeHidden();
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'results', { timeout: 30_000 });
  });

  test('검색 도구를 못 받으면 안내와 함께 "배우기 차례로 가기"·"홈으로 가기" 링크가 보인다 (R1-024)', async ({ page }) => {
    await page.route('**/pagefind/**', (route) => route.abort());
    await page.goto(searchUrl('모터'));
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'error', { timeout: 15_000 });
    await expect(page.getByRole('status')).toContainText('검색을 불러오지 못했어요');
    await expect(page.getByRole('link', { name: '배우기 차례로 가기' })).toHaveAttribute('href', getPage('learn').href);
    await expect(page.getByRole('link', { name: '홈으로 가기' })).toHaveAttribute('href', getPage('home').href);
  });
});

test.describe('머리글 검색 상자', () => {
  test('머리글 검색 상자로 찾으면 검색 페이지가 결과를 보여 준다(좁은 화면에서도 메뉴를 열지 않고)', async ({ page }) => {
    await page.goto('./help/');
    // 판 1.3.0: 자동 완성 스크립트가 입력칸에 combobox 역할을 붙인다(자바스크립트가 안 되면 searchbox 그대로 — 폼 제출은 같다)
    await page.locator('#header-search-input[role="combobox"]').waitFor({ state: 'attached' });
    const headerForm = page.getByRole('search', { name: '사이트 검색', exact: true });
    const headerSearchbox = headerForm.getByRole('combobox', { name: '사이트 검색어' });
    // 판 1.3.0: 검색칸은 휴대폰에서도 메뉴 밖에 늘 보인다(메뉴 단추를 누르지 않는다)
    await expect(headerSearchbox).toBeVisible();
    await headerSearchbox.fill('서보');
    // 목록에서 항목을 고르지 않고 Enter를 누르면 폼 제출(/search/?q=)이다
    await headerSearchbox.press('Enter');

    await expect(page.getByRole('heading', { level: 1, name: getPage('search').title })).toBeVisible();
    await expect(pageSearchbox(page)).toHaveValue('서보');
    // 실습실 테스트(Pyodide 받기)가 같은 시간에 돌면 검색 색인 준비가 기본 5초를 넘길 수 있어 조금 더 기다린다(2026-09-16 P2-02 전체 실행에서 1건 실패).
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'results', { timeout: 15_000 });
    await expect(resultItems(page).first()).toBeVisible();
  });
});
