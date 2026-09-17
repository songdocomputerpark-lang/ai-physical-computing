// 펌웨어 목록(public/firmware/manifest.json)과 그 검사(src/lab/firmware/manifest.ts·manifest-file.ts).
// 목록의 값은 운영자가 공식 주소에서 받아 확인한 파일과 공식 페이지(2026-09-18 확인)를 따른다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  defaultFirmware,
  FirmwareManifestError,
  formatMegabytes,
  formatOffset,
  formatWithCommas,
  isSiteFirmwarePath,
  parseFirmwareInfo,
  parseFirmwareManifest,
  parseOffset,
  parseSizeLabel,
} from '../../../src/lab/firmware/manifest.ts';
import { readFirmwareManifestFile } from '../../../src/lab/firmware/manifest-file.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const MANIFEST_PATH = path.join(ROOT, 'public', 'firmware', 'manifest.json');
const raw = () => JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as { schema: number; firmware: Record<string, unknown>[] };

function problemsOf(value: unknown): string[] {
  try {
    parseFirmwareManifest(value);
  } catch (error) {
    if (error instanceof FirmwareManifestError) {
      return [...error.problems];
    }
    throw error;
  }
  return [];
}

function withFirmware(patch: Record<string, unknown>): unknown {
  const data = raw();
  return { ...data, firmware: [{ ...data.firmware[0], ...patch }] };
}

describe('public/firmware/manifest.json', () => {
  it('형식이 맞고 첫 항목이 MicroPython ESP32_GENERIC v1.29.0(공식 파일 이름·크기·SHA-256·굽는 위치 0x1000)이다', () => {
    const manifest = parseFirmwareManifest(raw());
    const firmware = defaultFirmware(manifest);
    expect(firmware).toMatchObject({
      id: 'micropython-esp32-generic',
      title: 'MicroPython',
      board: 'ESP32_GENERIC',
      chip: 'ESP32',
      version: '1.29.0',
      releaseDate: '2026-08-24',
      path: 'firmware/v1.29.0/ESP32_GENERIC-20260824-v1.29.0.bin',
      fileName: 'ESP32_GENERIC-20260824-v1.29.0.bin',
      size: 1_790_544,
      sha256: 'e67ad6015a0a504c1fec9aa9bbf589d0432ed28e62546f4f8dd8a147f8bd95f6',
      offset: 0x1000,
      minFlashBytes: 4 * 1024 * 1024,
      license: 'MIT',
      noticePath: 'firmware/v1.29.0/NOTICE.txt',
      sourceUrl: 'https://micropython.org/resources/firmware/ESP32_GENERIC-20260824-v1.29.0.bin',
      downloadPage: 'https://micropython.org/download/ESP32_GENERIC/',
    });
    expect(firmware.hashSource).toContain('공식 페이지에 해시 표기가 없어');
  });

  it('고지 파일이 있고 MicroPython MIT 라이선스 전문과 공식 주소·SHA-256을 담았다. 펌웨어 파일은 아직 없다(통합 단계가 넣는다)', () => {
    const warnings: string[] = [];
    const { files } = readFirmwareManifestFile(ROOT, { warn: (message) => warnings.push(message) });
    expect(files).toHaveLength(1);
    expect(files[0]!.noticePresent).toBe(true);
    const notice = fs.readFileSync(path.join(ROOT, 'public', 'firmware', 'v1.29.0', 'NOTICE.txt'), 'utf8');
    expect(notice).toContain('Copyright (c) 2013-2026 Damien P. George');
    expect(notice).toContain('THE SOFTWARE IS PROVIDED "AS IS"');
    expect(notice).toContain('e67ad6015a0a504c1fec9aa9bbf589d0432ed28e62546f4f8dd8a147f8bd95f6');
    expect(notice).toContain('https://micropython.org/download/ESP32_GENERIC/');
    if (files[0]!.present) {
      // 통합 단계가 파일을 넣은 뒤: 크기가 목록과 같아야 한다(SHA-256은 verify.test.ts의 실제 파일 검사가 본다)
      expect(fs.statSync(path.join(ROOT, 'public', 'firmware', 'v1.29.0', 'ESP32_GENERIC-20260824-v1.29.0.bin')).size).toBe(1_790_544);
    } else {
      expect(warnings.join('\n')).toContain('public/firmware/v1.29.0/ESP32_GENERIC-20260824-v1.29.0.bin이(가) 아직 없어요');
    }
  });

  it('public/firmware/ 안에는 목록·고지·목록에 적힌 펌웨어 파일만 둔다(다른 바이너리가 섞이지 않게)', () => {
    const manifest = parseFirmwareManifest(raw());
    const allowed = new Set(['firmware/manifest.json', ...manifest.firmware.flatMap((item) => [item.path, ...(item.noticePath ? [item.noticePath] : [])])]);
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));
    const found = walk(path.join(ROOT, 'public', 'firmware')).map((file) => path.relative(path.join(ROOT, 'public'), file).split(path.sep).join('/'));
    expect(found.filter((file) => !allowed.has(file))).toEqual([]);
  });
});

describe('목록 검사', () => {
  it('틀린 값을 한국어로 모아 알린다', () => {
    const problems = problemsOf(
      withFirmware({
        id: 'Bad Id',
        chip: 'ESP32-S3',
        version: 'v1.29',
        releaseDate: '2026-02-30',
        path: '../firmware/x.bin',
        size: -1,
        sha256: 'abc',
        offset: '0x1001',
        minFlashSize: '4 GB',
        sourceUrl: 'http://micropython.org/x.bin',
        downloadPage: 'ftp://example',
        checked: '어제',
        license: '',
      }),
    );
    const text = problems.join('\n');
    expect(text).toContain('id는 영문 소문자로 시작');
    expect(text).toContain('chip은 ESP32 가운데 하나');
    expect(text).toContain('version은 1.29.0처럼');
    expect(text).toContain('releaseDate는 YYYY-MM-DD');
    expect(text).toContain('path는 "firmware/v<판>/<파일 이름>.bin"');
    expect(text).toContain('size는 1부터');
    expect(text).toContain('sha256은 16진수 64글자');
    expect(text).toContain('offset은 "0x1000"처럼 4096의 배수');
    expect(text).toContain('minFlashSize는 "4MB"처럼');
    expect(text).toContain('sourceUrl은 공식 파일의 https 주소');
    expect(text).toContain('downloadPage는');
    expect(text).toContain('checked는');
    expect(text).toContain('license(');
  });

  it('판이 경로 폴더에 없거나 sourceUrl 파일 이름이 다르면 막는다(서비스 워커 캐시 우선 규칙 때문)', () => {
    expect(problemsOf(withFirmware({ path: 'firmware/latest/ESP32_GENERIC-20260824-v1.29.0.bin' })).join('\n')).toContain('폴더 이름에 판(1.29.0)을 넣어요');
    expect(problemsOf(withFirmware({ sourceUrl: 'https://micropython.org/resources/firmware/OTHER.bin' })).join('\n')).toContain('파일 이름이 달라요');
  });

  it('SHA-256 대문자(PowerShell Get-FileHash 결과)도 받아 소문자로 바꾼다', () => {
    const info = parseFirmwareInfo({ ...raw().firmware[0], sha256: 'E67AD6015A0A504C1FEC9AA9BBF589D0432ED28E62546F4F8DD8A147F8BD95F6' });
    expect(info.sha256).toBe('e67ad6015a0a504c1fec9aa9bbf589d0432ed28e62546f4f8dd8a147f8bd95f6');
  });

  it('목록이 비었거나 형식 번호·id가 겹치면 막는다', () => {
    expect(problemsOf({ schema: 1, firmware: [] }).join('\n')).toContain('한 개 이상');
    expect(problemsOf({ schema: 2, firmware: raw().firmware }).join('\n')).toContain('schema는 1');
    expect(problemsOf({ schema: 1, firmware: [raw().firmware[0], raw().firmware[0]] }).join('\n')).toContain('겹쳐요');
    expect(() => parseFirmwareManifest('x')).toThrow(FirmwareManifestError);
  });

  it('도우미: 위치·크기 읽기, 경로 규칙, 화면 글', () => {
    expect(parseOffset('0x1000')).toBe(4096);
    expect(parseOffset(4096)).toBe(4096);
    expect(parseOffset('4096')).toBe(4096);
    expect(parseOffset('0xZZ')).toBeNull();
    expect(parseOffset(-1)).toBeNull();
    expect(parseSizeLabel('4MB')).toBe(4 * 1024 * 1024);
    expect(parseSizeLabel('512KB')).toBe(512 * 1024);
    expect(parseSizeLabel('4 GB')).toBeNull();
    expect(isSiteFirmwarePath('firmware/v1.29.0/ESP32_GENERIC-20260824-v1.29.0.bin')).toBe(true);
    expect(isSiteFirmwarePath('firmware/../secret.bin')).toBe(false);
    expect(isSiteFirmwarePath('firmware/v1 29/a.bin')).toBe(false);
    expect(isSiteFirmwarePath('/firmware/a.bin')).toBe(false);
    expect(formatMegabytes(1_790_544)).toBe('1.7MB');
    expect(formatMegabytes(32_000)).toBe('31KB');
    expect(formatWithCommas(1_790_544)).toBe('1,790,544');
    expect(formatOffset(0x1000)).toBe('0x1000');
  });
});
