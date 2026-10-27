/**
 * 진짜 PC 쪽 라이브러리 판을 마지막으로 확인한 날(판 1.8.0 — DECISIONS O22·C234).
 *
 * 교사용 "진짜 PC에서 돌리기"(content/teacher/real-pc.md)의 frontmatter `checked`와 같은 날이어야 한다
 * (tests/unit/lab/example-revisions.test.ts가 대조). 판 번호를 다시 확인하면 두 곳을 함께 고친다.
 * 차시 위 "교과서와 다른 곳" 상자(LessonRevisions.astro)가 이 날짜와 그 쪽 링크를 보인다.
 */
export const PC_VERSIONS_CHECKED = '2026-10-27';

/** 판 번호 표가 있는 교사용 쪽의 자리(사이트 안 주소, withBase 전) */
export const PC_VERSIONS_PATH = 'teacher/real-pc/#판-번호-한눈에-보기';

/** "2026-10-26" → "2026년 10월 26일"(모양이 다르면 그대로) */
export function koreanDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(iso);
  if (!match) {
    return iso;
  }
  return `${match[1]}년 ${Number(match[2])}월 ${Number(match[3])}일`;
}
