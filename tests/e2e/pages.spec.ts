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

    // 오류 사전으로 가는 길(P2-14에서 "준비 중" 상자를 링크로 바꿈, 2026-09-30 첫 문단에도 — 같은 이름은 모두 같은 곳으로 간다)
    const errorLinks = page.getByRole('main').getByRole('link', { name: '파이썬 오류 사전' });
    expect(await errorLinks.count()).toBeGreaterThanOrEqual(1);
    for (const link of await errorLinks.all()) {
      await expect(link).toHaveAttribute('href', withBase('help/errors/'));
    }
  });

  test('기여·문의는 이슈 양식(목록 _issue-templates.ts)·개인정보 안내·라이선스 파일·제3자 목록을 연결한다', async ({ page }) => {
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
    // 예제 코드는 MIT(운영자 결정 O13) — LICENSE의 CC BY-NC-SA 문장에 examples/가 남으면 README·LICENSE-CONTENT·/credits/와 반대로 읽힌다
    // (2026-09-26 Phase 6 안전 검토 지적 1: 적용 범위 문단만 옛 문장이었다).
    const ccSentences = mit
      .split(/(?<=[.요])\s+/u)
      .filter((sentence) => /CC BY-NC-SA 4\.0(?:을 따라요| \(see)/u.test(sentence.replace(/\s+/gu, ' ')));
    expect(ccSentences.length, 'LICENSE의 CC BY-NC-SA 문장(한국어·영어)').toBeGreaterThanOrEqual(2);
    for (const sentence of ccSentences) {
      expect(sentence, 'LICENSE의 CC BY-NC-SA 문장에 examples/가 들어 있어요').not.toContain('examples/');
    }
    expect(mit.replace(/\s+/gu, ' ')).toContain('examples/ 폴더의 실습 예제 코드');
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
      // 이슈 양식의 링크는 공개 사이트 주소다. 시험할 때는 이번 빌드의 주소로 바꿔 연다(APC_BASE로 뿌리에 빌드해도 같게).
      expect(String(link.url).startsWith(`${siteConfig.origin}${siteConfig.publicBase}/`), link.url).toBe(true);
      const sitePath = new URL(link.url).pathname.slice(siteConfig.publicBase.length);
      expect((await request.get(withBase(sitePath))).status(), link.url).toBe(200);
    }
  });
});

test.describe('실습실 밖 쪽의 안내 글·표시(2026-09-30 최종 점검 고침)', () => {
  test.skip(({ isMobile }) => isMobile, '글과 표시는 데스크톱에서 확인한다');

  test('문제 해결: 개발 중 표현이 없고, 음성 질문은 칸 이름으로 가리키며 "적고 [보내기]를" 띄어 쓴다', async ({ page }) => {
    await page.goto('./help/');
    const main = page.getByRole('main');
    await expect(main).not.toContainText('첫 모음');
    await expect(main).not.toContainText('실습실이 생기면서');
    const speech = page.locator('section[aria-labelledby="speech"]');
    await expect(speech).toContainText("'말 대신 적을 문장' 칸에 문장을 적고 [보내기]를 누르면");
    await expect(speech).not.toContainText('오른쪽');
  });

  test('오류 사전: "오류가 아니에요" 딱지는 제목 밖에 있고(제목이 이미 그렇게 말하면 없음), 펼침 칸에는 세모 표시가 있다', async ({ page }) => {
    await page.goto('./help/errors/');
    // 제목(h3)은 제목 글만 — 검색 결과·화면 낭독기가 "…않아요오류가 아니에요"로 붙여 읽지 않게
    await expect(page.locator('h3#comm-mqtt-topic-prefix-twice')).toHaveText('토픽에는 접두어를 적지 않아요');
    await expect(page.locator('[data-errors-entry-item="comm-mqtt-topic-prefix-twice"] .errors-entry__badge')).toHaveText('오류가 아니에요');
    await expect(page.locator('.errors-entry__title .errors-entry__badge')).toHaveCount(0);
    // 제목이 이미 "오류가 아니라 안내예요"·"오류가 아니에요"라고 말하는 항목에는 딱지를 또 붙이지 않는다
    for (const id of ['comm-ble-truncated', 'keyboard-interrupt']) {
      await expect(page.locator(`[data-errors-entry-item="${id}"] .errors-entry__badge`), id).toHaveCount(0);
    }
    // 펼침 칸 표시: 닫혀 있으면 오른쪽을 가리키는 세모, 열리면 아래로 돈다(테두리로 그려 낭독되지 않음)
    const entry = page.locator('[data-errors-entry-item="name-error"]');
    const summary = entry.locator('summary');
    const marker = () =>
      summary.evaluate((element) => {
        const style = getComputedStyle(element, '::before');
        return { content: style.content, left: style.borderLeftWidth, transform: style.transform };
      });
    const closed = await marker();
    expect(closed.content).toBe('""');
    expect(Number.parseFloat(closed.left)).toBeGreaterThan(0);
    expect(closed.transform).toBe('none');
    await summary.click();
    await expect(entry.locator('[data-errors-more]')).toHaveAttribute('open', '');
    expect((await marker()).transform).not.toBe('none');
  });

  test('교사용 시작하기: 외부 연결 표의 공개 중계 서버 줄에 실습실이 고를 수 있는 서버가 모두 있다(HiveMQ 포함)', async ({ page }) => {
    await page.goto(getPage('start-teacher').href);
    const table = page.getByRole('table', { name: '외부로 연결되는 곳과 보내지는 것' });
    const mqtt = table.locator('tbody tr').filter({ hasText: 'MQTT' });
    await expect(mqtt).toContainText('HiveMQ');
    await expect(mqtt).toContainText('test.mosquitto.org');
    await expect(mqtt.getByRole('link', { name: 'HiveMQ 개인정보처리방침(영어)' })).toHaveAttribute('href', 'https://www.hivemq.com/legal/privacy-policy/');
    await expect(table).not.toContainText('생긴 뒤');
  });

  test('설정: 영상처리 실습실에서 고른 카메라를 기억한다고 적고, 음성 방법을 고르는 곳은 칸 이름으로 가리킨다', async ({ page }) => {
    await page.goto(getPage('settings').href);
    const main = page.getByRole('main');
    await expect(main).toContainText('고른 카메라');
    await expect(main).not.toContainText('지금은 실습실을 열 때마다 골라요.');
    await expect(main).toContainText("조절 패널의 '받는 방법' 칸");
    await expect(main).not.toContainText('오른쪽 아래 패널');
  });

  test('학생용 시작하기: 조절 패널을 자리 낱말 없이 가리킨다(휴대폰에서는 칸이 아래로 쌓인다)', async ({ page }) => {
    await page.goto(getPage('start-student').href);
    await expect(page.getByRole('main')).toContainText('실행 중에 조절 패널의 슬라이더로');
    await expect(page.getByRole('main')).not.toContainText('오른쪽 아래 조절 패널');
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

  // 판 1.1.3(최종 전수 점검 2바퀴 ST2-01): 그늘 규칙이 글 읽기(.prose) 안에만 저절로 붙어, 오류 사전의 예시 코드 칸·용어 파일 예시·
  // 보드 준비 쪽 드라이버 표·직접 굽는 명령은 휴대폰에서 줄 끝이 잘린 채 끝난 것처럼 보였다(learn.spec.ts의 차시 그늘 검사와 같은 모양).
  test('.prose 밖의 넘치는 코드·표 칸도 오른쪽 안쪽에 그늘이 생기고, 끝까지 밀면 그 그늘이 사라진다', async ({ page }) => {
    /** 펼침 칸을 모두 연 뒤, 넘치는 칸과 그늘 표시가 맞지 않는 칸 목록(넘치면 end/both/start, 넘치지 않으면 표시 없음) */
    const mismatches = (selector: string) =>
      page.locator(selector).evaluateAll((elements) =>
        elements
          .map((element, index) => {
            const overflowing = element.scrollWidth - element.clientWidth > 1;
            const more = element.getAttribute('data-scroll-more');
            return overflowing === (more !== null) ? null : `${index}: 넘침 ${overflowing}, 표시 ${String(more)}`;
          })
          .filter((item) => item !== null),
      );
    const checkShade = async (selector: string) => {
      const boxes = page.locator(selector);
      await expect.poll(() => mismatches(selector), { message: selector }).toEqual([]);
      const index = await boxes.evaluateAll((elements) => elements.findIndex((element) => element.scrollWidth - element.clientWidth > 1));
      expect(index, `${selector} — 375px에서 넘치는 칸이 하나는 있어야 이 검사가 뜻이 있어요`).toBeGreaterThanOrEqual(0);
      const box = boxes.nth(index);
      await box.scrollIntoViewIfNeeded();
      await expect(box).toHaveAttribute('data-scroll-more', 'end');
      expect(await box.evaluate((element) => getComputedStyle(element).boxShadow)).toContain('inset');
      await box.evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
      });
      await expect(box).toHaveAttribute('data-scroll-more', 'start');
    };

    // 닫힌 펼침 칸(오류 사전의 "왜 났는지와 고치는 법"·교사용 상자) 안의 칸은 크기가 0이라 넘치지 않는다 — 모두 연 뒤 잰다
    const openAllDetails = () =>
      page.locator('details').evaluateAll((elements) => {
        for (const element of elements) {
          (element as HTMLDetailsElement).open = true;
        }
      });

    await page.goto('./help/errors/');
    await openAllDetails();
    await checkShade('pre.errors-entry__code');

    await page.goto('./glossary/');
    await openAllDetails();
    await checkShade('pre.glossary-code');

    await page.goto('./start/board/');
    await openAllDetails();
    await checkShade('div.driver-table');
    // 직접 굽는 명령(펌웨어 굽기 화면이 스크립트로 그리는 펼침 칸 안 — 실습실 쪽 파일 src/lab/firmware/markup.ts)
    const manual = page.locator('details:has(pre.fw__code)').first();
    await expect(manual).toHaveCount(1, { timeout: 30_000 });
    await manual.evaluate((element) => {
      (element as HTMLDetailsElement).open = true;
    });
    await checkShade('pre.fw__code');
  });
});
