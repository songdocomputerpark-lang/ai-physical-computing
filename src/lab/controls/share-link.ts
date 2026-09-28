/**
 * [공유 링크](PLAN §8.2 P2-02, §3.1, SPEC §6.1 "코드를 압축해 URL에 담아 계정 없이 교사에게 제출·공유").
 *
 * 코드를 lz-string으로 압축해 페이지 주소의 # 뒤에 담는다: …/labs/vision/#code=<압축값>&ex=<예제 id>&lab=<실습실 id>
 * - # 뒤는 서버로 보내지지 않고(GitHub Pages 접속 기록에도 남지 않음) 브라우저 안에서만 읽힌다.
 * - 열면 실습실이 자동으로 편집칸에 넣는다(src/lab/controls/lab-shell.ts). 영상·랜드마크는 절대 넣지 않는다(PLAN §10).
 * - 압축값의 글자(A-Z a-z 0-9 + - $)는 URLSearchParams를 거치면 +가 공백으로 바뀌므로 직접 나눠 읽는다.
 * - `lab=`(판 1.1.0, PROGRESS 미해결 138)은 **어느 칸의 코드인지**다. 한 쪽에 실습실 틀이 둘 있는 4단원 통합 화면에서 보드 칸의 링크가
 *   컴퓨터 칸에 들어가지 않게, 그 실습실 id의 칸만 링크를 받는다(pickShareLab). `code=`는 늘 맨 앞이라 옛 링크 모양과 같다.
 *   `lab=`이 없는 옛 링크는 `ex=` 예제를 가진 칸이 하나뿐이면 그 칸, 아니면 첫 칸이 받는다. 칸이 하나인 쪽은 `lab=`과 상관없이 받는다.
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
/** # 뒤 실습실 id 값의 이름(선택 — 어느 칸의 코드인지, 판 1.1.0 미해결 138) */
export const SHARE_LAB_KEY = 'lab';
/** 이보다 길면 경고 문구를 붙인다 */
export const SHARE_URL_WARN_LENGTH = 2000;
/** 이보다 길면 만들지 않는다 */
export const SHARE_URL_MAX_LENGTH = 16000;

const EXAMPLE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;
/** 실습실 id 모양(LabShell labId와 같은 규칙) */
const LAB_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;

export interface ShareHashValues {
  /** 압축을 푼 코드. 없거나 망가졌으면 undefined */
  readonly code?: string;
  /** 예제 id(모양이 맞는 것만) */
  readonly example?: string;
  /** 링크를 만든 실습실 id(모양이 맞는 것만 — 판 1.1.0) */
  readonly lab?: string;
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
  let lab: string | undefined;
  let broken = false;
  const decoded = (value: string): string => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };
  for (const part of raw.split('&')) {
    const separator = part.indexOf('=');
    if (separator < 0) {
      continue;
    }
    const key = part.slice(0, separator);
    const value = part.slice(separator + 1);
    if (key === SHARE_CODE_KEY) {
      const unpacked = decodeShareCode(value);
      if (unpacked === null) {
        broken = true;
      } else {
        code = unpacked;
      }
    } else if (key === SHARE_EXAMPLE_KEY) {
      const candidate = decoded(value);
      if (EXAMPLE_ID_PATTERN.test(candidate)) {
        example = candidate;
      }
    } else if (key === SHARE_LAB_KEY) {
      const candidate = decoded(value);
      if (LAB_ID_PATTERN.test(candidate)) {
        lab = candidate;
      }
    }
  }
  return { ...(code !== undefined ? { code } : {}), ...(example !== undefined ? { example } : {}), ...(lab !== undefined ? { lab } : {}), broken };
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
 * 공유 링크를 만든다. pageUrl은 지금 페이지 주소(# 뒤와 ?검색어는 지운다). labId를 주면 어느 칸의 코드인지 싣는다(`lab=` — 머리말).
 * 너무 길면 ShareTooLongError를 던진다.
 */
export function buildShareLink(pageUrl: string, code: string, exampleId?: string | null, labId?: string | null): ShareLink {
  const base = new URL(pageUrl);
  base.hash = '';
  base.search = '';
  const parts = [`${SHARE_CODE_KEY}=${encodeShareCode(code)}`];
  if (exampleId && EXAMPLE_ID_PATTERN.test(exampleId)) {
    parts.push(`${SHARE_EXAMPLE_KEY}=${exampleId}`);
  }
  if (labId && LAB_ID_PATTERN.test(labId)) {
    parts.push(`${SHARE_LAB_KEY}=${labId}`);
  }
  const url = `${base.href}#${parts.join('&')}`;
  if (url.length > SHARE_URL_MAX_LENGTH) {
    throw new ShareTooLongError(url.length);
  }
  return { url, length: url.length, warning: shareLengthWarning(url.length) };
}

/**
 * 한 쪽에 있는 실습실 틀 하나(문서 차례) — 공유 링크·?example=을 **어느 칸이** 받을지 고를 때 쓴다(판 1.1.0, PROGRESS 미해결 138).
 * 다른 칸의 예제 목록은 필요할 때만 읽도록 함수로 받는다.
 */
export interface LabOnPage {
  readonly labId: string;
  /** 이 칸의 예제 목록에 그 예제 id가 있나 */
  hasExample(id: string): boolean;
  /** 이 칸의 예제 목록에 그 파일(examples/ 뒤 경로)이 있나 */
  hasFile(file: string): boolean;
}

/**
 * 공유 링크(#code=…)를 받을 칸의 문서 차례 번호(칸이 없으면 -1). 칸이 하나면 늘 0이다(옛 링크·다른 실습실의 링크도 그대로 연다).
 * 1) `lab=`이 있고 그 실습실 id의 칸이 있으면 그 첫 칸 2) 없으면(옛 링크) `ex=` 예제를 가진 칸이 하나뿐일 때 그 칸 3) 아니면 첫 칸.
 */
export function pickShareLab(share: Pick<ShareHashValues, 'lab' | 'example'>, labs: readonly LabOnPage[]): number {
  if (labs.length === 0) {
    return -1;
  }
  if (labs.length === 1) {
    return 0;
  }
  if (share.lab !== undefined) {
    const byLab = labs.findIndex((lab) => lab.labId === share.lab);
    if (byLab >= 0) {
      return byLab;
    }
  }
  if (share.example !== undefined) {
    const owners = labs.map((lab, index) => (lab.hasExample(share.example!) ? index : -1)).filter((index) => index >= 0);
    if (owners.length === 1) {
      return owners[0]!;
    }
  }
  return 0;
}

/**
 * 주소 `?example=`의 파일을 가진 첫 칸의 문서 차례 번호(어느 칸에도 없으면 -1). 한 쪽에 칸이 여럿이면 그 파일이 없는 칸은 조용히 넘기고,
 * 어느 칸에도 없을 때만 첫 칸이 "찾지 못했어요"를 알린다(lab-shell.ts).
 */
export function pickExampleLab(file: string, labs: readonly LabOnPage[]): number {
  return labs.findIndex((lab) => lab.hasFile(file));
}
