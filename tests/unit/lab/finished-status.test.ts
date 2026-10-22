// 차시 안 실습실(높이 맞춤 틀)에서 실행이 끝난 뒤 상태 줄 글(판 1.7.0 — 다시 걷기 walk-student-first N1, src/lab/controls/finished-status.ts).
// 실제로 그 글을 쓰는지(높이 맞춤 틀일 때만)는 브라우저 시험 tests/e2e/lesson-embed.spec.ts가 본다.
import { describe, expect, it } from 'vitest';
import { finishedStatusText } from '../../../src/lab/controls/finished-status.ts';
import { STATE_TEXT } from '../../../src/lab/controls/lab-shell.ts';

describe('finishedStatusText', () => {
  it('잘 끝나면 "끝났어요", 결과가 화면 밖 콘솔에 있으면 조작 줄 바로 아래 알림을 가리킨다', () => {
    expect(finishedStatusText('ok', { outputBelow: true })).toBe('실행이 끝났어요. 결과가 바로 아래에 나왔어요.');
    expect(finishedStatusText('ok', { outputBelow: false })).toBe('실행이 끝났어요.');
  });

  it('멈춤·다시 시작·오류도 끝났다는 것을 말하고, 처음 글("준비됐어요. [실행]을 눌러 봐요.")과 다르다', () => {
    expect(finishedStatusText('stopped', { outputBelow: true })).toContain('바로 아래');
    expect(finishedStatusText('stopped', { outputBelow: false })).toBe('[정지]로 멈췄어요.');
    expect(finishedStatusText('killed', { outputBelow: false })).toContain('다시 시작했어요');
    expect(finishedStatusText('error', { outputBelow: true })).toBe('오류로 끝났어요. 까닭과 고치는 법은 아래에 있어요.');
    for (const outcome of ['ok', 'stopped', 'killed', 'error'] as const) {
      for (const outputBelow of [true, false]) {
        expect(finishedStatusText(outcome, { outputBelow })).not.toBe(STATE_TEXT.idle);
      }
    }
  });
});
