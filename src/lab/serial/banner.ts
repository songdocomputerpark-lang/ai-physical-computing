/**
 * 연결 직후 보드가 보낸 글에서 MicroPython이 있는지 가른다(P3-07 — SPEC §6.2 "펌웨어 확인: MicroPython이 없으면 [펌웨어 굽기]").
 * 순수 함수라 단위 테스트가 글만으로 검사한다(tests/unit/serial/real-board-banner.test.ts).
 *
 * 근거(2026-09-17 원문 확인)
 * - MicroPython v1.29.0 shared/runtime/pyexec.c 보통 REPL: MICROPY_BANNER_NAME_AND_VERSION("MicroPython " + git 태그 + " on " + 빌드 날짜)
 *   + "; " + MICROPY_BANNER_MACHINE(보드 이름 + " with " + MCU) + "\r\n" + 'Type "help()" for more information.\r\n', 프롬프트 ">>> ".
 *   ESP32_GENERIC v1.29.0 펌웨어(ESP32_GENERIC-20260824-v1.29.0.bin)는 "MicroPython v1.29.0 on 2026-08-24; Generic ESP32 module with ESP32".
 *   개발판 태그는 "v1.30.0-preview.123.gabcdef" 모양이라 버전 글자는 공백·세미콜론 전까지로 읽는다.
 * - raw REPL 알림 "raw REPL; CTRL-B to exit\r\n>"도 MicroPython만 보낸다.
 * - 펌웨어가 지워진 ESP32의 ROM 부팅 글("invalid header: 0xffffffff" 되풀이, 플래시를 못 읽으면 "flash read err")과
 *   다운로드 모드("waiting for download")는 모의 시리얼(src/lab/serial/mock/micropython-device.ts)의 ROM 글과 같은 모양으로 찾는다.
 *   실물 보드에서 그대로 나오는지는 부록 B-2(운영자 할 일 2번)로 확인한다.
 * - CircuitPython은 "Adafruit CircuitPython 9.x on …" 배너를 쓴다(이 사이트 예제는 MicroPython용이라 [펌웨어 굽기] 안내).
 */
import { FRIENDLY_PROMPT, RAW_REPL_BANNER } from './control-bytes.ts';

/** 사이트가 굽고 기준으로 삼는 펌웨어(PLAN §8.3 P3-09 — ESP32_GENERIC v1.29.0) */
export const SITE_FIRMWARE_VERSION = 'v1.29.0';

export interface MicroPythonBanner {
  /** "v1.29.0" */
  readonly version: string;
  /** "2026-08-24" */
  readonly buildDate: string;
  /** "Generic ESP32 module with ESP32" */
  readonly machine: string;
  /** 배너 줄 전체 */
  readonly line: string;
}

const BANNER_PATTERN = /MicroPython (v?\d+\.\d+[^\s;]*) on (\d{4}-\d{2}-\d{2}); ([^\r\n]+)/gu;

/** 글에서 마지막 MicroPython 배너를 읽는다(없으면 null) */
export function parseMicroPythonBanner(text: string): MicroPythonBanner | null {
  let last: RegExpExecArray | null = null;
  for (const match of text.matchAll(BANNER_PATTERN)) {
    last = match;
  }
  if (!last) {
    return null;
  }
  return Object.freeze({
    version: last[1]!.startsWith('v') ? last[1]! : `v${last[1]!}`,
    buildDate: last[2]!,
    machine: last[3]!.trim(),
    line: last[0].trim(),
  });
}

export interface VersionParts {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  /** "-preview…"처럼 뒤에 붙은 글이 있음 */
  readonly prerelease: boolean;
}

export function parseVersion(version: string): VersionParts | null {
  const match = /^v?(\d+)\.(\d+)(?:\.(\d+))?(.*)$/u.exec(version.trim());
  if (!match) {
    return null;
  }
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3] ?? 0), prerelease: (match[4] ?? '') !== '' };
}

/** 보드 펌웨어가 사이트 기준판(v1.29.0)과 같은지 — same(같은 판), older(옛 판), newer(새 판·개발판), unknown */
export function compareWithSiteFirmware(version: string | null | undefined): 'same' | 'older' | 'newer' | 'unknown' {
  const board = version ? parseVersion(version) : null;
  const site = parseVersion(SITE_FIRMWARE_VERSION);
  if (!board || !site) {
    return 'unknown';
  }
  const order = [board.major - site.major, board.minor - site.minor, board.patch - site.patch].find((difference) => difference !== 0) ?? 0;
  if (order < 0) {
    return 'older';
  }
  if (order > 0 || board.prerelease) {
    return 'newer';
  }
  return 'same';
}

/** 보드 이름에 ESP32가 들어 있는지(ESP32-S3 등 포함) */
export function isEsp32Machine(machine: string | null | undefined): boolean {
  return typeof machine === 'string' && /esp32/iu.test(machine);
}

export type ProbeVerdict =
  /** MicroPython REPL이 대답함(배너를 못 읽었으면 banner null) */
  | { readonly kind: 'micropython'; readonly banner: MicroPythonBanner | null; readonly prompt: 'friendly' | 'raw' }
  /** 다른 파이썬(CircuitPython 등) */
  | { readonly kind: 'other-python'; readonly name: string }
  /** MicroPython이 없음(펌웨어가 지워진 ESP32의 부팅 글) */
  | { readonly kind: 'no-firmware'; readonly evidence: 'invalid-header' | 'flash-read-error' }
  /** 펌웨어 받기(다운로드) 모드 — BOOT 버튼을 누른 채 켰거나 굽기가 중간에 멈춤 */
  | { readonly kind: 'download-mode' }
  /** MicroPython 같은 글이 오지만 Ctrl-C에도 프롬프트가 나오지 않음(멈추지 않는 프로그램) */
  | { readonly kind: 'busy' }
  /** REPL이 아닌 글(다른 펌웨어·아두이노 스케치, 속도가 달라 깨진 글) */
  | { readonly kind: 'other-output'; readonly garbled: boolean }
  /** 아무 대답이 없음 */
  | { readonly kind: 'silent' };

export type ProbeVerdictKind = ProbeVerdict['kind'];

/** 글자 대부분이 읽을 수 없는 바이트인지(통신 속도가 다를 때의 깨진 글) */
export function looksGarbled(text: string): boolean {
  const meaningful = text.replace(/[\r\n\t ]/gu, '');
  if (meaningful.length < 4) {
    return false;
  }
  let unreadable = 0;
  for (const char of meaningful) {
    const code = char.charCodeAt(0);
    if (code < 0x20 || code === 0x7f || code >= 0x80) {
      unreadable += 1;
    }
  }
  return unreadable / meaningful.length > 0.3;
}

/** 글 끝이 보통 REPL 프롬프트인지 */
export function endsWithFriendlyPrompt(text: string): boolean {
  return text.endsWith(FRIENDLY_PROMPT);
}

/** 글 끝이 raw REPL 프롬프트인지 */
export function endsWithRawPrompt(text: string): boolean {
  return text.endsWith(`${RAW_REPL_BANNER}>`);
}

/** Ctrl-B에 대한 MicroPython의 답이 다 왔는지: 배너 뒤 ">>> "로 끝나거나 raw REPL 프롬프트로 끝남 */
export function isReplAnswerComplete(text: string): boolean {
  if (endsWithRawPrompt(text)) {
    return true;
  }
  if (!endsWithFriendlyPrompt(text)) {
    return false;
  }
  const banner = parseMicroPythonBanner(text);
  return banner !== null && text.lastIndexOf(banner.line) < text.length - FRIENDLY_PROMPT.length;
}

/**
 * 판별 순서
 * 1. 끝이 ">>> "이고 MicroPython 배너가 있으면 micropython(friendly). 끝이 raw REPL 프롬프트면 micropython(raw).
 * 2. CircuitPython 배너 → other-python. ">>> "는 있는데 어느 배너도 없으면 other-python("파이썬 REPL") — MicroPython은 Ctrl-B에 늘 배너를 찍는다.
 * 3. "waiting for download" → download-mode, "invalid header"·"flash read err" → no-firmware.
 * 4. MicroPython 흔적(배너·트레이스백·KeyboardInterrupt·soft reboot)이 있는데 프롬프트가 없으면 busy.
 * 5. 그 밖의 글 → other-output(깨진 글인지 함께), 아무것도 없으면 silent.
 */
export function classifyProbeTranscript(text: string): ProbeVerdict {
  const banner = parseMicroPythonBanner(text);
  if (endsWithFriendlyPrompt(text)) {
    if (banner) {
      return { kind: 'micropython', banner, prompt: 'friendly' };
    }
    const circuit = /Adafruit CircuitPython (\S+)/u.exec(text);
    if (circuit || /CircuitPython/u.test(text)) {
      return { kind: 'other-python', name: circuit ? `CircuitPython ${circuit[1]!}` : 'CircuitPython' };
    }
    if (/MicroPython/u.test(text)) {
      return { kind: 'micropython', banner: null, prompt: 'friendly' };
    }
    return { kind: 'other-python', name: '파이썬 REPL' };
  }
  if (endsWithRawPrompt(text)) {
    return { kind: 'micropython', banner, prompt: 'raw' };
  }
  if (/Adafruit CircuitPython/u.test(text)) {
    return { kind: 'other-python', name: 'CircuitPython' };
  }
  if (/waiting for download/u.test(text)) {
    return { kind: 'download-mode' };
  }
  if (/invalid header/u.test(text)) {
    return { kind: 'no-firmware', evidence: 'invalid-header' };
  }
  if (/flash read err/u.test(text)) {
    return { kind: 'no-firmware', evidence: 'flash-read-error' };
  }
  if (banner || /Traceback \(most recent call last\)|KeyboardInterrupt|MPY: soft reboot|raw REPL; CTRL-B to exit/u.test(text)) {
    return { kind: 'busy' };
  }
  if (text.replace(/[\r\n\t ]/gu, '') !== '') {
    return { kind: 'other-output', garbled: looksGarbled(text) };
  }
  return { kind: 'silent' };
}
