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
    return 'DATA,120,80처럼 값이 여러 개면 몇 번째 값을 쓸지 정해요(0부터).';
  },
  /** 두 탭 실습 안내 */
  twoTabs(): string {
    return '다른 탭에서 ESP32 실습실을 열고 접두어를 맞추면, 그 탭의 가상 보드 값이 여기에 그려져요.';
  },
} as const;
