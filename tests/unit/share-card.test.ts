// 카카오톡·SNS 링크 미리 보기 그림(판 1.9.4, DECISIONS C246) — scripts/make-share-card.mjs가 만든 public/images/share/share-card.jpg와 src/config/site.ts share.
// 쪽 머리의 og:image·og:title은 브라우저 시험(tests/e2e/home.spec.ts "공유 미리 보기")이 본다.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SHARE_CARD_SIZE, SHARE_CARD_TEXT, stripJpegMetadata } from '../../scripts/make-share-card.mjs';
import { siteConfig } from '../../src/config/site.ts';

const IMAGE = `public/${siteConfig.share.image}`;

/** JPEG 조각 표시 목록과 SOF의 크기 */
function readJpeg(buf: Buffer): { markers: number[]; width: number; height: number } {
  const markers: number[] = [];
  let width = 0;
  let height = 0;
  let i = 2;
  while (i + 4 <= buf.length && buf[i] === 0xff) {
    const marker = buf[i + 1];
    markers.push(marker);
    if (marker === 0xda) {
      break;
    }
    if (marker === 0xc0 || marker === 0xc2) {
      height = buf.readUInt16BE(i + 5);
      width = buf.readUInt16BE(i + 7);
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return { markers, width, height };
}

describe('공유 미리 보기 그림(share-card.jpg)', () => {
  it('그림 속 글자가 사이트 설정의 교과서 이름·출판사·저자·사이트 이름과 같다', () => {
    expect(SHARE_CARD_TEXT.titleLines.join(' ')).toBe(siteConfig.textbook.title);
    expect(SHARE_CARD_TEXT.publisher).toBe(siteConfig.textbook.publisher);
    expect(SHARE_CARD_TEXT.authors).toEqual(siteConfig.textbook.authors);
    expect(SHARE_CARD_TEXT.site).toBe(siteConfig.name);
  });

  it('1200×630 JPEG이고, APP0(JFIF) 말고 다른 메타데이터 조각(EXIF·XMP·ICC·주석)이 없으며 200KB 안이다', () => {
    const buf = readFileSync(IMAGE);
    expect(buf.subarray(0, 2).toString('hex')).toBe('ffd8');
    const jpeg = readJpeg(buf);
    expect({ width: jpeg.width, height: jpeg.height }).toEqual({ width: SHARE_CARD_SIZE.width, height: SHARE_CARD_SIZE.height });
    expect({ width: siteConfig.share.imageWidth, height: siteConfig.share.imageHeight }).toEqual(SHARE_CARD_SIZE);
    expect(jpeg.markers.filter((marker) => (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe)).toEqual([]);
    expect(buf.length).toBeLessThan(200 * 1024);
    expect(siteConfig.share.imageType).toBe('image/jpeg');
  });

  it('홈의 미리 보기 제목·설명에 교과서 이름과 출판사가 들어 있다', () => {
    expect(siteConfig.share.homeTitle).toContain(siteConfig.textbook.title);
    expect(siteConfig.share.homeTitle).toContain(siteConfig.name);
    expect(siteConfig.share.homeDescription).toContain(siteConfig.textbook.publisher);
    expect(siteConfig.share.homeDescription).toContain(siteConfig.textbook.title);
    expect(siteConfig.share.imageAlt).toContain(siteConfig.textbook.title);
  });

  it('메타데이터 떼기는 APP1·APP2·주석만 빼고 나머지 조각은 그대로 둔다', () => {
    const segment = (marker: number, body: number[]) => Buffer.from([0xff, marker, 0, body.length + 2, ...body]);
    const input = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0]),
      segment(0xe1, [1, 2, 3]),
      segment(0xe2, [4, 5]),
      segment(0xfe, [6]),
      segment(0xdb, [7, 8]),
      Buffer.from([0xff, 0xda, 0, 2, 9, 9, 0xff, 0xd9]),
    ]);
    const out = stripJpegMetadata(input);
    expect(readJpeg(out).markers).toEqual([0xe0, 0xdb, 0xda]);
    expect(out.subarray(-4).toString('hex')).toBe('0909ffd9');
    expect(() => stripJpegMetadata(Buffer.from([0x89, 0x50]))).toThrow(/JPEG가 아니에요/u);
  });
});
