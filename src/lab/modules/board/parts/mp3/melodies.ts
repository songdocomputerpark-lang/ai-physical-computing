/**
 * 가상 MP3 모듈의 트랙 1~3 — 음원 파일 대신 브라우저가 합성하는 짧은 멜로디(PLAN §6.5 PD-16 "자체 작곡 또는 보호기간이 끝난 곡만", 순수 데이터).
 *
 * 세 곡 모두 이 사이트가 지은 것이다(음계·화음을 오르내리는 짧은 가락 — 다른 곡을 옮기지 않았다).
 *   1번 "안내 차임"(3.6초): 도·미·솔·도 오르고 내린 뒤 솔 — f071 "10초마다 안내 방송"에 어울리게
 *   2번 "밝은 걸음"(4.8초): 다장조 차례걸음
 *   3번 "잔잔한 저녁"(4.2초): 가단조로 천천히 내려감
 * 곡 길이는 파이썬 흉내(apc_part_mp3.py TRACK_LENGTHS_MS)와 같아야 한다 — 곡이 끝나는 가상 시각·0x3D 응답이 이 길이로 정해진다
 * (tests/unit/board-uart/mp3-melodies.test.ts가 두 파일을 맞춰 본다).
 */

/** 음 하나: MIDI 번호(60 = 가운데 도, null = 쉼)와 길이(ms) */
export interface MelodyNote {
  readonly midi: number | null;
  readonly ms: number;
}

export interface MelodyTrack {
  readonly title: string;
  readonly notes: readonly MelodyNote[];
}

const n = (midi: number | null, ms: number): MelodyNote => ({ midi, ms });

export const TRACKS: readonly MelodyTrack[] = Object.freeze([
  {
    title: '안내 차임',
    notes: [n(72, 300), n(76, 300), n(79, 300), n(84, 300), n(null, 300), n(84, 300), n(79, 300), n(76, 300), n(72, 300), n(null, 300), n(79, 600)],
  },
  {
    title: '밝은 걸음',
    notes: [
      n(60, 400),
      n(62, 400),
      n(64, 400),
      n(60, 400),
      n(64, 400),
      n(65, 400),
      n(67, 800),
      n(67, 200),
      n(69, 200),
      n(67, 200),
      n(65, 200),
      n(64, 400),
      n(60, 400),
    ],
  },
  {
    title: '잔잔한 저녁',
    notes: [n(69, 600), n(67, 300), n(65, 300), n(64, 600), n(62, 300), n(64, 300), n(60, 900), n(null, 300), n(57, 600)],
  },
]);

/** 트랙 번호(1부터)의 곡. 없으면 null */
export function trackOf(number: number): MelodyTrack | null {
  return Number.isInteger(number) && number >= 1 && number <= TRACKS.length ? (TRACKS[number - 1] ?? null) : null;
}

/** 곡 길이(ms) */
export function trackLengthMs(track: MelodyTrack): number {
  return track.notes.reduce((sum, note) => sum + note.ms, 0);
}

/** MIDI 번호 → 주파수(Hz, A4 = 69 = 440Hz 평균율) */
export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** 곡의 offsetMs 지점부터 소리 낼 음 목록: [{ hz, startMs(지금부터), ms }] — 걸쳐 있는 음은 남은 길이만 */
export function notesFrom(track: MelodyTrack, offsetMs: number): { hz: number; startMs: number; ms: number }[] {
  const scheduled: { hz: number; startMs: number; ms: number }[] = [];
  let at = 0;
  for (const note of track.notes) {
    const end = at + note.ms;
    if (end > offsetMs && note.midi !== null) {
      const start = Math.max(at, offsetMs);
      scheduled.push({ hz: midiToHz(note.midi), startMs: start - offsetMs, ms: end - start });
    }
    at = end;
  }
  return scheduled;
}

/** DFPlayer 볼륨(0~30) → 합성 소리 크기(0~0.22). 사람 귀는 크기를 로그로 느끼므로 1.6제곱으로 줄인다 */
export function volumeGain(volume: number): number {
  const clamped = Math.min(30, Math.max(0, Number.isFinite(volume) ? volume : 0));
  return Math.round(0.22 * (clamped / 30) ** 1.6 * 10000) / 10000;
}
