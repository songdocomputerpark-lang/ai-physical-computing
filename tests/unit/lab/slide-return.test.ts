// @vitest-environment jsdom
// "← 수업 화면으로"(src/lab/controls/slide-return.ts, 판 1.6.0 — walk-teacher-new A3·synthesis A-9).
// 수업 화면의 [실습실에서 크게 열기]가 새 탭으로 연 실습실(?from=slide&n=N)에서만 링크를 보이고, 돌아갈 곳은 그 탭을 연 교과서 원문·따라 하기 쪽의 #slide=N이다.
import { afterEach, describe, expect, it } from 'vitest';
import { installSlideReturn, slideReturnHref, slideReturnStep } from '../../../src/lab/controls/slide-return.ts';

const BASE = '/ai-physical-computing/';
const ORIGIN = 'https://example.github.io';

describe('slideReturnStep', () => {
  it('?from=slide&n=N이면 N(1부터), 아니면 undefined', () => {
    expect(slideReturnStep('?example=a.py&from=slide&n=23')).toBe(23);
    expect(slideReturnStep('?from=slide&n=1')).toBe(1);
    expect(slideReturnStep('?from=slide&n=0')).toBeUndefined();
    expect(slideReturnStep('?from=slide&n=abc')).toBeUndefined();
    expect(slideReturnStep('?from=slide')).toBeUndefined();
    expect(slideReturnStep('?from=lesson&n=3')).toBeUndefined();
    expect(slideReturnStep('')).toBeUndefined();
  });
});

describe('slideReturnHref', () => {
  const input = (over: Partial<Parameters<typeof slideReturnHref>[0]>) => ({
    search: '?example=esp32%2Fu2%2Fa.py&from=slide&n=23',
    referrer: `${ORIGIN}${BASE}book/2-1-2/`,
    origin: ORIGIN,
    basePath: BASE,
    ...over,
  });

  it('이 탭을 연 교과서 원문·따라 하기 쪽의 #slide=N으로 간다', () => {
    expect(slideReturnHref(input({}))).toBe(`${BASE}book/2-1-2/#slide=23`);
    expect(slideReturnHref(input({ referrer: `${ORIGIN}${BASE}learn/u2/2-1-2/` }))).toBe(`${BASE}learn/u2/2-1-2/#slide=23`);
  });

  it('여는 표시 ?view=slide는 #slide=N이 대신하고, 다른 값과 옛 #위치는 버린다', () => {
    expect(slideReturnHref(input({ referrer: `${ORIGIN}${BASE}book/2-1-2/?view=slide&x=1#slide=4` }))).toBe(`${BASE}book/2-1-2/?x=1#slide=23`);
  });

  it('referrer가 없거나 다른 사이트·수업 화면이 없는 쪽이면 차시 링크(fallback)로, 그것도 없으면 링크를 보이지 않는다', () => {
    expect(slideReturnHref(input({ referrer: '', fallback: `${BASE}learn/u2/2-1-2/` }))).toBe(`${BASE}learn/u2/2-1-2/#slide=23`);
    expect(slideReturnHref(input({ referrer: 'https://evil.example/book/2-1-2/', fallback: `${BASE}learn/u2/2-1-2/` }))).toBe(
      `${BASE}learn/u2/2-1-2/#slide=23`,
    );
    expect(slideReturnHref(input({ referrer: `${ORIGIN}${BASE}labs/esp32/` }))).toBeUndefined();
    expect(slideReturnHref(input({ referrer: '' }))).toBeUndefined();
  });

  it('?from=slide&n=N이 없으면(평소 실습실) 언제나 undefined', () => {
    expect(slideReturnHref(input({ search: '?example=a.py' }))).toBeUndefined();
  });
});

describe('installSlideReturn(실습실 쪽 링크 채우기)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState(null, '', '/');
  });

  const mount = () => {
    document.body.innerHTML =
      '<p data-lab-slide-return hidden><a href="#">← 수업 화면으로</a></p>' +
      `<p><a data-lab-lesson-link href="${BASE}learn/u2/2-1-2/">차시</a></p>`;
    return document.querySelector<HTMLElement>('[data-lab-slide-return]')!;
  };

  it('?from=slide&n=N으로 열린 실습실이면 링크를 보이고 돌아갈 단계 주소를 채운다(referrer 없으면 차시 링크)', () => {
    window.history.replaceState(null, '', `${BASE}labs/esp32/?example=a.py&from=slide&n=7`);
    const box = mount();
    installSlideReturn(document, BASE);
    expect(box.hidden).toBe(false);
    expect(box.querySelector('a')!.getAttribute('href')).toBe(`${BASE}learn/u2/2-1-2/#slide=7`);
  });

  it('평소 실습실(표시 없음)에서는 숨긴 채 둔다', () => {
    window.history.replaceState(null, '', `${BASE}labs/esp32/?example=a.py`);
    const box = mount();
    installSlideReturn(document, BASE);
    expect(box.hidden).toBe(true);
  });
});
