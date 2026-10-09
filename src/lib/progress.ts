/**
 * 학습 진도(판 1.3.0 "설명 없이 쓰는 사이트" — 설계서 3절). 어느 차시를 봤는지·끝냈는지, 마지막에 본 차시·실습실만 이 브라우저에 기억한다.
 *
 * 저장하는 것: 차시 id(u1/1-1-1 꼴)·제목·주소·시각, 마지막 실습실 주소·이름뿐이다. 이름·학번 같은 개인정보는 저장하지 않는다.
 * 저장 이름은 'progress:v1' 하나라서(storage.ts 머리말이 붙는다) [이 컴퓨터에서 내 기록 지우기](clearOurs)가 함께 지운다.
 * 저장 공간이 막힌 브라우저에서는 오류 없이 빈 진도로 동작한다(진도는 덤 기능이라 실패 안내를 띄우지 않는다).
 *
 * 규칙
 * - 읽고 쓰기는 storage.ts의 readJson·writeJson만 쓴다(직접 localStorage를 쓰지 않는다). 저장 공간은 인자로 바꿔 넣어 단위 테스트에서 가짜를 쓴다.
 * - 값이 바뀌면 document에 CustomEvent 'apc:progress-changed'(detail = 새 ProgressState)를 보낸다. 화면 칠하기(progress-paint.ts)가 듣는다.
 * - 쓰는 함수는 읽기 → 바꾸기 → 쓰기 순서이고, 저장에 실패해도 바뀐 값을 돌려준다(그 쪽을 보는 동안은 화면에 반영된다).
 * - 진도는 HTML에 굽지 않고 브라우저에서만 그린다(서비스 워커·오프라인판에서도 같게).
 * - 실습실 라이브러리를 import하지 않는다(모든 차시 쪽에 실리는 작은 코드다). Node.js가 직접 읽을 수 있게 타입 표기만 지우면 도는 문법만 쓴다.
 */
import { readJson, removeItem, writeJson, type StorageSource } from './storage.ts';

/** 저장 이름(머리말 'ai-physical-computing:'은 storage.ts가 붙인다) */
export const PROGRESS_STORAGE_NAME = 'progress:v1';

/** 진도가 바뀌면 document로 보내는 이벤트 이름(detail = ProgressState) */
export const PROGRESS_CHANGED_EVENT = 'apc:progress-changed';

/** 마지막으로 본 차시 */
export interface LastLesson {
  /** 차시 id(콘텐츠 컬렉션 id, 예: u1/1-1-1) */
  id: string;
  /** 차시 쪽 주소(base 포함, 예: /ai-physical-computing/learn/u1/1-1-1/) */
  href: string;
  /** 차시 번호 글(예: 1-1-1) */
  label: string;
  /** 차시 제목 */
  title: string;
  /** 본 시각(ms, Date.now()) */
  at: number;
}

/** 마지막으로 연 실습실 */
export interface LastLab {
  /** 실습실 쪽 주소(base 포함) */
  path: string;
  /** 실습실 이름 */
  title: string;
  at: number;
}

export interface ProgressState {
  version: 1;
  /** 열어 본 차시 id(오래된 것부터, 최대 MAX_LIST) */
  seen: string[];
  /** 끝냈다고 표시한 차시 id(최대 MAX_LIST) */
  done: string[];
  last: LastLesson | null;
  lastLab: LastLab | null;
}

/** 차시 id 모양: 대단원 u1~u4 + / + 소문자·숫자·하이픈 */
const LESSON_ID_PATTERN = /^u[1-4]\/[a-z0-9-]+$/u;

/** 목록 하나에 담는 차시 id 수 한도(깨진 값이 저장 공간을 부풀리지 않게) */
const MAX_LIST = 200;
const MAX_ID_LENGTH = 40;
const MAX_HREF_LENGTH = 300;
const MAX_LABEL_LENGTH = 24;
const MAX_TITLE_LENGTH = 120;

/** 차시 id 모양이 맞는지 */
export function isLessonId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_ID_LENGTH && LESSON_ID_PATTERN.test(value);
}

/** 빈 진도(처음 온 사람·저장 공간이 막힌 브라우저) */
export function emptyProgress(): ProgressState {
  return { version: 1, seen: [], done: [], last: null, lastLab: null };
}

/** 진도가 하나라도 있는지(처음 온 사람인지 가를 때) */
export function hasProgress(state: ProgressState): boolean {
  return state.seen.length > 0 || state.done.length > 0 || state.last !== null || state.lastLab !== null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 사이트 안 주소만 받는다: /로 시작하고 //(다른 사이트)·제어 문자·공백이 없다. 저장소 값이 링크로 그려져도 안전하게 한다. */
function cleanSitePath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_HREF_LENGTH) {
    return null;
  }
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return null;
  }
  if (/[\u0000- \u007f]/u.test(value)) {
    return null;
  }
  return value;
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  // 줄바꿈·탭은 공백 하나로, 앞뒤 공백은 뗀다.
  const text = value.replace(/\s+/gu, ' ').trim();
  return text.length === 0 ? null : text.slice(0, max);
}

function cleanTime(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

/** 차시 id 목록을 거른다: 모양이 맞는 것만, 겹침 없이(나중 것을 남김), 최대 MAX_LIST개(오래된 것부터 버림) */
function cleanIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  // Set은 넣은 차례를 기억하므로, 겹치면 지웠다 다시 넣어 "나중 것"이 뒤에 오게 한다.
  const unique = new Set<string>();
  for (const item of raw) {
    if (isLessonId(item)) {
      unique.delete(item);
      unique.add(item);
    }
  }
  const list = [...unique];
  return list.length > MAX_LIST ? list.slice(list.length - MAX_LIST) : list;
}

function cleanLastLesson(raw: unknown): LastLesson | null {
  if (!isRecord(raw) || !isLessonId(raw.id)) {
    return null;
  }
  const href = cleanSitePath(raw.href);
  const label = cleanText(raw.label, MAX_LABEL_LENGTH);
  const title = cleanText(raw.title, MAX_TITLE_LENGTH);
  const at = cleanTime(raw.at);
  if (href === null || label === null || title === null || at === null) {
    return null;
  }
  return { id: raw.id, href, label, title, at };
}

function cleanLastLab(raw: unknown): LastLab | null {
  if (!isRecord(raw)) {
    return null;
  }
  const path = cleanSitePath(raw.path);
  const title = cleanText(raw.title, MAX_TITLE_LENGTH);
  const at = cleanTime(raw.at);
  if (path === null || title === null || at === null) {
    return null;
  }
  return { path, title, at };
}

/**
 * 저장소에서 읽은 값(어떤 모양이든)을 안전한 진도로 바꾼다. 깨진 값·모르는 칸은 버린다.
 * 차시 id는 /^u[1-4]\/[a-z0-9-]+$/ 만 받고 목록은 각각 최대 200개다. 모르는 version이면 빈 진도.
 */
export function sanitizeProgress(raw: unknown): ProgressState {
  if (!isRecord(raw) || raw.version !== 1) {
    return emptyProgress();
  }
  return {
    version: 1,
    seen: cleanIdList(raw.seen),
    done: cleanIdList(raw.done),
    last: cleanLastLesson(raw.last),
    lastLab: cleanLastLab(raw.lastLab),
  };
}

/** 저장한 진도를 읽는다. 없거나 깨졌거나 저장 공간이 막혔으면 빈 진도. */
export function readProgress(storage?: StorageSource): ProgressState {
  return sanitizeProgress(readJson<unknown>(PROGRESS_STORAGE_NAME, null, storage));
}

function announce(state: ProgressState): void {
  try {
    if (typeof document !== 'undefined' && typeof CustomEvent === 'function') {
      document.dispatchEvent(new CustomEvent<ProgressState>(PROGRESS_CHANGED_EVENT, { detail: state }));
    }
  } catch {
    // 이벤트를 못 보내도 진도 기억은 그대로 둔다.
  }
}

function save(state: ProgressState, storage?: StorageSource): ProgressState {
  // 저장에 실패해도(막힌 브라우저) 조용히 넘기고 바뀐 값을 돌려준다.
  writeJson(PROGRESS_STORAGE_NAME, state, storage);
  announce(state);
  return state;
}

function withoutId(list: readonly string[], id: string): string[] {
  return list.filter((item) => item !== id);
}

/**
 * 차시를 열었다고 기억한다: seen에 더하고(이미 있으면 맨 뒤로) last를 갱신한다. 이벤트를 보낸다.
 * 차시 id·주소·번호·제목이 모양에 안 맞으면 아무것도 바꾸지 않고 지금 진도를 돌려준다.
 * @param now 시각(ms) — 단위 테스트에서 주입한다.
 */
export function markSeen(lesson: Omit<LastLesson, 'at'>, storage?: StorageSource, now: number = Date.now()): ProgressState {
  const state = readProgress(storage);
  const last = cleanLastLesson({ ...lesson, at: now });
  if (last === null) {
    return state;
  }
  const seen = cleanIdList([...state.seen, last.id]);
  return save({ ...state, seen, last }, storage);
}

/**
 * 차시를 끝냈다고 표시하거나(done=true) 표시를 푼다. 끝냈다고 표시하면 본 차시(seen)에도 더한다. 이벤트를 보낸다.
 * 표시를 풀어도 본 기록(seen)은 그대로다. 차시 id가 모양에 안 맞으면 아무것도 바꾸지 않는다.
 */
export function setDone(id: string, done: boolean, storage?: StorageSource): ProgressState {
  const state = readProgress(storage);
  if (!isLessonId(id)) {
    return state;
  }
  if (done) {
    return save({ ...state, done: cleanIdList([...state.done, id]), seen: cleanIdList([...state.seen, id]) }, storage);
  }
  return save({ ...state, done: withoutId(state.done, id) }, storage);
}

/** 마지막으로 연 실습실을 기억한다(홈 "이어서 하기"용). 이벤트를 보낸다. 주소·이름이 모양에 안 맞으면 바꾸지 않는다. */
export function rememberLab(lab: Omit<LastLab, 'at'>, storage?: StorageSource, now: number = Date.now()): ProgressState {
  const state = readProgress(storage);
  const lastLab = cleanLastLab({ ...lab, at: now });
  if (lastLab === null) {
    return state;
  }
  return save({ ...state, lastLab }, storage);
}

/** 진도를 모두 지운다(저장 이름을 지우고, 빈 진도로 이벤트를 보낸다). */
export function clearProgress(storage?: StorageSource): void {
  removeItem(PROGRESS_STORAGE_NAME, storage);
  announce(emptyProgress());
}

/**
 * 차시 id 묶음(한 대단원 등)의 진도 합계.
 * total = 묶음의 차시 수, seen = 본 적 있는 차시 수(끝낸 차시 포함), done = 끝낸 차시 수. 묶음에 없는 id는 세지 않는다.
 */
export function unitSummary(state: ProgressState, ids: readonly string[]): { total: number; seen: number; done: number } {
  const unique = [...new Set(ids)];
  const seenSet = new Set(state.seen);
  const doneSet = new Set(state.done);
  let seen = 0;
  let done = 0;
  for (const id of unique) {
    if (doneSet.has(id)) {
      done += 1;
      seen += 1;
    } else if (seenSet.has(id)) {
      seen += 1;
    }
  }
  return { total: unique.length, seen, done };
}

/** 차시 하나의 진도: 끝냈으면 'done', 봤으면 'seen', 아니면 'none' */
export function lessonStatus(state: ProgressState, id: string): 'done' | 'seen' | 'none' {
  if (state.done.includes(id)) {
    return 'done';
  }
  return state.seen.includes(id) ? 'seen' : 'none';
}

/**
 * 차례대로 놓인 차시 id 가운데 아직 한 번도 열지 않은 첫 차시(다음에 볼 차시). 모두 봤으면 null.
 * 대단원 쪽의 "다음에 볼 차시" 강조에 쓴다.
 */
export function firstUnseen(state: ProgressState, ids: readonly string[]): string | null {
  for (const id of ids) {
    if (lessonStatus(state, id) === 'none') {
      return id;
    }
  }
  return null;
}
