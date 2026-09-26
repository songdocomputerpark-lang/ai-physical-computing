/**
 * 흉내 모듈의 화면 쪽을 실습실에 붙이는 곳(src/lab/README.md 4절). LabShell.astro의 스크립트가 mountLabShell 뒤에 mountLabModules(root, lab)를 부른다.
 *
 * 1. manifests.ts의 받는 계획(moduleLoadPlan)대로 이 실습실(labId)에 붙는 모듈을 고른다.
 * 2. 그 모듈의 index.ts만 따로 받아(import.meta.glob 지연 로딩 → 모듈마다 별도 청크) mount(ctx)를 부른다. 실습실 페이지에 없는 모듈의 코드는 받지 않는다.
 * 3. ctx는 요청·이벤트·채널 이름을 manifest에 적은 것으로만 허용하고(오타·겹침을 바로 잡으려고), 등록한 훅을 dispose 때 모두 푼다.
 * 4. 한 모듈의 mount가 실패해도 실습실과 다른 모듈은 그대로 돈다(콘솔 안내 + console.error).
 *
 * **쓸 때 받기(Phase 6 P6-02, PROGRESS 미해결 157):** manifest에 load 규칙이 있는 모듈(통신 모듈 — 무리 'comm')은 열 때 받지 않고
 * 기다리다가 그 무리를 부르는 일이 생기면 **무리째** 받는다. 부르는 일은 넷이다:
 *   ① 편집칸 코드에 그 낱말이 보임(열 때의 코드 + 'code' 이벤트 — 예제 고르기·공유 링크·자동 저장·블록 모드 생성 코드 모두 이 길)
 *   ② 주소에 그 이름이 있음(?bridge= — 다른 화면이 선의 끝으로 연 실습실)
 *   ③ 그 창 이벤트가 옴(다른 모듈·페이지가 칸을 열어 달라고 함) — 받은 뒤 같은 이벤트를 한 번 더 보내 모듈이 듣게 한다
 *   ④ 파이썬이 아직 안 붙은 모듈에 요청을 보냄(코드 모양으로는 못 알아본 import) — 무리를 받은 뒤 그 모듈의 처리기에 넘긴다
 * 무리는 **모두 받은 뒤 load.order 차례로** mount한다(통로를 등록하는 모듈이 통로 목록을 그리는 [보내기] 패널보다 먼저 — 망 사정과 상관없이
 * 같은 차례, Phase 4 검토 지적 1이 되살아나지 않게). 받는 동안 [실행]은 기다린다(lab.holdRun — 최대 RUN_HOLD_MAX_MS).
 *
 * 테스트가 읽는 값: 뿌리 [data-lab]의
 *   data-lab-modules          이 실습실에 붙은 모듈 id(공백으로 이음) — 쓸 때 받는 모듈도 붙은 것으로 센다(패널·파이썬 쪽은 이미 페이지에 있고, 쓰는 순간 받는다).
 *                             열 때의 모듈이 다 붙은 뒤에 적는다. 붙이다 실패한 모듈은 빠진다.
 *   data-lab-modules-loaded   화면 쪽(index.ts)을 받아 mount까지 끝난 모듈 id
 *   data-lab-modules-waiting  쓸 때 받으려고 기다리는 모듈 id(받으면 빠진다)
 *   data-lab-modules-loaded-by 쓸 때 받는 무리를 받기 시작한 까닭(예: "comm=code:serial-pc", "comm=query:vision-bridge", "comm=event:apc:web-bluetooth-show")
 * 모듈 패널 [data-lab-module-panel="<id>"]의 hidden.
 */
import type { LabController } from '../controls/lab-shell.ts';
import { storageKey } from '../../lib/storage.ts';
import type { RuntimeRequest } from '../runtime/client.ts';
import { getVisionLab, type VisionLab } from '../vision/vision-lab.ts';
import { MODULE_MANIFESTS, groupRequestKinds, groupWantedByCode, groupWantedByQuery, groupWindowEvents, moduleLoadPlan, type LabModuleLoadGroup } from './manifests.ts';
import type { LabModule, LabModuleContext, LabModuleHandle, LabModuleManifest } from './types.ts';

/** 열 때 받는 모듈이 모두 붙었을 때 뿌리 요소에 보내는 이름(detail: { mounted }) */
export const MODULES_READY_EVENT = 'apc:lab-modules-ready';
/** 쓸 때 받는 무리가 붙었을 때 뿌리 요소에 보내는 이름(detail: { group, reason, mounted }) */
export const MODULES_LOADED_EVENT = 'apc:lab-modules-loaded';

type ModuleLoader = () => Promise<{ default: LabModule }>;

const loaders = import.meta.glob<{ default: LabModule }>('./*/index.ts');

function defaultLoaderFor(id: string): ModuleLoader | null {
  return loaders[`./${id}/index.ts`] ?? null;
}

export interface MountedModule {
  readonly manifest: LabModuleManifest;
  readonly handle: LabModuleHandle | null;
  readonly error: string | null;
  dispose(): void;
}

/** 무리를 받게 한 까닭(기록·테스트용): code:<모듈 id>·query:<모듈 id>·event:<이벤트>·request:<요청>·start */
export type ModuleLoadReason = string;

export interface MountLabModulesOptions {
  /** 모듈 id → index.ts 받기(테스트용). 없으면 import.meta.glob의 지연 로딩 */
  readonly loaderFor?: (id: string) => ModuleLoader | null;
  /** 주소의 물음표 뒤(테스트용). 없으면 location.search */
  readonly search?: string;
  /** 창 이벤트를 듣고 다시 보내는 곳(테스트용). 없으면 window */
  readonly eventTarget?: EventTarget | null;
}

/** createModuleContext가 host에 알리는 것(쓸 때 받은 모듈에 요청을 넘기려고 처리기를 기억한다) */
interface ContextHooks {
  onRequestRegistered?(kind: string, handler: (request: RuntimeRequest) => void): void;
}

function panelOf(root: HTMLElement, id: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-lab-module-panel="${id}"]`);
}

/** manifest에 적은 이름인지 확인한다(아니면 오류 — 규약을 어긴 모듈을 바로 알게). */
function assertDeclared(manifest: LabModuleManifest, field: 'requestKinds' | 'eventKinds' | 'channels', name: string): void {
  if (!(manifest[field] ?? []).includes(name)) {
    throw new Error(`모듈 "${manifest.id}"의 manifest.${field}에 "${name}"이(가) 없어요. manifest.ts에 먼저 적어요.`);
  }
}

function messageOf(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}

/** 모듈 하나의 ctx를 만든다(dispose가 훅을 모두 푼다). */
export function createModuleContext(root: HTMLElement, lab: LabController, manifest: LabModuleManifest, hooks: ContextHooks = {}): LabModuleContext & { disposeContext(): void } {
  const cleanups: (() => void)[] = [];
  const panel = panelOf(root, manifest.id);
  const runtime = lab.runtime;
  let visionPromise: Promise<VisionLab | null> | null = null;
  return {
    labId: lab.labId,
    root,
    lab,
    runtime,
    manifest,
    panel,
    showPanel() {
      if (panel) {
        panel.hidden = false;
      }
    },
    hidePanel() {
      if (panel) {
        panel.hidden = true;
      }
    },
    onRequest(kind: string, handler: (request: RuntimeRequest) => void) {
      assertDeclared(manifest, 'requestKinds', kind);
      const off = lab.onRequest(kind, handler);
      hooks.onRequestRegistered?.(kind, handler);
      cleanups.push(off);
      return off;
    },
    onEvent(kind: string, handler: (payload: unknown) => void) {
      assertDeclared(manifest, 'eventKinds', kind);
      const off = runtime.on('event', (event) => {
        if (event.kind === kind) {
          handler(event.payload);
        }
      });
      cleanups.push(off);
      return off;
    },
    pushEvent(channel: string, value: unknown) {
      assertDeclared(manifest, 'channels', channel);
      runtime.pushEvent(channel, value);
    },
    setValue(name: string, value: unknown) {
      assertDeclared(manifest, 'channels', name);
      runtime.setValue(name, value);
    },
    onLab: ((event, listener) => {
      const off = lab.on(event, listener);
      cleanups.push(off);
      return off;
    }) as LabController['on'],
    vision() {
      if (!visionPromise) {
        visionPromise = root.querySelector('[data-vision-io]') ? getVisionLab(root) : Promise.resolve(null);
      }
      return visionPromise;
    },
    storageName(name: string) {
      return storageKey(`module:${manifest.id}:${name}`);
    },
    notice(text: string) {
      lab.appendConsole(`[안내] ${text}\n`, 'notice');
    },
    disposeContext() {
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

/** 한 실습실 뿌리의 모듈 상태 */
interface HostState {
  readonly root: HTMLElement;
  readonly lab: LabController;
  readonly loaderFor: (id: string) => ModuleLoader | null;
  readonly order: readonly string[];
  readonly loaded: Set<string>;
  readonly waiting: Set<string>;
  readonly failed: Set<string>;
  readonly mounted: MountedModule[];
  /** 모듈이 등록한 요청 처리기(쓸 때 받은 모듈에 요청을 넘길 때 찾는다) */
  readonly requestHandlers: Map<string, (request: RuntimeRequest) => void>;
  /** 열 때 받는 모듈이 다 붙어 data-lab-modules를 적어도 되는지 */
  started: boolean;
  disposed: boolean;
}

function renderDataset(state: HostState): void {
  if (!state.started) {
    return;
  }
  const { root } = state;
  root.dataset.labModules = state.order.filter((id) => !state.failed.has(id) && (state.loaded.has(id) || state.waiting.has(id))).join(' ');
  root.dataset.labModulesLoaded = state.order.filter((id) => state.loaded.has(id)).join(' ');
  root.dataset.labModulesWaiting = state.order.filter((id) => state.waiting.has(id)).join(' ');
}

/** index.ts를 받아 모양을 확인한다(mount는 부르지 않는다 — 무리는 모두 받은 뒤 차례로 mount하려고). */
async function importModule(state: HostState, manifest: LabModuleManifest): Promise<{ module: LabModule | null; error: string | null }> {
  try {
    const loader = state.loaderFor(manifest.id);
    if (!loader) {
      throw new Error(`src/lab/modules/${manifest.id}/index.ts가 없어요.`);
    }
    const loaded = await loader();
    const module = loaded.default;
    if (!module || typeof module.mount !== 'function') {
      throw new Error(`src/lab/modules/${manifest.id}/index.ts는 { manifest, mount } 객체를 default export해요.`);
    }
    if (module.manifest !== manifest && module.manifest?.id !== manifest.id) {
      throw new Error(`src/lab/modules/${manifest.id}/index.ts의 manifest가 manifest.ts와 달라요.`);
    }
    return { module, error: null };
  } catch (caught) {
    return { module: null, error: messageOf(caught) };
  }
}

/** 받은 모듈 하나를 mount한다(실패해도 실습실은 그대로 — 콘솔 안내). */
async function mountImported(state: HostState, manifest: LabModuleManifest, imported: { module: LabModule | null; error: string | null }): Promise<MountedModule> {
  const { root, lab } = state;
  const context = createModuleContext(root, lab, manifest, {
    onRequestRegistered: (kind, handler) => state.requestHandlers.set(kind, handler),
  });
  let handle: LabModuleHandle | null = null;
  let error = imported.error;
  if (imported.module) {
    try {
      handle = (await imported.module.mount(context)) ?? null;
    } catch (caught) {
      error = messageOf(caught);
    }
  }
  if (error !== null) {
    context.disposeContext();
    console.error(`흉내 모듈 "${manifest.id}"을(를) 붙이지 못했어요.`, error);
    lab.appendConsole(`[안내] "${manifest.title}" 모듈을 준비하지 못했어요: ${error}\n`, 'notice');
    state.failed.add(manifest.id);
  } else {
    state.loaded.add(manifest.id);
  }
  state.waiting.delete(manifest.id);
  const mounted: MountedModule = {
    manifest,
    handle,
    error,
    dispose() {
      try {
        handle?.dispose?.();
      } finally {
        context.disposeContext();
      }
    },
  };
  state.mounted.push(mounted);
  return mounted;
}

/** 열 때 받는 모듈: 지금까지처럼 모두 한꺼번에 받고, 받는 대로 mount한다. */
function mountEager(state: HostState, manifests: readonly LabModuleManifest[]): Promise<MountedModule[]> {
  return Promise.all(manifests.map(async (manifest) => mountImported(state, manifest, await importModule(state, manifest))));
}

/** 쓸 때 받는 무리: 모두 받은 뒤 load.order 차례로 하나씩 mount한다(차례가 망 사정에 따라 바뀌지 않게). */
async function mountGroup(state: HostState, group: LabModuleLoadGroup): Promise<MountedModule[]> {
  const imported = await Promise.all(group.members.map((manifest) => importModule(state, manifest)));
  const mounted: MountedModule[] = [];
  for (const [index, manifest] of group.members.entries()) {
    if (state.disposed) {
      break;
    }
    mounted.push(await mountImported(state, manifest, imported[index] ?? { module: null, error: '받지 못했어요.' }));
  }
  return mounted;
}

interface HostRecord {
  readonly state: HostState;
  readonly ready: Promise<MountedModule[]>;
  /** 무리 이름 → 받기(한 번만) */
  readonly loadGroup: (name: string, reason: ModuleLoadReason) => Promise<MountedModule[]> | null;
  /** 쓸 때 받는 모듈 전부(무리 구분 없이) */
  readonly lazy: readonly LabModuleManifest[];
}

const mountedByRoot = new WeakMap<HTMLElement, HostRecord>();

/**
 * 이 실습실에 붙는 모듈을 붙인다(쓸 때 받는 무리는 기다리게 해 둔다). 두 번 부르면 같은 약속을 돌려준다.
 * 약속은 **열 때 받는 모듈**(과 열 때부터 부른 무리)이 붙으면 풀린다. manifests를 넘기면 그 목록만 본다(테스트용).
 * 결과 목록에는 실패한 모듈도 error와 함께 들어 있다.
 */
export function mountLabModules(
  root: HTMLElement,
  lab: LabController,
  manifests: readonly LabModuleManifest[] = MODULE_MANIFESTS,
  options: MountLabModulesOptions = {},
): Promise<MountedModule[]> {
  const existing = mountedByRoot.get(root);
  if (existing) {
    return existing.ready;
  }
  const plan = moduleLoadPlan(lab.labId, manifests);
  const state: HostState = {
    root,
    lab,
    loaderFor: options.loaderFor ?? defaultLoaderFor,
    order: plan.all.map((manifest) => manifest.id),
    loaded: new Set(),
    waiting: new Set(plan.groups.flatMap((group) => group.members.map((manifest) => manifest.id))),
    failed: new Set(),
    mounted: [],
    requestHandlers: new Map(),
    started: false,
    disposed: false,
  };
  const search = options.search ?? (typeof location === 'undefined' ? '' : location.search);
  const eventTarget = options.eventTarget === undefined ? (typeof window === 'undefined' ? null : window) : options.eventTarget;

  /** 무리마다: 받는 중·받은 약속과 풀 훅 */
  const groups = new Map<string, { group: LabModuleLoadGroup; promise: Promise<MountedModule[]> | null; cleanups: (() => void)[]; firedEvents: Set<string> }>();
  for (const group of plan.groups) {
    groups.set(group.name, { group, promise: null, cleanups: [], firedEvents: new Set() });
  }
  let offCode: (() => void) | null = null;
  /** 무리 이름 → 받게 한 까닭(data-lab-modules-loaded-by — 테스트·문제 찾기용) */
  const loadedBy = new Map<string, ModuleLoadReason>();

  const stopWatchingIfDone = (): void => {
    if (offCode && [...groups.values()].every((entry) => entry.promise !== null)) {
      offCode();
      offCode = null;
    }
  };

  const loadGroup = (name: string, reason: ModuleLoadReason): Promise<MountedModule[]> | null => {
    const entry = groups.get(name);
    if (!entry) {
      return null;
    }
    if (entry.promise) {
      return entry.promise;
    }
    const promise = mountGroup(state, entry.group).then((mounted) => {
      // 부르는 길(창 이벤트·요청 자리)은 모듈이 붙은 **뒤에** 푼다 — 받는 동안 온 이벤트·요청도 놓치지 않게.
      // 요청 자리를 풀어도 모듈이 등록한 처리기는 남는다(lab.onRequest의 해제는 자기 처리기일 때만 지운다).
      for (const cleanup of entry.cleanups.splice(0)) {
        cleanup();
      }
      renderDataset(state);
      root.dispatchEvent(new CustomEvent(MODULES_LOADED_EVENT, { detail: { group: name, reason, mounted } }));
      // 받기 전·받는 동안 온 창 이벤트를 모듈이 듣도록 한 번 더 보낸다(host의 듣기는 위에서 풀었다 — 되돌아오지 않는다)
      for (const eventName of entry.firedEvents) {
        eventTarget?.dispatchEvent(new Event(eventName));
      }
      entry.firedEvents.clear();
      return mounted;
    });
    entry.promise = promise;
    loadedBy.set(name, reason);
    root.dataset.labModulesLoadedBy = [...loadedBy].map(([group, why]) => `${group}=${why}`).join(' ');
    // 받는 동안 누른 [실행]은 모듈이 붙을 때까지 기다린다(요청·배선·패널이 없는 채로 돌지 않게)
    lab.holdRun(promise);
    stopWatchingIfDone();
    return promise;
  };

  // ② 주소·① 열 때의 코드로 부르는 무리는 처음부터 함께 받는다(열 때의 약속에 넣는다 — 지금까지와 같은 때에 붙는다)
  const initialCode = lab.getCode();
  const startLoads: Promise<MountedModule[]>[] = [];
  for (const group of plan.groups) {
    const by = groupWantedByQuery(group, search);
    const byCode = by === null ? groupWantedByCode(group, initialCode) : null;
    if (by !== null || byCode !== null) {
      const promise = loadGroup(group.name, by !== null ? `query:${by}` : `code:${byCode}`);
      if (promise) {
        startLoads.push(promise);
      }
    }
  }

  // 아직 기다리는 무리: ① 코드 ③ 창 이벤트 ④ 파이썬 요청이 부른다
  for (const entry of groups.values()) {
    if (entry.promise) {
      continue;
    }
    const { group } = entry;
    for (const eventName of groupWindowEvents(group)) {
      if (!eventTarget) {
        break;
      }
      const onEvent = (): void => {
        entry.firedEvents.add(eventName);
        void loadGroup(group.name, `event:${eventName}`);
      };
      eventTarget.addEventListener(eventName, onEvent);
      entry.cleanups.push(() => eventTarget.removeEventListener(eventName, onEvent));
    }
    for (const [kind, moduleId] of groupRequestKinds(group)) {
      const placeholder = (request: RuntimeRequest): void => {
        const loading = loadGroup(group.name, `request:${kind}`);
        void (loading ?? Promise.resolve([])).then(() => {
          const handler = state.requestHandlers.get(kind);
          if (handler) {
            try {
              handler(request);
            } catch (caught) {
              request.fail(`"${kind}" 요청을 처리하다 오류가 났어요: ${messageOf(caught)}`);
            }
            return;
          }
          request.fail(`"${moduleId}" 모듈을 준비하지 못해 "${kind}" 요청을 처리하지 못했어요.`);
        });
      };
      entry.cleanups.push(lab.onRequest(kind, placeholder));
    }
  }
  if ([...groups.values()].some((entry) => entry.promise === null)) {
    offCode = lab.on('code', ({ code }) => {
      for (const entry of groups.values()) {
        if (entry.promise === null) {
          const by = groupWantedByCode(entry.group, code);
          if (by !== null) {
            void loadGroup(entry.group.name, `code:${by}`);
          }
        }
      }
    });
  }

  const ready = Promise.all([mountEager(state, plan.eager), ...startLoads]).then((lists) => {
    const mounted = lists.flat();
    state.started = true;
    renderDataset(state);
    root.dispatchEvent(new CustomEvent(MODULES_READY_EVENT, { detail: { mounted } }));
    const onPageHide = () => {
      state.disposed = true;
      offCode?.();
      offCode = null;
      for (const entry of groups.values()) {
        for (const cleanup of entry.cleanups.splice(0)) {
          cleanup();
        }
      }
      for (const item of state.mounted) {
        item.dispose();
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', onPageHide, { once: true });
    }
    return mounted;
  });
  mountedByRoot.set(root, { state, ready, loadGroup, lazy: plan.groups.flatMap((group) => group.members) });
  // 모듈이 붙기 전에 [실행]이 코드를 보내면 배선·라이브러리·조작 칸이 없는 채로 돈다 — 붙을 때까지 [실행]을 잡아 둔다(lab-shell holdRun).
  lab.holdRun(ready);
  return ready;
}

/** 페이지 스크립트·테스트가 붙은 모듈 목록을 받는 방법(열 때 받는 모듈이 아직 안 붙었으면 붙을 때까지 기다린다). */
export function getMountedModules(root: HTMLElement | null): Promise<MountedModule[]> {
  return new Promise((resolve, reject) => {
    if (!root) {
      reject(new Error('실습실 뿌리 요소([data-lab])를 찾지 못했어요.'));
      return;
    }
    const existing = mountedByRoot.get(root);
    if (existing) {
      existing.ready.then(resolve, reject);
      return;
    }
    root.addEventListener(MODULES_READY_EVENT, (event) => resolve((event as CustomEvent<{ mounted: MountedModule[] }>).detail.mounted), { once: true });
  });
}

/**
 * 쓸 때 받는 모듈의 화면 쪽 파일을 **mount하지 않고 받아만** 둔다 — [이 컴퓨터에 실습 파일 미리 받기](loading 모듈)가 부른다.
 * 서비스 워커가 _astro/ 파일을 캐시에 넣으므로(src/sw/sw.js 'assets'), 미리 받아 둔 교실 PC는 수업 중 인터넷이 끊겨도 통신 예제의 모듈이 붙는다.
 * 받은 파일 수를 돌려준다(그 뿌리에 모듈이 붙지 않았으면 0). 실패한 파일은 세지 않고 조용히 넘어간다(쓸 때 다시 받는다).
 */
export async function prefetchLazyModules(root: HTMLElement | null): Promise<number> {
  const record = root ? mountedByRoot.get(root) : undefined;
  if (!record) {
    return 0;
  }
  const results = await Promise.allSettled(
    record.lazy.map(async (manifest) => {
      const loader = record.state.loaderFor(manifest.id);
      if (!loader) {
        throw new Error(`${manifest.id}: index.ts 없음`);
      }
      await loader();
    }),
  );
  return results.filter((result) => result.status === 'fulfilled').length;
}

/**
 * 쓸 때 받는 무리를 지금 받는다(페이지 스크립트·테스트용 — 보통은 코드·주소·창 이벤트·요청이 알아서 부른다).
 * 그 뿌리에 모듈이 붙지 않았거나 그런 무리가 없으면 null.
 */
export function loadLabModuleGroup(root: HTMLElement | null, group: string, reason: ModuleLoadReason = 'manual'): Promise<MountedModule[]> | null {
  if (!root) {
    return null;
  }
  return mountedByRoot.get(root)?.loadGroup(group, reason) ?? null;
}
