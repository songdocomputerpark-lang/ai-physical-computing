/**
 * 네트워크 점검 항목(PLAN §5.5 "점검 항목", §8.2 P2-05). 순수 데이터·함수라 단위 테스트가 그대로 읽는다
 * (tests/unit/loading/network-check.test.ts). 화면은 NetworkCheck.astro.
 *
 * 규칙
 * - [시험하기]를 눌렀을 때만 접속한다. 여기 적은 주소 말고 다른 곳에는 접속하지 않는다.
 * - 학생 영상·음성·개인정보는 어디에도 보내지 않는다(GET 한 번으로 파일이 받아지는지만 본다).
 * - 통신 실습의 공개 중계 서버(MQTT 브로커)는 WebSocket으로 **연결만 해 보고 곧바로 닫는다**(메시지를 보내지 않는다 — PLAN §5.5,
 *   2026-09-24 Phase 4 통합). 주소는 src/lab/mqtt/brokers.ts에서 공식 안내로 확인한(verified) 것만 가져온다. 이 서버는 수업의
 *   기본 통로가 아니다(기본은 인터넷 없이 되는 "같은 컴퓨터 탭") — 막혀 있어도 통신 실습은 끝까지 된다고 안내한다.
 */
import type { ProbeStatus } from '../../../lab/loader/probe.ts';
import { MQTT_BROKERS } from '../../../lab/mqtt/brokers.ts';
import { PYODIDE_CDN_INDEX_URL, PYODIDE_SITE_INDEX_PATH } from '../../../lab/runtime/config.ts';
import { withBase } from '../../../lib/url.ts';

export type NetworkStatus = 'pending' | 'ok' | 'blocked' | 'unknown';

export interface NetworkCheckItem {
  /** 항목 id(영문 소문자·숫자·하이픈) */
  readonly id: string;
  readonly label: string;
  /** 왜 필요한지(한 문장) */
  readonly why: string;
  /** 화면에 그대로 보여 줄 주소(사이트 안 주소는 상대 경로로 보인다) */
  readonly display: string;
  /** 사이트 밖 주소(있으면 이것을 받는다) */
  readonly url?: string;
  /** 사이트 안 경로(있으면 location.origin과 이어 붙인다) */
  readonly path?: string;
  readonly method?: 'GET' | 'HEAD';
  /** 막혔을 때의 대처 */
  readonly advice: string;
  /** 값이 있으면 접속하지 않고 이 글만 보여 준다(아직 만들지 않은 기능) */
  readonly skip?: string;
  /** 사이트 밖 WebSocket 주소(있으면 파일을 받는 대신 연결만 해 보고 곧바로 닫는다 — MQTT 중계 서버) */
  readonly websocket?: { readonly url: string; readonly protocols?: readonly string[] };
}

/** 공개 중계 서버 항목(확인된 주소만 — 경로를 확인하지 못한 서버는 "막힘"으로 잘못 보일 수 있어 시험하지 않는다) */
const MQTT_ITEMS: readonly NetworkCheckItem[] = MQTT_BROKERS.filter((broker) => broker.verified && broker.url.startsWith('wss://')).map((broker) => ({
  id: `mqtt-${broker.id}`,
  label: `통신 실습 중계 서버(MQTT) — ${broker.label}`,
  why: '다른 컴퓨터와 메시지를 주고받는 통신 실습에서 "공개 중계 서버"를 고를 때 써요. 수업의 기본 통로(같은 컴퓨터 탭)는 이 서버 없이도 돼요.',
  display: broker.url,
  websocket: { url: broker.url, protocols: ['mqtt'] },
  advice:
    '학교망이 이 주소(포트)의 WebSocket을 막았을 수 있어요. 통신 실습은 인터넷 없이 되는 "같은 컴퓨터 탭" 통로로 끝까지 할 수 있어요. 공개 중계 서버가 꼭 필요하면 학교 전산 담당자에게 이 주소를 열어 달라고 신청해요.',
}));

export const NETWORK_CHECK_ITEMS: readonly NetworkCheckItem[] = Object.freeze([
  {
    id: 'pyodide-cdn',
    label: '파이썬 엔진 받는 곳(jsDelivr)',
    why: '실습실에서 파이썬을 실행하려면 이 주소에서 엔진 파일을 받아요.',
    display: `${PYODIDE_CDN_INDEX_URL}pyodide.mjs`,
    url: `${PYODIDE_CDN_INDEX_URL}pyodide.mjs`,
    advice: '학교 네트워크에서 cdn.jsdelivr.net을 열어 달라고 신청해 주세요. 막혀 있어도 아래 "같은 사이트 예비본"이 연결되면 실습은 돼요.',
  },
  {
    id: 'pyodide-site',
    label: '같은 사이트 파이썬 예비본',
    why: 'jsDelivr가 막혔을 때 이 사이트에 함께 올려 둔 같은 파일을 대신 받아요.',
    display: `${PYODIDE_SITE_INDEX_PATH}pyodide.mjs`,
    path: `${PYODIDE_SITE_INDEX_PATH}pyodide.mjs`,
    advice: '이 사이트 자체가 막혀 있을 수 있어요. 주소창의 사이트 주소를 학교 전산 담당자에게 알려 열어 달라고 신청해 주세요.',
  },
  {
    id: 'mediapipe-wasm',
    label: '손·얼굴 인식 파일(같은 사이트)',
    why: '손·얼굴·자세 인식 실습에서 쓰는 계산 파일이에요. 이 사이트에서 받아요.',
    display: withBase('vendor/mediapipe/0.10.35/wasm/vision_wasm_internal.js'),
    path: withBase('vendor/mediapipe/0.10.35/wasm/vision_wasm_internal.js'),
    advice: '사이트 안 파일이라 사이트가 열리면 보통 함께 열려요. 막히면 학교 전산 담당자에게 알려 주세요.',
  },
  ...MQTT_ITEMS,
]);

/** 항목이 실제로 받아 볼 주소 */
export function networkItemUrl(item: NetworkCheckItem, origin: string): string {
  if (item.url) {
    return item.url;
  }
  if (item.path) {
    return new URL(item.path, origin).href;
  }
  throw new Error(`네트워크 점검 항목 "${item.id}"에 주소가 없어요.`);
}

/** WebSocket 연결을 만드는 함수(브라우저에서는 new WebSocket — 단위 테스트는 가짜를 넣는다) */
export type WebSocketFactory = (url: string, protocols?: string[]) => {
  onopen: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
  close(): void;
};

export interface WebSocketProbeOutcome {
  readonly status: Extract<ProbeStatus, 'ok' | 'error' | 'stalled'>;
  readonly ms: number;
}

/**
 * WebSocket 주소에 연결만 해 본다(열리면 곧바로 닫는다 — 메시지를 보내지 않는다).
 * 열림 → ok, 오류·열리기 전에 닫힘 → error, timeoutMs 동안 소식이 없음 → stalled(막힘으로 본다).
 */
export function probeWebSocket(
  url: string,
  options: { readonly protocols?: readonly string[]; readonly timeoutMs: number; readonly create?: WebSocketFactory; readonly now?: () => number },
): Promise<WebSocketProbeOutcome> {
  const now = options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const create: WebSocketFactory =
    options.create ?? ((target, protocols) => new WebSocket(target, protocols) as unknown as ReturnType<WebSocketFactory>);
  const started = now();
  return new Promise((resolve) => {
    let settled = false;
    let socket: ReturnType<WebSocketFactory> | null = null;
    const finish = (status: WebSocketProbeOutcome['status']): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (socket !== null) {
        socket.onopen = null;
        socket.onerror = null;
        socket.onclose = null;
        try {
          socket.close();
        } catch {
          // 이미 닫혔으면 그대로
        }
      }
      resolve({ status, ms: Math.max(0, now() - started) });
    };
    const timer = setTimeout(() => finish('stalled'), options.timeoutMs);
    try {
      socket = create(url, options.protocols === undefined ? undefined : [...options.protocols]);
    } catch {
      finish('error');
      return;
    }
    socket.onopen = () => finish('ok');
    socket.onerror = () => finish('error');
    socket.onclose = () => finish('error');
  });
}

/** WebSocket 살핌 결과를 한 문장으로 */
export function describeWebSocketProbe(outcome: WebSocketProbeOutcome): string {
  const seconds = (outcome.ms / 1000).toFixed(1);
  switch (outcome.status) {
    case 'ok':
      return `연결됐어요(${seconds}초). 연결만 해 보고 곧바로 닫았어요 — 메시지는 보내지 않았어요.`;
    case 'stalled':
      return `${Math.round(outcome.ms / 1000)}초 동안 답이 없었어요(막힘으로 봐요).`;
    default:
      return '연결하지 못했어요(학교망이 막았거나, 서버가 쉬는 중이거나, 주소를 찾지 못했어요. 브라우저는 자세한 까닭을 알려 주지 않아요).';
  }
}

/** 살핌 결과 → 점검 표시 */
export function statusOf(status: ProbeStatus): NetworkStatus {
  if (status === 'ok') {
    return 'ok';
  }
  if (status === 'http') {
    // 파일이 없는 것(404)은 네트워크 문제가 아니라 사이트 문제라 "확인 필요"로 본다.
    return 'unknown';
  }
  return 'blocked';
}

export interface NetworkReportLine {
  readonly id: string;
  readonly label: string;
  readonly status: NetworkStatus;
  readonly text: string;
}

const STATUS_TEXT: Readonly<Record<NetworkStatus, string>> = Object.freeze({
  pending: '시험 안 함',
  ok: '연결됨',
  blocked: '막힘',
  unknown: '확인 필요',
});

/**
 * 복사할 결과 글. 개인정보는 넣지 않는다(사이트 주소·항목·판정·걸린 시간만).
 * 줄 모양은 점검 페이지의 [결과 복사]와 비슷하게 맞춘다.
 */
export function formatNetworkReport(lines: readonly NetworkReportLine[], context: { origin: string; when: Date }): string {
  const stamp = context.when.toISOString().slice(0, 16).replace('T', ' ');
  const head = [`[네트워크 점검] ${stamp} (UTC)`, `사이트: ${context.origin}`, ''];
  const body = lines.map((line) => `- ${line.label}: ${STATUS_TEXT[line.status]} — ${line.text}`);
  return [...head, ...body, ''].join('\n');
}
