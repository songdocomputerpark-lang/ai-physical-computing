// 검색 결과를 항목 단위로 바꾸는 규칙(src/components/search/search-page.ts의 pickAnchoredResult) 단위 테스트.
// 화면에 실제로 그려지는지는 브라우저 테스트(tests/e2e/search.spec.ts)가 확인한다.
import { describe, expect, it } from 'vitest';
import { pickAnchoredResult } from '../../src/components/search/search-page.ts';

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
