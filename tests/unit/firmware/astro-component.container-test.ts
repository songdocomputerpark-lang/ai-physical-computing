// 펌웨어 굽기 Astro 컴포넌트(src/components/lab/firmware/FirmwareFlasher.astro)를 Astro Container API로 실제로 그려 본다.
// 페이지에 넣기 전(통합 전)에도 컴포넌트의 머리(frontmatter: public/firmware/manifest.json 읽기·파일 있는지 보기·withBase 주소)가 도는지 확인한다.
//
// .astro를 불러야 해서 기본 단위 테스트(vitest.config.ts — Astro 설정을 거치지 않음)에는 넣지 않고, 이름을 *.container-test.ts로 두었다.
// 실행: npx vitest run --config tests/unit/firmware/vitest.container.config.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import FirmwareFlasher from '../../../src/components/lab/firmware/FirmwareFlasher.astro';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const FIRMWARE_IN_PUBLIC = fs.existsSync(path.join(ROOT, 'public', 'firmware', 'v1.29.0', 'ESP32_GENERIC-20260824-v1.29.0.bin'));

describe('FirmwareFlasher.astro', () => {
  it('목록의 펌웨어로 굽기 화면을 그리고, 파일이 public/에 있을 때만 내려받기 링크를 그린다', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(FirmwareFlasher, { props: { headingLevel: 3 } });
    expect(html).toContain('data-pagefind-ignore');
    expect(html).toContain('data-firmware-flasher');
    expect(html).toContain('<h3 class="fw__title" id="firmware-flasher-title">펌웨어 굽기</h3>');
    expect(html).toContain('data-file-url="/ai-physical-computing/firmware/v1.29.0/ESP32_GENERIC-20260824-v1.29.0.bin"');
    expect(html).toContain('href="/ai-physical-computing/firmware/v1.29.0/NOTICE.txt"');
    expect(html).toContain('href="/ai-physical-computing/labs/esp32/"');
    expect(html).toContain('href="/ai-physical-computing/start/board/#port-not-found"');
    expect(html).toContain('MicroPython v1.29.0(2026-08-24) · ESP32용 · 1.7MB');
    if (FIRMWARE_IN_PUBLIC) {
      expect(html).toContain('data-file-at-build="present"');
      expect(html).toContain('href="/ai-physical-computing/firmware/v1.29.0/ESP32_GENERIC-20260824-v1.29.0.bin" download>');
    } else {
      // 펌웨어 파일이 없는 동안(통합 전)은 링크 검사가 막을 내려받기 링크가 없다
      expect(html).toContain('data-file-at-build="missing"');
      expect(html).not.toContain(' download>');
    }
  }, 120_000);

  it('제목 단계와 주소를 props로 바꿀 수 있다', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(FirmwareFlasher, {
      props: { headingLevel: 2, title: '보드에 MicroPython 굽기', labHref: '/ai-physical-computing/labs/esp32/?example=esp32/01-first-blink.py' },
    });
    expect(html).toContain('<h2 class="fw__title" id="firmware-flasher-title">보드에 MicroPython 굽기</h2>');
    expect(html).toContain('<h3 class="fw__manual-title">');
    expect(html).toContain('href="/ai-physical-computing/labs/esp32/?example=esp32/01-first-blink.py"');
  }, 120_000);
});
