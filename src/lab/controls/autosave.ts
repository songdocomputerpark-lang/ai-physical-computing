/**
 * 코드 자동 저장(PLAN §8.2 P2-02 "자동 저장(localStorage)", SPEC §6.1 "코드는 localStorage 자동 저장").
 *
 * 편집칸의 코드를 예제마다 다른 이름으로 브라우저 저장 공간에 남겨 새로고침해도 코드가 그대로 있게 한다.
 * 저장 이름은 src/lib/storage.ts 규칙(머리말 ai-physical-computing:)을 따르므로 [이 컴퓨터에서 내 기록 지우기]가 함께 지운다.
 *
 *   editorStorageName('vision', 'v1-pixels') → 'editor:vision:v1-pixels'
 *   editorStorageName('vision', null)        → 'editor:vision:scratch'   (예제를 고르지 않았을 때)
 *   lastExampleStorageName('vision')         → 'editor:vision:last-example'
 *
 *   const autosave = new Autosave({ name: editorStorageName('vision', id), onStatus });
 *   autosave.restore()        → 저장된 코드(없으면 null)
 *   autosave.update(code)     → 잠시(기본 400ms) 뒤에 저장. 그 사이 다시 부르면 마지막 코드만 저장한다.
 *   autosave.flush()          → 미룬 저장을 지금 한다(페이지를 떠날 때)
 *   autosave.forget()         → 저장한 코드를 지운다([초기화] 뒤처럼 예제 원본과 같아졌을 때)
 *
 * 상태(onStatus): idle(아직 없음) → pending(저장 기다리는 중) → saved(저장됨) | unavailable(저장 공간을 못 씀 — 사생활 보호 모드·정책)
 * 저장 실패는 오류로 멈추지 않고 상태로만 알린다(SPEC 원칙 2: 저장이 안 돼도 실습은 된다).
 * Node.js(Vitest)가 이 파일을 그대로 읽으므로 브라우저 전역을 직접 쓰지 않는다(타이머는 옵션으로 바꿔 넣을 수 있다).
 */
import { readItem, removeItem, storageKey, writeItem, type StorageSource } from '../../lib/storage.ts';
import { SCRATCH_EXAMPLE_ID } from './examples.ts';

export type AutosaveStatus = 'idle' | 'pending' | 'saved' | 'unavailable';

/** 저장 사이 간격(밀리초). 글자를 칠 때마다 쓰지 않고 손을 멈춘 뒤 한 번 쓴다. */
export const AUTOSAVE_DEBOUNCE_MS = 400;

const LAB_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;

function assertLabId(labId: string): void {
  if (!LAB_ID_PATTERN.test(labId)) {
    throw new Error(`실습실 이름 "${labId}"은(는) 영문 소문자·숫자·하이픈만 써요(예: vision).`);
  }
}

/** 예제별 코드 저장 이름(머리말 없이). exampleId가 없으면 scratch. */
export function editorStorageName(labId: string, exampleId: string | null | undefined): string {
  assertLabId(labId);
  const suffix = exampleId ?? SCRATCH_EXAMPLE_ID;
  if (!LAB_ID_PATTERN.test(suffix)) {
    throw new Error(`예제 id "${suffix}"은(는) 영문 소문자·숫자·하이픈만 써요.`);
  }
  // storageKey()로 규칙을 한 번 더 검사한다(틀리면 오류).
  storageKey(`editor:${labId}:${suffix}`);
  return `editor:${labId}:${suffix}`;
}

/** 마지막으로 열었던 예제 id를 남기는 이름 */
export function lastExampleStorageName(labId: string): string {
  assertLabId(labId);
  return `editor:${labId}:last-example`;
}

export interface AutosaveOptions {
  /** 저장 이름(머리말 없이, editorStorageName()으로 만든 값) */
  readonly name: string;
  /** 저장 공간. 기본 globalThis.localStorage */
  readonly storage?: StorageSource;
  /** 저장 사이 간격(밀리초). 기본 AUTOSAVE_DEBOUNCE_MS */
  readonly debounceMs?: number;
  /** 상태가 바뀔 때 */
  readonly onStatus?: (status: AutosaveStatus) => void;
  /** 타이머(테스트용). 기본 setTimeout·clearTimeout */
  readonly schedule?: (fn: () => void, ms: number) => unknown;
  readonly cancel?: (handle: unknown) => void;
}

export class Autosave {
  readonly name: string;
  readonly #storage: StorageSource;
  readonly #debounceMs: number;
  readonly #onStatus: ((status: AutosaveStatus) => void) | undefined;
  readonly #schedule: (fn: () => void, ms: number) => unknown;
  readonly #cancel: (handle: unknown) => void;
  #status: AutosaveStatus = 'idle';
  #pendingCode: string | null = null;
  #timer: unknown = null;
  #disposed = false;

  constructor(options: AutosaveOptions) {
    this.name = options.name;
    this.#storage = options.storage;
    this.#debounceMs = options.debounceMs ?? AUTOSAVE_DEBOUNCE_MS;
    this.#onStatus = options.onStatus;
    this.#schedule = options.schedule ?? ((fn, ms) => setTimeout(fn, ms));
    this.#cancel = options.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  get status(): AutosaveStatus {
    return this.#status;
  }

  #setStatus(status: AutosaveStatus): void {
    if (status === this.#status) {
      return;
    }
    this.#status = status;
    this.#onStatus?.(status);
  }

  /** 저장된 코드를 읽는다. 없거나 못 읽으면 null. */
  restore(): string | null {
    return readItem(this.name, this.#storage);
  }

  /** 바뀐 코드를 잠시 뒤에 저장한다. */
  update(code: string): void {
    if (this.#disposed) {
      return;
    }
    this.#pendingCode = code;
    if (this.#timer !== null) {
      this.#cancel(this.#timer);
    }
    this.#setStatus('pending');
    this.#timer = this.#schedule(() => {
      this.#timer = null;
      this.flush();
    }, this.#debounceMs);
  }

  /** 미룬 저장을 지금 한다. 저장했으면 true, 저장할 것이 없거나 못 했으면 false. */
  flush(): boolean {
    if (this.#timer !== null) {
      this.#cancel(this.#timer);
      this.#timer = null;
    }
    const code = this.#pendingCode;
    if (code === null) {
      return false;
    }
    this.#pendingCode = null;
    const ok = writeItem(this.name, code, this.#storage);
    this.#setStatus(ok ? 'saved' : 'unavailable');
    return ok;
  }

  /** 저장한 코드를 지운다(미룬 저장도 취소). */
  forget(): void {
    if (this.#timer !== null) {
      this.#cancel(this.#timer);
      this.#timer = null;
    }
    this.#pendingCode = null;
    removeItem(this.name, this.#storage);
    this.#setStatus('idle');
  }

  /** 더 쓰지 않는다(미룬 저장은 마지막으로 한 번 한다). */
  dispose(): void {
    this.flush();
    this.#disposed = true;
  }
}
