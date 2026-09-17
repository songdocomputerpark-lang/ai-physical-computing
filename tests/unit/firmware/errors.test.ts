// 굽기 오류 → 한국어 풀이(src/lab/firmware/errors.ts). 오류 글·이름은 Web Serial 명세·Chromium, esptool-js 0.6.1, esptool.py가 실제로 내는 것.
import { describe, expect, it } from 'vitest';
import { classifyConnect, explainFlashError, FlashError } from '../../../src/lab/firmware/errors.ts';

function dom(name: string, message: string): Error {
  return new DOMException(message, name);
}

const KOREAN_SENTENCE = /[가-힣]/u;

describe('explainFlashError', () => {
  it('포트 선택 창을 닫으면 오류가 아니라 안내(notice)이고 다시 시도할 수 있다', () => {
    const explained = explainFlashError(dom('NotFoundError', "Failed to execute 'requestPort' on 'Serial': No port selected by the user."), { stage: 'port' });
    expect(explained).toMatchObject({ code: 'port-cancelled', notice: true, retry: 'same', title: '포트를 고르지 않았어요' });
  });

  it('SecurityError는 브라우저·학교 정책이 막은 것', () => {
    const explained = explainFlashError(dom('SecurityError', "Failed to execute 'requestPort' on 'Serial': Must be handling a user gesture to show a permission request."), {
      stage: 'port',
    });
    expect(explained.code).toBe('port-blocked');
    expect(explained.steps.join(' ')).toContain('직렬 포트');
  });

  it('다른 프로그램이 쓰는 포트(NetworkError: Failed to open serial port)·이미 열린 포트는 port-busy', () => {
    expect(explainFlashError(dom('NetworkError', "Failed to execute 'open' on 'SerialPort': Failed to open serial port."), { stage: 'chip' }).code).toBe('port-busy');
    const busy = explainFlashError(dom('InvalidStateError', 'The port is already open.'), { stage: 'chip' });
    expect(busy.code).toBe('port-busy');
    expect(busy.steps.join(' ')).toContain('Thonny');
    // 쓰는 도중의 InvalidStateError는 포트를 쓰는 다른 프로그램 탓이 아니다
    expect(explainFlashError(dom('InvalidStateError', 'The port is closed.'), { stage: 'write' }).code).not.toBe('port-busy');
  });

  it('"Failed to connect with the device"는 시도 기록에 따라 BOOT 안내·케이블 안내·포트 안내로 나뉜다', () => {
    const error = new Error('Failed to connect with the device');
    const wrongBoot = explainFlashError(error, { stage: 'chip', attempts: ['Wrong boot mode detected (0x13).\n        This chip needs to be in download mode.'] });
    expect(wrongBoot.code).toBe('no-download-mode');
    expect(wrongBoot.title).toBe('보드가 굽기 모드로 바뀌지 않았어요');
    expect(wrongBoot.steps[0]).toBe('보드의 BOOT 버튼을 손가락으로 누른 채로 [다시 시도]를 눌러요.');
    const noSync = explainFlashError(error, { stage: 'chip', attempts: ['Download mode successfully detected, but getting no sync reply:\n           The serial TX path seems to be down.'] });
    expect(noSync).toMatchObject({ code: 'no-sync-reply', retry: 'slow' });
    const silent = explainFlashError(error, { stage: 'chip', attempts: ['Serial data stream stopped: Possible serial noise or corruption.'], receivedOutput: false });
    expect(silent.code).toBe('no-response');
    const echoing = explainFlashError(error, { stage: 'chip', attempts: ['Serial data stream stopped: Possible serial noise or corruption.'], receivedOutput: true });
    expect(echoing.code).toBe('no-download-mode');
  });

  it('classifyConnect 우선순위: 굽기 모드 감지 > 받은 글·잘못된 부팅 > 아무것도 없음', () => {
    expect(classifyConnect(['Invalid head of packet (0x55): Possible serial noise or corruption.'])).toBe('no-download-mode');
    expect(classifyConnect(['No serial data received.', 'Serial data stream stopped: Possible serial noise or corruption.'])).toBe('no-response');
    expect(classifyConnect(['Download mode successfully detected, but getting no sync reply', 'Wrong boot mode detected (0x13).'], true)).toBe('no-sync-reply');
    expect(classifyConnect([], undefined)).toBe('no-download-mode');
  });

  it('칩이 다르면(사이트가 알아냄·esptool-js magic) 다시 시도해도 소용없거나 보드를 확인하게 한다', () => {
    const s3 = explainFlashError(new FlashError('wrong-chip', 'This chip is ESP32-S3, not ESP32.', { chip: 'ESP32-S3' }), { stage: 'chip' });
    expect(s3).toMatchObject({ code: 'wrong-chip', retry: 'none' });
    expect(s3.summary).toContain('찾은 칩은 ESP32-S3이에요');
    expect(explainFlashError(new Error('Unexpected CHIP magic value 0x12345678. Failed to autodetect chip type.'), { stage: 'chip' }).code).toBe('wrong-chip');
  });

  it('선이 빠지면 어느 단계든 device-lost가 먼저다(뒤따르는 시간 초과 글이 가리지 않게)', () => {
    expect(explainFlashError(new Error('Serial data stream stopped: Possible serial noise or corruption.'), { stage: 'write', deviceLost: true }).code).toBe('device-lost');
    expect(explainFlashError(dom('NetworkError', 'The device has been lost.'), { stage: 'erase' }).code).toBe('device-lost');
  });

  it('쓰기·확인 중 시간 초과·상태 오류는 느린 속도로 다시 굽기, MD5 다름은 지우기 켜고 느린 속도', () => {
    const timeout = explainFlashError(new Error('Failed to write compressed data to flash after seq 17 failed with status 1,7'), { stage: 'write' });
    expect(timeout).toMatchObject({ code: 'timeout', retry: 'slow' });
    expect(timeout.summary).toContain('반쯤만');
    const beforeWrite = explainFlashError(new Error('No serial data received.'), { stage: 'chip' });
    expect(beforeWrite.summary).toContain('보드는 아직 그대로예요');
    const md5 = explainFlashError(new Error('MD5 of file does not match data in flash!'), { stage: 'verify' });
    expect(md5).toMatchObject({ code: 'verify-mismatch', retry: 'slow' });
    expect(md5.steps[0]).toContain('굽기 전에 보드를 모두 지우기');
  });

  it('펌웨어 파일 문제: 준비 중(다시 시도 없음)·받기 실패·차단·망가진 파일', () => {
    expect(explainFlashError(new FlashError('firmware-missing', 'missing'), { stage: 'file' })).toMatchObject({ code: 'firmware-missing', retry: 'none', title: '펌웨어 파일 준비 중이에요' });
    expect(explainFlashError(new FlashError('firmware-network', 'x'), { stage: 'file' }).retry).toBe('same');
    expect(explainFlashError(new FlashError('firmware-blocked', 'x'), { stage: 'file' }).summary).toContain('학교 인터넷 차단');
    const corrupt = explainFlashError(new FlashError('firmware-corrupt', 'x', { what: '지문(SHA-256)' }), { stage: 'file' });
    expect(corrupt.summary).toBe('파일의 지문(SHA-256)이(가) 사이트에 적힌 값과 달라서 굽지 않았어요. 보드는 그대로예요.');
  });

  it('플래시가 작으면 D2WD 펌웨어를, 속도 바꾸기 실패면 느린 속도를 안내한다', () => {
    const small = explainFlashError(new FlashError('flash-too-small', 'x', { size: '2MB', min: '4.0MB' }), { stage: 'chip' });
    expect(small.summary).toContain('2MB');
    expect(small.steps.join(' ')).toContain('ESP32_GENERIC-D2WD');
    expect(explainFlashError(new FlashError('baud-failed', 'x'), { stage: 'write' }).retry).toBe('slow');
  });

  it('직접 멈추면 안내, 모르는 오류는 원문과 함께 unknown — 모든 풀이는 한국어 문장이고 원문(단계·오류 연결)을 담는다', () => {
    expect(explainFlashError(new FlashError('aborted', 'stop'), { stage: 'write' })).toMatchObject({ code: 'aborted', notice: true });
    const wrapped = new Error('outer', { cause: new Error('inner reason') });
    const unknown = explainFlashError(wrapped, { stage: 'restart', attempts: ['success'] });
    expect(unknown.code).toBe('unknown');
    expect(unknown.raw).toContain('단계: restart');
    expect(unknown.raw).toContain('Error: outer');
    expect(unknown.raw).toContain('inner reason');
    expect(unknown.raw).toContain('연결 시도: success');
    for (const item of [unknown, explainFlashError('문자열 오류', { stage: 'port' })]) {
      expect(item.title).toMatch(KOREAN_SENTENCE);
      expect(item.summary).toMatch(KOREAN_SENTENCE);
      for (const step of item.steps) {
        expect(step).toMatch(/요\.$|요\)\.$/u);
      }
    }
  });
});
