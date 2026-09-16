// 음성 인식 설정(src/lab/modules/speech/settings.ts) 단위 테스트 — 가짜 저장 공간으로 검사한다(P2-13).
// 확인하는 것: 기본은 꺼짐, 저장 이름이 흉내 모듈 규약(ctx.storageName)과 같음, 저장이 막힌 브라우저에서도 오류가 없음.
import { describe, expect, it } from 'vitest';
import { STORAGE_KEY_PREFIX, storageKey, type KeyedStorageLike } from '../../../src/lib/storage.ts';
import {
  DEFAULT_SPEECH_MODE,
  SERVER_RECOGNITION_KEY,
  SERVER_RECOGNITION_NAME,
  SPEECH_MODES,
  SPEECH_MODE_KEY,
  SPEECH_MODE_NAME,
  isServerSpeechAllowed,
  isSpeechMode,
  readSpeechMode,
  saveSpeechMode,
  setServerSpeechAllowed,
} from '../../../src/lab/modules/speech/settings.ts';

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

/** 저장을 막은 브라우저(사생활 보호 모드 등) */
const blockedStorage = () => {
  throw new Error('저장 공간을 쓸 수 없어요');
};

describe('음성 설정 저장 이름', () => {
  it('흉내 모듈 규약의 ctx.storageName("…")과 같은 이름을 쓴다', () => {
    expect(SERVER_RECOGNITION_NAME).toBe('module:speech:server-recognition');
    expect(SPEECH_MODE_NAME).toBe('module:speech:mode');
    // host.ts의 ctx.storageName(name) = storageKey(`module:<id>:${name}`)
    expect(SERVER_RECOGNITION_KEY).toBe(storageKey('module:speech:server-recognition'));
    expect(SERVER_RECOGNITION_KEY).toBe(`${STORAGE_KEY_PREFIX}module:speech:server-recognition`);
    expect(SPEECH_MODE_KEY).toBe(storageKey('module:speech:mode'));
  });
});

describe('서버 음성 인식 허용(교사용)', () => {
  it('기본은 꺼짐이고, 켜고 끈 값이 그 브라우저에만 남는다', () => {
    const storage = new MemoryStorage();
    expect(isServerSpeechAllowed(storage)).toBe(false);

    expect(setServerSpeechAllowed(true, storage)).toBe(true);
    expect(storage.getItem(SERVER_RECOGNITION_KEY)).toBe('1');
    expect(isServerSpeechAllowed(storage)).toBe(true);

    expect(setServerSpeechAllowed(false, storage)).toBe(true);
    expect(storage.getItem(SERVER_RECOGNITION_KEY)).toBe('0');
    expect(isServerSpeechAllowed(storage)).toBe(false);
  });

  it('값이 없거나 이상하면 꺼짐으로 본다(안전한 쪽이 기본값)', () => {
    const storage = new MemoryStorage();
    for (const value of ['', '0', 'true', 'yes', '켜짐', '{}']) {
      storage.setItem(SERVER_RECOGNITION_KEY, value);
      expect(isServerSpeechAllowed(storage), value).toBe(false);
    }
  });

  it('기록을 지우면(이름이 사라지면) 다시 꺼짐이 된다', () => {
    const storage = new MemoryStorage();
    setServerSpeechAllowed(true, storage);
    storage.removeItem(SERVER_RECOGNITION_KEY);
    expect(isServerSpeechAllowed(storage)).toBe(false);
  });

  it('저장이 막힌 브라우저에서도 오류 없이 false를 돌려준다', () => {
    expect(isServerSpeechAllowed(blockedStorage)).toBe(false);
    expect(setServerSpeechAllowed(true, blockedStorage)).toBe(false);
    expect(isServerSpeechAllowed(null)).toBe(false);
    expect(setServerSpeechAllowed(true, null)).toBe(false);
  });
});

describe('고른 방식 기억하기', () => {
  it('기본은 글자 입력이고 방식 이름은 셋뿐이다', () => {
    expect(DEFAULT_SPEECH_MODE).toBe('text');
    expect([...SPEECH_MODES]).toEqual(['text', 'ondevice', 'server']);
    expect(isSpeechMode('server')).toBe(true);
    expect(isSpeechMode('mic')).toBe(false);
    expect(isSpeechMode(undefined)).toBe(false);
  });

  it('저장한 방식을 돌려주지만, 지금 고를 수 없는 방식이면 글자 입력으로 되돌린다', () => {
    const storage = new MemoryStorage();
    expect(saveSpeechMode('server', storage)).toBe(true);
    expect(readSpeechMode(['text', 'ondevice', 'server'], storage)).toBe('server');
    // 교사가 설정을 끄면 고를 수 있는 목록에서 빠지므로 글자 입력으로
    expect(readSpeechMode(['text', 'ondevice'], storage)).toBe('text');
    expect(readSpeechMode(['text'], storage)).toBe('text');
  });

  it('이상한 값이 저장돼 있으면 글자 입력으로 본다', () => {
    const storage = new MemoryStorage();
    storage.setItem(SPEECH_MODE_KEY, 'google');
    expect(readSpeechMode(undefined, storage)).toBe('text');
    expect(saveSpeechMode('google' as never, storage)).toBe(true);
    expect(storage.getItem(SPEECH_MODE_KEY)).toBe('text');
  });
});
