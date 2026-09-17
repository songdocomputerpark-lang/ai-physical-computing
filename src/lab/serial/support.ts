/**
 * 이 브라우저에서 실제 보드(Web Serial)를 연결할 수 있는지 — 기능 감지(P3-07, PD-28).
 *
 * 규칙(PD-28): 버전 숫자로 짐작하지 않고 navigator.serial이 있는지로 정한다(점검 페이지와 같은 판정 src/lib/capabilities.ts checkWebSerial).
 * 1차 테스트·안내 기준은 컴퓨터용 Chrome·Edge다. Firefox 151+ 데스크톱은 navigator.serial이 있으면 허용하고, 처음 연결할 때 사이트 권한
 * 부가 기능 설치를 물을 수 있다고 알린다. 실제 보드 탭은 파이썬(JSPI)이 필요 없어 JSPI가 없는 브라우저에서도 된다.
 * 근거(2026-09-17 확인): MDN browser-compat-data api/Serial.json·SerialPort.json — Chrome 89·Edge(mirror)·Firefox 151 데스크톱이
 * requestPort·getPorts·open·readable·writable·setSignals·getSignals·getInfo·forget·close를 지원, Android Chrome 148+는 유선 포트(일부 기기),
 * Safari·iOS는 없음.
 */
import { checkWebSerial, detectBrowser, envFromWindow, isRecommendedBrowser, type CapabilityEnv, type CheckStatus } from '../../lib/capabilities.ts';

export interface SerialSupport {
  /** supported = 연결할 수 있음, unsupported = 기능 없음, unknown = 기능은 있지만 확인 필요(휴대폰·태블릿) */
  readonly level: CheckStatus;
  /** 사이트가 기준으로 시험하는 브라우저(컴퓨터용 Chrome·Edge)인지 */
  readonly recommended: boolean;
  readonly browserName: string;
  readonly firefox: boolean;
  readonly mobile: boolean;
  /** 결과 한 문장(점검 페이지와 같은 글) */
  readonly summary: string;
  /** 대처 안내 */
  readonly advice: string;
}

export function detectSerialSupport(env: CapabilityEnv = envFromWindow()): SerialSupport {
  const browser = detectBrowser(env);
  const check = checkWebSerial(env, browser);
  return Object.freeze({
    level: check.status,
    recommended: isRecommendedBrowser(browser),
    browserName: browser.name,
    firefox: browser.brand === 'firefox',
    mobile: browser.mobile,
    summary: check.summary,
    advice: check.advice,
  });
}

/** navigator.serial(없으면 null) */
export function navigatorSerial(scope: { readonly navigator?: { readonly serial?: unknown } } = globalThis as never): Serial | null {
  const serial = scope.navigator?.serial;
  return serial && typeof (serial as Serial).requestPort === 'function' ? (serial as Serial) : null;
}
