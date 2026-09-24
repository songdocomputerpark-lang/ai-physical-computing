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
import {
  PREFIX_ALPHABET,
  PREFIX_LENGTH,
  createPrefix,
  ensurePrefix,
  isPinned,
  parsePrefix,
  pinPrefix,
  prefixFromQuery,
  unpinPrefix,
  writeSessionPrefix,
} from '../../bridge/index.ts';
import {
  brokerById,
  brokerUrlForServer,
  checkBrokerUrl,
  CUSTOM_BROKER_ID,
  findPrefixValue,
  getMqttSession,
  mqttText,
  parseDevice,
  readMqttSettings,
  registerMqttChannel,
  resetMqttSession,
  topicMatches,
  writeMqttSettings,
  type MqttLogEntry,
  type MqttMode,
} from '../../mqtt/index.ts';
import { showPanelWhenUsed } from '../panel-when-used.ts';
import type { LabModule, LabModuleContext, LabModuleHandle } from '../types.ts';
import manifest from './manifest.ts';

/** 코드에 이 낱말이 보이면 패널을 연다(README 4.3 "패널은 쓸 때만 연다") */
const USE_PATTERN = /\b(umqtt|mqtt|network)\b/u;

/** 토픽 맨 앞 칸이 통신 접두어 모양인가(12글자, 브릿지 접두어 글자) */
const PREFIX_HEAD_PATTERN = new RegExp(`^/?([${PREFIX_ALPHABET}]{${PREFIX_LENGTH}})/`, 'u');

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
  // 대시보드 링크로 열렸으면(?prefix=… — 2026-09-25 Phase 4 검토 반영) 그 접두어를 이 탭에서 쓴다. 두 탭의 접두어를 손으로 맞추지 않게.
  const urlPrefix = typeof location === 'undefined' ? null : prefixFromQuery(location.search);
  if (urlPrefix !== null) {
    writeSessionPrefix(urlPrefix);
  }
  const session = getMqttSession({ prefix: urlPrefix ?? ensurePrefix(), mode: settings.mode, brokerUrl: settings.brokerUrl });
  let device = settings.device;
  let serverNoticed = false;
  /**
   * 이번 실행의 파이썬이 받기로 한 토픽 필터(중계 서버에 실린 모양 — 접두어 포함). 실행마다 비운다(2026-09-25 Phase 4 검토 반영):
   * 연결은 실행을 넘어 이어지므로(대시보드·[보내기] 패널이 함께 씀) 지난 실행에서 받기로 한 토픽의 메시지가 지금 코드의 콜백으로
   * 들어가 "DEVICE를 바꾸면 토픽이 달라져요" 실습이 반대 결론을 냈다. 실물 umqtt는 리셋마다 새 연결이라 지금 코드가 받기로 한 것만 온다.
   */
  let runFilters: string[] = [];
  let retainNoticed = false;
  let foreignNoticed = false;

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
  const connectWarning = find<HTMLElement>('connect-warning');
  const copyPrefixButton = find<HTMLButtonElement>('copy-prefix');
  const writePrefixButton = find<HTMLButtonElement>('write-prefix');
  const dashboardLink = panel?.querySelector<HTMLAnchorElement>('[data-mqtt-dashboard-link]') ?? null;
  const dashboardBaseHref = dashboardLink?.getAttribute('href') ?? '';

  const cleanups: Array<() => void> = [];

  /** [실제 보드] 탭을 골랐나(실습실 틀이 뿌리의 data-run-target에 실행 대상 이름을 적는다 — lab-shell.ts) */
  const realBoard = (): boolean => (context.root.dataset.runTarget ?? '') !== '';

  /** 안내 줄에 지금 적힌 글이 어느 칸에서 왔나(그 칸이 고쳐졌을 때만 지운다) */
  let hintSource: 'url' | 'device' | null = null;
  const showHint = (text: string, source: 'url' | 'device' | null = null): void => {
    if (hintText) {
      hintText.textContent = text;
      hintText.hidden = text === '';
    }
    hintSource = text === '' ? null : source;
  };
  /**
   * 그 칸이 적어 둔 오류 안내만 지운다. 다른 안내까지 지우면 안내 줄이 접히며 문서가 짧아지고, 페이지 맨 아래를 보던 화면이 위로
   * 당겨져 방금 누르려던 [연결]이 손가락 밑에서 30px 움직였다(칸을 벗어나는 순간 지우기 때문 — 2026-09-25 브라우저 검사에서 발견).
   */
  const clearHintFrom = (source: 'url' | 'device'): void => {
    if (hintSource === source) {
      showHint('');
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
    // 대시보드 링크에 이 접두어를 싣는다 — 새 탭의 대시보드가 ?prefix=를 읽어 같은 접두어로 연다(2026-09-25 Phase 4 검토 반영)
    if (dashboardLink && dashboardBaseHref !== '') {
      dashboardLink.setAttribute('href', `${dashboardBaseHref}?prefix=${encodeURIComponent(session.prefix)}`);
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
    const real = realBoard();
    const broker = mode !== 'tab';
    if (warning) {
      // [실제 보드] 탭이면 통로 값과 상관없이 실물 경고 — 실제 보드는 보드의 와이파이로 공개 중계 서버에 직접 붙는다(2026-09-25 검토 반영)
      warning.textContent = real ? mqttText.realBoardWarning() : broker ? mqttText.brokerWarning() : mqttText.tabNotice();
      warning.dataset.mqttLevel = real || broker ? 'warn' : 'info';
    }
    if (connectWarning) {
      // [연결] 바로 아래 — 휴대폰에서도 연결하는 순간 보이게(§7.4 "연결 버튼 옆에 늘 표시")
      const text = real ? mqttText.realBoardConnectNote() : broker ? mqttText.connectWarning() : '';
      connectWarning.textContent = text;
      connectWarning.hidden = text === '';
    }
    if (panelRoot) {
      panelRoot.dataset.mqttRealBoard = real ? 'yes' : 'no';
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
      // 지금 실행의 코드가 받기로 한 토픽만 파이썬에 넘긴다(머리말의 runFilters — 대시보드·[보내기] 패널이 받는 것은 넘기지 않는다)
      if (!runFilters.some((filter) => topicMatches(filter, message.topic))) {
        return;
      }
      context.pushEvent('mqtt.inbox', { topic: message.studentTopic, bytes: [...message.bytes] });
    }),
  );
  // [가상 보드]/[실제 보드] 탭을 바꾸면 경고 글을 다시 고른다(실습실 틀이 뿌리의 data-run-target을 바꾼다)
  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => syncState());
    observer.observe(context.root, { attributes: true, attributeFilter: ['data-run-target'] });
    cleanups.push(() => observer.disconnect());
  }

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
      showHint(check.reason, 'url');
      return;
    }
    clearHintFrom('url');
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

  // [복사] — 다른 컴퓨터·다른 탭에 접두어를 옮길 때 12글자를 눈으로 옮겨 적지 않게(2026-09-25 Phase 4 검토 반영)
  const onCopyPrefix = (): void => {
    const prefix = session.prefix;
    if (!navigator.clipboard?.writeText) {
      showHint(`이 브라우저는 복사를 막았어요. 접두어 ${prefix}를 직접 적어요.`);
      return;
    }
    navigator.clipboard.writeText(prefix).then(
      () => showHint(`통신 접두어 ${prefix}를 복사했어요. 같이 실습하는 화면의 [친구 접두어]에 붙여 넣어요.`),
      () => showHint(`이 브라우저는 복사를 막았어요. 접두어 ${prefix}를 직접 적어요.`),
    );
  };
  copyPrefixButton?.addEventListener('click', onCopyPrefix);

  // [코드에 접두어 적기] — 코드의 PREFIX = "" 줄에 이 칸의 접두어를 **보이게** 적는다(실제 보드용, PD-29). 사이트가 몰래 고치지 않는다.
  const onWritePrefix = (): void => {
    if (context.root.dataset.blockMode === 'blocks') {
      showHint(mqttText.prefixInBlocks());
      return;
    }
    const code = context.lab.getCode();
    const found = findPrefixValue(code);
    if (found === null) {
      showHint(mqttText.prefixLineMissing(session.prefix));
      return;
    }
    if (found.value !== session.prefix) {
      context.lab.replaceCode(found.from, found.to, session.prefix);
    }
    showHint(mqttText.prefixWritten(found.name, session.prefix));
  };
  writePrefixButton?.addEventListener('click', onWritePrefix);

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
      showHint(parsed.reason, 'device');
      return;
    }
    device = parsed.device;
    if (deviceInput) {
      deviceInput.value = parsed.device;
    }
    writeMqttSettings({ device: parsed.device });
    clearHintFrom('device');
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

  /** 코드의 토픽이 이 칸과 다른 통신 접두어로 시작하면 한 번 알린다(가상 보드는 이 칸의 접두어를 한 번 더 붙인다) */
  const noticeForeignPrefix = (topic: string): void => {
    if (foreignNoticed) {
      return;
    }
    const head = PREFIX_HEAD_PATTERN.exec(topic)?.[1];
    if (head !== undefined && head !== session.prefix) {
      foreignNoticed = true;
      context.notice(mqttText.foreignPrefix(head, session.prefix));
    }
  };

  context.onRequest('mqtt.publish', (request) => {
    const payload = (request.payload ?? {}) as { topic?: unknown; bytes?: unknown; retain?: unknown; qos?: unknown };
    const topic = typeof payload.topic === 'string' ? payload.topic : '';
    const bytes = Array.isArray(payload.bytes) ? Uint8Array.from(payload.bytes as number[]) : new Uint8Array(0);
    // retain은 늘 끈다(PLAN §7.4 — 공개 중계 서버에 값이 남지 않게, 2026-09-25 Phase 4 검토 반영). 코드가 달라고 했으면 한 번 알린다.
    if (payload.retain === true && !retainNoticed) {
      retainNoticed = true;
      context.notice(mqttText.retainIgnored());
    }
    noticeForeignPrefix(topic);
    void session
      .publish(topic, bytes, { retain: false, qos: 0 })
      .then((sent) => request.reply({ topic: sent }))
      .catch((error: unknown) => request.fail(error instanceof Error ? error.message : String(error)));
  });

  context.onRequest('mqtt.subscribe', (request) => {
    const payload = (request.payload ?? {}) as { topic?: unknown };
    const topic = typeof payload.topic === 'string' ? payload.topic : '';
    noticeForeignPrefix(topic);
    void session
      .subscribe(topic)
      .then((full) => {
        if (!runFilters.includes(full)) {
          runFilters = [...runFilters, full];
        }
        request.reply({ topic: full });
      })
      .catch((error: unknown) => request.fail(error instanceof Error ? error.message : String(error)));
  });

  context.onRequest('mqtt.disconnect', (request) => {
    // 화면 연결은 패널이 가진 것이라 닫지 않는다(다른 실습·대시보드가 함께 쓴다). 코드 쪽만 끊긴다 — 코드가 받기로 한 토픽도 잊는다.
    runFilters = [];
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

  // 실행을 시작하면 지난 실행의 안내와 "받기로 한 토픽"을 지운다(받은 메시지는 파이썬 쪽 초기화 훅이 버린다).
  context.onLab('run', () => {
    showHint('');
    runFilters = [];
    retainNoticed = false;
    foreignNoticed = false;
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
      copyPrefixButton?.removeEventListener('click', onCopyPrefix);
      writePrefixButton?.removeEventListener('click', onWritePrefix);
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
