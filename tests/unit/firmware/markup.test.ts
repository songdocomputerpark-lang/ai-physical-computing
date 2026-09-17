// 굽기 화면 HTML(src/lab/firmware/markup.ts)과 화면 글 도우미(src/lab/firmware/controller.ts의 순수 함수).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bootText, describeChip, describePort, remainingText } from '../../../src/lab/firmware/controller.ts';
import type { FlashResult } from '../../../src/lab/firmware/flasher.ts';
import { defaultFirmware, parseFirmwareManifest } from '../../../src/lab/firmware/manifest.ts';
import { escapeHtml, FLASH_STAGES, jsonForScript, renderFirmwareFlasherHtml } from '../../../src/lab/firmware/markup.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const firmware = defaultFirmware(parseFirmwareManifest(JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'firmware', 'manifest.json'), 'utf8'))));

function render(overrides: Partial<Parameters<typeof renderFirmwareFlasherHtml>[0]> = {}): string {
  return renderFirmwareFlasherHtml({
    firmware,
    fileUrl: '/ai-physical-computing/firmware/v1.29.0/ESP32_GENERIC-20260824-v1.29.0.bin',
    noticeUrl: '/ai-physical-computing/firmware/v1.29.0/NOTICE.txt',
    fileAtBuild: false,
    labHref: '/ai-physical-computing/labs/esp32/',
    portHelpHref: '/ai-physical-computing/start/board/#port-not-found',
    ...overrides,
  });
}

describe('renderFirmwareFlasherHtml', () => {
  it('화면 논리가 찾는 자리를 모두 그리고, 단계 7개를 순서대로 둔다', () => {
    const html = render();
    for (const hook of [
      'data-firmware-flasher',
      'data-firmware-info',
      'data-firmware-support-text',
      'data-firmware-file-text',
      'data-firmware-unsupported',
      'data-firmware-missing',
      'data-firmware-run',
      'data-firmware-erase',
      'data-firmware-start',
      'data-firmware-stop',
      'data-firmware-running-note',
      'data-firmware-live',
      'data-firmware-done',
      'data-firmware-error',
      'data-error-steps',
      'data-error-raw',
      'data-error-port-help',
      'data-firmware-retry',
      'data-firmware-retry-slow',
      'data-firmware-manual',
      'data-firmware-manual-link',
      'data-firmware-check-chip',
      'data-firmware-log',
    ]) {
      expect(html, hook).toContain(hook);
    }
    const order = [...html.matchAll(/data-stage="([a-z]+)"/gu)].map((match) => match[1]);
    expect(order).toEqual(FLASH_STAGES.map((stage) => stage.key));
    expect(order).toEqual(['port', 'chip', 'file', 'erase', 'write', 'verify', 'restart']);
    // 진행률 막대는 쓰기에만
    expect(html.match(/data-progress-bar/gu)).toHaveLength(1);
  });

  it('펌웨어 정보·수동 방법(Thonny·esptool)·공식 주소를 보여 주고, 굽기 단추는 처음에 누를 수 없다', () => {
    const html = render();
    expect(html).toContain('MicroPython v1.29.0(2026-08-24) · ESP32용 · 1.7MB');
    expect(html).toContain('esptool.py --baud 460800 write_flash 0x1000 ESP32_GENERIC-20260824-v1.29.0.bin');
    expect(html).toContain('Espressif · ESP32 / WROOM');
    expect(html).toContain('1,790,544바이트');
    expect(html).toContain('href="https://micropython.org/download/ESP32_GENERIC/"');
    expect(html).toContain('href="/ai-physical-computing/firmware/v1.29.0/NOTICE.txt"');
    expect(html).toMatch(/<button type="button" class="button button--primary button--large" data-firmware-start disabled>펌웨어 굽기 시작<\/button>/u);
    expect(html).toContain('href="#firmware-manual"');
    expect(html).toContain('id="firmware-manual"');
  });

  it('빌드할 때 파일이 있을 때만 내려받기 링크를 그린다(없는 파일 링크는 링크 검사가 막는다)', () => {
    expect(render({ fileAtBuild: false })).not.toContain(' download>');
    expect(render({ fileAtBuild: null })).not.toContain(' download>');
    expect(render({ fileAtBuild: true })).toContain('href="/ai-physical-computing/firmware/v1.29.0/ESP32_GENERIC-20260824-v1.29.0.bin" download>');
    expect(render({ fileAtBuild: true })).toContain('data-file-at-build="present"');
  });

  it('끝 상자: 실습실 [실제 보드] 탭 안내, checkHref가 있을 때만 "보드 연결 다시 확인하기"(보드 준비 페이지 #connect)', () => {
    const plain = render();
    expect(plain).toContain('ESP32 실습실의 [실제 보드] 탭에서 [보드 연결]');
    expect(plain).not.toContain('data-done-check');
    const onBoardPage = render({ labHref: '/ai-physical-computing/labs/esp32/?example=esp32%2Fu2%2F2-1-1-blink-check.py', checkHref: '#connect' });
    expect(onBoardPage).toContain('<a class="button button--secondary" href="/ai-physical-computing/labs/esp32/?example=esp32%2Fu2%2F2-1-1-blink-check.py">ESP32 실습실로 가기</a>');
    expect(onBoardPage).toContain('<a class="fw__help-link" href="#connect" data-done-check>이 페이지에서 보드 연결 다시 확인하기</a>');
    expect(render({ checkHref: null })).not.toContain('data-done-check');
  });

  it('제목 단계·제목 없음·id 앞머리', () => {
    expect(render({ headingLevel: 2 })).toContain('<h2 class="fw__title" id="firmware-flasher-title">펌웨어 굽기</h2>');
    expect(render({ headingLevel: 2 })).toContain('<h3 class="fw__manual-title">');
    const untitled = render({ title: null, idPrefix: 'fw2' });
    expect(untitled).not.toContain('fw__title');
    expect(untitled).toContain('aria-label="펌웨어 굽기"');
    expect(untitled).toContain('id="fw2-manual"');
  });

  it('글 값은 HTML로 해석되지 않게 바꾸고, JSON은 </script>를 끊지 않는다', () => {
    expect(escapeHtml('<a href="x">&\'</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
    expect(jsonForScript({ text: '</script><b>' })).toBe('{"text":"\\u003c/script\\u003e\\u003cb\\u003e"}');
    const html = render({ labHref: '/x/"><script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert(1)</script>');
    const embedded = /<script type="application\/json" data-firmware-info>([\s\S]*?)<\/script>/u.exec(render())![1]!;
    expect(JSON.parse(embedded)).toEqual(firmware);
  });
});

describe('화면 글 도우미', () => {
  it('포트 이름: USB 제조사 이름과 VID:PID, USB가 아니면 블루투스일 수 있다고', () => {
    expect(describePort({ usbVendorId: 0x1a86, usbProductId: 0x7523 })).toBe('WCH CH340 계열(1a86:7523)');
    expect(describePort({ usbVendorId: 0x10c4, usbProductId: 0xea60 })).toBe('Silicon Labs CP210x(10c4:ea60)');
    expect(describePort({ usbVendorId: 0x1234, usbProductId: 0x1 })).toBe('USB 시리얼 장치(1234:0001)');
    expect(describePort({})).toBe('USB가 아닌 포트(블루투스 등일 수 있어요)');
  });

  it('칩 설명과 남은 시간(5초 단위, 처음 2초·3% 전에는 말하지 않음)', () => {
    expect(
      describeChip({ chipName: 'ESP32', description: 'ESP32-D0WD-V3 (revision 3)', features: [], flashId: 0x1640ef, flashSizeLabel: '4MB', flashSizeBytes: 4194304, usbVendorId: null, usbProductId: null }),
    ).toBe('ESP32-D0WD-V3 (revision 3) · 플래시 4MB');
    expect(remainingText(1_000, 50, 100)).toBeNull();
    expect(remainingText(10_000, 1, 100)).toBeNull();
    expect(remainingText(10_000, 25, 100)).toBe('약 30초 남음');
    expect(remainingText(10_000, 90, 100)).toBe('곧 끝나요');
  });

  it('시작 글 결과에 따라 끝 상자 글이 달라진다', () => {
    const result = (boot: Partial<FlashResult['boot']>): FlashResult => ({
      bytesWritten: 1,
      compressedBytes: 1,
      md5: '',
      baudRate: 460800,
      erased: false,
      durationMs: 1,
      writeMs: 1,
      boot: { banner: null, version: null, bootLoop: false, output: '', ...boot },
    });
    expect(bootText(result({ version: '1.29.0', banner: 'MicroPython v1.29.0 on 2026-08-24' }), firmware)).toBe('보드가 다시 시작해 "MicroPython v1.29.0" 시작 글을 보냈어요.');
    expect(bootText(result({ version: '1.25.0' }), firmware)).toContain('v1.25.0이에요');
    expect(bootText(result({ bootLoop: true }), firmware)).toContain('되풀이해요');
    expect(bootText(result({}), firmware)).toContain('main.py가 돌고 있으면');
  });
});
