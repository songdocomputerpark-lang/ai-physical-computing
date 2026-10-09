/**
 * 가려진 탭의 타이머 조절과 같은 컴퓨터 탭 통로(미해결 220 — 판 1.1.5 뒤) — **창이 있는 브라우저로 몇 분 재는 측정 검사**.
 *
 * 무엇을 재나
 *  크롬·엣지는 다 불러온 쪽이 1분 넘게 가려지면(소리 없음·WebRTC 없음) 주 스레드의 사슬 타이머를 1분에 한 번만 깨운다
 *  (intensive wake up throttling — https://developer.chrome.com/blog/timer-throttling-in-chrome-88, 지금 Chromium의 다 불러온 쪽 유예는
 *  60초: third_party/blink/renderer/platform/scheduler/common/features.h). 탭 통로(src/lab/bridge/channels/tab.ts)는 2초마다
 *  "여기 있어요"(bridge.here)를 보내고 6초 동안 소식이 없는 상대를 목록에서 빼므로, 옛 시계(주 스레드 setTimeout 사슬)면 가려진 보드 탭이
 *  상대 탭의 목록에서 빠졌다 들어왔다 했다. 새 기본 시계(워커 — src/lab/bridge/channels/background-clock.ts)는 가려져도 2초마다 알린다.
 *
 *  1. 탭 통로 시계 전후(개발 서버 전용 — 원본 모듈 /src/lab/bridge/index.ts를 쪽에서 불러온다): 가린 탭 하나에 보드 끝 둘(옛 시계·새 시계)을
 *     열고, 보이는 탭이 bridge.here 도착 시각과 0.5초마다 상대 목록을 적는다. 옛 시계는 가린 뒤 1분쯤부터 빠지고(재현), 새 시계는 내내 남는다.
 *  2. 두 탭 블루투스 실습(실제 화면 — 어느 서버에서나): ESP32 실습실 탭(보드, 블루투스로 받는 예제)을 가리고 영상 처리 실습실 탭에서
 *     교과서 모양 코드(`if b.connected: b.send(…)`)를 돌리며 0.5초마다 이어짐(data-ble-pc-connected)을 적는다 — 가린 동안 끊기지 않아야 한다.
 *     실사이트 1.1.5(옛 시계)를 PW_BASE_URL로 주면 끊기는 것(전)을 볼 수 있다.
 *
 * 판정 — 바쁜 PC의 "굶주림"과 강한 조절을 가른다(2026-10-06: 다른 작업이 CPU 100%·남은 메모리 0.5GB로 돌 때 가려진 탭의 주 스레드가
 *  몇 초씩 밀려 새 시계도 한때 빠졌다). 가린 탭에서 워커가 0.5초마다 보낸 알림을 주 스레드가 받기까지 걸린 시간("주 스레드 지연")을 함께 잰다.
 *  - 강한 조절의 표시 = 30초 넘는 빈틈(1분 맞춤). 옛 시계에는 있어야 하고(재현), 새 시계에는 없어야 한다.
 *  - 주 스레드 지연이 작았으면(최대 2초 미만) 새 시계는 한 번도 빠지지 않아야 한다. 지연이 크면 그 기록만 남긴다 — 멈춘 주 스레드는
 *    알리지 못하는 것이 설계다(살아 있음 = 주 스레드가 일함).
 *
 * 왜 Playwright의 launch를 쓰지 않나: Playwright는 쪽마다 초점 흉내(Emulation.setFocusEmulationEnabled)를 걸어 쪽이 늘 "보임"이고
 * (다른 탭 앞으로·창 최소화를 해도 visibilityState가 visible — 2026-10-06 Edge 154 확인), 기본 실행 인자가 타이머 조절을 끈다
 * (--disable-background-timer-throttling 등). 그래서 설치된 브라우저를 새 임시 프로필로 직접 띄우고(원격 디버깅) connectOverCDP의
 * `noDefaults: true`(초점 흉내를 걸지 않는다 — Playwright 공식 선택)로 붙는다. 창이 화면에 몇 분 뜨고, 끝나면 이 검사가 띄운 브라우저만 끈다(DECISIONS C81).
 *
 * 돌리는 법(측정할 때만 — 값을 주지 않으면 건너뛴다, unit4-memory.spec.ts와 같은 방식)
 *   APC_TAB_THROTTLE_SECONDS=150 PW_BASE_URL=http://localhost:5103/ai-physical-computing/ npx playwright test tests/e2e/tab-throttle.spec.ts --project=desktop --workers=1
 *   - 가린 채 재는 초(APC_TAB_THROTTLE_SECONDS) — 강한 조절이 보이려면 120 이상(유예 60초 + 1분 맞춤).
 *   - 브라우저: APC_TAB_THROTTLE_BROWSER(실행 파일 경로). 없으면 설치된 크롬, 그것도 없으면 설치된 엣지에 `--enable-features=IntensiveWakeUpThrottling`
 *     (Edge 154 새 프로필은 기본값에서 강한 조절을 하지 않았다 — 2026-10-06 실측. 크롬과 같은 Chromium 조절을 켜서 잰다).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { labRoot, setEditorCode } from './helpers/lab.ts';

/** 가린 채 재는 시간(초). 0이면 이 파일의 검사를 건너뛴다 */
const HIDDEN_SECONDS = Number(process.env.APC_TAB_THROTTLE_SECONDS ?? 0);
/** 강한 조절(1분 맞춤)을 볼 수 있는 가장 짧은 시간 — 유예 60초 + 다음 1분 경계 */
const THROTTLE_VISIBLE_SECONDS = 120;
/** 탭 통로가 상대를 잊는 시간(tab.ts peerTimeoutMs 기본값) */
const PEER_TIMEOUT_MS = 6000;
/** 강한 조절(1분 맞춤)의 표시로 보는 빈틈 — 굶주림(몇 초)과 1분 맞춤(45~60초)을 가른다 */
const MINUTE_GAP_MS = 30_000;
/** 이보다 주 스레드 지연이 작으면 "굶주리지 않음"으로 본다 */
const QUIET_LAG_MS = 2000;
const READY_TIMEOUT = 240_000;
/** 개발 서버가 원본 그대로 내주는 브릿지 공개 자리(쪽 안에서 import — 빌드한 사이트에는 없다) */
const BRIDGE_MODULE_PATH = '/src/lab/bridge/index.ts';

const CHROME_PATHS = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'];
const EDGE_PATHS = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', '/usr/bin/microsoft-edge'];

interface RealBrowserChoice {
  readonly executable: string;
  readonly extraArgs: readonly string[];
  readonly note: string;
}

/** 잴 브라우저를 고른다(머리말 "브라우저") — 없으면 null */
function pickRealBrowser(): RealBrowserChoice | null {
  const given = process.env.APC_TAB_THROTTLE_BROWSER?.trim();
  if (given) {
    return fs.existsSync(given) ? { executable: given, extraArgs: [], note: `APC_TAB_THROTTLE_BROWSER=${given}` } : null;
  }
  const chrome = CHROME_PATHS.find((candidate) => fs.existsSync(candidate));
  if (chrome !== undefined) {
    return { executable: chrome, extraArgs: [], note: '설치된 크롬(기본값 그대로)' };
  }
  const edge = EDGE_PATHS.find((candidate) => fs.existsSync(candidate));
  if (edge !== undefined) {
    return { executable: edge, extraArgs: ['--enable-features=IntensiveWakeUpThrottling'], note: '설치된 엣지 + --enable-features=IntensiveWakeUpThrottling' };
  }
  return null;
}

interface RealBrowser {
  readonly browser: Browser;
  readonly context: BrowserContext;
  close(): Promise<void>;
}

/** 브라우저를 새 임시 프로필로 띄우고 CDP로 붙는다(초점 흉내 없음 — noDefaults) */
async function launchRealBrowser(choice: RealBrowserChoice): Promise<RealBrowser> {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'apc-tab-throttle-'));
  const child: ChildProcess = spawn(
    choice.executable,
    ['--no-first-run', '--no-default-browser-check', '--edge-skip-compat-layer-relaunch', ...choice.extraArgs, '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
    { stdio: 'ignore' },
  );
  const cleanup = async (): Promise<void> => {
    child.kill();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {
      // 브라우저가 아직 파일을 쥐고 있으면 임시 폴더에 남긴다
    }
  };
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let tries = 0; tries < 150 && !fs.existsSync(portFile); tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0]?.trim() ?? '';
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true });
    const context = browser.contexts()[0] ?? (await browser.newContext());
    return {
      browser,
      context,
      close: async () => {
        try {
          await browser.close();
        } catch {
          // 이미 끊김
        }
        await cleanup();
      },
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

/** 개발 서버의 Vite 새로 고침 소켓을 막는다(다른 작업의 파일 저장으로 쪽이 다시 불리지 않게 — goto 전에) */
async function blockHmr(page: Page): Promise<void> {
  await page.routeWebSocket(/\?token=|vite-hmr/u, () => {
    // 연결하지 않고 버린다 — 빌드한 사이트에는 이 소켓이 없다.
  });
}

/**
 * 같은 창의 새 탭 하나(새 탭이 앞으로 온다). 브라우저가 처음 연 탭은 쓰지 않는다 — 시작 탭이 아직 무언가를 여는 중이면
 * 그 탭의 goto가 net::ERR_ABORTED로 끊긴 적이 있다(2026-10-06 바쁜 PC).
 */
async function openTab(context: BrowserContext, name: string): Promise<Page> {
  const page = await context.newPage();
  await blockHmr(page);
  // 쪽 오류는 검사 기록(콘솔)에 남긴다 — 이 검사의 브라우저는 Playwright 기본 기록(page 고정물) 밖이라 따로 모은다
  page.on('pageerror', (error) => console.log(`[${name} 쪽 오류] ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      console.log(`[${name} 콘솔 오류] ${message.text().slice(0, 300)}`);
    }
  });
  return page;
}

interface PresenceStats {
  /** 잰 구간(기록을 시작한 때부터 읽은 때까지, 밀리초) */
  readonly windowMs: number;
  readonly heres: number;
  /** here 사이 가장 긴 빈틈 — 기록 시작 → 첫 here, 마지막 here → 기록을 읽은 때까지 포함(here가 없으면 구간 전체) */
  readonly maxGapMs: number;
  readonly missing: number;
  readonly samples: number;
  readonly flips: number;
  readonly firstMissingSeconds: number | null;
  /** 0.5초 표본이 잇달아 빠진 가장 긴 구간(밀리초) */
  readonly longestMissingMs: number;
}

/**
 * 잰 구간 [startAt, endAt]의 here·표본을 센다. startAt은 보는 쪽이 기록을 **시작한** 때(가린 때보다 늦을 수 있다 — 보는 탭이 모듈을
 * 불러오는 동안은 here를 받을 귀가 없으므로 그 시간을 빈틈으로 세지 않는다). 첫 빠짐 초는 가린 때(hiddenAt)부터 센다.
 */
function statsOf(heres: readonly number[], samples: ReadonlyArray<readonly [number, boolean]>, startAt: number, endAt: number, hiddenAt = startAt): PresenceStats {
  const after = heres.filter((at) => at >= startAt && at <= endAt);
  const marks = [startAt, ...after, endAt];
  const gaps = marks.slice(1).map((at, index) => at - (marks[index] as number));
  const inWindow = samples.filter(([at]) => at >= startAt && at <= endAt);
  let flips = 0;
  for (let index = 1; index < inWindow.length; index += 1) {
    if (inWindow[index]?.[1] !== inWindow[index - 1]?.[1]) {
      flips += 1;
    }
  }
  const firstMissing = inWindow.find(([, seen]) => !seen);
  let longestMissingMs = 0;
  let runStart: number | null = null;
  for (const [at, seen] of inWindow) {
    if (!seen) {
      runStart ??= at;
      longestMissingMs = Math.max(longestMissingMs, at - runStart + 500);
    } else {
      runStart = null;
    }
  }
  return {
    windowMs: endAt - startAt,
    longestMissingMs,
    heres: after.length,
    maxGapMs: Math.max(...gaps),
    missing: inWindow.filter(([, seen]) => !seen).length,
    samples: inWindow.length,
    flips,
    firstMissingSeconds: firstMissing === undefined ? null : Math.round((firstMissing[0] - hiddenAt) / 100) / 10,
  };
}

function record(testInfo: TestInfo, type: string, value: unknown): void {
  const description = typeof value === 'string' ? value : JSON.stringify(value);
  testInfo.annotations.push({ type, description });
  console.log(`[${type}] ${description}`);
}

/** 주 스레드 지연 재기: 워커(같은 쪽 Blob)가 0.5초마다 보낸 시각과 주 스레드가 받은 시각의 차 */
async function startLagProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const log: Array<[number, number]> = [];
    (window as unknown as { __apcLag: Array<[number, number]> }).__apcLag = log;
    const source = URL.createObjectURL(new Blob(['setInterval(() => postMessage(Date.now()), 500);'], { type: 'text/javascript' }));
    const worker = new Worker(source);
    worker.addEventListener('message', (event: MessageEvent) => {
      const sentAt = Number(event.data);
      log.push([sentAt, Date.now() - sentAt]);
    });
  });
}

interface LagStats {
  readonly samples: number;
  readonly maxMs: number;
  /** 1초 넘게 밀린 때(가린 뒤 초:밀린 ms) — 처음 20개 */
  readonly spikes: readonly string[];
}

async function lagStatsOf(page: Page, hiddenAt: number): Promise<LagStats> {
  const log = await page.evaluate(() => (window as unknown as { __apcLag: Array<[number, number]> }).__apcLag.slice());
  const after = log.filter(([at]) => at >= hiddenAt);
  return {
    samples: after.length,
    maxMs: after.reduce((max, [, lag]) => Math.max(max, lag), 0),
    spikes: after
      .filter(([, lag]) => lag > 1000)
      .slice(0, 20)
      .map(([at, lag]) => `${((at - hiddenAt) / 1000).toFixed(1)}s:${lag}ms`),
  };
}

/** 가린 탭에서 잰 visibilityState 기록(가린 동안 한 번도 보이지 않았는지) */
async function watchVisibility(page: Page): Promise<void> {
  await page.evaluate(() => {
    const log: Array<[number, string]> = [[Date.now(), document.visibilityState]];
    (window as unknown as { __apcVisLog: Array<[number, string]> }).__apcVisLog = log;
    document.addEventListener('visibilitychange', () => log.push([Date.now(), document.visibilityState]));
  });
}

async function visibilityLog(page: Page): Promise<Array<[number, string]>> {
  return page.evaluate(() => (window as unknown as { __apcVisLog: Array<[number, string]> }).__apcVisLog.slice());
}

test.describe('가려진 탭의 타이머 조절과 같은 컴퓨터 탭 통로(미해결 220)', () => {
  test.skip(HIDDEN_SECONDS <= 0, '창이 있는 브라우저를 몇 분 띄우는 측정이라 APC_TAB_THROTTLE_SECONDS를 줄 때만 돌아요(머리말)');
  test.skip(({ isMobile }) => Boolean(isMobile), '데스크톱 창에서만 잰다');
  test.describe.configure({ mode: 'serial', timeout: (HIDDEN_SECONDS + 420) * 1000 });

  test('탭 통로 시계 전후 — 옛 시계(주 스레드 사슬)는 가린 뒤 빠지고, 새 시계(워커)는 내내 남는다(개발 서버)', async ({ baseURL }, testInfo) => {
    const choice = pickRealBrowser();
    test.skip(choice === null, '잴 브라우저(크롬·엣지)를 찾지 못했어요 — APC_TAB_THROTTLE_BROWSER로 실행 파일을 알려 줘요');
    const base = baseURL as string;
    const real = await launchRealBrowser(choice as RealBrowserChoice);
    try {
      record(testInfo, '브라우저', `${real.browser.version()} — ${(choice as RealBrowserChoice).note}`);
      const watcher = await openTab(real.context, '보는 탭');
      await watcher.goto(base);
      const source = await watcher.request.get(new URL(BRIDGE_MODULE_PATH, base).href);
      test.skip(!source.ok(), '빌드한 사이트에는 원본 모듈이 없어 이 비교는 개발 서버에서만 해요(아래 실제 화면 검사는 어디서나)');
      const hidden = await openTab(real.context, '가릴 탭');
      await hidden.goto(base);
      const prefixes = { old: 'zthroldclkab', fresh: 'zthrnewclkab' } as const;
      // 가릴 탭: 보드 끝 둘 — 옛 시계(판 1.1.5까지의 기본값 systemScheduler)와 새 기본 시계(워커)
      await hidden.evaluate(async ([modulePath, oldPrefix, newPrefix]) => {
        const bridge = await import(modulePath as string);
        const keep = window as unknown as { __apcChannels: unknown[] };
        keep.__apcChannels = [
          bridge.createTabChannel({ from: 'board', prefix: oldPrefix as string, scheduler: bridge.systemScheduler, requirePeer: false }),
          bridge.createTabChannel({ from: 'board', prefix: newPrefix as string, requirePeer: false }),
        ];
      }, [BRIDGE_MODULE_PATH, prefixes.old, prefixes.fresh]);
      await watchVisibility(hidden);
      await startLagProbe(hidden);

      // 가린다: 보는 탭을 앞으로(같은 창의 다른 탭 — 실제 가림). 보는 탭의 기록 타이머를 걸기 **전에** 앞으로 가져온다 —
      // 보는 탭이 뒤에 오래 있으면 그 탭의 0.5초 기록 타이머부터 강한 조절에 걸린다(2026-10-06: 바쁜 개발 서버에서 준비가 1분 넘게 걸려 기록이 멈춤)
      await watcher.bringToFront();
      const hiddenAt = Date.now();
      await expect.poll(() => hidden.evaluate(() => document.visibilityState), { timeout: 30_000 }).toBe('hidden');

      // 보이는 탭: 컴퓨터 끝 둘 + 보드의 bridge.here 도착 시각 + 0.5초마다 상대 목록(보이는 탭이라 제때 돈다)
      const recordFrom = await watcher.evaluate(async ([modulePath, oldPrefix, newPrefix]) => {
        const bridge = await import(modulePath as string);
        const ends = {
          old: bridge.createTabChannel({ from: 'pc', prefix: oldPrefix as string, requirePeer: false }),
          fresh: bridge.createTabChannel({ from: 'pc', prefix: newPrefix as string, requirePeer: false }),
        };
        const heres: Record<'old' | 'fresh', number[]> = { old: [], fresh: [] };
        const samples: Record<'old' | 'fresh', Array<[number, boolean]>> = { old: [], fresh: [] };
        for (const [key, prefix] of [
          ['old', oldPrefix],
          ['fresh', newPrefix],
        ] as const) {
          const raw = new BroadcastChannel(bridge.tabChannelName(prefix as string));
          raw.addEventListener('message', (event: MessageEvent) => {
            const data = event.data as { type?: string; from?: string } | null;
            if (data?.type === 'bridge.here' && data.from === 'board') {
              heres[key].push(Date.now());
            }
          });
        }
        window.setInterval(() => {
          const now = Date.now();
          samples.old.push([now, ends.old.peers.includes('board')]);
          samples.fresh.push([now, ends.fresh.peers.includes('board')]);
        }, 500);
        (window as unknown as { __apcProbe: unknown }).__apcProbe = { heres, samples };
        return Date.now();
      }, [BRIDGE_MODULE_PATH, prefixes.old, prefixes.fresh]);
      // 기록 시작은 가린 때보다 늦다(보는 탭이 모듈을 불러오는 시간) — 빈틈은 기록을 시작한 때부터 센다
      const startAt = Math.max(hiddenAt, recordFrom);
      await expect.poll(() => watcher.evaluate(() => {
        const probe = (window as unknown as { __apcProbe: { samples: Record<string, Array<[number, boolean]>> } }).__apcProbe;
        return probe.samples.old.some(([, seen]) => seen) && probe.samples.fresh.some(([, seen]) => seen);
      }), { timeout: 60_000 }).toBe(true);
      await watcher.waitForTimeout(HIDDEN_SECONDS * 1000);

      const endAt = Date.now();
      const probe = await watcher.evaluate(() => (window as unknown as { __apcProbe: { heres: Record<'old' | 'fresh', number[]>; samples: Record<'old' | 'fresh', Array<[number, boolean]>> } }).__apcProbe);
      const visLog = await visibilityLog(hidden);
      const lag = await lagStatsOf(hidden, hiddenAt);
      const oldStats = statsOf(probe.heres.old, probe.samples.old, startAt, endAt, hiddenAt);
      const newStats = statsOf(probe.heres.fresh, probe.samples.fresh, startAt, endAt, hiddenAt);
      const secondsAfter = (list: readonly number[]): string =>
        list
          .filter((at) => at >= hiddenAt)
          .map((at) => ((at - hiddenAt) / 1000).toFixed(1))
          .join(',');
      record(testInfo, '가린 시간(초)', HIDDEN_SECONDS);
      record(testInfo, '기록 시작(가린 뒤 초)', Math.round((startAt - hiddenAt) / 100) / 10);
      record(testInfo, '옛 시계(주 스레드 setTimeout 사슬)', oldStats);
      record(testInfo, '새 시계(워커)', newStats);
      record(testInfo, '가린 탭 주 스레드 지연', lag);
      record(testInfo, '옛 시계 here 시각(가린 뒤 초)', secondsAfter(probe.heres.old));
      record(testInfo, '새 시계 here 시각(가린 뒤 초)', secondsAfter(probe.heres.fresh));

      // 가린 동안 한 번도 보이지 않았다(검사가 헛돌지 않게)
      expect(visLog.filter(([at]) => at >= hiddenAt).every(([, state]) => state === 'hidden')).toBe(true);
      expect(await hidden.evaluate(() => document.visibilityState)).toBe('hidden');
      // 새 시계: 강한 조절(1분 맞춤)의 빈틈이 없다
      expect(newStats.maxGapMs).toBeLessThan(MINUTE_GAP_MS);
      if (lag.maxMs < QUIET_LAG_MS) {
        // 주 스레드가 굶주리지 않았으면 2초마다 알리고 상대 목록에서 한 번도 빠지지 않는다
        expect(newStats.maxGapMs).toBeLessThan(PEER_TIMEOUT_MS);
        expect(newStats.missing).toBe(0);
      }
      if (HIDDEN_SECONDS >= THROTTLE_VISIBLE_SECONDS) {
        // 재현: 옛 시계는 강한 조절에 걸려 1분 맞춤의 빈틈이 생기고 상대 목록에서 빠진다(깨지면 이 브라우저가 조절하지 않는 것 — 비교가 헛돈다)
        expect(oldStats.maxGapMs).toBeGreaterThan(MINUTE_GAP_MS);
        expect(oldStats.missing).toBeGreaterThan(0);
      }
    } finally {
      await real.close();
    }
  });

  test('두 탭 블루투스 실습 — 가려진 보드 탭이 컴퓨터 쪽에서 끊기지 않는다(실제 화면)', async ({ baseURL }, testInfo) => {
    const choice = pickRealBrowser();
    test.skip(choice === null, '잴 브라우저(크롬·엣지)를 찾지 못했어요 — APC_TAB_THROTTLE_BROWSER로 실행 파일을 알려 줘요');
    const base = baseURL as string;
    // 주소 ?bridge=로 두 탭을 잇는 접두어 — PD-29 모양(12글자, l·o·0·1 없음 — src/lab/bridge/prefix.ts PREFIX_ALPHABET).
    // 틀리면 실습실이 주소 값을 버리고 새 접두어를 만들어 두 탭이 만나지 못한다(2026-10-06 첫 판 'zthrbleab2cd'의 l로 그렇게 됨).
    const prefix = 'zthrbtpctab2';
    expect(prefix).toMatch(/^[a-km-np-z2-9]{12}$/u);
    const real = await launchRealBrowser(choice as RealBrowserChoice);
    try {
      record(testInfo, '브라우저', `${real.browser.version()} — ${(choice as RealBrowserChoice).note}`);
      record(testInfo, '사이트', base);
      // 보드 탭: 블루투스로 받는 교안 예제(0.1초마다 read()해 "수신 데이터: …"를 찍는다)
      const board = await openTab(real.context, '보드 탭');
      await board.goto(new URL(`labs/esp32/?example=${encodeURIComponent('esp32/bt/b1-ble-receive-print.py')}&bridge=${prefix}`, base).href);
      await expect(labRoot(board)).toHaveAttribute('data-state', 'idle', { timeout: READY_TIMEOUT });
      await expect(board.locator('[data-board-io]')).toHaveAttribute('data-board-ready', 'yes', { timeout: READY_TIMEOUT });
      await board.getByRole('button', { name: '실행', exact: true }).first().click();
      await expect(board.locator('[data-board-part-controls][data-part="ble"]')).toHaveAttribute('data-ble-running', 'true', { timeout: 60_000 });
      await watchVisibility(board);
      await startLagProbe(board);

      // 컴퓨터 탭(새 탭 — 앞으로 오면서 보드 탭이 가려진다): 교과서 모양 코드, 가린 시간보다 1분 넉넉히 돈다
      const vision = await openTab(real.context, '컴퓨터 탭');
      await vision.goto(new URL(`labs/vision/?bridge=${prefix}`, base).href);
      await expect(labRoot(vision)).toHaveAttribute('data-state', 'idle', { timeout: READY_TIMEOUT });
      const loops = Math.ceil((HIDDEN_SECONDS + 60) / 0.2);
      await setEditorCode(
        vision,
        [
          'import bluetooth, time',
          'b = bluetooth.init("XX:XX:XX:XX:XX:XX")',
          'drops = 0',
          'was = False',
          `for i in range(${loops}):`,
          '    if b.connected:',
          '        b.send(f"{i},{i * 2}")',
          '    elif was:',
          '        drops += 1',
          '    was = b.connected',
          '    time.sleep(0.2)',
          'print("끊긴 횟수:", drops)',
          '',
        ].join('\n'),
      );
      await vision.getByRole('button', { name: '실행', exact: true }).first().click();
      const root = labRoot(vision);
      await expect(root).toHaveAttribute('data-ble-pc-connected', 'true', { timeout: READY_TIMEOUT });
      await vision.bringToFront();
      const hiddenAt = Date.now();
      await expect.poll(() => board.evaluate(() => document.visibilityState), { timeout: 30_000 }).toBe('hidden');
      // 보이는 컴퓨터 탭에서 0.5초마다 이어짐 값을 적는다
      await vision.evaluate(() => {
        const target = document.querySelector('[data-lab]');
        const log: Array<[number, boolean]> = [];
        (window as unknown as { __apcConnected: Array<[number, boolean]> }).__apcConnected = log;
        window.setInterval(() => log.push([Date.now(), target?.getAttribute('data-ble-pc-connected') === 'true']), 500);
      });
      const rxBefore = Number(await board.locator('[data-board-part-controls][data-part="ble"]').getAttribute('data-ble-rx'));
      await vision.waitForTimeout(HIDDEN_SECONDS * 1000);

      const endAt = Date.now();
      const samples = await vision.evaluate(() => (window as unknown as { __apcConnected: Array<[number, boolean]> }).__apcConnected.slice());
      const rxAfter = Number(await board.locator('[data-board-part-controls][data-part="ble"]').getAttribute('data-ble-rx'));
      const visLog = await visibilityLog(board);
      const lag = await lagStatsOf(board, hiddenAt);
      const stats = statsOf([], samples, hiddenAt, endAt);
      record(testInfo, '가린 시간(초)', HIDDEN_SECONDS);
      record(testInfo, '컴퓨터 쪽 이어짐(0.5초 표본)', {
        missing: stats.missing,
        samples: stats.samples,
        flips: stats.flips,
        firstMissingSeconds: stats.firstMissingSeconds,
        longestMissingMs: stats.longestMissingMs,
      });
      record(testInfo, '가린 보드 탭 주 스레드 지연', lag);
      record(testInfo, '보드가 받은 값(가린 동안 늘어난 수)', rxAfter - rxBefore);

      expect(visLog.filter(([at]) => at >= hiddenAt).every(([, state]) => state === 'hidden')).toBe(true);
      // 강한 조절(1분 맞춤)로 끊긴 구간이 없고, 값이 계속 보드에 닿는다
      expect(stats.longestMissingMs).toBeLessThan(MINUTE_GAP_MS);
      expect(rxAfter).toBeGreaterThan(rxBefore);
      if (lag.maxMs < QUIET_LAG_MS) {
        // 보드 탭이 굶주리지 않았으면 가린 동안 한 번도 끊기지 않는다(0.5초 표본 하나도 빠지지 않음)
        expect(stats.missing).toBe(0);
      }

      // 컴퓨터 탭만 멈춘다. 가려진 보드 탭의 버튼은 누르지 않는다 — 가려진 탭은 그리기를 쉬어 Playwright의 "안정됨" 확인이
      // 끝나지 않는다(2026-10-06 검사 시간 초과). 보드 탭은 아래 real.close()가 브라우저째 닫는다.
      await vision.getByRole('button', { name: '정지', exact: true }).first().click();
    } finally {
      await real.close();
    }
  });
});
