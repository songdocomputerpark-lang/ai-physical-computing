/**
 * 브라우저 저장 이름 규칙(PLAN §10 "브라우저 저장", §8.2 P2-02, PROGRESS 미해결 13번 — 2026-09-16 P2-01에서 만듦).
 *
 * 사이트는 GitHub Pages의 하위 경로(/ai-physical-computing/)에 있어서 같은 계정의 다른 GitHub Pages 사이트와
 * 출처(origin, songdocomputerpark-lang.github.io)를 공유한다. localStorage는 출처 단위로 나뉘므로 다른 사이트의 값과 한 곳에 섞인다.
 * 그래서 ① 이 사이트가 쓰는 이름에는 모두 머리말 'ai-physical-computing:'을 붙이고, ② [이 컴퓨터에서 내 기록 지우기]는
 * 머리말로 시작하는 이름만 지운다. localStorage.clear()는 다른 사이트의 기록까지 지우므로 쓰지 않는다.
 *
 *   writeItem('editor:vision:code', code)   → localStorage['ai-physical-computing:editor:vision:code'] = code
 *   readItem('editor:vision:code')          → 저장한 글자, 없거나 못 읽으면 null
 *   writeJson('settings', { fps: 15 }) / readJson('settings', {})
 *   listOurKeys()                           → 이 사이트의 이름(머리말 포함) 목록
 *   clearOurs()                             → 이 사이트의 이름만 지우고 지운 개수를 돌려준다
 *
 * 원칙
 * - 저장 공간을 못 쓰는 브라우저(사생활 보호 모드, 학교 정책, 용량 초과)에서도 오류로 멈추지 않는다: 읽기는 null(또는 기본값), 쓰기는 false.
 * - 저장 공간은 인자로 바꿔 넣을 수 있어 단위 테스트가 가짜 저장 공간으로 검사한다. 기본은 globalThis.localStorage다.
 * - 이름은 영문 소문자·숫자로 시작하고 영문·숫자와 : _ . / - 만 쓴다(PD-09와 같은 취지). 머리말이 이미 붙은 이름은 실수로 보고 오류를 낸다.
 * - Node.js가 이 파일을 직접 읽을 수 있게(capabilities.ts가 이 파일을 쓴다) 타입 표기만 지우면 그대로 도는 문법만 쓴다(enum·namespace 금지).
 */

/** 이 사이트가 브라우저 저장 공간에 쓰는 모든 이름의 머리말 */
export const STORAGE_KEY_PREFIX = 'ai-physical-computing:';

/** 읽기·쓰기·지우기만 있는 저장 공간(localStorage의 일부 모양). 점검·안내 닫기 기억 등이 쓴다. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 이름 목록까지 읽을 수 있는 저장 공간(localStorage 전체 모양). 이 사이트의 이름만 골라 지울 때 필요하다. */
export interface KeyedStorageLike extends StorageLike {
  readonly length: number;
  key(index: number): string | null;
}

/**
 * 저장 공간을 고르는 값: 저장 공간 자체, 없음(null·undefined), 또는 저장 공간을 돌려주는 함수.
 * 브라우저가 저장을 막으면 localStorage를 읽는 순간 오류가 나므로 함수로 받아 쓸 때 읽는다.
 */
export type StorageSource = KeyedStorageLike | null | undefined | (() => KeyedStorageLike | null | undefined);

/** 이름 규칙: 영문 소문자·숫자로 시작, 영문·숫자와 : _ . / - 만 */
const NAME_PATTERN = /^[a-z0-9][a-z0-9:_./-]*$/u;

/** 저장 이름(머리말 없는 이름)이 규칙에 맞는지 */
export function isValidStorageName(name: string): boolean {
  return typeof name === 'string' && NAME_PATTERN.test(name) && !name.startsWith(STORAGE_KEY_PREFIX);
}

/** 이름에 머리말을 붙인 실제 저장 이름을 만든다. 규칙에 맞지 않으면 오류를 낸다(코드 실수를 바로 알 수 있게). */
export function storageKey(name: string): string {
  if (typeof name === 'string' && name.startsWith(STORAGE_KEY_PREFIX)) {
    throw new Error(`storageKey()에 머리말(${STORAGE_KEY_PREFIX})이 이미 붙은 이름 "${name}"을 넣었어요. 머리말 없는 이름만 넣어요.`);
  }
  if (!isValidStorageName(name)) {
    throw new Error(
      `저장 이름 "${String(name)}"은(는) 규칙에 맞지 않아요. 영문 소문자나 숫자로 시작하고 영문·숫자와 : _ . / - 만 써요(예: "editor:vision:code").`,
    );
  }
  return `${STORAGE_KEY_PREFIX}${name}`;
}

/** 실제 저장 이름이 이 사이트의 것인지(머리말로 시작하는지) */
export function isOurKey(key: string): boolean {
  return typeof key === 'string' && key.startsWith(STORAGE_KEY_PREFIX) && key.length > STORAGE_KEY_PREFIX.length;
}

function defaultStorage(): KeyedStorageLike | null | undefined {
  const holder = globalThis as { localStorage?: KeyedStorageLike };
  return holder.localStorage;
}

/**
 * 쓸 저장 공간을 돌려준다. 없거나 읽는 순간 오류가 나면(막힌 브라우저) null.
 * 인자를 주지 않으면 globalThis.localStorage를 쓴다.
 */
export function resolveStorage(source?: StorageSource): KeyedStorageLike | null {
  try {
    const storage = typeof source === 'function' ? source() : source === undefined ? defaultStorage() : source;
    return storage ?? null;
  } catch {
    return null;
  }
}

/** 저장한 글자를 읽는다. 없거나 못 읽으면 null. */
export function readItem(name: string, source?: StorageSource): string | null {
  const key = storageKey(name);
  try {
    const value = resolveStorage(source)?.getItem(key);
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

/** 글자를 저장한다. 저장하지 못하면(막힘·용량 초과) false. */
export function writeItem(name: string, value: string, source?: StorageSource): boolean {
  const key = storageKey(name);
  try {
    const storage = resolveStorage(source);
    if (!storage) {
      return false;
    }
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** 이름 하나를 지운다. 지우지 못하면 false(없는 이름을 지우는 것은 true). */
export function removeItem(name: string, source?: StorageSource): boolean {
  const key = storageKey(name);
  try {
    const storage = resolveStorage(source);
    if (!storage) {
      return false;
    }
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** JSON으로 저장한 값을 읽는다. 없거나 못 읽거나 JSON이 깨졌으면 fallback. */
export function readJson<T>(name: string, fallback: T, source?: StorageSource): T {
  const text = readItem(name, source);
  if (text === null) {
    return fallback;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/** 값을 JSON 글자로 저장한다. JSON으로 만들 수 없거나 저장하지 못하면 false. */
export function writeJson(name: string, value: unknown, source?: StorageSource): boolean {
  let text: string;
  try {
    text = JSON.stringify(value);
  } catch {
    return false;
  }
  if (typeof text !== 'string') {
    return false;
  }
  return writeItem(name, text, source);
}

/** 이 사이트의 이름(머리말 포함) 목록. 못 읽으면 빈 목록. 이름순으로 정렬한다. */
export function listOurKeys(source?: StorageSource): string[] {
  const keys: string[] = [];
  try {
    const storage = resolveStorage(source);
    if (!storage) {
      return keys;
    }
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key !== null && isOurKey(key)) {
        keys.push(key);
      }
    }
  } catch {
    return [];
  }
  return keys.sort();
}

/**
 * [이 컴퓨터에서 내 기록 지우기]: 이 사이트의 이름만 지운다(다른 사이트의 기록은 그대로).
 * 지운 개수를 돌려준다. 저장 공간을 못 쓰면 0.
 */
export function clearOurs(source?: StorageSource): number {
  const storage = resolveStorage(source);
  if (!storage) {
    return 0;
  }
  let removed = 0;
  for (const key of listOurKeys(storage)) {
    try {
      storage.removeItem(key);
      removed += 1;
    } catch {
      // 하나를 못 지워도 나머지는 계속 지운다.
    }
  }
  return removed;
}
