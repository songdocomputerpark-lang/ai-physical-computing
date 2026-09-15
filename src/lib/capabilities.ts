/**
 * 브라우저 기능 점검(PLAN §8.1 P1-08, §4.4·§5.5, SPEC §9).
 *
 * 쓰는 곳
 * - 점검 페이지(/start/check/): runChecks()로 결과 표를 만들고, formatReport()로 [결과 복사] 글을 만든다.
 * - 학생용 시작하기의 짧은 점검: runChecks(env, ['browser', 'jspi', 'camera-api']).
 * - 브라우저 권장 환경 안내(src/components/compat/BrowserNotice.astro): decideBrowserNotice().
 *
 * 원칙
 * 1. 기능은 "있는지, 실제로 되는지"로 판단하고 브라우저 버전 숫자로 짐작하지 않는다(Web Serial은 navigator.serial 유무만 본다).
 * 2. 허락을 묻는 창(카메라·포트 선택)을 띄우지 않고, 사이트 밖 서버에 접속하지 않는다.
 * 3. 결과는 지원·미지원·확인 필요 세 가지다. 지원이 아니면 한국어 대처 안내를 붙인다.
 * 4. 브라우저 전역 객체를 직접 읽지 않고 CapabilityEnv로 받는다. 그래서 단위 테스트가 가짜 navigator로 검사할 수 있다.
 * 5. Node.js가 이 파일을 직접 불러 JSPI를 실제로 시험할 수 있게(tests/unit/start/) 다른 파일을 import하지 않고,
 *    타입 표기만 지우면 그대로 도는 문법만 쓴다(enum·namespace 금지).
 *
 * 근거(2026-09-16 확인)
 * - JSPI의 새 API는 WebAssembly.Suspending(생성자)과 WebAssembly.promising(함수)이다
 *   (https://github.com/WebAssembly/js-promise-integration/blob/main/proposals/js-promise-integration/Overview.md).
 *   V8 블로그의 감지 방법 `WebAssembly.Suspending != undefined`(https://v8.dev/blog/jspi-newapi)에
 *   promising 확인과 52바이트 시험 모듈 실제 실행을 더했다. 이름만 있고 동작하지 않는 경우를 "확인 필요"로 가르기 위해서다.
 *   MDN 호환성 자료(mdn/browser-compat-data webassembly/api/Suspending.json): Chrome 137·Firefox 153 데스크톱 지원,
 *   Android Chrome·Safari·iOS 미지원(Edge·Opera·삼성 인터넷은 Chrome을 따른다고 표시).
 * - 브라우저 이름: navigator.userAgentData(User-Agent Client Hints, 보안 연결에서만 있음)의 brands·platform을 먼저 쓰고,
 *   없거나 "Chromium"뿐이면 navigator.userAgent 글자로 가른다. platform 값은 Android, Chrome OS, Fuchsia, iOS, Linux,
 *   macOS, Windows, Unknown이다(https://wicg.github.io/ua-client-hints/).
 * - Web Bluetooth: Chrome은 Android·ChromeOS·macOS·Windows에서 바로 되고, Linux는 chrome://flags의
 *   #enable-experimental-web-platform-features를 켜야 한다(WebBluetoothCG implementation-status.md).
 *   getAvailability()는 블루투스 어댑터가 없거나 설정·정책으로 막히면 false다(MDN Bluetooth.getAvailability).
 * - 카메라 장치: enumerateDevices()는 허락 전에는 장치 이름(label) 없이 종류만 알려 준다(MDN MediaDevices.enumerateDevices).
 */

/** 점검 결과: 지원 · 미지원 · 확인 필요 */
export type CheckStatus = 'supported' | 'unsupported' | 'unknown';

/** 화면과 [결과 복사]에 쓰는 결과 이름 */
export const STATUS_LABELS: Readonly<Record<CheckStatus, string>> = Object.freeze({
  supported: '지원',
  unsupported: '미지원',
  unknown: '확인 필요',
});

export type CheckId =
  | 'browser'
  | 'secure-context'
  | 'webassembly'
  | 'jspi'
  | 'camera-api'
  | 'camera-device'
  | 'web-serial'
  | 'web-bluetooth'
  | 'local-storage'
  | 'screen';

/** 점검 항목(표의 첫 칸) */
export interface CheckItem {
  readonly id: CheckId;
  /** 항목 이름 */
  readonly label: string;
  /** 무엇에 필요한지 한 문장 */
  readonly neededFor: string;
}

/** 점검 한 항목의 결과 */
export interface CheckResult extends CheckItem {
  readonly status: CheckStatus;
  /** 결과 한 문장 */
  readonly summary: string;
  /** 대처 안내(지원이면 빈 문자열일 수 있다) */
  readonly advice: string;
  /** 잰 값(예: 창 크기). 없으면 undefined */
  readonly detail?: string;
}

const CHECK_ITEM_LIST: CheckItem[] = [
  { id: 'browser', label: '브라우저', neededFor: '사이트는 컴퓨터용 Chrome과 Edge를 기준으로 만들고 시험해요.' },
  { id: 'secure-context', label: '보안 연결(https)', neededFor: '카메라, 보드 연결, 블루투스는 보안 연결에서만 켜져요.' },
  { id: 'webassembly', label: 'WebAssembly(웹어셈블리)', neededFor: '브라우저 안에서 파이썬을 실행하는 바탕 기능이에요.' },
  {
    id: 'jspi',
    label: 'JSPI(파이썬 기다리기 기능)',
    neededFor: '파이썬 코드가 카메라 화면이나 버튼 입력을 기다렸다가 이어서 실행하게 해 줘요.',
  },
  { id: 'camera-api', label: '카메라 기능', neededFor: '영상처리 실습에서 웹캠을 켤 때 필요해요.' },
  { id: 'camera-device', label: '카메라 장치', neededFor: '웹캠이 연결되어 있는지 봐요. 허락을 묻는 창은 뜨지 않아요.' },
  { id: 'web-serial', label: 'Web Serial(USB 보드 연결)', neededFor: '실제 ESP32 보드를 USB 케이블로 연결할 때 필요해요.' },
  { id: 'web-bluetooth', label: 'Web Bluetooth(블루투스)', neededFor: '실제 보드와 블루투스로 신호를 주고받을 때 필요해요.' },
  { id: 'local-storage', label: '브라우저 저장 공간', neededFor: '쓴 코드와 설정을 이 컴퓨터의 브라우저에 저장할 때 필요해요.' },
  { id: 'screen', label: '화면 크기', neededFor: '실습실은 코드와 결과를 나란히 보여 줘서 넓은 창이 편해요.' },
];

/** 점검 항목 전체(표에 보이는 순서) */
export const CHECK_ITEMS: readonly CheckItem[] = Object.freeze(CHECK_ITEM_LIST.map((item) => Object.freeze(item)));

/** 점검 항목 id 전체(표에 보이는 순서) */
export const CHECK_IDS: readonly CheckId[] = Object.freeze(CHECK_ITEMS.map((item) => item.id));

/** id로 점검 항목을 찾는다. 없는 id면 오류를 낸다. */
export function getCheckItem(id: CheckId): CheckItem {
  const found = CHECK_ITEMS.find((item) => item.id === id);
  if (!found) {
    throw new Error(`점검 항목 "${String(id)}"은(는) 없어요.`);
  }
  return found;
}

/** 실습실을 넉넉하게 볼 수 있는 창 너비(CSS 픽셀). 이보다 좁으면 "확인 필요"로 알린다(Claude 결정, 보고서에 근거). */
export const RECOMMENDED_MIN_WIDTH = 1024;

/** 이 사이트가 브라우저 저장 공간에 쓰는 이름의 머리말. 같은 github.io 주소를 쓰는 다른 사이트의 값과 섞이지 않게 붙인다. */
export const STORAGE_KEY_PREFIX = 'ai-physical-computing:';
/** 저장 공간 점검에 잠깐 썼다가 지우는 이름 */
export const STORAGE_TEST_KEY = `${STORAGE_KEY_PREFIX}storage-test`;
/** 브라우저 권장 환경 안내를 닫았다는 표시(값은 닫은 안내 종류) */
export const BROWSER_NOTICE_DISMISS_KEY = `${STORAGE_KEY_PREFIX}browser-notice-dismissed`;

/** 비동기 점검(JSPI 시험, 장치 목록 등)을 기다리는 최대 시간(밀리초) */
export const DEFAULT_CHECK_TIMEOUT_MS = 3000;

// ── 브라우저에서 읽는 값의 모양(가짜 값으로 바꿔 넣을 수 있게 필요한 부분만 적었다) ──

export interface UserAgentBrandLike {
  readonly brand: string;
  readonly version?: string;
}

export interface UserAgentDataLike {
  readonly brands?: readonly UserAgentBrandLike[];
  readonly mobile?: boolean;
  readonly platform?: string;
}

export interface MediaDeviceInfoLike {
  readonly kind: string;
}

export interface NavigatorLike {
  readonly userAgent?: string;
  readonly userAgentData?: UserAgentDataLike | null;
  readonly maxTouchPoints?: number;
  readonly mediaDevices?: {
    readonly getUserMedia?: unknown;
    readonly enumerateDevices?: () => Promise<readonly MediaDeviceInfoLike[]>;
  } | null;
  readonly serial?: unknown;
  readonly bluetooth?: {
    readonly getAvailability?: () => Promise<boolean>;
  } | null;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface WebAssemblyLike {
  readonly validate?: (bytes: Uint8Array) => boolean;
  readonly Module?: new (bytes: Uint8Array) => object;
  readonly Instance?: new (
    module: object,
    importObject: Record<string, Record<string, unknown>>,
  ) => { readonly exports: Record<string, unknown> };
  readonly Suspending?: new (fn: () => Promise<unknown>) => object;
  readonly promising?: (fn: unknown) => () => Promise<unknown>;
}

/** 점검에 쓰는 브라우저 환경. 모든 값은 없을 수 있다(없으면 그 기능이 없는 것으로 본다). */
export interface CapabilityEnv {
  readonly isSecureContext?: boolean;
  readonly navigator?: NavigatorLike;
  readonly WebAssembly?: WebAssemblyLike;
  /** localStorage를 돌려준다. 브라우저가 저장을 막으면 읽는 순간 오류가 날 수 있어 함수로 받는다. */
  readonly getLocalStorage?: () => StorageLike | null | undefined;
  readonly innerWidth?: number;
  readonly innerHeight?: number;
  readonly screen?: { readonly width?: number; readonly height?: number } | null;
  readonly devicePixelRatio?: number;
}

interface WindowSource {
  readonly isSecureContext?: boolean;
  readonly navigator?: NavigatorLike;
  readonly WebAssembly?: WebAssemblyLike;
  readonly localStorage?: StorageLike;
  readonly innerWidth?: number;
  readonly innerHeight?: number;
  readonly screen?: { readonly width?: number; readonly height?: number };
  readonly devicePixelRatio?: number;
}

/** 브라우저의 window(또는 globalThis)에서 점검 환경을 만든다. */
export function envFromWindow(win: object = globalThis): CapabilityEnv {
  const source = win as WindowSource;
  return {
    isSecureContext: source.isSecureContext,
    navigator: source.navigator,
    WebAssembly: source.WebAssembly,
    // localStorage는 읽는 순간 오류가 날 수 있어 실제로 쓸 때 읽는다.
    getLocalStorage: () => source.localStorage,
    innerWidth: source.innerWidth,
    innerHeight: source.innerHeight,
    screen: source.screen,
    devicePixelRatio: source.devicePixelRatio,
  };
}

// ── 브라우저 알아보기 ──

export type BrowserBrand = 'chrome' | 'edge' | 'whale' | 'samsung' | 'opera' | 'firefox' | 'safari' | 'chromium' | 'other';
export type PlatformName = 'windows' | 'macos' | 'linux' | 'chromeos' | 'android' | 'ios' | 'other';

export interface BrowserInfo {
  readonly brand: BrowserBrand;
  /** 화면에 보이는 브라우저 이름 */
  readonly name: string;
  readonly platform: PlatformName;
  /** 화면에 보이는 운영체제 이름 */
  readonly platformName: string;
  /** 휴대폰·태블릿(Android·iPhone·iPad)인지 */
  readonly mobile: boolean;
  /** 어느 정보로 알아냈는지: 'client-hints'(userAgentData) 또는 'user-agent'(userAgent 글자) */
  readonly source: 'client-hints' | 'user-agent';
}

const BRAND_NAMES: Readonly<Record<BrowserBrand, string>> = Object.freeze({
  chrome: 'Chrome',
  edge: 'Edge',
  whale: '웨일',
  samsung: '삼성 인터넷',
  opera: 'Opera',
  firefox: 'Firefox',
  safari: 'Safari',
  chromium: 'Chromium 계열 브라우저',
  other: '알 수 없는 브라우저',
});

const PLATFORM_NAMES: Readonly<Record<PlatformName, string>> = Object.freeze({
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  chromeos: 'ChromeOS',
  android: 'Android',
  ios: 'iPhone·iPad',
  other: '알 수 없는 운영체제',
});

/** 컴퓨터(데스크톱) 운영체제 */
const DESKTOP_PLATFORMS: ReadonlySet<PlatformName> = new Set<PlatformName>(['windows', 'macos', 'linux', 'chromeos']);

/** userAgentData.brands에 섞여 오는 가짜 이름(예: "Not_A Brand", "Not)A;Brand") */
const GREASE_BRAND = /not.?a.?brand/iu;

const CLIENT_HINT_BRANDS: readonly (readonly [RegExp, BrowserBrand])[] = [
  [/^Microsoft Edge$/u, 'edge'],
  [/^Google Chrome$/u, 'chrome'],
  [/whale/iu, 'whale'],
  [/^Samsung Internet$/u, 'samsung'],
  [/^Opera/u, 'opera'],
];

const CLIENT_HINT_PLATFORMS: Readonly<Record<string, PlatformName>> = Object.freeze({
  Windows: 'windows',
  macOS: 'macos',
  Linux: 'linux',
  'Chrome OS': 'chromeos',
  'Chromium OS': 'chromeos',
  Android: 'android',
  iOS: 'ios',
});

/** userAgent 글자로 브라우저 종류를 가른다(앞의 규칙이 먼저). */
function brandFromUserAgent(userAgent: string): BrowserBrand {
  if (/\bEdg(?:e|A|iOS)?\//u.test(userAgent)) return 'edge';
  if (/\bWhale\//u.test(userAgent)) return 'whale';
  if (/\bSamsungBrowser\//u.test(userAgent)) return 'samsung';
  if (/\b(?:OPR|OPT)\//u.test(userAgent)) return 'opera';
  if (/\b(?:Firefox|FxiOS)\//u.test(userAgent)) return 'firefox';
  if (/\b(?:Chrome|CriOS|Chromium|HeadlessChrome)\//u.test(userAgent)) return 'chrome';
  if (/\bVersion\/[\d.]+.*\bSafari\//u.test(userAgent)) return 'safari';
  return 'other';
}

/** userAgent 글자로 운영체제를 가른다. 데스크톱 모드 iPad는 Mac처럼 보이므로 터치 지점 수로 가른다. */
function platformFromUserAgent(userAgent: string, maxTouchPoints: number): PlatformName {
  if (/\b(?:iPhone|iPad|iPod)\b/u.test(userAgent)) return 'ios';
  if (/\bAndroid\b/u.test(userAgent)) return 'android';
  if (/\bCrOS\b/u.test(userAgent)) return 'chromeos';
  if (/\bWindows\b/u.test(userAgent)) return 'windows';
  if (/\bMacintosh\b|\bMac OS X\b/u.test(userAgent)) return maxTouchPoints > 1 ? 'ios' : 'macos';
  if (/\bLinux\b/u.test(userAgent)) return 'linux';
  return 'other';
}

/**
 * 지금 브라우저의 종류와 운영체제를 알아낸다. 버전은 보지 않는다.
 * userAgentData가 알려 주는 브랜드(Edge·Chrome·웨일 등)를 먼저 믿고, "Chromium"만 있거나 정보가 없으면 userAgent 글자를 본다.
 */
export function detectBrowser(env: CapabilityEnv): BrowserInfo {
  const navigator = env.navigator;
  const userAgent = typeof navigator?.userAgent === 'string' ? navigator.userAgent : '';
  const maxTouchPoints = typeof navigator?.maxTouchPoints === 'number' ? navigator.maxTouchPoints : 0;
  const uaData = navigator?.userAgentData ?? undefined;
  const brandNames = (uaData?.brands ?? [])
    .map((item) => (typeof item?.brand === 'string' ? item.brand.trim() : ''))
    .filter((name) => name !== '' && !GREASE_BRAND.test(name));

  let brand: BrowserBrand;
  let source: BrowserInfo['source'] = 'user-agent';
  const knownBrand = CLIENT_HINT_BRANDS.find(([pattern]) => brandNames.some((name) => pattern.test(name)));
  if (knownBrand) {
    brand = knownBrand[1];
    source = 'client-hints';
  } else if (brandNames.length > 0 && brandNames.some((name) => name !== 'Chromium')) {
    // Chromium을 바탕으로 한 다른 브라우저(이름을 모름). userAgent가 더 구체적인 이름을 알려 주면 그 이름을 쓴다.
    const fromUserAgent = brandFromUserAgent(userAgent);
    brand = fromUserAgent === 'chrome' || fromUserAgent === 'other' ? 'chromium' : fromUserAgent;
    source = 'client-hints';
  } else {
    brand = brandFromUserAgent(userAgent);
  }

  const hintedPlatform = typeof uaData?.platform === 'string' ? CLIENT_HINT_PLATFORMS[uaData.platform] : undefined;
  const platform = hintedPlatform ?? platformFromUserAgent(userAgent, maxTouchPoints);
  const mobile = uaData?.mobile === true || platform === 'android' || platform === 'ios';

  return Object.freeze({
    brand,
    name: BRAND_NAMES[brand],
    platform,
    platformName: PLATFORM_NAMES[platform],
    mobile,
    source,
  });
}

/** 사이트가 기준으로 삼는 브라우저(컴퓨터용 Chrome·Edge)인지 */
export function isRecommendedBrowser(info: BrowserInfo): boolean {
  return (info.brand === 'chrome' || info.brand === 'edge') && DESKTOP_PLATFORMS.has(info.platform);
}

// ── WebAssembly와 JSPI ──

/**
 * JSPI 시험용 WebAssembly 모듈(52바이트). 가져온 함수 probe.wait를 부르고 그 결과(i32)를 돌려주는 run 함수 하나만 있다.
 * wait를 WebAssembly.Suspending으로 감싸면, 약속(Promise)이 끝날 때까지 WebAssembly 실행이 멈췄다가 이어진다.
 * WebAssembly 점검에서는 이 모듈을 검사·컴파일만 한다.
 */
export const JSPI_PROBE_MODULE: readonly number[] = Object.freeze([
  // 머리말: "\0asm", 버전 1
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  // 형식 구역(1): 함수 형식 1개 () -> (i32)
  0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7f,
  // 가져오기 구역(2): "probe"."wait" 함수, 형식 0
  0x02, 0x0e, 0x01, 0x05, 0x70, 0x72, 0x6f, 0x62, 0x65, 0x04, 0x77, 0x61, 0x69, 0x74, 0x00, 0x00,
  // 함수 구역(3): 함수 1개, 형식 0
  0x03, 0x02, 0x01, 0x00,
  // 내보내기 구역(7): "run" = 함수 1번(0번은 가져온 wait)
  0x07, 0x07, 0x01, 0x03, 0x72, 0x75, 0x6e, 0x00, 0x01,
  // 코드 구역(10): 본문 1개 — 지역 변수 없음, call 0, end
  0x0a, 0x06, 0x01, 0x04, 0x00, 0x10, 0x00, 0x0b,
]);

/** 시험 모듈이 기다렸다가 돌려받는 값 */
export const JSPI_PROBE_VALUE = 42;

/** JSPI 이름(WebAssembly.Suspending 생성자와 WebAssembly.promising 함수)이 있는지 */
export function hasJspiApi(wasm: WebAssemblyLike | undefined): boolean {
  return typeof wasm?.Suspending === 'function' && typeof wasm?.promising === 'function';
}

function withTimeout<T>(value: Promise<T> | T, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${timeoutMs}ms 안에 끝나지 않았어요.`)), timeoutMs);
    Promise.resolve(value).then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * JSPI를 실제로 한 번 돌려 본다.
 * 'ok' = 멈췄다가 이어서 42를 돌려받음, 'no-api' = JSPI 이름이 없음, 'failed' = 이름은 있지만 시험 실행이 실패함.
 */
export async function probeJspi(
  wasm: WebAssemblyLike | undefined,
  timeoutMs: number = DEFAULT_CHECK_TIMEOUT_MS,
): Promise<'ok' | 'no-api' | 'failed'> {
  if (!wasm || !hasJspiApi(wasm) || typeof wasm.Module !== 'function' || typeof wasm.Instance !== 'function') {
    return 'no-api';
  }
  try {
    const WasmModule = wasm.Module;
    const WasmInstance = wasm.Instance;
    const Suspending = wasm.Suspending as NonNullable<WebAssemblyLike['Suspending']>;
    const promising = wasm.promising as NonNullable<WebAssemblyLike['promising']>;
    const module = new WasmModule(new Uint8Array(JSPI_PROBE_MODULE));
    const wait = new Suspending(
      () => new Promise<number>((resolve) => setTimeout(() => resolve(JSPI_PROBE_VALUE), 0)),
    );
    const instance = new WasmInstance(module, { probe: { wait } });
    const run = promising(instance.exports.run);
    const value = await withTimeout(run(), timeoutMs);
    return value === JSPI_PROBE_VALUE ? 'ok' : 'failed';
  } catch {
    return 'failed';
  }
}

// ── 결과 만들기 ──

function makeResult(id: CheckId, status: CheckStatus, summary: string, advice = '', detail?: string): CheckResult {
  const item = getCheckItem(id);
  const base = { id, label: item.label, neededFor: item.neededFor, status, summary, advice };
  return Object.freeze(detail === undefined ? base : { ...base, detail });
}

const HTTPS_ADVICE = '주소가 https://로 시작하는지 확인해 주세요. 오프라인판은 http://localhost 주소로 열어야 해요.';

/** 브라우저 종류: 컴퓨터용 Chrome·Edge면 지원, 아니면 확인 필요 */
export function checkBrowser(env: CapabilityEnv, browser: BrowserInfo = detectBrowser(env)): CheckResult {
  const who = `${browser.name}(${browser.platformName})`;
  if (isRecommendedBrowser(browser)) {
    return makeResult('browser', 'supported', `${who} — 사이트가 기준으로 삼는 브라우저예요.`);
  }
  if (browser.mobile) {
    return makeResult(
      'browser',
      'unknown',
      `${who} — 휴대폰이나 태블릿이에요.`,
      '학습 페이지와 퀴즈는 볼 수 있어요. 코드를 실행하거나 보드를 연결하는 실습은 컴퓨터의 Chrome이나 Edge에서 해 주세요.',
    );
  }
  return makeResult(
    'browser',
    'unknown',
    `${who} — 사이트가 기준으로 삼는 브라우저가 아니에요.`,
    '실습실은 컴퓨터용 Chrome이나 Edge 최신판에서 열어 주세요. 아래 항목이 모두 "지원"이어도 일부 실습은 다르게 움직일 수 있어요.',
  );
}

/** 보안 연결(https 또는 localhost) */
export function checkSecureContext(env: CapabilityEnv): CheckResult {
  if (env.isSecureContext === true) {
    return makeResult('secure-context', 'supported', '보안 연결로 열었어요.');
  }
  return makeResult('secure-context', 'unsupported', '보안 연결이 아니에요.', HTTPS_ADVICE);
}

/** WebAssembly: 있고, 시험 모듈을 검사·컴파일할 수 있는지 */
export function checkWebAssembly(env: CapabilityEnv): CheckResult {
  const wasm = env.WebAssembly;
  if (!wasm || typeof wasm.validate !== 'function' || typeof wasm.Module !== 'function') {
    return makeResult(
      'webassembly',
      'unsupported',
      '이 브라우저에는 WebAssembly가 없어요.',
      'Chrome이나 Edge 최신판으로 열어 주세요. 최신판에서도 같으면 학교나 기관의 보안 설정이 막았을 수 있으니 전산 담당자에게 이 결과를 보여 주세요.',
    );
  }
  try {
    const bytes = new Uint8Array(JSPI_PROBE_MODULE);
    if (wasm.validate(bytes) !== true) {
      throw new Error('검사 실패');
    }
    new wasm.Module(bytes);
  } catch {
    return makeResult(
      'webassembly',
      'unsupported',
      'WebAssembly가 있지만 실행이 막혀 있어요.',
      '브라우저나 학교의 보안 설정이 WebAssembly를 막았을 수 있어요. 전산 담당자에게 이 결과를 보여 주세요.',
    );
  }
  return makeResult('webassembly', 'supported', 'WebAssembly를 실행할 수 있어요.');
}

/** JSPI: 이름이 있고 시험 모듈이 실제로 멈췄다가 이어지는지 */
export async function checkJspi(env: CapabilityEnv, timeoutMs: number = DEFAULT_CHECK_TIMEOUT_MS): Promise<CheckResult> {
  const outcome = await probeJspi(env.WebAssembly, timeoutMs);
  if (outcome === 'ok') {
    return makeResult('jspi', 'supported', 'JSPI 시험 실행에 성공했어요.');
  }
  if (outcome === 'failed') {
    return makeResult(
      'jspi',
      'unknown',
      'JSPI가 보이지만 시험 실행에 실패했어요.',
      '브라우저를 최신판으로 업데이트한 뒤 다시 점검해 주세요. 계속 같으면 [결과 복사]로 복사한 내용을 문제 알리기(GitHub Issues)에 남겨 주세요.',
    );
  }
  return makeResult(
    'jspi',
    'unsupported',
    '이 브라우저에는 JSPI가 없어요.',
    '파이썬 코드를 실행하는 실습은 컴퓨터용 Chrome이나 Edge 최신판에서 해 주세요. 이 브라우저에서도 학습 페이지와 퀴즈는 볼 수 있어요. Chrome이나 Edge인데 이 결과가 나오면 브라우저를 업데이트해 주세요.',
  );
}

/** 카메라 기능: navigator.mediaDevices.getUserMedia가 있는지(허락 창은 띄우지 않는다) */
export function checkCameraApi(env: CapabilityEnv): CheckResult {
  const mediaDevices = env.navigator?.mediaDevices;
  if (mediaDevices && typeof mediaDevices.getUserMedia === 'function') {
    return makeResult(
      'camera-api',
      'supported',
      '카메라 기능이 있어요.',
      '실습에서 카메라를 켜면 브라우저가 허락을 물어요. 허락하는 방법은 학생용 시작하기에 있어요.',
    );
  }
  if (env.isSecureContext !== true) {
    return makeResult('camera-api', 'unsupported', '보안 연결이 아니라서 카메라 기능이 꺼져 있어요.', HTTPS_ADVICE);
  }
  return makeResult(
    'camera-api',
    'unsupported',
    '이 브라우저에서는 카메라 기능을 찾지 못했어요.',
    'Chrome이나 Edge 최신판으로 열어 주세요. 카메라가 없어도 샘플 영상으로 실습할 수 있게 준비하고 있어요.',
  );
}

/** 카메라 장치: 장치 목록에 카메라(videoinput)가 있는지. 허락 전이라 이름은 보지 않는다. */
export async function checkCameraDevice(
  env: CapabilityEnv,
  timeoutMs: number = DEFAULT_CHECK_TIMEOUT_MS,
): Promise<CheckResult> {
  const mediaDevices = env.navigator?.mediaDevices;
  if (!mediaDevices || typeof mediaDevices.enumerateDevices !== 'function') {
    return makeResult(
      'camera-device',
      'unknown',
      '카메라 장치를 확인할 수 없어요.',
      '위의 카메라 기능 항목을 먼저 확인해 주세요.',
    );
  }
  try {
    const devices = await withTimeout(mediaDevices.enumerateDevices(), timeoutMs);
    if (Array.isArray(devices) && devices.some((device) => device?.kind === 'videoinput')) {
      return makeResult(
        'camera-device',
        'supported',
        '카메라 장치가 보여요.',
        '화면이 실제로 나오는지는 실습에서 카메라를 켤 때 확인돼요.',
      );
    }
    return makeResult(
      'camera-device',
      'unknown',
      '카메라 장치를 찾지 못했어요.',
      '웹캠이 USB에 꽂혀 있는지, 노트북의 카메라 끄기 키나 가림막이 닫혀 있지 않은지 확인해 주세요. 카메라가 없어도 샘플 영상으로 실습할 수 있게 준비하고 있어요.',
    );
  } catch {
    return makeResult(
      'camera-device',
      'unknown',
      '카메라 장치 목록을 읽지 못했어요.',
      '브라우저 설정에서 이 사이트의 카메라가 막혀 있지 않은지 확인해 주세요.',
    );
  }
}

/** Web Serial: navigator.serial이 있는지만 본다(버전으로 짐작하지 않는다). */
export function checkWebSerial(env: CapabilityEnv, browser: BrowserInfo = detectBrowser(env)): CheckResult {
  const serial = env.navigator?.serial;
  if (serial === undefined || serial === null) {
    if (env.isSecureContext !== true) {
      return makeResult('web-serial', 'unsupported', '보안 연결이 아니라서 USB 보드 연결 기능이 꺼져 있어요.', HTTPS_ADVICE);
    }
    return makeResult(
      'web-serial',
      'unsupported',
      '이 브라우저에는 USB 보드 연결 기능이 없어요.',
      '실제 ESP32 보드를 연결하려면 컴퓨터용 Chrome이나 Edge로 열어 주세요. 보드 없이 하는 가상 보드 실습에는 이 기능이 필요 없어요.',
    );
  }
  if (browser.mobile) {
    return makeResult(
      'web-serial',
      'unknown',
      'USB 보드 연결 기능은 있지만 휴대폰이나 태블릿이에요.',
      '기기와 보드의 USB 칩에 따라 포트 선택 창에 보드가 보이지 않을 수 있어요. 실제 보드 연결은 컴퓨터의 Chrome이나 Edge를 권해요.',
    );
  }
  const firefoxNote =
    browser.brand === 'firefox' ? ' Firefox는 처음 연결할 때 사이트 권한을 위한 부가 기능 설치를 물을 수 있어요.' : '';
  return makeResult(
    'web-serial',
    'supported',
    'USB로 보드를 연결하는 기능이 있어요.',
    `포트 선택 창에 보드가 안 보이면 보드 준비 페이지의 안내를 따라 해 주세요.${firefoxNote}`,
  );
}

const BLUETOOTH_LINUX_ADVICE =
  'Linux의 Chrome에서는 주소창에 chrome://flags 를 열고 "Experimental Web Platform features"를 켜야 할 수 있어요. 수업에서는 Windows나 macOS 컴퓨터를 권해요.';

/** Web Bluetooth: navigator.bluetooth가 있는지, 있으면 getAvailability()로 블루투스를 쓸 수 있는지 */
export async function checkWebBluetooth(
  env: CapabilityEnv,
  browser: BrowserInfo = detectBrowser(env),
  timeoutMs: number = DEFAULT_CHECK_TIMEOUT_MS,
): Promise<CheckResult> {
  const bluetooth = env.navigator?.bluetooth;
  if (bluetooth === undefined || bluetooth === null) {
    if (env.isSecureContext !== true) {
      return makeResult('web-bluetooth', 'unsupported', '보안 연결이 아니라서 블루투스 기능이 꺼져 있어요.', HTTPS_ADVICE);
    }
    return makeResult(
      'web-bluetooth',
      'unsupported',
      '이 브라우저에는 블루투스 기능이 없어요.',
      browser.platform === 'linux'
        ? BLUETOOTH_LINUX_ADVICE
        : '블루투스 실습은 컴퓨터용 Chrome이나 Edge에서 해 주세요. 가상 보드로 하는 통신 실습에는 이 기능이 필요 없어요.',
    );
  }
  if (browser.platform === 'linux') {
    return makeResult('web-bluetooth', 'unknown', '블루투스 기능이 보이지만 Linux에서는 실험 기능이에요.', BLUETOOTH_LINUX_ADVICE);
  }
  if (typeof bluetooth.getAvailability === 'function') {
    try {
      const available = await withTimeout(bluetooth.getAvailability(), timeoutMs);
      if (available === false) {
        return makeResult(
          'web-bluetooth',
          'unknown',
          '블루투스를 쓸 수 없는 상태예요.',
          '컴퓨터에 블루투스 장치가 없거나, 꺼져 있거나, 설정으로 막혀 있을 수 있어요. 블루투스를 켜거나 USB 블루투스 어댑터(동글)를 꽂은 뒤 다시 점검해 주세요.',
        );
      }
    } catch {
      return makeResult(
        'web-bluetooth',
        'unknown',
        '블루투스를 쓸 수 있는지 확인하지 못했어요.',
        '컴퓨터의 블루투스가 켜져 있는지 확인한 뒤 다시 점검해 주세요.',
      );
    }
  }
  return makeResult(
    'web-bluetooth',
    'supported',
    '블루투스 기능이 있어요.',
    '블루투스 실습 전에 컴퓨터의 블루투스가 켜져 있는지 확인해 주세요.',
  );
}

/** 브라우저 저장 공간(localStorage): 잠깐 쓰고 읽고 지워 본다. */
export function checkLocalStorage(env: CapabilityEnv): CheckResult {
  const blocked = () =>
    makeResult(
      'local-storage',
      'unsupported',
      '브라우저가 저장 공간을 막고 있어요.',
      '실습은 할 수 있지만 쓴 코드가 자동으로 저장되지 않아요. 쿠키·사이트 데이터 차단 설정이나 학교의 브라우저 정책 때문일 수 있어요.',
    );
  try {
    const storage = env.getLocalStorage?.();
    if (!storage) {
      return blocked();
    }
    storage.setItem(STORAGE_TEST_KEY, '1');
    const readBack = storage.getItem(STORAGE_TEST_KEY);
    storage.removeItem(STORAGE_TEST_KEY);
    if (readBack !== '1') {
      return blocked();
    }
  } catch {
    return blocked();
  }
  return makeResult(
    'local-storage',
    'supported',
    '이 컴퓨터의 브라우저에 기록을 저장할 수 있어요.',
    '여러 사람이 쓰는 컴퓨터에서는 수업이 끝날 때 기록을 지워 주세요. 기록 지우기 버튼은 실습실과 함께 생겨요.',
  );
}

function positiveInteger(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
}

/** 화면 크기: 브라우저 창 너비가 RECOMMENDED_MIN_WIDTH 이상인지 */
export function checkScreen(env: CapabilityEnv): CheckResult {
  const width = positiveInteger(env.innerWidth);
  const height = positiveInteger(env.innerHeight);
  const screenWidth = positiveInteger(env.screen?.width ?? undefined);
  const screenHeight = positiveInteger(env.screen?.height ?? undefined);
  const ratio = typeof env.devicePixelRatio === 'number' && env.devicePixelRatio > 0 ? env.devicePixelRatio : undefined;

  const parts: string[] = [];
  if (width !== undefined && height !== undefined) parts.push(`브라우저 창 ${width}×${height}`);
  if (screenWidth !== undefined && screenHeight !== undefined) parts.push(`화면 ${screenWidth}×${screenHeight}`);
  if (ratio !== undefined) parts.push(`배율 ${Math.round(ratio * 100) / 100}`);
  const detail = parts.length > 0 ? parts.join(', ') : undefined;

  if (width === undefined) {
    return makeResult('screen', 'unknown', '브라우저 창 크기를 알 수 없어요.', '', detail);
  }
  if (width >= RECOMMENDED_MIN_WIDTH) {
    return makeResult('screen', 'supported', '실습실을 넉넉하게 볼 수 있는 창 너비예요.', '', detail);
  }
  return makeResult(
    'screen',
    'unknown',
    `브라우저 창 너비가 ${RECOMMENDED_MIN_WIDTH}보다 좁아요.`,
    '실습실은 창을 최대화하거나 더 넓은 화면에서 쓰면 편해요. 학습 페이지는 좁은 화면에서도 읽을 수 있어요.',
    detail,
  );
}

// ── 한꺼번에 점검하기 ──

export interface CheckReport {
  /** 점검한 때 */
  readonly checkedAt: Date;
  readonly browser: BrowserInfo;
  /** CHECK_IDS 순서로 정렬된 결과(요청한 항목만) */
  readonly results: readonly CheckResult[];
}

export interface RunChecksOptions {
  /** 비동기 점검을 기다리는 최대 시간(밀리초) */
  readonly timeoutMs?: number;
  /** 지금 시각(테스트에서 바꿔 넣음) */
  readonly now?: () => Date;
}

/** 점검을 돌린다. ids를 주면 그 항목만, 주지 않으면 전체를 CHECK_IDS 순서로 돌려준다. */
export async function runChecks(
  env: CapabilityEnv,
  ids: readonly CheckId[] = CHECK_IDS,
  options: RunChecksOptions = {},
): Promise<CheckReport> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS;
  const browser = detectBrowser(env);
  const wanted = CHECK_IDS.filter((id) => ids.includes(id));
  const results = await Promise.all(
    wanted.map((id): CheckResult | Promise<CheckResult> => {
      switch (id) {
        case 'browser':
          return checkBrowser(env, browser);
        case 'secure-context':
          return checkSecureContext(env);
        case 'webassembly':
          return checkWebAssembly(env);
        case 'jspi':
          return checkJspi(env, timeoutMs);
        case 'camera-api':
          return checkCameraApi(env);
        case 'camera-device':
          return checkCameraDevice(env, timeoutMs);
        case 'web-serial':
          return checkWebSerial(env, browser);
        case 'web-bluetooth':
          return checkWebBluetooth(env, browser, timeoutMs);
        case 'local-storage':
          return checkLocalStorage(env);
        case 'screen':
          return checkScreen(env);
      }
    }),
  );
  return Object.freeze({
    checkedAt: options.now ? options.now() : new Date(),
    browser,
    results: Object.freeze(results),
  });
}

export interface ReportSummary {
  readonly counts: Readonly<Record<CheckStatus, number>>;
  /** 'ready' = 모두 지원, 'partial' = 기본 실습은 되지만 확인할 항목이 있음, 'blocked' = 코드 실행 실습이 어려움 */
  readonly level: 'ready' | 'partial' | 'blocked';
  /** 한 줄 결론 */
  readonly message: string;
}

/** 점검 결과를 세고 한 줄 결론을 만든다. */
export function summarizeReport(report: CheckReport): ReportSummary {
  const counts: Record<CheckStatus, number> = { supported: 0, unsupported: 0, unknown: 0 };
  for (const result of report.results) {
    counts[result.status] += 1;
  }
  const statusOf = (id: CheckId) => report.results.find((result) => result.id === id)?.status;

  let level: ReportSummary['level'];
  let message: string;
  if (statusOf('secure-context') === 'unsupported') {
    level = 'blocked';
    message = '보안 연결(https)이 아니라서 실습 기능이 꺼져 있어요. 주소를 확인해 주세요.';
  } else if (statusOf('webassembly') === 'unsupported' || statusOf('jspi') === 'unsupported') {
    level = 'blocked';
    message = '이 브라우저로는 파이썬 코드를 실행하는 실습이 어려워요. 학습 페이지와 퀴즈는 볼 수 있어요.';
  } else if (counts.unsupported > 0 || counts.unknown > 0) {
    level = 'partial';
    message = '"미지원"이나 "확인 필요" 항목이 있어요. 표의 안내를 확인해 주세요.';
  } else {
    level = 'ready';
    message = '점검한 항목이 모두 "지원"이에요.';
  }
  return Object.freeze({ counts: Object.freeze(counts), level, message });
}

/** 점검 시각을 "2026-09-16 14:05 (UTC+09:00)" 모양으로 적는다(이 컴퓨터의 시간대 기준). */
export function formatCheckedAt(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const absolute = Math.abs(offset);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())} (UTC${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)})`
  );
}

export interface ReportMeta {
  /** 사이트 이름 */
  readonly siteName: string;
  /** 사이트 버전 */
  readonly siteVersion?: string;
  /** 점검한 페이지 주소(검색어·# 없이) */
  readonly pageUrl?: string;
  /** navigator.userAgent 글자 */
  readonly userAgent?: string;
}

/** [결과 복사]로 복사할 글. 이름 같은 개인정보는 넣지 않고 브라우저·기기 정보와 결과만 적는다. */
export function formatReport(report: CheckReport, meta: ReportMeta): string {
  const summary = summarizeReport(report);
  const browser = report.browser;
  const lines = [
    `[${meta.siteName}] 브라우저 점검 결과`,
    `점검 시각: ${formatCheckedAt(report.checkedAt)}`,
  ];
  if (meta.pageUrl) lines.push(`점검한 주소: ${meta.pageUrl}`);
  if (meta.siteVersion) lines.push(`사이트 버전: ${meta.siteVersion}`);
  lines.push(`브라우저: ${browser.name} · ${browser.platformName}${browser.mobile ? ' · 휴대폰·태블릿' : ''}`);
  if (meta.userAgent) lines.push(`사용자 에이전트(브라우저가 알려 주는 이름표): ${meta.userAgent}`);
  lines.push('');
  for (const result of report.results) {
    const detail = result.detail ? ` [${result.detail}]` : '';
    lines.push(`- ${result.label}: ${STATUS_LABELS[result.status]} — ${result.summary}${detail}`);
  }
  lines.push(
    '',
    `요약: 지원 ${summary.counts.supported}개 · 미지원 ${summary.counts.unsupported}개 · 확인 필요 ${summary.counts.unknown}개`,
    summary.message,
  );
  return lines.join('\n');
}

// ── 브라우저 권장 환경 안내 ──

/** 'none' = 안내 없음, 'other-browser' = Chrome·Edge(컴퓨터용)가 아님, 'update-browser' = Chrome·Edge지만 JSPI가 없음 */
export type BrowserNoticeVariant = 'none' | 'other-browser' | 'update-browser';

/** 브라우저 권장 환경 안내를 보일지, 어떤 안내를 보일지 정한다(동기, 페이지를 여는 즉시 쓸 수 있게). */
export function decideBrowserNotice(env: CapabilityEnv, browser: BrowserInfo = detectBrowser(env)): BrowserNoticeVariant {
  if (!isRecommendedBrowser(browser)) {
    return 'other-browser';
  }
  return hasJspiApi(env.WebAssembly) ? 'none' : 'update-browser';
}

function readStorage(getStorage: CapabilityEnv['getLocalStorage']): StorageLike | undefined {
  try {
    return getStorage?.() ?? undefined;
  } catch {
    return undefined;
  }
}

/** 이 안내를 전에 닫았는지(저장 공간을 못 쓰면 닫지 않은 것으로 본다) */
export function isBrowserNoticeDismissed(
  variant: BrowserNoticeVariant,
  getStorage: CapabilityEnv['getLocalStorage'],
): boolean {
  if (variant === 'none') {
    return false;
  }
  try {
    return readStorage(getStorage)?.getItem(BROWSER_NOTICE_DISMISS_KEY) === variant;
  } catch {
    return false;
  }
}

/** 안내를 닫았다고 기억한다. 저장하지 못하면 false(이번 페이지에서만 닫힌다). */
export function rememberBrowserNoticeDismissed(
  variant: BrowserNoticeVariant,
  getStorage: CapabilityEnv['getLocalStorage'],
): boolean {
  if (variant === 'none') {
    return false;
  }
  try {
    const storage = readStorage(getStorage);
    if (!storage) {
      return false;
    }
    storage.setItem(BROWSER_NOTICE_DISMISS_KEY, variant);
    return true;
  } catch {
    return false;
  }
}
