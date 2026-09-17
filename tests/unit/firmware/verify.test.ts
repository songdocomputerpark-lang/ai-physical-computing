// 받은 펌웨어 파일 검증(src/lab/firmware/verify.ts) — 완료 기준 "파일 검증(크기·해시) 로직이 단위 테스트로 맞다".
// 순서: 크기 → ESP32 이미지 머리 → SHA-256. 하나라도 틀리면 굽지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { defaultFirmware, parseFirmwareManifest } from '../../../src/lab/firmware/manifest.ts';
import { readEsp32ImageHeader, sha256Hex, toHex, verifyFirmwareImage } from '../../../src/lab/firmware/verify.ts';
import { sha256Of, syntheticImage } from './helpers/synthetic-image.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const STAGED_FIRMWARE = path.join(ROOT, '.cache', 'firmware-staging', 'ESP32_GENERIC-20260824-v1.29.0.bin');

function infoFor(image: Uint8Array) {
  return { size: image.length, sha256: sha256Of(image), chip: 'ESP32' };
}

describe('verifyFirmwareImage', () => {
  it('크기·이미지 머리·SHA-256이 모두 맞으면 통과하고 머리 정보를 준다', async () => {
    const image = syntheticImage(20_000);
    const result = await verifyFirmwareImage(image, infoFor(image));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sha256).toBe(sha256Of(image));
      expect(result.header).toEqual({ segments: 3, flashMode: 'DIO', flashSize: '4MB', chipId: 0, hashAppended: false });
    }
  });

  it('크기가 다르면(잘린 파일·한 바이트 더) SHA-256을 계산하기 전에 size로 멈춘다', async () => {
    const image = syntheticImage(20_000);
    let digestCalls = 0;
    const subtle = {
      digest: async (algorithm: string, data: BufferSource) => {
        digestCalls += 1;
        return globalThis.crypto.subtle.digest(algorithm, data);
      },
    };
    const short = await verifyFirmwareImage(image.slice(0, 19_999), infoFor(image), subtle);
    expect(short).toMatchObject({ ok: false, reason: 'size', expected: '20000', actual: '19999' });
    const long = await verifyFirmwareImage(new Uint8Array(20_001), infoFor(image), subtle);
    expect(long).toMatchObject({ ok: false, reason: 'size' });
    expect(digestCalls).toBe(0);
    if (!short.ok) {
      expect(short.message).toBe('받은 파일의 크기(19999바이트)가 적힌 크기(20000바이트)와 달라요.');
    }
  });

  it('크기는 같아도 한 바이트만 달라지면 sha256으로 멈춘다', async () => {
    const image = syntheticImage(20_000);
    const tampered = image.slice();
    tampered[12_345] = tampered[12_345]! ^ 0x01;
    const result = await verifyFirmwareImage(tampered, infoFor(image));
    expect(result).toMatchObject({ ok: false, reason: 'sha256', expected: sha256Of(image), actual: sha256Of(tampered) });
  });

  it('학교 차단 안내 같은 HTML이 같은 크기로 오면 이미지 머리(0xE9)에서 멈춘다', async () => {
    const html = new TextEncoder().encode('<!doctype html><title>차단</title>'.padEnd(2_000, ' '));
    const result = await verifyFirmwareImage(html, { size: html.length, sha256: sha256Of(html), chip: 'ESP32' });
    expect(result).toMatchObject({ ok: false, reason: 'image', expected: 'ESP32 이미지(0xE9)', actual: '0x3c' });
  });

  it('다른 칩용 이미지(칩 id 9 = ESP32-S3)는 ESP32용이 아니라고 멈춘다', async () => {
    const image = syntheticImage(8_000);
    image[12] = 9;
    const result = await verifyFirmwareImage(image, infoFor(image));
    expect(result).toMatchObject({ ok: false, reason: 'image', actual: '칩 번호 9' });
  });

  it('Web Crypto가 없는 곳(보안 연결 아님)에서는 no-crypto로 멈춘다', async () => {
    const image = syntheticImage(8_000);
    expect(await verifyFirmwareImage(image, infoFor(image), null)).toMatchObject({ ok: false, reason: 'no-crypto' });
  });

  it('SHA-256 도우미는 큰 버퍼의 일부만 계산한다', async () => {
    const whole = syntheticImage(10_000);
    const part = whole.subarray(100, 5_100);
    expect(await sha256Hex(part)).toBe(sha256Of(part));
    expect(toHex(Uint8Array.of(0, 15, 255))).toBe('000fff');
  });

  it('이미지 머리 읽기: 너무 짧거나 세그먼트 수가 0·17이면 null', () => {
    expect(readEsp32ImageHeader(Uint8Array.of(0xe9, 3))).toBeNull();
    const image = syntheticImage(100);
    image[1] = 0;
    expect(readEsp32ImageHeader(image)).toBeNull();
    image[1] = 17;
    expect(readEsp32ImageHeader(image)).toBeNull();
  });

  it.runIf(fs.existsSync(STAGED_FIRMWARE))('운영자가 받은 실제 파일(.cache/firmware-staging)은 목록의 크기·SHA-256과 맞고 ESP32·DIO·4MB 이미지다', async () => {
    const manifest = parseFirmwareManifest(JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'firmware', 'manifest.json'), 'utf8')));
    const image = new Uint8Array(fs.readFileSync(STAGED_FIRMWARE));
    const result = await verifyFirmwareImage(image, defaultFirmware(manifest));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.header).toEqual({ segments: 3, flashMode: 'DIO', flashSize: '4MB', chipId: 0, hashAppended: true });
    }
  });
});
