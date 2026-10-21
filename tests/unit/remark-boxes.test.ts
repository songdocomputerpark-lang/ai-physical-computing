import { markdownConfigDefaults, unified } from '@astrojs/markdown-remark';
import remarkDirective from 'remark-directive';
import { afterEach, describe, expect, it, vi } from 'vitest';
import remarkBoxes, { BOOK_BOX_VARIANTS, BOX_TYPES, GENAI_NOTE, boxClassNames, findBoxType } from '../../src/lib/remark-boxes.mjs';
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
  it('상자 종류 12개 + 교과서 꼭지 14개의 이름(한국어·영어)이 겹치지 않고 모두 찾아진다', () => {
    const names = BOX_TYPES.flatMap((type) => [type.name, ...type.aliases]);
    expect(new Set(names).size).toBe(names.length);
    expect(BOX_TYPES.filter((type) => !type.book).map((type) => type.name)).toEqual([
      '왜그럴까',
      '바꿔보기',
      '도전',
      '생성형AI',
      '힌트',
      '정답',
      '확인',
      '오류',
      '주의',
      '참고',
      '더알아보기',
      '교사용',
    ]);
    // 교과서 쪽 전용(판 1.4.0, DECISIONS C134) — 웹 차시에서 쓰면 check:lessons가 오류로 막는다(book-only)
    expect(BOX_TYPES.filter((type) => type.book).map((type) => type.name)).toEqual([
      '말풍선',
      '해보기',
      '용어풀이',
      '연결레시피',
      '에러체크',
      '결과',
      '점검하기',
      '자기평가',
      '학습활동',
      '읽기자료',
      '성취계획',
      '코드설명',
      '그림생략',
      '웹정정',
      '웹안내',
    ]);
    expect(BOOK_BOX_VARIANTS).toEqual(BOX_TYPES.filter((type) => type.book).map((type) => type.variant));
    for (const type of BOX_TYPES) {
      expect(findBoxType(type.name)).toBe(type);
      for (const alias of type.aliases) {
        expect(findBoxType(alias)).toBe(type);
      }
    }
    expect(boxClassNames(findBoxType('주의')!)).toEqual(['box', 'box--caution']);
  });

  it(':::생성형AI 상자는 끝에 "도움 받은 부분 표시" 안내가 저절로 붙고, 다른 상자에는 붙지 않는다(P5-02)', async () => {
    const html = compact(
      await render(
        ':::생성형AI[생성형 AI 활용 탐구: 문구 바꾸기]\nAI에게 물어봐요.\n:::\n\n:::genai\n두 번째\n:::\n\n:::참고\n덧붙임\n:::',
      ),
    );
    expect(html).toContain(
      `<div class="box box--genai" data-box="genai" role="note"><p class="box__title">생성형 AI 활용 탐구: 문구 바꾸기</p><p>AI에게 물어봐요.</p><p class="box__note">${GENAI_NOTE}</p></div>`,
    );
    expect(html).toContain(`<p class="box__title">생성형 AI 활용 탐구</p><p>두 번째</p><p class="box__note">`);
    expect(GENAI_NOTE).toContain('생성형 AI의 도움을 받은 부분을 표시해요');
    expect(GENAI_NOTE).toContain('개인정보는 AI에게 보내지 않아요');
    expect(html.match(/box__note/gu)).toHaveLength(2);
    expect(BOX_TYPES.filter((type) => type.note).map((type) => type.name)).toEqual(['생성형AI']);
  });

  it(':::왜그럴까 는 기본 제목이 붙은 role="note" 상자가 된다', async () => {
    const html = compact(await render(':::왜그럴까\n밝은 픽셀만 흰색이 돼요.\n:::'));
    expect(html).toBe(
      '<div class="box box--why" data-box="why" role="note"><p class="box__title">왜 이런 결과가 나올까?</p><p>밝은 픽셀만 흰색이 돼요.</p></div>',
    );
  });

  it('칸 제목(## 바꿔 보기·## 교사용)과 같은 이름을 상자 제목으로 되풀이하지 않는다(R2-049)', async () => {
    const tryBox = compact(await render(':::바꿔보기\n1. 값을 바꿔요\n:::'));
    expect(tryBox).toContain('<p class="box__title">바꿔 볼 것 3가지</p>');
    expect(tryBox).not.toContain('<p class="box__title">바꿔 보기</p>');
    const teacherBox = compact(await render(':::교사용\n지도 포인트\n:::'));
    expect(teacherBox).not.toContain('<summary class="box__title">교사용</summary>');
    expect(teacherBox).not.toContain('<summary class="box__title">교사용 안내</summary>');
  });

  it('접는 상자(교사용)는 details·summary가 되고, {open}을 붙이면 펼쳐져 있다', async () => {
    expect(compact(await render(':::교사용\n지도 포인트\n:::'))).toBe(
      '<details class="box box--teacher" data-box="teacher" data-pagefind-ignore=""><summary class="box__title">지도 요약·평가 포인트 보기</summary><p>지도 포인트</p></details>',
    );
    expect(compact(await render(':::교사용{open}\n지도 포인트\n:::'))).toContain(
      '<details class="box box--teacher" data-box="teacher" data-pagefind-ignore="" open><summary class="box__title">지도 요약·평가 포인트 보기</summary>',
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

describe('교과서 쪽 문법(판 1.4.0 — ::쪽[n]·::실습실[파일]·꼭지 상자)', () => {
  it('::쪽[125]는 쪽 표지(id p125, 검색 색인 제외)가 된다', async () => {
    const html = compact(await render('::쪽[125]\n\n본문이에요.'));
    expect(html).toBe('<p class="book-page-mark" id="p125" data-pagefind-ignore="">교과서 125쪽</p><p>본문이에요.</p>');
  });

  it('쪽 번호가 아닌 ::쪽[…]은 글자 그대로 두고 경고한다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const html = compact(await render('::쪽[abc]\n\n::쪽[0]\n\n::쪽'));
    expect(html).toContain('<p>::쪽[abc]</p>');
    expect(html).toContain('<p>::쪽[0]</p>');
    expect(html).not.toContain('book-page-mark');
    expect(warn).toHaveBeenCalledTimes(3);
    expect(String(warn.mock.calls[0]?.[0])).toContain('쪽 번호(자연수)');
  });

  it('::실습실[파일]은 자리 표시 div가 된다(경로에 빈칸이 있으면 글자 그대로)', async () => {
    const html = compact(await render('::실습실[esp32/u2/2-1-2-lcd-count.py]'));
    expect(html).toBe('<div class="book-lab-slot" data-book-lab="esp32/u2/2-1-2-lcd-count.py" data-pagefind-ignore=""></div>');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(compact(await render('::실습실[a b.py]'))).toBe('<p>::실습실[a b.py]</p>');
  });

  it('교과서 꼭지 상자는 늘 글자 이름이 보이고 접히지 않는다', async () => {
    const html = compact(await render(':::말풍선\n둘째 줄을 먼저 읽어.\n:::\n\n:::용어풀이[투과율]\n통과하는 정도이다.\n:::\n\n:::코드설명\n- **줄 2** 핀을 불러온다\n:::'));
    expect(html).toContain('<div class="box box--bubble" data-box="bubble" role="note"><p class="box__title">말풍선</p>');
    expect(html).toContain('<div class="box box--term" data-box="term" role="note"><p class="box__title">투과율</p>');
    expect(html).toContain('<div class="box box--codenote" data-box="codenote" role="note"><p class="box__title">코드 설명</p>');
    for (const type of BOX_TYPES.filter((candidate) => candidate.book)) {
      expect(type.collapsible, type.name).toBe(false);
      expect(type.searchable, type.name).toBe(true);
    }
  });

  it('웹정정·그림생략은 대괄호 글자를 "기본 제목: 글자"로 보인다(이름이 곧 뜻이라 늘 보여야 한다)', async () => {
    const html = compact(await render(':::웹정정[format 앞의 점]\n점이 빠졌어요.\n:::\n\n:::그림생략[교과서 10쪽 사진]\n사진은 싣지 않아요.\n:::\n\n:::용어풀이[투과율]\n뜻이다.\n:::'));
    expect(html).toContain('<p class="box__title">웹에서 바로잡은 곳: format 앞의 점</p>');
    expect(html).toContain('<p class="box__title">그림 생략: 교과서 10쪽 사진</p>');
    expect(html).toContain('<p class="box__title">투과율</p>');
    expect(html).toContain('<div class="box box--webfix" data-box="webfix" role="note">');
    expect(BOX_TYPES.filter((type) => type.keepName).map((type) => type.name)).toEqual(['그림생략', '웹정정']);
  });

  it('웹안내는 출판본 옆에 놓는 사이트 글 — 대괄호 글자가 제목이 되고(없으면 "이 사이트에서는"), 안의 링크는 그대로 남는다(판 1.6.0 C176)', async () => {
    const html = compact(await render(':::웹안내[이 사이트에서는 설치 없이]\n브라우저만으로 돼요.\n\n- [보드 준비하기](/start/board/)\n:::\n\n:::웹안내\n제목 없는 안내예요.\n:::'));
    expect(html).toContain('<div class="box box--webnote" data-box="webnote" role="note"><p class="box__title">이 사이트에서는 설치 없이</p>');
    expect(html).toContain('<p class="box__title">이 사이트에서는</p>');
    expect(html).toContain('<a href="/start/board/">보드 준비하기</a>');
  });

  it('상자 안에 상자(::::결과 > :::말풍선)도 된다', async () => {
    const html = compact(await render('::::결과\n**제목**\n\n:::말풍선\n말이야.\n:::\n::::'));
    expect(html).toContain('<div class="box box--result" data-box="result" role="note"><p class="box__title">실행 결과</p>');
    expect(html).toContain('<div class="box box--bubble" data-box="bubble" role="note">');
  });
});
