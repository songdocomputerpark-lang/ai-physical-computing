/**
 * 파이썬 엔진 받기를 [실행]을 누를 때까지 미루는 경우(판 1.3.0 검수 R1-097).
 *
 * 실습실은 열자마자 파이썬 엔진(약 13MB)을 받기 시작한다. 학생이 아직 [실행]할지 정하지도 않았는데 **데이터 요금이 드는 연결**에서 받게 되는 것이
 * 문제라서, 브라우저가 스스로 "데이터를 아끼는 중"(Save-Data)이라고 하거나 "휴대폰 데이터(cellular)"라고 알리는 연결에서만 받기를 미룬다. 미룬 실습실은
 * [실행]을 누르면 그때 받는다(예약 실행 — lab-shell.ts run()이 준비되면 바로 실행). 학교 Wi-Fi·유선(컴퓨터·태블릿 포함)은 지금처럼 열자마자 받는다.
 *
 * 화면 폭·터치 여부로 가르지 않는 까닭: 학교 Wi-Fi에 붙은 휴대폰도 많고(받기를 미루면 [실행]까지 몇 분을 더 기다린다), 폭만 좁은 컴퓨터 창이나
 * 시험(e2e)의 휴대폰 화면 크기가 받기를 멈추게 하면 안 되기 때문이다. navigator.connection.type은 안드로이드 Chrome만 알려 주고(없으면 미루지 않는다),
 * effectiveType(2g·3g)은 쓰지 않는다 — 느린 학교망은 느린 것이지 막힌 것이 아니라서 받기를 계속하고, 준비 칸이 기대 시간을 알린다(loading/panel.astro).
 * 판단은 순수 함수(shouldDeferEngineLoad)에 두고 환경은 readDeferEnv가 읽는다 — 단위 테스트가 환경을 바꿔 끼운다.
 */

/** 받기를 미룰지 가르는 환경 값 */
export interface DeferEnv {
  /** 브라우저의 데이터 절약 모드(navigator.connection.saveData) */
  readonly saveData: boolean;
  /** 휴대폰 데이터 연결(navigator.connection.type === 'cellular') */
  readonly cellular: boolean;
}

/** 이 환경에서는 [실행]을 눌러야 파이썬 엔진을 받는가 */
export function shouldDeferEngineLoad(env: DeferEnv): boolean {
  return env.saveData || env.cellular;
}

/** 지금 브라우저의 환경 값을 읽는다(읽을 수 없으면 미루지 않는 값) */
export function readDeferEnv(win: { navigator: Navigator } | undefined = typeof window === 'undefined' ? undefined : window): DeferEnv {
  if (win === undefined) {
    return { saveData: false, cellular: false };
  }
  try {
    const connection = (win.navigator as Navigator & { connection?: { saveData?: boolean; type?: string } }).connection;
    return { saveData: connection?.saveData === true, cellular: connection?.type === 'cellular' };
  } catch {
    return { saveData: false, cellular: false };
  }
}

/** 받기를 미룬 실습실이 상태 줄 아래 안내에 보이는 글(크기는 부르는 쪽이 아는 값으로 채운다) */
export function deferredLoadMessage(sizeText: string): string {
  return `[실행]을 누르면 파이썬 준비를 시작해요. 처음 한 번만 ${sizeText}를 받아요.`;
}
