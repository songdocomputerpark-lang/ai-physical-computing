/**
 * 로딩 전략·재방문 캐시의 설정 한 곳(PLAN §5.3 PD-11, §5.4, §8.2 P2-05).
 *
 * 여기 값은 세 곳이 함께 읽는다: 실습실의 로딩 모듈(src/lab/modules/loading/), 점검 페이지의 네트워크 시험 부품
 * (src/components/start/network-check/), 그리고 빌드 때 서비스 워커에 JSON으로 새겨지는 값(scripts/build-sw.mjs → src/sw/sw.js).
 * 서비스 워커는 이 파일을 import하지 않고(번들러가 없다) 빌드 스크립트가 넣어 준 값을 읽으므로, 값을 바꾸면 빌드를 다시 한다.
 * Node.js(scripts/)도 이 파일을 직접 읽으므로 타입 표기만 지우면 그대로 도는 문법만 쓴다(enum·namespace 금지).
 */

/**
 * "받은 양이 15초 동안 늘지 않으면" 예비 경로로 바꾸는 기준(PLAN §5.4). 전체 시간이 아니라 멈춤을 기준으로 삼아
 * 느린 망에서 오판하지 않는다. 서비스 워커의 CDN 받기와 화면의 CDN 살핌(probe)이 같은 값을 쓴다.
 */
export const PYODIDE_STALL_MS = 15_000;

/**
 * 화면이 CDN을 살펴보기 시작하는 시점: 파이썬을 받기 시작한 뒤 이만큼 동안 **진행이 없을 때**(PLAN §5.4 "받은 양이 15초 동안 늘지 않으면").
 * 서비스 워커가 페이지를 맡은 방문에는 파일 진행 메시지가 계속 오므로 여기까지 오지 않는다. 서비스 워커가 없는 첫 방문에는
 * 실행기의 단계 알림만 신호이므로, 그마저 멈추면 CDN이 막혔거나 아주 느린 것으로 본다.
 */
export const PROBE_AFTER_IDLE_MS = PYODIDE_STALL_MS;

/**
 * 살핌(probe) 한 번에 쓰는 멈춤 기준. 이미 15초를 기다린 뒤라 더 짧게 잡아 빨리 판단한다(작은 파일 18KB만 받아 본다).
 */
export const PROBE_STALL_MS = 5_000;

/** 준비가 모두 끝난 뒤 받은 파일을 캐시에 넣어 두기까지 기다리는 시간(패키지 받기와 겹치지 않게) */
export const WARM_DELAY_MS = 3_000;

/** CDN이 한 번 막힌(멈춤·오류) 뒤 다시 시도하지 않고 예비 경로만 쓰는 시간(서비스 워커 메모리 안, 워커가 잠들면 초기화된다) */
export const CDN_DOWN_TTL_MS = 5 * 60_000;

/** 서비스 워커가 페이지를 맡을 때까지(controllerchange) 기다리는 시간 */
export const CONTROLLER_WAIT_MS = 10_000;

/** 네트워크 시험 한 항목의 최대 시간 */
export const NETWORK_CHECK_TIMEOUT_MS = 15_000;

/** 서비스 워커 파일 이름(사이트 뿌리 = base 바로 아래). 범위가 사이트 전체가 되려면 이 위치여야 한다. */
export const SW_SCRIPT_NAME = 'sw.js';

/** 빌드 스크립트가 서비스 워커 원본(src/sw/sw.js)에서 설정 JSON으로 바꿔 넣는 자리 표시 */
export const SW_CONFIG_PLACEHOLDER = '__APC_SW_CONFIG__';

/** 캐시 이름 머리말. 서비스 워커는 이 머리말로 시작하는 캐시만 만들고 지운다(같은 출처의 다른 사이트 캐시는 건드리지 않는다). */
export const CACHE_PREFIX = 'apc-';

/**
 * 캐시 이름. 뒤의 v 번호는 "내용 규칙이 바뀌어 옛 캐시를 버려야 할 때" 올린다.
 * - 셸(precache): 공통 CSS·JS·글꼴 CSS·아이콘. 항목마다 revision을 헤더에 적어 바뀐 것만 다시 받는다.
 * - pages: HTML(네트워크 우선, 없으면 캐시). search: Pagefind 색인(네트워크 우선).
 * - assets: _astro/ 해시 이름 파일(캐시 우선, 불변). fonts: Pretendard 조각(캐시 우선; 글꼴 판을 올리면 v를 올린다).
 * - vendor: 같은 사이트 MediaPipe WASM·모델(캐시 우선, 경로에 판이 들어 있다). static: 그림·고지 파일(캐시를 먼저 주고 뒤에서 새로 받음).
 * - pyodide-<판>: Pyodide 코어와 휠. CDN 주소와 같은 사이트 예비본 주소를 하나로 본다(어느 쪽으로 받았든 같은 파일).
 */
export const PRECACHE_NAME = `${CACHE_PREFIX}precache-v1`;
export const PAGES_CACHE = `${CACHE_PREFIX}pages-v1`;
export const SEARCH_CACHE = `${CACHE_PREFIX}search-v1`;
export const ASSETS_CACHE = `${CACHE_PREFIX}assets-v1`;
export const FONTS_CACHE = `${CACHE_PREFIX}fonts-v1`;
export const VENDOR_CACHE = `${CACHE_PREFIX}vendor-v1`;
export const STATIC_CACHE = `${CACHE_PREFIX}static-v1`;

export function pyodideCacheName(version: string): string {
  return `${CACHE_PREFIX}pyodide-${version}`;
}

/**
 * 용량 한도(PLAN §5.3 "파일 크기 상한을 설정에 적는다").
 * - Pyodide 캐시: 코어(13.5MB)·numpy(3MB)·OpenCV(10.7MB)에 학생이 import하는 다른 휠(matplotlib 13MB 등)이 더해질 수 있어 160MB.
 *   넘으면 코어가 아닌 휠을 오래된 것부터 지운다. 파일 하나가 이 한도의 절반을 넘으면 캐시하지 않는다.
 * - 그 밖의 캐시는 항목 수로 제한한다(오래된 것부터).
 */
export const PYODIDE_CACHE_LIMIT_BYTES = 160 * 1024 * 1024;
export const PYODIDE_CACHE_MAX_FILE_BYTES = PYODIDE_CACHE_LIMIT_BYTES / 2;
export const PAGES_CACHE_MAX_ENTRIES = 60;
export const SEARCH_CACHE_MAX_ENTRIES = 80;
export const ASSETS_CACHE_MAX_ENTRIES = 300;
export const STATIC_CACHE_MAX_ENTRIES = 200;
export const VENDOR_CACHE_LIMIT_BYTES = 120 * 1024 * 1024;

/**
 * 사전 캐시(셸) 예산(PD-11 "수백 KB 이하"). 빌드 스크립트가 목록 크기를 재서 넘으면 빌드를 멈춘다.
 * 파일 하나 상한은 큰 실습실 청크(CodeMirror 407KB 등)가 실수로 들어오지 않게 한다.
 */
export const PRECACHE_BUDGET_BYTES = 700 * 1024;
export const PRECACHE_MAX_FILE_BYTES = 160 * 1024;

/** 페이지 HTML을 네트워크에서 기다리는 시간. 넘으면 캐시된 페이지를 준다(있을 때). */
export const PAGE_NETWORK_TIMEOUT_MS = 5_000;

/** 서비스 워커 ↔ 화면 메시지 종류(서비스 워커 원본 src/sw/sw.js에 같은 글자가 있다 — 단위 테스트가 둘이 같은지 확인한다) */
export const SW_MESSAGE = Object.freeze({
  /** 서비스 워커 → 화면: 파일 하나를 받는 진행(url, received, total, state, from) */
  download: 'apc:download',
  /** 화면 → 서비스 워커: 실습 파일 미리 받기(urls) */
  prefetch: 'apc:prefetch',
  prefetchDone: 'apc:prefetch-done',
  /** 화면 → 서비스 워커: 이미 받은 파일을 캐시에 넣어 두기(urls) */
  warm: 'apc:warm',
  warmDone: 'apc:warm-done',
  /** 화면 → 서비스 워커: "CDN이 막혔어요" — 한동안 예비 경로부터 쓰게 한다(답 없음) */
  cdnDown: 'apc:cdn-down',
  /** 화면 → 서비스 워커: 캐시 상태 묻기 → 같은 이름으로 답 */
  cacheStatus: 'apc:cache-status',
  /** 화면 → 서비스 워커: 실습 파일 캐시 지우기(scope: downloads | all) */
  clearCaches: 'apc:clear-caches',
  cachesCleared: 'apc:caches-cleared',
});

/** 파일 받기 진행 메시지의 state 값 */
export type DownloadState = 'start' | 'progress' | 'done' | 'cache' | 'fallback' | 'error';
/** 어디서 받았는지 */
export type DownloadSource = 'cdn' | 'site' | 'cache';

export interface DownloadMessage {
  readonly type: typeof SW_MESSAGE.download;
  readonly url: string;
  readonly received: number;
  /** 모르면 null */
  readonly total: number | null;
  readonly state: DownloadState;
  readonly from: DownloadSource;
}

export interface CacheStatusMessage {
  readonly type: typeof SW_MESSAGE.cacheStatus;
  readonly version: string;
  readonly caches: readonly { readonly name: string; readonly count: number; readonly bytes: number }[];
}

/** 다른 흉내 모듈(예: mediapipe 모델)이 로딩 패널에 단계를 알리는 DOM 이벤트 이름(뿌리 [data-lab]에 보낸다) */
export const LOADING_STAGE_EVENT = 'apc:loading-stage';

export interface LoadingStageDetail {
  /** 단계 id(영문 소문자·숫자·하이픈). 같은 id면 같은 줄을 갱신한다. */
  readonly id: string;
  readonly label: string;
  readonly state: 'active' | 'done' | 'failed';
  readonly received?: number;
  readonly total?: number | null;
}

/**
 * 브라우저 저장 이름(src/lib/storage.ts의 readItem/writeItem에 그대로 넘긴다 — 머리말 'ai-physical-computing:'은 그쪽이 붙인다).
 * 흉내 모듈 규약(src/lab/README.md 4절)의 `module:<id>:<이름>` 꼴을 따라 [이 컴퓨터에서 내 기록 지우기]가 함께 지운다.
 */
/** 예비 경로로 바꾸느라 페이지를 다시 불러온 것을 기억하는 sessionStorage 이름(한 탭에서 한 번만) */
export const RELOAD_GUARD_NAME = 'module:loading:fallback-reload';

/** 미리 받기를 끝낸 판을 기억하는 localStorage 이름(단추 글자를 "이미 받았어요"로 바꾼다) */
export const PREFETCH_DONE_NAME = 'module:loading:prefetched';

/**
 * 주소에 ?sw=off 를 붙이면 서비스 워커를 등록하지 않고, 이미 등록된 것이 있으면 풀고 캐시를 지운다(문제가 생겼을 때의 비상구).
 * ?sw=on 은 반대로 한 번 더 등록을 시도한다. 값이 없으면 보통대로 등록한다.
 */
export const SW_QUERY_NAME = 'sw';
export const SW_QUERY_OFF = 'off';
export const SW_QUERY_ON = 'on';

/** 1분 개념 카드가 다음 장으로 넘어가는 간격(동작 줄이기 설정이면 자동으로 넘기지 않는다) */
export const CARD_INTERVAL_MS = 8_000;

/** 준비가 모두 끝난 뒤 로딩 패널을 한 줄 요약으로 접기까지 기다리는 시간 */
export const PANEL_COLLAPSE_DELAY_MS = 1_500;
