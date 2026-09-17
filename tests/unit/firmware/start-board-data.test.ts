// 보드 준비 페이지의 데이터(src/components/start/board/kit-parts.ts · links.ts) — PLAN §8.3 P3-10.
// 키트 부품 대응표 16줄·진동 모터 핀(PD-36), 드라이버 공식 링크(파일 재배포 없음)·자동 설치 근거·하드웨어 ID 보조 정보가 구역 E의 USB 칩 표와 같은지.
import { describe, expect, it } from 'vitest';
import { KIT_PARTS } from '../../../src/components/start/board/kit-parts.ts';
import { DRIVER_LINKS, HARDWARE_ID_HINTS, LINKS_CHECKED_ON, LINUX_REFERENCES, WINDOWS_UPDATE_EVIDENCE } from '../../../src/components/start/board/links.ts';
import { findUsbSerialChip } from '../../../src/lab/serial/usb-chips.ts';

describe('키트 부품 대응표', () => {
  it('16줄(tests/e2e/start.spec.ts가 센다)이고 키트 이름이 겹치지 않으며 칸이 모두 채워져 있다', () => {
    expect(KIT_PARTS).toHaveLength(16);
    expect(new Set(KIT_PARTS.map((part) => part.kitName)).size).toBe(KIT_PARTS.length);
    for (const part of KIT_PARTS) {
      for (const key of ['kitName', 'generic', 'connection', 'pins', 'lessons'] as const) {
        expect(part[key].trim(), `${part.kitName} ${key}`).not.toBe('');
      }
    }
  });

  it('진동 모터는 사이트가 정한 GPIO19(PD-36)이고 실물 확인 전으로 적는다', () => {
    const vibration = KIT_PARTS.find((part) => part.kitName.includes('진동모터'))!;
    expect(vibration.pins).toContain('GPIO19');
    expect(vibration.pins).toContain('사이트가 정한');
    expect(vibration.unconfirmed).toContain('GPIO19');
    // 옛 표의 "정할 예정" 문장이 남지 않는다
    expect(KIT_PARTS.some((part) => part.pins.includes('정할 예정'))).toBe(false);
  });

  it('교과서 키트 보드의 내장 LED·BOOT 버튼·디지털 터치 핀은 가상 보드 부품과 같다', () => {
    expect(KIT_PARTS[0]!.pins).toBe('내장 LED GPIO2, BOOT 버튼 GPIO0');
    expect(KIT_PARTS.find((part) => part.kitName === '터치 센서')!.pins).toBe('GPIO17');
  });
});

describe('드라이버 공식 링크와 근거', () => {
  it('만든 회사의 https 공식 페이지로만 보내고(파일 주소가 아님) 확인 날짜가 있다', () => {
    expect(LINKS_CHECKED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    const hosts = new Set(['www.wch-ic.com', 'www.silabs.com']);
    for (const driver of DRIVER_LINKS) {
      const url = new URL(driver.url);
      expect(url.protocol).toBe('https:');
      expect(hosts.has(url.host), driver.url).toBe(true);
      expect(url.pathname).not.toMatch(/\.(exe|zip|msi|dmg|pkg)$/iu);
    }
    expect(new Set(DRIVER_LINKS.map((driver) => driver.id)).size).toBe(DRIVER_LINKS.length);
  });

  it('PLAN P3-10의 두 주소를 그대로 쓰고, start.spec의 링크 이름 찾기(CH341SER.EXE·CP210x)가 한 링크만 가리킨다', () => {
    expect(DRIVER_LINKS.find((driver) => driver.id === 'wch-windows')!.url).toBe('https://www.wch-ic.com/downloads/CH341SER_EXE.html');
    expect(DRIVER_LINKS.find((driver) => driver.id === 'silabs')!.url).toBe('https://www.silabs.com/software-and-tools/usb-to-uart-bridge-vcp-drivers');
    expect(DRIVER_LINKS.filter((driver) => /CH341SER\.EXE/u.test(driver.label))).toHaveLength(1);
    expect(DRIVER_LINKS.filter((driver) => /CP210x/u.test(driver.label))).toHaveLength(1);
  });

  it('Windows 자동 설치 근거는 PLAN 표의 두 주소(Microsoft Update 카탈로그·Espressif 문서)', () => {
    expect(WINDOWS_UPDATE_EVIDENCE.map((item) => item.url)).toEqual([
      'https://www.catalog.update.microsoft.com/Search.aspx?q=USB-SERIAL%20CH340',
      'https://docs.espressif.com/projects/esp-idf/en/stable/esp32/get-started/establish-serial-connection.html',
    ]);
    for (const item of [...WINDOWS_UPDATE_EVIDENCE, ...Object.values(LINUX_REFERENCES)]) {
      expect(new URL(item.url).protocol).toBe('https:');
      expect(item.label).toMatch(/[가-힣]/u);
    }
  });

  it('하드웨어 ID 보조 정보는 구역 E의 USB 칩 표(src/lab/serial/usb-chips.ts)와 같은 칩을 가리킨다', () => {
    for (const hint of HARDWARE_ID_HINTS) {
      const match = /^VID_([0-9A-F]{4})&PID_([0-9A-F]{4})$/u.exec(hint.id);
      expect(match, hint.id).not.toBeNull();
      const chip = findUsbSerialChip(Number.parseInt(match![1]!, 16), Number.parseInt(match![2]!, 16));
      expect(chip, hint.id).not.toBeNull();
      expect(hint.chip).toContain(chip!.maker);
      expect(DRIVER_LINKS.some((driver) => driver.id === hint.driver)).toBe(true);
    }
  });
});
