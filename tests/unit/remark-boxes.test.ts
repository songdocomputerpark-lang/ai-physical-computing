import { markdownConfigDefaults, unified } from '@astrojs/markdown-remark';
import remarkDirective from 'remark-directive';
import { afterEach, describe, expect, it, vi } from 'vitest';
import remarkBoxes, { BOX_TYPES, boxClassNames, findBoxType } from '../../src/lib/remark-boxes.mjs';
import remarkGlossary from '../../src/lib/remark-glossary.mjs';

type TreeNode = { type: string; name?: string; data?: Record<string, unknown>; children?: TreeNode[] };
type TestPlugin = () => (tree: TreeNode) => void;

/** astro.config.mjs와 같은 순서(remarkDirective → remarkGlossary → remarkBoxes)로 마크다운을 HTML로 바꾼다. */
async function render(markdown: string, beforeBoxes: TestPlugin[] = []): Promise<string> {
  const processor = unified({
    remarkPlugins: [remarkDirective, remarkGlossary, ...beforeBoxes, remarkBoxes] as never,
  });
  const renderer = await processor.createRenderer({ ...markdownConfigDefaults, syntaxHighlight: false });
  const { code } = await renderer.render(markdown);
  return code;
}

/** 태그 사이 줄바꿈을 지워 비교하기 쉽게 만든다. */
function compact(html: string): string {
  return html.replace(/>\s+</gu, '><').trim();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('상자 문법(src/lib/remark-boxes.mjs)', () => {
  it('상자 종류 10개의 이름(한국어·영어)이 겹치지 않고 모두 찾아진다', () => {
    const names = BOX_TYPES.flatMap((type) => [type.name, ...type.aliases]);
    expect(new Set(names).size).toBe(names.length);
    expect(BOX_TYPES.map((type) => type.name)).toEqual([
      '왜그럴까',
      '바꿔보기',
      '도전',
      '힌트',
      '정답',
      '확인',
      '오류',
      '주의',
      '참고',
      '교사용',
    ]);
    for (const type of BOX_TYPES) {
      expect(findBoxType(type.name)).toBe(type);
      for (const alias of type.aliases) {
        expect(findBoxType(alias)).toBe(type);
      }
    }
    expect(boxClassNames(findBoxType('주의')!)).toEqual(['box', 'box--caution']);
  });

  it(':::왜그럴까 는 기본 제목이 붙은 role="note" 상자가 된다', async () => {
    const html = compact(await render(':::왜그럴까\n밝은 픽셀만 흰색이 돼요.\n:::'));
    expect(html).toBe(
      '<div class="box box--why" data-box="why" role="note"><p class="box__title">왜 이런 결과가 나올까?</p><p>밝은 픽셀만 흰색이 돼요.</p></div>',
    );
  });

  it('접는 상자(교사용)는 details·summary가 되고, {open}을 붙이면 펼쳐져 있다', async () => {
    expect(compact(await render(':::교사용\n지도 포인트\n:::'))).toBe(
      '<details class="box box--teacher" data-box="teacher" data-pagefind-ignore=""><summary class="box__title">교사용 안내</summary><p>지도 포인트</p></details>',
    );
    expect(compact(await render(':::교사용{open}\n지도 포인트\n:::'))).toContain(
      '<details class="box box--teacher" data-box="teacher" data-pagefind-ignore="" open><summary class="box__title">교사용 안내</summary>',
    );
  });

  it('교사용·정답 상자만 사이트 검색 색인에서 빠진다(data-pagefind-ignore, P1-11)', async () => {
    const html = compact(await render(':::정답\n2번\n:::\n\n:::힌트\n반복해 보세요.\n:::\n\n:::참고\n덧붙임\n:::'));
    expect(html).toContain('<details class="box box--answer" data-box="answer" data-pagefind-ignore="">');
    expect(html).toContain('<details class="box box--hint" data-box="hint">');
    expect(html).toContain('<div class="box box--note" data-box="note" role="note">');
    expect(BOX_TYPES.filter((type) => !type.searchable).map((type) => type.name)).toEqual(['정답', '교사용']);
  });

  it('영어 이름도 같은 상자가 되고, 대괄호 안 글자(꾸밈 포함)는 제목이 된다', async () => {
    const html = compact(await render(':::why\n본문\n:::\n\n:::도전[도전 과제 2: **더 빠르게**]\n본문\n:::'));
    expect(html).toContain('<div class="box box--why" data-box="why" role="note"><p class="box__title">왜 이런 결과가 나올까?</p>');
    expect(html).toContain(
      '<div class="box box--challenge" data-box="challenge" role="note"><p class="box__title">도전 과제 2: <strong>더 빠르게</strong></p><p>본문</p></div>',
    );
  });

  it('상자 안의 상자는 바깥 상자에 콜론을 하나 더 써서 만든다', async () => {
    const html = compact(await render('::::도전\n본문\n\n:::힌트\n반복해 보세요.\n:::\n\n뒤 글\n::::\n\n상자 밖'));
    expect(html).toBe(
      '<div class="box box--challenge" data-box="challenge" role="note"><p class="box__title">도전 과제</p><p>본문</p>' +
        '<details class="box box--hint" data-box="hint"><summary class="box__title">힌트 보기</summary><p>반복해 보세요.</p></details>' +
        '<p>뒤 글</p></div><p>상자 밖</p>',
    );
  });

  it('콜론이 들어간 보통 글(시각·비율·예:낱말)은 글자가 사라지지 않는다', async () => {
    const html = await render('회의는 10:30에 시작해요. 예:픽셀, 화면 비율 16:9');
    expect(html).toContain('회의는 10:30에 시작해요. 예:픽셀, 화면 비율 16:9');
  });

  it('줄 하나짜리 지시문(::이름)과 중괄호가 붙은 글도 원래 글자로 되돌린다', async () => {
    const html = compact(await render('::abc\n\n비율:높음{중요}'));
    expect(html).toContain('<p>::abc</p>');
    expect(html).toContain('<p>비율:높음{중요}</p>');
  });

  it('모르는 상자 이름은 상자로 바꾸지 않고 글자 그대로 보여 주며 경고를 남긴다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const html = compact(await render(':::교사욯\n내용\n:::'));
    expect(html).toBe('<p>:::교사욯</p><p>내용</p><p>:::</p>');
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain('모르는 상자 이름 ":::교사욯"');
  });

  it('인라인 코드 안의 콜론은 지시문으로 읽히지 않는다', async () => {
    const html = await render('`a:b` 와 `:::교사용`');
    expect(html).toContain('<code>a:b</code>');
    expect(html).toContain('<code>:::교사용</code>');
  });

  it('다른 플러그인이 먼저 처리한 지시문(data.hName이 있는 것)은 되돌리지 않는다', async () => {
    const markShout: TestPlugin = () => (tree) => {
      const walk = (node: TreeNode) => {
        if (node.type === 'textDirective' && node.name === 'shout') {
          node.data = { hName: 'mark' };
        }
        node.children?.forEach(walk);
      };
      walk(tree);
    };
    const html = await render('이건 :shout[중요]해요', [markShout]);
    expect(html).toContain('<mark>중요</mark>');
  });
});

// 용어 문법 자체의 자세한 검사는 tests/unit/glossary/remark-glossary.test.ts에 있다.
describe('용어 표시 문법(src/lib/remark-glossary.mjs)과 함께 쓰기', () => {
  it(':용어[말]은 remark-boxes가 되돌리지 않는 표시 자리가 된다(조사는 대괄호 밖)', async () => {
    const html = await render(':용어[픽셀]은 작은 점이에요. :용어[화소]{항목=pixel}와 :term[pixel]');
    expect(html).toContain('>픽셀</glossary-term>은 작은 점이에요. ');
    expect(html).toContain('data-glossary-entry="pixel">화소</glossary-term>와 ');
    expect(html).toContain('>pixel</glossary-term></p>');
    expect(html).not.toContain(':용어[');
  });

  it('대괄호 없는 :용어는 원래 글자로 남는다', async () => {
    const html = await render('분류:용어');
    expect(html).toContain('분류:용어');
  });
});
