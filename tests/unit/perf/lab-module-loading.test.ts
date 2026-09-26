// 흉내 모듈 "쓸 때 받기"(src/lab/modules/host.ts — Phase 6 P6-02, PROGRESS 미해결 157)의 단위 테스트.
// 가짜 실습실 틀(lab)·뿌리 요소·창 이벤트·모듈 받기(loaderFor)로 host의 약속을 본다:
//  ① load 규칙이 있는 무리는 열 때 받지 않는다(받기 함수를 부르지도 않는다) — data-lab-modules에는 있고 waiting에 있다
//  ② 코드 낱말·주소·창 이벤트·파이썬 요청 가운데 하나가 부르면 **무리째** 받고, 받는 동안 [실행]을 잡아 둔다(holdRun)
//  ③ 무리는 모두 받은 뒤 load.order 차례로 mount한다 — 늦게 받은 모듈이 먼저여도 차례는 같다(Phase 4 검토 지적 1이 되살아나지 않게)
//  ④ 받기 전에 온 창 이벤트는 모듈이 붙은 뒤 한 번 더 보내고, 받기 전에 온 요청은 모듈의 처리기로 넘긴다
//  ⑤ 한 모듈이 실패해도 나머지는 붙고, 실패한 모듈은 data-lab-modules에서 빠진다
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MODULES_LOADED_EVENT, MODULES_READY_EVENT, loadLabModuleGroup, mountLabModules, prefetchLazyModules } from '../../../src/lab/modules/host.ts';
import type { LabModule, LabModuleContext, LabModuleManifest } from '../../../src/lab/modules/types.ts';

type Listener = (payload: { code: string }) => void;
type Handler = (request: FakeRequest) => void;

interface FakeRequest {
  readonly requestId: number;
  readonly kind: string;
  readonly payload: unknown;
  reply(value: unknown): void;
  fail(message: string): void;
}

/** 실습실 틀(LabController)에서 host가 쓰는 것만 흉내 낸다 */
class FakeLab {
  readonly labId: string;
  code: string;
  readonly holds: Promise<unknown>[] = [];
  readonly consoleLines: string[] = [];
  readonly codeListeners = new Set<Listener>();
  readonly handlers = new Map<string, Handler>();
  readonly runtime = { state: 'idle', on: () => () => undefined, pushEvent: () => undefined, setValue: () => undefined };

  constructor(labId: string, code: string) {
    this.labId = labId;
    this.code = code;
  }

  getCode(): string {
    return this.code;
  }

  on(event: string, listener: Listener): () => void {
    if (event !== 'code') {
      return () => undefined;
    }
    this.codeListeners.add(listener);
    return () => this.codeListeners.delete(listener);
  }

  setCode(code: string): void {
    this.code = code;
    for (const listener of [...this.codeListeners]) {
      listener({ code });
    }
  }

  onRequest(kind: string, handler: Handler): () => void {
    this.handlers.set(kind, handler);
    return () => {
      if (this.handlers.get(kind) === handler) {
        this.handlers.delete(kind);
      }
    };
  }

  holdRun(task: Promise<unknown>): void {
    this.holds.push(task);
  }

  appendConsole(text: string): void {
    this.consoleLines.push(text);
  }

  /** 파이썬이 요청을 보낸 것처럼(처리기가 없으면 lab-shell처럼 거절) */
  request(kind: string, payload: unknown = null): Promise<{ ok: boolean; value: unknown }> {
    return new Promise((resolve) => {
      const request: FakeRequest = {
        requestId: 1,
        kind,
        payload,
        reply: (value) => resolve({ ok: true, value }),
        fail: (message) => resolve({ ok: false, value: message }),
      };
      const handler = this.handlers.get(kind);
      if (handler) {
        handler(request);
      } else {
        request.fail(`이 실습실은 "${kind}" 요청을 처리하지 못해요.`);
      }
    });
  }
}

/** 실습실 뿌리 요소(dataset·이벤트·querySelector)만 흉내 낸다 */
class FakeRoot extends EventTarget {
  readonly dataset: Record<string, string> = {};
  querySelector(): null {
    return null;
  }
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const MANIFESTS: readonly LabModuleManifest[] = Object.freeze([
  { id: 'core', title: '늘 붙는 모듈', labs: ['vision'] },
  // 통로를 등록하는 쪽(order 0)과 목록을 그리는 쪽(order 10) — 폴더 이름 차례(list < port)와 mount 차례가 반대가 되게 이름을 골랐다
  { id: 'list', title: '목록 그리는 모듈', labs: ['vision'], load: { group: 'comm', code: /\bbridge\b/u, query: ['bridge'], order: 10 } },
  { id: 'port', title: '통로 모듈', labs: ['vision'], requestKinds: ['port.open'], load: { group: 'comm', code: /\bserial\b/u, windowEvents: ['apc:port-show'], order: 0 } },
  { id: 'other', title: '다른 실습실 모듈', labs: ['esp32'], load: { group: 'comm', code: /\bserial\b/u } },
]);

interface Harness {
  lab: FakeLab;
  root: FakeRoot;
  events: EventTarget;
  loads: string[];
  mounts: string[];
  loaderGates: Map<string, { promise: Promise<void>; resolve(value: void): void }>;
  shown: string[];
  ready: Promise<unknown>;
}

function setup(options: { code?: string; search?: string; gate?: string[]; fail?: string[] } = {}): Harness {
  const lab = new FakeLab('vision', options.code ?? 'print("안녕")\n');
  const root = new FakeRoot();
  const events = new EventTarget();
  const loads: string[] = [];
  const mounts: string[] = [];
  const shown: string[] = [];
  const loaderGates = new Map<string, { promise: Promise<void>; resolve(value: void): void }>();
  for (const id of options.gate ?? []) {
    loaderGates.set(id, deferred<void>());
  }
  const moduleFor = (manifest: LabModuleManifest): LabModule => ({
    manifest,
    mount(context: LabModuleContext) {
      mounts.push(manifest.id);
      if (manifest.id === 'port') {
        // 실제 통신 모듈처럼: 요청 처리기를 달고, 칸을 열어 달라는 창 이벤트를 듣는다
        context.onRequest('port.open', (request) => request.reply({ opened: true }));
        const onShow = () => shown.push('port');
        events.addEventListener('apc:port-show', onShow);
        return { dispose: () => events.removeEventListener('apc:port-show', onShow) };
      }
      return {};
    },
  });
  const ready = mountLabModules(root as unknown as HTMLElement, lab as never, MANIFESTS, {
    search: options.search ?? '',
    eventTarget: events,
    loaderFor: (id) => {
      const manifest = MANIFESTS.find((item) => item.id === id);
      if (!manifest) {
        return null;
      }
      return async () => {
        loads.push(id);
        await loaderGates.get(id)?.promise;
        if (options.fail?.includes(id)) {
          throw new Error(`${id}를 받지 못함(시험)`);
        }
        return { default: moduleFor(manifest) };
      };
    },
  });
  return { lab, root, events, loads, mounts, loaderGates, shown, ready };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('쓸 때 받는 무리(host — 미해결 157)', () => {
  it('① 코드가 무리를 부르지 않으면 받지 않는다 — data-lab-modules에는 있고 waiting에 있다', async () => {
    const h = setup();
    const readyEvents: unknown[] = [];
    h.root.addEventListener(MODULES_READY_EVENT, (event) => readyEvents.push((event as CustomEvent).detail));
    const mounted = (await h.ready) as { manifest: LabModuleManifest }[];
    expect(mounted.map((item) => item.manifest.id)).toEqual(['core']);
    expect(h.loads).toEqual(['core']);
    expect(h.root.dataset).toMatchObject({ labModules: 'core list port', labModulesLoaded: 'core', labModulesWaiting: 'list port' });
    expect(h.root.dataset.labModulesLoadedBy).toBeUndefined();
    expect(readyEvents).toHaveLength(1);
    // 다른 실습실(esp32)의 모듈은 이 실습실에 붙지 않는다
    expect(h.root.dataset.labModules).not.toContain('other');
    // 코드를 고쳐도 낱말이 없으면 여전히 받지 않는다
    h.lab.setCode('import cv2\nprint("시리얼 없음")\n');
    await Promise.resolve();
    expect(h.loads).toEqual(['core']);
  });

  it('② 코드에 낱말이 보이면 무리째 받고 [실행]을 잡아 두며, ③ 늦게 받은 모듈이 있어도 order 차례로 mount한다', async () => {
    const h = setup({ gate: ['port'] });
    await h.ready;
    const holdsBefore = h.lab.holds.length;
    const loadedEvents: { group: string; reason: string }[] = [];
    h.root.addEventListener(MODULES_LOADED_EVENT, (event) => loadedEvents.push((event as CustomEvent).detail));
    h.lab.setCode('import serial\nuart = serial.Serial("COM3")\n');
    // 무리의 두 모듈을 함께 받기 시작했고, [실행]이 그 약속을 기다린다
    await vi.waitFor(() => expect([...h.loads].sort()).toEqual(['core', 'list', 'port']));
    expect(h.lab.holds.length).toBe(holdsBefore + 1);
    expect(h.root.dataset.labModulesLoadedBy).toBe('comm=code:port');
    // list는 이미 받았지만 port를 다 받기 전에는 아무것도 mount하지 않는다(모두 받은 뒤 차례로)
    expect(h.mounts).toEqual(['core']);
    h.loaderGates.get('port')?.resolve();
    await h.lab.holds.at(-1);
    // order 0(port — 통로 등록) → order 10(list — 목록 그리기)
    expect(h.mounts).toEqual(['core', 'port', 'list']);
    expect(h.root.dataset).toMatchObject({ labModules: 'core list port', labModulesLoaded: 'core list port', labModulesWaiting: '' });
    expect(loadedEvents).toEqual([expect.objectContaining({ group: 'comm', reason: 'code:port' })]);
    // 모두 받았으니 코드 지켜보기를 푼다
    expect(h.lab.codeListeners.size).toBe(0);
  });

  it('주소(?bridge=)가 부르면 열 때 함께 받는다(열 때의 약속에 들어간다)', async () => {
    const h = setup({ search: '?example=esp32%2Fu3%2Fx.py&bridge=zaneabridge3' });
    const mounted = (await h.ready) as { manifest: LabModuleManifest }[];
    expect(mounted.map((item) => item.manifest.id)).toEqual(['core', 'port', 'list']);
    expect(h.root.dataset).toMatchObject({ labModulesLoaded: 'core list port', labModulesWaiting: '', labModulesLoadedBy: 'comm=query:list' });
    // 받을 무리가 없으니 코드를 지켜보지 않는다
    expect(h.lab.codeListeners.size).toBe(0);
  });

  it('열 때의 코드가 부르면(예: ?example=로 연 통신 예제) 열 때 함께 받는다', async () => {
    const h = setup({ code: 'from bridge import send\n' });
    const mounted = (await h.ready) as { manifest: LabModuleManifest }[];
    expect(mounted.map((item) => item.manifest.id)).toEqual(['core', 'port', 'list']);
    expect(h.root.dataset.labModulesLoadedBy).toBe('comm=code:list');
  });

  it('④ 받기 전에 온 창 이벤트는 모듈이 붙은 뒤 한 번 더 보내 모듈이 듣는다(되돌아 다시 받지 않는다)', async () => {
    const h = setup();
    await h.ready;
    h.events.dispatchEvent(new Event('apc:port-show'));
    await vi.waitFor(() => expect(h.shown).toEqual(['port']));
    expect(h.root.dataset.labModulesLoadedBy).toBe('comm=event:apc:port-show');
    // 붙은 뒤에는 모듈이 직접 듣는다 — host가 끼어들지 않는다
    h.events.dispatchEvent(new Event('apc:port-show'));
    expect(h.shown).toEqual(['port', 'port']);
    expect(h.loads.filter((id) => id === 'port')).toHaveLength(1);
  });

  it('④ 코드 모양으로 못 알아본 import라도 파이썬 요청이 오면 무리를 받아 그 모듈의 처리기로 넘긴다', async () => {
    const h = setup({ code: 'm = __import__("se" + "rial")\n' });
    await h.ready;
    expect(h.loads).toEqual(['core']);
    const answer = await h.lab.request('port.open', { port: 'COM3' });
    expect(answer).toEqual({ ok: true, value: { opened: true } });
    expect(h.root.dataset.labModulesLoadedBy).toBe('comm=request:port.open');
    // 이제 요청은 모듈의 처리기가 곧바로 받는다(자리 처리기는 풀렸고 모듈 처리기는 남았다)
    expect(await h.lab.request('port.open')).toEqual({ ok: true, value: { opened: true } });
  });

  it('⑤ 무리 안 한 모듈이 실패해도 나머지는 붙고, 실패한 모듈은 data-lab-modules에서 빠지며 콘솔에 안내가 남는다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const h = setup({ fail: ['list'] });
    await h.ready;
    h.lab.setCode('import serial\n');
    await h.lab.holds.at(-1);
    expect(h.mounts).toEqual(['core', 'port']);
    expect(h.root.dataset).toMatchObject({ labModules: 'core port', labModulesLoaded: 'core port', labModulesWaiting: '' });
    expect(h.lab.consoleLines.join('')).toContain('"목록 그리는 모듈" 모듈을 준비하지 못했어요');
  });

  it('[미리 받기]: prefetchLazyModules는 쓸 때 받는 모듈 파일을 받아만 두고 mount하지 않는다', async () => {
    const h = setup();
    await h.ready;
    expect(await prefetchLazyModules(h.root as unknown as HTMLElement)).toBe(2);
    expect([...h.loads].sort()).toEqual(['core', 'list', 'port']);
    // 받기만 했다 — 여전히 기다리는 중이고 붙지 않았다
    expect(h.mounts).toEqual(['core']);
    expect(h.root.dataset.labModulesWaiting).toBe('list port');
    expect(await prefetchLazyModules(null)).toBe(0);
    // 나중에 코드가 부르면 그때 붙는다
    h.lab.setCode('import serial\n');
    await h.lab.holds.at(-1);
    expect(h.mounts).toEqual(['core', 'port', 'list']);
  });

  it('두 번 불러도 같은 약속이고, loadLabModuleGroup으로 직접 받을 수 있다(없는 무리는 null)', async () => {
    const h = setup();
    const again = mountLabModules(h.root as unknown as HTMLElement, h.lab as never, MANIFESTS);
    expect(again).toBe(h.ready);
    await h.ready;
    expect(loadLabModuleGroup(h.root as unknown as HTMLElement, 'nothing')).toBeNull();
    expect(loadLabModuleGroup(null, 'comm')).toBeNull();
    const loading = loadLabModuleGroup(h.root as unknown as HTMLElement, 'comm', 'test');
    expect(loading).not.toBeNull();
    await loading;
    expect(h.root.dataset.labModulesLoadedBy).toBe('comm=test');
    // 같은 무리를 또 불러도 다시 받지 않는다
    expect(loadLabModuleGroup(h.root as unknown as HTMLElement, 'comm')).toBe(loading);
    expect(h.loads.filter((id) => id === 'port')).toHaveLength(1);
  });
});
