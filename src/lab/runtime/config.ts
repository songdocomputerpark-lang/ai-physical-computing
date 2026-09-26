/**
 * 파이썬 실행기 설정 한 곳(PLAN §5.2 PD-02, §4.4 PD-01, §8.2 P2-01).
 * Pyodide 주소·버전·정지 시간처럼 바꿀 일이 있는 값은 이 파일만 고친다. 화면 쪽(client.ts)과 테스트가 읽는다.
 *
 * 오프라인 배포판(PLAN §5.6, P6-07): `npm run build:offline`은 이 사이트를 한 번 더 빌드하면서 `__APC_OFFLINE__`을 true로 새긴다
 * (scripts/offline/astro.config.offline.mjs — 보통 설정에 define 한 줄을 더한 것). 그 빌드에서만 `OFFLINE_BUILD`가 true가 되어
 * 파이썬 엔진을 jsDelivr 대신 **같은 사이트 파일에서만** 받는다. 온라인 사이트·개발 서버·Node(스크립트·테스트)에는 이 이름이 없어서
 * 늘 false다 — 그래서 온라인 사이트의 동작(jsDelivr 먼저 → 막히면 같은 사이트 예비본)은 그대로다.
 */
import { withBase } from '../../lib/url.ts';

/**
 * 오프라인 배포판 빌드가 번들에 새겨 넣는 표시(scripts/offline/astro.config.offline.mjs의 vite.define).
 * 보통 빌드·개발 서버·Node에는 정의되지 않는다(typeof로만 읽는다 — src/config/site.ts의 __APC_BASE__와 같은 방식).
 */
declare const __APC_OFFLINE__: boolean | undefined;

/** 이 번들이 오프라인 배포판인지(PLAN §5.6). 온라인 사이트·개발 서버·Node에서는 false. */
export const OFFLINE_BUILD: boolean = typeof __APC_OFFLINE__ === 'boolean' ? __APC_OFFLINE__ : false;

/** Pyodide 버전(PLAN §3.1, PD-02). 올릴 때는 회귀 테스트(tests/unit/lab/, tests/e2e/lab-runtime.spec.ts)를 통과시킨 뒤에만(PLAN §4.5). */
export const PYODIDE_VERSION = '314.0.7';

/**
 * 기본 위치: jsDelivr의 Pyodide 공식 배포 경로(버전 고정, 1년 캐시, CORS 허용 — PLAN §5.1 확인).
 * 이 폴더의 pyodide.mjs·pyodide.asm.mjs·pyodide.asm.wasm·python_stdlib.zip·pyodide-lock.json과 패키지 휠을 받는다
 * (2026-09-16 jsDelivr 응답으로 확인. 314 판에는 pyodide.asm.js가 없고 pyodide.asm.mjs만 있다).
 */
export const PYODIDE_CDN_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

/**
 * 같은 사이트 예비본 경로(PD-02·PD-13). 빌드 때 필요한 파일만 받아 배포물에 넣고 저장소에는 커밋하지 않는다.
 * 예비본은 `scripts/fetch-pyodide-fallback.mjs`(prebuild)가 `public/vendor/pyodide/<버전>/`에 넣는다(P2-05).
 */
export const PYODIDE_SITE_INDEX_PATH = withBase(`vendor/pyodide/${PYODIDE_VERSION}/`);

/**
 * 같은 사이트 예비본이 배포물에 있는지(P2-05에서 켬).
 * 켜지면 첫 방문에 서비스 워커가 아직 페이지를 맡기 전이라도 워커가 CDN → 같은 사이트 순서로 시도한다.
 * 그 뒤부터는 서비스 워커가 파일 하나 단위로 바꿔 준다(두 겹).
 */
export const PYODIDE_SITE_FALLBACK_READY = true;

/**
 * 워커가 차례로 시도할 Pyodide 위치. 앞의 것이 실패하면 다음 것을 쓴다(P2-05에서 "받은 양이 15초 동안 늘지 않으면"도 더한다).
 * 오프라인 배포판은 같은 사이트 파일 하나만 쓴다 — 인터넷이 없는 교실에서 jsDelivr를 먼저 두드리며 기다리지 않게(PLAN §5.6).
 * @param origin 같은 사이트 예비본 주소를 만들 때 쓰는 사이트 출처(브라우저에서는 location.origin)
 * @param offline 오프라인 배포판처럼 고를지(기본: 이 번들의 OFFLINE_BUILD — 단위 테스트가 두 경우를 모두 본다)
 */
export function pyodideIndexUrls(origin?: string, offline: boolean = OFFLINE_BUILD): string[] {
  if (offline) {
    return [origin ? new URL(PYODIDE_SITE_INDEX_PATH, origin).href : PYODIDE_SITE_INDEX_PATH];
  }
  const urls = [PYODIDE_CDN_INDEX_URL];
  if (PYODIDE_SITE_FALLBACK_READY && origin) {
    urls.push(new URL(PYODIDE_SITE_INDEX_PATH, origin).href);
  }
  return urls;
}

/**
 * 실습 중 브라우저가 접속해도 되는 사이트 밖 출처(SPEC §2 서버 제로: 학생 영상·음성은 브라우저 밖으로 나가지 않는다).
 * 브라우저 테스트가 이 목록과 사이트 자신 말고 다른 곳으로 가는 요청이 0건인지 확인한다. MediaPipe·모델은 같은 사이트(P2-08).
 * 오프라인 배포판은 사이트 밖으로 나갈 일이 없어 빈 목록이다(tests/e2e/offline.spec.ts가 인터넷을 막고 0건인지 본다).
 */
export const ALLOWED_REMOTE_ORIGINS: readonly string[] = Object.freeze(OFFLINE_BUILD ? [] : ['https://cdn.jsdelivr.net']);

/**
 * 정지 2단계까지 기다리는 시간(밀리초, PLAN §4.4). [정지]를 눌렀는데 이 시간 안에 파이썬이 멈추지 않으면
 * (양보 지점이 없는 계산 반복문) 워커를 끝내고 새로 띄운다. PLAN 표의 1.5초를 P2-01 완료 기준("1초 안에")에 맞춰 1초로 정했다.
 */
export const STOP_GRACE_MS = 1000;

/**
 * 양보 간격(밀리초, CODE_MAPPING §3.0 규칙 2·3). 아주 짧은 sleep은 이만큼 모아서 한 번에 기다리고,
 * sleep 없는 반복문의 입력 조회 함수는 이 간격마다 한 번 양보한다. 파이썬 쪽 값(apc_runtime.py의 YIELD_INTERVAL_MS)과 같아야 한다.
 */
export const YIELD_INTERVAL_MS = 16;

/** 학생 코드의 파일 이름(트레이스백에 보인다, P2-06이 이 이름으로 줄 번호를 찾는다) */
export const STUDENT_FILENAME = 'main.py';
