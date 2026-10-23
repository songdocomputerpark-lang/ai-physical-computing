// 주소 끝 군더더기 떼기(판 1.7.1 — DECISIONS C224). 메신저·채팅이 한국어 문장 속 주소를 "…/ai-physical-computing/)가"처럼 괄호·조사까지
// 링크로 잡아 404가 났다(2026-10-23). 404 쪽은 cleanPagePath로 뗀 주소의 쪽이 있으면 "혹시 이 쪽을 찾으셨나요?"를 보인다.
// 이 규칙은 "쪽 주소는 영문 소문자·숫자·'-'·'/'만"을 믿으므로, 아래 둘째 묶음이 쪽 주소가 되는 이름들을 함께 지킨다.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { cleanPagePath, pageTitleFromHtml } from '../../src/lib/address-cleanup.ts';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const BASE = '/ai-physical-computing';

describe('cleanPagePath — 주소 끝의 괄호·조사·마침표를 뗀다', () => {
  it('2026-10-23의 주소: 홈 뒤에 ")가"(%-글자로 온 것도)', () => {
    expect(cleanPagePath(`${BASE}/)가`)).toBe(`${BASE}/`);
    expect(cleanPagePath(`${BASE}/)%EA%B0%80`)).toBe(`${BASE}/`);
  });

  it('쪽 주소 뒤에 바로 붙은 조사·문장 끝', () => {
    expect(cleanPagePath(`${BASE}/learn/u1/1-1-1/에서`)).toBe(`${BASE}/learn/u1/1-1-1/`);
    expect(cleanPagePath(`${BASE}/learn/u1/1-1-1가`)).toBe(`${BASE}/learn/u1/1-1-1/`);
    expect(cleanPagePath(`${BASE}/book/2-1-2/입니다.`)).toBe(`${BASE}/book/2-1-2/`);
    expect(cleanPagePath(`${BASE}/start/board/).`)).toBe(`${BASE}/start/board/`);
    expect(cleanPagePath(`${BASE}/labs/esp32/kit/d-3-11/」`)).toBe(`${BASE}/labs/esp32/kit/d-3-11/`);
  });

  it('하이픈 뒤에 조사가 붙으면 그 하이픈도 뗀다', () => {
    expect(cleanPagePath(`${BASE}/learn/u1/1-1-1-를`)).toBe(`${BASE}/learn/u1/1-1-1/`);
  });

  it('영문 대문자는 소문자로, 겹친 / 는 하나로', () => {
    expect(cleanPagePath(`${BASE}/Labs/Vision/`)).toBe(`${BASE}/labs/vision/`);
    expect(cleanPagePath(`${BASE}//teacher//`)).toBe(`${BASE}/teacher/`);
  });

  it('뗄 것이 없으면 null(그냥 없는 쪽 — 안내하지 않는다)', () => {
    expect(cleanPagePath(`${BASE}/no-such-page/`)).toBeNull();
    expect(cleanPagePath(`${BASE}/a11y-no-such-page/`)).toBeNull();
    expect(cleanPagePath('/')).toBeNull();
  });

  it('잘린 %-글자도 깨지지 않는다', () => {
    expect(cleanPagePath(`${BASE}/learn/%E`)).toBe(`${BASE}/learn/`);
  });

  it('오프라인판(사이트 뿌리 base)에서도 같다', () => {
    expect(cleanPagePath('/learn/u2/2-1-2/)')).toBe('/learn/u2/2-1-2/');
  });
});

describe('pageTitleFromHtml — 링크 글로 쓸 쪽 제목', () => {
  it('사이트 이름 꼬리를 뗀다', () => {
    expect(pageTitleFromHtml('<title>1-1-1 인공지능 응용 프로그램과 에이전트 | AI 피지컬 컴퓨팅 오픈랩</title>', 'AI 피지컬 컴퓨팅 오픈랩')).toBe(
      '1-1-1 인공지능 응용 프로그램과 에이전트',
    );
  });

  it('홈처럼 꼬리가 없으면 그대로, 제목이 없으면 null', () => {
    expect(pageTitleFromHtml('<title>AI 피지컬 컴퓨팅 오픈랩</title>', 'AI 피지컬 컴퓨팅 오픈랩')).toBe('AI 피지컬 컴퓨팅 오픈랩');
    expect(pageTitleFromHtml('<p>제목 없음</p>', 'AI 피지컬 컴퓨팅 오픈랩')).toBeNull();
  });

  it('HTML 글자 표시를 푼다', () => {
    expect(pageTitleFromHtml('<title>A &amp; B | 사이트</title>', '사이트')).toBe('A & B');
  });
});

describe('쪽 주소가 되는 이름은 영문 소문자·숫자·하이픈만(cleanPagePath가 믿는 것)', () => {
  const SAFE = /^[a-z0-9-]+$/u;

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, out);
      } else {
        out.push(full);
      }
    }
    return out;
  }

  it('src/pages의 폴더·쪽 파일 이름(동적 [id]·밑줄 시작 도우미·404는 뺌)', () => {
    const pagesRoot = path.join(ROOT, 'src', 'pages');
    const names = new Set<string>();
    for (const file of walk(pagesRoot)) {
      const relative = path.relative(pagesRoot, file).split(path.sep);
      for (const [index, part] of relative.entries()) {
        const isFile = index === relative.length - 1;
        const name = isFile ? part.replace(/\.(astro|md|ts)$/u, '') : part;
        if (name.startsWith('[') || name.startsWith('_') || name === 'index' || name === '404' || (isFile && !/\.astro$|\.md$/u.test(part))) {
          continue;
        }
        names.add(name);
      }
    }
    const bad = [...names].filter((name) => !SAFE.test(name));
    expect(bad, `쪽 주소에 쓰이는 이름: ${bad.join(', ')}`).toEqual([]);
    expect(names.size).toBeGreaterThan(20);
  });

  it('교과서 쪽(content/book)·따라 하기 차시(content/lessons)·키트 장치(devices.yaml) id', () => {
    const book = fs
      .readdirSync(path.join(ROOT, 'content', 'book'))
      .filter((name) => name.endsWith('.md'))
      .map((name) => name.replace(/\.md$/u, ''));
    const lessonsRoot = path.join(ROOT, 'content', 'lessons');
    const lessons = walk(lessonsRoot)
      .filter((file) => file.endsWith('.md'))
      .flatMap((file) => path.relative(lessonsRoot, file).replace(/\.md$/u, '').split(path.sep));
    const kit = (parse(fs.readFileSync(path.join(ROOT, 'content', 'kit', 'devices.yaml'), 'utf8')) as { devices: { id: string }[] }).devices.map(
      (device) => device.id,
    );
    const bad = [...book, ...lessons, ...kit].filter((name) => !SAFE.test(name));
    expect(bad).toEqual([]);
    expect(book.length).toBeGreaterThan(30);
    expect(kit.length).toBe(101);
  });
});
