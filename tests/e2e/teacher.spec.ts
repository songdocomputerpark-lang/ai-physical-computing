// 교사용 자료실(PLAN §8.5 P5-14) — 첫 화면(/teacher/)과 아래 페이지 다섯 가지(지도 요약·성취기준과 평가·원고 정정·진짜 PC에서 돌리기·자주 묻는 질문).
// 모음 페이지는 차시 md를 고치면 따라 바뀌므로 기대값을 손으로 적지 않는다: 차시 목록은 배우기 페이지(/learn/)에서, 정정·평가 표는
// content/teacher/*.yaml에서, 질문 수는 content/help/faq-teacher.md에서, 편집본이 있는지는 public/ 파일에서 읽는다.
// 주소는 baseURL 기준 상대 경로('./teacher/')로 연다(앞에 /만 붙이면 base가 빠진다 — pages.spec.ts 머리말).
import fs from 'node:fs';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { HANDOUT_DOCS, type HandoutDocId } from '../../src/components/lesson/handouts.ts';
import { parseAssessment, parseCorrections } from '../../src/components/teacher/teacher-data-schema.ts';
import { guidesUnitPath, standardAnchor, TEACHER_PATHS } from '../../src/components/teacher/teacher-lessons.ts';
import { TEACHER_PAGES } from '../../src/components/teacher/teacher-pages.ts';
import { getPage, learnUnits } from '../../src/config/nav.ts';
import { siteConfig } from '../../src/config/site.ts';
import { CURRICULUM_SOURCE, STANDARDS } from '../../src/config/standards.ts';
import { STORAGE_KEY_PREFIX } from '../../src/lib/storage.ts';
import { withBase } from '../../src/lib/url.ts';

/** 사이트 뿌리 경로(/teacher/)를 baseURL 기준 상대 주소로 */
const at = (path: string): string => `.${path}`;

/** 자료실의 모든 페이지: 주소, 제목(h1·탭), 자료실 메뉴에서 현재 위치로 보일 이름 */
const TEACHER_ROOM = [
  { path: TEACHER_PATHS.home, title: getPage('teacher').title, current: '자료실 첫 화면' },
  ...TEACHER_PAGES.map((item) => ({ path: item.path, title: item.title, current: item.label })),
  ...learnUnits.map((unit) => ({ path: guidesUnitPath(unit.unit), title: `${unit.label} 지도 요약`, current: '지도 요약' })),
];

const readText = (file: string): string => fs.readFileSync(file, 'utf8');

/** 같은 id가 두 번 이상 있는 것(모음 페이지는 차시마다 같은 제목이 되풀이되어 id 앞머리를 붙인다 — teacher-guides.ts) */
async function duplicateIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const counts = new Map<string, number>();
    for (const element of document.querySelectorAll('[id]')) {
      counts.set(element.id, (counts.get(element.id) ?? 0) + 1);
    }
    return [...counts].filter(([, count]) => count > 1).map(([id]) => id);
  });
}

/** 같은 페이지 안 #링크 가운데 가리키는 id가 없는 것 */
async function brokenHashLinks(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLAnchorElement>('main a[href^="#"]')]
      .map((link) => link.getAttribute('href') ?? '')
      .filter((href) => href.length > 1 && !document.getElementById(decodeURIComponent(href.slice(1)))),
  );
}

/** 배우기 페이지(/learn/)에 실린 차시 주소(base 포함, 대단원 번호별) — 자료실 모음이 따라야 하는 목록 */
async function publishedLessons(request: APIRequestContext): Promise<Map<number, string[]>> {
  const html = await (await request.get(at('/learn/'))).text();
  const pattern = new RegExp(`href="(${withBase('/learn/')}u(\\d)/[^"/#]+/)"`, 'gu');
  const byUnit = new Map<number, string[]>();
  for (const match of html.matchAll(pattern)) {
    const href = match[1] ?? '';
    const unit = Number(match[2]);
    const list = byUnit.get(unit) ?? [];
    if (!list.includes(href)) {
      list.push(href);
    }
    byUnit.set(unit, list);
  }
  return byUnit;
}

/** 페이지 HTML의 id 모음(요청 결과 재사용) */
function createIdLookup(request: APIRequestContext): (href: string) => Promise<{ status: number; ids: Set<string> }> {
  const cache = new Map<string, Promise<{ status: number; ids: Set<string> }>>();
  return (href) => {
    const pathname = new URL(href, 'https://site.invalid').pathname;
    if (!cache.has(pathname)) {
      cache.set(
        pathname,
        request.get(pathname).then(async (response) => ({
          status: response.status(),
          ids: new Set([...(await response.text()).matchAll(/\sid="([^"]+)"/gu)].map((match) => (match[1] ?? '').replaceAll('&amp;', '&'))),
        })),
      );
    }
    return cache.get(pathname) as Promise<{ status: number; ids: Set<string> }>;
  };
}

test.describe('교사용 자료실', () => {
  test.skip(({ isMobile }) => isMobile, '페이지 내용은 화면 크기와 상관없어 데스크톱에서 한 번만 확인한다(모바일은 아래 넘침 검사)');

  for (const room of TEACHER_ROOM) {
    test(`${room.path} — 제목 하나, 탭 제목, 자료실 메뉴의 현재 위치, 겹치는 id 없음`, async ({ page }) => {
      const response = await page.goto(at(room.path));
      expect(response?.status(), room.path).toBe(200);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(room.title);
      await expect(page).toHaveTitle(`${room.title} | ${siteConfig.name}`);
      const menu = page.getByRole('navigation', { name: '교사용 자료실 메뉴' });
      await expect(menu.locator('[aria-current="page"]')).toHaveText(room.current);
      await expect(menu.getByRole('link')).toHaveCount(TEACHER_PAGES.length + 1);
      // 현재 위치(빵부스러기)는 홈 › 교사용 자료실 › …
      const crumbs = page.getByRole('navigation', { name: '현재 위치' });
      if (room.path !== TEACHER_PATHS.home) {
        await expect(crumbs.getByRole('link', { name: getPage('teacher').label, exact: true })).toHaveAttribute('href', getPage('teacher').href);
      }
      expect(await duplicateIds(page), room.path).toEqual([]);
      expect(await brokenHashLinks(page), room.path).toEqual([]);
      // 준비 중 상자는 검색 색인에서 뺀다(pages.spec.ts와 같은 규칙: 상자를 품은 요소에 data-pagefind-ignore)
      const comingSoon = page.locator('.coming-soon');
      for (let index = 0; index < (await comingSoon.count()); index += 1) {
        await expect(comingSoon.nth(index).locator('xpath=ancestor::*[@data-pagefind-ignore]')).not.toHaveCount(0);
      }
    });
  }

  test('첫 화면은 아래 페이지 카드와 편집본 상태, 공용 PC 확인표를 보인다', async ({ page, request }) => {
    await page.goto(at(TEACHER_PATHS.home));
    for (const item of TEACHER_PAGES) {
      const card = page.locator(`[data-teacher-card="${item.id}"]`);
      await expect(card.getByRole('link', { name: item.title, exact: true })).toHaveAttribute('href', item.href);
      await expect(card.locator('.teacher-card__count')).toHaveText(/\d/u);
    }

    // 가린 편집본: public/에 파일이 있으면 [편집본 열기], 없으면 준비 중(파일 이름은 handouts.ts 한 곳)
    for (const doc of Object.keys(HANDOUT_DOCS) as HandoutDocId[]) {
      const exists = fs.existsSync(`public/${HANDOUT_DOCS[doc].file}`);
      const item = page.locator(`[data-handout-doc="${doc}"]`);
      await expect(item).toHaveAttribute('data-handout-state', exists ? 'ready' : 'pending');
      await expect(item.getByRole('heading', { level: 3 })).toHaveText(HANDOUT_DOCS[doc].title);
      if (exists) {
        const link = item.getByRole('link', { name: /^편집본 열기/u });
        await expect(link).toHaveAttribute('href', withBase(`/${HANDOUT_DOCS[doc].file}`));
        const response = await request.get(withBase(`/${HANDOUT_DOCS[doc].file}`));
        expect(response.status(), doc).toBe(200);
        // 차시가 쓰는 쪽으로 바로 가는 링크는 같은 파일의 #page=쪽
        for (const pageLink of await item.getByRole('link', { name: '그 쪽 열기' }).all()) {
          await expect(pageLink).toHaveAttribute('href', new RegExp(`^${withBase(`/${HANDOUT_DOCS[doc].file}`).replaceAll('.', '\\.')}#page=\\d+$`, 'u'));
        }
      } else {
        await expect(item).toContainText('준비 중이에요');
        await expect(page.locator('[aria-labelledby="teacher-planned"]')).toContainText(`${HANDOUT_DOCS[doc].title} PDF`);
      }
    }
    await expect(page.getByRole('main')).toContainText('원본 파일(PDF, PPTX)은 사이트에 올리지 않아요');

    // 공용 PC: 확인표와 기록 지우기 단추(이 사이트 이름만 지운다)
    const shared = page.locator('section[aria-labelledby="shared-pc"]');
    await expect(shared.getByRole('heading', { level: 2 })).toHaveText('여러 사람이 쓰는 컴퓨터(공용 PC)에서');
    await expect(shared.locator('[data-shared-pc-checklist] > li')).toHaveCount(4);
    await page.evaluate((prefix) => {
      localStorage.setItem(`${prefix}teacher-spec`, '1');
      localStorage.setItem('other-site:teacher-spec', '1');
    }, STORAGE_KEY_PREFIX);
    const clear = shared.locator('[data-clear-records]');
    await clear.locator('[data-clear-records-open]').click();
    await clear.locator('[data-clear-records-confirm]').click();
    await expect(clear).toHaveAttribute('data-state', 'done');
    expect(await page.evaluate((prefix) => localStorage.getItem(`${prefix}teacher-spec`), STORAGE_KEY_PREFIX)).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('other-site:teacher-spec'))).toBe('1');
  });

  test('지도 요약: 배우기에 실린 차시가 모두 대단원 페이지에 들어오고, 교사용 접기가 있으면 그 글이 보인다', async ({ page, request }) => {
    const lessons = await publishedLessons(request);
    let total = 0;
    for (const unit of learnUnits) {
      const hrefs = lessons.get(unit.unit) ?? [];
      expect(hrefs.length, `${unit.label}의 차시`).toBeGreaterThan(0);
      total += hrefs.length;
      await page.goto(at(guidesUnitPath(unit.unit)));
      await expect(page.locator('article[data-guide-lesson]')).toHaveCount(hrefs.length);
      for (const href of hrefs) {
        const lessonHtml = await (await request.get(href)).text();
        const hasGuide = /class="[^"]*\bbox--teacher\b/u.test(lessonHtml);
        const article = page.locator('article[data-guide-lesson]', { has: page.locator(`a[href="${href}#교사용"]`) });
        await expect(article, href).toHaveCount(1);
        await expect(article.locator(hasGuide ? '[data-guide-body]' : '[data-guide-empty]'), href).toHaveCount(1);
        // 대단원 마무리의 교사용 안내에는 정답 표가 있어 사이트 검색 색인에서 뺀다. 다른 차시의 안내는 색인한다.
        if (hasGuide) {
          const review = /-마무리$/u.test((await article.getAttribute('data-guide-lesson')) ?? '');
          if (review) {
            await expect(article.locator('[data-guide-body]'), href).toHaveAttribute('data-pagefind-ignore', '');
          } else {
            await expect(article.locator('[data-guide-body]'), href).not.toHaveAttribute('data-pagefind-ignore', /.*/u);
          }
        }
      }
    }

    // 모음 첫 화면: 대단원마다 같은 수, 바로 가기는 대단원 페이지의 있는 id로 간다
    await page.goto(at(TEACHER_PATHS.guides));
    await expect(page.locator('[data-guide-index]')).toHaveCount(total);
    for (const unit of learnUnits) {
      await expect(page.locator(`[data-guide-unit="${unit.unit}"] [data-guide-index]`)).toHaveCount(lessons.get(unit.unit)?.length ?? 0);
    }
    const idsOf = createIdLookup(request);
    const jumps = await page.locator('.guide-index__jumps a, .guide-index__title a').evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
    expect(jumps.length).toBeGreaterThan(total);
    for (const href of jumps) {
      const url = new URL(href, 'https://site.invalid');
      const target = await idsOf(href);
      expect(target.status, href).toBe(200);
      expect(target.ids.has(decodeURIComponent(url.hash.slice(1))), href).toBe(true);
    }
  });

  // 파일 링크(PDF·.py 등)는 여기서 보지 않는다 — 빌드 결과의 모든 링크는 npm run check:links가 본다.
  test('지도 요약의 페이지 링크는 차시 페이지의 있는 자리로 간다(꺼낸 글 밖을 가리키던 #링크 포함)', async ({ page, request }) => {
    const idsOf = createIdLookup(request);
    for (const unit of learnUnits) {
      await page.goto(at(guidesUnitPath(unit.unit)));
      const hrefs = await page
        .locator('[data-guide-body] a[href^="/"], .guide__links a[href^="/"]')
        .evaluateAll((links) => [...new Set(links.map((link) => link.getAttribute('href') ?? ''))]);
      for (const href of hrefs.filter((candidate) => !/\.[a-z\d]+(?:#|$)/iu.test(candidate))) {
        const url = new URL(href, 'https://site.invalid');
        const target = await idsOf(href);
        expect(target.status, href).toBe(200);
        if (url.hash) {
          expect(target.ids.has(decodeURIComponent(url.hash.slice(1))), href).toBe(true);
        }
      }
    }
  });

  test('성취기준 표: 15개 줄마다 자리 이름·평가할 때 볼 것이 있고, 생성형 AI 과제는 그 상자 근처로 간다', async ({ page, request }) => {
    const assessment = parseAssessment(readText('content/teacher/assessment.yaml'));
    await page.goto(at(TEACHER_PATHS.standards));
    const rows = page.locator('[role="table"] [role="row"][id^="std-"]');
    await expect(rows).toHaveCount(STANDARDS.length);
    for (const standard of STANDARDS) {
      const row = page.locator(`[id="${standardAnchor(standard.code)}"]`);
      await expect(row, standard.code).toContainText(standard.code);
      const look = assessment.standards[standard.code]?.look;
      expect(look, `assessment.yaml standards ${standard.code}`).toBeTruthy();
      await expect(row).toContainText((look ?? '').replaceAll('`', ''));
      // 좁은 화면 카드 모양에서 칸 이름으로 쓰는 data-label
      for (const cell of await row.locator('[role="cell"]').all()) {
        await expect(cell).toHaveAttribute('data-label', /\S/u);
      }
    }
    // 근거 게시물(인천광역시교육청 교육감승인과목)과 과목 목록 게시물로 가는 링크
    await expect(page.locator(`a[href="${CURRICULUM_SOURCE.url}"]`).first()).toBeVisible();
    await expect(page.locator(`a[href="${assessment.subjectList.url}"]`).first()).toBeVisible();

    const idsOf = createIdLookup(request);
    const genai = await page.locator('[data-genai-list] a').evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
    expect(genai.length).toBeGreaterThan(0);
    for (const href of genai) {
      const url = new URL(href, 'https://site.invalid');
      const target = await idsOf(href);
      expect(target.status, href).toBe(200);
      if (url.hash) {
        expect(target.ids.has(decodeURIComponent(url.hash.slice(1))), href).toBe(true);
      }
    }
    await expect(page.locator('[data-unmapped]').first()).toContainText('—');
  });

  test('원고 정정: 데이터 파일의 묶음·항목이 모두 보이고, 차시별 모음은 단원마다 접혀 있다가 #위치로 오면 펼친다', async ({ page }) => {
    const corrections = parseCorrections(readText('content/teacher/corrections.yaml'));
    await page.goto(at(TEACHER_PATHS.corrections));
    await expect(page.locator('[data-corrections-part]')).toHaveCount(corrections.parts.length);
    for (const part of corrections.parts) {
      const section = page.locator(`[data-corrections-part="${part.id}"]`);
      await expect(section.getByRole('heading', { level: 2 })).toHaveText(part.title);
      await expect(section.locator('.corr-item')).toHaveCount(part.items.length);
    }
    await expect(page.locator('[data-correction-code]')).toHaveCount(corrections.codeFiles.length);
    await expect(page.locator('main')).toContainText(`원고에서 고쳐 읽을 곳은 지금 ${corrections.parts.reduce((sum, part) => sum + part.items.length, 0)}곳`);

    const units = page.locator('details[data-change-unit]');
    expect(await units.count()).toBeGreaterThan(0);
    for (const unit of await units.all()) {
      await expect(unit).not.toHaveAttribute('open', /.*/u);
    }
    const firstChange = page.locator('article[data-lesson-change] h4[id]').first();
    const changeId = (await firstChange.getAttribute('id')) ?? '';
    expect(changeId).not.toBe('');
    await page.goto(at(`${TEACHER_PATHS.corrections}#${changeId}`));
    await expect(page.locator('details[data-change-unit]', { has: page.locator(`[id="${changeId}"]`) })).toHaveAttribute('open', '');
    await expect(page.locator(`[id="${changeId}"]`)).toBeInViewport();
  });

  test('진짜 PC에서 돌리기: 목차가 모든 절로 가고, 사이트 밖 주소는 공식 누리집뿐이다', async ({ page }) => {
    await page.goto(at(TEACHER_PATHS.realPc));
    const markdown = readText('content/teacher/real-pc.md');
    const sectionCount = markdown.split('\n').filter((line) => line.startsWith('## ')).length;
    const toc = page.getByRole('navigation', { name: '이 페이지의 내용' });
    await expect(toc.getByRole('link')).toHaveCount(sectionCount);
    for (const link of await toc.getByRole('link').all()) {
      const id = decodeURIComponent(((await link.getAttribute('href')) ?? '').slice(1));
      await expect(page.locator(`h2[id="${id}"]`)).toHaveText(await link.innerText());
    }
    // 설치 파일을 재배포하지 않고 공식 주소만 적는다(SPEC 원칙 1, PLAN §9.4 D)
    const official = /^https:\/\/(?:www\.python\.org|thonny\.org|github\.com\/(?:thonny|micropython|songdocomputerpark-lang)\/|pypi\.org\/project\/|www\.wch-ic\.com|www\.silabs\.com)/u;
    const external = await page.locator('main a[href^="http"]').evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
    expect(external.length).toBeGreaterThan(0);
    for (const href of external) {
      expect(href, href).toMatch(official);
    }
    await expect(page.getByRole('main')).toContainText('mediapipe==0.10.21');
  });

  test('자주 묻는 질문: 질문 목록이 파일의 묶음·질문과 같고 모두 그 질문으로 간다', async ({ page }) => {
    await page.goto(at(TEACHER_PATHS.faq));
    const lines = readText('content/help/faq-teacher.md').split('\n');
    const groups = lines.filter((line) => line.startsWith('## ')).length;
    const questions = lines.filter((line) => line.startsWith('### ')).length;
    const index = page.getByRole('navigation', { name: '질문 목록' });
    await expect(index.locator('.faq-index__group')).toHaveCount(groups);
    await expect(index.locator('ol > li a')).toHaveCount(questions);
    for (const link of await index.locator('ol > li a').all()) {
      const id = decodeURIComponent(((await link.getAttribute('href')) ?? '').slice(1));
      await expect(page.locator(`h3[id="${id}"]`)).toHaveText(await link.innerText());
    }
    await expect(page.getByRole('main').getByRole('link', { name: getPage('help').title, exact: true }).first()).toHaveAttribute('href', getPage('help').href);
  });
});

test.describe('교사용 자료실 — 좁은 화면(375px)', () => {
  test.skip(({ isMobile }) => !isMobile, '모바일 화면에서만 확인한다');

  test('자료실 페이지가 화면보다 넓어지지 않는다(성취기준 표는 줄마다 카드로)', async ({ page }) => {
    for (const room of TEACHER_ROOM) {
      await page.goto(at(room.path));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, room.path).toBeLessThanOrEqual(0);
    }
    await page.goto(at(TEACHER_PATHS.standards));
    const firstRow = page.locator('[role="table"] [role="row"][id^="std-"]').first();
    await expect(firstRow).toBeVisible();
    const display = await firstRow.evaluate((element) => getComputedStyle(element).display);
    expect(display).not.toBe('table-row');
  });
});
