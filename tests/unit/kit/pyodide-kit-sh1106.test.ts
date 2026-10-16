// 판 1.5.0 구역 K3a — 키트 장치 도감 2.08 OLED 1.3인치(SH1106) 예제 두 개가 가상 보드에서 돈다(Node의 실제 Pyodide, JSPI).
// 단계는 tests/unit/lab/helpers/board-steps/kit-sh1106.mjs. 전에는 sh1106 흉내가 robert-hh 판의 넷째 자리 res를 몰라
// TypeError("got multiple values for argument 'addr'")로 멈춰 real-only였다(scripts/kit/kit-classification.yaml d-2-08).
import { describe, expect, it } from 'vitest';
import { boardPyodideReady, runBoardSteps, stepOf, type BoardDeviceEventRecord } from '../lab/helpers/pyodide-board.ts';

interface OledState {
  on?: boolean;
  texts?: { text: string }[];
}

/** 이 단계에서 가상 OLED가 보인 글자 모두(차례대로, 같은 글은 한 번) */
function oledTexts(devices: readonly BoardDeviceEventRecord[] | undefined): string[] {
  const seen: string[] = [];
  for (const device of devices ?? []) {
    if (device.part !== 'oled-i2c') {
      continue;
    }
    for (const item of (device.state as OledState | undefined)?.texts ?? []) {
      if (!seen.includes(item.text)) {
        seen.push(item.text);
      }
    }
  }
  return seen;
}

describe.skipIf(!boardPyodideReady)('키트 장치 도감 2.08 OLED 1.3인치(SH1106) — 가상 보드(실제 Pyodide, JSPI)', () => {
  const out = runBoardSteps('tests/unit/lab/helpers/board-steps/kit-sh1106.mjs');

  it('1단계(글자·도형·반전)·2단계(로딩 막대)가 오류 없이 돌다가 [정지]로 멈추고, 가상 OLED에 글자가 나온다', () => {
    const first = stepOf(out, 'kit_2_08_step1');
    expect(first.errorType, first.errorText).toBe('KeyboardInterrupt');
    expect(first.stdout).toContain('1.3 OLED 테스트 시작');
    expect(oledTexts(first.devices)).toEqual(expect.arrayContaining(['Hello Brixel!', 'OLED 1.3 inch', 'SH1106 driver']));

    const second = stepOf(out, 'kit_2_08_step2');
    expect(second.errorType, second.errorText).toBe('KeyboardInterrupt');
    expect(second.stdout).toContain('로딩 막대 시작');
    expect(oledTexts(second.devices)).toContain('Loading...');
    expect((second.devices ?? []).some((device) => device.part === 'oled-i2c' && (device.state as OledState | undefined)?.on === true)).toBe(true);
  });

  it('두 인자 차례를 모두 받는다: robert-hh 판(넷째 자리 res)과 교과서 판(넷째 자리 주소·다섯째 external_vcc)', () => {
    const record = stepOf(out, 'sh1106_argument_orders');
    expect(record.errorType, record.errorText).toBeUndefined();
    // a: (…, None, addr=0x3C) / b: 리셋 핀 — reset() 뒤 1 / c: 교과서 판 (…, 0x3C, True) / d: 이름으로 addr
    expect(record.value).toEqual([0x3c, true, 0x3c, true, 1, 0x3c, true, true, 0x3c, false]);
  });
});
