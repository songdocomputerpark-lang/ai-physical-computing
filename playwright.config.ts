/**
 * 브라우저 테스트(Playwright 1.63.0) 설정 — PLAN §8.1 P1-09, PD-14·PD-35.
 *
 * 실행: npm run test:e2e
 *   ① npm run build(출처 검사·검색 색인 포함)로 dist/를 만들고 ② astro preview로 띄운 뒤 ③ tests/e2e/를 돌린다.
 *   화면 크기는 두 가지다: desktop 1366×768, mobile 375×812(P1-05 완료 기준).
 *
 * 브라우저 고르기(환경 변수 PW_CHANNEL)
 * - 적지 않으면: Playwright 전용 Chromium이 설치돼 있으면 그것을 쓰고, 없으면 Windows에서는 설치된 Microsoft Edge(msedge)를 쓴다.
 *   CI(GitHub Actions)에서는 늘 Playwright 전용 Chromium을 쓴다(npx playwright install --with-deps chromium).
 * - PW_CHANNEL=msedge 또는 chrome: 설치된 Edge·Chrome으로 정한다. PW_CHANNEL=chromium: Playwright 전용 Chromium으로 정한다.
 * 그 밖의 환경 변수
 * - PW_PORT: 미리 보기 서버 포트(기본 4329 — 개발 서버 4321과 겹치지 않게)
 * - CI: 실패하면 한 번 더 시도하고 HTML 보고서를 남긴다.
 *
 * 여러 사람이 같은 폴더에서 동시에 돌리지 않는다: 매번 dist/를 새로 빌드하므로 결과가 섞인다.
 * PW_PORT에 이미 다른 서버가 떠 있으면 새 서버를 띄우지 못해 오류로 멈춘다(오래된 dist/를 시험하지 않게 하려는 것).
 */
import fs from 'node:fs';
import { chromium, defineConfig, devices } from '@playwright/test';
import { siteConfig } from './src/config/site.ts';

const port = Number(process.env.PW_PORT ?? 4329);
const baseURL = `http://localhost:${port}${siteConfig.base}/`;
const isCI = Boolean(process.env.CI);

/** 브라우저 배포판(channel)을 고른다. undefined면 Playwright 전용 Chromium이다. */
function pickChannel(): string | undefined {
  const requested = process.env.PW_CHANNEL?.trim();
  if (requested) {
    return requested === 'chromium' ? undefined : requested;
  }
  if (isCI) {
    return undefined;
  }
  try {
    if (fs.existsSync(chromium.executablePath())) {
      return undefined;
    }
  } catch {
    // 설치 위치를 알 수 없으면 아래로 넘어간다.
  }
  return process.platform === 'win32' ? 'msedge' : undefined;
}

const channel = pickChannel();

/** webServer에 넘길 환경 변수(값이 있는 것만) */
function inheritedEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Phase 2(영상처리 실습실)에서 카메라 없이 가짜 영상으로 시험할 때 아래 주석을 푼다(PD-14).
    // 영상 파일은 코드로 만든 합성본만 커밋한다(PD-30). 파일이 없으면 Chromium이 기본 무늬 영상을 보낸다.
    // permissions: ['camera'],
    // launchOptions: {
    //   args: [
    //     '--use-fake-ui-for-media-stream', // 카메라 허용 창을 자동으로 허용
    //     '--use-fake-device-for-media-stream', // 진짜 카메라 대신 가짜 장치
    //     '--use-file-for-fake-video-capture=tests/fixtures/camera/synthetic.y4m', // 가짜 장치가 보낼 영상
    //   ],
    // },
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 }, channel },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'], viewport: { width: 375, height: 812 }, channel },
    },
  ],
  webServer: {
    // Astro 7의 astro preview는 AI 에이전트 환경(Claude Code 등)을 알아채면 스스로 백그라운드 서버로 떠서
    // 테스트가 끝나도 남는다. 그러면 다음 실행이 그 서버를 만나 새로 빌드한 dist/를 시험하지 못한다
    // (node_modules/astro/dist/cli/preview/index.js의 agentDetected·--ignore-lock 처리, 2026-09-16 확인).
    // 그래서 ① ASTRO_PREVIEW_BACKGROUND를 넣어 앞(foreground)에서 돌게 하고 ② --ignore-lock으로 잠금 파일을 쓰지 않으며
    // ③ 이미 떠 있는 서버는 다시 쓰지 않는다. 테스트가 끝나면 Playwright가 서버를 닫는다.
    command: `npm run build && npm run preview -- --port ${port} --ignore-lock`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
    // 테스트용 빌드는 Astro 익명 사용 통계를 보내지 않는다(PLAN §3.1 익명 통계 끔).
    env: { ...inheritedEnv(), ASTRO_TELEMETRY_DISABLED: '1', ASTRO_PREVIEW_BACKGROUND: '1' },
  },
});
