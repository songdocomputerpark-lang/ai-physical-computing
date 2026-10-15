// 교과서 쪽 본문 HTML 나누기(src/components/book/book-html.ts, 판 1.4.0): 제목 칩·캡션·실습실 자리·칸 나누기
import { describe, expect, it } from 'vitest';
import { decorateBookCaptions, decorateBookHeadings, planBookBody } from '../../../src/components/book/book-html.ts';

describe('제목 칩(decorateBookHeadings)', () => {
  it('학습 목표·번호 제목·기본/심화 실습·단계 제목에 종류 표시와 칩을 붙인다(글자는 그대로 읽힌다)', () => {
    const html = [
      '<h2 id="학습-목표">학습 목표</h2>',
      '<h2 id="1-lcd의-이해">1 LCD의 이해</h2>',
      '<h2 id="기본-실습--출력">기본 실습 | 형식에 맞는 변숫값 출력하기</h2>',
      '<h2 id="심화-실습--터치">심화 실습 | 터치 센서로 출력값 제어하기</h2>',
      '<h3 id="단계-1--준비">단계 1 | 프로그램 준비하기</h3>',
    ].join('\n');
    const out = decorateBookHeadings(html);
    expect(out).toContain('<h2 id="학습-목표" data-kind="goal">학습 목표</h2>');
    expect(out).toContain('<h2 id="1-lcd의-이해" data-kind="numbered"><span class="book-num">1</span> <span class="book-heading__text">LCD의 이해</span></h2>');
    expect(out).toContain('data-kind="basic"><span class="book-tag">기본 실습</span> <span class="book-heading__text">형식에 맞는 변숫값 출력하기</span></h2>');
    expect(out).toContain('data-kind="advanced"><span class="book-tag">심화 실습</span>');
    expect(out).toContain('<h3 id="단계-1--준비" data-kind="step"><span class="book-step">단계 1</span> <span class="book-heading__text">프로그램 준비하기</span></h3>');
    // 태그를 떼고 읽으면 원문 글자 그대로다(낭독기·검색·발표 모드가 읽는 글)
    expect(out.replace(/<[^>]+>/gu, '')).toContain('기본 실습 형식에 맞는 변숫값 출력하기');
  });

  it('모양이 다른 제목·태그가 든 제목은 그대로 둔다', () => {
    const html = '<h2 id="a">소개말</h2><h3 id="b">단계 하나</h3><h2 id="c">1 <a href="/x/">링크</a></h2>';
    expect(decorateBookHeadings(html)).toBe(html);
  });

  it('그림 아래 캡션(▲ …)에 클래스를 붙인다', () => {
    expect(decorateBookCaptions('<p>▲ LCD(2x16)의 좌표 체계</p><p>본문</p>')).toBe('<p class="book-caption">▲ LCD(2x16)의 좌표 체계</p><p>본문</p>');
  });
});

describe('본문 나누기(planBookBody)', () => {
  const LAB = '<div class="book-lab-slot" data-book-lab="esp32/u2/2-1-2-lcd-count.py" data-pagefind-ignore=""></div>';

  it('## 제목마다 칸을 나누고 칸 제목 글자를 모은다', () => {
    const { plan } = planBookBody('<p class="book-page-mark" id="p124">교과서 124쪽</p>\n<h2 id="학습-목표">학습 목표</h2>\n<ul><li>목표</li></ul>\n<h2 id="1-a">1 A</h2>\n<p>본문</p>');
    expect(plan.intro).toHaveLength(1);
    expect(plan.sections.map((section) => section.title)).toEqual(['학습 목표', '1 A']);
    expect(plan.sections.map((section) => section.id)).toEqual(['학습-목표', '1-a']);
    expect(plan.sections[1]?.parts[0]).toMatchObject({ type: 'html' });
  });

  it('::실습실 자리는 예제 자리(slot examples)가 되고, 같은 파일은 같은 번호다', () => {
    const { plan, labFiles } = planBookBody(`<h2 id="a">1 가</h2>\n<p>앞</p>\n${LAB}\n<p>뒤</p>\n${LAB.replace('lcd-count', 'rtc-clock')}\n${LAB}`);
    expect(labFiles).toEqual(['esp32/u2/2-1-2-lcd-count.py', 'esp32/u2/2-1-2-rtc-clock.py']);
    const parts = plan.sections[0]!.parts;
    expect(parts.map((part) => (part.type === 'slot' ? `slot:${part.examples?.join(',')}` : 'html'))).toEqual(['html', 'slot:0', 'html', 'slot:1', 'slot:0']);
    const html = parts.flatMap((part) => (part.type === 'html' ? [part.html] : [])).join('');
    expect(html).toContain('<p>앞</p>');
    expect(html).not.toContain('book-lab-slot');
  });

  it('상자 안에 든 실습실 자리는 쓰지 않고 지우며 경고한다', () => {
    const { plan, labFiles } = planBookBody(`<h2 id="a">1 가</h2>\n<div class="box box--note">${LAB}</div>`);
    expect(labFiles).toEqual([]);
    expect(plan.warnings.join('\n')).toContain('상자·목록 밖에');
    expect(JSON.stringify(plan.sections)).not.toContain('book-lab-slot');
  });

  it('그림 주소에 base를 붙이고 그림은 늦게 받는다', () => {
    const { plan } = planBookBody('<h2 id="a">1 가</h2>\n<p><img src="/images/lessons/2-1-2/x.webp" alt="어떤 그림 설명이에요"></p>');
    const html = plan.sections[0]!.parts.map((part) => (part.type === 'html' ? part.html : '')).join('');
    expect(html).toContain('src="/ai-physical-computing/images/lessons/2-1-2/x.webp"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('class="figure-zoom"');
  });
});
