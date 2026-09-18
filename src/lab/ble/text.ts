/**
 * 실제 블루투스(Web Bluetooth) 칸이 학생에게 보여 주는 **한국어 문장 한 곳**(P4-04).
 *
 * 왜 여기에 두나: 브릿지 규약 9.7은 "한국어 문장은 `src/lab/bridge/messages.ts` 한 곳"이라고 적지만 그 파일은 이번 구역이
 * 고칠 수 없는 공유 파일이다(README 5.2). 그래서 **통로 공통 오류**(닫힘·상대 없음·길이 넘침)는 `bridgeText`를 그대로 쓰고,
 * 블루투스 칸에만 있는 문장(선택 창·교실 이름 규칙·지원하지 않는 환경)만 여기에 둔다 — USB 데이터 포트 구역(P4-05)의
 * `src/lab/serial/data-port/text.ts`와 같은 방식이다. 통로 이름·안내를 `bridgeText`로 옮기는 것은 요청에 적었다.
 *
 * 문장 규칙(SPEC §2 초보자 우선): 고1이 처음 읽어도 아는 낱말 + "무엇을 하면 되는지" 한 문장.
 * 개인정보(PLAN §10·§7.3): 기기 주소는 화면·기록 어디에도 쓰지 않는다 — 브라우저가 알려 주지도 않는다.
 */
import { withParticle } from '../../lib/korean.ts';
import { BLE_VALUE_BYTES, DEFAULT_NAME_PREFIX } from './uuids.ts';

/** 연결 단계 */
export type BleConnectionState = 'unsupported' | 'idle' | 'choosing' | 'connecting' | 'open' | 'error';

export const bleText = {
  /** 통로 목록에 보일 이름 */
  channelLabel(): string {
    return '블루투스(실제 보드)';
  },
  /** 통로를 고를 때 늘 보이는 안내 */
  channelNotice(): string {
    return (
      '실제 ESP32 보드와 블루투스로 이어요. 먼저 아래 블루투스 칸에서 [블루투스 보드 연결]로 내 보드를 고르고, ' +
      `한 번에 ${BLE_VALUE_BYTES}바이트까지 보내요. 보드가 없으면 가상 보드로 똑같이 실습할 수 있어요.`
    );
  },
  /** 칸 맨 위 한 줄 소개 */
  intro(): string {
    return '이 칸은 실제 ESP32 보드와 블루투스로 잇는 곳이에요. 가상 보드 실습에는 필요 없어요.';
  },
  /** 상태 한 문장 */
  state(state: BleConnectionState, deviceName: string): string {
    const name = deviceName === '' ? '보드' : deviceName;
    switch (state) {
      case 'unsupported':
        return '이 브라우저에서는 블루투스로 기기를 연결할 수 없어요.';
      case 'idle':
        return '아직 연결하지 않았어요. [블루투스 보드 연결]을 눌러 내 보드를 골라요.';
      case 'choosing':
        return '기기 선택 창에서 내 보드를 고르고 [페어링]을 눌러요.';
      case 'connecting':
        return `${withParticle(name, '과/와')} 연결하는 중이에요.`;
      case 'open':
        return `${withParticle(name, '과/와')} 이어졌어요. 이제 보낸 값이 보드로 가요.`;
      case 'error':
        return '연결하지 못했어요. 아래 안내를 보고 다시 해 보세요.';
      default:
        return '';
    }
  },
  /** 주고받은 양 */
  counts(sent: number, received: number, queued: number): string {
    const waiting = queued === 0 ? '' : ` · 보낼 차례 ${queued}개`;
    return `보낸 ${sent}바이트 · 받은 ${received}바이트${waiting}`;
  },
  /** 기기 이름 줄(주소는 적지 않는다) */
  deviceLine(deviceName: string): string {
    const name = deviceName === '' ? '(이름 없는 기기)' : deviceName;
    return `고른 기기: ${name} — 브라우저는 기기 주소를 알려 주지 않아요. 이름으로 골라요.`;
  },
  /** 교실 이름 규칙(PLAN §7.3 "교실 블루투스 이름 규칙") */
  classroomRule(): string {
    return (
      `교실에 보드가 여럿이면 모두 "${DEFAULT_NAME_PREFIX}"로 보여서 내 보드를 고를 수 없어요. ` +
      `보드 코드에서 ESP32BLE.init("${DEFAULT_NAME_PREFIX}-07")처럼 자리 번호를 붙여요.`
    );
  },
  /** 교실 이름 규칙 — 개인정보 주의 */
  classroomPrivacy(): string {
    return '광고 이름은 주변 사람 누구에게나 보여요. 이름·학번·전화번호를 넣지 말고 자리 번호나 보드 번호만 써요.';
  },
  /** 이름 앞부분 칸 도움말 */
  prefixHint(): string {
    return `이름 앞부분만 적으면 그 글자로 시작하는 보드만 선택 창에 보여요(기본 ${DEFAULT_NAME_PREFIX}). 비우면 가까운 기기가 모두 보여요.`;
  },
  /** 선택 창을 열기 직전 안내 */
  chooserHint(): string {
    return '브라우저가 기기 선택 창을 열어요. 목록에서 내 보드 이름을 고르고 [페어링]을 눌러요.';
  },
  /** 보내기 칸 도움말 */
  sendHint(): string {
    return `보드의 ESP32BLE.read()가 받는 값이에요. 한 번에 ${BLE_VALUE_BYTES}바이트까지 들어가고, 넘으면 실물에서도 뒷부분이 잘려요.`;
  },
  /** 콘솔에 적는 받은 줄 */
  receivedLine(text: string): string {
    return `[블루투스] 보드가 보낸 값: ${text}`;
  },
  /** 콘솔에 적는 보낸 줄 */
  sentLine(text: string): string {
    return `[블루투스] 보드로 보냄: ${text}`;
  },
  /** 보내는 차례가 가득 참 */
  queueFull(limit: number): string {
    return `보낼 것이 ${limit}개까지 밀려서 이번 값은 보내지 못했어요. 보내는 횟수를 줄여 보세요(블루투스는 한 번에 하나씩 보내요).`;
  },
  /** 연결이 끊겨 남은 것을 버림 */
  queueDropped(count: number): string {
    return `연결이 끊겨서 아직 못 보낸 ${count}개를 버렸어요.`;
  },
  /** 알림 켜기 실패(보내기는 되지만 받기가 안 될 때) */
  notifyFailed(): string {
    return '보드가 보내는 값(알림)을 켜지 못했어요. 보내기는 되지만 보드가 보낸 값은 안 보일 수 있어요.';
  },
  /** 지원하지 않는 환경 — 무엇을 하면 되는지 */
  fallbackToVirtual(labId: string): string {
    return labId === 'esp32'
      ? '대신 아래 가상 보드의 블루투스 칸에서 똑같이 값을 보내며 실습할 수 있어요. 코드는 실제 보드와 같아요.'
      : '대신 [보내기] 패널에서 "같은 컴퓨터 탭" 통로를 고르고 ESP32 실습실을 다른 탭에 열면 똑같이 실습할 수 있어요. 코드는 실제 보드와 같아요.';
  },
  /** 가상 블루투스 칸으로 옮겨 갈 때 */
  movedToVirtual(): string {
    return '가상 보드의 블루투스 칸으로 옮겼어요. [연결]을 누른 뒤 값을 보내 보세요.';
  },
  /** 가상 블루투스 칸이 없을 때 */
  noVirtualPanel(): string {
    return '이 예제의 배선에는 블루투스가 없어요. 예제를 고르거나 코드 맨 위에 "# @part ble 12"를 적으면 가상 블루투스 칸이 생겨요.';
  },
} as const;

/** 문제 종류(코드로 가르고 문장은 아래 표에서) */
export type BleProblemCode =
  /** 이 브라우저에 Web Bluetooth가 없음 */
  | 'unsupported'
  /** 보안 연결(https)이 아니거나 권한 정책으로 막힘 */
  | 'insecure'
  /** 선택 창을 닫았거나 고른 기기가 없음 */
  | 'no-device'
  /** 컴퓨터의 블루투스가 꺼져 있거나 어댑터가 없음 */
  | 'adapter-off'
  /** 연결이 되지 않음(전원·거리·다른 프로그램이 이미 연결) */
  | 'connect-failed'
  /** 고른 기기에 Nordic UART 서비스가 없음 */
  | 'no-service'
  /** 연결 중에 끊김 */
  | 'disconnected'
  /** 보내기 실패 */
  | 'write-failed'
  /** 그 밖 */
  | 'unknown';

export interface BleProblem {
  readonly code: BleProblemCode;
  /** 무슨 일이 일어났나 */
  readonly text: string;
  /** 무엇을 하면 되나 */
  readonly advice: string;
}

/** 문제 하나를 만든다 */
export function bleProblem(code: BleProblemCode, text: string, advice: string): BleProblem {
  return Object.freeze({ code, text, advice });
}
