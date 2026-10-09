/**
 * 출력 칸 위의 한 줄 설명(판 1.3.0 검수 R1-101).
 *
 * 첫 실습의 결과는 검은 상자에 흰 가는 선뿐이라, 처음 보는 학생이 "이게 성공인가?"를 알기 어렵다. 설명은 코드 위 주석에만 있었다.
 * 예제 id(파일 이름에서 온 값)마다 한 줄을 정해 두고, 영상처리 실습실(vision-lab.ts)이 예제가 바뀔 때마다 출력 칸 제목 아래에 보인다.
 * 없는 예제는 숨는다. 글은 고1 눈높이로 한두 문장, 위치 말("왼쪽·오른쪽")은 휴대폰에서 칸이 위아래로 쌓이므로 쓰지 않는다.
 */
export const OUTPUT_HINTS: Readonly<Record<string, string>> = Object.freeze({
  'first-edge': '입력 영상에서 밝기가 크게 바뀌는 곳만 흰 선(에지)으로 나오면 성공이에요. 조절 패널의 threshold 막대를 움직이면 선이 많아지고 적어져요.',
});

/** 예제 id에 맞는 출력 설명(없으면 빈 글) */
export function outputHintFor(exampleId: string | null | undefined): string {
  if (exampleId === null || exampleId === undefined) {
    return '';
  }
  return OUTPUT_HINTS[exampleId] ?? '';
}
