// 보드 준비 페이지 부품(src/components/start/board/*.astro)을 Astro Container API로 실제로 그려 본다(PLAN §8.3 P3-10).
// .astro를 불러야 해서 기본 단위 테스트에는 넣지 않았다 — 실행: npx vitest run --config tests/unit/firmware/vitest.container.config.mjs
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import FirmwareFlasher from '../../../src/components/lab/firmware/FirmwareFlasher.astro';
import ConnectCheck from '../../../src/components/start/board/ConnectCheck.astro';
import DeviceManagerFigure from '../../../src/components/start/board/DeviceManagerFigure.astro';
import KitPartsTable from '../../../src/components/start/board/KitPartsTable.astro';
import PortHelp from '../../../src/components/start/board/PortHelp.astro';

function count(html: string, pattern: RegExp): number {
  return [...html.matchAll(pattern)].length;
}

describe('보드 준비 페이지 부품(Container API)', () => {
  it('KitPartsTable: 표 이름과 16줄(tests/e2e/start.spec.ts가 센다)', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(KitPartsTable);
    expect(html).toContain('키트 부품 이름과 범용 부품 이름(16가지)');
    const body = html.slice(html.indexOf('<tbody'), html.indexOf('</tbody>'));
    expect(count(body, /<tr[\s>]/gu)).toBe(16);
    expect(html).toContain('GPIO19(원고에 핀이 없어 사이트가 정한 핀)');
  }, 120_000);

  it('PortHelp: 접는 상자는 요약 하나뿐, 케이블 → 장치 관리자 → 드라이버(공식 페이지만) → 전산 담당 부탁 글 → Linux', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(PortHelp);
    expect(html).toContain('id="port-not-found"');
    expect(count(html, /<summary[\s>]/gu)).toBe(1);
    expect(count(html, /<details[\s>]/gu)).toBe(1);
    expect(html).toContain('>포트 선택 창에 보드가 안 보여요</summary>');
    const order = ['id="check-cable"', 'id="device-manager"', 'id="drivers"', 'id="it-request"', 'id="hardware-id"', 'id="linux"', 'id="still-not-working"'].map((hook) => html.indexOf(hook));
    expect(order.every((position) => position > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain('href="https://www.wch-ic.com/downloads/CH341SER_EXE.html"');
    expect(html).toContain('href="https://www.silabs.com/software-and-tools/usb-to-uart-bridge-vcp-drivers"');
    expect(html).toContain('href="https://www.catalog.update.microsoft.com/Search.aspx?q=USB-SERIAL%20CH340"');
    expect(html).toContain('Windows 10·11은 인터넷에 연결되어 있고 드라이버 자동 설치가 허용되어 있으면');
    expect(html).toContain('sudo snap connect chromium:raw-usb');
    expect(html).toContain('sudo usermod -a -G dialout $USER');
    // 드라이버 파일 주소로 바로 가는 링크는 없다(파일 재배포 안 함)
    expect(html).not.toMatch(/href="[^"]+\.(exe|zip|msi|dmg|pkg)"/iu);
    // 장치 관리자 그림 세 장면이 안내 안에 들어 있다
    expect(count(html, /role="img"/gu)).toBe(3);
    expect(html).toContain('href="/ai-physical-computing/start/check/"');
    expect(html).toContain('href="#connect"');
  }, 120_000);

  it('DeviceManagerFigure: 세 장면마다 제목·설명(role="img")과 글 설명', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(DeviceManagerFigure);
    for (const title of ['장치 관리자: 보드를 꽂기 전', '장치 관리자: 보드를 알아본 경우', '장치 관리자: 드라이버가 없는 경우']) {
      expect(html).toContain(`>${title}</title>`);
    }
    expect(html).toContain('aria-labelledby="dm-found-title dm-found-desc"');
    expect(html).toContain('USB-SERIAL CH340 (COM3)');
    expect(html).toContain('그림 속 장치 이름과 COM 번호는 예예요.');
  }, 120_000);

  it('ConnectCheck: [보드 연결]과 링크 자리(#port-not-found·#firmware·#first-example·점검 페이지), 검색 색인 제외', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ConnectCheck);
    expect(html).toContain('data-connect-check');
    expect(html).toContain('data-port-help-href="#port-not-found"');
    expect(html).toContain('data-firmware-href="#firmware"');
    expect(html).toContain('data-first-example-href="#first-example"');
    expect(html).toContain('data-check-page-href="/ai-physical-computing/start/check/"');
    expect(html).toContain('data-pagefind-ignore');
    expect(html).toMatch(/<button type="button" class="button button--primary button--large" data-connect-start[^>]*>보드 연결<\/button>/u);
    expect(html).toContain('<h3 class="connect-check__title" id="connect-check-title"');
    expect(html).not.toContain('포트 선택 창에 보드가 안 보여요');
  }, 120_000);

  it('FirmwareFlasher: checkHref를 주면 끝 상자에 "이 페이지에서 보드 연결 다시 확인하기"', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(FirmwareFlasher, {
      props: { headingLevel: 3, labHref: '/ai-physical-computing/labs/esp32/?example=esp32%2Fu2%2F2-1-1-blink-check.py', checkHref: '#connect' },
    });
    expect(html).toContain('href="#connect" data-done-check>이 페이지에서 보드 연결 다시 확인하기</a>');
    expect(html).toContain('href="/ai-physical-computing/labs/esp32/?example=esp32%2Fu2%2F2-1-1-blink-check.py"');
  }, 120_000);
});
