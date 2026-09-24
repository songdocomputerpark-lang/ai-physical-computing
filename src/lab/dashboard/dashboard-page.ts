/**
 * 대시보드 페이지의 화면 논리(P4-07, 시나리오 D) — `/labs/iot/dashboard/`(통신 실습실 아래 페이지).
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
  prefixFromQuery,
  registerBuiltinChannels,
  TAB_CHANNEL_ID,
  unpinPrefix,
  writeSessionPrefix,
  type BridgeChannel,
} from '../bridge/index.ts';
import {
  brokerById,
  checkBrokerUrl,
  CUSTOM_BROKER_ID,
  defaultBrokerUrl,
  getMqttSession,
  mqttText,
  readMqttSettings,
  registerMqttChannel,
  writeMqttSettings,
  type MqttConnection,
  type MqttMode,
} from '../mqtt/index.ts';
import { COMMAND_TOPIC } from './defaults.ts';
import { DASHBOARD_DEMO_FILE } from './demo-code.ts';
import { DashboardView } from './grid-view.ts';
import { dashText } from './messages.ts';
import { createMqttSource, listenBridge } from './source.ts';
import type { SourceMessage, WidgetKind, WidgetSpec } from './types.ts';

export interface DashboardPage {
  readonly view: DashboardView;
  readonly session: MqttConnection;
  dispose(): void;
}

/**
 * ESP32 실습실을 대시보드 옆에 여는 주소 — 대시보드 예제(통신 템플릿 4)를 `?example=`로 연다(2026-09-25 Phase 4 검토 반영:
 * 전에는 공유 링크 코드로 열어 실습실 예제 이름이 코드와 달랐다). 같은 탭 안의 틀이라 통신 접두어(sessionStorage)는 그대로 이어진다.
 */
export function embedLabSrc(file: string = DASHBOARD_DEMO_FILE): string {
  return `${withBase('labs/esp32/')}?example=${encodeURIComponent(file)}&embed=1`;
}

/** 두 탭 실습: 새 탭의 ESP32 실습실을 같은 예제·같은 접두어로 여는 주소(`?prefix=` — MQTT 모듈이 읽는다) */
export function labTabHref(base: string, prefix: string, file: string = DASHBOARD_DEMO_FILE): string {
  return `${base}?example=${encodeURIComponent(file)}&prefix=${encodeURIComponent(prefix)}`;
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
  const connectWarning = find<HTMLElement>('connect-warning');
  const copyPrefixButton = find<HTMLButtonElement>('copy-prefix');
  const checkNote = find<HTMLElement>('check-note');
  const labLink = root.querySelector<HTMLAnchorElement>('[data-dash-lab-link]');
  const labHint = find<HTMLElement>('lab-hint');

  const settings = readMqttSettings();
  // ESP32 실습실 MQTT 칸의 "대시보드를 새 탭에서" 링크로 열렸으면(?prefix=… — 2026-09-25 Phase 4 검토 반영) 그 접두어를 이 탭에서 쓴다.
  const urlPrefix = typeof location === 'undefined' ? null : prefixFromQuery(location.search);
  if (urlPrefix !== null) {
    writeSessionPrefix(urlPrefix);
  }
  const session = getMqttSession({ prefix: urlPrefix ?? ensurePrefix(), mode: settings.mode, brokerUrl: settings.brokerUrl });
  const source = createMqttSource(session);
  let received = 0;

  /** 1단계 안내 줄. level 'warn'이면 경고 모양(중계 서버 실패·탭 전환 — 다음 안내가 올 때까지 남는다) */
  const showHint = (text: string, level: 'info' | 'warn' = 'info'): void => {
    if (hint !== null) {
      hint.textContent = text;
      hint.hidden = text === '';
      hint.dataset.dashLevel = level;
    }
  };

  const showLabHint = (text: string): void => {
    if (labHint !== null) {
      labHint.textContent = text;
      labHint.hidden = text === '';
    }
  };

  /**
   * 이 자리에 연 가상 보드(같은 출처 iframe)의 내장 LED가 스위치를 따라 바뀌는지 보고 스위치 아래에 알린다(2026-09-25 Phase 4 검토 반영).
   * 1366×768에서는 위젯 판과 아래 가상 보드가 한 화면에 들어가지 않아, 스위치를 눌러도 LED가 켜졌는지 보이지 않았다.
   * 대시보드 예제(통신 템플릿 4)의 명령 토픽 스위치일 때만 본다(다른 토픽은 LED와 상관이 없을 수 있다).
   */
  let ledWatch: ReturnType<typeof setInterval> | null = null;
  const stopLedWatch = (): void => {
    if (ledWatch !== null) {
      clearInterval(ledWatch);
      ledWatch = null;
    }
  };
  const watchFrameLed = (spec: WidgetSpec, on: boolean): void => {
    const frame = labSlot?.querySelector<HTMLIFrameElement>('iframe') ?? null;
    if (frame === null || labSlot?.hidden === true || spec.topic !== COMMAND_TOPIC) {
      return;
    }
    stopLedWatch();
    const started = Date.now();
    ledWatch = setInterval(() => {
      let lit: string | undefined;
      try {
        lit = frame.contentDocument?.querySelector<HTMLElement>('[data-board-part="builtin-led"]')?.dataset.visualLit;
      } catch {
        lit = undefined;
      }
      if (lit === (on ? 'true' : 'false')) {
        stopLedWatch();
        view.noteWidget(spec.id, dashText.frameLed(on), 'info');
        return;
      }
      if (Date.now() - started > 4000) {
        stopLedWatch();
        view.noteWidget(spec.id, dashText.frameLedMissed(), 'warn');
      }
    }, 200);
  };

  const view = new DashboardView({
    grid,
    announce,
    helpId: help?.id ?? 'dash-keyboard-help',
    // 위젯 옮기기·크기 알림은 판 아래 알림 칸(announce) 한 곳에만 적는다 — 1단계 안내 줄에도 적으면 낭독기가 두 번 읽고
    // 연결 안내를 덮어썼다(2026-09-25 Phase 4 검토 반영). 1단계 안내 줄은 연결·보내기 이야기만 한다.
    onToggle: (spec: WidgetSpec, on: boolean): Promise<boolean> | boolean => {
      const text = on ? spec.onText : spec.offText;
      if (session.state !== 'open') {
        // 보내지 못하면 스위치 모양을 바꾸지 않는다(위젯이 까닭을 스위치 옆에 적는다 — widgets.ts)
        showHint(dashText.needConnect(), 'warn');
        return false;
      }
      return source.send(spec.topic, text).then(
        () => {
          showHint(dashText.switchSent(spec.topic, text));
          watchFrameLed(spec, on);
          return true;
        },
        (error: unknown) => {
          showHint(error instanceof Error ? error.message : String(error), 'warn');
          return false;
        },
      );
    },
    switchProblem: () => dashText.needConnect(),
    // 위젯을 모두 지우면 초점을 [위젯 추가]의 첫 단추로(초점이 body로 떨어지지 않게)
    fallbackFocus: () => root.querySelector<HTMLElement>('[data-dash-add]'),
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
    // 두 탭 실습 링크: 새 탭의 ESP32 실습실이 이 접두어로 열린다(12글자를 옮겨 적지 않게)
    if (labLink !== null) {
      labLink.href = labTabHref(labLink.dataset.dashLabBase ?? withBase('labs/esp32/'), session.prefix);
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
    // 이어져 있으면 실제 통로(via)를, 아니면 고른 통로(mode)를 따른다 — 중계 서버 대신 탭으로 이어졌는데 공개 서버 경고를 보이지 않게(I4)
    const broker = session.state === 'open' ? session.via === 'broker' : mode !== 'tab';
    if (warning !== null) {
      warning.textContent = broker ? mqttText.brokerWarning() : mqttText.tabNotice();
      warning.dataset.dashLevel = broker ? 'warn' : 'info';
    }
    if (connectWarning !== null) {
      // [연결] 바로 아래(§7.4 "연결 버튼 옆에 늘 표시") — 공개 중계 서버를 고른 동안 늘 보인다
      connectWarning.textContent = mode !== 'tab' ? mqttText.connectWarning() : '';
      connectWarning.hidden = mode === 'tab';
    }
    if (session.state === 'open') {
      showLabHint('');
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

  const cleanups: Array<() => void> = [stopLedWatch];

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

  /**
   * [연결]. 끝난 뒤 안내 줄에는 **실제로 어떻게 이어졌는지**를 남긴다(2026-09-25 Phase 4 검토 반영 — 전에는 중계 서버 실패·탭 전환 안내를
   * 끝의 "연결했어요"가 덮어써, 친구 컴퓨터와 하려던 학생이 이어지지 않는 까닭을 못 봤다). auto는 [이 자리에서 가상 보드 열기]가 부른 것.
   */
  const connect = async (options: { auto?: boolean } = {}): Promise<void> => {
    if (connectButton !== null) {
      connectButton.disabled = true;
    }
    const mode = session.mode;
    try {
      const result = await session.connect();
      await listen();
      await openBridge();
      if (result.via === 'tab' && mode !== 'tab') {
        showHint(mqttText.switchedToTab(settingsBrokerUrl()), 'warn');
        if (checkNote !== null) {
          checkNote.hidden = false;
        }
      } else {
        showHint(options.auto === true ? dashText.autoConnected() : result.via === 'broker' ? dashText.connectedBroker() : dashText.connectedTab());
        if (checkNote !== null) {
          checkNote.hidden = true;
        }
      }
    } catch (error) {
      showHint(error instanceof Error ? error.message : String(error), 'warn');
      if (checkNote !== null && mode !== 'tab') {
        checkNote.hidden = false;
      }
    } finally {
      if (connectButton !== null) {
        connectButton.disabled = false;
      }
      syncState();
    }
  };

  /** 지금 고른 중계 서버 주소(안내 글에 쓴다) */
  const settingsBrokerUrl = (): string => {
    const saved = readMqttSettings();
    return saved.brokerUrl === '' ? defaultBrokerUrl() : saved.brokerUrl;
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

  // [복사] — 다른 탭·다른 컴퓨터에 접두어를 옮길 때(2026-09-25 Phase 4 검토 반영)
  const onCopyPrefix = (): void => {
    const prefix = session.prefix;
    if (!navigator.clipboard?.writeText) {
      showHint(dashText.copyBlocked(prefix));
      return;
    }
    navigator.clipboard.writeText(prefix).then(
      () => showHint(dashText.prefixCopied(prefix)),
      () => showHint(dashText.copyBlocked(prefix)),
    );
  };
  copyPrefixButton?.addEventListener('click', onCopyPrefix);
  cleanups.push(() => copyPrefixButton?.removeEventListener('click', onCopyPrefix));

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
      // 학생이 1단계 [연결]을 빼먹으면 보드가 보내는 값이 아무 데도 닿지 않았다(2026-09-25 Phase 4 검토 반영).
      // 같은 컴퓨터 탭이면 인터넷이 필요 없으니 [연결]까지 해 주고, 공개 중계 서버면(학생이 고르는 일) 무엇을 누를지 알린다.
      if (session.state !== 'open') {
        if (session.mode === 'tab') {
          void connect({ auto: true });
        } else {
          showLabHint(dashText.labNeedsConnect());
        }
      }
      const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      labSlot.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    } else {
      showLabHint('');
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
