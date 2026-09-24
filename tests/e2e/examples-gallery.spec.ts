/**
 * 예제 갤러리 브라우저 테스트(P4-11) — `/examples/`.
 *
 * 무엇을 보나
 *   1. examples/ 폴더의 예제가 **하나도 빠짐없이** 카드가 된다(코드를 고치지 않아도 새 .py가 카드가 되는 규칙의 확인).
 *   2. 태그를 고르면 그 예제만 남고, 고른 것이 주소에 실려 링크로 나눌 수 있다.
 *   3. 낱말로 찾기, 조건에 맞는 예제가 없을 때 안내, [고른 것 모두 지우기].
 *   4. 카드의 [실습실에서 열기]를 누르면 그 예제가 실습실에 올라온다(기존 ?example= 규약).
 *   5. "비교해 보기"로 다른 판 카드로 건너뛴다.
 *
 * **1번이 P4-11 완료 기준("새 .py 하나를 넣으면 코드 수정 없이 카드가 생긴다")의 확인이다.** 테스트가 그 자리에서 임시 .py를 만들지는
 * 않는다 — 카드는 빌드 때 만들어지므로 이미 빌드된 화면에 새 파일이 나타날 리 없고, 여러 테스트가 함께 도는 중에 examples/를 건드리면
 * 다른 검사(예제 스모크)까지 흔들린다. 대신 **지금 저장소에 있는 .py 목록을 읽어 카드 목록과 통째로 견준다**. 새 예제를 더한 사람이
 * 갤러리 코드를 고치지 않아 카드가 빠지면 이 대조에서 바로 걸린다(실제로 임시 파일을 넣어 카드가 생기는 것은 P4-11에서 손으로 확인했다).
 *
 * 돌리는 법(병렬 제작): PW_BASE_URL=http://localhost:4706/ai-physical-computing/ npx playwright test tests/e2e/examples-gallery.spec.ts --project=desktop
 */
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { withBase } from '../../src/lib/url.ts';

/**
 * 갤러리 주소. P4-11 구역은 `/examples/`에 먼저 만들었고, 2026-09-24 Phase 4 통합에서 사이트 지도가 적어 둔 `/labs/gallery/`로
 * 옮겼다(`/examples/`는 지웠다). 주소를 다시 옮기면 이 목록만 고친다 — 목록의 주소를 차례로 열어 `[data-gallery]`가 있는 쪽을 쓰고,
 * 워커마다 한 번만 찾은 뒤 기억한다. **지금 있는 주소를 앞에 둔다**(없는 주소를 먼저 열면 개발 서버가 그 페이지를 처음 컴파일하느라
 * 첫 테스트가 30초 제한에 걸릴 수 있다 — 2026-09-18 실측 12.7초 → 32.5초).
 */
const GALLERY_PATHS = [withBase('labs/gallery/')];
let galleryPath: string | null = null;
const ROOT = path.resolve(import.meta.dirname, '..', '..');

/** examples/ 아래에서 실습실이 여는 예제(.py) — 라이브러리 폴더(esp32/lib/·vision/lib/)는 예제가 아니라 뺀다. */
function exampleFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.py')) {
        const relative = path.relative(path.join(ROOT, 'examples'), full).split(path.sep).join('/');
        if (!relative.includes('/lib/')) {
          found.push(relative);
        }
      }
    }
  };
  for (const dir of ['vision', 'desktop', 'esp32']) {
    const full = path.join(ROOT, 'examples', dir);
    if (fs.existsSync(full)) {
      walk(full);
    }
  }
  return found.sort();
}

/** 갤러리 페이지가 실제로 있는 주소를 찾는다(위 GALLERY_PATHS 설명). */
async function resolveGalleryPath(page: Page): Promise<string> {
  if (galleryPath !== null) {
    return galleryPath;
  }
  for (const candidate of GALLERY_PATHS) {
    const response = await page.goto(candidate);
    if (response?.ok() === true && (await page.locator('[data-gallery]').count()) > 0) {
      galleryPath = candidate;
      return candidate;
    }
  }
  throw new Error(`예제 갤러리 페이지를 찾지 못했어요. 찾아본 주소: ${GALLERY_PATHS.join(' , ')}`);
}

/** 갤러리가 준비될 때까지(화면 논리가 붙을 때까지) 기다린다. */
async function openGallery(page: Page, query = ''): Promise<void> {
  const base = await resolveGalleryPath(page);
  await page.goto(`${base}${query}`);
  await expect(page.locator('[data-gallery]')).toHaveAttribute('data-gallery-ready', 'yes');
}

/**
 * 거르기 칸 하나(<fieldset>의 <legend>가 이름)의 태그 단추.
 * 같은 이름이 여러 칸에 있을 수 있어서(통신 방식 "블루투스(BLE)"와 부품 "블루투스(BLE)") 칸을 먼저 고른다.
 */
function chip(page: Page, group: string, name: RegExp) {
  return page.getByRole('group', { name: group }).getByRole('checkbox', { name });
}

/** 지금 보이는 카드의 파일 경로 */
async function visibleFiles(page: Page): Promise<string[]> {
  return page.$$eval('[data-gallery-card]:not([hidden])', (cards) => cards.map((card) => (card as HTMLElement).dataset.file ?? ''));
}

test.describe('예제 갤러리', () => {
  test('examples/의 예제가 모두 카드로 보인다', async ({ page }) => {
    await openGallery(page);
    await expect(page.locator('h1.page-title')).toHaveText('예제 갤러리');

    const files = exampleFiles();
    expect(files.length).toBeGreaterThan(50);
    const cards = await page.$$eval('[data-gallery-card]', (list) => list.map((card) => (card as HTMLElement).dataset.file ?? ''));
    expect([...cards].sort()).toEqual(files);
    await expect(page.locator('[data-gallery]')).toHaveAttribute('data-gallery-total', String(files.length));
    await expect(page.locator('[data-gallery-count]')).toHaveText(`예제 ${files.length}개가 모두 보여요.`);

    // 카드마다 실습실로 여는 링크가 있고, 실습실 주소 규약(?example=)을 쓴다.
    const hrefs = await page.$$eval('.gallery-card__open', (links) => links.map((link) => link.getAttribute('href') ?? ''));
    expect(hrefs).toHaveLength(files.length);
    expect(hrefs.every((href) => href.includes('?example='))).toBe(true);

    // 두 실습실 예제는 모두 하드웨어 없이 된다(사이트 규칙 — 2026-09-25 Phase 4 검토 반영: 전에는 "하드웨어 없이 되는 예제 37개"로 보였다).
    // 거르는 것이 없는 단추 대신 한 줄 안내를 보이고, 카드마다 같은 딱지를 달지 않는다.
    await expect(page.locator('[data-gallery-all-virtual]')).toBeVisible();
    await expect(page.locator('[data-gallery-virtual]')).toHaveCount(0);
    const virtualValues = await page.$$eval('[data-gallery-card]', (list) => [...new Set(list.map((card) => (card as HTMLElement).dataset.virtual ?? ''))]);
    expect(virtualValues).toEqual(['yes']);
  });

  test('태그를 고르면 그 예제만 남고 주소에 실린다', async ({ page }) => {
    await openGallery(page);
    const unit2 = chip(page, '대단원', /^2단원/u);
    await unit2.check();

    const files = await visibleFiles(page);
    expect(files.length).toBeGreaterThan(5);
    const units = await page.$$eval('[data-gallery-card]:not([hidden])', (cards) =>
      cards.map((card) => (card as HTMLElement).dataset.unit ?? ''),
    );
    expect([...new Set(units)]).toEqual(['2']);
    await expect(page.locator('[data-gallery-count]')).toContainText(`예제 ${files.length}개를 골랐어요`);
    expect(page.url()).toContain('unit=2');
    // 다른 칸의 개수도 지금 조건으로 다시 센다 — 2단원에는 영상처리 예제가 없으니 그 값은 0개로 흐리게 보인다(2026-09-25 Phase 4 검토 반영)
    const visionChip = page.locator('label.gallery-chip').filter({ has: page.locator('input[data-gallery-filter="lab"][value="vision"]') });
    await expect(visionChip.locator('[data-gallery-chip-count]')).toHaveText('0개');
    await expect(visionChip).toHaveAttribute('data-empty', 'yes');
    const esp32Chip = page.locator('label.gallery-chip').filter({ has: page.locator('input[data-gallery-filter="lab"][value="esp32"]') });
    await expect(esp32Chip.locator('[data-gallery-chip-count]')).toHaveText(`${files.length}개`);

    // 칸이 다르면 모두 맞아야 한다: 2단원 + 영상처리 실습실 → 영상처리에는 2단원 예제가 없다.
    await chip(page, '실습실', /^영상처리 실습실/u).check();
    await expect(page.locator('[data-gallery]')).toHaveAttribute('data-gallery-visible', '0');
    await expect(page.locator('[data-gallery-empty]')).toBeVisible();

    // [고른 것 모두 지우기]를 누르면 처음으로 돌아간다.
    await page.getByRole('button', { name: '고른 것 모두 지우기' }).click();
    await expect(page.locator('[data-gallery-empty]')).toBeHidden();
    await expect(unit2).not.toBeChecked();
    expect(page.url()).not.toContain('unit=');
  });

  test('주소로 열면 고른 것이 그대로 되살아난다(링크로 나누기)', async ({ page }) => {
    await openGallery(page, '?comm=ble');
    await expect(chip(page, '통신 방식', /블루투스/u)).toBeChecked();
    const comms = await page.$$eval('[data-gallery-card]:not([hidden])', (cards) =>
      cards.map((card) => (card as HTMLElement).dataset.comm ?? ''),
    );
    expect(comms.length).toBeGreaterThan(5);
    expect(comms.every((value) => value.split(' ').includes('ble'))).toBe(true);
  });

  test('낱말로 찾으면 제목·설명·파일 이름에서 찾는다', async ({ page }) => {
    await openGallery(page);
    const search = page.getByLabel('낱말로 찾기');
    await search.fill('lcd');
    const files = await visibleFiles(page);
    expect(files.length).toBeGreaterThan(3);
    const keywords = await page.$$eval('[data-gallery-card]:not([hidden])', (cards) =>
      cards.map((card) => (card as HTMLElement).dataset.keywords ?? ''),
    );
    expect(keywords.every((text) => text.includes('lcd'))).toBe(true);

    // 찾는 낱말이 없으면 빈 화면 대신 안내가 보인다.
    await search.fill('없는낱말없는낱말');
    await expect(page.locator('[data-gallery]')).toHaveAttribute('data-gallery-visible', '0');
    await expect(page.locator('[data-gallery-empty]')).toBeVisible();
  });

  test('비교해 보기 링크로 다른 판 카드로 건너뛴다', async ({ page }) => {
    await openGallery(page);
    const jump = page.locator('a[data-gallery-jump]').first();
    await expect(jump).toBeVisible();
    const target = (await jump.getAttribute('href')) ?? '';
    expect(target.startsWith('#ex-')).toBe(true);
    await jump.click();
    await expect(page.locator(target)).toBeVisible();
  });
});

test.describe('카드에서 실습실 열기', () => {
  // 실습실 페이지는 무겁다(개발 서버에서는 Vite 변환까지). 여는 것만 보고 파이썬 준비는 기다리지 않는다.
  test.describe.configure({ timeout: 120_000 });

  test('[실습실에서 열기]를 누르면 그 예제가 실습실에 올라온다', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', '같은 화면 논리라 데스크톱에서만 본다(시간 절약).');
    await openGallery(page, '?q=2-1-2-adv-touch-lcd-counter');
    await expect(page.locator('[data-gallery]')).toHaveAttribute('data-gallery-visible', '1');
    const card = page.locator('[data-gallery-card]:not([hidden])').first();
    const file = await card.getAttribute('data-file');
    const cardId = await card.getAttribute('data-card-id');
    expect(file).toBe('esp32/u2/2-1-2-adv-touch-lcd-counter.py');

    await card.locator('.gallery-card__open').click();
    await expect(page).toHaveURL(/\/labs\/esp32\/\?example=/u);
    // 실습실 틀이 ?example=을 읽어 그 예제를 골랐는지(파이썬 준비와 상관없이 바로 정해진다).
    await expect(page.locator('[data-lab]')).toHaveAttribute('data-example', cardId!.replace(/^esp32-/u, ''), { timeout: 90_000 });
    await expect(page.locator('[data-lab]')).not.toHaveAttribute('data-example-missing', /.+/u);
  });
});

test.describe('좁은 화면', () => {
  test('가로로 넘치지 않는다', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile', '좁은 화면에서만 본다.');
    await openGallery(page);
    // 넘치면 화면 오른쪽 끝을 넘는 가장 안쪽 요소를 함께 알린다 — CI(리눅스 글꼴)에서만 넘친 적이 있어(2026-09-24 통합, 10px)
    // 로컬에서 재현하기 어렵다. 실패 메시지만 보고 고칠 곳을 찾게 한다(pages.spec.ts의 horizontalOverflow와 같은 방법).
    const { overflow, offenders } = await page.evaluate(() => {
      const width = document.documentElement.clientWidth;
      const found: string[] = [];
      for (const element of document.querySelectorAll('body *')) {
        const rect = element.getBoundingClientRect();
        const deeper = [...element.children].some((child) => child.getBoundingClientRect().right > width + 0.5);
        if (rect.width > 0 && rect.right > width + 0.5 && !deeper) {
          found.push(`${element.tagName.toLowerCase()}.${element.getAttribute('class') ?? ''}(오른쪽 끝 ${Math.round(rect.right)}px) "${(element.textContent ?? '').trim().slice(0, 40)}"`);
        }
        if (found.length >= 5) {
          break;
        }
      }
      return { overflow: document.documentElement.scrollWidth - width, offenders: found };
    });
    expect(overflow, `넘치는 요소: ${offenders.join(' | ')}`).toBeLessThanOrEqual(0);
  });
});
