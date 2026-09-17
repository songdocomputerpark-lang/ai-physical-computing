// 복원한 팬 모터 라이브러리 gorillacell_dcmotors.py(PWM판) — 원고 169쪽 스크린숏의 규칙(1000Hz·speed 0~100 → duty 0~1023)을 실제 Pyodide로 확인(P3-05 구역 C).
// machine.PWM은 구역 A가 만들므로 단계 파일이 duty 호출을 적어 두는 시험용 PWM을 쓴다(tests/unit/board-uart/steps/gorillacell.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { boardPyodideReady, REPO_ROOT, runBoardSteps, stepOf } from '../lab/helpers/pyodide-board.ts';

const LIBRARY = path.join(REPO_ROOT, 'examples', 'esp32', 'lib', 'third-party', 'gorillacell_dcmotors.py');

describe('gorillacell_dcmotors.py 복원본(글자 검사)', () => {
  const source = fs.readFileSync(LIBRARY, 'utf8');
  const code = source.split('\n').filter((line) => !line.startsWith('#'));

  it('머리말 주석 다음의 코드 20줄이 원고 169쪽 스크린숏과 같다', () => {
    expect(code.slice(0, 20)).toEqual([
      'from machine import Pin, PWM',
      '',
      'class GORILLACELL_DCMOTORS:',
      '    def __init__(self, pin1, pin2, freq=1000):',
      '        self.pwm1 = PWM(Pin(pin1), freq=freq)',
      '        self.pwm2 = PWM(Pin(pin2), freq=freq)',
      '        self.stop()',
      '',
      '    def rotate(self, direction, speed=100):',
      '        """',
      "        direction: 'cw' (시계방향), 'ccw' (반시계방향)",
      '        speed: 0~100 (%) 사이로 속도 설정',
      '        """',
      '        duty = int(1023 * (max(0, min(speed, 100)) / 100))',
      '',
      "        if direction == 'cw':",
      '            self.pwm1.duty(duty)',
      '            self.pwm2.duty(0)',
      "        elif direction == 'ccw':",
      '            self.pwm1.duty(0)',
    ]);
  });

  it('머리말에 복원 근거(원고 쪽·잘린 줄·디지털판과 다른 점·원 출처)가 있고, 줄 끝은 LF다', () => {
    expect(source).not.toContain('\r');
    const header = source.split('\n').filter((line) => line.startsWith('#')).join('\n');
    for (const needle of ['169쪽', '20번째 줄에서 잘려', 'Library-6.20', 'TechToTinker', 'George Bantique']) {
      expect(header).toContain(needle);
    }
  });
});

describe.skipIf(!boardPyodideReady)('gorillacell_dcmotors.py 복원본(실제 Pyodide, JSPI)', () => {
  const out = runBoardSteps('tests/unit/board-uart/steps/gorillacell.mjs');

  it('원고 169쪽 사이트판(f074의 줄 번호를 뺀 코드): 1000Hz, cw 1023 → ccw 1023 → 정지', () => {
    const record = stepOf(out, 'f074_site');
    expect(record.errorType).toBeUndefined();
    expect(record.value).toEqual([
      ['new', 25, 1000],
      ['new', 26, 1000],
      ['duty', 25, 0],
      ['duty', 26, 0],
      ['duty', 25, 1023],
      ['duty', 26, 0],
      ['duty', 25, 0],
      ['duty', 26, 1023],
      ['duty', 25, 0],
      ['duty', 26, 0],
    ]);
  });

  it('원본 f075 파일 그대로: 정지 → speed 30(duty 306) → speed 70(duty 716)', () => {
    expect(stepOf(out, 'f075_file').errorType).toBe('KeyboardInterrupt');
    const log = stepOf(out, 'f075_log').value as [string, number, number][];
    const duties = log.filter(([kind, gpio]) => kind === 'duty' && gpio === 25).map(([, , duty]) => duty);
    expect(duties.slice(0, 4)).toEqual([0, 0, 306, 716]);
  });

  it('speed는 0~100으로 자르고, 모르는 방향은 아무것도 하지 않으며, freq를 바꿀 수 있다', () => {
    const record = stepOf(out, 'library_rules');
    expect(record.errorType).toBeUndefined();
    expect(record.value).toEqual([
      ['new', 25, 500],
      ['new', 26, 500],
      ['duty', 25, 0],
      ['duty', 26, 0],
      ['duty', 25, 1023],
      ['duty', 26, 0],
      ['duty', 25, 0],
      ['duty', 26, 0],
      ['duty', 25, 409],
      ['duty', 26, 0],
    ]);
  });
});
