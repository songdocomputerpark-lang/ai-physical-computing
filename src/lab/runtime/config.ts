/**
 * 파이썬 실행기 설정 한 곳(PLAN §5.2 PD-02, §4.4 PD-01, §8.2 P2-01).
 * Pyodide 주소·버전·정지 시간처럼 바꿀 일이 있는 값은 이 파일만 고친다. 화면 쪽(client.ts)과 테스트가 읽는다.
 */
import { withBase } from '../../lib/url.ts';

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
 * 예비본 파일과 내려받기 스크립트는 P2-05에서 만든다. 그때까지는 후보 목록(pyodideIndexUrls)에 넣지 않는다.
 */
export const PYODIDE_SITE_INDEX_PATH = withBase(`vendor/pyodide/${PYODIDE_VERSION}/`);

/** 같은 사이트 예비본이 배포물에 있는지. P2-05에서 true로 바꾼다. */
export const PYODIDE_SITE_FALLBACK_READY = false;

/**
 * 워커가 차례로 시도할 Pyodide 위치. 앞의 것이 실패하면 다음 것을 쓴다(P2-05에서 "받은 양이 15초 동안 늘지 않으면"도 더한다).
 * @param origin 같은 사이트 예비본 주소를 만들 때 쓰는 사이트 출처(브라우저에서는 location.origin)
 */
export function pyodideIndexUrls(origin?: string): string[] {
  const urls = [PYODIDE_CDN_INDEX_URL];
  if (PYODIDE_SITE_FALLBACK_READY && origin) {
    urls.push(new URL(PYODIDE_SITE_INDEX_PATH, origin).href);
  }
  return urls;
}

/**
 * 실습 중 브라우저가 접속해도 되는 사이트 밖 출처(SPEC §2 서버 제로: 학생 영상·음성은 브라우저 밖으로 나가지 않는다).
 * 브라우저 테스트가 이 목록과 사이트 자신 말고 다른 곳으로 가는 요청이 0건인지 확인한다. MediaPipe·모델은 같은 사이트(P2-08).
 */
export const ALLOWED_REMOTE_ORIGINS: readonly string[] = Object.freeze(['https://cdn.jsdelivr.net']);

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
