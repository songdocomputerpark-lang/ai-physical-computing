/**
 * 준비 진행률·1분 개념 카드·오프라인 준비(PLAN §5.2~§5.5 PD-02·PD-11·PD-13, §8.2 P2-05). 파이썬 쪽이 없는 화면 전용 모듈이다.
 *
 * 하는 일
 * 1. **진행률**: 실행기 이벤트(state·progress·ready)와 서비스 워커의 파일 받기 메시지(apc:download)를 LoadingTracker로 모아
 *    단계 줄(① 파이썬 엔진 ② numpy ③ OpenCV ④ 인식 모델)과 막대·받은 양(MB)을 그린다. 다른 모듈은 뿌리에 apc:loading-stage
 *    이벤트를 보내 자기 단계를 더할 수 있다(mediapipe 모델 등).
 * 2. **1분 개념 카드**: src/lab/loader/cards.ts의 글 5장을 8초마다 넘긴다(동작 줄이기 설정이면 자동으로 넘기지 않는다).
 * 3. **오프라인 준비**: 서비스 워커를 등록하고(레이아웃을 고치지 않게 여기서 한다), 준비가 끝나면 받은 Pyodide 파일을 캐시에
 *    넣어 둔다(apc:warm — 브라우저 캐시에서 가져오므로 보통 네트워크를 쓰지 않는다). 그래서 **두 번째 방문은 네트워크 없이** 뜬다.
 *    [이 컴퓨터에 실습 파일 미리 받기]는 교실 PC에서 수업 전에 한 번 눌러 두는 단추다.
 * 4. **CDN이 막혔을 때**(PLAN §5.4): 받기가 실패하면(runtime 'failed') 바로, 받는 중인데 **15초 동안 진행이 없으면**(PROBE_AFTER_IDLE_MS)
 *    같은 CDN의 작은 파일(pyodide.mjs 18KB)을 따로 받아 본다(살핌). 잘 되면 느린 것뿐이라 그대로 두고, 막혔으면 서비스 워커에 알린 뒤
 *    (다음 파일부터 예비 경로를 먼저 씀) 같은 사이트 예비본이 살아 있는지 보고 **한 탭에서 한 번만** 페이지를 다시 불러 예비본으로 연다.
 *    둘 다 막혔으면 점검 페이지를 안내한다. 서비스 워커가 이미 맡고 있으면 다시 부르지 않아도 파일 하나 단위로 바뀐다(src/sw/sw.js).
 *    판 1.2.0(PROGRESS 미해결 215 — 느린 회선에서 느린 것을 막힌 것으로 보던 것): 무엇을 "막힘"으로 보는지는 src/lab/loader/fallback-plan.ts —
 *    살핌이 바이트를 15초 동안 하나도 못 받은 "멈춤"은 느린 회선일 수 있어 "느려요" 안내만 하고(서비스 워커에 알리지 않고 다시 불러오지 않음),
 *    연결 실패·HTTP 오류·차단 안내 쪽·실행기 실패만 막힘으로 본다. 서비스 워커가 이 쪽의 파이썬 파일을 맡아 받기 메시지를 보내고 있으면
 *    살피지 않는다(바이트로 판단하는 것은 서비스 워커 몫).
 *    오프라인판(OFFLINE_BUILD, 판 1.1.0 — 미해결 199 E-10)은 인터넷을 살피지 않고 이 컴퓨터의 작은 서버(검은 창)만 살펴, 꺼졌으면
 *    "검은 창이 켜져 있는지·시작하기.bat 다시 실행"을 안내한다(offline-note.ts).
 * 5. **첫 준비 동안 맨 위**: 실습실 틀이 편집칸 앞에 그려 둔 자리([data-lab-intro])로 이 칸을 DOM째 옮겨 보이는 차례와 Tab 차례를 맞추고,
 *    준비가 끝나 접히거나 [실행]을 누르면 제자리로 돌려놓는다(intro.ts — 판 1.2.0, PROGRESS 미해결 218).
 *
 * 테스트가 읽는 값(실습실 뿌리 [data-lab]): data-loading-phase(idle|loading|ready|failed), data-loading-percent,
 * data-loading-source(cdn|site|cache|unknown), data-loading-sw(unsupported|off|registering|ready|controlled|failed),
 * data-loading-warm(idle|running|done|partial|failed), data-loading-fallback(''|probing|slow|switching|site|blocked),
 * data-loading-intro(yes|no — 실습실 틀이 그린 처음 값 yes, intro.ts).
 * 측정 기록 칸(판 1.2.0 — 미해결 215, tests/e2e/perf-scenario-a.spec.ts가 결과에 남긴다): data-loading-fallback-reason(화면 살핌의 까닭 —
 * 'idle:cdn-stalled'·'failed:cdn-error:site-ok' 꼴, fallback-plan.ts), data-loading-sw-fallback(서비스 워커가 다른 위치로 바꾼 파일과 까닭 —
 * '<파일>=<까닭>'을 빈칸으로 이음), data-loading-sw-site-first(CDN이 막혔다고 본 뒤 5분 동안 예비본부터 받은 파일과 누가 막혔다고 봤는지 —
 * '<파일>=<file:…|page>').
 */
import { withBase } from '../../../lib/url.ts';
import { readItem, writeItem } from '../../../lib/storage.ts';
import { revealElement } from '../../controls/reveal.ts';
import { cardCounterText, cardsForLab, nextCardIndex } from '../../loader/cards.ts';
import {
  CARD_INTERVAL_MS,
  LOADING_STAGE_EVENT,
  PANEL_COLLAPSE_DELAY_MS,
  PREFETCH_DONE_NAME,
  PROBE_STALL_MS,
  RELOAD_GUARD_NAME,
  SW_MESSAGE,
  WARM_DELAY_MS,
  type DownloadMessage,
  type LoadingStageDetail,
} from '../../loader/constants.ts';
import { SLOW_LINE_NOTE, planFallback, shouldProbeOnIdle, type FallbackTrigger } from '../../loader/fallback-plan.ts';
import { probeUrl } from '../../loader/probe.ts';
import {
  formatBytes,
  parsePyodideUrl,
  pyodideCdnUrl,
  pyodidePrefetchBytesFor,
  pyodidePrefetchUrlsFor,
  pyodideSiteUrl,
} from '../../loader/pyodide-files.ts';
import {
  onDownload,
  prefetchFiles,
  registerServiceWorker,
  tellServiceWorker,
  waitForController,
  warmCache,
  type ServiceWorkerState,
} from '../../loader/sw-client.ts';
import { LoadingTracker, stageIdForUrl, type StageSnapshot } from '../../loader/stages.ts';
import { OFFLINE_BUILD } from '../../runtime/config.ts';
import { prefetchLazyModules } from '../host.ts';
import type { LabModule, LabModuleContext, LabModuleHandle } from '../types.ts';
import { endLoadingIntro, placeInLoadingIntro } from './intro.ts';
import manifest from './manifest.ts';
import { OFFLINE_SERVER_DOWN_NOTE, OFFLINE_SERVER_SLOW_NOTE } from './offline-note.ts';

/** 측정 기록 칸 하나에 남길 항목 수 상한(같은 항목은 한 번만) */
const RECORD_LIMIT = 12;

/** 점검 페이지 주소(네트워크가 막혔을 때 안내) */
const CHECK_PAGE = withBase('start/check/');

/** 단계 상태별 기호(색만으로 알리지 않는다) */
const STAGE_MARKS: Readonly<Record<StageSnapshot['state'], string>> = Object.freeze({
  pending: '·',
  active: '▶',
  done: '✓',
  failed: '✕',
});

const SW_NOTES: Readonly<Record<ServiceWorkerState, string>> = Object.freeze({
  unsupported: '이 브라우저는 오프라인 준비를 쓸 수 없어요. 실습은 그대로 돼요.',
  off: '오프라인 준비를 껐어요(주소의 ?sw=off). 주소에서 빼면 다시 켜져요.',
  registering: '',
  ready: '오프라인 준비를 켰어요. 두 번째 방문부터 더 빨라져요.',
  controlled: '한 번 받은 파일은 이 컴퓨터에 저장돼 있어요. 다음부터는 인터넷 없이도 열려요.',
  failed: '오프라인 준비를 켜지 못했어요(실습은 그대로 돼요).',
});

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 한 탭에서만 기억하는 저장 공간(다른 탭·다음 방문에는 남지 않는다). 막혀 있으면 null. */
const tabStorage = () => (typeof sessionStorage === 'undefined' ? null : sessionStorage);

/** 한 탭에서 예비 경로 때문에 다시 불러온 적이 있는지 */
function reloadGuard(): { taken: boolean; take(): void } {
  return {
    taken: readItem(RELOAD_GUARD_NAME, tabStorage) !== null,
    take() {
      writeItem(RELOAD_GUARD_NAME, String(Date.now()), tabStorage);
    },
  };
}

function mount(context: LabModuleContext): LabModuleHandle {
  const { root, panel, runtime, lab } = context;
  const origin = location.origin;
  const tracker = new LoadingTracker({ origin });
  const cleanups: (() => void)[] = [];
  let disposed = false;

  // ── 화면 요소(패널이 없을 수도 있다 — 그때도 data-* 표시는 그대로 갱신한다) ──
  const find = <T extends HTMLElement>(name: string): T | null => panel?.querySelector<T>(`[data-loading-${name}]`) ?? null;
  const titleText = find('title');
  const lineText = find('text');
  const bodyBox = find('body');
  const toggleButton = find<HTMLButtonElement>('toggle');
  const bar = find('bar');
  const fill = find('fill');
  const stageList = find<HTMLOListElement>('stages');
  const sourceText = find('source-text');
  const noteText = find('note');
  const cardTitle = find('card-title');
  const cardBody = find('card-body');
  const cardCode = find('card-code');
  const cardLink = find<HTMLAnchorElement>('card-link');
  const cardCounter = find('counter');
  const prevButton = find<HTMLButtonElement>('prev');
  const nextButton = find<HTMLButtonElement>('next');
  const cardsBox = find('cards');
  const prefetchButton = find<HTMLButtonElement>('prefetch');
  const prefetchStatus = find('prefetch-status');
  /** 실습실 틀의 상태 줄 옆 진행 칸(LabShell.astro [data-lab-progress]) */
  const labProgress = root.querySelector<HTMLElement>('[data-lab-progress]');

  const setRootData = (name: string, value: string) => {
    root.dataset[`loading${name[0]!.toUpperCase()}${name.slice(1)}`] = value;
  };

  // 이 실습실이 쓰는 Pyodide 패키지(LabShell pyodidePackages → data-lab-packages). 적지 않은 실습실은 null(예비본 전체 — 예전 동작).
  // ESP32 실습실은 빈 목록이라 [미리 받기]·캐시 채우기가 파이썬 엔진만 받는다 — 쓰지 않는 OpenCV·numpy(13.7MB)를 받지 않게(PD-04, P3-01).
  const labPackages: readonly string[] | null =
    root.dataset.labPackages === undefined ? null : root.dataset.labPackages.split(/\s+/u).filter((name) => name !== '');
  const prefetchBytes = pyodidePrefetchBytesFor(labPackages);
  /** 캐시에 넣어 둘 패키지: 실습실 패키지 + 이번 방문에 실제로 받은 패키지(학생 코드의 import로 받은 것) */
  const warmPackages = (): readonly string[] | null => (labPackages === null ? null : [...labPackages, ...runtime.loadedPackages]);
  setRootData('phase', 'idle');
  setRootData('sw', 'registering');
  setRootData('warm', 'idle');
  setRootData('source', 'unknown');
  setRootData('fallback', '');
  setRootData('fallbackReason', '');
  setRootData('swFallback', '');
  setRootData('swSiteFirst', '');

  /** 측정 기록 칸(빈칸으로 이은 목록)에 항목을 더한다 — 같은 항목은 한 번만, RECORD_LIMIT개까지 */
  const appendRootRecord = (name: string, item: string) => {
    const key = `loading${name[0]!.toUpperCase()}${name.slice(1)}`;
    const items = (root.dataset[key] ?? '').split(' ').filter((entry) => entry !== '');
    if (items.includes(item) || items.length >= RECORD_LIMIT) {
      return;
    }
    root.dataset[key] = [...items, item].join(' ');
  };

  // ── 진행률 그리기 ──
  let collapseTimer: ReturnType<typeof setTimeout> | null = null;
  let collapsed = false;
  /** 준비가 끝나 접을 때가 됐지만 초점이 칸 안에 있어 미뤄 둔 상태 — 초점이 칸을 떠나면 접는다(아래 focusout) */
  let collapseWhenFocusLeaves = false;
  let renderQueued = false;

  /** 초점이 이 준비 칸 안에 있나 */
  const focusInsidePanel = (): boolean => {
    const active = document.activeElement;
    return panel !== null && active !== null && active !== document.body && panel.contains(active);
  };

  /**
   * 키보드로 옮긴 초점인가(초점 테두리가 보이는 :focus-visible). 마우스로 누른 단추는 초점을 받아도 테두리가 보이지 않는다 —
   * 그런 초점은 따라가거나 붙들지 않는다(마우스로 카드를 넘긴 학생의 칸은 예전처럼 저절로 접히고, 화면도 튀지 않게).
   */
  const isKeyboardFocus = (element: Element | null): element is HTMLElement => {
    if (!(element instanceof HTMLElement) || element === document.body) {
      return false;
    }
    try {
      return element.matches(':focus-visible');
    } catch {
      return true; // :focus-visible을 모르는 옛 브라우저 — 키보드 초점으로 본다
    }
  };

  /**
   * 칸을 접은 뒤(첫 준비 동안 맨 위에 있던 칸이 제자리 — 입력·출력 아래 — 로 옮겨 가며 둘레 칸도 움직인다) 키보드 초점 요소가
   * 화면 밖으로 나갔으면 화면 안으로 옮긴다 — 곧바로(움직임 줄이기와 상관없이 부드럽게 넘기지 않는다).
   * 마우스로 누른 단추처럼 초점 테두리가 보이지 않는 초점은 따라가지 않는다 — 마우스로 [접기]를 누른 학생의
   * 화면이 칸을 따라 아래로 튀지 않게(판 1.1.1 최종 점검, PROGRESS 미해결 216 — 전에는 [펼치기]가 화면 밖에 남았다).
   */
  const keepFocusInView = (): void => {
    const active = document.activeElement;
    if (!isKeyboardFocus(active)) {
      return;
    }
    const rect = active.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    if ((rect.width === 0 && rect.height === 0) || viewportHeight === 0) {
      return;
    }
    if (rect.bottom > 0 && rect.top < viewportHeight) {
      return; // 조금이라도 보이면 그대로 둔다(편집칸처럼 큰 칸이 조금 밀린 것까지 따라가지 않게)
    }
    active.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
  };

  /** 준비 칸을 접고, 옮겨 간 뒤에도 초점 요소가 화면 안에 있게 한다 */
  const collapseKeepingFocus = (): void => {
    collapseWhenFocusLeaves = false;
    const active = document.activeElement;
    const focusInBody = bodyBox !== null && active !== null && bodyBox.contains(active);
    setCollapsed(true);
    if (focusInBody && toggleButton !== null && toggleButton.isConnected) {
      // 숨는 칸(1분 개념 카드 등) 안에 있던 초점은 [펼치기]로 옮긴다 — 문서(body)로 사라지지 않게(마우스로 누른 카드 단추 등).
      toggleButton.focus({ preventScroll: true });
    }
    keepFocusInView();
  };

  const setCollapsed = (value: boolean) => {
    collapsed = value;
    if (value) {
      // 첫 준비 동안 맨 위(조작 줄 바로 아래 — LabShell.astro의 [data-lab-intro])로 DOM째 옮겨 둔 이 패널을 제자리(입력·출력 아래)로 돌린다.
      // 준비가 끝나 접힐 때나 학생이 [접기]를 누를 때 한 번 — 그 뒤로는 다시 올리지 않는다(화면이 오르내리지 않게). 초점은 intro.ts가 지킨다.
      endLoadingIntro(root);
    }
    if (panel) {
      const box = panel.querySelector<HTMLElement>('[data-loading-panel]');
      if (box) {
        box.dataset.collapsed = String(value);
      }
    }
    if (toggleButton) {
      toggleButton.textContent = value ? '펼치기' : '접기';
      toggleButton.setAttribute('aria-expanded', String(!value));
    }
    if (bodyBox) {
      bodyBox.hidden = value;
    }
  };

  const renderStages = (stages: readonly StageSnapshot[]) => {
    if (!stageList) {
      return;
    }
    for (const stage of stages) {
      let item = stageList.querySelector<HTMLLIElement>(`[data-loading-stage="${stage.id}"]`);
      if (!item) {
        item = document.createElement('li');
        item.className = 'loading__stage';
        item.dataset.loadingStage = stage.id;
        item.innerHTML =
          '<span class="loading__stage-mark" aria-hidden="true"></span><span class="loading__stage-name"></span><span class="loading__stage-bytes"></span>';
        stageList.append(item);
      }
      item.dataset.state = stage.state;
      const mark = item.querySelector<HTMLElement>('.loading__stage-mark');
      const name = item.querySelector<HTMLElement>('.loading__stage-name');
      const bytes = item.querySelector<HTMLElement>('.loading__stage-bytes');
      if (mark) {
        mark.textContent = STAGE_MARKS[stage.state];
      }
      if (name) {
        name.textContent = stage.label;
      }
      if (bytes) {
        if (stage.total !== null && stage.state !== 'pending') {
          const size = `${formatBytes(stage.received)} / ${formatBytes(stage.total)}`;
          bytes.textContent = stage.estimated && stage.state !== 'done' ? `약 ${formatBytes(stage.total)}` : size;
        } else {
          bytes.textContent = '';
        }
      }
    }
  };

  /**
   * 지금 실행이 패키지 받기를 기다리는지(실행기 'package-wait' — 판 1.2.0, PROGRESS 미해결 219). 받을 것이 없는 코드는 미리 받기 중에도
   * 곧바로 돌므로, 상태 줄 글은 실행 상태(running)가 아니라 이 값으로 고른다: start = 코드가 시작하기 전에 기다림, import = 코드가 import 줄에서 기다림.
   */
  let packageWait: 'start' | 'import' | null = null;

  const render = () => {
    renderQueued = false;
    const snapshot = tracker.snapshot();
    setRootData('phase', snapshot.phase);
    setRootData('percent', snapshot.percent === null ? '' : String(snapshot.percent));
    setRootData('source', snapshot.source);
    // 받는 중인 단계와 양("OpenCV 3.2MB / 9.8MB") — 4단원 통합 화면의 상태 줄이 두 칸의 진행을 함께 보여 줄 때 읽는다(2026-09-25 Phase 4 검토 반영)
    setRootData('text', snapshot.text);
    // 파이썬은 준비됐는데(실행기 idle·running) 실습실 패키지(numpy·OpenCV)를 아직 받는 중이면 조작 줄 아래 상태 줄에도 받는 양을 보인다.
    // 준비 칸은 접히거나 화면 밖이라, "준비됐어요" 뒤 [실행]한 학생에게는 몇 분 동안 멈춘 것처럼 보였다(2026-09-26 Phase 6 사용성 검토 지적 5).
    // 판 1.2.0(미해결 219): 실행 중이라도 받을 것이 없는 코드는 이미 돌고 있으므로 "저절로 시작해요"는 실행기가 기다린다고 알릴 때만 쓴다.
    if (labProgress && snapshot.phase === 'loading' && snapshot.text !== '' && (runtime.state === 'idle' || runtime.state === 'running')) {
      const amount = snapshot.text.replace(/\s*받는 중…/u, '').trim();
      labProgress.textContent =
        runtime.state !== 'running'
          ? `실습 파일을 받는 중: ${amount} — 이 파일을 쓰는 코드는 [실행]하면 다 받은 뒤 시작해요.`
          : packageWait === 'start'
            ? `실행 전에 필요한 파일을 받는 중: ${amount} — 다 받으면 코드가 저절로 시작해요.`
            : packageWait === 'import'
              ? `코드가 쓰는 파일을 받는 중: ${amount} — 다 받으면 이어서 돌아요.`
              : `실습 파일을 받는 중: ${amount} — 코드는 그대로 돌고 있어요.`;
    }
    if (titleText) {
      titleText.textContent =
        snapshot.phase === 'ready' ? '실습 준비가 끝났어요' : snapshot.phase === 'failed' ? '파이썬을 받지 못했어요' : '파이썬을 준비하고 있어요';
    }
    if (lineText) {
      const seconds = snapshot.elapsedMs >= 1000 ? ` · ${(snapshot.elapsedMs / 1000).toFixed(1)}초` : '';
      lineText.textContent = snapshot.text === '' ? '' : `${snapshot.text}${snapshot.phase === 'loading' ? seconds : ''}`;
    }
    if (bar) {
      const known = snapshot.percent !== null;
      bar.dataset.indeterminate = String(!known && snapshot.phase === 'loading');
      if (known) {
        bar.setAttribute('aria-valuenow', String(snapshot.percent));
        bar.setAttribute('aria-valuetext', `${snapshot.percent}% · ${snapshot.text}`);
      } else {
        bar.removeAttribute('aria-valuenow');
        bar.setAttribute('aria-valuetext', snapshot.text || '준비하는 중');
      }
      if (fill && known) {
        fill.style.width = `${snapshot.percent}%`;
      }
    }
    renderStages(snapshot.stages);
    if (sourceText) {
      const where =
        snapshot.source === 'cdn'
          ? '파일을 인터넷(jsDelivr)에서 받았어요.'
          : snapshot.source === 'site'
            ? '파일을 이 사이트의 예비본에서 받았어요.'
            : snapshot.source === 'cache'
              ? '파일을 이 컴퓨터에 저장된 것에서 바로 읽었어요.'
              : '';
      sourceText.textContent = where;
    }
    if (snapshot.phase === 'ready') {
      if (root.dataset.loadingFallback === 'slow') {
        // 느린 회선이었지만 다 받았다 — "느려요" 안내를 거두고 오프라인 준비 안내로 돌아간다(까닭 기록 data-loading-fallback-reason은 남긴다).
        setRootData('fallback', '');
        setNote(SW_NOTES[swState]);
      }
      if (!collapsed && collapseTimer === null && !collapseWhenFocusLeaves) {
        collapseTimer = setTimeout(() => {
          collapseTimer = null;
          if (disposed || collapsed) {
            return;
          }
          if (focusInsidePanel() && isKeyboardFocus(document.activeElement)) {
            // 학생이 키보드로 칸 안([접기]·1분 개념 카드의 [다음 →] 등)에 초점을 두고 있으면 지금 접지 않는다 — 접으며 칸이 제자리로
            // 옮겨 가면 초점이 화면 밖에 남고, 카드 칸이 숨으면 초점이 문서(body)로 사라졌다(판 1.1.1 최종 점검, 미해결 216). 칸을 떠날 때 접는다.
            collapseWhenFocusLeaves = true;
            return;
          }
          collapseKeepingFocus();
        }, PANEL_COLLAPSE_DELAY_MS);
      }
      scheduleWarm();
    } else {
      // 다시 받기 시작했다(패키지 단계 등) — 접지 않는다.
      if (collapseTimer !== null) {
        clearTimeout(collapseTimer);
        collapseTimer = null;
      }
      collapseWhenFocusLeaves = false;
    }
  };

  const scheduleRender = () => {
    if (renderQueued || disposed) {
      return;
    }
    renderQueued = true;
    requestAnimationFrame(render);
  };

  // ── 실행기 이벤트 ──
  cleanups.push(
    runtime.on('state', ({ state }) => {
      noteActivity();
      tracker.runtimeState(state);
      if (state !== 'running') {
        packageWait = null;
      }
      scheduleRender();
      if (state === 'failed') {
        void onLoadFailed();
      }
    }),
  );
  cleanups.push(
    // 실행이 패키지 받기를 기다리기 시작·끝(판 1.2.0 — 미해결 219, worker.ts preparePackages·waitForPackageImport) — 상태 줄 글을 고른다(render).
    runtime.on('package-wait', ({ waiting, phase }) => {
      packageWait = waiting ? phase : null;
      scheduleRender();
    }),
  );
  cleanups.push(
    runtime.on('progress', (progress) => {
      noteActivity();
      tracker.runtimeProgress(progress);
      scheduleRender();
    }),
  );
  cleanups.push(
    runtime.on('ready', (info) => {
      tracker.runtimeReady(info);
      scheduleRender();
    }),
  );
  // 실습실이 패키지까지 다 받으면(영상처리 실습실은 data-vision-packages="ready") 진행률을 끝으로 본다.
  const packagesObserver = new MutationObserver(() => {
    if (root.dataset.visionPackages === 'ready') {
      tracker.finish();
      scheduleRender();
    }
  });
  packagesObserver.observe(root, { attributes: true, attributeFilter: ['data-vision-packages'] });
  cleanups.push(() => packagesObserver.disconnect());

  // 다른 모듈이 알리는 단계(mediapipe 모델 등)
  const onStageEvent = (event: Event) => {
    const detail = (event as CustomEvent<LoadingStageDetail>).detail;
    if (detail && typeof detail.id === 'string') {
      tracker.stageEvent(detail);
      scheduleRender();
    }
  };
  root.addEventListener(LOADING_STAGE_EVENT, onStageEvent);
  cleanups.push(() => root.removeEventListener(LOADING_STAGE_EVENT, onStageEvent));

  // ── 서비스 워커의 파일 받기 메시지 ──
  // 서비스 워커 메시지는 문서 전체로 온다. 한 문서에 실습실이 둘이면(4단원 통합 화면) 옆 실습실이 받는 OpenCV·모델 메시지까지 이 패널에 들어와,
  // 파이썬 엔진만 쓰는 ESP32 칸이 끝나지 않는 "numpy·OpenCV 받는 중"을 보였다(2026-09-24 통합 화면 확인). 패키지 목록이 빈 실습실은 엔진 파일만 센다.
  const coreOnly = labPackages !== null && labPackages.length === 0;
  /** 서비스 워커가 이 쪽의 파이썬 파일을 맡아 받기 메시지를 보냈는지 — 그러면 "진행 없음"으로 살피지 않는다(바이트 판단은 서비스 워커 몫, 미해결 215) */
  let swDeliveringPyodide = false;
  cleanups.push(
    onDownload((message: DownloadMessage) => {
      if (coreOnly && stageIdForUrl(message.url, origin) !== 'core') {
        return;
      }
      const pyodideFile = parsePyodideUrl(message.url, origin);
      if (pyodideFile) {
        swDeliveringPyodide = true;
        // 측정 기록 칸(판 1.2.0 — 미해결 215): 서비스 워커가 다른 위치로 바꾼 파일과 까닭, 예비본부터 받은 파일과 누가 막혔다고 봤는지
        if (message.state === 'fallback' && message.reason) {
          appendRootRecord('swFallback', `${pyodideFile.name}=${message.reason}`);
        } else if (message.state === 'error' && message.reason) {
          appendRootRecord('swFallback', `${pyodideFile.name}=error:${message.reason}`);
        } else if (message.state === 'start' && message.why === 'cdn-down') {
          appendRootRecord('swSiteFirst', `${pyodideFile.name}=${message.downBy || '?'}`);
        }
      }
      noteActivity();
      tracker.download(message);
      scheduleRender();
    }),
  );

  // ── 1분 개념 카드(실습실에 맞는 묶음 — 영상처리는 사진·에지, ESP32는 핀·MicroPython) ──
  const cards = cardsForLab(context.labId);
  let cardIndex = 0;
  let cardTimer: ReturnType<typeof setInterval> | null = null;
  const showCard = (index: number) => {
    cardIndex = nextCardIndex(index, 0, cards.length);
    const card = cards[cardIndex];
    if (!card) {
      return;
    }
    if (cardTitle) {
      cardTitle.textContent = card.title;
    }
    if (cardBody) {
      cardBody.replaceChildren(
        ...card.body.map((sentence) => {
          const paragraph = document.createElement('p');
          paragraph.textContent = sentence;
          return paragraph;
        }),
      );
    }
    if (cardCode) {
      cardCode.textContent = card.code ?? '';
      const wrapper = cardCode.closest('p');
      if (wrapper) {
        wrapper.hidden = !card.code;
      }
    }
    if (cardLink) {
      const wrapper = cardLink.closest('p');
      if (card.link) {
        cardLink.href = card.link.href;
        cardLink.textContent = card.link.text;
        if (wrapper) {
          wrapper.hidden = false;
        }
      } else if (wrapper) {
        wrapper.hidden = true;
      }
    }
    if (cardCounter) {
      cardCounter.textContent = cardCounterText(cardIndex, cards.length);
    }
    if (cardsBox) {
      cardsBox.dataset.card = card.id;
    }
  };
  const stopCardTimer = () => {
    if (cardTimer !== null) {
      clearInterval(cardTimer);
      cardTimer = null;
    }
  };
  const startCardTimer = () => {
    stopCardTimer();
    if (reducedMotion()) {
      return;
    }
    cardTimer = setInterval(() => showCard(nextCardIndex(cardIndex, 1, cards.length)), CARD_INTERVAL_MS);
  };
  const step = (by: number) => {
    showCard(nextCardIndex(cardIndex, by, cards.length));
    startCardTimer();
  };
  prevButton?.addEventListener('click', () => step(-1));
  nextButton?.addEventListener('click', () => step(1));
  // 읽는 동안에는 넘어가지 않게 한다(마우스·키보드 모두).
  cardsBox?.addEventListener('mouseenter', stopCardTimer);
  cardsBox?.addEventListener('mouseleave', startCardTimer);
  cardsBox?.addEventListener('focusin', stopCardTimer);
  cardsBox?.addEventListener('focusout', startCardTimer);
  showCard(0);
  startCardTimer();
  cleanups.push(stopCardTimer);

  toggleButton?.addEventListener('click', () => {
    if (collapseTimer !== null) {
      clearTimeout(collapseTimer);
      collapseTimer = null;
    }
    collapseWhenFocusLeaves = false;
    // 학생이 직접 누르면 곧바로 접고 편다. 접으며 칸이 제자리로 옮겨 가도 키보드로 누른 단추([펼치기])는 화면 안에 둔다(keepFocusInView).
    setCollapsed(!collapsed);
    keepFocusInView();
  });

  // 접기를 미뤄 둔 동안(초점이 칸 안) 초점이 칸 밖으로 나가면 그때 접는다 — 칸 안에서 단추 사이를 옮겨 다니는 것은 세지 않는다.
  const onPanelFocusOut = (event: FocusEvent) => {
    if (!collapseWhenFocusLeaves || collapsed || panel === null) {
      return;
    }
    const next = event.relatedTarget;
    if (next instanceof Node && panel.contains(next)) {
      return;
    }
    // 새 초점이 자리를 잡은 뒤에 본다(relatedTarget이 없을 때 — 빈 곳을 누른 경우 등 — 도 같은 규칙)
    setTimeout(() => {
      if (!collapseWhenFocusLeaves || collapsed || disposed || focusInsidePanel()) {
        return;
      }
      collapseKeepingFocus();
    }, 0);
  };
  panel?.addEventListener('focusout', onPanelFocusOut);
  cleanups.push(() => panel?.removeEventListener('focusout', onPanelFocusOut));

  // ── 오프라인 준비(서비스 워커) ──
  let registration: ServiceWorkerRegistration | null = null;
  let swState: ServiceWorkerState = 'registering';
  const setNote = (text: string) => {
    if (noteText) {
      noteText.textContent = text;
    }
  };

  const setupServiceWorker = async () => {
    const result = await registerServiceWorker();
    if (disposed) {
      return;
    }
    registration = result.registration;
    swState = result.state;
    setRootData('sw', result.state);
    setNote(result.message || SW_NOTES[result.state]);
    if (result.state === 'ready') {
      const controlled = await waitForController();
      if (!disposed && controlled) {
        swState = 'controlled';
        setRootData('sw', 'controlled');
        setNote(SW_NOTES.controlled);
      }
    }
  };

  /**
   * 이 페이지가 실제로 받은 같은 사이트 파일 주소(화면 코드·글꼴·그림)와 페이지 자신.
   * 서비스 워커가 페이지를 맡기 전에 받은 것들은 캐시에 없으므로, 준비가 끝난 뒤 이 목록을 캐시에 넣어 둬야
   * **두 번째 방문이 네트워크 없이** 열린다(브라우저 캐시에서 가져오므로 보통 네트워크를 쓰지 않는다).
   */
  const usedSiteFiles = (): string[] => {
    const base = new URL(withBase(''), origin).href;
    const urls = new Set<string>([location.href.split('#')[0]!]);
    try {
      for (const entry of performance.getEntriesByType('resource')) {
        const url = entry.name.split('#')[0]!;
        if (!url.startsWith(base) || url.includes('?')) {
          continue;
        }
        const rest = url.slice(base.length);
        if (/^(?:_astro\/|fonts\/|images\/|vendor\/|models\/)/u.test(rest)) {
          urls.add(url);
        }
      }
    } catch {
      // performance API가 없으면 페이지만 넣는다.
    }
    return [...urls];
  };

  // ── 준비가 끝난 뒤: 받은 파일을 캐시에 넣어 둔다(두 번째 방문을 네트워크 없이 열려고) ──
  //
  // 언제: 파이썬 엔진뿐 아니라 **패키지까지** 받아 더 받을 것이 없을 때(phase 'ready') 그 상태가 WARM_DELAY_MS 동안 이어지면.
  // 엔진만 받은 시점에 하면 곧바로 시작되는 numpy·OpenCV 받기와 같은 파일을 두 번 받을 수 있다(첫 방문 대역폭, PLAN §5.3).
  let warmed = false;
  let warmTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleWarm = () => {
    if (warmed || disposed || warmTimer !== null) {
      return;
    }
    warmTimer = setTimeout(() => {
      warmTimer = null;
      if (disposed || tracker.snapshot().phase !== 'ready') {
        return; // 다시 받기 시작했다 — 끝나면 render가 다시 부른다.
      }
      void warmNow();
    }, WARM_DELAY_MS);
  };
  const warmNow = async () => {
    if (warmed || disposed) {
      return;
    }
    if (!navigator.serviceWorker?.controller) {
      // 첫 방문에는 서비스 워커가 설치를 끝내고 이 페이지를 맡을 때까지 잠깐 걸린다.
      const controlled = await waitForController();
      if (!controlled || disposed) {
        setRootData('warm', 'idle'); // warmed를 세우지 않아 다음 기회에 다시 해 본다.
        return;
      }
    }
    warmed = true;
    setRootData('warm', 'running');
    const result = await warmCache([...usedSiteFiles(), ...pyodidePrefetchUrlsFor(warmPackages())]);
    if (disposed) {
      return;
    }
    if (result && result.ok > 0) {
      setRootData('warm', result.failed === 0 ? 'done' : 'partial');
      setNote(`${SW_NOTES.controlled} (저장해 둔 파일 ${result.ok}개, ${formatBytes(result.bytes)})`);
    } else {
      setRootData('warm', result ? 'failed' : 'idle');
    }
  };

  // ── CDN이 막혔는지 살펴보고, 막혔으면 같은 사이트 예비본으로 바꾼다 ──
  // 무엇을 막힘으로 보는지는 src/lab/loader/fallback-plan.ts(판 1.2.0 — PROGRESS 미해결 215): 살핌이 바이트를 15초 동안 하나도 못 받은 것("멈춤")은
  // 느린 회선일 수 있어 "느려요" 안내만 하고, 연결 실패·HTTP 오류·차단 안내 쪽·실행기 실패만 막힘으로 본다(서비스 워커에 알리고 예비본으로 바꾼다).
  let probing = false;
  const probeAndSwitch = async (trigger: FallbackTrigger) => {
    if (probing || disposed) {
      return;
    }
    probing = true;
    setRootData('fallback', 'probing');
    if (OFFLINE_BUILD) {
      // 오프라인판(판 1.1.0, 미해결 199 E-10): 인터넷 주소가 없다 — 이 컴퓨터의 작은 서버(검은 창)만 살피고, 그 서버 이야기로 안내한다.
      const local = await probeUrl(`${pyodideSiteUrl('pyodide.mjs', origin)}?probe=${Date.now()}`, { stallMs: PROBE_STALL_MS });
      if (disposed) {
        return;
      }
      setRootData('fallbackReason', `${trigger}:local-${local.status}`);
      if (local.status === 'ok') {
        // 서버는 살아 있고 느린 것뿐이다. 다음에 또 살펴볼 수 있게 열어 둔다(온라인의 "느린 것뿐"과 같다).
        probing = false;
        noteActivity();
        setRootData('fallback', '');
        setNote(OFFLINE_SERVER_SLOW_NOTE);
        return;
      }
      setRootData('fallback', 'blocked');
      setNote(OFFLINE_SERVER_DOWN_NOTE);
      return;
    }
    // 검색어를 붙여 브라우저·서비스 워커 캐시를 지나가게 한다(실제 망을 잰다 — parsePyodideUrl이 ?가 붙은 주소를 지나친다).
    const cdn = await probeUrl(`${pyodideCdnUrl('pyodide.mjs')}?probe=${Date.now()}`, { stallMs: PROBE_STALL_MS });
    if (disposed) {
      return;
    }
    const controlled = () => Boolean(navigator.serviceWorker?.controller);
    const reloadAllowed = () =>
      !reloadGuard().taken &&
      runtime.state !== 'idle' &&
      runtime.state !== 'running' &&
      swState !== 'unsupported' &&
      swState !== 'off' &&
      swState !== 'failed';
    let plan = planFallback({ trigger, cdn: cdn.status, controlled: controlled(), reloadAllowed: reloadAllowed() });
    if (plan.tellServiceWorker) {
      // CDN이 막혔다는 확실한 증거다. 서비스 워커에 알려 다음 파일부터 예비 경로를 먼저 쓰게 한다
      // (서비스 워커가 방금 CDN에서 바이트를 받고 있었으면 따르지 않는다 — src/sw/sw.js).
      tellServiceWorker(registration, { type: SW_MESSAGE.cdnDown });
    }
    if (plan.needSiteProbe) {
      const site = await probeUrl(`${pyodideSiteUrl('pyodide.mjs', origin)}?probe=${Date.now()}`, { stallMs: PROBE_STALL_MS });
      if (disposed) {
        return;
      }
      plan = planFallback({ trigger, cdn: cdn.status, site: site.status, controlled: controlled(), reloadAllowed: reloadAllowed() });
    }
    setRootData('fallbackReason', plan.reason);
    switch (plan.action) {
      case 'none':
        // 인터넷은 되는데 느린 것뿐이다. 다음에 또 살펴볼 수 있게 열어 둔다(다음 살핌은 지금부터 다시 15초 동안 진행이 없을 때).
        probing = false;
        noteActivity();
        setRootData('fallback', '');
        return;
      case 'slow':
        // 살핌도 바이트를 받지 못했다 — 느린 회선일 수 있다(큰 파일과 같은 연결에 줄을 섬). 막혔다고 단정하지 않고 안내만 하며, 다음에 또 살핀다
        // (살핌이 15초를 기다린 바로 뒤에 또 살피지 않게 지금부터 다시 센다).
        probing = false;
        noteActivity();
        setRootData('fallback', 'slow');
        setNote(SLOW_LINE_NOTE);
        return;
      case 'blocked':
        setRootData('fallback', 'blocked');
        setNote(`인터넷에서도 이 사이트에서도 파이썬 파일을 받지 못했어요. 시작하기 > 점검 페이지(${CHECK_PAGE})에서 네트워크를 시험해 보세요.`);
        return;
      case 'site':
        // 서비스 워커가 이미 맡고 있으면 다시 부르지 않아도 예비 경로로 바뀐다.
        setRootData('fallback', 'site');
        setNote('인터넷(jsDelivr)이 막혀 있어 이 사이트의 예비본으로 받고 있어요.');
        return;
      case 'blocked-no-reload':
        setRootData('fallback', 'blocked');
        setNote(`인터넷(jsDelivr)에서 파이썬 파일을 받지 못했어요. 새로고침하거나 시작하기 > 점검 페이지(${CHECK_PAGE})를 열어 보세요.`);
        return;
      case 'reload': {
        reloadGuard().take();
        setRootData('fallback', 'switching');
        setNote('인터넷이 막혀 있어 이 사이트의 예비본으로 바꾸는 중이에요. 화면이 한 번 새로고침돼요.');
        lab.appendConsole('[안내] 인터넷(jsDelivr)이 막혀 있어 이 사이트의 예비본으로 바꿔요. 화면을 한 번 새로 불러와요.\n', 'notice');
        setTimeout(() => {
          if (!disposed) {
            location.reload();
          }
        }, 600);
        return;
      }
      default:
        probing = false;
        setRootData('fallback', '');
    }
  };

  const onLoadFailed = async () => {
    if (disposed) {
      return;
    }
    await probeAndSwitch('failed');
  };

  /**
   * "받은 양이 15초 동안 늘지 않으면"(PLAN §5.4)의 화면 쪽 구현.
   * 진행 신호(실행기 단계 알림·서비스 워커 파일 메시지)가 올 때마다 시각을 적어 두고, 받는 중인데 그 시각이 PROBE_AFTER_IDLE_MS보다
   * 오래됐으면 CDN을 살펴본다. 전체 시간이 아니라 **멈춤**을 기준으로 삼아 느린 망에서 오판하지 않는다.
   * 서비스 워커가 이 쪽의 파이썬 파일을 맡아 받기 메시지를 보낸 방문에는 살피지 않는다 — 서비스 워커가 실제 바이트로(같은 위치의 받기 모두에
   * 15초 동안 바이트가 없을 때만) 파일 하나 단위로 예비 경로로 바꾼다(src/sw/sw.js, 판 1.2.0 — 미해결 215). 서비스 워커가 맡지 않은 첫 방문에는
   * 화면이 워커의 받기 진행을 볼 수 없어 살핌이 대리 지표다. 받기가 아예 실패하면(state 'failed') 기다리지 않고 바로 살핀다.
   */
  const idleCheckMs = 1_000;
  let lastActivityAt = Date.now();
  const noteActivity = () => {
    lastActivityAt = Date.now();
  };
  const idleTimer = setInterval(() => {
    if (disposed) {
      return;
    }
    const wanted = shouldProbeOnIdle({
      runtimeState: runtime.state,
      phase: tracker.snapshot().phase,
      quietMs: Date.now() - lastActivityAt,
      probing,
      swDeliveringPyodide,
    });
    if (!wanted) {
      return;
    }
    noteActivity();
    void probeAndSwitch('idle');
  }, idleCheckMs);
  cleanups.push(() => clearInterval(idleTimer));

  // ── [이 컴퓨터에 실습 파일 미리 받기] ──
  if (prefetchButton) {
    const already = readItem(PREFETCH_DONE_NAME) === manifest.id + ':' + prefetchBytes;
    prefetchButton.textContent = already
      ? `실습 파일 다시 받아 두기(${formatBytes(prefetchBytes)})`
      : `이 컴퓨터에 실습 파일 미리 받기(${formatBytes(prefetchBytes)})`;
    prefetchButton.addEventListener('click', async () => {
      if (!navigator.serviceWorker?.controller) {
        if (prefetchStatus) {
          prefetchStatus.textContent = '오프라인 준비가 아직 켜지지 않았어요. 새로고침한 뒤 다시 눌러 주세요.';
        }
        return;
      }
      prefetchButton.disabled = true;
      if (prefetchStatus) {
        prefetchStatus.textContent = '실습 파일을 받는 중이에요… 창을 닫지 마세요.';
      }
      const result = await prefetchFiles(pyodidePrefetchUrlsFor(labPackages), 10 * 60_000);
      // 쓸 때 받는 모듈(통신 모듈 — Phase 6 P6-02, PROGRESS 미해결 157)의 화면 쪽 파일도 받아 둔다. 서비스 워커가 _astro/를 캐시에 넣어,
      // 미리 받아 둔 교실 PC는 수업 중 인터넷이 끊겨도 통신 예제의 [보내기]·블루투스·MQTT 칸이 붙는다(받기만 하고 붙이지는 않는다 — 요청 A-10).
      await prefetchLazyModules(context.root).catch(() => 0);
      prefetchButton.disabled = false;
      if (prefetchStatus) {
        prefetchStatus.textContent = result
          ? result.failed === 0
            ? `실습 파일 ${result.ok}개(${formatBytes(result.bytes)})를 이 컴퓨터에 저장했어요. 이제 인터넷 없이도 실습이 열려요.`
            : `${result.ok}개는 받았고 ${result.failed}개는 받지 못했어요. 네트워크를 확인한 뒤 다시 눌러 주세요.`
          : '받기를 끝내지 못했어요. 다시 눌러 주세요.';
      }
      if (result && result.failed === 0) {
        writeItem(PREFETCH_DONE_NAME, manifest.id + ':' + prefetchBytes);
      }
    });
  }

  // 파이썬을 받는 동안 학생이 [실행]을 눌러 두면(예약) 이 패널을 화면 안으로 옮긴다: 기다리는 동안 진행률 막대와 1분 개념 카드가
  // 보여야 "얼마나 더 기다리는지"를 안다(2026-09-17 검토 반영 — 전에는 패널이 문서 y≈3,300px에 있어 한 번도 보이지 않았다).
  // 'nearest'로 옮겨 [실행] 단추("준비되면 실행돼요…")가 되도록 함께 보이게 한다.
  cleanups.push(
    context.onLab('run-pending', () => {
      if (panel && !panel.hidden && !collapsed) {
        revealElement(panel, { block: 'nearest' });
      }
    }),
  );

  // 기록 지우기를 누르면 저장해 둔 "미리 받음" 표시도 지워진다(clearOurs가 머리말 이름을 지운다) — 단추 글자만 되돌린다.
  cleanups.push(
    context.onLab('records-cleared', () => {
      if (prefetchButton) {
        prefetchButton.textContent = `이 컴퓨터에 실습 파일 미리 받기(${formatBytes(prefetchBytes)})`;
      }
      if (prefetchStatus) {
        prefetchStatus.textContent = '';
      }
    }),
  );

  // 이 모듈은 자기 청크를 받은 뒤에 붙으므로(host.ts 지연 로딩) 그 사이에 지나간 단계를 실행기에서 읽어 맞춘다.
  // 그러지 않으면 이미 준비가 끝난 실습실에서 패널이 "idle"인 채로 남는다.
  tracker.runtimeState(runtime.state);
  if (runtime.info) {
    tracker.runtimeReady(runtime.info);
    if (runtime.loadedPackages.length > 0) {
      tracker.runtimeProgress({ stage: 'package', phase: 'done', names: runtime.loadedPackages });
    }
  }

  // 첫 준비 중이면 이 칸을 실습실 맨 위 자리([data-lab-intro] — 편집칸 앞)로 DOM째 옮긴 뒤 보인다: 보이는 차례와 Tab 차례가 같다
  // (판 1.2.0 — PROGRESS 미해결 218, WCAG 2.4.3). 준비가 끝나 접히거나 [실행]을 누르면 제자리로 돌아간다(setCollapsed·lab-shell.ts — intro.ts).
  if (panel) {
    placeInLoadingIntro(root, panel);
  }
  context.showPanel();
  setCollapsed(false);
  render();
  void setupServiceWorker();

  return {
    dispose() {
      disposed = true;
      if (collapseTimer !== null) {
        clearTimeout(collapseTimer);
      }
      for (const cleanup of cleanups.splice(0)) {
        try {
          cleanup();
        } catch {
          // 이미 풀린 훅
        }
      }
    },
  };
}

const module: LabModule = { manifest, mount };
export default module;
