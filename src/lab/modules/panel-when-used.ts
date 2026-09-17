/**
 * 흉내 모듈 패널을 "그 모듈을 쓸 때만" 연다(2026-09-17 Phase 2 검토 반영, 절대 원칙 4 "한 페이지 한 개념").
 *
 * 왜: 예전에는 mount 때 무조건 showPanel()을 불러서, 에지 검출 첫 실습(슬라이더 2개)을 연 학생의 조절 패널 아래로
 * 인식(mediapipe) 슬라이더 4개·고르기 상자·체크상자·긴 설명과 음성 인식 입력칸이 줄줄이 이어졌다. 조절 패널 영역이
 * 2,400px을 차지해 결과·슬라이더를 찾는 스크롤 거리가 두 배가 됐다.
 *
 * 규칙: 코드에 그 모듈의 이름이 보이면 열고, 안 보이면 닫는다. 파이썬이 실제로 그 모듈을 쓰면(요청·이벤트 도착)
 * show()로 못 박아 코드를 고쳐도 닫히지 않는다. 실행 중에는 닫지 않는다(코드를 고치는 중일 수 있다).
 * 오류 풀이(errors)·가상 데스크톱(desktop)은 이미 같은 방식이고, 러너 공통(runtime-extras)은 **실행 전에**
 * [파일 넣기]로 파일을 넣어야 해서 늘 열어 둔다.
 */
import type { LabModuleContext } from './types.ts';

export interface PanelWhenUsed {
  /** 파이썬이 실제로 썼다 — 이제부터 계속 연다 */
  show(): void;
}

export function showPanelWhenUsed(context: LabModuleContext, pattern: RegExp): PanelWhenUsed {
  let forced = false;

  const sync = (code: string): void => {
    if (forced || pattern.test(code)) {
      context.showPanel();
      return;
    }
    if (context.runtime.state === 'running' || context.runtime.state === 'stopping') {
      return;
    }
    context.hidePanel();
  };

  context.onLab('code', ({ code }) => sync(code));
  sync(context.lab.getCode());

  return {
    show() {
      forced = true;
      context.showPanel();
    },
  };
}
