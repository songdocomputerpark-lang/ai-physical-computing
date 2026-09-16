/**
 * 브라우저 음성 인식(Web Speech API) 확인·안내 — 순수 논리만 모아 둔 곳(PLAN §8.2 P2-13, CODE_MAPPING §3.5).
 *
 * 화면을 만들지 않는다: 창(window)을 인자로 받아 검사하고, 한국어 안내 문장을 돌려준다.
 * 그래서 단위 테스트(tests/unit/speech/)가 가짜 창으로 모든 경우를 확인할 수 있다.
 *
 * 확인한 사실(공식 문서, 2026-09-16)
 * - `SpeechRecognition`은 [SecureContext, Exposed=Window] — **워커에서는 쓸 수 없다**. 그래서 파이썬 쪽(speech_recognition.py)은
 *   apc_runtime.request('speech.listen')로 화면에 부탁하고, 화면(index.ts)이 이 API를 쓴다.
 *   https://webaudio.github.io/web-speech-api/ , https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
 * - Chrome 등은 기본적으로 **서버 인식**을 쓴다(음성이 브라우저 회사 웹 서비스로 전송되고 오프라인에서는 안 됨 — MDN 경고).
 * - Chrome 139부터 **온디바이스(기기 안) 인식**을 고를 수 있다: 정적 메서드
 *     SpeechRecognition.available({ langs: ['ko-KR'], processLocally: true, quality?: 'command'|'dictation'|'conversation' })
 *       → 'available' | 'downloadable' | 'downloading' | 'unavailable'
 *     SpeechRecognition.install({ langs: ['ko-KR'], quality? }) → boolean(성공 여부, 이미 깔려 있으면 true)
 *     인스턴스 속성 recognition.processLocally = true (start() 전에 켜 둔다)
 *   `install()`은 문서가 살아 있지 않으면 InvalidStateError, 잘못된 언어 태그면 SyntaxError를 던지고
 *   Permissions-Policy `on-device-speech-recognition`으로 막을 수 있다.
 *   https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/available_static ,
 *   https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/install_static ,
 *   https://developer.chrome.com/blog/new-in-chrome-139
 * - 오류 코드(SpeechRecognitionErrorEvent.error): no-speech, aborted, audio-capture, network, not-allowed,
 *   service-not-allowed, language-not-supported, phrases-not-supported, bad-grammar(옛 명세).
 *   https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognitionErrorEvent/error
 */
import type { SpeechMode } from './settings.ts';

/** 실습실에서 쓰는 인식 언어(교과서 f044·f045가 language='ko-KR'로 부른다) */
export const SPEECH_LANG = 'ko-KR';

/** available()·install()에 넘기는 품질(짧은 명령어 위주 수업이라 기본값 command 대신 받아쓰기 품질을 쓴다) */
export const SPEECH_QUALITY = 'dictation';

/** SpeechRecognition.available()이 돌려주는 값 + 이 사이트가 쓰는 두 가지(확인 전·확인 불가) */
export type OnDeviceStatus = 'unchecked' | 'unknown' | 'unsupported' | 'available' | 'downloadable' | 'downloading' | 'unavailable';

/** 이 창에서 쓸 수 있는 음성 인식 만들기 함수(표준 이름 → 크롬 접두어 이름 순서) */
export interface SpeechRecognitionCtorLike {
  new (): SpeechRecognitionLike;
  available?(options: { langs: string[]; processLocally?: boolean; quality?: string }): Promise<string>;
  install?(options: { langs: string[]; quality?: string }): Promise<boolean>;
}

/** 이 사이트가 실제로 쓰는 SpeechRecognition의 일부(테스트가 가짜로 대신할 수 있게 좁게 적는다) */
export interface SpeechRecognitionLike {
  lang: string;
  continuous?: boolean;
  interimResults?: boolean;
  maxAlternatives?: number;
  processLocally?: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  onnomatch?: (() => void) | null;
}

interface SpeechWindow {
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
  isSecureContext?: boolean;
}

/** 이 창의 음성 인식 만들기 함수. 없으면 null(이 브라우저는 음성 인식이 없다 → 글자 입력만). */
export function speechRecognitionCtor(win: SpeechWindow | undefined | null): SpeechRecognitionCtorLike | null {
  if (!win) {
    return null;
  }
  const candidate = win.SpeechRecognition ?? win.webkitSpeechRecognition;
  return typeof candidate === 'function' ? (candidate as SpeechRecognitionCtorLike) : null;
}

/**
 * 온디바이스(기기 안) 한국어 인식이 되는지 물어본다. 음성을 보내지 않고 가능 여부만 확인한다.
 * 확인할 방법이 없으면(옛 브라우저) 'unknown', 음성 인식 자체가 없으면 'unsupported'.
 */
export async function checkOnDevice(ctor: SpeechRecognitionCtorLike | null): Promise<OnDeviceStatus> {
  if (!ctor) {
    return 'unsupported';
  }
  if (typeof ctor.available !== 'function') {
    return 'unknown';
  }
  try {
    const status = await ctor.available({ langs: [SPEECH_LANG], processLocally: true, quality: SPEECH_QUALITY });
    return status === 'available' || status === 'downloadable' || status === 'downloading' ? status : 'unavailable';
  } catch {
    // 정책(Permissions-Policy)으로 막혔거나 옛 판이라 인자가 다른 경우
    return 'unknown';
  }
}

/** 한국어 음성 팩을 받아 둔다(사용자가 [준비하기]를 눌렀을 때만). 성공하면 true. */
export async function installOnDevice(ctor: SpeechRecognitionCtorLike | null): Promise<boolean> {
  if (!ctor || typeof ctor.install !== 'function') {
    return false;
  }
  try {
    return Boolean(await ctor.install({ langs: [SPEECH_LANG], quality: SPEECH_QUALITY }));
  } catch {
    return false;
  }
}

/** 온디바이스 상태를 학생·교사가 읽을 한국어 문장으로 */
export function describeOnDevice(status: OnDeviceStatus): string {
  switch (status) {
    case 'available':
      return '이 브라우저는 한국어를 기기 안에서 바로 알아들을 수 있어요. 음성이 밖으로 나가지 않아요.';
    case 'downloadable':
      return '한국어 음성 팩을 한 번 받아 두면 기기 안에서 알아들을 수 있어요(아래 버튼).';
    case 'downloading':
      return '한국어 음성 팩을 받는 중이에요. 잠시 뒤 다시 확인해 주세요.';
    case 'unavailable':
      return '이 브라우저에서는 기기 안 한국어 인식을 쓸 수 없어요.';
    case 'unsupported':
      return '이 브라우저에는 음성 인식 기능이 없어요. 글자 입력 방식으로 실습해요.';
    case 'unchecked':
      return '아직 확인하지 않았어요. [다시 확인]을 누르면 브라우저에 물어봐요(음성은 보내지 않아요).';
    case 'unknown':
    default:
      return '이 브라우저는 기기 안 인식이 되는지 알려 주지 않아요(확인하려면 Chrome이나 Edge 최신판이 필요해요).';
  }
}

/** 온디바이스 상태를 짧은 낱말로(화면 표시용) */
export function onDeviceLabel(status: OnDeviceStatus): string {
  switch (status) {
    case 'available':
      return '가능';
    case 'downloadable':
      return '음성 팩 내려받으면 가능';
    case 'downloading':
      return '음성 팩 받는 중';
    case 'unavailable':
      return '안 됨';
    case 'unsupported':
      return '이 브라우저에는 음성 인식이 없음';
    case 'unchecked':
      return '확인 전';
    case 'unknown':
    default:
      return '확인할 수 없음';
  }
}

/** 방식 이름(실습실 패널의 고르기 상자에 보이는 글) */
export const MODE_LABELS: Readonly<Record<SpeechMode, string>> = Object.freeze({
  text: '글자 입력(기본, 마이크를 쓰지 않아요)',
  ondevice: '내 기기 안 인식(음성이 밖으로 나가지 않아요)',
  server: '서버 인식(음성이 브라우저 회사 서버로 전송돼요)',
});

/** 방식 설명(패널 아래 한 줄) */
export const MODE_NOTES: Readonly<Record<SpeechMode, string>> = Object.freeze({
  text: '말하는 대신 아래 칸에 문장을 적고 [보내기]를 누르면, 그 문장이 인식 결과가 돼요.',
  ondevice: '마이크 소리를 이 기기 안에서 글자로 바꿔요. 인터넷으로 나가지 않아요.',
  server: '마이크 소리가 브라우저 회사(예: 구글) 서버로 전송되어 글자로 바뀌어요. 교사가 사이트 설정에서 켠 브라우저에서만 보여요.',
});

/**
 * 지금 고를 수 있는 방식 목록. 순서가 고르기 상자 순서다.
 * - 글자 입력은 언제나 있다(기본).
 * - 내 기기 안 인식은 음성 인식이 있고 온디바이스가 되는(또는 음성 팩만 받으면 되는) 브라우저에서만.
 * - 서버 인식은 **교사가 사이트 설정에서 켰을 때만** — 꺼져 있으면 목록에 아예 넣지 않는다(DOM에도 안 생김).
 */
export function availableModes(options: { hasRecognition: boolean; onDevice: OnDeviceStatus; serverAllowed: boolean }): SpeechMode[] {
  const modes: SpeechMode[] = ['text'];
  if (options.hasRecognition && (options.onDevice === 'available' || options.onDevice === 'downloadable' || options.onDevice === 'downloading')) {
    modes.push('ondevice');
  }
  if (options.hasRecognition && options.serverAllowed) {
    modes.push('server');
  }
  return modes;
}

/** 파이썬 쪽에서 낼 예외 종류: unknown → sr.UnknownValueError, request → sr.RequestError */
export type ListenFailure = 'unknown' | 'request' | 'timeout';

export interface SpeechErrorInfo {
  readonly failure: ListenFailure;
  readonly message: string;
}

/**
 * Web Speech API 오류 코드를 한국어 설명과 파이썬 예외 종류로 바꾼다.
 * 말을 못 알아들은 것(no-speech·aborted)은 원본 라이브러리와 같이 UnknownValueError,
 * 권한·네트워크·미지원은 RequestError로 보낸다(f044·f045의 except 두 갈래가 그대로 산다).
 */
export function speechErrorInfo(code: string | undefined): SpeechErrorInfo {
  switch (code) {
    case 'no-speech':
      return { failure: 'unknown', message: '말소리가 들리지 않았어요.' };
    case 'aborted':
      return { failure: 'unknown', message: '인식을 도중에 멈췄어요.' };
    case 'audio-capture':
      return { failure: 'request', message: '마이크를 쓸 수 없어요(마이크가 없거나 다른 프로그램이 쓰는 중이에요).' };
    case 'network':
      return { failure: 'request', message: '인터넷 연결 문제로 음성을 글자로 바꾸지 못했어요.' };
    case 'not-allowed':
      return { failure: 'request', message: '마이크 사용을 허용하지 않았어요. 주소창의 마이크 표시를 눌러 허용해 주세요.' };
    case 'service-not-allowed':
      return { failure: 'request', message: '브라우저가 이 음성 인식 서비스를 막았어요(설정이나 학교 정책을 확인해 주세요).' };
    case 'language-not-supported':
      return { failure: 'request', message: '이 브라우저는 한국어(ko-KR) 인식을 지원하지 않아요.' };
    case 'phrases-not-supported':
    case 'bad-grammar':
      return { failure: 'request', message: '이 브라우저가 지원하지 않는 인식 설정이에요.' };
    default:
      return { failure: 'request', message: `음성 인식에서 문제가 생겼어요${code ? `(${code})` : ''}.` };
  }
}

/** SpeechRecognition의 result 이벤트에서 알아들은 문장만 뽑는다(가장 그럴듯한 후보 하나씩 이어 붙임). */
export function transcriptOf(event: { results?: ArrayLike<ArrayLike<{ transcript?: string }>> } | null | undefined): string {
  const results = event?.results;
  if (!results) {
    return '';
  }
  let text = '';
  for (let index = 0; index < results.length; index += 1) {
    const alternative = results[index]?.[0];
    if (alternative && typeof alternative.transcript === 'string') {
      text += alternative.transcript;
    }
  }
  return text.trim();
}
