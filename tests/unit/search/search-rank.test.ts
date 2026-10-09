// 찾기 결과 거르기·순서 규칙(src/components/search/search-rank.ts, 판 1.3.0 검수 R1-011~014) 단위 검사.
// 빌드한 색인으로 실제 결과가 맞게 나오는지는 tests/e2e/search.spec.ts · search-suggest.spec.ts가 본다.
import { describe, expect, it } from 'vitest';
import {
  coreWords,
  isNonsenseQuery,
  isRelevant,
  isRelevantTo,
  markPieces,
  planSearch,
  splitWords,
  tierOf,
  anchorKey,
} from '../../../src/components/search/search-rank.ts';
import {
  evaluateResult,
  orderEvaluated,
  pickAnchoredResult,
  searchPlanned,
  type PagefindResultData,
  type SearchConfig,
} from '../../../src/components/search/search-core.ts';

const BASE = '/ai-physical-computing/';
const config: SearchConfig = {
  bundlePath: `${BASE}pagefind/`,
  baseUrl: BASE,
  queryParam: 'q',
  anchorPages: ['/glossary/', '/help/errors/'],
  sections: [],
};

describe('낱말 나누기', () => {
  it('splitWords: 소문자, 글자·숫자만', () => {
    expect(splitWords('NameError:  (cv2.threshold)')).toEqual(['nameerror', 'cv2', 'threshold']);
    expect(splitWords('1-4-1')).toEqual(['1', '4', '1']);
  });

  it('coreWords: 뜻 묻는 말투("뜻")는 빼되 전부 그런 말이면 그대로 둔다', () => {
    expect(coreWords('임계값 뜻')).toEqual(['임계값']);
    expect(coreWords('뜻')).toEqual(['뜻']);
  });

  it('markPieces: <mark> 안의 글만, 코드 조각은 글자·숫자 단위로, 이스케이프는 풀어서', () => {
    expect(markPieces('앞 <mark>cv2.threshold(blurred,</mark> 뒤 <mark>임계값</mark>')).toEqual(['cv2', 'threshold', 'blurred', '임계값']);
    expect(markPieces('<mark>a&amp;b</mark>')).toEqual(['a', 'b']);
    expect(markPieces('표시 없음')).toEqual([]);
  });
});

describe('엉뚱하게 걸린 글 거르기(isRelevantTo) — R1-011·012', () => {
  it('낱말의 앞부분 한두 글자에만 걸린 글은 맞지 않다: asdfgh→as, zzqqxx→z, qwertyuiop→q, 임게값→이', () => {
    expect(isRelevantTo('asdfgh', ['as'])).toBe(false);
    expect(isRelevantTo('zzqqxx', ['z'])).toBe(false);
    expect(isRelevantTo('qwertyuiop', ['q', 'q'])).toBe(false);
    expect(isRelevantTo('임게값', ['이'])).toBe(false);
  });

  it('낱말이 그대로 있거나 뒤에 말이 붙은 글은 맞다(조사·이어진 낱말)', () => {
    expect(isRelevantTo('서보', ['서보모터'])).toBe(true);
    expect(isRelevantTo('로그인', ['로그인이'])).toBe(true);
    expect(isRelevantTo('threshold', ['cv2', 'threshold', 'blurred'])).toBe(true);
    expect(isRelevantTo('LED', ['led'])).toBe(true);
  });

  it('검색어에 조사가 붙은 경우: 조사 앞 낱말이 60% 이상 맞으면 맞다("카메라가"→"카메라" 3/4)', () => {
    expect(isRelevantTo('카메라가', ['카메라'])).toBe(true);
    expect(isRelevantTo('수행평가', ['수행'])).toBe(false); // 2/4: 코드 주석의 "포즈 추정 수행"
  });

  it('한 글자짜리 검색어와 숫자 검색어는 한 글자 맞음도 센다', () => {
    expect(isRelevantTo('z', ['z'])).toBe(true);
    expect(isRelevantTo('1-4-1', ['1', '4'])).toBe(true);
  });

  it('맞은 낱말 표시가 하나도 없으면 판단할 근거가 없어 맞는 것으로 둔다', () => {
    expect(isRelevantTo('서보', [])).toBe(true);
  });

  it('여러 말(본 검색 + 같은 뜻 말) 가운데 하나라도 맞으면 맞다', () => {
    expect(isRelevant(['수행평가', '과정 중심 평가'], ['과정', '중심', '평가'])).toBe(true);
    expect(isRelevant(['수행평가', '과정 중심 평가'], ['수행'])).toBe(false);
  });

  it('isNonsenseQuery: 같은 글자 하나의 되풀이는 뜻 없는 입력', () => {
    expect(isNonsenseQuery('zzzz')).toBe(true);
    expect(isNonsenseQuery('ㅋㅋㅋ')).toBe(true);
    expect(isNonsenseQuery('zz')).toBe(false);
    expect(isNonsenseQuery('led')).toBe(false);
    expect(isNonsenseQuery('z z z')).toBe(true);
  });
});

describe('찾을 계획(planSearch)', () => {
  it('뜻 없는 입력과 빈 입력은 null', () => {
    expect(planSearch('zzzz')).toBeNull();
    expect(planSearch('   ')).toBeNull();
  });

  it('뜻 묻는 말투는 빼고 찾는다: "임계값 뜻" → "임계값" (화면에는 입력 그대로)', () => {
    expect(planSearch('임계값 뜻')).toEqual({ display: '임계값 뜻', terms: ['임계값'] });
    expect(planSearch('뜻')).toEqual({ display: '뜻', terms: ['뜻'] });
  });

  it('증상 말투를 사이트 글의 말투로 바꾼다: "카메라가 안 켜져요" → "카메라가 켜지지 않아요" (R1-014)', () => {
    expect(planSearch('카메라가 안 켜져요')?.terms).toEqual(['카메라가 켜지지 않아요']);
    expect(planSearch('카메라 안켜져요')?.terms).toEqual(['카메라 켜지지 않아요']);
    expect(planSearch('코드가 안 돼요')?.terms).toEqual(['코드가 되지 않아요']);
    expect(planSearch('카메라가 켜지지 않아요')?.terms).toEqual(['카메라가 켜지지 않아요']);
  });

  it('붙여 쓴 칸 이름은 띄어 쓴 본문 말로 찾는다: 따라하기 → 따라 하기 (R1-066)', () => {
    expect(planSearch('따라하기')?.terms).toEqual(['따라 하기']);
    expect(planSearch('바꿔보기 예시')?.terms).toEqual(['바꿔 보기 예시']);
  });

  it('같은 뜻 말을 뒤에 덧붙인다: 수행평가 → 과정 중심 평가, permission denied → 카메라 허용', () => {
    expect(planSearch('수행평가')?.terms).toEqual(['수행평가', '과정 중심 평가']);
    expect(planSearch('웹캠 permission denied')?.terms).toEqual(['웹캠 permission denied', '카메라 허용']);
  });
});

describe('앞에 둘 차례(tierOf)', () => {
  const entry = (kind: string, title: string, url: string, excerpt = '') => ({ kind, title, url, excerpt });

  it('용어사전 항목의 이름이나 id가 낱말과 맞으면 0, 오류 사전 항목이면 0.5', () => {
    expect(tierOf(entry('glossary', '임계값 Threshold — 용어사전', `${BASE}glossary/#threshold`), ['임계값'])).toBe(0);
    expect(tierOf(entry('error', '정해 준 적이 없는 이름을 썼어요 — 파이썬 오류 사전', `${BASE}help/errors/#name-error`), ['NameError'])).toBe(0.5);
  });

  it('낱말이 여럿인 검색어는 낱말 하나만 맞는 항목을 앞에 두지 않는다: "손 인식"에 "음성 인식" 항목은 0이 아니다', () => {
    const speech = entry('glossary', '음성 인식 Speech Recognition — 용어사전', `${BASE}glossary/#speech-recognition`, '<mark>인식</mark>');
    expect(tierOf(speech, ['손 인식'])).toBe(2);
    expect(tierOf(speech, ['음성 인식'])).toBe(0);
  });

  it('쪽 제목에 낱말이 있으면 1, 없으면 2', () => {
    expect(tierOf(entry('learn', 'V3 보충 임계값으로 나누기', `${BASE}learn/u1/v3/`), ['임계값'])).toBe(1);
    expect(tierOf(entry('learn', '1-2-1 컴퓨터의 눈', `${BASE}learn/u1/1-2-1/`), ['임계값'])).toBe(2);
  });

  it('원고 정정 목록은 정정을 찾을 때가 아니면 뒤로 미룬다(3)', () => {
    const corrections = entry('teacher', '교과서 원고 정정 목록', `${BASE}teacher/corrections/`);
    expect(tierOf(corrections, ['NameError'], 'NameError')).toBe(3);
    expect(tierOf(corrections, ['원고 정정'], '원고 정정')).toBeLessThan(3);
  });

  it('anchorKey: #위치를 글자·숫자만 남긴 소문자로', () => {
    expect(anchorKey(`${BASE}help/errors/#name-error`)).toBe('nameerror');
    expect(anchorKey(`${BASE}help/`)).toBe('');
  });
});

describe('항목 고르기(pickAnchoredResult)의 새 규칙', () => {
  const errors: PagefindResultData = {
    url: `${BASE}help/errors/`,
    excerpt: '쪽 요약',
    meta: { title: '파이썬 오류 사전' },
    sub_results: [
      { title: '오류 메시지 읽는 법', url: `${BASE}help/errors/#errors-how-title`, excerpt: '예: <mark>NameError</mark>' },
      { title: '정해 준 적이 없는 이름을 썼어요', url: `${BASE}help/errors/#name-error`, excerpt: '<mark>NameError</mark>: name' },
    ],
  };

  it('제목이 한글 풀이인 오류 항목은 id(#name-error)로 찾는다 — 엉뚱한 첫 항목으로 이어지지 않는다 (R1-013)', () => {
    expect(pickAnchoredResult(errors, 'NameError').url).toBe(`${BASE}help/errors/#name-error`);
  });

  it('"임계값 뜻"처럼 말투가 섞여도 항목 제목이 낱말로 시작하는 항목을 고른다', () => {
    const glossary: PagefindResultData = {
      url: `${BASE}glossary/`,
      excerpt: '',
      meta: { title: '용어사전' },
      sub_results: [
        { title: '픽셀 Pixel', url: `${BASE}glossary/#pixel`, excerpt: '' },
        { title: '임계값 Threshold', url: `${BASE}glossary/#threshold`, excerpt: '<mark>임계값</mark>' },
      ],
    };
    expect(pickAnchoredResult(glossary, '임계값 뜻').url).toBe(`${BASE}glossary/#threshold`);
  });
});

describe('평가와 순서(evaluateResult · orderEvaluated)', () => {
  const page = (title: string, path: string, excerpt: string): PagefindResultData => ({
    url: `${BASE}${path}`,
    excerpt,
    meta: { title },
  });

  it('우연히 걸린 글은 빼고, 용어사전 항목 > 제목에 낱말 > 그 밖 차례로 늘어 놓는다(같은 차례는 받은 순서)', () => {
    const plan = planSearch('임계값 뜻');
    expect(plan).not.toBeNull();
    const list = [
      page('1-2-1 컴퓨터의 눈', 'learn/u1/1-2-1/', '코드 <mark>임계값</mark> 설정'),
      page('V3 보충 임계값으로 나누기', 'learn/u1/v3/', '<mark>임계값으로</mark> 나누기'),
      page('사이트 설정', 'settings/', '<mark>이</mark> 브라우저에만'),
      {
        url: `${BASE}glossary/`,
        excerpt: '',
        meta: { title: '용어사전' },
        sub_results: [{ title: '임계값 Threshold', url: `${BASE}glossary/#threshold`, excerpt: '<mark>임계값</mark>' }],
      },
    ].map((data) => evaluateResult(data, plan!, config, 'https://example.invalid'));
    const ordered = orderEvaluated(list);
    expect(ordered.map((card) => card.title)).toEqual(['임계값 Threshold — 용어사전', 'V3 보충 임계값으로 나누기', '1-2-1 컴퓨터의 눈']);
  });

  it('searchPlanned: 본 검색 결과가 앞, 덧붙임 결과가 뒤, 같은 쪽은 한 번만', async () => {
    const make = (ids: string[]) => ({ results: ids.map((id) => ({ id, data: async () => ({ url: id, excerpt: '' }) })) });
    const pagefind = { search: async (term: string) => (term === '수행평가' ? make(['a', 'b']) : make(['b', 'c'])) };
    const merged = await searchPlanned(pagefind, ['수행평가', '과정 중심 평가']);
    expect(merged.map((result) => result.id)).toEqual(['a', 'b', 'c']);
  });
});
