/**
 * 찾는 글이 없을 때 도와 주는 규칙(판 1.3.0 검수 R1-012·R1-021) — 순수 함수. 검색 쪽(search-page.ts)과 자동 완성(search-suggest.ts)이 쓴다.
 *
 * - didYouMean: 오타일 때 "혹시 이 낱말인가요?"로 보일 낱말. 사이트에 있는 낱말 목록(용어사전 표제어·영어 이름·같은 뜻 다른 이름, 많이 찾는 낱말)과
 *   글자 하나 차이쯤 나는 것만 고른다. 한글은 글자(음절) 단위, 영어는 알파벳 단위로 센다. 예: 임게값 → 임계값.
 * - fallbackTerms: 낱말이 여럿인 검색어가 통째로는 맞는 글이 없을 때 낱말을 하나씩 빼 가며 다시 찾아 볼 후보들(긴 것부터).
 */
import { splitWords } from './search-rank.ts';

/** 후보로 보는 편집 거리 한도: 2글자 이하는 0(오타로 보지 않음), 3~5글자는 1, 6글자 이상은 2 */
export function maxEditDistance(length: number): number {
  if (length < 3) {
    return 0;
  }
  return length <= 5 ? 1 : 2;
}

/** 두 글(글자 단위)의 편집 거리(끼우기·빼기·바꾸기 한 번이 1). 한글은 NFC 한 글자가 한 칸이다. */
export function editDistance(a: string, b: string): number {
  const left = [...a];
  const right = [...b];
  if (left.length === 0) {
    return right.length;
  }
  if (right.length === 0) {
    return left.length;
  }
  let previous = Array.from({ length: right.length + 1 }, (_value, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost);
    }
    previous = current;
  }
  return previous[right.length] ?? 0;
}

/** 낱말 하나에 가장 가까운 목록의 낱말. 같은 낱말이 있거나 가까운 것이 없으면 undefined. */
function nearestWord(word: string, vocabulary: readonly string[]): string | undefined {
  const limit = maxEditDistance([...word].length);
  if (limit === 0) {
    return undefined;
  }
  let best: { word: string; distance: number } | undefined;
  for (const candidate of vocabulary) {
    if (candidate === word) {
      return undefined;
    }
    if (Math.abs([...candidate].length - [...word].length) > limit) {
      continue;
    }
    const distance = editDistance(word, candidate);
    if (distance >= 1 && distance <= limit && (best === undefined || distance < best.distance)) {
      best = { word: candidate, distance };
    }
  }
  return best?.word;
}

/**
 * 오타로 보이는 검색어를 고쳐 쓴 말. 검색어의 낱말마다 목록에서 가장 가까운 낱말로 바꾸고, 하나도 안 바뀌었으면 undefined.
 * vocabulary에는 소문자로 만든 낱말을 넣는다(normalizeVocabulary). 돌려주는 말도 소문자다(한글은 영향 없음).
 */
export function didYouMean(term: string, vocabulary: readonly string[]): string | undefined {
  const words = splitWords(term);
  if (words.length === 0 || words.length > 4) {
    return undefined;
  }
  let changed = false;
  const fixed = words.map((word) => {
    const near = nearestWord(word, vocabulary);
    if (near !== undefined) {
      changed = true;
      return near;
    }
    return word;
  });
  return changed ? fixed.join(' ') : undefined;
}

/** 낱말 목록을 비교용(소문자·글자와 숫자만, 두 글자 이상, 중복 없이)으로 바꾼다. 여러 낱말로 된 표제어는 낱말마다 나눠 넣는다. */
export function normalizeVocabulary(items: readonly string[]): string[] {
  const words = new Set<string>();
  for (const item of items) {
    for (const word of splitWords(item)) {
      if ([...word].length >= 2) {
        words.add(word);
      }
    }
  }
  return [...words];
}

/** 낱말을 하나씩 빼 가며 다시 찾아 볼 후보 말들(긴 것부터, 원래 차례 그대로). 낱말이 하나이거나 일곱 개를 넘으면 빈 목록. 최대 maxCount개. */
export function fallbackTerms(term: string, maxCount = 12): string[] {
  const words = term.trim().split(/\s+/u).filter(Boolean);
  if (words.length < 2 || words.length > 7) {
    return [];
  }
  const found: string[] = [];
  const seen = new Set<string>();
  for (let size = words.length - 1; size >= 1; size -= 1) {
    const pick = (start: number, chosen: string[]) => {
      if (found.length >= maxCount) {
        return;
      }
      if (chosen.length === size) {
        const candidate = chosen.join(' ');
        if (!seen.has(candidate)) {
          seen.add(candidate);
          found.push(candidate);
        }
        return;
      }
      for (let index = start; index < words.length; index += 1) {
        pick(index + 1, [...chosen, words[index] ?? '']);
      }
    };
    pick(0, []);
  }
  return found;
}

/** 소문자로 돌려받은 낱말을 보여 줄 때, 원래 표기(LED·NameError처럼 대문자가 든 것)가 목록에 있으면 그것으로 되돌린다 */
export function restoreCase(word: string, originals: readonly string[]): string {
  return originals.find((original) => original.toLowerCase() === word) ?? word;
}
