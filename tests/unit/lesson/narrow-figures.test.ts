// 좁은 화면용 그림(PROGRESS 미해결 209 — 판 1.1.0 구역 D)의 단위 테스트.
//  - 사이트가 그린 SVG(x.svg) 옆에 x.narrow.svg가 있으면 마크다운 출력 다듬기(src/lib/rehype-lesson-polish.mjs 3번)가 차시 HTML의
//    <img>를 <picture><source media="(max-width: 30em)" srcset="…x.narrow.svg" width height><img …></picture>로 감싼다.
//  - 저장소의 차시 45편: 좁은 그림이 없는 차시는 출력이 **한 글자도** 바뀌지 않고, 있는 차시도 <picture>·<source>를 걷어 내면 같다.
//  - 저장소의 좁은 그림 파일 규칙: 원래 그림 옆·차시에서 쓰는 그림·폭 360 안팎·글자 13px 이상(휴대폰 375 폭에서 약 12.4px)·
//    원래 그림과 같은 제목·같은 낱말(한쪽에만 있는 낱말이 없다 — 본문과 같은 낱말을 지키려고).
// 휴대폰에서 실제로 보이는 글자 크기는 브라우저 테스트 tests/e2e/lesson-figures.spec.ts가 잰다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { markdownConfigDefaults, unified } from '@astrojs/markdown-remark';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { remarkPlugins } from '../../../src/lib/markdown-plugins.mjs';
import rehypeLessonPolish, {
  NARROW_FIGURE_MEDIA,
  NARROW_FIGURE_SUFFIX,
  REHYPE_LESSON_POLISH_VERSION,
  narrowFigureFingerprint,
  narrowFigureFor,
  narrowFigureSitePath,
  pictureHtml,
  svgSize,
  wrapNarrowFigures,
} from '../../../src/lib/rehype-lesson-polish.mjs';
import { stripBase, withBase } from '../../../src/lib/url.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const LESSON_IMAGES = path.join(PUBLIC, 'images', 'lessons');
const LESSONS = path.join(ROOT, 'content', 'lessons');

type Renderer = { render(markdown: string, options?: { fileURL?: URL }): Promise<{ code: string }> };

async function renderer(options: Record<string, unknown>): Promise<Renderer> {
  return (await unified({ remarkPlugins, rehypePlugins: [[rehypeLessonPolish, { version: REHYPE_LESSON_POLISH_VERSION, ...options }]] }).createRenderer({
    ...markdownConfigDefaults,
  })) as Renderer;
}

async function render(target: Renderer, markdown: string, file = path.join(LESSONS, 'u1', 'test.md')): Promise<string> {
  return (await target.render(markdown, { fileURL: new URL(`file:///${file.replace(/\\/gu, '/')}`) })).code;
}

function splitFrontmatter(text: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/u.exec(text);
  return match ? (match[1] ?? '') : text;
}

/** 이 기능이 더하는 <picture><source …> … </picture>를 걷어 낸다(안의 <img>는 그대로) */
function stripNarrowPictures(html: string): string {
  return html.replace(/<picture><source\b[^>]*>(<img\b(?:[^>"']|"[^"]*"|'[^']*')*>)<\/picture>/gu, '$1');
}

// ── SVG 글자 읽기(이 테스트 전용 — 저장소 그림은 <text>·<tspan>에 글자를 직접 적는다) ──
function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/giu, (_whole, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/gu, (_whole, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, '&');
}

/** <text> 요소마다 안의 글자(tspan 포함, 태그를 걷고 이어 붙임) */
function svgTexts(svg: string): string[] {
  return [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gu)].map((match) => decodeEntities((match[1] ?? '').replace(/<[^>]*>/gu, '')).trim()).filter(Boolean);
}

function svgTitle(svg: string): string {
  return decodeEntities(/<title\b[^>]*>([\s\S]*?)<\/title>/u.exec(svg)?.[1] ?? '').trim();
}

/** 낱말(빈칸으로 나눔)마다 — 줄을 나누며 낱말 사이에서 끊는 것은 괜찮다 */
function words(texts: string[]): string[] {
  return texts.flatMap((text) => text.split(/\s+/u)).filter(Boolean);
}

function joined(texts: string[]): string {
  return texts.join('').replace(/\s+/gu, '');
}

/** 저장소의 좁은 그림 파일(public/images/lessons 기준 상대 경로, / 구분) */
function narrowFiles(): string[] {
  return fs
    .readdirSync(LESSON_IMAGES, { recursive: true, encoding: 'utf8' })
    .map((name) => name.split(path.sep).join('/'))
    .filter((name) => name.endsWith(NARROW_FIGURE_SUFFIX))
    .sort();
}

/** 차시 md가 <img src>로 쓰는 사이트 SVG 주소(/images/…svg)와 그 차시 */
function lessonSvgUses(): Map<string, string[]> {
  const uses = new Map<string, string[]>();
  for (const file of fs.readdirSync(LESSONS, { recursive: true, encoding: 'utf8' }).filter((name) => name.endsWith('.md'))) {
    const text = fs.readFileSync(path.join(LESSONS, file), 'utf8');
    for (const match of text.matchAll(/<img\b[^>]*\ssrc="(\/images\/[^"]+\.svg)"/gu)) {
      const src = match[1] ?? '';
      uses.set(src, [...(uses.get(src) ?? []), file.split(path.sep).join('/')]);
    }
  }
  return uses;
}

describe('좁은 그림 주소 만들기', () => {
  it('원래 그림 x.svg → x.narrow.svg(사이트 안 경로, base·?·#는 뗀다), SVG가 아니거나 이미 좁은 그림·바깥 주소면 null', () => {
    expect(narrowFigureSitePath('/images/lessons/1-1-1/agent-cycle.svg')).toBe('/images/lessons/1-1-1/agent-cycle.narrow.svg');
    expect(narrowFigureSitePath('/ai-physical-computing/images/lessons/1-1-1/agent-cycle.svg?v=2#a')).toBe('/images/lessons/1-1-1/agent-cycle.narrow.svg');
    expect(narrowFigureSitePath('/images/lessons/1-1-1/recognition.webp')).toBeNull();
    expect(narrowFigureSitePath('/images/lessons/1-1-1/agent-cycle.narrow.svg')).toBeNull();
    expect(narrowFigureSitePath('https://example.com/a.svg')).toBeNull();
    expect(narrowFigureSitePath('//example.com/a.svg')).toBeNull();
    expect(narrowFigureSitePath('images/a.svg')).toBeNull();
  });

  it('화면 조건은 뷰포트 30em(기본 글자 16px일 때 480px) 이하', () => {
    expect(NARROW_FIGURE_MEDIA).toBe('(max-width: 30em)');
  });
});

describe('마크다운 안 HTML의 <img>를 <picture>로 감싸기(임시 public 폴더)', () => {
  let temp = '';
  const wide = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 320" width="640" height="320"></svg>';
  const narrow = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 540" width="360" height="540"></svg>';

  beforeAll(() => {
    temp = fs.mkdtempSync(path.join(os.tmpdir(), 'apc-narrow-'));
    fs.mkdirSync(path.join(temp, 'images', 'lessons', 'x'), { recursive: true });
    fs.writeFileSync(path.join(temp, 'images', 'lessons', 'x', 'flow.svg'), wide);
    fs.writeFileSync(path.join(temp, 'images', 'lessons', 'x', 'flow.narrow.svg'), narrow);
    fs.writeFileSync(path.join(temp, 'images', 'lessons', 'x', 'alone.svg'), wide);
  });

  afterAll(() => {
    fs.rmSync(temp, { recursive: true, force: true });
  });

  it('좁은 그림이 옆에 있으면 <source>의 주소(이번 빌드 base)·가로·세로를 좁은 그림 파일에서 읽는다', () => {
    expect(narrowFigureFor('/images/lessons/x/flow.svg', temp)).toEqual({ srcset: withBase('images/lessons/x/flow.narrow.svg'), width: 360, height: 540 });
    expect(narrowFigureFor('/images/lessons/x/alone.svg', temp)).toBeNull();
    expect(narrowFigureFor('/images/lessons/x/nothing.svg', temp)).toBeNull();
  });

  it('<img> 글자는 한 글자도 바꾸지 않고 앞뒤에만 덧붙인다(따옴표 안의 >도 태그 끝이 아니다)', () => {
    const image = '<img src="/images/lessons/x/flow.svg" alt="입력 > 처리 > 출력 흐름을 보여 주는 그림" width="640" height="320">';
    const html = ['<figure>', image, '<figcaption>설명</figcaption>', '</figure>'].join('\n');
    const wrapped = wrapNarrowFigures(html, temp);
    const source = `<source media="(max-width: 30em)" srcset="${withBase('images/lessons/x/flow.narrow.svg')}" width="360" height="540">`;
    expect(wrapped).toBe(['<figure>', `<picture>${source}${image}</picture>`, '<figcaption>설명</figcaption>', '</figure>'].join('\n'));
    expect(stripNarrowPictures(wrapped ?? '')).toBe(html);
    expect(pictureHtml(image, { srcset: '/a&b.svg', width: 1, height: 2 })).toContain('srcset="/a&amp;b.svg"');
  });

  it('좁은 그림이 없는 그림·원고 그림·이미 <picture>를 쓴 조각은 그대로 둔다(null = 바뀐 것 없음)', () => {
    expect(wrapNarrowFigures('<figure>\n<img src="/images/lessons/x/alone.svg" alt="혼자 있는 그림이에요">\n</figure>', temp)).toBeNull();
    expect(wrapNarrowFigures('<img src="/images/lessons/x/photo.webp" alt="원고에서 꺼낸 사진이에요">', temp)).toBeNull();
    expect(wrapNarrowFigures('<picture><source srcset="/a.svg"><img src="/images/lessons/x/flow.svg" alt="글쓴이가 직접 고른 그림"></picture>', temp)).toBeNull();
    expect(wrapNarrowFigures('<p>그림이 없는 조각</p>', temp)).toBeNull();
    // 따옴표 없는 속성도 읽는다
    expect(wrapNarrowFigures('<img src=/images/lessons/x/flow.svg alt=흐름>', temp)).toContain('<picture><source ');
  });

  it('마크다운으로 그리면 <figure> 안에 <picture>가 남고, 마크다운 그림(![]())과 narrowFigures: false는 감싸지 않는다', async () => {
    const markdown = [
      '<figure>',
      '<img src="/images/lessons/x/flow.svg" alt="입력에서 출력까지 흐름을 보여 주는 그림" width="640" height="320">',
      '<figcaption>그림을 읽는 법이에요.</figcaption>',
      '</figure>',
      '',
      '![마크다운으로 넣은 흐름 그림](/images/lessons/x/flow.svg)',
      '',
    ].join('\n');
    const on = await render(await renderer({ publicDir: temp }), markdown);
    const off = await render(await renderer({ publicDir: temp, narrowFigures: false }), markdown);
    expect(on).toContain(
      `<figure>\n<picture><source media="(max-width: 30em)" srcset="${withBase('images/lessons/x/flow.narrow.svg')}" width="360" height="540"><img src="/images/lessons/x/flow.svg" alt="입력에서 출력까지 흐름을 보여 주는 그림" width="640" height="320"></picture>\n<figcaption>`,
    );
    expect((on.match(/<picture>/gu) ?? []).length).toBe(1);
    expect(off).not.toContain('<picture>');
    expect(stripNarrowPictures(on)).toBe(off);
  });

  it('지문은 좁은 그림을 더하거나 크기를 바꾸면 달라진다(설정 JSON에 넣어 콘텐츠 캐시를 비우는 용도)', () => {
    const before = narrowFigureFingerprint(temp);
    expect(before).toMatch(/^1-[0-9a-f]{12}$/u);
    expect(narrowFigureFingerprint(temp)).toBe(before);
    fs.writeFileSync(path.join(temp, 'images', 'lessons', 'x', 'alone.narrow.svg'), narrow);
    const added = narrowFigureFingerprint(temp);
    expect(added).toMatch(/^2-/u);
    // 크기를 바꾼 그림은 바이트 수도 달라지게 쓴다 — readImageFileSize는 "경로|바이트 수|수정 시각"으로 기억해 두는데, Windows에서는
    // 같은 길이로 곧바로 다시 쓰면 수정 시각이 같게 남아 옛 크기를 돌려줄 수 있다(통합 전체 실행에서 한 번 흔들림 — 2026-09-29).
    fs.writeFileSync(path.join(temp, 'images', 'lessons', 'x', 'alone.narrow.svg'), narrow.replaceAll('540', '1080'));
    expect(narrowFigureFingerprint(temp)).not.toBe(added);
    fs.rmSync(path.join(temp, 'images', 'lessons', 'x', 'alone.narrow.svg'));
    expect(narrowFigureFingerprint(temp)).toBe(before);
    expect(narrowFigureFingerprint(path.join(temp, 'no-such-folder'))).toMatch(/^0-/u);
  });
});

describe('저장소의 좁은 화면용 그림 파일', () => {
  const files = narrowFiles();
  const uses = lessonSvgUses();

  it('좁은 그림이 한 장 이상 있다(미해결 209 — I단원·II단원 앞 차시부터)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s — 원래 그림 옆에 있고, 차시가 <figure>의 <img>로 쓰는 그림이다', (file) => {
    const wideFile = file.slice(0, -NARROW_FIGURE_SUFFIX.length) + '.svg';
    expect(fs.existsSync(path.join(LESSON_IMAGES, ...wideFile.split('/'))), `${wideFile}이 없어요`).toBe(true);
    expect(uses.get(`/images/lessons/${wideFile}`) ?? [], `${wideFile}을 쓰는 차시`).not.toEqual([]);
  });

  it.each(files)('%s — 폭 360 안팎(300~400), 글자 13px 이상, 제목·설명·글꼴이 있고 사진·바깥 주소가 없다', (file) => {
    const svg = fs.readFileSync(path.join(LESSON_IMAGES, ...file.split('/')), 'utf8');
    const size = svgSize(svg);
    expect(size, '뿌리 <svg>의 width·height').not.toBeNull();
    const viewBox = /<svg\b[^>]*\sviewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/u.exec(svg);
    expect(viewBox, 'viewBox="0 0 폭 높이"').not.toBeNull();
    expect(Number(viewBox?.[1])).toBe(size?.width);
    expect(Number(viewBox?.[2])).toBe(size?.height);
    expect(size?.width ?? 0).toBeGreaterThanOrEqual(300);
    expect(size?.width ?? 0).toBeLessThanOrEqual(400);
    const fontSizes = [...svg.matchAll(/font-size\s*(?:=\s*"|:\s*)(\d+(?:\.\d+)?)/gu)].map((match) => Number(match[1]));
    expect(fontSizes.length, 'font-size를 적은 곳').toBeGreaterThan(0);
    expect(Math.min(...fontSizes), '가장 작은 글자').toBeGreaterThanOrEqual(13);
    // 글자를 줄이는 변환은 쓰지 않는다 — 위의 글자 크기가 곧 그림 속 크기이게. scale은 뒤집기(±1)만, 그림 조각을 줄여 넣는
    // 안쪽 <svg viewBox>에는 글자를 넣지 않는다(글자는 바깥에서 제 크기로 겹쳐 적는다)
    const scales = [...svg.matchAll(/scale\(([^)]*)\)/gu)].flatMap((match) => (match[1] ?? '').split(/[\s,]+/u).filter(Boolean).map(Number));
    expect(scales.filter((value) => Math.abs(value) !== 1), 'scale 값(뒤집기 ±1만)').toEqual([]);
    const inner = svg.replace(/^[\s\S]*?<svg\b[^>]*>/u, '');
    for (const nested of inner.matchAll(/<svg\b[\s\S]*?<\/svg>/gu)) {
      expect(nested[0], '안쪽 <svg> 조각 속 글자').not.toMatch(/<text\b/u);
    }
    expect(svg).toMatch(/<svg\b[^>]*\srole="img"/u);
    expect(svgTitle(svg)).not.toBe('');
    expect(svg).toMatch(/<desc\b/u);
    expect(svg).toContain("font-family=\"'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic'");
    expect(svg).not.toMatch(/<image\b|data:|https?:\/\/(?!www\.w3\.org\/2000\/svg)/u);
  });

  it.each(files)('%s — 원래 그림과 제목이 같고, 그림 속 낱말이 서로 같다(한쪽에만 있는 낱말 없음)', (file) => {
    const svg = fs.readFileSync(path.join(LESSON_IMAGES, ...file.split('/')), 'utf8');
    const wide = fs.readFileSync(path.join(LESSON_IMAGES, ...(file.slice(0, -NARROW_FIGURE_SUFFIX.length) + '.svg').split('/')), 'utf8');
    expect(svgTitle(svg)).toBe(svgTitle(wide));
    const narrowTexts = svgTexts(svg);
    const wideTexts = svgTexts(wide);
    const wideJoined = joined(wideTexts);
    const narrowJoined = joined(narrowTexts);
    expect(words(narrowTexts).filter((word) => !wideJoined.includes(word)), '좁은 그림에만 있는 낱말').toEqual([]);
    expect(words(wideTexts).filter((word) => !narrowJoined.includes(word)), '원래 그림에만 있는 낱말').toEqual([]);
  });
});

describe('저장소의 차시 45편(좁은 그림이 없는 차시는 한 글자도 바뀌지 않는다)', () => {
  const files = fs
    .readdirSync(LESSONS, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.md'))
    .map((file) => file.split(path.sep).join('/'))
    .sort();
  const narrowSet = new Set(narrowFiles().map((file) => `/images/lessons/${file.slice(0, -NARROW_FIGURE_SUFFIX.length)}.svg`));
  let withNarrow: Renderer;
  let withoutNarrow: Renderer;
  const totals = { lessons: 0, changed: 0, pictures: 0 };

  beforeAll(async () => {
    withNarrow = await renderer({});
    withoutNarrow = await renderer({ narrowFigures: false });
  }, 60_000);

  afterAll(() => {
    console.log(`[좁은 그림] 차시 ${totals.lessons}편 가운데 ${totals.changed}편에서 그림 ${totals.pictures}장을 <picture>로 감쌈`);
  });

  it(
    '판 3 출력은 <picture>·<source>를 걷으면 판 2 출력과 같고, 좁은 그림을 쓰는 차시만 바뀐다. <source>의 파일은 모두 있다',
    async () => {
      expect(files.length).toBeGreaterThanOrEqual(45);
      for (const file of files) {
        const full = path.join(LESSONS, ...file.split('/'));
        const markdown = fs.readFileSync(full, 'utf8');
        const body = splitFrontmatter(markdown);
        const on = await render(withNarrow, body, full);
        const off = await render(withoutNarrow, body, full);
        const expected = [...body.matchAll(/<img\b[^>]*\ssrc="(\/images\/[^"]+\.svg)"/gu)].filter((match) => narrowSet.has(match[1] ?? '')).length;
        const pictures = (on.match(/<picture><source /gu) ?? []).length;
        expect(pictures, `${file}: 감싼 그림 수`).toBe(expected);
        if (expected === 0) {
          expect(on, `${file}: 좁은 그림이 없는 차시는 한 글자도 같다`).toBe(off);
        } else {
          expect(stripNarrowPictures(on), `${file}: <picture>를 걷으면 같다`).toBe(off);
          totals.changed += 1;
        }
        for (const match of on.matchAll(/<source media="([^"]*)" srcset="([^"]*)" width="(\d+)" height="(\d+)">/gu)) {
          expect(match[1]).toBe(NARROW_FIGURE_MEDIA);
          const sitePath = stripBase(match[2] ?? '');
          const narrowFile = path.join(PUBLIC, ...sitePath.split('/').filter(Boolean));
          expect(fs.existsSync(narrowFile), `${file}: ${match[2]}`).toBe(true);
          expect(svgSize(fs.readFileSync(narrowFile, 'utf8')), `${file}: ${match[2]} 크기`).toEqual({ width: Number(match[3]), height: Number(match[4]) });
        }
        totals.lessons += 1;
        totals.pictures += pictures;
      }
      expect(totals.pictures).toBe([...lessonSvgUses().entries()].filter(([src]) => narrowSet.has(src)).reduce((sum, [, lessons]) => sum + lessons.length, 0));
    },
    240_000,
  );
});
