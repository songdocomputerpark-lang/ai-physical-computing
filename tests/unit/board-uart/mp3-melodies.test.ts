// 가상 MP3 모듈의 합성 멜로디(src/lab/modules/board/parts/mp3/melodies.ts) — PLAN §6.5 PD-16 합성 음원.
// 곡 길이는 파이썬 흉내(apc_part_mp3.py TRACK_LENGTHS_MS)와 같아야 곡이 끝나는 가상 시각·0x3D 응답이 소리와 맞는다 — 두 파일을 맞춰 본다.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TRACKS, midiToHz, notesFrom, trackLengthMs, trackOf, volumeGain } from '../../../src/lab/modules/board/parts/mp3/melodies.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const PYTHON = fs.readFileSync(path.join(REPO_ROOT, 'src/lab/modules/board/parts/mp3/apc_part_mp3.py'), 'utf8');

describe('트랙과 파이썬 흉내', () => {
  it('곡 수와 길이가 apc_part_mp3.py TRACK_LENGTHS_MS와 같다', () => {
    const match = /^TRACK_LENGTHS_MS\s*=\s*\(([^)]*)\)/mu.exec(PYTHON);
    expect(match, 'TRACK_LENGTHS_MS 줄').not.toBeNull();
    const lengths = (match?.[1] ?? '')
      .split(',')
      .map((part) => part.trim().replace(/_/gu, ''))
      .filter((part) => part !== '')
      .map(Number);
    expect(TRACKS.map(trackLengthMs)).toEqual(lengths);
    expect(TRACKS.map((track) => track.title)).toEqual(['안내 차임', '밝은 걸음', '잔잔한 저녁']);
  });

  it('trackOf는 1부터, 없는 번호는 null', () => {
    expect(trackOf(1)).toBe(TRACKS[0]);
    expect(trackOf(3)).toBe(TRACKS[2]);
    expect(trackOf(0)).toBeNull();
    expect(trackOf(4)).toBeNull();
    expect(trackOf(1.5)).toBeNull();
  });
});

describe('음 계산', () => {
  it('평균율 주파수', () => {
    expect(midiToHz(69)).toBe(440);
    expect(midiToHz(60)).toBeCloseTo(261.63, 2);
    expect(midiToHz(81)).toBeCloseTo(880, 6);
  });

  it('시작 지점부터 음 목록(걸친 음은 남은 길이, 쉼은 없음)', () => {
    const chime = trackOf(1);
    expect(chime).not.toBeNull();
    const all = notesFrom(chime!, 0);
    expect(all).toHaveLength(9);
    expect(all[0]).toMatchObject({ startMs: 0, ms: 300 });
    expect(all[4]).toMatchObject({ startMs: 1500, ms: 300 });
    const later = notesFrom(chime!, 1650);
    expect(later[0]).toMatchObject({ startMs: 0, ms: 150 });
    expect(notesFrom(chime!, 3600)).toEqual([]);
  });

  it('볼륨 0~30 → 소리 크기(범위 밖은 자름)', () => {
    expect(volumeGain(30)).toBe(0.22);
    expect(volumeGain(0)).toBe(0);
    expect(volumeGain(15)).toBeCloseTo(0.22 * 0.5 ** 1.6, 3);
    expect(volumeGain(99)).toBe(0.22);
    expect(volumeGain(Number.NaN)).toBe(0);
  });
});
