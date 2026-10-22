/**
 * 예제 선택 상자에 보이는 이름을 학생 말로 다듬는다(판 1.3.0 검수 R1-100, R3-014).
 *
 * 예제 이름은 사이드카(examples/**.meta.yaml)와 코드가 만든 묶음 이름에서 오는데, 만드는 사람 말이 그대로 보였다:
 *  - "(사이트판" · "이 사이트용" → "바로 실행 버전": 교과서 코드에 줄을 더해 이 사이트에서 막힘없이 돌게 고친 판. 학생에게는 "사이트판"·"이 사이트용"이
 *    무슨 뜻인지 알 수 없었다(R3-014). 짝인 "교과서 그대로"와 나란히 놓였을 때 "교과서 그대로는 고치지 않은 것, 바로 실행 버전은 고쳐 둔 것"으로 읽힌다.
 *  - "원본 파일" → "교과서 그대로": 고치지 않은 교과서 코드(일부러 틀린 결과가 나오는 것도 있다).
 *  - "계단" → "단계": 교안의 계단 번호는 "몇 단계"라는 뜻이다(계단은 층계로 읽힌다).
 *  - 차시 번호 뒤의 "기본"·"심화"(실습/과제/없음이 섞여 있었다) → "기본 실습"·"심화 실습" 두 가지로 통일(R3-014).
 *    "심화 동작 테스트: …"는 "심화 실습: 동작 테스트 — …"로 푼다.
 *  - (판 1.7.0) 쪽 번호의 앞 0을 뗀다: "교과서 017쪽 코드" → "교과서 17쪽 코드"(화면 쪽 표기 한 벌 — src/lib/display-names.ts formatPageRange, C181.
 *    이 파일은 실습실 번들에도 들어가 사이트 지도를 끌고 오는 그 파일을 부르지 않고 같은 규칙만 쓴다). 차시 frontmatter 예제 제목이 이 함수를
 *    거치게 되면서(exampleTitleInLesson) "(교과서 137쪽, 사이트판)"처럼 괄호 안 가운데에 있는 "사이트판"도 바꾼다.
 * 선택 상자·묶음 이름·차시 예제 카드(exampleTitleInLesson)에 쓴다. 예제 id·파일 이름·사이드카 원문은 그대로다(원문을 바꾸는 일은 콘텐츠 쪽 몫 — 통합이 정한다).
 * 바뀐 것이 없으면 같은 글을 그대로 돌려준다. 두 번 불러도 결과가 같다.
 */
export function studentExampleTitle(title: string): string {
  return title
    .replace(/([(,]\s*)사이트판/gu, '$1바로 실행 버전')
    .replace(/이 사이트용/gu, '바로 실행 버전')
    .replace(/(\d+)(?:\s*~\s*(\d+))?쪽/gu, (_whole: string, from: string, to: string | undefined) => `${Number(from)}${to === undefined ? '' : `~${Number(to)}`}쪽`)
    .replace(/원본 파일/gu, '교과서 그대로')
    .replace(/계단/gu, '단계')
    .replace(/^(\d+-\d+-\d+) (기본|심화) 동작 테스트:\s*/u, '$1 $2 실습: 동작 테스트 — ')
    .replace(/^(\d+-\d+-\d+ (?:기본|심화))(?: (?:실습|과제))?(?=[\s:(—]|$)/u, '$1 실습');
}

/**
 * 예제 이름에 "바로 실행 버전"·"교과서 그대로"가 있으면, 둘이 어떻게 다른지 알려 주는 한 줄(R3-014).
 * 같은 실습이 두 가지로 나란히 있을 때 어느 쪽을 골라야 할지 학생이 알 수 없었다. 해당하지 않으면 빈 글.
 * 이름은 학생 말로 다듬은 뒤의 것(studentExampleTitle)으로 살핀다.
 */
export function exampleVersionNote(title: string): string {
  const shown = studentExampleTitle(title);
  if (shown.includes('바로 실행 버전')) {
    return '"바로 실행 버전"은 교과서 코드를 이 사이트에서 막힘없이 돌아가게 고친 거예요. 처음이라면 이쪽을 골라요.';
  }
  if (shown.includes('교과서 그대로')) {
    return '"교과서 그대로"는 고치지 않은 교과서 코드예요. 이 사이트에서는 결과가 다를 수 있어요.';
  }
  return '';
}

/**
 * 예제 번호 한 벌(판 1.6.0, DECISIONS C173·C128 ⑥ 확장 — walk-teacher-new B1·A-10): **차시 frontmatter examples의 차례(1부터)가 그 예제의 번호**다.
 * 따라 하기 쪽(/learn/)·교과서 원문 쪽의 ::실습실 자리(/book/)·수업 화면 막대("예제 2: …")·지도안 글(차시 md 교사용 칸의 "예제 2")이 모두 이 번호를 쓴다 —
 * 예전에는 교과서 쪽이 ::실습실이 나온 차례로 따로 세어 같은 코드가 교과서 쪽 "예제 4", 따라 하기 쪽 "예제 2"였다.
 * - lessonFiles: 짝 차시 frontmatter examples의 파일(examples/ 뒤 경로) 차례. shownFiles: 이 쪽에 보이는 예제 파일 차례(따라 하기 쪽은 lessonFiles 그대로).
 * - 차시 예제가 하나뿐이면 번호를 붙이지 않는다(따라 하기 쪽이 "따라 하기 예제"로만 보이는 것과 같게).
 * - 차시 목록에 없는 파일(교과서 쪽에만 있는 확인 코드)은 번호가 없다(undefined) — 다른 쪽의 "예제 n"과 헷갈리지 않게 이름만 보인다.
 */
export function lessonExampleNumbers(lessonFiles: readonly string[], shownFiles: readonly string[] = lessonFiles): (number | undefined)[] {
  if (lessonFiles.length < 2) {
    return shownFiles.map(() => undefined);
  }
  return shownFiles.map((file) => {
    const index = lessonFiles.indexOf(file);
    return index < 0 ? undefined : index + 1;
  });
}

/** 예제 이름 앞에 번호를 붙인 글: "예제 2: 기본 실습 1: 0부터 5까지 세기". 번호가 없으면 이름만(수업 화면 막대·교과서 쪽 실습실 칸이 쓴다) */
export function numberedExampleTitle(number: number | undefined, title: string): string {
  return number === undefined ? title : `예제 ${number}: ${title}`;
}

/**
 * 예제 이름 한 벌(판 1.7.0, PROGRESS 미해결 271 B-44 — 수업 화면 카드 "출력 테스트: LCD에 글자 쓰기(교과서 127쪽)"와 열린 실습실 고르기 칸
 * "2-1-2 출력 테스트: 문자 LCD에 글자 쓰기"가 같은 예제인데 이름이 달라 다른 예제로 읽혔다).
 *
 * 규칙: **차시에 실린 예제의 이름은 그 차시 frontmatter `examples[].title`** 이다 — 번호 한 벌(lessonExampleNumbers, C182)과 같은 원천.
 * - 차시 안(따라 하기 카드·교과서 원문 쪽 실습실 칸·수업 화면 막대 — 막대는 카드 글을 읽는다)은 exampleTitleInLesson: 학생 말로 다듬은 이름에서
 *   앞의 차시 번호를 뗀다(그 차시 쪽이라 번호가 겹친다).
 * - 차시 밖(실습실 예제 고르기 칸·예제 갤러리)은 exampleTitleInLab: "차시 번호 + 차시 안 이름"("2-1-2 출력 테스트: LCD에 글자 쓰기(교과서 127쪽)") —
 *   실습실에서는 어느 차시 예제인지가 이름 앞에 있어야 고른다. 차시에 실리지 않은 예제(사이트 예제·교안·키트 도감)는 사이드카·머리말 제목 그대로.
 * - 두 이름은 같은 다듬기(studentExampleTitle)를 같은 글("번호 + 제목")에 한 번 거친 결과라, 실습실 이름 = 차시 번호 + 카드 이름이 늘 맞다.
 * - frontmatter 제목이 없는 예제는 실습실 제목(사이드카·머리말)을 차시 안 이름으로 쓴다 — 실습실 제목이 이미 "2-1-2 …"로 시작하면 그 번호를 뗀다.
 */
export interface LessonExampleName {
  /** 차시 번호(frontmatter label — "2-1-2", "V4") */
  readonly label: string;
  /** 차시 frontmatter examples[].title(없으면 undefined) */
  readonly title?: string | undefined;
}

/** "2-1-2 출력 …"처럼 이 차시 번호로 시작하면 번호와 뒤 빈칸·쌍점을 뗀다 */
function withoutLessonLabel(title: string, label: string): string {
  const trimmed = title.trim();
  if (label === '' || !trimmed.startsWith(label)) {
    return trimmed;
  }
  const rest = trimmed.slice(label.length);
  return /^[\s:]/u.test(rest) ? rest.replace(/^[\s:]+/u, '') : trimmed;
}

/** 차시 안에 보이는 예제 이름: 학생 말로 다듬고(studentExampleTitle — "번호 + 제목"에 걸어 실습실 이름과 같은 결과) 앞의 차시 번호를 뗀다 */
export function exampleTitleInLesson(title: string, label?: string): string {
  if (!label) {
    return studentExampleTitle(title.trim());
  }
  const shown = studentExampleTitle(`${label} ${withoutLessonLabel(title, label)}`);
  return withoutLessonLabel(shown, label);
}

/** 차시 밖(실습실 고르기 칸·갤러리)에 보이는 예제 이름의 원문: 차시에 실린 예제면 "차시 번호 + 차시 안 이름", 아니면 sourceTitle 그대로 */
export function exampleTitleInLab(sourceTitle: string, lesson?: LessonExampleName): string {
  if (!lesson?.title?.trim()) {
    return sourceTitle;
  }
  return `${lesson.label} ${exampleTitleInLesson(lesson.title, lesson.label)}`;
}

/**
 * 실습실 예제 목록에 이름 한 벌을 입힌다 — 실습실 쪽(src/pages/labs/vision/index.astro·esp32/_lab-examples.ts)이 빌드 때
 * 차시 frontmatter에서 만든 표(file → 차시 번호·예제 제목, 먼저 나온 차시가 이긴다)를 넘겨 부른다. 표에 없는 예제는 그대로 돌려준다.
 */
export function withLessonExampleTitles<T extends { readonly file?: string | undefined; readonly title: string }>(
  examples: readonly T[],
  namesByFile: Readonly<Record<string, LessonExampleName>>,
): T[] {
  return examples.map((example) => {
    const lesson = example.file !== undefined && Object.hasOwn(namesByFile, example.file) ? namesByFile[example.file] : undefined;
    const title = exampleTitleInLab(example.title, lesson);
    return title === example.title ? example : { ...example, title };
  });
}
