/**
 * 대시보드 페이지의 화면 논리(P4-07, 시나리오 D) — `/labs/dashboard/`.
 *
 * 하는 일
 * 1. 연결 줄: 통로(같은 컴퓨터 탭 / 공개 중계 서버) 고르기, 접두어(새로 만들기·고정·친구 접두어), [연결]/[끊기].
 *    **통로 안내 글이 늘 보이고**, 공개 중계 서버를 고르면 경고 상자로 바뀐다(PLAN §7.4, PD-29).
 * 2. 위젯 판(`grid-view.ts`)에 메시지를 넘기고, 스위치가 누른 말을 통로로 보낸다.
 * 3. [이 자리에서 가상 보드 열기]: 누른 뒤에야 ESP32 실습실을 `<iframe>`으로 만든다(P2-14와 같은 방식 —
 *    누르기 전에는 실습실 파일을 한 바이트도 받지 않는다). 같은 탭 안이라 접두어(`sessionStorage`)가 그대로 이어진다.
 *
 * 화면 표시(테스트가 읽는 값): 뿌리의 `data-dash-state`(idle·connecting·open·closed)와 `data-dash-via`(broker·tab),
 * `data-dash-mode-value`.
 */
import { withBase } from '../../lib/url.ts';
import {
  createPrefix,
  ensurePrefix,
  isPinned,
  isTabChannelAvailable,
  openBridgeChannel,
  parsePrefix,
  pinPrefix,
  registerBuiltinChannels,
  TAB_CHANNEL_ID,
  unpinPrefix,
  writeSessionPrefix,
  type BridgeChannel,
} from '../bridge/index.ts';
import { encodeShareCode } from '../controls/share-link.ts';
import {
  brokerById,
  checkBrokerUrl,
  CUSTOM_BROKER_ID,
  getMqttSession,
  mqttText,
  readMqttSettings,
  registerMqttChannel,
  writeMqttSettings,
  type MqttConnection,
  type MqttMode,
} from '../mqtt/index.ts';
import { DASHBOARD_DEMO_CODE } from './demo-code.ts';
import { DashboardView } from './grid-view.ts';
import { dashText } from './messages.ts';
import { createMqttSource, listenBridge } from './source.ts';
import type { SourceMessage, WidgetKind, WidgetSpec } from './types.ts';

export interface DashboardPage {
  readonly view: DashboardView;
  readonly session: MqttConnection;
  dispose(): void;
}

/** ESP32 실습실을 대시보드 옆에 여는 주소(예제 코드를 공유 링크로 담아서) */
export function embedLabSrc(code: string = DASHBOARD_DEMO_CODE): string {
  return `${withBase('labs/esp32/')}?embed=1#code=${encodeShareCode(code)}`;
}

/** 대시보드 페이지를 켠다. 뿌리 요소는 `[data-dash-page]`. */
export function mountDashboard(root: HTMLElement): DashboardPage {
  registerMqttChannel();
  const find = <T extends HTMLElement>(name: string): T | null => root.querySelector<T>(`[data-dash-${name}]`);

  const grid = find<HTMLElement>('grid');
  if (grid === null) {
    throw new Error('대시보드 격자([data-dash-grid])가 없어요.');
  }
  const announce = find<HTMLElement>('announce');
  const help = find<HTMLElement>('help');
  const modeSelect = find<HTMLSelectElement>('mode');
  const brokerSelect = find<HTMLSelectElement>('broker');
  const brokerUrlRow = find<HTMLElement>('broker-url-row');
  const brokerUrlInput = find<HTMLInputElement>('broker-url');
  const brokerNote = find<HTMLElement>('broker-note');
  const warning = find<HTMLElement>('warning');
  const prefixText = find<HTMLElement>('prefix');
  const newPrefixButton = find<HTMLButtonElement>('new-prefix');
  const pinButton = find<HTMLButtonElement>('pin');
  const friendInput = find<HTMLInputElement>('friend');
  const friendButton = find<HTMLButtonElement>('friend-apply');
  const connectButton = find<HTMLButtonElement>('connect');
  const disconnectButton = find<HTMLButtonElement>('disconnect');
  const stateText = find<HTMLElement>('state-text');
  const hint = find<HTMLElement>('hint');
  const resetButton = find<HTMLButtonElement>('reset');
  const openLabButton = find<HTMLButtonElement>('open-lab');
  const labSlot = find<HTMLElement>('lab-slot');
  const countText = find<HTMLElement>('count');

  const settings = readMqttSettings();
  const session = getMqttSession({ prefix: ensurePrefix(), mode: settings.mode, brokerUrl: settings.brokerUrl });
  const source = createMqttSource(session);
  let received = 0;

  const showHint = (text: string): void => {
    if (hint !== null) {
      hint.textContent = text;
      hint.hidden = text === '';
    }
  };

  const view = new DashboardView({
    grid,
    announce,
    helpId: help?.id ?? 'dash-keyboard-help',
    onStatus: (text) => showHint(text),
    onToggle: (spec: WidgetSpec, on: boolean) => {
      const text = on ? spec.onText : spec.offText;
      if (session.state !== 'open') {
        showHint(dashText.needConnect());
        return;
      }
      void source
        .send(spec.topic, text)
        .then(() => showHint(dashText.switchSent(spec.topic, text)))
        .catch((error: unknown) => showHint(error instanceof Error ? error.message : String(error)));
    },
  });

  const syncPrefix = (): void => {
    if (prefixText !== null) {
      prefixText.textContent = session.prefix;
    }
    if (pinButton !== null) {
      const pinned = isPinned();
      pinButton.textContent = pinned ? '고정 풀기' : '이 접두어 고정';
      pinButton.setAttribute('aria-pressed', pinned ? 'true' : 'false');
    }
  };

  const syncState = (): void => {
    const mode = session.mode;
    root.dataset.dashState = session.state;
    root.dataset.dashVia = session.via ?? '';
    root.dataset.dashModeValue = mode;
    if (stateText !== null) {
      const labels: Record<string, string> = {
        idle: '아직 연결하지 않았어요',
        connecting: '연결하는 중…',
        open: `연결됨 — ${mqttText.channelLabel(session.via)}`,
        closed: '연결이 닫혔어요',
      };
      stateText.textContent = labels[session.state] ?? session.state;
    }
    if (warning !== null) {
      const broker = mode !== 'tab';
      warning.textContent = broker ? mqttText.brokerWarning() : mqttText.tabNotice();
      warning.dataset.dashLevel = broker ? 'warn' : 'info';
    }
    if (brokerSelect !== null) {
      brokerSelect.disabled = mode === 'tab';
    }
    if (brokerUrlRow !== null) {
      brokerUrlRow.hidden = mode === 'tab' || brokerSelect?.value !== CUSTOM_BROKER_ID;
    }
    if (brokerNote !== null) {
      brokerNote.textContent = mode === 'tab' ? '' : (brokerById(brokerSelect?.value ?? '')?.note ?? '');
    }
    if (disconnectButton !== null) {
      disconnectButton.disabled = session.state !== 'open';
    }
  };

  const cleanups: Array<() => void> = [];

  /** 어느 통로로 왔든 메시지 하나를 위젯들에 넘긴다 */
  const deliver = (message: SourceMessage): void => {
    received += 1;
    root.dataset.dashReceived = String(received);
    const taken = view.receive(message);
    if (countText !== null) {
      countText.textContent = `받은 메시지 ${received}개`;
    }
    if (taken === 0) {
      root.dataset.dashUnmatched = message.topic;
    }
  };

  cleanups.push(session.on('state', () => syncState()));
  cleanups.push(
    session.on('notice', (text) => {
      showHint(text);
    }),
  );
  cleanups.push(source.onMessage(deliver));

  // ── 연결 줄 ─────────────────────────────────────────────────────────────
  const listen = async (): Promise<void> => {
    try {
      await source.listen();
    } catch (error) {
      showHint(error instanceof Error ? error.message : String(error));
    }
  };

  /**
   * 브릿지(P4-01)로 오는 글도 함께 듣는다 — 영상처리 실습실의 [보내기] 패널이 보낸 값이 `bridge/pc` 토픽으로 들어온다.
   * 같은 컴퓨터 탭 통로라 인터넷이 필요 없고, 접두어가 바뀌면 닫았다 다시 연다.
   */
  let bridge: BridgeChannel | null = null;
  let bridgeOff: (() => void) | null = null;
  let bridgePrefix = '';
  const closeBridge = (): void => {
    bridgeOff?.();
    bridgeOff = null;
    bridge?.close('대시보드를 닫았어요.');
    bridge = null;
    bridgePrefix = '';
    root.dataset.dashBridge = 'off';
  };
  const openBridge = async (): Promise<void> => {
    if (!isTabChannelAvailable()) {
      return;
    }
    if (bridge !== null && bridgePrefix === session.prefix) {
      return;
    }
    closeBridge();
    try {
      registerBuiltinChannels();
      const channel = await openBridgeChannel(TAB_CHANNEL_ID, { from: 'dash', prefix: session.prefix });
      bridge = channel;
      bridgePrefix = session.prefix;
      bridgeOff = listenBridge(channel, deliver);
      root.dataset.dashBridge = 'on';
    } catch {
      // 브릿지 통로를 열지 못해도 MQTT 쪽 실습은 그대로 된다(안내는 하지 않는다 — 학생이 고를 것이 없다).
      root.dataset.dashBridge = 'off';
    }
  };
  cleanups.push(closeBridge);

  const connect = async (): Promise<void> => {
    if (connectButton !== null) {
      connectButton.disabled = true;
    }
    try {
      await session.connect();
      await listen();
      await openBridge();
      showHint('연결했어요. 다른 탭이나 아래 가상 보드에서 같은 접두어로 보내면 위젯에 값이 들어와요.');
    } catch (error) {
      showHint(error instanceof Error ? error.message : String(error));
    } finally {
      if (connectButton !== null) {
        connectButton.disabled = false;
      }
      syncState();
    }
  };

  const onConnect = (): void => {
    void connect();
  };
  connectButton?.addEventListener('click', onConnect);
  cleanups.push(() => connectButton?.removeEventListener('click', onConnect));

  const onDisconnect = (): void => {
    session.close('[끊기]를 눌러 연결을 닫았어요.');
    closeBridge();
    syncState();
  };
  disconnectButton?.addEventListener('click', onDisconnect);
  cleanups.push(() => disconnectButton?.removeEventListener('click', onDisconnect));

  const onMode = (): void => {
    const mode = (modeSelect?.value ?? 'tab') as MqttMode;
    writeMqttSettings({ mode });
    session.update({ mode });
    syncState();
  };
  modeSelect?.addEventListener('change', onMode);
  cleanups.push(() => modeSelect?.removeEventListener('change', onMode));

  const onBroker = (): void => {
    const brokerId = brokerSelect?.value ?? '';
    writeMqttSettings({ brokerId });
    const chosen = brokerById(brokerId);
    if (brokerId !== CUSTOM_BROKER_ID && chosen !== null) {
      session.update({ brokerUrl: chosen.url });
    } else if (brokerUrlInput !== null) {
      const check = checkBrokerUrl(brokerUrlInput.value);
      if (check.ok) {
        session.update({ brokerUrl: check.url });
      }
    }
    syncState();
  };
  brokerSelect?.addEventListener('change', onBroker);
  cleanups.push(() => brokerSelect?.removeEventListener('change', onBroker));

  const onBrokerUrl = (): void => {
    const check = checkBrokerUrl(brokerUrlInput?.value ?? '');
    if (!check.ok) {
      showHint(check.reason);
      return;
    }
    showHint('');
    writeMqttSettings({ brokerUrl: check.url });
    session.update({ brokerUrl: check.url });
  };
  brokerUrlInput?.addEventListener('change', onBrokerUrl);
  cleanups.push(() => brokerUrlInput?.removeEventListener('change', onBrokerUrl));

  /**
   * 접두어를 바꾼다. 접두어가 바뀌면 통로가 닫히므로(`MqttConnection.update`), **열려 있었으면 스스로 다시 연결한다**
   * — 학생이 [맞추기]를 누른 뒤 [연결]을 또 눌러야 하는 것을 막는다. 앞 접두어로 받은 값은 지운다(다른 반 값과 섞이지 않게).
   */
  const usePrefix = (prefix: string, message: string): void => {
    const wasOpen = session.state === 'open';
    writeSessionPrefix(prefix);
    if (isPinned()) {
      pinPrefix(prefix);
    }
    session.update({ prefix });
    closeBridge();
    syncPrefix();
    syncState();
    view.clearValues();
    showHint(message);
    if (wasOpen) {
      void connect();
    }
  };

  const onNewPrefix = (): void => {
    usePrefix(createPrefix(), '새 접두어를 만들었어요. 같이 실습하는 탭에도 이 접두어를 넣어요.');
  };
  newPrefixButton?.addEventListener('click', onNewPrefix);
  cleanups.push(() => newPrefixButton?.removeEventListener('click', onNewPrefix));

  const onPin = (): void => {
    if (isPinned()) {
      unpinPrefix();
    } else {
      pinPrefix(session.prefix);
    }
    syncPrefix();
  };
  pinButton?.addEventListener('click', onPin);
  cleanups.push(() => pinButton?.removeEventListener('click', onPin));

  const onFriend = (): void => {
    const parsed = parsePrefix(friendInput?.value ?? '');
    if (!parsed.ok) {
      showHint(parsed.reason);
      return;
    }
    usePrefix(parsed.prefix, '접두어를 맞췄어요. 두 탭이 같은 접두어면 서로 메시지가 오가요.');
  };
  friendButton?.addEventListener('click', onFriend);
  cleanups.push(() => friendButton?.removeEventListener('click', onFriend));

  // ── 도구 줄 ─────────────────────────────────────────────────────────────
  const addButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-dash-add]')];
  const onAdd = (event: Event): void => {
    const button = event.currentTarget as HTMLButtonElement;
    const kind = (button.dataset.dashAdd ?? '') as WidgetKind;
    view.addWidget(kind);
  };
  for (const button of addButtons) {
    button.addEventListener('click', onAdd);
    cleanups.push(() => button.removeEventListener('click', onAdd));
  }

  const onReset = (): void => view.resetLayout();
  resetButton?.addEventListener('click', onReset);
  cleanups.push(() => resetButton?.removeEventListener('click', onReset));

  // ── 가상 보드 함께 열기(누른 뒤에 iframe을 만든다) ──────────────────────
  const onOpenLab = (): void => {
    if (labSlot === null || openLabButton === null) {
      return;
    }
    const open = labSlot.hidden;
    if (open && labSlot.querySelector('iframe') === null) {
      const frame = document.createElement('iframe');
      frame.src = embedLabSrc();
      frame.title = 'ESP32 실습실(가상 보드)';
      frame.className = 'dash-lab__frame';
      frame.dataset.dashLabFrame = '';
      labSlot.append(frame);
    }
    labSlot.hidden = !open;
    openLabButton.setAttribute('aria-expanded', open ? 'true' : 'false');
    openLabButton.textContent = open ? '가상 보드 접기' : '이 자리에서 가상 보드 열기';
    if (open) {
      labSlot.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  };
  openLabButton?.addEventListener('click', onOpenLab);
  cleanups.push(() => openLabButton?.removeEventListener('click', onOpenLab));

  // ── 바깥에서 오는 일 ────────────────────────────────────────────────────
  const onRecordsCleared = (): void => {
    view.reload();
    showHint('이 컴퓨터의 기록을 지워서 위젯 배치가 처음 모습으로 돌아왔어요.');
  };
  document.addEventListener('apc:records-cleared', onRecordsCleared);
  cleanups.push(() => document.removeEventListener('apc:records-cleared', onRecordsCleared));

  // 창 크기가 바뀌는 동안 계속 다시 그리지 않게 조금 기다렸다 한 번 그린다(시계 종류는 브라우저·Node가 달라 추론에 맡긴다).
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  const onResize = (): void => {
    if (resizeTimer !== null) {
      clearTimeout(resizeTimer);
    }
    resizeTimer = setTimeout(() => view.redraw(), 120);
  };
  globalThis.addEventListener('resize', onResize);
  cleanups.push(() => globalThis.removeEventListener('resize', onResize));

  // ── 첫 모습 ─────────────────────────────────────────────────────────────
  if (modeSelect !== null) {
    modeSelect.value = settings.mode;
  }
  if (brokerSelect !== null) {
    brokerSelect.value = settings.brokerId;
  }
  if (brokerUrlInput !== null && settings.brokerId === CUSTOM_BROKER_ID) {
    brokerUrlInput.value = settings.brokerUrl;
  }
  syncPrefix();
  syncState();
  root.dataset.dashReady = 'yes';

  return {
    view,
    session,
    dispose(): void {
      for (const off of cleanups.splice(0)) {
        off();
      }
      view.dispose();
    },
  };
}
