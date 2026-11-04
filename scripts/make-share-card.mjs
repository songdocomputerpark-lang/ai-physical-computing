#!/usr/bin/env node
/**
 * 공유 미리 보기 그림(og:image) 만들기 — 판 1.9.4, DECISIONS C246.
 *
 * 카카오톡·SNS에 사이트 링크를 보내면 보이는 그림이다. 왼쪽은 교과서 표지(public/images/book/cover.webp — 출판본 1쪽, 그림 목록
 * content/book/front.images.yaml에서 눈 확인을 마친 그림), 오른쪽은 교과서 이름·출판사·저자·사이트 이름 글자다.
 * 결과: public/images/share/share-card.jpg(1200×630 — 메신저·SNS가 권하는 1.91:1, JPEG, 메타데이터 없음).
 * 글은 src/config/site.ts의 siteConfig.textbook·name과 같아야 한다(tests/unit/share-card.test.ts가 대조).
 *
 * 쓰는 법: node scripts/make-share-card.mjs
 *   Playwright 브라우저가 있어야 한다(npx playwright install chromium — 빌드·CI에서는 돌지 않는다).
 *   다시 만들면 그림의 sha256이 바뀌므로, 그림을 열어 본 뒤 scripts/image-allowlist.yaml의 share-card.jpg 기록(sha256·날짜)을 고친다(MAINTENANCE 18절).
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/images/share/share-card.jpg');
const COVER = path.join(ROOT, 'public/images/book/cover.webp');
const FONT_DIR = path.join(ROOT, 'node_modules/pretendard/dist/public/static');

/** 그림 안 글자(src/config/site.ts siteConfig와 같은 값 — 시험이 대조) */
export const SHARE_CARD_TEXT = Object.freeze({
  badge: '고등학교 교과서',
  titleLines: ['인공지능과', '피지컬 컴퓨팅'],
  publisher: '금성출판사',
  authors: ['김석전', '박상진', '김승현', '김영준', '육동건'],
  lead: '교과서를 웹에서 읽고, 설치 없이 브라우저로 실습해요',
  site: 'AI 피지컬 컴퓨팅 오픈랩',
});

export const SHARE_CARD_SIZE = Object.freeze({ width: 1200, height: 630 });

const HOST = 'https://share-card.invalid';

/**
 * JPEG에서 APP0(JFIF) 말고 다른 APPn 조각(APP1 EXIF·XMP, APP2 ICC 색 프로필 등)과 주석(COM)을 떼어 낸다 — 다시 인코딩하지 않는 무손실 작업.
 * Chromium 스크린숏 JPEG에는 ICC 조각(APP2)이 들어 있는데, 저장소 검사는 그림 속 메타데이터(EXIF·XMP·ICC·글 조각)를 막는다.
 */
export function stripJpegMetadata(input) {
  const buf = Buffer.from(input);
  if (buf[0] !== 0xff || buf[1] !== 0xd8) {
    throw new Error('JPEG가 아니에요(첫 두 바이트가 FFD8이 아님).');
  }
  const parts = [buf.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) {
      throw new Error(`JPEG 조각 머리를 읽지 못했어요(${i}바이트째).`);
    }
    const marker = buf[i + 1];
    if (marker === 0xda) {
      parts.push(buf.subarray(i));
      return Buffer.concat(parts);
    }
    const length = buf.readUInt16BE(i + 2);
    const isApp = marker >= 0xe1 && marker <= 0xef;
    const isComment = marker === 0xfe;
    if (!isApp && !isComment) {
      parts.push(buf.subarray(i, i + 2 + length));
    }
    i += 2 + length;
  }
  throw new Error('JPEG 그림 자료(SOS)를 찾지 못했어요.');
}

function html() {
  const t = SHARE_CARD_TEXT;
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<style>
  @font-face { font-family: 'P'; src: url('${HOST}/font/Pretendard-Medium.otf'); font-weight: 500; }
  @font-face { font-family: 'P'; src: url('${HOST}/font/Pretendard-Bold.otf'); font-weight: 700; }
  @font-face { font-family: 'P'; src: url('${HOST}/font/Pretendard-ExtraBold.otf'); font-weight: 800; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${SHARE_CARD_SIZE.width}px; height: ${SHARE_CARD_SIZE.height}px; }
  body { display: flex; font-family: 'P', sans-serif; background: #f4f6fb; color: #1f2a44; }
  .cover { flex: none; width: 482px; height: 630px; background: #fff; box-shadow: 6px 0 24px rgba(31, 42, 68, 0.12); }
  .cover img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center top; }
  .text { flex: 1; display: flex; flex-direction: column; padding: 64px 56px 52px 60px; }
  .badge { align-self: flex-start; padding: 6px 18px; border: 2.5px solid #2e3175; border-radius: 999px; color: #2e3175; font-size: 26px; font-weight: 700; }
  h1 { margin-top: 26px; color: #2e3175; font-size: 80px; font-weight: 800; line-height: 1.12; letter-spacing: -0.02em; }
  .who { margin-top: 26px; font-size: 27px; font-weight: 700; }
  .authors { margin-top: 8px; color: #4a5470; font-size: 23px; font-weight: 500; }
  .lead { margin-top: auto; font-size: 25px; font-weight: 500; color: #3a4460; }
  .site { margin-top: 14px; padding-top: 16px; border-top: 2px solid #d5dbe8; font-size: 26px; font-weight: 800; color: #1d4ed8; }
</style></head>
<body>
  <div class="cover"><img src="${HOST}/cover.webp" alt=""></div>
  <div class="text">
    <p class="badge">${t.badge}</p>
    <h1>${t.titleLines.join('<br>')}</h1>
    <p class="who">${t.publisher}</p>
    <p class="authors">${t.authors.join(' · ')}</p>
    <p class="lead">${t.lead}</p>
    <p class="site">${t.site}</p>
  </div>
</body></html>`;
}

async function main() {
  // 시험(tests/unit/share-card.test.ts)이 글만 읽을 때 브라우저 도구를 불러오지 않게 여기서 부른다
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: SHARE_CARD_SIZE, deviceScaleFactor: 1 });
    await page.route(`${HOST}/**`, async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/') {
        return route.fulfill({ body: html(), contentType: 'text/html; charset=utf-8' });
      }
      if (url.pathname === '/cover.webp') {
        return route.fulfill({ body: await readFile(COVER), contentType: 'image/webp' });
      }
      if (url.pathname.startsWith('/font/')) {
        const name = path.basename(url.pathname);
        return route.fulfill({ body: await readFile(path.join(FONT_DIR, name)), contentType: 'font/otf' });
      }
      return route.abort();
    });
    await page.goto(`${HOST}/`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const shot = await page.screenshot({ type: 'jpeg', quality: 86, clip: { x: 0, y: 0, ...SHARE_CARD_SIZE } });
    const jpeg = stripJpegMetadata(shot);
    await writeFile(OUT, jpeg);
    const sha = createHash('sha256').update(jpeg).digest('hex');
    console.log(`[공유 그림] ${path.relative(ROOT, OUT)} ${jpeg.length}바이트 sha256 ${sha}`);
    console.log('그림을 열어 본 뒤 scripts/image-allowlist.yaml의 share-card.jpg 기록(sha256·날짜)을 고쳐요.');
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
