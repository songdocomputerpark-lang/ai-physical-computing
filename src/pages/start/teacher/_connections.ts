/**
 * 교사용 시작하기(/start/teacher/#privacy)의 "외부로 연결되는 곳과 보내지는 것" 표 데이터. 페이지(index.astro)가 그대로 그린다.
 * 파일 이름이 _로 시작해 주소(쪽)가 되지 않는다(src/pages/contribute/_issue-templates.ts와 같은 규칙).
 *
 * 공개 중계 서버(MQTT) 줄은 손으로 적지 않고 실습실이 고를 수 있는 서버 목록(src/lab/mqtt/brokers.ts의 MQTT_BROKERS)에서 만든다.
 * 판 1.1.0에서 HiveMQ를 목록에 더할 때 이 표만 빠져, 학생 IP·메시지가 갈 수 있는 곳을 교사가 모두 알 수 없었다
 * (2026-09-30 최종 점검 PM-01). 서버를 더하면 아래 BROKER_PRIVACY에 운영하는 곳과 처리방침 한 줄을 함께 더한다 —
 * 빠뜨리면 단위 테스트(tests/unit/start/teacher-connections.test.ts)가 실패하고, 그래도 표에는 서버 이름이 들어간다.
 *
 * 사실과 링크 확인: GitHub·jsDelivr·test.mosquitto.org·음성 인식은 2026-09-16(index.astro 머리말),
 * HiveMQ 개인정보처리방침은 2026-09-30(https://www.hivemq.com/legal/privacy-policy/ — 제목 "Privacy Policy | HiveMQ",
 * 2026-01-30 고침)에 공식 쪽으로 확인했다. 이 표는 초안이고 법률 자문이 아니다.
 */
import { DEFAULT_BROKER_ID, MQTT_BROKERS, type MqttBrokerOption } from '../../../lab/mqtt/brokers.ts';

export interface ConnectionLink {
  readonly label: string;
  readonly url: string;
}

export interface Connection {
  readonly where: string;
  readonly when: string;
  readonly what: string;
  readonly who: string;
  readonly links: readonly ConnectionLink[];
}

export interface BrokerPrivacy {
  /** "처리하는 곳" 칸에 적는 이름 */
  readonly operator: string;
  /** 처리방침(없으면 이용 안내) */
  readonly link: ConnectionLink;
}

/** 공개 중계 서버 id(MQTT_BROKERS의 id) → 운영하는 곳과 처리방침 */
export const BROKER_PRIVACY: Readonly<Record<string, BrokerPrivacy>> = Object.freeze({
  emqx: {
    operator: 'EMQX',
    link: { label: 'EMQ 개인정보처리방침(영어)', url: 'https://www.emqx.com/en/policy/privacy-policy' },
  },
  mosquitto: {
    operator: 'test.mosquitto.org',
    link: { label: 'test.mosquitto.org 이용 안내(영어)', url: 'https://test.mosquitto.org/' },
  },
  hivemq: {
    operator: 'HiveMQ',
    link: { label: 'HiveMQ 개인정보처리방침(영어)', url: 'https://www.hivemq.com/legal/privacy-policy/' },
  },
});

/** 실습실에서 주소를 몰라도 고를 수 있는 공개 중계 서버([주소 직접 입력] 칸은 빼고) — 기본 서버가 맨 앞 */
export function listedBrokers(brokers: readonly MqttBrokerOption[] = MQTT_BROKERS): MqttBrokerOption[] {
  const listed = brokers.filter((broker) => broker.url !== '');
  return [...listed.filter((broker) => broker.id === DEFAULT_BROKER_ID), ...listed.filter((broker) => broker.id !== DEFAULT_BROKER_ID)];
}

/** 공개 중계 서버 줄 — 목록의 서버마다 운영하는 곳과 처리방침을 넣는다 */
export function brokerConnection(brokers: readonly MqttBrokerOption[] = MQTT_BROKERS): Connection {
  const listed = listedBrokers(brokers);
  // 처리방침을 아직 적지 않은 서버도 이름은 빠지지 않게(서버 목록의 이름을 그대로 쓴다)
  const operators = listed.map((broker) => BROKER_PRIVACY[broker.id]?.operator ?? broker.label);
  const [defaultOperator, ...others] = operators;
  const choices = [defaultOperator ? `기본: ${defaultOperator}` : '', others.length > 0 ? `다른 선택지: ${others.join('·')}` : '']
    .filter(Boolean)
    .join(', ');
  return {
    where: '공개 MQTT 브로커(인터넷으로 메시지를 주고받는 중계 서버, 선택 기능)',
    when: '통신 실습에서 통로를 "공개 중계 서버"로 고르고 [연결]을 누를 때, 또는 내 컴퓨터 점검의 [시험하기]를 누를 때만. 기본 통로(같은 컴퓨터 탭)는 이 서버에 접속하지 않아요',
    what: 'IP 주소와 보낸 메시지. 메시지는 같은 주제(토픽) 이름을 아는 누구나 보고 보낼 수도 있어요. 점검 페이지는 연결만 해 보고 메시지를 보내지 않아요.',
    who: `중계 서버(브로커)를 운영하는 회사나 단체(${choices} — [주소 직접 입력]으로 넣은 서버는 그 서버를 운영하는 곳)`,
    links: listed.flatMap((broker) => {
      const privacy = BROKER_PRIVACY[broker.id];
      return privacy ? [privacy.link] : [];
    }),
  };
}

export const connections: readonly Connection[] = [
  {
    where: 'GitHub Pages(사이트 파일을 보내 주는 곳)',
    when: '사이트를 열 때마다',
    what: '접속한 컴퓨터의 IP 주소(인터넷 주소). GitHub는 보안을 위해 방문자의 IP 주소를 기록하고 보관한다고 안내해요.',
    who: 'GitHub',
    links: [
      { label: 'GitHub Pages 안내(데이터 수집)', url: 'https://docs.github.com/ko/pages/getting-started-with-github-pages/what-is-github-pages' },
      { label: 'GitHub 일반 개인정보처리방침', url: 'https://docs.github.com/ko/site-policy/privacy-policies/github-general-privacy-statement' },
    ],
  },
  {
    where: 'jsDelivr(파이썬 실행 파일을 보내 주는 콘텐츠 전송망)',
    when: '실습실에서 파이썬을 처음 준비할 때(받은 파일은 이 컴퓨터에 저장해 두고 다시 써요), 또는 내 컴퓨터 점검의 [시험하기]를 누를 때',
    what: 'IP 주소, 브라우저 종류와 버전, 요청한 사이트의 도메인',
    who: 'jsDelivr와 트래픽을 전달하는 전송망 업체',
    links: [{ label: 'jsDelivr 개인정보처리방침(영어)', url: 'https://github.com/jsdelivr/jsdelivr/blob/master/Privacy%20Policy.md' }],
  },
  brokerConnection(),
  {
    where: '브라우저의 서버 음성 인식(선택 차시)',
    when: '선택 차시 "말을 글로 바꾸는 기술"에서, 선생님이 설정을 켠 브라우저로 학생이 고를 때만(기본은 꺼짐)',
    what: '마이크로 말한 음성. Chrome 같은 일부 브라우저는 음성을 서버로 보내 글자로 바꿔요.',
    who: '브라우저 회사(예: Chrome은 Google)',
    links: [
      { label: 'Google 개인정보처리방침', url: 'https://policies.google.com/privacy?hl=ko' },
      { label: 'MDN 음성 인식 설명(영어)', url: 'https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition' },
    ],
  },
];
