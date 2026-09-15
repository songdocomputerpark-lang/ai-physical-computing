// 브라우저 기능 점검(src/lib/capabilities.ts) 단위 테스트 — 가짜 navigator·WebAssembly·저장 공간으로 검사한다.
// 실제 V8의 JSPI로 시험 모듈이 도는지는 Node를 --experimental-wasm-jspi로 따로 띄워 확인한다(플래그를 모르는 Node면 건너뜀).
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  BROWSER_NOTICE_DISMISS_KEY,
  CHECK_IDS,
  CHECK_ITEMS,
  JSPI_PROBE_MODULE,
  JSPI_PROBE_VALUE,
  RECOMMENDED_MIN_WIDTH,
  STATUS_LABELS,
  STORAGE_TEST_KEY,
  type CapabilityEnv,
  type NavigatorLike,
  type StorageLike,
  type WebAssemblyLike,
  checkBrowser,
  checkCameraApi,
  checkCameraDevice,
  checkJspi,
  checkLocalStorage,
  checkScreen,
  checkSecureContext,
  checkWebAssembly,
  checkWebBluetooth,
  checkWebSerial,
  decideBrowserNotice,
  detectBrowser,
  envFromWindow,
  formatCheckedAt,
  formatReport,
  hasJspiApi,
  isBrowserNoticeDismissed,
  isRecommendedBrowser,
  probeJspi,
  rememberBrowserNoticeDismissed,
  runChecks,
  summarizeReport,
} from '../../../src/lib/capabilities.ts';

const HANGUL = /[가-힣]/u;

const UA = {
  chromeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  chromeWindowsOld:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.87 Safari/537.36',
  edgeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
  chromeLinux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  chromeOs: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  whaleWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Whale/4.33.0.0 Safari/537.36',
  firefoxWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  samsungAndroid:
    'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36',
  chromeIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1',
} as const;

const chromeHints = (platform = 'Windows', mobile = false) => ({
  brands: [
    { brand: 'Google Chrome', version: '140' },
    { brand: 'Not_A Brand', version: '8' },
    { brand: 'Chromium', version: '140' },
  ],
  mobile,
  platform,
});

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

type JspiBehavior = 'works' | 'none' | 'rejects' | 'hangs' | 'wrong-value';

/** 가짜 WebAssembly. Instance의 run은 가져온 wait(Suspending으로 감싼 함수)를 부른다. */
function fakeWasm(options: { jspi?: JspiBehavior; validate?: boolean; compileThrows?: boolean } = {}): WebAssemblyLike {
  const jspi = options.jspi ?? 'works';
  class FakeSuspending {
    constructor(readonly fn: () => Promise<unknown>) {}
  }
  const wasm: Record<string, unknown> = {
    validate: () => options.validate ?? true,
    Module: class {
      constructor() {
        if (options.compileThrows) throw new Error('막힘');
      }
    },
    Instance: class {
      readonly exports: Record<string, unknown>;
      constructor(_module: object, imports: Record<string, Record<string, unknown>>) {
        const wait = imports.probe?.wait as FakeSuspending;
        this.exports = { run: () => wait.fn() };
      }
    },
  };
  if (jspi !== 'none') {
    wasm.Suspending = FakeSuspending;
    wasm.promising = (fn: unknown) => {
      if (jspi === 'rejects') return () => Promise.reject(new Error('실패'));
      if (jspi === 'hangs') return () => new Promise(() => {});
      if (jspi === 'wrong-value') return () => Promise.resolve(7);
      return async () => (fn as () => Promise<unknown>)();
    };
  }
  return wasm as WebAssemblyLike;
}

function desktopNavigator(overrides: Partial<NavigatorLike> = {}): NavigatorLike {
  return {
    userAgent: UA.chromeWindows,
    userAgentData: chromeHints(),
    maxTouchPoints: 0,
    mediaDevices: { getUserMedia: () => undefined, enumerateDevices: async () => [{ kind: 'videoinput' }] },
    serial: {},
    bluetooth: { getAvailability: async () => true },
    ...overrides,
  };
}

function makeEnv(overrides: Partial<CapabilityEnv> = {}): CapabilityEnv {
  const storage = new MemoryStorage();
  return {
    isSecureContext: true,
    navigator: desktopNavigator(),
    WebAssembly: fakeWasm(),
    getLocalStorage: () => storage,
    innerWidth: 1366,
    innerHeight: 768,
    screen: { width: 1920, height: 1080 },
    devicePixelRatio: 1,
    ...overrides,
  };
}

describe('점검 항목 목록', () => {
  it('10개 항목이 겹치지 않는 id와 한국어 이름·쓰임새를 가진다', () => {
    expect(CHECK_ITEMS).toHaveLength(10);
    expect(new Set(CHECK_IDS).size).toBe(10);
    for (const item of CHECK_ITEMS) {
      expect(item.label).toMatch(HANGUL);
      expect(item.neededFor).toMatch(HANGUL);
    }
    expect(Object.values(STATUS_LABELS)).toEqual(['지원', '미지원', '확인 필요']);
  });
});

describe('브라우저 알아보기(detectBrowser)', () => {
  const cases: [string, NavigatorLike, { brand: string; platform: string; mobile: boolean; recommended: boolean }][] = [
    ['Chrome(Windows, userAgentData)', { userAgent: UA.chromeWindows, userAgentData: chromeHints() }, { brand: 'chrome', platform: 'windows', mobile: false, recommended: true }],
    [
      'Edge(macOS, userAgentData)',
      { userAgent: UA.edgeWindows, userAgentData: { brands: [{ brand: 'Microsoft Edge' }, { brand: 'Chromium' }], platform: 'macOS', mobile: false } },
      { brand: 'edge', platform: 'macos', mobile: false, recommended: true },
    ],
    [
      'Chromium만 알려 주면 userAgent 글자로(브랜드가 Chromium뿐인 빌드)',
      { userAgent: UA.chromeWindows, userAgentData: { brands: [{ brand: 'Chromium' }, { brand: 'Not A(Brand' }], platform: 'Linux', mobile: false } },
      { brand: 'chrome', platform: 'linux', mobile: false, recommended: true },
    ],
    [
      '헤드리스 Chrome(HeadlessChrome — CI의 Playwright 기본 헤드리스 셸)은 Chrome으로 본다',
      {
        userAgent: UA.chromeWindows,
        userAgentData: { brands: [{ brand: 'Not=A?Brand' }, { brand: 'HeadlessChrome' }, { brand: 'Chromium' }], platform: 'Linux', mobile: false },
      },
      { brand: 'chrome', platform: 'linux', mobile: false, recommended: true },
    ],
    [
      '웨일(userAgentData)',
      { userAgent: UA.whaleWindows, userAgentData: { brands: [{ brand: 'Whale' }, { brand: 'Chromium' }], platform: 'Windows', mobile: false } },
      { brand: 'whale', platform: 'windows', mobile: false, recommended: false },
    ],
    [
      '이름을 모르는 Chromium 계열은 Chrome으로 보지 않는다',
      { userAgent: UA.chromeWindows, userAgentData: { brands: [{ brand: 'Brave' }, { brand: 'Chromium' }], platform: 'Windows', mobile: false } },
      { brand: 'chromium', platform: 'windows', mobile: false, recommended: false },
    ],
    ['Android 휴대폰의 Chrome', { userAgent: UA.chromeAndroid, userAgentData: chromeHints('Android', true) }, { brand: 'chrome', platform: 'android', mobile: true, recommended: false }],
    ['Android 태블릿의 Chrome(mobile false)', { userAgent: UA.chromeAndroid, userAgentData: chromeHints('Android', false) }, { brand: 'chrome', platform: 'android', mobile: true, recommended: false }],
    ['Firefox(Windows)', { userAgent: UA.firefoxWindows }, { brand: 'firefox', platform: 'windows', mobile: false, recommended: false }],
    ['Safari(macOS)', { userAgent: UA.safariMac, maxTouchPoints: 0 }, { brand: 'safari', platform: 'macos', mobile: false, recommended: false }],
    ['데스크톱 모드 iPad의 Safari', { userAgent: UA.safariMac, maxTouchPoints: 5 }, { brand: 'safari', platform: 'ios', mobile: true, recommended: false }],
    ['iPhone의 Chrome', { userAgent: UA.chromeIphone }, { brand: 'chrome', platform: 'ios', mobile: true, recommended: false }],
    ['삼성 인터넷', { userAgent: UA.samsungAndroid }, { brand: 'samsung', platform: 'android', mobile: true, recommended: false }],
    ['ChromeOS의 Chrome', { userAgent: UA.chromeOs }, { brand: 'chrome', platform: 'chromeos', mobile: false, recommended: true }],
    ['userAgentData 없는 Edge', { userAgent: UA.edgeWindows }, { brand: 'edge', platform: 'windows', mobile: false, recommended: true }],
    ['정보가 하나도 없음', {}, { brand: 'other', platform: 'other', mobile: false, recommended: false }],
  ];

  it.each(cases)('%s', (_name, navigator, expected) => {
    const info = detectBrowser({ navigator });
    expect(info.brand).toBe(expected.brand);
    expect(info.platform).toBe(expected.platform);
    expect(info.mobile).toBe(expected.mobile);
    expect(isRecommendedBrowser(info)).toBe(expected.recommended);
    expect(info.name).not.toBe('');
  });

  it('브라우저 항목은 권장 환경이면 지원, 휴대폰·다른 브라우저면 확인 필요와 안내를 준다', () => {
    expect(checkBrowser(makeEnv()).status).toBe('supported');
    const phone = checkBrowser(makeEnv({ navigator: { userAgent: UA.chromeAndroid, userAgentData: chromeHints('Android', true) } }));
    expect(phone.status).toBe('unknown');
    expect(phone.advice).toMatch(/컴퓨터의 Chrome이나 Edge/u);
    const firefox = checkBrowser(makeEnv({ navigator: { userAgent: UA.firefoxWindows } }));
    expect(firefox.status).toBe('unknown');
    expect(firefox.summary).toContain('Firefox(Windows)');
  });
});

describe('보안 연결·WebAssembly·JSPI', () => {
  it('보안 연결이면 지원, 아니면 미지원과 https 안내', () => {
    expect(checkSecureContext({ isSecureContext: true }).status).toBe('supported');
    const insecure = checkSecureContext({ isSecureContext: false });
    expect(insecure.status).toBe('unsupported');
    expect(insecure.advice).toContain('https://');
  });

  it('WebAssembly가 없거나 검사·컴파일이 막히면 미지원', () => {
    expect(checkWebAssembly(makeEnv()).status).toBe('supported');
    expect(checkWebAssembly(makeEnv({ WebAssembly: undefined })).status).toBe('unsupported');
    expect(checkWebAssembly(makeEnv({ WebAssembly: fakeWasm({ validate: false }) })).status).toBe('unsupported');
    const blocked = checkWebAssembly(makeEnv({ WebAssembly: fakeWasm({ compileThrows: true }) }));
    expect(blocked.status).toBe('unsupported');
    expect(blocked.summary).toContain('막혀');
  });

  it('시험 모듈은 52바이트이고 Node의 WebAssembly가 검사·실행할 수 있다(JSPI 없이 보통 함수로)', () => {
    const bytes = new Uint8Array(JSPI_PROBE_MODULE);
    expect(bytes.byteLength).toBe(52);
    expect(WebAssembly.validate(bytes)).toBe(true);
    const instance = new WebAssembly.Instance(new WebAssembly.Module(bytes), { probe: { wait: () => JSPI_PROBE_VALUE } });
    expect((instance.exports.run as () => number)()).toBe(JSPI_PROBE_VALUE);
  });

  it('JSPI 이름 확인과 시험 실행 결과를 지원·미지원·확인 필요로 나눈다', async () => {
    expect(hasJspiApi(fakeWasm())).toBe(true);
    expect(hasJspiApi(fakeWasm({ jspi: 'none' }))).toBe(false);
    expect(hasJspiApi(undefined)).toBe(false);

    expect(await probeJspi(fakeWasm())).toBe('ok');
    expect(await probeJspi(undefined)).toBe('no-api');
    expect(await probeJspi(fakeWasm({ jspi: 'rejects' }))).toBe('failed');
    expect(await probeJspi(fakeWasm({ jspi: 'wrong-value' }))).toBe('failed');
    expect(await probeJspi(fakeWasm({ jspi: 'hangs' }), 20)).toBe('failed');

    expect((await checkJspi(makeEnv())).status).toBe('supported');
    const missing = await checkJspi(makeEnv({ WebAssembly: fakeWasm({ jspi: 'none' }) }));
    expect(missing.status).toBe('unsupported');
    expect(missing.advice).toMatch(/Chrome이나 Edge/u);
    const broken = await checkJspi(makeEnv({ WebAssembly: fakeWasm({ jspi: 'hangs' }) }), 20);
    expect(broken.status).toBe('unknown');
    expect(broken.advice).toMatch(HANGUL);
  });

  const nodeJspi = spawnSync(process.execPath, ['--experimental-wasm-jspi', '-e', 'process.stdout.write(typeof WebAssembly.Suspending)'], {
    encoding: 'utf8',
    timeout: 20_000,
  });
  const nodeHasJspi = nodeJspi.status === 0 && nodeJspi.stdout === 'function';

  it.runIf(nodeHasJspi)('실제 V8 JSPI(Node --experimental-wasm-jspi)에서 시험 모듈이 멈췄다가 이어져 ok가 나온다', () => {
    const moduleUrl = new URL('../../../src/lib/capabilities.ts', import.meta.url).href;
    const script = `const m = await import(${JSON.stringify(moduleUrl)}); process.stdout.write(await m.probeJspi(WebAssembly));`;
    const result = spawnSync(process.execPath, ['--experimental-wasm-jspi', '--input-type=module', '-e', script], {
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(result.stdout, result.stderr).toBe('ok');
  });
});

describe('카메라', () => {
  it('getUserMedia가 있으면 지원, 보안 연결이 아니면 https 안내', () => {
    expect(checkCameraApi(makeEnv()).status).toBe('supported');
    const insecure = checkCameraApi(makeEnv({ isSecureContext: false, navigator: desktopNavigator({ mediaDevices: undefined }) }));
    expect(insecure.status).toBe('unsupported');
    expect(insecure.advice).toContain('https://');
    const noApi = checkCameraApi(makeEnv({ navigator: desktopNavigator({ mediaDevices: {} }) }));
    expect(noApi.status).toBe('unsupported');
    expect(noApi.advice).toMatch(HANGUL);
  });

  it('장치 목록에 카메라가 있으면 지원, 없거나 읽지 못하면 확인 필요', async () => {
    expect((await checkCameraDevice(makeEnv())).status).toBe('supported');
    const onlyMic = await checkCameraDevice(
      makeEnv({ navigator: desktopNavigator({ mediaDevices: { enumerateDevices: async () => [{ kind: 'audioinput' }] } }) }),
    );
    expect(onlyMic.status).toBe('unknown');
    expect(onlyMic.advice).toContain('웹캠');
    const throws = await checkCameraDevice(
      makeEnv({ navigator: desktopNavigator({ mediaDevices: { enumerateDevices: () => Promise.reject(new Error('막힘')) } }) }),
    );
    expect(throws.status).toBe('unknown');
    const hangs = await checkCameraDevice(
      makeEnv({ navigator: desktopNavigator({ mediaDevices: { enumerateDevices: () => new Promise(() => {}) } }) }),
      20,
    );
    expect(hangs.status).toBe('unknown');
    expect((await checkCameraDevice(makeEnv({ navigator: {} }))).status).toBe('unknown');
  });
});

describe('Web Serial·Web Bluetooth', () => {
  it('Web Serial은 navigator.serial 유무만 보고 버전 숫자는 보지 않는다', () => {
    for (const userAgent of [UA.chromeWindows, UA.chromeWindowsOld]) {
      const withSerial = { userAgent, serial: {} };
      const withoutSerial = { userAgent };
      expect(checkWebSerial(makeEnv({ navigator: withSerial })).status).toBe('supported');
      expect(checkWebSerial(makeEnv({ navigator: withoutSerial })).status).toBe('unsupported');
    }
  });

  it('Web Serial: 휴대폰·태블릿은 확인 필요, 없으면 가상 보드 안내, 보안 연결이 아니면 https 안내, Firefox는 부가 기능 안내', () => {
    const android = checkWebSerial(makeEnv({ navigator: { userAgent: UA.chromeAndroid, userAgentData: chromeHints('Android', true), serial: {} } }));
    expect(android.status).toBe('unknown');
    const missing = checkWebSerial(makeEnv({ navigator: { userAgent: UA.safariMac } }));
    expect(missing.status).toBe('unsupported');
    expect(missing.advice).toContain('가상 보드');
    const insecure = checkWebSerial(makeEnv({ isSecureContext: false, navigator: { userAgent: UA.chromeWindows } }));
    expect(insecure.advice).toContain('https://');
    const firefox = checkWebSerial(makeEnv({ navigator: { userAgent: UA.firefoxWindows, serial: {} } }));
    expect(firefox.status).toBe('supported');
    expect(firefox.advice).toContain('부가 기능');
  });

  it('Web Bluetooth: 유무·Linux·getAvailability 결과에 따라 나눈다', async () => {
    expect((await checkWebBluetooth(makeEnv())).status).toBe('supported');
    expect((await checkWebBluetooth(makeEnv({ navigator: desktopNavigator({ bluetooth: {} }) }))).status).toBe('supported');

    const absent = await checkWebBluetooth(makeEnv({ navigator: { userAgent: UA.firefoxWindows } }));
    expect(absent.status).toBe('unsupported');
    expect(absent.advice).toMatch(HANGUL);

    const linuxAbsent = await checkWebBluetooth(makeEnv({ navigator: { userAgent: UA.chromeLinux } }));
    expect(linuxAbsent.advice).toContain('chrome://flags');
    const linuxPresent = await checkWebBluetooth(makeEnv({ navigator: { userAgent: UA.chromeLinux, bluetooth: {} } }));
    expect(linuxPresent.status).toBe('unknown');

    const unavailable = await checkWebBluetooth(
      makeEnv({ navigator: desktopNavigator({ bluetooth: { getAvailability: async () => false } }) }),
    );
    expect(unavailable.status).toBe('unknown');
    expect(unavailable.advice).toContain('블루투스');
    const throws = await checkWebBluetooth(
      makeEnv({ navigator: desktopNavigator({ bluetooth: { getAvailability: () => Promise.reject(new Error('x')) } }) }),
    );
    expect(throws.status).toBe('unknown');
  });
});

describe('저장 공간·화면 크기', () => {
  it('저장 공간을 쓰고 읽고 지운다. 막히면 미지원', () => {
    const storage = new MemoryStorage();
    expect(checkLocalStorage({ getLocalStorage: () => storage }).status).toBe('supported');
    expect(storage.values.has(STORAGE_TEST_KEY)).toBe(false);

    const getterThrows = checkLocalStorage({
      getLocalStorage: () => {
        throw new Error('SecurityError');
      },
    });
    expect(getterThrows.status).toBe('unsupported');
    expect(getterThrows.advice).toMatch(HANGUL);

    const full = new MemoryStorage();
    full.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    expect(checkLocalStorage({ getLocalStorage: () => full }).status).toBe('unsupported');
    expect(checkLocalStorage({ getLocalStorage: () => null }).status).toBe('unsupported');
  });

  it(`창 너비 ${RECOMMENDED_MIN_WIDTH} 이상이면 지원, 좁거나 모르면 확인 필요`, () => {
    const wide = checkScreen(makeEnv());
    expect(wide.status).toBe('supported');
    expect(wide.detail).toBe('브라우저 창 1366×768, 화면 1920×1080, 배율 1');
    const narrow = checkScreen(makeEnv({ innerWidth: 375, innerHeight: 812, screen: { width: 375, height: 812 }, devicePixelRatio: 2.75 }));
    expect(narrow.status).toBe('unknown');
    expect(narrow.summary).toContain(String(RECOMMENDED_MIN_WIDTH));
    expect(narrow.detail).toContain('배율 2.75');
    expect(checkScreen({}).status).toBe('unknown');
  });
});

describe('한꺼번에 점검·요약·결과 복사 글', () => {
  it('모두 되는 환경은 10개 모두 지원이고 CHECK_IDS 순서다', async () => {
    const report = await runChecks(makeEnv(), CHECK_IDS, { now: () => new Date(2026, 8, 16, 14, 5) });
    expect(report.results.map((result) => result.id)).toEqual([...CHECK_IDS]);
    expect(report.results.every((result) => result.status === 'supported')).toBe(true);
    const summary = summarizeReport(report);
    expect(summary.level).toBe('ready');
    expect(summary.counts).toEqual({ supported: 10, unsupported: 0, unknown: 0 });
  });

  it('아무 기능도 없는 환경에서도 멈추지 않고, 지원이 아닌 항목마다 한국어 대처 안내가 붙는다', async () => {
    const report = await runChecks({}, CHECK_IDS, { timeoutMs: 20 });
    expect(report.results).toHaveLength(10);
    for (const result of report.results) {
      expect(result.status).not.toBe('supported');
      if (result.id !== 'screen') {
        expect(result.advice, result.id).toMatch(HANGUL);
      }
    }
    expect(summarizeReport(report).level).toBe('blocked');
  });

  it('일부 항목만 요청해도 표 순서를 지킨다', async () => {
    const report = await runChecks(makeEnv(), ['camera-api', 'browser', 'jspi']);
    expect(report.results.map((result) => result.id)).toEqual(['browser', 'jspi', 'camera-api']);
  });

  it('요약: JSPI가 없으면 blocked, 확인 필요만 있으면 partial', async () => {
    const noJspi = await runChecks(makeEnv({ WebAssembly: fakeWasm({ jspi: 'none' }) }));
    expect(summarizeReport(noJspi).level).toBe('blocked');
    const narrow = await runChecks(makeEnv({ innerWidth: 800 }));
    const summary = summarizeReport(narrow);
    expect(summary.level).toBe('partial');
    expect(summary.counts.unknown).toBe(1);
  });

  it('결과 복사 글에 머리말·시각·브라우저·항목별 결과·요약이 들어간다', async () => {
    const report = await runChecks(makeEnv({ innerWidth: 800 }), CHECK_IDS, { now: () => new Date(2026, 8, 16, 14, 5) });
    const text = formatReport(report, {
      siteName: '사이트',
      siteVersion: '0.1.0',
      pageUrl: 'https://example.github.io/start/check/',
      userAgent: UA.chromeWindows,
    });
    const lines = text.split('\n');
    expect(lines[0]).toBe('[사이트] 브라우저 점검 결과');
    expect(lines[1]).toMatch(/^점검 시각: 2026-09-16 14:05 \(UTC[+-]\d{2}:\d{2}\)$/u);
    expect(text).toContain('점검한 주소: https://example.github.io/start/check/');
    expect(text).toContain('사이트 버전: 0.1.0');
    expect(text).toContain('브라우저: Chrome · Windows');
    expect(text).toContain(UA.chromeWindows);
    for (const item of CHECK_ITEMS) {
      expect(text).toMatch(new RegExp(`^- ${item.label.replace(/[()]/gu, '\\$&')}: (지원|미지원|확인 필요) — `, 'mu'));
    }
    expect(text).toContain('- 화면 크기: 확인 필요 — ');
    expect(text).toContain('요약: 지원 9개 · 미지원 0개 · 확인 필요 1개');
  });

  it('점검 시각은 이 컴퓨터 시간대의 날짜·시각과 UTC 차이로 적는다', () => {
    expect(formatCheckedAt(new Date(2026, 0, 2, 3, 4))).toMatch(/^2026-01-02 03:04 \(UTC[+-]\d{2}:\d{2}\)$/u);
  });
});

describe('브라우저 권장 환경 안내', () => {
  it('컴퓨터용 Chrome·Edge에 JSPI가 있으면 안내 없음, JSPI가 없으면 업데이트 안내, 그 밖은 다른 브라우저 안내', () => {
    expect(decideBrowserNotice(makeEnv())).toBe('none');
    expect(decideBrowserNotice(makeEnv({ WebAssembly: fakeWasm({ jspi: 'none' }) }))).toBe('update-browser');
    expect(decideBrowserNotice(makeEnv({ navigator: { userAgent: UA.firefoxWindows } }))).toBe('other-browser');
    expect(
      decideBrowserNotice(makeEnv({ navigator: { userAgent: UA.chromeAndroid, userAgentData: chromeHints('Android', true) } })),
    ).toBe('other-browser');
  });

  it('닫은 안내는 종류별로 기억하고, 저장 공간을 못 쓰면 기억하지 않는다', () => {
    const storage = new MemoryStorage();
    const getStorage = () => storage;
    expect(isBrowserNoticeDismissed('other-browser', getStorage)).toBe(false);
    expect(rememberBrowserNoticeDismissed('other-browser', getStorage)).toBe(true);
    expect(storage.getItem(BROWSER_NOTICE_DISMISS_KEY)).toBe('other-browser');
    expect(isBrowserNoticeDismissed('other-browser', getStorage)).toBe(true);
    expect(isBrowserNoticeDismissed('update-browser', getStorage)).toBe(false);
    expect(rememberBrowserNoticeDismissed('none', getStorage)).toBe(false);

    const throwing = () => {
      throw new Error('SecurityError');
    };
    expect(isBrowserNoticeDismissed('other-browser', throwing)).toBe(false);
    expect(rememberBrowserNoticeDismissed('other-browser', throwing)).toBe(false);
  });

  it('envFromWindow는 localStorage를 바로 읽지 않고 쓸 때 읽는다(막힌 브라우저에서도 오류 없이 미지원)', () => {
    const fakeWindow = {
      isSecureContext: true,
      navigator: { userAgent: UA.chromeWindows },
      innerWidth: 1280,
      get localStorage(): StorageLike {
        throw new Error('SecurityError');
      },
    };
    const env = envFromWindow(fakeWindow);
    expect(env.isSecureContext).toBe(true);
    expect(env.innerWidth).toBe(1280);
    expect(checkLocalStorage(env).status).toBe('unsupported');
  });
});
