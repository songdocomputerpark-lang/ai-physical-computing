// 카메라 고르기·까만 영상 안내·점검 페이지 카메라 확인(판 1.1.0, PROGRESS 미해결 121) 브라우저 테스트.
//
// 교실 컴퓨터의 가상 카메라(화면 공유 프로그램 EShare 등)가 진짜 웹캠을 가려 실습실이 까만 화면만 받던 일(2026-09-17 운영자 PC)을
// 흉내 낸다: init script로 navigator.mediaDevices의 enumerateDevices·getUserMedia를 바꿔 여러 카메라를 만든다.
// - 'real'  : Playwright 가짜 카메라(playwright.config.ts의 합성 영상 — 회색 바탕에 도형)를 그대로 준다
// - 'black' : 까만 캔버스 영상(가상 카메라가 쉬는 동안 보내는 화면)   - 'gray16': 제한 범위 검정(밝기 16)
// - 'noise' : 어둡고 잡티가 조금 있는 영상(렌즈를 가린 카메라 흉내)    - 'none'  : 장을 한 장도 보내지 않음   - 'busy': 여는 순간 NotReadableError
// 허락 전(granted false)에는 Chrome처럼 이름·id가 빈 카메라 한 개만 알려 주고, 첫 getUserMedia가 성공하면 이름이 채워진 목록을 준다.
// 영상 처리 실습실 검사는 [입력 켜기]만 쓰므로 파이썬을 기다리지 않는다(파이썬은 뒤에서 받아지지만 검사와 상관없다).
// 1.1.0 검토 반영(2026-09-29): 안내 단추·점검 단추를 키보드로 눌러도 초점이 문서로 사라지지 않고, 휴대폰에서 안내가 화면 밖이면 화면 안으로 오고,
// 풀리면 콘솔에도 한 줄, 점검 [결과 복사] 글에는 장치 이름 대신 번호·종류만(사람 이름이 든 장치 이름 — 연속성 카메라).
// 실행: PW_BASE_URL=http://localhost:5001/ai-physical-computing/ npx playwright test tests/e2e/camera.spec.ts --project=desktop
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { getPage } from '../../src/config/nav.ts';
import { STORAGE_KEY_PREFIX } from '../../src/lib/storage.ts';
import { VISION_CAMERA_STORAGE_NAME } from '../../src/lab/vision/camera-devices.ts';
import { labRoot } from './helpers/lab.ts';
import { VISION_PATH } from './helpers/vision.ts';

type MockMode = 'real' | 'black' | 'gray16' | 'noise' | 'none' | 'busy';

interface MockCamera {
  readonly deviceId: string;
  readonly label: string;
  readonly mode: MockMode;
}

interface MockConfig {
  readonly cameras: readonly MockCamera[];
  /** 이미 허락한 사이트(처음부터 이름이 보이는 목록) */
  readonly granted?: boolean;
  /** getUserMedia가 늘 거부(NotAllowedError) */
  readonly deny?: boolean;
}

const ESHARE: MockCamera = { deviceId: 'cam-eshare', label: 'EShare Virtual Camera', mode: 'black' };
const WEBCAM: MockCamera = { deviceId: 'cam-webcam', label: 'HD Webcam', mode: 'real' };
const CAMERA_KEY = `${STORAGE_KEY_PREFIX}${VISION_CAMERA_STORAGE_NAME}`;

/** 브라우저 안에서 도는 가짜 카메라(init script — 페이지 스크립트보다 먼저 돈다) */
function installCameraMock(config: MockConfig): void {
  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices) {
    return;
  }
  const originalGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
  const originalEnumerate = mediaDevices.enumerateDevices.bind(mediaDevices);
  let granted = config.granted === true;
  const log: string[] = [];
  (window as unknown as { __cameraMock: unknown }).__cameraMock = { log, live: () => live };
  let live = 0;
  const info = (deviceId: string, label: string) => ({ kind: 'videoinput', deviceId, label, groupId: deviceId ? `g-${deviceId}` : '', toJSON() { return this; } });
  mediaDevices.enumerateDevices = async () => {
    const list = await originalEnumerate();
    const others = list.filter((device) => device.kind !== 'videoinput');
    const cameras = granted ? config.cameras.map((camera) => info(camera.deviceId, camera.label)) : [info('', '')];
    return [...others, ...cameras] as MediaDeviceInfo[];
  };
  mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
    if (config.deny) {
      log.push('deny');
      throw new DOMException('Permission denied', 'NotAllowedError');
    }
    const video = constraints?.video;
    const wanted = typeof video === 'object' && video !== null ? (video as MediaTrackConstraints).deviceId : undefined;
    const exact =
      typeof wanted === 'string'
        ? wanted
        : wanted && typeof wanted === 'object' && !Array.isArray(wanted)
          ? ((wanted as ConstrainDOMStringParameters).exact as string | undefined)
          : undefined;
    const camera = exact ? config.cameras.find((item) => item.deviceId === exact) : config.cameras[0];
    log.push(`open:${exact ?? 'default'}`);
    if (!camera) {
      throw new DOMException('Requested device not found', 'OverconstrainedError');
    }
    if (camera.mode === 'busy') {
      throw new DOMException('Could not start video source', 'NotReadableError');
    }
    granted = true;
    let stream: MediaStream;
    let timer: ReturnType<typeof setInterval> | null = null;
    if (camera.mode === 'real') {
      stream = await originalGetUserMedia({ video: { width: 640, height: 480 }, audio: false });
    } else {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d')!;
      let seed = 1;
      const paint = () => {
        if (camera.mode === 'noise') {
          // 어둡고 잡티가 조금 있는 장(밝기 4~12, 평균 8, 표준편차 약 2.6) — 10×10 덩어리로 칠해 실습실이 64×48로 줄여 재도 잡티가 남는다.
          for (let y = 0; y < 480; y += 10) {
            for (let x = 0; x < 640; x += 10) {
              seed = (seed * 1664525 + 1013904223) >>> 0;
              const value = 4 + ((seed >>> 16) % 9);
              ctx.fillStyle = `rgb(${value}, ${value}, ${value})`;
              ctx.fillRect(x, y, 10, 10);
            }
          }
        } else {
          ctx.fillStyle = camera.mode === 'gray16' ? 'rgb(16, 16, 16)' : '#000000';
          ctx.fillRect(0, 0, 640, 480);
        }
      };
      const Generator = (window as unknown as { MediaStreamTrackGenerator?: new (init: { kind: 'video' }) => MediaStreamTrack }).MediaStreamTrackGenerator;
      if (camera.mode === 'none' && Generator) {
        // 장을 한 장도 쓰지 않는 트랙(Chromium의 MediaStreamTrackGenerator) — 캔버스는 처음 한 장을 보내 버린다.
        stream = new MediaStream([new Generator({ kind: 'video' })]);
      } else {
        paint();
        stream = canvas.captureStream(camera.mode === 'none' ? 0 : 15);
        if (camera.mode !== 'none') {
          timer = setInterval(paint, 66);
        }
      }
    }
    const track = stream.getVideoTracks()[0]!;
    const settings = track.getSettings.bind(track);
    track.getSettings = () => ({ ...settings(), deviceId: camera.deviceId });
    const stop = track.stop.bind(track);
    live += 1;
    let stopped = false;
    track.stop = () => {
      if (!stopped) {
        stopped = true;
        live -= 1;
        log.push(`stop:${camera.deviceId}`);
      }
      if (timer !== null) {
        clearInterval(timer);
      }
      stop();
    };
    return stream;
  };
}

async function mockLog(page: Page): Promise<string[]> {
  return page.evaluate(() => [...((window as unknown as { __cameraMock?: { log: string[] } }).__cameraMock?.log ?? [])]);
}

async function liveStreams(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __cameraMock?: { live: () => number } }).__cameraMock?.live() ?? -1);
}

async function openVisionWithMock(page: Page, config: MockConfig, beforeLoad?: () => Promise<void>): Promise<void> {
  await page.addInitScript(installCameraMock, config);
  await beforeLoad?.();
  const response = await page.goto(VISION_PATH);
  expect(response?.status()).toBe(200);
  // 실습실 화면 논리가 붙을 때까지(입력 소스 목록이 채워진다)
  await expect(labRoot(page)).toHaveAttribute('data-vision-input-state', 'closed', { timeout: 60_000 });
}

async function turnInputOn(page: Page): Promise<void> {
  await page.getByRole('button', { name: '입력 켜기', exact: true }).click();
  await expect(labRoot(page)).toHaveAttribute('data-vision-input-state', 'open', { timeout: 30_000 });
}

/**
 * 고른 칸만 axe로 훑어 심각(critical·serious) 위반을 모은다. 실습실 쪽은 iframe이 없어 결과를 합치는 도우미 쪽을 열지 않는
 * legacy 모드로 돈다(기본 모드는 새 쪽을 열어 합치는데, 파이썬을 받는 실습실 옆에서 90초 넘게 걸렸다 — 2026-09-28 실측).
 */
async function severeAxe(page: Page, include: string): Promise<string[]> {
  const results = await new AxeBuilder({ page }).setLegacyMode(true).include(include).exclude('astro-dev-toolbar').analyze();
  return results.violations
    .filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')
    .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.html.slice(0, 120)).join(' / ')}`);
}

test.describe('영상 처리 실습실 — 카메라 고르기(모의 카메라 여러 대)', () => {
  test.skip(({ isMobile }) => isMobile, '카메라 고르기 흐름은 데스크톱에서 확인한다(휴대폰 화면 배치는 아래 따로)');
  test.describe.configure({ timeout: 180_000 });

  test('처음 허락하는 교실 컴퓨터: 기본 장치가 가상 카메라여도 진짜 카메라로 바꿔 열고, [카메라] 칸에 두 대가 보인다(가상 카메라는 뒤로)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openVisionWithMock(page, { cameras: [ESHARE, WEBCAM] });
    const cameraRow = page.locator('[data-vision-camera]');
    // 허락 전에는 이름을 몰라 고를 수 없다 — 칸이 숨어 있다.
    await expect(cameraRow).toBeHidden();
    await turnInputOn(page);

    // 기본값(가상 카메라)으로 한 번 열어 허락을 받은 뒤, 목록에서 가상 카메라임을 알고 진짜 카메라로 바꿨다.
    expect(await mockLog(page)).toEqual(['open:default', 'stop:cam-eshare', 'open:cam-webcam']);
    await expect(labRoot(page)).toHaveAttribute('data-vision-camera-kind', 'normal');
    await expect(labRoot(page)).toHaveAttribute('data-vision-camera-count', '2');
    await expect(cameraRow).toBeVisible();
    const select = page.getByLabel('카메라', { exact: true });
    await expect(select).toHaveValue('cam-webcam');
    await expect(select.locator('option')).toHaveText(['HD Webcam', '가상 카메라: EShare Virtual Camera']);
    await expect(page.locator('[data-vision-input-message]')).toContainText(
      '카메라를 켰어요: HD Webcam. 가상 카메라(EShare Virtual Camera)는 건너뛰었어요',
    );
    await expect(page.locator('[data-vision-input-status]')).toContainText('HD Webcam');
    // 진짜 카메라(가짜 카메라 합성 영상)는 까맣지 않다 — 안내가 뜨지 않는다.
    await expect(labRoot(page)).toHaveAttribute('data-vision-camera-check', 'ok', { timeout: 10_000 });
    await expect(page.locator('[data-vision-camera-notice]')).toBeHidden();
    // 알아서 고른 카메라는 기억하지 않는다(학생이 고른 것만).
    expect(await page.evaluate((key) => localStorage.getItem(key), CAMERA_KEY)).toBeNull();
    expect(await liveStreams(page)).toBe(1);
    expect(errors).toEqual([]);
  });

  test('이미 허락한 컴퓨터: 가상 카메라를 한 번도 켜지 않고 진짜 카메라를 연다 — [카메라] 칸은 처음부터 보인다', async ({ page }) => {
    await openVisionWithMock(page, { cameras: [ESHARE, WEBCAM], granted: true });
    await expect(page.locator('[data-vision-camera]')).toBeVisible();
    await expect(page.getByLabel('카메라', { exact: true })).toHaveValue('cam-webcam');
    await turnInputOn(page);
    expect(await mockLog(page)).toEqual(['open:cam-webcam']);
    await expect(page.locator('[data-vision-input-message]')).toContainText('가상 카메라(EShare Virtual Camera)는 건너뛰었어요');
  });

  test('고른 카메라는 이 브라우저에만 기억하고 다시 열어도 그 카메라다 → 까만 화면 안내 → [다른 카메라로 바꾸기] → [기록 지우기]가 잊는다', async ({ page }) => {
    await openVisionWithMock(page, { cameras: [ESHARE, WEBCAM], granted: true });
    const select = page.getByLabel('카메라', { exact: true });
    // 입력이 꺼진 채로 고르면 기억만 한다(카메라를 켜지 않는다).
    await select.selectOption('cam-eshare');
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), CAMERA_KEY)).toBe('cam-eshare');
    expect(await mockLog(page)).toEqual([]);

    await page.reload();
    await expect(labRoot(page)).toHaveAttribute('data-vision-input-state', 'closed', { timeout: 60_000 });
    await expect(page.getByLabel('카메라', { exact: true })).toHaveValue('cam-eshare');
    await turnInputOn(page);
    expect(await mockLog(page)).toEqual(['open:cam-eshare']);
    await expect(labRoot(page)).toHaveAttribute('data-vision-camera-kind', 'virtual');

    // 가상 카메라가 까만 화면만 보낸다 → 2초 뒤 안내(가상 카메라 이야기가 먼저, 진짜 카메라 하나로 바로 바꾸는 단추).
    // (한 번 고른 가상 카메라는 기억한 선택이라 존중해 연다 — 알아서 건너뛰는 것은 기본 장치일 때만, DECISIONS C40·C62)
    const notice = page.locator('[data-vision-camera-notice]');
    await expect(notice).toBeVisible({ timeout: 10_000 });
    await expect(labRoot(page)).toHaveAttribute('data-vision-camera-check', 'black');
    await expect(notice.locator('[data-vision-camera-notice-title]')).toHaveText('카메라는 켜졌는데 화면이 까매요');
    await expect(notice.locator('[data-cause]').first()).toHaveAttribute('data-cause', 'current-virtual');
    await expect(notice.locator('[data-cause]').first()).toContainText('지금 켠 카메라(EShare Virtual Camera)는 가상 카메라예요');
    await expect(page.locator('[data-vision-input-message]')).toContainText('카메라는 켜졌는데 화면이 까매요');
    await expect(page.locator('[data-lab-console]')).toContainText('[안내] 카메라는 켜졌는데 화면이 까매요');
    const other = notice.getByRole('button', { name: '다른 카메라로 바꾸기(HD Webcam)' });
    await expect(other).toBeVisible();
    expect(await severeAxe(page, '[data-vision-io]')).toEqual([]);

    // 키보드로 누른다: 안내가 숨으며 단추가 사라져도 초점은 [카메라] 칸(바꾼 카메라가 골라져 있음)으로 간다 — 문서(body)로 사라지지 않는다
    await other.focus();
    await page.keyboard.press('Enter');
    await expect(labRoot(page)).toHaveAttribute('data-vision-camera-kind', 'normal', { timeout: 15_000 });
    await expect(notice).toBeHidden();
    await expect(page.getByLabel('카메라', { exact: true })).toHaveValue('cam-webcam');
    await expect(page.getByLabel('카메라', { exact: true })).toBeFocused();
    await expect(page.getByLabel('카메라', { exact: true })).toBeInViewport();
    // 안내가 풀렸다는 것을 콘솔에도(실습실 틀의 "콘솔에 결과가 나왔어요" 칸에 옛 안내가 남지 않게)
    await expect(page.locator('[data-lab-console]')).toContainText('[안내] 다른 입력으로 바꿨어요 — 까만 화면 안내를 닫았어요.');
    expect(await page.evaluate((key) => localStorage.getItem(key), CAMERA_KEY)).toBe('cam-webcam');
    expect(await mockLog(page)).toEqual(['open:cam-eshare', 'stop:cam-eshare', 'open:cam-webcam']);
    await expect(labRoot(page)).toHaveAttribute('data-vision-camera-check', 'ok', { timeout: 10_000 });

    // [이 컴퓨터에서 내 기록 지우기] → 기억한 카메라도 지운다.
    const records = page.locator('[data-lab] [data-clear-records]');
    await records.getByRole('button', { name: '이 컴퓨터에서 내 기록 지우기' }).click();
    await records.getByRole('button', { name: '지우기', exact: true }).click();
    await expect(records).toHaveAttribute('data-state', 'done');
    expect(await page.evaluate((key) => localStorage.getItem(key), CAMERA_KEY)).toBeNull();
  });

  test('카메라가 한 대뿐이고 어둡게(잡티 조금) 들어오면: 가리개·어두운 방 안내가 먼저, 바꾸기 단추 없이 [샘플로 계속]으로 이어 간다', async ({ page }) => {
    await openVisionWithMock(page, { cameras: [{ deviceId: 'cam-usb', label: 'USB2.0 Camera', mode: 'noise' }] });
    await turnInputOn(page);
    const notice = page.locator('[data-vision-camera-notice]');
    await expect(notice).toBeVisible({ timeout: 10_000 });
    await expect(notice).toHaveAttribute('data-verdict', 'black');
    const causes = await notice.locator('[data-cause]').evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset.cause));
    // 카메라 한 대(가상 카메라 없음)인 노트북은 장치 관리자로 보내지 않는다(1.1.0 검토 반영)
    expect(causes).toEqual(['cover']);
    await expect(notice.locator('[data-cause="cover"]')).toContainText('카메라 끄기 키(Fn + 카메라 그림)');
    await expect(notice.locator('[data-vision-camera-other]')).toBeHidden();
    await expect(page.locator('[data-vision-camera]')).toBeHidden();
    await expect(notice.getByRole('link', { name: '자세한 해결 방법' })).toHaveAttribute('href', /\/help\/#camera-black$/u);

    // 키보드로 [샘플로 계속]: 초점은 입력 소스 칸('샘플 입력'이 골라짐)으로 — 문서로 사라지지 않는다
    await notice.getByRole('button', { name: '샘플로 계속', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(labRoot(page)).toHaveAttribute('data-vision-source', 'sample');
    await expect(labRoot(page)).toHaveAttribute('data-vision-input-state', 'open');
    await expect(notice).toBeHidden();
    await expect(page.getByLabel('입력 소스', { exact: true })).toBeFocused();
    await expect(labRoot(page)).toHaveAttribute('data-vision-camera-check', 'idle');
    expect(await liveStreams(page)).toBe(0);
  });

  test('제한 범위 검정(밝기 16)도 까만 화면으로 보고, 영상이 한 장도 오지 않으면 4초 뒤 "영상이 들어오지 않아요"', async ({ page }) => {
    await openVisionWithMock(page, {
      cameras: [
        { deviceId: 'cam-gray', label: 'Capture Card', mode: 'gray16' },
        { deviceId: 'cam-none', label: 'Idle Cam', mode: 'none' },
      ],
      granted: true,
    });
    await turnInputOn(page);
    const notice = page.locator('[data-vision-camera-notice]');
    await expect(notice).toHaveAttribute('data-verdict', 'black', { timeout: 10_000 });
    // 잡티 없는 검정(flat) + 다른 카메라 한 대 → 다른 카메라 이야기가 먼저
    await expect(notice.locator('[data-cause]').first()).toHaveAttribute('data-cause', 'other-camera');
    await notice.getByRole('button', { name: '다른 카메라로 바꾸기(Idle Cam)' }).click();
    await expect(notice).toHaveAttribute('data-verdict', 'no-frames', { timeout: 20_000 });
    await expect(notice.locator('[data-vision-camera-notice-title]')).toHaveText('카메라는 켜졌는데 영상이 들어오지 않아요');
    await expect(notice.locator('[data-cause="busy"]')).toHaveCount(1);
  });

  test('고른 카메라를 다른 프로그램이 쓰고 있으면 입력을 끄지 않고 다른 카메라를 켠 뒤 까닭을 알린다', async ({ page }) => {
    await openVisionWithMock(page, {
      cameras: [WEBCAM, { deviceId: 'cam-busy', label: 'USB Webcam', mode: 'busy' }],
      granted: true,
    });
    await turnInputOn(page);
    await page.getByLabel('카메라', { exact: true }).selectOption('cam-busy');
    await expect(page.locator('[data-vision-input-message]')).toContainText(
      '고른 카메라를 다른 프로그램이 쓰고 있어서 열지 못했어요. 대신 켠 카메라: HD Webcam.',
      { timeout: 15_000 },
    );
    await expect(labRoot(page)).toHaveAttribute('data-vision-source', 'webcam');
    await expect(labRoot(page)).toHaveAttribute('data-vision-input-state', 'open');
  });
});

test.describe('영상 처리 실습실 — 까만 화면 안내의 휴대폰 화면 배치', () => {
  test.skip(({ isMobile }) => !isMobile, '휴대폰 화면(375px)에서만 확인한다');

  test('안내가 떠도 화면이 옆으로 넘치지 않고 단추가 손가락 크기다 — 안내가 화면 밖(아래를 보는 중)이면 화면 안으로 온다', async ({ page }) => {
    await openVisionWithMock(page, { cameras: [ESHARE, { ...WEBCAM, mode: 'black' }], granted: true });
    await page.getByLabel('카메라', { exact: true }).selectOption('cam-eshare');
    await turnInputOn(page);
    // 안내가 뜨기 전(카메라를 켠 뒤 2초)에 쪽 맨 아래로 — [실행] 뒤 출력 칸을 보는 휴대폰 학생처럼
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const notice = page.locator('[data-vision-camera-notice]');
    await expect(notice).toBeVisible({ timeout: 15_000 });
    await expect(notice).toBeInViewport({ timeout: 5_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    for (const button of await notice.getByRole('button').all()) {
      if (await button.isVisible()) {
        const box = await button.boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(36);
      }
    }
    await notice.scrollIntoViewIfNeeded();
    await test.info().attach('camera-notice-mobile.png', { body: await page.screenshot(), contentType: 'image/png' });
  });
});

test.describe('점검 페이지 — 카메라 영상 확인(누를 때만)', () => {
  test.skip(({ isMobile }) => isMobile, '카메라 확인 흐름은 데스크톱에서 확인한다');
  test.describe.configure({ timeout: 90_000 });

  test('누르기 전에는 카메라를 켜지 않고, 누르면 카메라마다 결과(가상 카메라·먼저 여는 카메라 표시)가 나오고 [결과 복사]에 담긴다', async ({ page, context }) => {
    await context.grantPermissions(['camera', 'clipboard-read', 'clipboard-write']);
    await page.addInitScript(installCameraMock, { cameras: [ESHARE, WEBCAM] });
    await page.goto(getPage('start-check').href);
    await expect(page.locator('[data-check-report]')).toHaveAttribute('data-state', 'done', { timeout: 15_000 });
    const check = page.locator('[data-camera-check]');
    await expect(check).toHaveAttribute('data-state', 'idle');
    expect(await mockLog(page)).toEqual([]);
    // 점검 표 글에는 아직 카메라 확인이 없다.
    await expect(page.locator('[data-check-text]')).not.toHaveValue(/카메라 영상 확인/u);

    // 키보드로 누른다: 확인하는 동안과 끝난 뒤에도 초점이 이 단추에 남는다(disabled 대신 aria-disabled — 1.1.0 검토 반영)
    const runButton = check.getByRole('button', { name: '카메라 켜서 확인하기' });
    await runButton.focus();
    await page.keyboard.press('Enter');
    await expect(check).toHaveAttribute('data-state', 'running');
    expect(await page.evaluate(() => document.activeElement?.hasAttribute('data-camera-check-run') ?? false)).toBe(true);
    await expect(check).toHaveAttribute('data-state', 'done', { timeout: 30_000 });
    await expect(check.getByRole('button', { name: '카메라 다시 확인하기' })).toBeFocused();
    const entries = check.locator('[data-camera-check-entry]');
    await expect(entries).toHaveCount(2);
    await expect(entries.nth(0)).toHaveAttribute('data-default', 'yes');
    await expect(entries.nth(0)).toHaveAttribute('data-kind', 'virtual');
    await expect(entries.nth(0)).toHaveAttribute('data-outcome', 'black');
    await expect(entries.nth(0)).toContainText('EShare Virtual Camera [가상 카메라] · 브라우저가 먼저 여는 카메라 — 까만 화면만 와요');
    await expect(entries.nth(1)).toHaveAttribute('data-outcome', 'ok');
    await expect(entries.nth(1)).toContainText('HD Webcam — 영상이 잘 들어와요');
    await expect(check).toHaveAttribute('data-level', 'warn');
    await expect(check.locator('[data-camera-check-verdict-text]')).toContainText('가상 카메라라서 까만 화면만 와요');
    // 확인이 끝나면 모든 카메라를 껐다.
    expect(await liveStreams(page)).toBe(0);
    await expect(check.locator('[data-camera-check-preview]')).toBeHidden();

    // 요약 칸에도 카메라 결과 한 줄(자동 점검이 모두 "지원"이어도 카메라가 "주의"면 초록으로 두지 않는다)
    await expect(page.locator('[data-check-camera]')).toBeVisible();
    await expect(page.locator('[data-check-camera]')).toContainText('카메라 영상 확인: 주의');
    await expect(page.locator('[data-check-report]')).not.toHaveAttribute('data-level', 'ready');

    await page.locator('[data-check-copy]').click();
    await expect(page.locator('[data-check-copy-status]')).toContainText('복사했어요');
    const copied = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/gu, '\n');
    expect(copied).toContain('카메라 영상 확인(눌러서 확인');
    expect(copied).toContain('카메라 영상 확인: 주의 — 아래 "카메라 영상 확인" 참고');
    expect(copied).toContain('- 카메라 2대(이름은 넣지 않고 번호로 적어요)');
    expect(copied).toContain("- 카메라 1 [가상 카메라 — 이름에 'EShare' 낱말] · 브라우저가 먼저 여는 카메라 — 까만 화면만 와요");
    expect(copied).toContain('- 카메라 2 — 영상이 잘 들어와요');
    // 복사 글(공개 이슈에 붙일 수 있는 글)에는 장치 이름이 없다 — 화면 목록에만 있다(1.1.0 안전 검토 지적 1)
    expect(copied).not.toContain('EShare Virtual Camera');
    expect(copied).not.toContain('HD Webcam');
    await expect(page.locator('[data-check-text]')).toHaveValue(copied);
    // 장치 이름은 저장하지 않는다(이 사이트의 저장 공간 어디에도 없다).
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    expect(stored).not.toContain('EShare');
    expect(stored).not.toContain('HD Webcam');
    expect(await severeAxe(page, '[data-camera-check]')).toEqual([]);

    // [다시 점검]해도 카메라 결과는 복사 글에 남는다.
    await page.getByRole('button', { name: '다시 점검' }).click();
    await expect(page.locator('[data-check-report]')).toHaveAttribute('data-state', 'done', { timeout: 15_000 });
    await expect(page.locator('[data-check-text]')).toHaveValue(/카메라 영상 확인/u);
  });

  test('사람 이름이 든 장치 이름(맥의 연속성 카메라 "○○의 iPhone 카메라")은 화면에만 보이고 [결과 복사] 글에는 없다', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const phone: MockCamera = { deviceId: 'cam-phone', label: '홍길동의 iPhone 카메라', mode: 'real' };
    await page.addInitScript(installCameraMock, { cameras: [phone, WEBCAM] });
    await page.goto(getPage('start-check').href);
    await expect(page.locator('[data-check-report]')).toHaveAttribute('data-state', 'done', { timeout: 15_000 });
    const check = page.locator('[data-camera-check]');
    await check.getByRole('button', { name: '카메라 켜서 확인하기' }).click();
    await expect(check).toHaveAttribute('data-state', 'done', { timeout: 30_000 });
    await expect(check.locator('[data-camera-check-entry]').first()).toContainText('홍길동의 iPhone 카메라');
    await page.locator('[data-check-copy]').click();
    await expect(page.locator('[data-check-copy-status]')).toContainText('복사했어요');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('- 카메라 1 · 브라우저가 먼저 여는 카메라 — 영상이 잘 들어와요');
    expect(copied).not.toContain('홍길동');
    expect(copied).not.toContain('iPhone');
    await expect(page.locator('[data-check-text]')).not.toHaveValue(/홍길동/u);
  });

  test('카메라를 허용하지 않으면 까닭과 되돌리는 방법만 보인다', async ({ page }) => {
    await page.addInitScript(installCameraMock, { cameras: [WEBCAM], deny: true });
    await page.goto(getPage('start-check').href);
    const check = page.locator('[data-camera-check]');
    await check.getByRole('button', { name: '카메라 켜서 확인하기' }).click();
    await expect(check).toHaveAttribute('data-state', 'done', { timeout: 20_000 });
    await expect(check).toHaveAttribute('data-level', 'fail');
    await expect(check.locator('[data-camera-check-verdict-text]')).toHaveText('카메라 사용을 허용하지 않아서 확인하지 못했어요.');
    await expect(check.locator('[data-camera-check-entry]')).toHaveCount(0);
    await expect(check.getByRole('button', { name: '카메라 다시 확인하기' })).toBeEnabled();
    // 되돌리는 방법은 실습실·도움말과 같은 문장(주소창 왼쪽 사이트 정보 아이콘)
    await expect(check.locator('[data-camera-check-advice]')).toContainText('주소창 왼쪽의 사이트 정보 아이콘');
  });
});
