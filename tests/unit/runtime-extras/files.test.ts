// 파일 패널의 순수 논리(src/lab/modules/runtime-extras/files.ts) — 목록 합치기·크기 글·파일 형식(P2-10).
// DOM을 만지는 [내려받기]·[파일 넣기]는 tests/e2e/lab-runner.spec.ts가 본다.
import { describe, expect, it } from 'vitest';
import { KIND_LABELS, formatBytes, isImageFile, mergeFileEntries, mimeTypeFor, type KnownBytes } from '../../../src/lab/modules/runtime-extras/files.ts';

function known(parts: Partial<Record<keyof KnownBytes, Record<string, number[]>>> = {}): KnownBytes {
  const toMap = (record: Record<string, number[]> | undefined) =>
    new Map(Object.entries(record ?? {}).map(([name, bytes]) => [name, Uint8Array.from(bytes)]));
  return { provided: toMap(parts.provided), uploaded: toMap(parts.uploaded), saved: toMap(parts.saved) };
}

describe('작업 폴더 목록 합치기', () => {
  it('파이썬 목록과 화면이 아는 바이트를 합치고 종류를 붙인다', () => {
    const entries = mergeFileEntries(
      [
        { name: 'mask.png', size: 1200 },
        { name: '메모.txt', size: 6 },
      ],
      known({ provided: { 'mask.png': [1, 2, 3] } }),
    );
    expect(entries.map((entry) => [entry.name, entry.kind, entry.size, entry.downloadable])).toEqual([
      ['mask.png', 'provided', 1200, true],
      ['메모.txt', 'other', 6, false],
    ]);
  });

  it('코드가 저장한 것을 맨 위에 두고, 같은 이름이면 저장 > 넣음 > 사이트 제공 순으로 정한다', () => {
    const entries = mergeFileEntries(
      [
        { name: 'b.png', size: 10 },
        { name: 'mask.png', size: 20 },
        { name: 'a.txt', size: 30 },
      ],
      known({ provided: { 'mask.png': [1] }, uploaded: { 'a.txt': [1, 2] }, saved: { 'b.png': [1, 2, 3], 'mask.png': [9] } }),
    );
    expect(entries.map((entry) => [entry.name, entry.kind])).toEqual([
      ['b.png', 'saved'],
      ['mask.png', 'saved'],
      ['a.txt', 'uploaded'],
    ]);
    expect(KIND_LABELS.saved).toBe('코드가 저장');
  });

  it('목록에 없어도 화면이 아는 파일(방금 저장 알림이 온 것)은 넣고 크기는 바이트 수로 센다', () => {
    const entries = mergeFileEntries([], known({ saved: { '결과.png': [1, 2, 3, 4, 5] } }));
    expect(entries).toEqual([{ name: '결과.png', size: 5, kind: 'saved', downloadable: true }]);
  });

  it('같은 종류는 이름 순(숫자는 숫자 순)으로 늘어놓는다', () => {
    const entries = mergeFileEntries(
      [
        { name: '결과10.png', size: 1 },
        { name: '결과2.png', size: 1 },
        { name: '가나.png', size: 1 },
      ],
      known(),
    );
    expect(entries.map((entry) => entry.name)).toEqual(['가나.png', '결과2.png', '결과10.png']);
  });
});

describe('크기 글과 파일 형식', () => {
  it('1KB 미만은 바이트, 그 위는 KB·MB로 적는다', () => {
    expect(formatBytes(0)).toBe('0바이트');
    expect(formatBytes(1023)).toBe('1,023바이트');
    expect(formatBytes(1536)).toBe('1.5KB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0MB');
    expect(formatBytes(-5)).toBe('0바이트');
    expect(formatBytes(Number.NaN)).toBe('0바이트');
  });

  it('확장자로 MIME 형식을 고르고 그림 파일을 가려낸다', () => {
    expect(mimeTypeFor('결과.PNG')).toBe('image/png');
    expect(mimeTypeFor('a.jpeg')).toBe('image/jpeg');
    expect(mimeTypeFor('메모.txt')).toBe('text/plain;charset=utf-8');
    expect(mimeTypeFor('내글꼴.otf')).toBe('font/otf');
    expect(mimeTypeFor('이름없음')).toBe('application/octet-stream');
    expect(isImageFile('a.png')).toBe(true);
    expect(isImageFile('a.py')).toBe(false);
  });
});
