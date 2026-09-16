/**
 * 네트워크 점검 항목(PLAN §5.5 "점검 항목", §8.2 P2-05). 순수 데이터·함수라 단위 테스트가 그대로 읽는다
 * (tests/unit/loading/network-check.test.ts). 화면은 NetworkCheck.astro.
 *
 * 규칙
 * - [시험하기]를 눌렀을 때만 접속한다. 여기 적은 주소 말고 다른 곳에는 접속하지 않는다.
 * - 학생 영상·음성·개인정보는 어디에도 보내지 않는다(GET 한 번으로 파일이 받아지는지만 본다).
 * - 통신 실습(MQTT 브로커)은 Phase 4에서 만들므로 지금은 접속하지 않고 자리만 보여 준다(skip).
 */
import type { ProbeStatus } from '../../../lab/loader/probe.ts';
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
}

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
  {
    id: 'mqtt-broker',
    label: '통신 실습 중계 서버(MQTT)',
    why: '다른 컴퓨터와 메시지를 주고받는 통신 실습에서 써요.',
    display: '(통신 실습실을 만들 때 시험 항목을 더해요)',
    advice: '통신 실습실(Phase 4)에서 안내해요.',
    skip: '통신 실습실을 만들 때 이 항목을 실제 시험으로 바꿔요. 지금은 접속하지 않아요.',
  },
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
