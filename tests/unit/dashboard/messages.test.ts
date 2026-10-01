// 대시보드 안내 글(src/lab/dashboard/messages.ts) — 판 1.1.1 최종 점검에서 고친 것.
// 스위치를 눌렀는데 아래 가상 보드의 LED가 바뀌지 않았을 때, 보드가 코드를 돌리는 중이면 "[실행]을 눌렀는지 봐요"라고 하지 않는다
// (보충 C2 바꿔보기 3의 ALLOW = ("on",)처럼 보드 코드가 받은 말을 일부러 거르는 실습이 있다).
import { describe, expect, it } from 'vitest';
import { dashText } from '../../../src/lab/dashboard/messages.ts';

describe('frameLedMissed', () => {
  it('보드가 돌지 않으면 [실행]을 눌렀는지 보라고 한다(지금까지와 같다)', () => {
    expect(dashText.frameLedMissed()).toContain('[실행]을 눌렀는지');
    expect(dashText.frameLedMissed(false)).toContain('[실행]을 눌렀는지');
  });

  it('보드가 도는 중이면 [실행] 대신 보드 콘솔(받은 말을 걸렀는지)을 보라고 한다', () => {
    const text = dashText.frameLedMissed(true);
    expect(text).not.toContain('[실행]');
    expect(text).toContain('보드는 돌고 있어요');
    expect(text).toContain('보드 콘솔');
  });
});
