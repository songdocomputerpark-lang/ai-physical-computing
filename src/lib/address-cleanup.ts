/**
 * 주소 끝에 붙은 군더더기 떼기(판 1.7.1, DECISIONS C224) — 404 쪽이 "혹시 이 쪽을 찾으셨나요?"를 보여 줄 때 쓴다.
 *
 * 메신저·채팅은 한국어 문장 속 주소를 공백이 나올 때까지 링크로 잡아서 "…/ai-physical-computing/)가"·"…/1-1-1/입니다."처럼
 * 괄호·조사·마침표가 주소에 붙는다(2026-10-23 운영자가 겪음 — 사이트는 멀쩡한데 404가 떴다).
 * 이 사이트의 쪽 주소는 모두 영문 소문자·숫자·'-'·'/'로만 되어 있어서(tests/unit/address-cleanup.test.ts가 쪽·콘텐츠 이름으로 지킨다)
 * 그 밖의 글자가 처음 나온 자리부터 버리고 끝을 '/'로 맞추면 원래 주소가 된다. 영문 대문자는 소문자로 바꾼다.
 *
 * 404 쪽 스크립트(브라우저)가 부르는 순수 함수라 아무것도 import하지 않는다(C221 — 쪽 스크립트는 빌드 전용 모듈을 끌어오지 않는다).
 */

/** 쪽 주소에 들어갈 수 있는 글자(영문·숫자·'-'·'/') — 이 밖의 글자가 처음 나오는 자리에서 자른다 */
const PAGE_PATH_CHAR = /[A-Za-z0-9/-]/u;

/**
 * 404가 난 주소(location.pathname)에서 군더더기를 뗀 쪽 주소를 돌려준다. 뗄 것이 없으면(그냥 없는 쪽이면) null.
 * 예: "/ai-physical-computing/)%EA%B0%80" → "/ai-physical-computing/", "/ai-physical-computing/learn/u1/1-1-1가" → "/ai-physical-computing/learn/u1/1-1-1/".
 */
export function cleanPagePath(pathname: string): string | null {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // 잘린 %-글자(예: "%E") — 원래 글자 그대로 본다(그 '%'에서 잘린다)
  }
  let end = 0;
  while (end < decoded.length && PAGE_PATH_CHAR.test(decoded[end] ?? '')) {
    end += 1;
  }
  let cleaned = decoded.slice(0, end).toLowerCase().replace(/\/{2,}/gu, '/');
  // 마지막 조각이 '-'로 끝나면("1-1-1-가"처럼 하이픈 뒤에 조사) 그 '-'도 군더더기다
  cleaned = cleaned.replace(/-+$/u, '');
  if (!cleaned.startsWith('/')) {
    return null;
  }
  if (!cleaned.endsWith('/')) {
    cleaned += '/';
  }
  return cleaned === decoded ? null : cleaned;
}

/** 쪽 HTML의 <title>에서 사이트 이름 꼬리(" | AI 피지컬 컴퓨팅 오픈랩")를 떼어 링크 글로 쓴다. 제목이 없으면 null. */
export function pageTitleFromHtml(html: string, siteName: string): string | null {
  const match = /<title>([^<]*)<\/title>/iu.exec(html);
  const raw = (match?.[1] ?? '').replace(/&amp;/gu, '&').replace(/&lt;/gu, '<').replace(/&gt;/gu, '>').replace(/&quot;/gu, '"').replace(/&#39;/gu, "'").trim();
  if (raw === '') {
    return null;
  }
  const tail = ` | ${siteName}`;
  return raw.endsWith(tail) ? raw.slice(0, -tail.length).trim() || raw : raw;
}
