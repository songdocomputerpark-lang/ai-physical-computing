/**
 * 키트 장치 쪽 왼쪽 장치 목록의 처음 스크롤 위치(판 1.7.0, 미해결 264 #20) — 쪽 스크립트(브라우저)가 쓰는 순수 함수라
 * 다른 모듈을 import하지 않는다. kit-sidebar.ts(빌드 때 목록 만들기)는 kit-view·kit-schema를 거쳐 yaml까지 끌고 와
 * 쪽 스크립트가 거기서 가져오면 빌드 전용 의존성이 배포 번들에 들어간다(출처 검사가 멈춤).
 */

/** 장치 목록 스크롤 칸의 길이들(px). 모두 칸 안쪽 맨 위를 0으로 잰 값이다. */
export interface KitNavScrollInput {
  /** 지금 장치가 든 장(章) 묶음의 위 */
  readonly groupTop: number;
  /** 지금 장치 항목의 위·아래 */
  readonly currentTop: number;
  readonly currentBottom: number;
  /** 스크롤 칸이 보여 주는 높이 */
  readonly viewport: number;
}

/**
 * 장치 목록을 처음 열 때의 스크롤 위치(판 1.7.0, 미해결 264 #20 — 걷기 보고 walk-kit-user 20).
 * 지금 장치를 칸 가운데로 맞추면 위쪽의 "키트 장치 도감 첫 쪽"·장 제목이 반쯤 잘려 처음 온 학생이 위에 더 있는지 몰랐다.
 *   1) 지금 장치가 처음 한 화면 안에 있으면 맨 위(0)부터 — 아무것도 잘리지 않는다.
 *   2) 아니면 장 제목부터 지금 장치까지가 한 화면에 들어오면 장 제목이 맨 위에 오게 — 잘리는 곳이 장 경계라 깨끗하다.
 *   3) 그것도 안 되면(장이 길고 지금 장치가 깊음) 지금 장치가 위에서 40% 자리에 오게 — 위아래 모두 이어짐이 보인다.
 */
export function kitNavScrollTop(input: KitNavScrollInput): number {
  const { groupTop, currentTop, currentBottom, viewport } = input;
  if (viewport <= 0) {
    return 0;
  }
  if (currentBottom <= viewport) {
    return 0;
  }
  if (currentBottom - groupTop <= viewport) {
    return Math.max(0, Math.round(groupTop));
  }
  return Math.max(0, Math.round(currentTop - viewport * 0.4));
}
