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
 *
 * 조건 하나 더(options.also): 코드만으로는 모자랄 때 쓴다. 예) ESP32 실습실의 USB 데이터 포트 칸은 코드가 UART를 써도
 * [실제 보드] 탭일 때만 연다 — 가상 보드는 선(브릿지)으로 이어지므로 실물 포트 단추가 필요 없는데, 보이면 눌러 보게 된다
 * (2026-09-25 Phase 4 검토 반영). 그 조건이 실습실 뿌리 속성에 달려 있으면 watchAttributes에 적어 바뀔 때 다시 판정한다.
 */
import type { LabModuleContext } from './types.ts';

export interface PanelWhenUsedOptions {
  /** 코드 조건과 함께 참이어야 연다(없으면 코드 조건만) */
  readonly also?: () => boolean;
  /** 실습실 뿌리의 이 속성들이 바뀌면 다시 판정한다(예: 'data-run-target') */
  readonly watchAttributes?: readonly string[];
}

export interface PanelWhenUsed {
  /** 파이썬이 실제로 썼다(또는 학생이 그 칸을 조작했다) — 이제부터 계속 연다 */
  show(): void;
  /** 지금 코드로 다시 판정한다(조건이 바뀌었을 때) */
  refresh(): void;
  /** 속성 지켜보기를 푼다(모듈 dispose에서) */
  dispose(): void;
}

export function showPanelWhenUsed(context: LabModuleContext, pattern: RegExp, options: PanelWhenUsedOptions = {}): PanelWhenUsed {
  let forced = false;

  const sync = (code: string): void => {
    if (forced || (pattern.test(code) && (options.also?.() ?? true))) {
      context.showPanel();
      return;
    }
    if (context.runtime.state === 'running' || context.runtime.state === 'stopping') {
      return;
    }
    context.hidePanel();
  };

  context.onLab('code', ({ code }) => sync(code));
  let observer: MutationObserver | null = null;
  const watched = options.watchAttributes ?? [];
  if (watched.length > 0 && typeof MutationObserver === 'function') {
    observer = new MutationObserver(() => sync(context.lab.getCode()));
    observer.observe(context.root, { attributes: true, attributeFilter: [...watched] });
  }
  sync(context.lab.getCode());

  return {
    show() {
      forced = true;
      context.showPanel();
    },
    refresh() {
      sync(context.lab.getCode());
    },
    dispose() {
      observer?.disconnect();
      observer = null;
    },
  };
}
