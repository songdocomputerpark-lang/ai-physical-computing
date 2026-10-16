/**
 * 고를 때 받는 예제(판 1.5.0 — 키트 장치 도감 예제 212개, DECISIONS C15·C151 "실습실 첫 받기를 키우지 않는다").
 *
 * 왜: ESP32 실습실은 예제 코드·설명·배선을 HTML 안 JSON(LabShell `data-lab-examples`)에 심는다. 키트 예제 200여 개를 그대로 심으면
 * HTML이 약 +471KB(gzip +80KB) 커져 첫 방문이 느려진다. 그래서 키트 예제는 HTML에 **목록에 필요한 것**(id·제목·파일·묶음)과
 * 받을 주소(`codeUrl`)만 두고, 코드와 나머지(설명·배선·실습 방법·차시 링크)는 빌드 때 따로 만든 JSON 파일
 * (src/pages/labs/esp32/kit-code/ — `<주소>/labs/esp32/kit-code/<장>/<이름>.json`)에서 **고를 때** 받는다.
 *
 * 흐름(실습실 틀 src/lab/controls/lab-shell.ts)
 *   - [예제 불러오기]·`?example=`·저장된 마지막 예제·공유 링크의 `ex=`가 이런 예제를 가리키면 fetchLazyExample로 받고,
 *     받은 것(LazyExamplePayload)을 목록의 자리(LazyExampleEntry)와 합친 보통 예제(mergeLazyExample)로 바꿔 끼운다.
 *   - 받는 동안 [실행]은 기다렸다가(holdRun) 받은 코드로 돌고, 편집칸은 "받는 중" 자리 글을 읽기 전용으로 보인다.
 *   - 받지 못하면 까닭과 [다시 받기]를 보인다(lazyFailureMessage).
 * HTML에 실제로 심는 모양은 embeddedExampleJson — 목록 자리에서 제목·묶음까지 뺀 것(id·파일·받을 주소)이다. 제목은 선택 상자의 <option> 글자에
 * 이미 있어 두 번 싣지 않는다(실습실이 readExamples에서 fillLazyTitles로 채운다 — 받은 뒤에는 JSON의 제목). 묶음은 선택 상자를 그릴 때(빌드)만 쓴다.
 * 이 파일은 순수 함수와 받기 하나뿐이다 — 빌드(페이지·JSON 파일 만들기)와 화면이 함께 쓴다(yaml 같은 빌드 전용 패키지를 import하지 않는다).
 */
import type { WiringEntry } from '../modules/board/part-types.ts';
import type { LabExample } from './examples.ts';

/** 받기를 기다리는 최대 시간(밀리초). 넘으면 실패로 보고 [다시 받기]를 보인다 — 느린 학교 망에서도 수 KB짜리 JSON은 몇 초면 온다 */
export const LAZY_EXAMPLE_TIMEOUT_MS = 20_000;

/** 받는 동안 편집칸에 보이는 자리 글(파이썬 주석이라 혹시 실행돼도 아무 일도 없다) */
export const LAZY_PENDING_CODE = '# 예제 코드를 받는 중이에요. 잠시만 기다려 주세요…\n';

/** 받지 못했을 때 편집칸에 남기는 자리 글 */
export const LAZY_FAILED_CODE = '# 예제 코드를 받지 못했어요. 위의 [다시 받기]를 누르거나 다른 예제를 골라 주세요.\n';

/** HTML에 심는 목록 자리: 보통 예제에서 코드를 빈 글자로 비우고 받을 주소를 적은 것 */
export type LazyExampleEntry = LabExample & { readonly codeUrl: string };

/** 실습실 HTML의 목록 JSON에 심는 고를 때 받는 예제(제목·묶음 없음 — 머리말) */
export type EmbeddedLazyEntry = Pick<LazyExampleEntry, 'id' | 'code' | 'file' | 'codeUrl'>;

/** 따로 받는 JSON 한 개의 모양(예제 하나) */
export interface LazyExamplePayload {
  /** 목록 자리의 id와 같아야 한다(다른 예제의 파일이 오면 쓰지 않는다) */
  readonly id: string;
  /** 예제 제목(사이드카 그대로 — 목록 자리에는 선택 상자 글자만 있다) */
  readonly title?: string;
  readonly code: string;
  readonly description?: string;
  readonly packages?: readonly string[];
  readonly lesson?: { readonly href: string; readonly label: string };
  readonly parts?: readonly WiringEntry[];
  readonly practice?: readonly string[];
}

/** 받기가 실패한 까닭(화면 글에 그대로 쓴다) */
export class LazyExampleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LazyExampleError';
  }
}

/** 아직 코드를 받지 않은 예제인지(목록 자리) */
export function isLazyExample(example: LabExample | null | undefined): example is LazyExampleEntry {
  return example !== null && example !== undefined && typeof example.codeUrl === 'string' && example.codeUrl !== '';
}

/**
 * 빌드: 보통 예제를 HTML용 목록 자리로 바꾼다. 목록·선택 상자·?example= 찾기에 쓰는 id·제목·파일·묶음만 남기고
 * 코드는 빈 글자로 비운다(설명·배선·실습 방법·차시 링크·패키지는 받는 JSON 쪽 — lazyPayloadOf).
 */
export function toLazyEntry(example: LabExample, codeUrl: string): LazyExampleEntry {
  return {
    id: example.id,
    title: example.title,
    code: '',
    ...(example.file !== undefined ? { file: example.file } : {}),
    ...(example.group !== undefined ? { group: example.group } : {}),
    codeUrl,
  };
}

/**
 * 빌드: LabShell이 HTML의 목록 JSON에 심는 모양. 고를 때 받는 예제는 id·파일·받을 주소만(제목은 선택 상자의 <option>에, 묶음은 그릴 때만 —
 * 키트 예제 212개의 제목을 두 번 싣지 않아 HTML이 gzip 약 5KB 가볍다), 보통 예제는 그대로.
 */
export function embeddedExampleJson(example: LabExample): LabExample | EmbeddedLazyEntry {
  if (!isLazyExample(example)) {
    return example;
  }
  return { id: example.id, code: '', ...(example.file !== undefined ? { file: example.file } : {}), codeUrl: example.codeUrl };
}

/**
 * 화면: HTML의 목록 JSON에서 제목이 빠진 자리(embeddedExampleJson)에 제목을 채운다 — titleOf(id)는 선택 상자의 그 예제 <option> 글자.
 * 못 찾으면 id. 제목이 있는 항목은 그대로 둔다.
 */
export function fillLazyTitles(examples: readonly unknown[], titleOf: (id: string) => string | null): LabExample[] {
  return examples.map((item) => {
    const example = item as LabExample;
    if (typeof example?.title === 'string' || typeof example?.id !== 'string') {
      return example;
    }
    const title = titleOf(example.id)?.trim();
    return { ...example, title: title !== undefined && title !== '' ? title : example.id };
  });
}

/** 빌드: 따로 받을 JSON의 내용(embeddedExampleJson이 뺀 것 모두 — 묶음은 빼고) */
export function lazyPayloadOf(example: LabExample): LazyExamplePayload {
  return {
    id: example.id,
    title: example.title,
    code: example.code,
    ...(example.description !== undefined ? { description: example.description } : {}),
    ...(example.packages !== undefined ? { packages: example.packages } : {}),
    ...(example.lesson !== undefined ? { lesson: example.lesson } : {}),
    ...(example.parts !== undefined ? { parts: example.parts } : {}),
    ...(example.practice !== undefined ? { practice: example.practice } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? (value as string[]) : null;
}

/**
 * 받은 JSON을 목록 자리와 합쳐 보통 예제로 만든다. id가 다르거나 코드가 글자가 아니면 LazyExampleError.
 * 모양이 틀린 선택 칸(설명·배선 등)은 버린다 — 코드만 맞으면 실습은 된다.
 */
export function mergeLazyExample(entry: LazyExampleEntry, payload: unknown): LabExample {
  if (!isRecord(payload)) {
    throw new LazyExampleError('받은 파일의 모양이 예제가 아니에요');
  }
  if (payload.id !== entry.id) {
    throw new LazyExampleError('다른 예제의 파일이 왔어요');
  }
  if (typeof payload.code !== 'string') {
    throw new LazyExampleError('받은 파일에 예제 코드가 없어요');
  }
  // 목록 자리에서 받을 주소만 뺀다(합친 예제는 보통 예제 — 다시 받지 않는다)
  const rest: Omit<LabExample, 'code'> = {
    id: entry.id,
    title: typeof payload.title === 'string' && payload.title.trim() !== '' ? payload.title : entry.title,
    ...(entry.file !== undefined ? { file: entry.file } : {}),
    ...(entry.group !== undefined ? { group: entry.group } : {}),
  };
  const description = typeof payload.description === 'string' && payload.description.trim() !== '' ? payload.description : undefined;
  const packages = stringArray(payload.packages);
  const practice = stringArray(payload.practice);
  const lesson =
    isRecord(payload.lesson) && typeof payload.lesson.href === 'string' && typeof payload.lesson.label === 'string'
      ? { href: payload.lesson.href, label: payload.lesson.label }
      : undefined;
  const parts =
    Array.isArray(payload.parts) && payload.parts.every((part) => isRecord(part) && typeof part.part === 'string')
      ? (payload.parts as WiringEntry[])
      : undefined;
  return {
    ...rest,
    code: payload.code,
    ...(description !== undefined ? { description } : {}),
    ...(packages !== null ? { packages } : {}),
    ...(lesson !== undefined ? { lesson } : {}),
    ...(parts !== undefined && parts.length > 0 ? { parts } : {}),
    ...(practice !== null && practice.length > 0 ? { practice } : {}),
  };
}

export interface FetchLazyExampleOptions {
  /** 시험용으로 바꿀 수 있다(기본: 전역 fetch) */
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

/** 예제 하나를 받아 합친다. 실패하면 까닭이 한국어로 적힌 LazyExampleError */
export async function fetchLazyExample(entry: LazyExampleEntry, options: FetchLazyExampleOptions = {}): Promise<LabExample> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new LazyExampleError('이 브라우저는 파일을 받을 수 없어요');
  }
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeoutMs = options.timeoutMs ?? LAZY_EXAMPLE_TIMEOUT_MS;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller?.abort();
  }, timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetchImpl(entry.codeUrl, { credentials: 'same-origin', ...(controller ? { signal: controller.signal } : {}) });
    } catch {
      throw new LazyExampleError(timedOut ? `${Math.round(timeoutMs / 1000)}초 안에 받지 못했어요` : '인터넷 연결이 끊겼거나 사이트에 닿지 못했어요');
    }
    if (!response.ok) {
      throw new LazyExampleError(response.status === 404 ? '사이트에서 예제 파일을 찾지 못했어요(404)' : `사이트가 예제 파일을 주지 않았어요(${response.status})`);
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new LazyExampleError(timedOut ? `${Math.round(timeoutMs / 1000)}초 안에 받지 못했어요` : '받은 파일을 읽지 못했어요');
    }
    return mergeLazyExample(entry, payload);
  } finally {
    clearTimeout(timer);
  }
}

/** 받기 실패 안내 한 줄(조작 줄 아래 안내 줄) */
export function lazyFailureMessage(title: string, error: unknown): string {
  const reason = error instanceof LazyExampleError ? error.message : '알 수 없는 문제가 생겼어요';
  return `"${title}" 예제 코드를 받지 못했어요(${reason}). 인터넷 연결을 확인하고 [다시 받기]를 눌러 주세요.`;
}
