// 회로 그림 컴포넌트(src/components/circuits/*.astro)를 Astro Container API로 실제로 그려 본다(판 1.4.0 C5).
// .astro를 불러야 해서 기본 단위 테스트에는 넣지 않았다 — 실행: npx vitest run --config tests/unit/firmware/vitest.container.config.mjs
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import CircuitDetails from '../../../src/components/circuits/CircuitDetails.astro';
import CircuitFigure from '../../../src/components/circuits/CircuitFigure.astro';
import { circuitById, circuitList, circuitsOfLesson } from '../../../src/components/circuits/circuits-data.ts';

function count(html: string, pattern: RegExp): number {
  return [...html.matchAll(pattern)].length;
}

describe('회로 그림 컴포넌트(Container API)', () => {
  it('CircuitFigure: 번호로 그림 한 장을 그린다(base 붙은 주소·대체 글·크기·늦게 받기·고정 문장·[그림 크게 보기])', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(CircuitFigure, { props: { id: '2-1-2-1' } });
    const figure = circuitById('2-1-2-1')!;
    expect(html).toContain('<figure class="book-circuit" data-circuit="2-1-2-1" data-pagefind-ignore>');
    expect(html).toContain('src="/ai-physical-computing/images/circuits/third-party/kit-vendor/2-1-2-1.webp"');
    expect(html).toContain(`width="${figure.width}" height="${figure.height}" loading="lazy"`);
    expect(html).toContain(`alt="${figure.alt}"`);
    expect(html).toContain(circuitList.captionNote);
    expect(html).toContain('href="/ai-physical-computing/images/circuits/third-party/kit-vendor/2-1-2-1.webp"');
    expect(count(html, /그림 크게 보기/gu)).toBe(1);
  }, 120_000);

  it('CircuitFigure: 모르는 번호는 한국어 오류로 빌드를 멈춘다', async () => {
    const container = await AstroContainer.create();
    await expect(container.renderToString(CircuitFigure, { props: { id: '9-9-9-9' } })).rejects.toThrow(/회로 그림 9-9-9-9을\(를\) scripts\/circuits\/circuits\.yaml에서 찾지 못했어요/u);
  }, 120_000);

  it('CircuitDetails: 그림이 있는 차시는 기본 닫힘 접기로 그림 전부를, 없는 차시는 아무것도 그리지 않는다', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(CircuitDetails, { props: { label: '2-1-2' } });
    expect(html).toContain('<details class="circuit-details"');
    expect(html).not.toMatch(/<details[^>]*\sopen/u);
    expect(html).toContain('data-pagefind-ignore');
    expect(html).toContain('실제 키트 배선 보기');
    expect(html).toContain('(2장)');
    expect(count(html, /<figure class="book-circuit"/gu)).toBe(circuitsOfLesson('2-1-2').length);
    const none = await container.renderToString(CircuitDetails, { props: { label: '2-1-1' } });
    expect(none.trim()).toBe('');
    const four = await container.renderToString(CircuitDetails, { props: { label: '4-2-2' } });
    expect(count(four, /<figure class="book-circuit"/gu)).toBe(2);
    expect(four).toContain('이 그림에 없는 연결: 버저(2번 핀)');
  }, 120_000);
});
