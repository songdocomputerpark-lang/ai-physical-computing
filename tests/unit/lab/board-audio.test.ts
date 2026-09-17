// 가상 보드 소리(src/lab/modules/board/board-audio.ts) 단위 테스트 — 병렬 제작 준비(2026-09-17).
// 진짜 AudioContext 대신 가짜를 넘겨 켜기·끄기 기억, 처음 부를 때만 만들기, [실행] 때 깨우기를 본다.
import { describe, expect, it } from 'vitest';
import { createBoardAudio, type BoardAudioHost } from '../../../src/lab/modules/board/board-audio.ts';

function fakeHost(stored: string | null = null) {
  const calls: string[] = [];
  let created = 0;
  const context = {
    state: 'suspended' as AudioContextState,
    destination: { kind: 'speaker' },
    createGain() {
      const gain = { gain: { value: 0 }, connect: (target: unknown) => calls.push(`connect:${(target as { kind?: string }).kind ?? '?'}`) };
      return gain;
    },
    resume() {
      calls.push('resume');
      context.state = 'running';
      return Promise.resolve();
    },
    suspend() {
      calls.push('suspend');
      context.state = 'suspended';
      return Promise.resolve();
    },
  };
  let saved = stored;
  const host: BoardAudioHost = {
    createContext: () => {
      created += 1;
      return context as unknown as AudioContext;
    },
    readStored: () => saved,
    writeStored: (value) => {
      saved = value;
    },
  };
  return { host, calls, context, created: () => created, saved: () => saved };
}

describe('가상 보드 소리', () => {
  it('기본은 켜짐이고, 처음 부를 때 한 번만 AudioContext와 주 음량 노드를 만든다', () => {
    const fake = fakeHost();
    const audio = createBoardAudio(fake.host);
    expect(audio.enabled).toBe(true);
    expect(fake.created()).toBe(0);
    const destination = audio.destination();
    expect(destination).not.toBeNull();
    expect(audio.context()).toBe(fake.context);
    expect(fake.created()).toBe(1);
    expect(fake.calls).toContain('connect:speaker');
  });

  it('[실행] 때 멈춘 소리를 깨우고, 끄면 멈추고 기억하며, 꺼져 있으면 소리를 낼 곳을 주지 않는다', () => {
    const fake = fakeHost();
    const audio = createBoardAudio(fake.host);
    const seen: boolean[] = [];
    audio.onChange((enabled) => seen.push(enabled));
    audio.context();
    audio.resume();
    expect(fake.calls).toContain('resume');
    audio.setEnabled(false);
    expect(fake.calls.at(-1)).toBe('suspend');
    expect(fake.saved()).toBe('off');
    expect(audio.context()).toBeNull();
    expect(audio.destination()).toBeNull();
    audio.setEnabled(true);
    expect(seen).toEqual([false, true]);
    expect(fake.saved()).toBe('on');
  });

  it('이 컴퓨터에 "끔"이 기억돼 있으면 꺼진 채로 시작하고, Web Audio가 없으면 null로 조용히 넘어간다', () => {
    const off = createBoardAudio(fakeHost('off').host);
    expect(off.enabled).toBe(false);
    expect(off.context()).toBeNull();
    const noAudio = createBoardAudio({ createContext: () => null, readStored: () => null, writeStored: () => undefined });
    expect(noAudio.context()).toBeNull();
    expect(noAudio.destination()).toBeNull();
    expect(() => noAudio.resume()).not.toThrow();
  });
});
