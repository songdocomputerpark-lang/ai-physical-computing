/**
 * 대시보드가 학생에게 보여 주는 **한국어 문장 한 곳**(P4-07). 화면 파일에 문장을 직접 적지 않는다
 * (MQTT 통로의 `src/lab/mqtt/messages.ts`, 브릿지의 `src/lab/bridge/messages.ts`와 같은 규칙).
 *
 * 문장 규칙(SPEC §2 초보자 우선)
 * - 고1이 처음 읽어도 아는 낱말. "구독·발행"은 "받기로 하기·보내기"로 푼다.
 * - 무엇을 하면 되는지 한 문장을 붙인다.
 * - 낱말 나열은 가운뎃점이 아니라 쉼표(사이트 검색이 한 낱말로 묶지 않게 — `src/config/nav.ts` 머리말).
 */

export const dashText = {
  /** 키보드로 옮기기·크기 바꾸기 안내(위젯 손잡이의 설명) */
  keyboardHelp(): string {
    return '방향키로 옮기고, Shift와 방향키로 크기를 바꿔요. 끌어서 옮겨도 돼요.';
  },
  /** 옮긴 뒤 낭독기에 알리는 글 */
  moved(title: string, x: number, y: number): string {
    return `${title} 위젯을 ${x + 1}번째 칸, ${y + 1}번째 줄로 옮겼어요.`;
  },
  /** 크기를 바꾼 뒤 낭독기에 알리는 글 */
  resized(title: string, w: number, h: number): string {
    return `${title} 위젯 크기를 가로 ${w}칸, 세로 ${h}칸으로 바꿨어요.`;
  },
  /** 더 옮길 수 없을 때 */
  edge(): string {
    return '더 옮길 수 없어요. 판의 끝이에요.';
  },
  /** 위젯을 더했을 때 */
  added(label: string): string {
    return `${label} 위젯을 더했어요. 설정을 눌러 토픽을 정해요.`;
  },
  /** 위젯을 지웠을 때 */
  removed(title: string): string {
    return `${title} 위젯을 지웠어요.`;
  },
  /** 배치를 기본으로 되돌렸을 때 */
  reset(): string {
    return '위젯 배치를 처음 모습으로 되돌렸어요.';
  },
  /** 아직 값이 오지 않은 위젯 */
  waiting(): string {
    return '아직 값이 오지 않았어요.';
  },
  /** 값이 숫자가 아닐 때(게이지·그래프) */
  notNumber(text: string): string {
    return `숫자가 아니라 그래프에 그릴 수 없어요: ${text}`;
  },
  /** 연결하지 않았는데 스위치를 눌렀을 때 */
  needConnect(): string {
    return '먼저 위쪽 [연결]을 눌러요. 연결해야 보드에 보낼 수 있어요.';
  },
  /**
   * 스위치가 보낸 뒤. 보낸 말이 `on`처럼 영어라 조사를 붙이면 "on을(를)"이 되므로(`src/lib/korean.ts`),
   * MQTT 기록과 같은 화살표 모양으로 적는다.
   */
  switchSent(topic: string, text: string): string {
    return `보냈어요 — ${topic} ← ${text}`;
  },
  /** 저장 공간을 못 써서 배치를 기억하지 못할 때(사생활 보호 모드 등) */
  storageBlocked(): string {
    return '이 브라우저가 저장을 막고 있어서 위젯 배치를 기억하지 못해요. 새로 고치면 처음 모습으로 돌아와요.';
  },
  /** 토픽 칸 도움말 */
  topicHint(): string {
    return '토픽은 esp32-01/tx처럼 짧게 적어요. 우리 반 접두어는 사이트가 앞에 붙여요.';
  },
  /** 값이 여러 개일 때(DATA,120,80) 쓰는 칸 설명 */
  fieldHint(): string {
    return 'DATA,120,80처럼 값이 여러 개면 쓸 값의 번호를 적어요. 첫 값이 0번이고, 머리말(DATA)은 세지 않아요.';
  },
  /** 두 탭 실습 안내 */
  twoTabs(): string {
    return '다른 탭에서 ESP32 실습실을 열고 접두어를 맞추면, 그 탭의 가상 보드 값이 여기에 그려져요.';
  },
  /** 같은 컴퓨터 탭으로 연결했을 때(2026-09-25 Phase 4 검토 반영 — 어느 통로로 이어졌는지 사실대로) */
  connectedTab(): string {
    return '연결했어요(같은 컴퓨터 탭). 이 컴퓨터의 다른 탭이나 아래 가상 보드에서 같은 접두어로 보내면 위젯에 값이 들어와요.';
  },
  /** 공개 중계 서버로 연결했을 때 */
  connectedBroker(): string {
    return '공개 중계 서버에 연결했어요. 같은 접두어를 쓰는 다른 컴퓨터·보드의 값도 들어와요 — 누구나 볼 수 있으니 개인정보는 보내지 않아요.';
  },
  /** [이 자리에서 가상 보드 열기]가 탭 통로 [연결]까지 해 줬을 때(인터넷이 필요 없어 저절로 잇는다) */
  autoConnected(): string {
    return '가상 보드를 열면서 [연결]도 해 두었어요(같은 컴퓨터 탭). 아래 가상 보드에서 [실행]을 누르면 값이 들어와요.';
  },
  /** 가상 보드는 열었는데 대시보드는 아직 연결 전(공개 중계 서버를 고른 경우 — 저절로 잇지 않는다) */
  labNeedsConnect(): string {
    return '위 1단계의 [연결]을 눌러야 보드가 보낸 값이 그래프에 들어와요.';
  },
  /** 스위치를 눌렀지만 보내지 못해 모양을 그대로 둘 때 */
  switchNotSent(reason: string): string {
    return `보내지 못해서 스위치를 그대로 뒀어요. ${reason}`;
  },
  /** 이 자리에 연 가상 보드의 LED가 스위치를 따라 바뀌었을 때(보드 그림이 화면 밖이어도 스위치 옆에서 알 수 있게) */
  frameLed(on: boolean): string {
    return `아래 가상 보드가 받았어요 — LED ${on ? '켜짐' : '꺼짐'}`;
  },
  /** 몇 초가 지나도 아래 가상 보드의 LED가 바뀌지 않을 때 */
  frameLedMissed(): string {
    return '아래 가상 보드의 LED가 바뀌지 않았어요. 가상 보드에서 [실행]을 눌렀는지 봐요.';
  },
  /** 접두어 [복사] */
  prefixCopied(prefix: string): string {
    return `통신 접두어 ${prefix}를 복사했어요. 같이 실습하는 화면의 [친구 접두어]에 붙여 넣어요.`;
  },
  /** 복사가 막혔을 때 */
  copyBlocked(prefix: string): string {
    return `이 브라우저는 복사를 막았어요. 접두어 ${prefix}를 직접 적어요.`;
  },
} as const;
