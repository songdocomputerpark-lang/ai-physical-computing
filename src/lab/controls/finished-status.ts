/**
 * 차시 안 실습실(높이 맞춤 틀)에서 실행이 끝난 뒤 상태 줄에 남기는 글(판 1.7.0 — 다시 걷기 walk-student-first N1 major).
 *
 * 왜: 차시 안 실습실은 [실행] 뒤에도 조작 줄과 코드를 화면에 남기는데(reveal.ts — 미해결 261 #14), 결과 콘솔은 그보다 1,200~1,750px 아래다.
 * 상태 줄은 실행이 끝나자마자 처음 글 "준비됐어요. [실행]을 눌러 봐요."로 돌아가 학생이 "아무 일도 없다"·"실패했다"로 읽었다.
 * 그래서 높이 맞춤 틀일 때만 상태 줄을 "끝났어요"로 두고, 결과가 화면 밖 콘솔에 있으면 조작 줄 바로 아래에 띄운 알림
 * ("콘솔에 결과가 나왔어요 + 마지막 줄 + [콘솔 보기 ↓]" — lab-shell.ts #renderConsoleOutputNotice)을 가리킨다.
 * 실습실 단독 쪽(/labs/vision/ 등)은 예전 그대로 처음 글로 돌아간다(이 글을 쓰지 않는다).
 * 다음 [실행]을 누르면 상태 줄은 "실행 중"으로 바뀐다.
 */
import type { RunResult } from '../runtime/client.ts';

export interface FinishedStatusContext {
  /** 콘솔이 화면 밖이라 조작 줄 아래 알림에 새 출력이 모였는가 */
  readonly outputBelow: boolean;
}

export function finishedStatusText(outcome: RunResult['outcome'], context: FinishedStatusContext): string {
  switch (outcome) {
    case 'ok':
      return context.outputBelow ? '실행이 끝났어요. 결과가 바로 아래에 나왔어요.' : '실행이 끝났어요.';
    case 'stopped':
      return context.outputBelow ? '[정지]로 멈췄어요. 그때까지 나온 결과는 바로 아래에 있어요.' : '[정지]로 멈췄어요.';
    case 'killed':
      return '멈추지 않아서 파이썬을 다시 시작했어요. 잠깐 뒤에 다시 실행할 수 있어요.';
    default:
      return '오류로 끝났어요. 까닭과 고치는 법은 아래에 있어요.';
  }
}
