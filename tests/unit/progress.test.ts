// 학습 진도(src/lib/progress.ts) 단위 테스트 — 가짜 저장 공간으로 검사한다(DOM 없는 Node 환경이라 이벤트는 가짜 document로 본다).
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PROGRESS_CHANGED_EVENT,
  PROGRESS_STORAGE_NAME,
  clearProgress,
  emptyProgress,
  firstUnseen,
  hasProgress,
  isLessonId,
  lessonStatus,
  markSeen,
  readProgress,
  rememberLab,
  sanitizeProgress,
  setDone,
  unitSummary,
  type ProgressState,
} from '../../src/lib/progress.ts';
import { STORAGE_KEY_PREFIX, clearOurs, listOurKeys, storageKey, type KeyedStorageLike } from '../../src/lib/storage.ts';

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

/** 읽기·쓰기가 모두 오류를 내는 저장 공간(사생활 보호 모드·용량 초과 흉내) */
class BrokenStorage implements KeyedStorageLike {
  readonly length = 0;
  key(): string | null {
    throw new Error('막힘');
  }
  getItem(): string | null {
    throw new Error('막힘');
  }
  setItem(): void {
    throw new Error('막힘');
  }
  removeItem(): void {
    throw new Error('막힘');
  }
}

const L1 = { id: 'u1/1-1-1', href: '/ai-physical-computing/learn/u1/1-1-1/', label: '1-1-1', title: '컴퓨터는 어떻게 사진을 볼까요' };
const L2 = { id: 'u1/1-1-2', href: '/ai-physical-computing/learn/u1/1-1-2/', label: '1-1-2', title: '색을 숫자로 바꿔요' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('이름과 빈 진도', () => {
  it('저장 이름이 progress:v1이고 머리말이 붙은 실제 이름으로 저장된다', () => {
    expect(PROGRESS_STORAGE_NAME).toBe('progress:v1');
    const storage = new MemoryStorage();
    markSeen(L1, storage, 1000);
    expect([...storage.values.keys()]).toEqual([`${STORAGE_KEY_PREFIX}progress:v1`]);
    expect(storageKey(PROGRESS_STORAGE_NAME)).toBe(`${STORAGE_KEY_PREFIX}progress:v1`);
  });

  it('처음에는 빈 진도다', () => {
    const state = readProgress(new MemoryStorage());
    expect(state).toEqual(emptyProgress());
    expect(hasProgress(state)).toBe(false);
  });

  it('[이 컴퓨터에서 내 기록 지우기](clearOurs)가 진도도 지운다', () => {
    const storage = new MemoryStorage();
    markSeen(L1, storage, 1000);
    expect(listOurKeys(storage)).toHaveLength(1);
    expect(clearOurs(storage)).toBe(1);
    expect(readProgress(storage)).toEqual(emptyProgress());
  });
});

describe('차시 id 모양', () => {
  it.each(['u1/1-1-1', 'u4/4-2-r', 'u2/2-1-3'])('%s는 맞다', (id) => {
    expect(isLessonId(id)).toBe(true);
  });
  it.each(['', 'u5/1-1-1', 'u0/a', 'U1/1-1-1', 'u1/', 'u1/1 1', '../u1/1-1-1', 'u1/1-1-1/', 'u1/한글', 'u1/a_b', 123, null])('%s는 틀리다', (id) => {
    expect(isLessonId(id)).toBe(false);
  });
});

describe('sanitizeProgress', () => {
  it('모르는 값·깨진 값은 빈 진도로 돌린다', () => {
    for (const raw of [null, undefined, 3, 'x', [], { version: 2 }, { seen: ['u1/1-1-1'] }]) {
      expect(sanitizeProgress(raw)).toEqual(emptyProgress());
    }
  });

  it('차시 id 모양이 틀린 것, 문자열이 아닌 것은 버리고 겹침은 한 번만 남긴다', () => {
    const state = sanitizeProgress({
      version: 1,
      seen: ['u1/1-1-1', 'bad', 7, 'u9/1', 'u1/1-1-2', 'u1/1-1-1'],
      done: 'nope',
    });
    expect(state.seen).toEqual(['u1/1-1-2', 'u1/1-1-1']);
    expect(state.done).toEqual([]);
  });

  it('목록은 최대 200개이고 오래된 것부터 버린다', () => {
    const many = Array.from({ length: 260 }, (_, index) => `u1/x${index}`);
    const state = sanitizeProgress({ version: 1, seen: many, done: many });
    expect(state.seen).toHaveLength(200);
    expect(state.seen[0]).toBe('u1/x60');
    expect(state.seen[199]).toBe('u1/x259');
    expect(state.done).toHaveLength(200);
  });

  it('모르는 칸은 버린다', () => {
    const state = sanitizeProgress({ version: 1, seen: [], done: [], last: null, lastLab: null, nickname: '철수', extra: { a: 1 } });
    expect(state).toEqual(emptyProgress());
    expect(Object.keys(state).sort()).toEqual(['done', 'last', 'lastLab', 'seen', 'version']);
  });

  it('last는 모든 칸이 맞아야 받고 주소는 사이트 안 경로만 받는다', () => {
    const good = { ...L1, at: 5 };
    expect(sanitizeProgress({ version: 1, last: good }).last).toEqual(good);
    for (const href of ['https://example.com/x', '//example.com/x', 'javascript:alert(1)', 'learn/u1/', '/a b/', '/a\\b', '', 5]) {
      expect(sanitizeProgress({ version: 1, last: { ...good, href } }).last, String(href)).toBeNull();
    }
    expect(sanitizeProgress({ version: 1, last: { ...good, id: 'zzz' } }).last).toBeNull();
    expect(sanitizeProgress({ version: 1, last: { ...good, title: '  ' } }).last).toBeNull();
    expect(sanitizeProgress({ version: 1, last: { ...good, at: 'now' } }).last).toBeNull();
    expect(sanitizeProgress({ version: 1, last: { ...good, at: -1 } }).last).toBeNull();
  });

  it('제목은 한 줄로 다듬고 길이를 자른다', () => {
    const state = sanitizeProgress({ version: 1, last: { ...L1, title: `  가\n나\t${'다'.repeat(300)}`, at: 1 } });
    expect(state.last?.title.startsWith('가 나 다')).toBe(true);
    expect(state.last?.title.length).toBe(120);
  });

  it('lastLab도 같은 규칙이다', () => {
    const lab = { path: '/ai-physical-computing/labs/vision/', title: '영상처리 실습실', at: 9 };
    expect(sanitizeProgress({ version: 1, lastLab: lab }).lastLab).toEqual(lab);
    expect(sanitizeProgress({ version: 1, lastLab: { ...lab, path: 'https://x.test/' } }).lastLab).toBeNull();
    expect(sanitizeProgress({ version: 1, lastLab: { ...lab, title: 3 } }).lastLab).toBeNull();
  });
});

describe('readProgress', () => {
  it('JSON이 깨졌으면 빈 진도', () => {
    const storage = new MemoryStorage();
    storage.setItem(storageKey(PROGRESS_STORAGE_NAME), '{깨짐');
    expect(readProgress(storage)).toEqual(emptyProgress());
  });

  it('저장 공간이 막혀도 오류 없이 빈 진도, 쓰기도 오류 없이 바뀐 값을 돌려준다', () => {
    const broken = new BrokenStorage();
    expect(readProgress(broken)).toEqual(emptyProgress());
    expect(readProgress(null)).toEqual(emptyProgress());
    const state = markSeen(L1, broken, 1000);
    expect(state.seen).toEqual(['u1/1-1-1']);
    expect(setDone('u1/1-1-1', true, broken).done).toEqual(['u1/1-1-1']);
    expect(() => clearProgress(broken)).not.toThrow();
    expect(markSeen(L1, null, 1).last?.id).toBe('u1/1-1-1');
  });
});

describe('markSeen', () => {
  it('seen에 더하고 last를 갱신한다', () => {
    const storage = new MemoryStorage();
    markSeen(L1, storage, 1000);
    const state = markSeen(L2, storage, 2000);
    expect(state.seen).toEqual(['u1/1-1-1', 'u1/1-1-2']);
    expect(state.last).toEqual({ ...L2, at: 2000 });
    expect(readProgress(storage)).toEqual(state);
  });

  it('다시 열면 맨 뒤로 가고 겹치지 않는다', () => {
    const storage = new MemoryStorage();
    markSeen(L1, storage, 1);
    markSeen(L2, storage, 2);
    const state = markSeen(L1, storage, 3);
    expect(state.seen).toEqual(['u1/1-1-2', 'u1/1-1-1']);
    expect(state.last?.at).toBe(3);
  });

  it('끝낸 표시는 건드리지 않는다', () => {
    const storage = new MemoryStorage();
    setDone('u1/1-1-1', true, storage);
    expect(markSeen(L1, storage, 5).done).toEqual(['u1/1-1-1']);
  });

  it('모양이 틀린 입력은 아무것도 바꾸지 않고 쓰지도 않는다', () => {
    const storage = new MemoryStorage();
    const state = markSeen({ ...L1, id: 'oops' }, storage, 1);
    expect(state).toEqual(emptyProgress());
    expect(markSeen({ ...L1, href: 'https://example.com/' }, storage, 1)).toEqual(emptyProgress());
    expect(storage.values.size).toBe(0);
  });

  it('시각을 주지 않으면 지금 시각을 쓴다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T00:00:00Z'));
    try {
      expect(markSeen(L1, new MemoryStorage()).last?.at).toBe(Date.parse('2026-10-09T00:00:00Z'));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('setDone', () => {
  it('끝냈다고 표시하면 seen에도 더한다', () => {
    const storage = new MemoryStorage();
    const state = setDone('u1/1-1-1', true, storage);
    expect(state.done).toEqual(['u1/1-1-1']);
    expect(state.seen).toEqual(['u1/1-1-1']);
    expect(lessonStatus(state, 'u1/1-1-1')).toBe('done');
  });

  it('표시를 풀면 done에서만 빠지고 본 기록은 남는다', () => {
    const storage = new MemoryStorage();
    setDone('u1/1-1-1', true, storage);
    const state = setDone('u1/1-1-1', false, storage);
    expect(state.done).toEqual([]);
    expect(state.seen).toEqual(['u1/1-1-1']);
    expect(lessonStatus(state, 'u1/1-1-1')).toBe('seen');
  });

  it('두 번 눌러도 겹치지 않는다', () => {
    const storage = new MemoryStorage();
    setDone('u1/1-1-1', true, storage);
    expect(setDone('u1/1-1-1', true, storage).done).toEqual(['u1/1-1-1']);
  });

  it('모양이 틀린 id는 무시한다', () => {
    const storage = new MemoryStorage();
    expect(setDone('x', true, storage)).toEqual(emptyProgress());
    expect(storage.values.size).toBe(0);
  });
});

describe('rememberLab', () => {
  it('마지막 실습실을 기억한다', () => {
    const storage = new MemoryStorage();
    markSeen(L1, storage, 1);
    const state = rememberLab({ path: '/ai-physical-computing/labs/esp32/', title: 'ESP32 실습실' }, storage, 77);
    expect(state.lastLab).toEqual({ path: '/ai-physical-computing/labs/esp32/', title: 'ESP32 실습실', at: 77 });
    expect(state.seen).toEqual(['u1/1-1-1']);
    expect(rememberLab({ path: 'https://x.test/', title: '밖' }, storage, 78).lastLab?.at).toBe(77);
  });
});

describe('clearProgress', () => {
  it('저장 이름을 지운다', () => {
    const storage = new MemoryStorage();
    markSeen(L1, storage, 1);
    clearProgress(storage);
    expect(storage.values.size).toBe(0);
    expect(readProgress(storage)).toEqual(emptyProgress());
  });
});

describe('unitSummary·lessonStatus·firstUnseen', () => {
  const ids = ['u1/1-1-1', 'u1/1-1-2', 'u1/1-1-3', 'u1/1-2-1'];

  function sample(): ProgressState {
    return { ...emptyProgress(), seen: ['u1/1-1-1', 'u1/1-1-2', 'u2/2-1-1'], done: ['u1/1-1-1'] };
  }

  it('묶음 안의 차시만 센다(끝낸 차시는 본 차시에도 든다)', () => {
    expect(unitSummary(sample(), ids)).toEqual({ total: 4, seen: 2, done: 1 });
    expect(unitSummary(emptyProgress(), ids)).toEqual({ total: 4, seen: 0, done: 0 });
    expect(unitSummary(sample(), [])).toEqual({ total: 0, seen: 0, done: 0 });
  });

  it('done이 seen에 없어도(손으로 고친 저장값) 본 차시로 센다', () => {
    const state = { ...emptyProgress(), done: ['u1/1-1-3'] };
    expect(unitSummary(state, ids)).toEqual({ total: 4, seen: 1, done: 1 });
  });

  it('같은 id가 겹쳐 들어와도 한 번만 센다', () => {
    expect(unitSummary(sample(), ['u1/1-1-1', 'u1/1-1-1', 'u1/1-1-2'])).toEqual({ total: 2, seen: 2, done: 1 });
  });

  it('lessonStatus', () => {
    const state = sample();
    expect(lessonStatus(state, 'u1/1-1-1')).toBe('done');
    expect(lessonStatus(state, 'u1/1-1-2')).toBe('seen');
    expect(lessonStatus(state, 'u1/1-1-3')).toBe('none');
  });

  it('firstUnseen은 한 번도 안 연 첫 차시를 돌려준다', () => {
    expect(firstUnseen(sample(), ids)).toBe('u1/1-1-3');
    expect(firstUnseen(emptyProgress(), ids)).toBe('u1/1-1-1');
    expect(firstUnseen({ ...emptyProgress(), seen: ids }, ids)).toBeNull();
  });
});

describe('이벤트', () => {
  function fakeDocument() {
    const events: CustomEvent<ProgressState>[] = [];
    vi.stubGlobal('document', {
      dispatchEvent: (event: Event) => {
        events.push(event as CustomEvent<ProgressState>);
        return true;
      },
    });
    return events;
  }

  it('바뀔 때마다 apc:progress-changed를 새 진도와 함께 보낸다', () => {
    const events = fakeDocument();
    const storage = new MemoryStorage();
    markSeen(L1, storage, 1);
    setDone('u1/1-1-1', true, storage);
    rememberLab({ path: '/ai-physical-computing/labs/vision/', title: '영상처리 실습실' }, storage, 2);
    clearProgress(storage);
    expect(events.map((event) => event.type)).toEqual(Array(4).fill(PROGRESS_CHANGED_EVENT));
    expect(PROGRESS_CHANGED_EVENT).toBe('apc:progress-changed');
    expect(events[0].detail.seen).toEqual(['u1/1-1-1']);
    expect(events[1].detail.done).toEqual(['u1/1-1-1']);
    expect(events[2].detail.lastLab?.title).toBe('영상처리 실습실');
    expect(events[3].detail).toEqual(emptyProgress());
  });

  it('모양이 틀린 입력은 이벤트를 보내지 않는다', () => {
    const events = fakeDocument();
    markSeen({ ...L1, id: 'bad' }, new MemoryStorage(), 1);
    setDone('bad', true, new MemoryStorage());
    expect(events).toHaveLength(0);
  });

  it('document가 없는 환경(Node)에서도 오류가 없다', () => {
    expect(() => markSeen(L1, new MemoryStorage(), 1)).not.toThrow();
  });
});
