// 가상 보드(CPython)에서는 되지만 실물 MicroPython에서는 안 되는 모양 안내(P3-08, src/lab/serial/compat.ts — PLAN §8.3 P3-00 차이 표 9번).
// 근거 문서: MicroPython v1.29.0 "Differences from CPython — Builtin types"(2026-09-18 확인).
import { describe, expect, it } from 'vitest';
import { findRealBoardCompatIssues } from '../../../src/lab/serial/compat.ts';

const codes = (code: string) => findRealBoardCompatIssues(code).map((issue) => `${issue.line}:${issue.code}`);

describe('findRealBoardCompatIssues', () => {
  it('실물에서 안 되는 모양을 줄 번호와 함께 찾는다', () => {
    const code = [
      "name = 'kim'.ljust(8)", // 1
      'back = word[::-1]', // 2
      'n = (255).bit_length()', // 3
      "text = data.decode('cp949')", // 4
      "text = data.decode(errors='ignore')", // 5
      'common = a.keys() & b.keys()', // 6
      "parts = line.rsplit(None, 1)", // 7
    ].join('\n');
    expect(codes(code)).toEqual(['1:str-ljust-rjust', '2:slice-step', '3:int-bit-length', '4:codec-args', '5:codec-args']);
    expect(findRealBoardCompatIssues(code, 10).map((issue) => issue.code)).toContain('rsplit-none');
    expect(findRealBoardCompatIssues(code, 10)).toHaveLength(7);
  });

  it('실물에서도 되는 모양·주석·글자 안은 건드리지 않는다', () => {
    const code = [
      "text = data.decode('utf-8')",
      "text = data.decode()",
      "raw = msg.encode('UTF8')",
      'part = items[1:3]',
      "print('[::-1] ljust( 는 글자 안')",
      '# back = word[::-1]',
      "label = '{:<8}'.format(name)",
      'matrix = [[1, 2], [3, 4]]',
      "doc = '''",
      'a[::2] 설명',
      "'''",
      'ok = d.keys()',
    ].join('\n');
    expect(findRealBoardCompatIssues(code)).toEqual([]);
  });

  it('교과서 ESP32 예제 모양(핀·sleep·format)에는 안내가 없다', () => {
    const lesson = "from machine import Pin\nimport time\nled = Pin(2, Pin.OUT)\nfor i in range(3):\n    led.value(not led.value())\n    print('LED: {}'.format(led.value()))\n    time.sleep(0.5)\n";
    expect(findRealBoardCompatIssues(lesson)).toEqual([]);
  });
});
