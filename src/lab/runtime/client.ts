/**
 * 파이썬 실행기 화면 쪽 API(PLAN §4.4 PD-01, §8.2 P2-01) — 워커(worker.ts)를 띄우고 메시지(protocol.ts)를 주고받는다.
 *
 * 쓰는 법(실습실 화면·차시 임베드가 이 클래스만 쓴다)
 *   const runtime = new PythonRuntime();
 *   runtime.on('state', ({ state }) => …);           // unloaded → loading → idle → running → stopping → idle
 *   runtime.on('stdout', (text) => console.append(text));
 *   runtime.on('request', (request) => { if (request.kind === 'input') … request.reply('입력한 글자'); });
 *   runtime.on('event', ({ kind, payload }) => { if (kind === 'window.show') … });   // 파이썬이 기다리지 않고 알린 것(cv2.imshow)
 *   await runtime.load();                              // Pyodide 받기(한 번만, 다시 부르면 같은 약속)
 *   const result = await runtime.run("print('안녕')"); // { outcome: 'ok' | 'error' | 'stopped' | 'killed', … }
 *   await runtime.stop();                              // 1단계: 기다리던 곳에서 KeyboardInterrupt → 1초 안에 안 멈추면 2단계: 워커 재시작
 *   runtime.setValue('threshold', 100);                // 파이썬: apc_runtime.get('threshold')
 *   runtime.pushEvent('keys', 113);                    // 파이썬: apc_runtime.poll('keys')
 *   await runtime.writeFile('/home/pyodide/mask.png', bytes);
 *
 * 대기 지점에 값을 넣는 방법: 파이썬이 apc_runtime.request(kind, payload)나 input()을 부르면 'request' 이벤트가 온다.
 * 화면은 request.reply(값)으로 답하거나 request.fail('한국어 설명')로 거절한다(파이썬 쪽에는 예외로 전해진다).
 * 답이 올 때까지 파이썬은 그 자리에서 멈춰 있고, 그동안 [정지]를 누르면 바로 멈춘다.
 *
 * 워커 만들기는 options.createWorker로 바꿔 넣을 수 있어 단위 테스트가 가짜 워커로 상태 흐름을 검사한다(tests/unit/lab/).
 */
import { STOP_GRACE_MS, STUDENT_FILENAME, pyodideIndexUrls } from './config.ts';
import type {
  FromWorkerMessage,
  NoticeLevel,
  PythonErrorInfo,
  RunOutcome,
  RuntimeInfo,
  RuntimeState,
  ToWorkerMessage,
} from './protocol.ts';

/** Worker 가운데 이 파일이 쓰는 부분(가짜 워커로 바꿔 넣을 수 있게) */
export interface WorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  terminate(): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  addEventListener(type: 'error', listener: (event: { message?: string }) => void): void;
  addEventListener(type: 'messageerror', listener: (event: unknown) => void): void;
}

export interface RuntimeOptions {
  /** 워커를 만드는 함수. 기본은 worker.ts 모듈 워커 */
  readonly createWorker?: () => WorkerLike;
  /** 차례로 시도할 Pyodide 위치. 기본은 config.ts의 pyodideIndexUrls() */
  readonly indexUrls?: readonly string[];
  /** 정지 2단계까지 기다리는 시간(밀리초). 기본 STOP_GRACE_MS */
  readonly stopGraceMs?: number;
  /** 시험용: JSPI가 있어도 제한 모드로 */
  readonly forceLimited?: boolean;
  /** 이 실행기를 쓰는 실습실 id(LabShell의 labId). 워커가 그 실습실에 붙는 흉내 모듈의 파이썬 파일만 넣는다(protocol.ts LoadMessage.labId). */
  readonly labId?: string;
}

export interface RunOptions {
  /** 트레이스백에 보이는 파일 이름. 기본 main.py */
  readonly filename?: string;
  /** import 문 분석과 별도로 먼저 불러올 Pyodide 패키지 이름 */
  readonly packages?: readonly string[];
}

export interface RunResult {
  readonly runId: number;
  readonly outcome: RunOutcome;
  readonly error?: PythonErrorInfo;
  readonly exitCode?: number | null;
  /** 실행 시작부터 끝까지(밀리초) */
  readonly durationMs: number;
  /** [정지]를 누른 뒤 끝날 때까지(밀리초). 정지를 누르지 않았으면 undefined */
  readonly stopMs?: number;
}

export interface RuntimeNotice {
  readonly level: NoticeLevel;
  readonly text: string;
}

export interface RuntimeProgress {
  readonly stage: 'core' | 'package';
  readonly message: string;
  /** 패키지 단계의 시작·끝과 패키지 이름(protocol.ts ProgressMessage) */
  readonly phase?: 'start' | 'done';
  readonly names?: readonly string[];
}

/** 파이썬이 대기 지점에서 화면에 부탁한 일 */
export interface RuntimeRequest {
  readonly requestId: number;
  readonly kind: string;
  readonly payload: unknown;
  /** 값을 돌려준다(파이썬 쪽 block_on의 결과). transfer에 넣은 ArrayBuffer(카메라 프레임)는 복사 없이 워커로 옮긴다. */
  reply(value: unknown, transfer?: readonly ArrayBuffer[]): void;
  /** 거절한다(파이썬 쪽에 예외로 전해진다) */
  fail(message: string): void;
}

/** 파이썬이 답을 기다리지 않고 알린 것(cv2.imshow 영상 등, protocol.ts EventMessage) */
export interface RuntimeEvent {
  readonly kind: string;
  readonly payload: unknown;
}

export interface RuntimeEvents {
  state: { state: RuntimeState; previous: RuntimeState };
  ready: RuntimeInfo;
  progress: RuntimeProgress;
  stdout: string;
  stderr: string;
  notice: RuntimeNotice;
  request: RuntimeRequest;
  event: RuntimeEvent;
  done: RunResult;
}

export type StopResult = 'idle' | 'stopped' | 'restarted';

type Listener<K extends keyof RuntimeEvents> = (payload: RuntimeEvents[K]) => void;

interface ActiveRun {
  readonly id: number;
  readonly startedAt: number;
  stopRequestedAt: number | null;
  resolve(result: RunResult): void;
  readonly promise: Promise<RunResult>;
}

interface PendingTask {
  resolve(value: unknown): void;
  reject(error: Error): void;
}

/** 정지 2단계 안내(콘솔에 보인다). 학생이 왜 다시 시작됐는지 알 수 있게 쓴다. 시간은 config.ts의 STOP_GRACE_MS를 따른다. */
export const KILLED_NOTICE =
  `[정지]를 눌렀지만 코드가 ${STOP_GRACE_MS / 1000}초 안에 멈추지 않아서 파이썬을 다시 시작했어요. ` +
  '기다리는 곳(time.sleep, input, 카메라 읽기)이 없이 계산만 하는 반복문은 이렇게 멈춰요. 잠깐 뒤에 다시 실행할 수 있어요.';

export const LIMITED_MODE_NOTICE =
  '이 브라우저에는 JSPI(파이썬 기다리기 기능)가 없어서 제한 모드로 실행해요. ' +
  '입력이나 카메라를 기다리는 코드는 실행할 수 없고, [정지]는 파이썬을 다시 시작하는 방식으로만 돼요. 한 번 실행되고 끝나는 코드는 돌아요.';

function createDefaultWorker(): WorkerLike {
  return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'python-runtime' }) as unknown as WorkerLike;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export class PythonRuntime {
  readonly #createWorker: () => WorkerLike;
  readonly #indexUrls: readonly string[];
  readonly #stopGraceMs: number;
  readonly #forceLimited: boolean;
  readonly #labId: string | undefined;
  readonly #listeners = new Map<keyof RuntimeEvents, Set<Listener<keyof RuntimeEvents>>>();
  readonly #loadedPackages = new Set<string>();
  readonly #tasks = new Map<number, PendingTask>();
  #worker: WorkerLike | null = null;
  #state: RuntimeState = 'unloaded';
  #info: RuntimeInfo | null = null;
  #readyPromise: Promise<RuntimeInfo> | null = null;
  #activeRun: ActiveRun | null = null;
  #interruptBuffer: Uint8Array | null = null;
  #nextRunId = 1;
  #nextTaskId = 1;
  #disposed = false;
  /** 워커가 준비되기 전에 보낸 값(준비되면 순서대로 보낸다) */
  #queuedInputs: ToWorkerMessage[] = [];

  constructor(options: RuntimeOptions = {}) {
    this.#createWorker = options.createWorker ?? createDefaultWorker;
    this.#indexUrls = options.indexUrls ?? pyodideIndexUrls(typeof location !== 'undefined' ? location.origin : undefined);
    this.#stopGraceMs = options.stopGraceMs ?? STOP_GRACE_MS;
    this.#forceLimited = options.forceLimited ?? false;
    this.#labId = options.labId;
  }

  get state(): RuntimeState {
    return this.#state;
  }

  /** 준비된 뒤의 정보(그 전에는 null) */
  get info(): RuntimeInfo | null {
    return this.#info;
  }

  /** 지금까지 불러온 Pyodide 패키지 이름 */
  get loadedPackages(): readonly string[] {
    return [...this.#loadedPackages].sort();
  }

  /** 이벤트 듣기. 돌려주는 함수를 부르면 그만 듣는다. */
  on<K extends keyof RuntimeEvents>(event: K, listener: Listener<K>): () => void {
    let set = this.#listeners.get(event);
    if (!set) {
      set = new Set();
      this.#listeners.set(event, set);
    }
    set.add(listener as Listener<keyof RuntimeEvents>);
    return () => {
      set.delete(listener as Listener<keyof RuntimeEvents>);
    };
  }

  #emit<K extends keyof RuntimeEvents>(event: K, payload: RuntimeEvents[K]): void {
    const set = this.#listeners.get(event);
    if (!set) {
      return;
    }
    for (const listener of [...set]) {
      try {
        (listener as Listener<K>)(payload);
      } catch (error) {
        console.error('파이썬 실행기 이벤트 처리 중 오류', error);
      }
    }
  }

  #setState(state: RuntimeState): void {
    if (state === this.#state) {
      return;
    }
    const previous = this.#state;
    this.#state = state;
    this.#emit('state', { state, previous });
  }

  #post(message: ToWorkerMessage, transfer?: readonly ArrayBuffer[]): void {
    if (transfer && transfer.length > 0) {
      this.#worker?.postMessage(message, [...transfer]);
    } else {
      this.#worker?.postMessage(message);
    }
  }

  /** 워커를 띄우고 Pyodide를 받는다. 이미 받았거나 받는 중이면 같은 약속을 돌려준다. 실패하면 거부되고 다음 load()가 다시 시도한다. */
  load(): Promise<RuntimeInfo> {
    if (this.#disposed) {
      return Promise.reject(new Error('이미 닫은 실행기예요. 새로 만들어 주세요.'));
    }
    return this.#readyPromise ?? this.#beginLoad();
  }

  /**
   * 워커를 띄우는 약속을 만들어 기억한다. 실패하면 기억을 지워 다음 load()가 새 워커로 다시 시도한다.
   * 지우는 일은 약속이 거부된 뒤에 한다 — 워커가 같은 틱에 실패를 알리면(가짜 워커) 기억을 먼저 지우고 나서 덮어쓰게 되어 다시 시도가 안 됐다.
   */
  #beginLoad(): Promise<RuntimeInfo> {
    const promise = this.#startWorker();
    this.#readyPromise = promise;
    promise.catch(() => {
      if (this.#readyPromise === promise) {
        this.#readyPromise = null;
      }
    });
    return promise;
  }

  #startWorker(): Promise<RuntimeInfo> {
    this.#setState('loading');
    return new Promise<RuntimeInfo>((resolve, reject) => {
      let worker: WorkerLike;
      try {
        worker = this.#createWorker();
      } catch (error) {
        this.#setState('failed');
        const message = `파이썬 워커를 만들지 못했어요: ${error instanceof Error ? error.message : String(error)}`;
        this.#emit('notice', { level: 'error', text: message });
        reject(new Error(message));
        return;
      }
      this.#worker = worker;
      let settled = false;
      const settle = (ok: boolean, value: RuntimeInfo | Error) => {
        if (settled) {
          return;
        }
        settled = true;
        if (ok) {
          resolve(value as RuntimeInfo);
        } else {
          reject(value as Error);
        }
      };

      worker.addEventListener('message', (event) => {
        if (this.#worker !== worker) {
          return; // 끝낸 워커에서 늦게 온 메시지
        }
        const message = event.data as FromWorkerMessage;
        if (message.type === 'ready') {
          this.#info = message.info;
          this.#interruptBuffer = message.interruptBuffer ?? null;
          this.#setState('idle');
          this.#emit('ready', message.info);
          if (message.info.limited) {
            this.#emit('notice', { level: 'warn', text: LIMITED_MODE_NOTICE });
          }
          for (const queued of this.#queuedInputs.splice(0)) {
            this.#post(queued);
          }
          settle(true, message.info);
          return;
        }
        if (message.type === 'load-failed') {
          this.#setState('failed');
          const text = message.details.length > 0 ? `${message.message} (${message.details.join(' / ')})` : message.message;
          this.#emit('notice', { level: 'error', text });
          settle(false, new Error(message.message));
          return;
        }
        this.#handleMessage(message);
      });
      worker.addEventListener('error', (event) => {
        if (this.#worker !== worker) {
          return;
        }
        const detail = event.message ?? '알 수 없는 오류';
        if (!settled) {
          this.#setState('failed');
          this.#emit('notice', { level: 'error', text: `파이썬 워커를 시작하지 못했어요: ${detail}` });
          settle(false, new Error(detail));
          return;
        }
        this.#emit('notice', { level: 'error', text: `파이썬 워커에서 오류가 났어요: ${detail}` });
      });
      worker.addEventListener('messageerror', () => {
        if (this.#worker === worker) {
          this.#emit('notice', { level: 'error', text: '파이썬 워커의 메시지를 읽지 못했어요.' });
        }
      });

      worker.postMessage({
        type: 'load',
        indexUrls: this.#indexUrls,
        packages: [...this.#loadedPackages],
        forceLimited: this.#forceLimited,
        ...(this.#labId ? { labId: this.#labId } : {}),
      } satisfies ToWorkerMessage);
    });
  }

  #handleMessage(message: FromWorkerMessage): void {
    switch (message.type) {
      case 'progress':
        this.#emit('progress', {
          stage: message.stage,
          message: message.message,
          ...(message.phase ? { phase: message.phase } : {}),
          ...(message.names ? { names: message.names } : {}),
        });
        return;
      case 'stdout':
        this.#emit('stdout', message.text);
        return;
      case 'stderr':
        this.#emit('stderr', message.text);
        return;
      case 'notice':
        this.#emit('notice', { level: message.level, text: message.text });
        return;
      case 'request': {
        let answered = false;
        const answer = (reply: ToWorkerMessage, transfer?: readonly ArrayBuffer[]) => {
          if (answered) {
            return;
          }
          answered = true;
          this.#post(reply, transfer);
        };
        this.#emit('request', {
          requestId: message.requestId,
          kind: message.kind,
          payload: message.payload,
          reply: (value, transfer) => answer({ type: 'reply', requestId: message.requestId, ok: true, value }, transfer),
          fail: (text) => answer({ type: 'reply', requestId: message.requestId, ok: false, error: text }),
        });
        return;
      }
      case 'event':
        this.#emit('event', { kind: message.kind, payload: message.payload });
        return;
      case 'done': {
        for (const name of message.loadedPackages) {
          this.#loadedPackages.add(name);
        }
        const run = this.#activeRun;
        if (!run || run.id !== message.runId) {
          return;
        }
        this.#activeRun = null;
        const finishedAt = now();
        const result: RunResult = {
          runId: run.id,
          outcome: message.outcome,
          ...(message.error ? { error: message.error } : {}),
          ...(message.exitCode !== undefined ? { exitCode: message.exitCode } : {}),
          durationMs: finishedAt - run.startedAt,
          ...(run.stopRequestedAt !== null ? { stopMs: finishedAt - run.stopRequestedAt } : {}),
        };
        this.#setState('idle');
        this.#emit('done', result);
        run.resolve(result);
        return;
      }
      case 'task-result': {
        const task = this.#tasks.get(message.taskId);
        if (!task) {
          return;
        }
        this.#tasks.delete(message.taskId);
        if (message.ok) {
          task.resolve(message.value);
        } else {
          task.reject(new Error(message.error ?? '워커가 일을 끝내지 못했어요.'));
        }
        return;
      }
      default:
        return;
    }
  }

  /** 학생 코드를 실행한다. 준비가 안 됐으면 먼저 load()를 기다린다. 끝나면(정지·오류 포함) 결과로 끝난다. */
  async run(code: string, options: RunOptions = {}): Promise<RunResult> {
    await this.load();
    if (this.#activeRun) {
      throw new Error('이미 실행 중이에요. 먼저 [정지]를 누르거나 끝날 때까지 기다려 주세요.');
    }
    const runId = this.#nextRunId;
    this.#nextRunId += 1;
    let resolve!: (result: RunResult) => void;
    const promise = new Promise<RunResult>((done) => {
      resolve = done;
    });
    const run: ActiveRun = { id: runId, startedAt: now(), stopRequestedAt: null, resolve, promise };
    this.#activeRun = run;
    this.#setState('running');
    this.#post({
      type: 'run',
      runId,
      code,
      filename: options.filename ?? STUDENT_FILENAME,
      packages: options.packages ?? [],
    });
    return promise;
  }

  /**
   * [정지]. 1단계: 워커에 정지를 알려 기다리던 곳에서 KeyboardInterrupt가 나게 한다.
   * 2단계: stopGraceMs 안에 끝나지 않으면 워커를 끝내고 새로 띄운다(결과는 'killed', 콘솔에 KILLED_NOTICE).
   */
  async stop(): Promise<StopResult> {
    const run = this.#activeRun;
    if (!run) {
      return 'idle';
    }
    if (run.stopRequestedAt === null) {
      run.stopRequestedAt = now();
      this.#setState('stopping');
      this.#post({ type: 'stop' });
      if (this.#interruptBuffer) {
        this.#interruptBuffer[0] = 2; // SIGINT — 격리된 곳에서만 있는 덤(worker.ts 머리말 3)
      }
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), this.#stopGraceMs);
    });
    const outcome = await Promise.race([run.promise.then((result) => result.outcome), timeout]);
    clearTimeout(timer);
    if (outcome !== 'timeout') {
      return outcome === 'killed' ? 'restarted' : 'stopped';
    }
    if (this.#activeRun !== run) {
      return 'stopped';
    }
    this.#restart();
    await this.load().catch(() => undefined);
    return 'restarted';
  }

  /** 정지 2단계: 워커를 즉시 끝내고(Worker.terminate) 새 워커를 띄운다. 전에 쓰던 패키지는 새 워커가 다시 받는다. */
  #restart(): void {
    const worker = this.#worker;
    const run = this.#activeRun;
    this.#worker = null;
    this.#readyPromise = null;
    this.#info = null;
    this.#interruptBuffer = null;
    worker?.terminate();
    this.#failTasks('파이썬을 다시 시작해서 취소했어요.');
    if (run) {
      this.#activeRun = null;
      const finishedAt = now();
      const result: RunResult = {
        runId: run.id,
        outcome: 'killed',
        durationMs: finishedAt - run.startedAt,
        ...(run.stopRequestedAt !== null ? { stopMs: finishedAt - run.stopRequestedAt } : {}),
      };
      this.#emit('done', result);
      run.resolve(result);
    }
    this.#emit('notice', { level: 'warn', text: KILLED_NOTICE });
    this.#beginLoad();
  }

  #failTasks(message: string): void {
    for (const task of this.#tasks.values()) {
      task.reject(new Error(message));
    }
    this.#tasks.clear();
  }

  #sendOrQueue(message: ToWorkerMessage): void {
    if (this.#info && this.#worker) {
      this.#post(message);
    } else {
      this.#queuedInputs.push(message);
    }
  }

  /** 최신 값(슬라이더 등). 파이썬은 apc_runtime.get(name)으로 읽는다. 준비 전에 보낸 값은 준비되면 전해진다. */
  setValue(name: string, value: unknown): void {
    this.#sendOrQueue({ type: 'set', name, value });
  }

  /** 쌓이는 값(키 입력 등). 파이썬은 apc_runtime.poll(channel)로 꺼낸다. */
  pushEvent(channel: string, value: unknown): void {
    this.#sendOrQueue({ type: 'push', channel, value });
  }

  /** 대기 지점(request 이벤트)에 답한다. 이벤트 객체의 reply()와 같다. transfer는 복사 없이 옮길 ArrayBuffer. */
  reply(requestId: number, value: unknown, transfer?: readonly ArrayBuffer[]): void {
    this.#post({ type: 'reply', requestId, ok: true, value }, transfer);
  }

  /** 대기 지점을 거절한다(파이썬 쪽에 예외). 이벤트 객체의 fail()과 같다. */
  fail(requestId: number, message: string): void {
    this.#post({ type: 'reply', requestId, ok: false, error: message });
  }

  async #task<T>(build: (taskId: number) => ToWorkerMessage): Promise<T> {
    await this.load();
    return new Promise<T>((resolve, reject) => {
      const taskId = this.#nextTaskId;
      this.#nextTaskId += 1;
      this.#tasks.set(taskId, { resolve: (value) => resolve(value as T), reject });
      this.#post(build(taskId));
    });
  }

  /** Pyodide 가상 파일시스템에 파일을 넣는다(예: 예제 자산·업로드 이미지). 실행 중에도 된다. */
  async writeFile(path: string, data: string | Uint8Array): Promise<void> {
    await this.#task<string>((taskId) => ({ type: 'write-file', taskId, path, data }));
  }

  /** Pyodide 패키지를 미리 불러온다(이름은 pyodide-lock.json 기준, 예: numpy·opencv-python). 실행 중에는 안 된다. */
  async loadPackages(names: readonly string[]): Promise<string[]> {
    const loaded = await this.#task<string[]>((taskId) => ({ type: 'load-packages', taskId, names }));
    for (const name of loaded) {
      this.#loadedPackages.add(name);
    }
    return loaded;
  }

  /** 워커를 끝내고 더 쓰지 않는다(페이지를 떠날 때). */
  dispose(): void {
    this.#disposed = true;
    const worker = this.#worker;
    const run = this.#activeRun;
    this.#worker = null;
    this.#readyPromise = null;
    this.#info = null;
    this.#interruptBuffer = null;
    worker?.terminate();
    this.#failTasks('실행기를 닫아서 취소했어요.');
    if (run) {
      this.#activeRun = null;
      run.resolve({ runId: run.id, outcome: 'killed', durationMs: now() - run.startedAt });
    }
    this.#setState('unloaded');
  }
}
