// 이 브라우저에서 펌웨어를 구울 수 있는지(src/lab/firmware/support.ts) — SPEC §6.2·§9, PD-28.
// 판단은 사이트 공통 점검(src/lib/capabilities.ts)의 브라우저 알아보기·Web Serial 점검을 그대로 쓴다.
import { describe, expect, it } from 'vitest';
import type { CapabilityEnv } from '../../../src/lib/capabilities.ts';
import { decideFlashSupport } from '../../../src/lab/firmware/support.ts';

const UA = {
  chromeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  edgeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
  firefoxWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:151.0) Gecko/20100101 Firefox/151.0',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  chromeOs: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
};

function env(userAgent: string, options: { serial?: boolean; secure?: boolean } = {}): CapabilityEnv {
  return {
    isSecureContext: options.secure ?? true,
    navigator: { userAgent, ...(options.serial === false ? {} : { serial: {} }) },
  };
}

describe('decideFlashSupport', () => {
  it('컴퓨터의 Chrome·Edge·ChromeOS(Web Serial 있음)는 ready', () => {
    for (const userAgent of [UA.chromeWindows, UA.edgeWindows, UA.chromeOs]) {
      const support = decideFlashSupport(env(userAgent));
      expect(support.state, userAgent).toBe('ready');
      expect(support.title).toBe('이 브라우저에서 펌웨어를 구울 수 있어요.');
    }
    expect(decideFlashSupport(env(UA.edgeWindows)).browser).toBe('Edge · Windows');
  });

  it('Web Serial이 켜진 Firefox 데스크톱도 ready(PD-28)이고 부가 기능 안내를 덧붙인다', () => {
    const support = decideFlashSupport(env(UA.firefoxWindows));
    expect(support.state).toBe('ready');
    expect(support.detail).toContain('부가 기능');
  });

  it('Web Serial이 없는 Safari·Firefox는 no-serial — 컴퓨터용 Chrome이나 Edge로 안내', () => {
    for (const userAgent of [UA.safariMac, UA.firefoxWindows]) {
      const support = decideFlashSupport(env(userAgent, { serial: false }));
      expect(support.state).toBe('no-serial');
      expect(support.title).toBe('이 브라우저에는 USB 보드 연결 기능이 없어요.');
      expect(support.detail).toContain('컴퓨터용 Chrome이나 Edge');
    }
  });

  it('휴대폰·태블릿은 Web Serial이 있어도 없어도 mobile(SPEC §9 "모바일: Web Serial은 불가 안내")', () => {
    expect(decideFlashSupport(env(UA.chromeAndroid)).state).toBe('mobile');
    expect(decideFlashSupport(env(UA.chromeAndroid, { serial: false })).state).toBe('mobile');
    expect(decideFlashSupport(env(UA.chromeAndroid)).title).toBe('휴대폰이나 태블릿에서는 펌웨어를 굽지 않아요.');
  });

  it('보안 연결이 아니면(Web Serial이 꺼짐) insecure', () => {
    const support = decideFlashSupport(env(UA.chromeWindows, { serial: false, secure: false }));
    expect(support.state).toBe('insecure');
    expect(support.detail).toContain('https://');
  });
});
