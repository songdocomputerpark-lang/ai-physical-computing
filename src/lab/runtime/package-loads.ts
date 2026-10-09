/**
 * 파이썬 워커의 Pyodide 패키지 받기 — 한 줄로 세우기 · 받는 중 기록 · 실행 계획(판 1.2.0, PROGRESS 미해결 219).
 *
 * 워커(worker.ts)와 Node 실제 Pyodide 동시성 검사(tests/unit/lab/pyodide-package-concurrency.test.ts)가 같은 코드로 판단하게 따로 둔다.
 * DOM·워커 전역을 쓰지 않는다(Node가 타입만 지우고 실행하므로 타입 표기만 지우면 도는 문법만 쓴다 — bridge.ts와 같은 규칙).
 *
 * 1. 한 줄(package-queue.ts, DECISIONS C39 ④): Pyodide 314.0.7의 loadPackage는 부르는 즉시(패키지 잠금을 기다리기 전에) 알림 자리(stdout)를
 *    바꿔 두므로 두 받기가 겹치면 "Loading …"이 학생 콘솔로 샌다. 받기(미리 받기·다시 불러오기·실행 쪽 받기)는 모두 이 줄을 선다.
 * 2. 받는 중 기록: 받기 하나를 줄에 세울 때 그 받기가 설치할 패키지(pyodide-lock.json 열쇠, 의존 포함 — 이미 받은 것은 뺌)를 적고 끝나면 지운다.
 *    줄을 서서 아직 시작하지 않은 받기도 받는 중이다. 지금 받는 중 = 적힌 것 − 다 받은 것(pyodide.loadedPackages — Pyodide는 휠을 풀고
 *    .so까지 다 불러온 뒤에야 적는다. 그 전에는 파일만 풀린 "반쯤 받은" 패키지라 import하면 ImportError가 난다 — 2026-10-06 Node 실측).
 * 3. 실행 계획(planRun): 학생 코드의 import 이름(pyodide.code.find_imports)과 RunMessage.packages를 lock 패키지로 바꿔(의존 포함) 다 받은 것을
 *    빼면 이 실행이 받아야 할 것(needed)이다. 다른 받기가 줄에 있는데(busy) needed가 비었으면 줄을 서지 않고 곧바로 시작한다(startNow) —
 *    loadPackagesFromImports는 받을 이름이 없으면 loadPackage를 부르지 않아 "Loading …"이 샐 길이 없다(Pyodide 314.0.7 소스: find_imports →
 *    배포판 import 이름표 → 비면 []). 단 JSPI로 기다릴 수 있을 때만(canWait): 코드가 import 문으로 드러나지 않게(흉내 모듈·작업 폴더의 내 모듈을
 *    거쳐) 받는 중인 패키지에 닿으면 파이썬 import 문지기(apc_runtime)가 그 자리에서 기다려야 하기 때문이다. 제한 모드는 예전처럼 줄을 선다.
 *    받을 것이 있거나(needed), lock 파일에 없는 이름을 packages에 적었거나(받기가 오류로 알려야 함), 표를 못 읽으면 예전처럼 줄을 선다.
 */
import { createPackageQueue } from './package-queue.ts';

/** pyodide-lock.json 패키지 한 줄 가운데 쓰는 칸 */
export interface LockPackage {
  /** 패키지 이름(pyodide.loadedPackages의 열쇠와 같다 — 예: numpy, opencv-python, Pillow) */
  readonly name: string;
  /** 이 패키지를 부르는 import 이름(예: ['cv2']) */
  readonly imports?: readonly string[];
  /** 먼저 받아야 하는 패키지(lock 열쇠) */
  readonly depends?: readonly string[];
}

export type LockPackages = Readonly<Record<string, LockPackage>>;

/** 워커(또는 Node 검사)가 넘겨주는 것 — Pyodide를 직접 만지는 일 */
export interface PackageLoadsHost {
  /** pyodide.loadPackage(names, 알림 함수) */
  loadPackage(names: readonly string[]): Promise<unknown>;
  /** pyodide.loadPackagesFromImports(code, 알림 함수) */
  loadPackagesFromImports(code: string): Promise<unknown>;
  /** 다 받은 패키지 이름(Object.keys(pyodide.loadedPackages)) */
  loadedNames(): readonly string[];
  /** 코드의 import 이름(pyodide.code.find_imports — 문법 오류면 빈 목록) */
  findImports(code: string): readonly string[];
  /** lock 파일 패키지 표(pyodide.lockfile.packages). 못 읽으면 null — 그러면 늘 예전처럼 줄을 선다 */
  lockPackages(): LockPackages | null;
  /**
   * 받는 중인 패키지의 import 이름이 늘었을 때(받기를 줄에 세울 때) 부른다 — 워커는 파이썬 apc_runtime.set_packages_loading으로 넘긴다
   * (import 문지기가 import마다 워커에 묻지 않게 — 묻는 것은 그 이름이 걸렸을 때만).
   */
  onLoadingGrew?(importNames: readonly string[]): void;
  /** 기다리는 쪽(whenLoaded)이 있는 동안 받는 중을 다시 볼 간격(밀리초, 기본 200) — 받기 하나 안에서 패키지가 하나씩 끝나는 것을 알아챈다 */
  readonly pollMs?: number;
}

/** 실행 하나의 패키지 계획 */
export interface RunPackagePlan {
  /** 이 실행이 받아야 하는 패키지(lock 열쇠, 의존 포함, 다 받은 것 뺌) */
  readonly needed: readonly string[];
  /** 지금 줄에 다른 받기(받는 중이거나 차례를 기다리는 것)가 있는지 */
  readonly busy: boolean;
  /** 줄을 서지 않고 곧바로 시작해도 되는지 */
  readonly startNow: boolean;
}

export interface RunPlanOptions {
  /** 실행 때 import 문을 보고 받는지(가상 보드 실습실은 false — worker.ts packagesFromImports) */
  readonly fromImports: boolean;
  /** 파이썬이 JSPI로 기다릴 수 있는지(제한 모드가 아님) */
  readonly canWait: boolean;
}

/** 실행 전 패키지 준비(prepareRun)에 넘기는 것 — 워커는 JS 다리(bridge.ts)의 raceStop·isStopSignal을 준다 */
export interface PrepareRunOptions extends RunPlanOptions {
  readonly code: string;
  readonly packages: readonly string[];
  /** 약속과 [정지]를 경주시킨다(bridge.api.raceStop) */
  raceStop(promise: Promise<unknown>): Promise<unknown>;
  isStopSignal(value: unknown): boolean;
  /** 앞의 받기를 기다리기 시작(true)·끝(false) — 워커는 상태 줄 글과 package-wait(phase 'start')를 보낸다 */
  onWait?(waiting: boolean, names: readonly string[]): void;
}

export interface PrepareRunResult {
  readonly plan: RunPackagePlan;
  /** 기다리는 동안 [정지]가 왔는지 — 그 실행의 받기는 차례가 와도 하지 않는다 */
  readonly stopped: boolean;
}

export interface PackageLoads {
  /** 받기(미리 받기·다시 불러오기). 줄을 서고, 받는 동안 받는 중으로 적힌다. */
  load(names: readonly string[]): Promise<void>;
  /**
   * 실행 전 패키지 준비(worker.ts run이 부른다): planRun → startNow면 곧바로 돌아오고, 아니면 loadForRun을 [정지]와 경주시켜 기다린다.
   * 앞의 받기(busy)를 기다리는 동안은 onWait(true/false). 받기가 실패하면 그 오류로 거부된다.
   */
  prepareRun(options: PrepareRunOptions): Promise<PrepareRunResult>;
  /** 실행 계획을 세운다(받기는 하지 않는다). */
  planRun(code: string, packages: readonly string[], options: RunPlanOptions): RunPackagePlan;
  /**
   * 실행 쪽 받기 — 줄을 서서 packages와 (fromImports면) 코드의 import 문이 부르는 패키지를 받는다. 받는 중으로는 plan.needed가 적힌다.
   * cancelled()가 참이면 차례가 와도 받지 않는다([정지]로 기다리기를 그만둔 실행 — 워커).
   */
  loadForRun(
    plan: RunPackagePlan,
    code: string,
    packages: readonly string[],
    options: { readonly fromImports: boolean; cancelled(): boolean },
  ): Promise<void>;
  /** 줄에 받기가 있는지(받는 중이거나 차례를 기다림) */
  busy(): boolean;
  /** 지금 받는 중인 패키지(lock 열쇠, 정렬) */
  loadingKeys(): string[];
  /** 지금 받는 중인 패키지의 import 이름(정렬) */
  loadingImports(): string[];
  /** lock 열쇠들의 import 이름(정렬 — 받기를 기다린다는 알림에 쓴다) */
  importsOf(keys: readonly string[]): string[];
  /** importNames가 모두 받는 중이 아니게 되면(다 받았거나 받기가 실패로 끝나면) 그때의 loadingImports()로 끝나는 약속 */
  whenLoaded(importNames: readonly string[]): Promise<string[]>;
}

/** pyodide 패키지 이름을 lock 열쇠 모양으로(Pyodide 314.0.7 canonicalizePackageName과 같다 — 소문자, -_. 묶음은 -) */
export function canonicalPackageName(name: string): string {
  return name.replace(/[-_.]+/gu, '-').toLowerCase();
}

interface PackageIndex {
  readonly packages: LockPackages;
  /** import 이름 → lock 열쇠(뒤에 나온 패키지가 이긴다 — Pyodide의 _import_name_to_package_name과 같은 차례) */
  readonly importToKey: ReadonlyMap<string, string>;
}

function buildIndex(packages: LockPackages): PackageIndex {
  const importToKey = new Map<string, string>();
  for (const key of Object.keys(packages)) {
    for (const importName of packages[key]?.imports ?? []) {
      importToKey.set(importName, key);
    }
  }
  return { packages, importToKey };
}

/**
 * roots(lock 열쇠)와 그 의존을 모은다 — 다 받은 패키지는 넣지 않고 그 의존도 따라가지 않는다(Pyodide addPackageToLoad와 같다).
 * lock 파일에 없는 열쇠는 unknown에 적는다.
 */
function closureOf(index: PackageIndex, roots: Iterable<string>, loaded: ReadonlySet<string>): { keys: Set<string>; unknown: string[] } {
  const keys = new Set<string>();
  const unknown: string[] = [];
  const stack = [...roots];
  while (stack.length > 0) {
    const key = canonicalPackageName(stack.pop() ?? '');
    if (key === '' || keys.has(key) || loaded.has(key)) {
      continue;
    }
    const entry = index.packages[key];
    if (!entry) {
      unknown.push(key);
      continue;
    }
    keys.add(key);
    for (const dependency of entry.depends ?? []) {
      stack.push(dependency);
    }
  }
  return { keys, unknown };
}

export function createPackageLoads(host: PackageLoadsHost): PackageLoads {
  const queue = createPackageQueue();
  /** 받기 번호 → 그 받기가 설치할 lock 열쇠 */
  const tickets = new Map<number, ReadonlySet<string>>();
  let nextTicket = 1;
  let index: PackageIndex | null | undefined;
  const waiters = new Set<{ readonly names: readonly string[]; resolve(value: string[]): void }>();
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  const pollMs = host.pollMs ?? 200;

  function packageIndex(): PackageIndex | null {
    if (index === undefined) {
      let packages: LockPackages | null = null;
      try {
        packages = host.lockPackages();
      } catch {
        packages = null;
      }
      index = packages ? buildIndex(packages) : null;
    }
    return index;
  }

  function loadedKeys(): Set<string> {
    return new Set(host.loadedNames().map(canonicalPackageName));
  }

  function loadingKeySet(): Set<string> {
    const loaded = loadedKeys();
    const keys = new Set<string>();
    for (const ticket of tickets.values()) {
      for (const key of ticket) {
        if (!loaded.has(key)) {
          keys.add(key);
        }
      }
    }
    return keys;
  }

  function importsOfKeys(keys: Iterable<string>): string[] {
    const found = packageIndex();
    const names = new Set<string>();
    for (const key of keys) {
      for (const importName of found?.packages[key]?.imports ?? []) {
        names.add(importName);
      }
    }
    return [...names].sort();
  }

  function loadingImports(): string[] {
    return importsOfKeys(loadingKeySet());
  }

  function settleWaiters(): void {
    if (waiters.size === 0) {
      stopPolling();
      return;
    }
    const current = loadingImports();
    const loading = new Set(current);
    for (const waiter of [...waiters]) {
      if (!waiter.names.some((name) => loading.has(name))) {
        waiters.delete(waiter);
        waiter.resolve(current);
      }
    }
    if (waiters.size === 0) {
      stopPolling();
    }
  }

  function stopPolling(): void {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function addTicket(keys: ReadonlySet<string>): number {
    const before = new Set(loadingImports());
    const id = nextTicket;
    nextTicket += 1;
    tickets.set(id, keys);
    const after = loadingImports();
    if (host.onLoadingGrew && after.some((name) => !before.has(name))) {
      host.onLoadingGrew(after);
    }
    return id;
  }

  function removeTicket(id: number): void {
    tickets.delete(id);
    settleWaiters();
  }

  function keysOf(names: readonly string[]): ReadonlySet<string> {
    const found = packageIndex();
    return found ? closureOf(found, names, loadedKeys()).keys : new Set<string>();
  }

  const api: PackageLoads = {
    async load(names) {
      const id = addTicket(keysOf(names));
      try {
        await queue.run(() => host.loadPackage(names));
      } finally {
        removeTicket(id);
      }
    },

    async prepareRun(options) {
      let plan: RunPackagePlan;
      try {
        plan = api.planRun(options.code, options.packages, options);
      } catch {
        // 계획을 세우지 못하면(import 분석 실패 등) 예전처럼 줄을 선다
        plan = { needed: [], busy: tickets.size > 0, startNow: false };
      }
      if (plan.startNow) {
        return { plan, stopped: false };
      }
      const waitNames = plan.busy ? [...new Set([...api.loadingKeys(), ...plan.needed])].sort() : [];
      if (plan.busy) {
        options.onWait?.(true, waitNames);
      }
      let cancelled = false;
      const loading = api.loadForRun(plan, options.code, options.packages, { fromImports: options.fromImports, cancelled: () => cancelled });
      try {
        const result = await options.raceStop(loading);
        if (options.isStopSignal(result)) {
          cancelled = true;
          loading.catch(() => undefined); // 이미 시작한 받기는 뒤에서 끝난다(다음 실행은 그것을 받는 중으로 본다)
          return { plan, stopped: true };
        }
        return { plan, stopped: false };
      } finally {
        if (plan.busy) {
          options.onWait?.(false, waitNames);
        }
      }
    },

    planRun(code, packages, options) {
      const busy = tickets.size > 0;
      const found = packageIndex();
      if (!found) {
        return { needed: [], busy, startNow: false };
      }
      const importRoots: string[] = [];
      if (options.fromImports) {
        for (const importName of host.findImports(code)) {
          const key = found.importToKey.get(importName);
          if (key !== undefined) {
            importRoots.push(key);
          }
        }
      }
      const loaded = loadedKeys();
      const fromPackages = closureOf(found, packages, loaded);
      const fromImports = closureOf(found, importRoots, loaded);
      const needed = [...new Set([...fromPackages.keys, ...fromImports.keys])].sort();
      const unknown = [...fromPackages.unknown, ...fromImports.unknown];
      // 예제가 적은 패키지(packages — 사이드카가 없으면 영상 처리 예제는 opencv-python)는 다른 받기(미리 받기)가 이미 받는 중이면 시작을 막지 않는다:
      // 코드가 그것을 쓰면 import 문지기가 그 줄에서 기다린다(판 1.2.1 — 판 1.2.0 적대적 검토 C5). 전에는 첫 에지 예제를 연 채 편집칸을
      // 시리얼 코드로 바꿔도 예제의 opencv-python이 실행 계획에 들어가 OpenCV를 다 받을 때까지 시작하지 않았다. 코드의 import가 부르는 패키지는
      // 예전처럼 시작 전에 기다린다(받을 것 없는 코드만 곧바로 — 결정 C92).
      const loading = loadingKeySet();
      const packagesCovered = [...fromPackages.keys].every((key) => loading.has(key));
      return {
        needed,
        busy,
        startNow: busy && options.canWait && unknown.length === 0 && fromImports.keys.size === 0 && packagesCovered,
      };
    },

    async loadForRun(plan, code, packages, options) {
      const id = addTicket(new Set(plan.needed));
      try {
        await queue.run(async () => {
          if (options.cancelled()) {
            return;
          }
          if (packages.length > 0) {
            await host.loadPackage(packages);
          }
          if (options.fromImports) {
            await host.loadPackagesFromImports(code);
          }
        });
      } finally {
        removeTicket(id);
      }
    },

    busy: () => tickets.size > 0,
    loadingKeys: () => [...loadingKeySet()].sort(),
    loadingImports,
    importsOf: (keys) => importsOfKeys(keys),

    whenLoaded(importNames) {
      const names = [...importNames];
      const current = loadingImports();
      const loading = new Set(current);
      if (!names.some((name) => loading.has(name))) {
        return Promise.resolve(current);
      }
      return new Promise<string[]>((resolve) => {
        waiters.add({ names, resolve });
        if (pollTimer === null) {
          pollTimer = setInterval(settleWaiters, pollMs);
        }
      });
    },
  };
  return api;
}
