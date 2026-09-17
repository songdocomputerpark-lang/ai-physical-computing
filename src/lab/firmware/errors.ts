/**
 * 펌웨어 굽기 오류 → 학생·교사가 읽는 한국어 풀이 — PLAN §8.3 P3-09 "한국어 오류('BOOT 버튼을 누른 채 다시' 등)".
 *
 * 실제로 나는 오류 글과 이름에 맞춘다(원문 확인 2026-09-18).
 * - Web Serial(WICG 명세·Chromium): requestPort 창을 닫음 → NotFoundError "No port selected by the user.",
 *   사용자 조작 없이 부름·정책 차단 → SecurityError, 이미 열린 포트 → InvalidStateError "The port is already open.",
 *   다른 프로그램이 쓰는 포트 → NetworkError "Failed to open serial port.", 선 빠짐 → NetworkError "The device has been lost.".
 * - esptool-js 0.6.1(lib/esploader.js·webserial.js): 굽기 모드 연결 실패 → "Failed to connect with the device"(시도마다
 *   "Wrong boot mode detected (0x13)…"·"Download mode successfully detected, but getting no sync reply…"·
 *   "Serial data stream stopped: Possible serial noise or corruption."·"Invalid head of packet (0x..)"), 응답 없음 → "No serial data received.",
 *   명령 실패 → "Failed to <일> failed with status …", 칩 모름 → "Unexpected CHIP magic value …".
 * - esptool.py(Thonny의 [Install or update MicroPython]도 이것을 쓴다): "A fatal error occurred: Failed to connect to ESP32: …",
 *   "MD5 of file does not match data in flash!".
 * 사이트가 알아낸 상황(칩이 다름·플래시가 작음·파일 검증 실패·MD5 다름·속도 바꾸기 실패)은 FlashError(code)로 던진다.
 * 오류 원문은 풀이 아래 "선생님께 보여 줄 오류 원문"에 그대로 보인다. 검사: tests/unit/firmware/errors.test.ts
 */

export type FlashStageId = 'port' | 'chip' | 'file' | 'erase' | 'write' | 'verify' | 'restart';

export type FlashErrorCode =
  | 'port-cancelled'
  | 'port-blocked'
  | 'port-busy'
  | 'no-download-mode'
  | 'no-sync-reply'
  | 'no-response'
  | 'wrong-chip'
  | 'flash-too-small'
  | 'baud-failed'
  | 'device-lost'
  | 'timeout'
  | 'verify-mismatch'
  | 'firmware-missing'
  | 'firmware-network'
  | 'firmware-blocked'
  | 'firmware-corrupt'
  | 'aborted'
  | 'unknown';

/** 다시 시도 방법: 같은 설정 · 느린 속도(115200) · 다시 시도해도 소용없음 */
export type FlashRetry = 'same' | 'slow' | 'none';

export interface FlashErrorExplanation {
  readonly code: FlashErrorCode;
  readonly title: string;
  readonly summary: string;
  readonly steps: readonly string[];
  readonly retry: FlashRetry;
  /** 오류가 아니라 안내(창을 닫음·직접 멈춤)인지 */
  readonly notice: boolean;
  /** 선생님께 보여 줄 원문(여러 줄) */
  readonly raw: string;
}

/** 사이트가 상황을 알아내고 던지는 오류 */
export class FlashError extends Error {
  readonly code: FlashErrorCode;
  /** 풀이 글에 넣을 값(칩 이름·크기 등) */
  readonly values: Readonly<Record<string, string>>;

  constructor(code: FlashErrorCode, message: string, values: Readonly<Record<string, string>> = {}, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'FlashError';
    this.code = code;
    this.values = values;
  }
}

/** 굽기 모드로 바꾸는 시도마다 esptool-js가 돌려준 결과("success" 또는 마지막 오류 글) */
export type ConnectAttemptLog = readonly string[];

interface ErrorContext {
  /** 오류가 난 단계 */
  readonly stage: FlashStageId;
  /** 굽기 모드 연결 시도 기록 */
  readonly attempts?: ConnectAttemptLog;
  /** USB 선이 빠졌다고 알려졌는지(포트 disconnect 이벤트) */
  readonly deviceLost?: boolean;
  /** 굽기 모드로 바꾸는 동안 보드에서 무엇이든 받았는지(FirmwareFlasher.receivedOutput). 모르면 undefined */
  readonly receivedOutput?: boolean;
}

const BOOT_STEPS: readonly string[] = [
  '보드의 BOOT 버튼을 손가락으로 누른 채로 [다시 시도]를 눌러요.',
  '"보드 칩 확인"이 끝남으로 바뀌면 BOOT 버튼에서 손을 떼요.',
  '그래도 안 되면 BOOT 버튼을 누른 채 EN(또는 RST) 버튼을 한 번 눌렀다 떼고, BOOT 버튼을 계속 누른 채로 [다시 시도]를 눌러요.',
];

const CABLE_STEP = 'USB 허브·연장선 대신 컴퓨터 본체의 USB 단자에 바로 꽂고, 데이터를 주고받는 케이블(충전 전용이 아닌 것)인지 확인해요.';

function describe(error: unknown): { name: string; message: string; chain: string } {
  const lines: string[] = [];
  let name = '';
  let message = '';
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current !== undefined && current !== null; depth += 1) {
    if (current instanceof Error || (typeof current === 'object' && 'message' in (current as object))) {
      const item = current as { name?: unknown; message?: unknown; cause?: unknown };
      const itemName = typeof item.name === 'string' ? item.name : 'Error';
      const itemMessage = typeof item.message === 'string' ? item.message : String(item.message);
      if (depth === 0) {
        name = itemName;
        message = itemMessage;
      }
      lines.push(`${itemName}: ${itemMessage}`);
      current = item.cause;
    } else {
      const text = String(current);
      if (depth === 0) {
        message = text;
      }
      lines.push(text);
      break;
    }
  }
  return { name, message, chain: lines.join('\n← ') };
}

function fill(text: string, values: Readonly<Record<string, string>>): string {
  return text.replace(/\{(\w+)\}/gu, (whole, key: string) => values[key] ?? whole);
}

function explanation(
  code: FlashErrorCode,
  title: string,
  summary: string,
  steps: readonly string[],
  retry: FlashRetry,
  raw: string,
  notice = false,
): FlashErrorExplanation {
  return { code, title, summary, steps, retry, notice, raw };
}

/**
 * 연결 시도 기록으로 "굽기 모드가 아님 / 굽기 모드인데 대답이 안 옴 / 아무것도 안 옴"을 가른다.
 * esptool-js는 보드가 앱(MicroPython 등)을 돌리며 되울린 글도 "Serial data stream stopped"로 알리므로,
 * 보드에서 무엇이든 받았는지(receivedOutput)를 함께 본다.
 */
export function classifyConnect(attempts: ConnectAttemptLog, receivedOutput?: boolean): 'no-download-mode' | 'no-sync-reply' | 'no-response' {
  const failures = attempts.filter((item) => item !== 'success');
  if (failures.some((item) => /Download mode successfully detected/iu.test(item))) {
    return 'no-sync-reply';
  }
  if (receivedOutput === true || failures.some((item) => /Wrong boot mode|Invalid head of packet|Invalid SLIP escape/iu.test(item))) {
    return 'no-download-mode';
  }
  if (receivedOutput === false || (failures.length > 0 && failures.every((item) => /Serial data stream stopped|No serial data received/iu.test(item)))) {
    return 'no-response';
  }
  return 'no-download-mode';
}

/** 오류를 한국어 풀이로 바꾼다 */
export function explainFlashError(error: unknown, context: ErrorContext): FlashErrorExplanation {
  const { name, message, chain } = describe(error);
  const raw = [`단계: ${context.stage}`, chain, ...(context.attempts?.length ? [`연결 시도: ${context.attempts.join(' | ')}`] : [])].join('\n');
  const values = error instanceof FlashError ? error.values : {};
  const code: FlashErrorCode | null = error instanceof FlashError ? error.code : null;

  if (code === 'aborted' || (context.stage !== 'port' && name === 'AbortError')) {
    return explanation(
      'aborted',
      '굽기를 멈췄어요',
      '보드에 펌웨어가 반쯤만 들어갔을 수 있어요. 이대로는 보드가 제대로 켜지지 않을 수 있어요.',
      ['[다시 시도]를 눌러 처음부터 다시 구우면 괜찮아져요.'],
      'same',
      raw,
      true,
    );
  }
  // 선이 빠진 것은 다른 어떤 오류 글보다 먼저 본다(뒤따르는 시간 초과 글이 원인을 가리지 않게)
  if (code === 'device-lost' || context.deviceLost || /device has been lost/iu.test(message)) {
    return explanation(
      'device-lost',
      '보드와 연결이 끊겼어요',
      'USB 케이블이 빠졌거나 흔들려서 컴퓨터가 보드를 잃어버렸어요.',
      [
        'USB 케이블을 보드와 컴퓨터에 다시 꽂아요. ' + CABLE_STEP,
        '[다시 시도]를 눌러 처음부터 다시 구워요. 굽다 멈춘 보드도 다시 구우면 괜찮아요.',
      ],
      'same',
      raw,
    );
  }
  if (code === 'firmware-missing') {
    return explanation(
      'firmware-missing',
      '펌웨어 파일 준비 중이에요',
      '이 사이트에 펌웨어 파일이 아직 올라오지 않아서 이 화면에서는 구울 수 없어요. 보드는 그대로예요.',
      ['선생님은 아래 "선생님용: 수동으로 굽는 방법"의 Thonny 방법으로 구울 수 있어요.', '학생은 선생님께 알려 주세요.'],
      'none',
      raw,
    );
  }
  if (code === 'firmware-network' || code === 'firmware-blocked') {
    const blocked = code === 'firmware-blocked';
    return explanation(
      code,
      '펌웨어 파일을 받지 못했어요',
      blocked
        ? '펌웨어 파일 대신 다른 웹 페이지가 왔어요. 학교 인터넷 차단 장치가 파일 받기를 막았을 수 있어요. 보드는 그대로예요.'
        : '인터넷 연결이 끊겼거나 느려서 펌웨어 파일을 끝까지 받지 못했어요. 보드는 그대로예요.',
      [
        '인터넷 연결을 확인하고 [다시 시도]를 눌러요.',
        '학교 네트워크에서 계속 안 되면 선생님께 알려 주세요. "시작하기 > 점검" 페이지의 네트워크 시험 결과를 함께 보여 주면 원인을 찾기 쉬워요.',
      ],
      'same',
      raw,
    );
  }
  if (code === 'firmware-corrupt') {
    return explanation(
      'firmware-corrupt',
      '받은 펌웨어 파일이 올바르지 않아요',
      fill('파일의 {what}이(가) 사이트에 적힌 값과 달라서 굽지 않았어요. 보드는 그대로예요.', { what: values.what ?? '크기나 지문(SHA-256)' }),
      ['페이지를 새로 고친 뒤 [펌웨어 굽기 시작]을 다시 눌러요.', '그래도 같으면 선생님께 알려 주세요. 사이트의 파일이 바뀌었거나 받는 길에서 파일이 망가졌을 수 있어요.'],
      'same',
      raw,
    );
  }
  if (code === 'wrong-chip') {
    return explanation(
      'wrong-chip',
      '이 보드는 ESP32(기본형)가 아니에요',
      fill('찾은 칩은 {chip}이에요. 이 사이트의 펌웨어는 교과서 키트와 같은 ESP32용이라 굽지 않았어요. 보드는 그대로예요.', {
        chip: values.chip ?? '다른 칩',
      }),
      [
        '교과서 키트의 ESP32 보드를 꽂았는지 확인해요.',
        fill('{chip} 보드라면 MicroPython 공식 내려받기 페이지(micropython.org/download)에서 그 칩용 펌웨어를 찾아 선생님이 수동으로 구워요.', {
          chip: values.chip ?? '다른 칩',
        }),
      ],
      'none',
      raw,
    );
  }
  if (code === 'flash-too-small') {
    return explanation(
      'flash-too-small',
      '보드의 저장 공간(플래시)이 작아요',
      fill('이 보드의 플래시는 {size}인데, 이 펌웨어는 {min} 이상이 필요해요. 보드는 그대로예요.', {
        size: values.size ?? '작은 크기',
        min: values.min ?? '4MB',
      }),
      ['교과서 키트의 ESP32 보드(플래시 4MB)인지 확인해요.', '플래시가 2MB인 보드라면 MicroPython 공식 페이지의 ESP32_GENERIC-D2WD 펌웨어를 선생님이 수동으로 구워요.'],
      'none',
      raw,
    );
  }
  if (code === 'baud-failed') {
    return explanation(
      'baud-failed',
      '빠른 속도로 바꾸지 못했어요',
      '보드와 빠른 속도(460800)로 주고받도록 바꿨는데 대답이 오지 않았어요. 보드는 아직 그대로예요.',
      ['[느린 속도로 다시 굽기]를 눌러요. 시간은 두 배쯤 걸리지만 더 안정적이에요.', CABLE_STEP],
      'slow',
      raw,
    );
  }
  if (code === 'verify-mismatch' || /MD5 of file does not match/iu.test(message)) {
    return explanation(
      'verify-mismatch',
      '보드에 쓴 내용이 파일과 달라요',
      '쓰는 도중에 데이터가 깨졌어요. 이대로는 보드가 제대로 켜지지 않을 수 있어요.',
      ['"굽기 전에 보드를 모두 지우기"를 켜고 [느린 속도로 다시 굽기]를 눌러요.', CABLE_STEP],
      'slow',
      raw,
    );
  }
  if (code === 'port-cancelled' || (context.stage === 'port' && name === 'NotFoundError')) {
    return explanation(
      'port-cancelled',
      '포트를 고르지 않았어요',
      '포트 선택 창을 닫아서 굽기를 시작하지 않았어요.',
      [
        '보드를 USB 케이블로 컴퓨터에 꽂았는지 확인해요.',
        '[펌웨어 굽기 시작]을 다시 누르고, 목록에서 보드(이름에 USB·CH340·CP210 같은 글자가 있는 포트)를 골라 [연결]을 눌러요.',
        '목록에 보드가 없으면 아래 [포트·케이블·드라이버 도움말 보기]를 눌러 안내를 따라 해요.',
      ],
      'same',
      raw,
      true,
    );
  }
  if (code === 'port-blocked' || name === 'SecurityError') {
    return explanation(
      'port-blocked',
      '브라우저가 포트 사용을 막았어요',
      '브라우저 설정이나 학교 컴퓨터 정책이 이 사이트의 USB 장치(직렬 포트) 사용을 막았어요.',
      [
        '[펌웨어 굽기 시작] 단추를 마우스나 키보드로 직접 눌러 시작해요.',
        '브라우저 주소창 왼쪽의 사이트 정보 단추를 눌러 이 사이트의 "직렬 포트" 권한이 차단되어 있지 않은지 확인해요.',
        '학교에서 관리하는 컴퓨터라면 전산 담당 선생님께 "Web Serial(직렬 포트) 허용"을 부탁해요.',
      ],
      'same',
      raw,
    );
  }
  if (
    code === 'port-busy' ||
    /Failed to open serial port|port is already open/iu.test(message) ||
    ((context.stage === 'port' || context.stage === 'chip') && name === 'InvalidStateError')
  ) {
    return explanation(
      'port-busy',
      '다른 프로그램이 보드를 쓰고 있어요',
      '포트를 열지 못했어요. 보드는 한 번에 프로그램 하나만 쓸 수 있어요.',
      [
        'ESP32 실습실이나 다른 탭에서 이 보드를 연결해 두었다면 연결을 끊거나 그 탭을 닫아요.',
        'Thonny·아두이노 IDE 같은 프로그램이 켜져 있으면 닫아요.',
        'USB 케이블을 뽑았다가 다시 꽂고 [다시 시도]를 눌러요.',
      ],
      'same',
      raw,
    );
  }
  if (/Unexpected CHIP magic value/iu.test(message)) {
    return explanation(
      'wrong-chip',
      '보드의 칩을 알아보지 못했어요',
      '보드가 대답은 했지만 이 사이트가 아는 ESP32 칩이 아니에요. 보드는 그대로예요.',
      ['교과서 키트의 ESP32 보드를 꽂았는지 확인해요.', ...BOOT_STEPS.slice(0, 1)],
      'same',
      raw,
    );
  }
  if (/Failed to connect/iu.test(message)) {
    const kind = classifyConnect(context.attempts ?? [], context.receivedOutput);
    if (kind === 'no-sync-reply') {
      return explanation(
        'no-sync-reply',
        '보드가 굽기 모드인데 대답이 오지 않아요',
        '보드는 굽기 모드로 바뀌었지만, 보드가 보내는 대답이 컴퓨터에 닿지 않아요.',
        [CABLE_STEP, '다른 USB 단자나 다른 케이블로 바꾼 뒤 [다시 시도]를 눌러요.', '그래도 안 되면 [느린 속도로 다시 굽기]를 눌러요.'],
        'slow',
        raw,
      );
    }
    if (kind === 'no-response') {
      return explanation(
        'no-response',
        '보드가 아무 대답을 하지 않아요',
        '고른 포트에서 아무 신호도 오지 않았어요. 다른 포트를 골랐거나 보드가 굽기 모드로 바뀌지 않았어요.',
        [
          '[다시 시도]를 누르고 포트 목록에서 이름에 USB·CH340·CP210 같은 글자가 있는 포트를 골라요(블루투스 포트가 아닌지 봐요).',
          ...BOOT_STEPS.slice(0, 2),
          CABLE_STEP,
        ],
        'same',
        raw,
      );
    }
    return explanation(
      'no-download-mode',
      '보드가 굽기 모드로 바뀌지 않았어요',
      '보드와 연결은 됐지만, 보드가 펌웨어를 받을 준비(굽기 모드)를 하지 않았어요. 보드는 그대로예요.',
      [...BOOT_STEPS, CABLE_STEP],
      'same',
      raw,
    );
  }
  const writing = context.stage === 'erase' || context.stage === 'write' || context.stage === 'verify';
  if (
    writing ||
    context.stage === 'chip' ||
    /No serial data received|Serial data stream stopped|Packet content transfer stopped|failed with status|Invalid head of packet|invalid response|unsupported command/iu.test(
      message,
    )
  ) {
    return explanation(
      'timeout',
      '보드와 주고받기가 멈췄어요',
      writing
        ? '굽는 도중에 보드의 대답이 제때 오지 않았어요. 보드에 펌웨어가 반쯤만 들어갔을 수 있어요.'
        : '굽기를 준비하는 동안 보드의 대답이 제때 오지 않았어요. 보드는 아직 그대로예요.',
      ['[느린 속도로 다시 굽기]를 눌러요. 시간은 두 배쯤 걸리지만 더 안정적이에요.', CABLE_STEP, '다른 USB 케이블로 바꿔 봐요.'],
      'slow',
      raw,
    );
  }
  return explanation(
    'unknown',
    '알 수 없는 문제로 굽기가 멈췄어요',
    '예상하지 못한 문제가 생겼어요. 아래 "선생님께 보여 줄 오류 원문"을 선생님께 보여 주세요.',
    ['USB 케이블을 뽑았다가 다시 꽂고 [다시 시도]를 눌러요.', '계속되면 [느린 속도로 다시 굽기]를 눌러요.'],
    'slow',
    raw,
  );
}
