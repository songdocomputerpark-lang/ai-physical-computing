/**
 * 흉내 모듈의 화면 쪽을 실습실에 붙이는 곳(src/lab/README.md 4절). LabShell.astro의 스크립트가 mountLabShell 뒤에 mountLabModules(root, lab)를 부른다.
 *
 * 1. manifests.ts에서 이 실습실(labId)에 붙는 모듈을 고른다.
 * 2. 그 모듈의 index.ts만 따로 받아(import.meta.glob 지연 로딩 → 모듈마다 별도 청크) mount(ctx)를 부른다. 실습실 페이지에 없는 모듈의 코드는 받지 않는다.
 * 3. ctx는 요청·이벤트·채널 이름을 manifest에 적은 것으로만 허용하고(오타·겹침을 바로 잡으려고), 등록한 훅을 dispose 때 모두 푼다.
 * 4. 한 모듈의 mount가 실패해도 실습실과 다른 모듈은 그대로 돈다(콘솔 안내 + console.error).
 *
 * 테스트가 읽는 값: 뿌리 [data-lab]의 data-lab-modules(붙은 모듈 id를 공백으로 이음), 모듈 패널 [data-lab-module-panel="<id>"]의 hidden.
 */
import type { LabController } from '../controls/lab-shell.ts';
import { storageKey } from '../../lib/storage.ts';
import type { RuntimeRequest } from '../runtime/client.ts';
import { getVisionLab, type VisionLab } from '../vision/vision-lab.ts';
import { MODULE_MANIFESTS, modulesForLab } from './manifests.ts';
import type { LabModule, LabModuleContext, LabModuleHandle, LabModuleManifest } from './types.ts';

/** 모듈이 모두 붙었을 때 뿌리 요소에 보내는 이름 */
export const MODULES_READY_EVENT = 'apc:lab-modules-ready';

const loaders = import.meta.glob<{ default: LabModule }>('./*/index.ts');

function loaderFor(id: string): (() => Promise<{ default: LabModule }>) | null {
  return loaders[`./${id}/index.ts`] ?? null;
}

export interface MountedModule {
  readonly manifest: LabModuleManifest;
  readonly handle: LabModuleHandle | null;
  readonly error: string | null;
  dispose(): void;
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

/** 모듈 하나의 ctx를 만든다(dispose가 훅을 모두 푼다). */
export function createModuleContext(root: HTMLElement, lab: LabController, manifest: LabModuleManifest): LabModuleContext & { disposeContext(): void } {
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

const mountedByRoot = new WeakMap<HTMLElement, Promise<MountedModule[]>>();

/**
 * 이 실습실에 붙는 모듈을 모두 붙인다. 두 번 부르면 같은 약속을 돌려준다.
 * manifests를 넘기면 그 목록만 본다(테스트용). 결과 목록에는 실패한 모듈도 error와 함께 들어 있다.
 */
export function mountLabModules(root: HTMLElement, lab: LabController, manifests: readonly LabModuleManifest[] = MODULE_MANIFESTS): Promise<MountedModule[]> {
  const existing = mountedByRoot.get(root);
  if (existing) {
    return existing;
  }
  const selected = modulesForLab(lab.labId, manifests);
  const promise = Promise.all(
    selected.map(async (manifest): Promise<MountedModule> => {
      const context = createModuleContext(root, lab, manifest);
      let handle: LabModuleHandle | null = null;
      let error: string | null = null;
      try {
        const loader = loaderFor(manifest.id);
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
        handle = (await module.mount(context)) ?? null;
      } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught);
        context.disposeContext();
        console.error(`흉내 모듈 "${manifest.id}"을(를) 붙이지 못했어요.`, caught);
        lab.appendConsole(`[안내] "${manifest.title}" 모듈을 준비하지 못했어요: ${error}\n`, 'notice');
      }
      return {
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
    }),
  ).then((mounted) => {
    root.dataset.labModules = mounted
      .filter((item) => item.error === null)
      .map((item) => item.manifest.id)
      .join(' ');
    root.dispatchEvent(new CustomEvent(MODULES_READY_EVENT, { detail: { mounted } }));
    const onPageHide = () => {
      for (const item of mounted) {
        item.dispose();
      }
    };
    window.addEventListener('pagehide', onPageHide, { once: true });
    return mounted;
  });
  mountedByRoot.set(root, promise);
  // 모듈이 붙기 전에 [실행]이 코드를 보내면 배선·라이브러리·조작 칸이 없는 채로 돈다 — 붙을 때까지 [실행]을 잡아 둔다(lab-shell holdRun).
  lab.holdRun(promise);
  return promise;
}

/** 페이지 스크립트·테스트가 붙은 모듈 목록을 받는 방법(아직 안 붙었으면 붙을 때까지 기다린다). */
export function getMountedModules(root: HTMLElement | null): Promise<MountedModule[]> {
  return new Promise((resolve, reject) => {
    if (!root) {
      reject(new Error('실습실 뿌리 요소([data-lab])를 찾지 못했어요.'));
      return;
    }
    const existing = mountedByRoot.get(root);
    if (existing) {
      existing.then(resolve, reject);
      return;
    }
    root.addEventListener(MODULES_READY_EVENT, (event) => resolve((event as CustomEvent<{ mounted: MountedModule[] }>).detail.mounted), { once: true });
  });
}
