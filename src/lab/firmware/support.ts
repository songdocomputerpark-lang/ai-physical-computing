/**
 * 이 브라우저에서 펌웨어를 구울 수 있는지 — SPEC §6.2 "지원 브라우저(Chrome/Edge 데스크톱) 아니면 안내 문구", §9, PLAN PD-28.
 *
 * 판단은 사이트 공통 점검(src/lib/capabilities.ts)을 그대로 쓴다: 브라우저 버전으로 짐작하지 않고 navigator.serial이 있는지,
 * 보안 연결인지, 휴대폰·태블릿인지만 본다. 그래서 Chrome·Edge·웨일 데스크톱과 Web Serial이 켜진 Firefox 151+ 데스크톱(PD-28)은 굽고,
 * Safari·Web Serial 없는 Firefox·휴대폰·태블릿은 안내만 보인다(SPEC §9 "모바일: Web Serial은 불가 안내").
 * 굽기는 JSPI가 필요 없다(파이썬을 돌리지 않는다).
 */
import { checkWebSerial, detectBrowser, type CapabilityEnv } from '../../lib/capabilities.ts';

export type FlashSupportState = 'ready' | 'no-serial' | 'insecure' | 'mobile';

export interface FlashSupport {
  readonly state: FlashSupportState;
  /** 한 줄 요약 */
  readonly title: string;
  /** 무엇을 하면 되는지 */
  readonly detail: string;
  /** 화면에 보일 브라우저·운영체제 이름(예: Chrome · Windows) */
  readonly browser: string;
}

/** 이 브라우저에서 펌웨어를 구울 수 있는지 판단한다 */
export function decideFlashSupport(env: CapabilityEnv): FlashSupport {
  const browser = detectBrowser(env);
  const label = `${browser.name} · ${browser.platformName}`;
  const serial = checkWebSerial(env, browser);
  if (serial.status === 'supported') {
    const firefox =
      browser.brand === 'firefox' ? ' Firefox는 처음 연결할 때 사이트 권한을 위한 부가 기능 설치를 물을 수 있어요.' : '';
    return {
      state: 'ready',
      title: '이 브라우저에서 펌웨어를 구울 수 있어요.',
      detail: `보드를 USB 케이블로 컴퓨터에 꽂은 뒤 시작해요.${firefox}`,
      browser: label,
    };
  }
  if (env.navigator?.serial !== undefined && env.navigator?.serial !== null && browser.mobile) {
    return {
      state: 'mobile',
      title: '휴대폰이나 태블릿에서는 펌웨어를 굽지 않아요.',
      detail: '컴퓨터에 보드를 꽂고 컴퓨터용 Chrome이나 Edge로 이 페이지를 열어 주세요. 보드 없이 하는 가상 보드 실습은 지금 기기에서도 돼요.',
      browser: label,
    };
  }
  if (env.isSecureContext !== true) {
    return {
      state: 'insecure',
      title: '보안 연결(https)이 아니라서 USB 보드 연결 기능이 꺼져 있어요.',
      detail: '주소가 https://로 시작하는 이 사이트 주소로 다시 열어 주세요.',
      browser: label,
    };
  }
  return {
    state: browser.mobile ? 'mobile' : 'no-serial',
    title: browser.mobile ? '휴대폰이나 태블릿에서는 펌웨어를 굽지 않아요.' : '이 브라우저에는 USB 보드 연결 기능이 없어요.',
    detail: '펌웨어 굽기는 컴퓨터용 Chrome이나 Edge 최신판에서 해요. 이 페이지의 다른 안내와 가상 보드 실습은 지금 브라우저에서도 볼 수 있어요.',
    browser: label,
  };
}
