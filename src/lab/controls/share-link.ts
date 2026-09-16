/**
 * [공유 링크](PLAN §8.2 P2-02, §3.1, SPEC §6.1 "코드를 압축해 URL에 담아 계정 없이 교사에게 제출·공유").
 *
 * 코드를 lz-string으로 압축해 페이지 주소의 # 뒤에 담는다: …/labs/vision/#code=<압축값>&ex=<예제 id>
 * - # 뒤는 서버로 보내지지 않고(GitHub Pages 접속 기록에도 남지 않음) 브라우저 안에서만 읽힌다.
 * - 열면 실습실이 자동으로 편집칸에 넣는다(src/lab/controls/lab-shell.ts). 영상·랜드마크는 절대 넣지 않는다(PLAN §10).
 * - 압축값의 글자(A-Z a-z 0-9 + - $)는 URLSearchParams를 거치면 +가 공백으로 바뀌므로 직접 나눠 읽는다.
 *
 * 길이 한계(Claude 결정, 근거를 아래에 적음)
 * - 경고 2,000자: 메신저·학급 게시판·LMS는 긴 주소를 자르거나 링크로 만들지 않는 곳이 있어, 그보다 길면 ".py 내려받기로도 보내 주세요"를 함께 안내한다.
 *   (Chrome·Edge 주소 표시줄 자체는 훨씬 긴 주소도 연다 — 2MB. 2,000자는 옛 브라우저·서버 한계로 널리 쓰이는 보수적인 값.)
 * - 상한 16,000자: 그 이상은 만들지 않는다. 공유 링크는 짧은 실습 코드용이고, 긴 코드는 .py 파일이 알맞다.
 *   평범한 예제(50줄 안팎, 한글 주석 포함)는 압축하면 600~1,200자다(tests/unit/lab/share-link.test.ts에서 확인).
 */
import { compressForUrl, decompressFromUrl } from './compress.ts';

/** # 뒤 코드 값의 이름 */
export const SHARE_CODE_KEY = 'code';
/** # 뒤 예제 id 값의 이름(선택) */
export const SHARE_EXAMPLE_KEY = 'ex';
/** 이보다 길면 경고 문구를 붙인다 */
export const SHARE_URL_WARN_LENGTH = 2000;
/** 이보다 길면 만들지 않는다 */
export const SHARE_URL_MAX_LENGTH = 16000;

const EXAMPLE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;

export interface ShareHashValues {
  /** 압축을 푼 코드. 없거나 망가졌으면 undefined */
  readonly code?: string;
  /** 예제 id(모양이 맞는 것만) */
  readonly example?: string;
  /** 값이 있었지만 풀지 못했는지(망가진 링크 안내용) */
  readonly broken: boolean;
}

export interface ShareLink {
  readonly url: string;
  readonly length: number;
  /** 길이 경고(없으면 null) */
  readonly warning: string | null;
}

/** 코드가 너무 길어 공유 링크를 만들 수 없을 때 */
export class ShareTooLongError extends Error {
  readonly length: number;
  constructor(length: number) {
    super(
      `코드가 너무 길어서 공유 링크로 만들 수 없어요(주소 ${length.toLocaleString('ko-KR')}자, 최대 ${SHARE_URL_MAX_LENGTH.toLocaleString('ko-KR')}자). ` +
        '[.py 내려받기]로 파일을 만들어 보내 주세요.',
    );
    this.name = 'ShareTooLongError';
    this.length = length;
  }
}

/** 코드를 # 뒤에 넣을 값으로 압축한다. */
export function encodeShareCode(code: string): string {
  return compressForUrl(code);
}

/** # 뒤 값을 코드로 되돌린다. 망가졌으면 null. */
export function decodeShareCode(packed: string): string | null {
  if (typeof packed !== 'string' || packed === '') {
    return null;
  }
  if (!/^[A-Za-z0-9+\-$]+$/u.test(packed)) {
    return null;
  }
  return decompressFromUrl(packed);
}

/** 주소의 # 부분(#이 있어도 없어도 됨)에서 코드와 예제 id를 읽는다. */
export function parseShareHash(hash: string): ShareHashValues {
  const raw = typeof hash === 'string' ? hash.replace(/^#/u, '') : '';
  let code: string | undefined;
  let example: string | undefined;
  let broken = false;
  for (const part of raw.split('&')) {
    const separator = part.indexOf('=');
    if (separator < 0) {
      continue;
    }
    const key = part.slice(0, separator);
    const value = part.slice(separator + 1);
    if (key === SHARE_CODE_KEY) {
      const decoded = decodeShareCode(value);
      if (decoded === null) {
        broken = true;
      } else {
        code = decoded;
      }
    } else if (key === SHARE_EXAMPLE_KEY) {
      let candidate = value;
      try {
        candidate = decodeURIComponent(value);
      } catch {
        candidate = value;
      }
      if (EXAMPLE_ID_PATTERN.test(candidate)) {
        example = candidate;
      }
    }
  }
  return { ...(code !== undefined ? { code } : {}), ...(example !== undefined ? { example } : {}), broken };
}

/** 주소에 코드가 담겨 있는지(# 뒤에 code= 가 있는지) */
export function hasShareHash(hash: string): boolean {
  return typeof hash === 'string' && new RegExp(`(?:^#?|&)${SHARE_CODE_KEY}=`, 'u').test(hash);
}

/** 길이에 따른 안내 문구(경고 길이 이하면 null) */
export function shareLengthWarning(length: number): string | null {
  if (length <= SHARE_URL_WARN_LENGTH) {
    return null;
  }
  return (
    `주소가 ${length.toLocaleString('ko-KR')}자로 길어요. 메신저나 게시판에 따라 긴 주소가 잘리거나 링크로 바뀌지 않을 수 있으니, ` +
    '[.py 내려받기]로 만든 파일도 함께 보내 주세요.'
  );
}

/**
 * 공유 링크를 만든다. pageUrl은 지금 페이지 주소(# 뒤와 ?검색어는 지운다).
 * 너무 길면 ShareTooLongError를 던진다.
 */
export function buildShareLink(pageUrl: string, code: string, exampleId?: string | null): ShareLink {
  const base = new URL(pageUrl);
  base.hash = '';
  base.search = '';
  const parts = [`${SHARE_CODE_KEY}=${encodeShareCode(code)}`];
  if (exampleId && EXAMPLE_ID_PATTERN.test(exampleId)) {
    parts.push(`${SHARE_EXAMPLE_KEY}=${exampleId}`);
  }
  const url = `${base.href}#${parts.join('&')}`;
  if (url.length > SHARE_URL_MAX_LENGTH) {
    throw new ShareTooLongError(url.length);
  }
  return { url, length: url.length, warning: shareLengthWarning(url.length) };
}
