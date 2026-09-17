// 실제 보드 연결의 기능 감지(src/lab/serial/support.ts — PD-28)와 USB 칩 이름(usb-chips.ts — 보조 정보) 검사(P3-07).
import { describe, expect, it } from 'vitest';
import type { CapabilityEnv } from '../../../src/lib/capabilities.ts';
import { detectSerialSupport, navigatorSerial } from '../../../src/lab/serial/support.ts';
import { USB_SERIAL_CHIPS, describePortInfo, findUsbSerialChip, formatUsbId } from '../../../src/lab/serial/usb-chips.ts';

const UA = {
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:151.0) Gecko/20100101 Firefox/151.0',
  safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36',
};

const fakeSerial = { requestPort: async () => ({}), getPorts: async () => [] };

function env(userAgent: string, options: { serial?: boolean; secure?: boolean } = {}): CapabilityEnv {
  return {
    isSecureContext: options.secure ?? true,
    navigator: { userAgent, ...(options.serial === false ? {} : { serial: fakeSerial }) },
  };
}

describe('detectSerialSupport — navigator.serial이 있는지로(버전 숫자로 짐작하지 않음)', () => {
  it('컴퓨터용 Chrome·Edge: 지원, 기준 브라우저', () => {
    expect(detectSerialSupport(env(UA.chrome))).toMatchObject({ level: 'supported', recommended: true, browserName: 'Chrome', firefox: false, mobile: false });
    expect(detectSerialSupport(env(UA.edge))).toMatchObject({ level: 'supported', recommended: true, browserName: 'Edge' });
  });

  it('Firefox 151+ 데스크톱: 기능이 있으면 허용하고 부가 기능 설치 안내(PD-28)', () => {
    const support = detectSerialSupport(env(UA.firefox));
    expect(support).toMatchObject({ level: 'supported', recommended: false, firefox: true });
    expect(support.advice).toContain('부가 기능');
  });

  it('기능이 없는 Safari·보안 연결이 아닌 주소: 미지원과 한국어 대처', () => {
    const safari = detectSerialSupport(env(UA.safari, { serial: false }));
    expect(safari.level).toBe('unsupported');
    expect(safari.advice).toContain('Chrome');
    const insecure = detectSerialSupport(env(UA.chrome, { serial: false, secure: false }));
    expect(insecure.level).toBe('unsupported');
    expect(insecure.summary).toContain('보안 연결');
  });

  it('Android Chrome(기능 있음): 확인 필요', () => {
    expect(detectSerialSupport(env(UA.android))).toMatchObject({ level: 'unknown', mobile: true });
  });

  it('navigatorSerial: requestPort가 있는 객체만', () => {
    expect(navigatorSerial({ navigator: { serial: fakeSerial } })).toBe(fakeSerial);
    expect(navigatorSerial({ navigator: {} })).toBeNull();
    expect(navigatorSerial({ navigator: { serial: {} } })).toBeNull();
    expect(navigatorSerial({})).toBeNull();
  });
});

describe('USB-시리얼 칩 이름(보조 정보)', () => {
  it('교과서 키트의 CH340(1a86:7523)과 흔한 칩', () => {
    expect(describePortInfo({ usbVendorId: 0x1a86, usbProductId: 0x7523 })).toEqual({ kind: 'usb', usbId: '1a86:7523', chip: 'CH340', maker: 'WCH', text: 'CH340(WCH) · USB 1a86:7523' });
    expect(describePortInfo({ usbVendorId: 0x10c4, usbProductId: 0xea60 })).toMatchObject({ chip: 'CP210x', maker: 'Silicon Labs', text: 'CP210x(Silicon Labs) · USB 10c4:ea60' });
    expect(describePortInfo({ usbVendorId: 0x1a86, usbProductId: 0x55d4 }).chip).toBe('CH9102');
    expect(describePortInfo({ usbVendorId: 0x303a, usbProductId: 0x1001 }).maker).toBe('Espressif');
    expect(findUsbSerialChip(0x0403, 0x6001)?.maker).toBe('FTDI');
  });

  it('모르는 USB 장치·블루투스 포트·정보 없음', () => {
    expect(describePortInfo({ usbVendorId: 0x2341, usbProductId: 0x0043 })).toEqual({ kind: 'usb', usbId: '2341:0043', chip: null, maker: null, text: '알려지지 않은 USB 장치 · USB 2341:0043' });
    expect(describePortInfo({ bluetoothServiceClassId: 0x1101 })).toMatchObject({ kind: 'bluetooth', chip: null });
    expect(describePortInfo({})).toMatchObject({ kind: 'unknown' });
    expect(describePortInfo(null)).toMatchObject({ kind: 'unknown' });
    expect(formatUsbId(0x1a86, 0x7523)).toBe('1a86:7523');
  });

  it('표 안에 같은 VID·PID가 두 번 없다', () => {
    const seen = new Set<string>();
    for (const chip of USB_SERIAL_CHIPS) {
      for (const productId of chip.productIds) {
        const id = formatUsbId(chip.vendorId, productId);
        expect(seen.has(id), id).toBe(false);
        seen.add(id);
      }
    }
  });
});
