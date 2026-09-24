/**
 * 통신 접두어(PD-29, PLAN §7.4) — 통로를 가르는 무작위 12글자.
 *
 * 왜 무작위인가: 공개 브로커에서 `apc/` 같은 **고정 루트**를 쓰면, 와일드카드 구독을 허용하는 브로커에서 루트 하나로
 * 사이트 사용자 전체의 토픽이 보인다. 그래서 접두어 전체를 무작위로 만든다. 헷갈리는 글자(l·1·O·0)는 뺀다.
 * **무작위 글자는 우연한 겹침만 막을 뿐 비밀이 아니다** — 공개 브로커는 토픽을 아는 사람이면 누구나 보낼 수 있다(§7.4 경고).
 *
 * 어디에 저장하나
 * - 기본은 `sessionStorage`: 탭을 닫으면 사라져 공용 PC의 다음 반 학생에게 이어지지 않는다.
 * - [이 접두어 고정]을 누를 때만 `localStorage`([이 컴퓨터에서 내 기록 지우기]가 함께 지운다 — storage.ts 규칙).
 *
 * 같은 컴퓨터 탭 통로(BroadcastChannel)의 채널 이름은 `ai-physical-computing:bridge:<접두어>`다(channels/tab.ts).
 * PD-29의 "고정 루트 없이"는 공개 브로커 이야기고, BroadcastChannel은 **같은 출처 안에서만** 통한다.
 * 이 사이트는 같은 계정의 다른 GitHub Pages 사이트와 출처를 나눠 쓰므로(src/lib/storage.ts와 같은 사정)
 * 사이트 이름을 앞에 붙여 다른 사이트의 채널과 섞이지 않게 한다. 이 이름은 밖에서 볼 수 없다.
 */
import { readItem, removeItem, writeItem, type KeyedStorageLike } from '../../lib/storage.ts';
import { bridgeText } from './messages.ts';

/** 접두어에 쓰는 글자 — 헷갈리는 l·1·O·0을 뺀 영문 소문자와 숫자 */
export const PREFIX_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
/** 접두어 길이 */
export const PREFIX_LENGTH = 12;
/** 접두어를 저장하는 이름(머리말은 storage.ts가 붙인다) */
export const PREFIX_STORAGE_NAME = 'bridge:prefix';

/** 무작위 숫자를 내주는 곳. 테스트는 정해진 값을 넣는다. */
export type RandomBytes = (length: number) => Uint8Array;

function defaultRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  const crypto = (globalThis as { crypto?: Crypto }).crypto;
  if (crypto?.getRandomValues !== undefined) {
    crypto.getRandomValues(bytes);
    return bytes;
  }
  for (let index = 0; index < length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

/** 접두어 모양이 맞는지 */
export function isValidPrefix(value: unknown): value is string {
  if (typeof value !== 'string' || value.length !== PREFIX_LENGTH) {
    return false;
  }
  for (const letter of value) {
    if (!PREFIX_ALPHABET.includes(letter)) {
      return false;
    }
  }
  return true;
}

/** 새 접두어를 만든다(예: `7kq2m9xd4hpt`) */
export function createPrefix(random: RandomBytes = defaultRandomBytes): string {
  const bytes = random(PREFIX_LENGTH);
  let prefix = '';
  for (let index = 0; index < PREFIX_LENGTH; index += 1) {
    const value = bytes[index] ?? 0;
    prefix += PREFIX_ALPHABET[value % PREFIX_ALPHABET.length];
  }
  return prefix;
}

/** 친구 접두어를 받아 쓸 때 — 모양이 틀리면 한국어 이유를 돌려준다 */
export function parsePrefix(value: string): { ok: true; prefix: string } | { ok: false; reason: string } {
  const trimmed = value.trim().toLowerCase();
  if (!isValidPrefix(trimmed)) {
    return { ok: false, reason: bridgeText.badPrefix(value) };
  }
  return { ok: true, prefix: trimmed };
}

/** 저장 공간 두 곳(탭에만 두는 곳과 이 컴퓨터에 남기는 곳) — 테스트는 가짜를 넣는다 */
export interface PrefixStores {
  readonly session?: KeyedStorageLike | null;
  readonly local?: KeyedStorageLike | null;
}

function sessionStore(stores: PrefixStores): KeyedStorageLike | null {
  if (stores.session !== undefined) {
    return stores.session;
  }
  try {
    return (globalThis as { sessionStorage?: KeyedStorageLike }).sessionStorage ?? null;
  } catch {
    return null;
  }
}

function localStore(stores: PrefixStores): KeyedStorageLike | null | undefined {
  return stores.local;
}

/**
 * 지금 쓸 접두어를 읽는다. 고정해 둔 것(localStorage) → 이 탭의 것(sessionStorage) 순서로 보고, 둘 다 없으면 null.
 */
export function readPrefix(stores: PrefixStores = {}): string | null {
  const pinned = readItem(PREFIX_STORAGE_NAME, localStore(stores));
  if (isValidPrefix(pinned)) {
    return pinned;
  }
  const session = readItem(PREFIX_STORAGE_NAME, sessionStore(stores));
  return isValidPrefix(session) ? session : null;
}

/** 이 탭에서 쓸 접두어를 적어 둔다(탭을 닫으면 사라진다) */
export function writeSessionPrefix(prefix: string, stores: PrefixStores = {}): boolean {
  return writeItem(PREFIX_STORAGE_NAME, prefix, sessionStore(stores));
}

/** [이 접두어 고정] — 이 컴퓨터에 남긴다([기록 지우기]가 함께 지운다) */
export function pinPrefix(prefix: string, stores: PrefixStores = {}): boolean {
  writeSessionPrefix(prefix, stores);
  return writeItem(PREFIX_STORAGE_NAME, prefix, localStore(stores));
}

/** 고정을 푼다(이 탭에서는 그대로 쓴다) */
export function unpinPrefix(stores: PrefixStores = {}): boolean {
  return removeItem(PREFIX_STORAGE_NAME, localStore(stores));
}

/** 고정해 둔 접두어가 있나 */
export function isPinned(stores: PrefixStores = {}): boolean {
  return isValidPrefix(readItem(PREFIX_STORAGE_NAME, localStore(stores)));
}

/**
 * 지금 쓸 접두어를 얻는다. 없으면 새로 만들어 이 탭에 적어 둔다.
 * 화면은 연결할 때마다 [새 접두어 만들기]를 먼저 보여 준다(§7.4).
 */
export function ensurePrefix(stores: PrefixStores = {}, random: RandomBytes = defaultRandomBytes): string {
  const found = readPrefix(stores);
  if (found !== null) {
    return found;
  }
  const prefix = createPrefix(random);
  writeSessionPrefix(prefix, stores);
  return prefix;
}

/**
 * 주소에서 통신 접두어를 받는 이름들(2026-09-25 Phase 4 검토 반영). 다른 화면을 새 탭으로 열 때 접두어를 함께 넘겨
 * 학생이 무작위 12글자를 눈으로 보고 옮겨 적지 않게 한다.
 * - `prefix` — MQTT 칸 ↔ 대시보드 링크(`/labs/iot/dashboard/?prefix=…`, `/labs/esp32/?example=…&prefix=…`)
 * - `bridge` — 영상처리 [보내기] 패널이 여는 보드 화면(`/labs/esp32/?bridge=…` — 보드 쪽 [보내기] 패널도 함께 연다)
 */
export const PREFIX_QUERY_NAMES = ['prefix', 'bridge'] as const;

/** 주소 글자(`?prefix=…` 또는 `?bridge=…`)에서 통신 접두어를 읽는다. 없거나 모양이 틀리면 null */
export function prefixFromQuery(search: string | null | undefined): string | null {
  if (typeof search !== 'string' || search === '') {
    return null;
  }
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  } catch {
    return null;
  }
  for (const name of PREFIX_QUERY_NAMES) {
    const value = params.get(name)?.trim().toLowerCase() ?? '';
    if (isValidPrefix(value)) {
      return value;
    }
  }
  return null;
}
