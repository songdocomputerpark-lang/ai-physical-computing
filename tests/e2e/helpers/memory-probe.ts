/**
 * 브라우저 메모리를 **어디가 쓰는지** 가르는 개발용 탐침(판 1.1.0, PROGRESS 미해결 136 — 4단원 통합 화면을 오래 켜 두면 렌더러 메모리가 느는 까닭).
 *
 * 사이트 코드(워커 src/lab/runtime/worker.ts)를 고치지 않고 크롬 개발자 도구 규약(CDP)으로 잰다 — 배포물에 개발용 코드를 싣지 않으려는 것.
 *  · 대상마다(쪽 + 전용 워커 — 파이썬 두 벌): WebAssembly.Memory 크기 합과 WebAssembly 인스턴스 수(아래 "재는 법"),
 *    자바스크립트 힙(Runtime.getHeapUsage — usedSize·backingStorageSize(ArrayBuffer 바깥 저장)·embedderHeapUsedSize(Blink 쪽)).
 *  · 쪽만: DOM 수(Memory.getDOMCounters), 캔버스 수·면적.
 *  · 운영체제: 브라우저 프로세스 종류별 전용 메모리(SystemInfo.getProcessInfo → Windows Get-Process PrivateMemorySize64, 리눅스 /proc VmRSS).
 *  · 크롬 메모리 덤프(memoryInfraDump — 개발자 도구 Tracing의 memory-infra, 자세히): 렌더러 프로세스의 **할당기별** 크기
 *    (partition_alloc·malloc·v8 격리 공간마다·blink_gc·cc·skia·canvas…). 위 셋에 안 잡히는 증가가 어느 할당기인지 가른다.
 *
 * 재는 법(WebAssembly): 워커는 쪽 CDP 세션의 자동 붙기(Target.setAutoAttach, waitForDebuggerOnStart, flatten 없이)로 **시작하자마자 멈춰 세우고**
 * WebAssembly.Memory·instantiate·Instance를 감싸 만든 메모리를 기억하는 작은 스크립트(WASM_PATCH)를 먼저 넣은 뒤 다시 돌린다.
 * 그 뒤 표본마다 그 목록의 buffer.byteLength를 읽는다. 쪽은 같은 스크립트를 addInitScript로 넣는다.
 * (Runtime.queryObjects는 Pyodide 워커에서 90초 넘게 답이 없어 쓰지 않는다 — 2026-09-28 확인.)
 * 그래서 **재는 쪽을 열기 전에** install()을 부른다(같은 출처의 아무 쪽에서 — 자동 붙기가 그 쪽의 새 워커에 걸린다).
 *
 * 크로뮴 계열(Edge·Chrome·Chromium)에서만 된다.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import type { Browser, CDPSession, Page } from '@playwright/test';

/** 대상 하나(쪽 또는 워커)의 메모리 */
export interface TargetMemory {
  readonly kind: 'page' | 'worker';
  /** CDP 대상 id(워커는 붙은 차례를 가르는 데 쓴다) */
  readonly targetId: string;
  /** WebAssembly.Memory 버퍼 크기 합(바이트) */
  readonly wasmBytes: number;
  readonly wasmMemories: number;
  /** WebAssembly 인스턴스 수(파이썬 워커는 확장 모듈 .so마다 늘어 — OpenCV·numpy가 있는 영상처리 워커가 많다) */
  readonly wasmInstances: number;
  /** 자바스크립트 힙 사용(바이트) */
  readonly heapUsed: number;
  /** 자바스크립트 힙이 잡아 둔 전체(바이트 — 사용 + 빈 칸) */
  readonly heapTotal: number;
  /** ArrayBuffer 등 힙 바깥 저장(바이트, 없으면 0) */
  readonly backing: number;
  /** 브라우저 엔진(Blink) 쪽 힙 — DOM 노드 등(Oilpan, 바이트, 모르면 0) */
  readonly embedder: number;
}

export interface ProcessMemory {
  /** 렌더러 가운데 가장 큰 것(MB) — 이 탭(쪽 + 파이썬 워커 두 벌 + WebAssembly) */
  readonly rendererMb: number;
  /** 그 렌더러의 프로세스 번호(메모리 덤프에서 이 프로세스를 고를 때) */
  readonly rendererPid: number;
  /** 종류별 합(MB): renderer·gpu-process·browser·utility … */
  readonly byType: Record<string, number>;
  readonly totalMb: number;
}

export interface MemorySample {
  readonly at: number;
  readonly targets: readonly TargetMemory[];
  readonly process: ProcessMemory | null;
  readonly dom: { documents: number; nodes: number; listeners: number } | null;
  readonly canvases: { count: number; pixels: number } | null;
}

/** WebAssembly 메모리를 기억하는 스크립트(워커 시작 전·쪽 시작 전에 넣는다) — 여러 번 넣어도 한 번만 감싼다 */
export const WASM_PATCH = `(() => {
  if (globalThis.__apcWasm) return 'already';
  const memories = [];
  let instances = 0;
  const record = (value) => { if (value instanceof WebAssembly.Memory && !memories.includes(value)) memories.push(value); };
  const scan = (object) => { if (object && typeof object === 'object') { for (const value of Object.values(object)) record(value); } };
  const scanImports = (imports) => { if (imports && typeof imports === 'object') { for (const ns of Object.values(imports)) scan(ns); } };
  const OriginalMemory = WebAssembly.Memory;
  const PatchedMemory = function (descriptor) { const memory = new OriginalMemory(descriptor); record(memory); return memory; };
  PatchedMemory.prototype = OriginalMemory.prototype;
  WebAssembly.Memory = PatchedMemory;
  const instantiate = WebAssembly.instantiate;
  WebAssembly.instantiate = async function (source, imports) { scanImports(imports); const result = await instantiate.call(this, source, imports); instances += 1; scan((result.instance ?? result).exports); return result; };
  if (WebAssembly.instantiateStreaming) { const streaming = WebAssembly.instantiateStreaming; WebAssembly.instantiateStreaming = async function (source, imports) { scanImports(imports); const result = await streaming.call(this, source, imports); instances += 1; scan(result.instance.exports); return result; }; }
  const OriginalInstance = WebAssembly.Instance;
  const PatchedInstance = function (module, imports) { scanImports(imports); const instance = new OriginalInstance(module, imports); instances += 1; scan(instance.exports); return instance; };
  PatchedInstance.prototype = OriginalInstance.prototype;
  WebAssembly.Instance = PatchedInstance;
  globalThis.__apcWasm = { memories, get instances() { return instances; } };
  return 'patched';
})()`;

/** 기억한 WebAssembly 메모리를 읽는 식 */
const WASM_READ = `(() => { const w = globalThis.__apcWasm; return w ? { sizes: w.memories.map((memory) => memory.buffer.byteLength), instances: w.instances } : { sizes: [], instances: 0 }; })()`;

interface Pending {
  resolve(value: unknown): void;
  reject(error: Error): void;
}

type Sender = <T>(method: string, params?: Record<string, unknown>) => Promise<T>;

/** 한 대상에서 WebAssembly 메모리·힙을 잰다 */
async function measureTarget(send: Sender, kind: 'page' | 'worker', targetId: string): Promise<TargetMemory> {
  const wasm = await send<{ result: { value?: { sizes: number[]; instances: number } } }>('Runtime.evaluate', { expression: WASM_READ, returnByValue: true })
    .then((reply) => reply.result.value ?? { sizes: [], instances: 0 })
    .catch(() => ({ sizes: [] as number[], instances: 0 }));
  const heap = await send<{ usedSize: number; totalSize: number; backingStorageSize?: number; embedderHeapUsedSize?: number }>('Runtime.getHeapUsage').catch(() => ({
    usedSize: 0,
    totalSize: 0,
    backingStorageSize: 0,
    embedderHeapUsedSize: 0,
  }));
  return {
    kind,
    targetId,
    wasmBytes: wasm.sizes.reduce((sum, value) => sum + value, 0),
    wasmMemories: wasm.sizes.length,
    wasmInstances: wasm.instances,
    heapUsed: heap.usedSize,
    heapTotal: heap.totalSize,
    backing: heap.backingStorageSize ?? 0,
    embedder: heap.embedderHeapUsedSize ?? 0,
  };
}

/** 운영체제가 본 브라우저 프로세스 메모리(tests/e2e/unit4.spec.ts processMemory와 같은 길) */
export async function processMemory(browser: Browser): Promise<ProcessMemory | null> {
  if (browser.browserType().name() !== 'chromium') {
    return null;
  }
  let processes: { type: string; id: number }[];
  try {
    const session = await browser.newBrowserCDPSession();
    try {
      const info = (await session.send('SystemInfo.getProcessInfo')) as unknown as { processInfo: { type: string; id: number }[] };
      processes = info.processInfo;
    } finally {
      await session.detach().catch(() => undefined);
    }
  } catch {
    return null;
  }
  const bytesByPid = new Map<number, number>();
  const pids = processes.map((item) => item.id).filter((id) => Number.isInteger(id) && id > 0);
  if (pids.length === 0) {
    return null;
  }
  try {
    if (process.platform === 'win32') {
      const output = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', `Get-Process -Id ${pids.join(',')} -ErrorAction SilentlyContinue | Select-Object Id,PrivateMemorySize64 | ConvertTo-Json -Compress`],
        { encoding: 'utf8', timeout: 20_000 },
      ).trim();
      const parsed = JSON.parse(output || '[]') as { Id: number; PrivateMemorySize64: number } | { Id: number; PrivateMemorySize64: number }[];
      for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
        bytesByPid.set(item.Id, item.PrivateMemorySize64);
      }
    } else {
      for (const pid of pids) {
        try {
          const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
          const match = /^VmRSS:\s+(\d+)\s+kB/mu.exec(status);
          if (match) {
            bytesByPid.set(pid, Number(match[1]) * 1024);
          }
        } catch {
          // 이미 끝난 프로세스
        }
      }
    }
  } catch {
    return null;
  }
  const byType: Record<string, number> = {};
  let rendererMb = 0;
  let rendererPid = 0;
  let totalMb = 0;
  for (const item of processes) {
    const mb = (bytesByPid.get(item.id) ?? 0) / (1024 * 1024);
    byType[item.type] = (byType[item.type] ?? 0) + mb;
    totalMb += mb;
    if (item.type === 'renderer' && mb > rendererMb) {
      rendererMb = mb;
      rendererPid = item.id;
    }
  }
  return { rendererMb, rendererPid, byType, totalMb };
}

/** GPU 프로세스 합(MB) — 종류 이름이 판마다 달라(gpu-process·GPU) 이름에 gpu가 든 것을 모두 더한다 */
export function gpuMb(process: ProcessMemory | null | undefined): number {
  if (!process) {
    return 0;
  }
  return Object.entries(process.byType)
    .filter(([type]) => /gpu/iu.test(type))
    .reduce((sum, [, mb]) => sum + mb, 0);
}

/** 크롬 메모리 덤프(memory-infra) 한 번 — 프로세스 하나의 할당기별 크기 */
export interface AllocatorDump {
  readonly pid: number;
  /** 크롬이 본 이 프로세스의 전용 메모리(private footprint, 바이트 — 모르면 0) */
  readonly footprint: number;
  /** 할당기 덤프 이름 → size(바이트 — 잡아 둔 크기). 부모(예: partition_alloc)와 자식(partition_alloc/partitions/buffer)이 함께 들어 있다 — 차이를 볼 때만 쓴다 */
  readonly sizes: Readonly<Record<string, number>>;
  /** 할당기 덤프 이름 → allocated_objects_size(바이트 — 그 안에서 살아 있는 객체 크기, 적힌 것만) */
  readonly used: Readonly<Record<string, number>>;
}

interface TraceEvent {
  readonly ph?: string;
  readonly pid?: number;
  readonly args?: {
    readonly dumps?: {
      readonly allocators?: Record<string, { attrs?: Record<string, { value?: string }> }>;
      readonly process_totals?: Record<string, string>;
    };
  };
}

/** 16진 글자(크롬 덤프의 숫자 모양)를 수로 */
function hexValue(value: unknown): number {
  return typeof value === 'string' && /^[0-9a-f]+$/iu.test(value) ? Number.parseInt(value, 16) : 0;
}

/**
 * 크롬 메모리 덤프를 한 번 떠서 프로세스 pid의 할당기별 크기를 돌려준다(개발자 도구 Tracing — memory-infra 범주만, 자동 덤프 없이
 * requestMemoryDump 한 번. deterministic이라 덤프 전에 가비지 수집을 한다). 크로뮴 계열만, 실패하면 null. 수 초 걸린다.
 */
export async function memoryInfraDump(browser: Browser, pid: number, timeoutMs = 120_000): Promise<AllocatorDump | null> {
  if (browser.browserType().name() !== 'chromium' || !(pid > 0)) {
    return null;
  }
  const session = await browser.newBrowserCDPSession();
  const events: TraceEvent[] = [];
  try {
    const complete = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('메모리 덤프가 끝나지 않았어요')), timeoutMs);
      session.on('Tracing.tracingComplete' as never, (() => {
        clearTimeout(timer);
        resolve();
      }) as never);
    });
    session.on('Tracing.dataCollected' as never, ((event: { value: TraceEvent[] }) => {
      events.push(...event.value);
    }) as never);
    await session.send('Tracing.start' as never, {
      transferMode: 'ReportEvents',
      traceConfig: { includedCategories: ['disabled-by-default-memory-infra'], memoryDumpConfig: { triggers: [] } },
    } as never);
    const reply = (await session.send('Tracing.requestMemoryDump' as never, { deterministic: true, levelOfDetail: 'detailed' } as never)) as unknown as { success: boolean };
    await session.send('Tracing.end' as never);
    await complete;
    if (!reply.success) {
      return null;
    }
  } catch {
    return null;
  } finally {
    await session.detach().catch(() => undefined);
  }
  const sizes: Record<string, number> = {};
  const used: Record<string, number> = {};
  let footprint = 0;
  for (const event of events) {
    if (event.ph !== 'v' || event.pid !== pid || !event.args?.dumps) {
      continue;
    }
    const dumps = event.args.dumps;
    footprint = Math.max(footprint, hexValue(dumps.process_totals?.['private_footprint_bytes']));
    for (const [name, dump] of Object.entries(dumps.allocators ?? {})) {
      const size = hexValue(dump.attrs?.['size']?.value);
      if (size > 0) {
        sizes[name] = size;
      }
      const objects = hexValue(dump.attrs?.['allocated_objects_size']?.value);
      if (objects > 0) {
        used[name] = objects;
      }
    }
  }
  return Object.keys(sizes).length > 0 ? { pid, footprint, sizes, used } : null;
}

/** 할당기 이름의 맨 앞 칸(partition_alloc·malloc·v8·blink_gc·cc·skia…)마다 크기 — 뿌리 덤프가 있으면 그 값, 없으면 맨 끝 덤프(자식 없는 것)의 합 */
export function allocatorGroups(dump: AllocatorDump): Record<string, number> {
  const names = Object.keys(dump.sizes);
  const groups: Record<string, number> = {};
  for (const name of names) {
    const top = name.split('/')[0]!;
    if (name === top || dump.sizes[top] !== undefined) {
      continue;
    }
    const isLeaf = !names.some((other) => other.startsWith(`${name}/`));
    if (isLeaf) {
      groups[top] = (groups[top] ?? 0) + dump.sizes[name]!;
    }
  }
  for (const name of names) {
    if (!name.includes('/')) {
      groups[name] = dump.sizes[name]!;
    }
  }
  return groups;
}

/** 두 덤프의 차이 — 맨 앞 칸 묶음 + 늘거나 준 크기가 큰 차례로 top개(이름 전체) */
export function diffAllocatorDumps(before: AllocatorDump, after: AllocatorDump, top = 20): string[] {
  const mb = (value: number) => (value / MB).toFixed(1);
  const signed = (value: number) => `${value >= 0 ? '+' : ''}${mb(value)}`;
  const lines: string[] = [];
  lines.push(`크롬이 본 전용 메모리(private footprint): ${mb(before.footprint)} → ${mb(after.footprint)}MB (${signed(after.footprint - before.footprint)})`);
  const groupsBefore = allocatorGroups(before);
  const groupsAfter = allocatorGroups(after);
  const groupNames = [...new Set([...Object.keys(groupsBefore), ...Object.keys(groupsAfter)])];
  const groupRows = groupNames
    .map((name) => ({ name, from: groupsBefore[name] ?? 0, to: groupsAfter[name] ?? 0 }))
    .sort((a, b) => b.to - b.from - (a.to - a.from) || b.to - a.to);
  lines.push('맨 앞 칸 묶음(앞 → 뒤 · 차이):');
  for (const row of groupRows) {
    if (row.to < MB && Math.abs(row.to - row.from) < MB) {
      continue;
    }
    lines.push(`  ${row.name}: ${mb(row.from)} → ${mb(row.to)}MB (${signed(row.to - row.from)})`);
  }
  const names = [...new Set([...Object.keys(before.sizes), ...Object.keys(after.sizes)])];
  const rows = names
    .map((name) => ({ name, from: before.sizes[name] ?? 0, to: after.sizes[name] ?? 0 }))
    .sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from))
    .slice(0, top);
  lines.push(`차이가 큰 할당기 ${rows.length}개(이름 전체 — 부모와 자식이 함께 보일 수 있다):`);
  for (const row of rows) {
    lines.push(`  ${row.name}: ${mb(row.from)} → ${mb(row.to)}MB (${signed(row.to - row.from)})`);
  }
  // Blink 가비지 수집 힙(Oilpan)은 공간마다 "잡아 둔 크기"와 "살아 있는 객체 크기"를 함께 — 둘의 차이가 빈 칸(조각남)이다
  const blinkSpaces = names.filter((name) => /^blink_gc\/main\/heap(?:\/[^/]+)?$/u.test(name) || name === 'blink_gc/main/allocated_objects');
  if (blinkSpaces.length > 0) {
    lines.push('Blink 힙(Oilpan, 쪽 스레드) 공간별 잡아 둔 크기 / 살아 있는 객체(적힌 것만):');
    for (const name of blinkSpaces.sort()) {
      const cell = (dump: AllocatorDump) => `${mb(dump.sizes[name] ?? 0)}${dump.used[name] !== undefined ? ` / ${mb(dump.used[name]!)}` : ''}`;
      lines.push(`  ${name}: ${cell(before)} → ${cell(after)}MB`);
    }
  }
  return lines;
}

/**
 * 쪽 하나(와 그 쪽의 전용 워커)를 재는 탐침. install()을 **재는 쪽을 열기 전에** 부르고(같은 출처의 아무 쪽에서), 쪽을 연 뒤
 * sample()을 부를 때마다 한 번 잰다. 끝나면 stop().
 */
export class MemoryProbe {
  readonly #page: Page;
  readonly #browser: Browser;
  #session: CDPSession | null = null;
  /** 붙은 전용 워커: 세션 id → 대상 id */
  readonly #workers = new Map<string, string>();
  readonly #pending = new Map<number, Pending>();
  #nextId = 1;

  constructor(page: Page, browser: Browser) {
    this.#page = page;
    this.#browser = browser;
  }

  #sendChild<T>(sessionId: string, method: string, params: Record<string, unknown> = {}): Promise<T> {
    const session = this.#session;
    if (session === null) {
      return Promise.reject(new Error('install()을 먼저 불러요.'));
    }
    const id = this.#nextId++;
    return new Promise<T>((resolve, reject) => {
      this.#pending.set(id, { resolve: (value) => resolve(value as T), reject });
      session
        .send('Target.sendMessageToTarget' as never, { sessionId, message: JSON.stringify({ id, method, params }) } as never)
        .catch((error: unknown) => {
          this.#pending.delete(id);
          reject(error instanceof Error ? error : new Error(String(error)));
        });
      setTimeout(() => {
        const pending = this.#pending.get(id);
        if (pending !== undefined) {
          this.#pending.delete(id);
          pending.reject(new Error(`CDP ${method} 응답이 없어요`));
        }
      }, 20_000);
    });
  }

  async install(): Promise<void> {
    await this.#page.addInitScript(WASM_PATCH);
    const session = await this.#page.context().newCDPSession(this.#page);
    this.#session = session;
    session.on('Target.receivedMessageFromTarget' as never, ((event: { sessionId: string; message: string }) => {
      let message: { id?: number; result?: unknown; error?: { message?: string } };
      try {
        message = JSON.parse(event.message) as typeof message;
      } catch {
        return;
      }
      if (typeof message.id !== 'number') {
        return;
      }
      const pending = this.#pending.get(message.id);
      if (pending === undefined) {
        return;
      }
      this.#pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message ?? 'CDP 오류'));
      } else {
        pending.resolve(message.result);
      }
    }) as never);
    session.on('Target.attachedToTarget' as never, ((event: { sessionId: string; targetInfo: { targetId: string; type: string } }) => {
      void (async () => {
        if (event.targetInfo.type === 'worker') {
          this.#workers.set(event.sessionId, event.targetInfo.targetId);
          await this.#sendChild(event.sessionId, 'Runtime.evaluate', { expression: WASM_PATCH, returnByValue: true }).catch(() => undefined);
        }
        // 멈춰 세운 대상은 모두 다시 돌린다(서비스 워커도 — 안 그러면 쪽이 멈춘다)
        await this.#sendChild(event.sessionId, 'Runtime.runIfWaitingForDebugger').catch(() => undefined);
      })();
    }) as never);
    session.on('Target.detachedFromTarget' as never, ((event: { sessionId: string }) => {
      this.#workers.delete(event.sessionId);
    }) as never);
    await session.send('Target.setAutoAttach' as never, { autoAttach: true, waitForDebuggerOnStart: true, flatten: false } as never);
  }

  /** 지금 붙어 있는 전용 워커 수 */
  get workerCount(): number {
    return this.#workers.size;
  }

  async sample(): Promise<MemorySample> {
    const session = this.#session;
    if (session === null) {
      throw new Error('install()을 먼저 불러요.');
    }
    const at = Date.now();
    const pageSend: Sender = <T>(method: string, params: Record<string, unknown> = {}) => session.send(method as never, params as never) as Promise<T>;
    const targets: TargetMemory[] = [await measureTarget(pageSend, 'page', 'page')];
    for (const [sessionId, targetId] of [...this.#workers.entries()]) {
      try {
        targets.push(await measureTarget(<T>(method: string, params?: Record<string, unknown>) => this.#sendChild<T>(sessionId, method, params), 'worker', targetId));
      } catch {
        // 막 끝난 워커(정지 2단계로 다시 뜨는 중) — 이번에는 건너뛴다
      }
    }
    const dom = await pageSend<{ documents: number; nodes: number; jsEventListeners: number }>('Memory.getDOMCounters')
      .then((value) => ({ documents: value.documents, nodes: value.nodes, listeners: value.jsEventListeners }))
      .catch(() => null);
    const canvases = await this.#page
      .evaluate(() => {
        const list = [...document.querySelectorAll('canvas')];
        return { count: list.length, pixels: list.reduce((sum, canvas) => sum + canvas.width * canvas.height, 0) };
      })
      .catch(() => null);
    return { at, targets, process: await processMemory(this.#browser), dom, canvases };
  }

  async stop(): Promise<void> {
    await this.#session?.detach().catch(() => undefined);
    this.#session = null;
    this.#workers.clear();
  }
}

const MB = 1024 * 1024;

/** 워커를 영상처리 쪽(인스턴스가 많은 쪽 — OpenCV·numpy) 먼저로 늘어세운다 */
export function workersByRole(sample: MemorySample): TargetMemory[] {
  return sample.targets.filter((item) => item.kind === 'worker').sort((a, b) => b.wasmInstances - a.wasmInstances || b.wasmBytes - a.wasmBytes);
}

/** 한 표본을 한 줄로(보고서·콘솔) */
export function formatMemorySample(sample: MemorySample, startedAt: number): string {
  const seconds = Math.round((sample.at - startedAt) / 1000);
  const page = sample.targets.find((item) => item.kind === 'page');
  const mb = (value: number) => (value / MB).toFixed(1);
  const parts = [
    `${seconds}초`,
    sample.process ? `렌더러 ${sample.process.rendererMb.toFixed(0)}MB · GPU ${gpuMb(sample.process).toFixed(0)}MB · 전체 ${sample.process.totalMb.toFixed(0)}MB` : '프로세스 —',
    page ? `쪽 힙 ${mb(page.heapUsed)}/${mb(page.heapTotal)} · 바깥 ${mb(page.backing)} · Blink ${mb(page.embedder)} · wasm ${mb(page.wasmBytes)}(${page.wasmMemories}개)` : '쪽 —',
    ...workersByRole(sample).map((item, index) => `워커${index + 1}(인스턴스 ${item.wasmInstances}) wasm ${mb(item.wasmBytes)} · 힙 ${mb(item.heapUsed)}/${mb(item.heapTotal)} · 바깥 ${mb(item.backing)}`),
    sample.dom ? `DOM ${sample.dom.nodes}·리스너 ${sample.dom.listeners}` : '',
    sample.canvases ? `캔버스 ${sample.canvases.count}개 ${(sample.canvases.pixels / 1e6).toFixed(1)}MP` : '',
  ];
  return parts.filter((part) => part !== '').join(' | ');
}
