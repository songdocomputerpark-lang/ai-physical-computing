// 부품 touch-analog-4ch(4채널 아날로그 터치 센서) 단위 테스트 — README 7.5 "부품 하나 = 테스트 파일 하나", PLAN §6.1 "4채널 터치 값"·§6.2·§8.3 P3-03.
// 파이썬 ADC가 같은 전압을 688·1535·2381·3263으로 읽는지는 pyodide-board-pwm-adc.test.ts(실제 Pyodide)가 본다.
import { describe, expect, it } from 'vitest';
import { PART_DEFINITIONS, inputDrives, resolveWiring, withControlDrive } from '../../../src/lab/modules/board/parts.ts';
import touch4 from '../../../src/lab/modules/board/parts/touch-analog-4ch/part.ts';
import {
  RAW12_MAX,
  TOUCH4_IDLE,
  TOUCH4_PADS,
  TOUCH4_SITE_RANGES,
  millivoltsForRaw12,
  raw12FromMillivolts,
  touch4Millivolts,
  touch4Raw,
  touch4Visual,
} from '../../../src/lab/modules/board/parts/touch-analog-4ch/touch4-model.ts';
import { analogDrive } from '../../../src/lab/modules/board/state.ts';
import { instanceOf, snapshotWith } from './helpers/board-snapshot.ts';

describe('부품: 4채널 아날로그 터치 센서(touch-analog-4ch)', () => {
  it('바깥 입력 부품: 신호(아날로그) 1핀, 기본 GPIO32(원고의 4채널 예제 모두), 누르기는 조작 칸(controls)으로 — interaction은 없다', () => {
    expect(touch4.pins).toEqual([{ role: 'sig', label: '신호(아날로그)', direction: 'in' }]);
    expect(touch4.defaultPins).toEqual({ sig: 32 });
    expect(touch4.interaction).toBeUndefined();
    expect(typeof touch4.controls).toBe('function');
  });

  it('패드 값은 원고 139쪽 측정값, 누르지 않으면 0 — 그 값이 그대로 읽히는 정수 전압(mV)을 건다', () => {
    expect(TOUCH4_PADS.map((pad) => [pad.number, pad.raw])).toEqual([
      [1, 688],
      [2, 1535],
      [3, 2381],
      [4, 3263],
    ]);
    expect(TOUCH4_PADS.map((pad) => millivoltsForRaw12(pad.raw))).toEqual([555, 1237, 1919, 2630]);
    expect(TOUCH4_PADS.map((pad) => raw12FromMillivolts(millivoltsForRaw12(pad.raw)))).toEqual([688, 1535, 2381, 3263]);
    expect(raw12FromMillivolts(0)).toBe(0);
    expect(raw12FromMillivolts(3300)).toBe(RAW12_MAX);
    expect(raw12FromMillivolts(9999)).toBe(RAW12_MAX);
    // 막대의 어떤 값이든 실제로 읽히는 값은 그 값이거나 1 큰 값(정수 mV의 한계)이고, 순서가 뒤바뀌지 않는다
    let previous = -1;
    for (let raw = 0; raw <= RAW12_MAX; raw += 1) {
      const read = raw12FromMillivolts(millivoltsForRaw12(raw));
      expect(read - raw === 0 || read - raw === 1).toBe(true);
      expect(read).toBeGreaterThanOrEqual(previous);
      previous = read;
    }
  });

  it('사이트판 판정 구간(원고 152쪽·f066)은 패드 1~4를 모두 맞히고, 원본 f059의 구간은 패드 3·4를 Button 2·3으로 잘못 알아본다(교사용 탐구 거리)', () => {
    const site = (value: number) => TOUCH4_SITE_RANGES.findIndex(([low, high]) => low < value && value < high) + 1;
    expect(TOUCH4_PADS.map((pad) => site(pad.raw))).toEqual([1, 2, 3, 4]);
    const f059 = (value: number) => (500 < value && value < 1200 ? 1 : 1000 < value && value < 2500 ? 2 : 2000 < value && value < 4000 ? 3 : 3000 < value && value < 4200 ? 4 : 0);
    expect(TOUCH4_PADS.map((pad) => f059(pad.raw))).toEqual([1, 2, 2, 3]);
  });

  it('입력 → 핀 전압·모습: 패드를 누르면 그 패드 값, 떼면 막대 값(처음 0)', () => {
    expect(touch4Raw(TOUCH4_IDLE)).toBe(0);
    expect(touch4Raw({ pad: 3, rest: 1000 })).toBe(2381);
    expect(touch4Raw({ pad: 0, rest: 1000 })).toBe(1000);
    expect(touch4Millivolts({ pad: 2, rest: 0 })).toBe(1237);
    expect(touch4Visual({ pad: 2, rest: 0 })).toEqual({ pad: 2, value: 1535, pressed: true, summary: '패드 2 누름 · 값 약 1535' });
    expect(touch4Visual(TOUCH4_IDLE)).toEqual({ pad: 0, value: 0, pressed: false, summary: '패드 누르지 않음 · 값 0' });
    expect(touch4Visual({ pad: 0, rest: 1000 }).summary).toBe('패드 누르지 않음 · 막대로 정한 값 약 1000');
    // 정수 mV로 정확히 못 만드는 값은 실제로 읽히는 값(1 큼)을 보인다
    expect(touch4Visual({ pad: 0, rest: 700 }).value).toBe(701);
    // 조작 칸이 없으면(단위 테스트·차시 임베드) 누르지 않은 모습
    const instance = instanceOf('touch-analog-4ch', { sig: 32 });
    expect(touch4.visual({ snapshot: snapshotWith([]), instance, active: false, reducedMotion: false })).toMatchObject({ pad: 0, pressed: false });
  });

  it('조작 칸이 정한 전압이 입력 값 표(board.inputs)에 들어간다(interaction 없는 부품도 controlDrives로)', () => {
    const instance = instanceOf('touch-analog-4ch', { sig: 32 });
    const drives = withControlDrive(new Map(), instance.id, 'sig', analogDrive(millivoltsForRaw12(2381)));
    expect(inputDrives([instance], new Set(), PART_DEFINITIONS, drives)).toEqual(new Map([[32, { mv: 1919 }]]));
    expect(inputDrives([instance], new Set(), PART_DEFINITIONS, new Map())).toEqual(new Map());
  });

  it('예제 배선: 원고 GPIO32(ADC1)는 문제 없음, 한 핀에 입력 부품(터치 센서)과 함께 이으면 오류', () => {
    const f059 = resolveWiring([{ part: 'touch-analog-4ch', pin: 32 }], PART_DEFINITIONS);
    expect(f059.issues.filter((issue) => issue.level !== 'info')).toEqual([]);
    const clash = resolveWiring(
      [
        { part: 'touch-analog-4ch', pin: 32 },
        { part: 'touch-digital', pin: 32 },
      ],
      PART_DEFINITIONS,
    );
    expect(clash.issues.map((issue) => issue.code)).toContain('shared-input');
  });
});
