/**
 * 한국어 조사 도우미. 낱말의 끝소리에 받침이 있는지 보고 은/는, 이/가, 을/를, 과/와, 으로/로 가운데 맞는 쪽을 고른다.
 *
 *   withParticle('픽셀', '은/는')   → '픽셀은'
 *   withParticle('센서', '을/를')   → '센서를'
 *   withParticle('ESP32', '이/가')  → 'ESP32가'   (숫자는 읽는 소리로 판단: 2 → "이")
 *   withParticle('파일', '으로/로') → '파일로'     (ㄹ 받침 뒤에는 "로")
 *   withParticle('Wi-Fi', '은/는')  → 'Wi-Fi은(는)' (영어 글자로 끝나면 둘 다 적는다)
 */
export type ParticlePair = '은/는' | '이/가' | '을/를' | '과/와' | '으로/로';

type FinalSound = 'none' | 'rieul' | 'other' | 'unknown';

const HANGUL_FIRST = 0xac00;
const HANGUL_LAST = 0xd7a3;
/** 받침 번호 8이 ㄹ이다(한글 음절 = 첫소리 × 588 + 가운뎃소리 × 28 + 받침). */
const RIEUL_FINAL_INDEX = 8;
/** 숫자를 한자어로 읽을 때의 끝소리: 영(ㅇ) 일(ㄹ) 이 삼(ㅁ) 사 오 육(ㄱ) 칠(ㄹ) 팔(ㄹ) 구 */
const DIGIT_FINAL_SOUND: Readonly<Record<string, FinalSound>> = {
  '0': 'other',
  '1': 'rieul',
  '2': 'none',
  '3': 'other',
  '4': 'none',
  '5': 'none',
  '6': 'other',
  '7': 'rieul',
  '8': 'rieul',
  '9': 'none',
};

function finalSound(word: string): FinalSound {
  // 끝에 붙은 괄호·따옴표·문장 부호는 소리가 없으니 건너뛴다. 예: "실습실)" → "실"
  const trimmed = word.trim().replace(/[\s)\]}"'”’」』.,!?…·]+$/u, '');
  const last = trimmed.at(-1);
  if (last === undefined) {
    return 'unknown';
  }
  const code = last.codePointAt(0) ?? 0;
  if (code >= HANGUL_FIRST && code <= HANGUL_LAST) {
    const finalIndex = (code - HANGUL_FIRST) % 28;
    if (finalIndex === 0) {
      return 'none';
    }
    return finalIndex === RIEUL_FINAL_INDEX ? 'rieul' : 'other';
  }
  return DIGIT_FINAL_SOUND[last] ?? 'unknown';
}

/** 낱말 뒤에 붙일 조사만 돌려준다. */
export function particle(word: string, pair: ParticlePair): string {
  const [afterFinal, afterVowel] = pair.split('/') as [string, string];
  const sound = finalSound(word);
  if (sound === 'unknown') {
    return `${afterFinal}(${afterVowel})`;
  }
  if (pair === '으로/로') {
    return sound === 'other' ? afterFinal : afterVowel;
  }
  return sound === 'none' ? afterVowel : afterFinal;
}

/** 낱말에 알맞은 조사를 붙여 돌려준다. */
export function withParticle(word: string, pair: ParticlePair): string {
  return `${word}${particle(word, pair)}`;
}
