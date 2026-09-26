// 브라우저 음성 인식 확인·안내(src/lab/modules/speech/web-speech.ts) 단위 테스트 — 가짜 창으로 모든 경우를 본다(P2-13).
// 가장 중요한 것: **교사가 설정을 켜지 않으면 "서버 인식"이 고를 수 있는 목록에 들어가지 않는다**(§10, PD-08).
import { describe, expect, it, vi } from 'vitest';
import {
  MODE_LABELS,
  MODE_NOTES,
  SPEECH_LANG,
  SPEECH_QUALITY,
  availableModes,
  checkOnDevice,
  describeOnDevice,
  installOnDevice,
  onDeviceLabel,
  speechErrorInfo,
  speechRecognitionCtor,
  transcriptOf,
  type OnDeviceStatus,
} from '../../../src/lab/modules/speech/web-speech.ts';
import { SPEECH_MODES } from '../../../src/lab/modules/speech/settings.ts';

class FakeRecognition {
  lang = '';
  start(): void {}
  stop(): void {}
  abort(): void {}
  onresult = null;
  onerror = null;
  onend = null;
}

function fakeCtor(extra: Record<string, unknown> = {}): unknown {
  return Object.assign(FakeRecognition, extra);
}

describe('음성 인식 만들기 함수 찾기', () => {
  it('표준 이름 → 크롬 접두어 이름 순서로 찾고, 없으면 null', () => {
    const standard = fakeCtor();
    expect(speechRecognitionCtor({ SpeechRecognition: standard })).toBe(standard);
    expect(speechRecognitionCtor({ webkitSpeechRecognition: standard })).toBe(standard);
    expect(speechRecognitionCtor({})).toBeNull();
    expect(speechRecognitionCtor(null)).toBeNull();
    expect(speechRecognitionCtor({ SpeechRecognition: '아님' })).toBeNull();
  });
});

describe('내 기기 안 인식(온디바이스) 확인', () => {
  it('음성 인식이 없으면 unsupported, 확인 방법이 없으면 unknown', async () => {
    await expect(checkOnDevice(null)).resolves.toBe('unsupported');
    await expect(checkOnDevice(speechRecognitionCtor({ SpeechRecognition: fakeCtor() }))).resolves.toBe('unknown');
  });

  it('available()에 한국어와 processLocally를 물어보고 그 답을 그대로 쓴다', async () => {
    for (const status of ['available', 'downloadable', 'downloading'] as const) {
      const available = vi.fn().mockResolvedValue(status);
      const ctor = speechRecognitionCtor({ SpeechRecognition: fakeCtor({ available }) });
      await expect(checkOnDevice(ctor)).resolves.toBe(status);
      expect(available).toHaveBeenCalledWith({ langs: [SPEECH_LANG], processLocally: true, quality: SPEECH_QUALITY });
    }
  });

  it('모르는 답·unavailable은 unavailable, 오류(정책으로 막힘)는 unknown', async () => {
    const unavailable = speechRecognitionCtor({ SpeechRecognition: fakeCtor({ available: vi.fn().mockResolvedValue('unavailable') }) });
    await expect(checkOnDevice(unavailable)).resolves.toBe('unavailable');
    const weird = speechRecognitionCtor({ SpeechRecognition: fakeCtor({ available: vi.fn().mockResolvedValue('무슨말') }) });
    await expect(checkOnDevice(weird)).resolves.toBe('unavailable');
    const blocked = speechRecognitionCtor({ SpeechRecognition: fakeCtor({ available: vi.fn().mockRejectedValue(new Error('막힘')) }) });
    await expect(checkOnDevice(blocked)).resolves.toBe('unknown');
  });

  it('음성 팩 받기는 install()이 있을 때만 하고, 실패는 false로 돌려준다', async () => {
    const install = vi.fn().mockResolvedValue(true);
    const ctor = speechRecognitionCtor({ SpeechRecognition: fakeCtor({ install }) });
    await expect(installOnDevice(ctor)).resolves.toBe(true);
    expect(install).toHaveBeenCalledWith({ langs: [SPEECH_LANG], quality: SPEECH_QUALITY });
    await expect(installOnDevice(null)).resolves.toBe(false);
    const failing = speechRecognitionCtor({ SpeechRecognition: fakeCtor({ install: vi.fn().mockRejectedValue(new Error('안 됨')) }) });
    await expect(installOnDevice(failing)).resolves.toBe(false);
  });

  it('상태마다 한국어 설명과 짧은 이름이 있다', () => {
    const all: OnDeviceStatus[] = ['unknown', 'unsupported', 'available', 'downloadable', 'downloading', 'unavailable'];
    for (const status of all) {
      expect(describeOnDevice(status).length, status).toBeGreaterThan(5);
      expect(onDeviceLabel(status).length, status).toBeGreaterThan(1);
    }
    expect(describeOnDevice('available')).toContain('밖으로 나가지 않아요');
  });
});

describe('고를 수 있는 방식', () => {
  it('설정이 꺼져 있으면 서버 인식이 목록에 없다(DOM에도 만들지 않는다)', () => {
    expect(availableModes({ hasRecognition: true, onDevice: 'available', serverAllowed: false })).toEqual(['text', 'ondevice']);
    expect(availableModes({ hasRecognition: true, onDevice: 'unavailable', serverAllowed: false })).toEqual(['text']);
    expect(availableModes({ hasRecognition: false, onDevice: 'unsupported', serverAllowed: true })).toEqual(['text']);
  });

  it('오프라인 배포판에서는 설정·기기와 상관없이 글자 입력만(PLAN §5.6)', () => {
    expect(availableModes({ hasRecognition: true, onDevice: 'available', serverAllowed: true, offline: true })).toEqual(['text']);
    expect(availableModes({ hasRecognition: true, onDevice: 'available', serverAllowed: true, offline: false })).toEqual(['text', 'ondevice', 'server']);
  });

  it('설정을 켜고 음성 인식이 있으면 서버 인식이 마지막에 붙는다', () => {
    expect(availableModes({ hasRecognition: true, onDevice: 'unavailable', serverAllowed: true })).toEqual(['text', 'server']);
    expect(availableModes({ hasRecognition: true, onDevice: 'available', serverAllowed: true })).toEqual(['text', 'ondevice', 'server']);
    expect(availableModes({ hasRecognition: true, onDevice: 'downloadable', serverAllowed: true })).toEqual(['text', 'ondevice', 'server']);
  });

  it('글자 입력은 어떤 브라우저에서도 늘 첫 번째다(기본값)', () => {
    for (const onDevice of ['unknown', 'unsupported', 'unavailable', 'available'] as OnDeviceStatus[]) {
      for (const serverAllowed of [false, true]) {
        expect(availableModes({ hasRecognition: false, onDevice, serverAllowed })[0]).toBe('text');
      }
    }
  });

  it('방식마다 이름과 설명이 있고, 서버 인식 설명에는 전송된다는 말이 들어 있다', () => {
    for (const mode of SPEECH_MODES) {
      expect(MODE_LABELS[mode].length, mode).toBeGreaterThan(2);
      expect(MODE_NOTES[mode].length, mode).toBeGreaterThan(5);
    }
    expect(MODE_LABELS.server).toContain('전송');
    expect(MODE_NOTES.server).toContain('서버');
    expect(MODE_LABELS.text).toContain('기본');
  });
});

describe('음성 인식 오류를 한국어와 파이썬 예외로', () => {
  it('못 알아들은 것은 UnknownValueError 쪽(unknown), 권한·네트워크·미지원은 RequestError 쪽(request)', () => {
    expect(speechErrorInfo('no-speech').failure).toBe('unknown');
    expect(speechErrorInfo('aborted').failure).toBe('unknown');
    for (const code of ['audio-capture', 'network', 'not-allowed', 'service-not-allowed', 'language-not-supported', 'phrases-not-supported', 'bad-grammar']) {
      expect(speechErrorInfo(code).failure, code).toBe('request');
    }
  });

  it('모르는 코드도 한국어 설명을 주고 코드를 괄호에 적는다', () => {
    expect(speechErrorInfo('무슨오류').message).toContain('무슨오류');
    expect(speechErrorInfo(undefined).message).toContain('문제가 생겼어요');
    expect(speechErrorInfo('not-allowed').message).toContain('마이크');
  });
});

describe('인식 결과에서 문장 뽑기', () => {
  it('여러 조각을 이어 붙이고 앞뒤 공백을 지운다', () => {
    expect(transcriptOf({ results: [[{ transcript: ' 안녕' }], [{ transcript: '하세요 ' }]] })).toBe('안녕하세요');
    expect(transcriptOf({ results: [] })).toBe('');
    expect(transcriptOf(null)).toBe('');
    expect(transcriptOf({})).toBe('');
    expect(transcriptOf({ results: [[]] })).toBe('');
  });
});
