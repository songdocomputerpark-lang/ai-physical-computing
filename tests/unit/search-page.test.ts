// 검색 결과를 항목 단위로 바꾸는 규칙(src/components/search/search-page.ts의 pickAnchoredResult) 단위 테스트.
// 화면에 실제로 그려지는지는 브라우저 테스트(tests/e2e/search.spec.ts)가 확인한다.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { glossaryGroupOf } from '../../src/components/glossary/glossary.ts';
import { isGlossaryGroupAnchor, pickAnchoredResult } from '../../src/components/search/search-page.ts';

const rootDir = path.resolve(import.meta.dirname, '..', '..');

const glossary = {
  url: '/ai-physical-computing/glossary/',
  excerpt: '페이지 요약 <mark>픽셀</mark>',
  meta: { title: '용어사전' },
  sub_results: [
    { title: '용어사전', url: '/ai-physical-computing/glossary/', excerpt: '제목 앞 글 <mark>픽셀</mark>' },
    { title: '프레임 Frame', url: '/ai-physical-computing/glossary/#frame', excerpt: '사진 한 장… <mark>픽셀</mark>' },
    { title: '픽셀 Pixel', url: '/ai-physical-computing/glossary/#pixel', excerpt: '<mark>픽셀</mark>은 가장 작은 네모 칸' },
  ],
};

describe('검색 결과의 항목 고르기(pickAnchoredResult)', () => {
  it('제목이 검색어로 시작하는 항목을 골라 "항목 — 페이지" 제목과 #위치 주소를 만든다', () => {
    expect(pickAnchoredResult(glossary, '픽셀')).toEqual({
      title: '픽셀 Pixel — 용어사전',
      url: '/ai-physical-computing/glossary/#pixel',
      excerpt: '<mark>픽셀</mark>은 가장 작은 네모 칸',
    });
  });

  it('검색어로 시작하는 항목이 없으면 검색어가 든 항목, 그것도 없으면 첫 항목을 고른다', () => {
    expect(pickAnchoredResult(glossary, 'frame').url).toBe('/ai-physical-computing/glossary/#frame');
    expect(pickAnchoredResult(glossary, '네모').url).toBe('/ai-physical-computing/glossary/#frame');
  });

  it('#위치가 있는 항목이 없으면 페이지 결과를 그대로 쓴다', () => {
    const page = { url: '/ai-physical-computing/help/', excerpt: '요약', meta: { title: '문제 해결' } };
    expect(pickAnchoredResult(page, '카메라')).toEqual({ title: '문제 해결', url: '/ai-physical-computing/help/', excerpt: '요약' });
    expect(pickAnchoredResult({ ...page, sub_results: [glossary.sub_results[0]] }, '카메라').url).toBe('/ai-physical-computing/help/');
  });
});

// 2026-10-02 최종 전수 점검 3바퀴 ST3-02: 용어사전의 가나다·ABC 색인 묶음 머리(h2#index-…)가 id 있는 제목이라 Pagefind의 항목 결과(sub_result)로
// 나와, `uasyncio` → "U — 용어사전"(#index-u, 요약 "U."), `숫자` → "숫자·기호"(#index-etc)로 이어졌다. 머리 글자는 색인에서 뺐고
// (src/pages/glossary/index.astro data-pagefind-ignore — 빌드한 사이트에서만 보이므로 tests/e2e/search.spec.ts가 본다), 고르는 규칙도 머리를 뺀다.
describe('용어사전 색인 묶음 머리는 항목 결과로 고르지 않는다(isGlossaryGroupAnchor)', () => {
  const page = { title: '용어사전', url: '/ai-physical-computing/glossary/', excerpt: '제목 앞 글' };

  it('결과가 묶음 머리 하나뿐이면(예: uasyncio → "U") 페이지 결과(용어사전)를 쓴다', () => {
    const result = {
      url: '/ai-physical-computing/glossary/',
      excerpt: '<mark>U</mark>.',
      meta: { title: '용어사전' },
      sub_results: [page, { title: 'U', url: '/ai-physical-computing/glossary/#index-u', excerpt: '<mark>U</mark>.' }],
    };
    expect(pickAnchoredResult(result, 'uasyncio')).toEqual({ title: '용어사전', url: '/ai-physical-computing/glossary/', excerpt: '<mark>U</mark>.' });
  });

  it('묶음 머리 "숫자·기호"가 검색어로 시작해도 고르지 않고, 다른 항목을 고른다', () => {
    const result = {
      url: '/ai-physical-computing/glossary/',
      excerpt: '요약',
      meta: { title: '용어사전' },
      sub_results: [
        page,
        { title: '숫자·기호', url: '/ai-physical-computing/glossary/#index-etc', excerpt: '<mark>숫자</mark>·기호' },
        { title: 'ADC Analog-to-Digital Converter', url: '/ai-physical-computing/glossary/#adc', excerpt: '전압을 <mark>숫자</mark>로 바꿔요' },
        { title: '디지털 Digital', url: '/ai-physical-computing/glossary/#digital', excerpt: '0과 1 같은 <mark>숫자</mark>' },
      ],
    };
    expect(pickAnchoredResult(result, '숫자').url).toBe('/ai-physical-computing/glossary/#adc');
    // 제목에 검색어가 든 항목이 있으면 그 항목(기존 차례 그대로)
    expect(pickAnchoredResult(result, '디지털').url).toBe('/ai-physical-computing/glossary/#digital');
  });

  it('오류 사전 IndexError 항목(#index-error)은 묶음 머리가 아니라 항목이라 그대로 고른다', () => {
    const errors = {
      url: '/ai-physical-computing/help/errors/',
      excerpt: '요약',
      meta: { title: '오류 사전' },
      sub_results: [
        { title: '오류 사전', url: '/ai-physical-computing/help/errors/', excerpt: '제목 앞 글' },
        { title: '목록에 없는 번호(인덱스)를 꺼내려 했어요', url: '/ai-physical-computing/help/errors/#index-error', excerpt: '<mark>IndexError</mark>' },
      ],
    };
    expect(pickAnchoredResult(errors, 'IndexError').url).toBe('/ai-physical-computing/help/errors/#index-error');
    expect(pickAnchoredResult(errors, '인덱스').url).toBe('/ai-physical-computing/help/errors/#index-error');
    expect(isGlossaryGroupAnchor('/ai-physical-computing/help/errors/#index-error')).toBe(false);
  });

  it('glossaryGroupOf가 만드는 모든 묶음 id(한글 14·영문 26·숫자·기호)를 머리로 알아보고, 다른 base(오프라인판 /)에서도 같다', () => {
    const firstLetters = [
      ...'가까나다따라마바빠사싸아자짜차카타파하',
      ...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ',
      ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
      ...'0123456789#@(',
    ];
    const anchors = new Set(firstLetters.map((letter) => glossaryGroupOf(`${letter}낱말`).anchor));
    expect(anchors.size).toBe(14 + 26 + 1);
    for (const anchor of anchors) {
      expect(isGlossaryGroupAnchor(`/ai-physical-computing/glossary/#${anchor}`), anchor).toBe(true);
      expect(isGlossaryGroupAnchor(`/glossary/#${anchor}`), `오프라인판 ${anchor}`).toBe(true);
    }
    expect(isGlossaryGroupAnchor('/ai-physical-computing/glossary/')).toBe(false);
    expect(isGlossaryGroupAnchor('/ai-physical-computing/glossary/#pixel')).toBe(false);
  });

  it('용어 파일 이름(= 항목 id)은 "index-"로 시작하지 않는다 — 시작하면 그 항목이 결과에서 빠진다', () => {
    const files = fs.readdirSync(path.join(rootDir, 'content', 'glossary')).filter((name) => name.endsWith('.md'));
    expect(files.length).toBeGreaterThan(50);
    expect(files.filter((name) => name.startsWith('index-'))).toEqual([]);
    for (const name of files) {
      expect(isGlossaryGroupAnchor(`/ai-physical-computing/glossary/#${name.replace(/\.md$/u, '')}`), name).toBe(false);
    }
  });
});
