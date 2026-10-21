/**
 * 오류 사전 글 안의 사이트 링크(판 1.6.0 C176) — 풀이 글(why·fix·mistakes)에 `[글자](/사이트/안/주소/)`를 쓰면 실습실 오류 카드와
 * 오류 사전 페이지가 링크로 그린다. 막힌 바로 그 순간에 "보드 준비 페이지"를 찾아 머리글 메뉴로 헤매지 않게(걷기 보고 walk-student-board 2).
 *
 * 규칙(작게 유지)
 * - 모양은 마크다운 링크 하나뿐: `[보이는 글](/start/board/#port-not-found)`. 주소는 `/`로 시작하는 사이트 안 경로(base 없음 — 그리는 쪽이 withBase로 붙인다).
 *   사이트 밖 주소(https:)와 `//`로 시작하는 주소는 링크가 아니다(검사가 알려 준다).
 * - 버튼 이름을 가리키는 `[보드 연결]` 같은 대괄호는 바로 뒤에 `(`가 없으므로 그냥 글이다.
 * - 이 파일은 브라우저 번들·빌드·Node 테스트가 함께 쓰는 순수 함수다(DOM·withBase·yaml을 쓰지 않는다).
 */

/** 링크 한 개: [보이는 글](/주소/) — 보이는 글에는 `]`와 줄바꿈이 없고, 주소는 `/`로 시작하며 공백과 `)`가 없다 */
const LINK_PATTERN = /\[([^\]\n]+)\]\((\/(?!\/)[^\s)]*)\)/gu;

/** 글을 자른 한 조각: 링크가 아니면 text만, 링크면 href(base 없는 사이트 안 경로)도 있다 */
export interface TextPiece {
  readonly text: string;
  readonly href?: string;
}

/** 이 글에 링크 모양이 하나라도 있는지 */
export function hasLinkText(text: string): boolean {
  LINK_PATTERN.lastIndex = 0;
  const found = LINK_PATTERN.test(text);
  LINK_PATTERN.lastIndex = 0;
  return found;
}

/** 글을 링크 조각과 보통 글 조각으로 자른다(빈 조각은 만들지 않는다). 링크가 없으면 글 전체가 한 조각. */
export function splitLinkText(text: string): TextPiece[] {
  const pieces: TextPiece[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK_PATTERN)) {
    const at = match.index ?? 0;
    if (at > last) {
      pieces.push({ text: text.slice(last, at) });
    }
    pieces.push({ text: match[1] ?? '', href: match[2] ?? '' });
    last = at + match[0].length;
  }
  if (last < text.length) {
    pieces.push({ text: text.slice(last) });
  }
  return pieces.length === 0 ? [{ text }] : pieces;
}

/** 링크 모양을 보이는 글만 남긴 보통 글(검색·콘솔 요약·글자 수 세기용) */
export function plainLinkText(text: string): string {
  return text.replace(LINK_PATTERN, '$1');
}

/**
 * `](`가 있는데 위 링크 모양이 아닌 곳(주소가 `/`로 시작하지 않음, 닫는 괄호 없음 …)을 찾아 한국어 까닭으로 돌려준다. 없으면 빈 목록.
 * 데이터 검사(catalog-schema.ts)가 쓴다 — 사이트 밖 주소나 base까지 적은 주소가 말없이 글자로 남는 것을 막는다.
 */
export function brokenLinkProblems(text: string): string[] {
  const problems: string[] = [];
  const without = text.replace(LINK_PATTERN, '');
  for (const match of without.matchAll(/\]\(([^)\s]*)/gu)) {
    problems.push(`글 속 링크 "](${match[1] ?? ''}"는 [보이는 글](/사이트/안/주소/) 모양이어야 해요(주소는 /로 시작하고 사이트 밖 주소는 쓸 수 없어요).`);
  }
  return problems;
}
