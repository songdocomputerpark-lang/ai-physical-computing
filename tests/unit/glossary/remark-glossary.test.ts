import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findGlossaryMarkers } from '../../../src/components/glossary/glossary.ts';
import {
  GLOSSARY_DIRECTIVE_NAMES,
  GLOSSARY_MARKER_ATTRIBUTES,
  GLOSSARY_MARKER_TAG,
  displayPath,
  isGlossaryDirective,
} from '../../../src/lib/remark-glossary.mjs';
import { renderMarkdown } from './helpers.ts';

const MARKER_OPEN = `<${GLOSSARY_MARKER_TAG}`;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('용어 표시 문법 1단계(src/lib/remark-glossary.mjs)', () => {
  it(':용어[말]은 표시 자리가 되고, 대괄호 밖에 붙인 조사는 그대로 이어진다', async () => {
    const html = await renderMarkdown(':용어[픽셀]은 작은 점이에요.');
    expect(html).toContain(
      `<p><glossary-term ${GLOSSARY_MARKER_ATTRIBUTES.text}="${encodeURIComponent('픽셀')}">픽셀</glossary-term>은 작은 점이에요.</p>`,
    );
  });

  it('{항목=…}·{#…}은 항목 id를 함께 남기고, :term은 :용어와 같다', async () => {
    const markers = findGlossaryMarkers(await renderMarkdown(':용어[화소]{항목=pixel}와 :용어[화소]{#pixel}, :term[pixel]'));
    expect(markers).toEqual([
      { text: '화소', entry: 'pixel', source: undefined },
      { text: '화소', entry: 'pixel', source: undefined },
      { text: 'pixel', entry: undefined, source: undefined },
    ]);
  });

  it('마크다운 위치는 저장소 기준 "경로:줄"로 남고, 저장소 밖 파일은 파일 이름만 남는다', async () => {
    const fileURL = pathToFileURL(path.join(process.cwd(), 'content', 'lessons', 'u1', 'sample.md'));
    const [marker] = findGlossaryMarkers(await renderMarkdown('첫 문단\n\n둘째 문단의 :용어[센서]', fileURL));
    expect(marker?.source).toBe('content/lessons/u1/sample.md:3');
    expect(displayPath(path.join(path.parse(process.cwd()).root, 'elsewhere', 'outside.md'))).toBe('outside.md');
    expect(displayPath(undefined)).toBe('');
  });

  it('대괄호 안 꾸밈(굵게·코드)은 남기고 글자만 속성에 담으며, 대괄호 안 링크는 풀어 링크 속 링크를 막는다', async () => {
    const html = await renderMarkdown(':용어[**정규화** `좌표`]와 :용어[[센서](https://example.com)]');
    expect(html).toContain('<strong>정규화</strong> <code>좌표</code></glossary-term>');
    expect(findGlossaryMarkers(html).map((marker) => marker.text)).toEqual(['정규화 좌표', '센서']);
    expect(html).not.toContain('<a ');
  });

  it('코드 블록과 인라인 코드 안의 :용어[…]는 바꾸지 않는다', async () => {
    const html = await renderMarkdown('`:용어[픽셀]`\n\n```\n:용어[픽셀]\n```');
    expect(html).not.toContain(MARKER_OPEN);
    expect(html).toContain('<code>:용어[픽셀]</code>');
  });

  it('대괄호가 없는 :용어는 건드리지 않아 원래 글자로 남는다', async () => {
    const html = await renderMarkdown('분류:용어 그리고 :용어{항목=pixel}');
    expect(html).not.toContain(MARKER_OPEN);
    expect(html).toContain('분류:용어 그리고 :용어{');
  });

  it('제목·링크·상자 제목 안에서는 글자만 남기고 빌드 로그에 알린다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const html = await renderMarkdown(
      '## :용어[픽셀]이란?\n\n[:용어[센서] 더 보기](https://example.com)\n\n:::도전[:용어[PWM] 바꾸기]\n본문의 :용어[PWM]\n:::',
    );
    expect(html).toContain('픽셀이란?</h2>');
    expect(html).toContain('<a href="https://example.com">센서 더 보기</a>');
    expect(html).toContain('<p class="box__title">PWM 바꾸기</p>');
    expect(findGlossaryMarkers(html).map((marker) => marker.text)).toEqual(['PWM']);
    expect(warn.mock.calls.map((call) => String(call[0]))).toEqual([
      expect.stringContaining('제목 안에 쓴 ":용어[픽셀]"'),
      expect.stringContaining('링크 안에 쓴 ":용어[센서]"'),
      expect.stringContaining('상자 제목 안에 쓴 ":용어[PWM]"'),
    ]);
  });

  it('용어 표시 안의 용어 표시는 안쪽을 글자로 풀고 알린다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const markers = findGlossaryMarkers(await renderMarkdown(':용어[정규화 :용어[좌표]]'));
    expect(markers.map((marker) => marker.text)).toEqual(['정규화 좌표']);
    expect(String(warn.mock.calls[0]?.[0])).toContain('다른 용어 표시 안에 쓴 ":용어[좌표]"');
  });

  it('상자 안 본문의 용어도 표시 자리가 된다(상자 문법과 함께 쓸 수 있다)', async () => {
    const html = await renderMarkdown(':::참고\n:용어[센서]로 빛을 알아채요.\n:::');
    expect(html).toContain('<div class="box box--note" data-box="note" role="note">');
    expect(findGlossaryMarkers(html)).toHaveLength(1);
  });

  it('지시문 이름은 한글 자모가 나뉘어 적혀도(NFD) 알아보고, 상자 지시문과는 구별한다', () => {
    expect(GLOSSARY_DIRECTIVE_NAMES).toEqual(['용어', 'term']);
    expect(isGlossaryDirective({ type: 'textDirective', name: '용어'.normalize('NFD') })).toBe(true);
    expect(isGlossaryDirective({ type: 'containerDirective', name: '용어' })).toBe(false);
  });
});
