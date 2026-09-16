/**
 * 예제 파일(.py) 머리말 메타데이터와 안내 상자 읽기(PLAN §8.2 P2-04, §2.6, SPEC §6.1 "각 예제에 '바꿔볼 것 3가지'와
 * '왜 이런 결과가 나올까' 상자"). 규약 전체와 까닭은 src/lab/README.md.
 *
 * 머리말 = 파일 맨 위의 이어진 주석 줄(첫 코드 줄 앞까지)
 *   # 첫 실습: 웹캠 영상에서 테두리(에지) 찾기      ← 규약(@…)이 아닌 첫 주석 줄 = 제목
 *   # 영상을 회색으로 바꾼 뒤 …                        ← 규약이 아닌 둘째 주석 줄 = 한 줄 설명(선택)
 *   # @lesson v4                                       ← 붙는 차시(선택): content/lessons/ 파일 이름(slug)
 *   # @tags 에지, 회색, Canny                          ← 갤러리·검색용 낱말(선택, 쉼표)
 * 안내 상자 = 파일 어디든(보통 코드 끝) 제목 줄로 시작하는 주석 묶음
 *   # ── 바꿔볼 것 3가지 ──
 *   # 1. threshold를 30까지 내려 봐요. …               ← 줄마다 항목 하나(번호는 떼어 준다)
 *   # ── 왜 이런 결과가 나올까 ──
 *   # Canny는 …                                        ← 줄마다 문장 하나
 * 상자는 첫 코드 줄이나 다음 상자 제목에서 끝난다. 제목 줄의 ─·=·- 장식은 몇 개든 된다(없어도 된다).
 *
 * 원본 자료에서 옮긴 예제(PD-33)에는 머리말·상자를 넣지 않는다(줄 번호 보존, PD-10) → 제목·설명은 차시 md의 examples 항목이 준다.
 * 이 함수는 사이트가 만든 예제(자체 제작)에서 갤러리(P4-11)·차시 임베드(P2-14)·실습실 예제 목록(src/lab/vision/examples.ts)이 읽는다.
 * 조절 값 규약(# @slider 등)은 여기서 읽지 않는다 — src/lab/params/parse.ts.
 */

export interface ExampleMeta {
  /** 규약이 아닌 첫 주석 줄. 머리말이 없으면 null */
  readonly title: string | null;
  /** 규약이 아닌 둘째 주석 줄 */
  readonly description: string | null;
  /** # @lesson 값(차시 slug). 없거나 모양이 틀리면 null */
  readonly lesson: string | null;
  /** # @tags 값(쉼표로 나눔, 빈 것 제외) */
  readonly tags: readonly string[];
  /** "바꿔볼 것 3가지" 상자의 항목(번호를 뗀 문장) */
  readonly tryIdeas: readonly string[];
  /** "왜 이런 결과가 나올까" 상자의 줄 */
  readonly why: readonly string[];
}

export const TRY_SECTION_TITLE = '바꿔볼 것 3가지';
export const WHY_SECTION_TITLE = '왜 이런 결과가 나올까';

/** 규약 주석(# @이름 …). 제목·설명으로 쓰지 않는다. */
const DIRECTIVE_LINE = /^#\s*@([A-Za-z][A-Za-z0-9_]*)\s*(.*)$/u;
/** 상자 제목 줄: # ── 바꿔볼 것 3가지 ── (장식은 선택) */
const SECTION_TITLE = new RegExp(`^#\\s*[─━═=~-]*\\s*(${TRY_SECTION_TITLE}|${WHY_SECTION_TITLE})\\s*[─━═=~-]*\\s*$`, 'u');
/** 차시 slug 모양(PD-09) */
const LESSON_SLUG = /^[a-z0-9][a-z0-9-]*$/u;

function commentText(line: string): string {
  return line.replace(/^#+\s?/u, '').trim();
}

/** 예제 파일 글자에서 머리말 메타데이터와 안내 상자를 읽는다. 없는 것은 null·빈 목록. */
export function readExampleMeta(source: string): ExampleMeta {
  const lines = source.split(/\r?\n/u).map((line) => line.trim());
  let title: string | null = null;
  let description: string | null = null;
  let lesson: string | null = null;
  const tags: string[] = [];

  // 머리말: 앞쪽 빈 줄을 건너뛴 뒤 이어진 주석 줄
  let index = 0;
  while (index < lines.length && lines[index] === '') {
    index += 1;
  }
  for (; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (!line.startsWith('#')) {
      break;
    }
    if (SECTION_TITLE.test(line)) {
      break;
    }
    const directive = DIRECTIVE_LINE.exec(line);
    if (directive) {
      const name = directive[1] ?? '';
      const rest = (directive[2] ?? '').trim();
      if (name === 'lesson') {
        lesson = LESSON_SLUG.test(rest) ? rest : null;
      } else if (name === 'tags') {
        for (const tag of rest.split(',')) {
          const trimmed = tag.trim();
          if (trimmed !== '' && !tags.includes(trimmed)) {
            tags.push(trimmed);
          }
        }
      }
      continue;
    }
    const text = commentText(line);
    if (text === '') {
      continue;
    }
    if (title === null) {
      title = text;
    } else if (description === null) {
      description = text;
    }
  }

  // 안내 상자: 파일 어디든
  const tryIdeas: string[] = [];
  const why: string[] = [];
  let current: 'try' | 'why' | null = null;
  for (const line of lines) {
    if (!line.startsWith('#')) {
      current = null;
      continue;
    }
    const heading = SECTION_TITLE.exec(line);
    if (heading) {
      current = heading[1] === TRY_SECTION_TITLE ? 'try' : 'why';
      continue;
    }
    if (current === null) {
      continue;
    }
    const text = commentText(line);
    if (text === '') {
      continue;
    }
    if (current === 'try') {
      tryIdeas.push(text.replace(/^\d+[.)]\s*/u, ''));
    } else {
      why.push(text);
    }
  }

  return { title, description, lesson, tags, tryIdeas, why };
}

/** 예제에 두 상자가 다 있는지(SPEC §6.1 규칙을 검사·경고할 때) */
export function hasGuideBoxes(meta: ExampleMeta): boolean {
  return meta.tryIdeas.length > 0 && meta.why.length > 0;
}
