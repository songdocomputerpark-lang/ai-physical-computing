/**
 * 화면 표기 한 곳(판 1.6.0, DECISIONS C173 — 걷기 조사 T4 "같은 것에 이름·숫자가 둘 이상"). 순수 함수만 둔다(tests/unit/display-names.test.ts).
 *
 * 처음 온 사람은 같은 것을 다른 모양으로 보면 다른 것으로 읽었다: "8~12쪽"과 "008~012쪽", "1단원"과 "I.", 같은 쪽의 "교과서"와 "교과서 원문".
 * 그래서 화면에 나가는 표기는 아래 함수 하나로 만든다. 홈·따라 하기 목록·차시 머리·전환 줄·교과서 쪽 알약·교사용 자료실이 모두 이것을 쓴다.
 *
 * - 쪽 범위: 출판본 쪽 번호를 앞 0 없이 "8~12"로(옛 원고 표기 "008~012"도 같은 글이 된다). 숫자가 아닌 표기("파일명 p55")는 그대로 둔다.
 *   값 자체(어느 쪽부터 어느 쪽까지)는 교과서 쪽(content/book/<id>.md의 pages — 출판본)이 기준이다. 짝 웹 차시의 pages와 차례표(curriculum.ts)는
 *   같은 값을 적고 tests/unit/book/pages-one-set.test.ts가 셋을 대조한다(C137 "출판본 한 벌").
 * - 단원 이름: "1단원 영상 처리 인공지능"(로마 숫자는 큰 제목 앞 번호에만 — C127). 빵부스러기·왼쪽 차시 목록 제목·검색 결과 위치·지도 요약 제목이 쓴다.
 * - 같은 절의 두 쪽 이름: "교과서 원문"(출판본 그대로, /book/)과 "따라 하기"(코드를 직접 실행하며 따라 하는 쪽, /learn/) — 메뉴 이름(nav.ts)과 같은 글.
 */
import { getLearnUnit, getPage, learnUnits } from '../config/nav.ts';

/** 쪽 번호 사이 글(~·,) 앞뒤 공백을 걷고 숫자의 앞 0을 뗀다: "008~012" → "8~12", " 124 ~ 131 " → "124~131". 숫자가 아닌 글은 그대로 */
export function formatPageRange(pages: string): string {
  const trimmed = pages.trim();
  if (!/^\d+(?:\s*[~·,-]\s*\d+)*$/u.test(trimmed)) {
    return trimmed;
  }
  return trimmed.replace(/\s*([~·,-])\s*/gu, '$1').replace(/\d+/gu, (digits) => String(Number(digits)));
}

/** "8~12쪽"(숫자가 아닌 표기는 쪽을 붙이지 않고 그대로). 값이 없으면 undefined */
export function pageRangeText(pages: string | undefined): string | undefined {
  if (pages === undefined || pages.trim() === '') {
    return undefined;
  }
  const formatted = formatPageRange(pages);
  return /^\d/u.test(formatted) ? `${formatted}쪽` : formatted;
}

/** "교과서 8~12쪽" — 교과서 쪽 알약·홈 카드·교과서 차례가 쓴다 */
export function textbookPagesText(pages: string): string {
  return `교과서 ${pageRangeText(pages) ?? pages}`;
}

/** 같은 절의 두 쪽 이름(메뉴 이름과 같은 글): 교과서 원문(/book/) · 따라 하기(/learn/) */
export function bookViewName(): string {
  return getPage('book').label;
}
export function lessonViewName(): string {
  return getPage('learn').label;
}

/** 전환 줄의 교과서 쪽 단추 글: "교과서 원문 8~12쪽"(쪽을 모르면 "교과서 원문") */
export function bookViewLabel(pages: string | undefined): string {
  const range = pageRangeText(pages);
  return range ? `${bookViewName()} ${range}` : bookViewName();
}

/** "1단원"(로마 숫자 없이 — C127) */
export function unitNumberName(unit: number): string {
  return `${unit}단원`;
}

/** 단원의 주제 이름: "영상 처리 인공지능"(사이트 지도 nav.ts의 큰 제목에서 로마 숫자 번호를 뗀 것) */
export function unitTopic(unit: number): string {
  return getLearnUnit(unit).label.replace(/^[IVX]+\.\s*/u, '');
}

/** "1단원 영상 처리 인공지능" — 빵부스러기·왼쪽 목록 제목·차시 머리의 단원 줄·검색 결과 위치·지도 요약 제목 */
export function unitName(unit: number): string {
  return `${unitNumberName(unit)} ${unitTopic(unit)}`;
}

/** 검색 결과·자동 완성의 위치 줄("따라 하기 › 1단원 영상 처리 인공지능")에 쓰는 대단원 이름 표 — 옛 "I. …"(B-50) */
export function unitTrailSections(): { path: string; label: string }[] {
  return learnUnits.map((unit) => ({ path: unit.path, label: unitName(unit.unit) }));
}

/** 대단원 마무리 차시 번호("I-마무리" … "IV-마무리")가 몇 단원인지. 아니면 undefined */
export function reviewUnitOf(label: string): number | undefined {
  const numeral = /^(I{1,3}|IV)-마무리$/u.exec(label.trim())?.[1];
  return numeral ? ({ I: 1, II: 2, III: 3, IV: 4 } as Readonly<Record<string, number>>)[numeral] : undefined;
}
