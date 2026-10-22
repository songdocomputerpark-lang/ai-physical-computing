// 출처와 라이선스 페이지(P6-04, 2026-09-26): 다시 나누는 파일에 꼭 함께 알릴 것(FFmpeg LGPL·Pagefind GPL·IJG·FreeType·Eigen·펌웨어),
// 제3자 권리 표기 자료(키트 업체 사진 — PROGRESS 미해결 189), 출판 편집 삽화가 운영자 자료 항목에 적힌 것(미해결 164),
// 고지 전문 파일 모음이 화면에 보이고, 고지 파일이 모두 열리며 저장소의 파일과 바이트까지 같은지 본다.
// 주소는 baseURL(…/ai-physical-computing/) 기준 상대 경로('./credits/')로 연다(smoke.spec.ts 머리말).
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { REDISTRIBUTION_NOTICES, buildCreditsView } from '../../src/lib/credits.ts';
import { withBase } from '../../src/lib/url.ts';

const registryText = fs.readFileSync(path.join(process.cwd(), 'sources.yaml'), 'utf8');
const view = buildCreditsView(registryText);

/** 저장소 뿌리 기준 경로(public/…)의 파일 바이트 */
function repoFile(filePath: string): Buffer {
  return fs.readFileSync(path.join(process.cwd(), ...filePath.split('/')));
}

test.describe('출처와 라이선스 페이지(P6-04)', () => {
  // 여러 구역이 개발 서버 하나를 함께 쓰며 실습실 검사를 돌리면 첫 페이지 열기만 24초가 걸린 적이 있다(2026-09-26 실측 —
  // 기본 30초를 브라우저 띄우기와 나눠 쓰다 시간 초과). 검사 내용은 가벼워서 시간 한도만 넉넉히 준다.
  test.describe.configure({ timeout: 90_000 });

  test('다시 나누는 파일의 알림이 모두 보이고, 라이선스가 요구하는 문장은 영어 원문(lang="en") 그대로다', async ({ page }) => {
    await page.goto('./credits/');
    const section = page.locator('section[aria-labelledby="credits-redistribution"]');
    await expect(section.getByRole('heading', { level: 2 })).toHaveText('다시 나누는 파일에 꼭 함께 알리는 것');
    await expect(section.locator('.credits__notices > li')).toHaveCount(REDISTRIBUTION_NOTICES.length);
    for (const notice of REDISTRIBUTION_NOTICES) {
      const card = section.locator(`#credits-notice-${notice.id}`);
      await expect(card.getByRole('heading', { level: 3 })).toHaveText(notice.title);
      const statement = card.locator('p[lang="en"]');
      if (notice.statement) {
        await expect(statement).toHaveText(notice.statement);
      } else {
        await expect(statement).toHaveCount(0);
      }
      await expect(card.locator('.credits__notice-link a')).toHaveAttribute('href', withBase(notice.noticePath.slice('public/'.length)));
    }
  });

  test('키트 업체 사진은 제3자 목록에 원래 권리 문구와 함께 있고, 출판 편집 삽화·편집본 출처 쪽은 운영자 자료 항목에 적혀 있다', async ({ page }) => {
    await page.goto('./credits/');
    const thirdParty = page.locator('section[aria-labelledby="credits-third-party"]');
    await expect(thirdParty.locator('.credits__list > li')).toHaveCount(view.thirdParty.length);
    const kit = thirdParty.locator('article', {
      has: page.getByRole('heading', { level: 3, name: '키트 업체(고릴라셀·브릭셀)의 제품 사진·그림' }),
    });
    await expect(kit).toHaveCount(1);
    await expect(kit).toContainText('사이트 라이선스에서 제외');
    await expect(kit).toContainText('원본 그림에 권리 표기 없음');
    await expect(kit).toContainText('public/images/lessons/*/third-party/kit-vendor/**');
    // 판 1.4.0(O17): 부품 사전 사진 폴더도 이 항목이 덮고, 운영자가 받은 사용 허락과 표기 문구가 보인다
    await expect(kit).toContainText('public/images/parts/third-party/kit-vendor/**');
    await expect(kit).toContainText('부품 사진: 고릴라셀(브릭셀) 제공, 허락받아 사용');

    const byLicense = page.locator('section[aria-labelledby="credits-by-license"]');
    const operator = byLicense.locator('article', {
      has: page.getByRole('heading', { level: 4, name: '교과서 원고와 수업 교안의 글·그림·사진' }),
    });
    await expect(operator).toHaveCount(1);
    await expect(operator).not.toContainText('사이트 라이선스에서 제외');
    await expect(operator).toContainText('출판사가 조판 때 넣은 삽화·컷');
    await expect(operator).toContainText('미해결 164');
    await expect(operator).toContainText('출처 쪽이 한 장씩 붙어요');
    await expect(operator).toContainText('public/teacher/handouts/*.pdf');
  });

  // 판 1.7.0(미해결 268 ①, 걷기 B-56): 눈에 보이는 줄에는 결정 번호·할 일 번호·저장소 폴더 경로가 없고, 접힌 "자세히(개발자용)"를 열면 원문이 그대로 있다.
  test('결정 번호·할 일 번호·폴더 경로는 접힌 "자세히(개발자용)" 안에만 있다', async ({ page }) => {
    await page.goto('./credits/');
    // 접힌 칸을 뺀 글(열리지 않아 눈에 안 보이는 글)에는 개발자용 참조가 없다
    const outside = await page.locator('.credits').evaluate((root) => {
      const clone = root.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('[data-credits-dev]').forEach((node) => node.remove());
      return clone.textContent ?? '';
    });
    expect(outside).not.toMatch(/DECISIONS|운영자 할 일|sources\.yaml|public\/images\/|content\/lessons/u);
    // 항목 카드마다 접힌 칸이 있고, 처음에는 모두 닫혀 있다
    const dev = page.locator('.credits [data-credits-dev]');
    expect(await dev.count()).toBeGreaterThan(view.thirdParty.length);
    await expect(page.locator('.credits [data-credits-dev][open]')).toHaveCount(0);
    await expect(dev.first().locator('summary')).toHaveText('자세히(개발자용)');
    // 열면 원문이 그대로 나온다
    const kit = page.locator('section[aria-labelledby="credits-third-party"] article', {
      has: page.getByRole('heading', { level: 3, name: '키트 업체(고릴라셀·브릭셀)의 제품 사진·그림' }),
    });
    await kit.locator('[data-credits-dev] summary').click();
    await expect(kit.locator('[data-credits-dev]')).toContainText('public/images/parts/third-party/kit-vendor/**');
    await expect(kit.locator('[data-credits-dev]')).toContainText('DECISIONS O17');
  });

  test('고지 전문 파일 모음의 파일이 모두 열리고, 저장소의 파일과 바이트까지 같다', async ({ page, request }) => {
    // 링크 글자는 한 번에 읽고, 파일은 한꺼번에 받는다.
    await page.goto('./credits/');
    const links = page.locator('section[aria-labelledby="credits-notice-files"] .credits__files a');
    await expect(links).toHaveCount(view.noticeFiles.length);
    const shown = await links.evaluateAll((anchors) => anchors.map((anchor) => [anchor.getAttribute('href'), anchor.textContent?.trim()]));
    expect(shown).toEqual(view.noticeFiles.map((file) => [file.href, file.path.slice('public/'.length)]));
    const results = await Promise.all(
      view.noticeFiles.map(async (file) => {
        const response = await request.get(file.href);
        return { path: file.path, status: response.status(), same: (await response.body()).equals(repoFile(file.path)) };
      }),
    );
    expect(results.filter((result) => result.status !== 200 || !result.same)).toEqual([]);
  });

  test('한국어 머리말이 있는 고지 파일을 브라우저로 열어도 글자가 깨지지 않는다(UTF-8 BOM)', async ({ page }) => {
    const korean = view.noticeFiles.filter((file) => repoFile(file.path).some((byte) => byte >= 0x80));
    expect(korean.length).toBeGreaterThan(0);
    for (const file of korean) {
      const firstLine = repoFile(file.path).toString('utf8').split('\n')[0].trim();
      await page.goto(file.href);
      await expect(page.locator('body'), file.path).toContainText(firstLine);
    }
  });

  test('출처 페이지의 카드가 화면 폭을 넘지 않는다(휴대폰 375px 포함)', async ({ page }) => {
    await page.goto('./credits/');
    const overflow = await page.evaluate(() => {
      const width = document.documentElement.clientWidth;
      const wide = [...document.querySelectorAll('.credits article, .credits__notices > li, .credits h3')]
        .filter((element) => element.getBoundingClientRect().right > width + 0.5)
        .map((element) => element.textContent?.trim().slice(0, 40) ?? '');
      return { page: document.documentElement.scrollWidth - width, wide };
    });
    expect(overflow.wide).toEqual([]);
    expect(overflow.page).toBeLessThanOrEqual(0);
  });
});

// 바닥글 출처·라이선스 줄(판 1.6.0 R6, 걷기 보고 A-17·B-57): 만든 사람·연락·개인정보·출처 네 줄은 보이고 라이선스·GitHub는 접힌 "자세히(개발자용)" 안에 있다.
// 라이선스 의무 문구(제3자 자료 제외 문구 + 출처와 라이선스 링크, PD-26)는 접힌 안에서도 그대로이고, 사이트 지도의 "사이트 정보 › 출처와 라이선스"는 늘 보인다.
test.describe('바닥글 출처·라이선스(판 1.6.0)', () => {
  test('출처 줄에 키트 제조사 설명이 있고, 라이선스·GitHub 줄은 접혀 있다가 열면 출처와 라이선스 링크가 보인다', async ({ page }) => {
    await page.goto('./credits/');
    const footer = page.locator('footer.site-footer');
    await expect(footer.locator('[data-site-credit]')).toContainText('고릴라셀(브릭셀, 실습 키트 제조사)');
    // 사이트 지도의 링크는 접지 않아도 보인다
    await expect(footer.locator('nav[aria-label="사이트 지도"]').getByRole('link', { name: '출처와 라이선스', exact: true })).toBeVisible();
    const dev = footer.locator('[data-footer-dev]');
    await expect(dev).not.toHaveAttribute('open', '');
    await expect(dev.locator('.site-footer__exclusion')).toBeHidden();
    await dev.locator('summary').click();
    await expect(dev.locator('.site-footer__exclusion')).toBeVisible();
    await expect(dev.getByRole('link', { name: '출처와 라이선스', exact: true })).toHaveAttribute('href', withBase('credits/'));
    await expect(dev.getByRole('link', { name: 'GitHub 저장소' })).toBeVisible();
  });
});
