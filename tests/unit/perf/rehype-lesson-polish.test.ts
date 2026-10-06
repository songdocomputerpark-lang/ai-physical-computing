// 마크다운 출력 다듬기(src/lib/rehype-lesson-polish.mjs — Phase 6 구역 A, PROGRESS 미해결 174·190)의 단위 테스트.
//  - 190 그림 크기: 파일 머리에서 가로·세로를 읽고(WebP·PNG·JPEG·GIF·SVG), 마크다운 그림에 width·height를 붙인다.
//    저장소의 실제 마크다운 그림은 모두 그림 목록(*.images.yaml)에 도구가 적은 숫자와 같아야 한다.
//  - 174 차시 번호: 글 속 "2-1-3"·"2-1-R"을 <span class="nowrap">으로 감싸되, 코드 블록·인라인 코드·링크 주소·제목 id는 그대로다.
//    저장소의 차시 45편을 플러그인 있이·없이 그려 **nowrap 조각과 그림 크기 속성만 다르고 나머지 글자는 한 글자도 같은지** 본다.
//  - 판 4 닫는 따옴표(판 1.2.0 — DECISIONS C96): smartypants가 문장부호·기호 뒤에 잘못 넣은 여는 따옴표만 닫는 따옴표로 바꾼다.
//    45편 비교는 따옴표 방향(“→” ‘→’) 말고는 한 글자도 바뀌지 않았는지까지 본다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { markdownConfigDefaults, unified } from '@astrojs/markdown-remark';
import { parseDocument } from 'yaml';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rehypePlugins, remarkPlugins } from '../../../src/lib/markdown-plugins.mjs';
import rehypeLessonPolish, {
  LESSON_NUMBER_PATTERN,
  NOWRAP_CLASS,
  REHYPE_LESSON_POLISH_VERSION,
  fixClosingQuotesInText,
  gifSize,
  imageSizeOf,
  jpegSize,
  narrowFigureFingerprint,
  pngSize,
  publicDirFor,
  publicFileForSrc,
  readImageFileSize,
  splitLessonNumbers,
  svgSize,
  webpSize,
} from '../../../src/lib/rehype-lesson-polish.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const LESSONS = path.join(ROOT, 'content', 'lessons');

type Renderer = { render(markdown: string, options?: { fileURL?: URL }): Promise<{ code: string }> };

/** 빌드와 같은 목록(markdown-plugins.mjs)으로 만든 처리기와, 이 플러그인만 뺀 처리기 */
let withPolish: Renderer;
let withoutPolish: Renderer;

beforeAll(async () => {
  withPolish = await unified({ remarkPlugins, rehypePlugins }).createRenderer({ ...markdownConfigDefaults });
  withoutPolish = await unified({ remarkPlugins, rehypePlugins: [] }).createRenderer({ ...markdownConfigDefaults });
}, 60_000);

function splitFrontmatter(text: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/u.exec(text);
  return match ? (match[1] ?? '') : text;
}

/** 마크다운을 content/lessons 아래 파일처럼 그린다(그림은 저장소 public/에서 찾는다) */
async function render(renderer: Renderer, markdown: string, file = path.join(LESSONS, 'u1', 'test.md')): Promise<string> {
  const result = await renderer.render(markdown, { fileURL: new URL(`file:///${file.replace(/\\/gu, '/')}`) });
  return result.code;
}

/** 이 플러그인이 더하는 nowrap 조각을 걷어 낸다 */
function stripNowrap(html: string): string {
  return html.replace(new RegExp(`<span class="${NOWRAP_CLASS}">([^<]*)</span>`, 'gu'), '$1');
}

/** 그림 크기 속성을 걷어 낸다(양쪽에 똑같이 — 글쓴이가 적은 크기도 함께 걷히므로 비교는 공평하다) */
function stripImageSize(html: string): string {
  return html.replace(/(<img\b[^>]*?) width="\d+" height="\d+"/gu, '$1');
}

/**
 * 닫는 따옴표 바로잡기(판 4)가 바꾼 자리를 되돌려 플러그인 없는 출력과 견줄 수 있게 한다. 두 글은 길이가 같고, 다른 글자는 모두
 * 여는 따옴표 → 닫는 따옴표(“→” ‘→’)여야 한다(아니면 그 자리를 알리며 실패). 되돌린 글과 바꾼 수를 돌려준다.
 */
function undoQuoteFixes(polished: string, plain: string, label: string): { html: string; fixed: number } {
  const a = [...polished];
  const b = [...plain];
  expect(a.length, `${label}: 따옴표 말고 글자 수가 달라요`).toBe(b.length);
  let fixed = 0;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] === b[index]) {
      continue;
    }
    const pair = `${b[index]}${a[index]}`;
    // 여는 → 닫는(판 4), 닫는 → 여는(판 5 — 여는 자리의 닫는 따옴표)
    expect(['“”', '‘’', '”“', '’‘'], `${label}: ${index}번째 글자 ${pair} — 따옴표 방향 말고 다른 것이 바뀜`).toContain(pair);
    a[index] = b[index] ?? '';
    fixed += 1;
  }
  return { html: a.join(''), fixed };
}

/** 크기 속성이 있는 그림 수 */
function sizedImages(html: string): number {
  return (html.match(/<img\b[^>]* width="\d+" height="\d+"/gu) ?? []).length;
}

/**
 * 좁은 화면용 그림 감싸기(판 1.1.0 — 미해결 209, 구역 D의 플러그인 판 3: <img> 앞에 <picture><source …>, 뒤에 </picture>)를 걷는다.
 * <img>는 한 글자도 바뀌지 않아야 하므로 감싼 조각만 걷으면 플러그인 없는 출력과 같다. 양쪽에 똑같이 걷는다(글쓴이가 직접 적은 <picture>는
 * 플러그인이 건드리지 않아 양쪽에 같게 있다 — 2026-09-28 차시 md에는 없음). 좁은 그림이 없던 판(2)에서는 아무것도 걷히지 않는다.
 */
function stripNarrowPicture(html: string): string {
  return html.replace(/<picture><source\b[^>]*>/gu, '').replace(/<\/picture>/gu, '');
}

// ── 그림 머리 바이트 만들기(합성) ──
function bytes(...parts: (number[] | string)[]): Uint8Array {
  const out: number[] = [];
  for (const part of parts) {
    if (typeof part === 'string') {
      out.push(...Array.from(part, (char) => char.charCodeAt(0)));
    } else {
      out.push(...part);
    }
  }
  return Uint8Array.from(out);
}
const le16 = (value: number) => [value & 0xff, (value >> 8) & 0xff];
const le24 = (value: number) => [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff];
const be16 = (value: number) => [(value >> 8) & 0xff, value & 0xff];
const be32 = (value: number) => [(value >>> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];

describe('그림 머리에서 크기 읽기(미해결 190)', () => {
  it('WebP 세 가지(VP8 손실·VP8L 무손실·VP8X 확장)', () => {
    const vp8 = bytes('RIFF', [0, 0, 0, 0], 'WEBP', 'VP8 ', [0, 0, 0, 0], [0, 0, 0], [0x9d, 0x01, 0x2a], le16(640), le16(318), [0, 0]);
    expect(webpSize(vp8)).toEqual({ width: 640, height: 318 });
    // VP8L: 14비트 (가로-1)=414, (세로-1)=323 → 415×324
    const w = 414;
    const h = 323;
    const packed = [w & 0xff, ((w >> 8) & 0x3f) | ((h & 0x03) << 6), (h >> 2) & 0xff, (h >> 10) & 0x0f];
    const vp8l = bytes('RIFF', [0, 0, 0, 0], 'WEBP', 'VP8L', [0, 0, 0, 0], [0x2f], packed, [0, 0, 0, 0, 0]);
    expect(webpSize(vp8l)).toEqual({ width: 415, height: 324 });
    const vp8x = bytes('RIFF', [0, 0, 0, 0], 'WEBP', 'VP8X', [10, 0, 0, 0], [0, 0, 0, 0], le24(1919), le24(1079), [0, 0]);
    expect(webpSize(vp8x)).toEqual({ width: 1920, height: 1080 });
    expect(webpSize(bytes('RIFF', [0, 0, 0, 0], 'WAVE', 'fmt ', new Array(20).fill(0)))).toBeNull();
  });

  it('PNG·GIF·JPEG·SVG', () => {
    const png = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], be32(13), 'IHDR', be32(800), be32(600), [8, 6, 0, 0, 0]);
    expect(pngSize(png)).toEqual({ width: 800, height: 600 });
    expect(gifSize(bytes('GIF89a', le16(32), le16(16), [0, 0, 0]))).toEqual({ width: 32, height: 16 });
    // JPEG: SOI → APP0(길이 16) → DQT(길이 4) → SOF2(점진) 높이 480·가로 640
    const jpeg = bytes([0xff, 0xd8], [0xff, 0xe0], be16(16), 'JFIF', new Array(10).fill(0), [0xff, 0xdb], be16(4), [0, 0], [0xff, 0xc2], be16(17), [8], be16(480), be16(640), [3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
    expect(jpegSize(jpeg)).toEqual({ width: 640, height: 480 });
    // DHT(C4)는 프레임이 아니다
    const huffmanFirst = bytes([0xff, 0xd8], [0xff, 0xc4], be16(6), [0, 0, 0, 0], [0xff, 0xc0], be16(11), [8], be16(10), be16(20), [1, 1, 0x11, 0]);
    expect(jpegSize(huffmanFirst)).toEqual({ width: 20, height: 10 });
    expect(svgSize('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="318" viewBox="0 0 640 318">')).toEqual({ width: 640, height: 318 });
    expect(svgSize("<?xml version='1.0'?><svg viewBox='0 0 1280 720.4' xmlns='http://www.w3.org/2000/svg'>")).toEqual({ width: 1280, height: 720 });
    expect(svgSize('<svg width="320px" viewBox="0 0 640 318">')).toEqual({ width: 320, height: 159 });
    expect(svgSize('<svg width="100%" height="100%">')).toBeNull();
    expect(imageSizeOf(png, '.png')).toEqual({ width: 800, height: 600 });
    expect(imageSizeOf(png, '.avif')).toBeNull();
  });

  it('저장소 그림 파일: 1-1-1 원고 그림 세 장은 그림 목록에 적힌 크기와 같다', () => {
    expect(readImageFileSize(path.join(PUBLIC, 'images', 'lessons', '1-1-1', 'recognition.webp'))).toEqual({ width: 415, height: 415 });
    expect(readImageFileSize(path.join(PUBLIC, 'images', 'lessons', '1-1-1', 'learning.webp'))).toEqual({ width: 420, height: 324 });
    expect(readImageFileSize(path.join(PUBLIC, 'images', 'lessons', '1-1-1', 'reasoning.webp'))).toEqual({ width: 420, height: 416 });
    expect(readImageFileSize(path.join(PUBLIC, 'images', 'lessons', '1-1-1', 'agent-cycle.svg'))).toEqual({ width: 640, height: 448 });
    expect(readImageFileSize(path.join(PUBLIC, 'images', 'lessons', '1-1-1', 'no-such-file.webp'))).toBeNull();
  });

  it('그림 주소 → public 파일(사이트 밖·상대 주소·폴더 밖은 null, base가 붙어 있으면 떼고 찾는다)', () => {
    expect(publicFileForSrc('/images/lessons/1-1-1/recognition.webp', PUBLIC)).toBe(path.join(PUBLIC, 'images', 'lessons', '1-1-1', 'recognition.webp'));
    expect(publicFileForSrc('/ai-physical-computing/images/a.webp?v=1#x', PUBLIC)).toBe(path.join(PUBLIC, 'images', 'a.webp'));
    expect(publicFileForSrc('https://example.com/a.webp', PUBLIC)).toBeNull();
    expect(publicFileForSrc('//example.com/a.webp', PUBLIC)).toBeNull();
    expect(publicFileForSrc('images/a.webp', PUBLIC)).toBeNull();
    expect(publicFileForSrc('/../package.json', PUBLIC)).toBeNull();
    expect(publicDirFor(path.join(ROOT, 'content', 'lessons', 'u1', '1-1-1.md'))).toBe(PUBLIC);
    expect(publicDirFor(undefined, ROOT)).toBe(PUBLIC);
  });

  it('저장소의 마크다운 그림은 모두 크기를 얻고, 그림 목록(*.images.yaml)의 width·height와 같다', () => {
    const lessonFiles = fs.readdirSync(LESSONS, { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.md'));
    const recorded = new Map<string, { width: number; height: number }>();
    for (const file of fs.readdirSync(LESSONS, { recursive: true, encoding: 'utf8' }).filter((name) => name.endsWith('.images.yaml'))) {
      const data = parseDocument(fs.readFileSync(path.join(LESSONS, file), 'utf8')).toJS() as { images?: { file?: string; width?: number; height?: number }[] } | null;
      for (const image of data?.images ?? []) {
        if (image.file && image.width && image.height) {
          recorded.set(image.file.replace(/^public/u, ''), { width: image.width, height: image.height });
        }
      }
    }
    const seen: string[] = [];
    for (const file of lessonFiles) {
      const text = fs.readFileSync(path.join(LESSONS, file), 'utf8');
      for (const match of text.matchAll(/!\[[^\]]*\]\((\/images\/[^)\s]+)\)/gu)) {
        const src = match[1] ?? '';
        const size = readImageFileSize(publicFileForSrc(src, PUBLIC) ?? '');
        expect(size, `${file}: ${src}`).not.toBeNull();
        const manifest = recorded.get(src);
        if (manifest) {
          expect(size, `${file}: ${src} — 그림 목록과 다름`).toEqual(manifest);
        }
        seen.push(src);
      }
    }
    // 2026-09-26 기준 마크다운 그림 9장(1-1-1 셋·1-1-2·1-2-1·1-2-3 둘·3-1-2 둘) — 줄면 이 테스트가 무엇을 지키는지 다시 본다
    expect(seen.length).toBeGreaterThanOrEqual(9);
  });
});

describe('마크다운 그림에 width·height(미해결 190)', () => {
  it('사이트 뿌리 주소 그림에 파일에서 읽은 크기를 붙인다', async () => {
    const html = await render(withPolish, '![스마트폰에 대고 말하는 학생 그림](/images/lessons/1-1-1/recognition.webp)\n');
    expect(html).toBe('<p><img src="/images/lessons/1-1-1/recognition.webp" alt="스마트폰에 대고 말하는 학생 그림" width="415" height="415"></p>');
    // 표 칸 속 그림도(1-1-1 핵심 개념 표)
    const table = await render(withPolish, '| 능력 | 예 |\n|---|---|\n| 학습 | ![강아지와 고양이 그림](/images/lessons/1-1-1/learning.webp) 설명 |\n');
    expect(table).toContain('<img src="/images/lessons/1-1-1/learning.webp" alt="강아지와 고양이 그림" width="420" height="324">');
  });

  it('없는 파일·바깥 주소·상대 주소·이미 크기를 적은 그림은 그대로 둔다', async () => {
    const missing = await render(withPolish, '![없는 그림](/images/lessons/1-1-1/nothing-here.webp)\n');
    expect(missing).toBe('<p><img src="/images/lessons/1-1-1/nothing-here.webp" alt="없는 그림"></p>');
    const remote = await render(withPolish, '![바깥 그림](https://example.com/a.webp)\n');
    expect(remote).not.toMatch(/width=/u);
    const raw = await render(withPolish, '<img src="/images/lessons/1-1-1/agent-cycle.svg" alt="그림" width="320" height="224">\n');
    expect(raw).toContain('width="320" height="224"');
    expect(raw).not.toContain('width="640"');
  });

  it('public 폴더를 찾지 못하는 곳(임시 폴더의 차시 — check:lessons 테스트)에서도 오류 없이 그대로 둔다', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'apc-polish-'));
    try {
      const html = await render(withPolish, '![그림](/images/lessons/1-1-1/recognition.webp)\n', path.join(temp, 'content', 'lessons', 'u1', 'x.md'));
      expect(html).toBe('<p><img src="/images/lessons/1-1-1/recognition.webp" alt="그림"></p>');
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });

  it('publicDir 설정으로 다른 폴더를 볼 수 있다(테스트용)', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'apc-polish-'));
    try {
      fs.mkdirSync(path.join(temp, 'images'), { recursive: true });
      fs.writeFileSync(path.join(temp, 'images', 'x.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 30"></svg>');
      const renderer = (await unified({ remarkPlugins, rehypePlugins: [[rehypeLessonPolish, { publicDir: temp }]] }).createRenderer({ ...markdownConfigDefaults })) as Renderer;
      expect(await render(renderer, '![가로로 긴 그림](/images/x.svg)\n')).toContain('width="90" height="30"');
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });
});

describe('차시 번호 줄바꿈 막기(미해결 174)', () => {
  it('글 속 차시 번호만 고른다(조사는 붙어도 되고, 날짜·전화번호·긴 숫자는 아니다)', () => {
    const found = (text: string) => [...text.matchAll(LESSON_NUMBER_PATTERN)].map((match) => match[0]);
    expect(found('2-1-3에서 배운 것과 2-1-R, 1-1-1~1-1-3')).toEqual(['2-1-3', '2-1-R', '1-1-1', '1-1-3']);
    expect(found('4-2-2(블루투스) · 2-1-2·2-1-3')).toEqual(['4-2-2', '2-1-2', '2-1-3']);
    // 전화번호 모양은 저장소 검사가 막으므로 자리표시자(전부 0)로 적는다
    expect(found('2026-09-26 010-0000-0000 10-2-3 1-2-3a x1-2-3 1-2-Rx 1-2 [12인피04-02]')).toEqual([]);
    expect(splitLessonNumbers('차시 번호가 없어요')).toBeNull();
    const parts = splitLessonNumbers('앞 2-1-3 뒤');
    expect(parts).toEqual([
      { type: 'text', value: '앞 ' },
      { type: 'element', tagName: 'span', properties: { className: [NOWRAP_CLASS] }, children: [{ type: 'text', value: '2-1-3' }] },
      { type: 'text', value: ' 뒤' },
    ]);
  });

  it('문단·표 칸·링크 글자는 감싸고, 링크 주소는 그대로 둔다', async () => {
    const html = await render(withPolish, '2-1-3에서 배운 것과 2-1-R을 떠올려요.\n\n| 차시 | 내용 |\n|---|---|\n| 2-1-2 | [다음 차시 2-1-3](/learn/u2/2-1-3/) |\n');
    expect(html).toContain('<p><span class="nowrap">2-1-3</span>에서 배운 것과 <span class="nowrap">2-1-R</span>을 떠올려요.</p>');
    expect(html).toContain('<td><span class="nowrap">2-1-2</span></td>');
    expect(html).toContain('<a href="/learn/u2/2-1-3/">다음 차시 <span class="nowrap">2-1-3</span></a>');
  });

  it('인라인 코드·코드 블록 안은 건드리지 않는다(코드 색 입힌 출력도 플러그인 없는 것과 같다)', async () => {
    const markdown = '`2-1-3` 과 코드\n\n```python\n# 2-1-3 예제\nprint("1-1-1")\n```\n';
    const html = await render(withPolish, markdown);
    expect(html).toContain('<code>2-1-3</code>');
    expect(html).not.toMatch(/<pre[\s\S]*nowrap[\s\S]*<\/pre>/u);
    expect(html).toBe(await render(withoutPolish, markdown));
  });

  it('제목 id는 플러그인이 없을 때와 같다(글자는 그대로라 id도 그대로)', async () => {
    const markdown = '## 2-1-3 복습과 2-1-R 읽기\n\n### 1-1-1 다시 보기\n';
    const html = await render(withPolish, markdown);
    const ids = (text: string) => [...text.matchAll(/<h\d id="([^"]*)"/gu)].map((match) => match[1]);
    const without = await render(withoutPolish, markdown);
    expect(ids(html)).toEqual(ids(without));
    expect(ids(html)).toEqual(['2-1-3-복습과-2-1-r-읽기', '1-1-1-다시-보기']);
    expect(html).toContain('<h2 id="2-1-3-복습과-2-1-r-읽기"><span class="nowrap">2-1-3</span> 복습과 <span class="nowrap">2-1-R</span> 읽기</h2>');
  });

  it('이미 감싼 조각은 두 번 감싸지 않는다(같은 나무에 두 번 돌려도 한 겹)', () => {
    const tree = {
      type: 'root' as const,
      children: [{ type: 'element' as const, tagName: 'p', properties: {}, children: [{ type: 'text' as const, value: '2-1-3 차시' }] }],
    };
    const transform = rehypeLessonPolish({ publicDir: PUBLIC });
    transform(tree as never, { path: undefined, cwd: ROOT } as never);
    transform(tree as never, { path: undefined, cwd: ROOT } as never);
    expect(tree.children[0]?.children).toEqual([
      { type: 'element', tagName: 'span', properties: { className: [NOWRAP_CLASS] }, children: [{ type: 'text', value: '2-1-3' }] },
      { type: 'text', value: ' 차시' },
    ]);
  });
});

describe('저장소의 차시 45편(플러그인이 더하는 것 말고는 한 글자도 바뀌지 않는다)', () => {
  const files = fs
    .readdirSync(LESSONS, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.md'))
    .map((file) => file.split(path.sep).join('/'))
    .sort();

  it('차시 파일이 45편 이상 있다', () => {
    expect(files.length).toBeGreaterThanOrEqual(45);
  });

  let totals = { nowrap: 0, sized: 0, quotes: 0 };
  afterAll(() => {
    // 기록용(테스트 출력에 남는다) — 2026-09-26 기준 값은 보고서 zone-a-perf.md, 닫는 따옴표는 2026-10-06 75곳(27편)
    console.log(
      `[다듬기] 차시 ${files.length}편: 차시 번호 감싼 곳 ${totals.nowrap}곳, 크기를 붙인 마크다운 그림 ${totals.sized}장, 바로잡은 닫는 따옴표 ${totals.quotes}곳`,
    );
  });

  it(
    '플러그인 있이·없이 그린 HTML이 nowrap 조각과 그림 크기 속성을 빼면 같고, 코드 블록·링크 주소·제목 id가 그대로다',
    async () => {
      totals = { nowrap: 0, sized: 0, quotes: 0 };
      for (const file of files) {
        const full = path.join(LESSONS, ...file.split('/'));
        const body = splitFrontmatter(fs.readFileSync(full, 'utf8'));
        const polished = await render(withPolish, body, full);
        const plain = await render(withoutPolish, body, full);
        // nowrap 조각·좁은 화면용 그림 감싸기를 걷고 닫는 따옴표를 되돌리면, 그림 크기 속성 말고는 플러그인 없는 출력과 한 글자도 같다
        const expected = stripImageSize(stripNarrowPicture(plain));
        const quotes = undoQuoteFixes(stripImageSize(stripNarrowPicture(stripNowrap(polished))), expected, file);
        expect(quotes.html, file).toBe(expected);
        totals.quotes += quotes.fixed;
        // 글쓴이가 적은 크기(<img … width= height=>)는 그대로 두고, 크기 없는 마크다운 그림에만 더했다
        expect(sizedImages(polished), `${file}: 크기 있는 그림 수`).toBeGreaterThanOrEqual(sizedImages(plain));
        // 코드 블록(<pre>) 안에는 nowrap이 없다
        for (const block of polished.match(/<pre[\s\S]*?<\/pre>/gu) ?? []) {
          expect(block, `${file}: 코드 블록`).not.toContain(NOWRAP_CLASS);
        }
        // 링크 주소·그림 주소·제목 id 목록이 같다
        const attrs = (html: string) => [...html.matchAll(/\s(?:href|src|id)="([^"]*)"/gu)].map((match) => match[1]);
        expect(attrs(polished), `${file}: 주소·id`).toEqual(attrs(plain));
        totals.nowrap += (polished.match(new RegExp(`class="${NOWRAP_CLASS}"`, 'gu')) ?? []).length;
        totals.sized += sizedImages(polished) - sizedImages(plain);
        // 크기 없는 그림이 남지 않았다(사이트 뿌리 주소 그림 — 바깥 주소 그림은 차시 틀 검사가 막는다)
        expect(polished.match(/<img\b(?![^>]*\swidth=)[^>]*\ssrc="\/[^/][^"]*"[^>]*>/gu) ?? [], `${file}: 크기 없는 그림`).toEqual([]);
      }
      expect(totals.nowrap).toBeGreaterThan(0);
      expect(totals.sized).toBeGreaterThanOrEqual(9);
      expect(totals.quotes).toBeGreaterThan(0);
    },
    180_000,
  );
});

describe('닫는 따옴표 바로잡기(판 4 — 판 1.2.0, DECISIONS C96)', () => {
  /** 한 문단 마크다운을 그려 <p> 껍데기를 벗긴다 */
  const quoted = async (markdown: string) => (await render(withPolish, markdown)).replace(/^<p>/u, '').replace(/<\/p>\n?$/u, '');

  it('문장부호·기호·숫자 뒤에 조사가 붙은 닫는 따옴표를 바로잡는다(2026-10-06 차시에서 찾은 모양)', async () => {
    expect(await quoted("동작을 '재생 입력(합성 좌표)'으로 골라요.")).toBe('동작을 ‘재생 입력(합성 좌표)’으로 골라요.');
    expect(await quoted('속도를 "정회전 30%"처럼 적어요.')).toBe('속도를 “정회전 30%”처럼 적어요.');
    expect(await quoted('90°가 "약 89°"로 보여요.')).toBe('90°가 “약 89°”로 보여요.');
    expect(await quoted('"데이터가 들어오는 곳(Data In)"이라는 뜻이에요.')).toBe('“데이터가 들어오는 곳(Data In)”이라는 뜻이에요.');
    // 따옴표 둘이 겹친 곳: 바로잡은 글자(’)로 이어 보므로 바깥 따옴표도 닫는 쪽이다
    expect(await quoted("\"'정지' 또는 '종료'\"를 말해요.")).toBe('“‘정지’ 또는 ‘종료’”를 말해요.');
  });

  it('바른 따옴표는 그대로다(글자 뒤 닫는 것, 빈칸·괄호·줄표 뒤 여는 것, 블록 맨 앞)', async () => {
    expect(await quoted("\"손 찾기\"와 '윙크'로 해요.")).toBe('“손 찾기”와 ‘윙크’로 해요.');
    expect(await quoted('("정지")를 눌러요 — "다시"도 있어요.')).toBe('(“정지”)를 눌러요 — “다시”도 있어요.');
    expect(await quoted('"처음" 칸')).toBe('“처음” 칸');
  });

  it('굵게·링크 경계를 넘어 앞 글자를 보고, 인라인 코드는 낱말로 본다(코드 글자는 바꾸지 않음)', async () => {
    expect(await quoted('"**굵게(볼드)**"로 써요.')).toBe('“<strong>굵게(볼드)</strong>”로 써요.');
    // 굵게가 되지 못하고 글자로 남은 별표(차시 틀 검사 md-bold가 오류로 알리는 모양) 뒤의 여는 따옴표는 그대로 둔다
    expect(await quoted('**"굵게(볼드)"**로 써요.')).toBe('**“굵게(볼드)”**로 써요.');
    expect(await quoted('[링크 "실습실(L)"](/labs/)로 가요.')).toBe('<a href="/labs/">링크 “실습실(L)”</a>로 가요.');
    expect(await quoted('`print("a")` 뒤 "따옴표(1)"를 봐요.')).toBe('<code>print("a")</code> 뒤 “따옴표(1)”를 봐요.');
  });

  it('코드 블록 안은 건드리지 않는다', async () => {
    const markdown = '```python\nprint("(1)"+"x")\n```\n';
    expect(await render(withPolish, markdown)).toBe(await render(withoutPolish, markdown));
  });

  it('글 하나 단위 함수: 블록 맨 앞(prev null)은 여는 자리, 바꾼 수를 센다', () => {
    const state: { prev: string | null; fixed: number } = { prev: null, fixed: 0 };
    expect(fixClosingQuotesInText('“a(1)“로 ‘b’ “c%“', state)).toBe('“a(1)”로 ‘b’ “c%”');
    expect(state.fixed).toBe(2);
    expect(state.prev).toBe('”');
  });

  // 판 5(판 1.2.1 — 판 1.2.0 적대적 검토 C6): smartypants가 기호 앞 따옴표를 닫는 쪽으로 정한 반대 방향
  it('여는 자리(블록 맨 앞·빈칸·여는 괄호 뒤)의 닫는 따옴표는 뒤가 빈칸이 아니면 여는 따옴표로 바꾼다(2-2-2 "▣ 정지"·"⏹ 정지")', async () => {
    expect(await quoted('"▣ 정지"는 파일에서 "⏹ 정지"예요.')).toBe('“▣ 정지”는 파일에서 “⏹ 정지”예요.');
    expect(await quoted('실행 화면의 "▣ 정지"와 같아요.')).toBe('실행 화면의 “▣ 정지”와 같아요.');
    expect(await quoted("('▶ 실행')을 눌러요.")).toBe('(‘▶ 실행’)을 눌러요.');
  });

  it('반대 방향은 뒤 글자가 빈칸이거나 글 조각 끝이면 바꾸지 않고, 글자 뒤 닫는 따옴표는 그대로다', () => {
    const state: { prev: string | null; fixed: number } = { prev: null, fixed: 0 };
    // 빈칸 뒤·뒤가 빈칸인 닫는 따옴표, 조각 끝의 닫는 따옴표는 그대로(근거가 없으면 바꾸지 않는 쪽)
    expect(fixClosingQuotesInText('말했어요 ” 그리고 ”', state)).toBe('말했어요 ” 그리고 ”');
    expect(state.fixed).toBe(0);
    // 맨 앞의 닫는 따옴표 + 기호는 여는 따옴표로, 짝의 닫는 따옴표(글자 뒤)는 그대로
    const fresh: { prev: string | null; fixed: number } = { prev: null, fixed: 0 };
    expect(fixClosingQuotesInText('”▣ 정지”는 ’⏹’', fresh)).toBe('“▣ 정지”는 ‘⏹’');
    expect(fresh.fixed).toBe(2);
  });
});

describe('판 번호(콘텐츠 캐시 비우기)', () => {
  it('동작이 바뀐 판(5 이상 — 닫는 따옴표 반대 방향)이 목록에 등록돼 있다', () => {
    expect(REHYPE_LESSON_POLISH_VERSION).toBeGreaterThanOrEqual(5);
    const entry = rehypePlugins.find((plugin) => Array.isArray(plugin) && plugin[0] === rehypeLessonPolish) as [unknown, { version: number }] | undefined;
    expect(entry?.[1]).toEqual({ version: REHYPE_LESSON_POLISH_VERSION, narrow: narrowFigureFingerprint() });
  });
});
