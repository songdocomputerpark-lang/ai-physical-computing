/**
 * CDN이 막혔는지 살펴본 결과로 화면(준비 칸 — src/lab/modules/loading/)이 할 일을 고른다(PLAN §5.4, 판 1.2.0 — PROGRESS 미해결 215).
 * 순수 함수라 단위 검사가 표처럼 확인한다(tests/unit/loader/fallback-plan.test.ts). DOM·네트워크는 부르는 쪽이 한다.
 *
 * 왜 따로 두나(미해결 215): 회선 전체를 느린 3G로 둔 측정에서 numpy·OpenCV가 측정마다 jsDelivr 또는 같은 사이트 예비본에서 왔다.
 * 화면의 살핌(pyodide.mjs 18KB를 따로 받아 보기)은 워커가 받는 큰 파일과 **같은 HTTP/2 연결**에 실리므로, 느린 회선에서는 큰 파일 뒤에
 * 줄을 서느라 첫 바이트가 한참 늦을 수 있다 — 살핌의 "멈춤"만으로 막힘이라 하면 느린 것을 막힌 것으로 본다. 그래서
 * - 막힘의 **확실한 증거**는 연결 실패·HTTP 오류·파일 대신 온 HTML(차단 안내 쪽)과 실행기의 준비 실패뿐이다 → 예전처럼 바꾼다.
 * - 살핌이 바이트를 하나도 못 받은 "멈춤"은 느린 회선일 수 있다 → 서비스 워커에 알리지 않고, 다시 불러오지 않고, "느려요" 안내만 한다.
 *   서비스 워커가 쪽을 맡고 있으면 서비스 워커가 실제 바이트로 판단한다(같은 위치의 받기 모두에 15초 동안 바이트가 없을 때만 멈춤 — src/sw/sw.js).
 * - 서비스 워커가 이 쪽의 파이썬 파일을 맡아 받기 메시지를 보내고 있으면 화면은 "15초 동안 진행 없음"으로 살피지 않는다(바이트 판단은 서비스 워커 몫).
 */
import { PROBE_AFTER_IDLE_MS } from './constants.ts';
import type { ProbeStatus } from './probe.ts';

/**
 * 살핌이 바이트를 받지 못했지만 막혔다는 증거는 없을 때(느린 회선 — action 'slow')의 안내(학생 글). 준비 칸의 안내 줄에 보인다.
 * 준비가 끝나면 서비스 워커 안내로 돌아간다(src/lab/modules/loading/index.ts). 느린 것과 연결은 됐는데 데이터가 영영 오지 않는 것을
 * 화면은 가르지 못하므로(서비스 워커가 맡지 않은 첫 방문) 끝 문장이 새로고침을 알린다 — 새로고침하면 서비스 워커가 맡아 실제 바이트로
 * 판단한다(같은 위치의 받기 모두에 15초 동안 바이트가 없으면 예비본으로 — src/sw/sw.js).
 */
export const SLOW_LINE_NOTE =
  '인터넷이 느려서 파이썬 파일을 받는 데 오래 걸리고 있어요. 받는 중이니 기다려 주시고, 아주 오래 지나도 끝나지 않으면 새로고침해 보세요.';

/** 무엇이 살핌을 불렀나 — 'idle': 받는 중인데 진행 신호가 15초 동안 없음, 'failed': 실행기가 준비에 실패함 */
export type FallbackTrigger = 'idle' | 'failed';

/** 막힘의 확실한 증거인 살핌 결과(연결 실패·HTTP 오류·파일 대신 HTML). 'stalled'(바이트가 안 옴)는 느린 회선일 수 있어 넣지 않는다. */
export function isDecisiveProbeFailure(status: ProbeStatus): boolean {
  return status === 'error' || status === 'http' || status === 'blocked-page';
}

export interface IdleProbeInput {
  /** 실행기 상태(실행기가 파이썬 엔진을 받는 동안 — 'unloaded'·'loading' — 에만 살핀다) */
  readonly runtimeState: string;
  /** 준비 칸의 단계(LoadingTracker snapshot().phase) */
  readonly phase: string;
  /** 마지막 진행 신호(실행기 이벤트·서비스 워커 메시지) 뒤 지난 시간(밀리초) */
  readonly quietMs: number;
  /** 이미 살피는 중인지 */
  readonly probing: boolean;
  /** 서비스 워커가 이 쪽의 파이썬 파일을 맡아 받기 메시지를 보냈는지(한 번이라도) */
  readonly swDeliveringPyodide: boolean;
}

/** "받는 중인데 진행이 없다"로 살필 때인가 */
export function shouldProbeOnIdle(input: IdleProbeInput): boolean {
  if (input.probing || input.swDeliveringPyodide) {
    return false;
  }
  if (input.runtimeState !== 'loading' && input.runtimeState !== 'unloaded') {
    return false;
  }
  return input.phase === 'loading' && input.quietMs >= PROBE_AFTER_IDLE_MS;
}

export interface FallbackInput {
  readonly trigger: FallbackTrigger;
  /** jsDelivr 살핌 결과 */
  readonly cdn: ProbeStatus;
  /** 같은 사이트 예비본 살핌 결과(살펴봤을 때만) */
  readonly site?: ProbeStatus;
  /** 서비스 워커가 이 쪽을 맡고 있는지(navigator.serviceWorker.controller) */
  readonly controlled: boolean;
  /** 한 탭에서 한 번뿐인 다시 불러오기를 아직 쓰지 않았고, 다시 불러와도 되는 때인지(실행기가 아직 준비 중·서비스 워커를 쓸 수 있음) */
  readonly reloadAllowed: boolean;
}

export type FallbackAction =
  /** CDN이 살아 있다 — 느린 것뿐이다(다음에 또 살핀다) */
  | 'none'
  /** 막혔다는 증거가 없다(살핌이 바이트를 받지 못함 — 느린 회선일 수 있음) — "느려요" 안내만, 다음에 또 살핀다 */
  | 'slow'
  /** 서비스 워커가 쪽을 맡고 있어 다음 파일부터 예비본으로 바뀐다 */
  | 'site'
  /** 한 번 다시 불러와 서비스 워커가 맡게 한다 */
  | 'reload'
  /** 같은 사이트 예비본도 받을 수 없다 */
  | 'blocked'
  /** CDN은 막혔고 예비본은 있지만 다시 불러올 수 없다(이미 한 번 다시 불렀거나 서비스 워커를 쓸 수 없음) */
  | 'blocked-no-reload';

export interface FallbackPlan {
  /** 서비스 워커에 "CDN이 막혔어요"(apc:cdn-down)를 알릴지 */
  readonly tellServiceWorker: boolean;
  /** 같은 사이트 예비본을 더 살펴봐야 하는지(site 결과 없이 불렀을 때) — 그러면 action은 아직 정해지지 않았다('none') */
  readonly needSiteProbe: boolean;
  readonly action: FallbackAction;
  /** 뿌리 data-loading-fallback-reason에 남길 글(예: 'idle:cdn-stalled', 'failed:cdn-error:site-ok') — 측정 기록용 */
  readonly reason: string;
}

/** 살핌 결과로 할 일을 고른다. 먼저 cdn만 주어 부르고, needSiteProbe면 site를 더해 한 번 더 부른다. */
export function planFallback(input: FallbackInput): FallbackPlan {
  const reason = `${input.trigger}:cdn-${input.cdn}${input.site === undefined ? '' : `:site-${input.site}`}`;
  if (input.cdn === 'ok') {
    return { tellServiceWorker: false, needSiteProbe: false, action: 'none', reason };
  }
  // 실행기가 이미 준비에 실패했으면(워커가 CDN·예비본 주소를 모두 해 봄) 살핌의 멈춤도 막힘으로 본다(예전과 같다).
  const cdnBlocked = input.trigger === 'failed' || isDecisiveProbeFailure(input.cdn);
  if (!cdnBlocked) {
    return { tellServiceWorker: false, needSiteProbe: false, action: 'slow', reason };
  }
  if (input.site === undefined) {
    // 막힘의 확실한 증거 — 서비스 워커에 곧바로 알려 다음 파일부터 예비 경로를 먼저 쓰게 하고, 예비본이 살아 있는지 본다.
    return { tellServiceWorker: true, needSiteProbe: true, action: 'none', reason };
  }
  if (input.site !== 'ok') {
    return { tellServiceWorker: true, needSiteProbe: false, action: 'blocked', reason };
  }
  if (input.controlled) {
    return { tellServiceWorker: true, needSiteProbe: false, action: 'site', reason };
  }
  return { tellServiceWorker: true, needSiteProbe: false, action: input.reloadAllowed ? 'reload' : 'blocked-no-reload', reason };
}
