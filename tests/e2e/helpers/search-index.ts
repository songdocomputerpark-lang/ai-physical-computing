// 검색 색인(Pagefind)이 없는 개발 서버에서도 찾기 화면을 시험할 수 있게 하는 도우미(판 1.3.0 구역 B).
//
// 미리 보기(빌드한 사이트)에는 dist/pagefind/가 있어서 아무것도 하지 않는다. 개발 서버(PW_BASE_URL)에는 색인이 없어 pagefind.js 요청이
// 404가 되므로, 저장소 안 dist/pagefind/(이전 빌드의 색인)가 있으면 그것을 대신 내려 준다. 둘 다 없으면 시험을 건너뛴다 — 찾기 시험은 색인이 있어야 뜻이 있다.
import fs from 'node:fs';
import path from 'node:path';
import { test, type Page } from '@playwright/test';
import { searchConfig } from '../../../src/config/search.ts';

const DIST_INDEX = path.resolve(import.meta.dirname, '..', '..', '..', 'dist', 'pagefind');

const MIME: Record<string, string> = { '.js': 'text/javascript', '.json': 'application/json' };

/** 색인 주소를 쓸 수 있게 한다. 색인이 어디에도 없으면 이 시험을 건너뛴다. */
export async function ensureSearchIndex(page: Page): Promise<void> {
  const probe = await page.request.get(`${searchConfig.bundlePath}pagefind.js`);
  if (probe.ok()) {
    return;
  }
  test.skip(!fs.existsSync(path.join(DIST_INDEX, 'pagefind.js')), '검색 색인이 없어요(npm run build 뒤 미리 보기에서 확인해요)');
  await page.route(`**${searchConfig.bundlePath}**`, async (route) => {
    const url = new URL(route.request().url());
    const relative = decodeURIComponent(url.pathname.slice(url.pathname.indexOf(searchConfig.bundlePath) + searchConfig.bundlePath.length));
    const file = path.join(DIST_INDEX, relative);
    if (!file.startsWith(DIST_INDEX) || !fs.existsSync(file)) {
      await route.fulfill({ status: 404, body: '' });
      return;
    }
    const ext = path.extname(file);
    await route.fulfill({
      status: 200,
      body: fs.readFileSync(file),
      contentType: ext === '.pagefind' ? 'application/wasm' : (MIME[ext] ?? 'application/octet-stream'),
    });
  });
}
