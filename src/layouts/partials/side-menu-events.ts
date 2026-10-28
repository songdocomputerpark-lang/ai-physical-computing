/**
 * 왼쪽 메뉴판을 넓은 화면에서 접거나 폈을 때 document로 보내는 이벤트 이름(판 1.9.0 — detail = { open: boolean }).
 * 메뉴판이 접히면 차시·교과서·키트 장치 쪽의 본문 칸 차례(LessonSidebar)가 다시 보이므로, 그 목록을 지금 줄로 굴리는 스크립트
 * (src/components/lesson/lesson-progress.ts installLessonNav, 키트 장치 쪽의 alignKitNav)가 이 이벤트에 다시 돈다.
 * import 없는 파일이다 — 차시 쪽 스크립트가 메뉴판 코드를 끌어오지 않게.
 */
export const SIDE_MENU_TOGGLE_EVENT = 'apc:side-menu-toggle';
