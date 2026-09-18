/**
 * 대시보드(P4-07, 시나리오 D)가 쓰는 값 모양 한 곳. **DOM·MQTT를 모른다**(순수 타입만) — 단위 테스트가 이 모양으로 규칙을 지킨다.
 *
 * 대시보드는 "위젯 여러 개를 격자에 올려 둔 판"이다.
 * - 위젯 하나 = 설정(`WidgetSpec`: 종류·제목·토픽·눈금)과 자리(`WidgetRect`: 몇째 칸·몇째 줄·너비·높이)를 함께 가진다.
 * - 판 전체(`DashboardBoard`)는 이 브라우저(localStorage)에 저장한다 — 규칙은 `store.ts`.
 * - 값은 MQTT 통로(`src/lab/mqtt/`)에서 토픽별로 온다 — 잇는 자리는 `source.ts`.
 */

/** 위젯 종류 네 가지(SPEC §6.3: 게이지, 실시간 그래프, 스위치, 텍스트 로그) */
export type WidgetKind = 'gauge' | 'chart' | 'switch' | 'log';

/** 격자 위 자리(칸 단위). x·y는 0부터, w·h는 1 이상 */
export interface WidgetRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** 격자에 놓인 것 하나(자리 계산은 id와 자리만 있으면 된다) */
export interface PlacedItem extends WidgetRect {
  readonly id: string;
}

/** 위젯 하나의 설정 */
export interface WidgetSpec {
  /** 판 안에서 하나뿐인 이름(영문 소문자·숫자·붙임표) */
  readonly id: string;
  readonly kind: WidgetKind;
  /** 학생이 바꿀 수 있는 이름(화면 제목) */
  readonly title: string;
  /**
   * 토픽. 접두어는 적지 않는다 — 통로가 붙인다(`src/lab/mqtt/topics.ts`).
   * 게이지·그래프·로그는 **받을** 토픽(와일드카드 `+`·`#`도 된다), 스위치는 **보낼** 토픽이다.
   */
  readonly topic: string;
  /** 게이지·그래프 눈금 */
  readonly min: number;
  readonly max: number;
  /** 값 뒤에 붙일 단위 글자(빈 값이면 안 붙임) */
  readonly unit: string;
  /** `DATA,120,80`처럼 쉼표로 나뉜 값 중 몇 번째를 쓸지(0부터. 머리말은 세지 않는다) */
  readonly field: number;
  /** 스위치가 켤 때 보낼 말 */
  readonly onText: string;
  /** 스위치가 끌 때 보낼 말 */
  readonly offText: string;
}

/** 판에 올라간 위젯 하나(설정 + 자리) */
export type DashboardWidget = WidgetSpec & WidgetRect;

/** 판 전체(저장 단위) */
export interface DashboardBoard {
  /** 저장 모양 판 번호. 모양이 바뀌면 올리고, 모르는 번호는 기본 판으로 되돌린다. */
  readonly version: number;
  readonly widgets: readonly DashboardWidget[];
}

/** 위젯 종류마다 정해 둔 것(이름·기본 크기·가장 작은 크기·기본 설정) */
export interface WidgetKindInfo {
  readonly kind: WidgetKind;
  /** 화면에 보이는 종류 이름 */
  readonly label: string;
  /** 한 줄 설명([위젯 추가] 목록에 보인다) */
  readonly description: string;
  readonly defaultW: number;
  readonly defaultH: number;
  readonly minW: number;
  readonly minH: number;
  /** 새로 만들 때의 기본 설정(id·자리는 빼고) */
  readonly defaults: Omit<WidgetSpec, 'id' | 'kind'>;
}

/** 대시보드가 값을 주고받는 통로(MQTT 연결을 감싼 것 — 단위 테스트는 가짜를 넣는다) */
export interface DashboardSource {
  /** 지금 통신 접두어(화면에 보여 주는 값) */
  readonly prefix: string;
  /** 연결 상태 */
  readonly state: 'idle' | 'connecting' | 'open' | 'closed';
  /** 이 접두어 아래 모든 토픽을 받기로 한다(연결돼 있어야 한다) */
  listen(): Promise<void>;
  /** 토픽에 한 줄 보낸다(스위치) */
  send(topic: string, text: string): Promise<void>;
  /** 메시지가 오면 부른다. 돌려주는 함수를 부르면 그만 듣는다. */
  onMessage(listener: (message: SourceMessage) => void): () => void;
}

/** 통로에서 온 메시지 한 개(학생이 쓴 모양의 토픽 + 글) */
export interface SourceMessage {
  /** 접두어를 뗀 토픽(예: esp32-01/tx) */
  readonly topic: string;
  /** UTF-8로 읽은 글(끝의 줄바꿈은 떼어 둔다) */
  readonly text: string;
  /** 받은 시각(ms) */
  readonly at: number;
}
