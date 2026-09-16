/**
 * 음성 인식 흉내 모듈의 설정 값(PLAN §8.2 P2-13, §10 개인정보, CODE_MAPPING §3.5).
 *
 * 이 파일에는 화면(DOM)이 없다 — 사이트 설정 페이지(src/components/settings/)와 실습실 패널(index.ts)이
 * **같은 저장 이름**을 쓰도록 이름과 읽기·쓰기 함수를 한 곳에 모아 둔 것이다.
 *
 * 저장 이름은 흉내 모듈 규약(src/lab/README.md 4절)의 ctx.storageName('…')과 같은 값이다.
 *   ctx.storageName('server-recognition') === storageKey(SERVER_RECOGNITION_NAME)
 *                                        === 'ai-physical-computing:module:speech:server-recognition'
 * 그래서 [이 컴퓨터에서 내 기록 지우기](src/lab/controls/records.ts)가 이 설정도 함께 지운다 →
 * 지우면 "서버 음성 인식 허용"은 다시 꺼짐(기본값)이 된다. 안전한 쪽이 기본값이다.
 *
 * 결정(운영자 위임, DECISIONS O1)
 * - 기본은 **글자 입력 모드**다(§10, PD-08). 온디바이스 인식이 되는 브라우저에서도 자동으로 마이크를 켜지 않는다.
 *   학생이 실습실 패널에서 고를 때만 마이크를 쓴다(마이크 권한 창이 갑자기 뜨지 않게).
 * - **서버 인식**(브라우저 회사 서버로 음성 전송)은 교사가 이 브라우저에서 켰을 때만 선택지로 보인다(기본 꺼짐).
 *   꺼져 있으면 실습실 패널에 선택지를 **아예 만들지 않는다**(DOM에 없음 — tests/e2e/lab-speech.spec.ts가 확인).
 * - 고른 방식(mode)도 이 브라우저에만 저장한다. 저장된 값이 'server'인데 설정이 꺼져 있으면 'text'로 되돌린다.
 */
import { readItem, storageKey, writeItem } from '../../../lib/storage.ts';

/** 실습실에서 말을 글로 바꾸는 방식 */
export type SpeechMode = 'text' | 'ondevice' | 'server';

export const SPEECH_MODES: readonly SpeechMode[] = Object.freeze(['text', 'ondevice', 'server']);

/** 기본 방식(§10): 마이크를 쓰지 않는 글자 입력 */
export const DEFAULT_SPEECH_MODE: SpeechMode = 'text';

/** 이 모듈의 저장 이름 머리말(ctx.storageName('x') = storageKey(`${SPEECH_STORAGE_PREFIX}x`)) */
export const SPEECH_STORAGE_PREFIX = 'module:speech:';

/** "서버 음성 인식 허용(교사용)" 설정의 저장 이름(머리말 없는 이름) */
export const SERVER_RECOGNITION_NAME = `${SPEECH_STORAGE_PREFIX}server-recognition`;

/** 학생이 고른 방식의 저장 이름 */
export const SPEECH_MODE_NAME = `${SPEECH_STORAGE_PREFIX}mode`;

/** localStorage에 실제로 들어가는 이름(설정 페이지·테스트가 눈으로 확인할 때 쓴다) */
export const SERVER_RECOGNITION_KEY = storageKey(SERVER_RECOGNITION_NAME);
export const SPEECH_MODE_KEY = storageKey(SPEECH_MODE_NAME);

/** 저장 값: 켜짐은 '1', 그 밖(없음·'0'·이상한 값)은 모두 꺼짐으로 본다(안전한 쪽이 기본값). */
const ON = '1';
const OFF = '0';

/** 저장 공간을 바꿔 넣을 수 있게(단위 테스트가 가짜 저장 공간을 쓴다) — src/lib/storage.ts의 StorageSource와 같다. */
type Source = Parameters<typeof readItem>[1];

/** 교사가 이 브라우저에서 "서버 음성 인식"을 켰는지. 못 읽으면 꺼짐. */
export function isServerSpeechAllowed(source?: Source): boolean {
  return readItem(SERVER_RECOGNITION_NAME, source) === ON;
}

/** "서버 음성 인식 허용"을 켜거나 끈다. 저장하지 못하면(사생활 보호 모드 등) false. */
export function setServerSpeechAllowed(allowed: boolean, source?: Source): boolean {
  return writeItem(SERVER_RECOGNITION_NAME, allowed ? ON : OFF, source);
}

/** 글자가 방식 이름인지 */
export function isSpeechMode(value: unknown): value is SpeechMode {
  return typeof value === 'string' && (SPEECH_MODES as readonly string[]).includes(value);
}

/**
 * 저장해 둔 방식을 읽는다. 지금 고를 수 있는 방식(allowed)에 없으면 기본값(글자 입력)으로 되돌린다.
 * 예: 교사가 서버 인식을 껐거나, 다른 컴퓨터라 온디바이스가 안 되는 경우.
 */
export function readSpeechMode(allowed: readonly SpeechMode[] = SPEECH_MODES, source?: Source): SpeechMode {
  const saved = readItem(SPEECH_MODE_NAME, source);
  return isSpeechMode(saved) && allowed.includes(saved) ? saved : DEFAULT_SPEECH_MODE;
}

/** 고른 방식을 기억한다. */
export function saveSpeechMode(mode: SpeechMode, source?: Source): boolean {
  return writeItem(SPEECH_MODE_NAME, isSpeechMode(mode) ? mode : DEFAULT_SPEECH_MODE, source);
}

/** 설정 값 글자(테스트·문서용) */
export const SETTING_ON_VALUE = ON;
export const SETTING_OFF_VALUE = OFF;
