/**
 * 주소에 담긴 공유 링크(`#code=…&ex=…`)와 `?example=`을 두 실습실 가운데 **맞는 칸에** 나눠 주는 규칙(4단원 통합 화면 전용).
 * `?pair=<짝 이름>`은 두 칸을 함께 채운다(2026-09-26 PROGRESS 미해결 179 — 짝을 고르는 규칙은 examples.ts findPairView).
 *
 * 왜: 실습실 틀(src/lab/controls/lab-shell.ts)은 주소를 스스로 읽는다. 한 문서에 틀이 둘이면
 *   · 공유 링크는 **먼저 붙은 칸(컴퓨터 쪽)**이 읽고 주소에서 지워 버려, 보드 칸에서 만든 공유 링크의 보드 코드가 컴퓨터 칸에 들어간다.
 *   · `?example=`은 두 칸이 모두 읽어, 그 파일이 없는 칸은 "링크에 적힌 예제를 찾지 못했어요"를 띄운다.
 * 그래서 페이지 머리의 인라인 스크립트(index.astro)가 틀보다 먼저 주소의 두 값을 전역(ADDRESS_STASH_KEY)에 맡기고 주소에서 지운 뒤,
 * 두 칸이 준비되면 이 규칙으로 맞는 칸을 골라 넣는다(unit4-page.ts). 틀(공유 파일)은 고치지 않는다.
 *
 * 순수 함수만 둔다 — 브라우저 테스트(tests/e2e/unit4.spec.ts)가 Node에서 바로 불러 시험한다.
 */
import { ADDRESS_STASH_KEY } from './config.ts';
import { isUnit4BoardFile, isUnit4PcFile } from './examples.ts';

export type Unit4Side = 'pc' | 'board';

/** 인라인 스크립트가 맡겨 둔 주소 값 */
export interface AddressStash {
  /** `#code=…`가 들어 있던 주소의 # 부분(그대로) */
  readonly hash?: string;
  /** `?example=`의 값(examples/ 뒤 경로) */
  readonly example?: string;
  /** `?pair=`의 값(짝 이름 — examples.ts PAIRS의 id 또는 차시 번호, 2026-09-26 PROGRESS 미해결 179) */
  readonly pair?: string;
}

/** 전역에 맡겨 둔 값을 꺼낸다(한 번만 — 꺼내면 지운다). 모양이 틀리면 null */
export function takeAddressStash(target: Record<string, unknown>): AddressStash | null {
  const raw = target[ADDRESS_STASH_KEY];
  try {
    delete target[ADDRESS_STASH_KEY];
  } catch {
    target[ADDRESS_STASH_KEY] = undefined;
  }
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const value = raw as { hash?: unknown; example?: unknown; pair?: unknown };
  const hash = typeof value.hash === 'string' && value.hash !== '' ? value.hash : undefined;
  const example = typeof value.example === 'string' && value.example !== '' ? value.example : undefined;
  const pair = typeof value.pair === 'string' && value.pair !== '' ? value.pair : undefined;
  if (hash === undefined && example === undefined && pair === undefined) {
    return null;
  }
  return { ...(hash !== undefined ? { hash } : {}), ...(example !== undefined ? { example } : {}), ...(pair !== undefined ? { pair } : {}) };
}

/** examples/ 뒤 경로가 어느 칸의 것인가(모르면 null) */
export function sideForFile(file: string | null | undefined): Unit4Side | null {
  if (typeof file !== 'string' || file === '') {
    return null;
  }
  if (isUnit4PcFile(file)) {
    return 'pc';
  }
  if (isUnit4BoardFile(file)) {
    return 'board';
  }
  if (file.startsWith('esp32/')) {
    return 'board';
  }
  if (file.startsWith('vision/') || file.startsWith('desktop/')) {
    return 'pc';
  }
  return null;
}

/** 예제 id가 어느 칸 목록에 있는가(양쪽 모두 없거나 양쪽 모두 있으면 null — 모호하면 고르지 않는다) */
export function sideForExampleId(id: string | null | undefined, pcIds: ReadonlySet<string>, boardIds: ReadonlySet<string>): Unit4Side | null {
  if (typeof id !== 'string' || id === '') {
    return null;
  }
  const inPc = pcIds.has(id);
  const inBoard = boardIds.has(id);
  if (inPc === inBoard) {
    return null;
  }
  return inPc ? 'pc' : 'board';
}

/**
 * 예제 id가 없거나 모를 때 코드 글자로 칸을 짐작한다. 보드 코드만 쓰는 import가 보이면 보드, 아니면 컴퓨터.
 * (`bluetooth`는 두 쪽 모두 쓰는 이름이라 기준으로 삼지 않는다 — 컴퓨터 쪽 흉내와 보드의 ubluetooth가 같은 이름이다.)
 */
export function guessSideFromCode(code: string): Unit4Side {
  const boardOnly = /^[ \t]*(?:import|from)[ \t]+(?:machine|ESP32BLE|micropython|neopixel|network|umqtt|i2c_lcd|mg90s_servo|servo_library|utime|ubluetooth)\b/mu;
  return boardOnly.test(code) ? 'board' : 'pc';
}
