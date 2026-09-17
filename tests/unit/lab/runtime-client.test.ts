// 파이썬 실행기 화면 쪽 API(src/lab/runtime/client.ts) 단위 테스트 — 가짜 워커로 상태 흐름·정지 1·2단계·대기 지점 답을 검사한다.
// 실제 Pyodide는 tests/unit/lab/pyodide-node.test.ts(Node)와 tests/e2e/lab-runtime.spec.ts(브라우저)에서 돈다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  KILLED_NOTICE,
  LIMITED_MODE_NOTICE,
  PythonRuntime,
  type RuntimeNotice,
  type RuntimeRequest,
  type WorkerLike,
} from '../../../src/lab/runtime/client.ts';
import { STOP_GRACE_MS } from '../../../src/lab/runtime/config.ts';
import type { FromWorkerMessage, RuntimeInfo, RuntimeState, ToWorkerMessage } from '../../../src/lab/runtime/protocol.ts';

const INFO: RuntimeInfo = {
  pyodideVersion: '314.0.7',
  pythonVersion: '3.14.2',
  jspi: true,
  limited: false,
  indexUrl: 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/',
  interruptBuffer: false,
};

type Behavior = (worker: FakeWorker, message: ToWorkerMessage) => void;

/** 워커 흉내: 화면이 보낸 메시지를 모으고, 시나리오(behavior)에 따라 답을 보낸다. */
class FakeWorker implements WorkerLike {
  readonly sent: ToWorkerMessage[] = [];
  terminated = false;
  private readonly listeners = new Map<string, ((event: never) => void)[]>();

  constructor(private readonly behavior: Behavior) {}

  postMessage(message: unknown): void {
    const typed = message as ToWorkerMessage;
    this.sent.push(typed);
    this.behavior(this, typed);
  }

  terminate(): void {
    this.terminated = true;
  }

  addEventListener(type: string, listener: (event: never) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  /** 워커가 화면으로 보내는 메시지 */
  emit(message: FromWorkerMessage): void {
    for (const listener of this.listeners.get('message') ?? []) {
      (listener as (event: { data: unknown }) => void)({ data: message });
    }
  }

  emitError(message: string): void {
    for (const listener of this.listeners.get('error') ?? []) {
      (listener as (event: { message?: string }) => void)({ message });
    }
  }

  last<T extends ToWorkerMessage['type']>(type: T): Extract<ToWorkerMessage, { type: T }> | undefined {
    return [...this.sent].reverse().find((message): message is Extract<ToWorkerMessage, { type: T }> => message.type === type);
  }
}

/** 기본 시나리오: load → ready, run → 코드에 따라 stdout·done, stop → 협조 정지(sleep) 또는 무시(busy) */
function standardBehavior(info: RuntimeInfo = INFO): Behavior {
  let activeRunId: number | null = null;
  let stopsCooperatively = true;
  return (worker, message) => {
    if (message.type === 'load') {
      worker.emit({ type: 'progress', stage: 'core', message: '파이썬 엔진을 받는 중…' });
      worker.emit({ type: 'ready', info });
      return;
    }
    if (message.type === 'run') {
      activeRunId = message.runId;
      if (message.code === 'print') {
        worker.emit({ type: 'stdout', text: '안녕\n' });
        worker.emit({ type: 'done', runId: message.runId, outcome: 'ok', loadedPackages: [] });
        activeRunId = null;
      } else if (message.code === 'numpy') {
        worker.emit({ type: 'done', runId: message.runId, outcome: 'ok', loadedPackages: ['numpy'] });
        activeRunId = null;
      } else if (message.code === 'error') {
        worker.emit({
          type: 'done',
          runId: message.runId,
          outcome: 'error',
          error: { type: 'NameError', message: "NameError: name 'x' is not defined", traceback: 'Traceback…' },
          loadedPackages: [],
        });
        activeRunId = null;
      } else if (message.code === 'input') {
        worker.emit({ type: 'request', requestId: 5, kind: 'input', payload: { prompt: '이름: ' } });
      } else if (message.code === 'busy') {
        stopsCooperatively = false;
      } else {
        stopsCooperatively = true;
      }
      return;
    }
    if (message.type === 'stop' && activeRunId !== null && stopsCooperatively) {
      const runId = activeRunId;
      activeRunId = null;
      queueMicrotask(() => worker.emit({ type: 'done', runId, outcome: 'stopped', loadedPackages: [] }));
      return;
    }
    if (message.type === 'reply' && activeRunId !== null && message.requestId === 5) {
      const runId = activeRunId;
      activeRunId = null;
      worker.emit({ type: 'stdout', text: `안녕, ${String(message.value)}\n` });
      worker.emit({ type: 'done', runId, outcome: 'ok', loadedPackages: [] });
      return;
    }
    if (message.type === 'write-file') {
      worker.emit({ type: 'task-result', taskId: message.taskId, ok: message.path !== '/bad', value: message.path, error: '파일을 넣지 못했어요' });
      return;
    }
    if (message.type === 'load-packages') {
      worker.emit({ type: 'task-result', taskId: message.taskId, ok: true, value: [...message.names] });
    }
  };
}

function makeRuntime(behavior: Behavior = standardBehavior(), options: { stopGraceMs?: number; forceLimited?: boolean; labId?: string } = {}) {
  const workers: FakeWorker[] = [];
  const runtime = new PythonRuntime({
    createWorker: () => {
      const worker = new FakeWorker(behavior);
      workers.push(worker);
      return worker;
    },
    indexUrls: ['https://cdn.example.test/pyodide/'],
    stopGraceMs: options.stopGraceMs ?? STOP_GRACE_MS,
    forceLimited: options.forceLimited,
    ...(options.labId ? { labId: options.labId } : {}),
  });
  const states: RuntimeState[] = [];
  const notices: RuntimeNotice[] = [];
  runtime.on('state', ({ state }) => states.push(state));
  runtime.on('notice', (notice) => notices.push(notice));
  return { runtime, workers, states, notices };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('준비(load)', () => {
  it('워커를 하나 띄워 load 메시지를 보내고, ready가 오면 idle이 된다. 다시 불러도 워커를 더 만들지 않는다', async () => {
    const { runtime, workers, states } = makeRuntime();
    expect(runtime.state).toBe('unloaded');
    const progress: string[] = [];
    runtime.on('progress', ({ message }) => progress.push(message));
    const info = await runtime.load();
    expect(info).toEqual(INFO);
    expect(runtime.info).toEqual(INFO);
    expect(workers).toHaveLength(1);
    expect(workers[0].sent[0]).toEqual({ type: 'load', indexUrls: ['https://cdn.example.test/pyodide/'], packages: [], forceLimited: false });
    expect(progress).toEqual(['파이썬 엔진을 받는 중…']);
    expect(states).toEqual(['loading', 'idle']);
    await runtime.load();
    expect(workers).toHaveLength(1);
  });

  it('실습실 id를 주면 load 메시지에 담아 워커가 그 실습실의 흉내 모듈만 넣게 한다(P3-01)', async () => {
    const { runtime, workers } = makeRuntime(standardBehavior(), { labId: 'esp32' });
    await runtime.load();
    expect(workers[0].sent[0]).toEqual({ type: 'load', indexUrls: ['https://cdn.example.test/pyodide/'], packages: [], forceLimited: false, labId: 'esp32' });
  });

  it('제한 모드로 준비되면 한국어 안내를 알린다', async () => {
    const { runtime, notices, workers } = makeRuntime(standardBehavior({ ...INFO, jspi: false, limited: true }), { forceLimited: true });
    await runtime.load();
    expect(workers[0].last('load')?.forceLimited).toBe(true);
    expect(notices).toEqual([{ level: 'warn', text: LIMITED_MODE_NOTICE }]);
  });

  it('Pyodide를 받지 못하면 failed가 되고 load()는 거부되며, 다시 load()하면 새 워커로 다시 시도한다', async () => {
    let attempts = 0;
    const { runtime, workers, states, notices } = makeRuntime((worker, message) => {
      if (message.type !== 'load') return;
      attempts += 1;
      if (attempts === 1) {
        worker.emit({ type: 'load-failed', message: '파이썬 엔진(Pyodide)을 받지 못했어요.', details: ['https://cdn.example.test/pyodide/: 404'] });
      } else {
        worker.emit({ type: 'ready', info: INFO });
      }
    });
    await expect(runtime.load()).rejects.toThrow('받지 못했어요');
    expect(runtime.state).toBe('failed');
    expect(notices[0].level).toBe('error');
    expect(notices[0].text).toContain('404');
    await runtime.load();
    expect(workers).toHaveLength(2);
    expect(states).toEqual(['loading', 'failed', 'loading', 'idle']);
  });

  it('워커 스크립트가 시작하지 못하면(error 이벤트) failed가 된다', async () => {
    const { runtime, workers } = makeRuntime((worker, message) => {
      if (message.type === 'load') worker.emitError('Failed to fetch');
    });
    await expect(runtime.load()).rejects.toThrow('Failed to fetch');
    expect(runtime.state).toBe('failed');
    expect(workers).toHaveLength(1);
  });
});

describe('실행(run)과 결과', () => {
  it('print 코드: run 메시지(runId·main.py)를 보내고 stdout 이벤트와 결과(ok)를 받는다', async () => {
    const { runtime, workers, states } = makeRuntime();
    const outputs: string[] = [];
    runtime.on('stdout', (text) => outputs.push(text));
    const result = await runtime.run('print');
    expect(workers[0].last('run')).toEqual({ type: 'run', runId: 1, code: 'print', filename: 'main.py', packages: [] });
    expect(outputs).toEqual(['안녕\n']);
    expect(result.outcome).toBe('ok');
    expect(result.runId).toBe(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.stopMs).toBeUndefined();
    expect(states).toEqual(['loading', 'idle', 'running', 'idle']);
    const second = await runtime.run('print', { filename: 'ex.py', packages: ['opencv-python'] });
    expect(second.runId).toBe(2);
    expect(workers[0].last('run')?.filename).toBe('ex.py');
    expect(workers[0].last('run')?.packages).toEqual(['opencv-python']);
  });

  it('오류로 끝나면 결과에 예외 정보가 들어가고, 불러온 패키지 이름은 기억한다', async () => {
    const { runtime } = makeRuntime();
    const failed = await runtime.run('error');
    expect(failed.outcome).toBe('error');
    expect(failed.error?.type).toBe('NameError');
    await runtime.run('numpy');
    expect(runtime.loadedPackages).toEqual(['numpy']);
  });

  it('실행 중에 또 실행하면 한국어 오류를 낸다', async () => {
    const { runtime } = makeRuntime();
    await runtime.load();
    const first = runtime.run('sleep');
    await expect(runtime.run('print')).rejects.toThrow('이미 실행 중');
    await runtime.stop();
    await first;
  });
});

describe('정지', () => {
  it('실행 중이 아니면 idle을 돌려준다', async () => {
    const { runtime } = makeRuntime();
    await expect(runtime.stop()).resolves.toBe('idle');
  });

  it('1단계: stop 메시지를 보내고 워커가 stopped로 끝내면 결과에 정지까지 걸린 시간이 들어간다', async () => {
    const { runtime, workers, states } = makeRuntime();
    const done = runtime.run('sleep');
    await Promise.resolve();
    expect(runtime.state).toBe('running');
    await expect(runtime.stop()).resolves.toBe('stopped');
    expect(workers[0].last('stop')).toEqual({ type: 'stop' });
    const result = await done;
    expect(result.outcome).toBe('stopped');
    expect(result.stopMs).toBeGreaterThanOrEqual(0);
    expect(workers[0].terminated).toBe(false);
    expect(states).toEqual(['loading', 'idle', 'running', 'stopping', 'idle']);
  });

  it('2단계: 유예 시간 안에 멈추지 않으면 워커를 끝내고 새 워커를 띄우며, 결과는 killed·안내는 KILLED_NOTICE다', async () => {
    vi.useFakeTimers();
    const { runtime, workers, states, notices } = makeRuntime();
    await runtime.run('numpy'); // 패키지를 기억해 두었다가 새 워커에 다시 요청하는지 보려고
    const done = runtime.run('busy');
    await Promise.resolve();
    const stopping = runtime.stop();
    expect(runtime.state).toBe('stopping');
    await vi.advanceTimersByTimeAsync(STOP_GRACE_MS - 1);
    expect(workers[0].terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(workers[0].terminated).toBe(true);
    await expect(stopping).resolves.toBe('restarted');
    const result = await done;
    expect(result.outcome).toBe('killed');
    expect(result.stopMs).toBeGreaterThanOrEqual(STOP_GRACE_MS);
    expect(notices.map((notice) => notice.text)).toContain(KILLED_NOTICE);
    expect(workers).toHaveLength(2);
    expect(workers[1].sent[0]).toEqual({ type: 'load', indexUrls: ['https://cdn.example.test/pyodide/'], packages: ['numpy'], forceLimited: false });
    expect(runtime.state).toBe('idle');
    expect(states).toEqual(['loading', 'idle', 'running', 'idle', 'running', 'stopping', 'loading', 'idle']);
    // 다시 실행할 수 있다.
    const again = await runtime.run('print');
    expect(again.outcome).toBe('ok');
    expect(workers[1].last('run')?.runId).toBe(3);
  });

  it('끝낸 워커에서 늦게 온 메시지는 무시한다', async () => {
    vi.useFakeTimers();
    const { runtime, workers } = makeRuntime();
    const done = runtime.run('busy');
    await Promise.resolve();
    const stopping = runtime.stop();
    await vi.advanceTimersByTimeAsync(STOP_GRACE_MS);
    await stopping;
    const before = runtime.state;
    workers[0].emit({ type: 'done', runId: 1, outcome: 'ok', loadedPackages: [] });
    workers[0].emit({ type: 'stdout', text: '늦은 출력' });
    expect(runtime.state).toBe(before);
    expect((await done).outcome).toBe('killed');
  });
});

describe('대기 지점(request)과 값 전달', () => {
  it('input 요청이 이벤트로 오고, reply()로 답하면 워커에 reply 메시지가 가며 두 번 답하면 무시한다', async () => {
    const { runtime, workers } = makeRuntime();
    const requests: RuntimeRequest[] = [];
    runtime.on('request', (request) => requests.push(request));
    const outputs: string[] = [];
    runtime.on('stdout', (text) => outputs.push(text));
    const done = runtime.run('input');
    await Promise.resolve();
    expect(requests).toHaveLength(1);
    expect(requests[0].kind).toBe('input');
    expect(requests[0].payload).toEqual({ prompt: '이름: ' });
    requests[0].reply('민수');
    requests[0].fail('무시됨');
    expect(workers[0].sent.filter((message) => message.type === 'reply')).toEqual([{ type: 'reply', requestId: 5, ok: true, value: '민수' }]);
    expect((await done).outcome).toBe('ok');
    expect(outputs).toEqual(['안녕, 민수\n']);
  });

  it('fail()·runtime.fail()은 거절 메시지를 보낸다', async () => {
    const { runtime, workers } = makeRuntime();
    runtime.on('request', (request) => request.fail('카메라가 없어요'));
    const done = runtime.run('input');
    await Promise.resolve();
    expect(workers[0].last('reply')).toEqual({ type: 'reply', requestId: 5, ok: false, error: '카메라가 없어요' });
    runtime.reply(6, 'x');
    runtime.fail(7, '거절');
    expect(workers[0].last('reply')).toEqual({ type: 'reply', requestId: 7, ok: false, error: '거절' });
    await runtime.stop();
    await done;
  });

  it('setValue·pushEvent는 준비 전에는 모아 두었다가 준비되면 순서대로 보내고, 준비 뒤에는 바로 보낸다', async () => {
    const { runtime, workers } = makeRuntime();
    runtime.setValue('threshold', 100);
    runtime.pushEvent('keys', 113);
    expect(workers).toHaveLength(0);
    await runtime.load();
    expect(workers[0].sent.slice(1)).toEqual([
      { type: 'set', name: 'threshold', value: 100 },
      { type: 'push', channel: 'keys', value: 113 },
    ]);
    runtime.setValue('threshold', 120);
    expect(workers[0].last('set')).toEqual({ type: 'set', name: 'threshold', value: 120 });
  });
});

describe('파일 넣기·패키지 불러오기(task)', () => {
  it('writeFile은 task-result로 끝나고 실패는 한국어 오류로 거부된다', async () => {
    const { runtime, workers } = makeRuntime();
    await expect(runtime.writeFile('/home/pyodide/mask.png', new Uint8Array([1, 2]))).resolves.toBeUndefined();
    const sent = workers[0].last('write-file');
    expect(sent?.path).toBe('/home/pyodide/mask.png');
    expect(sent?.data).toEqual(new Uint8Array([1, 2]));
    await expect(runtime.writeFile('/bad', 'x')).rejects.toThrow('파일을 넣지 못했어요');
  });

  it('loadPackages는 불러온 이름을 돌려주고 기억한다', async () => {
    const { runtime } = makeRuntime();
    await expect(runtime.loadPackages(['numpy', 'opencv-python'])).resolves.toEqual(['numpy', 'opencv-python']);
    expect(runtime.loadedPackages).toEqual(['numpy', 'opencv-python']);
  });

  it('정지 2단계로 워커를 끝내면 기다리던 task는 취소된다', async () => {
    vi.useFakeTimers();
    const standard = standardBehavior();
    const { runtime, workers } = makeRuntime((worker, message) => {
      if (message.type === 'write-file') {
        return; // 파일 넣기에는 답하지 않아 기다리게 둔다.
      }
      standard(worker, message);
    });
    await runtime.load();
    const task = runtime.writeFile('/never', 'x');
    const swallow = task.catch((error: Error) => error.message);
    await Promise.resolve();
    expect(workers[0].last('write-file')?.path).toBe('/never');
    const done = runtime.run('busy');
    await Promise.resolve();
    const stopping = runtime.stop();
    await vi.advanceTimersByTimeAsync(STOP_GRACE_MS);
    await stopping;
    expect(await swallow).toContain('다시 시작');
    expect((await done).outcome).toBe('killed');
  });
});

describe('닫기(dispose)', () => {
  it('워커를 끝내고 실행 중이던 결과는 killed로 끝나며, 그 뒤 load()는 거부된다', async () => {
    const { runtime, workers } = makeRuntime();
    const done = runtime.run('sleep');
    await Promise.resolve();
    runtime.dispose();
    expect(workers[0].terminated).toBe(true);
    expect(runtime.state).toBe('unloaded');
    expect((await done).outcome).toBe('killed');
    await expect(runtime.load()).rejects.toThrow('닫은 실행기');
  });
});
