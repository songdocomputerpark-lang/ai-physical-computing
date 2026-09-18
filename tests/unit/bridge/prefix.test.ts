/**
 * 통신 접두어(PD-29, PLAN §7.4)를 확인한다(P4-01) — 무작위 12글자, 고정 루트 없음,
 * 기본은 탭에만 남고 [고정]을 눌러야 이 컴퓨터에 남는다.
 */
import { describe, expect, it } from 'vitest';
import {
  PREFIX_ALPHABET,
  PREFIX_LENGTH,
  createPrefix,
  ensurePrefix,
  isPinned,
  isValidPrefix,
  parsePrefix,
  pinPrefix,
  readPrefix,
  tabChannelName,
  unpinPrefix,
  writeSessionPrefix,
} from '../../../src/lab/bridge/index.ts';
import { FakeStorage } from './helpers/fake.ts';

function stores(): { session: FakeStorage; local: FakeStorage } {
  return { session: new FakeStorage(), local: new FakeStorage() };
}

describe('PD-29 — 무작위 접두어', () => {
  it('12글자이고 헷갈리는 글자(l·1·O·0)가 없다', () => {
    expect(PREFIX_LENGTH).toBe(12);
    for (const letter of ['l', '1', 'O', '0']) {
      expect(PREFIX_ALPHABET).not.toContain(letter);
    }
    const prefix = createPrefix();
    expect(prefix).toHaveLength(12);
    expect(isValidPrefix(prefix)).toBe(true);
  });

  it('무작위 값이 다르면 접두어도 다르다', () => {
    const first = createPrefix(() => Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]));
    const second = createPrefix(() => Uint8Array.from([11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]));
    expect(first).not.toBe(second);
    expect(isValidPrefix(first)).toBe(true);
  });

  it('고정 루트가 없다 — 채널 이름에 학교·사이트 주제 낱말이 들어가지 않는다', () => {
    const name = tabChannelName('7kq2m9xd4hpt');
    expect(name.endsWith('7kq2m9xd4hpt')).toBe(true);
    // 앞머리는 같은 출처의 다른 사이트와 섞이지 않게 붙인 사이트 이름뿐이다(src/lib/storage.ts와 같은 규칙)
    expect(name).toBe('ai-physical-computing:bridge:7kq2m9xd4hpt');
  });

  it('모양이 틀린 접두어는 한국어 이유와 함께 거절한다', () => {
    expect(isValidPrefix('짧다')).toBe(false);
    expect(isValidPrefix('7kq2m9xd4hp1')).toBe(false); // 1은 쓰지 않는다
    const result = parsePrefix('7kq2m9xd4hp1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('12글자');
    }
  });

  it('친구 접두어는 앞뒤 공백·대문자를 다듬어 받는다', () => {
    const result = parsePrefix('  7KQ2M9XD4HPT ');
    expect(result).toEqual({ ok: true, prefix: '7kq2m9xd4hpt' });
  });
});

describe('저장 자리 — 기본은 탭, [고정]은 이 컴퓨터', () => {
  it('새로 만들면 탭(sessionStorage)에만 남는다', () => {
    const where = stores();
    const prefix = ensurePrefix(where);
    expect(where.session.getItem('ai-physical-computing:bridge:prefix')).toBe(prefix);
    expect(where.local.length).toBe(0);
    expect(isPinned(where)).toBe(false);
  });

  it('같은 탭에서 다시 물으면 같은 접두어를 준다', () => {
    const where = stores();
    expect(ensurePrefix(where)).toBe(ensurePrefix(where));
  });

  it('[이 접두어 고정]을 누르면 이 컴퓨터에 남고 다음 탭이 이어 쓴다', () => {
    const where = stores();
    const prefix = ensurePrefix(where);
    pinPrefix(prefix, where);
    expect(isPinned(where)).toBe(true);

    // 탭을 닫았다 새로 연 상황: sessionStorage만 비어 있다
    const nextTab = { session: new FakeStorage(), local: where.local };
    expect(readPrefix(nextTab)).toBe(prefix);
  });

  it('고정을 풀면 이 컴퓨터에서 지워진다', () => {
    const where = stores();
    const prefix = ensurePrefix(where);
    pinPrefix(prefix, where);
    unpinPrefix(where);
    expect(isPinned(where)).toBe(false);
    expect(where.local.length).toBe(0);
  });

  it('고정해 둔 것이 탭의 것보다 먼저다', () => {
    const where = stores();
    writeSessionPrefix('abcdefghijkm', where);
    pinPrefix('npqrstuvwxyz', where);
    expect(readPrefix(where)).toBe('npqrstuvwxyz');
  });

  it('저장 공간을 못 쓰는 브라우저에서도 접두어는 만들어진다', () => {
    const prefix = ensurePrefix({ session: null, local: null });
    expect(isValidPrefix(prefix)).toBe(true);
  });
});
