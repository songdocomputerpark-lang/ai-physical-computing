/**
 * 보드 준비 페이지 [보드 연결](연결 확인)에 보일 한국어 글 — 순수 함수라 DOM 없이 검사한다(tests/unit/firmware/start-board-connect-view.test.ts).
 * 글은 "무엇이 됐는지 → 다음에 무엇을 누를지" 순서로, 고1이 처음 읽어도 알게 쓴다(CLAUDE.md 작업 규칙).
 *
 * 링크는 주소 대신 가리킬 곳(target)만 정한다 — 화면(connect-check.ts)이 페이지 안 #위치나 사이트 주소로 바꾼다.
 *   port-help     "연결이 안 될 때" 안내(#port-not-found — 케이블·장치 관리자·드라이버·Linux)
 *   firmware      3단계 펌웨어 굽기(#firmware)
 *   first-example 4단계 첫 예제(#first-example)
 *   check-page    브라우저·네트워크 점검 페이지(/start/check/)
 * 주의: tests/e2e/start.spec.ts가 getByText로 누르는 글("포트 선택 창에 보드가 안 보여요")과 같은 글을 쓰지 않는다(한 페이지에 하나뿐이어야 함).
 */
import { SITE_FIRMWARE_VERSION } from '../../../lab/serial/banner.ts';
import type { PortDescription } from '../../../lab/serial/usb-chips.ts';
import type { BoardCheckResult, BoardCheckStep } from './board-check.ts';

export type ConnectTone = 'neutral' | 'progress' | 'success' | 'warning' | 'danger';

export type ConnectLinkTarget = 'port-help' | 'firmware' | 'first-example' | 'check-page';

/** 브라우저 지원(구역 E의 src/lab/serial/support.ts detectSerialSupport와 같은 모양) */
export interface ConnectSupport {
  readonly level: 'supported' | 'unsupported' | 'unknown';
  readonly recommended: boolean;
  readonly browserName: string;
  readonly firefox: boolean;
  readonly mobile: boolean;
  readonly summary: string;
  readonly advice: string;
}

/** 확인 밖에서 끝난 경우(포트 선택 창·페이지 사정) */
export type ConnectOutcome =
  | BoardCheckResult
  /** 포트 선택 창을 닫음(NotFoundError) */
  | { readonly kind: 'not-selected' }
  /** 포트 선택 창을 열 수 없음(SecurityError) */
  | { readonly kind: 'security'; readonly detail: string }
  /** 그 밖에 선택 창이 실패함 */
  | { readonly kind: 'choose-failed'; readonly detail: string }
  /** 같은 페이지에서 펌웨어를 굽는 중 */
  | { readonly kind: 'flasher-busy' }
  /** Web Serial이 없음 */
  | { readonly kind: 'unsupported' }
  /** 뜻밖의 오류 */
  | { readonly kind: 'failed'; readonly detail: string };

export type ConnectOutcomeKind = ConnectOutcome['kind'];

export interface ConnectView {
  readonly tone: ConnectTone;
  readonly title: string;
  readonly detail: string;
  /** 이렇게 해요(순서 있는 목록) */
  readonly steps: readonly string[];
  readonly links: readonly { readonly target: ConnectLinkTarget; readonly label: string }[];
  /** 보드·포트 정보(이름, 값) */
  readonly info: readonly { readonly label: string; readonly value: string }[];
  readonly notes: readonly string[];
  /** "연결이 안 될 때" 안내를 펼쳐 둘지 */
  readonly openPortHelp: boolean;
  /** LED가 깜빡이지 않았을 때 볼 것(연결 확인이 끝났을 때만) */
  readonly ledHelp: readonly string[];
  /** [보드 연결]을 누를 수 없음(확인 중·지원 안 함) */
  readonly buttonDisabled: boolean;
}

export const CONNECT_LINK_LABELS: Readonly<Record<ConnectLinkTarget, string>> = Object.freeze({
  'port-help': '케이블·장치 관리자·드라이버 확인하기',
  firmware: '3단계 펌웨어 굽기로 가기',
  'first-example': '4단계 첫 예제 실행하러 가기',
  'check-page': '이 브라우저로 되는지 점검하기',
});

const link = (target: ConnectLinkTarget) => ({ target, label: CONNECT_LINK_LABELS[target] });

function base(tone: ConnectTone, title: string, detail: string): ConnectView {
  return { tone, title, detail, steps: [], links: [], info: [], notes: [], openPortHelp: false, ledHelp: [], buttonDisabled: false };
}

/** 지원·브라우저에 따라 덧붙이는 안내(ESP32 실습실 실제 보드 탭과 같은 뜻) */
export function supportNotes(support: ConnectSupport): string[] {
  if (support.firefox) {
    return ['Firefox는 처음 연결할 때 사이트 권한을 위한 부가 기능 설치를 물을 수 있어요. 허락해야 연결돼요.'];
  }
  if (support.level === 'unknown') {
    return ['휴대폰·태블릿은 기기와 보드에 따라 포트 선택 창에 보드가 나오지 않을 수 있어요. 컴퓨터용 Chrome·Edge를 권해요.'];
  }
  if (support.level === 'supported' && !support.recommended) {
    return [`이 사이트는 컴퓨터용 Chrome·Edge에서 보드 연결을 시험해요. ${support.browserName}에서 안 되면 Chrome이나 Edge로 열어요.`];
  }
  return [];
}

function portInfo(port: PortDescription | null): { label: string; value: string }[] {
  return port ? [{ label: '고른 포트(참고)', value: port.text }] : [];
}

function bluetoothNote(port: PortDescription | null): string[] {
  return port?.kind === 'bluetooth' ? ['고른 포트가 블루투스 직렬 포트예요. ESP32 보드는 USB 포트예요. [보드 연결]을 다시 눌러 다른 포트를 골라요.'] : [];
}

/** 연결하기 전(페이지를 열었을 때) */
export function describeConnectIdle(support: ConnectSupport): ConnectView {
  if (support.level === 'unsupported') {
    return describeConnectOutcome({ kind: 'unsupported' }, support);
  }
  return {
    ...base('neutral', '아직 연결하지 않았어요', '보드를 USB 케이블로 컴퓨터에 꽂고 [보드 연결]을 눌러요.'),
    notes: supportNotes(support),
  };
}

/** 확인하는 동안(포트 선택 창 → 열기 → 판별 → LED 시험 → 닫기) */
export function describeConnectStep(step: 'choosing' | BoardCheckStep, port: PortDescription | null, support: ConnectSupport): ConnectView {
  const progress = (title: string, detail: string): ConnectView => ({ ...base('progress', title, detail), buttonDisabled: true });
  switch (step) {
    case 'choosing':
      return {
        ...progress(
          '포트 선택 창에서 보드를 골라요',
          'Windows에서는 "USB-SERIAL CH340 (COM3)"처럼 USB와 COM 번호가 들어간 이름이 보드예요. 고른 뒤 [연결]을 눌러요. 목록에 보드가 없으면 창을 닫아요.',
        ),
        notes: supportNotes(support),
      };
    case 'opening':
      return { ...progress('포트를 여는 중이에요…', port ? `고른 포트: ${port.text}` : '고른 포트와 연결하고 있어요.'), info: portInfo(port) };
    case 'checking':
      return {
        ...progress(
          '보드에 MicroPython이 있는지 확인하는 중이에요…',
          '보드에서 돌던 프로그램을 잠깐 멈추고(Ctrl-C) 보드가 보내는 이름표(MicroPython 버전)를 받고 있어요. 대답이 없는 보드는 조금 더 걸려요.',
        ),
        info: portInfo(port),
      };
    case 'blinking':
      return {
        ...progress(
          'MicroPython이 있어요. 내장 LED를 깜빡이는 중이에요…',
          '보드의 초록색 내장 LED를 봐요. 세 번 깜빡여요. 시험 코드는 보드에 저장하지 않아요.',
        ),
        info: portInfo(port),
      };
    case 'closing':
      return progress('연결을 닫는 중이에요…', '확인이 끝나면 포트를 닫아요. 그래야 펌웨어 굽기와 ESP32 실습실이 이 보드를 열 수 있어요.');
  }
}

/** 확인이 끝났을 때 */
export function describeConnectOutcome(outcome: ConnectOutcome, support: ConnectSupport): ConnectView {
  switch (outcome.kind) {
    case 'unsupported':
      return {
        ...base('warning', '이 브라우저에서는 보드를 연결할 수 없어요', `${support.summary} ${support.advice}`.trim()),
        links: [link('check-page')],
        notes: ['보드가 없어도 ESP32 실습실의 가상 보드로 같은 코드를 실행할 수 있어요.'],
        buttonDisabled: true,
      };
    case 'not-selected':
      return {
        ...base(
          'neutral',
          '포트를 고르지 않았어요',
          '목록에 보드가 없었나요? 아래 "연결이 안 될 때" 안내를 펼쳐 두었어요. 케이블, 장치 관리자, 드라이버를 차례로 확인한 뒤 [보드 연결]을 다시 눌러요.',
        ),
        links: [link('port-help')],
        openPortHelp: true,
        notes: supportNotes(support),
      };
    case 'security':
      return {
        ...base(
          'danger',
          '포트 선택 창을 열 수 없어요',
          '브라우저가 보드 연결을 막았어요. 페이지를 새로 고친 뒤 [보드 연결]을 다시 눌러요. 그래도 같으면 학교 컴퓨터의 브라우저 관리 설정이 USB 시리얼 연결을 막았을 수 있어요. 전산 담당 선생님께 알려요.',
        ),
        links: [link('check-page')],
      };
    case 'choose-failed':
      return {
        ...base('danger', '포트 선택 창을 열지 못했어요', '페이지를 새로 고친 뒤 [보드 연결]을 다시 눌러요.'),
        notes: outcome.detail ? [`브라우저가 알린 내용: ${outcome.detail}`] : [],
      };
    case 'flasher-busy':
      return base('warning', '펌웨어를 굽는 중이에요', '굽기가 끝난 뒤 [보드 연결]을 눌러요. 보드 포트는 한 번에 한 곳에서만 열 수 있어요.');
    case 'failed':
      return {
        ...base('danger', '보드를 확인하다 문제가 생겼어요', '페이지를 새로 고친 뒤 [보드 연결]을 다시 눌러요.'),
        notes: outcome.detail ? [`자세한 내용: ${outcome.detail}`] : [],
      };
    case 'released':
      return {
        ...base('neutral', '펌웨어 굽기에 포트를 넘겨주고 확인을 멈췄어요', '굽기가 끝나면 [보드 연결]을 다시 눌러 확인해요.'),
        info: portInfo(outcome.port),
      };
    case 'port-in-use':
      return {
        ...base(
          'danger',
          '포트를 열지 못했어요',
          '다른 프로그램(Thonny, 아두이노 IDE, 시리얼 모니터)이나 이 사이트를 연 다른 탭(ESP32 실습실의 실제 보드 연결)이 보드를 쓰고 있을 수 있어요. 그 프로그램이나 탭을 닫거나 연결을 끊고 [보드 연결]을 다시 눌러요.',
        ),
        info: portInfo(outcome.port),
      };
    case 'open-failed':
      return {
        ...base('danger', '포트를 열지 못했어요', 'USB 케이블을 뽑았다가 다시 꽂고 [보드 연결]을 다시 눌러요.'),
        links: [link('port-help')],
        info: portInfo(outcome.port),
      };
    case 'lost':
      return {
        ...base(
          'danger',
          '보드 연결이 끊겼어요',
          'USB 케이블이 빠졌거나 흔들렸어요. 케이블을 다시 꽂고 [보드 연결]을 다시 눌러요. 자주 끊기면 다른 케이블이나 컴퓨터 본체의 다른 USB 단자로 바꿔요.',
        ),
        links: [link('port-help')],
        info: portInfo(outcome.port),
      };
    case 'protocol':
      return {
        ...base(
          'danger',
          '보드와 주고받는 약속이 어긋났어요',
          '보드의 EN(RST) 버튼을 한 번 누른 뒤 [보드 연결]을 다시 눌러요. 그래도 같으면 3단계에서 펌웨어를 다시 구워요.',
        ),
        links: [link('firmware')],
        info: portInfo(outcome.port),
      };
    case 'busy':
      return busyView(outcome.port);
    case 'no-micropython':
      return describeNoMicroPython(outcome);
    case 'ready':
      return describeReady(outcome);
  }
}

function busyView(port: PortDescription | null): ConnectView {
  return {
    ...base(
      'warning',
      '보드 프로그램이 멈추지 않아요',
      '보드에 저장된 프로그램(main.py 등)이 멈추라는 신호(Ctrl-C)를 받지 않아요. 예를 들어 try·except로 KeyboardInterrupt까지 잡는 반복문이 그래요.',
    ),
    steps: [
      '보드의 EN(RST) 버튼을 한 번 누르고 곧바로 [보드 연결]을 다시 눌러요.',
      'ESP32 실습실의 [실제 보드] 탭에서 [보드 다시 시작]을 눌러도 돼요.',
      '그래도 안 되면 3단계에서 "굽기 전에 보드를 모두 지우기"를 켜고 펌웨어를 다시 구워요. 보드 안 파일이 지워져요.',
    ],
    links: [link('firmware')],
    info: portInfo(port),
  };
}

function describeNoMicroPython(outcome: Extract<BoardCheckResult, { kind: 'no-micropython' }>): ConnectView {
  const common = { links: [link('firmware')], info: portInfo(outcome.port), notes: bluetoothNote(outcome.port) };
  const verdict = outcome.verdict;
  switch (verdict?.kind) {
    case 'no-firmware':
      return {
        ...base('warning', '보드에 MicroPython 펌웨어가 없어요', '보드가 켜질 때마다 "펌웨어를 찾지 못했다"는 부팅 글(invalid header)을 보내요.'),
        ...common,
        steps: ['3단계 [펌웨어 굽기 시작]으로 MicroPython을 넣어요.', '다 구우면 [보드 연결]을 다시 눌러 확인해요.'],
      };
    case 'download-mode':
      return {
        ...base(
          'warning',
          '보드가 펌웨어 받기 모드(다운로드 모드)예요',
          'BOOT 버튼을 누른 채 켰거나, 펌웨어 굽기가 중간에 멈췄어요. 이 모드에서는 코드를 실행할 수 없어요.',
        ),
        ...common,
        steps: ['BOOT 버튼에서 손을 떼고 보드의 EN(RST) 버튼을 한 번 눌러요.', '[보드 연결]을 다시 눌러요. 그래도 같으면 3단계에서 펌웨어를 다시 구워요.'],
      };
    case 'other-python':
      return {
        ...base('warning', `보드에 MicroPython이 아닌 다른 파이썬(${verdict.name})이 들어 있어요`, '이 사이트의 예제는 MicroPython으로 돌아요.'),
        ...common,
        steps: ['3단계 [펌웨어 굽기 시작]으로 MicroPython을 넣어요. 보드에 있던 프로그램과 파일은 지워져요.'],
      };
    case 'other-output':
      return {
        ...base(
          'warning',
          verdict.garbled ? '보드가 알아볼 수 없는 글자를 보내요' : '보드에서 MicroPython이 아닌 프로그램이 돌고 있어요',
          verdict.garbled
            ? '보드 프로그램이 다른 통신 속도를 쓰거나, MicroPython이 아닌 펌웨어(예: 아두이노 스케치)가 들어 있어요.'
            : '보드가 글을 보내지만 MicroPython의 대답이 아니에요. 아두이노 스케치 같은 다른 펌웨어가 들어 있을 수 있어요.',
        ),
        ...common,
        steps: [
          '3단계 [펌웨어 굽기 시작]으로 MicroPython을 넣어요. 보드에 있던 프로그램은 지워져요.',
          '다른 장치의 포트를 골랐다면 [보드 연결]을 다시 눌러 보드의 포트를 골라요.',
        ],
      };
    case 'busy':
      return busyView(outcome.port);
    default:
      return {
        ...base('warning', '보드가 대답하지 않아요', '포트는 열렸는데 MicroPython의 대답이 오지 않았어요.'),
        ...common,
        steps: [
          '보드에 MicroPython이 아직 없을 수 있어요. 3단계 [펌웨어 굽기 시작]으로 넣어요(처음 한 번).',
          '블루투스 포트처럼 보드가 아닌 포트를 골랐다면 [보드 연결]을 다시 눌러 USB 포트를 골라요.',
          '보드가 펌웨어 받기 모드일 수 있어요. 보드의 EN(RST) 버튼을 한 번 누른 뒤 다시 확인해요.',
        ],
      };
  }
}

/** LED가 깜빡이지 않았을 때 볼 것 */
export const LED_HELP: readonly string[] = Object.freeze([
  '교과서 키트 보드의 내장 LED는 초록색이에요(원고 표기 D2, 2번 핀). 전원 표시등과 헷갈리지 않게 봐요.',
  '다른 보드는 내장 LED가 없거나 2번이 아닌 핀에 붙어 있을 수 있어요. 코드는 보드에서 끝까지 돌았으니 연결은 된 거예요.',
  '[보드 연결]을 다시 눌러 한 번 더 봐요.',
]);

function describeReady(outcome: Extract<BoardCheckResult, { kind: 'ready' }>): ConnectView {
  const banner = outcome.banner;
  const info = [
    { label: '펌웨어', value: banner ? `MicroPython ${banner.version} (${banner.buildDate})` : 'MicroPython(버전을 읽지 못했어요)' },
    { label: '보드', value: banner?.machine ?? '알 수 없음' },
    { label: 'USB 칩(참고)', value: outcome.port?.text ?? '알 수 없음' },
  ];
  const notes: string[] = [];
  if (outcome.firmware === 'older' && banner) {
    notes.push(
      `보드의 MicroPython(${banner.version})이 이 사이트가 기준으로 삼는 판(${SITE_FIRMWARE_VERSION})보다 옛날 판이에요. 대부분 그대로 되지만, 결과가 다르면 3단계에서 새로 구워요.`,
    );
  } else if (outcome.firmware === 'newer' && banner) {
    notes.push(`보드의 MicroPython(${banner.version})이 이 사이트가 기준으로 삼는 판(${SITE_FIRMWARE_VERSION})보다 새 판이에요. 대부분 그대로 돼요.`);
  }
  if (outcome.esp32 === false) {
    notes.push('ESP32가 아닌 보드예요. 교과서 예제의 핀 번호가 맞지 않을 수 있어요.');
  }
  const blink = outcome.blink;
  if (blink.outcome === 'ok') {
    return {
      ...base(
        'success',
        '보드가 연결됐고 MicroPython이 있어요',
        '보드의 초록색 내장 LED가 세 번 깜빡였으면 연결 확인 끝이에요. 확인이 끝나서 연결은 닫았어요.',
      ),
      info,
      notes,
      links: outcome.firmware === 'older' ? [link('first-example'), link('firmware')] : [link('first-example')],
      ledHelp: LED_HELP,
    };
  }
  if (blink.outcome === 'error') {
    return {
      ...base('warning', 'MicroPython은 있지만 LED 시험 코드가 오류로 끝났어요', `보드가 보낸 오류: ${blink.errorLine ?? '(오류 글을 받지 못했어요)'}`),
      info,
      notes,
      steps: [
        'ESP32가 아닌 보드면 2번 핀이나 machine 모듈이 다를 수 있어요. 교과서 키트 보드인지 확인해요.',
        '[보드 연결]을 다시 눌러요. 그래도 같으면 3단계에서 펌웨어를 새로 구워요.',
      ],
      links: [link('firmware')],
    };
  }
  const detail =
    blink.outcome === 'reset'
      ? '시험하는 동안 보드가 다시 시작했어요. USB 전원이 모자라거나 케이블이 흔들렸을 수 있어요.'
      : blink.outcome === 'interrupted'
        ? '시험 코드가 중간에 멈췄어요.'
        : `시험 코드를 보드에 보내지 못했어요${blink.errorLine ? `(${blink.errorLine})` : ''}.`;
  return {
    ...base('warning', '내장 LED 시험을 끝까지 하지 못했어요', detail),
    info,
    notes,
    steps: ['케이블을 확인하고 [보드 연결]을 다시 눌러요.'],
    links: [link('port-help')],
  };
}
