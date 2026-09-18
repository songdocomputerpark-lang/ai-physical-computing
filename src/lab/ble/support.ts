/**
 * 이 브라우저에서 실제 기기와 블루투스로 이을 수 있는지 — 기능 감지(P4-04, PD-28 "버전 숫자로 짐작하지 않는다").
 * 판정 자체는 점검 페이지와 **같은 함수**(`src/lib/capabilities.ts`의 `checkWebBluetooth`)를 쓰고,
 * 여기서는 블루투스 칸에 보일 말만 덧붙인다(실제 보드 Web Serial 쪽 `src/lab/serial/support.ts`와 같은 방식).
 *
 * 공식 문서로 확인한 것(2026-09-18, MDN "Web Bluetooth API" 호환성):
 *   컴퓨터용 Chrome·Edge·Opera와 Android Chrome에 있고, **Firefox·Safari·iOS(아이폰·아이패드의 모든 브라우저)에는 없다.**
 *   보안 연결(https)에서만 되고 `navigator.bluetooth.requestDevice()`는 **사용자 조작(클릭) 안에서** 불러야 한다.
 *   Linux Chrome은 chrome://flags의 실험 기능을 켜야 한다(WebBluetoothCG 구현 상태 문서 — capabilities.ts 머리말).
 */
import { checkWebBluetooth, detectBrowser, envFromWindow, isRecommendedBrowser, type CapabilityEnv, type CheckStatus } from '../../lib/capabilities.ts';

export interface BleSupport {
  /** supported = 이을 수 있음, unsupported = 기능 없음, unknown = 기능은 있지만 확인이 필요(블루투스 꺼짐·Linux 실험 기능) */
  readonly level: CheckStatus;
  /** 사이트가 기준으로 시험하는 브라우저(컴퓨터용 Chrome·Edge)인지 */
  readonly recommended: boolean;
  readonly browserName: string;
  readonly mobile: boolean;
  /** 아이폰·아이패드인가(여기서는 어떤 브라우저를 써도 블루투스가 없다) */
  readonly ios: boolean;
  readonly firefox: boolean;
  /** 결과 한 문장(점검 페이지와 같은 글) */
  readonly summary: string;
  /** 대처 안내 */
  readonly advice: string;
}

/** navigator.bluetooth(없으면 null). requestDevice가 있는 것까지 본다. */
export function bluetoothApi(scope: { readonly navigator?: { readonly bluetooth?: unknown } } = globalThis as never): Bluetooth | null {
  const api = scope.navigator?.bluetooth;
  return api !== null && api !== undefined && typeof (api as Bluetooth).requestDevice === 'function' ? (api as Bluetooth) : null;
}

/** 이 브라우저에 Web Bluetooth가 있나(화면을 그리기 전에 바로 알아야 해서 동기 함수로 둔다) */
export function hasWebBluetooth(scope: { readonly navigator?: { readonly bluetooth?: unknown } } = globalThis as never): boolean {
  return bluetoothApi(scope) !== null;
}

/** 지원하지 않는 환경에 맞춘 한 줄(iOS·Firefox를 이름으로 짚어 준다) */
export function unsupportedAdvice(browserName: string, ios: boolean, firefox: boolean): string {
  if (ios) {
    return '아이폰·아이패드는 브라우저 종류와 상관없이 블루투스로 기기를 연결할 수 없어요.';
  }
  if (firefox) {
    return 'Firefox에는 블루투스로 기기를 연결하는 기능이 없어요.';
  }
  return `${browserName}에는 블루투스로 기기를 연결하는 기능이 없어요.`;
}

/**
 * 블루투스를 쓸 수 있는지 본다. `getAvailability()`(블루투스가 켜져 있는지)를 기다리므로 비동기다.
 * 화면은 먼저 `hasWebBluetooth()`로 칸을 그리고, 이 결과가 오면 안내를 더 자세히 바꾼다.
 */
export async function detectBleSupport(env: CapabilityEnv = envFromWindow()): Promise<BleSupport> {
  const browser = detectBrowser(env);
  const check = await checkWebBluetooth(env, browser);
  const ios = browser.platform === 'ios';
  const firefox = browser.brand === 'firefox';
  const advice = check.status === 'unsupported' ? `${unsupportedAdvice(browser.name, ios, firefox)} ${check.advice}` : check.advice;
  return Object.freeze({
    level: check.status,
    recommended: isRecommendedBrowser(browser),
    browserName: browser.name,
    mobile: browser.mobile,
    ios,
    firefox,
    summary: check.summary,
    advice,
  });
}
