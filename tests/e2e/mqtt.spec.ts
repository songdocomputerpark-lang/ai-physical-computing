// MQTT·같은 컴퓨터 탭 통로(P4-06, PLAN §7.4·PD-29·PD-17) 브라우저 테스트 — 구역 D.
// 확인하는 것
//  1. 두 탭이 **같은 컴퓨터 탭 통로**로 서로의 가상 LED를 켠다(인터넷 없이 — 학교망이 막아도 되는 길).
//  2. 토픽에 고정 루트가 없다: 기록에 보이는 토픽이 모두 무작위 접두어로 시작한다(PD-29).
//  3. [친구 접두어]로 두 탭의 접두어를 맞출 수 있다.
//  4. 중계 서버에 연결되지 않으면 **한국어로 알리고 탭 통로로 스스로 바꾼다**(PD-17).
//  5. 공개 중계 서버로도 두 탭이 서로의 LED를 켠다 — 학교망·서버 사정으로 안 되면 "외부 요인"으로 기록하고 건너뛴다(PLAN §8.4 P4-06 검증 방법).
//  6. 실패 까닭이 정확하다(미해결 221 — 판 1.1.5 뒤): 닿지 못하는 주소는 "(서버에 닿지 못함)", WebSocket을 받자마자 닫는 서버는
//     "(서버가 연결을 닫음)"(page.routeWebSocket으로 흉내 — 이 컴퓨터 밖으로 나가지 않는다). 전에는 둘 다 "(8초 동안 답이 없음)"이었다.
//     우리가 WebSocket을 만들게 바꾼 뒤의 성공 길도 연결 확인(CONNACK)만 하는 흉내 서버로 본다(공개 서버 사정과 상관없이).
// 연결을 누르는 자리는 모두 connectAndWait로 세 번까지 다시 해 본다(공개 브로커는 가동을 보장하지 않고,
// 개발 서버로 시험할 때는 다른 사람이 저장소 파일을 고치면 Vite가 페이지를 새로 고쳐 고른 값이 처음으로 돌아간다).
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { withBase } from '../../src/lib/url.ts';
import { createPrefix } from '../../src/lab/bridge/index.ts';
import { labRoot, LOAD_TIMEOUT, setEditorCode } from './helpers/lab.ts';

const ESP32_PATH = withBase('labs/esp32/');
/** 시험용 고정 접두어(PD-29의 글자만 씀 — l·1·O·0 없음). 진짜 화면은 탭마다 무작위로 만든다. */
const PREFIX = 'mqtttest2345';
const FRIEND_PREFIX = 'mqttfriend34';
const PREFIX_STORAGE_KEY = 'ai-physical-computing:bridge:prefix';

function panel(page: Page) {
  return page.locator('[data-mqtt-panel]');
}

function board(page: Page) {
  return page.locator('[data-board-io]');
}

function led(page: Page) {
  return page.locator('[data-board-part="builtin-led"]');
}

function logBox(page: Page) {
  return page.locator('[data-mqtt-log]');
}

async function openLab(page: Page): Promise<void> {
  // 개발 서버로 돌릴 때 다른 작업의 파일 저장으로 쪽이 새로 고쳐지면 눌러 둔 [실행]·[연결]이 사라진다(2026-10-06 구역 C — 두 탭 검사가 그 까닭으로 한 번 흔들림)
  await blockHmr(page);
  const response = await page.goto(ESP32_PATH);
  expect(response?.status()).toBe(200);
  await expect(labRoot(page)).toHaveAttribute('data-state', 'idle', { timeout: LOAD_TIMEOUT });
  await expect(board(page)).toHaveAttribute('data-board-ready', 'yes', { timeout: 60_000 });
}

/** 두 탭이 같은 접두어를 쓰게 미리 적어 둔다(진짜 화면에서는 [새 접두어 만들기]·[친구 접두어]로 맞춘다). */
async function fixPrefix(page: Page, prefix = PREFIX): Promise<void> {
  await page.context().addInitScript(
    ([key, value]) => {
      try {
        window.sessionStorage.setItem(key as string, value as string);
      } catch {
        // 사생활 보호 모드처럼 저장이 막힌 브라우저에서는 화면이 새 접두어를 만든다.
      }
    },
    [PREFIX_STORAGE_KEY, prefix],
  );
}

/**
 * 두 탭이 서로에게 보내고 받는 보드 코드. 내 토픽을 받기로 하고(subscribe) 상대 토픽으로 보낸다(publish).
 * 받은 메시지가 b"on"이면 내장 LED(GPIO2)를 켠다 — 화면에서 바로 보인다.
 */
function boardCode(name: string, mine: string, other: string): string {
  return [
    'from machine import Pin',
    'from umqtt.simple import MQTTClient',
    'import network',
    'import time',
    '',
    'wlan = network.WLAN(network.STA_IF)',
    'wlan.active(True)',
    'wlan.connect("classroom-wifi", "1234")',
    // 실물처럼 연결을 기다린다(가상 와이파이도 connect() 뒤 곧바로 붙지 않는다 — 2026-09-25 검토 반영)
    'while not wlan.isconnected():',
    '    time.sleep(0.1)',
    '',
    'led = Pin(2, Pin.OUT)',
    '',
    'def on_message(topic, msg):',
    '    print("받음", topic, msg)',
    '    if msg == b"on":',
    '        led.on()',
    '',
    `client = MQTTClient("${name}", "broker.emqx.io")`,
    'client.set_callback(on_message)',
    'client.connect()',
    `client.subscribe(b"${mine}")`,
    'print("준비 끝")',
    '',
    'while True:',
    `    client.publish(b"${other}", b"on")`,
    '    client.check_msg()',
    '    time.sleep(0.3)',
  ].join('\n');
}

async function runCode(page: Page): Promise<void> {
  await page.getByRole('button', { name: '실행', exact: true }).click();
}

/** 개발 서버로 돌릴 때만: 다른 작업이 파일을 저장해도 Vite가 쪽을 새로 고치지 않게(ble-pc-tab.spec.ts와 같은 방법 — goto 전에 건다) */
async function blockHmr(page: Page): Promise<void> {
  if (process.env.PW_BASE_URL) {
    await page.routeWebSocket(/\?token=|vite-hmr/u, () => {
      // 연결하지 않고 버린다 — 빌드한 사이트·CI에는 이 소켓이 없다.
    });
  }
}

async function stopCode(page: Page): Promise<void> {
  await page.getByRole('button', { name: '정지', exact: true }).click();
  await expect(labRoot(page)).toHaveAttribute('data-outcome', /stopped|killed|ok|error/u, { timeout: 30_000 });
}

interface BrokerChoice {
  readonly mode: 'tab' | 'broker' | 'auto';
  readonly brokerId?: string;
  readonly url?: string;
}

/** 패널의 통로·중계 서버를 고른다 */
async function chooseBroker(page: Page, options: BrokerChoice): Promise<void> {
  await panel(page).locator('[data-mqtt-mode]').selectOption(options.mode);
  if (options.brokerId !== undefined) {
    await panel(page).locator('[data-mqtt-broker]').selectOption(options.brokerId);
  }
  if (options.url !== undefined) {
    await panel(page).locator('[data-mqtt-broker-url]').fill(options.url);
  }
}

/**
 * 통로·중계 서버를 고르고 [연결]을 누른 뒤, 통로가 정해질 때까지 기다린다. 정해진 통로('broker'·'tab')를 돌려준다.
 *
 * 세 번까지 다시 해 보는 까닭
 *  - 공개 중계 서버는 가동을 보장하지 않는다(§7.4).
 *  - **개발 서버로 시험할 때**는 저장소의 다른 파일이 바뀌면 Vite가 페이지를 새로 고쳐서, 눌러 둔 [연결]과 고른 값이
 *    처음으로 돌아갈 수 있다(여러 사람이 한 작업 폴더를 함께 쓸 때 — 빌드된 사이트에는 없는 일).
 */
async function connectAndWait(page: Page, choice: BrokerChoice, want: 'broker' | 'tab' | 'any' = 'any'): Promise<string> {
  let via = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await expect(panel(page)).toBeVisible({ timeout: 60_000 });
    await chooseBroker(page, choice);
    await panel(page).getByRole('button', { name: '연결', exact: true }).click();
    try {
      await expect(panel(page)).toHaveAttribute('data-mqtt-via', /^(broker|tab)$/u, { timeout: 30_000 });
    } catch {
      continue;
    }
    via = (await panel(page).getAttribute('data-mqtt-via')) ?? '';
    if (want === 'any' || via === want) {
      return via;
    }
  }
  return via;
}

test.describe('MQTT와 같은 컴퓨터 탭 통로', () => {
  test.describe.configure({ timeout: 300_000 });

  test('두 탭이 같은 컴퓨터 탭 통로로 서로의 가상 LED를 켠다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await fixPrefix(page);
    const second = await page.context().newPage();
    second.on('pageerror', (error) => errors.push(error.message));

    await openLab(page);
    await openLab(second);

    await setEditorCode(page, boardCode('board-a', 'a-led', 'b-led'));
    await setEditorCode(second, boardCode('board-b', 'b-led', 'a-led'));

    // 코드에 umqtt·network가 보이면 패널이 열린다(README 4.3 "패널은 쓸 때만 연다").
    await expect(panel(page)).toBeVisible();
    await expect(panel(page)).toHaveAttribute('data-mqtt-mode-value', 'tab');
    await expect(panel(page).locator('[data-mqtt-prefix]')).toHaveText(PREFIX);
    await expect(panel(page).locator('[data-mqtt-warning]')).toContainText('같은 컴퓨터의 다른 탭하고만 통해요');

    await runCode(page);
    await runCode(second);

    // 서로의 메시지를 받아 두 탭의 내장 LED가 모두 켜진다.
    await expect(led(page)).toHaveAttribute('data-visual-lit', 'true', { timeout: 120_000 });
    await expect(led(second)).toHaveAttribute('data-visual-lit', 'true', { timeout: 120_000 });
    await expect(page.locator('[data-board-pin="2"]')).toHaveAttribute('data-level', '1');
    await expect(panel(page)).toHaveAttribute('data-mqtt-via', 'tab');

    // PD-29: 토픽에 고정 루트가 없다 — 기록의 토픽이 모두 무작위 접두어로 시작한다.
    const text = (await logBox(page).textContent()) ?? '';
    expect(text).toContain(`${PREFIX}/b-led`);
    expect(text).toContain(`${PREFIX}/a-led`);
    expect(text).not.toMatch(/(^|\s)apc\//u);

    await stopCode(page);
    await stopCode(second);
    expect(errors).toEqual([]);
    await second.close();
  });

  test('[친구 접두어]로 다른 탭과 접두어를 맞춘다', async ({ page }) => {
    await fixPrefix(page);
    await openLab(page);
    await setEditorCode(page, ['from umqtt.simple import MQTTClient', 'print("준비")'].join('\n'));

    await expect(panel(page)).toBeVisible();
    await expect(panel(page).locator('[data-mqtt-prefix]')).toHaveText(PREFIX);

    await panel(page).locator('[data-mqtt-friend]').fill(FRIEND_PREFIX);
    await panel(page).getByRole('button', { name: '맞추기' }).click();

    await expect(panel(page).locator('[data-mqtt-prefix]')).toHaveText(FRIEND_PREFIX);
    await expect(panel(page).locator('[data-mqtt-hint]')).toContainText('접두어를 맞췄어요');

    // 모양이 틀리면 한국어 이유를 보여 주고 접두어를 바꾸지 않는다.
    await panel(page).locator('[data-mqtt-friend]').fill('짧음');
    await panel(page).getByRole('button', { name: '맞추기' }).click();
    await expect(panel(page).locator('[data-mqtt-hint]')).toContainText('쓸 수 없어요');
    await expect(panel(page).locator('[data-mqtt-prefix]')).toHaveText(FRIEND_PREFIX);
  });

  test('"중계 서버 먼저, 안 되면 탭"은 중계 서버에 연결되지 않으면 한국어로 알리고 탭 통로로 바꾼다', async ({ page }) => {
    await fixPrefix(page);
    await openLab(page);
    await setEditorCode(page, ['from umqtt.simple import MQTTClient', 'print("준비")'].join('\n'));
    await expect(panel(page)).toBeVisible();

    // 일부러 닿을 수 없는 주소를 넣는다(브라우저가 막는 포트라 바로 실패한다).
    const choice = { mode: 'auto', brokerId: 'custom', url: 'wss://127.0.0.1:9/mqtt' } as const;
    await chooseBroker(page, choice);
    await expect(panel(page)).toHaveAttribute('data-mqtt-mode-value', 'auto');
    await expect(panel(page).locator('[data-mqtt-warning]')).toContainText('누구나 보고, 누구나 보낼 수도 있어요');
    // [연결] 바로 아래에도 짧은 경고가 늘 보인다(§7.4 "연결 버튼 옆" — 2026-09-25 검토 반영)
    await expect(panel(page).locator('[data-mqtt-connect-warning]')).toBeVisible();
    await expect(panel(page).locator('[data-mqtt-connect-warning]')).toContainText('누구나 보고 보낼 수 있어요');

    expect(await connectAndWait(page, choice, 'tab')).toBe('tab');
    await expect(logBox(page)).toContainText('연결하지 못했어요');
    // 닿지 못하는 주소(브라우저가 막는 포트 — WebSocket이 열리지도 못함)는 까닭이 "서버에 닿지 못함"(미해결 221)
    await expect(logBox(page)).toContainText('연결하지 못했어요(서버에 닿지 못함)');
    await expect(logBox(page)).toContainText('같은 컴퓨터 탭 통로로 바꿨어요');
    await expect(panel(page).locator('[data-mqtt-state-text]')).toContainText('연결됨');
  });

  test('"공개 중계 서버"만 고르면 연결되지 않을 때 탭으로 몰래 바꾸지 않고 실패를 알린다', async ({ page }) => {
    await fixPrefix(page);
    await openLab(page);
    await setEditorCode(page, ['from umqtt.simple import MQTTClient', 'print("준비")'].join('\n'));
    await expect(panel(page)).toBeVisible();

    const choice = { mode: 'broker', brokerId: 'custom', url: 'wss://127.0.0.1:9/mqtt' } as const;
    await chooseBroker(page, choice);
    await panel(page).getByRole('button', { name: '연결', exact: true }).click();
    await expect(logBox(page)).toContainText('공개 중계 서버 wss://127.0.0.1:9/mqtt에 연결하지 못했어요(서버에 닿지 못함)', { timeout: 60_000 });
    await expect(panel(page)).toHaveAttribute('data-mqtt-state', 'closed');
    await expect(panel(page)).toHaveAttribute('data-mqtt-via', '');
    await expect(logBox(page)).not.toContainText('같은 컴퓨터 탭 통로로 바꿨어요');
  });

  test('WebSocket을 받자마자 닫는 공개 중계 서버면 실패 까닭이 "서버가 연결을 닫음"이다(미해결 221)', async ({ page }) => {
    const closingUrl = 'wss://closing-broker.test:8084/mqtt';
    const sockets: number[] = [];
    // page.routeWebSocket은 page.goto 전에 건다(연 뒤에 걸면 진짜 서버로 나간다 — 2026-09-24 확인). 연결하지 않는 흉내라 밖으로 나가지 않는다.
    await page.routeWebSocket(closingUrl, (ws) => {
      sockets.push(Date.now());
      // WebSocket은 받아 주고(열림), 첫 MQTT 패킷(CONNECT)이 오면 곧바로 닫는다 — 공개 서버가 받자마자 끊는 모양
      ws.onMessage(() => {
        void ws.close({ code: 1000 });
      });
    });
    await fixPrefix(page);
    await openLab(page);
    await setEditorCode(page, ['from umqtt.simple import MQTTClient', 'print("준비")'].join('\n'));
    await expect(panel(page)).toBeVisible();

    await chooseBroker(page, { mode: 'broker', brokerId: 'custom', url: closingUrl });
    await panel(page).getByRole('button', { name: '연결', exact: true }).click();
    await expect(logBox(page)).toContainText(`공개 중계 서버 ${closingUrl}에 연결하지 못했어요(서버가 연결을 닫음)`, { timeout: 60_000 });
    const text = (await logBox(page).textContent()) ?? '';
    // 실패 한 번에 한 줄(DECISIONS C70 ④), 옛 까닭·영어 문구 없음
    expect(text.match(/연결하지 못했어요/gu)?.length ?? 0).toBe(1);
    expect(text).not.toContain('답이 없음');
    expect(text).not.toMatch(/Connection closed|WebSocket|connack/iu);
    // 기다리는 시간·다시 붙기는 그대로 — MQTT.js가 3초 뒤에 다시 붙어 봤다(한 번 닫혀도 다음 시도에 붙을 수 있어서)
    expect(sockets.length).toBeGreaterThanOrEqual(2);
    await expect(panel(page)).toHaveAttribute('data-mqtt-state', 'closed');
    await expect(panel(page)).toHaveAttribute('data-mqtt-via', '');
  });

  test('제대로 답하는 중계 서버에는 우리가 만든 WebSocket(createWebsocket)으로 연결된다(미해결 221 — 성공 길)', async ({ page }) => {
    // 실패 까닭을 고르려고 WebSocket을 우리가 만들게 바꿨으므로(broker-transport.ts createWebsocket), 성공 길도 진짜 브라우저에서 본다.
    // 공개 서버는 가동을 보장하지 않아(아래 검사는 외부 요인이면 건너뜀) MQTT 3.1.1 연결 확인만 하는 흉내 서버를 쓴다 — 밖으로 나가지 않는다.
    const mockUrl = 'wss://answering-broker.test:8084/mqtt';
    const packets: number[] = [];
    await page.routeWebSocket(mockUrl, (ws) => {
      ws.onMessage((message) => {
        const bytes = typeof message === 'string' ? Buffer.from(message, 'utf8') : message;
        const kind = (bytes[0] ?? 0) >> 4;
        packets.push(kind);
        if (kind === 1) {
          // CONNECT → CONNACK(세션 없음, 받아들임)
          ws.send(Buffer.from([0x20, 0x02, 0x00, 0x00]));
        } else if (kind === 8) {
          // SUBSCRIBE → SUBACK(같은 메시지 번호, QoS 0 허락)
          ws.send(Buffer.from([0x90, 0x03, bytes[2] ?? 0, bytes[3] ?? 0, 0x00]));
        } else if (kind === 12) {
          // PINGREQ → PINGRESP
          ws.send(Buffer.from([0xd0, 0x00]));
        }
      });
    });
    await fixPrefix(page);
    await openLab(page);
    await setEditorCode(page, ['from umqtt.simple import MQTTClient', 'print("준비")'].join('\n'));
    await expect(panel(page)).toBeVisible();

    await chooseBroker(page, { mode: 'broker', brokerId: 'custom', url: mockUrl });
    await panel(page).getByRole('button', { name: '연결', exact: true }).click();
    await expect(panel(page)).toHaveAttribute('data-mqtt-via', 'broker', { timeout: 30_000 });
    await expect(panel(page).locator('[data-mqtt-state-text]')).toContainText('연결됨');
    await expect(logBox(page)).not.toContainText('연결하지 못했어요');
    // 흉내 서버가 MQTT CONNECT를 받았다(브라우저 → 우리 WebSocket → MQTT.js 길이 이어짐)
    expect(packets[0]).toBe(1);
  });

  test('공개 중계 서버로 두 탭이 서로의 가상 LED를 켠다(안 되면 외부 요인으로 기록)', async ({ page }, testInfo: TestInfo) => {
    // 공개 서버에 나가는 시험은 실행마다 새 무작위 접두어를 쓴다(PD-29 "고정 루트 없이" — 2026-09-25 검토 반영: 저장소에 적힌 고정 접두어면
    // 저장소를 읽은 누구나 그 토픽에 on을 보내 이 시험을 거짓으로 통과시키거나 흔들 수 있다). 탭 통로 시험은 밖으로 나가지 않아 고정이어도 된다.
    const publicPrefix = createPrefix();
    await fixPrefix(page, publicPrefix);
    const second = await page.context().newPage();
    await openLab(page);
    await openLab(second);

    await setEditorCode(page, boardCode('board-a', 'a-led', 'b-led'));
    await setEditorCode(second, boardCode('board-b', 'b-led', 'a-led'));

    const emqx = { mode: 'broker', brokerId: 'emqx' } as const;
    const viaA = await connectAndWait(page, emqx, 'broker');
    const viaB = await connectAndWait(second, emqx, 'broker');
    if (viaA !== 'broker' || viaB !== 'broker') {
      const reason = `공개 중계 서버에 연결하지 못했어요(학교망 차단 또는 서버 사정). 화면은 한국어로 실패를 알렸어요. via=${viaA}/${viaB}`;
      testInfo.annotations.push({ type: '외부 요인', description: reason });
      await second.close();
      test.skip(true, reason);
      return;
    }

    await runCode(page);
    await runCode(second);

    // 붙기는 했는데 메시지가 오가지 않는 것도 공개 브로커에서는 흔하다(QoS 0 · 서버가 접속을 끊음 · 학교망 지연).
    // 우리 코드 쪽 길은 같은 파일 첫 번째 시험(탭 통로)이 이미 끝까지 확인하므로, 여기서는 "외부 요인"으로 적고 건너뛴다.
    const lit = async (target: Page): Promise<boolean> => {
      try {
        await expect(led(target)).toHaveAttribute('data-visual-lit', 'true', { timeout: 90_000 });
        return true;
      } catch {
        return false;
      }
    };
    const litA = await lit(page);
    const litB = litA ? await lit(second) : false;
    if (!litA || !litB) {
      const where = `A=${litA ? '켜짐' : '안 켜짐'} / B=${litB ? '켜짐' : '안 켜짐'}`;
      const state = `${(await panel(page).getAttribute('data-mqtt-state')) ?? ''}·${(await panel(second).getAttribute('data-mqtt-state')) ?? ''}`;
      const reason = `공개 중계 서버에 붙었지만 메시지가 오가지 않았어요(서버 사정 또는 학교망). ${where}, 연결 상태=${state}`;
      testInfo.annotations.push({ type: '외부 요인', description: reason });
      testInfo.annotations.push({ type: '기록', description: ((await logBox(page).textContent()) ?? '').slice(0, 600) });
      await stopCode(page);
      await stopCode(second);
      await second.close();
      test.skip(true, reason);
      return;
    }

    const text = (await logBox(page).textContent()) ?? '';
    expect(text).toContain(`${publicPrefix}/`);

    await stopCode(page);
    await stopCode(second);
    await second.close();
  });
});
