// 통신 모듈은 쓸 때만 받는다(Phase 6 P6-02, PROGRESS 미해결 157 — 구역 A) 브라우저 테스트.
//
// 확인하는 것
//  1. 영상처리 실습실을 첫 예제(에지 검출 — 통신 없음)로 열면 통신 모듈(ble-pc·data-port·serial-pc·vision-bridge·web-bluetooth)의
//     화면 쪽 JS를 **한 바이트도 받지 않는다**(요청 목록으로 증명). 붙은 모듈 목록(data-lab-modules)에는 있고 waiting에 있다.
//  2. 편집칸에 `import serial`을 넣으면 그때 무리째 받고 [보내기] 패널이 열리며, 통로 목록에 탭·MQTT(와 이 브라우저에 있으면
//     USB 데이터 포트·블루투스)가 모두 있다 — 받는 차례가 바뀌어 목록에서 통로가 빠지던 Phase 4 검토 지적 1이 되살아나지 않는다.
//     받지 않고 아낀 JS 양을 적는다(개발 서버는 파일마다 따로라 빌드 결과와 숫자가 다르다 — 최종 숫자는 빌드 결과로 perf:measure).
//  3. ESP32 실습실을 주소 ?bridge=로 열면(다른 화면이 선의 끝으로 연 실습실) 열 때 바로 받고, 창 이벤트(apc:web-bluetooth-show)가 먼저
//     와도 받아 블루투스 칸이 열린다.
//  4. 코드 모양으로 못 알아본 import(`__import__('se' + 'rial')`)도 파이썬 요청이 오면 무리를 받아 처리한다(요청 자리).
//
// 돌리는 법: PW_BASE_URL=http://localhost:4901/ai-physical-computing/ npx playwright test tests/e2e/perf-lab-modules.spec.ts --project=desktop
// (npm run perf:measure·npm run test:e2e에도 들어 있다 — 데스크톱에서만 돈다)
import { expect, test, type Page, type Response } from '@playwright/test';
import { COMM_MODULE_IDS, commModuleOf } from '../../scripts/perf-rules.mjs';
import { withBase } from '../../src/lib/url.ts';
import { labRoot, setEditorCode, waitDone } from './helpers/lab.ts';

const VISION = withBase('labs/vision/');
const ESP32 = withBase('labs/esp32/');
/** 개발 서버는 처음 여는 파일을 그때 옮겨서(Vite) 느리다 — 넉넉하게 */
const MODULES_TIMEOUT = 120_000;
const READY_TIMEOUT = 180_000;
const VISION_COMM = ['ble-pc', 'data-port', 'serial-pc', 'vision-bridge', 'web-bluetooth'];
const ESP32_COMM = ['data-port', 'mqtt', 'vision-bridge', 'web-bluetooth'];

interface ScriptRecord {
  readonly url: string;
  readonly bytes: number;
  readonly module: string | null;
}

/** 이 페이지 문맥이 받은 스크립트(주소·받은 바이트·통신 모듈 청크인지) */
function trackScripts(page: Page): ScriptRecord[] {
  const scripts: ScriptRecord[] = [];
  page.context().on('response', (response: Response) => {
    const request = response.request();
    const url = response.url();
    if (!/^https?:/u.test(url) || (request.resourceType() !== 'script' && !/\.(?:m?js|ts)(?:[?#]|$)/u.test(url))) {
      return;
    }
    void request
      .sizes()
      .then((sizes) => {
        scripts.push({ url, bytes: Math.max(0, sizes.responseBodySize) + Math.max(0, sizes.responseHeadersSize), module: commModuleOf(url) });
      })
      .catch(() => undefined);
  });
  return scripts;
}

/**
 * 개발 서버를 여럿이 함께 쓰는 동안 다른 구역이 파일을 고쳐 Vite가 쪽을 다시 부르면 검사가 흔들린다 — HMR 웹소켓의 다시 부르기 알림만 버린다
 * (구역 B a11y spec과 같은 방법, 빌드 결과·실사이트에는 그 웹소켓이 없어 아무 일도 없다). page.goto 전에 건다.
 */
async function freezeDevReloads(page: Page): Promise<void> {
  await page.routeWebSocket(/\/\?token=/u, (socket) => {
    const server = socket.connectToServer();
    server.onMessage((message) => {
      if (typeof message === 'string' && /"type":"(?:full-reload|update|prune)"/u.test(message)) {
        return;
      }
      socket.send(message);
    });
    socket.onMessage((message) => server.send(message));
  });
}

function ids(value: string | null): string[] {
  return (value ?? '').split(' ').filter((item) => item !== '');
}

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)}KB`;
}

test.describe('통신 모듈은 쓸 때만 받는다(미해결 157)', () => {
  test.describe.configure({ timeout: 360_000 });
  test.skip(({ isMobile }) => Boolean(isMobile), '받는 파일 목록은 화면 크기와 상관없어 데스크톱에서만 본다');
  test.beforeEach(async ({ page }) => {
    await freezeDevReloads(page);
  });

  test('영상처리 실습실: 통신을 쓰지 않는 첫 예제에서는 통신 모듈 JS를 받지 않고, import serial을 적으면 그때 무리째 받는다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const scripts = trackScripts(page);
    const response = await page.goto(VISION);
    expect(response?.status()).toBe(200);
    const root = labRoot(page);
    await expect(root).toHaveAttribute('data-lab-modules', /\bloading\b/u, { timeout: MODULES_TIMEOUT });
    // 열 때 받는 모듈이 모두 붙었다. 통신 모듈은 "붙은 모듈"이지만 기다리는 중이다
    const attached = ids(await root.getAttribute('data-lab-modules'));
    const waiting = ids(await root.getAttribute('data-lab-modules-waiting'));
    const loaded = ids(await root.getAttribute('data-lab-modules-loaded'));
    expect(attached).toEqual(expect.arrayContaining(VISION_COMM));
    expect(waiting.sort()).toEqual([...VISION_COMM].sort());
    expect(loaded.filter((id) => COMM_MODULE_IDS.includes(id))).toEqual([]);
    // 파이썬 준비가 한참 진행되는 동안에도(워커·예비 파일·개념 카드) 통신 모듈 청크는 요청조차 없다
    await expect(root).toHaveAttribute('data-state', /^(loading|idle)$/u, { timeout: READY_TIMEOUT });
    await page.waitForTimeout(1500);
    const before = scripts.filter((item) => item.module !== null);
    expect(before.map((item) => item.url), '통신 모듈 청크를 미리 받았어요').toEqual([]);
    const scriptsBefore = scripts.length;
    const bytesBefore = scripts.reduce((sum, item) => sum + item.bytes, 0);
    await expect(page.locator('[data-lab-module-panel="vision-bridge"]')).toBeHidden();

    // 통신을 쓰는 코드를 적으면 그때 받는다(코드 낱말 — 예제 고르기·공유 링크·자동 저장도 같은 길)
    await setEditorCode(page, 'import serial\n\nuart = serial.Serial("COM10", 9600)\nuart.write(b"a")\n');
    // 까닭에는 무리 차례(order → 폴더 이름)에서 낱말이 맞은 첫 모듈이 적힌다(serial은 data-port·serial-pc·vision-bridge가 함께 알아본다)
    await expect(root).toHaveAttribute('data-lab-modules-loaded-by', /^comm=code:(?:data-port|serial-pc|vision-bridge)$/u, { timeout: MODULES_TIMEOUT });
    await expect.poll(async () => ids(await root.getAttribute('data-lab-modules-waiting')), { timeout: MODULES_TIMEOUT }).toEqual([]);
    expect(ids(await root.getAttribute('data-lab-modules-loaded'))).toEqual(expect.arrayContaining(VISION_COMM));
    // [보내기] 패널이 열리고, 통로 목록에 이 브라우저에서 고를 수 있는 통로가 모두 있다(지적 1)
    const bridgePanel = page.locator('[data-bridge-panel]');
    await expect(page.locator('[data-lab-module-panel="vision-bridge"]')).toBeVisible({ timeout: 30_000 });
    await page.locator('[data-bridge-channel]').focus();
    await expect(bridgePanel).toHaveAttribute('data-bridge-channels', /\btab\b/u);
    const channels = ids(await bridgePanel.getAttribute('data-bridge-channels'));
    expect(channels).toEqual(expect.arrayContaining(['tab', 'mqtt']));
    if (await page.evaluate(() => 'serial' in navigator)) {
      expect(channels).toContain('serial');
    }
    if (await page.evaluate(() => 'bluetooth' in navigator)) {
      expect(channels).toContain('ble');
    }
    // 받은 통신 모듈 청크(긍정 대조 — 받는 길을 알아보는 규칙이 살아 있다). 빌드 결과에서는 MQTT 통로 라이브러리 src/lab/mqtt/index.ts([보내기] 패널이 부름)도
    // 폴더 이름을 따 _astro/mqtt.<해시>.js가 되어 commModuleOf가 'mqtt' 모듈로 읽으므로, 이 실습실의 통신 모듈만 센다
    // (2026-09-26 통합 — 개발 서버에서만 돌던 이 검사를 빌드 결과에서 처음 돌려 찾음: 5개를 기대했는데 6개).
    await expect
      .poll(() => new Set(scripts.filter((item) => item.module !== null && VISION_COMM.includes(item.module)).map((item) => item.module)).size, { timeout: 30_000 })
      .toBe(VISION_COMM.length);
    const after = scripts.slice(scriptsBefore);
    const deferredBytes = after.reduce((sum, item) => sum + item.bytes, 0);
    console.log(
      `[통신 모듈 지연] 영상처리 실습실 첫 예제: 스크립트 ${scriptsBefore}개·${kb(bytesBefore)}에 통신 모듈 청크 0개` +
        ` → import serial 뒤 더 받은 스크립트 ${after.length}개·${kb(deferredBytes)}(통신 모듈 청크 ${after.filter((item) => item.module !== null).length}개)` +
        ` — 통로 목록: ${channels.join(' ')}`,
    );
    test.info().annotations.push({ type: '통신 모듈 지연', description: `첫 예제 ${scriptsBefore}개 ${kb(bytesBefore)} / 늦게 받은 것 ${after.length}개 ${kb(deferredBytes)}` });
    expect(errors).toEqual([]);
  });

  test('ESP32 실습실: 주소 ?bridge=로 열면 열 때 받고, 창 이벤트(블루투스 칸 열기)가 먼저 와도 받는다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // ① 다른 화면이 선의 끝으로 연 실습실(한 화면 모드·새 탭) — 받자마자 보드 쪽 역할 띠가 보인다
    await page.goto(`${ESP32}?bridge=zaneaperfaa2`);
    const root = labRoot(page);
    await expect(root).toHaveAttribute('data-lab-modules-loaded-by', 'comm=query:vision-bridge', { timeout: MODULES_TIMEOUT });
    await expect.poll(async () => ids(await root.getAttribute('data-lab-modules-loaded')), { timeout: MODULES_TIMEOUT }).toEqual(expect.arrayContaining(ESP32_COMM));
    await expect(page.locator('[data-bridge-role-band]')).toBeVisible({ timeout: 30_000 });

    // ② 통신 없는 첫 예제 → 기다리다가, 다른 화면(블루투스 통로)이 칸을 열어 달라고 창 이벤트를 보내면 받고 칸이 열린다
    await page.goto(ESP32);
    await expect(root).toHaveAttribute('data-lab-modules-waiting', /\bweb-bluetooth\b/u, { timeout: MODULES_TIMEOUT });
    expect(ids(await root.getAttribute('data-lab-modules-waiting')).sort()).toEqual([...ESP32_COMM].sort());
    await expect(page.locator('[data-lab-module-panel="web-bluetooth"]')).toBeHidden();
    await page.evaluate(() => window.dispatchEvent(new Event('apc:web-bluetooth-show')));
    await expect(root).toHaveAttribute('data-lab-modules-loaded-by', 'comm=event:apc:web-bluetooth-show', { timeout: MODULES_TIMEOUT });
    await expect(page.locator('[data-lab-module-panel="web-bluetooth"]')).toBeVisible({ timeout: MODULES_TIMEOUT });
    expect(errors).toEqual([]);
  });

  test('코드 모양으로 못 알아본 import도 파이썬 요청이 오면 무리를 받아 처리한다(요청 자리)', async ({ page }) => {
    await page.goto(VISION);
    const root = labRoot(page);
    await expect(root).toHaveAttribute('data-state', 'idle', { timeout: READY_TIMEOUT });
    await expect(root).toHaveAttribute('data-lab-modules-waiting', /\bserial-pc\b/u, { timeout: MODULES_TIMEOUT });
    // 낱말 serial이 코드에 없다 — 파이썬이 serial.py를 불러 'serial-pc.open'을 요청할 때 비로소 받는다
    await setEditorCode(page, 'm = __import__("se" + "rial")\ntry:\n    m.Serial("COM3", 9600)\nexcept m.SerialException as error:\n    print("잡힘:", error)\n');
    expect(ids(await root.getAttribute('data-lab-modules-waiting'))).toContain('serial-pc');
    await page.getByRole('button', { name: '실행', exact: true }).first().click();
    expect(await waitDone(page, 120_000)).toBe('ok');
    await expect(root).toHaveAttribute('data-lab-modules-loaded-by', 'comm=request:serial-pc.open');
    // 모듈이 요청을 받아 "상대 탭이 없다"고 답했다(요청을 못 받았다면 "처리하지 못해요"가 나온다)
    const consoleText = (await page.locator('[data-lab-console]').textContent()) ?? '';
    expect(consoleText).toContain('잡힘: ESP32 실습실 탭을 찾지 못했어요');
    expect(consoleText).not.toContain('처리하지 못해요');
  });
});
