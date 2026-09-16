// 브라우저 저장 이름 규칙(src/lib/storage.ts) 단위 테스트 — 가짜 저장 공간으로 검사한다.
import { describe, expect, it } from 'vitest';
import { STORAGE_KEY_PREFIX as PREFIX_FROM_CAPABILITIES, STORAGE_TEST_KEY } from '../../src/lib/capabilities.ts';
import {
  STORAGE_KEY_PREFIX,
  clearOurs,
  isOurKey,
  isValidStorageName,
  listOurKeys,
  readItem,
  readJson,
  removeItem,
  resolveStorage,
  storageKey,
  writeItem,
  writeJson,
  type KeyedStorageLike,
} from '../../src/lib/storage.ts';

/** localStorage 모양의 가짜 저장 공간 */
class MemoryStorage implements KeyedStorageLike {
  readonly values = new Map<string, string>();
  get length(): number {
    return this.values.size;
  }
  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe('저장 이름 규칙', () => {
  it('머리말은 한 곳(storage.ts)에서 오고 capabilities.ts도 같은 값을 내보낸다', () => {
    expect(STORAGE_KEY_PREFIX).toBe('ai-physical-computing:');
    expect(PREFIX_FROM_CAPABILITIES).toBe(STORAGE_KEY_PREFIX);
    expect(STORAGE_TEST_KEY).toBe(storageKey('storage-test'));
  });

  it('이름에 머리말을 붙이고, 규칙에 맞지 않는 이름은 오류를 낸다', () => {
    expect(storageKey('editor:vision:code')).toBe('ai-physical-computing:editor:vision:code');
    expect(isValidStorageName('a')).toBe(true);
    expect(isValidStorageName('settings.v1/fps')).toBe(true);
    for (const bad of ['', ' ', 'Editor', '-a', 'a b', '한글', 'ai-physical-computing:x']) {
      expect(isValidStorageName(bad), bad).toBe(false);
      expect(() => storageKey(bad), bad).toThrow(/규칙|머리말/u);
    }
    expect(() => storageKey('ai-physical-computing:x')).toThrow(/머리말/u);
  });

  it('이 사이트의 이름인지 가른다', () => {
    expect(isOurKey('ai-physical-computing:x')).toBe(true);
    expect(isOurKey('ai-physical-computing:')).toBe(false);
    expect(isOurKey('other-site:x')).toBe(false);
  });
});

describe('읽기·쓰기·지우기', () => {
  it('글자와 JSON 값을 저장하고 읽는다', () => {
    const storage = new MemoryStorage();
    expect(writeItem('editor:code', 'print(1)', storage)).toBe(true);
    expect(storage.getItem('ai-physical-computing:editor:code')).toBe('print(1)');
    expect(readItem('editor:code', storage)).toBe('print(1)');
    expect(readItem('none', storage)).toBeNull();

    expect(writeJson('settings', { fps: 15, list: [1, 2] }, storage)).toBe(true);
    expect(readJson('settings', {}, storage)).toEqual({ fps: 15, list: [1, 2] });
    expect(readJson('none', { fallback: true }, storage)).toEqual({ fallback: true });
    storage.setItem(storageKey('broken'), '{not json');
    expect(readJson('broken', 'fallback', storage)).toBe('fallback');
    expect(writeJson('bad', undefined, storage)).toBe(false);
    expect(writeJson('bad', BigInt(1), storage)).toBe(false);

    expect(removeItem('editor:code', storage)).toBe(true);
    expect(readItem('editor:code', storage)).toBeNull();
    expect(removeItem('missing', storage)).toBe(true);
  });

  it('저장 공간이 없거나 막히면 오류 없이 null·false·0을 돌려준다', () => {
    const throwing = () => {
      throw new Error('SecurityError');
    };
    expect(resolveStorage(throwing)).toBeNull();
    expect(resolveStorage(null)).toBeNull();
    expect(readItem('x', throwing)).toBeNull();
    expect(writeItem('x', '1', throwing)).toBe(false);
    expect(removeItem('x', null)).toBe(false);
    expect(readJson('x', 7, null)).toBe(7);
    expect(listOurKeys(throwing)).toEqual([]);
    expect(clearOurs(null)).toBe(0);

    const full = new MemoryStorage();
    full.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    expect(writeItem('x', '1', full)).toBe(false);
    const unreadable = new MemoryStorage();
    unreadable.getItem = () => {
      throw new Error('막힘');
    };
    expect(readItem('x', unreadable)).toBeNull();
  });

  it('함수로 받은 저장 공간은 쓸 때 읽는다', () => {
    const storage = new MemoryStorage();
    let reads = 0;
    const source = () => {
      reads += 1;
      return storage;
    };
    expect(reads).toBe(0);
    expect(writeItem('a', '1', source)).toBe(true);
    expect(reads).toBe(1);
    expect(readItem('a', source)).toBe('1');
  });
});

describe('이 사이트의 기록만 지우기', () => {
  it('머리말로 시작하는 이름만 지우고 다른 사이트의 값은 남긴다(localStorage.clear()를 쓰지 않는다)', () => {
    const storage = new MemoryStorage();
    storage.setItem('other-site:token', 'keep');
    storage.setItem('songdo:visited', 'keep');
    writeItem('editor:code', 'x', storage);
    writeItem('settings', '{}', storage);
    writeItem('mqtt:prefix', 'abc', storage);
    let cleared = false;
    (storage as unknown as { clear: () => void }).clear = () => {
      cleared = true;
    };

    expect(listOurKeys(storage)).toEqual([
      'ai-physical-computing:editor:code',
      'ai-physical-computing:mqtt:prefix',
      'ai-physical-computing:settings',
    ]);
    expect(clearOurs(storage)).toBe(3);
    expect(cleared).toBe(false);
    expect(listOurKeys(storage)).toEqual([]);
    expect(storage.getItem('other-site:token')).toBe('keep');
    expect(storage.getItem('songdo:visited')).toBe('keep');
    expect(storage.length).toBe(2);
  });

  it('하나를 못 지워도 나머지는 지운다', () => {
    const storage = new MemoryStorage();
    writeItem('a', '1', storage);
    writeItem('b', '2', storage);
    const originalRemove = storage.removeItem.bind(storage);
    storage.removeItem = (key: string) => {
      if (key.endsWith(':a')) throw new Error('막힘');
      originalRemove(key);
    };
    expect(clearOurs(storage)).toBe(1);
    expect(readItem('b', storage)).toBeNull();
  });
});
