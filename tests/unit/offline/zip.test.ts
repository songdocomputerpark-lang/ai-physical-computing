// 오프라인 배포판 zip 쓰기 도구(scripts/lib/offline-zip.mjs) — P6-07.
// 쓴 zip을 저장소의 읽기 도구(scripts/lib/zip-read.mjs — 예제 이관이 쓰는 것)로 다시 읽어 이름·내용·CRC·압축 방식·권한을 대조한다.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { ZipWriter, assertSafeEntryName, dosDateTime, methodFor } from '../../../scripts/lib/offline-zip.mjs';
import { listZipEntries, readZipEntry } from '../../../scripts/lib/zip-read.mjs';
import { makeTempDir, removeDir } from '../helpers/fixture.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    removeDir(dir);
  }
});

function tempZipPath(): string {
  const dir = makeTempDir('apc-offline-zip-');
  tempDirs.push(dir);
  return path.join(dir, 'out', 'test.zip');
}

/** 중앙 디렉터리 항목에서 zip-read가 읽지 않는 칸(만든 곳·외부 속성·시각)을 읽는다 */
function centralFields(buffer: Buffer): { name: string; madeBy: number; external: number; time: number; date: number; flags: number }[] {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buffer.readUInt16LE(eocd + 10);
  let at = buffer.readUInt32LE(eocd + 16);
  const out = [];
  for (let index = 0; index < count; index += 1) {
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    out.push({
      madeBy: buffer.readUInt16LE(at + 4),
      flags: buffer.readUInt16LE(at + 8),
      time: buffer.readUInt16LE(at + 12),
      date: buffer.readUInt16LE(at + 14),
      external: buffer.readUInt32LE(at + 38),
      name: buffer.subarray(at + 46, at + 46 + nameLength).toString('utf8'),
    });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return out;
}

describe('zip 쓰기(ZipWriter)', () => {
  it('쓴 zip을 저장소의 읽기 도구가 그대로 읽는다 — 한국어 이름(UTF-8 표시)·폴더·저장·deflate·CRC', () => {
    const zipPath = tempZipPath();
    const writer = new ZipWriter(zipPath, { date: new Date(2026, 8, 26, 9, 30, 44) });
    const html = '<!doctype html><title>오프라인</title>'.repeat(200);
    const wheel = Buffer.from(Array.from({ length: 4096 }, (_, index) => (index * 7) % 251));
    writer.addDirectory('top');
    writer.addDirectory('top/site/');
    writer.addFile('top/시작하기.bat', '@echo off\r\nchcp 65001 >nul\r\n');
    writer.addFile('top/읽어보세요.txt', '\ufeff한국어 안내\r\n');
    writer.addFile('top/site/index.html', html);
    writer.addFile('top/site/a.whl', wheel);
    writer.addFile('top/site/empty.txt', '');
    writer.addFile('top/server/serve.py', '#!/usr/bin/env python3\n', { executable: true });
    const summary = writer.close();
    expect(summary).toMatchObject({ entries: 8, files: 6 });
    expect(summary.bytes).toBe(fs.statSync(zipPath).size);

    const buffer = fs.readFileSync(zipPath);
    const entries = listZipEntries(buffer);
    expect(entries.map((entry) => entry.name)).toEqual([
      'top/',
      'top/site/',
      'top/시작하기.bat',
      'top/읽어보세요.txt',
      'top/site/index.html',
      'top/site/a.whl',
      'top/site/empty.txt',
      'top/server/serve.py',
    ]);
    for (const entry of entries) {
      expect(entry.utf8Flag, entry.name).toBe(true);
      expect(entry.nameEncoding).toBe('utf-8');
    }
    const byName = new Map(entries.map((entry) => [entry.name, entry]));
    expect(readZipEntry(buffer, byName.get('top/site/index.html')!).toString('utf8')).toBe(html);
    expect(byName.get('top/site/index.html')!.method).toBe(8);
    expect(byName.get('top/site/index.html')!.compressedSize).toBeLessThan(html.length);
    expect(readZipEntry(buffer, byName.get('top/site/a.whl')!).equals(wheel)).toBe(true);
    // 휠(zip 형식)은 이미 압축돼 있어 저장으로 넣는다
    expect(byName.get('top/site/a.whl')!.method).toBe(0);
    expect(readZipEntry(buffer, byName.get('top/시작하기.bat')!).toString('utf8')).toBe('@echo off\r\nchcp 65001 >nul\r\n');
    expect(readZipEntry(buffer, byName.get('top/site/empty.txt')!).length).toBe(0);
    expect(byName.get('top/')!.isDirectory).toBe(true);
  });

  it('만든 곳을 Unix로 적고 권한(파일 644·실행 755·폴더 755 + MS-DOS 폴더 비트)과 시각을 넣는다', () => {
    const zipPath = tempZipPath();
    const writer = new ZipWriter(zipPath, { date: new Date(2026, 8, 26, 9, 30, 44) });
    writer.addDirectory('top/');
    writer.addFile('top/a.txt', 'a');
    writer.addFile('top/serve.py', 'b', { executable: true });
    writer.close();
    const fields = centralFields(fs.readFileSync(zipPath));
    for (const field of fields) {
      expect(field.madeBy >> 8, field.name).toBe(3);
      expect(field.flags & 0x0800, field.name).toBe(0x0800);
      expect(field.time).toBe(dosDateTime(new Date(2026, 8, 26, 9, 30, 44)).time);
      expect(field.date).toBe(dosDateTime(new Date(2026, 8, 26, 9, 30, 44)).date);
    }
    const mode = (name: string) => (fields.find((field) => field.name === name)!.external >>> 16) & 0o177777;
    expect(mode('top/a.txt')).toBe(0o100644);
    expect(mode('top/serve.py')).toBe(0o100755);
    expect(mode('top/')).toBe(0o040755);
    expect(fields.find((field) => field.name === 'top/')!.external & 0x10).toBe(0x10);
  });

  it('더 커지는 deflate는 저장으로 바꾼다(무작위 바이트)', () => {
    const zipPath = tempZipPath();
    const writer = new ZipWriter(zipPath);
    const noise = zlib.deflateRawSync(Buffer.from('x'.repeat(10))); // 짧고 이미 압축된 조각
    writer.addFile('top/noise.bin', noise);
    writer.close();
    const [entry] = listZipEntries(fs.readFileSync(zipPath));
    expect(entry!.method).toBe(0);
    expect(entry!.compressedSize).toBe(noise.length);
  });

  it('위험한 이름·같은 이름 두 번은 막고, 닫은 뒤에는 쓰지 않는다', () => {
    for (const bad of ['', '/abs.txt', 'a\\b.txt', 'C:/x.txt', 'top/../x.txt', '..']) {
      expect(() => assertSafeEntryName(bad), bad).toThrow(/쓸 수 없어요/u);
    }
    const zipPath = tempZipPath();
    const writer = new ZipWriter(zipPath);
    writer.addFile('top/a.txt', 'a');
    expect(() => writer.addFile('top/a.txt', 'b')).toThrow(/두 번/u);
    writer.close();
    expect(() => writer.addFile('top/b.txt', 'b')).toThrow(/닫은/u);
  });

  it('abort()는 반쯤 쓴 zip을 지운다', () => {
    const zipPath = tempZipPath();
    const writer = new ZipWriter(zipPath);
    writer.addFile('top/a.txt', 'a');
    writer.abort();
    expect(fs.existsSync(zipPath)).toBe(false);
  });

  it('압축 방식: 이미 압축된 형식은 저장, 글·wasm은 deflate', () => {
    for (const name of ['a.whl', 'b.zip', 'c.woff2', 'd.webp', 'e.png', 'f.pdf', 'g.task', 'h.mp3']) {
      expect(methodFor(`site/${name}`), name).toBe(0);
    }
    for (const name of ['a.html', 'b.js', 'c.wasm', 'd.json', 'e.svg', 'f.tflite', 'g.bin', 'h.txt']) {
      expect(methodFor(`site/${name}`), name).toBe(8);
    }
  });

  it('MS-DOS 시각: 2초 단위, 1980년 앞은 1980년으로', () => {
    const stamp = dosDateTime(new Date(2026, 8, 26, 23, 59, 59));
    expect(stamp.time).toBe((23 << 11) | (59 << 5) | 29);
    expect(stamp.date).toBe(((2026 - 1980) << 9) | (9 << 5) | 26);
    expect(dosDateTime(new Date(1970, 0, 1)).date >> 9).toBe(0);
  });
});
