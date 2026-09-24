// 페이지 확인(PLAN §8.1 P1-05 준비 중 페이지 틀, P1-10 라이선스·안내 문서, P1-11 색인 규칙).
// - 사이트 지도의 모든 주소: 200, 탭 제목, 페이지 제목(h1) 하나, 설명 메타, 본문 영역
// - 이 담당의 페이지(실습실·교사용 자료실·문제 해결·기여·문의·검색·404): 내용과 링크
// 주소는 baseURL 기준 상대 경로('./help/')나 사이트 지도의 href(base 포함)로 연다(앞에 /만 붙이면 base가 빠진다).
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { parse } from 'yaml';
import { flattenPages, getPage } from '../../src/config/nav.ts';
import { searchConfig } from '../../src/config/search.ts';
import { siteConfig } from '../../src/config/site.ts';
import { withParticle } from '../../src/lib/korean.ts';
import { withBase } from '../../src/lib/url.ts';
import {
  ISSUE_TEMPLATE_DIR,
  ISSUE_TEMPLATES,
  issueChooserUrl,
  issueTemplateUrl,
  repositoryFileUrl,
} from '../../src/pages/contribute/_issue-templates.ts';
import { LAB_PLANS } from '../../src/pages/labs/_labs.ts';

/** 이 담당이 만든 사이트 지도 페이지 */
const OWN_PAGE_IDS = [
  'labs',
  'labs-vision',
  'labs-esp32',
  'labs-esp32-check',
  'labs-iot',
  'labs-iot-dashboard',
  'labs-unit4',
  'labs-gallery',
  'teacher',
  'help',
  'contribute',
  'search',
] as const;

/**
 * 가로 넘침(px)과, 넘칠 때 화면 오른쪽 끝을 넘는 가장 안쪽 요소 몇 개.
 * CI(리눅스)에서만 넘치는 경우처럼 로컬에서 재현하기 어려울 때 실패 메시지만 보고 고칠 곳을 찾게 한다.
 */
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

/** 문제 해결 페이지의 질문 id(다른 페이지가 help/#id로 연결한다) */
const HELP_QUESTION_IDS = ['camera', 'camera-black', 'browser', 'speech', 'board-port', 'school-network', 'clear-data'] as const;

test.describe('사이트 지도의 모든 페이지', () => {
  test.skip(({ isMobile }) => isMobile, '페이지 내용은 화면 크기와 상관없어 데스크톱에서 한 번만 확인한다');

  for (const navPage of flattenPages()) {
    test(`${navPage.path} — 200, 탭 제목, 페이지 제목 하나`, async ({ page }) => {
      const response = await page.goto(navPage.href);
      expect(response?.status(), navPage.href).toBe(200);

      const documentTitle = await page.title();
      expect(documentTitle === siteConfig.name || documentTitle.endsWith(` | ${siteConfig.name}`), documentTitle).toBe(true);

      const heading = page.getByRole('heading', { level: 1 });
      await expect(heading).toHaveCount(1);
      await expect(heading).toHaveText(/\S/u);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /\S/u);
      await expect(page.locator('main#main-content')).toHaveCount(1);
    });
  }
});

test.describe('이 담당의 페이지', () => {
  test.skip(({ isMobile }) => isMobile, '페이지 내용은 데스크톱에서 확인하고, 모바일은 아래 가로 넘침 검사만 한다');

  for (const id of OWN_PAGE_IDS) {
    test(`${id}: 제목·현재 위치가 사이트 지도와 같고, 준비 중 상자는 검색 색인에서 빠진다`, async ({ page }) => {
      const navPage = getPage(id);
      await page.goto(navPage.href);
      await expect(page).toHaveTitle(`${navPage.title} | ${siteConfig.name}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(navPage.title);
      await expect(page.getByRole('navigation', { name: '현재 위치' }).locator('[aria-current="page"]')).toHaveText(navPage.label);
      // 검색 페이지만 사이트 검색 색인에서 뺀다.
      await expect(page.locator('main[data-pagefind-body]')).toHaveCount(id === 'search' ? 0 : 1);

      const comingSoonBoxes = page.locator('.coming-soon');
      const boxCount = await comingSoonBoxes.count();
      for (let index = 0; index < boxCount; index += 1) {
        await expect(comingSoonBoxes.nth(index).locator('xpath=ancestor::*[@data-pagefind-ignore]')).not.toHaveCount(0);
      }
    });
  }

  test('실습실 개요는 사이트 지도의 실습실을 모두 카드로 보이고, 열렸는지(아니면 열리는 Phase)를 알린다', async ({ page, request }) => {
    const labs = getPage('labs');
    await page.goto(labs.href);
    const cards = page.locator('.lab-card');
    await expect(cards).toHaveCount(labs.children.length);

    for (const child of labs.children) {
      const plan = LAB_PLANS.find((candidate) => candidate.id === child.id);
      expect(plan, child.id).toBeDefined();
      const card = cards.filter({ has: page.getByRole('heading', { level: 2, name: child.title }) });
      await expect(card.getByRole('link', { name: child.title, exact: true })).toHaveAttribute('href', child.href);
      // 실제 화면이 열린 실습실(_labs.ts의 open, 2026-09-16부터 영상처리)은 "열림", 나머지는 열리는 Phase를 보인다.
      if (plan?.open) {
        await expect(card).toContainText('열림');
        await expect(card).not.toContainText('준비 중');
      } else {
        await expect(card).toContainText(`Phase ${plan?.phase}`);
      }
      expect((await request.get(child.href)).status(), child.href).toBe(200);
    }
    // 열린 실습실 이름을 쉼표로 이어 알린다(P2-03 영상처리, P3-01 ESP32, P4 통신·4단원 통합·갤러리). 아래 페이지까지 모두 열렸으면 "모두 열렸어요"(2026-09-24 Phase 4 통합).
    const openPlans = labs.children.map((child) => LAB_PLANS.find((candidate) => candidate.id === child.id));
    const openTitles = labs.children.filter((_child, index) => openPlans[index]?.open).map((child) => child.title);
    const allOpen = [...labs.children, ...labs.children.flatMap((child) => child.children)].every((child) => LAB_PLANS.find((candidate) => candidate.id === child.id)?.open);
    await expect(page.locator('.labs-intro')).toContainText(
      allOpen ? `${withParticle(openTitles.join(', '), '이/가')} 모두 열렸어요` : `${withParticle(openTitles.join(', '), '은/는')} 열렸어요`,
    );

    const checkPage = getPage('labs-esp32-check');
    await expect(page.getByRole('link', { name: checkPage.title, exact: true })).toHaveAttribute('href', checkPage.href);
  });

  for (const plan of LAB_PLANS.filter((candidate) => !candidate.open)) {
    test(`${plan.id}: 준비되면 할 일 목록과 열리는 때를 보여 준다`, async ({ page }) => {
      await page.goto(getPage(plan.id).href);
      // 코드를 실행하거나 보드를 연결하는 실습실만 브라우저 권장 환경 안내(BrowserNotice)를 둔다(SPEC §9).
      await expect(page.locator('[data-browser-notice]')).toHaveCount(plan.browserNotice ? 1 : 0);
      const section = page.locator('section', { has: page.getByRole('heading', { level: 2, name: '준비되면 이런 걸 해요' }) });
      await expect(section.locator('ul').first().locator('> li')).toHaveCount(plan.features.length);
      await expect(page.locator('.coming-soon')).toContainText(plan.when);
      // 같은 이름의 링크가 머리글·바닥글에도 있으므로 "그동안 둘러볼 곳" 구역 안에서만 찾는다.
      const relatedSection = page.locator('section', { has: page.getByRole('heading', { level: 2, name: '그동안 둘러볼 곳' }) });
      for (const relatedId of plan.relatedIds) {
        const related = getPage(relatedId);
        await expect(relatedSection.getByRole('link', { name: related.title, exact: true })).toHaveAttribute('href', related.href);
      }
    });
  }

  test('교사용 자료실은 올라올 자료와 가린 편집본 방침을 알린다', async ({ page }) => {
    await page.goto('./teacher/');
    await expect(page.getByRole('heading', { level: 2, name: '올라올 자료' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: '원본 파일 대신 가린 편집본을 올려요' })).toBeVisible();
    await expect(page.getByRole('main')).toContainText('원본 파일(PDF, PPTX)은 사이트에 올리지 않아요');
  });

  test('문제 해결은 질문 목록과 오류 사전 링크를 보이고, 목록 링크가 그 질문으로 간다', async ({ page }) => {
    await page.goto('./help/');
    const toc = page.getByRole('navigation', { name: '질문 목록' });
    await expect(toc.getByRole('link')).toHaveCount(HELP_QUESTION_IDS.length);
    for (const id of HELP_QUESTION_IDS) {
      const heading = page.locator(`h2[id="${id}"]`);
      await expect(heading).toBeVisible();
      await expect(toc.locator(`a[href="#${id}"]`)).toHaveText(await heading.innerText());
    }
    await toc.locator('a[href="#board-port"]').click();
    await expect(page).toHaveURL(/#board-port$/u);
    await expect(page.locator('h2[id="board-port"]')).toBeInViewport();

    // 오류 사전으로 가는 길(P2-14에서 "준비 중" 상자를 링크로 바꿈)
    await expect(page.getByRole('main').getByRole('link', { name: '파이썬 오류 사전' })).toHaveAttribute('href', withBase('help/errors/'));
  });

  test('기여·문의는 이슈 양식 3가지·개인정보 안내·라이선스 파일·제3자 목록을 연결한다', async ({ page }) => {
    await page.goto('./contribute/');
    const main = page.getByRole('main');
    await expect(main.getByRole('link', { name: '이슈 양식 고르기' })).toHaveAttribute('href', issueChooserUrl);
    for (const template of ISSUE_TEMPLATES) {
      await expect(main.getByRole('link', { name: template.name, exact: true })).toHaveAttribute('href', issueTemplateUrl(template));
    }

    await expect(main.getByRole('heading', { level: 2, name: '개인정보를 발견했다면' })).toBeVisible();
    await expect(main).toContainText('위치만 적어 주세요');

    await expect(main).toContainText(siteConfig.license.exclusion);
    await expect(main.getByRole('link', { name: '라이선스 전문(LICENSE)' })).toHaveAttribute('href', repositoryFileUrl('LICENSE'));
    await expect(main.getByRole('link', { name: '라이선스 안내(LICENSE-CONTENT.md)' })).toHaveAttribute(
      'href',
      repositoryFileUrl('LICENSE-CONTENT.md'),
    );
    await expect(main.getByRole('link', { name: '기여 안내(CONTRIBUTING.md)' })).toHaveAttribute(
      'href',
      repositoryFileUrl('CONTRIBUTING.md'),
    );

    const thirdPartyLink = main.getByRole('link', { name: '제3자 권리 표기 자료 목록' });
    await expect(thirdPartyLink).toHaveAttribute('href', withBase('credits/#credits-third-party'));
    await thirdPartyLink.click();
    await expect(page.locator('#credits-third-party')).toBeVisible();
  });

  test('라이선스·안내 문서 파일이 있고 제외 조항을 담는다', () => {
    for (const file of ['LICENSE', 'LICENSE-CONTENT.md', 'README.md', 'CONTRIBUTING.md', 'MAINTENANCE.md']) {
      expect(fs.existsSync(path.join(process.cwd(), file)), file).toBe(true);
    }
    const mit = fs.readFileSync(path.join(process.cwd(), 'LICENSE'), 'utf8');
    expect(mit.startsWith('MIT License')).toBe(true);
    expect(mit).toContain(`Copyright (c) 2026 ${siteConfig.author}`);
    for (const file of ['LICENSE', 'LICENSE-CONTENT.md', 'README.md']) {
      const text = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
      expect(text, file).toContain('sources.yaml');
      expect(text, file).toMatch(/제외/u);
    }
  });

  test('이슈 양식 파일이 GitHub 양식 규칙의 기본을 지키고, 기여·문의 페이지 목록과 같다', async ({ request }) => {
    const fieldTypes = ['textarea', 'input', 'dropdown', 'checkboxes'];
    for (const template of ISSUE_TEMPLATES) {
      const filePath = path.join(process.cwd(), ISSUE_TEMPLATE_DIR, template.file);
      expect(fs.existsSync(filePath), template.file).toBe(true);
      const form = parse(fs.readFileSync(filePath, 'utf8'));
      expect(form.name, template.file).toBe(template.name);
      expect(typeof form.description, template.file).toBe('string');
      expect(Array.isArray(form.body) && form.body.length > 0, template.file).toBe(true);

      // 첫 안내문은 공개 게시판이라는 사실과 개인정보 주의를 알린다.
      expect(form.body[0].type).toBe('markdown');
      expect(form.body[0].attributes.value).toContain('누구나 볼 수 있어요');

      const ids = new Set<string>();
      for (const element of form.body) {
        if (element.type === 'markdown') {
          expect(typeof element.attributes?.value).toBe('string');
          continue;
        }
        expect(fieldTypes, template.file).toContain(element.type);
        expect(typeof element.attributes?.label, template.file).toBe('string');
        expect(element.id, template.file).toMatch(/^[A-Za-z0-9_-]+$/u);
        expect(ids.has(element.id), `${template.file} ${element.id}`).toBe(false);
        ids.add(element.id);
      }
      expect(ids.size, template.file).toBeGreaterThan(0);
    }

    const config = parse(fs.readFileSync(path.join(process.cwd(), ISSUE_TEMPLATE_DIR, 'config.yml'), 'utf8'));
    expect(config.blank_issues_enabled).toBe(false);
    for (const link of config.contact_links) {
      expect(String(link.url).startsWith(`${siteConfig.origin}${siteConfig.base}/`), link.url).toBe(true);
      expect((await request.get(new URL(link.url).pathname)).status(), link.url).toBe(200);
    }
  });
});

test.describe('없는 주소(404)', () => {
  test.skip(({ isMobile }) => isMobile, '404 동작은 데스크톱에서 확인한다');

  for (const missingPath of ['./no-such-page/', './labs/no-such-lab/deep/']) {
    test(`${missingPath} — 한국어 404 페이지와 첫 화면·검색 링크`, async ({ page, request }) => {
      const response = await page.goto(missingPath);
      expect(response?.status()).toBe(404);
      await expect(page.getByRole('heading', { level: 1, name: '페이지를 찾을 수 없어요' })).toBeVisible();
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
      await expect(page.locator('main[data-pagefind-body]')).toHaveCount(0);

      const main = page.getByRole('main');
      await expect(main.getByRole('link', { name: '첫 화면으로 가기' })).toHaveAttribute('href', withBase(''));
      await expect(main.getByRole('link', { name: getPage('search').title, exact: true })).toHaveAttribute('href', searchConfig.pageHref);
      for (const href of [withBase(''), searchConfig.pageHref, getPage('help').href, getPage('contribute').href]) {
        expect((await request.get(href)).status(), href).toBe(200);
      }
    });
  }

  test('404 페이지의 검색 상자로 찾으면 검색 페이지가 결과를 보여 준다', async ({ page }) => {
    await page.goto('./no-such-page/');
    const form = page.getByRole('search', { name: '사이트에서 찾아보기' });
    await form.getByRole('searchbox', { name: '검색어' }).fill('실습실');
    await form.getByRole('button', { name: '검색' }).click();
    await expect(page.getByRole('heading', { level: 1, name: getPage('search').title })).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get(searchConfig.queryParam)).toBe('실습실');
    await expect(page.locator('[data-search-root]')).toHaveAttribute('data-state', 'results');
  });
});

test.describe('좁은 화면(375px)', () => {
  test.skip(({ isMobile }) => !isMobile, '모바일 화면에서만 확인한다');

  test('이 담당의 페이지가 화면보다 넓어지지 않는다', async ({ page }) => {
    const paths = ['./labs/', './labs/vision/', './labs/esp32/check/', './labs/iot/', './teacher/', './help/', './contribute/', './search/?q=카메라', './no-such-page/'];
    for (const pagePath of paths) {
      await page.goto(pagePath);
      const { overflow, offenders } = await horizontalOverflow(page);
      expect(overflow, `${pagePath} ${offenders.join(', ')}`).toBeLessThanOrEqual(0);
    }
  });
});
