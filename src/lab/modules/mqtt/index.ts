/**
 * MQTT 흉내 모듈의 화면 쪽(P4-06, PLAN §7.4·PD-29·PD-17). 파이썬 `umqtt.simple`·`network` 흉내와 짝이다.
 *
 * 하는 일
 * 1. 브릿지 통로 'mqtt'를 등록한다(`registerMqttChannel()` — 다른 구역의 [보내기] 패널이 고를 수 있게).
 * 2. 파이썬 요청을 이 탭의 연결(`getMqttSession()`)로 잇는다: mqtt.connect · publish · subscribe · disconnect.
 * 3. 받은 메시지를 `pushEvent('mqtt.inbox')`로 파이썬에 넘긴다(파이썬은 check_msg·wait_msg로 꺼낸다).
 * 4. 패널: 통로 고르기 · 중계 서버 고르기 · 접두어(새로 만들기·고정·친구 접두어) · 보드 이름 · 연결/끊기 · 주고받은 기록.
 *    **공개 중계 서버 경고는 늘 보인다**(§7.4 — 브로커를 고른 순간 더 눈에 띄게 바뀐다).
 *
 * 화면 표시(테스트가 읽는 값): 패널 요소의 `data-mqtt-state`(idle·connecting·open·closed)와 `data-mqtt-via`(broker·tab).
 */
import { createPrefix, ensurePrefix, isPinned, parsePrefix, pinPrefix, unpinPrefix, writeSessionPrefix } from '../../bridge/index.ts';
import {
  brokerById,
  brokerUrlForServer,
  checkBrokerUrl,
  CUSTOM_BROKER_ID,
  getMqttSession,
  mqttText,
  parseDevice,
  readMqttSettings,
  registerMqttChannel,
  resetMqttSession,
  writeMqttSettings,
  type MqttLogEntry,
  type MqttMode,
} from '../../mqtt/index.ts';
import { showPanelWhenUsed } from '../panel-when-used.ts';
import type { LabModule, LabModuleContext, LabModuleHandle } from '../types.ts';
import manifest from './manifest.ts';

/** 코드에 이 낱말이 보이면 패널을 연다(README 4.3 "패널은 쓸 때만 연다") */
const USE_PATTERN = /\b(umqtt|mqtt|network)\b/u;

/** 기록 한 줄을 화면 글로 */
function logLine(entry: MqttLogEntry): string {
  const time = new Date(entry.at);
  const stamp = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}:${String(time.getSeconds()).padStart(2, '0')}`;
  return `${stamp} ${entry.text}`;
}

function mount(context: LabModuleContext): LabModuleHandle {
  registerMqttChannel();
  const panel = context.panel;
  const gate = showPanelWhenUsed(context, USE_PATTERN);
  const settings = readMqttSettings();
  const session = getMqttSession({ prefix: ensurePrefix(), mode: settings.mode, brokerUrl: settings.brokerUrl });
  let device = settings.device;
  let serverNoticed = false;

  const find = <T extends HTMLElement>(name: string): T | null => panel?.querySelector<T>(`[data-mqtt-${name}]`) ?? null;
  /** 상태 표시를 다는 곳은 패널 안쪽 뿌리다(LabShell이 만든 <section>이 아니라 panel.astro가 그린 div) */
  const panelRoot = find<HTMLElement>('panel');
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
  const deviceInput = find<HTMLInputElement>('device');
  const connectButton = find<HTMLButtonElement>('connect');
  const disconnectButton = find<HTMLButtonElement>('disconnect');
  const stateText = find<HTMLElement>('state-text');
  const wifiText = find<HTMLElement>('wifi');
  const logList = find<HTMLElement>('log');
  const hintText = find<HTMLElement>('hint');

  const cleanups: Array<() => void> = [];

  const showHint = (text: string): void => {
    if (hintText) {
      hintText.textContent = text;
      hintText.hidden = text === '';
    }
  };

  const syncPrefix = (): void => {
    if (prefixText) {
      prefixText.textContent = session.prefix;
    }
    if (pinButton) {
      const pinned = isPinned();
      pinButton.textContent = pinned ? '고정 풀기' : '이 접두어 고정';
      pinButton.setAttribute('aria-pressed', pinned ? 'true' : 'false');
    }
  };

  const syncState = (): void => {
    const mode = session.mode;
    if (panelRoot) {
      panelRoot.dataset.mqttState = session.state;
      panelRoot.dataset.mqttVia = session.via ?? '';
      panelRoot.dataset.mqttModeValue = mode;
    }
    if (stateText) {
      const labels: Record<string, string> = {
        idle: '아직 연결하지 않았어요',
        connecting: '연결하는 중…',
        open: `연결됨 — ${mqttText.channelLabel(session.via)}${session.where === '' ? '' : ` (${session.where})`}`,
        closed: '연결이 닫혔어요',
      };
      stateText.textContent = labels[session.state] ?? session.state;
    }
    if (warning) {
      const broker = mode !== 'tab';
      warning.textContent = broker ? mqttText.brokerWarning() : mqttText.tabNotice();
      warning.dataset.mqttLevel = broker ? 'warn' : 'info';
    }
    if (brokerSelect) {
      brokerSelect.disabled = mode === 'tab';
    }
    if (brokerUrlRow) {
      brokerUrlRow.hidden = mode === 'tab' || brokerSelect?.value !== CUSTOM_BROKER_ID;
    }
    if (brokerNote) {
      const chosen = brokerById(brokerSelect?.value ?? '');
      brokerNote.textContent = mode === 'tab' ? '' : (chosen?.note ?? '');
    }
    if (disconnectButton) {
      disconnectButton.disabled = session.state !== 'open';
    }
  };

  const addLog = (entry: MqttLogEntry): void => {
    if (!logList) {
      return;
    }
    const item = document.createElement('li');
    item.className = 'mqtt__log-item';
    item.dataset.mqttLogKind = entry.kind;
    item.textContent = logLine(entry);
    logList.append(item);
    while (logList.childElementCount > 40) {
      logList.firstElementChild?.remove();
    }
    logList.scrollTop = logList.scrollHeight;
  };

  cleanups.push(session.on('log', addLog));
  cleanups.push(session.on('state', () => syncState()));
  cleanups.push(
    session.on('notice', (text) => {
      context.notice(text);
    }),
  );
  cleanups.push(
    session.on('message', (message) => {
      context.pushEvent('mqtt.inbox', { topic: message.studentTopic, bytes: [...message.bytes] });
    }),
  );

  // ── 패널 조작 ────────────────────────────────────────────────────────────
  const onMode = (): void => {
    const mode = (modeSelect?.value ?? 'tab') as MqttMode;
    writeMqttSettings({ mode });
    session.update({ mode });
    syncState();
    showHint(mode === 'tab' ? '' : '공개 중계 서버는 누구나 볼 수 있어요. 개인정보를 보내지 않아요.');
  };
  modeSelect?.addEventListener('change', onMode);

  const onBroker = (): void => {
    const brokerId = brokerSelect?.value ?? '';
    const chosen = brokerById(brokerId);
    writeMqttSettings({ brokerId });
    if (brokerId !== CUSTOM_BROKER_ID && chosen !== null) {
      session.update({ brokerUrl: chosen.url });
    } else if (brokerUrlInput) {
      const check = checkBrokerUrl(brokerUrlInput.value);
      if (check.ok) {
        session.update({ brokerUrl: check.url });
      }
    }
    syncState();
  };
  brokerSelect?.addEventListener('change', onBroker);

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

  const onNewPrefix = (): void => {
    const prefix = createPrefix();
    writeSessionPrefix(prefix);
    if (isPinned()) {
      pinPrefix(prefix);
    }
    session.update({ prefix });
    syncPrefix();
    syncState();
    showHint('새 접두어를 만들었어요. 같이 실습하는 탭에도 이 접두어를 넣어요.');
  };
  newPrefixButton?.addEventListener('click', onNewPrefix);

  const onPin = (): void => {
    if (isPinned()) {
      unpinPrefix();
    } else {
      pinPrefix(session.prefix);
    }
    syncPrefix();
  };
  pinButton?.addEventListener('click', onPin);

  const onFriend = (): void => {
    const parsed = parsePrefix(friendInput?.value ?? '');
    if (!parsed.ok) {
      showHint(parsed.reason);
      return;
    }
    writeSessionPrefix(parsed.prefix);
    session.update({ prefix: parsed.prefix });
    syncPrefix();
    syncState();
    showHint('접두어를 맞췄어요. 두 탭이 같은 접두어면 서로 메시지가 오가요.');
  };
  friendButton?.addEventListener('click', onFriend);

  const onDevice = (): void => {
    const parsed = parseDevice(deviceInput?.value ?? '');
    if (!parsed.ok) {
      showHint(parsed.reason);
      return;
    }
    device = parsed.device;
    if (deviceInput) {
      deviceInput.value = parsed.device;
    }
    writeMqttSettings({ device: parsed.device });
    showHint('');
  };
  deviceInput?.addEventListener('change', onDevice);

  const connect = async (): Promise<void> => {
    gate.show();
    if (connectButton) {
      connectButton.disabled = true;
    }
    try {
      await session.connect();
    } catch (error) {
      showHint(error instanceof Error ? error.message : String(error));
    } finally {
      if (connectButton) {
        connectButton.disabled = false;
      }
      syncState();
    }
  };
  const onConnect = (): void => {
    void connect();
  };
  connectButton?.addEventListener('click', onConnect);

  const onDisconnect = (): void => {
    session.close('[끊기]를 눌러 연결을 닫았어요.');
    syncState();
  };
  disconnectButton?.addEventListener('click', onDisconnect);

  // ── 파이썬 요청 ──────────────────────────────────────────────────────────
  context.onRequest('mqtt.connect', (request) => {
    gate.show();
    const payload = (request.payload ?? {}) as { server?: unknown };
    const server = typeof payload.server === 'string' ? payload.server : '';
    if (session.mode !== 'tab' && server !== '') {
      const url = brokerUrlForServer(server, session.where === '' ? readMqttSettings().brokerUrl : session.where);
      session.update({ brokerUrl: url });
      if (!serverNoticed && !url.includes(server)) {
        serverNoticed = true;
        context.notice(
          `코드에 적은 주소 ${server} 대신 화면에서 고른 중계 서버로 붙어요. 브라우저는 WebSocket(wss://) 주소로만 MQTT를 쓸 수 있기 때문이에요.`,
        );
      }
    }
    void session
      .connect()
      .then((result) => {
        syncState();
        request.reply({ via: result.via, where: result.where, prefix: session.prefix });
      })
      .catch((error: unknown) => {
        syncState();
        request.fail(error instanceof Error ? error.message : String(error));
      });
  });

  context.onRequest('mqtt.publish', (request) => {
    const payload = (request.payload ?? {}) as { topic?: unknown; bytes?: unknown; retain?: unknown; qos?: unknown };
    const topic = typeof payload.topic === 'string' ? payload.topic : '';
    const bytes = Array.isArray(payload.bytes) ? Uint8Array.from(payload.bytes as number[]) : new Uint8Array(0);
    void session
      .publish(topic, bytes, { retain: payload.retain === true, qos: 0 })
      .then((sent) => request.reply({ topic: sent }))
      .catch((error: unknown) => request.fail(error instanceof Error ? error.message : String(error)));
  });

  context.onRequest('mqtt.subscribe', (request) => {
    const payload = (request.payload ?? {}) as { topic?: unknown };
    const topic = typeof payload.topic === 'string' ? payload.topic : '';
    void session
      .subscribe(topic)
      .then((full) => request.reply({ topic: full }))
      .catch((error: unknown) => request.fail(error instanceof Error ? error.message : String(error)));
  });

  context.onRequest('mqtt.disconnect', (request) => {
    // 화면 연결은 패널이 가진 것이라 닫지 않는다(다른 실습·대시보드가 함께 쓴다). 코드 쪽만 끊긴다.
    context.notice('코드에서 MQTT 연결을 끊었어요. 화면 연결은 그대로 있어요 — 닫으려면 [끊기]를 눌러요.');
    request.reply({ ok: true });
  });

  context.onEvent('mqtt.wifi', (payload) => {
    const value = (payload ?? {}) as { connected?: unknown; ssid?: unknown; ip?: unknown };
    gate.show();
    const connected = value.connected === true;
    if (wifiText) {
      wifiText.textContent = connected
        ? `가상 와이파이 연결됨${typeof value.ssid === 'string' && value.ssid !== '' ? ` (${value.ssid})` : ''} — 주소 ${String(value.ip ?? '')}`
        : '가상 와이파이 끊김';
      wifiText.dataset.mqttWifiOn = connected ? 'true' : 'false';
    }
    if (connected) {
      context.notice('가상 보드의 와이파이가 연결됐어요. 실물 보드에서는 이 자리에서 공유기 비밀번호가 맞아야 해요.');
    }
  });

  // 실행을 시작하면 지난 실행의 안내를 지운다(받은 메시지는 파이썬 쪽 초기화 훅이 버린다).
  context.onLab('run', () => {
    showHint('');
  });

  // 첫 모습 맞추기
  if (modeSelect) {
    modeSelect.value = settings.mode;
  }
  if (brokerSelect) {
    brokerSelect.value = settings.brokerId;
  }
  if (brokerUrlInput && settings.brokerId === CUSTOM_BROKER_ID) {
    brokerUrlInput.value = settings.brokerUrl;
  }
  if (deviceInput) {
    deviceInput.value = device;
  }
  for (const entry of session.log) {
    addLog(entry);
  }
  syncPrefix();
  syncState();

  return {
    dispose() {
      for (const off of cleanups.splice(0)) {
        off();
      }
      modeSelect?.removeEventListener('change', onMode);
      brokerSelect?.removeEventListener('change', onBroker);
      brokerUrlInput?.removeEventListener('change', onBrokerUrl);
      newPrefixButton?.removeEventListener('click', onNewPrefix);
      pinButton?.removeEventListener('click', onPin);
      friendButton?.removeEventListener('click', onFriend);
      deviceInput?.removeEventListener('change', onDevice);
      connectButton?.removeEventListener('click', onConnect);
      disconnectButton?.removeEventListener('click', onDisconnect);
      resetMqttSession('실습실을 떠나 연결을 닫았어요.');
    },
  };
}

const module: LabModule = { manifest, mount };
export default module;
