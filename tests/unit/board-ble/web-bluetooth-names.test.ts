// 교실 블루투스 이름 규칙 — src/lab/ble/names.ts (PLAN §7.3 "교실 블루투스 이름 규칙", §10 개인정보).
import { describe, expect, it } from 'vitest';
import { checkBoardName, checkPrefix, initLineFor, NAME_MAX_BYTES, normalizePrefix, suggestBoardName } from '../../../src/lab/ble/index.ts';
import { detectBleSupport, hasWebBluetooth, unsupportedAdvice } from '../../../src/lab/ble/index.ts';

describe('보드 이름 검사', () => {
  it('자리 번호를 붙인 이름은 알릴 것이 없다', () => {
    expect(checkBoardName('ESP32-07')).toEqual([]);
  });

  it('기본 이름 그대로면 "교실에서 못 고른다"고 알린다', () => {
    const issues = checkBoardName('ESP32');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('default-name');
    expect(issues[0]?.level).toBe('warn');
    expect(issues[0]?.text).toContain('ESP32-07');
  });

  it('비어 있으면 고쳐야 한다', () => {
    expect(checkBoardName('  ')[0]?.level).toBe('error');
  });

  it('학번·전화번호처럼 보이는 숫자는 막는다(개인정보)', () => {
    expect(checkBoardName('ESP32-10203')[0]?.code).toBe('personal');
    expect(checkBoardName('ESP32-010-1234-5678').some((issue) => issue.code === 'personal')).toBe(true);
  });

  it('한글 이름은 깨짐·개인정보 두 가지로 알린다', () => {
    const issues = checkBoardName('박상진보드');
    expect(issues.some((issue) => issue.code === 'hangul')).toBe(true);
  });

  it('띄어쓰기는 알림만 낸다', () => {
    expect(checkBoardName('ESP32 07').some((issue) => issue.code === 'space')).toBe(true);
  });

  it('광고에 실리는 길이를 넘으면 알린다', () => {
    const long = `ESP32-${'x'.repeat(NAME_MAX_BYTES)}`;
    expect(checkBoardName(long).some((issue) => issue.code === 'too-long')).toBe(true);
  });

  it('자리 번호로 이름과 코드 한 줄을 만들어 준다', () => {
    expect(suggestBoardName(7)).toBe('ESP32-07');
    expect(suggestBoardName(12)).toBe('ESP32-12');
    expect(initLineFor('ESP32-07')).toBe('ble = ESP32BLE.init("ESP32-07")');
  });
});

describe('선택 창 이름 앞부분', () => {
  it('앞뒤 공백을 없애고 길이를 자른다', () => {
    expect(normalizePrefix('  ESP32 ')).toBe('ESP32');
    expect(normalizePrefix(null)).toBe('');
    expect(normalizePrefix('x'.repeat(100))).toHaveLength(NAME_MAX_BYTES);
  });

  it('비어 있으면(모두 보기) 알릴 것이 없고, 기본 이름이라고 잔소리하지 않는다', () => {
    expect(checkPrefix('')).toEqual([]);
    expect(checkPrefix('ESP32')).toEqual([]);
  });

  it('앞부분에 개인정보가 들어가면 알린다', () => {
    expect(checkPrefix('2학년3반').some((issue) => issue.code === 'hangul')).toBe(true);
  });
});

describe('지원하지 않는 환경 안내', () => {
  it('아이폰·아이패드와 Firefox를 이름으로 짚어 준다', () => {
    expect(unsupportedAdvice('Safari', true, false)).toContain('아이폰');
    expect(unsupportedAdvice('Firefox', false, true)).toContain('Firefox');
    expect(unsupportedAdvice('어떤 브라우저', false, false)).toContain('어떤 브라우저');
  });

  it('navigator.bluetooth가 없으면 unsupported로 판정하고 한국어 안내를 준다', async () => {
    const support = await detectBleSupport({
      isSecureContext: true,
      navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
    });
    expect(support.level).toBe('unsupported');
    expect(support.ios).toBe(true);
    expect(support.advice).toContain('아이폰');
  });

  it('블루투스가 꺼져 있으면(getAvailability false) "확인 필요"로 본다', async () => {
    const support = await detectBleSupport({
      isSecureContext: true,
      navigator: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        bluetooth: { getAvailability: () => Promise.resolve(false) },
      },
    });
    expect(support.level).toBe('unknown');
    expect(support.summary).toContain('블루투스');
  });

  it('hasWebBluetooth는 requestDevice가 있는지까지 본다', () => {
    expect(hasWebBluetooth({ navigator: {} })).toBe(false);
    expect(hasWebBluetooth({ navigator: { bluetooth: {} } })).toBe(false);
    expect(hasWebBluetooth({ navigator: { bluetooth: { requestDevice: () => Promise.resolve({}) } } })).toBe(true);
  });
});
