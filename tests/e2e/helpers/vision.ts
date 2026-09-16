// 영상처리 실습실 브라우저 테스트 공통 도구 — lab-vision.spec.ts(P2-03)와 scenario-a.spec.ts(P2-04)가 함께 쓴다.
// 가짜 카메라(playwright.config.ts, scripts/gen-test-video.mjs의 합성 영상 640×480)로 /labs/vision/을 열고 출력 창의 픽셀을 잰다.
import { expect, type Page } from '@playwright/test';
import { withBase } from '../../../src/lib/url.ts';
import { LOAD_TIMEOUT, labRoot } from './lab.ts';

export const VISION_PATH = withBase('labs/vision/');
/** OpenCV 휠(10.7MB)까지 받는 시간 */
export const PACKAGES_TIMEOUT = 150_000;
export const FRAME_TIMEOUT = 60_000;

export function collectRequests(page: Page): { origins: Set<string>; urls: string[] } {
  const origins = new Set<string>();
  const urls: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (/^https?:/u.test(url)) {
      origins.add(new URL(url).origin);
      urls.push(url);
    }
  });
  return { origins, urls };
}

/** 이미 연 실습실 페이지에서 파이썬·OpenCV가 준비될 때까지 기다린다. */
export async function waitVisionReady(page: Page): Promise<void> {
  await expect(labRoot(page)).toHaveAttribute('data-state', 'idle', { timeout: LOAD_TIMEOUT });
  await expect(labRoot(page)).toHaveAttribute('data-vision-packages', 'ready', { timeout: PACKAGES_TIMEOUT });
  await expect(page.locator('[data-vision-stages]')).toHaveAttribute('data-state', 'done');
}

/** 실습실을 열고 파이썬·OpenCV가 준비될 때까지 기다린다. */
export async function openVisionLab(page: Page, query = ''): Promise<void> {
  const response = await page.goto(`${VISION_PATH}${query}`);
  expect(response?.status()).toBe(200);
  await waitVisionReady(page);
}

/** 출력 창 캔버스에서 밝은(200 초과) 픽셀 비율을 잰다. */
export async function whiteRatio(page: Page, windowName: string): Promise<number> {
  return page.locator(`canvas[data-vision-window="${windowName}"]`).evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx || canvas.width === 0) {
      return -1;
    }
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let white = 0;
    for (let index = 0; index < data.length; index += 4) {
      if ((data[index] ?? 0) > 200) {
        white += 1;
      }
    }
    return white / (canvas.width * canvas.height);
  });
}

/**
 * 흰 픽셀 비율을 여러 장에 걸쳐 평균 낸다. 합성 영상(16장, 15fps)은 도형이 움직여 장마다 테두리 픽셀 수가 ±0.06%쯤 흔들리므로
 * (원이 사선을 지나며 가리는 때, 2026-09-16 실제 OpenCV로 계산), 한 바퀴(약 1.1초)보다 길게 샘플해 평균하면 임계값 차이만 남는다.
 */
export async function averageWhiteRatio(page: Page, windowName: string, samples = 24, intervalMs = 70): Promise<number> {
  let total = 0;
  for (let index = 0; index < samples; index += 1) {
    total += await whiteRatio(page, windowName);
    await page.waitForTimeout(intervalMs);
  }
  return total / samples;
}

/** 출력 상태 글("edges 640×480 · 13fps · 71장")의 그린 장 수 */
export async function framesShown(page: Page): Promise<number> {
  const text = (await page.locator('[data-vision-output-status]').textContent()) ?? '';
  const match = /(\d+)장/u.exec(text);
  return match ? Number(match[1]) : 0;
}

/** 출력 창에 장이 n장 이상 그려질 때까지 기다린다(출력 상태 글의 "n장"). */
export async function waitFrames(page: Page, windowName: string, count: number): Promise<void> {
  await expect(page.locator(`canvas[data-vision-window="${windowName}"]`)).toBeVisible({ timeout: FRAME_TIMEOUT });
  await expect.poll(() => framesShown(page), { timeout: FRAME_TIMEOUT }).toBeGreaterThanOrEqual(count);
}
