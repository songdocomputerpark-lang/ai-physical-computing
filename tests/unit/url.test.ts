import { describe, expect, it } from 'vitest';
import { siteConfig } from '../../src/config/site.ts';
import {
  BASE_PATH,
  absoluteUrl,
  isExternalHref,
  normalizePagePath,
  stripBase,
  withBase,
} from '../../src/lib/url.ts';

describe('사이트 안 주소 도우미(src/lib/url.ts)', () => {
  it('사이트 뿌리 주소는 base 끝에 /를 붙인 값이다', () => {
    expect(BASE_PATH).toBe(`${siteConfig.base}/`);
    expect(BASE_PATH).toBe('/ai-physical-computing/');
  });

  it('페이지 경로에 base를 붙이고 끝에 /를 붙인다(앞의 /는 있어도 없어도 된다)', () => {
    expect(withBase('')).toBe('/ai-physical-computing/');
    expect(withBase('/')).toBe('/ai-physical-computing/');
    expect(withBase('start/student/')).toBe('/ai-physical-computing/start/student/');
    expect(withBase('/start/student')).toBe('/ai-physical-computing/start/student/');
    expect(withBase('./glossary')).toBe('/ai-physical-computing/glossary/');
  });

  it('?검색어와 #위치는 그대로 뒤에 붙인다', () => {
    expect(withBase('search/?q=픽셀')).toBe('/ai-physical-computing/search/?q=픽셀');
    expect(withBase('credits#credits-third-party')).toBe('/ai-physical-computing/credits/#credits-third-party');
  });

  it('파일 이름에는 끝에 /를 붙이지 않는다', () => {
    expect(withBase('fonts/pretendard/pretendardvariable-dynamic-subset.css')).toBe(
      '/ai-physical-computing/fonts/pretendard/pretendardvariable-dynamic-subset.css',
    );
    expect(withBase('/images/site/favicon.svg')).toBe('/ai-physical-computing/images/site/favicon.svg');
    expect(withBase('pagefind/')).toBe('/ai-physical-computing/pagefind/');
  });

  it('사이트 밖 주소와 #으로 시작하는 주소는 바꾸지 않는다', () => {
    expect(withBase(siteConfig.repositoryUrl)).toBe(siteConfig.repositoryUrl);
    expect(withBase('#main-content')).toBe('#main-content');
    expect(isExternalHref('https://github.com/')).toBe(true);
    expect(isExternalHref('//cdn.example.com/a.js')).toBe(true);
    expect(isExternalHref('/start/')).toBe(false);
  });

  it('이미 base가 붙은 주소나 ".."이 든 주소는 실수로 보고 오류를 낸다', () => {
    expect(() => withBase('/ai-physical-computing/start/')).toThrow(/이미 base/u);
    expect(() => withBase('ai-physical-computing')).toThrow(/이미 base/u);
    expect(() => withBase('../start/')).toThrow(/".."/u);
    // 이름이 base로 시작할 뿐인 다른 경로는 괜찮다.
    expect(withBase('ai-physical-computing-notes/')).toBe('/ai-physical-computing/ai-physical-computing-notes/');
  });

  it('base를 떼고, 비교할 수 있게 페이지 경로를 맞춘다', () => {
    expect(stripBase('/ai-physical-computing/start/')).toBe('/start/');
    expect(stripBase('/ai-physical-computing/')).toBe('/');
    expect(stripBase('/ai-physical-computing')).toBe('/');
    expect(normalizePagePath('/ai-physical-computing/start/index.html')).toBe('/start/');
    expect(normalizePagePath('/ai-physical-computing/start')).toBe('/start/');
  });

  it('검색 엔진·공유 미리보기용 전체 주소를 만든다', () => {
    expect(absoluteUrl('credits/')).toBe('https://songdocomputerpark-lang.github.io/ai-physical-computing/credits/');
  });
});
