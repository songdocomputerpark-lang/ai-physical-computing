// 보드 준비 페이지 브라우저 테스트(PLAN §8.3 P3-10 — 완료 기준 "시나리오 C 흐름의 모든 화면이 이어진다", 검증 "Playwright 링크·화면").
//
// 시나리오 C(SPEC §13): 보드 준비 페이지 → 드라이버 안내 → [펌웨어 굽기] 원클릭 → 예제 [실행] → 실제 LED 깜빡임.
// 실제 보드 대신 모의 시리얼(tests/e2e/helpers/serial.ts)과 모의 ESP32 ROM 부트로더 플러그인(src/lab/firmware/mock/serial-plugin.ts)을 쓴다.
// 모의 보드에서 된 것은 실물의 증거가 아니다 — 실물은 PLAN 부록 B-2·운영자 할 일 2번("확인 필요").
// 펌웨어 파일은 저장소에 없으므로(통합 때 배치) 흐름 검사는 테스트가 만든 가짜 ESP32 이미지를 page.route로 주고 화면의 목록도 그 이미지에 맞춘다.
// 실행(병렬 제작): PW_BASE_URL=http://localhost:4506/ai-physical-computing/ npx playwright test tests/e2e/start-board.spec.ts --project=desktop
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { getLearnUnit, getPage } from '../../src/config/nav.ts';
import { withBase } from '../../src/lib/url.ts';
import { sha256Of, syntheticImage } from '../unit/firmware/helpers/synthetic-image.ts';
import { labRoot } from './helpers/lab.ts';
import { installSerialMock, serialMock, utf8Text, type SerialMockConfig } from './helpers/serial.ts';

// 서비스 워커가 페이지 요청을 가로채면 page.route가 닿지 않으므로 막는다(빌드 미리 보기에서 돌 때)
test.use({ serviceWorkers: 'block' });

const BOARD = getPage('start-board');
const ESP32_LAB = getPage('labs-esp32');
const CHECK = getPage('start-check');
const ROM_PLUGIN = 'src/lab/firmware/mock/serial-plugin.ts';
const FIRST_EXAMPLE_FILE = 'esp32/u2/2-1-1-blink-check.py';
const FIRST_EXAMPLE_HREF = `${ESP32_LAB.href}?example=${encodeURIComponent(FIRST_EXAMPLE_FILE)}`;
const TEST_FIRMWARE_PATH = 'firmware/v1.29.0/APC-TEST-ESP32_GENERIC-v1.29.0.bin';
/** 판별(대답 없는 보드는 세 번 물어본다)·LED 시험 */
const BOARD_TIMEOUT = 30_000;
/** 개발 서버가 실습실 페이지를 처음 옮기는 시간(Vite 변환)까지 */
const LAB_TIMEOUT = 150_000;

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`${page.url()}: ${error.message}`));
  return errors;
}

function connectCheck(page: Page): Locator {
  return page.locator('[data-connect-check]');
}

function portHelp(page: Page): Locator {
  return page.locator('details#port-not-found');
}

function flasher(page: Page): Locator {
  return page.locator('[data-firmware-flasher]');
}

async function openBoardPage(page: Page, hash = ''): Promise<void> {
  const response = await page.goto(`${BOARD.href}${hash}`);
  expect(response?.status()).toBe(200);
  await expect(connectCheck(page)).toHaveAttribute('data-mounted', 'true', { timeout: 30_000 });
}

async function pressConnect(page: Page): Promise<void> {
  await connectCheck(page).getByRole('button', { name: '보드 연결' }).click();
}

async function waitConnectResult(page: Page, result: string): Promise<void> {
  await expect(connectCheck(page)).toHaveAttribute('data-result', result, { timeout: BOARD_TIMEOUT });
  await expect(connectCheck(page)).toHaveAttribute('data-phase', 'result');
}

/**
 * 보드 준비 페이지의 굽기 화면이 가짜 펌웨어를 쓰게 한다: HTML에 심긴 펌웨어 정보(크기·SHA-256·경로)를 바꾸고 그 파일을 준다
 * (tests/e2e/esp32-firmware.spec.ts와 같은 방법).
 */
async function useTestFirmware(page: Page, size = 24_000): Promise<{ requests: string[] }> {
  const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'firmware', 'manifest.json'), 'utf8')) as { firmware: Record<string, unknown>[] };
  const image = syntheticImage(size);
  const info = {
    ...manifest.firmware[0],
    path: TEST_FIRMWARE_PATH,
    size: image.length,
    sha256: sha256Of(image),
    sourceUrl: `https://micropython.org/resources/firmware/${path.posix.basename(TEST_FIRMWARE_PATH)}`,
  };
  await page.route(`**${BOARD.href}`, async (route) => {
    const response = await route.fetch();
    const html = (await response.text())
      .replace(/(<script type="application\/json" data-firmware-info>)[\s\S]*?(<\/script>)/u, (_whole, open: string, close: string) => `${open}${JSON.stringify(info).replace(/</gu, '\\u003c')}${close}`)
      .replace(/data-file-url="[^"]*"/u, `data-file-url="${withBase(TEST_FIRMWARE_PATH)}"`);
    const headers = Object.fromEntries(Object.entries(response.headers()).filter(([name]) => !['content-length', 'content-encoding'].includes(name.toLowerCase())));
    await route.fulfill({ response, body: html, headers: { ...headers, 'content-type': 'text/html; charset=utf-8' } });
  });
  const requests: string[] = [];
  await page.route(`**/${TEST_FIRMWARE_PATH}`, async (route) => {
    requests.push(route.request().method());
    await route.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.from(image) });
  });
  return { requests };
}

/**
 * 모의 보드를 끼운다. firmwareMissingOnBoardPage면 보드 준비 페이지에서만 "펌웨어가 지워진 보드"(굽기 전까지 MicroPython이 대답하지 않음)로,
 * 다른 페이지(ESP32 실습실)에서는 보통 MicroPython 보드로 둔다 — 모의 보드는 문서마다 새로 생긴다(구운 결과가 이어지지 않음).
 */
async function installBoard(page: Page, options: { config?: SerialMockConfig; firmwareMissingOnBoardPage?: boolean } = {}): Promise<void> {
  await page.addInitScript(
    ([boardPath, missing]) => {
      const scope = globalThis as unknown as { __APC_ESP32_ROM_OPTIONS__?: unknown; __APC_ESP32_BOARD_OPTIONS__?: unknown };
      scope.__APC_ESP32_ROM_OPTIONS__ = { board: { writeMsPerBlock: 2, eraseMsPerMb: 20 } };
      if (missing && location.pathname === boardPath) {
        scope.__APC_ESP32_BOARD_OPTIONS__ = { board: { firmware: 'none' } };
      }
    },
    [BOARD.href, options.firmwareMissingOnBoardPage === true] as const,
  );
  await installSerialMock(page, options.config ?? { ports: [{ id: 'board', label: 'ESP32(CH340)' }] }, { plugins: [ROM_PLUGIN] });
}

test.describe('보드 준비 페이지(P3-10)', () => {
  test('홈 [내 보드 연결하기] → 보드 준비: 순서 네 단계가 페이지 안 자리로 이어지고, 갈래 링크가 "연결이 안 될 때" 안내를 펼친다', async ({ page, isMobile }) => {
    const errors = collectPageErrors(page);
    await page.goto(getPage('home').href);
    await page.locator('[data-home-action="real-board"]').click();
    await expect(page).toHaveURL(new RegExp(`${BOARD.href.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}$`, 'u'));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(BOARD.title);
    await expect(connectCheck(page)).toHaveAttribute('data-mounted', 'true', { timeout: 30_000 });

    const flow = page.getByRole('navigation', { name: '순서 한눈에 보기' });
    await expect(flow.locator('.board-flow__link')).toHaveCount(4);
    const expected = [
      { href: '#kit-list', heading: '1단계 준비물과 케이블 확인하기' },
      { href: '#connect', heading: '2단계 보드를 꽂고 연결하기' },
      { href: '#firmware', heading: '3단계 보드에 MicroPython 굽기' },
      { href: '#first-example', heading: '4단계 첫 예제로 LED 깜빡이기' },
    ];
    for (const [index, step] of expected.entries()) {
      const link = flow.locator('.board-flow__link').nth(index);
      await expect(link).toHaveAttribute('href', step.href);
      await expect(page.locator(step.href)).toHaveText(step.heading);
      await link.click();
      await expect(page).toHaveURL(new RegExp(`${step.href}$`, 'u'));
      await expect(page.locator(step.href)).toBeInViewport();
      await page.evaluate(() => window.scrollTo(0, 0));
    }

    // 갈래: 목록에 보드가 없으면 → 접힌 안내가 펼쳐진다(처음엔 접힘 — tests/e2e/start.spec.ts와 같은 약속)
    await expect(portHelp(page)).not.toHaveAttribute('open', '');
    await flow.getByRole('link', { name: '케이블·장치 관리자·드라이버 확인' }).click();
    await expect(portHelp(page)).toHaveAttribute('open', '');
    await expect(portHelp(page).locator(':scope > summary')).toBeInViewport();

    // 사이트 안 링크가 가리키는 #위치가 모두 이 페이지에 있다(굽기 화면·안내·첫 예제)
    const missingTargets = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLAnchorElement>('main a[href^="#"]')]
        .map((anchor) => anchor.getAttribute('href')!)
        .filter((href) => href.length > 1 && !document.getElementById(decodeURIComponent(href.slice(1)))),
    );
    expect(missingTargets).toEqual([]);
    // 페이지 id가 겹치지 않는다(연결 확인·안내·굽기 화면을 함께 넣어도)
    const duplicateIds = await page.evaluate(() => {
      const seen = new Map<string, number>();
      for (const element of document.querySelectorAll('[id]')) {
        seen.set(element.id, (seen.get(element.id) ?? 0) + 1);
      }
      return [...seen.entries()].filter(([, count]) => count > 1).map(([id]) => id);
    });
    expect(duplicateIds).toEqual([]);
    // start.spec.ts가 getByText로 누르는 글이 하나씩뿐이다
    await expect(page.getByText('포트 선택 창에 보드가 안 보여요')).toHaveCount(1);
    await expect(page.getByText('충전 전용 케이블로는 연결되지 않아요')).toHaveCount(1);
    if (isMobile) {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    }
    expect(errors).toEqual([]);
  });

  test('[보드 연결] → 포트 선택 창을 닫으면 안내가 펼쳐지고 → 케이블 → 장치 관리자 그림 → 드라이버 공식 링크·자동 설치 근거·전산 담당 부탁 글 → Linux → 2단계로 돌아가 다시 연결', async ({
    page,
    context,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '연결 흐름은 데스크톱에서 본다(휴대폰 배치는 아래 검사)');
    test.setTimeout(120_000);
    const errors = collectPageErrors(page);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await installBoard(page);
    await openBoardPage(page);
    const check = connectCheck(page);
    await expect(check).toHaveAttribute('data-support', 'supported');
    await expect(check.locator('[data-connect-title]')).toHaveText('아직 연결하지 않았어요');

    // 보드를 꽂고 [보드 연결] → 목록에 보드가 없어 창을 닫음
    const board = serialMock(page);
    await board.chooseNext(null);
    await pressConnect(page);
    await waitConnectResult(page, 'not-selected');
    await expect(check.locator('[data-connect-title]')).toHaveText('포트를 고르지 않았어요');
    await expect(check.locator('[data-connect-status]')).toBeFocused();
    await expect(portHelp(page)).toHaveAttribute('open', '');
    // 포트 선택 창을 거르지 않는다(VID·PID는 보조 정보로만)
    expect(await board.requests()).toEqual([{}]);
    await check.getByRole('link', { name: '케이블·장치 관리자·드라이버 확인하기' }).click();
    await expect(page).toHaveURL(/#port-not-found$/u);
    await expect(portHelp(page).locator(':scope > summary')).toBeInViewport();

    // ① 케이블과 USB 단자
    const help = portHelp(page);
    await expect(help.getByRole('heading', { name: '케이블과 USB 단자 확인하기' })).toBeVisible();
    await expect(help.getByRole('link', { name: '케이블 그림 보기' })).toHaveAttribute('href', '#cable');

    // ② 장치 관리자 그림 — 세 장면(꽂기 전·알아봄·드라이버 없음), 뜻은 글로도
    await expect(help.getByRole('heading', { name: '컴퓨터가 보드를 알아보는지 확인하기(Windows 장치 관리자)' })).toBeVisible();
    for (const name of ['장치 관리자: 보드를 꽂기 전', '장치 관리자: 보드를 알아본 경우', '장치 관리자: 드라이버가 없는 경우']) {
      await expect(help.getByRole('img', { name })).toBeVisible();
    }
    await expect(help.locator('.dm-figure')).toContainText('USB-SERIAL CH340 (COM3)');
    await expect(help.locator('.dm-figure')).toContainText('기타 장치 아래에 느낌표(!)가 붙은 장치가 생기면 드라이버가 없는 거예요.');

    // ③ 드라이버: 만든 회사 공식 페이지(파일 재배포 없음), Windows Update 자동 설치 근거, 관리자 권한 없으면 전산 담당
    const drivers = page.locator('#drivers');
    await expect(drivers).toContainText('Windows 10·11은 인터넷에 연결되어 있고 드라이버 자동 설치가 허용되어 있으면');
    await expect(drivers.getByRole('link', { name: /CH341SER\.EXE/u })).toHaveAttribute('href', 'https://www.wch-ic.com/downloads/CH341SER_EXE.html');
    await expect(drivers.getByRole('link', { name: /CP210x/u })).toHaveAttribute('href', 'https://www.silabs.com/software-and-tools/usb-to-uart-bridge-vcp-drivers');
    await expect(drivers.getByRole('link', { name: /CH34XSER_MAC\.ZIP/u })).toHaveAttribute('href', 'https://www.wch-ic.com/downloads/CH34XSER_MAC_ZIP.html');
    await expect(drivers).toContainText('드라이버 파일을 따로 올려 두지 않아요');
    await expect(drivers).toContainText('드라이버 설치에는 컴퓨터 관리자 권한이 필요해요');
    await expect(drivers.getByRole('heading', { name: '관리자 권한이 없으면: 전산 담당 선생님께 부탁하기' })).toBeVisible();
    const hrefs = await page.locator('main a[href]').evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('href') ?? ''));
    expect(hrefs.filter((href) => /\.(exe|zip|msi|dmg|pkg)$/iu.test(href))).toEqual([]);

    await expect(drivers.getByRole('link', { name: /Microsoft Update 카탈로그/u })).toHaveAttribute('href', 'https://www.catalog.update.microsoft.com/Search.aspx?q=USB-SERIAL%20CH340');
    await expect(drivers.getByRole('link', { name: /Espressif 문서/u })).toHaveAttribute(
      'href',
      'https://docs.espressif.com/projects/esp-idf/en/stable/esp32/get-started/establish-serial-connection.html',
    );

    await expect(drivers).toContainText('VID_1A86&PID_7523: WCH CH340');
    await expect(drivers).toContainText('VID_10C4&PID_EA60: Silicon Labs CP210x');

    const request = page.locator('#it-request');
    await expect(request.getByRole('heading', { name: '관리자 권한이 없으면: 전산 담당 선생님께 부탁하기' })).toBeVisible();
    const requestText = (await request.locator('[data-it-request-text]').textContent()) ?? '';
    expect(requestText).toContain('[ESP32 보드 드라이버 설치 부탁]');
    expect(requestText).toContain('https://www.wch-ic.com/downloads/CH341SER_EXE.html');
    expect(requestText).toContain('포트(COM & LPT)');
    await request.getByRole('button', { name: '부탁 글 복사' }).click();
    await expect(request.locator('[data-it-request-status]')).toHaveText('복사했어요. 메신저나 메일에 붙여 넣어요.');
    const copied = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/gu, '\n');
    expect(copied).toBe(requestText);

    // Linux: dialout·brltty·snap Chromium
    const linux = page.locator('#linux');
    await expect(linux).toContainText('sudo usermod -a -G dialout $USER');
    await expect(linux).toContainText('sudo dmesg | grep brltty');
    await expect(linux).toContainText('sudo apt remove brltty');
    await expect(linux).toContainText('sudo snap connect chromium:raw-usb');
    await expect(linux.getByRole('link', { name: /snap Chromium의 Web Serial/u })).toHaveAttribute('href', 'https://bugs.launchpad.net/ubuntu/+source/chromium-browser/+bug/1890365');
    await expect(linux.getByRole('link', { name: 'snap raw-usb 인터페이스 설명' })).toHaveAttribute('href', 'https://snapcraft.io/docs/reference/interfaces/raw-usb-interface/');
    await expect(page.locator('#still-not-working').getByRole('link', { name: CHECK.title })).toHaveAttribute('href', CHECK.href);

    await help.screenshot({ path: testInfo.outputPath('port-help.png') });

    // 다 확인하고 2단계로 돌아가 다시 [보드 연결] → 이번에는 보드를 고른다 → MicroPython·내장 LED
    await help.getByRole('link', { name: '다 확인했으면 2단계 [보드 연결]로 돌아가기' }).click();
    await expect(page).toHaveURL(/#connect$/u);
    await pressConnect(page);
    await waitConnectResult(page, 'ready');
    await expect(check).toHaveAttribute('data-blink', 'ok');
    await expect(check.locator('[data-connect-title]')).toHaveText('보드가 연결됐고 MicroPython이 있어요');
    expect(await board.requests()).toHaveLength(2);
    expect(errors).toEqual([]);
  });

  test('시나리오 C 흐름(모의 보드): [보드 연결] → MicroPython 없음 → 3단계 굽기 → 다시 연결·내장 LED 세 번 → 4단계 첫 예제 → ESP32 실습실 [실제 보드]에서 [실행]하면 GPIO2가 깜빡인다', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '데스크톱에서 본다');
    test.setTimeout(420_000);
    const errors = collectPageErrors(page);
    await installBoard(page, { firmwareMissingOnBoardPage: true });
    const served = await useTestFirmware(page);
    await openBoardPage(page);
    const check = connectCheck(page);
    const board = serialMock(page);
    const fw = flasher(page);
    await expect(fw).toHaveAttribute('data-mounted', 'true', { timeout: 30_000 });
    await expect(fw).toHaveAttribute('data-file-state', 'available', { timeout: 15_000 });

    // 2단계: 펌웨어가 지워진 보드 → "MicroPython 펌웨어가 없어요" → 3단계로
    await pressConnect(page);
    await waitConnectResult(page, 'no-micropython');
    await expect(check).toHaveAttribute('data-verdict', 'no-firmware');
    await expect(check.locator('[data-connect-title]')).toHaveText('보드에 MicroPython 펌웨어가 없어요');
    await expect(check.locator('[data-connect-info]')).toContainText('CH340(WCH) · USB 1a86:7523');
    await expect.poll(() => board.isOpen()).toBe(false);
    await check.screenshot({ path: testInfo.outputPath('connect-no-firmware.png') });
    await check.getByRole('link', { name: '3단계 펌웨어 굽기로 가기' }).click();
    await expect(page).toHaveURL(/#firmware$/u);
    await expect(page.locator('#firmware')).toBeInViewport();

    // 3단계: [펌웨어 굽기 시작] 한 번 → 끝
    await fw.getByRole('button', { name: '펌웨어 굽기 시작' }).click();
    await expect(fw).toHaveAttribute('data-state', 'done', { timeout: 120_000 });
    expect(served.requests).toContain('GET');
    const done = fw.locator('[data-firmware-done]');
    await expect(done.getByRole('link', { name: 'ESP32 실습실로 가기' })).toHaveAttribute('href', FIRST_EXAMPLE_HREF);
    await expect(done).toContainText('[실제 보드] 탭에서 [보드 연결]');
    await expect.poll(() => board.isOpen()).toBe(false);

    // 이 페이지에서 다시 확인 → MicroPython·내장 LED 세 번 → 연결을 닫음
    await done.getByRole('link', { name: '이 페이지에서 보드 연결 다시 확인하기' }).click();
    await expect(page).toHaveURL(/#connect$/u);
    await pressConnect(page);
    await expect(check).toHaveAttribute('data-phase', 'blinking', { timeout: BOARD_TIMEOUT });
    await expect(check.locator('[data-connect-title]')).toHaveText('MicroPython이 있어요. 내장 LED를 깜빡이는 중이에요…');
    await waitConnectResult(page, 'ready');
    await expect(check).toHaveAttribute('data-blink', 'ok');
    await expect(check).toHaveAttribute('data-version', 'v1.29.0');
    await expect(check.locator('[data-connect-info]')).toContainText('MicroPython v1.29.0 (2026-08-24)');
    await expect(check.locator('[data-connect-info]')).toContainText('USB 칩(참고)');
    const executed = await board.executed();
    expect(executed.at(-1)?.code).toContain('led = Pin(2, Pin.OUT)');
    expect(utf8Text(await board.deliveredText())).toContain('LED blink test done');
    expect((await board.pins())['2']).toBe(0);
    await expect.poll(() => board.isOpen()).toBe(false);
    await check.locator('summary', { hasText: 'LED가 깜빡이지 않았어요' }).click();
    await expect(check.locator('[data-connect-led-help]')).toContainText('원고 표기 D2, 2번 핀');
    await check.screenshot({ path: testInfo.outputPath('connect-ready.png') });

    // 4단계: 첫 예제(교과서 2-1-1) → ESP32 실습실
    await check.getByRole('link', { name: '4단계 첫 예제 실행하러 가기' }).click();
    await expect(page).toHaveURL(/#first-example$/u);
    const openExample = page.getByRole('link', { name: 'ESP32 실습실에서 첫 예제 열기' });
    await expect(openExample).toHaveAttribute('href', FIRST_EXAMPLE_HREF);
    // 교과서 2-1-1 차시와 잇는다: 차시 글(content/lessons, P5)이 있으면 그 차시로, 없으면 II단원 차례로
    await expect(page.locator('.first-example__lesson')).toContainText('2-1-1 피지컬 컴퓨팅 및 개발 환경의 이해');
    const lessonLink = page.locator('[data-first-lesson]');
    if ((await lessonLink.getAttribute('data-first-lesson')) === 'unit') {
      await expect(lessonLink).toHaveAttribute('href', getLearnUnit(2).href);
    } else {
      await expect(lessonLink).toHaveAttribute('href', withBase('learn/u2/2-1-1/'));
    }
    await openExample.click();
    await expect(page).toHaveURL(new RegExp(`${ESP32_LAB.href.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\?example=`, 'u'));
    const lab = labRoot(page);
    await expect(lab).toHaveAttribute('data-example', 'u2-2-1-1-blink-check', { timeout: LAB_TIMEOUT });
    await expect(page.locator('[data-lab-editor] .cm-content')).toContainText('led = Pin(2, Pin.OUT)', { timeout: LAB_TIMEOUT });
    await expect(lab).toHaveAttribute('data-lab-modules', /(^|\s)real-board(\s|$)/u, { timeout: LAB_TIMEOUT });

    // 실습실 [실제 보드] 탭 → [보드 연결] → [실행] → 모의 보드의 GPIO2가 1과 0을 오간다 → [정지]
    await page.getByRole('tab', { name: '실제 보드' }).click();
    const real = page.locator('[data-real-board]');
    await expect(real).toBeVisible();
    await real.getByRole('button', { name: '보드 연결' }).click();
    await expect(real).toHaveAttribute('data-real-board-state', 'ready', { timeout: BOARD_TIMEOUT });
    const labBoard = serialMock(page);
    await page.getByRole('button', { name: '실행', exact: true }).click();
    const seen = new Set<number>();
    await expect
      .poll(
        async () => {
          const level = (await labBoard.pins())['2'];
          if (typeof level === 'number') {
            seen.add(level);
          }
          return seen.size;
        },
        { timeout: BOARD_TIMEOUT, intervals: [100] },
      )
      .toBe(2);
    await page.getByRole('button', { name: '정지', exact: true }).click();
    await expect(lab).toHaveAttribute('data-outcome', 'stopped', { timeout: BOARD_TIMEOUT });
    expect((await labBoard.executed()).at(-1)?.code).toContain('led.on()');
    expect(errors).toEqual([]);
  });

  test('연결을 확인하는 도중 [펌웨어 굽기 시작]을 누르면 확인이 포트를 넘겨주고 굽기가 끝까지 된다', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '데스크톱에서 본다');
    test.setTimeout(180_000);
    await installBoard(page);
    await useTestFirmware(page);
    await openBoardPage(page);
    const check = connectCheck(page);
    const fw = flasher(page);
    await expect(fw).toHaveAttribute('data-file-state', 'available', { timeout: 15_000 });
    await pressConnect(page);
    await expect(check).toHaveAttribute('data-phase', 'blinking', { timeout: BOARD_TIMEOUT });
    await fw.getByRole('button', { name: '펌웨어 굽기 시작' }).click();
    await waitConnectResult(page, 'released');
    await expect(check.locator('[data-connect-title]')).toHaveText('펌웨어 굽기에 포트를 넘겨주고 확인을 멈췄어요');
    await expect(fw).toHaveAttribute('data-state', 'done', { timeout: 120_000 });
    // 굽기가 끝나면 포트를 닫는다(실습실이 곧바로 열 수 있게)
    await expect.poll(() => serialMock(page).isOpen()).toBe(false);
  });

  test('굽는 중에 [보드 연결]을 누르면 포트를 열지 않고 "펌웨어를 굽는 중이에요"', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '데스크톱에서 본다');
    test.setTimeout(180_000);
    await page.addInitScript(() => {
      (globalThis as unknown as { __APC_ESP32_ROM_OPTIONS__?: unknown }).__APC_ESP32_ROM_OPTIONS__ = { board: { writeMsPerBlock: 80 } };
    });
    await installSerialMock(page, { ports: [{ id: 'board' }] }, { plugins: [ROM_PLUGIN] });
    await useTestFirmware(page, 64_000);
    await openBoardPage(page);
    const fw = flasher(page);
    await expect(fw).toHaveAttribute('data-file-state', 'available', { timeout: 15_000 });
    await fw.getByRole('button', { name: '펌웨어 굽기 시작' }).click();
    await expect(fw).toHaveAttribute('data-state', 'running');
    await expect(fw.locator('[data-stage="write"]')).toHaveAttribute('data-stage-state', 'active', { timeout: 60_000 });
    const requestsBefore = (await serialMock(page).requests()).length;
    await pressConnect(page);
    await waitConnectResult(page, 'flasher-busy');
    await expect(connectCheck(page).locator('[data-connect-title]')).toHaveText('펌웨어를 굽는 중이에요');
    expect(await serialMock(page).requests()).toHaveLength(requestsBefore);
    await expect(fw).toHaveAttribute('data-state', 'done', { timeout: 120_000 });
  });

  test('대답 없는 보드·다른 프로그램이 쓰는 포트에는 까닭과 다음 할 일을 보여 준다', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '데스크톱에서 본다');
    test.setTimeout(120_000);
    await installBoard(page, { config: { ports: [{ id: 'silent', device: 'silent', label: 'ESP32(펌웨어 없음)' }, { id: 'busy', openError: 'NetworkError' }] } });
    await openBoardPage(page);
    const check = connectCheck(page);
    const mock = serialMock(page);

    await mock.chooseNext('silent');
    await pressConnect(page);
    await waitConnectResult(page, 'no-micropython');
    await expect(check).toHaveAttribute('data-verdict', 'silent');
    await expect(check.locator('[data-connect-title]')).toHaveText('보드가 대답하지 않아요');
    await expect(check.locator('[data-connect-steps] li')).toHaveCount(3);
    await expect(check.getByRole('link', { name: '3단계 펌웨어 굽기로 가기' })).toHaveAttribute('href', '#firmware');
    await expect.poll(() => mock.isOpen('silent')).toBe(false);

    await mock.chooseNext('busy');
    await pressConnect(page);
    await waitConnectResult(page, 'port-in-use');
    await expect(check.locator('[data-connect-detail]')).toContainText('Thonny');
    await expect(check.locator('[data-connect-log]')).toContainText('결과: port-in-use');
  });

  test('USB 보드 연결 기능이 없는 브라우저: [보드 연결]을 막고 점검 페이지로 보내며, 안내는 그대로 읽힌다', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '데스크톱에서 본다(휴대폰은 아래 검사)');
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'serial', { configurable: true, get: () => undefined });
    });
    await openBoardPage(page);
    const check = connectCheck(page);
    await expect(check).toHaveAttribute('data-support', 'unsupported');
    await expect(check.getByRole('button', { name: '보드 연결' })).toBeDisabled();
    await expect(check.locator('[data-connect-title]')).toHaveText('이 브라우저에서는 보드를 연결할 수 없어요');
    await expect(check.locator('[data-connect-detail]')).toContainText('컴퓨터용 Chrome이나 Edge');
    await expect(check.getByRole('link', { name: '이 브라우저로 되는지 점검하기' })).toHaveAttribute('href', CHECK.href);
    await portHelp(page).locator(':scope > summary').click();
    await expect(page.locator('#drivers')).toBeVisible();
  });

  test('다른 곳이 쓰는 주소(#firmware·#drivers·#linux·#device-manager·#it-request)로 열면 그 자리가 보이고 안내가 펼쳐진다', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '데스크톱에서 본다');
    await openBoardPage(page, '#firmware');
    await expect(page.locator('#firmware')).toBeInViewport();
    await expect(flasher(page)).toBeVisible();
    for (const hash of ['#drivers', '#linux', '#device-manager']) {
      // 주소를 새로 여는 것처럼(같은 문서 안 # 이동이 아니라) 빈 페이지를 거쳐 연다
      await page.goto('about:blank');
      await openBoardPage(page, hash);
      await expect(portHelp(page)).toHaveAttribute('open', '');
      await expect(page.locator(hash)).toBeInViewport();
    }
    await page.goto('about:blank');
    await openBoardPage(page, '#it-request');
    await expect(portHelp(page)).toHaveAttribute('open', '');
    await expect(page.locator('[data-it-request-text]')).toBeVisible();
    await expect(page.locator('#it-request')).toBeInViewport();
    // "연결이 안 될 때" 안내 안에는 접는 상자가 하나뿐이다(tests/e2e/start.spec.ts가 요약을 하나로 보고 키보드로 접고 편다)
    await expect(portHelp(page).locator('summary')).toHaveCount(1);
    // 같은 #위치 링크를 다시 눌러도(주소가 이미 그 #위치여도) 펼친다
    await portHelp(page).locator(':scope > summary').click();
    await expect(portHelp(page)).not.toHaveAttribute('open', '');
    await page.evaluate(() => {
      const anchor = document.createElement('a');
      anchor.href = '#it-request';
      anchor.textContent = 'x';
      document.querySelector('main')!.append(anchor);
      anchor.click();
    });
    await expect(portHelp(page)).toHaveAttribute('open', '');
  });

  test('휴대폰 화면: 가로로 넘치지 않고 연결 확인·장치 관리자 그림·드라이버 표가 화면 폭에 들어간다', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', '휴대폰 화면에서만');
    const errors = collectPageErrors(page);
    await openBoardPage(page, '#device-manager');
    await expect(portHelp(page)).toHaveAttribute('open', '');
    const check = connectCheck(page);
    await expect(check).toHaveAttribute('data-support', /^(unknown|supported)$/u);
    const viewport = page.viewportSize()!;
    for (const name of ['장치 관리자: 보드를 꽂기 전', '장치 관리자: 보드를 알아본 경우', '장치 관리자: 드라이버가 없는 경우']) {
      const box = await page.getByRole('img', { name }).boundingBox();
      expect(box, name).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.locator('.dm-figure').screenshot({ path: testInfo.outputPath('device-manager-mobile.png') });
    await check.scrollIntoViewIfNeeded();
    await check.screenshot({ path: testInfo.outputPath('connect-mobile.png') });
    expect(errors).toEqual([]);
  });
});
