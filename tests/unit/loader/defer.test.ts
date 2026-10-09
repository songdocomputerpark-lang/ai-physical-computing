// 파이썬 엔진 받기를 [실행]까지 미루는 경우(판 1.3.0 검수 R1-097) — 순수 판단과 환경 읽기.
import { describe, expect, it } from 'vitest';
import { deferredLoadMessage, readDeferEnv, shouldDeferEngineLoad } from '../../../src/lab/loader/defer.ts';

describe('shouldDeferEngineLoad', () => {
  it('데이터 절약 모드이거나 휴대폰 데이터(cellular)면 미룬다', () => {
    expect(shouldDeferEngineLoad({ saveData: true, cellular: false })).toBe(true);
    expect(shouldDeferEngineLoad({ saveData: false, cellular: true })).toBe(true);
    expect(shouldDeferEngineLoad({ saveData: true, cellular: true })).toBe(true);
  });

  it('학교 Wi-Fi·유선이거나 알 수 없으면 미루지 않는다(열자마자 받는다)', () => {
    expect(shouldDeferEngineLoad({ saveData: false, cellular: false })).toBe(false);
  });
});

describe('readDeferEnv', () => {
  const win = (connection: unknown) => ({ navigator: { connection } }) as unknown as { navigator: Navigator };

  it('window가 없으면 미루지 않는 값이다', () => {
    expect(readDeferEnv(undefined)).toEqual({ saveData: false, cellular: false });
  });

  it('saveData와 연결 종류를 읽는다', () => {
    expect(readDeferEnv(win({ saveData: true, type: 'wifi' }))).toEqual({ saveData: true, cellular: false });
    expect(readDeferEnv(win({ saveData: false, type: 'cellular' }))).toEqual({ saveData: false, cellular: true });
  });

  it('연결 정보를 알려 주지 않는 브라우저(데스크톱 Chrome·Safari·Firefox)는 미루지 않는 값이다', () => {
    expect(readDeferEnv(win(undefined))).toEqual({ saveData: false, cellular: false });
    expect(readDeferEnv(win({ effectiveType: '2g' }))).toEqual({ saveData: false, cellular: false });
  });

  it('읽다가 오류가 나면 미루지 않는 값이다', () => {
    const throwing = {
      get navigator(): Navigator {
        throw new Error('navigator를 읽을 수 없어요');
      },
    } as unknown as { navigator: Navigator };
    expect(readDeferEnv(throwing)).toEqual({ saveData: false, cellular: false });
  });
});

describe('deferredLoadMessage', () => {
  it('크기와 "처음 한 번만"을 알린다', () => {
    expect(deferredLoadMessage('약 12.9MB')).toContain('처음 한 번만');
    expect(deferredLoadMessage('약 12.9MB')).toContain('12.9MB');
    expect(deferredLoadMessage('약 12.9MB')).toContain('[실행]');
  });
});
