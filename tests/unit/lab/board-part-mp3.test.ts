// 부품 mp3(DFPlayer Mini 계열 MP3 모듈) 단위 테스트 — README 7.5 "부품 하나 = 테스트 파일 하나", PLAN §6.2 "MP3 모듈"·§8.3 P3-05.
// 모듈 흉내 상태 → 모습(순수 함수)과 합성 소리 잇기(mp3-voice.ts — 가짜 Web Audio). 프레임 해석·명령은 파이썬 쪽(pyodide-mp3.test.ts)이 본다.
// (구역 C 병렬 제작: 통합 때 tests/unit/board-uart/에서 tests/unit/lab/board-part-mp3.test.ts로 옮긴 파일.)
import { describe, expect, it } from 'vitest';
import type { BoardAudio } from '../../../src/lab/modules/board/board-audio.ts';
import { stoppedSnapshot, type PartDeviceState } from '../../../src/lab/modules/board/state.ts';
import { PART_DEFINITIONS } from '../../../src/lab/modules/board/parts.ts';
import mp3, { ISSUE_SHORT, mp3ShortText, mp3StatusText, mp3Visual, parseMp3State } from '../../../src/lab/modules/board/parts/mp3/part.ts';
import { createMp3Voice } from '../../../src/lab/modules/board/parts/mp3/mp3-voice.ts';
import { snapshotWith } from './helpers/board-snapshot.ts';

function device(state: Record<string, unknown>): PartDeviceState {
  return { seq: 1, state: { v: 1, status: 'stopped', track: 0, volume: 30, eq: 0, loop: 'none', playId: 0, positionMs: 0, commands: 0, last: null, ignored: 0, issue: '', issueText: '', replies: 0, ...state } };
}

describe('mp3 부품 정의', () => {
  it('레지스트리에 있고 원고 162쪽 결선(모듈 RX ← 보드 TX 17, 모듈 TX → 보드 RX 16), 소리 부품', () => {
    expect(PART_DEFINITIONS.get('mp3')).toBe(mp3);
    expect(mp3.pins.map((pin) => [pin.role, pin.direction])).toEqual([
      ['rx', 'out'],
      ['tx', 'in'],
    ]);
    expect(mp3.defaultPins).toEqual({ rx: 17, tx: 16 });
    expect(mp3.sound).toBe(true);
  });
});

describe('parseMp3State·mp3Visual', () => {
  it('없거나 틀린 상태는 전원 직후 모습(멈춤·볼륨 30)', () => {
    expect(parseMp3State(undefined)).toMatchObject({ status: 'stopped', track: 0, volume: 30, loop: 'none', issue: '' });
    expect(parseMp3State({ seq: 1, state: { status: 'dancing', loop: 'twice', volume: 'loud' } })).toMatchObject({ status: 'stopped', loop: 'none', volume: 30 });
  });

  it('재생 중이면 곡·볼륨·반복·까닭을 모습 값으로', () => {
    const visual = mp3Visual(snapshotWith([], 'run'), device({ status: 'playing', track: 2, volume: 20, loop: 'one', playId: 3, commands: 4, issue: 'checksum' }));
    expect(visual).toEqual({ playing: true, status: 'playing', track: 2, volume: 20, loop: 'one', play: 3, commands: 4, issue: 'checksum' });
    expect(mp3StatusText(visual)).toBe('2번 곡 재생 중 · 한 곡 반복');
  });

  it('[정지]하면 멈춘 모습(까닭 글도 지움), 코드가 끝나도(end) 곡은 계속', () => {
    const playing = device({ status: 'playing', track: 1, playId: 1, issue: 'baud' });
    expect(mp3Visual(stoppedSnapshot(snapshotWith([], 'run')), playing)).toMatchObject({ playing: false, status: 'stopped', issue: '' });
    expect(mp3Visual(snapshotWith([], 'end'), playing)).toMatchObject({ playing: true, status: 'playing', issue: 'baud' });
  });

  it('그림 안 짧은 글은 모듈 폭에 들어가게 반복 표시 없이, 까닭은 9글자 안으로', () => {
    expect(mp3ShortText({ status: 'playing', track: 3, loop: 'all' })).toBe('3번 곡 재생 중');
    expect(mp3ShortText({ status: 'stopped', commands: 0 })).toBe('명령을 기다려요');
    expect(mp3ShortText({ status: 'stopped', commands: 1 })).toBe('멈춤');
    for (const text of Object.values(ISSUE_SHORT)) {
      expect(text.length, text).toBeLessThanOrEqual(9);
    }
    expect(Object.keys(ISSUE_SHORT).sort()).toEqual(['baud', 'checksum', 'frame', 'no-file', 'sleeping', 'unsupported', 'volume']);
  });

  it('모습 글', () => {
    expect(mp3StatusText({ status: 'paused', track: 1 })).toBe('1번 곡 일시 정지');
    expect(mp3StatusText({ status: 'sleep' })).toBe('잠자기');
    expect(mp3StatusText({ status: 'stopped', commands: 0 })).toBe('명령을 기다려요');
    expect(mp3StatusText({ status: 'stopped', commands: 2 })).toBe('멈춤');
    expect(mp3StatusText({ status: 'playing', track: 3, loop: 'all' })).toBe('3번 곡 재생 중 · 전체 반복');
  });
});

/** 가짜 Web Audio(만든 음과 예약 시각만 기록) */
function fakeAudio(enabled = true) {
  const started: { hz: number; at: number; stop: number | null }[] = [];
  const gains: number[] = [];
  let disconnected = 0;
  const param = () => ({
    value: 0,
    setValueAtTime(value: number) {
      this.value = value;
      gains.push(value);
    },
    linearRampToValueAtTime() {},
  });
  const context = {
    currentTime: 2,
    destination: {},
    createGain() {
      return { gain: param(), connect() {}, disconnect: () => (disconnected += 1) };
    },
    createOscillator() {
      const note = { hz: 0, at: -1, stop: null as number | null };
      return {
        type: 'sine',
        frequency: {
          set value(hz: number) {
            note.hz = hz;
          },
        },
        connect() {},
        disconnect: () => (disconnected += 1),
        start(at: number) {
          note.at = at;
          started.push(note);
        },
        stop(at?: number) {
          note.stop = at ?? -1;
        },
      };
    },
  };
  const audio: BoardAudio = {
    enabled,
    setEnabled() {},
    context: () => (enabled ? (context as unknown as AudioContext) : null),
    destination: () => (enabled ? ({} as AudioNode) : null),
    resume() {},
    onChange: () => () => undefined,
  };
  return { audio, started, gains, disconnectedCount: () => disconnected };
}

describe('createMp3Voice — 합성 멜로디', () => {
  it('곡의 음을 한꺼번에 예약하고(쉼표는 건너뜀) 볼륨을 소리 크기로 바꾼다', () => {
    const fake = fakeAudio();
    const voice = createMp3Voice(fake.audio);
    // 1번 곡: 음 11개 중 쉼 2개
    expect(voice.play(1, 0, 30)).toBe(9);
    expect(fake.started[0]?.hz).toBeCloseTo(523.25, 1);
    expect(fake.started[0]?.at).toBeCloseTo(2.02, 5);
    expect(voice.sounding).toBe(true);
    // 1초 지점부터면 앞의 음 3개(0.9초)는 빼고 걸친 음은 남은 길이만
    expect(voice.play(1, 1000, 15)).toBe(6);
    voice.stop();
    expect(voice.sounding).toBe(false);
    expect(fake.disconnectedCount()).toBeGreaterThan(0);
  });

  it('없는 곡이나 소리 꺼짐이면 조용히 0', () => {
    expect(createMp3Voice(fakeAudio().audio).play(9, 0, 30)).toBe(0);
    expect(createMp3Voice(fakeAudio(false).audio).play(1, 0, 30)).toBe(0);
  });
});
