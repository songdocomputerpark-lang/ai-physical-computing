/**
 * 가린 편집본 교안(PD-31) — 차시 frontmatter handouts가 가리키는 문서의 제목과 자리(교사용 자료실 P5-14가 파일을 넣는다).
 *
 *   handouts:
 *     - { doc: bt, pages: "41~47" }          ← 블루투스 통신 수업 교안(가린 편집본)의 41~47쪽
 *     - { doc: ppt, pages: "14·15", note: 원 그리기 슬라이드 }
 *
 * 파일이 public/에 있으면 교사용 접기에 [편집본 열기](해당 쪽으로 바로 — PDF 주소 끝 #page=)가 생기고, 없으면 "교사용 자료실에 준비 중"이라고 보인다.
 * 그래서 차시를 쓰는 사람은 쪽만 적고, 편집본을 만드는 사람(P5-14)은 아래 file 자리에 PDF를 넣기만 하면 모든 차시의 링크가 저절로 열린다.
 * 원본 PDF·PPTX는 올리지 않는다(PD-31, C6). 편집본은 외부 홍보 그림 속 인물 얼굴·기관 경로·사적인 파일명·기기 주소·학급 게시물·바탕화면을 가리고
 * 메타데이터를 지운 뒤 쪽마다 눈 확인 기록을 남긴 것만 둔다(PLAN §9.3 6번, P5-14). 저자 본인 얼굴(O9)과 표지 학교명(O11)은 운영자 답대로 가리지 않았다. 저장소 검사의 허용 목록(scripts/repo-allowlist.yaml)에도 적어야 커밋된다.
 */
import type { HANDOUT_DOC_IDS } from '../../config/content-schemas.ts';

export type HandoutDocId = (typeof HANDOUT_DOC_IDS)[number];

export interface HandoutDoc {
  /** 화면 이름 */
  readonly title: string;
  /** public/ 아래 파일 경로(사이트 뿌리 기준, 앞 / 없음) */
  readonly file: string;
}

export const HANDOUT_DOCS: Readonly<Record<HandoutDocId, HandoutDoc>> = Object.freeze({
  bt: { title: '블루투스 통신 수업 교안(가린 편집본)', file: 'teacher/handouts/bt-lesson-plan-redacted.pdf' },
  ppt: { title: 'PyAutoGUI 수업 슬라이드(가린 편집본)', file: 'teacher/handouts/pyautogui-slides-redacted.pdf' },
});

/** 쪽 글자에서 첫 쪽 번호. "41~47" → 41, "20·26" → 20. 숫자가 없으면 undefined */
export function firstHandoutPage(pages: string): number | undefined {
  const match = /\d+/u.exec(pages);
  return match ? Number(match[0]) : undefined;
}

/** 편집본 링크 주소(base 없는 사이트 뿌리 경로 + #page=첫 쪽) */
export function handoutPath(doc: HandoutDocId, pages: string): string {
  const page = firstHandoutPage(pages);
  return `/${HANDOUT_DOCS[doc].file}${page === undefined ? '' : `#page=${page}`}`;
}
