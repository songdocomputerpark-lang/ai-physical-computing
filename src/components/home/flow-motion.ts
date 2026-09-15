/**
 * 홈 흐름 그림의 움직임 상태(PLAN §8.1 P1-05).
 *
 * 저절로 5초보다 오래 움직이는 그림은 사용자가 멈출 수 있어야 한다(WCAG 2.2 성공 기준 2.2.2 멈춤·정지·숨김).
 * 그래서 그림은 정해진 횟수만 돌고 완성 그림에서 멈추며, 도는 동안에는 [그림 멈추기], 멈춘 뒤에는 [그림 다시 보기] 버튼을 둔다.
 * 운영체제의 "동작 줄이기" 설정이나 사이트 설정(<html data-motion="reduce">)이면 처음부터 움직이지 않고 버튼도 숨긴다.
 *
 * 상태(figure의 data-state)
 *   static   움직이지 않는 완성 그림(동작 줄이기 설정, 자바스크립트가 돌기 전)
 *   playing  움직이는 중(CSS 애니메이션은 이 상태에서만 붙는다)
 *   paused   사용자가 멈춤(완성 그림으로 보인다)
 *   ended    정해진 횟수를 다 돌고 끝남(완성 그림)
 *
 * 화면(DOM)을 다루는 코드는 FlowIllustration.astro의 <script>에 있고, 여기에는 단위 테스트할 수 있는 규칙만 둔다.
 */
export type FlowMotionState = 'static' | 'playing' | 'paused' | 'ended';

/** 버튼에 보이는 이름. 화면 낭독기도 이 글자를 읽는다. */
export const FLOW_TOGGLE_LABELS = Object.freeze({
  pause: '그림 멈추기',
  replay: '그림 다시 보기',
});

/** 지금 상태에서 버튼에 보일 이름 */
export function toggleLabel(state: FlowMotionState): string {
  return state === 'playing' ? FLOW_TOGGLE_LABELS.pause : FLOW_TOGGLE_LABELS.replay;
}

/** 버튼을 눌렀을 때 바뀔 상태: 움직이는 중이면 멈추고, 아니면 처음부터 다시 움직인다. */
export function nextStateOnToggle(state: FlowMotionState): 'playing' | 'paused' {
  return state === 'playing' ? 'paused' : 'playing';
}

/** 저절로 움직여도 되는지: 운영체제 "동작 줄이기"도, 사이트 설정 data-motion="reduce"도 아닐 때만 */
export function canAnimate(options: { prefersReducedMotion: boolean; siteMotion?: string | null }): boolean {
  return !options.prefersReducedMotion && options.siteMotion !== 'reduce';
}

/** 상태 값이 올바른지(data-state에서 읽은 글자를 좁힐 때 쓴다). 모르는 값이면 static으로 본다. */
export function parseFlowState(value: string | undefined | null): FlowMotionState {
  return value === 'playing' || value === 'paused' || value === 'ended' ? value : 'static';
}
