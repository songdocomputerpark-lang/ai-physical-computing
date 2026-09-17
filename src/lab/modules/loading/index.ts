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
 *
 * 테스트가 읽는 값(실습실 뿌리 [data-lab]): data-loading-phase(idle|loading|ready|failed), data-loading-percent,
 * data-loading-source(cdn|site|cache|unknown), data-loading-sw(unsupported|off|registering|ready|controlled|failed),
 * data-loading-warm(idle|running|done|partial|failed), data-loading-fallback(''|probing|switching|site|blocked).
 */
import { withBase } from '../../../lib/url.ts';
import { readItem, writeItem } from '../../../lib/storage.ts';
import { revealElement } from '../../controls/reveal.ts';
import { CONCEPT_CARDS, cardCounterText, nextCardIndex } from '../../loader/cards.ts';
import {
  CARD_INTERVAL_MS,
  LOADING_STAGE_EVENT,
  PANEL_COLLAPSE_DELAY_MS,
  PREFETCH_DONE_NAME,
  PROBE_AFTER_IDLE_MS,
  PROBE_STALL_MS,
  RELOAD_GUARD_NAME,
  SW_MESSAGE,
  WARM_DELAY_MS,
  type DownloadMessage,
  type LoadingStageDetail,
} from '../../loader/constants.ts';
import { probeUrl } from '../../loader/probe.ts';
import {
  PYODIDE_FALLBACK_TOTAL_BYTES,
  formatBytes,
  pyodideCdnUrl,
  pyodidePrefetchUrls,
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
import { LoadingTracker, type StageSnapshot } from '../../loader/stages.ts';
import type { LabModule, LabModuleContext, LabModuleHandle } from '../types.ts';
import manifest from './manifest.ts';

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

  const setRootData = (name: string, value: string) => {
    root.dataset[`loading${name[0]!.toUpperCase()}${name.slice(1)}`] = value;
  };
  setRootData('phase', 'idle');
  setRootData('sw', 'registering');
  setRootData('warm', 'idle');
  setRootData('source', 'unknown');
  setRootData('fallback', '');

  // ── 진행률 그리기 ──
  let collapseTimer: ReturnType<typeof setTimeout> | null = null;
  let collapsed = false;
  let renderQueued = false;

  const setCollapsed = (value: boolean) => {
    collapsed = value;
    if (value) {
      // 첫 준비 동안 맨 위(조작 줄 바로 아래)에 올려 둔 이 패널을 제자리(입력·출력 아래)로 돌린다(LabShell.astro의 data-loading-intro).
      // 준비가 끝나 접힐 때나 학생이 [접기]를 누를 때 한 번 — 그 뒤로는 다시 올리지 않는다(화면이 오르내리지 않게).
      root.dataset.loadingIntro = 'no';
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

  const render = () => {
    renderQueued = false;
    const snapshot = tracker.snapshot();
    setRootData('phase', snapshot.phase);
    setRootData('percent', snapshot.percent === null ? '' : String(snapshot.percent));
    setRootData('source', snapshot.source);
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
      if (!collapsed && collapseTimer === null) {
        collapseTimer = setTimeout(() => {
          collapseTimer = null;
          setCollapsed(true);
        }, PANEL_COLLAPSE_DELAY_MS);
      }
      scheduleWarm();
    } else if (collapseTimer !== null) {
      // 다시 받기 시작했다(패키지 단계 등) — 접지 않는다.
      clearTimeout(collapseTimer);
      collapseTimer = null;
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
      scheduleRender();
      if (state === 'failed') {
        void onLoadFailed();
      }
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
  cleanups.push(
    onDownload((message: DownloadMessage) => {
      noteActivity();
      tracker.download(message);
      scheduleRender();
    }),
  );

  // ── 1분 개념 카드 ──
  let cardIndex = 0;
  let cardTimer: ReturnType<typeof setInterval> | null = null;
  const showCard = (index: number) => {
    cardIndex = nextCardIndex(index, 0);
    const card = CONCEPT_CARDS[cardIndex];
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
      cardCounter.textContent = cardCounterText(cardIndex);
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
    cardTimer = setInterval(() => showCard(nextCardIndex(cardIndex, 1)), CARD_INTERVAL_MS);
  };
  const step = (by: number) => {
    showCard(nextCardIndex(cardIndex, by));
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
    setCollapsed(!collapsed);
  });

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
    const result = await warmCache([...usedSiteFiles(), ...pyodidePrefetchUrls()]);
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
  let probing = false;
  const probeAndSwitch = async () => {
    if (probing || disposed) {
      return;
    }
    probing = true;
    setRootData('fallback', 'probing');
    // 검색어를 붙여 브라우저·서비스 워커 캐시를 지나가게 한다(실제 망을 잰다 — parsePyodideUrl이 ?가 붙은 주소를 지나친다).
    const outcome = await probeUrl(`${pyodideCdnUrl('pyodide.mjs')}?probe=${Date.now()}`, { stallMs: PROBE_STALL_MS });
    if (outcome.status === 'ok') {
      // 인터넷은 되는데 느린 것뿐이다. 다음에 또 살펴볼 수 있게 열어 둔다.
      probing = false;
      setRootData('fallback', '');
      return;
    }
    if (disposed) {
      return;
    }
    // CDN이 막혔다. 서비스 워커에 알려 다음 파일부터 예비 경로를 먼저 쓰게 한다.
    tellServiceWorker(registration, { type: SW_MESSAGE.cdnDown });
    const site = await probeUrl(`${pyodideSiteUrl('pyodide.mjs', origin)}?probe=${Date.now()}`, { stallMs: PROBE_STALL_MS });
    if (disposed) {
      return;
    }
    if (site.status !== 'ok') {
      setRootData('fallback', 'blocked');
      setNote(`인터넷에서도 이 사이트에서도 파이썬 파일을 받지 못했어요. 시작하기 > 점검 페이지(${CHECK_PAGE})에서 네트워크를 시험해 보세요.`);
      return;
    }
    if (navigator.serviceWorker?.controller) {
      // 서비스 워커가 이미 맡고 있으면 다시 부르지 않아도 예비 경로로 바뀐다.
      setRootData('fallback', 'site');
      setNote('인터넷(jsDelivr)이 막혀 있어 이 사이트의 예비본으로 받고 있어요.');
      return;
    }
    const guard = reloadGuard();
    if (guard.taken || runtime.state === 'idle' || runtime.state === 'running' || swState === 'unsupported' || swState === 'off' || swState === 'failed') {
      setRootData('fallback', 'blocked');
      setNote(`인터넷(jsDelivr)에서 파이썬 파일을 받지 못했어요. 새로고침하거나 시작하기 > 점검 페이지(${CHECK_PAGE})를 열어 보세요.`);
      return;
    }
    guard.take();
    setRootData('fallback', 'switching');
    setNote('인터넷이 막혀 있어 이 사이트의 예비본으로 바꾸는 중이에요. 화면이 한 번 새로고침돼요.');
    lab.appendConsole('[안내] 인터넷(jsDelivr)이 막혀 있어 이 사이트의 예비본으로 바꿔요. 화면을 한 번 새로 불러와요.\n', 'notice');
    setTimeout(() => {
      if (!disposed) {
        location.reload();
      }
    }, 600);
  };

  const onLoadFailed = async () => {
    if (disposed) {
      return;
    }
    await probeAndSwitch();
  };

  /**
   * "받은 양이 15초 동안 늘지 않으면"(PLAN §5.4)의 화면 쪽 구현.
   * 진행 신호(실행기 단계 알림·서비스 워커 파일 메시지)가 올 때마다 시각을 적어 두고, 받는 중인데 그 시각이 PROBE_AFTER_IDLE_MS보다
   * 오래됐으면 CDN을 살펴본다. 전체 시간이 아니라 **멈춤**을 기준으로 삼아 느린 망에서 오판하지 않는다.
   * 서비스 워커가 페이지를 맡은 방문에는 파일 진행 메시지가 계속 오므로 여기까지 오지 않고, 서비스 워커가 파일 하나 단위로
   * 예비 경로로 바꾼다(src/sw/sw.js). 받기가 아예 실패하면(state 'failed') 기다리지 않고 바로 살핀다.
   */
  const idleCheckMs = 1_000;
  let lastActivityAt = Date.now();
  const noteActivity = () => {
    lastActivityAt = Date.now();
  };
  const idleTimer = setInterval(() => {
    if (disposed || probing) {
      return;
    }
    if (runtime.state !== 'loading' && runtime.state !== 'unloaded') {
      return;
    }
    if (tracker.snapshot().phase !== 'loading' || Date.now() - lastActivityAt < PROBE_AFTER_IDLE_MS) {
      return;
    }
    noteActivity();
    void probeAndSwitch();
  }, idleCheckMs);
  cleanups.push(() => clearInterval(idleTimer));

  // ── [이 컴퓨터에 실습 파일 미리 받기] ──
  if (prefetchButton) {
    const already = readItem(PREFETCH_DONE_NAME) === manifest.id + ':' + PYODIDE_FALLBACK_TOTAL_BYTES;
    prefetchButton.textContent = already
      ? `실습 파일 다시 받아 두기(${formatBytes(PYODIDE_FALLBACK_TOTAL_BYTES)})`
      : `이 컴퓨터에 실습 파일 미리 받기(${formatBytes(PYODIDE_FALLBACK_TOTAL_BYTES)})`;
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
      const result = await prefetchFiles(pyodidePrefetchUrls(), 10 * 60_000);
      prefetchButton.disabled = false;
      if (prefetchStatus) {
        prefetchStatus.textContent = result
          ? result.failed === 0
            ? `실습 파일 ${result.ok}개(${formatBytes(result.bytes)})를 이 컴퓨터에 저장했어요. 이제 인터넷 없이도 실습이 열려요.`
            : `${result.ok}개는 받았고 ${result.failed}개는 받지 못했어요. 네트워크를 확인한 뒤 다시 눌러 주세요.`
          : '받기를 끝내지 못했어요. 다시 눌러 주세요.';
      }
      if (result && result.failed === 0) {
        writeItem(PREFETCH_DONE_NAME, manifest.id + ':' + PYODIDE_FALLBACK_TOTAL_BYTES);
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
        prefetchButton.textContent = `이 컴퓨터에 실습 파일 미리 받기(${formatBytes(PYODIDE_FALLBACK_TOTAL_BYTES)})`;
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
