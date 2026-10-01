/**
 * 영상처리 실습실이 코드 글자만 보고 가르는 것(순수 함수 — 단위 테스트 tests/unit/lab/vision-code-uses.test.ts).
 */

/**
 * 코드가 영상(OpenCV 창·카메라)을 쓰나 — 주석 줄을 뺀 코드에 cv2가 보이면. numpy·OpenCV를 받는 동안의 안내에서 "영상이 여기에 나와요"를
 * 붙일지 가른다(판 1.1.1 최종 점검: 시리얼만 쓰는 3-1-2 컴퓨터 쪽 코드에도 "영상이 여기에 나와요"라고 했다).
 */
export function codeShowsVideo(code: string): boolean {
  const body = code
    .split('\n')
    .map((line) => (/^\s*#/u.test(line) ? '' : line))
    .join('\n');
  return /\bcv2\b/u.test(body);
}
