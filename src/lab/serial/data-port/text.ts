/**
 * 데이터 포트(P4-05) 화면이 학생에게 보여 주는 **한국어 문장을 한 곳에** 모은다.
 * 브릿지 쪽 문장은 `src/lab/bridge/messages.ts`(bridgeText)에 있고 이 파일은 데이터 포트 화면·통로의 문장만 둔다
 * (브릿지 핵심은 공유 파일이라 구역이 고치지 않는다 — 통합 때 `bridgeText.serialChannelNotice()`로 옮기자고 요청해 두었다:
 *  `.cache/phase4-requests/serialport.md`).
 *
 * 문장 규칙(SPEC §2 초보자 우선): 고1이 처음 읽어 아는 낱말, 무엇을 하면 되는지 한 문장. 안쪽 용어(스트림·버퍼) 금지.
 */
import { withParticle } from '../../../lib/korean.ts';
import { baudLabel } from './baud-rates.ts';
import type { DataPortState } from './data-port.ts';

export const dataPortText = {
  /** 통로 목록·패널에 늘 보이는 안내(공개 브로커 경고와 같은 자리) */
  channelNotice(): string {
    return 'USB-UART 변환기를 꽂은 포트로 글자를 보내요. 컴퓨터와 보드의 통신 속도가 같아야 글자가 깨지지 않아요.';
  },
  /** 통로 이름(화면·오류 문장에 들어간다) */
  channelLabel(): string {
    return 'USB 데이터 포트';
  },
  /** 상태 한 줄 */
  state(state: DataPortState, labelText: string, baudRate: number): string {
    switch (state) {
      case 'unsupported':
        return '이 브라우저는 USB 포트를 열 수 없어요.';
      case 'idle':
        return '아직 연결하지 않았어요. [데이터 포트 연결]을 누르고 USB-UART 변환기를 골라요.';
      case 'choosing':
        return '포트를 고르는 중이에요. 창에서 변환기를 골라요.';
      case 'opening':
        return '포트를 여는 중이에요.';
      case 'open':
        // 이름표는 학생이 적는 글("자리 3", "변환기")이라 조사를 골라 붙인다(src/lib/korean.ts)
        return `${withParticle(labelText, '이/가')} ${baudLabel(baudRate)}로 열려 있어요.`;
      case 'closing':
        return '포트를 닫는 중이에요.';
      case 'error':
        return '데이터 포트에 문제가 있어요.';
    }
  },
  /** 보드 REPL 포트를 고른 것 같을 때 */
  boardReplSuspect(): string {
    return '이 포트에서 MicroPython 시작 글이 보여요. 코드를 보내는 보드 포트를 고른 것 같아요 — [연결 끊기] 뒤에 변환기 포트를 골라요.';
  },
  /** 콘솔에 남기는 받은 줄 */
  receivedLine(text: string): string {
    return `데이터 포트에서 받음: ${text}`;
  },
  /** 콘솔에 남기는 보낸 줄 */
  sentLine(text: string): string {
    return `데이터 포트로 보냄: ${text}`;
  },
  /** 시험 보내기 칸 안내 */
  testSendHint(): string {
    return '보드 예제(3-1-2)는 a를 받으면 레이저를 켜고 b를 받으면 꺼요. 글자를 적고 [보내기]를 눌러 확인해요.';
  },
  /** 이름표 칸 안내(개인정보) */
  labelHint(): string {
    return '이름·학번 대신 자리 번호나 "변환기"처럼 짧게 적어요. 이 컴퓨터의 브라우저에만 저장돼요.';
  },
  /** 이름표 저장의 한계 */
  labelLimit(): string {
    return '브라우저는 포트에 고유 번호를 주지 않아서, 같은 칩이 두 개면 이름표가 서로 바뀔 수 있어요.';
  },
} as const;
