// 부품 laser(레이저 모듈) 단위 테스트 — README 7.5 "부품 하나 = 테스트 파일 하나", PLAN §6.2·§8.3 P3-03.
import { describe, expect, it } from 'vitest';
import { snapshotAfterRun } from '../../../src/lab/modules/board/index.ts';
import { PART_DEFINITIONS, resolveWiring } from '../../../src/lab/modules/board/parts.ts';
import laser from '../../../src/lab/modules/board/parts/laser/part.ts';
import { instanceOf, snapshotWith } from './helpers/board-snapshot.ts';

const instance = instanceOf('laser', { sig: 21 }, { usesDefaultPins: false });

describe('부품: 레이저(laser)', () => {
  it('바깥 출력 부품: 신호 1핀, 기본 핀 없음(21·18·27 — 예제마다), 경고 글이 설명에 있다', () => {
    expect(laser.pins).toEqual([{ role: 'sig', label: '신호', direction: 'out' }]);
    expect(laser.defaultPins).toBeUndefined();
    expect(laser.description).toContain('눈에 비추지 않아요');
  });

  it('출력 1이면 켜짐(밝기 100), PWM이면 duty만큼, 0·입력·[정지]면 꺼짐 — 화면 낭독기 글에 안전 안내', () => {
    const on = snapshotWith([{ id: 21, mode: 'out', out: 1, level: 1, driven: true }]);
    expect(laser.visual({ snapshot: on, instance, active: false, reducedMotion: false })).toEqual({ lit: true, brightness: 100, summary: '빛줄기 켜짐 — 눈에 비추지 않기' });
    const pwm = snapshotWith([{ id: 21, mode: 'pwm', out: 0, level: 1, driven: true, duty: 0.25, freq: 1000 }]);
    expect(laser.visual({ snapshot: pwm, instance, active: false, reducedMotion: false })).toMatchObject({ lit: true, brightness: 25 });
    const off = snapshotWith([{ id: 21, mode: 'out', out: 0, level: 0, driven: true }]);
    expect(laser.visual({ snapshot: off, instance, active: false, reducedMotion: false })).toEqual({ lit: false, brightness: 0, summary: '꺼짐 — 눈에 비추지 않기' });
    expect(laser.visual({ snapshot: snapshotAfterRun(on, { outcome: 'killed' }), instance, active: false, reducedMotion: false })).toMatchObject({ lit: false });
  });

  it('예제 배선: 원고 2-1-4의 GPIO21은 문제 없음, 줄임 표기 pin: 21도 된다, 입력 전용 핀(34)은 오류', () => {
    const f063 = resolveWiring([{ part: 'laser', pin: 21 }], PART_DEFINITIONS);
    expect(f063.issues.filter((issue) => issue.level !== 'info')).toEqual([]);
    expect(f063.instances.find((item) => item.part === 'laser')?.pins).toEqual({ sig: 21 });
    const bad = resolveWiring([{ part: 'laser', pin: 34 }], PART_DEFINITIONS);
    expect(bad.issues.map((issue) => issue.code)).toContain('input-only-output');
  });
});
