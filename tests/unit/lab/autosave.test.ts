// 자동 저장(src/lab/controls/autosave.ts) 단위 테스트 — 저장 이름 규칙, 미뤄서 저장, 복원, 저장 공간을 못 쓸 때(PLAN §8.2 P2-02).
import { describe, expect, it, vi } from 'vitest';
import {
  AUTOSAVE_DEBOUNCE_MS,
  Autosave,
  editorStorageName,
  lastExampleStorageName,
  type AutosaveStatus,
} from '../../../src/lab/controls/autosave.ts';
import { STORAGE_KEY_PREFIX, listOurKeys, type KeyedStorageLike } from '../../../src/lib/storage.ts';

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

/** 쓰기가 막힌 저장 공간(사생활 보호 모드·정책) */
class BlockedStorage extends MemoryStorage {
  override setItem(): void {
    throw new Error('QuotaExceededError');
  }
}

describe('저장 이름', () => {
  it('실습실·예제별 이름을 만들고 머리말 규칙(storage.ts)에 맞는다', () => {
    expect(editorStorageName('vision', 'v1-pixels')).toBe('editor:vision:v1-pixels');
    expect(editorStorageName('vision', null)).toBe('editor:vision:scratch');
    expect(editorStorageName('dev', undefined)).toBe('editor:dev:scratch');
    expect(lastExampleStorageName('vision')).toBe('editor:vision:last-example');
  });

  it('규칙에 맞지 않는 실습실·예제 이름은 오류', () => {
    expect(() => editorStorageName('Vision', 'a')).toThrow(/실습실 이름/u);
    expect(() => editorStorageName('vision', 'A B')).toThrow(/예제 id/u);
    expect(() => lastExampleStorageName('한글')).toThrow(/실습실 이름/u);
  });
});

describe('미뤄서 저장하기', () => {
  it('손을 멈춘 뒤 한 번만 저장하고 상태를 pending → saved로 알린다', () => {
    vi.useFakeTimers();
    try {
      const storage = new MemoryStorage();
      const statuses: AutosaveStatus[] = [];
      const autosave = new Autosave({ name: editorStorageName('vision', 'v1'), storage, onStatus: (status) => statuses.push(status) });
      expect(autosave.restore()).toBeNull();
      autosave.update('print(1)');
      autosave.update('print(12)');
      autosave.update('print(123)');
      expect(autosave.status).toBe('pending');
      expect(storage.values.size).toBe(0);
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS - 1);
      expect(storage.values.size).toBe(0);
      vi.advanceTimersByTime(1);
      expect(storage.getItem(`${STORAGE_KEY_PREFIX}editor:vision:v1`)).toBe('print(123)');
      expect(autosave.status).toBe('saved');
      expect(statuses).toEqual(['pending', 'saved']);
      expect(autosave.restore()).toBe('print(123)');
    } finally {
      vi.useRealTimers();
    }
  });

  it('flush()는 미룬 저장을 바로 하고, forget()은 저장본을 지운다', () => {
    vi.useFakeTimers();
    try {
      const storage = new MemoryStorage();
      const autosave = new Autosave({ name: editorStorageName('vision', 'v1'), storage });
      expect(autosave.flush()).toBe(false);
      autosave.update('a = 1');
      expect(autosave.flush()).toBe(true);
      expect(autosave.restore()).toBe('a = 1');
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS * 2);
      expect(autosave.flush()).toBe(false);

      autosave.update('a = 2');
      autosave.forget();
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS * 2);
      expect(autosave.restore()).toBeNull();
      expect(autosave.status).toBe('idle');
      expect(listOurKeys(storage)).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('저장 공간을 못 쓰면 unavailable로 알리고 오류로 멈추지 않는다', () => {
    const statuses: AutosaveStatus[] = [];
    const blocked = new Autosave({ name: editorStorageName('vision', 'v1'), storage: new BlockedStorage(), debounceMs: 0, onStatus: (s) => statuses.push(s) });
    blocked.update('x');
    expect(blocked.flush()).toBe(false);
    expect(blocked.status).toBe('unavailable');

    const none = new Autosave({ name: editorStorageName('vision', 'v1'), storage: null });
    expect(none.restore()).toBeNull();
    none.update('x');
    expect(none.flush()).toBe(false);
    expect(none.status).toBe('unavailable');
    expect(statuses).toEqual(['pending', 'unavailable']);
  });

  it('dispose() 뒤에는 저장하지 않고, 마지막 미룬 저장만 한 번 한다', () => {
    const storage = new MemoryStorage();
    const autosave = new Autosave({ name: editorStorageName('dev', 'hello'), storage, schedule: () => 0, cancel: () => undefined });
    autosave.update('before');
    autosave.dispose();
    expect(autosave.restore()).toBe('before');
    autosave.update('after');
    expect(autosave.flush()).toBe(false);
    expect(autosave.restore()).toBe('before');
  });
});
