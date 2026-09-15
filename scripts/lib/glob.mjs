// 아주 작은 경로 패턴(글롭) 도구 — sources.yaml과 저장소 검사 허용 목록이 함께 쓴다(PLAN §8.1 P1-04).
//
// 지원 문법은 일부러 좁혔다. 헷갈리는 문법은 조용히 틀리게 맞추지 않고 오류로 알린다.
//   **  폴더 이름 0개 이상. 경로 한 칸 전체로만 쓴다. 예: examples/**, examples/**/third-party/**
//   *   한 칸(폴더나 파일 이름 하나) 안의 글자 0개 이상. 예: public/models/*.task
//   ?   한 칸 안의 글자 1개
// 그 밖의 글자는 그대로 비교한다.
//
// 약속
// - 경로는 저장소 뿌리 기준이고 구분자는 "/"만 쓴다(Windows·Linux 빌드가 같게, DECISIONS C9).
// - 대소문자를 구분한다(GitHub Actions의 Linux 파일 시스템과 같게).
// - 점(.)으로 시작하는 파일도 똑같이 맞춘다(배포에 들어가므로 빠지면 안 된다).
// - 패턴은 파일만 가리킨다. 폴더 안 전체는 끝에 /** 를 붙인다.

/** @type {Map<string, RegExp>} */
const regExpCache = new Map();

/**
 * Windows 경로 구분자(\)를 /로 바꾼다.
 * @param {string} filePath
 * @returns {string}
 */
export function toPosixPath(filePath) {
  return filePath.split('\\').join('/');
}

/**
 * 패턴이 지원 문법에 맞는지 본다.
 * @param {unknown} pattern
 * @returns {string | null} 문제가 있으면 한국어 설명, 없으면 null
 */
export function validateGlob(pattern) {
  if (typeof pattern !== 'string' || pattern.trim() === '') {
    return '빈 경로 패턴은 쓸 수 없어요.';
  }
  if (pattern !== pattern.trim()) {
    return '앞뒤에 공백이 있어요.';
  }
  if (pattern.includes('\\')) {
    return '경로 구분자는 역슬래시(\\) 대신 슬래시(/)로 적어요.';
  }
  if (pattern.startsWith('/') || pattern.startsWith('./')) {
    return '맨 앞의 "/"나 "./" 없이 저장소 뿌리 기준으로 적어요. 예: public/images/site/**';
  }
  if (pattern.endsWith('/')) {
    return '폴더 안 파일 전체를 가리키려면 끝에 "/**"를 붙여요. 예: public/fonts/**';
  }
  if (/[[\]{}]/u.test(pattern) || pattern.startsWith('!')) {
    return '[ ] { } ! 문법은 지원하지 않아요. 여러 경로는 목록에 한 줄씩 적고, 뺄 경로는 exclude_paths에 적어요.';
  }
  for (const segment of pattern.split('/')) {
    if (segment === '') {
      return '"//"처럼 빈 칸이 있어요.';
    }
    if (segment === '.' || segment === '..') {
      return '"."이나 ".." 경로는 쓸 수 없어요.';
    }
    if (segment.includes('**') && segment !== '**') {
      return '"**"는 한 칸 전체로만 써요. 예: examples/**/third-party/**';
    }
  }
  return null;
}

/**
 * 패턴을 정규식으로 바꾼다. validateGlob을 통과한 패턴만 넣는다.
 * @param {string} pattern
 * @returns {RegExp}
 */
export function globToRegExp(pattern) {
  const cached = regExpCache.get(pattern);
  if (cached) {
    return cached;
  }
  const segments = pattern.split('/');
  let source = '^';
  segments.forEach((segment, index) => {
    const isLast = index === segments.length - 1;
    if (segment === '**') {
      // 끝의 **는 폴더 0개 이상 + 파일 이름 하나, 가운데 **는 "폴더/" 0개 이상
      source += isLast ? '(?:[^/]+/)*[^/]+' : '(?:[^/]+/)*';
      return;
    }
    source += segment.replace(/[.+^${}()|[\]\\*?]/gu, (character) => {
      if (character === '*') return '[^/]*';
      if (character === '?') return '[^/]';
      return `\\${character}`;
    });
    if (!isLast) {
      source += '/';
    }
  });
  source += '$';
  const regExp = new RegExp(source, 'u');
  regExpCache.set(pattern, regExp);
  return regExp;
}

/**
 * 파일 경로(저장소 뿌리 기준)가 패턴에 맞는지 본다.
 * @param {string} filePath
 * @param {string} pattern
 * @returns {boolean}
 */
export function matchesGlob(filePath, pattern) {
  return globToRegExp(pattern).test(toPosixPath(filePath));
}
