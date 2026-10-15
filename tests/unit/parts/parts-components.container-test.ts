// 부품 사전 컴포넌트(src/components/parts/*.astro)와 키트 표 사진 칸을 Astro Container API로 실제로 그려 본다(판 1.4.0, DECISIONS C136).
// .astro를 불러야 해서 기본 단위 테스트에는 넣지 않았다 — 실행: npx vitest run --config tests/unit/firmware/vitest.container.config.mjs
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import PartCard from '../../../src/components/parts/PartCard.astro';
import PartPhotoStrip from '../../../src/components/parts/PartPhotoStrip.astro';
import { allParts, partPhotoSize, partsForSiteParts } from '../../../src/components/parts/parts-data.ts';
import KitPartsTable from '../../../src/components/start/board/KitPartsTable.astro';
import { KIT_PARTS } from '../../../src/components/start/board/kit-parts.ts';
import PartsPage from '../../../src/pages/start/parts/index.astro';

function count(html: string, pattern: RegExp): number {
  return [...html.matchAll(pattern)].length;
}

describe('부품 사전 컴포넌트(Container API)', () => {
  it('PartCard: id·사진(alt·크기·lazy)·이름·영어 이름(lang)·연결 방식·교과서 키트 표시·가상 보드 링크·안내', async () => {
    const container = await AstroContainer.create();
    const lcd = allParts.find((part) => part.id === 'dis-001-i2c-1602-lcd')!;
    const html = await container.renderToString(PartCard, { props: { part: lcd, labHref: '/ai-physical-computing/labs/esp32/' } });
    const size = partPhotoSize(lcd);
    expect(html).toContain('id="part-dis-001-i2c-1602-lcd"');
    expect(html).toContain('alt="문자 LCD 16×2(I2C) 사진"');
    expect(html).toContain('src="/ai-physical-computing/images/parts/third-party/kit-vendor/dis-001-i2c-1602-lcd.webp"');
    expect(html).toContain(`width="${size.width}"`);
    expect(html).toContain(`height="${size.height}"`);
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('lang="en"');
    expect(html).toContain('I2C 1602 LCD (16x2)');
    expect(html).toContain('연결 방식');
    expect(html).toContain('교과서 키트 부품');
    expect(html).toContain('href="/ai-physical-computing/labs/esp32/"');
    expect(html).toContain('aria-label="가상 보드에서 해 보기: 문자 LCD 16×2(I2C)"');
  }, 120_000);

  it('PartCard: kit_name·site_part·note가 없는 부품에는 키트 표시·가상 보드 링크·안내가 없다', async () => {
    const container = await AstroContainer.create();
    const plain = allParts.find((part) => part.id === 'd-007-ultrasonic-sensor')!;
    const html = await container.renderToString(PartCard, { props: { part: plain, labHref: '/ai-physical-computing/labs/esp32/' } });
    expect(html).not.toContain('교과서 키트 부품');
    expect(html).not.toContain('가상 보드에서 해 보기');
    expect(html).not.toContain('parts-card__note');
  }, 120_000);

  it('PartPhotoStrip: 부품 id·{ part }·{ type }을 받아 사진 줄을 그리고 각 사진은 부품 사전의 카드로 가며, 사진 없는 부품만이면 아무것도 그리지 않는다', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(PartPhotoStrip, { props: { parts: ['lcd-i2c', { part: 'servo', pin: 25 }, { type: 'touch_digital' }, 'ble'] } });
    expect(count(html, /<li class="[^"]*part-strip__item/gu)).toBe(3);
    expect(html).toContain('href="/ai-physical-computing/start/parts/#part-dis-001-i2c-1602-lcd"');
    expect(html).toContain('href="/ai-physical-computing/start/parts/#part-m-006-mg90s-servo"');
    expect(html).toContain('href="/ai-physical-computing/start/parts/#part-d-022-touch-sensor"');
    expect(html).toContain('role="group"');
    expect(html).toContain('부품 사진: 고릴라셀(브릭셀) 제공');
    // 이름 글자가 옆에 있으므로 사진 alt는 비어 있다
    expect(html).toContain('alt=""');
    const empty = await container.renderToString(PartPhotoStrip, { props: { parts: ['ble'] } });
    expect(empty.trim()).toBe('');
  }, 120_000);

  it('partsForSiteParts: 차시 frontmatter의 parts 항목을 그대로 넘겨도 된다', () => {
    expect(partsForSiteParts([{ part: 'lcd-i2c' }, { type: 'touch_digital' }]).map((part) => part.id)).toEqual(['dis-001-i2c-1602-lcd', 'd-022-touch-sensor']);
  });

  it('KitPartsTable: 줄 수 16은 그대로이고 "사진" 칸이 생겼으며, 사진은 키트 표 줄과 kit_name으로 이어진다', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(KitPartsTable);
    const body = html.slice(html.indexOf('<tbody'), html.indexOf('</tbody>'));
    expect(count(body, /<tr[\s>]/gu)).toBe(KIT_PARTS.length);
    expect(count(html, /<th scope="col"[^>]*>사진<\/th>/gu)).toBe(1);
    const photoCount = allParts.filter((part) => part.kitName !== undefined).length;
    expect(count(body, /<img /gu)).toBe(photoCount);
    expect(count(body, /사진 없음/gu)).toBe(KIT_PARTS.length - photoCount);
    expect(html).toContain('alt="문자 LCD 16×2(I2C) 사진"');
    expect(html).toContain('href="/ai-physical-computing/start/parts/#part-dis-001-i2c-1602-lcd"');
  }, 120_000);

  it('부품 사전 쪽: 제목·출처 줄·분류 칩 9개(#분류 링크)·카드 수·현재 위치·검색 색인 대상', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(PartsPage, { request: new Request('http://localhost/ai-physical-computing/start/parts/') });
    expect(html).toContain('<title>부품 사전 | ');
    expect(count(html, /<h1[\s>]/gu)).toBe(1);
    expect(html).toContain('부품 사진: 고릴라셀(브릭셀) 제공, 허락받아 사용');
    expect(count(html, /class="parts-chips__link"/gu)).toBe(9);
    for (const id of ['analog-sensor', 'digital-sensor', 'display', 'motor', 'i2c', 'comm', 'output', 'board', 'etc']) {
      expect(html).toContain(`href="#cat-${id}"`);
      expect(html).toContain(`id="cat-${id}"`);
    }
    expect(count(html, /<li class="card parts-card"/gu)).toBe(allParts.length);
    expect(html).toContain('aria-label="현재 위치"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('data-pagefind-body');
    // 같은 쪽 링크는 base가 붙지 않고, 사이트 안 링크는 base가 붙는다
    expect(html).toContain('href="/ai-physical-computing/labs/esp32/"');
    expect(html).toContain('href="/ai-physical-computing/start/board/#kit-parts"');
    // Astro가 줄바꿈 공백을 지워 글이 붙지 않았는지(칩: 이름과 개수 사이 공백)
    const analogCount = allParts.filter((part) => part.category === 'analog-sensor').length;
    expect(html).toMatch(new RegExp(`아날로그 센서 <span class="parts-chips__count"[^>]*>${analogCount}개</span>`, 'u'));
  }, 120_000);
});

